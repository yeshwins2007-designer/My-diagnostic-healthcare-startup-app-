/**
 * Find a lab, from the home screen's search bar.
 *
 * Labs are sorted by distance from the parent's home (where the sample is
 * taken), the phone's own location can re-sort them on the device, a lab too
 * far for the two-hour sample rule is listed but cannot be chosen, and
 * "Book with this lab" leads to a booking at that lab.
 */
import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole('button', { name: /send me a code/i }).click();
  const otp = (await page.locator('strong.font-mono').first().innerText()).trim();
  await page.getByLabel(/six-digit code/i).fill(otp);
  await page.getByRole('button', { name: /verify and continue/i }).click();
  await page.waitForURL(/\/caregiver/);
}

// Standing outside Vruksha Diagnostics in Basavanagudi.
test.use({ geolocation: { latitude: 12.9417, longitude: 77.5737 }, permissions: ['geolocation'] });

test('a family finds a lab near home, sorts by where they stand, and books with it', async ({ page }) => {
  await signIn(page, '9845000101');

  // The home search bar searches labs.
  await page.getByLabel('Search labs near you').fill('diagnostics');
  await page.getByLabel('Search labs near you').press('Enter');
  await expect(page).toHaveURL(/\/caregiver\/labs\?q=diagnostics/);
  await expect(page.getByRole('heading', { name: 'Find a lab', level: 1 })).toBeVisible();

  const cards = page.locator('li[data-lab]');
  await expect(cards.first()).toHaveAttribute('data-lab', 'Ananya Diagnostics'); // nearest to Lakshmi's home
  await expect(cards.first().getByText('Lakshmi’s lab')).toBeVisible();
  await expect(page.getByRole('link', { name: /see tests matching “diagnostics”/i })).toBeVisible();

  // Across the city: listed with the reason, and no way to choose it.
  await page.getByLabel(/search labs by name/i).fill('');
  const far = page.locator('li[data-lab="Kaveri Clinical Labs"]');
  await expect(far).toContainText(/too far for a sample to reach the lab within two hours/);
  await expect(far.getByRole('button')).toHaveCount(0);

  // The phone's location re-sorts the list, on the phone.
  await page.getByRole('button', { name: 'Use my current location' }).click();
  await expect(page.getByText('Your location stays on this phone.', { exact: false })).toBeVisible();
  await expect(cards.first()).toHaveAttribute('data-lab', 'Vruksha Diagnostics');
  await expect(cards.first()).toContainText('Less than 100 m from you');
  await page.getByRole('button', { name: 'Nearest to Lakshmi’s home' }).click();
  await expect(cards.first()).toHaveAttribute('data-lab', 'Ananya Diagnostics');

  // Choose Vruksha and book there.
  await page.locator('li[data-lab="Vruksha Diagnostics"]').getByRole('button', { name: 'Book with Vruksha Diagnostics' }).click();
  await page.waitForURL(/\/caregiver\/book\?patient=/);
  await page.getByRole('button', { name: /Elder Baseline Panel/ }).click();
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByRole('heading', { name: 'Booking details' })).toBeVisible();
  await expect(page.getByText('Vruksha Diagnostics')).toBeVisible();
  await page.getByRole('button', { name: /proceed to pay/i }).click();
  await expect(page.getByRole('heading', { name: 'Secure checkout' })).toBeVisible();
});

test('the pin in the home search bar asks for the location straight away', async ({ page }) => {
  await signIn(page, '9845000103');
  await page.getByRole('link', { name: 'Labs near my current location' }).click();
  await expect(page).toHaveURL(/\/caregiver\/labs\?near=1/);
  await expect(page.locator('li[data-lab]').first()).toContainText(/from you/);
});
