import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Target } from 'lucide-react';

import { BuildCard } from '../components/BuildCard';
import { FilterBar } from '../components/FilterBar';
import { BuildCardSkeleton, EmptyState, ErrorState } from '../components/States';
import { useBuildsFeed } from '../hooks/useBuildsFeed';
import { useAppShell } from '../lib/appShell';
import { cn } from '../lib/cn';
import { FILTER_DEFAULTS, hasActiveFilter, readFilters, writeFilters } from '../lib/queryParams';
import type { FeedFilters } from '../lib/queryParams';
import { PAGE_SIZE } from '../types/ui';

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories, dataVersion } = useAppShell();

  const filters = readFilters(searchParams);
  const active = hasActiveFilter(filters);

  const feed = useBuildsFeed({
    query: filters.q,
    platform: filters.platform,
    category: filters.category,
    sort: filters.sort,
    page: filters.page,
    pageSize: PAGE_SIZE,
    version: dataVersion,
  });

  /**
   * 筛选状态统一写回 URL。
   *
   * 默认用 `replace`：点分类、切排序这类高频操作不该把历史记录刷满，
   * 否则用户按"后退"要点十几次才能离开列表页。
   * 翻页例外 —— 那里用 push，"后退"回到上一页是符合直觉的。
   */
  const update = useCallback(
    (patch: Partial<FeedFilters>, options?: { push?: boolean }) => {
      setSearchParams(writeFilters({ ...filters, ...patch }), {
        replace: options?.push !== true,
      });
    },
    [filters, setSearchParams],
  );

  const goToPage = useCallback(
    (next: number) => {
      update({ page: next }, { push: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [update],
  );

  const resetFilters = useCallback(() => {
    setSearchParams(writeFilters(FILTER_DEFAULTS), { replace: true });
  }, [setSearchParams]);

  const activeCategoryName =
    filters.category === 'all'
      ? null
      : (categories.find((item) => item.slug === filters.category)?.name ?? filters.category);

  const totalBuilds = feed.pagination?.total ?? 0;
  const totalPages = feed.pagination?.total_pages ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6 lg:py-8">
      {/* ------------------------------------------------ 标题与统计 */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-ink lg:text-2xl">
            <Target className="h-5 w-5 text-tactical" strokeWidth={2.5} aria-hidden="true" />
            {activeCategoryName ? `${activeCategoryName}改枪方案` : '全部改枪方案'}
          </h1>
          <p className="mt-1.5 text-xs text-muted">
            复制改枪码 → 游戏内一键导入。按热度、性价比与造价快速找到适合自己的配置。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="方案" value={totalBuilds} />
          <StatChip label="分类" value={categories.length} />
        </div>
      </div>

      {/* ------------------------------------------------ 筛选与排序 */}
      <FilterBar
        categories={categories}
        category={filters.category}
        onCategoryChange={(value) => update({ category: value, page: 1 })}
        sort={filters.sort}
        onSortChange={(value) => update({ sort: value, page: 1 })}
        total={totalBuilds}
        hasActiveFilter={active}
        onReset={resetFilters}
      />

      {/* ------------------------------------------------ 列表 */}
      <div className="mt-5">
        {/* 静默刷新指示：已有数据时改筛选，只在右上角转圈，不清空列表 */}
        {feed.loading && !feed.initialLoading && (
          <div className="mb-2 flex items-center justify-end gap-1.5 text-[11px] text-dim">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            更新中…
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {feed.initialLoading &&
            Array.from({ length: 6 }, (_, i) => <BuildCardSkeleton key={i} index={i} />)}

          {!feed.initialLoading && feed.error && (
            <ErrorState message={feed.error} code={feed.errorCode} onRetry={feed.reload} />
          )}

          {!feed.initialLoading &&
            !feed.error &&
            feed.items.map((build, index) => (
              <BuildCard key={build.id} build={build} onPatch={feed.patchItem} index={index} />
            ))}

          {!feed.initialLoading && !feed.error && feed.items.length === 0 && (
            <EmptyState hasActiveFilter={active} onReset={resetFilters} />
          )}
        </div>
      </div>

      {/* ------------------------------------------------ 分页 */}
      {!feed.initialLoading && !feed.error && totalPages > 1 && (
        <nav aria-label="分页" className="mt-7 flex items-center justify-center gap-3">
          <PageButton
            disabled={filters.page <= 1}
            onClick={() => goToPage(filters.page - 1)}
            label="上一页"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </PageButton>

          <span className="font-mono text-xs text-muted">
            {filters.page} <span className="text-dim">/ {totalPages}</span>
          </span>

          <PageButton
            disabled={!feed.pagination?.has_next}
            onClick={() => goToPage(filters.page + 1)}
            label="下一页"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </PageButton>
        </nav>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ 子组件 */

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-line bg-surface/60 px-2.5 py-1',
        'text-[11px] font-medium text-dim',
      )}
    >
      {label}
      <span className="font-mono text-sm font-bold text-tactical">{value}</span>
    </span>
  );
}

interface PageButtonProps {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}

function PageButton({ disabled, onClick, label, children }: PageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'flex items-center gap-1 rounded-md border border-line bg-surface/70 px-3 py-1.5',
        'text-xs font-semibold text-muted transition-colors',
        'hover:border-line-strong hover:text-ink',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted',
      )}
    >
      {children}
    </button>
  );
}
