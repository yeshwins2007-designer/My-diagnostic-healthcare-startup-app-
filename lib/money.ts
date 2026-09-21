/**
 * Money is stored in paise everywhere, so no float ever touches a price.
 *
 * Prices are rendered as digits *and* words for the elderly surfaces. A
 * 78-year-old reading "₹1,799" on a phone screen at 6 AM should not have to
 * decide whether that comma is a decimal point.
 */

export function paise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupees(p: number): number {
  return p / 100;
}

/** "₹1,799" — Indian digit grouping (lakh/crore), not thousands. */
export function formatINR(paiseAmount: number, opts?: { withDecimals?: boolean }): string {
  const rupees = toRupees(paiseAmount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: opts?.withDecimals ? 2 : 0,
    maximumFractionDigits: opts?.withDecimals ? 2 : 0,
  }).format(rupees);
}

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = ONES[n % 10];
    return o ? `${t} ${o}` : t;
  }
  const rest = underThousand(n % 100);
  return rest ? `${ONES[Math.floor(n / 100)]} hundred ${rest}` : `${ONES[Math.floor(n / 100)]} hundred`;
}

/**
 * Indian numbering: crore, lakh, thousand, hundred.
 * `numberToWordsIN(179900)` (paise) -> "one thousand seven hundred ninety nine rupees".
 */
export function numberToWordsIN(paiseAmount: number): string {
  const rupees = Math.floor(toRupees(paiseAmount));
  if (rupees === 0) return 'zero rupees';

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1_000);
  const remainder = rupees % 1_000;

  if (crore) parts.push(`${underThousand(crore)} crore`);
  if (lakh) parts.push(`${underThousand(lakh)} lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} thousand`);
  if (remainder) parts.push(underThousand(remainder));

  return `${parts.join(' ').replace(/\s+/g, ' ').trim()} rupees`;
}

/** "₹1,799 — one thousand seven hundred ninety nine rupees" */
export function formatINRWithWords(paiseAmount: number): string {
  return `${formatINR(paiseAmount)} — ${numberToWordsIN(paiseAmount)}`;
}

/**
 * Annual prepay is priced as ten months, not twelve — the blueprint's
 * "two months free" lever, which funds working capital and removes twelve
 * separate monthly churn decisions.
 */
export function annualFromMonthly(monthlyPaise: number, freeMonths = 2): number {
  return monthlyPaise * (12 - freeMonths);
}

/** Founding-cohort pricing: a real attribute of the subscription, not a coupon. */
export function applyDiscount(pricePaise: number, discountPercent: number): number {
  if (discountPercent <= 0) return pricePaise;
  return Math.round(pricePaise * (1 - discountPercent / 100));
}
