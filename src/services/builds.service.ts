import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError, mapDbError } from '../lib/errors.js';
import type { CreateBuildBody, ListBuildsQuery, SortKey } from '../schemas/builds.schema.js';

/* ============================================================
 *  DTO
 * ============================================================ */

export interface BuildDTO {
  id: string;
  title: string;
  code: string;
  estimated_cost: number;
  platform: string;
  tags: string[];
  description: string | null;
  likes_count: number;
  copies_count: number;
  comments_count: number;
  hot_score: number | null;
  cp_score: number | null;
  created_at: Date;
  updated_at: Date;
  gun: {
    id: string;
    name: string;
    name_en: string | null;
    category: string;
    category_name: string;
    icon_url: string | null;
  };
  author: { id: string; nickname: string | null } | null;
}

export interface Paginated<T> {
  items: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
  };
}

/* ============================================================
 *  原始查询行结构
 * ============================================================ */
interface BuildRow {
  id: string;
  gun_id: string;
  author_id: string | null;
  author_nickname: string | null;
  title: string;
  code: string;
  estimated_cost: Prisma.Decimal | number;
  platform: string;
  tags: string[];
  description: string | null;
  likes_count: number;
  copies_count: number;
  comments_count: number;
  created_at: Date;
  updated_at: Date;
  gun_name: string;
  gun_name_en: string | null;
  gun_icon_url: string | null;
  gun_category: string;
  gun_category_name: string;
  hot_score: Prisma.Decimal | number | null;
  cp_score: Prisma.Decimal | number | null;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

function toBuildDTO(r: BuildRow): BuildDTO {
  return {
    id: r.id,
    title: r.title,
    code: r.code,
    estimated_cost: toNumber(r.estimated_cost),
    platform: r.platform,
    tags: r.tags ?? [],
    description: r.description,
    likes_count: r.likes_count,
    copies_count: r.copies_count,
    comments_count: r.comments_count,
    hot_score: r.hot_score === null ? null : toNumber(r.hot_score),
    cp_score: r.cp_score === null ? null : toNumber(r.cp_score),
    created_at: r.created_at,
    updated_at: r.updated_at,
    gun: {
      id: r.gun_id,
      name: r.gun_name,
      name_en: r.gun_name_en,
      category: r.gun_category,
      category_name: r.gun_category_name,
      icon_url: r.gun_icon_url,
    },
    author: r.author_id ? { id: r.author_id, nickname: r.author_nickname } : null,
  };
}

/* ============================================================
 *  排序白名单
 *  —— 绝不把用户输入拼接进 ORDER BY；只允许命中此映射表的固定片段。
 *  —— hot_score / cp_score 是 SELECT 中的别名，PostgreSQL 允许在 ORDER BY 中
 *     直接引用输出列别名，因此评分表达式只会被求值一次。
 * ============================================================ */
const ORDER_BY_SQL: Record<SortKey, Prisma.Sql> = {
  latest: Prisma.sql`b.created_at DESC, b.id DESC`,
  hot: Prisma.sql`hot_score DESC, b.id DESC`,
  cost_performance: Prisma.sql`cp_score DESC, b.id DESC`,
  cost_asc: Prisma.sql`b.estimated_cost ASC, b.id DESC`,
  cost_desc: Prisma.sql`b.estimated_cost DESC, b.id DESC`,
};

/** 转义 LIKE 元字符，防止用户输入 % / _ 造成全表扫描 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

const SELECT_FEED_COLUMNS = Prisma.sql`
  b.id,
  b.gun_id,
  b.author_id,
  p.nickname AS author_nickname,
  b.title,
  b.code,
  b.estimated_cost,
  b.platform::text AS platform,
  b.tags,
  b.description,
  b.likes_count,
  b.copies_count,
  b.comments_count,
  b.created_at,
  b.updated_at,
  g.name      AS gun_name,
  g.name_en   AS gun_name_en,
  g.icon_url  AS gun_icon_url,
  g.category  AS gun_category,
  c.name_zh   AS gun_category_name,
  public.build_hot_score(b.likes_count, b.copies_count, b.created_at)    AS hot_score,
  public.build_cp_score(b.likes_count, b.copies_count, b.estimated_cost) AS cp_score
`;

const FROM_FEED = Prisma.sql`
  FROM public.builds b
  JOIN public.guns           g ON g.id = b.gun_id
  JOIN public.gun_categories c ON c.slug = g.category
  LEFT JOIN public.profiles  p ON p.id = b.author_id
`;

/** 构造 WHERE 片段（builds 列表与计数共用，保证口径一致） */
function buildWhere(params: ListBuildsQuery): Prisma.Sql {
  const filters: Prisma.Sql[] = [Prisma.sql`b.status = 'published'`];

  if (params.category) filters.push(Prisma.sql`g.category = ${params.category}`);
  if (params.platform) filters.push(Prisma.sql`b.platform::text = ${params.platform}`);
  if (params.gun_id) filters.push(Prisma.sql`b.gun_id = ${params.gun_id}::uuid`);
  if (params.tag) filters.push(Prisma.sql`${params.tag} = ANY(b.tags)`);
  if (params.q) filters.push(Prisma.sql`b.title ILIKE ${'%' + escapeLike(params.q) + '%'}`);
  if (params.min_cost !== undefined) filters.push(Prisma.sql`b.estimated_cost >= ${params.min_cost}`);
  if (params.max_cost !== undefined) filters.push(Prisma.sql`b.estimated_cost <= ${params.max_cost}`);

  return Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;
}

/* ============================================================
 *  GET /api/builds —— 分页 + 筛选 + 排序
 * ============================================================ */
export async function listBuilds(params: ListBuildsQuery): Promise<Paginated<BuildDTO>> {
  const { page, page_size: pageSize } = params;
  const offset = (page - 1) * pageSize;

  const whereSql = buildWhere(params);
  const orderSql = ORDER_BY_SQL[params.sort];

  // 列表与总数并行查询，降低 P95 延迟
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<BuildRow[]>(Prisma.sql`
      SELECT ${SELECT_FEED_COLUMNS}
      ${FROM_FEED}
      ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${pageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT count(*)::bigint AS total
      FROM public.builds b
      JOIN public.guns g ON g.id = b.gun_id
      ${whereSql}
    `),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return {
    items: rows.map(toBuildDTO),
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
 *  GET /api/builds/:id —— 方案详情
 * ============================================================ */
export async function getBuildById(id: string): Promise<BuildDTO> {
  const rows = await prisma.$queryRaw<BuildRow[]>(Prisma.sql`
    SELECT ${SELECT_FEED_COLUMNS}
    ${FROM_FEED}
    WHERE b.id = ${id}::uuid AND b.status = 'published'
    LIMIT 1
  `);

  const row = rows[0];
  if (!row) throw AppError.notFound('BUILD_NOT_FOUND', '改枪方案不存在或已下架');
  return toBuildDTO(row);
}

/* ============================================================
 *  POST /api/builds —— 提交新方案
 * ============================================================ */
export async function createBuild(
  input: CreateBuildBody,
  authorId: string | null,
): Promise<BuildDTO> {
  // ---- 1. 外键存在性前置校验：给出可读报错，而非数据库外键异常 ----
  const gun = await prisma.gun.findUnique({
    where: { id: input.gun_id },
    select: { id: true },
  });
  if (!gun) {
    throw AppError.badRequest('INVALID_GUN_ID', '指定的枪械不存在，请先从 GET /api/guns 获取合法 ID');
  }

  // ---- 2. 同枪同码去重：友好提示优于唯一索引报错 ----
  const duplicated = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public.builds
    WHERE gun_id = ${input.gun_id}::uuid
      AND code_hash = md5(${input.code})
    LIMIT 1
  `;
  if (duplicated.length > 0) {
    throw AppError.conflict('DUPLICATE_BUILD_CODE', '该枪械下已存在完全相同的改枪码方案', {
      existing_build_id: duplicated[0]?.id ?? null,
    });
  }

  // ---- 3. 写入。计数列一律由数据库默认值 0 起算，不接受客户端传入 ----
  try {
    const created = await prisma.build.create({
      data: {
        gunId: input.gun_id,
        authorId,
        title: input.title,
        code: input.code,
        estimatedCost: input.estimated_cost,
        platform: input.platform,
        tags: input.tags,
        description: input.description ?? null,
        status: 'published',
      },
      select: { id: true },
    });

    // 复用同一套查询口径返回，保证创建响应与列表项结构完全一致
    return await getBuildById(created.id);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapDbError(err);
  }
}

/* ============================================================
 *  POST /api/builds/:id/copy —— 复制次数 +1
 *  走 RPC 单条 UPDATE，天然原子，避免读改写竞态丢失更新。
 * ============================================================ */
export async function incrementCopy(
  buildId: string,
): Promise<{ id: string; copies_count: number }> {
  try {
    const rows = await prisma.$queryRaw<Array<{ copies_count: number }>>`
      SELECT public.increment_build_copies(${buildId}::uuid) AS copies_count
    `;
    return { id: buildId, copies_count: toNumber(rows[0]?.copies_count) };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapDbError(err);
  }
}

/* ============================================================
 *  POST /api/builds/:id/like —— 点赞
 *
 *  双路径设计：
 *   · 已登录：调用 toggle_build_like（幂等开关），计数由 build_likes 触发器同步，
 *             同一用户重复点赞不会重复计数。
 *   · 匿名  ：调用 increment_build_likes（不去重），用于未登录的快速互动，
 *             由网关层限流兜底（见 routes/builds.routes.ts）。
 *
 *  ⚠️ 关键实现细节：
 *   RPC 内部通过 auth.uid() 取当前用户，而 auth.uid() 读取的是
 *   request.jwt.claims 这个 GUC。经 Prisma 直连（非 PostgREST）时该 GUC 为空，
 *   因此必须在同一事务内用 set_config(..., true) 注入声明，
 *   既复现了 PostgREST 的行为，又保持 auth.uid() 作为唯一鉴权入口。
 * ============================================================ */
export async function likeBuild(
  buildId: string,
  userId: string | null,
): Promise<{ id: string; liked: boolean; likes_count: number }> {
  try {
    if (userId) {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT set_config(
            'request.jwt.claims',
            ${JSON.stringify({ sub: userId, role: 'authenticated' })},
            true
          )
        `;

        const rows = await tx.$queryRaw<Array<{ liked: boolean; likes_count: number }>>`
          SELECT liked, likes_count FROM public.toggle_build_like(${buildId}::uuid)
        `;

        const row = rows[0];
        if (!row) throw AppError.notFound('BUILD_NOT_FOUND', '改枪方案不存在或已下架');

        return {
          id: buildId,
          liked: row.liked,
          likes_count: toNumber(row.likes_count),
        };
      });
    }

    const rows = await prisma.$queryRaw<Array<{ likes_count: number }>>`
      SELECT public.increment_build_likes(${buildId}::uuid, 1) AS likes_count
    `;
    return { id: buildId, liked: true, likes_count: toNumber(rows[0]?.likes_count) };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapDbError(err);
  }
}
