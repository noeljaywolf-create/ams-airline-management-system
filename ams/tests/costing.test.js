import { describe, it, expect } from 'vitest';
import {
  buildFlightCost, allocateFleetFixed, flightPnl, aggregatePnl, routeVerdict,
} from '../shared/src/costing.js';
import { cents, sum } from '../shared/src/money.js';

describe('costing — flight cost build-up', () => {
  const typical = {
    fuelKg: 3_200,
    fuelPriceCentsPerKg: 95,
    flightCrewCents: cents('1850'),
    cabinCrewCents: cents('940'),
    maintenanceDirectCents: cents('2200'),
    maintenanceReserveCents: cents('1100'),
    airportChargesCents: cents('1450'),
    navigationCents: cents('680'),
    cateringCents: cents('980'),
    handlingCents: cents('420'),
    deIcingCents: cents('260'),
    blockHours: 4.5,
    seatsOffered: 189,
    passengers: 151,
    distanceKm: 4_000,
  };

  it('categorises every line into exactly one bucket', () => {
    const result = buildFlightCost(typical);
    expect(result.byCategory.UNKNOWN).toBe(0);
    expect(result.byCategory.FLIGHT_ATTRIBUTABLE).toBe(result.totalCents);
    expect(result.byCategory.PERIOD).toBe(0);
  });

  it('computes fuel cost as a single rounded integer', () => {
    const result = buildFlightCost(typical);
    // 3,200 kg x 95c = 304,000c exactly
    expect(result.lines.fuel).toBe(304_000);
  });

  it('rounds fuel ONCE, not per line, and never through a float', () => {
    // 3,333.333 kg at 88.8c produces a fractional result
    const result = buildFlightCost({ fuelKg: 3_333, fuelPriceCentsPerKg: 89, distanceKm: 4_000 });
    expect(Number.isSafeInteger(result.lines.fuel)).toBe(true);
    expect(result.lines.fuel).toBe(Math.round(3_333 * 89));
  });

  it('rejects fractional cents from upstream callers', () => {
    expect(() => buildFlightCost({
      ...typical, flightCrewCents: 1850.5, distanceKm: 4_000,
    })).toThrow(/integer cents/);
  });

  it('rejects negative fuel', () => {
    expect(() => buildFlightCost({ fuelKg: -1, distanceKm: 100 })).toThrow(/cannot be negative/);
  });

  it('totals are internally consistent', () => {
    const result = buildFlightCost(typical);
    expect(sum(...Object.values(result.lines))).toBe(result.totalCents);
  });
});

describe('costing — fleet-fixed allocation', () => {
  const flights = [
    { distanceKm: 6_000, blockHours: 8.0, seatsOffered: 189, sectors: 1 },
    { distanceKm: 4_000, blockHours: 5.0, seatsOffered: 189, sectors: 1 },
    { distanceKm: 300, blockHours: 1.0, seatsOffered: 70, sectors: 1 },
    { distanceKm: 1_200, blockHours: 2.0, seatsOffered: 132, sectors: 1 },
  ];

  it('allocates a monthly lease pool to the cent with zero leakage', () => {
    // US $486,213.88 of aircraft lease for the month
    const pool = cents('486213.88');
    const result = allocateFleetFixed({ poolCents: pool, flights, driver: 'BLOCK_HOURS' });
    expect(sum(...result.allocations)).toBe(pool);
  });

  it('allocates by every supported driver without leakage', () => {
    const pool = cents('486213.88');
    for (const driver of ['BLOCK_HOURS', 'ASKS', 'SECTORS', 'DISTANCE_KM', 'FLIGHTS']) {
      const result = allocateFleetFixed({ poolCents: pool, flights, driver });
      expect(sum(...result.allocations)).toBe(pool);
      expect(result.driver).toBe(driver);
    }
  });

  it('gives the long haul more lease cost than the short hop under hours-based allocation', () => {
    const pool = cents('100000');
    const { allocations } = allocateFleetFixed({ poolCents: pool, flights, driver: 'BLOCK_HOURS' });
    expect(allocations[0]).toBeGreaterThan(allocations[2]);
    expect(allocations[0]).toBeGreaterThan(allocations[1]);
    expect(allocations[1]).toBeGreaterThan(allocations[2]);
  });

  it('the DIRECT driver attributes nothing because the caller already did it', () => {
    const result = allocateFleetFixed({ poolCents: 50_000, flights, driver: 'DIRECT' });
    expect(result.totalCents).toBe(0);
    expect(result.allocations.every((a) => a === 0)).toBe(true);
  });

  it('rejects an unknown driver rather than guessing', () => {
    expect(() => allocateFleetFixed({ poolCents: 100, flights, driver: 'VIBES' }))
      .toThrow(/Unknown allocation driver/);
  });

  it('rejects a non-zero pool across zero flights', () => {
    expect(() => allocateFleetFixed({ poolCents: 100, flights: [], driver: 'BLOCK_HOURS' }))
      .toThrow(/zero flights/);
  });
});

describe('costing — flight P&L', () => {
  const result = flightPnl({
    costInput: {
      fuelKg: 3_200, fuelPriceCentsPerKg: 95,
      flightCrewCents: cents('1850'), cabinCrewCents: cents('940'),
      maintenanceDirectCents: cents('2200'), maintenanceReserveCents: cents('1100'),
      airportChargesCents: cents('1450'), navigationCents: cents('680'),
      cateringCents: cents('980'), handlingCents: cents('420'),
      blockHours: 4.5, seatsOffered: 189, passengers: 151, distanceKm: 4_000,
    },
    fleetFixedLines: [
      { cost: cents('6120'), category: 'lease_aircraft' },
      { cost: cents('940'), category: 'insurance_aircraft' },
      { cost: cents('380'), category: 'distribution' },
    ],
    revenueCents: cents('24_100'),
  });

  it('separates direct from fleet-fixed cost', () => {
    expect(result.directCostCents).toBeGreaterThan(0);
    // cents('6120') + cents('940') + cents('380') = 612000 + 94000 + 38000
    expect(result.fleetFixedCostCents).toBe(744_000);
    expect(result.fullCostCents).toBe(result.directCostCents + result.fleetFixedCostCents);
  });

  it('computes a positive contribution on a healthy flight', () => {
    expect(result.contributionCents).toBe(result.revenueCents - result.fullCostCents);
    expect(result.marginPpm).toBeGreaterThan(0);
  });

  it('reports marginal cost of an extra seat far below full cost', () => {
    // The whole point of the marginal/full distinction.
    expect(result.marginalCostOfExtraSeatCents).toBeGreaterThan(0);
    expect(result.marginalCostOfExtraSeatCents).toBeLessThan(result.fullCostCents / 10);
  });

  it('break-even revenue equals full cost', () => {
    expect(result.breakEvenRevenueCents).toBe(result.fullCostCents);
  });

  it('units are non-zero and internally coherent', () => {
    expect(result.asks).toBe(189 * 4000);
    expect(result.caskMicrocents).toBeGreaterThan(0);
    expect(result.raskMicrocents).toBeGreaterThan(result.caskMicrocents);
  });
});

describe('costing — aggregation and route verdict', () => {
  /**
   * Helper builds a flight P&L from EXPLICIT direct and fleet-fixed
   * amounts. An earlier version derived cost from fuel alone, which made
   * the test assert against numbers the helper never actually produced.
   */
  function makeFlight({ seats, pax, km, revenue, direct, fixed }) {
    return flightPnl({
      costInput: {
        fuelKg: 0,
        maintenanceDirectCents: direct,
        blockHours: km / 800, seatsOffered: seats, passengers: pax, distanceKm: km,
      },
      fleetFixedLines: [{ cost: fixed, category: 'lease_aircraft' }],
      revenueCents: revenue,
    });
  }

  const profitable = aggregatePnl([
    makeFlight({ seats: 189, pax: 170, km: 6000, revenue: cents('3100.00'), direct: cents('1500.00'), fixed: cents('700.00') }),
    makeFlight({ seats: 189, pax: 160, km: 6000, revenue: cents('2900.00'), direct: cents('1450.00'), fixed: cents('700.00') }),
  ]);

  it('reconciles direct plus fleet-fixed back to full cost', () => {
    expect(profitable.directCostCents + profitable.fleetFixedCostCents)
      .toBe(profitable.fullCostCents);
  });

  it('classifies a profitable route', () => {
    const verdict = routeVerdict(profitable);
    expect(verdict.verdict).toBe('PROFITABLE');
    expect(verdict.marginPpm).toBeGreaterThan(0);
    expect(verdict.levers.loadFactorGapPpm).toBeGreaterThan(0);
  });

  it('classifies a loss-making route and shows the load-factor gap', () => {
    const lossy = aggregatePnl([
      makeFlight({ seats: 189, pax: 70, km: 6000, revenue: cents('1200.00'), direct: cents('1700.00'), fixed: cents('900.00') }),
    ]);
    const verdict = routeVerdict(lossy);
    expect(verdict.verdict).toBe('LOSS_MAKING');
    expect(verdict.marginPpm).toBeLessThan(0);
    expect(verdict.levers.loadFactorGapPpm).toBeLessThan(0);
    // Needs more than a full aircraft to cover itself.
    expect(verdict.structurallyImpossible).toBe(true);
    expect(verdict.levers.caskHeadroomMicrocents).toBeLessThan(0);
  });

  it('flags a route that cannot break even even at full load factor', () => {
    const structural = aggregatePnl([
      makeFlight({ seats: 189, pax: 189, km: 6000, revenue: cents('2000.00'), direct: cents('1900.00'), fixed: cents('1000.00') }),
    ]);
    const verdict = routeVerdict(structural);
    expect(verdict.verdict).toBe('LOSS_MAKING');
    expect(structural.loadFactorPpm).toBe(1_000_000);
    expect(verdict.structurallyImpossible).toBe(true);
    expect(verdict.levers.requiredLoadFactorPpm).toBeGreaterThan(1_000_000);
  });

  it('classifies a profitable route below target load factor as MARGINAL', () => {
    const thinMargin = aggregatePnl([
      makeFlight({ seats: 189, pax: 120, km: 6000, revenue: cents('2400.00'), direct: cents('1000.00'), fixed: cents('600.00') }),
    ]);
    expect(thinMargin.loadFactorPpm).toBeLessThan(750_000);
    expect(thinMargin.contributionCents).toBeGreaterThan(0);
    expect(routeVerdict(thinMargin).verdict).toBe('MARGINAL');
  });

  it('handles an empty aggregate without dividing by zero', () => {
    const empty = aggregatePnl([]);
    expect(empty.flights).toBe(0);
    expect(empty.caskMicrocents).toBe(0);
    expect(routeVerdict(empty).verdict).toBe('NO_DATA');
  });

  it('aggregates 5000 flights with zero monetary drift', () => {
    const flights = Array.from({ length: 5_000 }, () =>
      makeFlight({ seats: 189, pax: 151, km: 4000, revenue: cents('2400.00'), direct: cents('1200.00'), fixed: cents('500.00') }));
    const agg = aggregatePnl(flights);
    expect(agg.flights).toBe(5_000);
    expect(Number.isSafeInteger(agg.revenueCents)).toBe(true);
    expect(Number.isSafeInteger(agg.fullCostCents)).toBe(true);
    expect(agg.contributionCents).toBe(agg.revenueCents - agg.fullCostCents);
  });
});
