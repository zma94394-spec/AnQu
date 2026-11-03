import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, fetchBuilds } from '../lib/apiPublic';
import type { BuildDTO, Pagination, SortKey } from '../types/api';
import type { PlatformFilter } from '../types/ui';

export interface FeedParams {
  query: string;
  platform: PlatformFilter;
  category: string;
  sort: SortKey;
  page: number;
  pageSize: number;
  /** 只看某一把枪的方案（枪械详情页用）。对应后端 `GET /api/builds?gun_id=` */
  gunId?: string;
  /** 外部数据版本号，变化时强制重取（例如发布新方案后） */
  version?: number;
  /**
   * 暂停取数。用于"`?gun=` 还没在字典里解析完"这种**筛选条件尚未成立**的时刻 ——
   * 不暂停就会先发一次不带 `gun_id` 的全量请求，虽然界面上被解析中的面板挡住了，
   * 但"不拿未筛选的结果冒充筛选结果"这件事应该由数据层保证，不该只靠渲染分支。
   */
  paused?: boolean;
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
  const { query, platform, category, sort, page, pageSize, gunId, version, paused } = params;

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

    if (paused) {
      // 连请求都不发。返回前不 ++seqRef 之外不做任何事：
      // 恢复取数时 paused 变化会重跑这个 effect。
      setLoading(false);
      return;
    }

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
      ...(gunId ? { gun_id: gunId } : {}),
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
  }, [query, platform, category, sort, page, pageSize, gunId, paused, reloadToken, version]);

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
