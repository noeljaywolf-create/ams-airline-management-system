/**
 * AMS — Traffic and unit-economics metrics.
 *
 * The airline industry's entire commercial vocabulary reduces to a
 * handful of ratios. This module computes them exactly, in integer
 * cents per unit, so that two carriers' CASK figures are actually
 * comparable — which they are not, in practice, unless the numerator
 * is built from the same cost taxonomy (see domain.js COST_CATEGORIES).
 *
 * Key definitions, per IATA:
 *   ASK  Available Seat Kilometres — seats offered x distance flown.
 *        The supply side. Unaffected by whether anyone buys a ticket.
 *   RPK  Revenue Passenger Kilometres — paying passengers x distance.
 *        The demand side, and the only passenger-capacity measure that
 *        also carries revenue.
 *   PLF  Passenger Load Factor = RPK / ASK.
 *
 *   CASK  Cost per Available Seat Kilometre = operating cost / ASK
 *   RASK  Revenue per Available Seat Kilometre = revenue / ASK
 *
 *   CASM / RASM are the same ratios using statute miles (ASM). They are
 *   provided for US-filed comparability. 1 statute mile = 1.609344 km.
 *
 * Break-even load factor is the CASK/RASK ratio: the load factor below
 * which the flight does not cover its own variable and allocated cost.
 * The whole of schedule planning is an exercise in raising load factor
 * or lowering CASK on routes where their ratio is uncomfortable.
 *
 * @module metrics
 */

import { MoneyError } from './money.js';

export const KM_PER_STATUTE_MILE = 1_609_344; // scaled by 1e6 to stay integer

/**
 * @typedef {Object} FlightInput
 * @property {number} [seatsOffered]  Seats available on this flight
 * @property {number} [passengers]    Paying passengers carried
 * @property {number} distanceKm      Great-circle or actual block distance
 * @property {number} [revenueCents]  Passenger revenue attributed to this flight
 * @property {number} [operatingCostCents] Flight-attributable + allocated fleet-fixed
 * @property {number} [blockHours]    Door-close to door-open
 */

/**
 * Accumulator shape used by rollUp(). Declared explicitly because
 * Array.reduce otherwise infers the accumulator from the element type,
 * which silently widens it to FlightInput and loses every aggregate field.
 * @typedef {Object} RollUpTotals
 * @property {number} asks
 * @property {number} rpks
 * @property {number} revenueCents
 * @property {number} operatingCostCents
 * @property {number} seatsOffered
 * @property {number} passengers
 * @property {number} blockHoursMilli
 * @property {number} distanceKm
 * @property {number} sectors
 */

/**
 * Available Seat Kilometres for one flight.
 * @param {number} seatsOffered @param {number} distanceKm @returns {number}
 */
export function ask(seatsOffered, distanceKm) {
  assertNonNegativeInt(seatsOffered, 'seatsOffered');
  assertNonNegativeInt(distanceKm, 'distanceKm');
  return seatsOffered * distanceKm;
}

/**
 * Revenue Passenger Kilometres for one flight.
 * @param {number} passengers @param {number} distanceKm @returns {number}
 */
export function rpk(passengers, distanceKm) {
  assertNonNegativeInt(passengers, 'passengers');
  assertNonNegativeInt(distanceKm, 'distanceKm');
  return passengers * distanceKm;
}

/**
 * Cargo Tonne Kilometres — the freight analogue of RPK. Freight is a
 * real revenue stream on passenger aircraft and must be able to carry
 * its own share of cost.
 * @param {number} tonnes @param {number} distanceKm @returns {number}
 */
export function ctk(tonnes, distanceKm) {
  if (!Number.isFinite(tonnes) || tonnes < 0) throw new MoneyError('tonnes must be >= 0', 'METRIC_BAD_TONNES');
  assertNonNegativeInt(distanceKm, 'distanceKm');
  return Math.round(tonnes * 1000) * distanceKm / 1000;
}

/**
 * Passenger Load Factor, expressed in parts-per-million so it is an
 * integer and can be stored, compared and aggregated without float drift.
 * Returns ppm: 850_000 = 85.00%.
 * @param {number} seatsOffered @param {number} passengers @param {number} distanceKm
 * @returns {number}
 */
export function loadFactorPpm(seatsOffered, passengers, distanceKm) {
  const a = ask(seatsOffered, distanceKm);
  const r = rpk(passengers, distanceKm);
  if (a === 0) return 0;
  return Math.floor((r / a) * 1_000_000 + 0.5);
}

/**
 * CASK — cost per available seat kilometre, in integer microcents.
 *
 * Returned in microcents (cents x 10,000) rather than cents because a
 * long-haul flight spreads cost over hundreds of millions of ASK; a
 * plain cents figure would round to zero and destroy the signal.
 * Microcents are still an exact integer.
 *
 * @param {number} operatingCostCents @param {number} asks @returns {number}
 */
export function caskMicrocents(operatingCostCents, asks) {
  if (!Number.isSafeInteger(operatingCostCents)) throw new MoneyError('cost must be integer cents', 'METRIC_BAD_COST');
  assertNonNegativeInt(asks, 'asks');
  if (asks === 0) return 0;
  // cost cents * 1e4 -> microcents, then per ASK
  return Math.floor((operatingCostCents * 1_000_000) / asks + 0.5);
}

/**
 * RASK — revenue per available seat kilometre, same units as cask.
 * @param {number} revenueCents @param {number} asks @returns {number}
 */
export function raskMicrocents(revenueCents, asks) {
  if (!Number.isSafeInteger(revenueCents)) throw new MoneyError('revenue must be integer cents', 'METRIC_BAD_REVENUE');
  assertNonNegativeInt(asks, 'asks');
  if (asks === 0) return 0;
  return Math.floor((revenueCents * 1_000_000) / asks + 0.5);
}

/**
 * Break-even load factor in ppm: the load factor at which the flight
 * exactly covers cost. If this exceeds the achievable load factor for
 * the route, the flight is structurally loss-making and the route
 * should be re-priced, re-fleeted or dropped.
 *
 *   breakEvenLF = CASK / RASK = cost/ASK / (revenue/ASK) = cost/revenue
 *
 * @param {number} operatingCostCents @param {number} revenueCents
 * @returns {number} ppm
 */
export function breakEvenLoadFactorPpm(operatingCostCents, revenueCents) {
  if (!Number.isSafeInteger(operatingCostCents) || !Number.isSafeInteger(revenueCents)) {
    throw new MoneyError('cost and revenue must be integer cents', 'METRIC_BAD_INPUT');
  }
  if (revenueCents === 0) return Number.MAX_SAFE_INTEGER; // never breaks even
  return Math.floor((operatingCostCents / revenueCents) * 1_000_000 + 0.5);
}

/**
 * Full metric bundle for one flight.
 * @param {FlightInput} f
 */
export function flightMetrics(f) {
  const seats = f.seatsOffered ?? 0;
  const pax = f.passengers ?? 0;
  const a = ask(seats, f.distanceKm);
  const r = rpk(pax, f.distanceKm);
  const revenue = f.revenueCents ?? 0;
  const cost = f.operatingCostCents ?? 0;

  if (pax > seats) {
    throw new MoneyError(
      `Passengers (${pax}) exceed seats offered (${seats}) — load factor cannot exceed 100%`,
      'METRIC_OVERBOOKED',
    );
  }

  return {
    asks: a,
    rpks: r,
    loadFactorPpm: loadFactorPpm(seats, pax, f.distanceKm),
    revenueCents: revenue,
    operatingCostCents: cost,
    contributionCents: revenue - cost,
    caskMicrocents: caskMicrocents(cost, a),
    raskMicrocents: raskMicrocents(revenue, a),
    breakEvenLoadFactorPpm: breakEvenLoadFactorPpm(cost, revenue),
    marginPpm: revenue === 0 ? 0 : Math.floor(((revenue - cost) / revenue) * 1_000_000 + 0.5),
  };
}

/**
 * Roll flights up into a route, fleet-type or period aggregate.
 * Aggregation of ratios is deliberately NOT the average of the parts —
 * it is always recomputed from the summed numerators and denominators.
 * Averaging per-flight load factors is a classic modelling error: it
 * weights a short hop equally with a long haul.
 *
 * @param {Array<FlightInput>} flights
 */
export function rollUp(flights) {
  const totals = flights.reduce(
    /** @returns {RollUpTotals} */
    (acc, f) => {
      const m = flightMetrics(f);
      acc.asks += m.asks;
      acc.rpks += m.rpks;
      acc.revenueCents += m.revenueCents;
      acc.operatingCostCents += m.operatingCostCents;
      acc.seatsOffered += f.seatsOffered ?? 0;
      acc.passengers += f.passengers ?? 0;
      acc.blockHoursMilli += Math.round((f.blockHours ?? 0) * 1000);
      acc.distanceKm += f.distanceKm;
      acc.sectors += 1;
      return acc;
    },
    /** @type {RollUpTotals} */ ({
      asks: 0, rpks: 0, revenueCents: 0, operatingCostCents: 0,
      seatsOffered: 0, passengers: 0, blockHoursMilli: 0, distanceKm: 0, sectors: 0,
    }),
  );

  return {
    ...totals,
    loadFactorPpm: totals.asks === 0 ? 0 : Math.floor((totals.rpks / totals.asks) * 1_000_000 + 0.5),
    caskMicrocents: caskMicrocents(totals.operatingCostCents, totals.asks),
    raskMicrocents: raskMicrocents(totals.revenueCents, totals.asks),
    breakEvenLoadFactorPpm: breakEvenLoadFactorPpm(totals.operatingCostCents, totals.revenueCents),
    contributionCents: totals.revenueCents - totals.operatingCostCents,
    // Utilisation: block hours per aircraft per day. Core KPI.
    blockHours: totals.blockHoursMilli / 1000,
  };
}

/**
 * Aircraft utilisation — block hours per aircraft-day. The single
 * strongest driver of unit cost in the industry: an aircraft sitting on
 * the ground earns nothing and still burns money.
 * @param {number} blockHours @param {number} aircraftDays @returns {number} hours/day, milli-precision
 */
export function utilisationMilli(blockHours, aircraftDays) {
  if (aircraftDays <= 0) return 0;
  return Math.floor((blockHours / aircraftDays) * 1000 + 0.5);
}

/** @param {number} v @param {string} what */
function assertNonNegativeInt(v, what) {
  if (!Number.isInteger(v) || v < 0) {
    throw new MoneyError(`${what} must be a non-negative integer; received ${v}`, 'METRIC_BAD_INPUT');
  }
}
