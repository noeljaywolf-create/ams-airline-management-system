/**
 * AMS — Fuel management and burn variance.
 *
 * Fuel is typically 25-35% of an airline's operating cost and is the
 * single largest lever on unit economics. A 2% saving on fuel equals
 * roughly 60 basis points of CASK, which is a strategic margin in a
 * low-margin market. It is also the one cost an airline does not
 * control, cannot renegotiate, and consumes before it earns.
 *
 * Three things a finance system must get right about fuel:
 *
 * 1. UPLIFT IS NOT BURN. The aircraft leaves with uplifted litres and
 *    lands with reserves (taxi, trip fuel, contingency, alternate,
 *    final reserve, and ETOPS reserve where applicable). Costing the
 *    whole uplift to the flight overstates the flight and understates
 *    the next one. AMS reconciles uplift-to-burn explicitly and carries
 *    the landing reserve forward.
 *
 * 2. PLANNED BURN IS NOT ACTUAL BURN. The crew files a plan derived
 *    from route, weight, weather and winds. Actual burn comes from the
 *    aircraft. The variance between them is the single most useful
 *    operational-financial metric an airline produces, because it
 *    isolates crew technique, routing efficiency and weight discipline
 *    from the fuel price, which is pure market risk.
 *
 * 3. CARRYING FUEL HAS AN OPPORTUNITY COST. Tankering — deliberately
 *    carrying extra fuel — trades deadweight (which burns fuel and
 *    costs payload) against the risk of paying a diversion penalty or
 *    buying fuel at an expensive alternate. That is a calculable
 *    trade, and AMS calculates it rather than leaving it to habit.
 *
 * @module fuel
 */

import { MoneyError } from './money.js';

/**
 * @typedef {Object} FuelPlan
 * @property {number} taxiFuelKg
 * @property {number} tripFuelKg
 * @property {number} contingencyKg
 * @property {number} alternateKg
 * @property {number} finalReserveKg   Regulatory minimum landing reserve
 * @property {number} [etopsReserveKg] Only on ETOPS routes
 * @property {number} upliftKg         Total taken on board
 * @property {number} priceCentsPerKg  Realised uplift price
 */

/**
 * @typedef {Object} FuelBurn
 * @property {number} upliftKg
 * @property {number} takeoffFuelKg   Fuel on board at brake release
 * @property {number} landingFuelKg   Fuel remaining at touchdown
 */

/**
 * Reconcile the fuel plan against the actual flight.
 *
 * @param {FuelPlan} plan
 * @param {FuelBurn} actual
 */
export function reconcileFuel(plan, actual) {
  const reserves = plan.taxiFuelKg + plan.contingencyKg + plan.alternateKg
    + plan.finalReserveKg + (plan.etopsReserveKg ?? 0);

  const burnable = plan.taxiFuelKg + plan.tripFuelKg + plan.contingencyKg;
  const actualBurn = actual.takeoffFuelKg - actual.landingFuelKg;

  const planBurn = plan.taxiFuelKg + plan.tripFuelKg;
  const varianceKg = actualBurn - planBurn;
  const variancePpm = planBurn === 0 ? 0
    : Math.floor((varianceKg / planBurn) * 1_000_000 + 0.5);

  const expectedLanding = plan.upliftKg - burnable;

  return {
    reservesKg: reserves,
    reservesMeetRegulatoryMinimum: expectedLanding >= reserves,
    plannedBurnKg: planBurn,
    actualBurnKg: actualBurn,
    varianceKg,
    variancePpm,
    /** Positive variance is bad: more than planned was burned. */
    varianceDirection: varianceKg > 0 ? 'OVER' : varianceKg < 0 ? 'UNDER' : 'ON_PLAN',
    expectedLandingFuelKg: expectedLanding,
    actualLandingFuelKg: actual.landingFuelKg,
    landingReserveVarianceKg: actual.landingFuelKg - expectedLanding,
    costCents: Math.round(actualBurn * plan.priceCentsPerKg),
    /** Cost of the variance alone — this is what management can influence. */
    varianceCostCents: Math.round(varianceKg * plan.priceCentsPerKg),
  };
}

/**
 * Optimal uplift quantity: never uplift more than the flight needs
 * plus a documented commercial reason, because every extra kilogram
 * is burned on the next sectors for the rest of the rotation.
 *
 * AMS computes required uplift and, separately, the tankering
 * recommendation with its opportunity cost, so the decision is
 * explicit and recorded rather than implicit in habit.
 *
 * @param {FuelPlan} plan
 * @param {Object} ctx
/**
  * @param {FuelPlan} plan
  * @param {Object} ctx
  * @param {number} ctx.costOfDiversionCents      Diversion penalty avoided if it happens
  * @param {number} ctx.fuelPriceAtAlternateCentsPerKg  Price if diverted
  * @param {number} ctx.fuelPriceHereCentsPerKg   Price at the departure station
  * @param {number} [ctx.expectedBurnVariancePpm] Empirically observed variance
  * @param {number} [ctx.deadweightBurnFactor]    kg fuel per kg payload carried
  * @param {number} [ctx.probabilityOfDiversion]  Default 0.02
  * @param {number} [ctx.remainingSectors]        Sectors left in the rotation
  */
export function optimalUplift(plan, ctx) {
  const requiredWithContingency =
    plan.taxiFuelKg + plan.tripFuelKg + plan.contingencyKg + plan.alternateKg
    + plan.finalReserveKg + (plan.etopsReserveKg ?? 0);

  // Apply empirically observed variance so the aircraft is never
  // dispatched below regulatory reserve because the crew flew well
  // last time.
  const bufferPpm = ctx.expectedBurnVariancePpm ?? 30_000; // default +3%
  const buffered = Math.ceil((requiredWithContingency * (1_000_000 + bufferPpm)) / 1_000_000);

  // Tankering economics.
  //
  // The naive formulation — "carrying fuel is worth what fuel costs at
  // the alternate" — makes tankering look free, because it ignores the
  // two costs that actually matter:
  //
  //   1. Diversion only HAPPENS sometimes. The value of carrying
  //      contingency fuel is the EXPECTED cost avoided, so it is scaled
  //      by the probability of a diversion, not the gross cost of one.
  //   2. Carrying fuel is not free. It burns on every remaining sector
  //      of the rotation, and it may displace fuel you could otherwise
  //      uplift cheaply at the next station.
  //
  // Getting this wrong in either direction is expensive and it is a
  // decision made thousands of times a year, so AMS calculates it.
  const deadweightBurnFactor = ctx.deadweightBurnFactor ?? 0.030; // kg fuel per kg payload
  const probabilityOfDiversion = ctx.probabilityOfDiversion ?? 0.02;
  const remainingSectors = ctx.remainingSectors ?? 3;

  // What a diversion would cost if it happened: the operational penalty
  // plus buying replacement fuel at the alternate.
  const costIfDivertedCents =
    ctx.costOfDiversionCents + ctx.fuelPriceAtAlternateCentsPerKg * plan.alternateKg;
  const expectedSavingCents = Math.round(probabilityOfDiversion * costIfDivertedCents);

  // What carrying the contingency fuel costs: the fuel itself, plus the
  // additional fuel burned hauling it on every remaining sector.
  const carryingCostCents = Math.round(
    plan.contingencyKg * ctx.fuelPriceHereCentsPerKg
    * (1 + deadweightBurnFactor * remainingSectors),
  );

  const shouldTanker = expectedSavingCents > carryingCostCents;

  return {
    requiredUpliftKg: requiredWithContingency,
    recommendedUpliftKg: shouldTanker ? buffered + plan.contingencyKg : buffered,
    bufferPpm,
    tankering: {
      shouldTanker,
      expectedSavingCents,
      carryingCostCents,
      netBenefitCents: expectedSavingCents - carryingCostCents,
      probabilityOfDiversion,
      rationale: shouldTanker
        ? `Expected cost of diverting (${expectedSavingCents}c) exceeds the cost of carrying (${carryingCostCents}c)`
        : `Cheaper to uplift at the destination than to carry the weight (${carryingCostCents}c)`,
    },
  };
}

/**
 * Fuel consumed per flight-hour and per ASK — the operational metric
 * that management actually manages week to week.
 *
 * @param {number} totalFuelKg
 * @param {number} blockHours
 * @param {number} asks
 */
export function fuelEfficiency(totalFuelKg, blockHours, asks) {
  if (blockHours <= 0 || asks <= 0) {
    throw new MoneyError('blockHours and asks must both be positive', 'FUEL_DIV_ZERO');
  }
  return {
    kgPerBlockHourMilli: Math.floor((totalFuelKg / blockHours) * 1000 + 0.5),
    // grams per ASK, the standard industry fuel efficiency unit
    gramsPerAskMilli: Math.floor((totalFuelKg * 1000 / asks) * 1000 + 0.5),
  };
}

/**
 * Rolling burn-variance detection across the fleet.
 *
 * A single flight's variance is noise. A consistent negative variance
 * across a fleet type means either the route distance database is
 * wrong (a real and common finding) or fuel is being mis-recorded at
 * uplift. Either way it is worth tens of thousands per year, and it is
 * invisible in a monthly P&L because it is buried in a fuel line.
 *
 * @param {number[]} variancePpmSeries
 * @param {{ window?: number, zThreshold?: number }} [opts]
 */
export function detectBurnVarianceAnomaly(variancePpmSeries, { window = 30, zThreshold = 2.5 } = {}) {
  if (variancePpmSeries.length < window) {
    return { status: 'INSUFFICIENT_DATA', sampleSize: variancePpmSeries.length };
  }

  const n = variancePpmSeries.length;
  const mean = variancePpmSeries.reduce((a, b) => a + b, 0) / n;
  const variance = variancePpmSeries.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  if (stdev === 0) {
    return { status: 'STABLE', meanPpm: Math.round(mean), stdev: 0, anomalies: [] };
  }

  /** @type {{index:number, value:number, zScore:number}[]} */
  const anomalies = [];
  variancePpmSeries.forEach((value, index) => {
    const z = (value - mean) / stdev;
    // zThreshold is expressed in whole sigma. Default 2.5 flags a point
    // roughly two orders of magnitude into the tail of the distribution,
    // which is where a genuine recording or planning fault lives.
    if (Math.abs(z) >= zThreshold) {
      anomalies.push({ index, value, zScore: Math.floor(z * 100) / 100 });
    }
  });

  return {
    status: anomalies.length === 0 ? 'STABLE' : 'ANOMALY_DETECTED',
    sampleSize: n,
    meanPpm: Math.round(mean),
    stdevMilli: Math.floor(stdev * 1000),
    anomalies,
    interpretation: mean < -20_000
      ? 'Fleet is consistently beating plan — verify distance data is not overstated'
      : mean > 40_000
        ? 'Fleet is consistently over plan — investigate routing, weight discipline, or uplift recording'
        : 'Burn performance within expected range',
  };
}
