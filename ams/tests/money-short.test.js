/**
 * Compact money formatting, pinned at every boundary.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `moneyShort()` was wrong by a factor of 100 for the entire life of the
 * project. It branched at 1e8 cents (which is $1M) but divided by 1e5, and
 * branched at 1e5 cents ($1K) but divided by 1e8. The result:
 *
 *     $2,290,000   rendered as  "$2.29B"
 *     $84,423,525  rendered as  "$84.42B"
 *
 * Both appeared on the executive dashboard. Neither was reported as wrong,
 * because a figure that is confidently wrong in the same direction on every
 * screen reads as "this is a very large airline", not as a defect — and the
 * numbers were quoted back in conversation several times before anyone
 * checked them against the model's own cents values.
 *
 * The lesson worth encoding: a formatting helper is not cosmetic. When it
 * lies consistently, it hides itself, and every downstream reader — human or
 * test — inherits the lie.
 */

import { describe, expect, it } from 'vitest';
import { moneyShort, money } from '../frontend/js/format.js';

describe('moneyShort scales to the right unit', () => {
  it('reports thousands below $1M', () => {
    expect(moneyShort(123_456)).toBe('$1.2K');
    expect(moneyShort(999_99)).toBe('$999.99');
  });

  it('reports millions from $1M', () => {
    expect(moneyShort(1e8)).toBe('$1.00M');
    expect(moneyShort(229_000_000)).toBe('$2.29M');
  });

  it('reports billions from $100B, NOT from $1M', () => {
    // The exact regression: 1e8 cents is one million dollars.
    expect(moneyShort(1e8)).not.toContain('B');
    expect(moneyShort(1e11)).toBe('$1.00B');
    expect(moneyShort(2_290_000_000_00)).toBe('$2.29B');
  });

  it('round-trips: the stated magnitude matches the input', () => {
    const cases = [
      { cents: 123_456, divisor: 1e5 },
      { cents: 229_000_000, divisor: 1e8 },
      { cents: 2_290_000_000_00, divisor: 1e11 },
    ];
for (const { cents, divisor } of cases) {
      const out = moneyShort(cents);
      const numeric = Number(out.replace(/[$MK B]/g, '').trim());
      // Tolerance is half of the last printed digit: K renders to one
      // decimal, M and B to two. Anything tighter fails on correct rounding.
      const dp = divisor === 1e5 ? 1 : 2;
      expect(Math.abs(numeric - cents / divisor), `${cents} -> ${out}`).toBeLessThan(10 ** -dp / 2 + 1e-9);
    }
  });

  it('keeps the sign on a negative figure', () => {
    expect(moneyShort(-2_290_000_00)).toBe('-$2.29M');
  });

  it('falls back to full formatting below $1K', () => {
    expect(moneyShort(99_99)).toBe('$99.99');
    expect(moneyShort(0)).toBe('$0.00');
  });

  it('agrees with money() at small magnitudes', () => {
    for (const cents of [0, 1, 99, 100, 9_999, 99_99]) {
      expect(moneyShort(cents)).toBe(money(cents));
    }
  });
});

describe('money is exact on integer cents', () => {
  it('formats two decimals with thousands separators', () => {
    expect(money(123_456_789)).toBe('$1,234,567.89');
    expect(money(-500)).toBe('-$5.00');
  });

});

describe('the model figures that were mislabelled now read correctly', () => {
  it('the operating result is millions, not billions', async () => {
    const { buildModel } = await import('../frontend/js/model.js');
    const m = buildModel();
    // The figure quoted as "$84.42B" in conversation for the whole project.
    expect(moneyShort(m.total.contributionCents)).toMatch(/^\$[\d,]+\.\d{2}M$/);
    expect(moneyShort(m.total.contributionCents)).not.toMatch(/B$/);
  });

  it('the fleet-fixed pool is millions, not billions', async () => {
    const { buildModel } = await import('../frontend/js/model.js');
    const m = buildModel();
    expect(moneyShort(m.poolCents)).not.toMatch(/B$/);
  });
});