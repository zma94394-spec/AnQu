/**
 * 枪械目录（/guns）的纯逻辑层。
 *
 * 单独成模块有两个理由：
 *   1. 它必须能在 node 里直接测（`tests/ui001_gun_catalog.test.mjs`），不依赖 DOM；
 *   2. 这一层是"诚实性"唯一该被钉住的地方 —— 页面上每一个数字、每一枚标签
 *      都从这里出来，所以"有没有编造数据"只需要看这一个文件。
 *
 * 硬约束（任务书）：
 *   · 枪械字典只有一个真源：`GET /api/guns`（`lib/api.ts` 的 `fetchGuns()`）。
 *     这里**不引入任何第二份目录**，也不做任何本地补全。
 *   · 没有真实数据 ⇒ 返回空数组 / 空态，绝不生成占位数字。
 *   · "PC 已验证"只能来自 PC 真机验证轴；当前公开 DTO 里没有这个字段，
 *     所以 `verificationOf()` 在任何输入下都只能给出"未核验"。
 */
import type { CategoryDTO, GunDTO } from '../types/api';

/* ------------------------------------------------------------------ 检索 */

/** 归一化：去首尾空白 + 转小写。刻意不做模糊/拼音，避免"看起来搜到了"的假命中。 */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 一把枪可被搜到的字段：中文名、英文名、slug。命中理由会回传给 UI 显示。 */
export function matchGun(gun: GunDTO, query: string): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  const haystack = [gun.name, gun.name_en ?? '', gun.slug, gun.category_name]
    .map((s) => normalizeQuery(s))
    .filter(Boolean);
  return haystack.some((s) => s.includes(q));
}

/* ------------------------------------------------------------------ 排序 */

/**
 * 确定性排序：已收录方案数多者在前 → 名称（码点序）→ slug。
 * 不用 localeCompare：它的结果随平台 ICU 变，会让"同一份数据两次渲染顺序不同"
 * 这种问题只在别人机器上复现。
 */
export function sortGuns(guns: GunDTO[]): GunDTO[] {
  return [...guns].sort((a, b) => {
    if (a.build_count !== b.build_count) return b.build_count - a.build_count;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
}

/* ---------------------------------------------------------------- 分类 */

export interface CategoryGroup {
  slug: string;
  name: string;
  sortOrder: number;
  /** 该分类下**字典里**的枪械数（来自 gun_count，不是前端数出来的） */
  declaredGunCount: number;
  /** 该分类下已收录方案数（来自 build_count） */
  declaredBuildCount: number;
  guns: GunDTO[];
}

/**
 * 按分类字典分组。两个口径同时保留：
 *   · declared*：后端视图给的原值；
 *   · guns.length：本次实际拿到的条数。
 * UI 必须把两者对得上才显示数字 —— 对不上就是数据问题，要显出来而不是偷偷取一个。
 */
export function groupByCategory(guns: GunDTO[], categories: CategoryDTO[]): CategoryGroup[] {
  const byCat = new Map<string, GunDTO[]>();
  for (const gun of guns) {
    const list = byCat.get(gun.category);
    if (list) list.push(gun);
    else byCat.set(gun.category, [gun]);
  }

  const groups: CategoryGroup[] = categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    sortOrder: c.sort_order,
    declaredGunCount: c.gun_count,
    declaredBuildCount: c.build_count,
    guns: sortGuns(byCat.get(c.slug) ?? []),
  }));

  // 字典里出现了 categories 里没有的分类（后端视图缺行）时不能把它丢掉，
  // 否则"89 把枪"会在前端莫名其妙变少。
  const known = new Set(categories.map((c) => c.slug));
  for (const [slug, list] of byCat) {
    if (known.has(slug)) continue;
    groups.push({
      slug,
      name: list[0]?.category_name || slug,
      sortOrder: Number.MAX_SAFE_INTEGER,
      declaredGunCount: list.length,
      declaredBuildCount: list.reduce((n, g) => n + g.build_count, 0),
      guns: sortGuns(list),
    });
  }

  return groups.sort((a, b) => a.sortOrder - b.sortOrder);
}

/* -------------------------------------------------------------- 诚实标注 */

export interface VerificationFacts {
  /** 真机验证轴。当前 `GET /api/builds` 的 BuildDTO 里**没有**这个字段。 */
  pc_verified?: boolean | null;
  /** 若后端将来透出 build_codes.status，可走这一条 */
  token_status?: string | null;
}

export interface VerificationLabel {
  /** 徽章文字 */
  label: string;
  /** 语义色：ok / warn / neutral */
  tone: 'ok' | 'warn' | 'neutral';
  /** 为什么只能这么说（tooltip / 详情段落） */
  reason: string;
}

/**
 * 唯一允许给出"PC 已验证"字样的地方，且只有真机验证轴为真时才允许。
 *
 * 今天它对所有输入都返回"未核验"—— 因为公开 DTO 里根本没有验证字段。
 * 这不是保守，是事实：`db/05` 的 `PC_IMPORT_PASS` 只能由
 * `record_pc_import_result(...)` 产生，而那条通道目前只在本地库存在。
 */
export function verificationOf(facts: VerificationFacts = {}): VerificationLabel {
  if (facts.pc_verified === true || facts.token_status === 'PC_IMPORT_PASS') {
    return {
      label: 'PC 已验证',
      tone: 'ok',
      reason: '这串码在 PC 客户端由真人导入成功过（验证轴来自 build_codes）。',
    };
  }
  return {
    label: '未核验',
    tone: 'warn',
    reason: '本站没有这串码的 PC 真机导入记录，所以不替你声称它能用；请自己在游戏内确认。',
  };
}

/** 跨账号 / 跨区服兼容性：没有数据就只有 UNKNOWN 一个答案。 */
export const CROSS_ACCOUNT_STATUS = {
  value: 'UNKNOWN' as const,
  reason: '本站没有跨账号、跨区服的导入测试数据，因此不会声称"通用"或"全区可用"。',
};

/* -------------------------------------------------------------- 展示辅助 */

/** 数字一律原样输出；没有值就返回 null，由 UI 走空态，不补 0。 */
export function countOrNull(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** 枪械磁贴上的字母标记：只用真实名字派生，不放假图。 */
export function monogramOf(gun: Pick<GunDTO, 'name_en' | 'name' | 'slug'>): string {
  const src = (gun.name_en || gun.name || gun.slug).trim();
  // 数字是枪名里最有辨识度的部分（型号后缀基本都是数字），不能当装饰剥掉。
  const alnum = src.replace(/[^A-Za-z0-9]/g, '');
  if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/**
 * 分类色相：只是**展示令牌**，把 8 个分类的图位区分开，不引入第二套枪械/分类数据。
 *
 * 键取自 `GET /api/guns` 的 `categories[].slug`（与 `category_sources` 同一套字典）。
 * 认不出来的 slug 一律走中性灰 —— 宁可朴素，也不给某个分类编一个颜色身份。
 */
const CATEGORY_HUES: Record<string, number> = {
  assault_rifle: 32, // 琥珀（与主强调色同族）
  carbine: 48,
  dmr: 190,
  lmg: 12,
  pistol: 268,
  shotgun: 148,
  smg: 210,
  sniper_rifle: 232,
};

export function categoryToneOf(slug: string | null | undefined): { hue: number; known: boolean } {
  const hue = slug ? CATEGORY_HUES[slug] : undefined;
  return typeof hue === 'number' ? { hue, known: true } : { hue: 210, known: false };
}

/** 数据源标注：Mock 演示与真接口必须一眼分得开，不能让人把演示当真实。 */
export function dataSourceLabel(useMock: boolean): { text: string; tone: 'ok' | 'warn' } {
  return useMock
    ? { text: '数据源：内置 Mock 演示数据（不是真实收录）', tone: 'warn' }
    : { text: '数据源：GET /api/guns（本站枪械字典）', tone: 'ok' };
}
