/**
 * What a family pays for a home collection.
 *
 * Customers pay for what the laboratory offers - a package or individual
 * tests - plus a home-collection fee. Medwyn One members get a percentage
 * off the tests and no collection fee.
 *
 * One pure function, used by the catalogue, the booking summary, the checkout
 * and the server action that writes the charge. The number a family sees on
 * any screen is therefore the number they are charged: there is no second
 * copy of the arithmetic to drift.
 */

/** Charged to non-members for each home collection. */
export const COLLECTION_FEE_PAISE = 19_900;

export interface PricedItem {
  /** Retail price before any membership discount, in paise. */
  pricePaise: number;
}

export interface Membership {
  /** Percentage off tests and packages, e.g. 30. */
  testDiscountPercent: number;
  /** True when the home collection is free. */
  freeCollection: boolean;
}

export interface Quote {
  /** Sum of the retail prices. */
  subtotalPaise: number;
  /** Membership discount on the tests, as a positive number. */
  discountPaise: number;
  /** What is charged for the visit itself, after any waiver. */
  collectionFeePaise: number;
  /** The collection fee a member did not pay, for showing the saving. */
  collectionWaivedPaise: number;
  totalPaise: number;
}

/**
 * Discounts round to the nearest whole rupee, so no screen ever shows paise:
 * "₹384.30" reads as a mistake to most families, and as an ambiguity to an
 * elderly reader.
 */
function roundToRupee(p: number): number {
  return Math.round(p / 100) * 100;
}

export function quote(items: PricedItem[], membership: Membership | null): Quote {
  const subtotalPaise = items.reduce((sum, i) => sum + Math.max(0, i.pricePaise), 0);
  const percent = Math.min(100, Math.max(0, membership?.testDiscountPercent ?? 0));
  const discountPaise = roundToRupee((subtotalPaise * percent) / 100);
  const waived = items.length > 0 && !!membership?.freeCollection;
  const collectionFeePaise = items.length === 0 || waived ? 0 : COLLECTION_FEE_PAISE;
  return {
    subtotalPaise,
    discountPaise,
    collectionFeePaise,
    collectionWaivedPaise: waived ? COLLECTION_FEE_PAISE : 0,
    totalPaise: subtotalPaise - discountPaise + collectionFeePaise,
  };
}

/** The price a member pays for one item, for showing beside the retail price. */
export function memberPrice(pricePaise: number, testDiscountPercent: number): number {
  return pricePaise - roundToRupee((pricePaise * testDiscountPercent) / 100);
}
