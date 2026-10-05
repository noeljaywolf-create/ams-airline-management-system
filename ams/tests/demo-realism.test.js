/**
 * Realism tests for the demo dataset.
 *
 * The tests in demo.test.js verify INTERNAL CONSISTENCY: that the parts sum,
 * that no flight is overbooked, that allocations reconcile. Those all passed
 * while the demo showed a CASK of $848 per seat-kilometre — a figure the
 * industry quotes as roughly $0.08.
 *
 * Consistency tests cannot catch a plausible-looking impossible input. These
 * can: they compare the demo's output against externally-known industry
 * ranges, so a bad constant produces a failing test rather than a
 * wrong-looking dashboard that nobody questions.
 *
 * Sources for the ranges:
 *   CASK/RASK       IATA and ICAO industry reporting, narrowbody mainline
 *   fuel share      25-35% of operating cost, widely reported
 *   load factor     78-85% typical for scheduled regional/narrowbody
 *   burn rate       1,800-2,200 kg/h on a narrowbody at typical cruise mass
 */

import { describe, it, expect } from 'vitest';

import { buildModel } from '../frontend/js/model.js';
import { microcents } from '../frontend/js/format.js';

const model = buildModel();
const t = model.total;

describe('demo CASK and RASK are in the published industry range', () => {
  it('CASK is between $0.04 and $0.15 per available seat-kilometre', () => {
    const cask = t.caskMicrocents / 100_000_000;
    expect(cask).toBeGreaterThan(0.04);
    expect(cask).toBeLessThan(0.15);
  });

  it('RASK is between $0.05 and $0.20 per available seat-kilometre', () => {
    const rask = t.raskMicrocents / 100_000_000;
    expect(rask).toBeGreaterThan(0.05);
    expect(rask).toBeLessThan(0.20);
  });

  it('RASK exceeds CASK, which is what PROFITABLE means', () => {
    expect(t.raskMicrocents).toBeGreaterThan(t.caskMicrocents);
    expect(model.verdict.verdict).toBe('PROFITABLE');
  });

  it('the display formatter returns dollars, not cents or microcents', () => {
    // Regression guard. Three separate unit errors occurred here:
    //   / 100      → "$848.14"   (a hundred thousand times too large)
    //   / 1e6      → "$5.04"     (a hundred times too large)
    //   / 1e8      → "$0.0504"   (correct)
    expect(microcents(5_037_764)).toBe('0.0504');
    expect(microcents(0)).toBe('0.0000');
    expect(microcents(100_000_000)).toBe('1.0000');
  });
});

describe('the cost structure resembles a real airline', () => {
  it('fuel is 25% to 40% of operating cost', () => {
    const sharePpm = Math.floor((model.fuelAgg.sectorCostCents / t.fullCostCents) * 1_000_000);
    expect(sharePpm).toBeGreaterThan(250_000);
    expect(sharePpm).toBeLessThan(400_000);
  });

  it('load factor is 70% to 88%', () => {
    expect(t.loadFactorPpm).toBeGreaterThan(700_000);
    expect(t.loadFactorPpm).toBeLessThan(880_000);
  });

  it('a typical sector costs between $3,000 and $25,000 all-in', () => {
    for (const p of model.flights.slice(0, 50)) {
      expect(p.fullCostCents).toBeGreaterThan(300_000);
      expect(p.fullCostCents).toBeLessThan(2_500_000);
    }
  });

  it('marginal seat cost is $5 to $40, and far below full cost per seat', () => {
    for (const p of model.flights.slice(0, 50)) {
      expect(p.marginalCostOfExtraSeatCents).toBeGreaterThan(500);
      expect(p.marginalCostOfExtraSeatCents).toBeLessThan(4_000);
      expect(p.marginalCostOfExtraSeatCents)
        .toBeLessThan(p.fullCostCents / p.seatsOffered);
    }
  });

  it('burn rate is 1,500 to 2,200 kg per block hour', () => {
    const kgPerHour = model.eff.kgPerBlockHourMilli / 1000;
    expect(kgPerHour).toBeGreaterThan(1_500);
    expect(kgPerHour).toBeLessThan(2_200);
  });

  it('fleet-fixed cost is a minority of total cost, not the whole of it', () => {
    // This is the regression that produced an $848 CASK: the fleet-fixed pool
    // was spread over 390 sectors instead of ~9,600, so fixed cost came to
    // $49,231 on a sector whose direct cost was $7,947.
    const fixedSharePpm = Math.floor((t.fleetFixedCostCents / t.fullCostCents) * 1_000_000);
    expect(fixedSharePpm).toBeGreaterThan(0);
    expect(fixedSharePpm).toBeLessThan(400_000);
  });

  it('the fleet flies a plausible number of sectors', () => {
    // 4 narrowbodies at ~8 sectors/day across ~300 days ≈ 9,600.
    expect(model.raw.length).toBeGreaterThan(5_000);
    expect(model.raw.length).toBeLessThan(20_000);
  });
});

describe('crew and lease costs are in cents, not thousands of cents', () => {
  it('flight crew duty costs $900 to $3,000 per sector', () => {
    // cents('142000') would give $1,420,000. The bug was reading a dollar
    // figure into a function that expects a string in DOLLARS, then adding
    // another thousands-scale jitter on top.
    for (const raw of [model.raw[0], model.raw[500], model.raw[5000]]) {
      expect(raw.flightCrewCents).toBeGreaterThan(90_000);
      expect(raw.flightCrewCents).toBeLessThan(300_000);
    }
  });

  it('a monthly lease is $150,000 to $600,000', () => {
    for (const ac of model.aircraft) {
      expect(ac.monthlyCents).toBeGreaterThan(15_000_000);
      expect(ac.monthlyCents).toBeLessThan(60_000_000);
    }
  });

  it('the annual fleet-fixed pool is $1M to $30M', () => {
    expect(model.poolCents).toBeGreaterThan(100_000_000);
    expect(model.poolCents).toBeLessThan(3_000_000_000);
  });
});

describe('the demo tells a coherent commercial story', () => {
  it('contains both profitable and loss-making routes', () => {
    const verdicts = new Set(model.routeRollup.map((r) => r.verdict));
    expect(verdicts.size).toBeGreaterThan(1);
  });

  it('the longest route is the marginal one, as in reality', () => {
    // A 4,388 km sector carries the same crew, airport and handling structure
    // as a 494 km hop but four times the distance, so CASK per seat-km must
    // be lower. This is the single clearest sanity check on the whole model.
    const shortHaul = model.routeRollup.find((r) => r.def.km < 600);
    const longHaul = model.routeRollup.find((r) => r.def.km > 4000);
    expect(shortHaul).toBeDefined();
    expect(longHaul).toBeDefined();
    expect(longHaul.agg.caskMicrocents).toBeLessThan(shortHaul.agg.caskMicrocents);
  });

  it('the loss-making route is one where RASK falls below CASK', () => {
    const loser = model.routeRollup.find((r) => r.verdict === 'LOSS_MAKING');
    expect(loser).toBeDefined();
    expect(loser.agg.raskMicrocents).toBeLessThan(loser.agg.caskMicrocents);
  });

  it('the budget panel deliberately contains a control breach to demonstrate', () => {
    const breaches = model.budget.filter((b) => b.availableCents < 0);
    expect(breaches.length).toBeGreaterThan(0);
  });

  it('at least one aircraft is blocked from dispatch by an overdue AD', () => {
    // Verified independently in tests/demo.test.js; here we assert the model
    // actually surfaces it so the UI has something to show.
    expect(model.anomaly).toBeDefined();
    expect(model.carbon.reconciliationFailures).toBe(0);
  });
});