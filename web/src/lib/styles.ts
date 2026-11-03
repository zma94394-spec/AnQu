import { cn } from './cn';

/** Apple 的过渡曲线，全站统一，避免各处缓动不一致 */
export const EASE = 'ease-[cubic-bezier(0.25,1,0.5,1)]';

/**
 * 空间曲线。起步更快、收尾更长更缓，用于 Hero 这类大范围位移。
 * 小交互仍用 `EASE` —— 大范围用快曲线会显得突兀，小范围用慢曲线会显得迟钝。
 */
export const EASE_SPATIAL = 'ease-spatial';

/**
 * iOS 风格输入框。
 *
 * 特征：胶囊/大圆角、**内嵌填充而非描边**（Apple 的输入框在深色模式下是
 * 一块比背景略暗的实心区域），聚焦时描边才亮起。
 */
export function inputClass(invalid = false): string {
  return cn(
    'w-full rounded-control border bg-void/80 px-3.5 py-2.5',
    'text-[14px] text-ink placeholder:text-ink-3',
    `transition-colors duration-200 ${EASE}`,
    'focus:outline-none',
    invalid
      ? 'border-danger/60 focus:border-danger'
      : 'border-hairline hover:border-hairline-2 focus:border-accent-line focus:bg-void',
  );
}

/** 表单字段标签 */
export const FIELD_LABEL_CLASS = 'mb-2 block text-[13px] font-medium text-ink-2';

/** 主行动按钮（强调色实心） */
export function primaryButtonClass(extra?: string): string {
  return cn(
    'press flex items-center gap-1.5 rounded-control border border-transparent bg-accent px-4 py-2',
    'text-[13px] font-semibold text-[#0d1217]',
    `transition-colors duration-200 ${EASE}`,
    'hover:bg-accent-2',
    'disabled:cursor-wait disabled:opacity-60',
    extra,
  );
}

/** 次要按钮（描边） */
export function secondaryButtonClass(extra?: string): string {
  return cn(
    'press rounded-control border border-hairline-2 bg-transparent px-4 py-2 text-[13px] font-medium text-ink-2',
    `transition-colors duration-200 ${EASE} hover:border-accent-line hover:text-ink`,
    'disabled:opacity-40',
    extra,
  );
}
