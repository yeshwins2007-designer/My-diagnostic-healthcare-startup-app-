/**
 * The partner laboratory's journey, on the seeded database: its own sign-in
 * door, the traffic controller after login, the order terminal (accept,
 * reject and re-route, receive a sample, attach the signed PDF, sign
 * results), and the earnings, catalog and profile sections. Also that the
 * two apps stay apart: a family account is never shown a lab screen.
 */
import { expect, test, type Page } from '@playwright/test';

async function partnerSignIn(page: Page, phone: string) {
  await page.goto('/lab/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole('button', { name: /send me a code/i }).click();
  const otp = (await page.locator('strong.font-mono').first().innerText()).trim();
  await page.getByLabel(/six-digit code/i).fill(otp);
  await page.getByRole('button', { name: /verify and continue/i }).click();
}

test.describe('partner laboratory portal', () => {
  test('signed out, the terminal sends you to the partner door, not the family one', async ({ page }) => {
    await page.goto('/lab');
    await expect(page).toHaveURL(/\/lab\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in to your terminal' })).toBeVisible();
    await page.getByRole('link', { name: 'Register as a partner' }).click();
    await expect(page.getByRole('heading', { name: 'Register your laboratory' })).toBeVisible();
    await expect(page.getByText('NABL certificate', { exact: true })).toBeVisible();
  });

  test('the intake desk can accept and receive, but not reject or sign', async ({ page }) => {
    await partnerSignIn(page, '9845100201');
    await page.waitForURL((u) => u.pathname === '/lab');
    const pending = page.locator('li[data-order]').filter({ hasText: 'Accept order' });
    await expect(pending).toHaveCount(2);
    await expect(pending.first().getByRole('button', { name: 'Reject order' })).toBeDisabled();
    await expect(page.getByText('Only an owner or a manager can reject an order.').first()).toBeVisible();
    await expect(page.getByText('An owner or a manager uploads the signed report.').first()).toBeVisible();
  });

  test('a family account that signs in at the partner door lands in the family app', async ({ page }) => {
    await partnerSignIn(page, '9845000101');
    await page.waitForURL(/\/caregiver/);
    await page.goto('/lab');
    await expect(page).toHaveURL(/\/caregiver/);
  });

  test('the owner works an order from the feed to a signed report', async ({ page }) => {
    await partnerSignIn(page, '9845100200');
    await page.waitForURL((u) => u.pathname === '/lab');
    await expect(page.getByRole('heading', { name: 'Pending action' })).toBeVisible();
    await expect(page).toHaveTitle(/^\(2\) /);

    // Accept the first order in the feed.
    const pending = page.locator('li[data-order]').filter({ hasText: 'Accept order' });
    await expect(pending).toHaveCount(2);
    const first = await pending.first().getAttribute('data-order');
    await pending.first().getByRole('button', { name: 'Accept order' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Accepted ${first}.` })).toBeVisible();
    await expect(pending).toHaveCount(1);

    // Reject the other. It goes to the next nearest lab that can do every
    // test (Vruksha Diagnostics in the seed), at the family's price.
    const second = pending.first();
    const ref = await second.getAttribute('data-order');
    await second.getByRole('button', { name: 'Reject order' }).click();
    await second.getByLabel('Why can you not take it?').selectOption('At capacity for that day');
    await second.getByRole('button', { name: `Confirm: reject ${ref}` }).click();
    await expect(page.getByRole('status').filter({ hasText: `Rejected ${ref}.` })).toBeVisible();
    await expect(pending).toHaveCount(0);

    // Receive a handed-over sample by scanning it (Enter submits).
    await page.getByLabel('Sample barcode').first().fill('spc-240002');
    await page.getByLabel('Sample barcode').first().press('Enter');
    await expect(page.getByText('SPC-240002 accepted for processing.')).toBeVisible();

    // The order already in processing: attach the PDF, then sign the values.
    const processing = page.locator('li[data-order]').filter({ hasText: 'SPC-240003' });
    const reference = await processing.getAttribute('data-order');
    await processing.locator('input[type=file]').setInputFiles({
      name: 'signed-report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n'),
    });
    await expect(processing.getByRole('link', { name: 'signed-report.pdf' })).toBeVisible();
    const pdf = await page.request.get(`/api/lab/orders/${await bookingIdOf(page, reference!)}/report-pdf`);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect(pdf.headers()['content-security-policy']).toBe('sandbox');

    // A file that is not a PDF is refused on its bytes, whatever its name.
    await processing.locator('input[type=file]').setInputFiles({
      name: 'fake.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('MZ not a pdf'),
    });
    await expect(processing.getByRole('alert')).toHaveText('That file is not a PDF.');

    const form = processing.getByRole('form', { name: `Results for ${reference}` });
    if (!(await form.isVisible())) await processing.locator('summary', { hasText: 'Enter results' }).click();
    const fields = form.locator('input[inputmode=decimal]');
    const count = await fields.count();
    expect(count).toBeGreaterThan(1);
    // Leave one out first: nothing is saved, and it says which.
    for (let i = 0; i < count - 1; i++) await fields.nth(i).fill('5.1');
    await form.evaluate((f: HTMLFormElement) => f.querySelectorAll('input').forEach((i) => i.removeAttribute('required')));
    await form.getByRole('button', { name: 'Sign and submit results' }).click();
    await expect(form.getByRole('alert')).toContainText('Nothing was saved.');
    await fields.nth(count - 1).fill('5.1');
    await form.getByRole('button', { name: 'Sign and submit results' }).click();

    const done = page.locator('section[aria-labelledby=done-heading] li[data-order]').filter({ hasText: reference! });
    await expect(done).toBeVisible();
    await expect(done.getByText('Awaiting MEDWYN review')).toBeVisible();

    // Earnings counts the report signed today, at the rate card.
    await page.getByRole('link', { name: /^Earnings/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Earnings', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Totals' }).getByText('₹1,260').first()).toBeVisible();
  });

  test('the owner pauses and resumes a test, and sees the team', async ({ page }) => {
    await partnerSignIn(page, '9845100200');
    await page.waitForURL((u) => u.pathname === '/lab');

    await page.goto('/lab/catalog');
    const glucose = page.locator('li[data-test=GLU_F]');
    await glucose.getByRole('button', { name: 'Pause test' }).click();
    await glucose.getByLabel(/why is fasting blood glucose paused/i).fill('Analyser under service');
    await glucose.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(glucose.getByText('Paused', { exact: true })).toBeVisible();
    await expect(glucose.getByText('Analyser under service')).toBeVisible();
    await glucose.getByRole('button', { name: 'Resume' }).click();
    await expect(glucose.getByText('Paused', { exact: true })).toHaveCount(0);

    await page.goto('/lab/profile');
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
    await expect(page.getByText('Ravi Shetty')).toBeVisible();
    await expect(page.getByText('MC-2417')).toBeVisible();
  });
});

/** The booking id behind a reference, read from the PDF link the card renders. */
async function bookingIdOf(page: Page, reference: string): Promise<string> {
  const href = await page
    .locator('li[data-order]')
    .filter({ hasText: reference })
    .getByRole('link', { name: 'signed-report.pdf' })
    .getAttribute('href');
  return href!.split('/')[4];
}
