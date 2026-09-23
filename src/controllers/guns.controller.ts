import type { Request, Response } from 'express';
import { listGuns } from '../services/guns.service.js';
import type { ListGunsQuery } from '../schemas/builds.schema.js';

/**
 * GET /api/guns
 * 获取所有枪械及其分类（含分类下的枪械数与方案数，直接支撑前端导航栏角标）
 */
export async function getGuns(req: Request, res: Response): Promise<void> {
  const query = req.validated?.query as ListGunsQuery;

  const data = await listGuns(query);

  // 枪械库属于低频变更的静态数据，允许 CDN / 浏览器缓存 5 分钟，
  // 配合 stale-while-revalidate 保证首屏速度
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json({ success: true, data });
}
