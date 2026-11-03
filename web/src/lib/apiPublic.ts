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
import {
  assertPreviewMethodAllowed,
  assertPreviewWriteAllowed,
  isPreviewReadOnlyError,
  notifyPreviewBlocked,
  PREVIEW_READONLY_EVENT,
  PREVIEW_READ_ONLY_MESSAGE,
} from '../preview/readOnly';
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
  CreateSubmissionInput,
  GunsPayload,
  LikeResult,
  Pagination,
  SortKey,
  SubmissionDTO,
  SubmissionQueueReceipt,
} from '../types/api';

/**
 * Preview 只读策略由 Preview 入口的 configure 模块注入。
 *
 * 默认值 false 保持共享模块在正式 Production 入口下的原有行为；
 * Preview 入口会在任何页面渲染/请求之前把 readOnly 设为 true。
 * 这里不读取 VITE_USE_MOCK 来决定只读与否。
 */
let previewReadOnly = false;

/**
 * Mock 模式开关。
 *
 * Preview 会在入口 configure 中显式设置；默认值保留给正式 Production 入口。
 */
export let USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK === 'true';

export interface PreviewApiPolicy {
  readOnly: boolean;
  useMock: boolean;
}

export function configurePreviewApiPolicy(policy: PreviewApiPolicy): void {
  previewReadOnly = policy.readOnly;
  USE_MOCK = policy.useMock;
}

export function isPreviewReadOnly(): boolean {
  return previewReadOnly;
}

export {
  isPreviewReadOnlyError,
  notifyPreviewBlocked,
  PREVIEW_READONLY_EVENT,
  PREVIEW_READ_ONLY_MESSAGE,
};

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

/**
 * 这些状态意味着「端点在当前后端上不存在 / 未实现 / 上游不可达」，
 * 而不是「这次请求被拒绝」。两者必须分开说：前一种情况下用户重试一百次也没用，
 * 而后一种确实与他刚做的动作有关。400 / 401 / 403 / 429 不在其列。
 *
 * 判据只写这一份 —— 投稿页与审核台若各写一套，就会出现
 * "投稿页说端点不可用、审核台说内部错误码" 这种自相矛盾的界面。
 */
export const ENDPOINT_UNAVAILABLE_STATUSES: ReadonlySet<number> = new Set([
  0, 404, 405, 501, 502, 503,
]);

/** 这个错误是不是「能力没接上」而不是「你做错了」 */
export function isEndpointUnavailable(err: ApiError): boolean {
  return ENDPOINT_UNAVAILABLE_STATUSES.has(err.status) || err.code === 'NETWORK_ERROR';
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
  if (previewReadOnly) {
    assertPreviewMethodAllowed(init?.method ?? 'GET', path);
  }

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
  } catch (err) {
    if (isPreviewReadOnlyError(err)) throw err;
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
  if (previewReadOnly) assertPreviewWriteAllowed('复制改枪码');
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
  if (previewReadOnly) assertPreviewWriteAllowed('点赞');
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
 * Mock 专用的本地插入路径；真实后端已不再提供"直接产出方案行"的能力
 * （`POST /api/builds` 自 P5D-B 起只回 202 + 一条待审投稿），所以非 Mock 分支直接抛错。
 * 真实链路请用 {@link submitBuildCandidate} 或 {@link submitViaLegacyBuildsEndpoint}。
 */
export async function createBuild(input: CreateBuildInput): Promise<CreateBuildResult> {
  if (previewReadOnly) assertPreviewWriteAllowed('发布方案');
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
      // Mock 新建只存在于当前预览会话，不是任何投稿管线的产物。
      data_origin: 'UNATTRIBUTED',
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

  // 真实后端下这条路已经不存在了：POST /api/builds 自 P5D-B 起只回 202 + 一条投稿，
  // 不再产出方案行。若这里还去请求并按 BuildDTO 解析，就是把"排队"伪装成"已发布"。
  throw new ApiError('LEGACY_CREATE_REMOVED',
    '旧发布端点已改为投稿队列，请使用 submitViaLegacyBuildsEndpoint() 或 submitBuildCandidate()', 0);
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
  if (previewReadOnly) assertPreviewWriteAllowed('发表评论');
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

/* ============================================================
 *  P5D-A 候选投稿与人工审核
 * ============================================================ */

/**
 * Mock 模式下的投稿暂存。
 *
 * ⚠️ 刻意**预置为空**：待审队列是"有人投了才有东西"的表，
 * 内置假投稿会让"人工审核"看起来已经有内容在处理 —— 那是伪造内容供给。
 */
let mockSubmissionStore: SubmissionDTO[] | null = null;

function getMockSubmissionStore(): SubmissionDTO[] {
  mockSubmissionStore ??= [];
  return mockSubmissionStore;
}

/** 投稿端点的返回：data 是那条投稿，meta 说明是"新建"还是"重复提交" */
export interface SubmitSubmissionResult {
  item: SubmissionDTO;
  decision: 'PENDING_REVIEW' | 'DUPLICATE_SUBMISSION';
  message: string;
}

/** `POST /api/build-submissions` —— 需要登录 */
export async function submitBuildCandidate(input: CreateSubmissionInput): Promise<SubmitSubmissionResult> {
  if (previewReadOnly) assertPreviewWriteAllowed('投稿');
  if (USE_MOCK) {
    await sleep(260);
    const store = getMockSubmissionStore();
    const hit = store.find((s) => s.code === input.code);
    if (hit) {
      return { item: hit, decision: 'DUPLICATE_SUBMISSION', message: '你之前已经投过这串改枪码，未重复入队' };
    }
    const now = new Date().toISOString();
    const created: SubmissionDTO = {
      id: randomId(),
      code: input.code,
      code_sha256_12: 'MOCK-NOT-SHA256'.slice(0, 12),
      weapon_claim: input.weapon_claim,
      gun_id: null,
      gun_name: null,
      platform_claim: input.platform_claim,
      region_claim: input.region_claim ?? null,
      source_kind: input.source_kind,
      source_url: input.source_url ?? null,
      source_note: input.source_note ?? null,
      submitter_claim: input.submitter_claim,
      title: input.title,
      estimated_cost: Number.isFinite(Number(input.estimated_cost)) ? Number(input.estimated_cost) : 0,
      tags: input.tags,
      description: input.description ?? null,
      status: 'PENDING_REVIEW',
      submitted_at: now,
      reviewed_by: null,
      decided_at: null,
      decision_note: null,
      machine_decision: null,
      machine_reasons: [],
      existing_build_code_id: null,
      materialized_build_id: null,
      verification: {
        token_status: null,
        token_id: null,
        token_verification_method: null,
        token_verification_note: null,
        listed_build_id: null,
      },
      // P5D-B 三轴：Mock 里投稿同样只到"待审"，既不核准也不上架
      listed_build_status: null,
      publicly_listed: false,
      published_at: null,
      published_by: null,
      cross_server_compatibility: 'UNKNOWN',
    };
    store.push(created);
    return {
      item: created,
      decision: 'PENDING_REVIEW',
      message: '已收到，进入人工审核队列；在审核通过之前不会出现在方案库或热门榜',
    };
  }

  const env = await requestEnvelope<SubmissionDTO>('/api/build-submissions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return {
    item: env.data,
    decision: (env.meta?.decision as SubmitSubmissionResult['decision']) ?? 'PENDING_REVIEW',
    message: env.meta?.message ?? '',
  };
}

/**
 * 旧入口 `POST /api/builds` 的真实语义（P5D-B）：**排队，不是发布**。
 *
 * 这里刻意不复用 createBuild 的 BuildDTO 返回类型 —— 旧接口已经不产出方案行了，
 * 假装它还返回一条"已发布的方案"就是前端在替后端说谎。
 */
export async function submitViaLegacyBuildsEndpoint(input: CreateBuildInput): Promise<SubmissionQueueReceipt> {
  if (previewReadOnly) assertPreviewWriteAllowed('投稿');
  if (USE_MOCK) {
    // Mock 没有后端，也就没有审核台；把演示投稿落到同一支队列里，
    // 让界面演示的形状与真实后端一致（待审 / 未验证 / 不在公开库）。
    const r = await submitBuildCandidate({
      code: input.code,
      weapon_claim: MOCK_GUNS.find((g) => g.id === input.gun_id)?.name ?? input.gun_id,
      platform_claim: input.platform,
      region_claim: null,
      source_kind: 'UNKNOWN',
      source_url: null,
      source_note: null,
      submitter_claim: 'NOT_TESTED',
      title: input.title,
      estimated_cost: input.estimated_cost ?? 0,
      tags: input.tags,
      description: input.description ?? null,
    });
    return {
      submission: r.item,
      queued: true,
      publicly_listed: false,
      status: r.item.status,
      duplicate: r.decision === 'DUPLICATE_SUBMISSION',
      next_step: r.message,
    };
  }

  const env = await requestEnvelope<SubmissionDTO>('/api/builds', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return {
    submission: env.data,
    queued: env.meta?.queued === true,
    publicly_listed: env.meta?.publicly_listed === true,
    status: env.data.status,
    duplicate: env.meta?.duplicate === true,
    next_step: typeof env.meta?.next_step === 'string' ? env.meta.next_step : '',
  };
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
