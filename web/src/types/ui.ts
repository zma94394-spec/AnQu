import type { Platform, SortKey } from './api';

/**
 * 平台筛选值。
 *
 * 注意这里**刻意不含 `'both'`** —— 需求规格的筛选维度只有 [全部][手游][PC端游]。
 * 语义上「全部」= 不按平台过滤（手游+端游+通用的方案都看得到），
 * 而 `'both'`（仅看"通用"方案）是另一个维度，需要时应单独加一个 Tab，
 * 不能与「全部」混为一谈。
 */
export type PlatformFilter = 'all' | Extract<Platform, 'mobile' | 'pc'>;

/** 分类筛选值：`'all'` 表示不筛选，否则为分类 slug（如 `assault_rifle`） */
export type CategoryFilter = 'all' | string;

/** 排序项。`hint` 用于鼠标悬停解释排序口径，避免用户猜"性价比"怎么算 */
export interface SortOption {
  key: SortKey;
  label: string;
  hint: string;
}

/**
 * 排序选项。前 4 项与需求规格一一对应，
 * `cost_desc` 是后端已支持但需求未列的补充项（与 cost_asc 成对）。
 */
export const SORT_OPTIONS: readonly SortOption[] = [
  { key: 'hot', label: '最热', hint: '热度分 =（点赞 × 3 + 复制）÷（发布小时数 + 2）^0.6' },
  { key: 'cost_performance', label: '性价比最高', hint: '性价比分 =（点赞 × 2 + 复制）÷ 造价 × 10000' },
  { key: 'latest', label: '最新发布', hint: '按发布时间倒序' },
  { key: 'cost_asc', label: '造价从低到高', hint: '按预估造价升序' },
  { key: 'cost_desc', label: '造价从高到低', hint: '按预估造价降序' },
] as const;

/** 平台 Tab 定义 */
export interface PlatformTab {
  value: PlatformFilter;
  label: string;
  /** 移动端使用的更短标签 */
  shortLabel: string;
}

export const PLATFORM_TABS: readonly PlatformTab[] = [
  { value: 'all', label: '全部', shortLabel: '全部' },
  { value: 'mobile', label: '手游', shortLabel: '手游' },
  { value: 'pc', label: 'PC端游', shortLabel: 'PC' },
] as const;

/** 每页条数。20 是后端默认值，这里显式写出便于"加载更多"演进 */
export const PAGE_SIZE = 12;

/** 默认排序。同时作为「是否写入 URL」的判据（见 lib/queryParams.ts） */
export const DEFAULT_SORT: SortKey = 'hot';

/**
 * 标签词表。
 *
 * ⚠️ 必须与后端 `src/schemas/builds.schema.ts` 的 `ALLOWED_TAGS` 保持一致。
 * 后端该常量目前**尚未接入 zod 强校验**（`tags` 只校验长度与个数），
 * 所以这里是一份"推荐词表"而非硬性约束 —— 用户仍可提交自定义标签。
 * 一旦后端启用强校验，未在此列出的标签会被拒绝。
 */
export const TAG_VOCABULARY = [
  '性价比', '低后坐', '高后坐控制', '满配', '极限改装',
  '腰射', '机动性', '跑图', '远距离', '近距离',
  '狙击', '消音',
  '封锁区', '军港/电视台', '室内战',
  '新手向', '新手推荐',
  '端游专属', '手游友好',
] as const;

/** 单个标签的最大长度，与后端 `z.string().max(16)` 对齐 */
export const TAG_MAX_LENGTH = 16;
/** 标签个数上限，与 DB 约束 `builds_tags_card` 及后端 `.max(8)` 对齐 */
export const TAG_MAX_COUNT = 8;
