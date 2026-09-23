/**
 * ============================================================================
 *  暗区突围 · 改枪码分享站  ——  数据库集成测试
 *
 *  运行环境：PGlite（PostgreSQL 18 的 WebAssembly 构建）——真实 PG 内核，
 *            非模拟器，因此 RLS、触发器、SECURITY DEFINER、生成列、
 *            security_invoker 视图的行为与生产环境一致。
 *
 *  运行：npm run test:db
 *
 *  ⚠️ 覆盖范围与边界：
 *    · 覆盖：建库脚本可执行性、约束、索引、触发器同步、RLS 拦截、
 *            列级授权、RPC 语义、排序口径、分页一致性、评分函数。
 *    · 不覆盖：多连接真并发（PGlite 为单连接），该场景需在真实 Supabase
 *              实例上用多会话压测验证。
 * ============================================================================
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { btree_gin } from '@electric-sql/pglite/contrib/btree_gin';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 必须与 README 的部署顺序一致 */
const DB_FILES = [
  '00_auth_shim.sql',
  '01_schema.sql',
  '03_functions.sql',
  '02_rls.sql',
  '04_seed.sql',
];

const SEED_BUILD_AKM = '11111111-1111-4111-8111-111111111111';
const SEED_BUILD_M4A1 = '22222222-2222-4222-8222-222222222222';

/** 业务方指定预设方案（db/04_seed.sql 第 3.2 节），固定 UUID 便于断言 */
const PRESET_BUILD_AK74N = '44444444-4444-4444-8444-444444444444';
const PRESET_BUILD_FAL = '55555555-5555-4555-8555-555555555555';
const PRESET_BUILD_MP5 = '66666666-6666-4666-8666-666666666666';
const PRESET_BUILD_IDS = [PRESET_BUILD_AK74N, PRESET_BUILD_FAL, PRESET_BUILD_MP5];

const USER_A = 'a0000000-0000-4000-8000-000000000001';
const USER_B = 'b0000000-0000-4000-8000-000000000002';

let db;

/* ---------------------------------------------------------------- 工具 */

async function scalar(sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : undefined;
}

/**
 * 以指定数据库角色 + 模拟 JWT 身份执行一段逻辑。
 * 这是复现 RLS 行为的关键：PGlite 的会话用户是超级用户 postgres，
 * 而超级用户会绕过 RLS，必须先 SET ROLE 到非属主角色。
 */
async function runAs(role, jwtSub, fn) {
  await db.exec(`SET ROLE ${role};`);
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    jwtSub ? JSON.stringify({ sub: jwtSub, role }) : '',
  ]);
  try {
    return await fn();
  } finally {
    await db.exec('RESET ROLE;');
    await db.query(`SELECT set_config('request.jwt.claims', '', false)`);
  }
}

/** 以超级用户身份建一个方案，返回 id */
async function seedBuild({ gunSlug, authorId = null, title, code, cost, likes = 0, copies = 0, status = 'published' }) {
  const gunId = await scalar(`SELECT id FROM public.guns WHERE slug = $1`, [gunSlug]);
  const r = await db.query(
    `INSERT INTO public.builds (gun_id, author_id, title, code, estimated_cost, platform, tags, status, likes_count, copies_count)
     VALUES ($1, $2, $3, $4, $5, 'both'::public.build_platform, ARRAY['性价比'], $6::public.build_status, $7, $8)
     RETURNING id`,
    [gunId, authorId, title, code, cost, status, likes, copies],
  );
  return r.rows[0].id;
}

/* ---------------------------------------------------------------- 建库 */

before(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, btree_gin } });
  for (const file of DB_FILES) {
    const sql = readFileSync(path.join(ROOT, 'db', file), 'utf8');
    await db.exec(sql);
  }
});

after(async () => {
  await db?.close();
});

/* ================================================================ 1. 建库完整性 */

test('建库：5 个 SQL 脚本按序执行成功，无语法与依赖错误', async () => {
  const version = await scalar('SHOW server_version');
  assert.ok(version, 'PostgreSQL 内核可用');
  const tables = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const names = tables.rows.map((r) => r.tablename);
  for (const t of ['gun_categories', 'guns', 'builds', 'comments', 'build_likes', 'profiles']) {
    assert.ok(names.includes(t), `缺少表 ${t}`);
  }
});

test('种子数据：6 个分类 / 60 把枪械 / 6 个方案', async () => {
  const r = await db.query(`SELECT
      (SELECT count(*) FROM public.gun_categories)::int AS categories,
      (SELECT count(*) FROM public.guns)::int           AS guns,
      (SELECT count(*) FROM public.builds)::int         AS builds`);
  assert.equal(r.rows[0].categories, 6);
  assert.equal(r.rows[0].guns, 60);
  assert.equal(r.rows[0].builds, 6);
});

/* ---------------- 预设测试数据：逐项对齐需求规格 ---------------- */

test('预设枪械：AK-74N / FAL / Mosin-Nagant 已入库且分类正确', async () => {
  const r = await db.query(
    `SELECT slug, category FROM public.guns WHERE slug = ANY($1::text[])`,
    [['ak-74n', 'fal', 'mosin-nagant']],
  );
  const bySlug = Object.fromEntries(r.rows.map((x) => [x.slug, x.category]));

  assert.equal(Object.keys(bySlug).length, 3, '3 把补充枪械都应存在');
  assert.equal(bySlug['ak-74n'], 'assault_rifle');
  assert.equal(bySlug['fal'], 'assault_rifle');
  assert.equal(bySlug['mosin-nagant'], 'sniper_rifle');
});

test('预设方案：造价 / 平台 / 标签 / 所属枪械与需求规格逐项一致', async () => {
  const r = await db.query(
    `SELECT g.slug AS gun_slug, b.title, b.estimated_cost::int AS cost, b.platform, b.tags, b.status
       FROM public.builds b
       JOIN public.guns g ON g.id = b.gun_id
      WHERE b.id = ANY($1::uuid[])`,
    [PRESET_BUILD_IDS],
  );
  assert.equal(r.rows.length, 3);

  const bySlug = Object.fromEntries(r.rows.map((x) => [x.gun_slug, x]));

  assert.equal(bySlug['ak-74n'].title, '【S4开荒】平民极简低后坐AK74N');
  assert.equal(bySlug['ak-74n'].cost, 32000);
  assert.equal(bySlug['ak-74n'].platform, 'both');
  assert.deepEqual(bySlug['ak-74n'].tags, ['性价比', '新手推荐', '低后坐']);

  assert.equal(bySlug['fal'].title, '【满配战神】FAL 绝对火力拉满改法');
  assert.equal(bySlug['fal'].cost, 120000);
  assert.equal(bySlug['fal'].platform, 'pc');
  assert.deepEqual(bySlug['fal'].tags, ['满配', '高后坐高伤害', '军港/电视台']);

  assert.equal(bySlug['mp5'].title, '【腰射战神】高性价比 MP5 跑图神器');
  assert.equal(bySlug['mp5'].cost, 28000);
  assert.equal(bySlug['mp5'].platform, 'mobile');
  assert.deepEqual(bySlug['mp5'].tags, ['腰射', '室内战', '跑图']);

  for (const row of r.rows) {
    assert.equal(row.status, 'published', '预设方案应默认可被匿名读取');
  }
});

test('预设方案：description 均写明建议子弹类型', async () => {
  const r = await db.query(
    `SELECT g.slug AS gun_slug, b.description
       FROM public.builds b
       JOIN public.guns g ON g.id = b.gun_id
      WHERE b.id = ANY($1::uuid[])`,
    [PRESET_BUILD_IDS],
  );
  assert.equal(r.rows.length, 3);
  for (const { gun_slug: gunSlug, description } of r.rows) {
    assert.ok(description, `${gunSlug} 缺少方案说明`);
    assert.ok(
      description.includes('建议子弹'),
      `${gunSlug} 的方案说明应包含建议子弹类型`,
    );
  }
});

test('预设方案：改枪码为格式合法的 DEMO 占位符，且生成列 md5 正确', async () => {
  const r = await db.query(
    `SELECT code, code_hash FROM public.builds WHERE id = ANY($1::uuid[])`,
    [PRESET_BUILD_IDS],
  );
  assert.equal(r.rows.length, 3);

  for (const { code, code_hash: hash } of r.rows) {
    // 与 DB 约束 builds_code_len / builds_code_no_space 及应用层 CODE_PATTERN 对齐
    assert.match(code, /^[\x21-\x7E]{8,2048}$/);
    assert.ok(
      code.startsWith('DEMO'),
      '占位改枪码应以 DEMO 前缀标记，便于上线前全局搜索替换为真实码',
    );
    assert.equal(hash, createHash('md5').update(code).digest('hex'));
  }

  assert.equal(new Set(r.rows.map((x) => x.code)).size, 3, '占位码之间不应重复');
});

test('枚举类型：build_platform / build_status / user_role 均已创建', async () => {
  const r = await db.query(
    `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     GROUP BY t.typname`,
  );
  const map = Object.fromEntries(r.rows.map((x) => [x.typname, x.labels]));
  assert.deepEqual(map.build_platform, ['mobile', 'pc', 'both']);
  assert.deepEqual(map.build_status, ['draft', 'published', 'hidden', 'removed']);
  assert.deepEqual(map.user_role, ['user', 'moderator', 'admin']);
});

test('生成列：code_hash 由数据库自动计算为 code 的 md5', async () => {
  const r = await db.query(`SELECT code, code_hash FROM public.builds WHERE id = $1`, [SEED_BUILD_AKM]);
  assert.equal(r.rows[0].code_hash, createHash('md5').update(r.rows[0].code).digest('hex'));
});

test('索引：排序与筛选所需的索引全部就位', async () => {
  const r = await db.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'builds'`,
  );
  const names = r.rows.map((x) => x.indexname);
  for (const need of [
    'ix_builds_created',
    'ix_builds_likes',
    'ix_builds_cost',
    'ix_builds_gun_platform',
    'ix_builds_tags',
    'ix_builds_title_trgm',
  ]) {
    assert.ok(names.includes(need), `缺少索引 ${need}`);
  }
});

test('约束：改枪码含空格被 CHECK 拒绝，负造价被拒绝，标题超长被拒绝', async () => {
  const gunId = await scalar(`SELECT id FROM public.guns WHERE slug = 'mp5'`);
  await assert.rejects(
    () => db.query(`INSERT INTO public.builds (gun_id,title,code,estimated_cost) VALUES ($1,'t','1234 5678',1)`, [gunId]),
    /builds_code_no_space/,
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.builds (gun_id,title,code,estimated_cost) VALUES ($1,'t','12345678',-1)`, [gunId]),
    /builds_cost_non_neg/,
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.builds (gun_id,title,code,estimated_cost) VALUES ($1,$2,'12345678',1)`, [gunId, 'x'.repeat(81)]),
    /builds_title_len/,
  );
});

/* ================================================================ 2. 触发器 */

test('触发器：评论增删实时同步 comments_count', async () => {
  const base = await scalar(`SELECT comments_count FROM public.builds WHERE id = $1`, [SEED_BUILD_AKM]);
  const ins = await db.query(
    `INSERT INTO public.comments (build_id, content) VALUES ($1, '触发器同步测试') RETURNING id`,
    [SEED_BUILD_AKM],
  );
  assert.equal(
    await scalar(`SELECT comments_count FROM public.builds WHERE id = $1`, [SEED_BUILD_AKM]),
    base + 1,
  );
  await db.query(`DELETE FROM public.comments WHERE id = $1`, [ins.rows[0].id]);
  assert.equal(
    await scalar(`SELECT comments_count FROM public.builds WHERE id = $1`, [SEED_BUILD_AKM]),
    base,
  );
});

test('触发器：builds.updated_at 仅在内容变更时刷新，计数变更不刷新', async () => {
  const id = await seedBuild({ gunSlug: 'uzi', title: '时间戳测试方案', code: '9876543210987654', cost: 1000 });
  const t0 = await scalar(`SELECT updated_at FROM public.builds WHERE id = $1`, [id]);

  // 仅改计数（超级用户通道）-> updated_at 不应变化
  await db.query(`UPDATE public.builds SET likes_count = likes_count + 1 WHERE id = $1`, [id]);
  assert.deepEqual(
    await scalar(`SELECT updated_at FROM public.builds WHERE id = $1`, [id]),
    t0,
    '计数变更不应污染 updated_at',
  );

  // 改内容 -> updated_at 应刷新
  await db.query(`UPDATE public.builds SET title = '时间戳测试方案 v2' WHERE id = $1`, [id]);
  const t1 = await scalar(`SELECT updated_at FROM public.builds WHERE id = $1`, [id]);
  assert.ok(t1 > t0, '内容变更应刷新 updated_at');
});

/* ================================================================ 3. RPC 语义 */

test('RPC：increment_build_copies 连续 200 次调用无丢失更新', async () => {
  const id = await seedBuild({ gunSlug: 'g36c', title: '原子递增测试', code: '1111222233334444', cost: 5000 });
  for (let i = 0; i < 200; i += 1) {
    await db.query(`SELECT public.increment_build_copies($1)`, [id]);
  }
  assert.equal(await scalar(`SELECT copies_count FROM public.builds WHERE id = $1`, [id]), 200);
});

test('RPC：increment_build_copies 返回值即为递增后的精确值', async () => {
  const id = await seedBuild({ gunSlug: 'g36c', title: '返回值测试', code: '5555666677778888', cost: 5000 });
  const r = await db.query(`SELECT public.increment_build_copies($1) AS c`, [id]);
  assert.equal(r.rows[0].c, 1, 'RETURNING 保证返回值与落库值一致');
});

test('RPC：方案不存在时抛出 BUILD_NOT_FOUND (P0002)', async () => {
  await assert.rejects(
    () => db.query(`SELECT public.increment_build_copies('00000000-0000-4000-8000-0000000000ff')`),
    /BUILD_NOT_FOUND/,
  );
});

test('RPC：toggle_build_like 幂等 —— 同一用户重复点赞只计一次', async () => {
  await db.query(
    `INSERT INTO auth.users (id, email) VALUES ($1,'a@test.dev'),($2,'b@test.dev') ON CONFLICT (id) DO NOTHING`,
    [USER_A, USER_B],
  );
  const id = await seedBuild({ gunSlug: 'mp7', title: '幂等点赞测试', code: '2222333344445555', cost: 8000 });
  const base = await scalar(`SELECT likes_count FROM public.builds WHERE id = $1`, [id]);

  const first = await runAs('authenticated', USER_A, () =>
    db.query(`SELECT liked, likes_count FROM public.toggle_build_like($1)`, [id]),
  );
  assert.equal(first.rows[0].liked, true);
  assert.equal(first.rows[0].likes_count, base + 1);

  const second = await runAs('authenticated', USER_A, () =>
    db.query(`SELECT liked, likes_count FROM public.toggle_build_like($1)`, [id]),
  );
  assert.equal(second.rows[0].liked, false, '再次调用应变为取消点赞');
  assert.equal(second.rows[0].likes_count, base, '重复点赞不得重复计数');

  // 不同用户点赞则各自计数
  await runAs('authenticated', USER_B, () =>
    db.query(`SELECT liked, likes_count FROM public.toggle_build_like($1)`, [id]),
  );
  assert.equal(await scalar(`SELECT likes_count FROM public.builds WHERE id = $1`, [id]), base + 1);
});

test('RPC：未登录调用 toggle_build_like 抛出 AUTH_REQUIRED', async () => {
  await assert.rejects(
    () => runAs('anon', null, () => db.query(`SELECT * FROM public.toggle_build_like($1)`, [SEED_BUILD_AKM])),
    /AUTH_REQUIRED|permission denied/i,
  );
});

/* ================================================================ 4. RLS 安全 */

test('RLS：anon 可以读取已发布方案，但读不到草稿', async () => {
  const draftId = await seedBuild({ gunSlug: 'uzi', authorId: USER_A, title: '草稿方案', code: '3333444455556666', cost: 100, status: 'draft' });

  const visible = await runAs('anon', null, async () => {
    const published = await db.query(`SELECT id FROM public.builds WHERE id = $1`, [SEED_BUILD_AKM]);
    const draft = await db.query(`SELECT id FROM public.builds WHERE id = $1`, [draftId]);
    return { published: published.rows.length, draft: draft.rows.length };
  });
  assert.equal(visible.published, 1, '已发布方案对匿名可见');
  assert.equal(visible.draft, 0, '草稿对匿名不可见');

  const owner = await runAs('authenticated', USER_A, () =>
    db.query(`SELECT id FROM public.builds WHERE id = $1`, [draftId]),
  );
  assert.equal(owner.rows.length, 1, '作者本人可见自己的草稿');
});

test('RLS：anon 无 INSERT 权限，无法提交方案', async () => {
  const gunId = await scalar(`SELECT id FROM public.guns WHERE slug = 'uzi'`);
  await assert.rejects(
    () => runAs('anon', null, () =>
      db.query(`INSERT INTO public.builds (gun_id,title,code,estimated_cost) VALUES ($1,'x','12345678',1)`, [gunId]),
    ),
    /permission denied/i,
  );
});

test('RLS：用户 B 无法修改或删除用户 A 的方案', async () => {
  const id = await seedBuild({ gunSlug: 'p90', authorId: USER_A, title: 'A 的方案', code: '4444555566667777', cost: 9000 });

  const upd = await runAs('authenticated', USER_B, () =>
    db.query(`UPDATE public.builds SET title = '被篡改' WHERE id = $1 RETURNING id`, [id]),
  );
  assert.equal(upd.rows.length, 0, 'RLS 应过滤掉他人的行，导致 0 行受影响');

  const del = await runAs('authenticated', USER_B, () =>
    db.query(`DELETE FROM public.builds WHERE id = $1 RETURNING id`, [id]),
  );
  assert.equal(del.rows.length, 0, '用户 B 不得删除他人方案');

  const still = await scalar(`SELECT title FROM public.builds WHERE id = $1`, [id]);
  assert.equal(still, 'A 的方案', '原方案未被改动');
});

test('RLS + 列级授权：作者无法自行刷高 likes_count / copies_count', async () => {
  const id = await seedBuild({ gunSlug: 'vector', authorId: USER_A, title: '防刷计数测试', code: '6666777788889999', cost: 12000 });
  const before = await scalar(`SELECT likes_count FROM public.builds WHERE id = $1`, [id]);

  const attempt = await runAs('authenticated', USER_A, async () => {
    try {
      const q = await db.query(
        `UPDATE public.builds SET title = '合法改名', likes_count = 99999, copies_count = 99999 WHERE id = $1 RETURNING likes_count, copies_count`,
        [id],
      );
      return { blocked: false, likes: q.rows[0]?.likes_count };
    } catch (err) {
      return { blocked: true, message: err.message };
    }
  });

  assert.ok(
    attempt.blocked || attempt.likes === before,
    '计数列必须无法被方案作者篡改（列级 GRANT 拒绝 或 触发器回滚）',
  );

  const finalLikes = await scalar(`SELECT likes_count FROM public.builds WHERE id = $1`, [id]);
  assert.equal(finalLikes, before, '最终计数保持不变');
});

test('RLS：作者可以正常修改自己方案的业务字段', async () => {
  const id = await seedBuild({ gunSlug: 'mpx', authorId: USER_A, title: '待改名', code: '7777888899990000', cost: 3000 });
  const upd = await runAs('authenticated', USER_A, () =>
    db.query(`UPDATE public.builds SET title = '改名成功' WHERE id = $1 RETURNING title`, [id]),
  );
  assert.equal(upd.rows.length, 1);
  assert.equal(upd.rows[0].title, '改名成功');
});

test('RLS：点赞关系表只能操作自己的记录', async () => {
  const id = await seedBuild({ gunSlug: 'mac-10', title: '点赞权限测试', code: '8888999900001111', cost: 2000 });
  await runAs('authenticated', USER_A, () =>
    db.query(`INSERT INTO public.build_likes (build_id, user_id) VALUES ($1, $2)`, [id, USER_A]),
  );

  // 用户 B 尝试删除 A 的点赞记录：RLS 会静默过滤掉该行，表现为 0 行受影响，
  // 而非抛出权限错误——这是 RLS 的标准语义，安全性与报错等价。
  const del = await runAs('authenticated', USER_B, () =>
    db.query(`DELETE FROM public.build_likes WHERE build_id = $1 AND user_id = $2 RETURNING user_id`, [id, USER_A]),
  );
  assert.equal(del.rows.length, 0, '不得删除他人的点赞记录');

  assert.equal(
    await scalar(`SELECT count(*)::int FROM public.build_likes WHERE build_id = $1 AND user_id = $2`, [id, USER_A]),
    1,
    'A 的点赞记录应完好无损',
  );

  // B 无法伪造 A 的点赞（user_id 必须等于自己）
  await assert.rejects(
    () => runAs('authenticated', USER_B, () =>
      db.query(`INSERT INTO public.build_likes (build_id, user_id) VALUES ($1, $2)`, [id, USER_A]),
    ),
    /row-level security/i,
  );
});

/* ================================================================ 5. 排序与分页 */

test('评分函数：cp_score 与 hot_score 计算口径正确', async () => {
  const r = await db.query(`SELECT
      public.build_cp_score(10, 20, 10000)::float8 AS cp_normal,
      public.build_cp_score(0, 0, 0)::float8       AS cp_zero_cost,
      public.build_hot_score(0, 0, now())::float8  AS hot_zero`);
  assert.equal(r.rows[0].cp_normal, 40, '(10*2+20)*10000/10000 = 40');
  assert.equal(r.rows[0].cp_zero_cost, 0, '零认可度方案得分为 0，且不因除零报错');
  assert.equal(r.rows[0].hot_zero, 0, '零互动方案热度为 0');
});

test('评分函数：hot_score 随发布时长单调衰减', async () => {
  const r = await db.query(`SELECT
      public.build_hot_score(100, 100, now())::float8                            AS fresh,
      public.build_hot_score(100, 100, now() - interval '7 days')::float8        AS week_old,
      public.build_hot_score(100, 100, now() - interval '90 days')::float8       AS quarter_old`);
  assert.ok(r.rows[0].fresh > r.rows[0].week_old, '新方案热度应高于一周前');
  assert.ok(r.rows[0].week_old > r.rows[0].quarter_old, '一周前应高于三个月前');
});

test('排序：cost_performance 让低造价高认可度方案排在前面', async () => {
  const cheap = await seedBuild({ gunSlug: 'ak-74m', title: '高性价比方案', code: '1010101010101010', cost: 10000, likes: 100, copies: 200 });
  const pricey = await seedBuild({ gunSlug: 'ak-74m', title: '昂贵低认可方案', code: '2020202020202020', cost: 500000, likes: 1, copies: 0 });

  const ranked = await db.query(
    `SELECT id, public.build_cp_score(likes_count, copies_count, estimated_cost)::float8 AS cp
     FROM public.builds WHERE status = 'published'
     ORDER BY cp DESC, id DESC`,
  );
  const order = ranked.rows.map((r) => r.id);
  assert.ok(
    order.indexOf(cheap) < order.indexOf(pricey),
    '性价比分应把 1 万造价/300 认可 排在 50 万造价/1 认可 之前',
  );
});

test('排序：hot 让新方案有机会超越旧方案（时间衰减生效）', async () => {
  const fresh = await seedBuild({ gunSlug: 'svd', title: '新方案', code: '3030303030303030', cost: 20000, likes: 20, copies: 20 });
  const old = await seedBuild({ gunSlug: 'svd', title: '老方案', code: '4040404040404040', cost: 20000, likes: 20, copies: 20 });
  await db.query(`UPDATE public.builds SET created_at = now() - interval '120 days' WHERE id = $1`, [old]);

  const ranked = await db.query(
    `SELECT id, public.build_hot_score(likes_count, copies_count, created_at)::float8 AS hot
     FROM public.builds WHERE status = 'published'
     ORDER BY hot DESC, id DESC`,
  );
  const order = ranked.rows.map((r) => r.id);
  assert.ok(
    order.indexOf(fresh) < order.indexOf(old),
    '相同互动量下，新方案热度应高于 120 天前的方案',
  );
});

test('分页：相邻页无重叠、无遗漏，总数与明细一致', async () => {
  const total = await scalar(`SELECT count(*)::int FROM public.builds WHERE status = 'published'`);
  const pageSize = 3;

  const seen = new Set();
  const pages = Math.ceil(total / pageSize);
  for (let p = 0; p < pages; p += 1) {
    const r = await db.query(
      `SELECT id FROM public.builds WHERE status = 'published'
       ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
      [pageSize, p * pageSize],
    );
    for (const row of r.rows) {
      assert.ok(!seen.has(row.id), `分页出现重复项 ${row.id}`);
      seen.add(row.id);
    }
  }
  assert.equal(seen.size, total, '翻完所有页应恰好覆盖全部记录，不重不漏');
});

test('索引可行性：cp_score 可建表达式索引，hot_score 因 STABLE 被拒绝', async () => {
  // 这是排序优化路径的分水岭，值得固化为回归断言：
  //   · 索引表达式只接受 IMMUTABLE 函数
  //   · build_cp_score 不含时间项 -> IMMUTABLE -> 可索引
  //   · build_hot_score 依赖 now() -> 只能标 STABLE -> 永远无法索引，
  //     因此热度榜到量级后必须走物化视图 / 定时重算，而不是加索引
  const vol = await db.query(
    `SELECT p.proname, p.provolatile
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('build_hot_score', 'build_cp_score')`,
  );
  const v = Object.fromEntries(vol.rows.map((x) => [x.proname, x.provolatile]));
  assert.equal(v['build_cp_score'], 'i', 'cp_score 必须 IMMUTABLE，否则无法建表达式索引');
  assert.equal(v['build_hot_score'], 's', 'hot_score 依赖 now()，只能是 STABLE');

  // 正向：cp_score 表达式索引确实可以建立
  await db.exec(`CREATE INDEX ix_probe_cp ON public.builds
    (public.build_cp_score(likes_count, copies_count, estimated_cost) DESC)`);
  const idx = await db.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_probe_cp'`,
  );
  assert.equal(idx.rows.length, 1, 'cp_score 表达式索引应创建成功');
  await db.exec('DROP INDEX public.ix_probe_cp');

  // 反向：hot_score 建索引必须被 PostgreSQL 明确拒绝
  await assert.rejects(
    () =>
      db.exec(`CREATE INDEX ix_probe_hot ON public.builds
        (public.build_hot_score(likes_count, copies_count, created_at) DESC)`),
    /must be marked IMMUTABLE/i,
  );
});

/* ================================================================ 6. 聚合视图 */

test('视图：v_builds_feed 正确聚合枪械信息与评分', async () => {
  const r = await db.query(
    `SELECT gun_name, gun_category, gun_category_name, hot_score, cp_score
     FROM public.v_builds_feed WHERE id = $1`,
    [SEED_BUILD_AKM],
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].gun_name, 'AKM');
  assert.equal(r.rows[0].gun_category, 'assault_rifle');
  assert.equal(r.rows[0].gun_category_name, '突击步枪');
  assert.ok(r.rows[0].hot_score !== null && r.rows[0].cp_score !== null);
});

test('视图：v_category_stats 统计各分类枪械与方案数量', async () => {
  const r = await db.query(
    `SELECT category, category_name, gun_count::int AS gun_count, build_count::int AS build_count
     FROM public.v_category_stats ORDER BY sort_order`,
  );
  assert.equal(r.rows.length, 6);
  assert.equal(r.rows[0].category_name, '突击步枪');
  const totalGuns = r.rows.reduce((s, x) => s + x.gun_count, 0);
  assert.equal(totalGuns, 60, '分类枪械数之和应等于枪械总数');
});

test('视图：security_invoker 生效，匿名查询不会绕过 RLS 看到草稿', async () => {
  const draftId = await seedBuild({ gunSlug: 'toz-106', authorId: USER_A, title: '视图隔离测试草稿', code: '5050505050505050', cost: 500, status: 'draft' });
  const r = await runAs('anon', null, () =>
    db.query(`SELECT id FROM public.v_builds_feed WHERE id = $1`, [draftId]),
  );
  assert.equal(r.rows.length, 0, '视图必须继承底层表的 RLS，不得泄露草稿');
});

/* ================================================================ 7. 外键与级联 */

test('级联：删除方案时，其评论与点赞记录一并清理', async () => {
  const id = await seedBuild({ gunSlug: 'm1911', title: '级联测试', code: '6060606060606060', cost: 700 });
  await db.query(`INSERT INTO public.comments (build_id, content) VALUES ($1,'c')`, [id]);
  await db.query(`INSERT INTO public.build_likes (build_id, user_id) VALUES ($1,$2)`, [id, USER_A]);

  await db.query(`DELETE FROM public.builds WHERE id = $1`, [id]);

  assert.equal(await scalar(`SELECT count(*)::int FROM public.comments WHERE build_id = $1`, [id]), 0);
  assert.equal(await scalar(`SELECT count(*)::int FROM public.build_likes WHERE build_id = $1`, [id]), 0);
});

test('外键：向不存在的枪械提交方案被拒绝', async () => {
  await assert.rejects(
    () => db.query(
      `INSERT INTO public.builds (gun_id,title,code,estimated_cost) VALUES ('00000000-0000-4000-8000-0000000000ee','x','12345678',1)`,
    ),
    /violates foreign key constraint/,
  );
});
