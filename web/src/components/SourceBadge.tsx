import { cn } from '../lib/cn';
import type { BuildProvenance } from '../lib/buildProvenance';

export interface SourceBadgeProps {
  provenance: BuildProvenance;
  /** xs = 紧凑列表；sm = 卡片；md = 详情页 */
  size?: 'xs' | 'sm' | 'md';
  /** 显示完整口径（默认短徽章）。完整文案必须逐字保留：多处 e2e 直接断言它。 */
  full?: boolean;
  className?: string;
}

const TONE: Record<BuildProvenance['kind'], string> = {
  DEMO: 'border-hairline bg-white/[0.025] text-ink-2',
  PLAYER_SUBMISSION: 'border-accent/30 bg-accent/[0.06] text-accent',
  SOURCE_UNVERIFIED: 'border-hairline bg-transparent text-ink-3',
};

const SIZE = {
  xs: 'gap-1 px-1.5 py-0.5 text-[9px]',
  sm: 'gap-1.5 px-2 py-0.5 text-[10px]',
  md: 'gap-1.5 px-2.5 py-1 text-[11px]',
} as const;

/**
 * 来源徽章的唯一实现。
 *
 * 颜色只承载语义（演示=琥珀、投稿=绿、未核实=中性），不新增"已验证"色。
 * 点而不是图标：89 张卡里每个图标都是一次重复的视觉噪声；
 * title 里保留完整原因，读屏则能读到完整 label。
 */
export function SourceBadge({ provenance, size = 'sm', full = false, className }: SourceBadgeProps) {
  return (
    <span
      title={provenance.reason}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-hud border font-medium',
        TONE[provenance.kind],
        SIZE[size],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('rounded-full bg-current', size === 'xs' ? 'h-1 w-1' : 'h-1.5 w-1.5')}
      />
      {full ? provenance.label : provenance.badge}
    </span>
  );
}
