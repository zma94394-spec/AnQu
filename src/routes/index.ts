import { Router } from 'express';
import gunsRoutes from './guns.routes.js';
import buildsRoutes from './builds.routes.js';
import commentsRoutes from './comments.routes.js';

const router = Router();

router.use('/guns', gunsRoutes);
router.use('/builds', buildsRoutes);
router.use('/comments', commentsRoutes);

export default router;
