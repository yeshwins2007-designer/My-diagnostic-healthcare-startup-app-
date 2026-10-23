/**
 * App Store and Google Play screenshots, taken from the running app.
 *
 * Signs in as the store review account (APP_REVIEW_PHONE / APP_REVIEW_CODE,
 * see scripts/seed-review-account.ts), opens the screens below at the exact
 * sizes the stores ask for, the way the native shells show them, and sets
 * each one under a short caption. Point it at production and the listing
 * shows the real labs, tests and prices; the submit workflow does exactly
 * that before every submission, so screenshots never go stale.
 *
 *   BASE_URL=https://app.medwyn.in APP_REVIEW_PHONE=+91… APP_REVIEW_CODE=… npx tsx scripts/store-screenshots.ts
 *
 * Without APP_REVIEW_CODE (a local demo), it reads the code off the screen.
 * CHROMIUM_PATH, if set, is the browser to use.
 *
 * Writes:
 *   mobile/fastlane/screenshots/ios/en-US/            1290 × 2796, iPhone 6.9"
 *   mobile/fastlane/metadata/android/en-US/images/phoneScreenshots/   1080 × 1920
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PHONE = process.env.APP_REVIEW_PHONE ?? '+919845000101';
const CODE = process.env.APP_REVIEW_CODE;

const ROOT = path.resolve(import.meta.dirname, '..');

const PLATFORMS = [
  {
    name: 'ios',
    out: path.join(ROOT, 'mobile/fastlane/screenshots/ios/en-US'),
    // 430 × 932 points at 3x: the 6.9" iPhone size App Store Connect requires.
    size: { width: 1290, height: 2796 },
    viewport: { width: 430, height: 932 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MedwynApp/1.0',
  },
  {
    name: 'android',
    out: path.join(ROOT, 'mobile/fastlane/metadata/android/en-US/images/phoneScreenshots'),
    // 16:9. Google Play refuses screenshots more than twice as tall as wide.
    size: { width: 1080, height: 1920 },
    viewport: { width: 360, height: 640 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 MedwynApp/1.0',
  },
] as const;

/** What each screenshot shows, in listing order. */
const SHOTS = [
  { file: '1_home', path: '/caregiver', caption: 'Your parents’ blood tests, looked after at home' },
  { file: '2_labs', path: '/caregiver/labs', caption: 'Accredited labs near their home' },
  { file: '3_book', path: '/caregiver/book', caption: 'Choose the tests. Pay per test.' },
  { file: '4_membership', path: '/caregiver/membership', caption: 'Less per test, and no home-collection charge' },
  { file: '5_elder', path: '/elder', caption: 'Big, simple buttons for your parent' },
];

async function signIn(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel(/mobile number/i).fill(PHONE.replace(/^\+91/, ''));
  await page.getByRole('button', { name: /send me a code/i }).click();
  let code = CODE;
  if (!code) {
    const shown = page.locator('strong.font-mono').first();
    await shown.waitFor();
    code = (await shown.innerText()).trim();
  }
  await page.getByLabel(/six-digit code/i).fill(code);
  await page.getByRole('button', { name: /verify and continue/i }).click();
  await page.waitForURL(/\/caregiver/);
}

/** The bare app screen, exactly as the native shell would draw it. */
async function capture(browser: Browser, platform: (typeof PLATFORMS)[number], session: StorageState) {
  const context = await browser.newContext({
    storageState: session,
    viewport: platform.viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: platform.userAgent,
    colorScheme: 'dark',
    locale: 'en-IN',
  });
  // What the Capacitor shell adds: the app hides what a web view cannot do.
  await context.addInitScript((p) => {
    (window as unknown as { Capacitor: object }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => p,
      Plugins: {},
    };
  }, platform.name);
  const page = await context.newPage();

  const shots: Buffer[] = [];
  for (const shot of SHOTS) {
    if (shot.path === '/elder') await openElderMode(page);
    await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // No caret, no hover states, no half-finished transitions in a store image.
    // (nextjs-portal is the development server's badge; production has none.)
    await page.addStyleTag({
      content: '*{caret-color:transparent!important;transition:none!important;animation:none!important}nextjs-portal{display:none!important}',
    });
    shots.push(await page.screenshot({ type: 'png' }));
  }
  await turnOffElderMode(page);
  await context.close();
  return shots;
}

/** Elder Mode shows its four buttons only on a phone the family has set up. */
async function openElderMode(page: Page) {
  await page.goto(`${BASE_URL}/caregiver/profile`);
  await page.getByRole('button', { name: /set up elder mode/i }).first().click();
  const link = await page.getByLabel('Elder Mode link').inputValue();
  await page.goto(link);
}

/** And afterwards the review account is left as it was. */
async function turnOffElderMode(page: Page) {
  await page.goto(`${BASE_URL}/caregiver/profile`);
  const off = page.getByRole('button', { name: 'Turn off' });
  while ((await off.count()) > 0) {
    const before = await off.count();
    await off.first().click();
    await page.waitForFunction((n) => document.querySelectorAll('button').length > 0 && [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Turn off').length < n, before);
  }
}

/** The screen, set under its caption, at the store's exact pixel size. */
async function frame(browser: Browser, platform: (typeof PLATFORMS)[number], png: Buffer, caption: string) {
  const { width, height } = platform.size;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // Caption on top, the whole screen below it with room to breathe.
  const captionHeight = Math.round(height * 0.16);
  const screenHeight = Math.round(height * 0.8);
  await page.setContent(`<!doctype html><html><head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@600;700&display=swap">
    <style>
      html,body{margin:0;height:100%}
      body{background:radial-gradient(120% 70% at 50% 0%,#0f4f5c 0%,#072a34 45%,#03161b 100%);
        display:flex;flex-direction:column;align-items:center;font-family:Geist,system-ui,sans-serif;color:#f4fbfb;overflow:hidden}
      h1{box-sizing:border-box;height:${captionHeight}px;margin:0;padding:0 ${Math.round(width * 0.07)}px;display:flex;align-items:center;
        justify-content:center;font-size:${Math.round(width * 0.066)}px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;
        text-align:center;text-wrap:balance}
      img{height:${screenHeight}px;border-radius:${Math.round(width * 0.06)}px;
        box-shadow:0 0 0 ${Math.round(width * 0.006)}px rgba(255,255,255,.14),0 ${Math.round(width * 0.03)}px ${Math.round(width * 0.09)}px rgba(0,0,0,.55)}
    </style></head><body>
    <h1>${caption}</h1>
    <img src="data:image/png;base64,${png.toString('base64')}">
    </body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const out = await page.screenshot({ type: 'png' });
  await page.close();
  return out;
}

async function main() {
  // CHROMIUM_PATH: a browser already on the machine, instead of Playwright's own download.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    // One sign-in for both platforms: codes are limited to a few an hour.
    const login = await browser.newContext();
    await signIn(await login.newPage());
    const session = await login.storageState();
    await login.close();

    for (const platform of PLATFORMS) {
      fs.rmSync(platform.out, { recursive: true, force: true });
      fs.mkdirSync(platform.out, { recursive: true });
      const shots = await capture(browser, platform, session);
      for (const [i, shot] of SHOTS.entries()) {
        fs.writeFileSync(path.join(platform.out, `${shot.file}.png`), await frame(browser, platform, shots[i], shot.caption));
      }
      console.log(`${platform.name}: ${SHOTS.length} screenshots in ${path.relative(ROOT, platform.out)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
