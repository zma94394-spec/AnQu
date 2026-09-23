import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, fetchBuilds } from '../lib/api';
import type { BuildDTO, Pagination, SortKey } from '../types/api';
import type { PlatformFilter } from '../types/ui';

export interface FeedParams {
  query: string;
  platform: PlatformFilter;
  category: string;
  sort: SortKey;
  page: number;
  pageSize: number;
  /** 外部数据版本号，变化时强制重取（例如发布新方案后） */
  version?: number;
}

export interface FeedResult {
  items: BuildDTO[];
  pagination: Pagination | null;
  /** 任意一次请求进行中（含翻页/改筛选的静默刷新） */
  loading: boolean;
  /** 首次加载且尚无任何数据 —— 只有这种情况才展示骨架屏 */
  initialLoading: boolean;
  error: string | null;
  errorCode: string | null;
  reload: () => void;
  /** 复制/点赞后就地更新计数，避免为一次 +1 重取整页 */
  patchItem: (
    id: string,
    patch: Partial<Pick<BuildDTO, 'likes_count' | 'copies_count'>>,
  ) => void;
}

/**
 * 方案列表数据源。
 *
 * 两个必须处理的细节：
 *  1. **竞态**：用户快速切换筛选时，先发的请求可能后返回。
 *     这里用自增序号做守卫，只接受最新一次请求的结果，
 *     否则会出现"选了狙击枪却显示突击步枪列表"的错乱。
 *  2. **骨架屏只在首屏出现**：改筛选时保留旧列表并置 loading，
 *     避免每次点击都整页闪烁。
 */
export function useBuildsFeed(params: FeedParams): FeedResult {
  const { query, platform, category, sort, page, pageSize, version } = params;

  const [items, setItems] = useState<BuildDTO[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  /** 手动触发重取（错误重试按钮） */
  const [reloadToken, setReloadToken] = useState(0);

  /** 请求序号守卫，用于丢弃过期响应 */
  const seqRef = useRef(0);
  /** 是否已成功拿到过数据 —— 决定 initialLoading 的取值 */
  const hasDataRef = useRef(false);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    const seq = ++seqRef.current;
    const isStale = () => seq !== seqRef.current;

    setLoading(true);
    setError(null);
    setErrorCode(null);

    fetchBuilds({
      page,
      page_size: pageSize,
      sort,
      ...(query ? { q: query } : {}),
      ...(platform !== 'all' ? { platform } : {}),
      ...(category !== 'all' ? { category } : {}),
    })
      .then((res) => {
        if (isStale()) return;
        setItems(res.items);
        setPagination(res.pagination);
        hasDataRef.current = true;
      })
      .catch((err: unknown) => {
        if (isStale()) return;
        if (err instanceof ApiError) {
          setError(err.message);
          setErrorCode(err.code);
        } else {
          setError(err instanceof Error ? err.message : '加载失败，请稍后重试');
          setErrorCode('UNKNOWN');
        }
      })
      .finally(() => {
        if (isStale()) return;
        setLoading(false);
      });
  }, [query, platform, category, sort, page, pageSize, reloadToken, version]);

  const patchItem = useCallback<FeedResult['patchItem']>((id, patch) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  return {
    items,
    pagination,
    loading,
    initialLoading: loading && !hasDataRef.current,
    error,
    errorCode,
    reload,
    patchItem,
  };
}
