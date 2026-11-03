import { Clock, Coins, Flame, SlidersHorizontal, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { PLATFORM_TABS, SORT_OPTIONS } from '../types/ui';
import type { PlatformFilter } from '../types/ui';
import type { CategoryDTO, SortKey } from '../types/api';

export interface FilterBarProps {
  /** 来自 GET /api/guns 的分类字典（含各分类的方案数角标） */
  categories: CategoryDTO[];
  category: string;
  onCategoryChange: (value: string) => void;
  platform: PlatformFilter;
  onPlatformChange: (value: PlatformFilter) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  /** 当前筛选下的结果总数，用于展示"共 N 个方案" */
  total: number;
  /** 是否有任一筛选条件生效，决定"重置"按钮是否出现 */
  hasActiveFilter: boolean;
  onReset: () => void;
  /** 方案库专用的按枪筛选，放在同一控制行里，不再多占一行 */
  extra?: ReactNode;
}

/** 排序项图标。用 Lucide 而非 emoji —— emoji 在不同系统上字形差异大，破坏视觉一致性 */
const SORT_ICON: Record<SortKey, LucideIcon> = {
  hot: Flame,
  cost_performance: Zap,
  latest: Clock,
  cost_asc: Coins,
  cost_desc: Coins,
};

const EASE = 'ease-[cubic-bezier(0.25,1,0.5,1)]';

/**
 * 方案列表的筛选与排序条。
 *
 * UI-003 只换视觉层。以下都是**功能契约**，一字未动：
 * `role="group"` + `aria-label="枪械分类"` / `"排序方式"`、`aria-pressed`、
 * `重置筛选` / `最新发布` / `性价比最高` 这些按钮名（e2e 直接按名字点），
 * 以及分类项仍然全部由 `categories.map(...)` 生成 —— **一个 slug 都没写死**。
 */
export function FilterBar({
  categories,
  category,
  onCategoryChange,
  platform,
  onPlatformChange,
  sort,
  onSortChange,
  total,
  hasActiveFilter,
  onReset,
  extra,
}: FilterBarProps) {
  return (
    <section aria-label="筛选与排序" className="space-y-4">
      <div className="flex flex-col gap-3">
        {/* -------------------------------------- 枪械分类 */}
        <div className="min-w-0 lg:flex-1">
          <div
            className={cn(
              'no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1',
              'lg:flex-wrap lg:overflow-visible lg:pb-0',
            )}
            role="group"
            aria-label="枪械分类"
          >
            {/* "全部" 不由后端返回，前端固定置顶 */}
            <CategoryPill
              label="全部"
              active={category === 'all'}
              onClick={() => onCategoryChange('all')}
            />

            {categories.map((item) => (
              <CategoryPill
                key={item.slug}
                label={item.name}
                count={item.build_count}
                active={category === item.slug}
                onClick={() => onCategoryChange(item.slug)}
              />
            ))}
          </div>
        </div>

        {/* -------------------------------------- 平台与排序：桌面分段 / 移动下拉 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="平台筛选"
            className="flex items-center gap-0.5 rounded-hud border border-hairline bg-black/25 p-0.5"
          >
            {PLATFORM_TABS.map((tab) => {
              const active = platform === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => onPlatformChange(tab.value)}
                  aria-pressed={active}
                  className={cn(
                    'press rounded-hud px-2.5 py-1 text-[11.5px] font-medium',
                    `transition-colors duration-200 ${EASE}`,
                    active
                      ? 'bg-accent/10 text-ink'
                      : 'text-ink-3 hover:text-ink-2',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 排序：外框 hairline，选中项极淡冷光底 */}
          <div
            role="group"
            aria-label="排序方式"
            className="hidden items-center gap-0.5 rounded-hud border border-hairline bg-black/35 p-1 md:flex"
          >
            {SORT_OPTIONS.map((option) => {
              const Icon = SORT_ICON[option.key];
              const active = sort === option.key;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onSortChange(option.key)}
                  aria-pressed={active}
                  title={option.hint}
                  className={cn(
                    'press flex items-center gap-1.5 rounded-hud px-2.5 py-1',
                    'text-[12px] font-medium',
                    `transition-all duration-300 ${EASE}`,
                    active
                      ? 'bg-accent/10 text-ink'
                      : 'text-ink-2 hover:bg-white/[0.04] hover:text-ink',
                  )}
                >
                  <Icon
                    className={cn('h-3.5 w-3.5 transition-colors', active && 'text-hud')}
                    aria-hidden="true"
                  />
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* 移动端：原生 select 最可靠（原生弹层无定位/遮挡问题）。
              html 上的 color-scheme:dark 会让选项列表也走暗色。 */}
          <div className="relative md:hidden">
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as SortKey)}
              aria-label="排序方式"
              className="hud-field h-10 appearance-none py-0 pl-3.5 pr-9 text-[13px] font-medium"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-3"
              aria-hidden="true"
            >
              ▾
            </span>
          </div>

          {extra}
        </div>
      </div>

      {/* -------------------------------------- 结果摘要 + 排序口径说明 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          共 <span className="hud-readout font-semibold text-ink-2">{total}</span> 个方案
        </span>


        {hasActiveFilter && (
          <button
            type="button"
            onClick={onReset}
            className="press flex items-center gap-1 rounded-hud px-2 py-0.5 text-ink-3 transition-colors hover:bg-glass hover:text-hud"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            重置筛选
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 子组件 */

interface CategoryPillProps {
  label: string;
  /** 分类下的方案数，仅分类项传入（"全部"不传） */
  count?: number;
  active: boolean;
  onClick: () => void;
}

function CategoryPill({ label, count, active, onClick }: CategoryPillProps) {
  /*
   * 直接复用 `/weapons` 的 `.hud-tab` —— 两处分类控件必须来自同一个样式源，
   * 否则"首页的方案分类条"和"武器库的分类条"会长成两个东西，
   * 而那正是 UI-003 要消灭的断层。
   *
   * 选中态是底部一道冷光下划线，不是原来的实心黄块：实心黄在这里会和
   * 主行动按钮抢权重，一排黄块也谈不上"克制"。
   */
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-active={active}
      className="hud-tab press shrink-0 !px-2.5 !py-1 !text-[12px]"
    >
      {label}
      {count !== undefined && <span className="hud-readout text-[10px] text-ink-3">{count}</span>}
    </button>
  );
}
