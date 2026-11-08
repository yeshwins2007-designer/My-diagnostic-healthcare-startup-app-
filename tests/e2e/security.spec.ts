/**
 * Security regressions: each test is an attack that used to work.
 *
 * Runs against the seeded database with DEMO_MODE off, so Elder Mode and the
 * report card behave as they do in production.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';

const OWNER = '9845000103'; // Fatima, family of Rizwana Sheikh (has a released report)
const OTHER = '9845000101'; // Anjali, a different family

async function signIn(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole('button', { name: /send me a code/i }).click();
  const code = page.locator('strong.font-mono').first();
  await expect(code).toBeVisible();
  await page.getByLabel(/six-digit code/i).fill((await code.innerText()).trim());
  await page.getByRole('button', { name: /verify and continue/i }).click();
  await page.waitForURL(/\/(caregiver|ops|field|lab)/);
}

/** The card URL of the first report on the owner family's reports page. */
async function ownerCardUrl(page: Page): Promise<string> {
  await page.goto('/caregiver/reports');
  const href = await page.locator('a[href^="/caregiver/reports/"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  return `/report/${href!.split('/').pop()}/card`;
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test.describe('patient data is not reachable without the right key', () => {
  test('Elder Mode shows nobody to a phone that was never set up', async ({ page }) => {
    await page.goto('/elder');
    await expect(page.getByText(/this phone is not set up yet/i)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Rizwana');
    // The old ?patient= door is gone too.
    await page.goto('/elder?patient=anything');
    await expect(page.locator('body')).not.toContainText('Rizwana');
    // Help must always work, linked or not.
    await page.getByRole('button', { name: /call for help/i }).click();
    await expect(page.getByRole('link', { name: '108' })).toBeVisible();
  });

  test('a report card opens for its family, and for nobody else', async ({ page, browser }) => {
    await signIn(page, OWNER);
    const card = await ownerCardUrl(page);
    const own = await page.goto(card);
    expect(own?.status()).toBe(200);
    await expect(page.locator('body')).toContainText('Rizwana');

    // A stranger with the link.
    const stranger = await freshPage(browser);
    const anon = await stranger.page.goto(card);
    expect(anon?.status()).toBe(404);
    await expect(stranger.page.locator('body')).not.toContainText('Rizwana');

    // Another family, signed in.
    await signIn(stranger.page, OTHER);
    const other = await stranger.page.goto(card);
    expect(other?.status()).toBe(404);
    await expect(stranger.page.locator('body')).not.toContainText('Rizwana');
    await stranger.context.close();
  });

  test('ops pages refuse a family account, page by page', async ({ page }) => {
    await signIn(page, OTHER);
    for (const path of ['/ops', '/ops/critical', '/ops/today', '/ops/audit', '/ops/waitlist']) {
      await page.goto(path);
      expect(new URL(page.url()).pathname, `${path} should not render for a family`).not.toMatch(/^\/ops/);
    }
  });
});

test.describe('Elder Mode device links', () => {
  test('a link sets up one phone, works once, and can be turned off', async ({ page, browser }) => {
    test.setTimeout(90_000);
    await signIn(page, OWNER);
    const card = await ownerCardUrl(page);

    await page.goto('/caregiver/profile');
    await page.getByRole('button', { name: /set up elder mode on rizwana/i }).click();
    const link = await page.getByLabel('Elder Mode link').inputValue();
    expect(link).toMatch(/\/elder\/open\/[A-Za-z0-9_-]{40,}$/);

    // Rizwana's phone opens it: her screen, and her own card.
    const phone = await freshPage(browser);
    await phone.page.goto(link);
    await expect(phone.page).toHaveURL(/\/elder$/);
    await expect(phone.page.locator('h1')).toContainText('Rizwana');
    expect((await phone.page.goto(card))?.status()).toBe(200);

    // The same link, forwarded or intercepted, opens nothing.
    const thief = await freshPage(browser);
    await thief.page.goto(link);
    await expect(thief.page.getByText(/already been used or has expired/i)).toBeVisible();
    await expect(thief.page.locator('body')).not.toContainText('Rizwana');
    await thief.context.close();

    // The family turns that phone off: it stops working at once.
    await page.goto('/caregiver/profile');
    await page.getByRole('button', { name: 'Turn off' }).first().click();
    await expect(page.getByRole('button', { name: 'Turn off' })).toHaveCount(0);
    await phone.page.goto('/elder');
    await expect(phone.page.getByText(/this phone is not set up yet/i)).toBeVisible();
    expect((await phone.page.goto(card))?.status()).toBe(404);
    await phone.context.close();
  });
});

test.describe('browser hardening', () => {
  test('every page carries a nonce-based CSP and the security headers', async ({ page }) => {
    const res = await page.goto('/login');
    const headers = res!.headers();
    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['strict-transport-security']).toContain('max-age=');
  });

  test('real screens run with no CSP violations', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content.Security.Policy|violates the following/i.test(m.text())) violations.push(m.text());
    });
    await page.goto('/');
    await page.goto('/elder');
    await signIn(page, OTHER);
    for (const path of ['/caregiver', '/caregiver/book', '/caregiver/visits', '/caregiver/profile', '/caregiver/membership']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    // The inline theme script is the one script not emitted by Next: it must carry the nonce.
    const unnonced = await page.evaluate(
      // Empty placeholders execute nothing; any script with code must carry it.
      () =>
        [...document.querySelectorAll('script:not([src])')].filter(
          (s) => (s.textContent ?? '').trim() !== '' && !(s as HTMLScriptElement).nonce,
        ).length,
    );
    expect(unnonced, 'inline scripts without a nonce').toBe(0);
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
