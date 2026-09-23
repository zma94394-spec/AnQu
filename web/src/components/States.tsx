import { AlertTriangle, PackageOpen, RefreshCw } from 'lucide-react';

import { cn } from '../lib/cn';

/* ============================================================================
 *  列表页的三种非正常态：加载中 / 空结果 / 请求失败
 *  抽成独立组件而不是内联在 App 里，是为了让 App 只负责状态编排。
 * ========================================================================== */

const EASE = 'ease-[cubic-bezier(0.25,1,0.5,1)]';

/** 骨架屏。结构刻意与 BuildCard 对齐，避免加载完成时发生大幅跳动 */
export function BuildCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div
      style={{ animationDelay: `${Math.min(index, 6) * 65}ms` }}
      className="animate-rise-in flex h-full flex-col rounded-card border border-hairline bg-glass p-5"
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          <div className="skeleton h-6 w-16 rounded-[9px]" />
          <div className="skeleton h-6 w-16 rounded-[9px]" />
        </div>
        <div className="skeleton h-6 w-24 rounded-[9px]" />
      </div>

      <div className="skeleton mt-4 h-[18px] w-4/5 rounded-md" />
      <div className="skeleton mt-2.5 h-3 w-full rounded" />
      <div className="skeleton mt-2 h-3 w-2/3 rounded" />

      <div className="mt-4 flex items-stretch gap-2 rounded-panel bg-black/25 p-2.5">
        <div className="flex-1 space-y-2 py-0.5">
          <div className="skeleton h-2.5 w-16 rounded" />
          <div className="skeleton h-3.5 w-3/4 rounded" />
        </div>
        <div className="skeleton w-[92px] rounded-control" />
      </div>

      <div className="mt-3.5 flex gap-1.5">
        <div className="skeleton h-6 w-16 rounded-chip" />
        <div className="skeleton h-6 w-20 rounded-chip" />
        <div className="skeleton h-6 w-16 rounded-chip" />
      </div>

      <div className="min-h-5 flex-1" />
      <div className="flex items-center justify-between border-t border-hairline pt-4">
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
        'animate-rise-in col-span-full flex flex-col items-center justify-center',
        'rounded-card border border-dashed border-hairline bg-glass/60 px-6 py-20 text-center',
      )}
    >
      <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-glass">
        <PackageOpen className="h-8 w-8 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p className="mt-5 text-[17px] font-semibold tracking-[-0.022em] text-ink">
        {hasActiveFilter ? '没有符合条件的改枪方案' : '枪械库还空着'}
      </p>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-2">
        {hasActiveFilter
          ? '试着换个枪械分类、切换平台，或者把搜索关键字放宽一些。'
          : '成为第一个分享改枪码的先锋 —— 点击右上角「发布方案」提交你的配置。'}
      </p>
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onReset}
          className={cn(
            'press mt-6 rounded-chip bg-glass px-4 py-2 text-[13px] font-semibold text-ink',
            `transition-all duration-300 ${EASE} hover:bg-glass-2`,
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
        'animate-rise-in col-span-full flex flex-col items-center justify-center',
        'rounded-card border border-danger/30 bg-danger/8 px-6 py-20 text-center',
      )}
    >
      <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-danger/14">
        <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p className="mt-5 text-[17px] font-semibold tracking-[-0.022em] text-ink">
        方案列表加载失败
      </p>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">{message}</p>

      {code && (
        <code className="mt-4 rounded-[10px] bg-black/40 px-3 py-1.5 font-mono text-[11px] text-ink-3">
          {code}
        </code>
      )}

      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'press mt-6 flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2',
          'text-[13px] font-semibold text-black',
          `transition-all duration-300 ${EASE} hover:bg-accent-2`,
        )}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        重新加载
      </button>
    </div>
  );
}
