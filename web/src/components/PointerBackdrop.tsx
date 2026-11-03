import { useEffect, useRef } from 'react';

import { attachPointerField } from '../lib/pointerField';
import '../styles/pointer-backdrop.css';

/**
 * 鼠标互动的背景层（UI-001）。
 *
 * 挂在应用外壳最底下：`position: fixed` + `z-index: -1`，所以它一定在内容之下、
 * 在黑底之上；`pointer-events: none` 保证它永远不吃点击。
 * 每帧成本见 `lib/pointerField.ts` 的三条停表规则；样式侧只做 transform/opacity。
 */
export function PointerBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachPointerField(el);
  }, []);

  return (
    <div ref={ref} className="ui001-field" aria-hidden="true">
      <div className="ui001-glow ui001-glow--accent" />
      <div className="ui001-glow ui001-glow--cool" />
      <div className="ui001-grid" />
    </div>
  );
}
