import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../lib/cn';

const EASE = 'ease-[cubic-bezier(0.25,1,0.5,1)]';

export interface ModalShellProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** 提交中：禁止 Esc / 点遮罩 / 点关闭按钮关闭，避免中途丢掉用户输入 */
  busy?: boolean;
  onClose: () => void;
  /** 是否自动聚焦内容区第一个可聚焦元素 */
  autoFocusFirst?: boolean;
  maxWidthClass?: string;
  /** 内容区最大高度，留出页头页脚空间 */
  bodyMaxHeightClass?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** 暴露面板 ref，便于调用方做字段级聚焦 */
  panelRef?: RefObject<HTMLDivElement>;
  /** dialog = 居中弹窗；drawer = 右侧抽屉。两者共用同一套焦点/滚动逻辑。 */
  variant?: 'dialog' | 'drawer';
}

/**
 * 弹窗外壳。
 *
 * 抽出来的理由：Esc 关闭、背景滚动锁定、焦点陷阱、遮罩点击关闭这几件事
 * **必须处处一致** —— 任何一处漏掉，键盘用户就会 Tab 到背景页面上去，
 * 模态语义直接破掉。复制两份必然漂移，所以收敛到这里。
 *
 * UI-003 只换了视觉层（直角 + 冷光角标 + 更沉的玻璃），
 * 下面两个 useEffect 里的可访问性逻辑一行未动：
 * 滚动锁定与还原、首字段聚焦只在**内容区**里找、Tab 环形焦点陷阱、
 * `busy` 时禁止一切关闭、点遮罩才关（从面板内拖出去不误关）。
 */
export function ModalShell({
  title,
  description,
  icon: Icon,
  busy = false,
  onClose,
  autoFocusFirst = true,
  maxWidthClass = 'max-w-2xl',
  bodyMaxHeightClass = 'max-h-[calc(100dvh-15rem)]',
  children,
  footer,
  panelRef,
  variant = 'dialog',
}: ModalShellProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const resolvedPanelRef = panelRef ?? innerRef;

  /* ------------------------------------------------ 滚动锁定 + 首字段聚焦 */
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (autoFocusFirst) {
      // 只在**内容区**里找第一个可聚焦元素 —— 若在整个面板里找，
      // 会聚焦到页头的关闭按钮，用户一打开弹窗就得先 Tab 一遍才能输入
      bodyRef.current
        ?.querySelector<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
        )
        ?.focus();
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [autoFocusFirst]);

  /* ------------------------------------------------ Esc + 焦点陷阱 */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !resolvedPanelRef.current) return;

      const focusables = resolvedPanelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      // 循环到边界时回到另一端，把焦点圈在弹窗内
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose, resolvedPanelRef]);

  const drawer = variant === 'drawer';

  return (
    <div
      className={cn(
        'animate-fade-in fixed inset-0 z-50 flex',
        'bg-black/45 backdrop-blur-sm',
        drawer ? 'justify-end' : 'items-start justify-center overflow-y-auto p-4 sm:items-center',
      )}
      onMouseDown={(event) => {
        // 只有点击遮罩本身才关闭；从面板内拖拽到遮罩上不应误关
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={resolvedPanelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'glass-strong relative flex flex-col',
          drawer
            ? 'animate-drawer-in h-dvh w-full max-w-[520px] border-l border-hairline shadow-[-24px_0_60px_-24px_rgb(0_0_0/_0.8)]'
            : cn('animate-modal-in w-full rounded-hud shadow-[0_32px_90px_-20px_rgb(0_0_0/_0.85)]', maxWidthClass),
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-start justify-between gap-4 border-b border-hairline',
            drawer ? 'px-6 py-5' : 'border-b-0 px-6 pb-4 pt-6',
          )}
        >
          <div className="min-w-0">
            <h2
              id="modal-title"
              className="flex items-center gap-2.5 text-[19px] font-semibold tracking-[-0.02em] text-ink"
            >
              {Icon && (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-hud border border-hairline bg-accent/[0.06]">
                  <Icon className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden="true" />
                </span>
              )}
              {title}
            </h2>
            {description && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
            className={cn(
              'press grid h-8 w-8 shrink-0 place-items-center rounded-hud',
              'border border-hairline bg-transparent text-ink-2',
              `transition-colors duration-200 ${EASE}`,
              'hover:border-accent-line hover:text-ink disabled:opacity-40',
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div
          ref={bodyRef}
          className={cn(
            'space-y-4 overflow-y-auto px-6',
            drawer ? 'flex-1 py-5' : cn('pb-5', bodyMaxHeightClass),
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-hairline px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
