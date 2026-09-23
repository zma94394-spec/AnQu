import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, CircleAlert, Loader2, MessageSquare, Send } from 'lucide-react';

import { ApiError, createComment, fetchComments } from '../lib/api';
import { cn } from '../lib/cn';
import { formatRelativeTime } from '../lib/format';
import { COMMENT_MAX_LENGTH } from '../types/api';
import type { CommentDTO, Pagination } from '../types/api';

const PAGE_SIZE = 20;

export interface CommentSectionProps {
  buildId: string;
  /** 发表成功后通知父级把 comments_count +1（后端由触发器维护，前端只是同步显示） */
  onCommentAdded: () => void;
}

export function CommentSection({ buildId, onCommentAdded }: CommentSectionProps) {
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** 是否因未登录而被拒。与普通失败区分开，因为这不是"出错了"而是"缺前置条件" */
  const [needsAuth, setNeedsAuth] = useState(false);

  /* -------------------------------------------------------- 拉取列表 */

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setListError(null);

    fetchComments(buildId, 1, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        setComments(res.items);
        setPagination(res.pagination);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setListError(err instanceof Error ? err.message : '评论加载失败');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildId]);

  const loadMore = useCallback(async () => {
    if (!pagination?.has_next || loadingMore) return;

    setLoadingMore(true);
    try {
      const next = await fetchComments(buildId, pagination.page + 1, PAGE_SIZE);
      // 追加而不是覆盖，并去重防止重复点击导致同一条评论出现两次
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...next.items.filter((c) => !seen.has(c.id))];
      });
      setPagination(next.pagination);
    } catch (err) {
      setListError(err instanceof Error ? err.message : '加载更多失败');
    } finally {
      setLoadingMore(false);
    }
  }, [buildId, loadingMore, pagination]);

  /* ---------------------------------------------------------- 提交 */

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (submitting) return;

      const trimmed = content.trim();
      if (trimmed.length === 0) {
        setSubmitError('评论不能为空');
        return;
      }
      // 与后端 createCommentBodySchema 的 .max(500) 对齐
      if (trimmed.length > COMMENT_MAX_LENGTH) {
        setSubmitError(`评论最多 ${COMMENT_MAX_LENGTH} 个字符（当前 ${trimmed.length}）`);
        return;
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        const created = await createComment(buildId, trimmed);
        setComments((prev) => [created, ...prev]);
        setContent('');
        setNeedsAuth(false);
        onCommentAdded();
      } catch (err) {
        // ⚠️ 后端该端点挂了 requireAuth，未登录返回 401 AUTH_REQUIRED。
        // 这必须与"网络失败/服务器错误"区别对待 —— 前者是缺前置条件，
        // 提示用户"重试"是没意义的，只会让人反复点。
        if (err instanceof ApiError && err.code === 'AUTH_REQUIRED') {
          setNeedsAuth(true);
          setSubmitError('发表评论需要先登录。');
        } else if (err instanceof ApiError) {
          setSubmitError(err.message);
        } else {
          setSubmitError('提交失败，请稍后重试。');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [buildId, content, onCommentAdded, submitting],
  );

  const remaining = COMMENT_MAX_LENGTH - content.length;

  return (
    <section aria-label="评论区" className="mt-6">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
        <MessageSquare className="h-4 w-4 text-tactical" aria-hidden="true" />
        评论
        {pagination && (
          <span className="font-mono text-xs font-normal text-dim">{pagination.total}</span>
        )}
      </h2>

      {/* ------------------------------------------------ 发表评论 */}
      <form onSubmit={handleSubmit} className="mt-3">
        <textarea
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            if (submitError) setSubmitError(null);
          }}
          rows={3}
          maxLength={COMMENT_MAX_LENGTH + 50}
          placeholder="说说这套改枪的实际手感，或者补充一句子弹建议…"
          aria-label="评论内容"
          className={cn(
            'w-full rounded-lg border border-line bg-void/60 px-3 py-2.5',
            'text-sm leading-relaxed text-ink placeholder:text-dim',
            'transition-colors hover:border-line-strong focus:border-tactical/60 focus:outline-none',
          )}
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <span
            className={cn(
              'font-mono text-[11px]',
              remaining < 0 ? 'text-danger' : remaining < 50 ? 'text-tactical' : 'text-dim',
            )}
          >
            {remaining}
          </span>

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'flex items-center gap-1.5 rounded-md bg-tactical px-3.5 py-1.5',
              'text-xs font-bold text-void transition-colors',
              'hover:bg-tactical-deep hover:text-ink',
              'disabled:cursor-wait disabled:opacity-60',
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                提交中…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                发表评论
              </>
            )}
          </button>
        </div>

        {submitError && (
          <p
            role="alert"
            className={cn(
              'mt-2 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-[11px] leading-relaxed',
              needsAuth
                ? 'border-tactical/40 bg-tactical/8 text-muted'
                : 'border-danger/35 bg-danger/8 text-muted',
            )}
          >
            <CircleAlert
              className={cn('mt-px h-3.5 w-3.5 shrink-0', needsAuth ? 'text-tactical' : 'text-danger')}
              aria-hidden="true"
            />
            <span>
              {submitError}
              {needsAuth && (
                <span className="mt-0.5 block text-dim">
                  本站的登录功能尚未接入，当前可以正常浏览评论。接入 Supabase Auth
                  后此处会显示登录按钮，无需改动其他逻辑。
                </span>
              )}
            </span>
          </p>
        )}
      </form>

      {/* ------------------------------------------------ 评论列表 */}
      <div className="mt-5">
        {loading && (
          <div className="space-y-3" aria-hidden="true">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface/40 p-3.5">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton mt-2.5 h-3 w-full rounded" />
                <div className="skeleton mt-1.5 h-3 w-2/3 rounded" />
              </div>
            ))}
          </div>
        )}

        {!loading && listError && (
          <p role="alert" className="text-xs text-danger">
            {listError}
          </p>
        )}

        {!loading && !listError && comments.length === 0 && (
          <p className="rounded-lg border border-dashed border-line bg-surface/40 px-4 py-8 text-center text-xs text-dim">
            还没有评论，来说说这套改枪的实际手感吧。
          </p>
        )}

        {!loading && !listError && comments.length > 0 && (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border border-line bg-surface/50 px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted">
                    {comment.author?.nickname ?? '匿名指挥官'}
                  </span>
                  <span className="shrink-0 text-[11px] text-dim">
                    {formatRelativeTime(comment.created_at)}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink">
                  {comment.content}
                </p>
              </li>
            ))}
          </ul>
        )}

        {pagination?.has_next && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className={cn(
              'mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line',
              'bg-surface/50 py-2 text-xs font-semibold text-muted transition-colors',
              'hover:border-line-strong hover:text-ink disabled:opacity-50',
            )}
          >
            {loadingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            加载更多评论
          </button>
        )}
      </div>
    </section>
  );
}
