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
    setBuild((prev) =>
      prev ? { ...prev, comments_count: prev.comments_count + 1 } : prev,
    );
    notify({ text: '评论已发表。' });
  }, [notify]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 lg:px-6 lg:py-8">
      <BackLink />

      {loading && <DetailSkeleton />}

      {!loading && error && (
        <div
          role="alert"
          className="clip-tactical mt-4 flex flex-col items-center border border-line bg-surface/50 px-6 py-16 text-center"
        >
          <PackageOpen className="h-10 w-10 text-dim" strokeWidth={1.5} aria-hidden="true" />
          <p className="mt-4 text-sm font-semibold text-ink">
            {error.code === 'BUILD_NOT_FOUND' ? '这个改枪方案不存在或已下架' : '方案加载失败'}
          </p>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted">{error.message}</p>
          <code className="mt-3 rounded border border-line bg-void/70 px-2 py-1 font-mono text-[11px] text-dim">
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
    <article className="mt-4">
      {/* ------------------------------------------------ 头部信息 */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded border border-tactical/45 bg-tactical/12 px-2 py-0.5',
            'font-mono text-xs font-bold tracking-wide text-tactical',
          )}
        >
          {build.gun.name}
        </span>

        <span className="rounded border border-line bg-raised/80 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
          {build.gun.category_name}
        </span>

        <span className="flex items-center gap-1 rounded border border-line bg-raised/80 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
          <PlatformIcon className="h-3 w-3" aria-hidden="true" />
          {PLATFORM_LABEL[build.platform] ?? build.platform}
        </span>

        <span className="ml-auto flex items-center gap-1 text-[11px] text-dim">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatRelativeTime(build.created_at)}
        </span>
      </div>

      <h1 className="mt-3 text-xl font-bold leading-snug tracking-tight text-ink lg:text-2xl">
        {build.title}
      </h1>

      {/* ------------------------------------------------ 改枪码（详情页放大版） */}
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-tactical/30 bg-void/70 p-3 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
            <Terminal className="h-3 w-3" aria-hidden="true" />
            改枪码
            <span className="ml-auto font-mono normal-case tracking-normal">
              {build.code.length} 位
            </span>
          </div>
          <code className="mt-1.5 block select-all break-all font-mono text-sm leading-6 text-ink">
            {build.code}
          </code>
        </div>

        <button
          type="button"
          onClick={copy.copy}
          className={cn(
            'flex shrink-0 items-center justify-center gap-2 rounded-lg px-5 py-3',
            'text-sm font-bold transition-colors duration-150 sm:flex-col sm:px-6',
            copy.state === 'copied' && 'animate-copy-pop bg-signal text-void',
            copy.state === 'failed' && 'bg-danger text-ink',
            copy.state === 'idle' &&
              'bg-tactical text-void hover:bg-tactical-deep hover:text-ink',
          )}
        >
          {copy.state === 'copied' ? (
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          ) : copy.state === 'failed' ? (
            <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
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
        <section className="mt-5 rounded-xl border border-line bg-surface/50 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-dim">改装思路与建议子弹</h2>
          {/* whitespace-pre-line：种子数据里的说明用 \n 分段，
              不保留换行会挤成一大坨，正好丢掉"建议子弹"那行的可读性 */}
          <p className="mt-2.5 whitespace-pre-line text-sm leading-7 text-muted">
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
              className="rounded-full border border-line bg-raised/60 px-2.5 py-1 text-[11px] font-medium text-muted"
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
            'flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-bold',
            'transition-colors duration-150 disabled:cursor-wait disabled:opacity-60',
            like.liked
              ? 'border-danger/50 bg-danger/10 text-danger'
              : 'border-line bg-surface/60 text-muted hover:border-danger/40 hover:text-danger',
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
      className="flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-tactical"
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
    <div className="rounded-lg border border-line bg-surface/50 px-3 py-2.5">
      <div className="text-[10px] font-medium text-dim">{label}</div>
      <div
        className={cn(
          'mt-1 font-mono text-sm font-bold',
          accent ? 'text-tactical' : 'text-ink',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-4" aria-hidden="true">
      <div className="flex gap-2">
        <div className="skeleton h-5 w-16 rounded" />
        <div className="skeleton h-5 w-20 rounded" />
      </div>
      <div className="skeleton mt-3 h-7 w-3/4 rounded" />
      <div className="skeleton mt-4 h-24 w-full rounded-xl" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-16 rounded-lg" />
        ))}
      </div>
      <div className="skeleton mt-5 h-32 w-full rounded-xl" />
      <div className="mt-5 flex items-center gap-2 text-xs text-dim">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
        评论区加载中…
      </div>
    </div>
  );
}
