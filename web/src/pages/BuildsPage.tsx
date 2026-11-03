import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { motion } from 'framer-motion';

import { BuildCard } from '../components/BuildCard';
import { FilterBar } from '../components/FilterBar';
import { BuildCardSkeleton, EmptyState, ErrorState } from '../components/States';
import { useBuildsFeed } from '../hooks/useBuildsFeed';
import { useAppShell } from '../lib/appShell';
import { cn } from '../lib/cn';
import { PLATFORM_LABEL } from '../lib/format';
import { usePrefersReducedMotion } from '../lib/motion';
import {
  FILTER_DEFAULTS,
  hasActiveFilter,
  readFilters,
  writeFilters,
} from '../lib/queryParams';
import type { FeedFilters } from '../lib/queryParams';
import { riseConverge } from '../lib/hudMotion';
import { EASE } from '../lib/styles';
import { PAGE_SIZE, PLATFORM_TABS } from '../types/ui';
import type { SortKey } from '../types/api';

/**
 * ============================================================================
 *  方案库 `/builds`
 *
 *  数据与筛选**全部复用既有实现**，这一页没有新增任何后端能力：
 *   - 数据源：`useBuildsFeed` → `GET /api/builds`（`q` / `platform` /
 *     `category` / `sort` / `page` / `page_size` 六个参数是后端早就支持的）
 *   - 筛选状态：`lib/queryParams.ts` 的 readFilters / writeFilters，
 *     **一个 URL 参数都没新增** —— 首页用的那套原样搬过来
 *   - 控件：`FilterBar`（分类 + 排序 + 总数 + 重置）与 `BuildCard`
 *     都直接复用，没有 fork 一份"方案库专用版"
 *   - 搜索框与平台 Tab 在页头（`Header`），它写的也是同一套 query 参数
 *
 *  ⚠️ 刻意**没有**做的那些，都是因为后端/数据层没有对应能力，硬做就是编数据：
 *   - 不显示评分 / 播放量 / 下载数 / 命中率 —— `BuildDTO` 里不存在这些字段
 *   - `hot_score` / `cp_score` 只作为**排序口径**存在，不是给用户读的数字
 *     （口径已在 FilterBar 的 hint 里写明），所以这里不摆分数
 *   - 造价区间、标签筛选（`min_cost` / `max_cost` / `tag`）后端支持，
 *     但需要新的 URL 参数与控件，留给后续任务（见 UI-006_REPORT）
 *
 *  🔺 UI-013 改了一条早先的判断：原来这里写着"枪械筛选不在本页重复入口，
 *  按枪械浏览的正解是 `/guns/:slug`"。实测那条路走不通 —— 枪械详情页只内嵌
 *  前 20 条、没有翻页、也进不了方案库既有的搜索/排序/分享链接体系，
 *  "选枪 → 找这套枪的方案 → 复制码"这条主流程在中间断掉。
 *  现在 URL 多一个 `?gun=<canonical slug>`：
 *   - 值用 slug 不用 uuid，标识仍然只有 `db/04_seed.sql` 一份出处（不是第二套枪械数据）
 *   - slug → `gun_id` 的换算走 `useAppShell().guns`（就是 `GET /api/guns` 那一份字典）
 *   - 后端仍走它早就支持的 `GET /api/builds?gun_id=`，没有新增任何后端能力
 *
 *  ⚠️ 卡片一律用既有的 `BuildCard`（`tactical-card` → 圆角 3px）。
 *     「视觉基线」那条 e2e 会对页面上**所有** `article` 断言圆角集合，
 *     在这里另起一套卡片圆角会直接把套件弄红。
 * ================================================================== */
export function BuildsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { categories, guns, dictionaryLoading, dataVersion } = useAppShell();
  const reduced = usePrefersReducedMotion();

  const filters = readFilters(searchParams);
  const active = hasActiveFilter(filters);

  /**
   * `?gun=<slug>` → 字典里的那把枪。
   *
   * 换算只用 `GET /api/guns` 这一份字典；这里**不**维护第二套枪械名单，
   * 也不把 slug 直接当 `gun_id` 发给后端（后端要的是 uuid）。
   */
  const selectedGun = useMemo(
    () => (filters.gun ? guns.find((gun) => gun.slug === filters.gun) ?? null : null),
    [filters.gun, guns],
  );
  /** 字典还没回来，无法判断这个 slug 真不真 —— 此时不许把"全部方案"当成答案显示 */
  const gunResolving = Boolean(filters.gun) && !selectedGun && dictionaryLoading;
  /** 字典已就绪但这个 slug 不在里面：链接过期或被人手打错，只能如实说找不到 */
  const gunUnknown = Boolean(filters.gun) && !selectedGun && !dictionaryLoading;

  /** 下拉里的分组顺序 = 分类字典顺序，组内按显示名排 —— 与 `/guns` 同一套出处与同一套排序直觉 */
  const gunGroups = useMemo(() => {
    const byCategory = new Map<string, { slug: string; label: string }[]>();
    for (const gun of guns) {
      const bucket = byCategory.get(gun.category) ?? [];
      bucket.push({
        slug: gun.slug,
        label: gun.name_en && gun.name_en !== gun.name ? `${gun.name} · ${gun.name_en}` : gun.name,
      });
      byCategory.set(gun.category, bucket);
    }
    return categories
      .filter((category) => byCategory.has(category.slug))
      .map((category) => ({
        slug: category.slug,
        name: category.name,
        guns: (byCategory.get(category.slug) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [categories, guns]);

  const feed = useBuildsFeed({
    query: filters.q,
    platform: filters.platform,
    category: filters.category,
    sort: filters.sort,
    page: filters.page,
    pageSize: PAGE_SIZE,
    // 筛选条件还没成立时连请求都不发：见 gunResolving / gunUnknown 两块渲染分支
    gunId: selectedGun?.id,
    paused: gunResolving || gunUnknown,
    version: dataVersion,
  });

  /**
   * 筛选写回 URL。口径与首页完全一致：
   * 高频改筛选走 replace（不刷历史记录），翻页走 push（后退回上一页直觉正确）。
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
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    },
    [reduced, update],
  );

  const resetFilters = useCallback(() => {
    setSearchParams(writeFilters(FILTER_DEFAULTS), { replace: true });
  }, [setSearchParams]);

  const activeCategory =
    filters.category === 'all'
      ? null
      : (categories.find((item) => item.slug === filters.category) ?? null);

  const activePlatform =
    filters.platform === 'all'
      ? null
      : (PLATFORM_TABS.find((tab) => tab.value === filters.platform) ?? null);

  /**
   * 结果总数。`null`（还没拿到 pagination）与 `0`（真的没有）必须分开 ——
   * 把加载态显示成 0 就是用一个"真实数字"说谎，与首页读数区同一口径。
   */
  const total: number | null = feed.pagination ? feed.pagination.total : null;
  const totalPages = feed.pagination?.total_pages ?? 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-14 lg:px-6 lg:pt-18">
      {/* ============================================ 页头 */}
      <motion.header initial="hidden" animate="show" variants={riseConverge}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <h1 className="text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-ink lg:text-[42px]">
              方案库
            </h1>
          </div>

        </div>

        {/* UI-007 STEP 4：卡片上的点赞/复制读数需要一个可见的口径说明，不能只挂在 title 上。
            这一段同时承担来源三档与"未在游戏内验证"的边界声明，避免页头出现两段近义长文。 */}
        <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-ink-3">
          点赞与复制是站内计数，起点可能包含样例基线。来源分三档：演示、玩家投稿、
          来源未核实；后两档都不等于客户端验证。改枪码由投稿人自报，本站未在游戏内验证。
        </p>
      </motion.header>

      {/* ============================================ 发现控件 */}
      <div className="mt-8">
        <FilterBar
          categories={categories}
          category={filters.category}
          onCategoryChange={(value) => update({ category: value, page: 1 })}
          platform={filters.platform}
          onPlatformChange={(value) => update({ platform: value, page: 1 })}
          sort={filters.sort}
          onSortChange={(value: SortKey) => update({ sort: value, page: 1 })}
          total={total ?? 0}
          hasActiveFilter={active}
          onReset={resetFilters}
          extra={
            gunGroups.length > 0 ? (
              <label className="flex items-center gap-2">
                <span className="whitespace-nowrap text-[11px] text-ink-3">按枪械</span>
                <select
                  id="builds-gun-filter"
                  aria-label="按枪械筛选"
                  value={selectedGun?.slug ?? ''}
                  onChange={(event) => update({ gun: event.target.value, page: 1 })}
                  className="hud-field h-8 min-w-[10.5rem] max-w-full py-0 font-mono text-[11.5px]"
                >
                  <option value="">全部枪械</option>
                  {gunGroups.map((group) => (
                    <optgroup key={group.slug} label={group.name}>
                      {group.guns.map((gun) => (
                        <option key={gun.slug} value={gun.slug}>
                          {gun.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            ) : (
              <span className="text-[11px] text-ink-3">枪械字典读取中</span>
            )
          }
        />
      </div>

      {/* ------------------------------------ 生效中的页头筛选 */}
      {/*
        * 搜索关键字与平台只存在于页头（`Header`），列表区看不见它们，
        * 于是会出现"列表被过滤了但用户不知道"的困惑。这里把**已有状态**
        * 复读成可单独撤销的 chip —— 不引入新的筛选维度。
        */}
      <ActiveFilterChips
        filters={filters}
        categoryName={activeCategory?.name ?? null}
        platformLabel={activePlatform?.label ?? null}
        gunName={selectedGun?.name ?? null}
        onClearQuery={() => update({ q: '', page: 1 })}
        onClearPlatform={() => update({ platform: 'all', page: 1 })}
        onClearCategory={() => update({ category: 'all', page: 1 })}
        onClearGun={() => update({ gun: '', page: 1 })}
      />

      {/* ============================================ 方案流 */}
      <div className="mt-6">
        {/*
         * `?gun=` 指向一把字典里查不到的枪时，绝不能"就当没筛"把全站方案倒出来 ——
         * 那会让一个坏链接看起来像一份真实结果。
         */}
        {gunResolving && (
          <div
            role="status"
            className={cn(
              'animate-rise-in col-span-full flex flex-col items-center justify-center',
              'rounded-card border border-dashed border-hairline bg-glass/60 px-6 py-20 text-center',
            )}
          >
            <Loader2 className="h-5 w-5 animate-spin text-ink-3" aria-hidden="true" />
            <p className="mt-4 text-[15px] font-semibold text-ink">正在读取枪械字典…</p>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-2">
              这条链接要按 <code className="font-mono text-ink-3">{filters.gun}</code> 筛选方案，
              字典回来之前不会先把全部方案当成结果给你看。
            </p>
          </div>
        )}

        {gunUnknown && (
          <div
            role="alert"
            className={cn(
              'animate-rise-in col-span-full flex flex-col items-center justify-center',
              'rounded-card border border-dashed border-hairline bg-glass/60 px-6 py-20 text-center',
            )}
          >
            <p className="text-[17px] font-semibold tracking-[-0.022em] text-ink">
              字典里没有这把枪
            </p>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">
              链接里的枪械标识 <code className="font-mono text-ink-3">{filters.gun}</code>{' '}
              不在本站的枪械字典里（可能改名了，也可能是手打错的链接）。
              本站不猜它对应哪把枪。
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => update({ gun: '', page: 1 })}
                className={cn(
                  'press rounded-chip bg-accent px-4 py-2 text-[13px] font-semibold text-black',
                  `transition-all duration-300 ${EASE} hover:bg-accent-2`,
                )}
              >
                清除枪械筛选，看全部方案
              </button>
              <button
                type="button"
                onClick={() => navigate('/guns')}
                className={cn(
                  'press rounded-chip bg-glass px-4 py-2 text-[13px] font-semibold text-ink',
                  `transition-all duration-300 ${EASE} hover:bg-glass-2`,
                )}
              >
                去枪械目录
              </button>
            </div>
          </div>
        )}

        {!gunResolving && !gunUnknown && (
          <>
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
                  <BuildCard
                    key={build.id}
                    build={build}
                    onPatch={feed.patchItem}
                    index={index}
                  />
                ))}

              {!feed.initialLoading && !feed.error && feed.items.length === 0 && (
                <EmptyState hasActiveFilter={active} onReset={resetFilters} />
              )}
            </div>
          </>
        )}
      </div>

      {/* ============================================ 翻页 */}
      {!gunResolving &&
        !gunUnknown &&
        !feed.initialLoading &&
        !feed.error &&
        totalPages > 1 && (
        <nav aria-label="分页" className="mt-10 flex items-center justify-center gap-3">
          <PageButton
            disabled={filters.page <= 1}
            onClick={() => goToPage(filters.page - 1)}
            label="上一页"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </PageButton>

          <span className="hud-readout text-[13px] text-ink-2">
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

/* ------------------------------------------------------------------ 子组件 */

interface ActiveFilterChipsProps {
  filters: FeedFilters;
  categoryName: string | null;
  platformLabel: string | null;
  gunName: string | null;
  onClearQuery: () => void;
  onClearPlatform: () => void;
  onClearCategory: () => void;
  onClearGun: () => void;
}

/**
 * 把当前生效的几项筛选复读成 chip。
 *
 * 只在"确实有非默认筛选"时渲染 —— 默认状态下这条本身就是空的，
 * 摆一句"当前无筛选"是纯粹的视觉噪声。
 */
function ActiveFilterChips({
  filters,
  categoryName,
  platformLabel,
  gunName,
  onClearQuery,
  onClearPlatform,
  onClearCategory,
  onClearGun,
}: ActiveFilterChipsProps) {
  const chips: { key: string; label: string; value: string; onClear: () => void }[] = [];

  if (filters.q) chips.push({ key: 'q', label: '关键字', value: filters.q, onClear: onClearQuery });
  if (filters.platform !== 'all') {
    chips.push({
      key: 'platform',
      label: '平台',
      value: platformLabel ?? PLATFORM_LABEL[filters.platform] ?? filters.platform,
      onClear: onClearPlatform,
    });
  }
  if (filters.category !== 'all') {
    chips.push({
      key: 'category',
      label: '分类',
      value: categoryName ?? filters.category,
      onClear: onClearCategory,
    });
  }
  if (filters.gun) {
    chips.push({
      key: 'gun',
      label: '枪械',
      // 字典里查不到时把原始 slug 显示出来：宁可让用户看见一个陌生串，
      // 也不替他编一个"看起来对"的枪名。
      value: gunName ?? filters.gun,
      onClear: onClearGun,
    });
  }

  if (chips.length === 0) return null;

  return (
    <ul className="mt-4 flex flex-wrap items-center gap-2" aria-label="生效中的筛选">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={chip.onClear}
            className={cn(
              'press flex items-center gap-2 rounded-hud border border-hairline',
              'bg-black/25 px-2.5 py-1.5 text-[12px] text-ink-2',
              `transition-colors duration-300 ${EASE} hover:border-hud hover:text-ink`,
            )}
            title={`清除${chip.label}筛选`}
          >
            <span className="text-ink-3">{chip.label}</span>
            <span className="max-w-[14rem] truncate font-medium">{chip.value}</span>
            <X className="h-3 w-3 shrink-0 text-ink-3" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function PageButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'press flex h-9 w-9 items-center justify-center rounded-hud',
        'border border-hairline bg-glass text-[14px] text-ink-2',
        `transition-all duration-300 ${EASE} hover:border-hud hover:text-hud`,
        'disabled:cursor-not-allowed disabled:opacity-35',
        'disabled:hover:border-hairline disabled:hover:text-ink-2',
      )}
    >
      {children}
    </button>
  );
}
