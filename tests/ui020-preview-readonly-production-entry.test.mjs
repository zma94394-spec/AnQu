import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..', 'web');

async function read(relative) {
  return fs.readFile(path.join(web, relative), 'utf8');
}

test('Production 正式入口没有被挂上 Preview 只读保护', async () => {
  const productionEntry = await read('src/main.tsx');
  const productionApp = await read('src/App.tsx');
  const productionApi = await read('src/lib/api.ts');
  const supabaseClient = await read('src/lib/supabaseClient.ts');

  for (const [name, source] of [
    ['src/main.tsx', productionEntry],
    ['src/App.tsx', productionApp],
    ['src/lib/api.ts', productionApi],
    ['src/lib/supabaseClient.ts', supabaseClient],
  ]) {
    assert.doesNotMatch(source, /PREVIEW_READ_ONLY|previewReadOnly|installPreviewReadOnlyGuard|configurePreviewApiPolicy|preview\/readOnly|preview\/configure/, name);
  }

  assert.match(productionEntry, /import\s+App\s+from\s+['"]\.\/App['"]/, '正式 main.tsx 仍挂载 App');
  assert.match(productionApp, /from\s+['"]\.\/lib\/api['"]/, '正式 App.tsx 仍使用 lib/api');
  assert.match(productionApi, /method:\s*['"]POST['"]/, '正式 api.ts 仍保留原有写请求实现');
  assert.match(productionApi, /VITE_USE_MOCK === 'true'/, '正式 api.ts 的 Mock 开关语义未改变');
});

test('Preview 入口、configure 与网络守卫均为显式只读', async () => {
  const previewMain = await read('src/preview/main.tsx');
  const configure = await read('src/preview/configure.ts');
  const readOnly = await read('src/preview/readOnly.ts');

  assert.match(previewMain, /installPreviewReadOnlyGuard\(\)/, 'Preview 入口安装网络守卫');
  assert.match(previewMain, /dataset\.previewReadonly/, 'Preview 入口暴露只读构建标记');
  assert.match(previewMain, /dataset\.previewApiReadonly/, 'Preview 入口暴露 API 层只读标记');
  assert.match(previewMain, /dataset\.previewBuildMode/, 'Preview 入口暴露 production/development 标记');
  assert.match(configure, /readOnly:\s*PREVIEW_READ_ONLY/, 'configure 使用硬编码只读常量');
  assert.match(configure, /useMock:\s*PREVIEW_DATA_MODE === 'mock'/, 'Mock 缺失时回落到 Mock');
  assert.match(readOnly, /PREVIEW_READ_ONLY = true/, '只读常量必须为 true');
  assert.match(readOnly, /PREVIEW_DATA_MODE/, 'Preview 数据模式必须显式');
  assert.match(readOnly, /VITE_USE_MOCK === 'false' \? 'remote-readonly' : 'mock'/, '只有显式 false 才允许远程 GET');
  assert.match(readOnly, /method\s*===?\s*['"]GET['"]|method\.toUpperCase\(\)/, 'GET/HEAD 判定');
  assert.match(readOnly, /sendBeacon/, 'sendBeacon 被拦截');
  assert.match(readOnly, /XMLHttpRequest/, 'XMLHttpRequest 被拦截');
  assert.match(readOnly, /HTMLFormElement\.prototype\.submit/, '原生 form.submit 被包装');
  assert.match(readOnly, /requestSubmit/, '原生 form.requestSubmit 被包装');
  assert.match(readOnly, /addEventListener\('submit'/, 'submit 事件被捕获');
  assert.match(readOnly, /isAllowedPreviewFormSubmission/, 'GET/同源/非 API 表单策略存在');
});

test('API 层写函数在 Mock/网络之前拒绝，requestEnvelope 也拦截非 GET/HEAD', async () => {
  const api = await read('src/lib/apiPublic.ts');
  assert.match(api, /let previewReadOnly = false/, '默认 false，正式 Production 行为不变');
  assert.match(api, /configurePreviewApiPolicy/, 'Preview 入口可注入只读策略');
  assert.match(api, /isPreviewReadOnly\(\)/, 'UI 可读取只读状态');
  assert.match(api, /assertPreviewMethodAllowed\(init\?\.method \?\? 'GET'/, 'requestEnvelope 方法守卫');
  assert.match(api, /isPreviewReadOnlyError\(err\)/, '网络错误不吞掉只读错误');

  for (const fn of [
    'copyBuild',
    'likeBuild',
    'createBuild',
    'createComment',
    'submitBuildCandidate',
    'submitViaLegacyBuildsEndpoint',
  ]) {
    const guardBeforeMock = new RegExp(
      `export async function ${fn}\\([\\s\\S]*?if \\(previewReadOnly\\) assertPreviewWriteAllowed\\([^)]*\\);\\s*if \\(USE_MOCK\\)`,
    );
    assert.match(api, guardBeforeMock, `${fn} 必须在 Mock 分支之前硬拒绝`);
  }
});
