import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectCardsRendered, probeCards } from './ui020-visibility-probe';

/**
 * UI020-014：built-production 可见性回归。
 *
 * 只跑 `readonly-built`（vite preview 的 dist，production mode）。
 * API GET 由测试夹具 fulfilled，非 GET 直接 abort；不访问真实 Render / Supabase。
 */

const GUNS_PAYLOAD = {
  success: true,
  data: {
    categories: [
      { slug: 'ar', name: '突击步枪', sort_order: 1, gun_count: 1, build_count: 1 },
    ],
    guns: [
      {
        id: 'gun-m4a1',
        name: 'M4A1',
        name_en: 'M4A1',
        slug: 'm4a1',
        category: 'ar',
        category_name: '突击步枪',
        icon_url: null,
        build_count: 1,
      },
    ],
  },
};

const BUILDS_PAYLOAD = {
  success: true,
  data: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: '【可见性】M4A1 回归方案',
      code: '1234567890123456',
      estimated_cost: 100000,
      platform: 'pc',
      tags: ['回归'],
      description: 'built-production 可见性夹具',
      likes_count: 1,
      copies_count: 2,
      comments_count: 0,
      hot_score: 1,
      cp_score: 1,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
      data_origin: 'SEED_DEMO',
      gun: {
        id: 'gun-m4a1',
        name: 'M4A1',
        name_en: 'M4A1',
        category: 'ar',
        category_name: '突击步枪',
        icon_url: null,
      },
      author: null,
    },
  ],
  pagination: {
    page: 1,
    page_size: 12,
    total: 1,
    total_pages: 1,
    has_next: false,
  },
};

async function installFixtures(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.abort('blockedbyclient');
      return;
    }
    const url = new URL(route.request().url());
    if (url.pathname === '/api/guns') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(GUNS_PAYLOAD),
      });
      return;
    }
    if (url.pathname === '/api/builds') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(BUILDS_PAYLOAD),
      });
      return;
    }
    await route.abort('blockedbyclient');
  });
}

test.describe('UI020-014 built-production 卡片可见性', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'readonly-built', '只在 built-production 项目运行');
    await installFixtures(page);
  });

  test('built production 首页：卡片默认可见、滚动后可见且可命中', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-preview-build-mode', 'production');
    await expect(page.locator('html')).toHaveAttribute('data-preview-data-mode', 'remote-readonly');
    await expect(page.locator('article').first()).toBeAttached();

    const initial = await probeCards(page);
    expect(initial).toHaveLength(1);
    expect(initial[0].opacity).toBe('1');

    await page.locator('.home-scroll-cue').click();
    await page.waitForTimeout(900);
    await expectCardsRendered(page, { minVisible: 1 });
  });

  test('built production /builds：卡片默认可见、可命中', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/builds');
    await expect(page.locator('article').first()).toBeAttached();
    await expectCardsRendered(page, { minVisible: 1 });
  });

  test('built production + IO 不触发 + 最小视口：卡片仍可见', async ({ page }) => {
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

    // Chromium 将 setViewportSize(0,0) 钳到 1×1；1×1 已无可用交集，卡片仍须可见。
    await page.setViewportSize({ width: 1, height: 1 });
    await page.goto('/');
    await expect(page.locator('article').first()).toBeAttached();
    await expectCardsRendered(page, { minVisible: 0, requireHit: false });
    expect(await page.evaluate(() => (window as any).__ui020IOConstructed)).toBe(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    await page.locator('.home-scroll-cue').click();
    await page.waitForTimeout(900);
    await expectCardsRendered(page, { minVisible: 1 });
  });
});
