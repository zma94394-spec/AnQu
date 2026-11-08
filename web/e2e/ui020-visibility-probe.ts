import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * UI020-014：卡片“实际可见”探针。
 *
 * 只看节点数量不算可见性；这里同时读计算 opacity、可见面积与命中测试。
 */
export interface CardProbe {
  opacity: string;
  display: string;
  visibility: string;
  width: number;
  height: number;
  visibleArea: number;
  hitInside: boolean;
  inline: string | null;
}

export async function probeCards(page: Page): Promise<CardProbe[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return Array.from(document.querySelectorAll('article')).map((el) => {
      const card = el as HTMLElement;
      const style = getComputedStyle(card);
      const rect = card.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(vw, rect.right);
      const bottom = Math.min(vh, rect.bottom);
      const visibleArea =
        vw > 0 && vh > 0 ? Math.max(0, right - left) * Math.max(0, bottom - top) : 0;

      let hitInside = false;
      if (vw > 0 && vh > 0 && rect.width > 0 && rect.height > 0) {
        const x = Math.min(Math.max(rect.left + rect.width / 2, 0), vw - 1);
        const y = Math.min(Math.max(rect.top + rect.height / 2, 0), vh - 1);
        const hit = document.elementFromPoint(x, y);
        hitInside = Boolean(hit && hit.closest('article') === card);
      }

      return {
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visibleArea: Math.round(visibleArea),
        hitInside,
        inline: card.getAttribute('style'),
      };
    });
  });
}

export async function expectCardsRendered(
  page: Page,
  options: { minVisible?: number; requireHit?: boolean } = {},
): Promise<CardProbe[]> {
  const cards = await probeCards(page);
  expect(cards.length).toBeGreaterThan(0);

  for (const card of cards) {
    expect(card.display, 'display').not.toBe('none');
    expect(card.visibility, 'visibility').toBe('visible');
    expect(card.opacity, 'opacity').toBe('1');
    expect(card.width, 'width').toBeGreaterThanOrEqual(0);
    expect(card.height, 'height').toBeGreaterThan(0);
  }

  const visible = cards.filter((card) => card.visibleArea > 0);
  expect(visible.length, 'visible cards').toBeGreaterThanOrEqual(options.minVisible ?? 1);
  if (options.requireHit !== false) {
    expect(visible.some((card) => card.hitInside), 'card hit test').toBe(true);
  }
  return cards;
}
