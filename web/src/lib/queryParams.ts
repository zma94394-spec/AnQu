/**
 * ============================================================================
 *  列表筛选状态 <-> URL search params
 *
 *  为什么把筛选状态放进 URL 而不是组件 state：
 *   1. 改枪码分享站的用户会把「筛选后的列表」链接发给队友，状态必须在 URL 里；
 *   2. 浏览器前进/后退能正常回到上一个筛选条件；
 *   3. Header 的搜索框在详情页也能用 —— 提交后跳到 `/?q=...` 即可。
 *
 *  约定：**默认值一律不写入 URL**，保持链接简短可读。
 *        `/?platform=pc&sort=hot` 比 `/?q=&platform=pc&category=all&sort=hot&page=1` 好得多。
 * ============================================================================
 */

import { DEFAULT_SORT, SORT_OPTIONS } from '../types/ui';
import type { PlatformFilter } from '../types/ui';
import type { SortKey } from '../types/api';

export interface FeedFilters {
  q: string;
  platform: PlatformFilter;
  category: string;
  sort: SortKey;
  page: number;
}

/** 与 `writeFilters` 配合：这些值不写入 URL */
export const FILTER_DEFAULTS: FeedFilters = {
  q: '',
  platform: 'all',
  category: 'all',
  sort: DEFAULT_SORT,
  page: 1,
};

export function readFilters(params: URLSearchParams): FeedFilters {
  const platform = params.get('platform');
  const sort = params.get('sort');
  const rawPage = Number(params.get('page') ?? '1');

  return {
    q: (params.get('q') ?? '').trim(),
    // 白名单校验：非法值一律回落到默认，避免把脏参数透传给后端
    platform: platform === 'mobile' || platform === 'pc' ? platform : 'all',
    category: params.get('category') ?? 'all',
    sort: SORT_OPTIONS.some((option) => option.key === sort)
      ? (sort as SortKey)
      : DEFAULT_SORT,
    page: Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1,
  };
}

/** 把筛选状态写回 URLSearchParams，默认值省略 */
export function writeFilters(filters: FeedFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.q !== FILTER_DEFAULTS.q) params.set('q', filters.q);
  if (filters.platform !== FILTER_DEFAULTS.platform) params.set('platform', filters.platform);
  if (filters.category !== FILTER_DEFAULTS.category) params.set('category', filters.category);
  if (filters.sort !== FILTER_DEFAULTS.sort) params.set('sort', filters.sort);
  if (filters.page !== FILTER_DEFAULTS.page) params.set('page', String(filters.page));

  return params;
}

/** 是否存在任一非默认筛选，用于决定「重置筛选」按钮是否出现 */
export function hasActiveFilter(filters: FeedFilters): boolean {
  return (
    filters.q !== FILTER_DEFAULTS.q ||
    filters.platform !== FILTER_DEFAULTS.platform ||
    filters.category !== FILTER_DEFAULTS.category ||
    filters.sort !== FILTER_DEFAULTS.sort
  );
}
