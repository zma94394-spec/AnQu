import registryJson from './weaponAssetRegistry.json';

/**
 * 枪械图片资源映射层（UI-010）。
 *
 * 存在理由：本站此前**一张有授权的真枪械图都没有**（生产 89/89 把 `icon_url` 为 NULL，
 * 仓内跟踪图片 0 个）。要接入图片，缺的不是渲染代码，而是"每一张图都能回答
 * 它是谁给的、凭什么能用、对应哪一把枪、文件有没有被换过"这四个问题。
 * 所以映射表是一份**独立的数据文件**，而不是一堆散落的 `<img src>`：
 *
 *   - 关联键只有 canonical slug（`db/04_seed.sql` 里那 89 条），不建第二套枪械名；
 *   - 每条都要带权利人、授权依据、PC 版本对应证据与文件 SHA-256；
 *   - 离线校验器 `tools/web/check-weapon-assets.mjs` 逐条重算，字段缺失 / 哈希不符 /
 *     文件不在 / 目录里有没登记的文件 —— 一律红。它同时被 `tests/weapon_assets.test.mjs` 钉住。
 *
 * 运行时这里只做查表：登记过才可能上屏，没登记就走 UI-009 的诚实空位版面。
 *
 * UI-011 STEP 3 关掉的一个洞：后端 DTO 里的 `icon_url` **不再是渲染源**。
 * 它是一条没人核验过的外链，谁改了库就能让任意图案绕过授权闸门上屏 ——
 * 那等于把闸门变成可选的。生产现在 89/89 是 NULL，所以关掉它零代价；
 * 以后要让一张图上屏，唯一的路上就是这张登记表 + 校验器。
 */

/**
 * 素材类别（UI-011 STEP 2 的正式四分）。
 *
 * 前两类可以进登记表并上屏，后两类**只属于候选台账** —— 它们一旦能进登记面，
 * "已核验"和"待授权"就会在同一个字段里糊在一起，闸门也就没了。
 */
export type WeaponAssetKind =
  /** 游戏内画面，且已核验到明确的公开再分发授权 */
  | 'GAME_PC_VERIFIED_IMAGE'
  /** 现实枪械参考照：只能标注为"现实枪械参考 / 非游戏内截图" */
  | 'REAL_WORLD_REFERENCE'
  /** owner 自己拍的，但公开传播授权尚未确认 —— 不得上屏 */
  | 'OWNER_CAPTURE_PENDING_RIGHTS'
  /** 来源或授权没核实 —— 不得上屏 */
  | 'UNVERIFIED_SOURCE';

/** 允许公开展示的类别。其余类别进登记表就是闸门报错。 */
export const DISPLAYABLE_KINDS: readonly WeaponAssetKind[] = ['GAME_PC_VERIFIED_IMAGE', 'REAL_WORLD_REFERENCE'];

export interface WeaponAsset {
  slug: string;
  /** `web/public/weapons/` 下的文件名，约定必须等于 `<slug>.<ext>` */
  file: string;
  kind: WeaponAssetKind;
  /** 上屏的来源标注：授权方要求的署名 + 素材性质（real_photo 必须写明"实物"） */
  caption: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  author: string;
  /** 凭什么能用：授权文书 / 条款原文位置 / 邮件编号 —— 不能只写"网上找的" */
  permissionEvidence: string;
  /** 凭什么是这把枪：PC 版本对应证据（不能只凭文件名） */
  pcEvidence: string;
  /** 原图 ↔ 优化图的对应关系：原图位置 + 做了什么处理（尺寸/格式/质量），要能复现 */
  optimizedFrom: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
}

interface RegistryFile {
  version: number;
  assets: WeaponAsset[];
}

/*
 * 登记表当前是空的，`assets: []` 在 TS 里推成 `never[]`；真正的判据在离线校验器那边
 * （字段齐全、哈希对得上、文件存在），所以这里的断言是有意为之的"我信登记面"。
 */
const registry = registryJson as unknown as RegistryFile;

const BY_SLUG = new Map<string, WeaponAsset>();
for (const asset of registry.assets ?? []) {
  if (!asset?.slug || !asset?.file) continue;
  // 双保险：类别不在可展示集合里的条目，运行时一律不渲染（校验器那边本来就该拒）
  if (!DISPLAYABLE_KINDS.includes(asset.kind)) continue;
  if (!BY_SLUG.has(asset.slug)) BY_SLUG.set(asset.slug, asset);
}

/** 已接入的枪械图数量（当前 0；这个数字必须与报告里"尚缺多少"对得上）。 */
export const WEAPON_ASSET_COUNT = BY_SLUG.size;

export function weaponAssetFor(slug: string | null | undefined): WeaponAsset | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

export function weaponAssetUrl(asset: WeaponAsset): string {
  return `/weapons/${asset.file}`;
}
