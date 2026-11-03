import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { HomeSearch } from './HomeSearch';
import type { HomeSearchScope } from './HomeSearch';

interface LauncherHeroProps {
  initialQuery: string;
  onSearch: (query: string, scope: HomeSearchScope) => void;
  onScrollToBuilds: () => void;
}

/**
 * 首屏只留四样东西：标题、一句话、一个搜索框、一个向下提示。
 *
 * 画面是一整幅完整构图，所以文字层不再叠任何一块图，也不做 kicker
 * 与英文装饰字——登录器的读法是"画为主、UI 压在底缘"。
 */
export function LauncherHero({
  initialQuery,
  onSearch,
  onScrollToBuilds,
}: LauncherHeroProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <section aria-labelledby="home-hero-title" data-hero-variant="ui020" className="home-launcher">
      <div className="home-launcher-inner">
        <h1
          id="home-hero-title"
          className="max-w-[13em] text-[clamp(32px,4.4vw,60px)] font-semibold leading-[1.08] tracking-[-0.032em] text-ink"
        >
          找到你的改枪方案。
        </h1>

        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ink-2 sm:text-[15px]">
          搜索枪械，查看配装，分享改枪码。
        </p>

        <div className="mt-6 sm:mt-7">
          <HomeSearch initialQuery={initialQuery} onSearch={onSearch} />
        </div>
      </div>

      <button
        type="button"
        onClick={onScrollToBuilds}
        className="home-scroll-cue"
        aria-label="向下浏览公开改枪方案"
      >
        向下浏览公开方案
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="home-rights-note">
        {detailOpen && (
          <p className="home-rights-detail" data-testid="ui020-rights-detail">
            当前背景为中性占位场景（深色工业氛围），由本地 CSS 渐变构成，不含人物、枪械、游戏角色或官方 Logo，也不构成任何授权关系。
            {' '}
            背景不依赖任何外部图片或 CDN。
          </p>
        )}
        <button
          type="button"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen((v) => !v)}
          title="中性占位背景，无人物、枪械或官方素材"
          data-testid="ui020-rights-neutral"
        >
          中性占位 · 无第三方素材
        </button>
      </div>
    </section>
  );
}
