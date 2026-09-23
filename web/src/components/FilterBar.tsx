import { Clock, Coins, Flame, SlidersHorizontal, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../lib/cn';
import { SORT_OPTIONS } from '../types/ui';
import type { CategoryDTO, SortKey } from '../types/api';

export interface FilterBarProps {
  /** 来自 GET /api/guns 的分类字典（含各分类的方案数角标） */
  categories: CategoryDTO[];
  category: string;
  onCategoryChange: (value: string) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  /** 当前筛选下的结果总数，用于展示"共 N 个方案" */
  total: number;
  /** 是否有任一筛选条件生效，决定"重置"按钮是否出现 */
  hasActiveFilter: boolean;
  onReset: () => void;
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

export function FilterBar({
  categories,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  total,
  hasActiveFilter,
  onReset,
}: FilterBarProps) {
  const activeSort = SORT_OPTIONS.find((option) => option.key === sort);

  return (
    <section aria-label="筛选与排序" className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* -------------------------------------- 枪械分类 Pills */}
        <div className="min-w-0 lg:flex-1">
          <div
            className={cn(
              'no-scrollbar flex items-center gap-2 overflow-x-auto pb-1',
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

        {/* -------------------------------------- 排序：桌面分段控件 / 移动下拉 */}
        <div className="flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label="排序方式"
            className="hidden items-center gap-0.5 rounded-control bg-glass p-1 md:flex"
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
                    'press flex items-center gap-1.5 rounded-[10px] px-3 py-1.5',
                    'text-[13px] font-medium',
                    `transition-all duration-300 ${EASE}`,
                    active
                      ? 'bg-glass-3 text-ink shadow-[0_2px_8px_rgb(0_0_0_/_0.28)]'
                      : 'text-ink-2 hover:text-ink',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
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
              className={cn(
                'h-10 w-full appearance-none rounded-control border border-hairline bg-glass',
                'pl-3.5 pr-9 text-[13px] font-medium text-ink',
                'focus:border-hairline-2 focus:outline-none',
              )}
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
        </div>
      </div>

      {/* -------------------------------------- 结果摘要 + 排序口径说明 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          共 <span className="font-mono font-semibold text-ink-2">{total}</span> 个方案
        </span>

        {activeSort && (
          <span className="hidden sm:inline" title={activeSort.hint}>
            · 排序口径：{activeSort.hint}
          </span>
        )}

        {hasActiveFilter && (
          <button
            type="button"
            onClick={onReset}
            className="press flex items-center gap-1 rounded-md px-2 py-0.5 text-ink-3 transition-colors hover:bg-glass hover:text-ink"
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'press flex shrink-0 items-center gap-1.5 rounded-chip px-3.5 py-1.5',
        'text-[13px] font-medium',
        `transition-all duration-300 ${EASE}`,
        active
          ? 'bg-accent text-black shadow-[0_4px_18px_rgb(255_159_10_/_0.36)]'
          : 'bg-glass text-ink-2 hover:bg-glass-2 hover:text-ink',
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'rounded-chip px-1.5 py-px font-mono text-[10px] leading-4',
            active ? 'bg-black/18 text-black/80' : 'bg-glass-2 text-ink-3',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
