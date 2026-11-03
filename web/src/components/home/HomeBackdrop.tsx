import { useEffect, useRef } from 'react';

import { usePointerSpace } from '../../lib/motion';
import '../../styles/launcher.css';

/**
 * 首页全屏背景：一整幅完整的 CSS 中性构图，不分层、不拼贴。
 *
 * 本分支只保留中性占位（深色工业氛围，无人物/枪械/官方素材），
 * 不读取任何本地参考图或外部图片；指针只写 CSS 自定义属性（见 lib/motion），
 * 合成层上做几个像素的位移，`prefers-reduced-motion` 与触屏下不挂监听。
 */
export function HomeBackdrop() {
  const spaceRef = usePointerSpace<HTMLDivElement>();
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const write = () => {
      el.style.setProperty('--scroll', Math.min(1, Math.max(0, window.scrollY / range)).toFixed(4));
    };
    write();
    window.addEventListener('scroll', write, { passive: true });
    window.addEventListener('resize', write, { passive: true });
    return () => {
      window.removeEventListener('scroll', write);
      window.removeEventListener('resize', write);
    };
  }, []);

  return (
    <div
      ref={(node) => {
        (spaceRef as { current: HTMLDivElement | null }).current = node;
        host.current = node;
      }}
      className="home-scene"
      data-testid="home-backdrop"
      data-art-source="neutral"
      aria-hidden="true"
    >
      <div
        className="home-scene-img home-scene-neutral"
        data-testid="home-art"
        aria-hidden="true"
      />
      <div className="home-scene-scrim" />
      <div className="home-scene-veil" />
      <div className="home-scene-glow" />
    </div>
  );
}
