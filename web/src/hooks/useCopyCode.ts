import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { copyBuild, isPreviewReadOnly, notifyPreviewBlocked } from '../lib/apiPublic';
import { isCopyableCode } from '../lib/buildCode';
import { writeToClipboard } from '../lib/clipboard';

/** "已复制！" 反馈的保持时长（毫秒），与需求规格一致 */
export const COPY_FEEDBACK_MS = 2000;

export type CopyState = 'idle' | 'copied' | 'failed';

export interface UseCopyCodeParams {
  buildId: string;
  code: string;
  onPatch: (id: string, patch: { copies_count: number }) => void;
}

export interface UseCopyCodeResult {
  state: CopyState;
  copy: () => Promise<void>;
  /** 按钮文案，随状态变化 */
  label: string;
  /**
   * 这串码能不能复制。`false` 时 UI 必须禁用按钮 ——
   * 一条格式不完整的码复制出去，用户在游戏内只会得到一次失败。
   */
  canCopy: boolean;
}

/**
 * 改枪码复制交互。
 *
 * 抽成 hook 是因为列表卡片和详情页都需要它，而这段逻辑里有几处**不显眼但必须一致**的细节：
 *  1. 剪贴板写入要带非安全上下文降级（见 lib/clipboard.ts）；
 *  2. 计数上报失败**不能**把成功态改成失败态 —— 复制已经成功了；
 *  3. 2 秒后复位状态，且定时器必须在卸载时清掉，否则会对已卸载组件 setState。
 * 三处任一在某个副本里漏掉，就会变成"卡片上能复制、详情页上不能"这类难查的问题。
 */
export function useCopyCode({
  buildId,
  code,
  onPatch,
}: UseCopyCodeParams): UseCopyCodeResult {
  const [state, setState] = useState<CopyState>('idle');
  const timerRef = useRef<number | null>(null);
  const canCopy = useMemo(() => isCopyableCode(code), [code]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(async () => {
    // UI 已经禁用了按钮，这里是第二道：键盘触发或状态竞态下也不能写剪贴板。
    // 判据与提交侧共用 `lib/buildCode.ts`，不存在"这里放行、那里报错"。
    if (!canCopy) return;

    if (isPreviewReadOnly()) {
      notifyPreviewBlocked('复制改枪码');
      return;
    }

    // 原样写入：不 trim、不大小写转换、不裁剪前缀 —— 复制出去的必须与库里那串逐字符相同。
    const ok = await writeToClipboard(code);

    if (!ok) {
      // 剪贴板没写进去 ⇒ 这次复制**没有发生**，所以一次都不许上报。
      setState('failed');
    } else {
      setState('copied');

      // 计数上报属于「尽力而为」：复制本身已经成功，
      // 不能因为计数接口失败就把成功态改成失败态去误导用户。
      try {
        const result = await copyBuild(buildId);
        onPatch(buildId, { copies_count: result.copies_count });
      } catch {
        /*
         * 上报失败时**不动页面上的数字**。
         *
         * 之前这里写的是"本地先 +1"，理由是"视觉反馈不倒退"。但那等于在屏幕上
         * 显示一个服务端从未接受的计数 —— 页面报的是"站内统计"，而后端没变，
         * 这就是 UI-014 STEP 4 禁止的"假复制量"，哪怕只活一次刷新。
         * 复制成功的反馈由 state='copied' 独立承担，不需要借数字来说话。
         */
      }
    }

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setState('idle'), COPY_FEEDBACK_MS);
  }, [buildId, canCopy, code, onPatch]);

  const label =
    state === 'copied' ? '已复制！' : state === 'failed' ? '复制失败' : '复制改枪码';

  return { state, copy, label, canCopy };
}
