/**
 * ASSET-001 —— 素材台账的两个检查的判据。
 *
 * 纪律：所有边界行为都在**临时目录夹具**里验，不重构建、不覆盖真实 `dist`、不动任何真实素材。
 * 最后一组跑真实仓库，确认「清单 PASS / 发布 PASS，且台账只含本分支真实存在的 favicon」是 ASSET-007 的当前事实。
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import { runInventory, runRelease } from '../tools/web/check-asset-ledger.mjs';

const REAL_ROOT = path.resolve(import.meta.dirname, '..');

/* ------------------------------------------------ 合成一张真 PNG（1x1 / 2x2） */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 生成一张合法 PNG（无压缩质量的纯色图）。返回 buffer。 */
function makePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const raw = Buffer.alloc(height * (1 + width * 3), 0x40);
  for (let y = 0; y < height; y += 1) raw[y * (1 + width * 3)] = 0; // filter: none
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/* ------------------------------------------------ 夹具世界 */

let world = null;

function assetEntry(over = {}) {
  return {
    asset_id: 'fixture-asset',
    source_path: 'web/src/assets/fixture.png',
    build_artifacts: [],
    dist_policy: 'DEV_ONLY',
    sha256: 'PLACEHOLDER',
    bytes: 0,
    width: 1,
    height: 1,
    format: 'PNG',
    purpose: '判据夹具',
    category: 'PROJECT_ORIGINAL_OR_AUTHORIZED',
    evidence_paths: ['docs/weapon_assets/LICENSE_DECISION_RULES.md'],
    distribution_status: 'AUTHORIZED',
    status_basis: '夹具：本项目原创，无第三方权利',
    restrictions: [],
    open_questions: [],
    ...over,
  };
}

/** 建一个带一张源图 + 一个 dist 产物的夹具根 */
function makeWorld({ entry = {}, sourceBytes = makePng(1, 1), distBytes = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'asset001-'));
  mkdirSync(path.join(root, 'web/src/assets'), { recursive: true });
  mkdirSync(path.join(root, 'web/dist/assets'), { recursive: true });
  mkdirSync(path.join(root, 'docs/weapon_assets'), { recursive: true });

  writeFileSync(path.join(root, 'web/src/assets/fixture.png'), sourceBytes);
  if (distBytes) writeFileSync(path.join(root, 'web/dist/assets/fixture-abc123.png'), distBytes);

  const a = assetEntry({
    sha256: sha(sourceBytes),
    bytes: sourceBytes.length,
    build_artifacts: distBytes ? ['web/dist/assets/fixture-abc123.png'] : [],
    dist_policy: distBytes ? 'PACKAGED' : 'DEV_ONLY',
    ...entry,
  });
  writeFileSync(
    path.join(root, 'docs/weapon_assets/ASSET_LEDGER.json'),
    JSON.stringify({ version: 1, assets: [a] }, null, 2),
  );
  return { root, entry: a };
}

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* 临时目录清理失败不影响判据 */
  }
}

describe('ASSET-001 清单完整性（夹具）', () => {
  const roots = [];
  after(() => roots.forEach(cleanup));

  const build = (opts) => {
    const w = makeWorld(opts);
    roots.push(w.root);
    return w;
  };

  test('F1 正常登记 ⇒ 清单 PASS（源 1 / 产物 1）', () => {
    const { root } = build({ distBytes: makePng(1, 1) });
    const r = runInventory({ root });
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.equal(r.sourceFiles.length, 1);
    assert.equal(r.distFiles.length, 1);
  });

  test('F2 源图片未登记 ⇒ 失败并点名', () => {
    const { root } = build({});
    writeFileSync(path.join(root, 'web/src/assets/extra.png'), makePng(1, 1));
    const r = runInventory({ root });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('未登记') && e.includes('extra.png')), r.errors.join('\n'));
  });

  test('F3 dist 里多出一张未登记图 ⇒ 失败并点名', () => {
    const { root } = build({ distBytes: makePng(1, 1) });
    writeFileSync(path.join(root, 'web/dist/assets/stray.png'), makePng(1, 1));
    const r = runInventory({ root });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('未登记') && e.includes('stray.png')), r.errors.join('\n'));
  });

  test('F4 文件内容变了但台账没更新（SHA-256 不符）⇒ 失败', () => {
    const { root } = build({});
    writeFileSync(path.join(root, 'web/src/assets/fixture.png'), makePng(2, 2));
    const r = runInventory({ root });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('SHA-256')), r.errors.join('\n'));
  });

  test('F5 登记为预期缺失、文件却存在 ⇒ 失败（区分预期/异常缺失）', () => {
    const { root } = build({ entry: { expected_missing: true } });
    const r = runInventory({ root });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('预期缺失')), r.errors.join('\n'));
  });

  test('F6 异常缺失：登记了但文件不在 ⇒ 失败', () => {
    const { root } = build({ entry: { expected_missing: false } });
    rmSync(path.join(root, 'web/src/assets/fixture.png'));
    const r = runInventory({ root });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('异常缺失')), r.errors.join('\n'));
  });

  test('F7 DEV_ONLY 素材混进 dist（改了文件名也逃不掉）⇒ 失败', () => {
    const bytes = makePng(1, 1);
    const { root } = build({ sourceBytes: bytes, distBytes: bytes, entry: { dist_policy: 'DEV_ONLY' } });
    const r = runInventory({ root });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('DEV_ONLY') && e.includes('泄漏')), r.errors.join('\n'));
  });

  test('F8 绝对路径 / 用户目录 ⇒ 失败（台账不能依赖某台机器）', () => {
    const { root } = build({ entry: { source_path: '/Users/someone/pic.png' } });
    const r = runInventory({ root });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('绝对路径') || e.includes('用户目录')), r.errors.join('\n'));
  });

  test('F9 状态值不在既有词表内 ⇒ 失败', () => {
    const { root } = build({ entry: { distribution_status: 'APPROVED' } });
    const r = runInventory({ root });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('distribution_status')), r.errors.join('\n'));
  });
});

describe('ASSET-001 发布资格（夹具）', () => {
  const roots = [];
  after(() => roots.forEach(cleanup));

  const build = (opts) => {
    const w = makeWorld(opts);
    roots.push(w.root);
    return w;
  };

  test('G1 未授权状态（UNKNOWN）⇒ BLOCKED，且不伪装成通过', () => {
    const { root } = build({ distBytes: makePng(1, 1), entry: { distribution_status: 'UNKNOWN' } });
    const r = runRelease({ root });
    assert.equal(r.verdict, 'BLOCKED');
    assert.equal(r.cleared.length, 0);
    assert.equal(r.blockers[0].reason, 'STATUS_NOT_AUTHORIZED');
  });

  test('G2 NEEDS_CLARIFICATION / NOT_AUTHORIZED 同样阻断', () => {
    for (const status of ['NEEDS_CLARIFICATION', 'NOT_AUTHORIZED']) {
      const { root } = build({ distBytes: makePng(1, 1), entry: { distribution_status: status } });
      assert.equal(runRelease({ root }).verdict, 'BLOCKED', `${status} 不该放行`);
    }
  });

  test('G3 AUTHORIZED 但没有任何证据路径 ⇒ BLOCKED（缺必要证据）', () => {
    const { root } = build({ distBytes: makePng(1, 1), entry: { evidence_paths: [] } });
    const r = runRelease({ root });
    assert.equal(r.verdict, 'BLOCKED');
    assert.equal(r.blockers[0].reason, 'NO_EVIDENCE');
  });

  test('G4 补齐证据并给 AUTHORIZED ⇒ PASS（证明没有硬编码阻断）', () => {
    const { root } = build({ distBytes: makePng(1, 1), entry: { distribution_status: 'AUTHORIZED' } });
    const r = runRelease({ root });
    assert.equal(r.verdict, 'PASS', JSON.stringify(r.blockers));
    assert.equal(r.cleared.length, 1);
  });

  test('G5 产物与台账哈希不符 ⇒ BLOCKED（HASH_MISMATCH）', () => {
    const { root } = build({ distBytes: makePng(1, 1) });
    writeFileSync(path.join(root, 'web/dist/assets/fixture-abc123.png'), makePng(2, 2));
    const r = runRelease({ root });
    assert.equal(r.verdict, 'BLOCKED');
    assert.equal(r.blockers[0].reason, 'HASH_MISMATCH');
  });

  test('G6 清单本身不干净 ⇒ 发布资格也 BLOCKED（但不把清单错误说成许可问题）', () => {
    const { root } = build({ distBytes: makePng(1, 1) });
    writeFileSync(path.join(root, 'web/dist/assets/stray.png'), makePng(1, 1));
    const r = runRelease({ root });
    assert.equal(r.verdict, 'BLOCKED');
    assert.equal(r.inventoryOk, false);
    assert.ok(r.inventoryErrors.some((e) => e.includes('stray.png')));
  });
});

describe('ASSET-001 真实仓库现状', () => {
  test('R1 清单完整性 = PASS（1 个源图 + 1 个构建产物全部登记，哈希一致）', () => {
    const r = runInventory({ root: REAL_ROOT });
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.equal(r.sourceFiles.length, 1);
    assert.equal(r.distFiles.length, 1);
    assert.equal(r.registered, 1, '源文件与台账条目应一一对应（产物不另算条目）');
  });

  test('R2 发布资格 = PASS（只放行 site-favicon）', () => {
    const r = runRelease({ root: REAL_ROOT });
    assert.equal(r.verdict, 'PASS', JSON.stringify(r.blockers));
    assert.equal(r.inventoryOk, true, '清单本身必须干净，否则这条判据失去意义');
    assert.equal(r.cleared.length, 1);
    assert.equal(r.blockers.length, 0);
    assert.deepEqual(r.cleared.map((c) => c.asset_id), ['site-favicon']);
  });

  test('R3 台账没有把任何未决素材写成 AUTHORIZED（不靠"已上线"反推许可）', () => {
    const ledger = JSON.parse(readFileSync(path.join(REAL_ROOT, 'docs/weapon_assets/ASSET_LEDGER.json'), 'utf8'));
    const approved = ledger.assets.filter((a) => a.distribution_status === 'AUTHORIZED');
    assert.deepEqual(approved.map((a) => a.asset_id), ['site-favicon']);
    for (const a of ledger.assets) {
      if (a.category !== 'IMAGEGEN_GENERATED') continue;
      assert.equal(a.distribution_status, 'UNKNOWN', `${a.asset_id} 的 ImageGen 素材不该被升级成已授权`);
    }
  });

  test('R4 真实 dist 没被本任务改动（产物哈希与台账一致）', () => {
    const ledger = JSON.parse(readFileSync(path.join(REAL_ROOT, 'docs/weapon_assets/ASSET_LEDGER.json'), 'utf8'));
    for (const a of ledger.assets) {
      for (const art of a.build_artifacts) {
        const abs = path.join(REAL_ROOT, art);
        assert.ok(existsSync(abs), `产物不存在：${art}`);
        assert.equal(sha(readFileSync(abs)), a.sha256, `产物哈希与台账不符：${art}`);
      }
    }
  });

  test('R5 main 台账只含已登记的 favicon，不包含 UI-020/争议素材', () => {
    const ledger = JSON.parse(readFileSync(path.join(REAL_ROOT, 'docs/weapon_assets/ASSET_LEDGER.json'), 'utf8'));
    assert.deepEqual(ledger.assets.map((a) => a.asset_id), ['site-favicon']);
    assert.ok(!ledger.assets.some((a) => a.asset_id.startsWith('home-scene')), 'main 不得携带 UI-020 争议素材');
    for (const a of ledger.assets) {
      assert.equal(a.distribution_status, 'AUTHORIZED');
      const abs = path.join(REAL_ROOT, a.source_path);
      assert.ok(existsSync(abs), `源文件不存在：${a.source_path}`);
      assert.equal(sha(readFileSync(abs)), a.sha256, `源文件哈希与台账不符：${a.source_path}`);
    }
  });
});
