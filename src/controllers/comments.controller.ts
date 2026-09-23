import type { Request, Response } from 'express';
import {
  createComment,
  deleteComment,
  listComments,
} from '../services/comments.service.js';
import { AppError } from '../lib/errors.js';
import type {
  CreateCommentBody,
  IdParam,
  ListCommentsQuery,
} from '../schemas/builds.schema.js';

/** GET /api/builds/:id/comments */
export async function getComments(req: Request, res: Response): Promise<void> {
  const { id } = req.validated?.params as IdParam;
  const { page, page_size: pageSize } = req.validated?.query as ListCommentsQuery;

  const data = await listComments(id, page, pageSize);
  res.json({ success: true, data: data.items, pagination: data.pagination });
}

/** POST /api/builds/:id/comments */
export async function postComment(req: Request, res: Response): Promise<void> {
  const { id } = req.validated?.params as IdParam;
  const { content } = req.validated?.body as CreateCommentBody;

  const userId = req.user?.id;
  if (!userId) throw AppError.unauthorized();

  const data = await createComment(id, content, userId);
  res.status(201).json({ success: true, data });
}

/** DELETE /api/comments/:id */
export async function removeComment(req: Request, res: Response): Promise<void> {
  const { id } = req.validated?.params as IdParam;

  const userId = req.user?.id;
  if (!userId) throw AppError.unauthorized();

  await deleteComment(id, userId);
  res.status(204).end();
}
