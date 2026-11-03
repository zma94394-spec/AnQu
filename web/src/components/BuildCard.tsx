import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Clock, Copy, Heart, MessageSquare, X } from 'lucide-react';

import { SourceBadge } from './SourceBadge';
import { useCopyCode } from '../hooks/useCopyCode';
import { useLikeBuild } from '../hooks/useLikeBuild';
import { USE_MOCK } from '../lib/apiPublic';
import { buildProvenanceOf } from '../lib/buildProvenance';
import { cn } from '../lib/cn';
import { UNCOPYABLE_CODE_HINT } from '../lib/buildCode';
import { monogramOf } from '../lib/gunCatalog';
import { formatCoinsCompact, formatCount, formatRelativeTime } from '../lib/format';
import { riseConverge } from '../lib/hudMotion';
import { EASE } from '../lib/styles';
import type { BuildDTO } from '../types/api';

export interface BuildCardProps {
  build: BuildDTO;
  /** 计数回写。卡片内部做乐观更新，避免为一次 +1 重取整页 */
  onPatch: (id: string, patch: Partial<Pick<BuildDTO, 'likes_count' | 'copies_count'>>) => void;
  /** 入场动画的错峰序号 */
  index?: number;
}

/**
 * 方案卡。
 *
 * 视觉上收成一块「记录」：枪械铭牌 + 标题 + 说明 + 改枪码 + 来源/计数。
 * 没有枪图时不画假图，用真实名称派生的字头做中性铭牌。
 *
 * 功能契约保持不变：根节点必须是 `article`、标题必须是 `article > h3 > a`、
 * 复制按钮文案 `复制改枪码` / `已复制！`、点赞 `aria-pressed`、造价「自报」。
 * 圆角由 `.tactical-card` 固定为 3px，视觉基线用例依赖这一点。
 */
export function BuildCard({ build, onPatch, index = 0 }: BuildCardProps) {
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

  const detailPath = `/builds/${build.id}`;
  const provenance = buildProvenanceOf(build, USE_MOCK);
  const mark = monogramOf({
    name: build.gun.name,
    name_en: build.gun.name_en,
    slug: '',
  });

  return (
    <motion.article
      variants={riseConverge}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      className={cn('tactical-card group relative flex h-full flex-col')}
    >
      {/* 枪械铭牌：中性灰，不用未核验的 icon_url 出图 */}
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-hud border border-hairline bg-void/60 font-mono text-[10px] font-semibold tracking-[0.04em] text-ink-2"
        >
          {mark}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-ink-2">
            {build.gun.name}
          </span>
          <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3">
            {build.gun.category_name}
          </span>
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.02em]">
          <Link
            to={detailPath}
            className={cn(
              'text-ink transition-colors duration-200',
              `${EASE} hover:text-accent`,
            )}
          >
            {build.title}
          </Link>
        </h3>

        {build.description && (
          <p className="mt-2 line-clamp-2 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-2">
            {build.description}
          </p>
        )}

        {/* 改枪码：完整显示，复制权限仍由字符格式决定 */}
        <div className="mt-4 overflow-hidden rounded-hud border border-hairline/80 bg-void/45">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3">
              改枪码
            </span>
            <span className="flex items-center gap-2 font-mono text-[9px] text-ink-3">
              {build.estimated_cost > 0 && (
                <span title="作者自报的预估造价，站点未做核实">
                  ~{formatCoinsCompact(build.estimated_cost)}{' '}
                  <span className="text-ink-3/80">自报</span>
                </span>
              )}
              <span>{build.code.length} 位</span>
            </span>
          </div>

          <div className="flex items-stretch border-t border-hairline/80">
            <code
              title={build.code}
              className="block min-w-0 flex-1 select-all truncate px-3 py-2.5 font-mono text-[12px] leading-5 text-ink"
            >
              {build.code}
            </code>

            <button
              type="button"
              onClick={copy.copy}
              disabled={!copy.canCopy}
              title={copy.canCopy ? undefined : UNCOPYABLE_CODE_HINT}
              className={cn(
                'press flex shrink-0 items-center gap-1.5 border-l border-hairline/80 px-3 text-[11px] font-semibold',
                `transition-colors duration-200 ${EASE}`,
                copy.state === 'copied' && 'animate-copy-pop bg-signal text-[#0d1217]',
                copy.state === 'failed' && 'bg-danger text-[#0d1217]',
                copy.state === 'idle' && copy.canCopy && 'bg-accent text-[#0d1217] hover:bg-accent-2',
                !copy.canCopy && 'cursor-not-allowed bg-white/[0.02] text-ink-3',
              )}
            >
              {copy.state === 'copied' ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
              ) : copy.state === 'failed' ? (
                <X className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span className="whitespace-nowrap">
                {copy.canCopy ? copy.label : '不可复制'}
              </span>
            </button>
          </div>
        </div>

        {!copy.canCopy && (
          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3">
            {UNCOPYABLE_CODE_HINT}
          </p>
        )}

        <span role="status" aria-live="polite" className="sr-only">
          {copy.canCopy && copy.state === 'copied' && '改枪码已复制到剪贴板'}
          {copy.canCopy && copy.state === 'failed' && '复制失败，请手动选中改枪码后复制'}
          {!copy.canCopy && UNCOPYABLE_CODE_HINT}
        </span>

        {build.tags.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1 font-mono text-[10px] text-ink-3">
            {build.tags.slice(0, 3).map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </p>
        )}

        <div className="min-h-4 flex-1" aria-hidden="true" />

        {/* 读数与来源：保持完整，但不抢卡片主信息 */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline/70 pt-3">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={like.like}
              disabled={like.pending}
              aria-pressed={like.liked}
              title={
                like.failed
                  ? '点赞失败，请稍后重试（登录用户同一方案只计一次；未登录点赞不按人去重）'
                  : '点赞（登录用户同一方案只计一次；未登录点赞不按人去重）'
              }
              className={cn(
                'press flex items-center gap-1 rounded-hud px-2 py-1 text-[11px] font-medium',
                `transition-colors duration-200 ${EASE}`,
                'disabled:cursor-wait disabled:opacity-60',
                like.liked ? 'text-danger' : 'text-ink-3 hover:bg-white/[0.04] hover:text-ink-2',
              )}
            >
              <Heart
                className={cn('h-3.5 w-3.5', like.liked && 'fill-current')}
                aria-hidden="true"
              />
              <span className="hud-readout">{formatCount(build.likes_count)}</span>
            </button>

            <span
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-ink-3"
              title="改枪码被复制到剪贴板的点击次数：每次点击计一次，不按人或设备去重，因此不等于多少人用过这条方案"
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              <span className="hud-readout">{formatCount(build.copies_count)}</span>
            </span>

            <Link
              to={detailPath}
              className={cn(
                'press flex items-center gap-1 rounded-hud px-2 py-1 text-[11px] text-ink-3',
                `transition-colors duration-200 ${EASE} hover:bg-white/[0.04] hover:text-ink-2`,
              )}
              title="查看评论"
            >
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              <span className="hud-readout">{formatCount(build.comments_count)}</span>
            </Link>
          </div>

          <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-ink-3">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatRelativeTime(build.created_at)}
          </span>
        </div>

        <div className="mt-2.5">
          <SourceBadge provenance={provenance} full />
        </div>
      </div>
    </motion.article>
  );
}
