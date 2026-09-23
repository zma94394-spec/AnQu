/* ============================================================================
 *  展示层格式化工具
 *  统一数字与时间的呈现口径，避免每个组件各写一套 toLocaleString。
 * ========================================================================== */

/** `120000` -> `"120,000"` */
export function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN');
}

/** 造价主展示：`120000` -> `"120,000 柯恩币"` */
export function formatCoins(value: number): string {
  return `${formatNumber(value)} 柯恩币`;
}

/**
 * 造价紧凑展示：`120000` -> `"12 万"`，`28000` -> `"2.8 万"`。
 * 用于卡片角标这类空间受限的位置。
 */
export function formatCoinsCompact(value: number): string {
  if (value < 10_000) return formatNumber(value);
  const wan = value / 10_000;
  // 整数万不显示小数位，避免 "12.0 万" 这种冗余精度
  return `${Number.isInteger(wan) ? wan : wan.toFixed(1)} 万`;
}

/** 互动计数紧凑展示：`1105` -> `"1.1k"`，`45231` -> `"4.5w"` */
export function formatCount(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${(value / 10_000).toFixed(1)}w`;
}

/**
 * 相对时间。后端返回 ISO 字符串，此处做容错：
 * 非法输入返回空串而不是 "NaN 天前"。
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  // 用 max(0) 兜住"客户端时钟快于服务端"导致的负数差值
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return '刚刚';

  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;

  return `${Math.floor(months / 12)} 年前`;
}

/** 平台英文枚举 -> 中文展示名 */
export const PLATFORM_LABEL: Record<string, string> = {
  mobile: '手游',
  pc: 'PC端游',
  both: '全平台',
};
