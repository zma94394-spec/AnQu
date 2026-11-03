import { monogramOf } from '../lib/gunCatalog';
import { cn } from '../lib/cn';

export interface GunImageProps {
  name: string;
  /** 仅用于占位铭牌的分类说明；不参与取图 */
  categoryName?: string;
  className?: string;
}

/**
 * 枪械铭牌（无授权图时的唯一形态）。
 *
 * 为什么不再读 `icon_url`：那是后端一条未核验的外链，谁改了库就能让
 * 任意图片绕过授权登记表上屏。能显示的图只有 `WeaponVisual` 的登记表一条路；
 * 这里只画中性灰铭牌，并明确写「图待接入」。
 */
export function GunImage({ name, categoryName, className }: GunImageProps) {
  const mark = monogramOf({ name_en: name, name, slug: '' });

  return (
    <div
      role="img"
      aria-label={`${name}（枪械图待接入）`}
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center overflow-hidden',
        'bg-void',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="font-mono text-[14px] font-semibold leading-none tracking-[-0.03em] text-ink-2"
      >
        {mark}
      </span>
      {categoryName && (
        <span className="mt-1 font-mono text-[7px] uppercase tracking-[0.08em] text-ink-3">
          {categoryName}
        </span>
      )}
      <span className="mt-1 text-[8px] leading-none tracking-[0.04em] text-ink-3" aria-hidden="true">
        图待接入
      </span>
    </div>
  );
}
