/**
 * 极简 className 拼接。
 * 不引入 clsx / tailwind-merge 这类额外依赖 —— 本项目的类名冲突场景很少，
 * 多一个依赖不如少一个。
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
