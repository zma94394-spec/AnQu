import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Heart,
  Info,
  LayoutGrid,
  MessageSquare,
  Monitor,
  PackageOpen,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Terminal,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { CommentSection } from '../components/CommentSection';
import { GunImage } from '../components/GunImage';
import { SourceBadge } from '../components/SourceBadge';
import { useAppShell } from '../lib/appShell';
import { ApiError, fetchBuildById, USE_MOCK } from '../lib/apiPublic';
import { buildProvenanceOf } from '../lib/buildProvenance';
import { UNCOPYABLE_CODE_HINT } from '../lib/buildCode';
import { cn } from '../lib/cn';
import { formatCoins, formatCount, formatRelativeTime, PLATFORM_LABEL } from '../lib/format';
import { useCopyCode } from '../hooks/useCopyCode';
import { useLikeBuild } from '../hooks/useLikeBuild';
import { riseConverge, slideInLeft, staggerContainer } from '../lib/hudMotion';
import { EASE } from '../lib/styles';
import type { BuildDTO, Platform } from '../types/api';

const PLATFORM_ICON: Record<Platform, LucideIcon> = {
  mobile: Smartphone,
  pc: Monitor,
  both: LayoutGrid,
};

export function BuildDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { notify } = useAppShell();

  const [build, setBuild] = useState<BuildDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setBuild(null);

    fetchBuildById(id)
      .then((data) => {
        if (!cancelled) setBuild(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          // 路径参数不是合法 UUID 时后端返回 VALIDATION_ERROR，
          // 对用户来说与"方案不存在"是一回事，不该暴露校验细节
          const code = err.code === 'VALIDATION_ERROR' ? 'BUILD_NOT_FOUND' : err.code;
          setError({ code, message: err.message });
        } else {
          setError({ code: 'UNKNOWN', message: '加载失败，请稍后重试' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const patch = useCallback(
    (_id: string, changes: Partial<Pick<BuildDTO, 'likes_count' | 'copies_count'>>) => {
      setBuild((prev) => (prev ? { ...prev, ...changes } : prev));
    },
    [],
  );

  /** 评论发表成功后同步计数（后端由触发器维护，前端只是跟随显示） */
  const handleCommentAdded = useCallback(() => {
    setBuild((prev) => (prev ? { ...prev, comments_count: prev.comments_count + 1 } : prev));
    notify({ text: '评论已发表。' });
  }, [notify]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-6 lg:py-12">
      <BackLink />

      {loading && <DetailSkeleton />}

      {!loading && error && (
        <div
          role="alert"
          className="tactical-card mt-6 flex flex-col items-center px-6 py-20 text-center"
        >
          <span className="grid h-16 w-16 place-items-center rounded-hud border border-hairline bg-black/35">
            <PackageOpen className="h-8 w-8 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p className="mt-5 text-[17px] font-semibold tracking-[-0.022em] text-ink">
            {error.code === 'BUILD_NOT_FOUND' ? '这个改枪方案不存在或已下架' : '方案加载失败'}
          </p>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">{error.message}</p>
          <code className="hud-readout mt-4 rounded-hud bg-black/40 px-3 py-1.5 text-[11px] text-ink-3">
            {error.code}
          </code>
        </div>
      )}

      {!loading && !error && build && (
        <BuildDetail build={build} onPatch={patch} onCommentAdded={handleCommentAdded} />
      )}
    </main>
  );
}

/* ============================================================ 详情主体 */

interface BuildDetailProps {
  build: BuildDTO;
  onPatch: (id: string, patch: Partial<Pick<BuildDTO, 'likes_count' | 'copies_count'>>) => void;
  onCommentAdded: () => void;
}

/**
 * 拆成独立组件是必要的：`useCopyCode` / `useLikeBuild` / `useBuildsFeed` 都依赖
 * 已加载的方案数据，而 hooks 不能写在 `build === null` 的条件分支里。
 * 由父组件在数据就绪后才渲染本组件，hooks 调用顺序才是稳定的。
 */
function BuildDetail({ build, onPatch, onCommentAdded }: BuildDetailProps) {
  const provenance = buildProvenanceOf(build, USE_MOCK);
  const ProvenanceIcon = provenance.demo
    ? Info
    : provenance.playerSubmission
      ? ShieldCheck
      : ShieldAlert;
  const copy = useCopyCode({
    buildId: build.id,
    code: build.code,
    onPatch,
  });

  const like = useLikeBuild({
    buildId: build.id,
    likesCount: build.likes_count,
    onPatch,
  });

  const { guns } = useAppShell();

  /*
   * `BuildDTO.gun` 里**没有 `slug`** —— 只有 id / name / category。
   * 加一个字段等于改 API 契约，本次禁止。
   * 这里改为从 App 启动时已经拉好的全量枪械字典里按 gun.id 反查 slug：
   * 用的是既有数据、不发新请求。**查不到就退化成纯文本，不猜、不做假链接。**
   */
  const gunSlug = useMemo(
    () => guns.find((item) => item.id === build.gun.id)?.slug ?? null,
    [guns, build.gun.id],
  );

  const PlatformIcon = PLATFORM_ICON[build.platform];

  return (
    <motion.article
      variants={staggerContainer(0.08, 0.04)}
      initial="hidden"
      animate="show"
      className="mt-6"
    >
      {/* ============================================ 方案身份铭牌 */}
      <motion.header className="tactical-card hud-corners relative p-6 lg:p-8">
        <motion.div variants={slideInLeft} className="flex items-center gap-3">
          <span className="hud-readout text-[10px] font-semibold uppercase tracking-[0.26em] text-hud">
            方案检视
          </span>
          <span aria-hidden="true" className="hud-ticks w-14 shrink-0" />
          <span aria-hidden="true" className="hud-rule hidden flex-1 sm:block" />
        </motion.div>

        {/* 武器身份：与枪械检视页同一套"图 + 名 + 分类"语言 */}
        <motion.div variants={riseConverge} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_250px] lg:gap-8">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-hud border border-hairline bg-void">
                <GunImage
                  name={build.gun.name}
                  categoryName={build.gun.category_name}
                />
              </div>

              <div className="min-w-0">
                <p className="hud-label">武器</p>
                {gunSlug ? (
                  <Link
                    to={`/guns/${gunSlug}`}
                    className={cn(
                      'group mt-1 flex items-center gap-1.5 font-mono text-[18px] font-bold tracking-tight text-ink',
                      `transition-colors duration-300 ${EASE} hover:text-hud`,
                    )}
                  >
                    {build.gun.name}
                    <ArrowUpRight
                      className="h-3.5 w-3.5 text-hud opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      aria-hidden="true"
                    />
                    <span className="sr-only">查看该枪全部方案</span>
                  </Link>
                ) : (
                  <p className="mt-1 font-mono text-[18px] font-bold tracking-tight text-ink">
                    {build.gun.name}
                  </p>
                )}
                <p className="mt-1 text-[12px] text-ink-3">{build.gun.category_name}</p>
              </div>
            </div>

            {/*
             * ⚠️ h1 必须**只包含方案标题本身**。
             * e2e 的深链用例是 `getByRole('heading',{level:1}).toHaveText(卡片标题)` ——
             * `toHaveText` 传字符串是**全等**比较，往 h1 里塞武器名或编号都会让它红。
             */}
            <motion.h1
              variants={riseConverge}
              className="mt-7 text-[clamp(26px,4.4vw,42px)] font-semibold leading-[1.12] tracking-[-0.03em] text-ink"
            >
              {build.title}
            </motion.h1>

            <motion.div
              variants={riseConverge}
              className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2"
            >
              <span
                className={cn(
                  'hud-readout flex items-center gap-1.5 rounded-hud border border-hairline px-2.5 py-1',
                  'text-[11px] font-semibold text-ink-2',
                )}
              >
                <PlatformIcon className="h-3 w-3 text-hud" aria-hidden="true" />
                {PLATFORM_LABEL[build.platform] ?? build.platform}
              </span>

              {/*
               * 归属读数。`builds.author_id` 为 NULL 有两种成因，而**页面上分不开**：
               *   · 站点初始化写入的条目本来就没有作者；
               *   · 真实投稿的作者注销了账号 —— FK 是 ON DELETE SET NULL，
               *     这条反例已由 tests/ui014_data_trust.test.mjs T3 钉住。
               * 所以这里只能说"没有署名"。原来写的是「匿名投稿」，那是在断言
               * "曾经有人投过这条" —— 而对本库里那 6 条初始化条目，这句话并不成立。
               */}
              <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <UserRound className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                {build.author?.nickname ?? (
                  <span className="text-ink-3" title="该条目没有关联的作者账号：可能是站点初始化写入的条目，也可能是作者已注销">
                    未署名
                  </span>
                )}
              </span>

              <span className="hud-readout flex items-center gap-1.5 text-[12px] text-ink-3">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatRelativeTime(build.created_at)}
              </span>
            </motion.div>
          </div>

          {/* 右栏：把来源从"一枚小徽章"展开成可读的档案栏，填满标题右侧的空白 */}
          <motion.aside
            variants={slideInLeft}
            aria-label="来源档案"
            className="border-t border-hairline pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-1"
          >
            <p className="hud-label">来源与审核</p>
            <div className="mt-3">
              <SourceBadge provenance={provenance} full size="md" />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-2">{provenance.reason}</p>
          </motion.aside>
        </motion.div>
      </motion.header>

      {/* ============================================ 主行动：改枪码 */}
      <motion.section
        variants={riseConverge}
        aria-label="改枪码"
        className="tactical-card relative mt-5 overflow-hidden p-6 lg:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-hud" aria-hidden="true" />
            <span className="hud-label">改枪码</span>
          </div>
          <span className="hud-readout text-[11px] text-ink-3">{build.code.length} 位</span>
        </div>

        {/*
         * 码本身是这一屏的主角：等宽、大字号、`break-all` 保证 40 位长码
         * 在 390px 上也不会撑出横向滚动；`select-all` 让复制按钮不可用时
         * 用户仍能一次点选整串手动复制。
         */}
        <code
          title={build.code}
          className="mt-4 block select-all break-all rounded-hud border border-hairline bg-black/55 px-4 py-4 font-mono text-[clamp(14px,2.6vw,19px)] leading-8 text-ink"
        >
          {build.code}
        </code>

        <button
          type="button"
          onClick={copy.copy}
          disabled={!copy.canCopy}
          title={copy.canCopy ? undefined : UNCOPYABLE_CODE_HINT}
          className={cn(
            'press mt-4 flex w-full items-center justify-center gap-2.5 rounded-hud px-6 py-4',
            'font-mono text-[13px] font-bold uppercase tracking-[0.16em]',
            `transition-all duration-300 ${EASE}`,
            copy.state === 'copied' && 'animate-copy-pop bg-signal text-black',
            copy.state === 'failed' && 'bg-danger text-white',
            copy.state === 'idle' &&
              copy.canCopy &&
              'bg-accent text-[#0d1217] hover:bg-accent-2',
            !copy.canCopy && 'cursor-not-allowed bg-glass-2 text-ink-3 hover:bg-glass-2',
          )}
        >
          {copy.state === 'copied' ? (
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          ) : copy.state === 'failed' ? (
            <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="whitespace-nowrap">
            {copy.canCopy ? copy.label : '不可复制'}
          </span>
        </button>

        {/* 码格式异常时把原因写在明处，而不是只让按钮变灰 */}
        {!copy.canCopy && (
          <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">{UNCOPYABLE_CODE_HINT}</p>
        )}

        {/* 复制结果的无障碍播报：视觉上的按钮变色对读屏用户不可见 */}
        <span role="status" aria-live="polite" className="sr-only">
          {copy.canCopy && copy.state === 'copied' && '改枪码已复制到剪贴板'}
          {copy.canCopy && copy.state === 'failed' && '复制失败，请手动选中改枪码后复制'}
          {!copy.canCopy && UNCOPYABLE_CODE_HINT}
        </span>

        {/*
         * 能力边界的诚实声明。站点没有游戏侧验证能力，
         * 所以**不断言这码能导入**——只说明它未被验证、需游戏内确认。
         */}
        <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
          <ProvenanceIcon
            className={cn(
              'mt-0.5 h-3.5 w-3.5 shrink-0',
              provenance.demo && 'text-accent',
              provenance.playerSubmission && 'text-signal',
            )}
            aria-hidden="true"
          />
          <span>
            {provenance.demo
              ? '这是演示条目，不是玩家投稿；改枪码与计数仅用于界面演示，请勿当作可用方案。'
              : provenance.playerSubmission
                ? '改枪码由玩家投稿并经人工审核入库；站点仍无法在游戏内验证其有效性，也无法确认导入兼容性。请复制后自行确认。'
                : '这条例目的来源没有可确认记录（不是已标记的玩家投稿）；站点不声称已验证。请复制后自行确认。'}
          </span>
        </p>

        {/*
         * UI-014 STEP 3：核验状态要说清楚"哪几件事是分开成立的"。
         *
         * 这四条不是修辞，是本站的**证据边界**：库里有一行 ≠ 有玩家用过；
         * 字符格式过了入库校验 ≠ 游戏内能导入；审核通过 ≠ 客户端验证通过；
         * 单账号导入成功 ≠ 跨账号、跨服务器可用。`build_codes`（唯一能表达
         * PC_IMPORT_PASS 的那一层）既没有部署在生产库上，也不在
         * GET /api/builds 的读模型里，所以这里**不给任何一行编差异化结论**，
         * 只陈述对所有行都成立的同一组事实 —— 唯一逐行变化的是字符格式那一格，
         * 因为那是本地就能测出来的（`copy.canCopy`）。
         *
         * 做成 <details> 而不是一屏说明文字：默认收起（不违背极简与低视觉负担），
         * 但键盘可达、读屏可达，且展开后是完整四条。
         */}
        <details className="mt-3 rounded-hud border border-hairline bg-glass px-3.5 py-2.5">
          <summary className="cursor-pointer list-none text-[12px] font-medium text-ink-2">
            这条改枪码的核验状态
          </summary>
          <ul className="mt-2.5 space-y-1.5 text-[12px] leading-relaxed text-ink-3">
            <li>
              {copy.canCopy
                ? '字符格式：通过入库校验（长度与无空白）。这是格式检查，不是游戏内有效性检查。'
                : UNCOPYABLE_CODE_HINT}
            </li>
            <li>游戏内导入：未经 PC 客户端核验 —— 本站没有这条码的任何客户端导入记录。</li>
            <li>审核与上架：审核通过不等于客户端验证通过，两道门是分开的。</li>
            <li>适用范围：单账号可用不等于跨账号可用；跨服务器兼容性未测试，状态是 UNKNOWN。</li>
          </ul>
        </details>
      </motion.section>

      {/* ============================================ 方案读数 */}
      <motion.div
        variants={riseConverge}
        className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-hairline py-3 text-[12px] text-ink-3"
      >
        <span>
          预估造价{' '}
          <strong className="font-mono font-normal text-ink-2">
            ~{formatCoins(build.estimated_cost)}
          </strong>{' '}
          自报
        </span>
        <span>
          点赞{' '}
          <strong className="font-mono font-normal text-ink-2">
            {formatCount(build.likes_count)}
          </strong>
        </span>
        <span>
          复制点击次数{' '}
          <strong className="font-mono font-normal text-ink-2">
            {formatCount(build.copies_count)}
          </strong>
        </span>
        <span>
          评论{' '}
          <strong className="font-mono font-normal text-ink-2">
            {formatCount(build.comments_count)}
          </strong>
        </span>
      </motion.div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
        {provenance.demo
          ? '演示数据：点赞 / 复制为样例基线，评论为本地夹具，均不代表玩家行为，也不表示有人在 PC 客户端导入成功。'
          : '站内动作计数：复制按点击累计、未登录点赞不去重，起点可能含样例基线；不代表客户端验证。它们都不表示有人在 PC 客户端导入成功。'}
      </p>

      {/* ============================================ 完整说明 */}
      {build.description && (
        <motion.section
          variants={riseConverge}
          className="tactical-card mt-5 p-6 lg:p-7"
          aria-label="改装思路与建议子弹"
        >
          <h2 className="hud-label">改装思路与建议子弹</h2>
          {/* whitespace-pre-line：种子数据里的说明用 \n 分段，
              不保留换行会挤成一大坨，正好丢掉"建议子弹"那行的可读性 */}
          <p className="mt-4 whitespace-pre-line text-[15px] leading-[1.75] text-ink-2">
            {build.description}
          </p>
        </motion.section>
      )}

      <motion.p
        variants={riseConverge}
        className="mt-5 border-t border-hairline pt-4 text-[11px] leading-relaxed text-ink-3"
      >
        配件与实测属性未接入；站点不显示未经核实的数值。
      </motion.p>

      {/* ============================================ 标签与点赞 */}
      <motion.div variants={riseConverge} className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {build.tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                'rounded-hud border border-hairline/60 bg-white/[0.03] px-2.5 py-1',
                'text-[12px] font-medium text-ink-2',
                `transition-colors duration-300 ${EASE} hover:border-hairline-2 hover:text-ink`,
              )}
            >
              #{tag}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={like.like}
          disabled={like.pending}
          aria-pressed={like.liked}
          className={cn(
            'press flex items-center gap-2 rounded-hud border px-4 py-2',
            'text-[13px] font-semibold',
            `transition-all duration-300 ${EASE}`,
            'disabled:cursor-wait disabled:opacity-60',
            like.liked
              ? 'border-danger/45 bg-danger/12 text-danger'
              : 'border-hairline text-ink-2 hover:border-danger/45 hover:text-danger',
          )}
        >
          <Heart
            className={cn('h-4 w-4 transition-transform duration-300', like.liked && 'scale-110 fill-current')}
            aria-hidden="true"
          />
          {like.failed ? '点赞失败，重试' : like.liked ? '已点赞' : '点赞'}
          <span className="hud-readout">{formatCount(build.likes_count)}</span>
        </button>
      </motion.div>

      {/* ============================================ 评论区 */}
      <CommentSection buildId={build.id} onCommentAdded={onCommentAdded} />
    </motion.article>
  );
}

/* ------------------------------------------------------------------ 子组件 */

function BackLink() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        // 有历史记录就回退（保留用户原来的筛选条件），
        // 直接打开链接进来的则回首页
        if (window.history.length > 1) navigate(-1);
        else navigate('/');
      }}
      className={cn(
        'press flex items-center gap-1.5 rounded-hud border border-hairline px-3.5 py-2',
        'text-[13px] font-medium text-ink-2',
        `transition-all duration-300 ${EASE} hover:border-hud hover:text-hud`,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      返回方案列表
    </button>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-6" aria-hidden="true">
      <div className="tactical-card p-6">
        <div className="skeleton h-3 w-32 rounded-hud" />
        <div className="mt-6 flex gap-4">
          <div className="skeleton h-14 w-20 rounded-hud" />
          <div className="flex-1">
            <div className="skeleton h-3 w-14 rounded-hud" />
            <div className="skeleton mt-2 h-5 w-28 rounded-hud" />
          </div>
        </div>
        <div className="skeleton mt-7 h-9 w-3/4 rounded-hud" />
      </div>
      <div className="skeleton mt-5 h-[188px] rounded-hud" />
      <div className="mt-5 flex gap-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-4 w-20 rounded" />
        ))}
      </div>
      <div className="skeleton mt-5 h-40 rounded-hud" />
      <div className="mt-6 flex items-center gap-2 text-[13px] text-ink-3">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
        评论区加载中…
      </div>
    </div>
  );
}
