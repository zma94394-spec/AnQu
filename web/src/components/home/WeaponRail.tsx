import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';

import { EASE } from '../../lib/styles';
import { cn } from '../../lib/cn';
import type { CategoryDTO, GunDTO } from '../../types/api';

export interface WeaponRailProps {
  categories: CategoryDTO[];
  guns: GunDTO[];
}

/**
 * 首页分类入口。
 *
 * 一条分隔网格，八行分类；不再给每个分类套一张带光环的卡片，
 * 也不重复样枪名 —— 分类名、枪械数、点击去目录，三件事就够。
 */
export function WeaponRail({ categories, guns }: WeaponRailProps) {
  if (categories.length === 0) return null;

  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <section aria-label="按枪械浏览">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.026em] text-ink lg:text-[22px]">
            按枪械浏览
          </h2>
        </div>
        <Link
          to="/guns"
          className={cn(
            'press group hidden items-center gap-1 text-[12px] font-medium text-ink-3 sm:flex',
            `transition-colors duration-200 ${EASE} hover:text-accent`,
          )}
        >
          全部 {guns.length} 把枪械
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden border-y border-hairline bg-hairline/70 sm:grid-cols-4 xl:grid-cols-8">
        {sorted.map((category) => (
          <Link
            key={category.slug}
            to={`/guns?category=${category.slug}`}
            className="home-rail-tile group flex min-w-0 items-center justify-between gap-2 px-3 py-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-medium text-ink-2 group-hover:text-ink">
                {category.name}
              </span>
              <span className="mt-0.5 block font-mono text-[10px] text-ink-3">
                {category.gun_count} 把
              </span>
            </span>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-colors group-hover:text-accent"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
