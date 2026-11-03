import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { BuildCard } from '../components/BuildCard';
import { FilterBar } from '../components/FilterBar';
import { BuildCardSkeleton, EmptyState, ErrorState } from '../components/States';
import { HomeBackdrop } from '../components/home/HomeBackdrop';
import { LauncherHero } from '../components/home/LauncherHero';
import { WeaponRail } from '../components/home/WeaponRail';
import type { HomeSearchScope } from '../components/home/HomeSearch';
import { useBuildsFeed } from '../hooks/useBuildsFeed';
import { useAppShell } from '../lib/appShell';
import { cn } from '../lib/cn';
import { usePrefersReducedMotion } from '../lib/motion';
import { FILTER_DEFAULTS, hasActiveFilter, readFilters, writeFilters } from '../lib/queryParams';
import type { FeedFilters } from '../lib/queryParams';
import { EASE } from '../lib/styles';
import { PAGE_SIZE } from '../types/ui';
import '../styles/home.css';

/**
 * 首页只回答三个问题：去哪找枪、现在有什么公开方案、怎么投稿。
 * 画面交给全屏背景层，文字层只保留品牌、一句话与搜索。
 */
export function PreviewHomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { categories, dataVersion, guns } = useAppShell();
  const reduced = usePrefersReducedMotion();

  const filters = readFilters(searchParams);
  const active = hasActiveFilter(filters);
  const immersive = true;

  const feed = useBuildsFeed({
    query: filters.q,
    platform: filters.platform,
    category: filters.category,
    sort: filters.sort,
    page: filters.page,
    pageSize: PAGE_SIZE,
    version: dataVersion,
  });

  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollToBuilds = useCallback(() => {
    listRef.current?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [reduced]);

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
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    },
    [reduced, update],
  );

  const resetFilters = useCallback(() => {
    setSearchParams(writeFilters(FILTER_DEFAULTS), { replace: true });
  }, [setSearchParams]);

  /**
   * 首屏搜索：两个范围都走现有结果页，不新增后端或路由。
   * 搜方案留在首页并滚动到结果；搜枪械进 /guns 并保留当前分类。
   */
  const handleSearch = useCallback(
    (raw: string, scope: HomeSearchScope) => {
      const q = raw.trim();
      if (!q) return;

      if (scope === 'guns') {
        const next = new URLSearchParams({ q });
        const category = searchParams.get('category');
        if (category) next.set('category', category);
        navigate(`/guns?${next.toString()}`);
        return;
      }

      setSearchParams(writeFilters({ ...filters, q, page: 1 }), { replace: true });
      window.setTimeout(scrollToBuilds, 0);
    },
    [filters, navigate, scrollToBuilds, searchParams, setSearchParams],
  );

  const activeCategoryName =
    filters.category === 'all'
      ? null
      : (categories.find((item) => item.slug === filters.category)?.name ?? filters.category);

  const totalBuilds = feed.pagination?.total ?? 0;
  const totalPages = feed.pagination?.total_pages ?? 0;

  return (
    <>
      <HomeBackdrop />

      <LauncherHero
        initialQuery={filters.q}
        onSearch={handleSearch}
        onScrollToBuilds={scrollToBuilds}
      />

      <main
        className={cn(
          'relative z-10 mx-auto w-full max-w-7xl px-4 pb-20 pt-5 lg:px-6',
          immersive && 'pt-2',
        )}
      >
        <div className={cn(immersive && 'home-sheet')}>
          <div className="px-4 py-5 sm:px-6">
            <WeaponRail categories={categories} guns={guns} />
          </div>

          <section
            ref={listRef}
            aria-labelledby="home-builds-title"
            className="scroll-mt-24 border-t border-hairline px-4 py-5 sm:px-6"
          >
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-3">
            <div>
              <h2
                id="home-builds-title"
                className="text-[26px] font-semibold tracking-[-0.026em] text-ink lg:text-[30px]"
              >
                {activeCategoryName ? `${activeCategoryName}改枪方案` : '全部改枪方案'}
              </h2>
            </div>
            <Link
              to="/builds"
              className={cn(
                'press flex items-center gap-1 text-[12px] font-medium text-ink-3',
                `transition-colors duration-200 ${EASE} hover:text-accent`,
              )}
            >
              打开方案库
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-ink-3">
            演示条目不是玩家投稿；来源分三档：演示、玩家投稿、来源未核实。
            改枪码由投稿人自报，本站未在游戏内验证。
          </p>

          <div className="mt-4">
            <FilterBar
              categories={categories}
              category={filters.category}
              onCategoryChange={(value) => update({ category: value, page: 1 })}
              platform={filters.platform}
              onPlatformChange={(value) => update({ platform: value, page: 1 })}
              sort={filters.sort}
              onSortChange={(value) => update({ sort: value, page: 1 })}
              total={totalBuilds}
              hasActiveFilter={active}
              onReset={resetFilters}
            />
          </div>

          <div className="mt-5">
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
          </section>
        </div>
      </main>
    </>
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
        'press flex items-center gap-1 rounded-hud border border-hairline px-4 py-2',
        'text-[13px] font-medium text-ink-2',
        `transition-colors duration-200 ${EASE} hover:border-accent-line hover:text-ink`,
        'disabled:cursor-not-allowed disabled:opacity-35',
        'disabled:hover:border-hairline disabled:hover:text-ink-2',
      )}
    >
      {children}
    </button>
  );
}
