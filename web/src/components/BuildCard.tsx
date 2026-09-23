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
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      className={cn(
        'group animate-rise-in relative flex h-full flex-col',
        'clip-tactical border border-line bg-surface/70 backdrop-blur-sm',
        'transition-all duration-200',
        'hover:border-tactical/45 hover:bg-surface hover:shadow-[0_10px_36px_-14px_rgba(245,158,11,0.4)]',
      )}
    >
      {/* 左侧战术色装饰条 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-tactical via-tactical/40 to-transparent"
      />

      {/* ------------------------------------------------ 头部 */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* 枪械名称 badge */}
          <span
            className={cn(
              'rounded border border-tactical/45 bg-tactical/12 px-2 py-0.5',
              'font-mono text-xs font-bold tracking-wide text-tactical',
            )}
          >
            {build.gun.name}
          </span>

          {/* 适用平台 */}
          <span
            className={cn(
              'flex items-center gap-1 rounded border border-line bg-raised/80 px-1.5 py-0.5',
              'text-[10px] font-semibold text-muted',
            )}
          >
            <PlatformIcon className="h-3 w-3" aria-hidden="true" />
            {PLATFORM_LABEL[build.platform] ?? build.platform}
          </span>
        </div>

        {/* 预估造价 */}
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm font-bold text-tactical">
            ~{formatCoins(build.estimated_cost)}
          </div>
          <div className="mt-0.5 text-[10px] text-dim">预估造价</div>
        </div>
      </div>

      {/* ------------------------------------------------ 标题与说明 */}
      <h3 className="px-4 pt-3 text-[15px] font-bold leading-snug">
        <Link
          to={detailPath}
          className="text-ink transition-colors hover:text-tactical focus-visible:text-tactical"
        >
          {build.title}
        </Link>
      </h3>

      {build.description && (
        <p className="line-clamp-2 whitespace-pre-line px-4 pt-1.5 text-xs leading-relaxed text-muted">
          {build.description}
        </p>
      )}

      {/* ------------------------------------------------ 改枪码核心交互区 */}
      <div className="px-4 pt-3.5">
        <div className="flex items-stretch gap-2 rounded-lg border border-line bg-void/75 p-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
              <Terminal className="h-3 w-3" aria-hidden="true" />
              改枪码
              <span className="ml-auto font-mono normal-case tracking-normal">
                {build.code.length} 位
              </span>
            </div>

            {/* select-all：即使复制按钮不可用，用户也能一次点选整串码手动复制 */}
            <code
              title={build.code}
              className="mt-1 block select-all truncate font-mono text-[13px] leading-5 text-ink"
            >
              {build.code}
            </code>
          </div>

          <button
            type="button"
            onClick={copy.copy}
            className={cn(
              'flex shrink-0 flex-col items-center justify-center gap-1 rounded-md px-3 py-2',
              'text-xs font-bold transition-colors duration-150',
              copy.state === 'copied' && 'animate-copy-pop bg-signal text-void',
              copy.state === 'failed' && 'bg-danger text-ink',
              copy.state === 'idle' && 'bg-tactical text-void hover:bg-tactical-deep hover:text-ink',
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
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {build.tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                'rounded-full border border-line bg-raised/60 px-2 py-0.5',
                'text-[11px] font-medium text-muted transition-colors',
                'hover:border-tactical/40 hover:text-tactical',
              )}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* ------------------------------------------------ 底部元信息 */}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line/70 px-4 py-3">
        <div className="flex items-center gap-1">
          {/* 点赞 */}
          <button
            type="button"
            onClick={like.like}
            disabled={like.pending}
            aria-pressed={like.liked}
            title={like.failed ? '点赞失败，请稍后重试' : '点赞'}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold',
              'transition-colors duration-150 disabled:cursor-wait disabled:opacity-60',
              like.liked ? 'text-danger' : 'text-muted hover:bg-raised hover:text-danger',
            )}
          >
            <Heart
              className={cn('h-4 w-4 transition-transform', like.liked && 'scale-110 fill-current')}
              aria-hidden="true"
            />
            <span className="font-mono">{formatCount(build.likes_count)}</span>
          </button>

          {/* 复制次数（只读展示） */}
          <span
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted"
            title="改枪码被复制的次数"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">{formatCount(build.copies_count)}</span>
          </span>

          {/* 评论数 —— 点击进入详情页评论区 */}
          <Link
            to={detailPath}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-raised hover:text-ink"
            title="查看评论"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">{formatCount(build.comments_count)}</span>
          </Link>
        </div>

        <span className="flex shrink-0 items-center gap-1 text-[11px] text-dim">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatRelativeTime(build.created_at)}
        </span>
      </div>
    </article>
  );
}
