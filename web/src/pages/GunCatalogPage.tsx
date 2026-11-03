import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PackageOpen, Search, ShieldAlert } from 'lucide-react';

import { fetchGuns, USE_MOCK } from '../lib/apiPublic';
import { cn } from '../lib/cn';
import { WeaponVisual } from '../components/WeaponVisual';
import { dataSourceLabel, groupByCategory, matchGun, sortGuns } from '../lib/gunCatalog';
import type { CategoryDTO, GunDTO } from '../types/api';

/**
 * 枪械库（`/guns`）—— 桌面优先的枪械字典浏览页。
 *
 * 数据只有一条来路：`GET /api/guns`（与首页筛选栏用的是同一个 `fetchGuns()`）。
 * 这里刻意**不**再维护第二份枪械清单，也不做任何本地补全：
 * 字典里有多少把就画多少张卡，某分类为 0 就照实显示 0。
 */
export default function GunCatalogPage() {
  const [guns, setGuns] = useState<GunDTO[] | null>(null);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [params, setParams] = useSearchParams();

  /*
   * UI-009 STEP 6：筛选条件以 **URL 为唯一真相**，不再是"本地态 + 挂载时读一次"。
   * 读一次的做法让分享/收藏/后退都拿不到用户实际看到的筛选，
   * 而且一旦有人把入口改回本地态，深链会静默失效 —— 所以这里连 setter 都只写 URL。
   * `replace: true`：打字不该往历史里塞 89 条记录，后退要退到用户真正来的那一页。
   */
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? 'all';
  const writeParam = (key: 'q' | 'category', value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchGuns()
      .then((payload) => {
        if (cancelled) return;
        setGuns(payload.guns ?? []);
        setCategories(payload.categories ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setGuns(null);
        setError(err instanceof Error ? err.message : '枪械字典读取失败');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /*
   * 字典到手后，如果 URL 带来的 category 不是真分类，退回「全部」。
   * 不这么做的话，`/guns?category=xxx`（含从 /weapons 搬来的旧参数）会画出一个
   * "0 把（xxx）"的空态，把"参数写错了"演成"库里没有枪"。
   */
  useEffect(() => {
    if (!categories.length) return;
    if (category !== 'all' && !categories.some((c) => c.slug === category)) writeParam('category', 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, category]);

  const groups = useMemo(() => groupByCategory(guns ?? [], categories), [guns, categories]);

  const visible = useMemo(() => {
    const pool = category === 'all' ? (guns ?? []) : (groups.find((g) => g.slug === category)?.guns ?? []);
    return sortGuns(pool.filter((gun) => matchGun(gun, query)));
  }, [guns, groups, category, query]);

  const source = dataSourceLabel(USE_MOCK);
  const totalGuns = guns?.length ?? 0;
  const totalBuilds = (guns ?? []).reduce((n, g) => n + g.build_count, 0);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-10 lg:px-6">
      {/* ---------------------------------------------------------- 页头 */}
      <header className="ui001-enter">
        <h1 className="text-[36px] font-semibold tracking-[-0.03em] text-ink lg:text-[44px]">
          枪械库
        </h1>

        {error ? (
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-2">
            枪械字典没读到，页面下面如实留空 —— 不拿示例数据补位。
          </p>
        ) : (
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-2">
            {guns === null
              ? '正在读取本站枪械字典…'
              : `${totalGuns} 把枪 · ${groups.length} 个分类 · ${totalBuilds} 个公开方案`}
          </p>
        )}

        <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-ink-3">{source.text}</p>
      </header>

      {/* -------------------------------------------------------- 控制条 */}
      <section aria-label="检索与筛选" className="mt-6 flex flex-col gap-3">
        <div className="relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => writeParam('q', event.target.value)}
            placeholder="搜索中文名 / 英文名 / slug"
            aria-label="搜索枪械"
            className="hud-field h-10 pl-10 pr-4 text-[13px]"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="按分类筛选">
          <CategoryChip active={category === 'all'} onClick={() => writeParam('category', 'all')} label="全部" count={totalGuns} />
          {groups.map((group) => (
            <CategoryChip
              key={group.slug}
              active={category === group.slug}
              onClick={() => writeParam('category', group.slug)}
              label={group.name}
              count={group.guns.length}
            />
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- 状态面 */}
      {error && (
        <div className="glass mt-8 rounded-card p-6">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <ShieldAlert className="h-4 w-4 text-danger" strokeWidth={2.4} aria-hidden="true" />
            读取失败
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((n) => n + 1)}
            className="press mt-4 rounded-chip bg-accent px-4 py-2 text-[13px] font-semibold text-black transition-colors duration-300 hover:bg-accent-2"
          >
            重试
          </button>
        </div>
      )}

      {!error && guns === null && (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="rounded-card border border-hairline bg-base-2/70 p-3">
              {/* 骨架直接复刻新版式位的形状：先画 16/10 块，再画两行文字 */}
              <div className="skeleton aspect-[16/10] w-full rounded-[10px]" />
              <div className="skeleton mt-4 h-4 w-1/2 rounded-full" />
              <div className="skeleton mt-2 h-3 w-1/3 rounded-full" />
              <div className="skeleton mt-6 h-5 w-2/3 rounded-full" />
            </li>
          ))}
        </ul>
      )}

      {!error && guns !== null && visible.length === 0 && (
        <div className="glass mt-8 rounded-card p-10 text-center">
          <PackageOpen className="mx-auto h-7 w-7 text-ink-3" strokeWidth={1.8} aria-hidden="true" />
          <p className="mt-3 text-[15px] font-semibold text-ink">
            {query ? `没有匹配「${query}」的枪械` : '这个分类暂时没有可展示的枪械'}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">
            这不是加载失败：本站枪械字典共 {totalGuns} 条，逐条按名字匹配后为空。
            {query ? ' 换个写法（英文名或 slug 也可以）再试。' : ''}
          </p>
          {query && (
            <button
              type="button"
              onClick={() => writeParam('q', '')}
              className="press mt-5 rounded-chip border border-hairline px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors duration-300 hover:border-hairline-2 hover:text-ink"
            >
              清空搜索
            </button>
          )}
        </div>
      )}

      {!error && guns !== null && visible.length > 0 && (
        <>
          <p className="mt-8 text-[12px] text-ink-3">
            共 {visible.length} 把{category === 'all' ? '' : `（${groups.find((g) => g.slug === category)?.name ?? category}）`}
          </p>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((gun, i) => (
              <GunCard key={gun.id} gun={gun} index={i} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'press flex items-center gap-2 rounded-chip border px-3.5 py-1.5 text-[13px] font-medium',
        'transition-colors duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        active
          ? 'border-accent-line bg-accent/[0.08] text-ink'
          : 'border-hairline bg-transparent text-ink-2 hover:border-hairline-2 hover:text-ink',
      )}
    >
      {label}
      <span className={cn('font-mono text-[11px]', active ? 'text-ink-2' : 'text-ink-3')}>{count}</span>
    </button>
  );
}

function GunCard({ gun, index }: { gun: GunDTO; index: number }) {
  const hasBuilds = gun.build_count > 0;
  // 字典里 58/89 把枪的 name_en 和 name 一模一样（生产实测）。副行照抄一遍不是层级，是噪声。
  const latinName = gun.name_en && gun.name_en !== gun.name ? gun.name_en : null;
  return (
    <li>
      <Link
        to={`/guns/${gun.slug}`}
        className={cn(
          'tactical-card group relative flex h-full flex-col p-3',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        {/*
         * 主视觉位：固定 16/10 比例，所以有图/没图/图挂了三种情况都不会撑动布局
         * （CLS = 0）。hover 时只放大 1.5%，是"抬起来一点"而不是"抖一下"。
         */}
        <WeaponVisual
          gun={gun}
          priority={index < 4}
          className={cn(
            'transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]',
            'group-hover:scale-[1.015]',
          )}
        />

        <span className="flex flex-1 flex-col px-1.5 pb-1">
          <span
            data-gun-name={gun.name}
            className="relative mt-4 text-[17px] font-semibold leading-snug tracking-[-0.018em] text-ink">
            {gun.name}
          </span>
          {latinName ? (
            <span className="relative mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
              {latinName}
            </span>
          ) : (
            // 没有可用英文名的行不能空出来：留着会让卡片的标题基线参差不齐。
            // slug 是真实数据，但它同时是这条链接自己的地址，读屏里只算重复噪声。
            <span
              aria-hidden="true"
              className="relative mt-1 font-mono text-[11px] lowercase tracking-[0.08em] text-ink-3"
            >
              /{gun.slug}
            </span>
          )}

          <span className="mt-auto flex items-center justify-between gap-3 pt-4 text-[11px] leading-relaxed">
            <span className="text-ink-3">{gun.category_name}</span>
            <span className={hasBuilds ? 'text-ink-2' : 'text-ink-3'}>
              {hasBuilds ? `${gun.build_count} 个方案` : '暂无方案'}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
