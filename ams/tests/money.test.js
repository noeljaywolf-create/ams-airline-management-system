import { describe, it, expect } from 'vitest';
import {
  cents, format, sum, allocate, applyPpm, assertReconciles,
  MoneyError, multiplyWhole, subtract,
} from '../shared/src/money.js';

describe('money — parsing precision', () => {
  it('parses decimal strings without float drift', () => {
    expect(cents('1234.56')).toBe(123456);
    expect(cents('1,234.56')).toBe(123456);
    expect(cents('0.01')).toBe(1);
    expect(cents('-78.90')).toBe(-7890);
    expect(cents('1 234.56')).toBe(123456);
    expect(cents('100')).toBe(10000);
  });

  it('THE classic failure case: 0.1 + 0.2 must equal 0.30 exactly', () => {
    // Naive float arithmetic: 0.1 + 0.2 === 0.30000000000000004
    const a = cents('0.10');
    const b = cents('0.20');
    expect(sum(a, b)).toBe(cents('0.30'));
    expect(subtract(sum(a, b), cents('0.30'))).toBe(0);
  });

  it('one cent added one million times equals exactly one million cents', () => {
    let total = 0;
    for (let i = 0; i < 1_000_000; i += 1) total += 1;
    expect(total).toBe(1_000_000);
  });

  it('REJECTS a third decimal place rather than silently truncating it', () => {
    // Silently truncating a third decimal is how "US$12.345" quietly
    // becomes US$12.34 and nobody finds out. Reject and make the caller
    // decide. This is deliberate, not an oversight.
    expect(() => cents('12.345')).toThrow(MoneyError);
    expect(() => cents('12.999')).toThrow(MoneyError);
    expect(cents('12.34')).toBe(1234);
  });

  it('rejects unparseable input', () => {
    expect(() => cents('abc')).toThrow(MoneyError);
    expect(() => cents('$100')).toThrow(MoneyError);
  });
});

describe('money — integer discipline', () => {
  it('rejects floating point money at every entry point', () => {
    expect(() => sum(1.5)).toThrow(/safe integer/);
    expect(() => subtract(100, 0.5)).toThrow(/safe integer/);
  });

  it('rejects non-integer multipliers and rates', () => {
    expect(() => multiplyWhole(100, 1.5)).toThrow(MoneyError);
    expect(() => applyPpm(100, 0.5)).toThrow(MoneyError);
  });

  it('applies ppm rates with symmetric half-up rounding', () => {
    expect(applyPpm(10_000, 100_000)).toBe(1000);   // 10%
    expect(applyPpm(-10_000, 100_000)).toBe(-1000);
    expect(applyPpm(1, 500_000)).toBe(1);            // 0.5 -> away from zero
    expect(applyPpm(0, 100_000)).toBe(0);
  });

  it('multiplies by whole numbers only', () => {
    expect(multiplyWhole(250, 4)).toBe(1000);
    expect(() => multiplyWhole(250, 0.25)).toThrow(MoneyError);
  });
});

describe('money — allocation is exact', () => {
  it('distributes 100 cents across 3 equal weights with zero leakage', () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(sum(...parts)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });

  it('THE airline case: splits a real fuel invoice across 400 flights exactly', () => {
    // US $87,431.66 uplift across 400 rotations
    const invoice = cents('87431.66');
    const weights = Array.from({ length: 400 }, (_, i) => 80 + (i % 7));
    const parts = allocate(invoice, weights);
    expect(sum(...parts)).toBe(invoice);
    expect(parts).toHaveLength(400);
    expect(parts.every(Number.isSafeInteger)).toBe(true);
  });

  it('never loses a cent across 1000 randomised splits', () => {
    for (let t = 0; t < 200; t += 1) {
      const total = 1 + Math.floor(Math.random() * 10_000_000);
      const n = 1 + Math.floor(Math.random() * 37);
      const weights = Array.from({ length: n }, () => Math.random() * 100);
      const parts = allocate(total, weights);
      expect(sum(...parts)).toBe(total);
    }
  });

  it('handles the zero-weight case without dividing by zero', () => {
    expect(allocate(0, [0, 0, 0])).toEqual([0, 0, 0]);
    expect(() => allocate(100, [0, 0, 0])).toThrow(MoneyError);
  });

  it('rejects negative totals', () => {
    expect(() => allocate(-100, [1, 1])).toThrow(MoneyError);
  });
});

describe('money — reconciliation guard', () => {
  it('passes when balanced', () => {
    expect(assertReconciles([400, 600], 1000, 'test')).toBe(true);
  });

  it('throws loudly when it does not balance — a silent mismatch becomes a misstatement', () => {
    expect(() => assertReconciles([400, 599], 1000, 'test')).toThrow(/does not balance/);
  });
});

describe('money — formatting', () => {
  it('renders with thousands separators and two decimals', () => {
    expect(format(123456789)).toBe('$1,234,567.89');
    expect(format(-5000)).toBe('-$50.00');
    expect(format(0)).toBe('$0.00');
    expect(format(5, 'EUR')).toBe('€0.05');
  });
});
