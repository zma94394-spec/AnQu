import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import type { Paginated } from './builds.service.js';

export interface CommentDTO {
  id: string;
  build_id: string;
  content: string;
  created_at: Date;
  author: { id: string; nickname: string | null; avatar_url: string | null } | null;
}

const COMMENT_SELECT = {
  id: true,
  buildId: true,
  content: true,
  createdAt: true,
  authorId: true,
  author: { select: { id: true, nickname: true, avatarUrl: true } },
} as const;

type CommentRecord = {
  id: string;
  buildId: string;
  content: string;
  createdAt: Date;
  authorId: string | null;
  author: { id: string; nickname: string; avatarUrl: string | null } | null;
};

function toCommentDTO(c: CommentRecord): CommentDTO {
  return {
    id: c.id,
    build_id: c.buildId,
    content: c.content,
    created_at: c.createdAt,
    author: c.author
      ? { id: c.author.id, nickname: c.author.nickname, avatar_url: c.author.avatarUrl }
      : null,
  };
}

/* ============================================================
 *  GET /api/builds/:id/comments
 * ============================================================ */
export async function listComments(
  buildId: string,
  page: number,
  pageSize: number,
): Promise<Paginated<CommentDTO>> {
  const [items, total] = await Promise.all([
    prisma.comment.findMany({
      where: { buildId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: COMMENT_SELECT,
    }),
    prisma.comment.count({ where: { buildId } }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return {
    items: items.map(toCommentDTO),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
    },
  };
}

/* ============================================================
 *  POST /api/builds/:id/comments
 * ============================================================ */
export async function createComment(
  buildId: string,
  content: string,
  authorId: string,
): Promise<CommentDTO> {
  const build = await prisma.build.findFirst({
    where: { id: buildId, status: 'published' },
    select: { id: true },
  });
  if (!build) throw AppError.notFound('BUILD_NOT_FOUND', '改枪方案不存在或已下架');

  const created = await prisma.comment.create({
    data: { buildId, authorId, content },
    select: COMMENT_SELECT,
  });

  // comments_count 由 trg_build_comments_count 触发器自动同步，此处无需手动维护
  return toCommentDTO(created);
}

/* ============================================================
 *  DELETE /api/comments/:id —— 仅作者本人或版主可删
 * ============================================================ */
export async function deleteComment(commentId: string, userId: string): Promise<void> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true },
  });
  if (!comment) throw AppError.notFound('COMMENT_NOT_FOUND', '评论不存在');

  if (comment.authorId !== userId) {
    const profile = await prisma.profile.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const isStaff = profile?.role === 'moderator' || profile?.role === 'admin';
    if (!isStaff) throw AppError.forbidden('只能删除自己发布的评论');
  }

  await prisma.comment.delete({ where: { id: commentId } });
}
