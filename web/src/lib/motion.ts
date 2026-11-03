/**
 * ============================================================================
 *  动效偏好与指针空间
 *
 *  两条不可妥协的原则，都是为了性能：
 *   1. `pointermove` 里**绝不调用 setState** —— 那会让整棵组件树每帧重渲染。
 *      这里只往元素上写 CSS 自定义属性，把定位交给合成层。
 *   2. **静止即停表** —— 插值收敛到目标后就关掉 rAF，下次指针移动再启动。
 *      一个永不停歇的 rAF 循环会在用户什么都不做时持续吃 CPU 和电。
 * ============================================================================
 */

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * 指针归一化坐标（0~1），模块级单例。
 *
 * 为什么不用 context / state：消费方是 canvas 绘制循环与若干纯装饰层，
 * 它们每帧读一次即可，走 React 状态只会带来无谓的重渲染。
 * 未启用指针跟踪时保持 0.5（画面正中）。
 */
export const pointer = { x: 0.5, y: 0.5 };

/** 每帧向目标插值的比例。0.06 ≈ 视觉上的"空气阻力"；1 就是鼠标拖影 */
const LERP = 0.06;
/** 小于这个差值就认为已经到位，停表 */
const EPSILON = 0.0004;

/** 订阅一个媒体查询，值变化时重渲染 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    // SSR / 老浏览器没有 matchMedia，按"不做动效"的保守分支处理
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** 用户是否要求减少动效。开启时空间效果全部退化为静态 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * 是否是"鼠标这类可精确悬停的指针"。
 *
 * 触屏上不做跟随光效：手指按下时目标点就在指尖，光斑从屏幕外飞入的
 * 滞后感只会被读成"卡顿"，而且手指抬起后再没有连续位置可跟。
 */
export function useFinePointer(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)');
}

/**
 * 把指针位置写到目标元素的 `--px` / `--py`（0~1），并同步到 `pointer` 单例。
 *
 * 用法：把返回的 ref 挂到容器上，容器内的装饰层即可用
 * `left: calc(var(--px, .5) * 100%)` 定位，无需任何 JS 参与布局。
 */
export function usePointerSpace<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  const reduced = usePrefersReducedMotion();
  const fine = useFinePointer();
  const disabled = reduced || !fine;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    let raf = 0;
    let targetX = pointer.x;
    let targetY = pointer.y;

    const write = () => {
      el.style.setProperty('--px', pointer.x.toFixed(4));
      el.style.setProperty('--py', pointer.y.toFixed(4));
    };

    const tick = () => {
      const dx = targetX - pointer.x;
      const dy = targetY - pointer.y;

      if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
        pointer.x = targetX;
        pointer.y = targetY;
        write();
        raf = 0;
        return;
      }

      pointer.x += dx * LERP;
      pointer.y += dy * LERP;
      write();
      raf = requestAnimationFrame(tick);
    };

    /** 循环没在跑才启动；正在跑时只更新 target 即可 */
    const start = () => {
      if (document.hidden || raf) return;
      raf = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      // 元素被滚出视口时宽高可能为 0，除零会得到 Infinity 并污染所有 calc()
      if (rect.width === 0 || rect.height === 0) return;
      targetX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      targetY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      start();
    };

    // 切到后台时停表，回来再继续 —— 后台标签页不该继续消耗帧
    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else {
        start();
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    write();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [disabled]);

  return ref;
}
