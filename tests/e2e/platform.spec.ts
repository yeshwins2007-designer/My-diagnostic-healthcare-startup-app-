/**
 * The Apple layer is for Apple devices only.
 *
 * On an iPhone, iPad or Mac the app switches to app/apple.css: the system
 * typeface, iOS colours, capsule buttons, a floating glass tab bar and the
 * Home Screen icon. On Android, and everywhere else, nothing about the look
 * may change. These tests pin both halves.
 */
import { expect, test, type Page } from '@playwright/test';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

async function look(page: Page) {
  return page.evaluate(() => {
    const send = [...document.querySelectorAll('button')].find((b) => /send me a code/i.test(b.textContent ?? ''));
    return {
      platform: document.documentElement.dataset.platform ?? null,
      apple: document.documentElement.dataset.apple ?? null,
      font: getComputedStyle(document.body).fontFamily,
      canvas: getComputedStyle(document.body).backgroundColor,
      buttonRadius: send ? getComputedStyle(send).borderRadius : null,
      touchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
    };
  });
}

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE, hasTouch: true, isMobile: true });

  test('the Apple layer is on: system font, iOS colours, capsule buttons, Home Screen icon', async ({ page, request }) => {
    await page.goto('/login');
    const l = await look(page);
    expect(l.platform).toBe('apple');
    expect(l.apple).toBe('ios');
    expect(l.font).toMatch(/^-apple-system/);
    expect(l.canvas).toBe('rgb(0, 0, 0)');
    expect(l.buttonRadius).toBe('9999px');
    expect(l.touchIcon).toBe('/apple-touch-icon.png');

    const icon = await request.get('/apple-touch-icon.png');
    expect(icon.ok()).toBe(true);
    expect(icon.headers()['content-type']).toBe('image/png');
  });
});

test.describe('on a Mac', () => {
  test.use({ userAgent: MAC });

  test('the Apple layer is on, without the iPhone-only text sizing', async ({ page }) => {
    await page.goto('/login');
    const l = await look(page);
    expect(l.platform).toBe('apple');
    expect(l.apple).toBe('mac');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--dynamic-type'))).toBe('');
  });
});

test.describe('on Android', () => {
  test.use({ userAgent: ANDROID, hasTouch: true, isMobile: true });

  test('nothing changes: same font, colours, corners, and no Apple icon', async ({ page }) => {
    await page.goto('/login');
    const l = await look(page);
    expect(l.platform).toBeNull();
    expect(l.font).toMatch(/^Geist/);
    expect(l.canvas).toBe('rgb(9, 9, 11)');
    expect(l.buttonRadius).toBe('10px');
    expect(l.touchIcon).toBeNull();
  });
});
