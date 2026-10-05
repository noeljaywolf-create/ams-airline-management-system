/**
 * Headless verification of the demo's data layer and view logic.
 *
 * The browser views cannot be tested without a DOM, but everything they
 * DEPEND on can be: the domain modules they import, the model that wires
 * them together, and the invariants the UI asserts. Those are checked
 * here so the demo cannot silently show wrong numbers.
 *
 * Run: npx vitest run tests/demo.test.js
 */

import { describe, it, expect } from 'vitest';

import {
  buildFlights, FUEL_PRICES, SECTORS, DIRECTIVES, AIRCRAFT_STATE,
  DEFERRALS, BUDGET_LINES, TENANT,
} from '../frontend/js/data.js';

import { solveRoute } from '../shared/src/routing/constrained-path.js';
import { optimalRefuelPlan } from '../shared/src/routing/refuel.js';
import { airworthinessGate, llpStatus, melStatus } from '../shared/src/airworthiness.js';
import { allocateEmissions, co2Tonnes } from '../shared/src/carbon.js';
import { flightPnl, aggregatePnl } from '../shared/src/costing.js';
import { sum } from '../shared/src/money.js';

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);

describe('demo data is deterministic', () => {
  it('produces identical flights on repeated construction', () => {
    const a = buildFlights(4);
    const b = buildFlights(4);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('never generates an overbooked flight', () => {
    for (const f of buildFlights(26)) {
      expect(f.passengers).toBeLessThanOrEqual(f.seatsOffered);
      expect(f.passengers).toBeGreaterThan(0);
    }
  });

  it('keeps every fuel figure non-negative and in plausible order', () => {
    for (const f of buildFlights(26)) {
      expect(f.fuelKg).toBeGreaterThan(0);
      expect(f.landingFuelKg).toBeGreaterThanOrEqual(0);
      // Burn must be strictly positive, or the sector is nonsense.
      expect(f.takeoffFuelKg).toBeGreaterThan(f.landingFuelKg);
      expect(f.taxiFuelKg).toBeGreaterThan(0);
      expect(f.contingencyKg).toBeGreaterThan(0);
      expect(f.alternateKg).toBeGreaterThan(0);
    }
  });

  it('is internally consistent: burn equals takeoff minus landing', () => {
    for (const f of buildFlights(8)) {
      const burn = f.takeoffFuelKg - f.landingFuelKg;
      expect(burn).toBeGreaterThan(0);
      // Landing fuel is the reserve stack, which on a short sector can exceed
      // the burn. That is correct physics, not an error: a 500 km hop burns
      // little and still must land with 30 minutes in the tank.
      expect(f.landingFuelKg).toBeGreaterThanOrEqual(1_500);
      expect(f.takeoffFuelKg).toBe(f.upliftKg);
    }
  });

  it('gives every route a price for the uplift planner', () => {
    for (const s of SECTORS) {
      expect(FUEL_PRICES[s.from], `${s.from} needs a price`).toBeGreaterThan(0);
    }
  });

  it('keeps SAF within total fuel burned', () => {
    for (const f of buildFlights(26)) {
      expect(f.safKg).toBeLessThanOrEqual(f.fuelKg);
    }
  });
});

describe('the costing figures the dashboard shows are exact', () => {
  const flights = buildFlights(6);

  const pnls = flights.map((f) => flightPnl({
    costInput: {
      fuelKg: f.fuelKg,
      fuelPriceCentsPerKg: f.fuelPriceCentsPerKg,
      flightCrewCents: f.flightCrewCents,
      cabinCrewCents: f.cabinCrewCents,
      airportChargesCents: f.airportChargesCents,
      navigationCents: f.navigationCents,
      cateringCents: f.cateringCents,
      handlingCents: f.handlingCents,
      blockHours: f.blockHours,
      seatsOffered: f.seatsOffered,
      passengers: f.passengers,
      distanceKm: f.distanceKm,
    },
    fleetFixedLines: [],
    revenueCents: f.revenueCents,
    otherRevenueCents: f.otherRevenueCents,
  }));

  it('direct plus fixed equals full cost, to the cent', () => {
    for (const p of pnls) {
      expect(p.directCostCents + p.fleetFixedCostCents).toBe(p.fullCostCents);
    }
  });

  it('the direct build sums to its own stated total', () => {
    for (const p of pnls) {
      expect(sum(...Object.values(p.lines))).toBe(p.directCostCents);
    }
  });

  it('no cost line is fractional', () => {
    for (const p of pnls) {
      for (const [k, v] of Object.entries(p.lines)) {
        expect(Number.isSafeInteger(v), `${k} must be integer cents`).toBe(true);
      }
    }
  });

  it('aggregate components sum to the aggregate total', () => {
    const agg = aggregatePnl(pnls);
    expect(agg.directCostCents + agg.fleetFixedCostCents).toBe(agg.fullCostCents);
  });

  it('aggregate ASK equals the sum of flight ASK', () => {
    const agg = aggregatePnl(pnls);
    expect(agg.asks).toBe(sum(...pnls.map((p) => p.asks)));
  });

  it('marginal seat cost is far below full cost per seat', () => {
    // The whole point of reporting both: one more passenger does not
    // trigger another landing fee or another lease instalment.
    const p = pnls[0];
    expect(p.marginalCostOfExtraSeatCents).toBeLessThan(p.fullCostCents / p.seatsOffered);
  });
});

describe('route planner produces legal routes for every city pair', () => {
  const airports = [...new Set(SECTORS.flatMap((s) => [s.from, s.to]))];

  it('finds a feasible route wherever one exists with a widebody tank', () => {
    let found = 0;
    for (const from of airports) {
      for (const to of airports) {
        if (from === to) continue;
        const r = solveRoute({
          flights: SECTORS, source: from, destination: to,
          tankCapacityKg: 45_000, minReserveKg: 1_500,
        });
        if (r.feasible) {
          found += 1;
          expect(r.fuelUsedKg).toBeLessThanOrEqual(43_500);
          expect(r.stops[0]).toBe(from);
          expect(r.stops[r.stops.length - 1]).toBe(to);
          // Every consecutive pair must be a real sector.
          for (let i = 0; i < r.stops.length - 1; i += 1) {
            expect(SECTORS.some((s) => s.from === r.stops[i] && s.to === r.stops[i + 1])).toBe(true);
          }
        }
      }
    }
    expect(found).toBeGreaterThan(10);
  });

  it('reports infeasible rather than an unflyable route when the tank is tiny', () => {
    // Capacity must still exceed the reserve: solveRoute correctly REFUSES
    // a tank that cannot hold the mandatory reserve at all, rather than
    // returning "no route". That distinction is itself the behaviour.
    expect(() => solveRoute({
      flights: SECTORS, source: 'HRE', destination: 'DXB',
      tankCapacityKg: 100, minReserveKg: 1_500,
    })).toThrow(/cannot hold/);

    // With a legal-but-useless capacity, it reports infeasible, not unflyable.
    for (const from of airports) {
      for (const to of airports) {
        if (from === to) continue;
        const r = solveRoute({
          flights: SECTORS, source: from, destination: to,
          tankCapacityKg: 1_600, minReserveKg: 1_500,
        });
        expect(r.feasible).toBe(false);
      }
    }
  });

  it('the reported cost equals the sum of the returned route\'s own sectors', () => {
    for (const to of ['DXB', 'MRU', 'CPT']) {
      const r = solveRoute({
        flights: SECTORS, source: 'HRE', destination: to,
        tankCapacityKg: 24_000, minReserveKg: 1_500,
      });
      if (!r.feasible) continue;
      let recomputed = 0;
      for (let i = 0; i < r.stops.length - 1; i += 1) {
        const s = SECTORS.find((x) => x.from === r.stops[i] && x.to === r.stops[i + 1]);
        recomputed += s.costCents;
      }
      expect(recomputed).toBe(r.costCents);
    }
  });
});

describe('uplift plans are legal for every generated route', () => {
  it('arrives at every stop with the reserve intact', () => {
    const r = solveRoute({
      flights: SECTORS, source: 'HRE', destination: 'DXB',
      tankCapacityKg: 24_000, minReserveKg: 1_500,
    });
    expect(r.feasible).toBe(true);

    const legFuel = [];
    for (let i = 0; i < r.stops.length - 1; i += 1) {
      legFuel.push(SECTORS.find((s) => s.from === r.stops[i] && s.to === r.stops[i + 1]).fuelKg);
    }

    const plan = optimalRefuelPlan({
      stops: r.stops,
      legFuelKg: legFuel,
      priceCentsPerKg: r.stops.map((s) => FUEL_PRICES[s]),
      tankCapacityKg: 24_000,
      reserveKg: 1_500,
    });

    let fuel = 0;
    for (let i = 0; i < r.stops.length - 1; i += 1) {
      fuel += plan.upliftsKg[i];
      expect(fuel).toBeLessThanOrEqual(24_000);
      fuel -= legFuel[i];
      expect(fuel).toBeGreaterThanOrEqual(1_500);
    }
    expect(sum(...plan.upliftsKg.map((u, i) => u * FUEL_PRICES[r.stops[i]]))).toBe(plan.totalCostCents);
  });
});

describe('the airworthiness board reflects the SB/AD distinction', () => {
  it('flags the overdue AD but records the illegal deferral attempt', () => {
    const gates = AIRCRAFT_STATE.map((ac) => ({
      ac,
      g: airworthinessGate(DIRECTIVES, { ...ac, nowMs: NOW }, DEFERRALS),
    }));

    // B738 at 24,180 cycles against a 22,500-cycle AD is overdue.
    const b738 = gates.find((r) => r.ac.aircraftType === 'B738');
    expect(b738.g.overdueCount).toBeGreaterThan(0);

    // A deferral was recorded against an AD, which the MEL cannot do.
    const anyIllegal = gates.some((r) => r.g.illegalDeferralAttempts.length > 0);
    expect(anyIllegal).toBe(true);

    // The gate sets `deferred = false` unconditionally, on every item.
    // `deferralAttempted` separately records that the operator TRIED to
    // defer it — which is a different fact and the one an auditor needs.
    for (const r of gates) {
      for (const o of r.g.overdue) {
        expect(o.deferred).toBe(false);
        // An attempt may be recorded; it is simply never honoured.
      }
    }

    // Every illegal attempt names an AD, never a Service Bulletin.
    for (const r of gates) {
      for (const ref of r.g.illegalDeferralAttempts) {
        expect(ref).not.toContain('SB ');
      }
    }

    // And the attempts correspond exactly to the overdue ADs.
    const attempted = b738.g.overdue.filter((o) => o.deferralAttempted).map((o) => o.reference);
    expect(attempted.sort()).toEqual([...b738.g.illegalDeferralAttempts].sort());
  });

  it('a superseded directive never applies', () => {
    for (const ac of AIRCRAFT_STATE) {
      const g = airworthinessGate(DIRECTIVES, { ...ac, nowMs: NOW }, []);
      for (const o of [...g.overdue, ...g.dueSoon]) {
        expect(o.reference).not.toBe('EASA AD 2022-0177');
      }
    }
  });

  it('the calendar-bound LLP is identified as controlling', () => {
    // P/N-2233-B: 11,400 of 12,000 cycles used AND 113 of 120 months used.
    // Both counters are nearly exhausted, so this checks which one wins.
    // Normalising each to a share of its own limit:
    //   cycles   -> (12000-11400) / 12000 = 5.00%   =  50,000 ppm
    //   calendar -> (120-113)     / 120    = 5.83%   =  58,333 ppm
    // Cycles bind first, so CYCLES is controlling. This is exactly the
    // normalisation llpStatus() exists to perform — comparing "600 cycles
    // left" against "7 months left" without normalising would be meaningless.
    const s = llpStatus({
      partNumber: 'P/N-2233-B', serialNumber: 'LLP-T1',
      cyclesTotalLimit: 12_000, cyclesSinceNew: 11_400,
      monthsTotalLimit: 120, monthsSinceNew: 113,
    });
    expect(s.controllingCounter).toBe('CYCLES');
    expect(s.controllingRemaining).toBe(600);

    // Boundary case, and the reason it is worth pinning: 5.00% remaining is
    // EXACTLY COMPLIANCE_WARNING_THRESHOLD_PPM, and the check is strictly
    // less-than. So 5.00% is still COMPLIANT while 4.99% is DUE_SOON. An
    // off-by-one here silently suppresses or invents a planning item.
    expect(s.controllingRemainingPpm).toBe(50_000);
    expect(s.status).toBe('COMPLIANT');
    expect(s.planReplacement).toBe(false);

    // One hundred cycles further consumed → 4.92% → DUE_SOON.
    const justInside = llpStatus({
      partNumber: 'P/N-2233-B', serialNumber: 'LLP-T1',
      cyclesTotalLimit: 12_000, cyclesSinceNew: 11_500,
      monthsTotalLimit: 120, monthsSinceNew: 113,
    });
    expect(justInside.status).toBe('DUE_SOON');
    expect(justInside.planReplacement).toBe(true);
    expect(justInside.mustRemove).toBe(false);

    // Now make calendar the binding constraint: same cycles used, but the
    // part is 116 of 120 months old -> 3.33% = 33,333 ppm, which is below
    // the 50,000 ppm cycles share. Calendar takes over.
    // To make calendar bind first, cycles must be FURTHER consumed than
    // calendar, proportionally: cycles left/total < months left/months total.
    //   cycles   left 400 / 12,000 = 3.33%   <- the binding one
    //   calendar left   6 /   120 = 5.00%
    const calendarBound = llpStatus({
      partNumber: 'P/N-2233-B', serialNumber: 'LLP-T1',
      cyclesTotalLimit: 12_000, cyclesSinceNew: 11_600,
      monthsTotalLimit: 120, monthsSinceNew: 114,
    });
    expect(calendarBound.controllingCounter).toBe('CYCLES');
    expect(calendarBound.controllingRemaining).toBe(400);

    // Calendar genuinely binding: 3.33% cycle life, 1.67% calendar life.
    const calendarWins = llpStatus({
      partNumber: 'P/N-2233-C', serialNumber: 'LLP-T2',
      cyclesTotalLimit: 12_000, cyclesSinceNew: 11_600,
      monthsTotalLimit: 120, monthsSinceNew: 118,
    });
    expect(calendarWins.controllingCounter).toBe('CALENDAR');
    expect(calendarWins.controllingRemaining).toBe(2);
  });

  it('a part with ample cycle life but no calendar life is flagged', () => {
    // The real-world trap: 55% of cycles left, 3 months of calendar left.
    const s = llpStatus({
      partNumber: 'P/N-TRAP', serialNumber: 'LLP-T3',
      cyclesTotalLimit: 20_000, cyclesSinceNew: 9_000,
      monthsTotalLimit: 120, monthsSinceNew: 117,
    });
    expect(s.controllingCounter).toBe('CALENDAR');
    expect(s.controllingRemaining).toBe(3);
    expect(s.planReplacement).toBe(true);
    expect(s.mustRemove).toBe(false);
  });

  it('MEL Category B excludes the day of discovery and runs to end of day', () => {
    // Discovered 09:00 Monday 14 September 2026.
    const s = melStatus({ itemRef: 'X', category: 'B', discoveredAtMs: Date.UTC(2026, 8, 14, 9, 0) }, NOW);
    expect(s.rectifyByMs).toBe(Date.UTC(2026, 8, 17, 23, 59, 59, 999));
    expect(s.elapsedDays).toBe(4);
    expect(s.compliant).toBe(false);
  });

  it('MEL Category A returns no standard interval', () => {
    const s = melStatus({ itemRef: 'Y', category: 'A', discoveredAtMs: Date.UTC(2026, 8, 1) }, NOW);
    expect(s.rectifyByMs).toBe(null);
    expect(s.status).toBe('CAT_A_NO_STANDARD_INTERVAL');
  });
});

function acType(g) {
  return g.overdue[0]?.aircraftType ?? 'none';
}

describe('carbon allocation never double counts', () => {
  it('the three buckets reconstruct the total for every flight', () => {
    for (const f of buildFlights(26)) {
      const e = allocateEmissions({
        fuelKg: f.fuelKg,
        international: /** @type {boolean} */ (f.international),
        corsiaCovered: /** @type {boolean} */ (f.international),
        eeaInvolved: /** @type {boolean} */ (f.eeaInvolved),
        mtomKg: /** @type {number} */ (f.mtomKg),
        safKg: /** @type {number} */ (f.safKg),
        fuelType: /** @type {'JET_A1'} */ ('JET_A1'),
      }, { euaPriceCentsPerTonne: 8_500 });

      expect(e.allocationReconciles).toBe(true);
      const { CORSIA, EU_ETS, UNREGULATED } = e.allocation;
      expect(CORSIA + EU_ETS + UNREGULATED).toBeCloseTo(e.totalCo2Tonnes, 6);
      // CORSIA and ETS can never both be positive on the same flight.
      expect(CORSIA > 0 && EU_ETS > 0).toBe(false);
    }
  });

  it('an ETOPS-exempt light aircraft is outside CORSIA scope', () => {
    const e = allocateEmissions({
      fuelKg: 5_000, international: true, corsiaCovered: true,
      eeaInvolved: false, mtomKg: 5_699, safKg: 0, fuelType: 'JET_A1',
    }, { euaPriceCentsPerTonne: 8_500 });
    expect(e.mtomExempt).toBe(true);
    expect(e.allocation.CORSIA).toBe(0);
    expect(e.allocation.UNREGULATED).toBe(e.totalCo2Tonnes);
  });

  it('SAF reduces charged tonnes without changing total fuel', () => {
    const plain = co2Tonnes(10_000, 'JET_A1');
    const withSaf = allocateEmissions({
      fuelKg: 10_000, international: false, corsiaCovered: false,
      eeaInvolved: true, mtomKg: 79_000, safKg: 2_000, fuelType: 'JET_A1',
    }, { euaPriceCentsPerTonne: 8_500 });
    expect(withSaf.totalCo2Tonnes).toBeLessThan(plain);
    expect(withSaf.emissions.totalFuelKg).toBe(10_000);
  });
});

describe('the budget panel exposes the real control', () => {
  it('at least one line has negative availability — the demo shows a real breach', () => {
    // BL-SAF-26 is deliberately oversubscribed so the UI can show the
    // control refusing rather than silently clamping.
    const breaches = BUDGET_LINES.filter((l) => {
      const available = l.budgetedCents + l.revisedCents + l.releasedCents
        - l.committedCents - l.pendingCents - l.expendedCents - l.frozenCents;
      return available < 0;
    });
    expect(breaches.length).toBeGreaterThan(0);
    expect(breaches[0].id).toBe('BL-SAF-26');
  });

  it('the frozen line has a reason-gated flag set', () => {
    const frozen = BUDGET_LINES.filter((l) => l.isFrozen);
    expect(frozen.length).toBe(1);
    expect(frozen[0].frozenCents).toBeGreaterThan(0);
  });
});

describe('tenant metadata is complete enough for the header', () => {
  it('has everything the top bar renders', () => {
    expect(TENANT.icao).toHaveLength(3);
    expect(TENANT.iata).toHaveLength(2);
    expect(TENANT.aoc).toContain('CAAZ');
    expect(TENANT.fiscalYear).toBeGreaterThan(2000);
  });
});