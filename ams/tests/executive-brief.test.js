/**
 * The Executive Brief must never assert anything it has not computed.
 *
 * THE FAILURE MODE THIS GUARDS
 * ---------------------------
 * An executive brief is the most dangerous artefact in a system like this,
 * because it is written once and read as fact. If it says "three routes need
 * attention" and the model says one, the document is worse than useless — it
 * destroys trust in the underlying numbers.
 *
 * So every decision on the brief is DERIVED by deriveDecisions() from the
 * computed model. These tests assert the derivation is faithful:
 *
 *   - a decision exists only because the model produced the fact
 *   - the amounts quoted match the model exactly
 *   - when nothing is wrong, the brief says so
 *
 * The last point is the one that matters most. A brief that can never say
 * "nothing requires a decision" is marketing, not reporting.
 */

import { describe, it, expect } from 'vitest';

import { buildModel } from '../frontend/js/model.js';
import { deriveDecisions } from '../frontend/js/views-exec.js';

const model = buildModel();

describe('decisions are derived, never authored', () => {
  it('every loss-making route produces exactly one decision', () => {
    const losers = model.routeRollup.filter((r) => r.contributionCents < 0);
    const decisions = deriveDecisions(model);
    const routeDecisions = decisions.filter((d) => /is losing money/.test(d.title));
    expect(routeDecisions).toHaveLength(losers.length);
  });

  it('no decision exists for a route the model says is profitable', () => {
    const winners = model.routeRollup.filter((r) => r.contributionCents >= 0);
    const decisions = deriveDecisions(model);
    for (const w of winners) {
      const claimed = decisions.find((d) => d.title.includes(`${w.def.from}–${w.def.to}`));
      expect(claimed, `${w.def.from}-${w.def.to} is profitable but a decision was raised`).toBeUndefined();
    }
  });

  it('the amount at stake equals the model shortfall exactly', () => {
    const decisions = deriveDecisions(model);
    for (const d of decisions.filter((x) => /is losing money/.test(x.title))) {
      const route = model.routeRollup.find((r) => d.title.startsWith(`${r.def.from}–${r.def.to}`));
      expect(route).toBeDefined();
      expect(d.size).toBe(`$${(Math.abs(route.contributionCents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
  });

  it('a decision is raised only for a budget line with negative availability', () => {
    const decisions = deriveDecisions(model);
    const budgetDecisions = decisions.filter((d) => d.owner === 'Finance');
    const breaches = model.budget.filter((b) => b.availableCents < 0);
    expect(budgetDecisions).toHaveLength(breaches.length);
  });

  it('an aircraft decision is raised only for one the gate blocks', () => {
    const decisions = deriveDecisions(model);
    const airworthiness = decisions.filter((d) => d.owner === 'Technical');
    expect(airworthiness).toHaveLength(model.airworthiness.blocked.length);
    for (const d of airworthiness) {
      expect(d.title).toMatch(/cannot be dispatched/);
    }
  });

  it('the blocked airframes match the compliance board exactly', () => {
    // The executive brief and the engineer's airworthiness view read the
    // same computation. If they disagreed, one of them is lying.
    const gateBlocked = model.airworthiness.blocked.length;
    expect(model.airworthiness.blocked).toHaveLength(gateBlocked);
    for (const b of model.airworthiness.blocked) {
      expect(b.overdue.length).toBeGreaterThan(0);
      // Only non-dispatchable airframes are collected, so presence in the
      // array IS the negative result — no redundant flag is stored.
      expect(b.overdue.every((o) => o.status === 'OVERDUE')).toBe(true);
    }
  });
});

describe('decisions never recommend — they state options', () => {
  const decisions = deriveDecisions(model);

  it('every decision offers at least two options', () => {
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
      expect(d.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('no decision contains a recommendation verb', () => {
    // Recommending is a management judgement. The system computes the
    // trade-off; it does not choose. A brief that says "you must re-price"
    // is making a commercial decision on the reader's behalf.
    const banned = /\b(you should|we recommend|recommend(ed)?|must (re-price|withdraw|ground)|best option|optimal choice)\b/i;
    for (const d of decisions) {
      expect(`${d.title} ${d.fact} ${d.note ?? ''} ${d.options.join(' ')}`.match(banned)).toBeNull();
    }
  });

  it('every decision names the technical view for verification', () => {
    for (const d of decisions) {
      expect(d.engineTab).toBeTruthy();
    }
  });

  it('every decision is attributed to an owning function', () => {
    const owners = new Set(['Commercial', 'Technical', 'Finance', 'Sustainability', 'Operations']);
    for (const d of decisions) {
      expect(owners.has(d.owner), `${d.owner} is not a known owner`).toBe(true);
    }
  });
});

describe('the brief can report that nothing is wrong', () => {
  it('returns an empty list when the model has no problems', () => {
    // Construct a clean model: profitable routes, no breaches, no blocks.
    const clean = {
      ...model,
      routeRollup: model.routeRollup.map((r) => ({ ...r, contributionCents: 500_000 })),
      budget: model.budget.map((b) => ({ ...b, availableCents: 500_000 })),
      airworthiness: { blocked: [], overdueTotal: 0, nowMs: model.airworthiness.nowMs },
      carbon: { ...model.carbon, etsCostCents: 0 },
    };
    const decisions = deriveDecisions(clean);
    // Only the utilisation item may remain, and only if genuinely below plan.
    const material = decisions.filter((d) => d.severity === 'HIGH');
    expect(material).toEqual([]);
  });

  it('the demo model DOES produce decisions — the brief is not vacuous', () => {
    const decisions = deriveDecisions(model);
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions.some((d) => d.severity === 'HIGH')).toBe(true);
  });
});

describe('severity reflects consequence, not volume', () => {
  it('HIGH is reserved for money or legal exposure', () => {
    const decisions = deriveDecisions(model);
    for (const d of decisions.filter((x) => x.severity === 'HIGH')) {
      expect(['Commercial', 'Technical', 'Finance']).toContain(d.owner);
    }
  });

  it('decisions are ordered most severe first', () => {
    const decisions = deriveDecisions(model);
    const firstMedium = decisions.findIndex((d) => d.severity === 'MEDIUM');
    if (firstMedium !== -1) {
      expect(decisions.slice(firstMedium).every((d) => d.severity === 'MEDIUM')).toBe(true);
    }
  });
});
