/**
 * ============================================================================
 *  生产构建前的环境变量自检
 *
 *  为什么需要它：Vite 会把 `VITE_` 变量**内联进 JS 产物**，一旦带着占位符
 *  或错误配置发上线，症状是"页面能打开但接口全挂"或更糟 —— 悄悄退化成
 *  演示数据。这类问题在构建期拦下来，成本远低于上线后排查。
 *
 *  运行：npm run check:env      （已挂在 prebuild，`npm run build` 会自动执行）
 *
 *  逃生舱：确认要部署"仅浏览、无登录"的站点时，用
 *         ALLOW_DEMO_AUTH=1 npm run build
 * ============================================================================
 */

import { loadEnv } from 'vite';

/** 占位符特征：方括号、尖括号模板、YOUR- 前缀、example.com 域名 */
const PLACEHOLDER = /\[[^\]]*\]|<[a-z-]+>|YOUR-|example\.com/i;

const env = loadEnv('production', process.cwd(), 'VITE_');

const blocking: string[] = [];
const warnings: string[] = [];

/* ------------------------------------------------ 1. Mock 必须关闭 */

if (env.VITE_USE_MOCK === 'true') {
  blocking.push(
    'VITE_USE_MOCK=true —— 生产构建会完全绕过后端接口，用户看到的是写死的演示数据，' +
      '点赞与评论都不会落库。请改为 false 或不设置。',
  );
}

/* ------------------------------------------------ 2. 严禁把服务端密钥带进前端 */

for (const key of Object.keys(env)) {
  if (/SERVICE_ROLE|DATABASE_URL|DIRECT_URL|JWT_SECRET|PRIVATE_KEY/i.test(key)) {
    blocking.push(
      `${key} 使用了 VITE_ 前缀 —— 该值会被内联进前端产物并公开。` +
        '可绕过 RLS 的密钥一旦进入浏览器，等同于交出数据库。请立即移除。',
    );
  }
}

/* ------------------------------------------------ 3. Supabase 配置 */

const supabaseUrl = env.VITE_SUPABASE_URL ?? '';
const supabaseAnon = env.VITE_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnon) {
  const message =
    '未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY —— ' +
    '线上会退化为「本地演示会话」：任何合法邮箱加 6 位密码都能"登录"，' +
    '但后端会拒绝该令牌，用户看到的是一个假登录框。';

  if (process.env.ALLOW_DEMO_AUTH === '1') {
    warnings.push(`${message}（已通过 ALLOW_DEMO_AUTH=1 显式放行）`);
  } else {
    blocking.push(`${message} 如确实需要"仅浏览"的站点，请用 ALLOW_DEMO_AUTH=1 显式放行。`);
  }
} else {
  if (PLACEHOLDER.test(supabaseUrl)) {
    blocking.push(`VITE_SUPABASE_URL 仍是占位符：${supabaseUrl}`);
  }
  if (PLACEHOLDER.test(supabaseAnon)) {
    blocking.push('VITE_SUPABASE_ANON_KEY 仍是占位符，请填入 Project Settings → API 的 anon key。');
  }
}

/* ------------------------------------------------ 4. 后端地址 */

const apiBase = env.VITE_API_BASE_URL ?? '';

if (!apiBase) {
  // 留空是合法配置：前后端同域 + 反向代理时走相对路径 /api
  warnings.push(
    '未设置 VITE_API_BASE_URL —— 将使用相对路径 /api。' +
      '仅当前端与后端同域（或由反向代理转发 /api）时才正确；' +
      '前后端分域部署必须填完整地址。',
  );
} else if (PLACEHOLDER.test(apiBase)) {
  blocking.push(`VITE_API_BASE_URL 仍是占位符：${apiBase}`);
}

/* ------------------------------------------------ 汇总 */

const line = '='.repeat(72);

if (warnings.length > 0) {
  console.log(`\n⚠️  警告（不阻断构建）：`);
  for (const warning of warnings) console.log(`   · ${warning}`);
}

if (blocking.length === 0) {
  console.log(`\n✅ 生产环境变量自检通过（Vite mode=production）。`);
  console.log(
    `   后端地址：${apiBase || '（相对路径 /api）'}\n` +
      `   Supabase：${supabaseUrl || '（未配置）'}\n` +
      `   Mock 模式：${env.VITE_USE_MOCK === 'true' ? '开启（异常）' : '关闭'}`,
  );
  process.exit(0);
}

console.error(`${line}`);
console.error(`❌ 生产环境变量自检未通过，共 ${blocking.length} 项阻断问题：`);
console.error(line);
for (const problem of blocking) console.error(`   · ${problem}`);
console.error('');
console.error('请编辑 web/.env.production（或在部署平台控制台配置同名变量）后重试。');
console.error('');
process.exit(1);
