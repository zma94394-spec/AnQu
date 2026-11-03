/**
 * ============================================================================
 *  UI-001 HUD 动效预设
 * ============================================================================
 *
 * 集中放 framer-motion 的曲线与变体，理由和 `styles.ts` 里的 `EASE` 一样：
 * 缓动一旦各处不一致，页面就会读成"很多个组件各自在动"而不是"一个空间在呼吸"。
 *
 * ⚠️ 所有无限循环的**装饰**动画仍走 CSS keyframes（见 index.css）——
 * 它们不需要进 React 渲染循环，交给合成层更便宜。
 * framer-motion 只用在这里真正需要"进入视口后编排一次"的入场。
 */

import type { Transition, Variants } from 'framer-motion';

/** 与 `--ease-hud` 同一条曲线，供 JS 侧使用 */
export const EASE_HUD: [number, number, number, number] = [0.2, 0.9, 0.15, 1];

/** 空间曲线，与 `--ease-spatial` 对齐；大范围位移用它收尾更缓 */
export const EASE_SPATIAL: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const transitionHud: Transition = { duration: 0.7, ease: EASE_HUD };
export const transitionSpatial: Transition = { duration: 0.9, ease: EASE_SPATIAL };

/**
 * 自下而上 + 轻微模糊汇聚。
 *
 * `filter: blur` 只在入场那不到 1 秒里存在，结束后归零 ——
 * 常驻的 filter 会让元素脱离合成层，滚动时代价很高。
 */
export const riseConverge: Variants = {
  hidden: { opacity: 0, y: 22, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: transitionSpatial,
  },
};

/** 从左侧推入，用于角标、刻度条这类"仪器"元素 */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -18 },
  show: { opacity: 1, x: 0, transition: transitionHud },
};

/**
 * 主字标专用：开机时字距从松散收拢到设定值，配合去模糊。
 *
 * ⚠️ 收拢后的 `letterSpacing` 必须和静态 class 里的值一致（0.06em），
 * 否则动画结束的一瞬间字距会跳一下。
 * 这条效果**只在 framer-motion 里做**，不要再叠 CSS keyframes ——
 * 同一元素上 CSS 动画的优先级高于内联样式，两套会互相打架。
 */
export const wordmarkConverge: Variants = {
  hidden: { opacity: 0, filter: 'blur(12px)', letterSpacing: '0.34em' },
  show: {
    opacity: 1,
    filter: 'blur(0px)',
    letterSpacing: '0.06em',
    transition: transitionSpatial,
  },
};

/** 容器：靠 staggerChildren 把子元素的入场串成一条节奏，而不是同时炸开 */
export function staggerContainer(stagger = 0.09, delayChildren = 0.1): Variants {
  return {
    hidden: {},
    show: {
      transition: { staggerChildren: stagger, delayChildren },
    },
  };
}

/** 视口触发阈值：元素露出 12% 就开始，不等完全滚进来 —— 否则长页面底部永远不触发 */
export const VIEWPORT_MARGIN = '0px 0px -12% 0px';
