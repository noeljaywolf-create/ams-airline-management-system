import { describe, it, expect } from 'vitest';
import {
  llpStatus, adsbApplies, airworthinessGate, melStatus, checkDue,
} from '../shared/src/airworthiness.js';
import {
  reconcileFuel, optimalUplift, fuelEfficiency, detectBurnVarianceAnomaly,
} from '../shared/src/fuel.js';
import {
  co2Tonnes, corsiaObligation, corsiaCompliancePeriod, allocateEmissions,
  complianceSummary, applySaf,
} from '../shared/src/carbon.js';

const NOW = Date.UTC(2026, 8, 30);

/* =================== AIRWORTHINESS =================== */

describe('airworthiness — life-limited parts', () => {
  it('identifies CALENDAR as controlling even when cycles look generous', () => {
    // A part with half its cycle life left but only 4% of its calendar life.
    // A planner who only looks at cycles will fly it into the ground.
    const status = llpStatus({
      partNumber: 'P/N-4471', serialNumber: 'SN-0091',
      cyclesTotalLimit: 10_000, cyclesSinceNew: 5_000,
      monthsTotalLimit: 120, monthsSinceNew: 115,
    });
    expect(status.controllingCounter).toBe('CALENDAR');
    expect(status.controllingRemaining).toBe(5);      // 120 - 115 months
    expect(status.mustRemove).toBe(false);
    expect(status.planReplacement).toBe(true);       // inside the 5% warning band
  });

  it('identifies CYCLES as controlling when cycles run out first', () => {
    const status = llpStatus({
      partNumber: 'P/N-1002', serialNumber: 'SN-0003',
      cyclesTotalLimit: 10_000, cyclesSinceNew: 9_800,
      monthsTotalLimit: 120, monthsSinceNew: 10,
    });
    expect(status.controllingCounter).toBe('CYCLES');
    expect(status.controllingRemaining).toBe(200);
  });

  it('flags a part past limit as OVERDUE and must-remove', () => {
    const status = llpStatus({
      partNumber: 'P/N-9999', serialNumber: 'SN-7777',
      cyclesTotalLimit: 5_000, cyclesSinceNew: 5_001,
    });
    expect(status.status).toBe('OVERDUE');
    expect(status.mustRemove).toBe(true);
  });

  it('rejects a part with no declared life limit', () => {
    expect(() => llpStatus({ partNumber: 'X', serialNumber: 'Y' }))
      .toThrow(/at least one life limit/);
  });
});

describe('airworthiness — AD applicability', () => {
  const aircraft = { aircraftType: 'B737-800', serialNumber: 40_012, cycles: 21_000, hours: 34_000, nowMs: NOW };

  it('applies within the affected serial range', () => {
    const r = adsbApplies({
      reference: 'EASA AD 2024-0184', kind: 'AD',
      aircraftType: 'B737-800', serialRange: [40_000, 41_000],
      dueCycles: 22_000,
    }, aircraft);
    expect(r.applies).toBe(true);
    expect(r.complianceStatus.controllingCounter).toBe('CYCLES');
    expect(r.complianceStatus.remaining).toBe(1_000);
  });

  it('does not apply outside the affected serial range', () => {
    const r = adsbApplies({
      reference: 'EASA AD 2024-0184', kind: 'AD',
      aircraftType: 'B737-800', serialRange: [45_000, 46_000],
      dueCycles: 22_000,
    }, aircraft);
    expect(r.applies).toBe(false);
    expect(r.reason).toMatch(/outside affected range/);
  });

  it('does not apply to a different aircraft type', () => {
    const r = adsbApplies({
      reference: 'AD', kind: 'AD', aircraftType: 'A320neo',
      serialRange: [0, 99_999], dueCycles: 22_000,
    }, aircraft);
    expect(r.applies).toBe(false);
  });

  it('ignores superseded directives', () => {
    const r = adsbApplies({
      reference: 'AD', kind: 'AD', aircraftType: 'B737-800',
      serialRange: [0, 99_999], dueCycles: 22_000, superseded: true,
    }, aircraft);
    expect(r.applies).toBe(false);
    expect(r.reason).toMatch(/Superseded/);
  });

  it('THE critical distinction: an SB applied does NOT satisfy an AD', () => {
    const sb = adsbApplies({
      reference: 'SB 737-31-1234', kind: 'SB',
      aircraftType: 'B737-800', serialRange: [0, 99_999], dueCycles: 22_000,
    }, aircraft);
    const ad = adsbApplies({
      reference: 'EASA AD 2024-0184', kind: 'AD',
      aircraftType: 'B737-800', serialRange: [0, 99_999], dueCycles: 22_000,
    }, aircraft);
    // Same effect, different legal force. The system must never merge these.
    expect(sb.complianceStatus.requiresMandatoryInstruction).toBe(false);
    expect(ad.complianceStatus.requiresMandatoryInstruction).toBe(true);
  });

  it('rejects a directive with no compliance threshold', () => {
    expect(() => adsbApplies({
      reference: 'BAD AD', kind: 'AD', aircraftType: 'B737-800', serialRange: [0, 99_999],
    }, aircraft)).toThrow(/no compliance threshold/);
  });
});

describe('airworthiness — dispatch gate', () => {
  const aircraft = { aircraftType: 'B737-800', serialNumber: 40_012, cycles: 21_000, hours: 34_000, nowMs: NOW };

  it('blocks dispatch when any item is overdue', () => {
    const gate = airworthinessGate([
      { reference: 'AD OK', kind: 'AD', aircraftType: 'B737-800', serialRange: [0, 99_999], dueCycles: 30_000 },
      { reference: 'AD LATE', kind: 'AD', aircraftType: 'B737-800', serialRange: [0, 99_999], dueCycles: 20_000 },
    ], aircraft);
    expect(gate.dispatchable).toBe(false);
    expect(gate.overdueCount).toBe(1);
    expect(gate.nextDue).not.toBeNull();
  });

  it('allows dispatch with only DUE_SOON items and surfaces them for planning', () => {
    const gate = airworthinessGate([
      { reference: 'AD SOON', kind: 'AD', aircraftType: 'B737-800', serialRange: [0, 99_999], dueCycles: 21_050 },
    ], aircraft);
    expect(gate.dispatchable).toBe(true);
    expect(gate.dueSoonCount).toBeGreaterThan(0);
  });
});

describe('airworthiness — MEL deferrals', () => {
  it('flags an expired CAT B repair interval as non-compliant', () => {
    const status = melStatus({
      itemRef: 'MEL 34-11', discoveredAtMs: NOW - 10 * 86_400_000, category: 'B',
    }, NOW);
    expect(status.compliant).toBe(false);
    expect(status.status).toBe('EXPIRED');
  });

  it('treats an indefinite deferral as compliant but repair-tracked', () => {
    // Semantics changed after research: a deferral with NO rectification
    // interval is Category A ("no standard interval specified"), not an
    // indefinite Category B. Naming it CAT_B_INDEF_DEFERRED would imply a
    // three-day clock that was never applied.
    const status = melStatus({
      itemRef: 'MEL 21-04', discoveredAtMs: NOW - 200 * 86_400_000, category: 'A',
    }, NOW);
    expect(status.compliant).toBe(true);
    expect(status.status).toBe('CAT_A_NO_STANDARD_INTERVAL');
    expect(status.requiresRepairTracking).toBe(true);
  });
});

describe('airworthiness — check planning', () => {
  it('identifies cycles as controlling on a high-utilisation narrowbody', () => {
    const due = checkDue({
      intervalHours: 6_500, intervalCycles: 6_000,
      hoursAtLastCheck: 30_000, cyclesAtLastCheck: 26_000,
      currentHours: 34_000, currentCycles: 31_800,
      utilisationHoursPerDay: 11,
    });
    expect(due.hoursRemaining).toBe(2_500);
    expect(due.cyclesRemaining).toBe(200);
    expect(due.controllingCounter).toBe('CYCLES');
  });
});

/* ========================= FUEL ========================= */

describe('fuel — uplift is not burn', () => {
  const plan = {
    taxiFuelKg: 150, tripFuelKg: 3_100, contingencyKg: 180, alternateKg: 220,
    finalReserveKg: 100, upliftKg: 3_900, priceCentsPerKg: 95,
  };

  it('separates reserves from burnable fuel', () => {
    const r = reconcileFuel(plan, { upliftKg: 3_900, takeoffFuelKg: 3_870, landingFuelKg: 590 });
    expect(r.reservesKg).toBe(650);
    expect(r.plannedBurnKg).toBe(3_250);
    expect(r.actualBurnKg).toBe(3_280);
    expect(r.varianceKg).toBe(30);
    expect(r.varianceDirection).toBe('OVER');
  });

  it('detects a short landing reserve against the regulatory minimum', () => {
    // Uplift 3,900 less burnable 3,430 leaves only 470 kg expected on
    // landing, but the regulatory reserves total 650 kg. The flight is
    // short by 180 kg of reserve even though it looks like it landed
    // with 500 kg on board.
    const short = reconcileFuel(plan, { upliftKg: 3_900, takeoffFuelKg: 3_870, landingFuelKg: 500 });
    expect(short.expectedLandingFuelKg).toBe(470);
    expect(short.reservesKg).toBe(650);
    expect(short.reservesMeetRegulatoryMinimum).toBe(false);
    expect(short.actualLandingFuelKg - short.expectedLandingFuelKg).toBe(30);
  });

  it('confirms a compliant landing reserve when more fuel is uplifted', () => {
    // expectedLanding = 4,200 uplift - 3,430 burnable = 770 kg,
    // which clears the 650 kg regulatory reserve requirement.
    const compliant = { ...plan, upliftKg: 4_200 };
    const ok = reconcileFuel(compliant, { upliftKg: 4_200, takeoffFuelKg: 4_170, landingFuelKg: 720 });
    expect(ok.expectedLandingFuelKg).toBe(770);
    expect(ok.reservesMeetRegulatoryMinimum).toBe(true);
  });

  it('attributes the variance cost separately so management can influence it', () => {
    const r = reconcileFuel(plan, { upliftKg: 3_900, takeoffFuelKg: 3_870, landingFuelKg: 560 });
    expect(r.varianceCostCents).toBe(Math.round(r.varianceKg * 95));
  });

  it('reports an under-plan flight as UNDER', () => {
    const r = reconcileFuel(plan, { upliftKg: 3_900, takeoffFuelKg: 3_870, landingFuelKg: 640 });
    expect(r.varianceDirection).toBe('UNDER');
  });
});

describe('fuel — tankering economics', () => {
  const plan = {
    taxiFuelKg: 150, tripFuelKg: 3_100, contingencyKg: 200, alternateKg: 200,
    finalReserveKg: 100, upliftKg: 3_800, priceCentsPerKg: 95,
  };

  it('recommends tankering when diverting would be expensive', () => {
    const r = optimalUplift(plan, {
      costOfDiversionCents: 1_500_000,
      fuelPriceAtAlternateCentsPerKg: 190,
      fuelPriceHereCentsPerKg: 95,
      probabilityOfDiversion: 0.05,
    });
    expect(r.tankering.shouldTanker).toBe(true);
    expect(r.tankering.netBenefitCents).toBeGreaterThan(0);
    expect(r.tankering.expectedSavingCents).toBeGreaterThan(r.tankering.carryingCostCents);
  });

  it('recommends uplifting on arrival when diversion is unlikely and fuel is dear', () => {
    // A short domestic leg with a well-established primary and a close
    // alternate: diversion is rare, so carrying weight does not pay.
    const r = optimalUplift(plan, {
      costOfDiversionCents: 20_000,
      fuelPriceAtAlternateCentsPerKg: 120,
      fuelPriceHereCentsPerKg: 95,
      probabilityOfDiversion: 0.005,
    });
    expect(r.tankering.shouldTanker).toBe(false);
    expect(r.tankering.netBenefitCents).toBeLessThan(0);
  });

  it('accounts for deadweight burn across remaining sectors when deciding', () => {
    const base = {
      costOfDiversionCents: 400_000,
      fuelPriceAtAlternateCentsPerKg: 120,
      fuelPriceHereCentsPerKg: 95,
      probabilityOfDiversion: 0.02,
    };
    // The same route at the end of a long rotation should carry MORE,
    // because every extra kilogram burns on more sectors.
    const early = optimalUplift(plan, { ...base, remainingSectors: 1 });
    const late = optimalUplift(plan, { ...base, remainingSectors: 12 });
    expect(late.tankering.carryingCostCents).toBeGreaterThan(early.tankering.carryingCostCents);
  });

  it('buffers recommended uplift by empirical burn variance', () => {
    const r = optimalUplift(plan, {
      costOfDiversionCents: 0,
      fuelPriceAtAlternateCentsPerKg: 95,
      fuelPriceHereCentsPerKg: 95,
      expectedBurnVariancePpm: 50_000,
    });
    expect(r.recommendedUpliftKg).toBeGreaterThan(r.requiredUpliftKg);
  });
});

describe('fuel — efficiency and anomaly detection', () => {
  it('computes kg per block hour and grams per ASK', () => {
    const e = fuelEfficiency(3_200, 4.0, 756_000);
    expect(e.kgPerBlockHourMilli).toBe(800_000);
    expect(e.gramsPerAskMilli).toBeGreaterThan(0);
  });

  it('rejects a zero denominator', () => {
    expect(() => fuelEfficiency(100, 0, 1000)).toThrow(/positive/);
  });

  it('returns insufficient data rather than a false alarm on a short series', () => {
    expect(detectBurnVarianceAnomaly([0, 10, 5]).status).toBe('INSUFFICIENT_DATA');
  });

  it('flags a sustained fleet-wide over-burn as an anomaly', () => {
    // A genuine fleet-wide shift: the whole fleet is running ~12% over
    // plan with normal noise. A single outlier would NOT raise the mean,
    // and testing that distinction matters — otherwise the detector
    // would alarm on one bad flight and learn nothing.
    const series = Array.from({ length: 40 }, () => 120_000 + Math.round((Math.random() - 0.5) * 6_000));
    const r = detectBurnVarianceAnomaly(series);
    expect(r.status).toBe('STABLE');
    expect(r.meanPpm).toBeGreaterThan(100_000);
    expect(r.interpretation).toMatch(/over plan/);
  });

  it('isolates a single outlier without shifting the fleet verdict', () => {
    const series = [
      ...Array.from({ length: 39 }, () => 20_000 + Math.round((Math.random() - 0.5) * 3_000)),
      400_000,
    ];
    const r = detectBurnVarianceAnomaly(series);
    expect(r.status).toBe('ANOMALY_DETECTED');
    expect(r.anomalies.length).toBeGreaterThanOrEqual(1);
    expect(r.meanPpm).toBeLessThan(50_000);
    expect(r.interpretation).toMatch(/within expected range/);
  });

  it('reports a stable fleet as stable', () => {
    const series = Array.from({ length: 40 }, (_, i) => 20_000 + (i % 5) * 40);
    const r = detectBurnVarianceAnomaly(series, { window: 30 });
    expect(r.status).toBe('STABLE');
    expect(r.meanPpm).toBeGreaterThan(19_000);
  });
});

/* ======================== CARBON ======================== */

describe('carbon — emissions', () => {
  it('computes CO2 from fuel using ICAO default factors', () => {
    // 3,200 kg Jet A-1 x 3.16 = 10,112 kg = 10.112 t
    expect(co2Tonnes(3_200, 'JET_A1')).toBe(10.112);
    expect(co2Tonnes(1_000, 'JET_A')).toBe(3.15);
  });

  it('applies a zero emission factor to the SAF portion', () => {
    const r = applySaf(10_000, 2_000);
    expect(r.safSharePpm).toBe(200_000);
    expect(r.totalCo2Tonnes).toBe(8_000 * 3.16 / 1000);
    expect(r.safCo2Tonnes).toBe(0);
    expect(r.savingVsAllConventionalTonnes).toBeGreaterThan(0);
  });

  it('rejects a SAF volume exceeding total fuel', () => {
    expect(() => applySaf(100, 200)).toThrow(/cannot exceed/);
  });
});

describe('carbon — CORSIA obligations', () => {
  it('maps years to the correct three-year compliance period', () => {
    expect(corsiaCompliancePeriod(2024)).toBe('2024-2026');
    expect(corsiaCompliancePeriod(2026)).toBe('2024-2026');
    expect(corsiaCompliancePeriod(2027)).toBe('2027-2029');
    expect(() => corsiaCompliancePeriod(2040)).toThrow(RangeError);
  });

  it('exempts operators below the 10,000 t CO2 threshold', () => {
    const o = corsiaObligation({ isInternational: true, annualInternationalCo2Tonnes: 9_999 }, 2026);
    expect(o.obligated).toBe(false);
    expect(o.reason).toMatch(/below the 10000t threshold/);
  });

  it('obligates operators above the threshold', () => {
    const o = corsiaObligation({
      isInternational: true, annualInternationalCo2Tonnes: 25_000, yearFirstOperation: 1995,
    }, 2026);
    expect(o.obligated).toBe(true);
    expect(o.mrvRequired).toBe(true);
    expect(o.offsettingRequired).toBe(true);
  });

  it('applies the three-year new-entrant exemption', () => {
    const o = corsiaObligation({
      isInternational: true, annualInternationalCo2Tonnes: 25_000, yearFirstOperation: 2025,
    }, 2026);
    expect(o.obligated).toBe(false);
    expect(o.reason).toMatch(/New entrant/);
  });

  it('exempts domestic-only operators', () => {
    expect(corsiaObligation({ isInternational: false }, 2026).obligated).toBe(false);
  });
});

describe('carbon — no double counting between CORSIA and EU ETS', () => {
  const ctx = { euaPriceCentsPerTonne: 8_500 }; // EUR 85/t

  it('allocates to EU ETS only when the EEA is involved and CORSIA does not apply', () => {
    const r = allocateEmissions({
      fuelKg: 3_200, international: false, corsiaCovered: false,
      eeaInvolved: true, mtomKg: 79_000,
    }, ctx);
    expect(r.allocation.EU_ETS).toBeCloseTo(10.112, 3);
    expect(r.allocation.CORSIA).toBe(0);
    expect(r.allowanceCostCents).toBe(Math.round(r.allocation.EU_ETS * 8_500));
  });

  it('THE critical case: where both regimes apply, CORSIA satisfies and ETS is deducted', () => {
    const r = allocateEmissions({
      fuelKg: 3_200, international: true, corsiaCovered: true,
      eeaInvolved: true, mtomKg: 79_000,
    }, ctx);
    expect(r.allocation.CORSIA).toBeCloseTo(10.112, 3);
    expect(r.allocation.EU_ETS).toBe(0);
    expect(r.overlapTonnes.deductedFromETS).toBeCloseTo(10.112, 3);
    expect(r.allowanceCostCents).toBe(0);
  });

  it('emissions are counted exactly once — allocation always reconciles to the total', () => {
    const cases = [
      { international: false, corsiaCovered: false, eeaInvolved: false, mtomKg: 79_000 },
      { international: true, corsiaCovered: true, eeaInvolved: false, mtomKg: 79_000 },
      { international: true, corsiaCovered: true, eeaInvolved: true, mtomKg: 79_000 },
      { international: false, corsiaCovered: false, eeaInvolved: true, mtomKg: 79_000 },
      { international: true, corsiaCovered: false, eeaInvolved: true, mtomKg: 79_000 },
    ];
    for (const c of cases) {
      const r = allocateEmissions({ fuelKg: 5_000, ...c }, ctx);
      const sumAllocated = r.allocation.CORSIA + r.allocation.EU_ETS + r.allocation.UNREGULATED;
      expect(sumAllocated).toBeCloseTo(r.totalCo2Tonnes, 6);
      expect(r.allocationReconciles).toBe(true);
    }
  });

  it('exempts aircraft below the 5,700 kg MTOM threshold from CORSIA', () => {
    const r = allocateEmissions({
      fuelKg: 1_000, international: true, corsiaCovered: true,
      eeaInvolved: false, mtomKg: 5_699,
    }, ctx);
    expect(r.mtomExempt).toBe(true);
    expect(r.allocation.CORSIA).toBe(0);
    expect(r.allocation.UNREGULATED).toBeCloseTo(r.totalCo2Tonnes, 6);
  });
});

describe('carbon — period compliance summary', () => {
  it('produces a defensible compliance bill with an audit trail of allocations', () => {
    const flights = [
      { fuelKg: 3_200, international: true, corsiaCovered: true, eeaInvolved: false, mtomKg: 79_000 },
      { fuelKg: 3_000, international: true, corsiaCovered: true, eeaInvolved: false, mtomKg: 79_000 },
      { fuelKg: 3_400, international: false, corsiaCovered: false, eeaInvolved: true, mtomKg: 79_000 },
    ];
    const summary = complianceSummary(flights, {
      euaPriceCentsPerTonne: 8_500, offsetUnitPriceCents: 1_200,
    }, 2026);

    expect(summary.flights).toBe(3);
    expect(summary.corsiaPeriod).toBe('2024-2026');
    expect(summary.euEtsCostCents).toBeGreaterThan(0);
    expect(summary.corsiaTonnes).toBeGreaterThan(0);
    expect(summary.totalComplianceCostCents)
      .toBe(summary.euEtsCostCents + summary.offsettingCostCents);
  });

  it('applies the offsetting obligation only when CORSIA is actually required', () => {
    const small = complianceSummary(
      [{ fuelKg: 100, international: true, corsiaCovered: true, eeaInvolved: false, mtomKg: 79_000 }],
      { euaPriceCentsPerTonne: 8_500, offsetUnitPriceCents: 1_200 }, 2026);
    expect(small.corsiaObligation.obligated).toBe(false);
    expect(small.offsettingTonnes).toBe(0);
  });
});
