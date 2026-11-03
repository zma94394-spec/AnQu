import { useEffect, useRef, useState } from 'react';

import { monogramOf } from '../lib/gunCatalog';
import { weaponAssetFor, weaponAssetUrl } from '../lib/weaponAssets';
import { cn } from '../lib/cn';
import type { GunDTO } from '../types/api';

/**
 * 枪械主视觉位。
 *
 * 一句话事实：本站**没有任何一张有授权的真实枪械图**。
 * `db/04_seed.sql:11-16` 记着原委 —— 早先 60 行 `icon_url` 写的是不可解析的占位域名，
 * 前一轮收口时按「不生成任何图片地址」逐行改成 NULL；生产现值 89/89 也全是 NULL。
 *
 * 所以这里的规矩是：
 *   1. 有 URL 就真加载（lazy + 固定宽高比，失败就承认失败，不悄悄换成装饰图）；
 *   2. 没 URL 就画一块**明说是空位**的版面：分类色相 + 细网格 + 大字头 + slug，
 *      右上角挂着「图待接入」。它好看，但绝不假装自己是枪的照片。
 *   3. 绝不用 AI 生成的画面冒充游戏内截图 —— 那会把"视觉升级"变成"数据造假"。
 */
export interface WeaponVisualProps {
  /**
   * 注意这里**没有** `icon_url`：后端那个字段不是渲染源。
   * 一张图能不能出现，只由 weaponAssetRegistry（以及校验它的那道闸门）决定。
   */
  gun: Pick<GunDTO, 'name' | 'name_en' | 'slug' | 'category' | 'category_name'>;
  /** card = 图鉴卡里的 16/10 版位；hero = 详情页的大版位 */
  size?: 'card' | 'hero';
  /** 首屏可见的那张图传 true，走 eager + 高优先级 */
  priority?: boolean;
  className?: string;
}

export function WeaponVisual({ gun, size = 'card', priority = false, className }: WeaponVisualProps) {
  /*
   * 唯一图源 = 登记表。UI-011 STEP 3 关掉的洞：上一版这里写的是
   * "登记的素材 > 后端 icon_url"，而后端那个字段是一条没人核验过的外链 ——
   * 谁改了库就能让任意图案绕过授权闸门直接上屏，闸门就成了可选配件。
   * 现在两条路合成一条：没过核验的东西，代码里根本没有渲染它的路径。
   */
  const asset = weaponAssetFor(gun.slug);
  const src = asset ? weaponAssetUrl(asset) : null;
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'failed'>(src ? 'loading' : 'idle');
  const hero = size === 'hero';
  /*
   * 可见性**不**挂在 onLoad 上。缓存命中或 data:  URI 的图可能在 React 装上 onLoad 之前
   * 就已经解码完成，那种情况下 onLoad 永远不会触发 —— 如果"只有 loaded 才显示"，
   * 图就会一直停在 opacity-0，等于把一张好图渲染成看不见。
   * 所以规矩反过来：有 URL 且没失败 = 图在上头；只有明确失败才把它撤下来。
   */
  const covered = !!src && state !== 'failed';

  const imgRef = useRef<HTMLImageElement | null>(null);

  /*
   * 换枪时要清掉上一次的加载态，否则会一直显示"加载失败"。
   * 但只靠 onLoad/onError 不够：data: URI 和命中缓存的图会在 React 装上处理器之前
   * 就跑完，事件永远不来 —— 实测 89 张卡里 loaded 恒为 0，一张明明已经显示出来的图
   * 被永久标成"读取中"。所以这里以 DOM 自己的 complete / naturalWidth 为准补判一次。
   */
  useEffect(() => {
    if (!src) {
      setState('idle');
      return;
    }
    const el = imgRef.current;
    setState(el && el.complete ? (el.naturalWidth > 0 ? 'loaded' : 'failed') : 'loading');
  }, [src, gun.slug]);

  return (
    <div
      className={cn(
        'weapon-plate relative w-full overflow-hidden rounded-hud border border-hairline',
        hero ? 'aspect-[21/9]' : 'aspect-[16/10]',
        className,
      )}
      data-weapon-visual={gun.slug}
      data-state={state}
      data-has-image={src ? 'true' : 'false'}
      data-asset-kind={asset?.kind ?? 'none'}
      /*
       * 整块版位对读屏是装饰：不藏的话，卡片链接的可访问名会变成
       * 「图待接入 MP /mp5 MP5：暂无可用枪械图…」这种一长串，
       * 把真正的枪名埋进装饰文案里 —— 那是无障碍上的倒退。
       */
      aria-hidden="true"
    >
      {src && (
        <img
          ref={imgRef}
          src={src}
          alt={`${gun.name} 枪械图`}
          width={hero ? 1260 : 520}
          height={hero ? 540 : 325}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            'transition-opacity duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]',
            state === 'failed' ? 'opacity-0' : 'opacity-100',
          )}
        />
      )}

      {/*
       * 署名要跟着图上屏：授权方（CC 一类）要求的 attribution 不能只躺在登记表里。
       * 空位版面在有图时整块 opacity-0，所以这条单独渲染。
       */}
      {asset && covered && (
        <span className="absolute bottom-1.5 right-2 max-w-[86%] truncate rounded-full border border-hairline bg-base-1/75 px-2 py-[2px] font-mono text-[9px] tracking-[0.06em] text-ink-3">
          {asset.caption}
        </span>
      )}

      {/* 空位版面：水印字头 + slug + 状态标签。有图且没失败时整块隐去。 */}
      <div
        aria-hidden={state === 'loaded' ? 'true' : undefined}
        className={cn(
          'absolute inset-0 z-[1] flex flex-col justify-between',
          hero ? 'p-5 sm:p-6' : 'p-3',
          'transition-opacity duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]',
          // 图在上面时把空位版面压到图后面：只改 opacity，不加节点
          covered ? 'opacity-0' : 'opacity-100',
        )}
      >
        <div className="flex items-start justify-end">
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-[3px] font-mono text-[9px] tracking-[0.08em]',
              state === 'failed'
                ? 'border-danger/40 bg-danger/10 text-danger'
                : 'border-hairline/70 bg-base-1/55 text-ink-2',
            )}
          >
            {state === 'failed' ? '图片加载失败' : state === 'loading' ? '读取中' : '图待接入'}
          </span>
        </div>

        {/*
         * 水印字头：两个字符由**真实名字**派生，不画枪、不描边、不做拟物。
         * 它是这块版位的"铭牌"，不透明度压到 14%，不抢下方枪名的层级。
         */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 grid place-items-center text-ink-2/25',
            'font-mono font-bold leading-none tracking-[-0.06em]',
            hero ? 'text-[clamp(120px,17vw,210px)]' : 'text-[clamp(52px,5.4vw,80px)]',
          )}
        >
          {monogramOf(gun)}
        </span>

        <div className="relative flex items-end justify-between gap-3">
          <span className="font-mono text-[10px] lowercase tracking-[0.1em] text-ink-3">
            /{gun.slug}
          </span>
          <span
            aria-hidden="true"
            className={cn('hud-ticks shrink-0', hero ? 'w-24' : 'w-14')}
          />
        </div>
      </div>
    </div>
  );
}
