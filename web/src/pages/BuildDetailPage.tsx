import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Heart,
  LayoutGrid,
  MessageSquare,
  Monitor,
  PackageOpen,
  Smartphone,
  Terminal,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { CommentSection } from '../components/CommentSection';
import { useAppShell } from '../lib/appShell';
import { ApiError, fetchBuildById } from '../lib/api';
import { cn } from '../lib/cn';
import { formatCoins, formatCount, formatRelativeTime, PLATFORM_LABEL } from '../lib/format';
import { useCopyCode } from '../hooks/useCopyCode';
import { useLikeBuild } from '../hooks/useLikeBuild';
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
    <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6 lg:py-12">
      <BackLink />

      {loading && <DetailSkeleton />}

      {!loading && error && (
        <div
          role="alert"
          className="mt-6 flex flex-col items-center rounded-card border border-hairline bg-glass px-6 py-20 text-center"
        >
          <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-glass-2">
            <PackageOpen className="h-8 w-8 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p className="mt-5 text-[17px] font-semibold tracking-[-0.022em] text-ink">
            {error.code === 'BUILD_NOT_FOUND' ? '这个改枪方案不存在或已下架' : '方案加载失败'}
          </p>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">{error.message}</p>
          <code className="mt-4 rounded-[10px] bg-black/40 px-3 py-1.5 font-mono text-[11px] text-ink-3">
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
 * 拆成独立组件是必要的：`useCopyCode` / `useLikeBuild` 都依赖已加载的方案数据，
 * 而 hooks 不能写在 `build === null` 的条件分支里。
 * 由父组件在数据就绪后才渲染本组件，hooks 调用顺序才是稳定的。
 */
function BuildDetail({ build, onPatch, onCommentAdded }: BuildDetailProps) {
  const copy = useCopyCode({
    buildId: build.id,
    code: build.code,
    copiesCount: build.copies_count,
    onPatch,
  });

  const like = useLikeBuild({
    buildId: build.id,
    likesCount: build.likes_count,
    onPatch,
  });

  const PlatformIcon = PLATFORM_ICON[build.platform];

  return (
    <article className="mt-6">
      {/* ------------------------------------------------ 头部信息 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[9px] bg-accent/16 px-2.5 py-1 font-mono text-[13px] font-bold tracking-tight text-accent">
          {build.gun.name}
        </span>
        <span className="rounded-[9px] bg-glass-2 px-2.5 py-1 text-[11px] font-medium text-ink-2">
          {build.gun.category_name}
        </span>
        <span className="flex items-center gap-1 rounded-[9px] bg-glass-2 px-2.5 py-1 text-[11px] font-medium text-ink-2">
          <PlatformIcon className="h-3 w-3" aria-hidden="true" />
          {PLATFORM_LABEL[build.platform] ?? build.platform}
        </span>

        <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-3">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatRelativeTime(build.created_at)}
        </span>
      </div>

      <h1 className="mt-4 text-[30px] font-semibold leading-[1.15] tracking-[-0.028em] text-ink lg:text-[38px]">
        {build.title}
      </h1>

      {/* ------------------------------------------------ 改枪码（详情页放大版） */}
      <div className="mt-6 flex flex-col gap-2.5 rounded-card border border-hairline bg-glass p-4 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1 rounded-panel bg-black/35 p-3.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            <Terminal className="h-3 w-3" aria-hidden="true" />
            改枪码
            <span className="ml-auto font-mono normal-case tracking-normal">
              {build.code.length} 位
            </span>
          </div>
          <code className="mt-2 block select-all break-all font-mono text-[15px] leading-7 text-ink">
            {build.code}
          </code>
        </div>

        <button
          type="button"
          onClick={copy.copy}
          className={cn(
            'press flex shrink-0 items-center justify-center gap-2 rounded-control px-6 py-4',
            'text-[15px] font-semibold sm:flex-col sm:px-7',
            `transition-all duration-300 ${EASE}`,
            copy.state === 'copied' && 'animate-copy-pop bg-signal text-black',
            copy.state === 'failed' && 'bg-danger text-white',
            copy.state === 'idle' &&
              'bg-accent text-black hover:bg-accent-2 hover:shadow-[0_8px_26px_rgb(255_159_10_/_0.42)]',
          )}
        >
          {copy.state === 'copied' ? (
            <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
          ) : copy.state === 'failed' ? (
            <X className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
          ) : (
            <Copy className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="whitespace-nowrap">{copy.label}</span>
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {copy.state === 'copied' && '改枪码已复制到剪贴板'}
        {copy.state === 'failed' && '复制失败，请手动选中改枪码后复制'}
      </span>

      {/* ------------------------------------------------ 关键数据 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBlock label="预估造价" value={`~${formatCoins(build.estimated_cost)}`} accent />
        <StatBlock label="点赞" value={formatCount(build.likes_count)} />
        <StatBlock label="复制次数" value={formatCount(build.copies_count)} />
        <StatBlock label="评论" value={formatCount(build.comments_count)} />
      </div>

      {/* ------------------------------------------------ 完整说明 */}
      {build.description && (
        <section className="mt-6 rounded-card border border-hairline bg-glass p-6">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            改装思路与建议子弹
          </h2>
          {/* whitespace-pre-line：种子数据里的说明用 \n 分段，
              不保留换行会挤成一大坨，正好丢掉"建议子弹"那行的可读性 */}
          <p className="mt-3 whitespace-pre-line text-[15px] leading-[1.75] text-ink-2">
            {build.description}
          </p>
        </section>
      )}

      {/* ------------------------------------------------ 标签与互动 */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {build.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-chip bg-glass px-3 py-1.5 text-[12px] font-medium text-ink-2"
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
            'press flex items-center gap-2 rounded-chip px-4 py-2',
            'text-[13px] font-semibold',
            `transition-all duration-300 ${EASE}`,
            'disabled:cursor-wait disabled:opacity-60',
            like.liked
              ? 'bg-danger/16 text-danger'
              : 'bg-glass text-ink-2 hover:bg-glass-2 hover:text-danger',
          )}
        >
          <Heart
            className={cn('h-4 w-4', like.liked && 'scale-110 fill-current')}
            aria-hidden="true"
          />
          {like.failed ? '点赞失败，重试' : like.liked ? '已点赞' : '点赞'}
          <span className="font-mono">{formatCount(build.likes_count)}</span>
        </button>
      </div>

      {/* ------------------------------------------------ 评论区 */}
      <CommentSection buildId={build.id} onCommentAdded={onCommentAdded} />
    </article>
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
        'press flex items-center gap-1.5 rounded-chip bg-glass px-3.5 py-2',
        'text-[13px] font-medium text-ink-2',
        `transition-all duration-300 ${EASE} hover:bg-glass-2 hover:text-ink`,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      返回方案列表
    </button>
  );
}

function StatBlock({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-panel border border-hairline bg-glass px-4 py-3.5">
      <div className="text-[11px] font-medium text-ink-3">{label}</div>
      <div
        className={cn(
          'mt-1.5 font-mono text-[15px] font-semibold tracking-tight',
          accent ? 'text-accent' : 'text-ink',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-6" aria-hidden="true">
      <div className="flex gap-2">
        <div className="skeleton h-6 w-16 rounded-[9px]" />
        <div className="skeleton h-6 w-20 rounded-[9px]" />
      </div>
      <div className="skeleton mt-4 h-9 w-3/4 rounded-lg" />
      <div className="skeleton mt-6 h-32 w-full rounded-card" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-[72px] rounded-panel" />
        ))}
      </div>
      <div className="skeleton mt-6 h-40 w-full rounded-card" />
      <div className="mt-6 flex items-center gap-2 text-[13px] text-ink-3">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
        评论区加载中…
      </div>
    </div>
  );
}
