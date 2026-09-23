import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Flame,
  Heart,
  Layers,
  Loader2,
  Sparkles,
  Target,
  X,
} from 'lucide-react';

import { BuildCard } from '../components/BuildCard';
import { FilterBar } from '../components/FilterBar';
import { BuildCardSkeleton, EmptyState, ErrorState } from '../components/States';
import { useBuildsFeed } from '../hooks/useBuildsFeed';
import { useCopyCode } from '../hooks/useCopyCode';
import { useAppShell } from '../lib/appShell';
import { fetchBuilds } from '../lib/api';
import { cn } from '../lib/cn';
import { formatCoins, formatCount } from '../lib/format';
import { FILTER_DEFAULTS, hasActiveFilter, readFilters, writeFilters } from '../lib/queryParams';
import type { FeedFilters } from '../lib/queryParams';
import { EASE } from '../lib/styles';
import { PAGE_SIZE } from '../types/ui';
import type { BuildDTO } from '../types/api';

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories, guns, dataVersion } = useAppShell();

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
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6 lg:py-12">
      {/* ------------------------------------------------ Bento 概览区 */}
      <BentoSection
        categories={categories}
        gunCount={guns.length}
        totalBuilds={totalBuilds}
        version={dataVersion}
      />

      {/* ------------------------------------------------ 筛选与排序 */}
      <div className="mt-10 lg:mt-12">
        <h2 className="mb-5 flex items-center gap-2.5 text-[22px] font-semibold tracking-[-0.022em] text-ink">
          <Target className="h-5 w-5 text-accent" strokeWidth={2.5} aria-hidden="true" />
          {activeCategoryName ? `${activeCategoryName}改枪方案` : '全部改枪方案'}
        </h2>

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
      </div>

      {/* ------------------------------------------------ 列表 */}
      <div className="mt-6">
        {/* 静默刷新指示：已有数据时改筛选，只在右上角转圈，不清空列表 */}
        {feed.loading && !feed.initialLoading && (
          <div className="mb-3 flex items-center justify-end gap-1.5 text-[11px] text-ink-3">
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
        <nav aria-label="分页" className="mt-9 flex items-center justify-center gap-3">
          <PageButton
            disabled={filters.page <= 1}
            onClick={() => goToPage(filters.page - 1)}
            label="上一页"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </PageButton>

          <span className="font-mono text-[13px] text-ink-2">
            {filters.page} <span className="text-ink-3">/ {totalPages}</span>
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

/* ============================================================================
 *  Bento 概览区
 *
 *  大卡片突出「推荐方案」，小卡片放统计与分类 —— 这是 Apple 官网常用的
 *  非对称网格：主次分明，且各块高度对齐形成整齐的分割线。
 * ========================================================================== */

interface BentoSectionProps {
  categories: Array<{ slug: string; name: string; build_count: number }>;
  gunCount: number;
  totalBuilds: number;
  version: number;
}

function BentoSection({ categories, gunCount, totalBuilds, version }: BentoSectionProps) {
  const [featured, setFeatured] = useState<BuildDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // 推荐位独立于当前筛选，固定取热度榜首 ——
    // 否则用户一筛选，"推荐"就跟着变，失去"编辑精选"的意味。
    fetchBuilds({ page: 1, page_size: 1, sort: 'hot' })
      .then((res) => {
        if (!cancelled) setFeatured(res.items[0] ?? null);
      })
      .catch(() => {
        // 推荐位失败不应影响主列表，静默降级
        if (!cancelled) setFeatured(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  // 方案数最多的分类
  const topCategory = [...categories].sort((a, b) => b.build_count - a.build_count)[0] ?? null;

  return (
    <section aria-label="概览" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* ---------------------------------------- 大卡片：推荐方案 */}
      <div className="sm:col-span-2 lg:row-span-3">
        {loading ? (
          <div className="flex h-full min-h-[280px] flex-col justify-end rounded-card border border-hairline bg-glass p-7">
            <div className="skeleton h-5 w-24 rounded" />
            <div className="skeleton mt-4 h-7 w-4/5 rounded-lg" />
            <div className="skeleton mt-3 h-3 w-full rounded" />
            <div className="skeleton mt-2 h-3 w-2/3 rounded" />
            <div className="skeleton mt-6 h-14 w-full rounded-panel" />
          </div>
        ) : featured ? (
          <FeaturedCard build={featured} />
        ) : (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-card border border-dashed border-hairline bg-glass p-7 text-center">
            <Sparkles className="h-8 w-8 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
            <p className="mt-3 text-[15px] font-semibold text-ink">还没有可推荐的方案</p>
            <p className="mt-1.5 text-[13px] text-ink-2">
              发布第一个改枪方案，它就会出现在这里。
            </p>
          </div>
        )}
      </div>

      {/* ---------------------------------------- 小卡片：统计 */}
      <StatTile
        icon={Layers}
        label="方案总数"
        value={totalBuilds}
        hint="社区已收录的改枪方案"
      />
      <StatTile icon={Target} label="枪械库" value={gunCount} hint="可提交方案的枪械数量" />
      <StatTile
        icon={Flame}
        label="最热分类"
        value={topCategory?.name ?? '—'}
        hint={topCategory ? `该分类下 ${topCategory.build_count} 个方案` : '暂无数据'}
        isText
      />
    </section>
  );
}

/** 推荐方案大卡片 */
function FeaturedCard({ build }: { build: BuildDTO }) {
  // 复用与列表卡片完全相同的复制逻辑（降级、计数上报、2s 复位都在 hook 里）
  const copy = useCopyCode({
    buildId: build.id,
    code: build.code,
    copiesCount: build.copies_count,
    onPatch: () => {
      /* 推荐位是独立取的一份数据，不回写列表；计数由后端维护，下次加载即最新 */
    },
  });

  return (
    <article
      className={cn(
        'elevate elevate-hover relative flex h-full min-h-[280px] flex-col justify-between',
        'overflow-hidden rounded-card border border-hairline bg-glass p-7',
      )}
    >
      {/* 柔和高光：呼应页面背景的光源方向 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/16 blur-3xl"
      />

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-chip bg-accent/16 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            推荐方案
          </span>
          <span className="rounded-[9px] bg-glass-2 px-2.5 py-1 font-mono text-[12px] font-bold text-ink">
            {build.gun.name}
          </span>
        </div>

        <h2 className="mt-4 text-[26px] font-semibold leading-[1.2] tracking-[-0.026em] text-ink lg:text-[30px]">
          <Link
            to={`/builds/${build.id}`}
            className={cn('transition-colors duration-300', `${EASE} hover:text-accent`)}
          >
            {build.title}
          </Link>
        </h2>

        {build.description && (
          <p className="mt-3 line-clamp-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2">
            {build.description}
          </p>
        )}
      </div>

      {/* 改枪码 + 复制 */}
      <div className="relative mt-6 flex items-stretch gap-2 rounded-panel bg-black/35 p-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            改枪码 · {build.code.length} 位
          </div>
          <code
            title={build.code}
            className="mt-1.5 block select-all truncate font-mono text-[14px] leading-6 text-ink"
          >
            {build.code}
          </code>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-ink-3">
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" aria-hidden="true" />
              <span className="font-mono">{formatCount(build.likes_count)}</span>
            </span>
            <span className="flex items-center gap-1">
              <Copy className="h-3 w-3" aria-hidden="true" />
              <span className="font-mono">{formatCount(build.copies_count)}</span>
            </span>
            <span className="font-mono text-accent">
              ~{formatCoins(build.estimated_cost)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={copy.copy}
          className={cn(
            'press flex shrink-0 items-center gap-2 rounded-control px-5',
            'text-[13px] font-semibold',
            `transition-all duration-300 ${EASE}`,
            copy.state === 'copied' && 'animate-copy-pop bg-signal text-black',
            copy.state === 'failed' && 'bg-danger text-white',
            copy.state === 'idle' &&
              'bg-accent text-black hover:bg-accent-2 hover:shadow-[0_6px_22px_rgb(255_159_10_/_0.42)]',
          )}
        >
          {copy.state === 'copied' ? (
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          ) : copy.state === 'failed' ? (
            <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="whitespace-nowrap">{copy.label}</span>
        </button>
      </div>

      <Link
        to={`/builds/${build.id}`}
        className={cn(
          'relative mt-4 flex items-center gap-1 text-[13px] font-medium text-ink-2',
          `${EASE} transition-colors hover:text-accent`,
        )}
      >
        查看完整改装思路
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </article>
  );
}

/** 统计小卡片 */
interface StatTileProps {
  icon: typeof Layers;
  label: string;
  value: number | string;
  hint: string;
  /** value 是文字而非数字时，用更小的字号 */
  isText?: boolean;
}

function StatTile({ icon: Icon, label, value, hint, isText = false }: StatTileProps) {
  return (
    <div className="elevate elevate-hover flex flex-col justify-between rounded-card border border-hairline bg-glass p-5">
      <div className="flex items-center gap-2 text-ink-3">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-[12px] font-medium">{label}</span>
      </div>

      <div
        className={cn(
          'mt-3 font-semibold tracking-[-0.026em] text-ink',
          isText ? 'text-[22px]' : 'font-mono text-[34px]',
        )}
      >
        {value}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ 子组件 */

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
        'press flex items-center gap-1 rounded-chip bg-glass px-4 py-2',
        'text-[13px] font-medium text-ink-2',
        `transition-all duration-300 ${EASE} hover:bg-glass-2 hover:text-ink`,
        'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-glass disabled:hover:text-ink-2',
      )}
    >
      {children}
    </button>
  );
}
