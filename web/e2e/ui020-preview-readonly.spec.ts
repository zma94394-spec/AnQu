import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const PROBE = '/__ui020_readonly_probe';
const BLOCKED = /预览环境暂不支持此操作/;

type GuardStats = { allowed: number; blocked: number; realCalls: number };

function isBuiltProject(name: string): boolean {
  return name === 'readonly-built';
}

async function installProbeRoute(page: Page) {
  const hits = { get: 0, head: 0, other: 0 };
  await page.route(`**${PROBE}`, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') hits.get += 1;
    else if (method === 'HEAD') hits.head += 1;
    else hits.other += 1;
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: 'ok',
    });
  });
  return hits;
}

async function blockRealBackends(page: Page) {
  await page.route('**/api/**', (route: Route) => route.abort());
  await page.route('https://anqu.onrender.com/**', (route: Route) => route.abort());
  await page.route('https://*.supabase.co/**', (route: Route) => route.abort());
  await page.route('**/auth/**', (route: Route) => route.abort());
}

test.describe('UI020-005 Preview 只读网络层', () => {
  test('GET/HEAD 通过；其它方法在真实网络层前拒绝；production mode 仍只读', async ({ page }, testInfo) => {
    const hits = await installProbeRoute(page);
    if (isBuiltProject(testInfo.project.name)) await blockRealBackends(page);

    const pageRequests: string[] = [];
    page.on('request', (request) => pageRequests.push(request.url()));

    await page.goto('/');
    await page.waitForSelector('h1');
    await page.waitForTimeout(800);

    await expect(page.locator('html')).toHaveAttribute('data-preview-readonly', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-preview-api-readonly', 'true');
    const dataMode = await page.locator('html').getAttribute('data-preview-data-mode');
    const buildMode = await page.locator('html').getAttribute('data-preview-build-mode');
    expect(dataMode).toBe(isBuiltProject(testInfo.project.name) ? 'remote-readonly' : 'mock');
    expect(buildMode).toBe(isBuiltProject(testInfo.project.name) ? 'production' : 'development');

    if (!isBuiltProject(testInfo.project.name)) {
      const unexpected = pageRequests.filter(
        (url) => /\/api\//.test(url) || /anqu\.onrender\.com|supabase\.co/.test(url),
      );
      expect(unexpected).toHaveLength(0);
    }

    const baseline = await page.evaluate(
      () => (window as any).__ui020PreviewGuard?.getStats() as GuardStats | undefined,
    );
    expect(baseline).toBeTruthy();

    const result = await page.evaluate(async (probe) => {
      const out: Record<string, unknown> = {};
      const call = async (name: string, init?: RequestInit) => {
        try {
          const res = await fetch(probe, init);
          out[name] = { ok: res.ok, status: res.status };
        } catch (err) {
          out[name] = {
            error: true,
            message: err instanceof Error ? err.message : String(err),
            code: (err as { code?: string } | undefined)?.code,
          };
        }
      };

      await call('get', { method: 'GET' });
      await call('head', { method: 'HEAD' });
      const statsAfterReads = (window as any).__ui020PreviewGuard?.getStats() as GuardStats | undefined;

      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'FOO']) {
        await call(method.toLowerCase(), { method });
      }

      try {
        const request = new Request(probe, { method: 'POST', body: 'x' });
        await fetch(request);
        out.requestPost = { ok: true };
      } catch (err) {
        out.requestPost = {
          error: true,
          message: err instanceof Error ? err.message : String(err),
        };
      }

      const beacon = typeof navigator.sendBeacon === 'function' ? navigator.sendBeacon(probe, 'x') : null;

      let xhr: unknown;
      try {
        const request = new XMLHttpRequest();
        request.open('POST', probe);
        request.send();
        xhr = { ok: true };
      } catch (err) {
        xhr = {
          error: true,
          message: err instanceof Error ? err.message : String(err),
        };
      }

      const statsAfterWrites = (window as any).__ui020PreviewGuard?.getStats() as GuardStats | undefined;
      return { out, beacon, xhr, statsAfterReads, statsAfterWrites };
    }, PROBE);

    expect(result.out.get).toMatchObject({ ok: true, status: 200 });
    expect(result.out.head).toMatchObject({ ok: true, status: 200 });
    expect(hits).toMatchObject({ get: 1, head: 1, other: 0 });

    for (const method of ['post', 'put', 'patch', 'delete', 'options', 'foo']) {
      expect(result.out[method], method).toMatchObject({ error: true });
      expect(String((result.out[method] as { message?: string }).message)).toMatch(BLOCKED);
    }
    expect(result.out.requestPost).toMatchObject({ error: true });
    expect(String((result.out.requestPost as { message?: string }).message)).toMatch(BLOCKED);
    expect(result.beacon).toBe(false);

    expect(result.xhr).toMatchObject({ error: true });
    expect(String((result.xhr as { message?: string }).message)).toMatch(BLOCKED);

    expect(result.statsAfterReads).toBeTruthy();
    expect(result.statsAfterWrites).toBeTruthy();
    expect(result.statsAfterWrites!.realCalls).toBe(result.statsAfterReads!.realCalls);
    expect(result.statsAfterWrites!.blocked).toBeGreaterThanOrEqual(result.statsAfterReads!.blocked + 8);
    expect(result.statsAfterReads!.realCalls).toBeGreaterThanOrEqual(baseline!.realCalls + 2);
    expect(hits.other).toBe(0);
  });

  test('API 层写函数直接调用也会在 Mock/网络之前拒绝', async ({ page }, testInfo) => {
    test.skip(isBuiltProject(testInfo.project.name), 'built 项目由网络层用例覆盖；API 层由 dev 直接调用覆盖');

    const writeRequests: string[] = [];
    page.on('request', (request) => {
      if (!['GET', 'HEAD'].includes(request.method())) {
        writeRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto('/');
    await page.waitForSelector('h1');
    await page.waitForTimeout(500);

    const result = await page.evaluate(async () => {
      const modulePath = '/src/lib/apiPublic.ts';
      const api = await import(modulePath);
      const out: Record<string, unknown> = {};
      const capture = async (name: string, call: () => Promise<unknown>) => {
        try {
          await call();
          out[name] = { ok: true };
        } catch (err) {
          out[name] = {
            error: true,
            code: (err as { code?: string } | undefined)?.code,
            message: err instanceof Error ? err.message : String(err),
          };
        }
      };

      await capture('copyBuild', () => api.copyBuild('probe-build'));
      await capture('likeBuild', () => api.likeBuild('probe-build'));
      await capture('createComment', () => api.createComment('probe-build', 'preview'));
      await capture('createBuild', () => api.createBuild({}));
      await capture('submitBuildCandidate', () => api.submitBuildCandidate({}));
      await capture('submitViaLegacyBuildsEndpoint', () => api.submitViaLegacyBuildsEndpoint({}));
      return out;
    });

    for (const name of [
      'copyBuild',
      'likeBuild',
      'createComment',
      'createBuild',
      'submitBuildCandidate',
      'submitViaLegacyBuildsEndpoint',
    ]) {
      expect(result[name], name).toMatchObject({ error: true, code: 'PREVIEW_READ_ONLY' });
      expect(String((result[name] as { message?: string }).message)).toMatch(BLOCKED);
    }

    expect(writeRequests).toHaveLength(0);
  });

  test('UI 写操作显示预览提示且不发起任何写请求', async ({ page }, testInfo) => {
    test.skip(isBuiltProject(testInfo.project.name), 'built 项目由网络层用例覆盖；此用例验证 Mock 页面提示');

    const writeRequests: string[] = [];
    page.on('request', (request) => {
      if (!['GET', 'HEAD'].includes(request.method())) {
        writeRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto('/builds');
    await page.waitForSelector('article');
    await page.waitForTimeout(700);

    const firstArticle = page.locator('article').first();
    const copy = firstArticle.getByRole('button', { name: '复制改枪码' });
    await expect(copy).toBeEnabled();
    await copy.click();
    await expect(page.getByRole('status').filter({ hasText: BLOCKED }).first()).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('已复制！')).toHaveCount(0);

    const like = firstArticle.getByRole('button', { name: /点赞/ }).first();
    if ((await like.count()) > 0) {
      await like.click();
      await expect(page.getByRole('status').filter({ hasText: BLOCKED }).first()).toBeVisible({ timeout: 3_000 });
    }

    await page.getByRole('button', { name: '投稿', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /确认发布|提交到人工审核/ }).click();
    await expect(dialog.getByText(BLOCKED)).toBeVisible({ timeout: 3_000 });

    expect(writeRequests).toHaveLength(0);
  });

  test('登录使用本地演示会话，不连接 Supabase、不产生真实会话', async ({ page }, testInfo) => {
    test.skip(isBuiltProject(testInfo.project.name), 'built 项目由网络层用例覆盖；此用例验证 Mock 页面认证隔离');

    const authOrWriteRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (
        !['GET', 'HEAD'].includes(request.method()) ||
        /supabase\.co|\/auth\//.test(url)
      ) {
        authOrWriteRequests.push(`${request.method()} ${url}`);
      }
    });

    await page.goto('/');
    await page.waitForSelector('h1');
    await page.getByRole('button', { name: '登录', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/只读预览/)).toBeVisible();

    await dialog.locator('#auth-email').fill('preview@example.com');
    await dialog.locator('#auth-password').fill('preview123');
    await dialog.getByRole('button', { name: '登录', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 3_000 });
    await expect(page.getByRole('status').filter({ hasText: '登录成功。' }).first()).toBeVisible({
      timeout: 3_000,
    });

    const demoSession = await page.evaluate(() => window.localStorage.getItem('anqu:demo-session'));
    expect(demoSession).toBeTruthy();
    expect(authOrWriteRequests).toHaveLength(0);
  });
});
