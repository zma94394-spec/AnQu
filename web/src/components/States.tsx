import { AlertTriangle, PackageOpen, RefreshCw } from 'lucide-react';

import { cn } from '../lib/cn';

/* ============================================================================
 *  列表页的三种非正常态：加载中 / 空结果 / 请求失败
 *  抽成独立组件而不是内联在 App 里，是为了让 App 只负责状态编排。
 * ========================================================================== */

/** 骨架屏。结构刻意与 BuildCard 对齐，避免加载完成时发生大幅跳动 */
export function BuildCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
      className="clip-tactical animate-rise-in flex h-full flex-col border border-line bg-surface/50 p-4"
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          <div className="skeleton h-5 w-14 rounded" />
          <div className="skeleton h-5 w-16 rounded" />
        </div>
        <div className="skeleton h-5 w-24 rounded" />
      </div>

      <div className="skeleton mt-3.5 h-4 w-4/5 rounded" />
      <div className="skeleton mt-2 h-3 w-full rounded" />
      <div className="skeleton mt-1.5 h-3 w-2/3 rounded" />

      <div className="mt-3.5 flex items-stretch gap-2 rounded-lg border border-line bg-void/60 p-2">
        <div className="flex-1 space-y-2 py-0.5">
          <div className="skeleton h-2.5 w-16 rounded" />
          <div className="skeleton h-3.5 w-3/4 rounded" />
        </div>
        <div className="skeleton w-[86px] rounded-md" />
      </div>

      <div className="mt-3 flex gap-1.5">
        <div className="skeleton h-5 w-14 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-line/70 pt-3">
        <div className="skeleton h-4 w-28 rounded" />
        <div className="skeleton h-4 w-16 rounded" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- 空态 */

export interface EmptyStateProps {
  /** 有筛选条件时的文案要引导用户放宽条件，而不是让他以为库里没数据 */
  hasActiveFilter: boolean;
  onReset: () => void;
}

export function EmptyState({ hasActiveFilter, onReset }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'clip-tactical col-span-full flex flex-col items-center justify-center',
        'border border-dashed border-line bg-surface/40 px-6 py-16 text-center',
      )}
    >
      <PackageOpen className="h-10 w-10 text-dim" strokeWidth={1.5} aria-hidden="true" />
      <p className="mt-4 text-sm font-semibold text-ink">
        {hasActiveFilter ? '没有符合条件的改枪方案' : '枪械库还空着'}
      </p>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
        {hasActiveFilter
          ? '试着换个枪械分类、切换平台，或者把搜索关键字放宽一些。'
          : '成为第一个分享改枪码的先锋 —— 点击右上角「发布方案」提交你的配置。'}
      </p>
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onReset}
          className={cn(
            'mt-5 rounded-md border border-tactical/50 bg-tactical/10 px-3.5 py-1.5',
            'text-xs font-bold text-tactical transition-colors hover:bg-tactical/20',
          )}
        >
          重置全部筛选
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- 错误态 */

export interface ErrorStateProps {
  message: string;
  code: string | null;
  onRetry: () => void;
}

export function ErrorState({ message, code, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'clip-tactical col-span-full flex flex-col items-center justify-center',
        'border border-danger/35 bg-danger/8 px-6 py-16 text-center',
      )}
    >
      <AlertTriangle className="h-10 w-10 text-danger" strokeWidth={1.5} aria-hidden="true" />
      <p className="mt-4 text-sm font-semibold text-ink">方案列表加载失败</p>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted">{message}</p>

      {code && (
        <code className="mt-3 rounded border border-line bg-void/70 px-2 py-1 font-mono text-[11px] text-dim">
          {code}
        </code>
      )}

      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'mt-5 flex items-center gap-1.5 rounded-md bg-tactical px-3.5 py-1.5',
          'text-xs font-bold text-void transition-colors hover:bg-tactical-deep hover:text-ink',
        )}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        重新加载
      </button>
    </div>
  );
}
