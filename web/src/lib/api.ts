/**
 * ============================================================================
 *  API 客户端
 *
 *  设计要点：
 *  1. **统一信封解包**。后端所有响应都是 `{ success, data }`，
 *     错误是 `{ success, error: { code, message } }`。这里集中处理，
 *     组件层永远不需要关心 HTTP 状态码。
 *  2. **Mock 回退**。`VITE_USE_MOCK=true` 时用内置数据在本地完成
 *     筛选 / 排序 / 分页，且评分与排序口径**复刻后端**，
 *     因此界面行为与真实后端一致（详见 mocks/seed.ts 的说明）。
 *  3. **网络异常归一化**。fetch 本身抛错（后端未启动、DNS 失败）时
 *     包装成 `NETWORK_ERROR`，让上层只需处理一种错误类型。
 * ============================================================================
 */

import {
  MOCK_BUILDS,
  MOCK_COMMENTS,
  MOCK_GUNS,
  MOCK_GUNS_PAYLOAD,
  cpScore,
  hotScore,
} from '../mocks/seed';
import type {
  ApiResponse,
  ApiSuccess,
  BuildDTO,
  BuildsPage,
  BuildsQuery,
  CommentDTO,
  CommentsPage,
  CopyResult,
  CreateBuildInput,
  CreateBuildResult,
  GunsPayload,
  LikeResult,
  Pagination,
  SortKey,
} from '../types/api';

/** Mock 模式开关，来自 web/.env.development */
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK === 'true';

/** 留空表示走同域相对路径（开发期由 vite proxy 转发到后端） */
const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '';

/* ------------------------------------------------------------ 鉴权令牌 */

/**
 * 当前访问令牌的提供者，由 `AuthProvider` 注入。
 *
 * 为什么不在本模块直接 import auth：两者会形成循环依赖
 * （auth 需要 api 的错误类型与请求函数，api 需要 auth 的令牌）。
 * 反向注入把依赖方向理顺，且 api.ts 不必知道认证是怎么实现的。
 */
let authTokenProvider: (() => string | null) | null = null;

export function setAuthTokenProvider(provider: (() => string | null) | null): void {
  authTokenProvider = provider;
}

function currentToken(): string | null {
  return authTokenProvider?.() ?? null;
}

/* ---------------------------------------------------------------- 错误 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status = 0, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/* ------------------------------------------------------------ 基础请求 */

function toQueryString(query: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // 空值一律不发，避免后端 zod 的 .strict() 收到 page=undefined 这类脏参数
    if (value === undefined || value === null || value === '') continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

/**
 * 发请求并解包信封。
 * 返回整个信封而非仅 data —— 因为 `GET /api/builds` 的 pagination 与 data 平级。
 */
async function requestEnvelope<T>(path: string, init?: RequestInit): Promise<ApiSuccess<T>> {
  const hasBody = init?.body !== undefined;
  const token = currentToken();

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        // 后端的 optionalAuth / requireAuth 都只认 Authorization: Bearer
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', '无法连接服务器，请确认后端服务已启动', 0);
  }

  // 204 或非 JSON 响应不应让整个调用栈炸掉
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (payload === null) {
    throw new ApiError('INVALID_RESPONSE', `服务端返回了非 JSON 响应（HTTP ${res.status}）`, res.status);
  }

  if (payload.success === false) {
    throw new ApiError(payload.error.code, payload.error.message, res.status, payload.error.details);
  }

  if (!res.ok) {
    throw new ApiError('HTTP_ERROR', `请求失败（HTTP ${res.status}）`, res.status);
  }

  return payload;
}

/* -------------------------------------------------------- Mock 实现层 */

/** Mock 模式下的可变副本，让点赞/复制在会话内可见 */
let mockStore: BuildDTO[] | null = null;

function getMockStore(): BuildDTO[] {
  mockStore ??= MOCK_BUILDS.map((b) => ({ ...b }));
  return mockStore;
}

/** Mock 评论的可变副本 */
let mockCommentStore: CommentDTO[] | null = null;

function getMockCommentStore(): CommentDTO[] {
  mockCommentStore ??= MOCK_COMMENTS.map((c) => ({ ...c }));
  return mockCommentStore;
}

/**
 * 已点赞关系：buildId -> 点赞者令牌集合。
 *
 * 用于复刻后端 `build_likes` 表的幂等语义 ——
 * 登录用户重复点赞只计一次，再点则取消。
 */
const mockLikedBy = new Map<string, Set<string>>();

/** 模拟网络延迟，避免加载态一闪而过看不出效果 */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 复刻后端 ORDER_BY_SQL 的排序口径（含 id 兜底，保证分页稳定） */
function mockSort(items: BuildDTO[], sort: SortKey): BuildDTO[] {
  const byIdDesc = (a: BuildDTO, b: BuildDTO) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

  return [...items].sort((a, b) => {
    switch (sort) {
      case 'latest':
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || byIdDesc(a, b)
        );
      case 'hot':
        return (b.hot_score ?? 0) - (a.hot_score ?? 0) || byIdDesc(a, b);
      case 'cost_performance':
        return (b.cp_score ?? 0) - (a.cp_score ?? 0) || byIdDesc(a, b);
      case 'cost_asc':
        return a.estimated_cost - b.estimated_cost || byIdDesc(a, b);
      case 'cost_desc':
        return b.estimated_cost - a.estimated_cost || byIdDesc(a, b);
    }
  });
}

/** 复刻后端 buildWhere 的筛选口径 */
function mockFilter(items: BuildDTO[], q: BuildsQuery): BuildDTO[] {
  return items.filter((b) => {
    if (q.category && b.gun.category !== q.category) return false;
    if (q.platform && b.platform !== q.platform) return false;
    if (q.gun_id && b.gun.id !== q.gun_id) return false;
    if (q.tag && !b.tags.includes(q.tag)) return false;
    if (q.q && !b.title.toLowerCase().includes(q.q.toLowerCase())) return false;
    if (q.min_cost !== undefined && b.estimated_cost < q.min_cost) return false;
    if (q.max_cost !== undefined && b.estimated_cost > q.max_cost) return false;
    return true;
  });
}

function mockPaginate(total: number, page: number, pageSize: number): Pagination {
  // 与后端 listBuilds 完全一致：total 为 0 时 total_pages 也是 0
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    has_next: page < totalPages,
  };
}

/* ------------------------------------------------------------ 公开 API */

/** `GET /api/guns` */
export async function fetchGuns(): Promise<GunsPayload> {
  if (USE_MOCK) {
    await sleep(120);
    return MOCK_GUNS_PAYLOAD;
  }
  const env = await requestEnvelope<GunsPayload>('/api/guns');
  return env.data;
}

/** `GET /api/builds` */
export async function fetchBuilds(query: BuildsQuery = {}): Promise<BuildsPage> {
  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 20;
  const sort = query.sort ?? 'latest';

  if (USE_MOCK) {
    await sleep(220);
    const filtered = mockFilter(getMockStore(), query);
    const sorted = mockSort(filtered, sort);
    const start = (page - 1) * pageSize;
    return {
      items: sorted.slice(start, start + pageSize),
      pagination: mockPaginate(sorted.length, page, pageSize),
    };
  }

  const env = await requestEnvelope<BuildDTO[]>(
    `/api/builds${toQueryString({ ...query, page, page_size: pageSize, sort })}`,
  );

  // 后端理论上总会带 pagination；这里保留兜底，避免因后端变更导致整页白屏
  return {
    items: env.data,
    pagination:
      env.pagination ?? mockPaginate(env.data.length, page, pageSize),
  };
}

/** `POST /api/builds/:id/copy` —— 改枪码复制计数 +1 */
export async function copyBuild(id: string): Promise<CopyResult> {
  if (USE_MOCK) {
    await sleep(150);
    const target = getMockStore().find((b) => b.id === id);
    if (!target) throw new ApiError('BUILD_NOT_FOUND', '改枪方案不存在或已下架', 404);
    target.copies_count += 1;
    return { id, copies_count: target.copies_count };
  }
  const env = await requestEnvelope<CopyResult>(`/api/builds/${encodeURIComponent(id)}/copy`, {
    method: 'POST',
  });
  return env.data;
}

/** `POST /api/builds/:id/like` —— 点赞 */
export async function likeBuild(id: string): Promise<LikeResult> {
  if (USE_MOCK) {
    await sleep(150);

    const target = getMockStore().find((b) => b.id === id);
    if (!target) throw new ApiError('BUILD_NOT_FOUND', '改枪方案不存在或已下架', 404);

    const token = currentToken();

    // 匿名路径：仅累加、不去重（对应后端的 increment_build_likes）
    if (token === null) {
      target.likes_count += 1;
      return { id, liked: true, likes_count: target.likes_count };
    }

    // 登录路径：幂等开关（对应后端的 toggle_build_like + build_likes 触发器）
    const likers = mockLikedBy.get(id) ?? new Set<string>();
    mockLikedBy.set(id, likers);

    if (likers.has(token)) {
      likers.delete(token);
      target.likes_count = Math.max(target.likes_count - 1, 0);
      return { id, liked: false, likes_count: target.likes_count };
    }

    likers.add(token);
    target.likes_count += 1;
    return { id, liked: true, likes_count: target.likes_count };
  }
  const env = await requestEnvelope<LikeResult>(`/api/builds/${encodeURIComponent(id)}/like`, {
    method: 'POST',
  });
  return env.data;
}

/**
 * `POST /api/builds` —— 提交新方案。
 *
 * 后端返回的是**完整的 BuildDTO**（与列表项结构一致），
 * 因此调用方可以直接把它插进列表，无需再发一次列表请求。
 */
export async function createBuild(input: CreateBuildInput): Promise<CreateBuildResult> {
  if (USE_MOCK) {
    await sleep(320);

    // 镜像后端的必填校验：字段缺失时返回与真实后端同构的 VALIDATION_ERROR
    const cost = input.estimated_cost;
    if (cost === undefined || !Number.isFinite(cost)) {
      throw new ApiError('VALIDATION_ERROR', '请求参数校验失败', 400, [
        { field: 'estimated_cost', message: '预估造价必填' },
      ]);
    }

    const gun = MOCK_GUNS.find((g) => g.id === input.gun_id);
    if (!gun) {
      throw new ApiError(
        'INVALID_GUN_ID',
        '指定的枪械不存在，请先从 GET /api/guns 获取合法 ID',
        400,
      );
    }

    const store = getMockStore();

    // 复刻后端的「同枪同码」去重。
    // 后端用 md5(code) 的生成列比对；Mock 里直接比原串，语义等价且免去在浏览器里算 md5。
    const duplicated = store.find(
      (b) => b.gun.id === input.gun_id && b.code === input.code,
    );
    if (duplicated) {
      throw new ApiError(
        'DUPLICATE_BUILD_CODE',
        '该枪械下已存在完全相同的改枪码方案',
        409,
        { existing_build_id: duplicated.id },
      );
    }

    const now = new Date().toISOString();
    const created: BuildDTO = {
      id: randomId(),
      title: input.title,
      code: input.code,
      estimated_cost: cost,
      platform: input.platform,
      tags: input.tags,
      description: input.description ?? null,
      // 计数列一律从 0 起算 —— 与后端「不接受客户端传入计数」的口径一致
      likes_count: 0,
      copies_count: 0,
      comments_count: 0,
      hot_score: hotScore(0, 0, now),
      cp_score: cpScore(0, 0, cost),
      created_at: now,
      updated_at: now,
      gun: {
        id: gun.id,
        name: gun.name,
        name_en: gun.name_en,
        category: gun.category,
        category_name: gun.category_name,
        icon_url: gun.icon_url,
      },
      author: null,
    };

    store.unshift(created);
    return created;
  }

  const env = await requestEnvelope<CreateBuildResult>('/api/builds', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return env.data;
}

/** `GET /api/builds/:id` —— 方案详情 */
export async function fetchBuildById(id: string): Promise<BuildDTO> {
  if (USE_MOCK) {
    await sleep(160);
    const target = getMockStore().find((b) => b.id === id);
    if (!target) {
      throw new ApiError('BUILD_NOT_FOUND', '改枪方案不存在或已下架', 404);
    }
    return target;
  }
  const env = await requestEnvelope<BuildDTO>(`/api/builds/${encodeURIComponent(id)}`);
  return env.data;
}

/* ---------------------------------------------------------------- 评论 */

/** `GET /api/builds/:id/comments` */
export async function fetchComments(
  buildId: string,
  page = 1,
  pageSize = 20,
): Promise<CommentsPage> {
  if (USE_MOCK) {
    await sleep(180);
    const all = getMockCommentStore()
      .filter((c) => c.build_id === buildId)
      // 与后端一致：按发布时间倒序
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const start = (page - 1) * pageSize;
    return {
      items: all.slice(start, start + pageSize),
      pagination: mockPaginate(all.length, page, pageSize),
    };
  }

  const env = await requestEnvelope<CommentDTO[]>(
    `/api/builds/${encodeURIComponent(buildId)}/comments${toQueryString({ page, page_size: pageSize })}`,
  );
  return {
    items: env.data,
    pagination: env.pagination ?? mockPaginate(env.data.length, page, pageSize),
  };
}

/**
 * `POST /api/builds/:id/comments` —— 发表评论。
 *
 * ⚠️ 后端该端点挂了 `requireAuth`，未登录会返回 401 `AUTH_REQUIRED`。
 * 调用方必须显式处理这个错误码，而不是把它当成普通失败 —— 见 CommentSection。
 */
export async function createComment(buildId: string, content: string): Promise<CommentDTO> {
  if (USE_MOCK) {
    await sleep(260);

    // 复刻后端的 requireAuth：无会话时必须抛 401，而不是"演示模式就一路放行"。
    // Mock 放行会让前端的未登录分支永远测不到，切到真实后端才发现评论发不出去。
    if (currentToken() === null) {
      throw new ApiError('AUTH_REQUIRED', '该操作需要登录', 401);
    }

    // 昵称留 null，走"匿名指挥官"的降级渲染路径
    const created: CommentDTO = {
      id: randomId(),
      build_id: buildId,
      content,
      created_at: new Date().toISOString(),
      author: null,
    };

    getMockCommentStore().unshift(created);

    // 复刻 trg_build_comments_count 触发器的效果：
    // 评论数由数据库侧维护，前端不该自己算
    const target = getMockStore().find((b) => b.id === buildId);
    if (target) target.comments_count += 1;

    return created;
  }

  const env = await requestEnvelope<CommentDTO>(
    `/api/builds/${encodeURIComponent(buildId)}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ content }),
    },
  );
  return env.data;
}

/* ---------------------------------------------------------------- 工具 */

/**
 * 生成 UUID。`crypto.randomUUID` 同样受安全上下文限制，
 * 因此在非 https 环境下提供降级实现（仅用于 Mock，不参与任何鉴权）。
 */
function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const rand = (Math.random() * 16) | 0;
    const value = ch === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}
