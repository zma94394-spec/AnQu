import { Router } from 'express';
import { getGuns } from '../controllers/guns.controller.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { listGunsQuerySchema } from '../schemas/builds.schema.js';

const router = Router();

/**
 * GET /api/guns
 * 获取所有枪械及其分类
 */
router.get('/', validate({ query: listGunsQuerySchema }), asyncHandler(getGuns));

export default router;
