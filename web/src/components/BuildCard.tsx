import { Link } from 'react-router-dom';
import {
  Check,
  Clock,
  Copy,
  Heart,
  LayoutGrid,
  MessageSquare,
  Monitor,
  Smartphone,
  Terminal,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useCopyCode } from '../hooks/useCopyCode';
import { useLikeBuild } from '../hooks/useLikeBuild';
import { cn } from '../lib/cn';
import { formatCoins, formatCount, formatRelativeTime, PLATFORM_LABEL } from '../lib/format';
import type { BuildDTO, Platform } from '../types/api';

export interface BuildCardProps {
  build: BuildDTO;
  /** 计数回写。卡片内部做乐观更新，避免为一次 +1 重取整页 */
  onPatch: (id: string, patch: Partial<Pick<BuildDTO, 'likes_count' | 'copies_count'>>) => void;
  /** 入场动画的错峰序号 */
  index?: number;
}

const PLATFORM_ICON: Record<Platform, LucideIcon> = {
  mobile: Smartphone,
  pc: Monitor,
  both: LayoutGrid,
};

const EASE = 'ease-[cubic-bezier(0.25,1,0.5,1)]';

export function BuildCard({ build, onPatch, index = 0 }: BuildCardProps) {
  const copy = useCopyCode({
    buildId: build.id,
    code: build.code,
    copiesCount: build.copies_count,
    onPatch,
  });

  const like = useLikeBuild({
    buildId: build.id,
    likesCount: build.likes_count,
    onPatch,
  });

  const PlatformIcon = PLATFORM_ICON[build.platform];
  const detailPath = `/builds/${build.id}`;

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
      className={cn(
        'group animate-rise-in elevate elevate-hover relative flex h-full flex-col',
        'rounded-card bg-glass p-5',
        'border border-hairline',
        'hover:border-hairline-2 hover:bg-glass-2',
      )}
    >
      {/* ------------------------------------------------ 头部 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* 枪械名称 badge */}
          <span className="rounded-[9px] bg-accent/16 px-2.5 py-1 font-mono text-[13px] font-bold tracking-tight text-accent">
            {build.gun.name}
          </span>

          {/* 适用平台 */}
          <span className="flex items-center gap-1 rounded-[9px] bg-glass-2 px-2 py-1 text-[11px] font-medium text-ink-2">
            <PlatformIcon className="h-3 w-3" aria-hidden="true" />
            {PLATFORM_LABEL[build.platform] ?? build.platform}
          </span>
        </div>

        {/* 预估造价 */}
        <div className="shrink-0 text-right">
          <div className="font-mono text-[15px] font-semibold tracking-tight text-accent">
            ~{formatCoins(build.estimated_cost)}
          </div>
          <div className="mt-0.5 text-[10px] text-ink-3">预估造价</div>
        </div>
      </div>

      {/* ------------------------------------------------ 标题与说明 */}
      <h3 className="mt-3.5 text-[17px] font-semibold leading-snug tracking-[-0.022em]">
        <Link
          to={detailPath}
          className={cn(
            'text-ink transition-colors duration-300',
            `${EASE} hover:text-accent`,
          )}
        >
          {build.title}
        </Link>
      </h3>

      {build.description && (
        <p className="mt-2 line-clamp-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
          {build.description}
        </p>
      )}

      {/* ------------------------------------------------ 改枪码核心交互区 */}
      <div className="mt-4">
        <div className="flex items-stretch gap-2 rounded-panel bg-black/35 p-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              <Terminal className="h-3 w-3" aria-hidden="true" />
              改枪码
              <span className="ml-auto font-mono normal-case tracking-normal">
                {build.code.length} 位
              </span>
            </div>

            {/* select-all：即使复制按钮不可用，用户也能一次点选整串码手动复制 */}
            <code
              title={build.code}
              className="mt-1.5 block select-all truncate font-mono text-[13px] leading-5 text-ink"
            >
              {build.code}
            </code>
          </div>

          <button
            type="button"
            onClick={copy.copy}
            className={cn(
              'press flex shrink-0 flex-col items-center justify-center gap-1 rounded-control px-3.5 py-2.5',
              'text-[12px] font-semibold',
              `transition-all duration-300 ${EASE}`,
              copy.state === 'copied' && 'animate-copy-pop bg-signal text-black',
              copy.state === 'failed' && 'bg-danger text-white',
              copy.state === 'idle' &&
                'bg-accent text-black hover:bg-accent-2 hover:shadow-[0_6px_20px_rgb(255_159_10_/_0.4)]',
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

        {/* 复制结果的无障碍播报：视觉上的按钮变色对读屏用户不可见 */}
        <span role="status" aria-live="polite" className="sr-only">
          {copy.state === 'copied' && '改枪码已复制到剪贴板'}
          {copy.state === 'failed' && '复制失败，请手动选中改枪码后复制'}
        </span>
      </div>

      {/* ------------------------------------------------ 标签 */}
      {build.tags.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {build.tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                'rounded-chip bg-glass px-2.5 py-1 text-[11px] font-medium text-ink-2',
                `transition-colors duration-300 ${EASE} hover:bg-glass-2 hover:text-ink`,
              )}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* ------------------------------------------------ 底部元信息 */}
      {/* 撑开剩余空间：保证底部信息栏始终贴底，且与上方标签至少留 20px */}
      <div className="min-h-5 flex-1" aria-hidden="true" />

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
        <div className="flex items-center gap-0.5">
          {/* 点赞 */}
          <button
            type="button"
            onClick={like.like}
            disabled={like.pending}
            aria-pressed={like.liked}
            title={like.failed ? '点赞失败，请稍后重试' : '点赞'}
            className={cn(
              'press flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5',
              'text-[12px] font-medium',
              `transition-colors duration-300 ${EASE}`,
              'disabled:cursor-wait disabled:opacity-60',
              like.liked ? 'text-danger' : 'text-ink-2 hover:bg-glass hover:text-danger',
            )}
          >
            <Heart
              className={cn(
                'h-4 w-4 transition-transform duration-300',
                like.liked && 'scale-110 fill-current',
              )}
              aria-hidden="true"
            />
            <span className="font-mono">{formatCount(build.likes_count)}</span>
          </button>

          {/* 复制次数（只读展示） */}
          <span
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-ink-2"
            title="改枪码被复制的次数"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">{formatCount(build.copies_count)}</span>
          </span>

          {/* 评论数 —— 点击进入详情页评论区 */}
          <Link
            to={detailPath}
            className={cn(
              'press flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5',
              'text-[12px] font-medium text-ink-2',
              `transition-colors duration-300 ${EASE} hover:bg-glass hover:text-ink`,
            )}
            title="查看评论"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">{formatCount(build.comments_count)}</span>
          </Link>
        </div>

        <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-3">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatRelativeTime(build.created_at)}
        </span>
      </div>
    </article>
  );
}
