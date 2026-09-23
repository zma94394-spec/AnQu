import { prisma } from '../lib/prisma.js';
import type { ListGunsQuery } from '../schemas/builds.schema.js';

/* ============================================================
 *  DTO
 * ============================================================ */

export interface GunDTO {
  id: string;
  name: string;
  name_en: string | null;
  slug: string;
  category: string;
  category_name: string;
  icon_url: string | null;
  build_count: number;
}

export interface CategoryDTO {
  slug: string;
  name: string;
  sort_order: number;
  gun_count: number;
  build_count: number;
}

/* ============================================================
 *  GET /api/guns —— 获取所有枪械及其分类
 * ============================================================ */

interface CategoryStatRow {
  category: string;
  category_name: string;
  sort_order: number;
  gun_count: bigint;
  build_count: bigint;
}

export async function listGuns(
  params: ListGunsQuery,
): Promise<{ categories: CategoryDTO[]; guns: GunDTO[] }> {
  const { category, q } = params;

  // ---- 1. 分类及其枪械/方案数量（来自 v_category_stats 聚合视图）----
  const statRows = await prisma.$queryRaw<CategoryStatRow[]>`
    SELECT category, category_name, sort_order, gun_count, build_count
    FROM public.v_category_stats
    ORDER BY sort_order ASC
  `;

  const categories: CategoryDTO[] = statRows.map((r) => ({
    slug: r.category,
    name: r.category_name,
    sort_order: r.sort_order,
    gun_count: Number(r.gun_count),
    build_count: Number(r.build_count),
  }));

  // 分类中文名映射，供枪械条目冗余展示，省去前端二次 join
  const categoryNameMap = new Map(categories.map((c) => [c.slug, c.name]));

  // ---- 2. 枪械列表 ----
  const guns = await prisma.gun.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
      category: true,
      iconUrl: true,
      _count: { select: { builds: { where: { status: 'published' } } } },
    },
  });

  return {
    categories,
    guns: guns.map((g) => ({
      id: g.id,
      name: g.name,
      name_en: g.nameEn,
      slug: g.slug,
      category: g.category,
      category_name: categoryNameMap.get(g.category) ?? g.category,
      icon_url: g.iconUrl,
      build_count: g._count.builds,
    })),
  };
}

/** 校验枪械是否存在，供 POST /api/builds 使用 */
export async function gunExists(gunId: string): Promise<boolean> {
  const found = await prisma.gun.findUnique({ where: { id: gunId }, select: { id: true } });
  return found !== null;
}
