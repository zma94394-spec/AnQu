/**
 * ============================================================================
 *  内置 Mock 数据 —— 仅用于「后端未启动时也能完整预览界面」
 *
 *  数据来源：`db/04_seed.sql` 的种子数据（6 分类 / 8 把枪 / 6 个方案 / 2 条评论）
 *           + 若干额外补充条目（见文件内 `EXTRA` 标注），
 *             目的是让预览的列表密度与评论区接近真实场景，不是真实业务数据。
 *
 *  ⚠️ 三点刻意的设计：
 *   1. **评分在本地按后端公式重算**，而不是写死数字。这样 Mock 模式下的
 *      "最热 / 性价比最高"排序结果与真实后端一致，不会出现"看着一样、排序不同"的错觉。
 *   2. **icon_url 全部为 null**。真实种子数据里是占位域名（assets.example-anqu.com），
 *      在预览中会渲染成一片破图；置 null 可以顺带验证前端的降级渲染路径。
 *   3. **评论数从评论数据推导**，不手写。卡片徽标与详情页评论列表条数必须一致，
 *      手写两处必然漂移，文件末尾有一致性自检兜底。
 *
 *  声明顺序有依赖，不要随意调整：
 *    GUN_SEEDS / BUILD_SEEDS / COMMENT_SEEDS  ->  commentCountByBuild
 *    ->  MOCK_BUILDS  ->  MOCK_COMMENTS  ->  MOCK_CATEGORIES / MOCK_GUNS / MOCK_GUNS_PAYLOAD
 * ============================================================================
 */

import type {
  BuildDTO,
  CategoryDTO,
  CommentDTO,
  GunsPayload,
  GunDTO,
  Platform,
} from '../types/api';

/* ------------------------------------------------------------ 分类字典 */

const CATEGORIES: CategoryDTO[] = [
  { slug: 'assault_rifle', name: '突击步枪', sort_order: 10, gun_count: 0, build_count: 0 },
  { slug: 'smg', name: '冲锋枪', sort_order: 20, gun_count: 0, build_count: 0 },
  { slug: 'dmr', name: '射手步枪', sort_order: 30, gun_count: 0, build_count: 0 },
  { slug: 'sniper_rifle', name: '狙击枪', sort_order: 40, gun_count: 0, build_count: 0 },
  { slug: 'shotgun', name: '霰弹枪', sort_order: 50, gun_count: 0, build_count: 0 },
  { slug: 'pistol', name: '手枪', sort_order: 60, gun_count: 0, build_count: 0 },
];

/* ---------------------------------------------------------------- 枪械 */

interface GunSeed {
  id: string;
  slug: string;
  name: string;
  name_en: string;
  category: string;
}

const GUN_SEEDS: GunSeed[] = [
  { id: 'a1000001-0000-4000-8000-000000000001', slug: 'ak-74n', name: 'AK-74N', name_en: 'AK-74N', category: 'assault_rifle' },
  { id: 'a1000002-0000-4000-8000-000000000002', slug: 'fal', name: 'FAL', name_en: 'FAL', category: 'assault_rifle' },
  { id: 'a1000009-0000-4000-8000-000000000009', slug: 'ace32', name: 'ACE32', name_en: 'ACE32', category: 'assault_rifle' },
  { id: 'a1000003-0000-4000-8000-000000000003', slug: 'm4a1', name: 'M4A1', name_en: 'M4A1', category: 'assault_rifle' },
  { id: 'a1000004-0000-4000-8000-000000000004', slug: 'akm', name: 'AKM', name_en: 'AKM', category: 'assault_rifle' },
  { id: 'a1000005-0000-4000-8000-000000000005', slug: 'mp5', name: 'MP5', name_en: 'MP5', category: 'smg' },
  { id: 'a1000006-0000-4000-8000-000000000006', slug: 'p90', name: 'P90', name_en: 'P90', category: 'smg' },
  { id: 'a1000007-0000-4000-8000-000000000007', slug: 'mosin-nagant', name: 'Mosin-Nagant', name_en: 'Mosin-Nagant', category: 'sniper_rifle' },
  { id: 'a1000008-0000-4000-8000-000000000008', slug: 'm700', name: 'M700', name_en: 'M700', category: 'sniper_rifle' },
];

/* ---------------------------------------------------------------- 方案 */

interface BuildSeed {
  id: string;
  gunSlug: string;
  title: string;
  code: string;
  estimated_cost: number;
  platform: Platform;
  tags: string[];
  description: string;
  likes_count: number;
  copies_count: number;
  /** 发布距今小时数，用于让时间衰减热度分呈现真实梯度 */
  ageHours: number;
}

const BUILD_SEEDS: BuildSeed[] = [
  /* ---- 来自 db/04_seed.sql 第 3.1 节：通用演示方案 ---- */
  {
    id: '11111111-1111-4111-8111-111111111111',
    gunSlug: 'akm',
    title: '【性价比】3万柯恩币封锁区拉满',
    code: '3042187654921837465012938475610293847561',
    estimated_cost: 30000,
    platform: 'both',
    tags: ['性价比', '低后坐', '腰射'],
    description:
      '全改造 AKM，主打低造价高稳定性。\n建议子弹：7.62×39 BP（穿甲）或 PS（日常）。\n枪口选制退器压后坐，握把走垂直握把，弹匣用 30 发标准弹匣控制重量。',
    likes_count: 128,
    copies_count: 452,
    ageHours: 30,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    gunSlug: 'm4a1',
    title: '【高端】M4A1 极限后坐控制 · 端游无限',
    code: '9182736455091827364550918273645509182736',
    estimated_cost: 118000,
    platform: 'pc',
    tags: ['高后坐控制', '远距离', '端游专属'],
    description:
      '面向《无限》端游的高配 M4A1。\n建议子弹：5.56×45 M995 或 M855A1。\n重枪管 + 战术前握把 + 缓冲枪托，优先堆垂直后坐与水平后坐。',
    likes_count: 342,
    copies_count: 1105,
    ageHours: 96,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    gunSlug: 'mp5',
    title: '【手游】MP5 腰射流 · 6万以内',
    code: '5566778899001122334455667788990011223344',
    estimated_cost: 58000,
    platform: 'mobile',
    tags: ['腰射', '机动性', '手游友好'],
    description:
      '手游操作习惯优化，主打近距离腰射与快速转移。\n建议子弹：9×19 AP6.3。\n轻量化枪托 + 激光指示器，牺牲部分精度换取开镜速度与移动射击稳定性。',
    likes_count: 96,
    copies_count: 271,
    ageHours: 168,
  },

  /* ---- 来自 db/04_seed.sql 第 3.2 节：业务方指定预设方案 ---- */
  {
    id: '44444444-4444-4444-8444-444444444444',
    gunSlug: 'ak-74n',
    title: '【S4开荒】平民极简低后坐AK74N',
    code: 'DEMOAK74N0000001',
    estimated_cost: 32000,
    platform: 'both',
    tags: ['性价比', '新手推荐', '低后坐'],
    description:
      '开荒期低成本起装：轻型握把 + 基础消音器，把垂直后坐压到可控区间。\n建议子弹：5.45×39 PP（穿甲）或 BP（均衡）。\n没有堆任何昂贵配件，造价压在 3.2 万，适合封锁区反复起装。',
    likes_count: 0,
    copies_count: 0,
    ageHours: 2,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    gunSlug: 'fal',
    title: '【满配战神】FAL 绝对火力拉满改法',
    code: 'DEMOFAL000000002',
    estimated_cost: 120000,
    platform: 'pc',
    tags: ['满配', '高后坐高伤害', '军港/电视台'],
    description:
      '端游《无限》满配思路：长枪管 + 长消音 + 50 发大弹匣，中近距离弹雨压制一切。\n建议子弹：7.62×51 M61（穿甲）或 M62（均衡），弹药档次直接决定这把枪的上限。\n后坐偏大且左右抖动明显，建议点射或依托掩体短点射。',
    likes_count: 0,
    copies_count: 0,
    ageHours: 5,
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    gunSlug: 'mp5',
    title: '【腰射战神】高性价比 MP5 跑图神器',
    code: 'DEMOMP5000000003',
    estimated_cost: 28000,
    platform: 'mobile',
    tags: ['腰射', '室内战', '跑图'],
    description:
      '手游向腰射流：加装战术手电 + 腰射激光，室内战斗无需开镜，抬手即可压制。\n建议子弹：9×19 7N31（穿甲）或 DumDum 达姆弹（专打腿部）。\n造价 2.8 万，跑图带出去不心疼，适合快速转移与近身遭遇。',
    likes_count: 0,
    copies_count: 0,
    ageHours: 9,
  },

  /* ---- EXTRA：仅用于让预览列表密度接近真实，不属于 db/04_seed.sql ---- */
  {
    id: '99999999-9999-4999-8999-999999999999',
    gunSlug: 'ace32',
    title: '【新枪上手】ACE32 中近通吃稳改方案',
    code: 'ACE32STABLE07x9Q',
    estimated_cost: 62000,
    platform: 'both',
    tags: ['性价比', '低后坐', '新手推荐'],
    description:
      'ACE32 的综合型配置：垂直握把 + 补偿器 + 中倍镜，把后坐压到容易上手的区间。\n建议子弹：7.62×39 BP（穿甲）或 PS（日常）。\n造价 6.2 万，中近距离都能打，适合刚解锁这把枪时先按这套起步。',
    likes_count: 31,
    copies_count: 88,
    ageHours: 6,
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    gunSlug: 'mosin-nagant',
    title: '【一枪入魂】莫辛纳甘低配七倍镜',
    code: 'effCbCERUYCR5h4',
    estimated_cost: 46000,
    platform: 'both',
    tags: ['狙击', '消音', '远距离'],
    description:
      '莫辛纳甘的经济型狙击配置。\n建议子弹：7.62×54R LPS 或 7N1。\n只加装低倍镜与消音器，放弃机动性换取一击必杀的稳定输出，适合北山与山谷架点。',
    likes_count: 214,
    copies_count: 688,
    ageHours: 52,
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    gunSlug: 'p90',
    title: '【近战噩梦】P90 满改压制流',
    code: 'P90xRUSHqQ77zK2',
    estimated_cost: 88000,
    platform: 'pc',
    tags: ['近距离', '极限改装', '腰射'],
    description:
      'P90 的极限近战配置。\n建议子弹：5.7×28 SS190。\n50 发弹匣 + 消音 + 战术导轨，主打室内清点与快速换弹节奏，代价是造价偏高。',
    likes_count: 57,
    copies_count: 143,
    ageHours: 12,
  },
];

/* ---------------------------------------------------------------- 评论 */

interface CommentSeed {
  id: string;
  buildId: string;
  content: string;
  /** 相对"现在"的小时数 */
  ageHours: number;
}

/**
 * 评论数据。
 *
 * 前两条来自 `db/04_seed.sql` 第 4 节，其余为让评论区预览更接近真实而补充。
 * `author` 一律为 null —— 种子数据里的评论都是匿名发表的（author_id 为 NULL），
 * 前端必须能正确渲染"匿名指挥官"这条降级路径。
 */
const COMMENT_SEEDS: CommentSeed[] = [
  {
    id: 'c0000001-0000-4000-8000-000000000001',
    buildId: '11111111-1111-4111-8111-111111111111',
    content: '用了一周，封锁区稳定带走两个，造价确实压得住。',
    ageHours: 26,
  },
  {
    id: 'c0000002-0000-4000-8000-000000000002',
    buildId: '11111111-1111-4111-8111-111111111111',
    content: '建议把枪口换成补偿器，近距离压制手感更好。',
    ageHours: 20,
  },
  {
    id: 'c0000003-0000-4000-8000-000000000003',
    buildId: '22222222-2222-4222-8222-222222222222',
    content: '端游这套确实稳，就是 M995 打起来心疼，日常我换成 M855A1 也够用。',
    ageHours: 60,
  },
  {
    id: 'c0000004-0000-4000-8000-000000000004',
    buildId: '44444444-4444-4444-8444-444444444444',
    content: '开荒期就用这套，PP 弹打封锁区够用了，感谢分享。',
    ageHours: 1,
  },
  {
    id: 'c0000005-0000-4000-8000-000000000005',
    buildId: '55555555-5555-4555-8555-555555555555',
    content: 'FAL 满配后坐真的难压，建议新手先用半配适应一下再上满改。',
    ageHours: 3,
  },
];

/**
 * 各方案的评论数。
 *
 * 刻意**从 COMMENT_SEEDS 推导**而不是手写数字 ——
 * 卡片徽标显示的评论数必须与详情页评论列表的实际条数一致，
 * 手写两处必然漂移（文件末尾有一致性自检兜底）。
 */
const commentCountByBuild = new Map<string, number>();
for (const comment of COMMENT_SEEDS) {
  commentCountByBuild.set(comment.buildId, (commentCountByBuild.get(comment.buildId) ?? 0) + 1);
}

/* -------------------------------------------------- 评分公式（与后端一致） */

/**
 * 与 `db/03_functions.sql` 的 `build_hot_score` 完全一致：
 *   (点赞*3 + 复制) / (小时龄 + 2)^0.6
 * 保留 6 位小数，与 SQL 的 round(..., 6) 对齐。
 *
 * 导出供 api.ts 的 Mock 新增路径复用 —— 保证"新建的方案"也用同一套评分口径。
 */
export function hotScore(likes: number, copies: number, createdIso: string): number {
  const hours = Math.max(0, (Date.now() - new Date(createdIso).getTime()) / 3_600_000);
  const raw = (likes * 3 + copies) / Math.pow(hours + 2, 0.6);
  return Math.round(raw * 1e6) / 1e6;
}

/**
 * 与 `build_cp_score` 完全一致：(点赞*2 + 复制) * 10000 / 最大(造价, 1)
 * 保留 4 位小数。
 */
export function cpScore(likes: number, copies: number, cost: number): number {
  const raw = ((likes * 2 + copies) * 10_000) / Math.max(cost, 1);
  return Math.round(raw * 1e4) / 1e4;
}

/* ---------------------------------------------------------------- 组装 */

const gunBySlug = new Map(GUN_SEEDS.map((g) => [g.slug, g]));
const categoryNameBySlug = new Map(CATEGORIES.map((c) => [c.slug, c.name]));

export const MOCK_BUILDS: BuildDTO[] = BUILD_SEEDS.map((seed) => {
  const gun = gunBySlug.get(seed.gunSlug);
  if (!gun) throw new Error(`Mock 数据引用了不存在的枪械 slug: ${seed.gunSlug}`);

  const createdAt = new Date(Date.now() - seed.ageHours * 3_600_000).toISOString();

  return {
    id: seed.id,
    title: seed.title,
    code: seed.code,
    estimated_cost: seed.estimated_cost,
    platform: seed.platform,
    tags: seed.tags,
    description: seed.description,
    likes_count: seed.likes_count,
    copies_count: seed.copies_count,
    comments_count: commentCountByBuild.get(seed.id) ?? 0,
    hot_score: hotScore(seed.likes_count, seed.copies_count, createdAt),
    cp_score: cpScore(seed.likes_count, seed.copies_count, seed.estimated_cost),
    created_at: createdAt,
    updated_at: createdAt,
    gun: {
      id: gun.id,
      name: gun.name,
      name_en: gun.name_en,
      category: gun.category,
      category_name: categoryNameBySlug.get(gun.category) ?? gun.category,
      // 见文件头说明：刻意置 null，避免预览中出现占位域名的破图
      icon_url: null,
    },
    author: null,
  } satisfies BuildDTO;
});

export const MOCK_COMMENTS: CommentDTO[] = COMMENT_SEEDS.map((seed) => ({
  id: seed.id,
  build_id: seed.buildId,
  content: seed.content,
  created_at: new Date(Date.now() - seed.ageHours * 3_600_000).toISOString(),
  // 与种子数据一致：评论均为匿名（author_id 为 NULL）
  author: null,
}));

/* -------------------------------------------------- 派生统计与枪械列表 */

/** 分类角标数字由方案数据实时推导，避免与列表不一致 */
export const MOCK_CATEGORIES: CategoryDTO[] = CATEGORIES.map((category) => {
  const gunIds = new Set(
    GUN_SEEDS.filter((g) => g.category === category.slug).map((g) => g.id),
  );
  return {
    ...category,
    gun_count: gunIds.size,
    build_count: MOCK_BUILDS.filter((b) => gunIds.has(b.gun.id)).length,
  };
});

export const MOCK_GUNS: GunDTO[] = GUN_SEEDS.map((gun) => ({
  id: gun.id,
  name: gun.name,
  name_en: gun.name_en,
  slug: gun.slug,
  category: gun.category,
  category_name: categoryNameBySlug.get(gun.category) ?? gun.category,
  icon_url: null,
  build_count: MOCK_BUILDS.filter((b) => b.gun.id === gun.id).length,
}));

export const MOCK_GUNS_PAYLOAD: GunsPayload = {
  categories: MOCK_CATEGORIES,
  guns: MOCK_GUNS,
};

/* -------------------------------------------------- 一致性自检 */

// 评论数徽标与评论列表必须对得上，否则"卡片显示 2 条、详情页只有 1 条"
// 这种不一致会让用户觉得站点是坏的。数据一改就会在这里炸出来。
for (const build of MOCK_BUILDS) {
  const actual = MOCK_COMMENTS.filter((comment) => comment.build_id === build.id).length;
  if (actual !== build.comments_count) {
    throw new Error(
      `Mock 数据不一致：方案 ${build.id} 的 comments_count=${build.comments_count}，实际评论 ${actual} 条`,
    );
  }
}
