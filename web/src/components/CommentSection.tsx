import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, CircleAlert, Info, Loader2, LogIn, MessageSquare, Send } from 'lucide-react';

import { useAppShell } from '../lib/appShell';
import { useAuth } from '../lib/auth';
import {
  ApiError,
  createComment,
  fetchComments,
  isPreviewReadOnly,
  isPreviewReadOnlyError,
  notifyPreviewBlocked,
  PREVIEW_READ_ONLY_MESSAGE,
  USE_MOCK,
} from '../lib/apiPublic';
import { cn } from '../lib/cn';
import { formatRelativeTime } from '../lib/format';
import { riseConverge } from '../lib/hudMotion';
import { COMMENT_MAX_LENGTH } from '../types/api';
import type { CommentDTO, Pagination } from '../types/api';

const PAGE_SIZE = 20;
const EASE = 'ease-[cubic-bezier(0.25,1,0.5,1)]';

export interface CommentSectionProps {
  buildId: string;
  /** 发表成功后通知父级把 comments_count +1（后端由触发器维护，前端只是同步显示） */
  onCommentAdded: () => void;
}

/**
 * 评论区。
 *
 * UI-005 是**纯样式**改动：下面两个 useEffect、`loadMore`、`handleSubmit`
 * 以及所有 `aria-label` / `role` / 文案一字未动。
 *
 * ⚠️ 这些是 e2e 直接依赖的选择器，改样式时不能碰：
 *   - `getByText('登录后即可发表评论与点赞')`
 *   - `getByRole('textbox', { name: '评论内容' })`（未登录时必须**不存在**）
 *   - `getByRole('button', { name: '发表评论' })`
 *   - `getByText(评论内容)` —— 新发表的评论要能在 DOM 里找到
 *   - `role="alert"` 的**数量**：方案详情页只在错误态用 1 个，
 *     这里两个 alert 都只在出错时才渲染，所以正常路径上不会撞 strict mode。
 *
 * 没有新增任何指标：不显示点赞数、声望、活跃度、在线状态 ——
 * `CommentDTO` 里也没有这些字段，摆出来只能是编的。
 */
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

      if (isPreviewReadOnly()) {
        notifyPreviewBlocked('发表评论');
        setSubmitError(PREVIEW_READ_ONLY_MESSAGE);
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
        } else if (isPreviewReadOnlyError(err)) {
          setSubmitError(err.message);
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
    /*
     * `variants` 不配 `initial`/`animate` —— 它从 BuildDetail 那层的
     * `staggerContainer` 继承，所以整节跟着页面一起揭示，不需要自己编排。
     * 评论条目**不做逐条动画**：列表是异步追加的，逐条入场会在"加载更多"时
     * 让整片文字跳动，而这里要的只是可读的社区交流。
     */
    <motion.section aria-label="评论区" variants={riseConverge} className="mt-14">
      <h2 className="flex items-center gap-2.5 text-[20px] font-semibold tracking-[-0.026em] text-ink lg:text-[24px]">
        <MessageSquare className="h-4 w-4 text-hud" aria-hidden="true" />
        评论
        {pagination && (
          <span className="hud-readout text-[13px] font-normal text-ink-3">{pagination.total}</span>
        )}
      </h2>

      {USE_MOCK && (
        <p className="mt-3 flex items-start gap-2 rounded-hud border border-accent/25 bg-accent/[0.04] px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          演示评论：以下内容来自内置 Mock 数据，不是真实玩家留言。
        </p>
      )}

      {/* ------------------------------------------------ 发表评论 */}
      {user ? (
        <form onSubmit={handleSubmit} className="mt-5">
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
              'hud-field min-h-[92px] resize-y px-4 py-3 text-[14px] leading-relaxed',
              submitError && 'border-danger/60 focus:border-danger',
            )}
          />

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span
              className={cn(
                'hud-readout text-[11px]',
                remaining < 0 ? 'text-danger' : remaining < 50 ? 'text-accent' : 'text-ink-3',
              )}
            >
              {remaining}
            </span>

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'btn-hud press !px-4 !py-2 !text-[12px] !tracking-[0.14em]',
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
                'mt-2.5 flex items-start gap-1.5 rounded-hud border border-danger/35',
                'bg-danger/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-2',
                EASE,
              )}
            >
              <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
              {submitError}
            </p>
          )}
        </form>
      ) : (
        /* 未登录时不展示表单：让用户填完再被 401 打回来是纯粹的浪费。
           直接给出登录入口，语义更清楚。 */
        <div className="tactical-panel-quiet mt-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <span className="text-[13px] text-ink-2">登录后即可发表评论与点赞</span>
          <button
            type="button"
            onClick={openAuth}
            className="btn-hud press !px-4 !py-2 !text-[12px] !tracking-[0.14em]"
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
              <div key={i} className="tactical-panel-quiet p-4">
                <div className="skeleton h-3 w-24 rounded-hud" />
                <div className="skeleton mt-3 h-3 w-full rounded-hud" />
                <div className="skeleton mt-2 h-3 w-2/3 rounded-hud" />
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
          <p className="rounded-hud border border-dashed border-hairline bg-black/25 px-4 py-12 text-center text-[13px] text-ink-3">
            还没有评论，来说说这套改枪的实际手感吧。
          </p>
        )}

        {!loading && !listError && comments.length > 0 && (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                /*
                 * 左侧一道 2px 冷光边是这一节唯一的"几何"—— 它把每条发言
                 * 串成一条讨论线，读起来像同一份档案的批注，而不是 telemetry。
                 * 刻意不加序号、时间轴刻度或任何数字。
                 */
                className="tactical-panel-quiet border-l-2 border-l-hud/25 px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] font-semibold text-ink-2">
                    {comment.author?.nickname ?? '匿名指挥官'}
                  </span>
                  <span className="hud-readout shrink-0 text-[11px] text-ink-3">
                    {formatRelativeTime(comment.created_at)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-relaxed text-ink">
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
              'press mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-hud',
              'border border-hairline bg-white/[0.03] py-2.5 text-[13px] font-semibold text-ink-2',
              `transition-all duration-300 ${EASE} hover:border-hud hover:text-hud`,
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
    </motion.section>
  );
}
