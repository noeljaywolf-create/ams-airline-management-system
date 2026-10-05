/**
 * AMS — Costing engine. THE SPINE OF THE PLATFORM.
 *
 * Every other module hangs off this one. Fuel, fleet, crew allocation,
 * route profitability, break-even decisions, executive reporting and
 * the budget all reconcile through the arithmetic in this file.
 *
 * The central idea: an airline cannot answer "what did this flight
 * cost?" by looking at invoices. Invoices arrive weeks later, at
 * monthly or quarterly grain, aggregated across hundreds of rotations.
 * By the time finance sees the Jet A invoice, the aircraft that burned
 * it has flown 300 more sectors.
 *
 * AMS inverts this. Cost is ATTRIBUTED to the flight at the moment it
 * happens, from primary records — the fuel uplift note, the crew duty
 * report, the landing fee receipt, the component removal record — and
 * the accounting ledger is then a roll-up of already-attributed facts
 * rather than a separate exercise in guessing.
 *
 * Cost falls into two structural buckets:
 *
 *   FLIGHT-ATTRIBUTABLE  varies directly with flying this sector:
 *                       fuel, duty crew, landing fees, handling, catering.
 *                       Known on the day of flight.
 *
 *   FLEET-FIXED         fixed for the period regardless of whether a
 *                       particular aircraft flies:
 *                       lease, insurance, spares holding, admin crew,
 *                       distribution. Allocated to flights by an
 *                       explicit driver — never by accident.
 *
 * The distinction is not accounting pedantry. It determines whether a
 * route is viable at all. A long-haul sector might have a marginal
 * fuel cost of $4,800 and a full cost of $19,000; pricing to marginal
 * cost fills the plane but loses money, and pricing to full cost loses
 * the traffic. Both numbers must exist.
 *
 * @module costing
 */

import { allocate, assertReconciles, MoneyError, sum } from './money.js';
import { flightMetrics } from './metrics.js';
import {
  ALLOCATION_DRIVERS,
  FLIGHT_ATTRIBUTABLE_CATEGORIES,
  FLEET_FIXED_CATEGORIES,
  PERIOD_CATEGORIES,
} from './domain.js';

const FLIGHT_ATTR = new Set(FLIGHT_ATTRIBUTABLE_CATEGORIES);
const FLEET_FIXED = new Set(FLEET_FIXED_CATEGORIES);
const PERIOD = new Set(PERIOD_CATEGORIES);

/**
 * @typedef {Object} FlightCostInput
 * @property {number} [fuelKg]                Fuel burned this sector
 * @property {number} [fuelPriceCentsPerKg]  Realised price per kg (uplift price)
 * @property {number} [fuelPlannedKg]        Planning figure, for variance
 * @property {number} [flightCrewCents]
 * @property {number} [cabinCrewCents]
 * @property {number} [crewTrainingCents]
 * @property {number} [maintenanceDirectCents]
 * @property {number} [maintenanceReserveCents]  Provision per block hour
 * @property {number} [airportChargesCents]      Landing, parking, pax service
 * @property {number} [navigationCents]          RNAV / en-route
 * @property {number} [cateringCents]
 * @property {number} [handlingCents]
 * @property {number} [deIcingCents]
 * @property {number} [blockHours]
 * @property {number} [seatsOffered]
 * @property {number} [passengers]
 * @property {number} distanceKm
 */

/**
 * Build the flight-attributable cost of one sector from primary
 * operational records.
 *
 * @param {FlightCostInput} input
 * @returns {{ lines: Record<string, number>, totalCents: number, byCategory: Record<string, number> }}
 */
export function buildFlightCost(input) {
  if (!Number.isInteger(input.distanceKm) || input.distanceKm < 0) {
    throw new MoneyError('distanceKm must be a non-negative integer', 'COST_BAD_DISTANCE');
  }

const fuelKg = input.fuelKg ?? 0;
  const fuelPricePerKg = intOr(input.fuelPriceCentsPerKg, 0, 'fuelPriceCentsPerKg');
  if (fuelKg < 0) throw new MoneyError('fuelKg cannot be negative', 'COST_NEGATIVE_FUEL');

  // Fuel is the classic integer-arithmetic trap. fuelKg x priceCentsPerKg
  // is fractional. We must round ONCE, here, at the point the fact is
  // created — not per-line later, and never by float.
  const fuelCents = Math.round(fuelKg * fuelPricePerKg);
  if (!Number.isSafeInteger(fuelCents)) {
    throw new MoneyError('Fuel cost overflow — split the uplift across delivery notes', 'COST_FUEL_OVERFLOW');
  }

  /** @type {Record<string, number>} */
  const lines = {
    fuel: fuelCents,
    crew_flight: intOr(input.flightCrewCents, 0, 'flightCrewCents'),
    crew_cabin: intOr(input.cabinCrewCents, 0, 'cabinCrewCents'),
    crew_training: intOr(input.crewTrainingCents, 0, 'crewTrainingCents'),
    maintenance_direct: intOr(input.maintenanceDirectCents, 0, 'maintenanceDirectCents'),
    maintenance_reserve: intOr(input.maintenanceReserveCents, 0, 'maintenanceReserveCents'),
    airport_charges: intOr(input.airportChargesCents, 0, 'airportChargesCents'),
    navigation_charges: intOr(input.navigationCents, 0, 'navigationCents'),
    catering: intOr(input.cateringCents, 0, 'cateringCents'),
    handling: intOr(input.handlingCents, 0, 'handlingCents'),
    de_icing: intOr(input.deIcingCents, 0, 'deIcingCents'),
  };

  // Categorise and total. An unrecognised category is an error, not a
  // silent drop — silent drops in a costing engine become unreconciled
  // variances that nobody can find months later.
  /** @type {Record<string, number>} */
  const byCategory = { FLIGHT_ATTRIBUTABLE: 0, FLEET_FIXED: 0, PERIOD: 0, UNKNOWN: 0 };
  for (const [category, amount] of Object.entries(lines)) {
    if (FLIGHT_ATTR.has(category)) byCategory.FLIGHT_ATTRIBUTABLE += amount;
    else if (FLEET_FIXED.has(category)) byCategory.FLEET_FIXED += amount;
    else if (PERIOD.has(category)) byCategory.PERIOD += amount;
    else byCategory.UNKNOWN += amount;
  }

  if (byCategory.UNKNOWN !== 0) {
    throw new MoneyError(
      `Cost build contains ${byCategory.UNKNOWN} cents of unrecognised cost categories`,
      'COST_UNKNOWN_CATEGORY',
    );
  }

  return {
    lines,
    byCategory,
    totalCents: sum(...Object.values(lines)),
  };
}

/**
 * Allocate a pool of fleet-fixed cost across flights using an explicit
 * driver. The allocation is EXACT: the parts sum to the pool, to the
 * cent, with no rounding leakage.
 *
 * @param {Object} params
 * @param {number} params.poolCents        Total fleet-fixed cost for the period
 * @param {Array<{distanceKm:number, blockHours?:number, seatsOffered?:number, sectors?:number}>} params.flights
 * @param {string} [params.driver]         One of ALLOCATION_DRIVERS
 * @returns {{ allocations: number[], driver: string, totalCents: number }}
 */
export function allocateFleetFixed({ poolCents, flights, driver = 'BLOCK_HOURS' }) {
  if (!ALLOCATION_DRIVERS.includes(driver)) {
    throw new MoneyError(`Unknown allocation driver "${driver}"`, 'COST_BAD_DRIVER');
  }
  if (!Number.isSafeInteger(poolCents)) {
    throw new MoneyError('poolCents must be integer cents', 'COST_BAD_POOL');
  }
  if (flights.length === 0) {
    if (poolCents !== 0) throw new MoneyError('Non-zero pool across zero flights', 'COST_NO_FLIGHTS');
    return { allocations: [], driver, totalCents: 0 };
  }

  if (driver === 'DIRECT') {
    // Caller already attributed these; nothing to spread.
    return { allocations: flights.map(() => 0), driver, totalCents: 0 };
  }

  const weights = flights.map((f) => {
    switch (driver) {
      case 'BLOCK_HOURS': return f.blockHours ?? 0;
      case 'ASKS': return (f.seatsOffered ?? 0) * f.distanceKm;
      case 'SECTORS': return f.sectors ?? 1;
      case 'DISTANCE_KM': return f.distanceKm;
      case 'FLIGHTS': return 1;
      default: throw new MoneyError(`Unhandled driver "${driver}"`, 'COST_BAD_DRIVER');
    }
  });

  const allocations = allocate(poolCents, weights);
  // Self-check. If this ever throws, a rounding rule was changed and
  // the whole costing model needs re-verification.
  assertReconciles(allocations, poolCents, `fleet-fixed allocation (${driver})`);
  return { allocations, driver, totalCents: sum(...allocations) };
}

/**
 * Full profit-and-loss for a single flight, combining attributed cost,
 * allocated fleet-fixed cost and revenue.
 *
 * @param {Object} params
 * @param {FlightCostInput} params.costInput
 * @param {Array<{ cost: number, category: string }>} params.fleetFixedLines
 *        Pre-allocated fleet-fixed cost for this flight, by category.
 * @param {number} params.revenueCents
 * @param {number} [params.cargoRevenueCents]
 * @param {number} [params.otherRevenueCents]  e.g. ancillary, cargo
 * @returns {object} metrics + cost breakdown + marginal vs full cost
 */
export function flightPnl({ costInput, fleetFixedLines = [], revenueCents, otherRevenueCents = 0 }) {
  const direct = buildFlightCost(costInput);
  const fixedTotal = sum(...fleetFixedLines.map((l) => l.cost));

  const fullCost = direct.totalCents + fixedTotal;
  const totalRevenue = intOr(revenueCents, 0, 'revenueCents') + intOr(otherRevenueCents, 0, 'otherRevenueCents');
  const metrics = flightMetrics({
    seatsOffered: costInput.seatsOffered ?? 0,
    passengers: costInput.passengers ?? 0,
    distanceKm: costInput.distanceKm,
    revenueCents: totalRevenue,
    operatingCostCents: fullCost,
  });

return {
    ...metrics,
    // Physical facts carried through. Without these the aggregation layer
    // cannot sum passengers, seats, distance or block hours, and any
    // passenger-level or utilisation metric computed above the flight is
    // fabricated rather than derived.
    seatsOffered: costInput.seatsOffered ?? 0,
    passengers: costInput.passengers ?? 0,
    distanceKm: costInput.distanceKm,
    blockHours: costInput.blockHours ?? 0,

    revenueCents: totalRevenue,
    directCostCents: direct.totalCents,
    fleetFixedCostCents: fixedTotal,
    fullCostCents: fullCost,
    contributionCents: totalRevenue - fullCost,

    // Marginal cost = what an EXTRA passenger actually costs the airline:
    // incremental fuel and baggage weight. Landing fees, handling and
    // catering do not move because one more person boarded.
    marginalCostOfExtraSeatCents:
      estimateMarginalSeatCost(costInput),

    // Revenue needed to cover full cost at the CURRENT load factor.
    breakEvenRevenueCents: fullCost,

    lines: direct.lines,
    fleetFixedLines,
  };
}

/**
 * Estimate the incremental cost of carrying one more passenger.
 * Driven by fuel burn per kg of payload and typical all-up passenger
 * weight (passenger + baggage), plus per-passenger service cost that
 * genuinely scales (a tray is a tray whether the seat is full).
 *
 * @param {FlightCostInput} input
 * @returns {number} cents
 */
export function estimateMarginalSeatCost(input) {
  const PASSENGER_ALL_UP_KG = 100;     // ~75 kg person + ~25 kg baggage
  const BURN_KG_PER_KG_PAYLOAD = 0.030; // ~3.0% of payload as incremental fuel
  const fuelPricePerKg = input.fuelPriceCentsPerKg ?? 0;
  const fuel = Math.round(PASSENGER_ALL_UP_KG * BURN_KG_PER_KG_PAYLOAD * fuelPricePerKg);
  // Onboard service scales with passengers served.
  const service = input.seatsOffered && input.seatsOffered > 0
    ? Math.round(((input.cateringCents ?? 0) + (input.handlingCents ?? 0)) / input.seatsOffered)
    : 0;
  return fuel + service;
}

/**
 * Aggregate many flights into a route / fleet-type / period P&L.
 * Ratios are recomputed from summed numerators and denominators, never
 * averaged from per-flight ratios.
 *
 * @param {Array<ReturnType<typeof flightPnl>>} flightPnls
 */
export function aggregatePnl(flightPnls) {
  if (flightPnls.length === 0) {
    return {
      flights: 0, asks: 0, rpks: 0, revenueCents: 0,
      directCostCents: 0, fleetFixedCostCents: 0, fullCostCents: 0,
      contributionCents: 0, loadFactorPpm: 0, caskMicrocents: 0, raskMicrocents: 0,
      breakEvenLoadFactorPpm: 0, seatsOffered: 0, passengers: 0, distanceKm: 0,
      blockHoursMilli: 0, marginalSeatCostCents: 0,
    };
  }
  const t = flightPnls.reduce(
    (a, f) => ({
      flights: a.flights + 1,
      asks: a.asks + f.asks,
      rpks: a.rpks + f.rpks,
      revenueCents: a.revenueCents + f.revenueCents,
      directCostCents: a.directCostCents + f.directCostCents,
      fleetFixedCostCents: a.fleetFixedCostCents + f.fleetFixedCostCents,
      fullCostCents: a.fullCostCents + f.fullCostCents,
      seatsOffered: a.seatsOffered + (f.seatsOffered ?? 0),
      passengers: a.passengers + (f.passengers ?? 0),
      distanceKm: a.distanceKm + (f.distanceKm ?? 0),
      blockHoursMilli: a.blockHoursMilli + Math.round((f.blockHours ?? 0) * 1000),
      // Mean marginal seat cost across the aggregation, in integer cents.
      // Carried because the break-even passenger gap is ONLY computable
      // from the airline's real marginal cost, not from a constant.
      marginalSeatCostCents: a.marginalSeatCostCents + (f.marginalCostOfExtraSeatCents ?? 0),
    }),
    {
      flights: 0, asks: 0, rpks: 0, revenueCents: 0,
      directCostCents: 0, fleetFixedCostCents: 0, fullCostCents: 0,
      seatsOffered: 0, passengers: 0, distanceKm: 0, blockHoursMilli: 0,
      marginalSeatCostCents: 0,
    },
  );

  assertReconciles([t.directCostCents, t.fleetFixedCostCents], t.fullCostCents, 'aggregate flight cost');

  const meanMarginalSeatCostCents = t.flights === 0
    ? 0
    : Math.round(t.marginalSeatCostCents / t.flights);

  return {
    ...t,
    marginalSeatCostCents: meanMarginalSeatCostCents,
    blockHours: t.blockHoursMilli / 1000,
    contributionCents: t.revenueCents - t.fullCostCents,
    loadFactorPpm: t.asks === 0 ? 0 : Math.floor((t.rpks / t.asks) * 1_000_000 + 0.5),
    caskMicrocents: t.asks === 0 ? 0 : Math.floor((t.fullCostCents * 1_000_000) / t.asks + 0.5),
    raskMicrocents: t.asks === 0 ? 0 : Math.floor((t.revenueCents * 1_000_000) / t.asks + 0.5),
    breakEvenLoadFactorPpm: t.revenueCents === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.floor((t.fullCostCents / t.revenueCents) * 1_000_000 + 0.5),
  };
}

/**
 * Route viability verdict. This is the function a commercial manager
 * actually wants and cannot get out of a general ledger.
 *
 * @param {ReturnType<typeof aggregatePnl>} agg
 * @param {{ targetLoadFactorPpm?: number }} [options]
 */
export function routeVerdict(agg, { targetLoadFactorPpm = 750_000 } = {}) {
  const marginPpm = agg.revenueCents === 0 ? 0
    : Math.floor((agg.contributionCents / agg.revenueCents) * 1_000_000 + 0.5);

  /**
   * Note on taxonomy. Because full cost per flight is modelled as
   * load-independent, "negative contribution" and "requires more than
   * 100% load factor to break even" are the same condition. An earlier
   * version exposed both as separate verdicts, which made one of them
   * unreachable. They are now separated cleanly: `verdict` describes the
   * money, and `structurallyImpossible` describes the achievability.
   */
  const structurallyImpossible = agg.breakEvenLoadFactorPpm > 1_000_000;

  let verdict;
  if (agg.flights === 0) verdict = 'NO_DATA';
  else if (agg.contributionCents < 0) verdict = 'LOSS_MAKING';
  else if (agg.loadFactorPpm < targetLoadFactorPpm) verdict = 'MARGINAL';
  else verdict = 'PROFITABLE';

  return {
    verdict,
    structurallyImpossible,
    marginPpm,
    /** Exact arithmetic from real revenue-per-pax and real marginal cost. */
    breakEven: breakEvenPassengers(agg),
    /**
     * Both levers, in comparable ppm units, so a manager can see whether
     * the problem is commercial (load factor) or operational (unit cost).
     */
    levers: {
      requiredLoadFactorPpm: agg.breakEvenLoadFactorPpm,
      currentLoadFactorPpm: agg.loadFactorPpm,
      loadFactorGapPpm: agg.loadFactorPpm - agg.breakEvenLoadFactorPpm,
      /** Break-even CASK equals RASK. */
      requiredCaskMicrocents: agg.raskMicrocents,
      currentCaskMicrocents: agg.caskMicrocents,
      /** Positive headroom: room for CASK to rise before the route dies. */
      caskHeadroomMicrocents: agg.raskMicrocents - agg.caskMicrocents,
    },
  };
}

/**
 * How many additional passengers per flight are needed to reach
 * break-even.
 *
 * The arithmetic is exact and uses only real inputs:
 *
 *   contribution per extra passenger = revenue per passenger − marginal cost
 *
 * If that is positive, additional passengers CLOSE the gap and the answer
 * is the per-flight loss divided by it. If it is negative — the airline is
 * paying more to carry a passenger than that passenger earns — adding
 * passengers makes the loss WORSE, and the honest answer is that the gap
 * cannot be closed by load factor at all.
 *
 * An earlier version of this function multiplied by zero and fell back to
 * a hardcoded US$120 fare, so it returned a number derived from nothing.
 * A magic constant here produces a confidently wrong number to a manager
 * deciding a route's future.
 *
 * @param {ReturnType<typeof aggregatePnl>} agg
 * @returns {{ additionalPassengersPerFlight: number, closeableByLoadFactor: boolean, revenuePerPassengerCents: number, contributionPerPassengerCents: number }}
 */
function breakEvenPassengers(agg) {
  const flights = agg.flights || 1;
  const passengers = agg.passengers || 0;

  const revenuePerPassengerCents = passengers > 0
    ? Math.round(agg.revenueCents / passengers)
    : 0;
  const marginalCostCents = agg.marginalSeatCostCents ?? 0;
  const contributionPerPassengerCents = revenuePerPassengerCents - marginalCostCents;

  const perFlightLoss = Math.max(0, -agg.contributionCents) / flights;
  if (perFlightLoss === 0) {
    return {
      additionalPassengersPerFlight: 0,
      closeableByLoadFactor: true,
      revenuePerPassengerCents,
      contributionPerPassengerCents,
    };
  }

  // Carrying a passenger costs more than they pay. More load does not
  // fix this; the route needs re-pricing, a fleet change or withdrawal.
  if (contributionPerPassengerCents <= 0) {
    return {
      additionalPassengersPerFlight: Number.MAX_SAFE_INTEGER,
      closeableByLoadFactor: false,
      revenuePerPassengerCents,
      contributionPerPassengerCents,
    };
  }

  return {
    additionalPassengersPerFlight: Math.ceil(perFlightLoss / contributionPerPassengerCents),
    closeableByLoadFactor: true,
    revenuePerPassengerCents,
    contributionPerPassengerCents,
  };
}

/**
 * Coerce an optional monetary input to integer cents, defaulting to zero.
 * Rejects fractional cents loudly — a float arriving from upstream is a
 * bug, and rounding it silently would propagate the drift.
 * @param {number | null | undefined} v
 * @param {string} what
 * @param {number} fallback
 * @returns {number}
 */
function intOr(v, fallback, what) {
  if (v === undefined || v === null) return fallback;
  if (!Number.isSafeInteger(v)) {
    throw new MoneyError(`${what} must be integer cents; received ${v}`, 'COST_NOT_INTEGER_CENTS');
  }
  return v;
}
