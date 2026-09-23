import { useCallback, useEffect, useRef, useState } from 'react';

import { copyBuild } from '../lib/api';
import { writeToClipboard } from '../lib/clipboard';

/** "已复制！" 反馈的保持时长（毫秒），与需求规格一致 */
export const COPY_FEEDBACK_MS = 2000;

export type CopyState = 'idle' | 'copied' | 'failed';

export interface UseCopyCodeParams {
  buildId: string;
  code: string;
  /** 当前复制数，用于接口失败时本地兜底 +1 */
  copiesCount: number;
  onPatch: (id: string, patch: { copies_count: number }) => void;
}

export interface UseCopyCodeResult {
  state: CopyState;
  copy: () => Promise<void>;
  /** 按钮文案，随状态变化 */
  label: string;
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
  copiesCount,
  onPatch,
}: UseCopyCodeParams): UseCopyCodeResult {
  const [state, setState] = useState<CopyState>('idle');
  const timerRef = useRef<number | null>(null);

  // 用 ref 持有最新计数，避免把 copiesCount 写进 useCallback 依赖后
  // 每次计数变化都重建回调
  const copiesRef = useRef(copiesCount);
  copiesRef.current = copiesCount;

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(async () => {
    const ok = await writeToClipboard(code);

    if (!ok) {
      setState('failed');
    } else {
      setState('copied');

      // 计数上报属于「尽力而为」：复制本身已经成功，
      // 不能因为计数接口失败就把成功态改成失败态去误导用户。
      try {
        const result = await copyBuild(buildId);
        onPatch(buildId, { copies_count: result.copies_count });
      } catch {
        // 接口失败时本地先 +1，保证视觉反馈不倒退
        onPatch(buildId, { copies_count: copiesRef.current + 1 });
      }
    }

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setState('idle'), COPY_FEEDBACK_MS);
  }, [buildId, code, onPatch]);

  const label =
    state === 'copied' ? '已复制！' : state === 'failed' ? '复制失败' : '复制改枪码';

  return { state, copy, label };
}
