import { Router } from 'express';
import {
  getBuild,
  getBuilds,
  postBuild,
  postBuildCopy,
  postBuildLike,
} from '../controllers/builds.controller.js';
import { getComments, postComment } from '../controllers/comments.controller.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { interactLimiter, writeLimiter } from '../middleware/rateLimit.js';
import {
  createBuildBodySchema,
  createCommentBodySchema,
  idParamSchema,
  listBuildsQuerySchema,
  listCommentsQuerySchema,
} from '../schemas/builds.schema.js';

const router = Router();

/* ---------------------------------------------------------------- 列表 */
/**
 * GET /api/builds
 * 分页获取改枪方案
 * query: page, page_size, category, platform, gun_id, tag, q, min_cost, max_cost, sort
 */
router.get('/', validate({ query: listBuildsQuerySchema }), asyncHandler(getBuilds));

/* ---------------------------------------------------------------- 提交 */
/**
 * POST /api/builds
 * 提交新的改枪方案
 */
router.post(
  '/',
  writeLimiter,
  validate({ body: createBuildBodySchema }),
  asyncHandler(postBuild),
);

/* ---------------------------------------------------------------- 评论（嵌套在方案下） */
/**
 * GET /api/builds/:id/comments
 */
router.get(
  '/:id/comments',
  validate({ params: idParamSchema, query: listCommentsQuerySchema }),
  asyncHandler(getComments),
);

/**
 * POST /api/builds/:id/comments —— 需登录
 */
router.post(
  '/:id/comments',
  writeLimiter,
  requireAuth,
  validate({ params: idParamSchema, body: createCommentBodySchema }),
  asyncHandler(postComment),
);

/* ---------------------------------------------------------------- 互动 */
/**
 * POST /api/builds/:id/copy
 * 改枪码复制次数 +1
 */
router.post(
  '/:id/copy',
  interactLimiter,
  validate({ params: idParamSchema }),
  asyncHandler(postBuildCopy),
);

/**
 * POST /api/builds/:id/like
 * 点赞数 +1（登录用户为幂等开关）
 */
router.post(
  '/:id/like',
  interactLimiter,
  validate({ params: idParamSchema }),
  asyncHandler(postBuildLike),
);

/* ---------------------------------------------------------------- 详情 */
/**
 * GET /api/builds/:id
 * 注意：必须放在所有 /:id/xxx 子路由之后，避免路径歧义。
 */
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(getBuild));

export default router;
