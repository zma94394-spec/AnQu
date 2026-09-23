import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, CircleAlert, Loader2, LogIn, MessageSquare, Send } from 'lucide-react';

import { useAppShell } from '../lib/appShell';
import { useAuth } from '../lib/auth';
import { ApiError, createComment, fetchComments } from '../lib/api';
import { cn } from '../lib/cn';
import { formatRelativeTime } from '../lib/format';
import { COMMENT_MAX_LENGTH } from '../types/api';
import type { CommentDTO, Pagination } from '../types/api';

const PAGE_SIZE = 20;
const EASE = 'ease-[cubic-bezier(0.25,1,0.5,1)]';

export interface CommentSectionProps {
  buildId: string;
  /** 发表成功后通知父级把 comments_count +1（后端由触发器维护，前端只是同步显示） */
  onCommentAdded: () => void;
}

export function CommentSection({ buildId, onCommentAdded }: CommentSectionProps) {
  const { openAuth } = useAppShell();
  const { user } = useAuth();

  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        onCommentAdded();
      } catch (err) {
        // ⚠️ 后端该端点挂了 requireAuth，未登录返回 401 AUTH_REQUIRED。
        // 这必须与"网络失败/服务器错误"区别对待 —— 前者是缺前置条件，
        // 提示用户"重试"是没意义的，只会让人反复点。
        if (err instanceof ApiError && err.code === 'AUTH_REQUIRED') {
          setSubmitError('登录状态已失效，请重新登录后再发表评论。');
          openAuth();
        } else if (err instanceof ApiError) {
          setSubmitError(err.message);
        } else {
          setSubmitError('提交失败，请稍后重试。');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [buildId, content, onCommentAdded, openAuth, submitting],
  );

  const remaining = COMMENT_MAX_LENGTH - content.length;

  return (
    <section aria-label="评论区" className="mt-8">
      <h2 className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.022em] text-ink">
        <MessageSquare className="h-4 w-4 text-accent" aria-hidden="true" />
        评论
        {pagination && (
          <span className="font-mono text-[13px] font-normal text-ink-3">{pagination.total}</span>
        )}
      </h2>

      {/* ------------------------------------------------ 发表评论 */}
      {user ? (
        <form onSubmit={handleSubmit} className="mt-4">
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
              'w-full rounded-panel border border-hairline bg-glass px-4 py-3',
              'text-[14px] leading-relaxed text-ink placeholder:text-ink-3',
              `transition-all duration-300 ${EASE}`,
              'hover:bg-glass-2 focus:border-hairline-2 focus:bg-glass-2 focus:outline-none',
            )}
          />

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span
              className={cn(
                'font-mono text-[11px]',
                remaining < 0 ? 'text-danger' : remaining < 50 ? 'text-accent' : 'text-ink-3',
              )}
            >
              {remaining}
            </span>

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'press flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2',
                'text-[13px] font-semibold text-black',
                `transition-all duration-300 ${EASE}`,
                'hover:bg-accent-2 hover:shadow-[0_6px_20px_rgb(255_159_10_/_0.4)]',
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
              className="mt-2.5 flex items-start gap-1.5 rounded-panel border border-danger/30 bg-danger/8 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-2"
            >
              <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
              {submitError}
            </p>
          )}
        </form>
      ) : (
        /* 未登录时不展示表单：让用户填完再被 401 打回来是纯粹的浪费。
           直接给出登录入口，语义更清楚。 */
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-hairline bg-glass px-4 py-3.5">
          <span className="text-[13px] text-ink-2">登录后即可发表评论与点赞</span>
          <button
            type="button"
            onClick={openAuth}
            className={cn(
              'press flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2',
              'text-[13px] font-semibold text-black',
              `transition-all duration-300 ${EASE} hover:bg-accent-2`,
            )}
          >
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
            登录
          </button>
        </div>
      )}

      {/* ------------------------------------------------ 评论列表 */}
      <div className="mt-6">
        {loading && (
          <div className="space-y-3" aria-hidden="true">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="rounded-panel border border-hairline bg-glass p-4">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton mt-3 h-3 w-full rounded" />
                <div className="skeleton mt-2 h-3 w-2/3 rounded" />
              </div>
            ))}
          </div>
        )}

        {!loading && listError && (
          <p role="alert" className="text-[13px] text-danger">
            {listError}
          </p>
        )}

        {!loading && !listError && comments.length === 0 && (
          <p className="rounded-panel border border-dashed border-hairline bg-glass/60 px-4 py-10 text-center text-[13px] text-ink-3">
            还没有评论，来说说这套改枪的实际手感吧。
          </p>
        )}

        {!loading && !listError && comments.length > 0 && (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-panel border border-hairline bg-glass px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-ink-2">
                    {comment.author?.nickname ?? '匿名指挥官'}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3">
                    {formatRelativeTime(comment.created_at)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink">
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
              'press mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-panel',
              'bg-glass py-2.5 text-[13px] font-semibold text-ink-2',
              `transition-all duration-300 ${EASE} hover:bg-glass-2 hover:text-ink`,
              'disabled:opacity-50',
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
