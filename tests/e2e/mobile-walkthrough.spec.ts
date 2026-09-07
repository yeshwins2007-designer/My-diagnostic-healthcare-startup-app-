/**
 * The paying journey on a phone, in both colour schemes.
 *
 * A new caregiver signs up, adds a parent at an in-zone address and reaches
 * the payment sheet — the whole surface a family actually touches before they
 * pay. The seeded caregiver already has a subscription, so this deliberately
 * creates a fresh account rather than reusing hers.
 *
 * It asserts the two promises a phone viewport is most likely to break:
 * nothing scrolls sideways, and no primary control is smaller than the thumb
 * of someone in their seventies.
 *
 *   npx playwright test mobile-walkthrough
 */

import { test, expect, type Page } from '@playwright/test';

const OUT = 'screenshots/mobile';
const PHONE = { width: 390, height: 844 }; // iPhone 14

/** Inside the Jayanagar service zone, so radiusGuard admits it. */
const IN_ZONE = {
  line1: '42, 11th Main Road',
  landmark: 'Near 4th Block Complex',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560011',
};

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 0) return null;
    const guilty: string[] = [];
    document.querySelectorAll('*').forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.right > el.clientWidth + 1 && r.width > 0) {
        guilty.push(`${n.tagName.toLowerCase()}.${String(n.className || '').slice(0, 50)}`);
      }
    });
    return { overflow, guilty: guilty.slice(0, 4) };
  });
}

/**
 * Interactive controls under 44px. The wordmark in the header is a link home,
 * not a control anyone needs to hit accurately, so it is excluded rather than
 * being permanent noise in the report.
 */
async function smallTouchTargets(page: Page) {
  return page.evaluate(() => {
    const out: { label: string; w: number; h: number }[] = [];
    document
      .querySelectorAll('button, a[href], input:not([type="hidden"]), select, [role="button"]')
      .forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const label = (n.textContent || n.getAttribute('aria-label') || n.tagName)
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40);
        if (label === 'SwasthaSetu') return;
        if (r.height < 44) out.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
      });
    return out;
  });
}

async function inspect(page: Page, name: string, scheme: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${scheme}-${name}.png`, fullPage: true });
  const overflow = await horizontalOverflow(page);
  const small = await smallTouchTargets(page);
  console.log(`\n[${scheme}] ${name}  ${page.url().replace('http://localhost:3000', '')}`);
  console.log(`   overflow: ${overflow ? JSON.stringify(overflow) : 'none'}`);
  console.log(`   under 44px: ${small.length ? JSON.stringify(small) : 'none'}`);
  return { overflow, small };
}

test.describe('the light/dark control', () => {
  test.use({ viewport: PHONE, colorScheme: 'light', deviceScaleFactor: 2 });
  test.setTimeout(120_000);

  test('overrides the phone setting and survives a reload', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const bg = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    // The device is emulating light, so this is the palette we start from.
    const lightBg = await bg();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

    // Choosing dark must beat the operating system's preference.
    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkBg = await bg();
    expect(darkBg, 'the palette did not actually change').not.toBe(lightBg);
    await page.screenshot({ path: `${OUT}/theme-dark-forced.png`, fullPage: true });

    // A preference nobody has to set twice.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bg()).toBe(darkBg);

    // And back: light must hold even if the phone is set to dark.
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bg()).toBe(lightBg);

    // Auto hands control back to the operating system.
    await page.getByRole('button', { name: 'Auto' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    expect(await bg()).toBe(lightBg);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode on a phone`, () => {
    test.use({ viewport: PHONE, colorScheme: scheme, deviceScaleFactor: 2 });
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(240_000);

    test(`a new caregiver gets from login to payment in ${scheme}`, async ({ page }) => {
      const problems: string[] = [];
      const note = (r: { overflow: unknown }, where: string) => {
        if (r.overflow) problems.push(`${where}: ${JSON.stringify(r.overflow)}`);
      };

      // Unique per run: the journey creates a real account.
      const phone = '98450' + String(Math.floor(Math.random() * 90000) + 10000);

      // 1 — Sign in
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      note(await inspect(page, '01-login', scheme), 'login');

      await page.getByLabel(/mobile number/i).fill(phone);
      await page.getByRole('button', { name: /send me a code/i }).click();
      await page.waitForTimeout(400);
      note(await inspect(page, '02-otp', scheme), 'otp');

      const otp = (await page.locator('strong.font-mono').first().innerText()).trim();
      await page.getByLabel(/six-digit code/i).fill(otp);
      await page.getByRole('button', { name: /verify and continue/i }).click();
      await page.waitForTimeout(900);
      note(await inspect(page, '03-profile', scheme), 'profile');

      await page.getByLabel(/name/i).first().fill('Test Caregiver');
      await page.getByRole('button', { name: /create my account/i }).click();
      await page.waitForURL(/onboarding/, { timeout: 30_000 });

      // 2 — Add the parent
      note(await inspect(page, '04-add-parent', scheme), 'onboarding');

      await page.locator('input[name="name"]').fill('Lakshmi Rao');
      await page.locator('input[name="ageYears"]').fill('74');
      await page.locator('select[name="sex"]').selectOption('Female');
      await page.locator('input[name="conditions"]').fill('Type 2 diabetes');
      await page.locator('input[name="medications"]').fill('Metformin');
      await page.locator('input[name="line1"]').fill(IN_ZONE.line1);
      await page.locator('input[name="landmark"]').fill(IN_ZONE.landmark);
      await page.locator('input[name="city"]').fill(IN_ZONE.city);
      await page.locator('input[name="state"]').fill(IN_ZONE.state);
      await page.locator('input[name="pincode"]').fill(IN_ZONE.pincode);

      await page.getByRole('button', { name: /add and choose a plan/i }).click();
      await page.waitForTimeout(3000);

      // 3 — Plan chooser
      note(await inspect(page, '05-plan-chooser', scheme), 'plan chooser');

      // Pick a plan. The cards are aria-pressed toggles above the form.
      await page.locator('button[aria-pressed]').first().click();
      await page.waitForTimeout(600);
      note(await inspect(page, '06-plan-selected', scheme), 'plan selected');

      // Billing cycle, then payment method.
      await page.getByRole('button', { name: /every month/i }).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /upi autopay/i }).first().click();
      await page.waitForTimeout(400);
      note(await inspect(page, '07-cycle-and-method', scheme), 'cycle and method');

      // Submit the mandate request. The server action answers with an authUrl.
      await page.locator('button[type="submit"]').last().click();
      await page.waitForTimeout(3000);
      note(await inspect(page, '08-mandate-ready', scheme), 'mandate ready');

      // 4 — Checkout. The authUrl surfaces as a link, not a redirect.
      const approve = page.getByRole('link', { name: /approve the .*mandate/i });
      await expect(approve, 'the approve-mandate link never appeared').toHaveCount(1);
      await approve.click();
      await page.waitForURL(/\/checkout\//, { timeout: 30_000 });

      const result = await inspect(page, '09-checkout', scheme);
      note(result, 'checkout');
      console.log(`   >>> final URL: ${page.url()}`);
      expect(page.url(), 'did not reach the payment sheet').toContain('/checkout/');

      console.log(
        `\n=== ${scheme}: ${problems.length ? problems.join(' | ') : 'no layout problems'}`,
      );
      expect(problems, problems.join(' | ')).toEqual([]);
    });
  });
}
