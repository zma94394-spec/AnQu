/**
 * ASSET-002 —— 发布前素材门禁（包装入口）。
 *
 * 位置：`web/scripts/`，由 `web/package.json` 的 `build` 脚本在**产物生成之后**调用。
 * 它不复制任何检查逻辑：两项检查都来自 `tools/web/check-asset-ledger.mjs`（ASSET-001 的唯一实现）。
 *
 * 两项检查**分开跑、分开报**：
 *   ① 清单完整性（--inventory）—— 只证明"工具/产物都在台账里且哈希对得上"
 *   ② 发布资格（--release）  —— 只放行 distribution_status === 'AUTHORIZED' 的素材
 * 只有两项都通过才返回 0；任何一项不通过都返回**非零**，让 npm script 停下来。
 *
 * 为什么必须有退出码：npm 的 `a && b` 只认退出码。把 BLOCKED 打印得很漂亮但返回 0，
 * 等于门禁不存在 —— 这正是本任务要避免的"把人工检查说成已强制执行"。
 *
 * 真·发布路径：`npm run build` →（tsc + vite build）→ 本脚本 → 非零则构建失败 →
 * Vercel / Cloudflare Pages 都不会产出可发布的产物。
 *
 * 开发不受影响：日常用 `npm run dev`（不经过 build）、想只编译不发用 `npm run build:app`。
 *
 * `--root <dir>` 只给隔离测试用（夹具根目录）。发布命令**从不**传它；
 * 也没有用环境变量做重定向 —— 环境变量是环境一部分，属于可被悄悄放宽的口子。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runInventory, runRelease } from '../../tools/web/check-asset-ledger.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseRoot(argv) {
  const i = argv.indexOf('--root');
  if (i === -1) return DEFAULT_ROOT;
  const value = argv[i + 1];
  if (!value) throw new Error('--root 需要一个目录参数');
  return path.resolve(value);
}

function main(argv) {
  const root = parseRoot(argv);

  // ① 清单完整性
  const inv = runInventory({ root });
  console.log(`ASSET_INVENTORY=${JSON.stringify({
    ok: inv.ok, registered: inv.registered,
    sourceFiles: inv.sourceFiles.length, distFiles: inv.distFiles.length, errors: inv.errors.length,
  })}`);
  for (const e of inv.errors) console.log('  ✗ ' + e);

  // ② 发布资格（独立结果，不因 ① 通过就跳过）
  const rel = runRelease({ root });
  console.log(`ASSET_RELEASE=${JSON.stringify({
    verdict: rel.verdict, cleared: rel.cleared.length, blocked: rel.blockers.length, inventoryOk: rel.inventoryOk,
  })}`);
  for (const b of rel.blockers) {
    console.log(`  ✗ BLOCKED ${b.path} | asset=${b.asset_id} | status=${b.status} | reason=${b.reason}`);
    if (b.missing_evidence?.length) console.log('      待补：' + b.missing_evidence.join(' / '));
  }

  if (!inv.ok) {
    console.error('[asset-gate] 清单完整性未通过 —— 发布中止。先让每个图片/产物都进台账并核对哈希。');
    return 1;
  }
  if (rel.verdict !== 'PASS') {
    console.error(
      `[asset-gate] 发布资格未通过（${rel.blockers.length} 项阻断）—— 发布中止。` +
      '清单完整不等于许可通过；补齐证据并把台账状态改成 AUTHORIZED 才会放行。',
    );
    return 1;
  }
  console.log('[asset-gate] 清单完整 + 发布资格通过，允许继续发布。');
  return 0;
}

process.exit(main(process.argv.slice(2)));
