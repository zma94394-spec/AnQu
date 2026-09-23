/**
 * ============================================================================
 *  后端契约的 TypeScript 映射
 *
 *  真源：后端 `src/services/{builds,guns}.service.ts` 的 DTO 定义。
 *  这些类型是**手写对齐**的，不是代码生成 —— 因此每次改后端 DTO 都要同步这里。
 *
 *  ⚠️ 一个容易踩的坑：后端 DTO 里 `created_at` / `updated_at` 声明为 `Date`，
 *     但经 `res.json()` 序列化后到达前端的是 **ISO 8601 字符串**。
 *     所以前端类型必须是 `string`，不能照抄成 `Date`，
 *     否则 `new Date(x)` 之外的任何日期运算都会在运行期炸掉。
 * ============================================================================
 */

/** 与 DB 枚举 `build_platform` 严格一致 */
export type Platform = 'mobile' | 'pc' | 'both';

/** 与后端 `SORT_VALUES` 严格一致 */
export type SortKey = 'latest' | 'hot' | 'cost_performance' | 'cost_asc' | 'cost_desc';

/* ---------------------------------------------------------------- DTO */

/** 对应后端 `BuildDTO` */
export interface BuildDTO {
  id: string;
  title: string;
  /** 游戏内一键导入的改枪码 */
  code: string;
  /** 预估造价，单位：柯恩币 */
  estimated_cost: number;
  platform: Platform;
  tags: string[];
  description: string | null;
  likes_count: number;
  copies_count: number;
  comments_count: number;
  hot_score: number | null;
  cp_score: number | null;
  /** ISO 8601 字符串（后端 Date 经 JSON 序列化） */
  created_at: string;
  updated_at: string;
  gun: {
    id: string;
    name: string;
    name_en: string | null;
    category: string;
    category_name: string;
    icon_url: string | null;
  };
  author: { id: string; nickname: string | null } | null;
}

/** 对应后端 `CategoryDTO`（来自 v_category_stats 视图） */
export interface CategoryDTO {
  slug: string;
  name: string;
  sort_order: number;
  gun_count: number;
  build_count: number;
}

/** 对应后端 `GunDTO` */
export interface GunDTO {
  id: string;
  name: string;
  name_en: string | null;
  slug: string;
  category: string;
  category_name: string;
  icon_url: string | null;
  build_count: number;
}

/** 对应后端 `Paginated<T>.pagination` */
export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
}

/* ---------------------------------------------------------- 响应信封 */

/**
 * 成功信封。
 * 注意 `GET /api/builds` 把 `pagination` 与 `data` **平级**放置
 * （见 builds.controller.ts 的 `res.json({ success, data, pagination })`），
 * 而不是嵌在 data 里 —— 这是最容易写错的一处。
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  pagination?: Pagination;
}

/** 错误信封，对应后端 `errorHandler` */
export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    /** 字段级校验错误等结构化附加信息 */
    details?: unknown;
    /** 仅非生产环境返回 */
    stack?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/* ------------------------------------------------------------ 端点出入参 */

/** `GET /api/guns` 的 data 部分 */
export interface GunsPayload {
  categories: CategoryDTO[];
  guns: GunDTO[];
}

/** `GET /api/builds` 归一化后的返回结构 */
export interface BuildsPage {
  items: BuildDTO[];
  pagination: Pagination;
}

/** `GET /api/builds` 查询参数 */
export interface BuildsQuery {
  page?: number;
  page_size?: number;
  category?: string;
  platform?: Platform;
  gun_id?: string;
  tag?: string;
  q?: string;
  min_cost?: number;
  max_cost?: number;
  sort?: SortKey;
}

/** `POST /api/builds/:id/copy` 的 data */
export interface CopyResult {
  id: string;
  copies_count: number;
}

/** `POST /api/builds/:id/like` 的 data */
export interface LikeResult {
  id: string;
  /** 操作后的状态：true=已点赞 / false=已取消 */
  liked: boolean;
  likes_count: number;
}

/**
 * `POST /api/builds` 请求体。
 *
 * 对应后端 `createBuildBodySchema`。该 schema 使用了 `.strict()`，
 * **多传任何字段都会被 400 拒绝**，因此这里刻意不添加任何额外字段
 * （例如不要顺手带上 likes_count —— 计数列由数据库维护，后端不接受客户端传入）。
 */
export interface CreateBuildInput {
  gun_id: string;
  title: string;
  code: string;
  /**
   * 预估造价。
   *
   * 注意是**可选**的：未填写时应整体省略该字段，而不是传 0。
   * 因为 `Number('')` 在 JS 里等于 `0`，静默转换会把"没填造价"变成
   * "造价 0 柯恩币"这种脏数据；而省略字段能让后端的 `required_error` 正常触发。
   */
  estimated_cost?: number;
  platform: Platform;
  tags: string[];
  description?: string | null;
}

/** 后端 `VALIDATION_ERROR` 的 `details` 结构（见 src/middleware/validate.ts） */
export interface ValidationIssue {
  field: string;
  message: string;
}

/** `POST /api/builds` 的 data —— 与列表项结构完全一致，可直接插入列表 */
export type CreateBuildResult = BuildDTO;

/* ------------------------------------------------------------ 评论 */

/** 对应后端 `CommentDTO`（src/services/comments.service.ts） */
export interface CommentDTO {
  id: string;
  build_id: string;
  content: string;
  /** ISO 8601 字符串 */
  created_at: string;
  /** 未登录用户发表的评论 author 为 null */
  author: { id: string; nickname: string | null; avatar_url: string | null } | null;
}

/** `GET /api/builds/:id/comments` 归一化后的返回结构 */
export interface CommentsPage {
  items: CommentDTO[];
  pagination: Pagination;
}

/** `POST /api/builds/:id/comments` 请求体 */
export interface CreateCommentInput {
  content: string;
}

/** 评论内容长度上限，与后端 `createCommentBodySchema` 的 `.max(500)` 对齐 */
export const COMMENT_MAX_LENGTH = 500;
