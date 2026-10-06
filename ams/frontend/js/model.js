/**
 * A computed operating picture, built once from the domain modules.
 *
 * Everything downstream of this file reads figures that came out of
 * shared/src/ — there are no hard-coded totals anywhere in the UI.
 */

import {
  flightPnl, aggregatePnl, routeVerdict, allocateFleetFixed, buildFlightCost,
} from '../../shared/src/costing.js';
import {
  fuelEfficiency, detectBurnVarianceAnomaly, reconcileFuel, optimalUplift,
} from '../../shared/src/fuel.js';
import { allocateEmissions, co2Tonnes } from '../../shared/src/carbon.js';
import { airworthinessGate } from '../../shared/src/airworthiness.js';
import { sum } from '../../shared/src/money.js';

import {
  AIRCRAFT, AIRCRAFT_STATE, BUDGET_LINES, DEFERRALS, DIRECTIVES,
  FLEET_FIXED, ROUTES, TARGET_LOAD_FACTOR_PPM,
  EUA_PRICE_CENTS_PER_TONNE, OFFSET_UNIT_PRICE_CENTS, buildFlights,
} from './data.js';

/** Named for readability at the call site below. */
const AD_SB_REGISTRY = DIRECTIVES;

export function buildModel() {
  // 640 sectors per route x 15 routes = 9,600 sectors a year, which is what
  // four narrowbodies flying ~8 sectors a day actually fly. See the note on
  // SECTORS_PER_ROUTE in data.js: an earlier value of 26 made the fleet-fixed
  // pool dominate every sector and produced a CASK 100x too high.
  const raw = buildFlights(640);

  // ---- per-flight P&L, using costing.js ---------------------------------
  const pnls = raw.map((f) => flightPnl({
    costInput: {
      fuelKg: f.fuelKg,
      fuelPriceCentsPerKg: f.fuelPriceCentsPerKg,
      flightCrewCents: f.flightCrewCents,
      cabinCrewCents: f.cabinCrewCents,
      crewTrainingCents: f.crewTrainingCents,
      maintenanceDirectCents: f.maintenanceDirectCents,
      maintenanceReserveCents: f.maintenanceReserveCents,
      airportChargesCents: f.airportChargesCents,
      navigationCents: f.navigationCents,
      cateringCents: f.cateringCents,
      handlingCents: f.handlingCents,
      deIcingCents: f.deIcingCents,
      blockHours: f.blockHours,
      seatsOffered: f.seatsOffered,
      passengers: f.passengers,
      distanceKm: f.distanceKm,
    },
    // Provisional fleet-fixed share; replaced by a proper allocation below.
    fleetFixedLines: [],
    revenueCents: f.revenueCents,
    otherRevenueCents: f.otherRevenueCents,
  }));

  // ---- allocate fleet-fixed by block hours, then re-price every flight ---
  const fleetPnls = pnls.map((p) => ({
    distanceKm: p.distanceKm,
    blockHours: p.blockHours,
    seatsOffered: p.seatsOffered,
  }));

  const poolCents = sum(...FLEET_FIXED.map((l) => l.cost));
  const fixedAlloc = allocateFleetFixed({ poolCents, flights: fleetPnls, driver: 'BLOCK_HOURS' });

  const finalPnls = pnls.map((p, i) => {
    const share = fixedAlloc.allocations[i];
    const fullCostCents = p.directCostCents + share;
    return {
      ...p,
      fleetFixedCostCents: share,
      fullCostCents,
      contributionCents: p.revenueCents - fullCostCents,
    };
  });

  // ---- roll up -----------------------------------------------------------
  const total = aggregatePnl(finalPnls);
  const verdict = routeVerdict(total, { targetLoadFactorPpm: TARGET_LOAD_FACTOR_PPM });

  // Re-derive aggregate ratios using the corrected full costs.
  total.caskMicrocents = total.asks === 0
    ? 0 : Math.floor((total.fullCostCents * 1_000_000) / total.asks + 0.5);
  total.contributionCents = total.revenueCents - total.fullCostCents;
  total.breakEvenLoadFactorPpm = total.revenueCents === 0
    ? Number.MAX_SAFE_INTEGER
    : Math.floor((total.fullCostCents / total.revenueCents) * 1_000_000 + 0.5);

  // ---- per route ---------------------------------------------------------
  const byRoute = new Map();
  for (const r of ROUTES) byRoute.set(r.id, []);
  finalPnls.forEach((p, i) => byRoute.get(raw[i].routeId).push(p));

  const routeRollup = [...byRoute.entries()].map(([routeId, list]) => {
    const agg = aggregatePnl(list);
    agg.caskMicrocents = agg.asks === 0
      ? 0 : Math.floor((agg.fullCostCents * 1_000_000) / agg.asks + 0.5);
    agg.contributionCents = agg.revenueCents - agg.fullCostCents;
    agg.breakEvenLoadFactorPpm = agg.revenueCents === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.floor((agg.fullCostCents / agg.revenueCents) * 1_000_000 + 0.5);
    const v = routeVerdict(agg, { targetLoadFactorPpm: TARGET_LOAD_FACTOR_PPM });
    const def = ROUTES.find((r) => r.id === routeId);
    return {
      routeId,
      def,
      agg,
      verdict: v.verdict,
      marginPpm: v.marginPpm,
      leverGapPpm: v.levers.loadFactorGapPpm,
      caskHeadroom: v.levers.caskHeadroomMicrocents,
      contributionCents: agg.contributionCents,
      breakEven: v.breakEven,
    };
  }).sort((a, b) => b.contributionCents - a.contributionCents);

  // ---- fuel --------------------------------------------------------------
  const fuelAgg = raw.reduce((a, f) => {
    a.burnKg += f.fuelKg;
    a.plannedKg += f.fuelPlannedKg;
    a.sectorCostCents += Math.round(f.fuelKg * f.fuelPriceCentsPerKg);
    return a;
  }, { burnKg: 0, plannedKg: 0, sectorCostCents: 0 });

  const burnVariancePpmSeries = raw.map((f) => {
    const variance = f.fuelKg - f.fuelPlannedKg;
    return f.fuelPlannedKg === 0
      ? 0 : Math.floor((variance / f.fuelPlannedKg) * 1_000_000 + 0.5);
  });

  const anomaly = detectBurnVarianceAnomaly(burnVariancePpmSeries, { window: 30, zThreshold: 2.5 });
  const eff = fuelEfficiency(fuelAgg.burnKg, total.blockHours, total.asks);

  // ---- one worked fuel reconciliation, for the fuel view ------------------
  const sample = raw[3];
  const reconciliation = reconcileFuel(
    {
      taxiFuelKg: sample.taxiFuelKg,
      tripFuelKg: sample.fuelKg - sample.taxiFuelKg,
      contingencyKg: sample.contingencyKg,
      alternateKg: sample.alternateKg,
      finalReserveKg: sample.finalReserveKg,
      upliftKg: sample.upliftKg,
      priceCentsPerKg: sample.fuelPriceCentsPerKg,
    },
    { upliftKg: sample.upliftKg, takeoffFuelKg: sample.takeoffFuelKg, landingFuelKg: sample.landingFuelKg },
  );

  const upliftPlan = optimalUplift(
    {
      taxiFuelKg: sample.taxiFuelKg,
      tripFuelKg: sample.fuelKg - sample.taxiFuelKg,
      contingencyKg: sample.contingencyKg,
      alternateKg: sample.alternateKg,
      finalReserveKg: sample.finalReserveKg,
      upliftKg: sample.upliftKg,
      priceCentsPerKg: sample.fuelPriceCentsPerKg,
    },
    {
      costOfDiversionCents: 4_200_00,
      fuelPriceAtAlternateCentsPerKg: 138,
      fuelPriceHereCentsPerKg: sample.fuelPriceCentsPerKg,
      remainingSectors: 3,
    },
  );

  // ---- carbon -------------------------------------------------------------
  const emissions = raw.map((f) => allocateEmissions(
    {
      fuelKg: f.fuelKg,
      international: f.international,
      corsiaCovered: f.international,
      eeaInvolved: f.eeaInvolved,
      mtomKg: f.mtomKg,
      safKg: f.safKg,
      fuelType: 'JET_A1',
    },
    { euaPriceCentsPerTonne: EUA_PRICE_CENTS_PER_TONNE },
  ));

  const totalSafKg = raw.reduce((a, f) => a + f.safKg, 0);

  const carbon = emissions.reduce((a, e) => {
    a.totalTonnes += e.totalCo2Tonnes;
    a.corsiaTonnes += e.allocation.CORSIA;
    a.etsTonnes += e.allocation.EU_ETS;
    a.unregulatedTonnes += e.allocation.UNREGULATED;
    a.etsCostCents += e.allowanceCostCents;
    a.safSavingTonnes += e.emissions.savingVsAllConventionalTonnes;
    if (!e.allocationReconciles) a.reconciliationFailures += 1;
    return a;
  }, {
    totalTonnes: 0, corsiaTonnes: 0, etsTonnes: 0, unregulatedTonnes: 0,
    etsCostCents: 0, safSavingTonnes: 0, reconciliationFailures: 0,
    totalSafKg, safSharePpm: 0,
  });

  // SAF share of total fuel burned, in parts per million.
  carbon.safSharePpm = fuelAgg.burnKg === 0
    ? 0 : Math.floor((totalSafKg / fuelAgg.burnKg) * 1_000_000);

  // ---- budget authority ---------------------------------------------------
  const budget = BUDGET_LINES.map((l) => {
    const available =
      l.budgetedCents + l.revisedCents + l.releasedCents
      - l.committedCents - l.pendingCents - l.expendedCents - l.frozenCents;
    return { ...l, availableCents: available, utilisationPpm: l.budgetedCents === 0 ? 0 : Math.floor((l.committedCents / l.budgetedCents) * 1_000_000) };
  });

  // ---- airworthiness scope: which airframes are blocked, and why ----
  // Fed from the same registry the airworthiness view renders, so a
  // blocked-aircraft decision in the executive brief can never disagree
  // with the compliance board an engineer is looking at.
  const NOW_MS = Date.UTC(2026, 8, 18, 12, 0, 0);
  const airworthiness = (() => {
    const blocked = [];
    const deferrals = DEFERRALS;
    let overdueTotal = 0;

    for (const ac of AIRCRAFT_STATE) {
      const gate = airworthinessGate(AD_SB_REGISTRY, { ...ac, nowMs: NOW_MS }, deferrals);
      overdueTotal += gate.overdueCount;
      if (!gate.dispatchable) {
        blocked.push({
          type: ac.aircraftType,
          serial: ac.serialNumber,
          overdue: gate.overdue,
          dueSoon: gate.dueSoon,
          illegalDeferralAttempts: gate.illegalDeferralAttempts,
          nextDue: gate.nextDue,
        });
      }
    }
    return { blocked, overdueTotal, nowMs: NOW_MS };
  })();

  return {
    raw,
    flights: finalPnls,
    total,
    verdict,
    routeRollup,
    poolCents,
    fixedAlloc,
    fuelAgg,
    burnVariancePpmSeries,
    anomaly,
    eff,
    sample,
    reconciliation,
    upliftPlan,
    carbon,
    emissions,
    budget,
    aircraft: AIRCRAFT,
    airworthiness,
  };
}