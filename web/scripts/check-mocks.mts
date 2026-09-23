/**
 * ============================================================================
 *  Mock 数据有效性检查
 *
 *  目的：内置演示数据不能只是"看起来像"，它必须是**后端真的会接受的数据**。
 *  否则会出现"Mock 模式下一切正常，切到真实后端就 400"这种最难查的问题。
 *
 *  检查项：
 *   1. 每条 Mock 方案都能通过后端 `createBuildBodySchema`
 *   2. 每条 Mock 评论都能通过后端 `createCommentBodySchema`
 *   3. 方案引用的枪械存在，枪械引用的分类存在
 *   4. 两个评分函数都返回有限数（不是 NaN / Infinity）
 *   5. 评论数徽标与评论列表条数一致（独立复核 seed.ts 的内部断言）
 *   6. 方案 id 全局唯一
 *
 *  运行：npm run check:mocks
 * ============================================================================
 */

import { createBuildBodySchema, createCommentBodySchema } from '../../src/schemas/builds.schema.js';
import { cpScore, hotScore, MOCK_BUILDS, MOCK_CATEGORIES, MOCK_COMMENTS, MOCK_GUNS } from '../src/mocks/seed.ts';

const problems: string[] = [];

function check(label: string, condition: boolean, detail = ''): void {
  if (!condition) problems.push(`${label}${detail ? `：${detail}` : ''}`);
}

/* -------------------------------------------- 1. 方案通过后端创建校验 */

for (const build of MOCK_BUILDS) {
  const result = createBuildBodySchema.safeParse({
    gun_id: build.gun.id,
    title: build.title,
    code: build.code,
    estimated_cost: build.estimated_cost,
    platform: build.platform,
    tags: build.tags,
    description: build.description,
  });

  if (!result.success) {
    problems.push(
      `方案「${build.title}」无法通过后端校验：` +
        result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '),
    );
  }
}

/* -------------------------------------------- 2. 评论通过后端校验 */

for (const comment of MOCK_COMMENTS) {
  const result = createCommentBodySchema.safeParse({ content: comment.content });
  if (!result.success) {
    problems.push(
      `评论 ${comment.id} 无法通过后端校验：` +
        result.error.issues.map((i) => i.message).join('; '),
    );
  }
}

/* -------------------------------------------- 3. 外键可解析 */

const gunIds = new Set(MOCK_GUNS.map((g) => g.id));
const categorySlugs = new Set(MOCK_CATEGORIES.map((c) => c.slug));

for (const build of MOCK_BUILDS) {
  check(`方案「${build.title}」引用了不存在的枪械`, gunIds.has(build.gun.id));
}
for (const gun of MOCK_GUNS) {
  check(`枪械 ${gun.name} 引用了不存在的分类 ${gun.category}`, categorySlugs.has(gun.category));
}
for (const comment of MOCK_COMMENTS) {
  check(
    `评论 ${comment.id} 挂在了不存在的方案 ${comment.build_id}`,
    MOCK_BUILDS.some((b) => b.id === comment.build_id),
  );
}

/* -------------------------------------------- 4. 评分函数返回有限数 */

for (const build of MOCK_BUILDS) {
  check(
    `方案「${build.title}」的 hot_score 不是有限数`,
    build.hot_score !== null && Number.isFinite(build.hot_score),
    String(build.hot_score),
  );
  check(
    `方案「${build.title}」的 cp_score 不是有限数`,
    build.cp_score !== null && Number.isFinite(build.cp_score),
    String(build.cp_score),
  );
}

// 直接用导出的公式再算一遍，确认组装时用的就是同一套公式。
//
// ⚠️ hot_score 不能做精确相等比较：`hotScore` 内部读 `Date.now()`，
//    组装发生在模块加载时，这里重算要晚几毫秒，分数必然有极小差异。
//    因此用相对容差判断，而不是 `===`。（这是断言写法问题，不是数据问题。）
const sample = MOCK_BUILDS[0];
if (sample) {
  const recomputedHot = hotScore(sample.likes_count, sample.copies_count, sample.created_at);
  const assembledHot = sample.hot_score ?? 0;
  const relativeDiff =
    assembledHot === 0 ? Math.abs(recomputedHot) : Math.abs(recomputedHot - assembledHot) / assembledHot;

  check(
    '组装出的 hot_score 与 hotScore() 公式结果偏差过大',
    relativeDiff < 1e-3,
    `组装 ${assembledHot} / 重算 ${recomputedHot}`,
  );

  // cp_score 不含时间项，可以精确比较
  check(
    '组装出的 cp_score 与 cpScore() 公式结果不一致',
    sample.cp_score === cpScore(sample.likes_count, sample.copies_count, sample.estimated_cost),
    `组装 ${sample.cp_score} / 重算 ${cpScore(sample.likes_count, sample.copies_count, sample.estimated_cost)}`,
  );
}

/* -------------------------------------------- 5. 评论数一致 */

for (const build of MOCK_BUILDS) {
  const actual = MOCK_COMMENTS.filter((c) => c.build_id === build.id).length;
  check(
    `方案「${build.title}」的 comments_count 与评论列表不一致`,
    actual === build.comments_count,
    `徽标 ${build.comments_count} / 实际 ${actual}`,
  );
}

/* -------------------------------------------- 6. id 唯一 */

const buildIdSet = new Set(MOCK_BUILDS.map((b) => b.id));
check('方案 id 存在重复', buildIdSet.size === MOCK_BUILDS.length);

const commentIdSet = new Set(MOCK_COMMENTS.map((c) => c.id));
check('评论 id 存在重复', commentIdSet.size === MOCK_COMMENTS.length);

/* -------------------------------------------- 汇总 */

console.log('='.repeat(72));
console.log(`方案 ${MOCK_BUILDS.length} 条 / 评论 ${MOCK_COMMENTS.length} 条 / 枪械 ${MOCK_GUNS.length} 把`);
console.log('='.repeat(72));

if (problems.length === 0) {
  console.log('\n✅ Mock 数据全部有效：可通过后端校验、外键可解析、计数一致。');
  process.exit(0);
}

console.log(`\n发现 ${problems.length} 个问题：`);
for (const problem of problems) console.log(`  · ${problem}`);
process.exit(1);
