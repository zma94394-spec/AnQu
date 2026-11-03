import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, PackageOpen, Plus, ShieldAlert, ShieldCheck } from 'lucide-react';

import { useAppShell } from '../lib/appShell';
import { fetchBuilds, fetchGuns, USE_MOCK } from '../lib/apiPublic';
import { buildProvenanceOf } from '../lib/buildProvenance';
import { cn } from '../lib/cn';
import { CROSS_ACCOUNT_STATUS, dataSourceLabel, monogramOf, sortGuns, verificationOf } from '../lib/gunCatalog';
import { SourceBadge } from '../components/SourceBadge';
import { WeaponVisual } from '../components/WeaponVisual';
import { weaponAssetFor } from '../lib/weaponAssets';
import type { BuildDTO, GunDTO } from '../types/api';

/**
 * 枪械详情（`/guns/:slug`）。
 *
 * 三件事：
 *   1. 只读地展示这把枪在字典里的真实信息，以及它名下**已收录**的方案；
 *   2. 核验状态只有一个来源（`verificationOf`）—— 今天它必然是"未核验"，
 *      因为公开 DTO 里没有 PC 真机验证轴；页面同时把"为什么不能声称能用"写出来；
 *   3. 没有方案就摆空态，并把投稿入口放在那里，而不是放一串示例方案。
 */
export default function GunDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [guns, setGuns] = useState<GunDTO[] | null>(null);
  const [dictError, setDictError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDictError(null);
    fetchGuns()
      .then((payload) => {
        if (!cancelled) setGuns(payload.guns ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGuns(null);
          setDictError(err instanceof Error ? err.message : '枪械字典读取失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const gun = useMemo(() => (guns ?? []).find((g) => g.slug === slug) ?? null, [guns, slug]);

  /*
   * 上一把 / 下一把用的是 `sortGuns` 排好的**同一份字典**，
   * 不是另写一套顺序 —— 否则详情页的邻居会和图鉴里的顺序打架。
   */
  const ordered = useMemo(() => sortGuns(guns ?? []), [guns]);
  const position = useMemo(() => ordered.findIndex((g) => g.slug === slug), [ordered, slug]);
  const prevGun = position > 0 ? (ordered[position - 1] ?? null) : null;
  const nextGun = position >= 0 && position < ordered.length - 1 ? (ordered[position + 1] ?? null) : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 lg:px-6">
      <Link
        to="/guns"
        className={cn(
          'press inline-flex items-center gap-1.5 text-[13px] text-ink-2',
          'transition-colors duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] hover:text-ink',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent',
        )}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
        枪械库
      </Link>

      {dictError && (
        <div className="glass mt-6 rounded-card p-6">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <ShieldAlert className="h-4 w-4 text-danger" strokeWidth={2.4} aria-hidden="true" />
            枪械字典读取失败
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{dictError}</p>
        </div>
      )}

      {!dictError && guns === null && (
        <div className="mt-8 flex items-center gap-4">
          <div className="skeleton h-16 w-16 rounded-[18px]" />
          <div className="flex-1">
            <div className="skeleton h-5 w-1/3 rounded-full" />
            <div className="skeleton mt-3 h-3 w-1/4 rounded-full" />
          </div>
        </div>
      )}

      {!dictError && guns !== null && !gun && (
        <div className="glass mt-8 rounded-card p-10 text-center">
          <PackageOpen className="mx-auto h-7 w-7 text-ink-3" strokeWidth={1.8} aria-hidden="true" />
          <h1 className="mt-3 text-[20px] font-semibold text-ink">字典里没有这把枪</h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">
            没找到 slug 为 <code className="font-mono text-ink">{slug ?? ''}</code> 的枪械。
            本站不自动创建枪械条目 —— 请从枪械库重新选一把。
          </p>
          <Link
            to="/guns"
            className="press mt-5 inline-flex rounded-chip bg-accent px-4 py-2 text-[13px] font-semibold text-black transition-colors duration-300 hover:bg-accent-2"
          >
            回到枪械库
          </Link>
        </div>
      )}

      {gun && (
        <GunDetail
          gun={gun}
          index={position}
          total={ordered.length}
          prevGun={prevGun}
          nextGun={nextGun}
        />
      )}
    </main>
  );
}

function GunDetail({
  gun,
  index,
  total,
  prevGun,
  nextGun,
}: {
  gun: GunDTO;
  index: number;
  total: number;
  prevGun: GunDTO | null;
  nextGun: GunDTO | null;
}) {
  const { openPublish } = useAppShell();
  const [builds, setBuilds] = useState<BuildDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * 来源三态分开摆：玩家投稿（data_origin=USER_SUBMISSION）/ 来源未核实 /
   * 演示。API 的 build_count 把三者都算进去了，所以“有 N 个方案”不等于
   * “有 N 个玩家方案”；这里只把有来源标记的行称作玩家投稿。
   */
  const playerBuilds = (builds ?? []).filter(
    (build) => buildProvenanceOf(build, USE_MOCK).playerSubmission,
  );
  const unverifiedBuilds = (builds ?? []).filter(
    (build) => buildProvenanceOf(build, USE_MOCK).kind === 'SOURCE_UNVERIFIED',
  );
  const demoBuilds = (builds ?? []).filter(
    (build) => buildProvenanceOf(build, USE_MOCK).demo,
  );
  const verification = verificationOf();
  const source = dataSourceLabel(USE_MOCK);
  // 与目录卡同一判据：name_en 只有在它真的带来新信息时才上屏（生产 89 把里 0 把满足）。
  const latinName = gun.name_en && gun.name_en !== gun.name ? gun.name_en : null;
  const asset = weaponAssetFor(gun.slug);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setBuilds(null);
    fetchBuilds({ gun_id: gun.id, page: 1, page_size: 20, sort: 'hot' })
      .then((page) => {
        if (!cancelled) setBuilds(page.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBuilds(null);
          setError(err instanceof Error ? err.message : '方案列表读取失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gun.id]);

  return (
    <>
      {/* 主视觉 + 枪械档案：左图位、右信息，和方案详情保持同一套版式 */}
      <div className="ui001-enter mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.18fr)_minmax(330px,0.82fr)]">
        <div className="min-w-0">
          <WeaponVisual gun={gun} size="hero" priority />
          {asset && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              图片来源：{asset.caption} · {asset.license} ·{' '}
              <a
                className="underline decoration-hairline underline-offset-2 transition-colors duration-200 hover:text-ink-2"
                href={asset.sourceUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                原始文件
              </a>
            </p>
          )}
        </div>

        <aside className="tactical-panel flex flex-col p-5 lg:p-6" aria-label="枪械信息">
          <div className="flex items-start gap-4">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-hud border border-hairline bg-steel/40 font-mono text-[16px] font-semibold text-ink-2"
              aria-hidden="true"
            >
              {monogramOf(gun)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">
                {gun.category_name}
              </p>
              <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink lg:text-[34px]">
                {gun.name}
              </h1>
            </div>
          </div>

          <p className="mt-4 text-[12px] text-ink-2">
            {latinName ? (
              <span className="font-mono uppercase tracking-[0.08em]">{latinName}</span>
            ) : null}
            {latinName ? <span className="mx-2 text-ink-3">·</span> : null}
            <span className="font-mono">{gun.slug}</span>
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-hairline bg-hairline/60">
            <div className="bg-void/40 px-4 py-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
                已收录方案
              </dt>
              <dd className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-ink">
                {gun.build_count}
              </dd>
            </div>
            <div className="bg-void/40 px-4 py-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
                PC 导入验证
              </dt>
              <dd className="mt-1 text-[13px] font-medium text-ink-3">未核验</dd>
            </div>
          </dl>

          <Link
            to={`/builds?gun=${encodeURIComponent(gun.slug)}`}
            className="btn-hud press mt-5 w-full"
          >
            在方案库按这把枪筛选
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => openPublish(gun.id)}
            className="btn-hud-ghost press mt-2 w-full"
          >
            投稿这把枪
          </button>

          <div className="mt-auto border-t border-hairline pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                {index >= 0 ? `第 ${index + 1} / ${total} 把` : `共 ${total} 把`}
              </span>
              <nav aria-label="切换枪械" className="flex items-center gap-1.5">
                {prevGun ? (
                  <Link
                    to={`/guns/${prevGun.slug}`}
                    className={cn(
                      'press inline-flex items-center gap-1 rounded-hud border border-hairline px-2.5 py-1.5',
                      'text-[11px] text-ink-2 transition-colors duration-200 hover:border-accent-line hover:text-ink',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    )}
                  >
                    <ChevronRight
                      className="h-3 w-3 rotate-180"
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                    {prevGun.name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-hud border border-hairline/60 px-2.5 py-1.5 text-[11px] text-ink-3">
                    已是第一把
                  </span>
                )}
                {nextGun ? (
                  <Link
                    to={`/guns/${nextGun.slug}`}
                    className={cn(
                      'press inline-flex items-center gap-1 rounded-hud border border-hairline px-2.5 py-1.5',
                      'text-[11px] text-ink-2 transition-colors duration-200 hover:border-accent-line hover:text-ink',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    )}
                  >
                    {nextGun.name}
                    <ChevronRight
                      className="h-3 w-3"
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-hud border border-hairline/60 px-2.5 py-1.5 text-[11px] text-ink-3">
                    已是最后一把
                  </span>
                )}
              </nav>
            </div>
          </div>
        </aside>
      </div>

      {/* ------------------------------------------------ 核验状态（诚实面） */}
      <section aria-label="核验状态" className="mt-6 border-y border-hairline py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
            {verification.tone === 'ok' ? (
              <ShieldCheck className="h-3.5 w-3.5 text-signal" strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 text-ink-3" strokeWidth={2.2} aria-hidden="true" />
            )}
            {verification.label}
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            跨账号 / 跨区服：{CROSS_ACCOUNT_STATUS.value}
          </span>
          <span className="ml-auto font-mono text-[10px] text-ink-3">{source.text}</span>
        </div>
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-ink-3">
          {verification.reason} {CROSS_ACCOUNT_STATUS.reason}
        </p>
      </section>

      {/* ------------------------------------------------------------ 方案 */}
      <section aria-label="这把枪的已收录方案" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-3">
              已收录方案
            </h2>
            {builds !== null && builds.length > 0 && (
              <p className="mt-2 text-[12px] text-ink-3">
                玩家投稿 <span className="font-mono text-signal">{playerBuilds.length}</span>
                <span aria-hidden="true" className="mx-1.5">·</span>
                来源未核实 <span className="font-mono text-ink-2">{unverifiedBuilds.length}</span>
                <span aria-hidden="true" className="mx-1.5">·</span>
                演示 <span className="font-mono text-accent">{demoBuilds.length}</span>
              </p>
            )}
          </div>

        </div>

        {error && (
          <div className="glass mt-4 rounded-card p-6">
            <p className="text-[14px] font-semibold text-ink">方案列表读取失败</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{error}</p>
          </div>
        )}

        {!error && builds === null && (
          <ul className="mt-4 space-y-3" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="glass rounded-panel p-5">
                <div className="skeleton h-4 w-1/2 rounded-full" />
                <div className="skeleton mt-3 h-3 w-1/3 rounded-full" />
              </li>
            ))}
          </ul>
        )}

        {!error && builds !== null && builds.length === 0 && (
          <div className="mt-4 border-y border-hairline py-10 text-center">
            <PackageOpen className="mx-auto h-6 w-6 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
            <p className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-ink">
              {gun.name} 还没有已收录的改枪方案
            </p>
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-ink-2">
              这是真实的空状态：后端按这把枪过滤后返回 0 条。本站不会放示例方案占位，
              也不会把别的枪的方案挪过来。
            </p>
            <button
              type="button"
              onClick={() => openPublish(gun.id)}
              className="press mt-5 inline-flex items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-[12px] font-semibold text-black transition-colors duration-200 hover:bg-accent-2"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
              投稿这把枪的改枪码
            </button>
          </div>
        )}

        {/* 有记录但没有可确认的玩家投稿：先给明确答案，再把演示/未核实条目分开摆 */}
        {!error && builds !== null && builds.length > 0 && playerBuilds.length === 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-hairline py-4">
            <div>
              <p className="text-[13px] font-medium text-ink">还没有真实玩家方案</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                {gun.name} 当前只有演示或来源未核实条目，不计为玩家投稿。
              </p>
            </div>
            <button
              type="button"
              onClick={() => openPublish(gun.id)}
              className="press inline-flex items-center gap-1.5 rounded-control border border-hairline px-3 py-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-200 hover:border-accent-line hover:text-ink"
            >
              投稿这把枪的改枪码
            </button>
          </div>
        )}

        {!error && builds !== null && playerBuilds.length > 0 && (
          <>
            <ul className="mt-4 space-y-3">
              {playerBuilds.map((build) => (
                <li key={build.id}>
                  <GunBuildRow build={build} />
                </li>
              ))}
            </ul>
          </>
        )}

        {!error && builds !== null && builds.length > 0 && (
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-ink-3">
            排序口径：热度分 =（点赞 × 3 + 复制）÷（发布小时数 + 2）^0.6；计数起点可能含样例基线，
            不代表已核实的社区规模。
          </p>
        )}

        {!error && builds !== null && unverifiedBuilds.length > 0 && (
          <div className="mt-6 border-t border-hairline pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-medium text-ink-2">来源未核实（不计为玩家投稿）</h3>
              <span className="font-mono text-[10px] text-ink-3">{unverifiedBuilds.length} 条</span>
            </div>
            <ul className="mt-3 space-y-2">
              {unverifiedBuilds.map((build) => (
                <li key={build.id}>
                  <GunBuildRow build={build} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {!error && builds !== null && demoBuilds.length > 0 && (
          <div className="mt-6 border-t border-hairline pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-medium text-ink-2">演示条目（非玩家投稿）</h3>
              <span className="font-mono text-[10px] text-ink-3">{demoBuilds.length} 条</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              站点初始化或本地 Mock 的演示条目；计数是样例基线，不代表玩家热度或 PC 导入结果。
            </p>
            <ul className="mt-3 space-y-2">
              {demoBuilds.map((build) => (
                <li key={build.id}>
                  <GunBuildRow build={build} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

function GunBuildRow({ build }: { build: BuildDTO }) {
  const provenance = buildProvenanceOf(build, USE_MOCK);
  const accent =
    provenance.kind === 'PLAYER_SUBMISSION'
      ? 'bg-signal'
      : provenance.demo
        ? 'bg-accent'
        : 'bg-ink-3/50';

  return (
    <Link
      to={`/builds/${build.id}`}
      className={cn(
        'group relative flex items-start gap-4 overflow-hidden rounded-panel border border-hairline bg-carbon/80 p-5',
        'shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.06)]',
        'transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]',
        'hover:-translate-y-[3px] hover:border-hairline-2 hover:bg-carbon',
        'hover:shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.12),0_22px_48px_-26px_rgb(0_0_0_/_0.95)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[2px] opacity-70', accent)} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{build.title}</span>
          <SourceBadge provenance={provenance} size="xs" />
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-hud border border-hairline/70 bg-black/45 px-2.5 py-1 font-mono text-[12px] text-ink-2">
            {build.code}
          </span>
        </span>
        <span className="mt-2 block text-[12px] text-ink-3">
          点赞 {build.likes_count} · 复制 {build.copies_count} · 造价 ~
          {build.estimated_cost.toLocaleString('en-US')} 柯恩币
        </span>
      </span>
      <ChevronRight
        className="mt-1 h-4 w-4 shrink-0 text-ink-3 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-ink"
        strokeWidth={2.4}
        aria-hidden="true"
      />
    </Link>
  );
}
