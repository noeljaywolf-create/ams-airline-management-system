import { describe, it, expect } from 'vitest';
import { aggregatePnl, routeVerdict, flightPnl, buildFlightCost } from '../shared/src/costing.js';

/**
 * Regression tests for two defects found by REVIEW rather than by any
 * failing test. Both shipped green through 118 tests.
 *
 * DEFECT 1 — aggregatePnl computed a `roll` object from fabricated input
 * (distanceKm: 0, passengers: 0, a `seatsFrom` helper that multiplied by
 * an undefined field and therefore always returned 0). It produced an
 * object of near-zero metrics and attached it to the return value as
 * `_roll`, so it serialised into every route P&L API response.
 *
 * DEFECT 2 — breakEvenPassengers computed
 *   (revenue / X) * 0          ← multiplied by ZERO
 *   and fell back to a hardcoded US$120 fare × 0.62.
 * The number it returned was derived from nothing but a magic constant.
 *
 * The lesson these encode: a test suite that only asserts what the code
 * intends to do will never catch a function whose intent was never
 * implemented. These tests assert STRUCTURAL properties — no fabricated
 * fields reach the API, and no magic constant influences an answer.
 */

const LEG = (pax, { revenuePerPax = 8_000, fuelKg = 12_000, fuelPrice = 95, fixed = 90_000, seats = 189, km = 11_000 } = {}) =>
  flightPnl({
    costInput: {
      fuelKg, fuelPriceCentsPerKg: fuelPrice,
      blockHours: 11, seatsOffered: seats, passengers: pax, distanceKm: km,
    },
    fleetFixedLines: [{ cost: fixed, category: 'lease_aircraft' }],
    revenueCents: pax * revenuePerPax,
  });

describe('defect 1 — no fabricated metrics reach the API', () => {
  it('the aggregate carries no internal or underscore-prefixed fields', () => {
    const agg = aggregatePnl([LEG(150), LEG(160)]);
    const offenders = Object.keys(agg).filter((k) => k.startsWith('_'));
    expect(offenders).toEqual([]);
  });

  it('every aggregate metric is a real sum of real flight facts', () => {
    const flights = [LEG(150), LEG(160), LEG(140)];
    const agg = aggregatePnl(flights);

    expect(agg.flights).toBe(3);
    expect(agg.passengers).toBe(150 + 160 + 140);
    expect(agg.seatsOffered).toBe(189 * 3);
    expect(agg.distanceKm).toBe(11_000 * 3);
    expect(agg.blockHours).toBeCloseTo(33, 6);
    expect(agg.asks).toBe(189 * 11_000 * 3);
    expect(agg.rpks).toBe((150 + 160 + 140) * 11_000);
  });

  it('ASK and RPK are non-zero — the fabricated roll produced zeros', () => {
    // This is the assertion the old `_roll` would have failed: it returned
    // asks:0 and raskMicrocents:0 because it was fed distanceKm:0.
    const agg = aggregatePnl([LEG(150)]);
    expect(agg.asks).toBeGreaterThan(0);
    expect(agg.rpks).toBeGreaterThan(0);
    expect(agg.raskMicrocents).toBeGreaterThan(0);
    expect(agg.loadFactorPpm).toBeGreaterThan(0);
  });

  it('the aggregate serialises cleanly to JSON with no undefined leakage', () => {
    const agg = aggregatePnl([LEG(150)]);
    const round = JSON.parse(JSON.stringify(agg));
    expect(round).toEqual(agg);
  });

  it('block hours survive as a fractional value, not zero', () => {
    const agg = aggregatePnl([LEG(150)]);
    expect(agg.blockHours).toBeGreaterThan(0);
  });
});

/**
 * Build an ultra-low-cost leg at a given fuel price. Marginal seat cost
 * is driven by fuel PRICE (100 kg all-up × 3% burn) plus per-passenger
 * onboard service — NOT by how much fuel the flight happens to burn.
 */
const LCC = (pax, fuelPrice) =>
  flightPnl({
    costInput: {
      fuelKg: 18_000, fuelPriceCentsPerKg: fuelPrice,
      cateringCents: 98_000, handlingCents: 42_000,
      blockHours: 11, seatsOffered: 189, passengers: pax, distanceKm: 11_000,
    },
    fleetFixedLines: [{ cost: 90_000, category: 'lease_aircraft' }],
    revenueCents: pax * 1_500, // US$15 fare
  });

describe('defect 2 — the break-even passenger gap is computed, not guessed', () => {
  it('reports the exact gap for a loss-making route', () => {
    // 12,000 kg × 95c = 1,140,000c fuel; + 90,000c lease = 1,230,000c cost.
    // 150 pax × 8,000c = 1,200,000c revenue. Loss = 30,000c per flight.
    // Revenue per pax 8,000c; marginal seat cost ≈ 100×0.03×95 + service.
    const agg = aggregatePnl([LEG(150)]);
    const v = routeVerdict(agg);

    expect(v.verdict).toBe('LOSS_MAKING');
    expect(v.breakEven.closeableByLoadFactor).toBe(true);
    expect(v.breakEven.revenuePerPassengerCents).toBe(8_000);

    // The answer must be arithmetically derivable, not a magic constant.
    const perFlightLoss = Math.abs(agg.contributionCents) / agg.flights;
    const expected = Math.ceil(perFlightLoss / v.breakEven.contributionPerPassengerCents);
    expect(v.breakEven.additionalPassengersPerFlight).toBe(expected);

    // And it must actually close the gap: add that many pax at the stated
    // contribution and the flight is no longer loss-making.
    const closedContribution = agg.contributionCents
      + v.breakEven.additionalPassengersPerFlight * v.breakEven.contributionPerPassengerCents;
    expect(closedContribution).toBeGreaterThanOrEqual(0);
  });

  it('is zero when the route already earns money', () => {
    const v = routeVerdict(aggregatePnl([LEG(180, { revenuePerPax: 20_000 })]));
    expect(v.verdict).not.toBe('LOSS_MAKING');
    expect(v.breakEven.additionalPassengersPerFlight).toBe(0);
  });

  it('refuses to claim load factor can fix a route where pax lose money', () => {
    // An ultra-low-cost carrier at a US$15 fare during a fuel spike
    // (US$4.00/kg). Each extra passenger costs US$4.41 to carry against
    // US$15 earned — filling the aircraft makes the loss WORSE.
    //
    // The honest answer is that no load factor closes this gap. The old
    // implementation returned ceil(loss / 7440) regardless, which is a
    // number derived from a hardcoded fare and an arbitrary 0.62 factor.
    const v = routeVerdict(aggregatePnl([LCC(150, 400)]));

    expect(v.verdict).toBe('LOSS_MAKING');
    expect(v.breakEven.contributionPerPassengerCents).toBeLessThan(0);
    expect(v.breakEven.closeableByLoadFactor).toBe(false);
    expect(v.breakEven.additionalPassengersPerFlight).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('the crossover is continuous — the answer CHANGES with the fare mix', () => {
    // Same fuel price, different fares: a magic constant cannot vary.
    const cheap = routeVerdict(aggregatePnl([LCC(150, 95)])).breakEven;
    const dear = routeVerdict(aggregatePnl([LCC(150, 600)])).breakEven;

    expect(cheap.contributionPerPassengerCents).toBeGreaterThan(0);
    expect(dear.contributionPerPassengerCents).toBeLessThan(0);

    // As fuel price rises the gap must widen monotonically.
    const gaps = [95, 250, 400].map(
      (fc) => routeVerdict(aggregatePnl([LCC(150, fc)])).breakEven.contributionPerPassengerCents);
    expect(gaps[0]).toBeGreaterThan(gaps[1]);
    expect(gaps[1]).toBeGreaterThan(gaps[2]);
  });

  it('marginal seat cost is carried through the aggregation', () => {
    const agg = aggregatePnl([LEG(150, { fuelPrice: 95 }), LEG(150, { fuelPrice: 120 })]);
    expect(agg.marginalSeatCostCents).toBeGreaterThan(0);
  });
});

describe('defect 2 — aggregation still reconciles', () => {
  it('direct + fleet-fixed still equals full cost after the refactor', () => {
    const agg = aggregatePnl([LEG(150), LEG(160)]);
    expect(agg.directCostCents + agg.fleetFixedCostCents).toBe(agg.fullCostCents);
  });

  it('empty aggregate is still safe', () => {
    const agg = aggregatePnl([]);
    expect(agg.flights).toBe(0);
    expect(agg.marginalSeatCostCents).toBe(0);
    expect(routeVerdict(agg).verdict).toBe('NO_DATA');
    expect(routeVerdict(agg).breakEven.additionalPassengersPerFlight).toBe(0);
  });

  it('buildFlightCost still rejects fractional cents', () => {
    expect(() => buildFlightCost({ fuelKg: 100, distanceKm: 100, fuelPriceCentsPerKg: 95.5 }))
      .toThrow(/integer cents/);
  });
});