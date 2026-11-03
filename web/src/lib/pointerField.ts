/**
 * 指针场（pointer field）—— 鼠标移动驱动的**背景**响应。
 *
 * 为什么不是 canvas / 粒子系统：需求同时要求"视觉冲击力"和"低 CPU/GPU 占用"。
 * 这两者只有在**把每帧的工作量压到零 JS**时才同时成立，所以这里只做一件事：
 * 把指针位置写成两个 CSS 自定义属性，位移交给合成器（transform）。
 *
 * 三条硬性省电规则（都有对应的浏览器测试，见 web/e2e-ui001）：
 *   1. 只在"指针刚动过"的那段时间里跑 rAF；静止超过 idleMs 自动停表；
 *   2. 标签页不可见（`document.hidden`）时立刻停表，回来再随指针重启；
 *   3. `prefers-reduced-motion: reduce` 时**根本不注册**监听器，背景保持静止。
 *
 * 这里刻意不经过 React state：一次 mousemove 一次 setState 会把整棵树重渲染，
 * 那是这个组件唯一真正要避免的事情。
 */

const DEFAULTS = {
  /** 指针停止移动多久之后彻底停表（ms） */
  idleMs: 1500,
  /** 追随的平滑系数：越小越"黏"，越大越贴手 */
  ease: 0.09,
  /** 单帧内目标与当前的差小于该值就认为已到位（归一化坐标） */
  epsilon: 0.0008,
};

const reducedMotionQuery = () =>
  typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * 把指针场挂到 `el` 上：写 `--px` / `--py`（-1..1，中心为 0）与 `--pf-active`（0/1）。
 * 返回一个卸载函数（幂等，可重复调用）。
 */
export function attachPointerField(
  el: HTMLElement,
  options: Partial<typeof DEFAULTS> = {},
): () => void {
  const { idleMs, ease, epsilon } = { ...DEFAULTS, ...options };
  const motion = reducedMotionQuery();

  const write = (px: number, py: number, active: 0 | 1) => {
    el.style.setProperty('--px', px.toFixed(4));
    el.style.setProperty('--py', py.toFixed(4));
    el.style.setProperty('--pf-active', String(active));
  };

  /**
   * 跑帧计数挂在 data-* 上，是为了让测试能**归因**：
   * 页面里还有别人用 rAF，全局计数说明不了这块背景有没有在偷跑。
   */
  const countFrame = () => {
    el.dataset.pfFrames = String(Number(el.dataset.pfFrames || '0') + 1);
  };

  // 无障碍/省电：系统要求减少动效 ⇒ 一次监听都不挂，背景停在中心位置。
  if (motion?.matches) {
    write(0, 0, 0);
    return () => {};
  }

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let raf = 0;
  let idleTimer = 0;
  let stopped = true;
  let destroyed = false;

  const normalize = (event: PointerEvent) => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    targetX = (event.clientX / w) * 2 - 1;
    targetY = (event.clientY / h) * 2 - 1;
  };

  const tick = () => {
    if (destroyed) return;
    countFrame();
    const dx = targetX - currentX;
    const dy = targetY - currentY;
    currentX += dx * ease;
    currentY += dy * ease;
    const settled = Math.abs(dx) < epsilon && Math.abs(dy) < epsilon;
    write(currentX, currentY, 1);
    if (settled) {
      // 到位后不续帧：等下一次移动或 idle 计时结束再停表
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  /**
   * 所有"想开始刷帧"的路径都必须经过这里 ⇒ "不可见就不刷"只有一条落点。
   * 之前这条规则只写在 `onMove` 里，`pointerout` → `onLeave` → `wake()` 那条腿绕过了它，
   * 于是标签页隐藏时一次鼠标移出就能把 rAF 重新点着（浏览器实测：帧计数从 159 涨到 235）。
   */
  const wake = () => {
    if (destroyed || stopped || document.hidden) return;
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const onMove = (event: PointerEvent) => {
    normalize(event);
    wake();
    window.clearTimeout(idleTimer);
    // 静止 idleMs 后把 --pf-active 归零：CSS 侧把光斑淡回原位，JS 侧彻底不跑帧。
    idleTimer = window.setTimeout(() => {
      if (destroyed) return;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      el.style.setProperty('--pf-active', '0');
    }, idleMs);
  };

  const onVisibility = () => {
    if (document.hidden) {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      el.style.setProperty('--pf-active', '0');
    }
  };

  const onLeave = () => {
    targetX = 0;
    targetY = 0;
    wake();
  };

  write(0, 0, 0);
  stopped = false;
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerout', onLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    if (destroyed) return;
    destroyed = true;
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    window.clearTimeout(idleTimer);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerout', onLeave);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
