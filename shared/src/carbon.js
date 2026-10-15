/**
 * AMS — Carbon compliance and emissions accounting.
 *
 * This module exists because carbon is no longer a reporting nicety.
 * It is a balance-sheet item.
 *
 * The two regimes in force:
 *
 * CORSIA (ICAO) — the global Carbon Offsetting and Reduction Scheme for
 *   International Aviation. Operators above 10,000 tonnes CO2/year on
 *   international flights, flying aircraft of at least 5,700 kg MTOM,
 *   must monitor, report and verify (MRV) every international flight.
 *   Offsetting obligations began 2021, reconciled on three-year
 *   compliance periods: 2021-23, 2024-26, 2027-29, 2030-32, 2033-35.
 *   New entrants are exempt for three years or until their emissions
 *   reach 0.1% of total 2020 international CO2.
 *
 * EU ETS — aviation has been inside the Emissions Trading System since
 *   2012. Allowance prices exceeded EUR 80/tonne across 2022-23,
 *   making the annual compliance bill for a mid-size carrier run to
 *   billions of euros across the sector; for 2024-26 the ETS cost was
 *   estimated at 4-6% of annual operating cost. Scope has been extended
 *   to flights departing the EEA to destinations within 5,000 km.
 *
 * THE CRITICAL RULE: emissions must be counted ONCE. Where both
 * regimes touch a flight, CORSIA-covered emissions are deducted from
 * the EU ETS chargeable quantity. Double-counting is both a compliance
 * error and, at current allowance prices, a seven-figure mistake.
 *
 * AMS implements the deduplication explicitly because no upstream
 * library does it correctly for you.
 *
 * @module carbon
 */

import {
  CORSIA_CO2_THRESHOLD_TONNES,
  CORSIA_COMPLIANCE_PERIODS,
  CORSIA_MTOM_EXEMPTION_KG,
  CORSIA_NEW_ENTRANT_YEARS,
  EMISSION_FACTOR_JET_A1,
  EMISSION_FACTOR_JET_A,
} from './domain.js';

/** @typedef {'JET_A'|'JET_A1'} FuelType */

/**
 * Map a calendar year onto its three-year CORSIA compliance period.
 * @param {number} year @returns {string} e.g. '2024-2026'
 */
export function corsiaCompliancePeriod(year) {
  for (const period of CORSIA_COMPLIANCE_PERIODS) {
    const [start, end] = period.split('-').map(Number);
    if (year >= start && year <= end) return period;
  }
  throw new RangeError(`Year ${year} falls outside all defined CORSIA compliance periods`);
}

/**
 * Tonnes of CO2 from fuel burned.
 *
 * Uses the ICAO default emission factors. Real operators must apply
 * their own approved monitoring methods under the CORSIA MRV
 * framework; this is the defensible default and is deliberately
 * explicit about that.
 *
 * @param {number} fuelKg @param {FuelType} [fuelType]
 * @returns {number} tonnes CO2
 */
export function co2Tonnes(fuelKg, fuelType = 'JET_A1') {
  if (fuelKg < 0) throw new RangeError('fuelKg cannot be negative');
  const factor = fuelType === 'JET_A' ? EMISSION_FACTOR_JET_A : EMISSION_FACTOR_JET_A1;
  // kg CO2 -> tonnes
  return Math.round((fuelKg * factor) / 1000 * 1000) / 1000;
}

/**
 * Sustainable aviation fuel contribution. Under the EU ETS, SAF may
 * be treated with a zero emissions factor, which is the single most
 * powerful lever available to an airline's carbon bill — and the reason
 * SAF procurement deserves first-class treatment in the sourcing module.
 *
 * @param {number} fuelKg total fuel burned
 * @param {number} safKg  portion that is SAF
 * @param {FuelType} [fuelType]
 */
export function applySaf(fuelKg, safKg, fuelType = 'JET_A1') {
  if (safKg > fuelKg) throw new RangeError('SAF volume cannot exceed total fuel');
  const conventionalKg = fuelKg - safKg;
  const factor = fuelType === 'JET_A' ? EMISSION_FACTOR_JET_A : EMISSION_FACTOR_JET_A1;

  // Round ONCE, at tonne-milligram precision. Rounding at an intermediate
  // step (kg -> tens of kg -> tonnes) silently loses a third decimal place,
  // which is material when the compliance bill is multiplied by an
  // allowance price of EUR 85 per tonne.
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const conventionalTonnes = round3((conventionalKg * factor) / 1000);

  return {
    totalFuelKg: fuelKg,
    safKg,
    safSharePpm: Math.floor((safKg / fuelKg) * 1_000_000),
    conventionalCo2Tonnes: conventionalTonnes,
    safCo2Tonnes: 0,
    totalCo2Tonnes: conventionalTonnes,
    savingVsAllConventionalTonnes: round3((safKg * factor) / 1000),
  };
}

/**
 * @typedef {Object} OperatorProfile
 * @property {boolean} [isInternational]
 * @property {number} [annualInternationalCo2Tonnes]
 * @property {number} [yearFirstOperation]
 * @property {boolean} [euaOperated]  Departs or arrives in the EEA
 */

/**
 * Determine CORSIA obligations.
 * @param {OperatorProfile} profile @param {number} year
 */
export function corsiaObligation(profile, year) {
  const period = corsiaCompliancePeriod(year);

  if (profile.isInternational === false) {
    return { scheme: 'CORSIA', obligated: false, reason: 'Domestic operations only', period };
  }

  const tonnes = profile.annualInternationalCo2Tonnes ?? 0;
  if (tonnes < CORSIA_CO2_THRESHOLD_TONNES) {
    return {
      scheme: 'CORSIA',
      obligated: false,
      reason: `Annual international CO2 ${tonnes}t is below the ${CORSIA_CO2_THRESHOLD_TONNES}t threshold`,
      period,
    };
  }

  // New entrant exemption.
  const yearsOperating = year - (profile.yearFirstOperation ?? year);
  if (yearsOperating < CORSIA_NEW_ENTRANT_YEARS) {
    return {
      scheme: 'CORSIA',
      obligated: false,
      reason: `New entrant — ${yearsOperating} of ${CORSIA_NEW_ENTRANT_YEARS} years operated`,
      period,
    };
  }

  return {
    scheme: 'CORSIA',
    obligated: true,
    reason: `${tonnes}t annual international CO2 exceeds the ${CORSIA_CO2_THRESHOLD_TONNES}t threshold`,
    period,
    mrvRequired: true,
    offsettingRequired: true,
  };
}

/**
 * @typedef {Object} FlightEmissions
 * @property {number} fuelKg
 * @property {boolean} international
 * @property {boolean} corsiaCovered  Both endpoints in participating States
 * @property {boolean} eeaInvolved    Departs or arrives in the EEA
 * @property {number} mtomKg
 * @property {FuelType} [fuelType]
 * @property {number} [safKg]
 */

/**
 * Allocate one flight's emissions across regimes WITHOUT double counting.
 *
 * @param {FlightEmissions} flight
 * @param {{ euaPriceCentsPerTonne: number }} ctx
 */
export function allocateEmissions(flight, ctx) {
  const emissions = applySaf(flight.fuelKg, flight.safKg ?? 0, flight.fuelType);
  const totalTonnes = emissions.totalCo2Tonnes;
  const mtomExempt = flight.mtomKg < CORSIA_MTOM_EXEMPTION_KG;

  /** @type {Record<string, number>} */
  const allocated = { CORSIA: 0, EU_ETS: 0, UNREGULATED: 0 };
  /** @type {Record<string, number>} */
  const overlapTonnes = {};

  const corsiaEligible = flight.international && !mtomExempt;
  const etsEligible = flight.eeaInvolved;

  if (corsiaEligible && etsEligible) {
    // DEDUPLICATION: CORSIA-covered tonnes are deducted from ETS.
    // Where both apply, CORSIA is treated as satisfying the obligation,
    // consistent with the EU ETS directive's CORSIA deduction.
    allocated.CORSIA = totalTonnes;
    allocated.EU_ETS = 0;
    overlapTonnes.deductedFromETS = totalTonnes;
  } else if (corsiaEligible) {
    allocated.CORSIA = totalTonnes;
  } else if (etsEligible) {
    allocated.EU_ETS = totalTonnes;
  } else {
    allocated.UNREGULATED = totalTonnes;
  }

  const allowanceCostCents = Math.round(
    allocated.EU_ETS * ctx.euaPriceCentsPerTonne,
  );

  return {
    totalCo2Tonnes: totalTonnes,
    emissions,
    allocation: allocated,
    overlapTonnes,
    // Invariant: the parts must reconstruct the whole. Verified by the
    // property test in tests/carbon.test.js.
    allocationReconciles:
      Math.abs(
        allocated.CORSIA + allocated.EU_ETS + allocated.UNREGULATED - totalTonnes,
      ) < 1e-6,
    allowanceCostCents,
    mtomExempt,
  };
}

/**
 * Aggregate a period and estimate the compliance bill.
 *
 * @param {FlightEmissions[]} flights
 * @param {{ euaPriceCentsPerTonne: number, offsetUnitPriceCents: number }} ctx
 * @param {number} year
 */
export function complianceSummary(flights, ctx, year) {
  const period = corsiaCompliancePeriod(year);

  const totals = flights.reduce(
    (acc, f) => {
      const r = allocateEmissions(f, ctx);
      acc.totalTonnes += r.totalCo2Tonnes;
      acc.corsiaTonnes += r.allocation.CORSIA;
      acc.etsTonnes += r.allocation.EU_ETS;
      acc.etsCostCents += r.allowanceCostCents;
      acc.flights += 1;
      return acc;
    },
    { totalTonnes: 0, corsiaTonnes: 0, etsTonnes: 0, etsCostCents: 0, flights: 0 },
  );

  const internationalTonnes = flights
    .filter((f) => f.international)
    .reduce((a, f) => a + co2Tonnes(f.fuelKg, f.fuelType), 0);

  const obligation = corsiaObligation(
    {
      isInternational: internationalTonnes > 0,
      annualInternationalCo2Tonnes: Math.round(internationalTonnes),
    },
    year,
  );

  const offsettingTonnes = obligation.obligated ? totals.corsiaTonnes : 0;
  const offsettingCostCents = Math.round(offsettingTonnes * ctx.offsetUnitPriceCents);

  return {
    year,
    corsiaPeriod: period,
    flights: totals.flights,
    totalCo2Tonnes: Math.round(totals.totalTonnes * 1000) / 1000,
    corsiaTonnes: Math.round(totals.corsiaTonnes * 1000) / 1000,
    euEtsTonnes: Math.round(totals.etsTonnes * 1000) / 1000,
    euEtsCostCents: totals.etsCostCents,
    corsiaObligation: obligation,
    offsettingTonnes: Math.round(offsettingTonnes * 1000) / 1000,
    offsettingCostCents,
    totalComplianceCostCents: totals.etsCostCents + offsettingCostCents,
  };
}
