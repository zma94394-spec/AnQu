import { Router } from 'express';
import { removeComment } from '../controllers/comments.controller.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { idParamSchema } from '../schemas/builds.schema.js';

const router = Router();

/**
 * DELETE /api/comments/:id
 * 删除评论（仅作者本人或版主/管理员）
 */
router.delete(
  '/:id',
  requireAuth,
  validate({ params: idParamSchema }),
  asyncHandler(removeComment),
);

export default router;
