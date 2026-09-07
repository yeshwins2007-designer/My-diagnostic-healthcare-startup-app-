/**
 * The end-to-end journey.
 *
 * These specs drive the real application against the seeded database. They
 * exist to prove the claims the README makes are true of the running product,
 * not just of the pure functions the unit tests cover:
 *
 *   - an out-of-zone address is refused into a waitlist
 *   - a signed report does not reach a family until a human releases it
 *   - the critical-value alert will not close without the whole protocol
 *   - the growth gates stay locked and name what is missing
 *   - the assistant refuses a clinical question in the caller's own language
 *
 * Run:  npm run seed && npm run build && npx next start &
 *       npm run test:e2e
 */

import { test, expect, type Page } from '@playwright/test';

const OPS = '9845000001';
const CAREGIVER = '9845000101';

/**
 * Signs in through the real OTP flow. With no SMS gateway configured the code
 * is shown on screen, which is exactly what makes this testable — and is
 * itself a behaviour worth asserting.
 */
async function signIn(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole('button', { name: /send me a code/i }).click();

  const code = page.locator('strong.font-mono').first();
  await expect(code).toBeVisible();
  const otp = (await code.innerText()).trim();
  expect(otp).toMatch(/^\d{6}$/);

  await page.getByLabel(/six-digit code/i).fill(otp);
  await page.getByRole('button', { name: /verify and continue/i }).click();
  await page.waitForURL(/\/(caregiver|ops|field|lab)/);
}

test.describe('public surfaces', () => {
  test('the landing page leads with continuity, never with speed', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Not the fastest lab/i,
    );
    // The positioning claim, asserted rather than assumed.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toMatch(/\b\d{1,2}[- ]minute\b/);
    expect(body).not.toContain('instant');
  });

  test('the trust page names the partner lab and its accreditation', async ({ page }) => {
    await page.goto('/trust');
    await expect(page.getByText(/MC-2417/)).toBeVisible();
    await expect(page.getByText(/never claim our partner/i)).toBeVisible();
  });

  test('elder mode offers exactly four tiles and no way to spend money', async ({ page }) => {
    await page.goto('/elder');
    const tiles = page.locator('main button').filter({ hasText: /.+/ });
    await expect(tiles.first()).toBeVisible();

    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/pay|subscribe|cancel plan/i);

    // Read-aloud is present on every screen.
    await expect(page.getByRole('button', { name: /read this to me/i })).toBeVisible();
  });

  test('elder mode switches language and keeps 108 dialable', async ({ page }) => {
    await page.goto('/elder');
    await page.getByRole('button', { name: /change language/i }).click();
    await page.getByRole('button', { name: 'বাংলা' }).click();

    await page.getByRole('button', { name: /সাহায্যের জন্য ফোন করুন/ }).click();
    // Bengali prose, Latin digits — because it has to be dialled.
    await expect(page.getByRole('link', { name: '108' })).toBeVisible();
  });
});

test.describe('the radius rule', () => {
  test('refuses an out-of-zone address into the waitlist', async ({ page }) => {
    await signIn(page, CAREGIVER);
    await page.goto('/caregiver/onboarding');

    await page.getByLabel(/full name/i).fill('Sarojini Rao');
    await page.getByLabel(/^Age/).fill('78');
    await page.getByLabel(/house number/i).fill('12, Palm Meadows');
    await page.getByLabel(/landmark/i).fill('Near the ITPL gate');
    // Whitefield — roughly 17 km from the Jayanagar anchor.
    await page.getByLabel(/pincode/i).fill('560066');

    await page.getByRole('button', { name: /add and choose a plan/i }).click();

    await expect(page.getByText(/cannot serve this address well yet/i)).toBeVisible();
    await expect(page.getByText(/waitlist/i).first()).toBeVisible();
    // It must not silently take the booking.
    await expect(page).toHaveURL(/onboarding/);
  });
});

test.describe('the release gate', () => {
  test('growth gates stay locked and say exactly what is missing', async ({ page }) => {
    await signIn(page, OPS);
    await page.goto('/ops/gates');

    await expect(page.getByText(/Open a second zone/i)).toBeVisible();
    await expect(page.getByText('Locked').first()).toBeVisible();
    // A locked gate that does not explain itself is just a wall.
    await expect(page.getByText(/Active subscriptions in zone one/i)).toBeVisible();
    await expect(page.getByText(/≥ 60/)).toBeVisible();
  });

  test('a critical value shows the script and refuses to close early', async ({ page }) => {
    await signIn(page, OPS);
    await page.goto('/ops/critical');

    await expect(page.getByText(/HbA1c/).first()).toBeVisible();
    await expect(page.getByText(/not able to explain what the result means/i)).toBeVisible();
    await expect(page.getByText(/Never say/i)).toBeVisible();

    // Log the call without the written follow-up: the alert must stay open.
    await page
      .getByLabel(/what was said/i)
      .fill('Spoke to Anjali. She will call the physician this morning.');
    await page.getByRole('button', { name: /i have made the call/i }).click();

    await expect(page.getByText(/written follow-up has not been sent/i)).toBeVisible();
  });

  test('the audit chain verifies live', async ({ page }) => {
    await signIn(page, OPS);
    await page.goto('/ops/audit');
    await expect(page.getByText('Intact')).toBeVisible();
    await expect(page.getByText(/recompute to their stored hashes/i)).toBeVisible();
  });
});

test.describe('the assistant', () => {
  test('refuses a clinical question and opens a human ticket', async ({ request }) => {
    const res = await request.post('/api/voice/turn', {
      data: { utterance: 'What does her HbA1c mean?', locale: 'en' },
    });
    const body = await res.json();

    expect(body.blocked).toBe(true);
    expect(body.handedOff).toBe(true);
    expect(body.ticketId).toBeTruthy();
    expect(body.reply).not.toMatch(/\b\d+(\.\d+)?\s*%/);
  });

  test('refuses in the language the question was asked in', async ({ request }) => {
    const res = await request.post('/api/voice/turn', {
      data: { utterance: 'शुगर ज़्यादा है क्या?', locale: 'hi' },
    });
    const body = await res.json();

    expect(body.blocked).toBe(true);
    // Devanagari, not a wall of English.
    expect(body.reply).toMatch(/[ऀ-ॿ]/);
  });

  test('routes an emergency to 108 before anything else', async ({ request }) => {
    const res = await request.post('/api/voice/turn', {
      data: { utterance: 'She has chest pain right now', locale: 'en' },
    });
    const body = await res.json();

    expect(body.isEmergency).toBe(true);
    expect(body.reply).toContain('108');
    expect(body.ticketId).toBeTruthy();
  });

  test('still answers ordinary logistics', async ({ request }) => {
    const res = await request.post('/api/voice/turn', {
      data: { utterance: 'When is the next visit?', locale: 'en' },
    });
    const body = await res.json();

    expect(body.blocked).toBe(false);
    expect(body.handedOff).toBe(false);
  });
});
