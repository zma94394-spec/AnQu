import { expect, test } from '@playwright/test';
import { expectCardsRendered, probeCards } from './ui020-visibility-probe';

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

/* ============================================================================
 *  UI020-014：BuildCard 内容可见性兜底
 *
 *  这些用例不看“节点是否存在”，而是看计算 opacity、可见面积与命中测试；
 *  BuildCard 的内容不得依赖 IntersectionObserver 触发才能显示。
 * ========================================================================== */

test.describe('UI020-014 BuildCard 内容可见性兜底', () => {
  test('正常视口：首页卡片默认可见，滚动后可见且可命中', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('article').first()).toBeAttached();

    // 首屏之外也必须已经是 opacity:1，而不是等 IntersectionObserver 触发
    const initial = await probeCards(page);
    expect(initial.length).toBeGreaterThan(0);
    for (const card of initial) expect(card.opacity).toBe('1');

    await page.locator('.home-scroll-cue').click();
    await page.waitForTimeout(900);
    await expectCardsRendered(page, { minVisible: 3 });
  });

  test('正常视口：/builds 卡片默认可见', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/builds');
    await expect(page.locator('article').first()).toBeAttached();
    await page.waitForTimeout(600);
    await expectCardsRendered(page, { minVisible: 1 });
  });

  test('IntersectionObserver 不触发：卡片仍可见', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__ui020IOConstructed = 0;
      class NeverIntersect {
        constructor() {
          (window as any).__ui020IOConstructed += 1;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      }
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        value: NeverIntersect,
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('article').first()).toBeAttached();
    const initial = await probeCards(page);
    expect(initial.length).toBeGreaterThan(0);
    for (const card of initial) expect(card.opacity).toBe('1');
    await page.locator('.home-scroll-cue').click();
    await page.waitForTimeout(900);
    await expectCardsRendered(page, { minVisible: 3 });

    await page.goto('/builds');
    await expect(page.locator('article').first()).toBeAttached();
    await expectCardsRendered(page, { minVisible: 1 });

    // 只断言“可见”还不够：确认页面根本没有为卡片创建 IntersectionObserver
    expect(await page.evaluate(() => (window as any).__ui020IOConstructed)).toBe(0);
  });

  test('0×0 视口（Chromium 钳到 1×1，并同时模拟 JS 0×0）：卡片仍可见', async ({ page }) => {
    await page.addInitScript(() => {
      let zero = true;
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        get: () => (zero ? 0 : document.documentElement.clientWidth),
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        get: () => (zero ? 0 : document.documentElement.clientHeight),
      });
      (window as any).__ui020RestoreViewportMetrics = () => {
        zero = false;
      };
    });

    // Chromium 不允许真正的 0×0 layout viewport，setViewportSize(0,0) 会钳到 1×1；
    // 同时把页面可见的 innerWidth/innerHeight 覆盖为 0，覆盖“0×0 视口”和“无交集”两种条件。
    await page.setViewportSize({ width: 1, height: 1 });
    await page.goto('/');
    await expect(page.locator('article').first()).toBeAttached();
    expect(await page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([0, 0]);
    await expectCardsRendered(page, { minVisible: 0, requireHit: false });

    await page.evaluate(() => (window as any).__ui020RestoreViewportMetrics());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    await page.locator('.home-scroll-cue').click();
    await page.waitForTimeout(900);
    await expectCardsRendered(page, { minVisible: 3 });
  });

  test('后台标签仿真：隐藏状态下加载，切回后仍可见', async ({ page }) => {
    await page.addInitScript(() => {
      let hidden = true;
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (hidden ? 'hidden' : 'visible'),
      });
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => hidden,
      });
      (window as any).__ui020SetTabVisible = () => {
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      };
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('article').first()).toBeAttached();
    expect(await page.evaluate(() => document.visibilityState)).toBe('hidden');

    // 后台加载完成时，卡片已经是 opacity:1；不依赖切回前台再触发动画
    const background = await probeCards(page);
    expect(background.length).toBeGreaterThan(0);
    for (const card of background) expect(card.opacity).toBe('1');

    await page.evaluate(() => (window as any).__ui020SetTabVisible());
    await page.waitForTimeout(300);
    await page.locator('.home-scroll-cue').click();
    await page.waitForTimeout(900);
    await expectCardsRendered(page, { minVisible: 3 });
  });

  test('reduced-motion：卡片仍可见', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('article').first()).toBeAttached();

    const cards = await expectCardsRendered(page, { minVisible: 0, requireHit: false });
    for (const card of cards) expect(card.opacity).toBe('1');

    await page.locator('.home-scroll-cue').click();
    await page.waitForTimeout(400);
    await expectCardsRendered(page, { minVisible: 3 });
  });
});
