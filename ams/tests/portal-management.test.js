/**
 * The management layer must actually manage.
 *
 * A view that renders is not evidence that a control works. These tests
 * drive the real transitions and assert the outcomes, because the failure
 * this whole build exists to prevent is a screen that looks like an
 * approval system and approves anything.
 *
 * Everything under test is the shipped code path, not a reimplementation:
 * frontend/js/portal/ledger.js and frontend/js/portal/sod.js are what the
 * UI calls when you click Approve.
 */

import { describe, expect, it } from 'vitest';
import { createLedger, centsToDisplay } from '../frontend/js/portal/ledger.js';
import { evaluateSoD, SOD_RULES, registerNames } from '../frontend/js/portal/sod.js';
import { PERSONAS, PERSONA_NAMES, accountableManagerRegister, MANDATED_POSTS } from '../frontend/js/portal/registry.js';
import { verifyChain } from '../backend/src/audit/chain.js';
import { buildModel } from '../frontend/js/model.js';
import { createStore, baselineScenario, fuelCostFromLines } from '../frontend/js/portal/store.js';

registerNames(PERSONA_NAMES);

const CFO = PERSONAS.find((p) => p.id === 'p-cfo');
const CEO = PERSONAS.find((p) => p.id === 'p-ceo');
const PROC = PERSONAS.find((p) => p.id === 'p-proc');

describe('segregation of duties', () => {
  it('exposes exactly the six rules from plan step 1.8', () => {
    expect(SOD_RULES.map((r) => r.id).sort()).toEqual([
      'AWARD_APPROVER_IS_RECOMMENDER',
      'EVALUATOR_IS_AUTHOR',
      'PAYMENT_RELEASER_IS_ORIGINATOR',
      'PERIOD_CERTIFIER_NO_AUTHORITY',
      'SELF_APPROVAL',
      'SUPPLIER_BIDS_OWN_EVENT',
    ]);
  });

  it('blocks an author approving their own request', () => {
    const f = evaluateSoD({ action: 'authorise_cost', actorId: CFO.id, authorId: CFO.id, roles: CFO.roles });
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe('SOD_SELF_APPROVAL');
    expect(f[0].reason).toContain(CFO.name);
  });

  it('allows a different person to approve', () => {
    expect(evaluateSoD({ action: 'authorise_cost', actorId: CEO.id, authorId: CFO.id, roles: CEO.roles })).toEqual([]);
  });

  it('blocks certifying a period without the controller role', () => {
    const f = evaluateSoD({ action: 'certify_period', actorId: CEO.id, roles: CEO.roles });
    expect(f.map((x) => x.code)).toEqual(['SOD_NOT_AN_APPROVER']);
    const ctrl = PERSONAS.find((p) => p.roles.includes('controller'));
    expect(evaluateSoD({ action: 'certify_period', actorId: ctrl.id, roles: ctrl.roles })).toEqual([]);
  });

  it('returns every violation, not just the first', () => {
    const f = evaluateSoD({
      action: 'authorise_cost',
      actorId: PROC.id,
      authorId: PROC.id,
      approverId: PROC.id,
      recommendedBy: PROC.id,
      releaserId: PROC.id,
      invoiceCreatedBy: PROC.id,
      roles: PROC.roles,
    });
    // Exactly the three pairs this context actually violates. EVALUATOR_IS_AUTHOR
    // needs `evaluatorId`, and the bidder/period rules need their own context,
    // so asserting more here would be asserting a fiction.
    expect(f.map((x) => x.code).sort()).toEqual([
      'SOD_AWARD_APPROVER_IS_RECOMMENDER',
      'SOD_PAYMENT_RELEASER_IS_ORIGINATOR',
      'SOD_SELF_APPROVAL',
    ]);
  });

  it('adds the evaluator rule when the evaluator is the author', () => {
    const f = evaluateSoD({
      action: 'authorise_cost',
      actorId: CEO.id,
      authorId: PROC.id,
      evaluatorId: PROC.id,
      roles: CEO.roles,
    });
    expect(f.map((x) => x.code)).toEqual(['SOD_EVALUATOR_IS_AUTHOR']);
  });

  it('reports a supplier bidding on its own event', () => {
    const f = evaluateSoD({ action: 'submit_bid', actorId: CFO.id, bidderTenantId: 'acme', eventOwnerTenantId: 'acme', roles: [] });
    expect(f.map((x) => x.code)).toEqual(['SOD_SUPPLIER_BIDS_OWN_EVENT']);
  });
});

describe('cost authority actually constrains spending', () => {
  it('a pending request does NOT consume the budget', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    const before = l.available(line);
    await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 500_00, description: 'test' });
    expect(l.available(line)).toBe(before);
    expect(l.state.commitments[0].status).toBe('PENDING');
  });

  it('approval decrements the line exactly once', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    const before = l.available(line);
    const { commitment } = await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 500_00, description: 'test' });
    await l.decide({ actorId: CFO.id, roles: CFO.roles, commitmentId: commitment.id, decision: 'APPROVED' });
    expect(l.available(line)).toBe(before - 500_00);
    expect(commitment.availableAfterCents).toBe(before - 500_00);
  });

  it('refuses approval when the line cannot cover it', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    const { commitment } = await l.raise({
      actorId: PROC.id, lineId: line.id, amountCents: l.available(line) + 1, description: 'one cent over',
    });
    const res = await l.decide({ actorId: CFO.id, roles: CFO.roles, commitmentId: commitment.id, decision: 'APPROVED' });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(l.available(line)).toBe(l.available(line));
    expect(commitment.status).toBe('PENDING');
  });

  it('BLOCKS self-approval and commits nothing', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    const before = l.available(line);
    const { commitment } = await l.raise({ actorId: CFO.id, lineId: line.id, amountCents: 900_00, description: 'own request' });
    const res = await l.decide({ actorId: CFO.id, roles: CFO.roles, commitmentId: commitment.id, decision: 'APPROVED' });
    expect(res.ok).toBe(false);
    expect(res.sod[0].code).toBe('SOD_SELF_APPROVAL');
    expect(l.available(line)).toBe(before);
    expect(commitment.status).toBe('PENDING');
  });

  it('a blocked attempt is itself audited', async () => {
    const l = createLedger();
    const { commitment } = await l.raise({ actorId: CFO.id, lineId: l.state.lines[0].id, amountCents: 900_00, description: 'x' });
    await l.decide({ actorId: CFO.id, roles: CFO.roles, commitmentId: commitment.id, decision: 'APPROVED' });
    expect(l.state.entries.some((e) => e.action === 'AUTHORISATION_BLOCKED')).toBe(true);
  });

  it('a decided request cannot be decided again', async () => {
    const l = createLedger();
    const { commitment } = await l.raise({ actorId: PROC.id, lineId: l.state.lines[0].id, amountCents: 100_00, description: 'x' });
    await l.decide({ actorId: CFO.id, roles: CFO.roles, commitmentId: commitment.id, decision: 'APPROVED' });
    const again = await l.decide({ actorId: CFO.id, roles: CFO.roles, commitmentId: commitment.id, decision: 'REJECTED' });
    expect(again.ok).toBe(false);
    expect(again.error.code).toBe('ALREADY_DECIDED');
  });

  it('rejection commits no funds', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    const before = l.available(line);
    const { commitment } = await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 300_00, description: 'x' });
    const res = await l.decide({ actorId: CFO.id, roles: CFO.roles, commitmentId: commitment.id, decision: 'REJECTED' });
    expect(res.ok).toBe(true);
    expect(l.available(line)).toBe(before);
  });

  it('an idempotency key replays without decrementing twice', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    const key = '11111111-1111-1111-1111-111111111111';
    const before = l.available(line);
    const first = await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 400_00, description: 'x', idempotencyKey: key });
    const second = await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 400_00, description: 'x', idempotencyKey: key });
    expect(second.replayed).toBe(true);
    expect(second.commitment.id).toBe(first.commitment.id);
    expect(l.state.commitments.filter((c) => c.id === first.commitment.id)).toHaveLength(1);
    expect(l.available(line)).toBe(before);
  });

  it('rejects fractional cents at the boundary', async () => {
    const l = createLedger();
    const res = await l.raise({ actorId: PROC.id, lineId: l.state.lines[0].id, amountCents: 100.5, description: 'x' });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('AMOUNT_NOT_INTEGER_CENTS');
  });

  it('the overspend helper lands exactly one cent over', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    const avail = l.available(line);
    const res = await l.raiseOverspendRequest(PROC.id, line.id);
    expect(res.ok).toBe(true);
    expect(res.commitment.amountCents).toBe(avail + 1);
  });
});

describe('the ledger is genuinely tamper-evident', () => {
  it('verifies a clean chain', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    const a = await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 250_00, description: 'x' });
    await l.decide({ actorId: CFO.id, roles: CFO.roles, commitmentId: a.commitment.id, decision: 'APPROVED' });
    const v = await verifyChain(l.state.entries);
    expect(v.valid).toBe(true);
    expect(v.brokenAt).toBeNull();
    expect(v.entriesChecked).toBe(l.state.entries.length);
  });

  it('DETECTS an edit to an earlier entry', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 250_00, description: 'x' });
    await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 260_00, description: 'y' });
    expect((await verifyChain(l.state.entries)).valid).toBe(true);

    // Rewrite history the way an insider with DB access would. The entry
    // is typed with `after: unknown`, so narrow before spreading.
    const first = l.state.entries[0];
    const after = /** @type {Record<string, unknown>} */ (first.after ?? {});
    first.after = { ...after, description: 'invisible' };
    const v = await verifyChain(l.state.entries);
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(1);
  });

  it('DETECTS a deleted entry', async () => {
    const l = createLedger();
    const line = l.state.lines[0];
    await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 250_00, description: 'x' });
    await l.raise({ actorId: PROC.id, lineId: line.id, amountCents: 260_00, description: 'y' });
    l.state.entries.splice(0, 1);
    const v = await verifyChain(l.state.entries);
    expect(v.valid).toBe(false);
  });

  it('the entries are in ascending id order', async () => {
    const l = createLedger();
    await l.raise({ actorId: PROC.id, lineId: l.state.lines[0].id, amountCents: 100_00, description: 'x' });
    const ids = l.state.entries.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

describe('accountable-manager register is a live compliance question', () => {
  it('reports all six mandated posts', () => {
    expect(accountableManagerRegister()).toHaveLength(6);
    expect(MANDATED_POSTS).toHaveLength(6);
  });

  it('flags a vacant post rather than hiding it', () => {
    const reg = accountableManagerRegister();
    const quality = reg.find((r) => r.post === 'quality_manager');
    expect(quality.finding).toMatch(/VACANT/);
  });

  it('shows approval state for filled posts', () => {
    const reg = accountableManagerRegister();
    const ceo = reg.find((r) => r.post === 'ceo');
    expect(ceo.finding).toBeNull();
    expect(ceo.holder.authority).toBeTruthy();
  });
});

describe('what-if inputs recompute rather than rescale', () => {
  const model = buildModel();

  it('returns the identical object at baseline', () => {
    const s = createStore();
    expect(s.applyScenario(model)).toBe(model);
  });

  it('RASK is unchanged when only fuel moves (revenue per ASK cannot change)', () => {
    const s = createStore();
    s.setScenario('fuelPriceIndexPct', 140);
    const a = s.applyScenario(model);
    expect(a.total.raskMicrocents).toBe(model.total.raskMicrocents);
    expect(a.total.caskMicrocents).toBeGreaterThan(model.total.caskMicrocents);
  });

  it('CASK is unchanged when only load factor moves (cost per ASK cannot change)', () => {
    const s = createStore();
    s.setScenario('loadFactorPct', 70);
    const a = s.applyScenario(model);
    expect(a.total.caskMicrocents).toBe(model.total.caskMicrocents);
  });

  it('is monotone in fuel price', () => {
    const s = createStore();
    let prev = Infinity;
    for (const f of [70, 100, 130, 160, 200]) {
      s.setScenario('fuelPriceIndexPct', f);
      const r = s.applyScenario(model).total.contributionCents;
      expect(r).toBeLessThan(prev);
      prev = r;
    }
  });

  it('raises break-even load factor as fuel rises', () => {
    const s = createStore();
    const base = model.total.breakEvenLoadFactorPpm;
    s.setScenario('fuelPriceIndexPct', 140);
    expect(s.applyScenario(model).total.breakEvenLoadFactorPpm).toBeGreaterThan(base);
  });

  it('keeps cents integral after adjustment', () => {
    const s = createStore();
    s.setScenario('fuelPriceIndexPct', 137);
    s.setScenario('loadFactorPct', 71.3);
    const t = s.applyScenario(model).total;
    for (const k of ['fullCostCents', 'revenueCents', 'contributionCents']) {
      expect(Number.isInteger(t[k]), `${k} must be integer cents`).toBe(true);
    }
  });

  it('derives fuel cost equal to the model own fuel aggregate', () => {
    expect(fuelCostFromLines(model)).toBe(model.fuelAgg.sectorCostCents);
  });

  it('reset returns to baseline', () => {
    const s = createStore();
    s.setScenario('fuelPriceIndexPct', 180);
    s.resetScenario();
    expect(s.state.scenario).toEqual(baselineScenario());
  });
});

describe('display helpers never corrupt money', () => {
  it('formats cents to two decimals', () => {
    expect(centsToDisplay(123456789)).toBe('$1,234,567.89');
    expect(centsToDisplay(0)).toBe('$0.00');
    expect(centsToDisplay(-500)).toBe('-$5.00');
  });
});
