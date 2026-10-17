import { describe, expect, it } from 'vitest';
import { COLLECTION_FEE_PAISE, memberPrice, quote } from '@/lib/pricing';

const MEDWYN_ONE = { testDiscountPercent: 30, freeCollection: true };

describe('pricing', () => {
  it('charges a non-member the tests plus the collection fee', () => {
    const q = quote([{ pricePaise: 149_900 }], null);
    expect(q).toEqual({
      subtotalPaise: 149_900,
      discountPaise: 0,
      collectionFeePaise: COLLECTION_FEE_PAISE,
      collectionWaivedPaise: 0,
      totalPaise: 149_900 + 19_900,
    });
  });

  it('gives a Medwyn One member 30% off and a free collection', () => {
    const q = quote([{ pricePaise: 149_900 }], MEDWYN_ONE);
    expect(q.discountPaise).toBe(45_000); // 30% of 1,499 = 449.70, rounded to ₹450
    expect(q.collectionFeePaise).toBe(0);
    expect(q.collectionWaivedPaise).toBe(19_900);
    expect(q.totalPaise).toBe(104_900);
  });

  it('never shows paise: discounts round to the rupee', () => {
    const q = quote([{ pricePaise: 54_900 }, { pricePaise: 9_900 }], MEDWYN_ONE);
    expect(q.discountPaise % 100).toBe(0);
    expect(q.totalPaise % 100).toBe(0);
  });

  it('agrees with the per-item member price for a single item', () => {
    for (const price of [9_900, 34_900, 54_900, 149_900, 249_900]) {
      expect(quote([{ pricePaise: price }], MEDWYN_ONE).totalPaise).toBe(memberPrice(price, 30));
    }
  });

  it('charges nothing for an empty basket, not a bare collection fee', () => {
    expect(quote([], null).totalPaise).toBe(0);
  });
});
