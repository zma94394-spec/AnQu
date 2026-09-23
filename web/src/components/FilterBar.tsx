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
    <section aria-label="筛选与排序" className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

        {/* -------------------------------------- 排序：桌面 Tabs / 移动下拉 */}
        <div className="flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label="排序方式"
            className="hidden items-center gap-1 rounded-lg border border-line bg-surface/60 p-1 md:flex"
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
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                    'text-xs font-semibold transition-all duration-150',
                    active
                      ? 'bg-tactical text-void shadow-[0_0_14px_-2px_rgba(245,158,11,0.6)]'
                      : 'text-muted hover:bg-raised hover:text-ink',
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
                'h-9 w-full appearance-none rounded-lg border border-line bg-surface/70',
                'pl-3 pr-8 text-xs font-semibold text-ink',
                'focus:border-tactical/60 focus:outline-none',
              )}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-dim"
              aria-hidden="true"
            >
              ▾
            </span>
          </div>
        </div>
      </div>

      {/* -------------------------------------- 结果摘要 + 排序口径说明 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-dim">
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          共 <span className="font-mono font-semibold text-muted">{total}</span> 个方案
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
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5',
              'text-dim transition-colors hover:bg-raised hover:text-ink',
            )}
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
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5',
        'text-xs font-semibold transition-all duration-150',
        active
          ? 'border-tactical bg-tactical/15 text-tactical'
          : 'border-line bg-surface/60 text-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'rounded-full px-1.5 py-px font-mono text-[10px] leading-4',
            active ? 'bg-tactical/25 text-tactical' : 'bg-raised text-dim',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
