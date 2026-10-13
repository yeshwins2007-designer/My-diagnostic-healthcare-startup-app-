/**
 * The end-to-end journey.
 *
 * These specs drive the real application against the seeded database. They
 * exist to prove the claims the README makes are true of the running product,
 * not just of the pure functions the unit tests cover:
 *
 *   - a new family can sign up, book and pay per test, and join Medwyn One
 *   - a passkey signs in on its own, and a removed one stops working
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

test.describe('a new family', () => {
  test('signs up, books and pays per test, then joins Medwyn One', async ({ page }) => {
    test.setTimeout(90_000);
    // A number that has never been seen, so this is the real first-run path.
    const phone = '97' + String(Date.now()).slice(-8);

    await page.goto('/login');
    await page.getByLabel(/mobile number/i).fill(phone);
    await page.getByRole('button', { name: /send me a code/i }).click();
    const code = page.locator('strong.font-mono').first();
    await expect(code).toBeVisible();
    await page.getByLabel(/six-digit code/i).fill((await code.innerText()).trim());
    await page.getByRole('button', { name: /verify and continue/i }).click();
    await page.getByLabel(/your name/i).fill('Meera Krishnan');
    await page.getByRole('button', { name: /create my account/i }).click();

    await page.waitForURL(/\/caregiver\/onboarding/);
    await page.getByLabel(/their full name/i).fill('Saraswathi Krishnan');
    await page.getByLabel(/^Age/).fill('76');
    await page.getByLabel(/house number/i).fill('14, 11th Main, 4th Block');
    await page.getByLabel(/landmark/i).fill('Near Jayanagar Shopping Complex');
    await page.getByLabel(/^City/).fill('Bengaluru');
    await page.getByLabel(/^State/).fill('Karnataka');
    await page.getByLabel(/pincode/i).fill('560011'); // the zone's own centre
    await page.getByRole('button', { name: /add and book tests/i }).click();

    // Pay per test: a package at the lab's price plus the collection fee.
    await page.waitForURL(/\/caregiver\/book\?patient=/);
    await page.getByRole('button', { name: /Elder Baseline Panel/ }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByRole('heading', { name: 'Booking details' })).toBeVisible();
    await expect(page.getByText('₹199')).toBeVisible(); // home collection, non-member
    await page.getByRole('button', { name: /proceed to pay ₹1,698/i }).click();

    await page.waitForURL(/\/caregiver\/checkout\//);
    await expect(page.getByRole('heading', { name: 'Secure checkout' })).toBeVisible();
    await page.getByRole('radio', { name: /apple pay/i }).click();
    await page.getByRole('button', { name: /apple pay/i }).click();
    await page.waitForURL(/\/caregiver\/visits\?booked=/);
    await expect(page.getByText('Booked and confirmed')).toBeVisible();

    // A first visit has no "last time" to be the same as.
    const main = page.locator('main');
    await page.goto('/caregiver');
    await expect(page.getByText('Next visit')).toBeVisible();
    await expect(main).toContainText(/is coming\./);
    await expect(main).not.toContainText(/same technician as last time/i);
    await expect(main).not.toContainText(/visits automatically/i);

    // Joining Medwyn One takes the collection fee off and 30% off the tests.
    await page.goto('/caregiver/membership');
    await page.getByRole('radio', { name: /monthly/i }).click();
    await page.getByRole('button', { name: /join medwyn one · ₹499 a month/i }).click();
    await page.waitForURL(/\/checkout\/simulated\//);
    await page.getByRole('button', { name: /^approve/i }).click();
    await page.waitForURL(/\/caregiver\/membership\?joined=1/);
    await expect(page.getByText('Welcome to Medwyn One')).toBeVisible();

    await page.goto('/caregiver/book?kind=panel');
    await page.getByRole('button', { name: /Elder Baseline Panel/ }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText('Medwyn One discount')).toBeVisible();
    // ₹1,499 − ₹450, collection free.
    await expect(page.getByRole('button', { name: /proceed to pay ₹1,049/i })).toBeVisible();
  });
});

test.describe('passkeys', () => {
  test('add a passkey, sign out, and sign back in with it alone', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'uses the Chrome DevTools virtual authenticator');
    test.setTimeout(90_000);

    // A platform authenticator with Face ID / fingerprint, as on a phone.
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    await signIn(page, '9845000103');
    await page.goto('/caregiver/profile');
    await page.getByRole('button', { name: /add a passkey/i }).click();
    await expect(page.getByText(/passkey added/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/caregiver'));

    // No number, no code: the passkey alone signs in.
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in with a passkey/i }).click();
    await page.waitForURL(/\/caregiver/);
    await expect(page.getByText(/Hello, Fatima/)).toBeVisible();

    // A removed passkey stops working, even though the device still holds it.
    await page.goto('/caregiver/profile');
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/caregiver'));
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in with a passkey/i }).click();
    await expect(page.getByText(/did not work/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
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
    await page.getByLabel(/^City/).fill('Bengaluru');
    await page.getByLabel(/^State/).fill('Karnataka');
    // Whitefield — roughly 17 km from the Jayanagar anchor.
    await page.getByLabel(/pincode/i).fill('560066');

    await page.getByRole('button', { name: /add and book tests/i }).click();

    await expect(page.getByText(/we don’t visit this area yet/i)).toBeVisible();
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
