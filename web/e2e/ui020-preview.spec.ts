import { expect, test } from '@playwright/test';

/**
 * 清理版 UI-020 公开 Preview 的验收：
 * - 单层中性背景（不加载 UI-020/UI-017/018 图片）
 * - 公开首屏与 Header/搜索
 * - 公开路由可用，管理/开发路由不存在
 * - Mock 模式下不触碰真实 API
 */
test.describe('UI-020 清理版公开 Preview', () => {
  test('首页使用单层中性背景、唯一搜索与公开导航', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const backdrop = page.getByTestId('home-backdrop');
    await expect(backdrop).toBeVisible();
    expect(await backdrop.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    await expect(page.locator('.home-scene-img')).toHaveCount(1);
    await expect(page.locator('.home-scene-neutral')).toHaveCount(1);
    expect(await page.locator('.home-scene-img').evaluate((el) => el.tagName)).toBe('DIV');
    await expect(page.locator('img[src*=".webp"], img[src*=".avif"], img[src*=".png"]')).toHaveCount(0);

    await expect(page.getByRole('heading', { level: 1, name: '找到你的改枪方案。' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '搜索改枪方案' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '向下浏览公开改枪方案' })).toBeVisible();
    await expect(page.getByTestId('ui020-rights-neutral')).toBeVisible();

    for (const name of ['首页', '枪械库']) {
      await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: '方案库', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '审核队列', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '投稿', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();

    const searchStyle = await page.locator('.home-search').evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopWidth, radius: s.borderTopLeftRadius, width: el.getBoundingClientRect().width };
    });
    expect(searchStyle.border).not.toBe('0px');
    expect(searchStyle.radius).not.toBe('0px');
    expect(searchStyle.width).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

    expect(requests.some((url) => /__ui0(17|18|19|20)_reference/.test(url))).toBe(false);
    expect(requests.some((url) => /\.(webp|avif|png)(\?|$)/.test(url))).toBe(false);
    expect(requests.some((url) => url.includes('anqu.onrender.com') || url.includes('supabase.co'))).toBe(false);
  });

  test('公开路由存在，管理与开发路由不进入 Preview', async ({ page }) => {
    await page.goto('/guns');
    await expect(page.getByRole('heading', { level: 1, name: '枪械库' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: '审核队列', exact: true })).toHaveCount(0);

    await page.goto('/builds');
    await expect(page.getByRole('heading', { level: 1, name: '方案库' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: '审核队列', exact: true })).toHaveCount(0);

    for (const path of ['/review', '/submit', '/dev/pc-verification', '/weapons']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: '页面不存在' })).toBeVisible();
    }
  });

  test('公开详情、评论与投稿界面存在，且不发起真实 API 请求', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.goto('/guns/m4a1');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('M4A1', { timeout: 30_000 });
    await expect(page.getByTestId('dev-pc-verification-entry')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '审核队列', exact: true })).toHaveCount(0);

    await page.goto('/builds');
    const firstBuild = page.locator('a[href^="/builds/"]').first();
    await expect(firstBuild).toBeVisible({ timeout: 30_000 });
    await firstBuild.click();
    await expect(page).toHaveURL(/\/builds\/[^/]+$/);
    await expect(page.getByText('登录后即可发表评论与点赞')).toBeVisible();

    await page.getByRole('button', { name: '投稿', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goto('/');

    expect(requests.filter((url) => /\/api\//.test(url))).toHaveLength(0);
  });

  test('窄屏保持单层中性背景且无横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('home-backdrop')).toBeVisible();
    await expect(page.locator('.home-scene-neutral')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: '找到你的改枪方案。' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  });
});
