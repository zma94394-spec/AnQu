/**
 * ASSET-001 —— 素材台账的两个**独立**检查。
 *
 *   ① `--inventory`：清单完整性。仓库现有图片 + 当前 dist 里的图片是否都有台账记录，
 *      路径/字节/SHA-256/宽高是否与登记一致。它只证明"完整、可追溯"，
 *      **不证明**任何素材有发布许可。
 *   ② `--release`：发布资格。只看"当前真的会发布出去的那些文件"，逐张要求
 *      `distribution_status === 'AUTHORIZED'` 且有证据；其它一律 BLOCKED 并给出原因。
 *
 * 为什么与 `check-weapon-assets.mjs` 并存而不是合并：
 *   那个校验器管的是**枪械登记表 ↔ web/public/weapons**（枪图接入闸门）；
 *   本文件管的是**站点全部图片 ↔ dist 产物**（发布面）。两者的对象和判据不同，
 *   合并会让"枪图接入"和"站点发布"互相冒充。图像头解析等通用能力直接复用它，不重写。
 *
 * 用法：
 *   node tools/web/check-asset-ledger.mjs --inventory
 *   node tools/web/check-asset-ledger.mjs --release
 *   node tools/web/check-asset-ledger.mjs --release --require-pass   # CI：BLOCKED 也返回非零
 *
 * 退出码：inventory 不干净 → 1；release 计算成功 → 0（BLOCKED 是**业务判定**，不是脚本故障），
 *        加 --require-pass 时 BLOCKED → 1；参数/内部错误 → 2。
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readImageSize } from './check-weapon-assets.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const LEDGER_REL = 'docs/weapon_assets/ASSET_LEDGER.json';
export const SOURCE_ROOTS = ['web/src/assets', 'web/public'];
export const DIST_ROOT = 'web/dist';
export const IMAGE_EXT = new Set(['.webp', '.png', '.jpg', '.jpeg', '.ico', '.svg', '.avif', '.gif']);

/** 复用 LICENSE_DECISION_RULES.md §1 的三个判定 + 任务要求保留的 UNKNOWN */
export const STATUS_VALUES = ['AUTHORIZED', 'NEEDS_CLARIFICATION', 'NOT_AUTHORIZED', 'UNKNOWN'];
export const RELEASABLE_STATUS = 'AUTHORIZED';
export const CATEGORIES = [
  'PROJECT_ORIGINAL_OR_AUTHORIZED',
  'IMAGEGEN_GENERATED',
  'OFFICIAL_GAME_OR_LAUNCHER',
  'THIRD_PARTY_COMMUNITY',
  'UNKNOWN_RIGHTS',
];
export const DIST_POLICIES = ['PACKAGED', 'DEV_ONLY'];

const toPosix = (p) => p.split(path.sep).join('/');

/**
 * 路径必须是**仓库相对**的 posix 路径。
 * 拒绝绝对路径、盘符、反斜杠、家目录与用户名 —— 台账不能依赖某台机器。
 */
export function assertRelativePath(p, at) {
  if (typeof p !== 'string' || p.trim() === '') return `${at}: 路径为空`;
  if (path.isAbsolute(p) || /^[A-Za-z]:/.test(p)) return `${at}: 不许使用绝对路径（${p}）`;
  if (p.includes('\\')) return `${at}: 必须使用 / 分隔（${p}）`;
  if (p.startsWith('/')) return `${at}: 不许以 / 开头（${p}）`;
  // 只拒"以用户目录开头"的形状；不能在任意层级匹配 home/ —— 本项目的素材目录就叫
  // web/src/assets/home/，逐段匹配会把正常路径判死（第一版就是这样红了）。
  if (/^(Users|home)\//.test(p)) return `${at}: 台账不得引用用户目录（${p}）`;
  if (p.split('/').includes('..')) return `${at}: 不许出现 ..（${p}）`;
  return null;
}

/**
 * ICO 尺寸解析。共享的 readImageSize 不认 ICO（它只服务枪图 webp/png/jpg），
 * 而站点的 favicon.ico 必须在台账里有宽高 —— 这里补一个最小的头部解析，
 * 不去改共享校验器（那属于枪图闸门，改它会影响另一条判据）。
 * 结构：6 字节头 + 每目录项 16 字节；宽/高在目录项偏移 0/1，值 0 表示 256。
 */
export function readIcoSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) return null;
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null; // reserved=0, type=1
  const count = buf.readUInt16LE(4);
  if (count < 1) return null;
  // ICO 是**多尺寸容器**（本站 favicon 同时含 16 与 32）。逐项取最大值作为登记尺寸，
  // 与图像库/PIL 的口径一致；只读第一项会把 16x16 当成"整张图"（第一版就是这样红的）。
  let width = 0;
  let height = 0;
  for (let i = 0; i < count; i += 1) {
    const off = 6 + i * 16;
    if (off + 2 > buf.length) break;
    const w = buf[off] === 0 ? 256 : buf[off];
    const h = buf[off + 1] === 0 ? 256 : buf[off + 1];
    if (w > width) width = w;
    if (h > height) height = h;
  }
  return width > 0 && height > 0 ? { width, height } : null;
}

function sha256Of(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function walkImages(absDir, relDir, out) {
  if (!existsSync(absDir)) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      walkImages(abs, rel, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.startsWith('.')) continue; // .gitkeep 之类不是素材
    if (!IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    out.push(rel);
  }
}

export function loadLedger(root = ROOT) {
  const abs = path.join(root, LEDGER_REL);
  if (!existsSync(abs)) throw new Error(`找不到台账：${LEDGER_REL}`);
  return JSON.parse(readFileSync(abs, 'utf8'));
}

/**
 * 清单完整性检查。
 * @returns {{ok:boolean, errors:string[], sourceFiles:string[], distFiles:string[], registered:number}}
 */
export function runInventory({ root = ROOT } = {}) {
  const errors = [];
  const ledger = loadLedger(root);
  const assets = Array.isArray(ledger.assets) ? ledger.assets : [];
  if (assets.length === 0) errors.push('台账没有任何条目');

  const seenIds = new Set();
  const bySource = new Map();
  const artifactOwner = new Map(); // dist 相对路径 -> asset_id

  for (const [i, a] of assets.entries()) {
    const at = `assets[${i}]${a?.asset_id ? `(${a.asset_id})` : ''}`;

    if (typeof a?.asset_id !== 'string' || a.asset_id.trim() === '') errors.push(`${at}: 缺 asset_id`);
    else if (seenIds.has(a.asset_id)) errors.push(`${at}: asset_id 重复（${a.asset_id}）`);
    else seenIds.add(a.asset_id);

    if (!CATEGORIES.includes(a?.category)) {
      errors.push(`${at}: category=${JSON.stringify(a?.category)} 只认 ${CATEGORIES.join('/')}`);
    }
    if (!STATUS_VALUES.includes(a?.distribution_status)) {
      errors.push(`${at}: distribution_status=${JSON.stringify(a?.distribution_status)} 只认 ${STATUS_VALUES.join('/')}`);
    }
    if (typeof a?.status_basis !== 'string' || a.status_basis.trim() === '') {
      errors.push(`${at}: 缺 status_basis（为什么是这个状态）`);
    }
    if (!Array.isArray(a?.evidence_paths)) errors.push(`${at}: evidence_paths 必须是数组`);
    if (!DIST_POLICIES.includes(a?.dist_policy)) {
      errors.push(`${at}: dist_policy=${JSON.stringify(a?.dist_policy)} 只认 ${DIST_POLICIES.join('/')}`);
    }

    const pErr = assertRelativePath(a?.source_path, `${at}.source_path`);
    if (pErr) errors.push(pErr);
    else {
      if (bySource.has(a.source_path)) errors.push(`${at}: source_path 与其它条目重复（${a.source_path}）`);
      bySource.set(a.source_path, a);

      const abs = path.join(root, a.source_path);
      if (a.expected_missing === true) {
        if (existsSync(abs)) errors.push(`${at}: 标记为预期缺失，但文件实际存在（${a.source_path}）`);
      } else if (!existsSync(abs)) {
        errors.push(`${at}: 异常缺失 —— 台账登记了但文件不在（${a.source_path}）`);
      } else {
        const buf = readFileSync(abs);
        if (a.sha256 !== createHash('sha256').update(buf).digest('hex')) {
          errors.push(`${at}: SHA-256 与登记不符（文件变了但台账没更新）`);
        }
        if (typeof a.bytes === 'number' && a.bytes !== buf.length) {
          errors.push(`${at}: 字节数不符（登记 ${a.bytes}，实测 ${buf.length}）`);
        }
        const dim = readImageSize(buf) ?? readIcoSize(buf);
        if (!dim) errors.push(`${at}: 无法从图像头读出宽高`);
        else if (dim.width !== a.width || dim.height !== a.height) {
          errors.push(`${at}: 宽高不符（登记 ${a.width}x${a.height}，实测 ${dim.width}x${dim.height}）`);
        }
      }
    }

    const arts = Array.isArray(a?.build_artifacts) ? a.build_artifacts : null;
    if (!arts) {
      errors.push(`${at}: build_artifacts 必须是数组（没有就写 []）`);
    } else {
      for (const [j, art] of arts.entries()) {
        const aErr = assertRelativePath(art, `${at}.build_artifacts[${j}]`);
        if (aErr) {
          errors.push(aErr);
          continue;
        }
        artifactOwner.set(art, a.asset_id);
        if (!existsSync(path.join(root, art))) {
          errors.push(`${at}: 登记的构建产物不存在（${art}）—— 若尚未构建请写明，不能登记一个假路径`);
        }
      }
    }
  }

  // ① 仓库源文件必须全部登记
  const sourceFiles = [];
  for (const rel of SOURCE_ROOTS) walkImages(path.join(root, rel), rel, sourceFiles);
  sourceFiles.sort();
  for (const f of sourceFiles) {
    if (!bySource.has(f)) errors.push(`未登记：仓库内图片 ${f} 不在台账里`);
  }
  // 台账登记了但扫描根之外的源文件也要报（防止扫描面被悄悄缩小）
  for (const sp of bySource.keys()) {
    if (!sourceFiles.includes(sp) && !sp.startsWith('web/')) {
      errors.push(`台账条目指向扫描根之外的源文件：${sp}`);
    }
  }

  // ② dist 里的每张图都必须有归属
  const distFiles = [];
  walkImages(path.join(root, DIST_ROOT), DIST_ROOT, distFiles);
  distFiles.sort();
  for (const f of distFiles) {
    if (!artifactOwner.has(f)) errors.push(`未登记：构建产物 ${f} 没有对应台账条目`);
  }

  // ③ DEV_ONLY 素材不许出现在 dist（按内容比对，改文件名也躲不过）
  const distHashes = new Map();
  for (const f of distFiles) {
    const abs = path.join(root, f);
    if (existsSync(abs)) distHashes.set(sha256Of(abs), f);
  }
  for (const a of assets) {
    if (a.dist_policy !== 'DEV_ONLY') continue;
    const leaked = distHashes.get(a.sha256);
    if (leaked) errors.push(`DEV_ONLY 素材泄漏进构建产物：${a.asset_id}（${leaked}）`);
  }

  return { ok: errors.length === 0, errors, sourceFiles, distFiles, registered: assets.length };
}

/**
 * 发布资格检查：只看**当前真的在 dist 里**的那些文件。
 * 任何 UNKNOWN / NEEDS_CLARIFICATION / NOT_AUTHORIZED / 缺证据 / 未登记 / 哈希不符都阻断。
 * 判据完全来自台账与磁盘事实，**没有**对任何具体文件名硬编码 —— 补齐证据、改状态即可通过。
 */
export function runRelease({ root = ROOT } = {}) {
  const inv = runInventory({ root });
  const ledger = loadLedger(root);
  const assets = Array.isArray(ledger.assets) ? ledger.assets : [];
  const byArtifact = new Map();
  for (const a of assets) {
    for (const art of a.build_artifacts ?? []) byArtifact.set(art, a);
  }

  const blockers = [];
  const cleared = [];

  for (const rel of inv.distFiles) {
    const asset = byArtifact.get(rel);
    const abs = path.join(root, rel);
    const prefix = { path: rel, bytes: existsSync(abs) ? statSync(abs).size : null };

    if (!asset) {
      blockers.push({ ...prefix, asset_id: null, status: null, reason: 'UNREGISTERED', missing_evidence: ['台账条目'] });
      continue;
    }
    if (!existsSync(abs) || sha256Of(abs) !== asset.sha256) {
      blockers.push({ ...prefix, asset_id: asset.asset_id, status: asset.distribution_status, reason: 'HASH_MISMATCH', missing_evidence: ['台账中的 SHA-256 需与产物一致'] });
      continue;
    }
    if (asset.distribution_status !== RELEASABLE_STATUS) {
      blockers.push({
        ...prefix,
        asset_id: asset.asset_id,
        status: asset.distribution_status,
        reason: 'STATUS_NOT_AUTHORIZED',
        missing_evidence: [...(asset.open_questions ?? [])],
      });
      continue;
    }
    if (!Array.isArray(asset.evidence_paths) || asset.evidence_paths.length === 0) {
      blockers.push({ ...prefix, asset_id: asset.asset_id, status: asset.distribution_status, reason: 'NO_EVIDENCE', missing_evidence: ['evidence_paths'] });
      continue;
    }
    cleared.push({ path: rel, asset_id: asset.asset_id });
  }

  // 清单本身不干净时，发布资格一律阻断 —— 但不能把清单错误说成发布问题
  const verdict = blockers.length === 0 && inv.ok ? 'PASS' : 'BLOCKED';
  return {
    verdict,
    blockers,
    cleared,
    inventoryOk: inv.ok,
    inventoryErrors: inv.errors,
    distFiles: inv.distFiles,
  };
}

function main(argv) {
  const mode = argv.includes('--inventory') ? 'inventory' : argv.includes('--release') ? 'release' : null;
  if (!mode) {
    console.error('用法：node tools/web/check-asset-ledger.mjs --inventory | --release [--require-pass]');
    return 2;
  }
  if (mode === 'inventory') {
    const r = runInventory();
    console.log(`ASSET_INVENTORY=${JSON.stringify({ ok: r.ok, registered: r.registered, sourceFiles: r.sourceFiles.length, distFiles: r.distFiles.length, errors: r.errors.length })}`);
    for (const e of r.errors) console.log('  ✗ ' + e);
    return r.ok ? 0 : 1;
  }
  const r = runRelease();
  console.log(`ASSET_RELEASE=${JSON.stringify({ verdict: r.verdict, cleared: r.cleared.length, blocked: r.blockers.length, inventoryOk: r.inventoryOk })}`);
  for (const b of r.blockers) {
    console.log(`  ✗ BLOCKED ${b.path} | asset=${b.asset_id} | status=${b.status} | reason=${b.reason}`);
    if (b.missing_evidence.length) console.log('      待补：' + b.missing_evidence.join(' / '));
  }
  for (const e of r.inventoryErrors) console.log('  ✗ INVENTORY ' + e);
  if (argv.includes('--require-pass') && r.verdict !== 'PASS') return 1;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
