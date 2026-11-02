/**
 * 枪械图片接入校验器（UI-010）—— 接入能力的"闸门"，不是文档。
 *
 * 它现场重算四件事，任何一条不过就退出码 1：
 *   1. 身份面：登记的 slug 必须落在 `db/04_seed.sql` 那 89 条 canonical 里（不认第二套名字），
 *      文件名必须等于 `<slug>.<ext>`（防止"文件名暗示另一把枪"这类错配），且 slug 不许登记两次；
 *   2. 授权面：权利人 / 来源 URL / 授权条款 / 授权依据 / PC 版本对应证据 / 上屏标注 一个都不能空；
 *      类别只认 UI-011 的四分，且**只有已核验可公开展示的两类**能进登记表；
 *      `REAL_WORLD_REFERENCE`（现实枪械参考照）必须在标注里同时写明"现实…参考"与"非游戏内截图" ——
 *      它不是游戏内画面，混在一起显示就是造假；
 *   3. 字节面：文件必须真的在 `web/public/weapons/` 下，SHA-256 与登记值逐字符相同，
 *      字节数与图像宽高必须与**文件头**实测一致（不是登记员说多少就是多少）；
 *   4. 目录面：目录里出现了没登记的文件 = 红。这条是防"先塞图再补手续"——
 *      那是整个授权纪律最容易溃口的地方。
 *
 * 用法：
 *   node tools/web/check-weapon-assets.mjs            # 人看：打印机读结论
 *   判据本体是纯函数 validate()，tests/weapon_assets.test.mjs 用注入的假数据证明它会拒收。
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ASSET_DIR = path.join(ROOT, 'web', 'public', 'weapons');
export const REGISTRY_PATH = path.join(ROOT, 'web', 'src', 'lib', 'weaponAssetRegistry.json');
export const SEED_PATH = path.join(ROOT, 'db', '04_seed.sql');

export const REGISTRY_VERSION = 1;
/** 素材类别（UI-011 STEP 2 的正式四分）。后两类只属于候选台账，不许进登记表。 */
export const KINDS = [
  'GAME_PC_VERIFIED_IMAGE',
  'REAL_WORLD_REFERENCE',
  'OWNER_CAPTURE_PENDING_RIGHTS',
  'UNVERIFIED_SOURCE',
];
export const DISPLAYABLE_KINDS = ['GAME_PC_VERIFIED_IMAGE', 'REAL_WORLD_REFERENCE'];
export const REQUIRED_FIELDS = [
  'slug', 'file', 'kind', 'caption', 'license', 'licenseUrl', 'sourceUrl',
  'author', 'permissionEvidence', 'pcEvidence', 'optimizedFrom', 'sha256', 'width', 'height', 'bytes',
];
/** 卡片版位 520 逻辑像素宽；比这更小接进来就是糊的。 */
export const MIN_WIDTH = 520;
/** 单张上限：图鉴一屏 8~12 张，超了首屏就要为装饰买单。 */
export const MAX_BYTES = 250_000;
/** 一张图同时供 16/10 卡片与 21/9 详情用，比例太窄/太方都会在某一处裁得难看。 */
export const MIN_ASPECT = 1.4;
export const MAX_ASPECT = 2.6;
export const ALLOWED_EXT = ['webp', 'png', 'jpg', 'jpeg'];

/** 从入库种子解析 89 个 canonical slug —— 这是本站唯一的枪械身份来源。 */
export function parseSeedSlugs(sql) {
  const block = sql.match(/INSERT INTO public\.guns[\s\S]*?;/);
  if (!block) throw new Error('db/04_seed.sql 里找不到 guns 的 INSERT —— 判据的锚点没了');
  const rows = [...block[0].matchAll(
    /^\s*\(\s*'([^']*)'\s*,\s*(?:NULL|'[^']*')\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,/gm,
  )];
  return rows.map((r) => r[2]);
}

/** PNG / JPEG / WEBP 文件头实测宽高；解析不了就返回 null（不猜）。 */
export function readImageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(12) === 0x49484452) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15，跳过 DHT(0xC4)/JPG(0xC8)/DAC(0xCC)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8X') {
      return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    if (fourcc === 'VP8L') {
      // 签名 0x2f 之后是 14bit(width-1) + 14bit(height-1)
      const b = buf.readUInt32LE(21);
      return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
    }
    if (fourcc === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }
  return null;
}

const blank = (v) => typeof v !== 'string' || v.trim() === '';
const hex64 = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/**
 * 纯判据。给它登记表 + canonical slug 集合 + 每个文件的实测结果，它返回错误清单（空 = 通过）。
 * 不做任何 I/O，所以测试可以注入假数据证明它真的会拒收，而不是"没东西可拒所以绿"。
 */
export function validate({ registry, seedSlugs, files }) {
  const errors = [];
  if (registry?.version !== REGISTRY_VERSION) {
    errors.push(`registry.version 必须是 ${REGISTRY_VERSION}，实得 ${JSON.stringify(registry?.version)}`);
  }
  const assets = Array.isArray(registry?.assets) ? registry.assets : null;
  if (!assets) { errors.push('registry.assets 必须是数组'); return errors; }

  const canonical = new Set(seedSlugs);
  const seen = new Set();
  const referenced = new Set();

  assets.forEach((a, idx) => {
    const at = `assets[${idx}]${a?.slug ? ` (${a.slug})` : ''}`;
    for (const f of REQUIRED_FIELDS) {
      if (a?.[f] === undefined || a[f] === null || a[f] === '') errors.push(`${at} 缺字段 ${f}`);
    }
    if (!a?.slug) return;
    if (!canonical.has(a.slug)) errors.push(`${at} 的 slug 不在 db/04_seed.sql 的 ${seedSlugs.length} 条 canonical 枪械里 —— 不建第二套枪械身份`);
    if (seen.has(a.slug)) errors.push(`${at} 重复登记同一把枪`);
    seen.add(a.slug);

    if (blank(a.file)) return;
    if (a.file.includes('/') || a.file.includes('\\') || a.file.includes('..')) {
      errors.push(`${at} 的 file 必须是目录内的裸文件名，实得 ${JSON.stringify(a.file)}`);
    } else {
      const ext = a.file.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) errors.push(`${at} 的扩展名 ${ext} 不在 ${ALLOWED_EXT.join('/')} 里（校验器要能实测图像头）`);
      if (a.file !== `${a.slug}.${ext}`) errors.push(`${at} 文件名必须等于 <slug>.<ext>，期望 ${a.slug}.${ext}，实得 ${a.file}`);
      referenced.add(a.file);
    }

    if (!KINDS.includes(a.kind)) errors.push(`${at} 的 kind=${JSON.stringify(a.kind)} 只认 ${KINDS.join('/')}`);
    // 未定级 / 待授权的类别不许进登记面：登记 = 已核验可公开展示。
    if (a.kind && !DISPLAYABLE_KINDS.includes(a.kind)) {
      errors.push(`${at} 的类别 ${a.kind} 未拿到公开展示授权，不许进登记表 —— 未定级的留在候选台账，登记面只放已核验可展示的素材`);
    }
    /*
     * 现实枪械参考照必须同时写明"现实"与"非游戏内"。少一个字，一张 M4 卡宾枪的实物照
     * 就会在用户眼里变成《暗区突围：无限》里的 M4A1 画面 —— 那是拿现实物品冒充游戏资产。
     */
    if (a.kind === 'REAL_WORLD_REFERENCE') {
      const cap = String(a.caption ?? '');
      if (!cap.includes('现实') || !cap.includes('非游戏内')) {
        errors.push(`${at} kind=REAL_WORLD_REFERENCE 的 caption 必须同时写明"现实…参考"与"非游戏内截图"，别让实物照冒充游戏内画面`);
      }
    }
    if (a.sha256 && !hex64(a.sha256)) errors.push(`${at} 的 sha256 必须是 64 位小写十六进制`);

    const measured = files?.[a.file];
    if (!measured || measured.missing) {
      errors.push(`${at} 的文件 ${a.file} 不在 web/public/weapons/ 里`);
      return;
    }
    if (measured.sha256 !== a.sha256) {
      errors.push(`${at} 的 SHA-256 与文件实测不符：登记 ${String(a.sha256).slice(0, 12)}… 实得 ${String(measured.sha256).slice(0, 12)}… —— 文件或已被替换`);
    }
    if (measured.bytes !== a.bytes) errors.push(`${at} 的 bytes 登记 ${a.bytes}，实测 ${measured.bytes}`);
    if (measured.width === null || measured.height === null) {
      errors.push(`${at} 的文件 ${a.file} 解析不出图像头，宽高无从核对`);
    } else {
      if (measured.width !== a.width || measured.height !== a.height) {
        errors.push(`${at} 的宽高登记 ${a.width}x${a.height}，图像头实测 ${measured.width}x${measured.height}`);
      }
      if (measured.width < MIN_WIDTH) errors.push(`${at} 宽 ${measured.width} < ${MIN_WIDTH}，卡片版位上会糊`);
      const aspect = measured.width / measured.height;
      if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) {
        errors.push(`${at} 比例 ${aspect.toFixed(2)} 不在 ${MIN_ASPECT}~${MAX_ASPECT}，16/10 与 21/9 两处必有一处裁坏`);
      }
    }
    if (measured.bytes > MAX_BYTES) errors.push(`${at} 的文件 ${a.file} 有 ${measured.bytes} B > ${MAX_BYTES} B 上限`);
  });

  for (const f of Object.keys(files ?? {})) {
    if (!referenced.has(f)) errors.push(`web/public/weapons/${f} 没有登记 —— 先补授权与哈希，再放文件（不许先塞图再补手续）`);
  }
  return errors;
}

/** 读真实文件系统，产出 validate 需要的实测面。 */
export function measureAssetsDir(assetFiles) {
  const out = {};
  for (const file of assetFiles) {
    const abs = path.join(ASSET_DIR, file);
    if (!existsSync(abs) || !statSync(abs).isFile()) { out[file] = { missing: true }; continue; }
    const buf = readFileSync(abs);
    const dims = readImageSize(buf);
    out[file] = {
      sha256: createHash('sha256').update(buf).digest('hex'),
      bytes: buf.length,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  }
  return out;
}

export function listAssetFiles() {
  if (!existsSync(ASSET_DIR)) return [];
  return readdirSync(ASSET_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
}

export function runCheck() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const seedSlugs = parseSeedSlugs(readFileSync(SEED_PATH, 'utf8'));
  const filesOnDisk = listAssetFiles();
  const declared = (registry.assets ?? []).map((a) => a.file).filter(Boolean);
  // 登记过但目录里没有的，也要进实测面（这样才能报"文件不在"而不是静默跳过）
  const toMeasure = [...new Set([...filesOnDisk, ...declared])];
  const errors = validate({ registry, seedSlugs, files: measureAssetsDir(toMeasure) });
  return {
    ok: errors.length === 0,
    seedGuns: seedSlugs.length,
    registered: registry.assets?.length ?? 0,
    filesOnDisk: filesOnDisk.length,
    missingImages: seedSlugs.length - (registry.assets?.length ?? 0),
    errors,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = runCheck();
  console.log(`WEAPON_ASSET_CHECK=${JSON.stringify({ ok: r.ok, seedGuns: r.seedGuns, registered: r.registered, filesOnDisk: r.filesOnDisk, missingImages: r.missingImages, errors: r.errors.length })}`);
  for (const e of r.errors) console.log('  ✗ ' + e);
  process.exit(r.ok ? 0 : 1);
}
