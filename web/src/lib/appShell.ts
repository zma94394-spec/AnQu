import { createContext, useContext } from 'react';

import type { CategoryDTO, GunDTO } from '../types/api';

/**
 * 全局轻提示。
 * 带 `action` 的提示停留更久（见 App 的定时器），否则用户来不及读完再点。
 */
export interface Notice {
  text: string;
  action?: { label: string; onClick: () => void };
}

/**
 * 布局外壳提供的共享能力。
 *
 * 为什么不直接用 props 传：
 *   Header（发布按钮、通知）、HomePage（分类字典、通知）、BuildDetailPage（通知）
 *   三个位置的组件都需要这些能力，逐层透传会污染所有中间组件的 props 签名。
 *   这里用 context 收敛，代价是组件与外壳产生了隐式耦合 ——
 *   因此 `useAppShell` 在脱离外壳使用时会直接抛错，而不是静默返回空值。
 */
export interface AppShellValue {
  guns: GunDTO[];
  categories: CategoryDTO[];
  /**
   * 数据版本号。发布新方案后由外壳自增，列表页据此强制重取 ——
   * 因为新方案可能不改变任何 URL 参数（例如当前就是"全部 + 最新"），
   * 光靠 URL 变化触发不了重新请求。
   */
  dataVersion: number;
  notify: (notice: Notice) => void;
  openPublish: () => void;
  /**
   * 打开登录弹窗。
   * 暴露给评论区使用：未登录时应当直接给出"登录后发表评论"的入口，
   * 而不是让用户填完再被 401 打回来。
   */
  openAuth: () => void;
}

export const AppShellContext = createContext<AppShellValue | null>(null);

export function useAppShell(): AppShellValue {
  const value = useContext(AppShellContext);
  if (!value) {
    throw new Error('useAppShell 必须在 <App> 渲染树内使用');
  }
  return value;
}
