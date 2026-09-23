import { z } from 'zod';

/* ============================================================
 *  共享枚举
 * ============================================================ */

/** 平台取值，与 DB 枚举 build_platform 严格一致 */
export const PLATFORM_VALUES = ['mobile', 'pc', 'both'] as const;
export type Platform = (typeof PLATFORM_VALUES)[number];

/**
 * 排序策略。取值与 db/03_functions.sql 中的评分函数一一对应：
 *  · latest           —— 最新发布
 *  · hot              —— 最热（点赞*3 + 复制，按小时龄做 0.6 次幂衰减）
 *  · cost_performance —— 性价比最高（社区认可度 / 造价）
 *  · cost_asc         —— 造价从低到高
 *  · cost_desc        —— 造价从高到低
 */
export const SORT_VALUES = ['latest', 'hot', 'cost_performance', 'cost_asc', 'cost_desc'] as const;
export type SortKey = (typeof SORT_VALUES)[number];

/**
 * 允许的标签，避免标签污染导致筛选失效；可按运营需要扩展。
 *
 * ⚠️ 注意：本常量目前仅作声明，尚未接入任何 zod 校验（createBuildBodySchema.tags
 * 只校验长度与个数）。若后续要强制，请加 .refine(v => v.every(t => ALLOWED_TAGS.includes(t)))，
 * 但那会拒绝存量客户端提交的自定义标签，属于破坏性变更，需先评估。
 *
 * 与 db/04_seed.sql 保持同步：种子数据中出现过的标签必须在此列出，
 * 否则一旦启用强校验，种子行将无法被正常编辑保存。
 */
export const ALLOWED_TAGS = [
  // 造价 / 后坐
  '性价比', '低后坐', '高后坐控制', '满配', '极限改装',
  // 射击方式 / 机动
  '腰射', '机动性', '跑图', '远距离', '近距离',
  // 枪种 / 配件
  '狙击', '消音',
  // 场景
  '封锁区', '军港/电视台', '室内战',
  // 面向人群
  '新手向', '新手推荐',
  // 平台
  '端游专属', '手游友好',
] as const;

/* ============================================================
 *  GET /api/guns
 * ============================================================ */
export const listGunsQuerySchema = z
  .object({
    category: z.string().trim().min(1).max(32).optional(),
    q: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export type ListGunsQuery = z.infer<typeof listGunsQuerySchema>;

/* ============================================================
 *  GET /api/builds
 * ============================================================ */
export const listBuildsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(20),

    // ---- 筛选维度 ----
    category: z.string().trim().min(1).max(32).optional(),
    platform: z.enum(PLATFORM_VALUES).optional(),
    gun_id: z.string().uuid('gun_id 必须是合法 UUID').optional(),
    tag: z.string().trim().min(1).max(16).optional(),
    q: z.string().trim().min(1).max(60).optional(),
    min_cost: z.coerce.number().int().min(0).max(999_999_999_999).optional(),
    max_cost: z.coerce.number().int().min(0).max(999_999_999_999).optional(),

    sort: z.enum(SORT_VALUES).default('latest'),
  })
  .strict()
  .refine(
    (v) => v.min_cost === undefined || v.max_cost === undefined || v.min_cost <= v.max_cost,
    { message: 'min_cost 不能大于 max_cost', path: ['min_cost'] },
  );

export type ListBuildsQuery = z.infer<typeof listBuildsQuerySchema>;

/* ============================================================
 *  POST /api/builds
 * ============================================================ */

/**
 * 改枪码校验：允许可打印 ASCII（不含空白），长度 8~2048。
 * 与 DB 约束 builds_code_len / builds_code_no_space 保持一致，
 * 避免"应用层放行、数据库报错"的错配。
 */
const CODE_PATTERN = /^[\x21-\x7E]{8,2048}$/;

/**
 * 数值字段的容错转换。
 * 直接用 z.coerce.number() 在字段缺失时会得到 NaN，报错信息为
 * "Expected number, received nan"，对前端表单极不友好；
 * 这里先用 preprocess 把「空值」归一到 undefined，再由 required_error 接管。
 */
const requiredInt = (label: string, min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : Number(v)),
    z
      .number({
        required_error: `${label}必填`,
        invalid_type_error: `${label}必须是数字`,
      })
      .int(`${label}必须为整数`)
      .min(min, `${label}不能小于 ${min}`)
      .max(max, `${label}超出允许范围`),
  );

export const createBuildBodySchema = z
  .object({
    gun_id: z
      .string({ required_error: 'gun_id 必填' })
      .uuid('gun_id 必须是合法 UUID'),
    title: z
      .string({ required_error: '标题必填' })
      .trim()
      .min(2, '标题至少 2 个字符')
      .max(80, '标题最多 80 个字符'),
    code: z
      .string({ required_error: '改枪码必填' })
      .trim()
      .regex(CODE_PATTERN, '改枪码格式非法（仅允许 8~2048 位可打印字符且不含空格）'),
    estimated_cost: requiredInt('预估造价', 0, 999_999_999_999),
    platform: z.enum(PLATFORM_VALUES).default('both'),
    tags: z.array(z.string().trim().min(1).max(16)).max(8, '标签最多 8 个').default([]),
    description: z.string().trim().max(2000, '方案说明最多 2000 个字符').nullish(),
  })
  .strict();

export type CreateBuildBody = z.infer<typeof createBuildBodySchema>;

/* ============================================================
 *  路径参数 / 评论
 * ============================================================ */
export const idParamSchema = z
  .object({ id: z.string().uuid('路径参数 id 必须是合法 UUID') })
  .strict();

export type IdParam = z.infer<typeof idParamSchema>;

export const createCommentBodySchema = z
  .object({
    content: z.string().trim().min(1, '评论不能为空').max(500, '评论最多 500 个字符'),
  })
  .strict();

export type CreateCommentBody = z.infer<typeof createCommentBodySchema>;

export const listCommentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
