/**
 * ASSET-002 —— 发布包装入口（`web/scripts/release-gate.mjs`）的判据。
 *
 * 只验"入口会不会用**退出码**真正拦住发布"，以及两项检查是否分开报。
 * 检查逻辑本身由 ASSET-001 的 tests/asset_ledger.test.mjs 负责，这里不重复实现。
 *
 * 全部在系统临时目录夹具里跑：不构建、不碰真实 dist、不碰任何真实素材。
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const GATE = path.join(ROOT, 'web', 'scripts', 'release-gate.mjs');

/* ---------------------------------------------- 合法 PNG 合成（与 ASSET-001 同法） */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};
function makePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3), 0x33);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const sha = (b) => createHash('sha256').update(b).digest('hex');

/* ---------------------------------------------- 夹具 */

const roots = [];
after(() => roots.forEach((r) => { try { rmSync(r, { recursive: true, force: true }); } catch { /* 忽略 */ } }));

function makeWorld({ status = 'AUTHORIZED', evidence = ['docs/weapon_assets/LICENSE_DECISION_RULES.md'], extraSource = false, mutateDist = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'asset002-'));
  roots.push(root);
  mkdirSync(path.join(root, 'web/src/assets'), { recursive: true });
  mkdirSync(path.join(root, 'web/dist/assets'), { recursive: true });
  mkdirSync(path.join(root, 'docs/weapon_assets'), { recursive: true });

  const src = makePng(1, 1);
  writeFileSync(path.join(root, 'web/src/assets/shown.png'), src);
  const distBytes = mutateDist ?? src;
  writeFileSync(path.join(root, 'web/dist/assets/shown-abc.png'), distBytes);
  if (extraSource) writeFileSync(path.join(root, 'web/src/assets/unlisted.png'), makePng(1, 1));

  writeFileSync(path.join(root, 'docs/weapon_assets/ASSET_LEDGER.json'), JSON.stringify({
    version: 1,
    assets: [{
      asset_id: 'shown',
      source_path: 'web/src/assets/shown.png',
      build_artifacts: ['web/dist/assets/shown-abc.png'],
      dist_policy: 'PACKAGED',
      sha256: sha(src),
      bytes: src.length,
      width: 1,
      height: 1,
      format: 'PNG',
      purpose: '门禁夹具',
      category: 'PROJECT_ORIGINAL_OR_AUTHORIZED',
      evidence_paths: evidence,
      distribution_status: status,
      status_basis: '夹具',
      restrictions: [],
      open_questions: [],
    }],
  }, null, 2));
  return root;
}

function runGate(root) {
  // shell 为 false：直接走 node，退出码原样返回（Windows 上也不要经 cmd 包裹）
  const r = spawnSync(process.execPath, [GATE, '--root', root], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('ASSET-002 发布包装入口的退出码', () => {
  test('H1 清单完整 + 全部 AUTHORIZED ⇒ 退出码 0，且确实进入后续步骤', () => {
    const r = runGate(makeWorld());
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ASSET_INVENTORY=\{"ok":true/);
    assert.match(r.out, /ASSET_RELEASE=\{"verdict":"PASS"/);
    assert.match(r.out, /允许继续发布/);
  });

  test('H2 存在 UNKNOWN ⇒ 退出码非零（清单仍然 PASS，但发布被拦住）', () => {
    const r = runGate(makeWorld({ status: 'UNKNOWN' }));
    assert.notEqual(r.code, 0, 'BLOCKED 必须是非零退出码，否则门禁形同不存在');
    assert.match(r.out, /ASSET_INVENTORY=\{"ok":true/, '清单本身应通过，才说明拦的是发布资格');
    assert.match(r.out, /"verdict":"BLOCKED"/);
    assert.match(r.out, /发布中止/);
  });

  test('H3 存在 NOT_AUTHORIZED ⇒ 退出码非零', () => {
    const r = runGate(makeWorld({ status: 'NOT_AUTHORIZED' }));
    assert.notEqual(r.code, 0);
    assert.match(r.out, /NOT_AUTHORIZED/);
  });

  test('H4 存在 NEEDS_CLARIFICATION ⇒ 退出码非零', () => {
    const r = runGate(makeWorld({ status: 'NEEDS_CLARIFICATION' }));
    assert.notEqual(r.code, 0);
  });

  test('H5 AUTHORIZED 但没有证据路径 ⇒ 退出码非零', () => {
    const r = runGate(makeWorld({ evidence: [] }));
    assert.notEqual(r.code, 0);
    assert.match(r.out, /NO_EVIDENCE|清单完整性未通过|发布资格未通过/);
  });

  test('H6 有图片没登记 ⇒ 清单完整性失败且退出码非零', () => {
    const r = runGate(makeWorld({ extraSource: true }));
    assert.notEqual(r.code, 0);
    assert.match(r.out, /"ok":false/);
    assert.match(r.out, /unlisted\.png/);
    assert.match(r.out, /清单完整性未通过/);
  });

  test('H7 产物哈希变化 ⇒ 确认失败且退出码非零', () => {
    const r = runGate(makeWorld({ mutateDist: makePng(2, 2) }));
    assert.notEqual(r.code, 0);
    assert.match(r.out, /SHA-256|HASH_MISMATCH|未通过/);
  });

  test('H8 两项检查各自输出独立结果（不因清单通过就跳过发布资格）', () => {
    const r = runGate(makeWorld({ status: 'UNKNOWN' }));
    assert.match(r.out, /ASSET_INVENTORY=/);
    assert.match(r.out, /ASSET_RELEASE=/);
    // 先清单、后资格 的顺序也要固定
    assert.ok(r.out.indexOf('ASSET_INVENTORY=') < r.out.indexOf('ASSET_RELEASE='));
  });
});

describe('ASSET-002 接线核对（真实仓库，不构建）', () => {
  test('H9 build/build:app 都进入同一受保护构建链，且无递归', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'web', 'package.json'), 'utf8'));
    const build = pkg.scripts.build;
    const app = pkg.scripts['build:app'];

    assert.match(build, /tsc --noEmit/, 'build 必须先做 TypeScript 检查');
    assert.match(build, /vite build/, 'build 必须真的产出');
    assert.match(build, /npm run release:gate/, 'build 必须调用 release gate');
    assert.ok(build.indexOf('tsc --noEmit') < build.indexOf('vite build'), 'tsc 必须在 vite 之前');
    assert.ok(build.indexOf('vite build') < build.indexOf('npm run release:gate'), 'gate 必须在产物之后');
    assert.equal(pkg.scripts['release:gate'], 'node scripts/release-gate.mjs');
    assert.equal(app, 'npm run build', 'build:app 必须委托给受保护的 build');
    assert.ok(!build.includes('build:app'), 'build 不得调用 build:app（防递归）');
    assert.ok(!app.includes('build:app'), 'build:app 不得调用自身');
  });

  test('H10 门禁脚本不复制检查逻辑，只调用 tools/web/check-asset-ledger.mjs', () => {
    const src = readFileSync(GATE, 'utf8');
    assert.match(src, /from '\.\.\/\.\.\/tools\/web\/check-asset-ledger\.mjs'/);
    assert.match(src, /runInventory/);
    assert.match(src, /runRelease/);
    // 不自己扫目录/算哈希 —— 那意味着第二套检查器
    assert.ok(!/readdirSync|createHash/.test(src), '包装入口里不该出现自己的扫描或哈希实现');
  });

  test('H11 真实仓库当前 PASS（两张 ui020 场景图已从生产排除）', () => {
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.equal(r.status, 0, `真实仓库当前应返回 0，实际 ${r.status}`);
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    assert.match(out, /ASSET_INVENTORY=\{"ok":true/);
    assert.match(out, /"verdict":"PASS"/);
    assert.match(out, /允许继续发布/);
    assert.ok(!out.includes('home-scene-ui020'), '争议素材不应再出现在发布清单中');
  });
});
