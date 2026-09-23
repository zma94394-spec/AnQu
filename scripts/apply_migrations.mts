/**
 * ============================================================================
 *  数据库迁移执行器（跨平台，不依赖 psql）
 *
 *  为什么需要它：
 *   · 本项目部署在 Windows 开发机 + 云数据库，很多环境没有 psql；
 *   · Supabase SQL Editor 会把整段脚本包进一个事务，**一错全回滚** ——
 *     这正是线上「数据库完全空白」的成因（见 DEPLOY.md 第 0.5 节）。
 *
 *  本脚本对**每个文件单独开一个事务**：某个文件失败只回滚它自己，
 *  已成功的文件保持生效，不会出现"连表都没建上"的连带损失。
 *
 *  用法：
 *    node --import tsx scripts/apply_migrations.mts          # 交互确认
 *    node --import tsx scripts/apply_migrations.mts --yes    # 无人值守
 *
 *  ⚠️ 顺序不可调整：02_rls.sql 引用了 03_functions.sql 定义的 is_staff() 等函数，
 *     共 10 处。按 01 → 02 → 03 执行必然报 function does not exist。
 * ============================================================================
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import 'dotenv/config';
import { Client } from 'pg';

const ROOT = path.resolve(import.meta.dirname, '..');

/** 执行顺序即依赖顺序，不要改 */
const MIGRATIONS = [
  'db/01_schema.sql',
  'db/03_functions.sql',
  'db/02_rls.sql',
  'db/04_seed.sql',
] as const;

/** 执行后必须存在的关系，用于验收 */
const REQUIRED_RELATIONS = [
  'gun_categories',
  'guns',
  'builds',
  'comments',
  'build_likes',
  'profiles',
  'v_builds_feed',
  'v_category_stats',
] as const;

const clean = (v: string | undefined) => (v ?? '').trim().replace(/^["']|["']$/g, '');

const connectionString = clean(process.env.DIRECT_URL) || clean(process.env.DATABASE_URL);
if (!connectionString) {
  console.error('❌ .env 中既没有 DIRECT_URL 也没有 DATABASE_URL');
  process.exit(1);
}

const target = new URL(connectionString);
console.log('='.repeat(74));
console.log(` 目标数据库 : ${target.hostname}:${target.port || 5432}/${target.pathname.replace(/^\//, '')}`);
console.log(` 用户       : ${target.username}`);
console.log(` 执行顺序   : ${MIGRATIONS.map((f) => path.basename(f)).join('  →  ')}`);
console.log('='.repeat(74));

if (!process.argv.includes('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\n⚠️  将对上述数据库执行 DDL 与种子写入。确认继续？输入 yes：');
  rl.close();
  if (answer.trim() !== 'yes') {
    console.log('已取消。');
    process.exit(0);
  }
}

const client = new Client({
  connectionString,
  // Supabase 强制 TLS，其证书链不一定在本机 CA 库里。
  // 这里只做传输加密、不校验证书链 —— 对「连到已知主机做迁移」这个场景是可接受的取舍。
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('\n已连接。\n');

/** 逐文件执行，每个文件一个事务 */
async function applyFile(relPath: string): Promise<void> {
  const abs = path.join(ROOT, relPath);
  const sql = readFileSync(abs, 'utf8');
  const statements = sql.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--')).length;

  process.stdout.write(`>>> ${relPath}  (${statements} 行有效内容) … `);

  try {
    await client.query('BEGIN');
    // 用简单查询协议整段执行：pg 会把多条语句一次性发给服务端
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✓');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const e = err as { message?: string; position?: string; detail?: string; hint?: string };
    console.log('✗ 失败\n');
    console.error(`    错误信息 : ${e.message ?? String(err)}`);
    if (e.detail) console.error(`    详情     : ${e.detail}`);
    if (e.hint) console.error(`    提示     : ${e.hint}`);
    if (e.position) {
      // 用 position 定位到具体行，方便直接去看 SQL 文件
      const upto = sql.slice(0, Number(e.position));
      const line = upto.split('\n').length;
      console.error(`    位置     : 第 ${line} 行附近`);
      const src = sql.split('\n')[line - 1];
      if (src) console.error(`    源码     : ${src.trim().slice(0, 120)}`);
    }
    throw err;
  }
}

let failed = false;
for (const file of MIGRATIONS) {
  try {
    await applyFile(file);
  } catch {
    failed = true;
    break;
  }
}

/* ---------------------------------------------------------------- 验收 */

console.log('\n' + '-'.repeat(74));
console.log('架构验收');
console.log('-'.repeat(74));

const rows = await client.query<{ name: string }>(
  `SELECT c.relname AS name
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
  [[...REQUIRED_RELATIONS]],
);

const found = new Set(rows.rows.map((r) => r.name));
const missing = REQUIRED_RELATIONS.filter((n) => !found.has(n));

console.log(`  必需关系 : ${REQUIRED_RELATIONS.length} 个`);
console.log(`  已存在   : ${found.size} 个`);
console.log(`  缺失     : ${missing.length === 0 ? '（无）' : missing.join(', ')}`);

// 数据统计（这些表可能因前面失败而不存在，逐个容错）
const counts: Array<[string, string]> = [
  ['分类', 'gun_categories'],
  ['枪械', 'guns'],
  ['方案', 'builds'],
  ['评论', 'comments'],
];
console.log('\n  数据统计：');
for (const [label, table] of counts) {
  try {
    const r = await client.query<{ n: string }>(`SELECT count(*)::int AS n FROM public.${table}`);
    console.log(`    ${label.padEnd(4)} : ${r.rows[0]?.n ?? '?'}`);
  } catch {
    console.log(`    ${label.padEnd(4)} : 表不存在`);
  }
}

// 确认 ACE32 已入库（用户点名要的）
try {
  const r = await client.query<{ name: string }>(
    `SELECT name FROM public.guns WHERE slug = 'ace32'`,
  );
  console.log(`\n  ACE32    : ${r.rows.length > 0 ? '✅ 已入库' : '❌ 未找到'}`);
} catch {
  console.log('\n  ACE32    : 无法查询（guns 表不存在）');
}

// RLS 是否真的开启 —— 只建策略不开启 RLS 是另一种静默失效
try {
  const r = await client.query<{ relname: string; relrowsecurity: boolean }>(
    `SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
        AND relname = ANY($1) ORDER BY relname`,
    [['guns', 'builds', 'comments', 'build_likes', 'profiles', 'gun_categories']],
  );
  const off = r.rows.filter((x) => !x.relrowsecurity).map((x) => x.relname);
  console.log(`\n  RLS      : ${off.length === 0 ? `✅ ${r.rows.length} 张表全部开启` : `❌ 未开启：${off.join(', ')}`}`);
} catch {
  console.log('\n  RLS      : 无法检查');
}

await client.end();

console.log('\n' + '='.repeat(74));
if (failed || missing.length > 0) {
  console.log('❌ 迁移未完成，请根据上面的错误信息修正后重跑（脚本是幂等的，可重复执行）。');
  process.exit(1);
}
console.log('✅ 数据库迁移完成，架构完整。');
console.log('   下一步：重新部署后端，然后访问 /health 确认 "schema":"ok"');
