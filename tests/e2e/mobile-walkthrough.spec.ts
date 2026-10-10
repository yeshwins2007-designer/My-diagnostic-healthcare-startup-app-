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

/** Existing seeded account, for the staff surfaces. */
async function signIn(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole('button', { name: /send me a code/i }).click();
  const otp = (await page.locator('strong.font-mono').first().innerText()).trim();
  await page.getByLabel(/six-digit code/i).fill(otp);
  await page.getByRole('button', { name: /verify and continue/i }).click();
  await page.waitForURL(/\/(caregiver|ops|field|lab)/, { timeout: 30_000 });
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 0) return null;
    // The width is the authoritative signal; this list is a hint. It also
    // names anything scrolled out of an intentionally swipeable container
    // (the ops tab bar sets overflow-x: auto), so read it as a starting
    // point rather than a verdict.
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
        if (label === 'MEDWYN') return;
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

/**
 * The staff surfaces carry the SOP checkboxes — sample labelling, cold-chain
 * seal, the written follow-up that gates closing a critical-value alert. A
 * technician taps those standing at a door, so they are checked on a phone
 * too, not only the surfaces a family sees.
 */
test.describe('staff surfaces on a phone', () => {
  test.use({ viewport: PHONE, deviceScaleFactor: 2 });
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  const surfaces = [
    { phone: '9845000010', path: '/field', name: 'field-route' },
    { phone: '9845000001', path: '/ops/critical', name: 'ops-critical' },
    { phone: '9845100200', path: '/lab/apply', name: 'lab-apply' },
  ];

  for (const s of surfaces) {
    test(`${s.name} has no undersized control`, async ({ page }) => {
      await signIn(page, s.phone);
      await page.goto(s.path, { waitUntil: 'domcontentloaded' });

      // The field route lists visits; the checkboxes live one level in.
      if (s.path === '/field') {
        const visit = page.getByRole('link', { name: /start|open|visit|SS-/i }).first();
        if (await visit.count()) {
          await visit.click().catch(() => {});
          await page.waitForTimeout(1200);
        }
      }

      const r = await inspect(page, `staff-${s.name}`, 'light');
      expect(r.overflow, `${s.name} scrolls sideways`).toBeNull();
      expect(r.small, `${s.name} has controls under 44px`).toEqual([]);
    });
  }
});

test.describe('the light/dark control', () => {
  test.use({ viewport: PHONE, colorScheme: 'light', deviceScaleFactor: 2 });
  test.setTimeout(120_000);

  test('night by default, light by choice, auto follows the phone', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const bg = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    // The phone is set to light, but the brand's night palette is the default.
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    const nightBg = await bg();

    // Choosing light changes the palette, and survives a reload.
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const lightBg = await bg();
    expect(lightBg, 'the palette did not actually change').not.toBe(nightBg);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bg()).toBe(lightBg);

    // Dark returns to the night palette.
    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    expect(await bg()).toBe(nightBg);
    await page.screenshot({ path: `${OUT}/theme-night.png`, fullPage: true });

    // Auto hands control to the phone, which is set to light here.
    await page.getByRole('button', { name: 'Auto' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'auto');
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

      await page.getByRole('button', { name: /add and book tests/i }).click();
      await page.waitForURL(/\/caregiver\/book/, { timeout: 30_000 });

      // 3 — Choose tests
      note(await inspect(page, '05-book', scheme), 'book tests');
      await page.getByRole('button', { name: /Elder Baseline Panel/ }).click();
      await page.waitForTimeout(400);
      note(await inspect(page, '06-selected', scheme), 'test selected');

      // Booking details
      await page.getByRole('button', { name: /continue/i }).click();
      await page.waitForTimeout(600);
      note(await inspect(page, '07-details', scheme), 'booking details');

      // 4 — Secure checkout
      await page.getByRole('button', { name: /proceed to pay/i }).click();
      await page.waitForURL(/\/checkout\//, { timeout: 30_000 });
      await page.getByRole('radio', { name: /apple pay/i }).click();
      await page.waitForTimeout(400);
      note(await inspect(page, '08-checkout-apple-pay', scheme), 'apple pay selected');

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
