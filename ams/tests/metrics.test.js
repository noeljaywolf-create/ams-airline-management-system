import { describe, it, expect } from 'vitest';
import {
  ask, rpk, loadFactorPpm, caskMicrocents, raskMicrocents,
  breakEvenLoadFactorPpm, flightMetrics, rollUp, utilisationMilli,
} from '../shared/src/metrics.js';
import { cents } from '../shared/src/money.js';

describe('metrics — traffic', () => {
  it('computes ASK as seats x distance', () => {
    // A B737-800 with 189 seats on a 4,000 km sector
    expect(ask(189, 4000)).toBe(756_000);
  });

  it('computes RPK as paying passengers x distance', () => {
    expect(rpk(151, 4000)).toBe(604_000);
  });

  it('computes load factor in ppm', () => {
    const lf = loadFactorPpm(189, 151, 4000);
    // 604,000 RPK / 756,000 ASK = 0.798941... -> 798,942 ppm = 79.8942%
    expect(lf).toBe(798_942);
    expect(lf / 1_000_000).toBeCloseTo(0.7989, 4);
  });

  it('returns 0 load factor rather than dividing by zero on an empty flight', () => {
    expect(loadFactorPpm(0, 0, 4000)).toBe(0);
  });
});

describe('metrics — unit economics', () => {
  it('computes CASK and RASK in microcents', () => {
    const cost = cents('18500');    // US$18,500
    const revenue = cents('24000'); // US$24,000
    const asks = 756_000;

    const c = caskMicrocents(cost, asks);
    const r = raskMicrocents(revenue, asks);

    expect(c).toBeGreaterThan(0);
    expect(r).toBeGreaterThan(0);
    // caskMicrocents returns microcents-per-ASK. Divide by 1e6 for cents,
    // then by 100 for dollars: CASK = $18,500 / 756,000 ASK = $0.02447/ASK
    expect(c / 100_000_000).toBeCloseTo(0.02447, 5);
    expect(r / 100_000_000).toBeCloseTo(0.03175, 5);
  });

  it('break-even load factor equals cost divided by revenue', () => {
    const cost = cents('1,850,000');
    const revenue = cents('2,400,000');
    const be = breakEvenLoadFactorPpm(cost, revenue);
    expect(be / 1_000_000).toBeCloseTo(1_850_000 / 2_400_000, 6);
    expect(be).toBe(770_833);
  });

  it('a route at 100% load factor that still cannot break even is flagged', () => {
    const metrics = flightMetrics({
      seatsOffered: 100, passengers: 100, distanceKm: 1000,
      revenueCents: cents('9000'), operatingCostCents: cents('12000'),
    });
    // Revenue < cost even at full load: structurally loss-making.
    expect(metrics.breakEvenLoadFactorPpm).toBeGreaterThan(1_000_000);
    expect(metrics.contributionCents).toBeLessThan(0);
  });

  it('returns MAX_SAFE_INTEGER rather than dividing by zero when there is no revenue', () => {
    expect(breakEvenLoadFactorPpm(1000, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('metrics — overbooking guard', () => {
  it('rejects passengers exceeding seats — load factor cannot exceed 100%', () => {
    expect(() => flightMetrics({
      seatsOffered: 100, passengers: 101, distanceKm: 1000,
    })).toThrow(/exceed seats/);
  });
});

describe('metrics — aggregation correctness', () => {
  it('rolls up by re-summing numerators, not averaging per-flight ratios', () => {
    // A long haul and a short hop. Averaging their load factors would be
    // wrong because it weights a 300 km hop equally with a 6,000 km leg.
    const flights = [
      { seatsOffered: 189, passengers: 170, distanceKm: 6000, revenueCents: 3_000_000, operatingCostCents: 2_800_000, blockHours: 8 },
      { seatsOffered: 70, passengers: 30, distanceKm: 300, revenueCents: 200_000, operatingCostCents: 180_000, blockHours: 1 },
    ];

    const agg = rollUp(flights);

    const expectedAsk = 189 * 6000 + 70 * 300;
    const expectedRpk = 170 * 6000 + 30 * 300;
    expect(agg.asks).toBe(expectedAsk);
    expect(agg.rpks).toBe(expectedRpk);
    expect(agg.loadFactorPpm).toBe(Math.floor((expectedRpk / expectedAsk) * 1_000_000 + 0.5));

    // Capacity-weighted, not the simple mean of 90% and 43%.
    const naiveMean = Math.floor(((170 / 189) + (30 / 70)) / 2 * 1_000_000);
    expect(agg.loadFactorPpm).not.toBe(naiveMean);
  });

  it('accumulates totals exactly with no floating drift', () => {
    const flights = Array.from({ length: 10_000 }, (_, i) => ({
      seatsOffered: 100, passengers: 80, distanceKm: 1000,
      revenueCents: 500_00, operatingCostCents: 400_00, blockHours: 2,
    }));
    const agg = rollUp(flights);
    expect(agg.revenueCents).toBe(500_00 * 10_000);
    expect(agg.operatingCostCents).toBe(400_00 * 10_000);
    expect(agg.contributionCents).toBe((500_00 - 400_00) * 10_000);
    expect(agg.sectors).toBe(10_000);
  });
});

describe('metrics — utilisation', () => {
  it('computes block hours per aircraft day in milli-hours', () => {
    expect(utilisationMilli(11.4, 1)).toBe(11_400);
    expect(utilisationMilli(0, 1)).toBe(0);
    expect(utilisationMilli(10, 0)).toBe(0);
  });
});
