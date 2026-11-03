import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const PROBE = '/__ui020007_form_probe';
const BLOCKED = /预览环境暂不支持此操作/;

type NativeMode = 'submit' | 'requestSubmit' | 'event';
type NativeSpec = {
  method: string;
  action?: string | null;
  mode: NativeMode;
  submitterMethod?: string;
  submitterAction?: string;
};

async function setup(page: Page) {
  const hits: Array<{ method: string; path: string }> = [];
  const writeRequests: Array<{ method: string; url: string }> = [];
  const externalRequests: Array<{ method: string; url: string }> = [];

  page.on('request', (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      writeRequests.push({ method: request.method(), url: request.url() });
    }
  });

  await page.route('**/api/**', (route: Route) => route.abort());
  await page.route('https://example.com/**', (route: Route) => {
    externalRequests.push({ method: route.request().method(), url: route.request().url() });
    return route.abort();
  });
  await page.route(`**${PROBE}*`, (route: Route) => {
    const url = new URL(route.request().url());
    hits.push({ method: route.request().method(), path: url.pathname });
    return route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'text/html; charset=utf-8',
      },
      body: '<!doctype html><title>form-probe</title>ok',
    });
  });

  return { hits, writeRequests, externalRequests };
}

async function gotoPreview(page: Page) {
  await page.goto('/');
  await page.waitForSelector('h1');
  await page.waitForTimeout(300);
}

async function formStats(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as {
        __ui020PreviewGuard?: { getFormStats?: () => { allowed: number; blocked: number } };
      }).__ui020PreviewGuard?.getFormStats?.() ?? null,
  );
}

async function waitBlockedToast(page: Page) {
  const toast = page.getByRole('status').filter({ hasText: BLOCKED }).first();
  await toast.waitFor({ state: 'visible', timeout: 3_000 });
  return (await toast.innerText()).replace(/\s+/g, ' ').trim();
}

async function submitNative(page: Page, spec: NativeSpec) {
  return page.evaluate((input) => {
    const suffix = Math.random().toString(36).slice(2);
    const iframeName = `ui020007-target-${suffix}`;
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.setAttribute('method', input.method);
    if (input.action !== undefined && input.action !== null) {
      form.setAttribute('action', input.action);
    }
    form.target = iframeName;

    let submitter: HTMLButtonElement | null = null;
    if (input.mode === 'requestSubmit' || input.mode === 'event') {
      submitter = document.createElement('button');
      submitter.type = 'submit';
      submitter.name = 'probe';
      submitter.value = '1';
      if (input.submitterMethod) submitter.setAttribute('formmethod', input.submitterMethod);
      if (input.submitterAction) submitter.setAttribute('formaction', input.submitterAction);
      form.appendChild(submitter);
    }

    const inputField = document.createElement('input');
    inputField.name = 'field';
    inputField.value = 'native-form';
    form.appendChild(inputField);
    document.body.appendChild(form);

    let defaultPrevented: boolean | null = null;
    if (input.mode === 'submit') {
      form.submit();
    } else if (input.mode === 'requestSubmit') {
      form.requestSubmit(submitter);
    } else {
      const event = new Event('submit', { bubbles: true, cancelable: true });
      const dispatched = form.dispatchEvent(event);
      defaultPrevented = !dispatched;
    }

    return { defaultPrevented };
  }, spec);
}

test.describe('UI020-007 Preview 原生 form 旁路封堵', () => {
  test('非 GET 原生表单、submit()、requestSubmit()、submit 事件全部阻断', async ({ page }, testInfo) => {
    const net = await setup(page);
    await gotoPreview(page);

    const dataset = await page.evaluate(() => ({ ...document.documentElement.dataset }));
    expect(dataset.previewReadonly).toBe('true');
    expect(dataset.previewApiReadonly).toBe('true');
    expect(dataset.previewBuildMode).toBe(
      testInfo.project.name === 'readonly-built' ? 'production' : 'development',
    );

    const cases: Array<{ name: string; spec: NativeSpec }> = [
      { name: 'POST submit()', spec: { method: 'POST', action: PROBE, mode: 'submit' } },
      { name: 'PUT submit()', spec: { method: 'PUT', action: PROBE, mode: 'submit' } },
      { name: 'PATCH submit()', spec: { method: 'PATCH', action: PROBE, mode: 'submit' } },
      { name: 'DELETE submit()', spec: { method: 'DELETE', action: PROBE, mode: 'submit' } },
      { name: 'POST requestSubmit()', spec: { method: 'POST', action: PROBE, mode: 'requestSubmit' } },
      {
        name: 'GET form + submitter formmethod POST',
        spec: { method: 'GET', action: PROBE, mode: 'requestSubmit', submitterMethod: 'POST' },
      },
      { name: 'submit event POST', spec: { method: 'POST', action: PROBE, mode: 'event' } },
    ];

    for (const testCase of cases) {
      const before = await formStats(page);
      const result = await submitNative(page, testCase.spec);
      const toast = await waitBlockedToast(page);
      const after = await formStats(page);

      expect(toast, testCase.name).toMatch(BLOCKED);
      expect(after, testCase.name).toBeTruthy();
      expect(after!.blocked - before!.blocked, testCase.name).toBeGreaterThanOrEqual(1);
      if (testCase.spec.mode === 'event') {
        expect(result.defaultPrevented, testCase.name).toBe(true);
      }
    }

    expect(net.hits).toHaveLength(0);
    expect(net.writeRequests).toHaveLength(0);
    expect(net.externalRequests).toHaveLength(0);
    await expect(page.getByText(/已提交|已发布|已加入|成功发布/)).toHaveCount(0);
  });

  test('GET form 策略：同源非 API 允许；/api 与外部主机拒绝；React Mock 表单正常', async ({ page }) => {
    const net = await setup(page);
    await gotoPreview(page);

    const allowedBefore = await formStats(page);
    await submitNative(page, { method: 'GET', action: `${PROBE}?mode=get`, mode: 'submit' });
    await page.waitForTimeout(700);
    const allowedAfter = await formStats(page);
    expect(net.hits.some((hit) => hit.method === 'GET' && hit.path === PROBE)).toBe(true);
    expect(allowedAfter!.allowed - allowedBefore!.allowed).toBeGreaterThanOrEqual(1);
    expect(net.writeRequests).toHaveLength(0);

    for (const action of ['/api/__ui020007_form_probe', 'https://example.com/write']) {
      const before = await formStats(page);
      await submitNative(page, { method: 'GET', action, mode: 'submit' });
      const toast = await waitBlockedToast(page);
      const after = await formStats(page);
      expect(toast).toMatch(BLOCKED);
      expect(after!.blocked - before!.blocked).toBeGreaterThanOrEqual(1);
    }
    expect(net.writeRequests).toHaveLength(0);
    expect(net.externalRequests).toHaveLength(0);

    await page.goto('/');
    await page.waitForSelector('h1');
    const search = page.getByRole('textbox', { name: '搜索改枪方案' });
    await search.fill('M4');
    await search.press('Enter');
    await page.waitForTimeout(500);
    expect(new URL(page.url()).searchParams.get('q')).toBe('M4');
    expect(net.writeRequests).toHaveLength(0);
    await expect(page.getByRole('status').filter({ hasText: BLOCKED })).toHaveCount(0);
  });
});
