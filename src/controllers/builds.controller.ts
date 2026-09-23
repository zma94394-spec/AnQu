import type { Request, Response } from 'express';
import {
  createBuild,
  getBuildById,
  incrementCopy,
  likeBuild,
  listBuilds,
} from '../services/builds.service.js';
import type {
  CreateBuildBody,
  IdParam,
  ListBuildsQuery,
} from '../schemas/builds.schema.js';

/**
 * GET /api/builds
 * 分页获取改枪方案，支持 category / platform / sort 等筛选与排序。
 *
 * 缓存策略：仅对"默认排序 + 第一页 + 无筛选"的热门请求开放短缓存，
 * 其余情况（尤其带个人化排序的请求）直接回源，避免缓存击穿导致内容陈旧。
 */
export async function getBuilds(req: Request, res: Response): Promise<void> {
  const query = req.validated?.query as ListBuildsQuery;

  const data = await listBuilds(query);

  const isDefaultFeed =
    query.page === 1 &&
    query.sort === 'latest' &&
    !query.category &&
    !query.platform &&
    !query.gun_id &&
    !query.tag &&
    !query.q;

  res.set(
    'Cache-Control',
    isDefaultFeed ? 'public, max-age=30, stale-while-revalidate=120' : 'no-store',
  );

  res.json({ success: true, data: data.items, pagination: data.pagination });
}

/**
 * GET /api/builds/:id
 * 方案详情（含完整改枪码）
 */
export async function getBuild(req: Request, res: Response): Promise<void> {
  const { id } = req.validated?.params as IdParam;
  const data = await getBuildById(id);
  res.json({ success: true, data });
}

/**
 * POST /api/builds
 * 提交新的改枪方案。
 * author_id 取自鉴权上下文而非请求体，防止伪造他人署名。
 */
export async function postBuild(req: Request, res: Response): Promise<void> {
  const body = req.validated?.body as CreateBuildBody;
  const authorId = req.user?.id ?? null;

  const data = await createBuild(body, authorId);

  res.status(201).json({ success: true, data });
}

/**
 * POST /api/builds/:id/copy
 * 改枪码复制次数 +1，返回最新计数供前端即时展示。
 */
export async function postBuildCopy(req: Request, res: Response): Promise<void> {
  const { id } = req.validated?.params as IdParam;
  const data = await incrementCopy(id);
  res.json({ success: true, data });
}

/**
 * POST /api/builds/:id/like
 * 点赞。
 *  · 已登录：幂等开关，返回 liked 表示操作后的状态（true=已赞 / false=已取消）
 *  · 匿名  ：仅累加，liked 恒为 true
 */
export async function postBuildLike(req: Request, res: Response): Promise<void> {
  const { id } = req.validated?.params as IdParam;
  const data = await likeBuild(id, req.user?.id ?? null);
  res.json({ success: true, data });
}
