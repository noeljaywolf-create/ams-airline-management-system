/**
 * The general ledger must be a real double-entry system.
 *
 * A cost model that produces numbers is not an accounting system. These
 * tests pin the properties that make it one: journals only post balanced,
 * the trial balance always foots, the balance sheet balances for the right
 * reason, a closed period rejects postings, and the published trial-balance
 * hash is deterministic.
 *
 * Every assertion here is about an INVARIANT, not a frozen figure, so the
 * tests survive recalibration of the underlying model.
 */

import { describe, expect, it } from 'vitest';
import {
  createGL, validateJournal, canonicalTrialBalance, costBridgeLines,
} from '../shared/src/ledger.js';
import {
  CHART_OF_ACCOUNTS, ACCOUNTS, CATEGORY_TO_ACCOUNT, assertTaxonomyComplete,
  categoryTotalsToAccounts,
} from '../shared/src/accounts.js';
import { COST_CATEGORIES } from '../shared/src/domain.js';

/**
 * Narrow a validation result to its failure branch.
 *
 * `expect(r.ok).toBe(false)` asserts at runtime but does NOT narrow the
 * union for the type-checker, so `r.code` stays an error. This guard does
 * both: it throws if the journal was unexpectedly accepted, and it narrows.
 *
 * @param {ReturnType<typeof validateJournal>} r
 * @returns {{ok: false, code: string, message: string, imbalanceCents?: number}}
 */
/** Narrow to the success branch. @param {ReturnType<typeof validateJournal>} r */
function accepted(r) {
  if (!r.ok) throw new Error(`expected the journal to validate, but it was rejected: ${r.message}`);
  return r;
}

function rejected(r) {
  if (r.ok) throw new Error('expected the journal to be rejected, but it validated');
  // The cast is belt-and-braces: the guard above already excludes the
  // success branch, but JSDoc narrowing does not always survive a union
  // whose success arm omits `code` entirely.
  return /** @type {{ok: false, code: string, message: string, imbalanceCents?: number}} */ (r);
}

describe('chart of accounts', () => {
  it('maps every cost category to a general ledger account', () => {
    expect(() => assertTaxonomyComplete()).not.toThrow();
  });

  it('has no duplicate account codes', () => {
    const codes = CHART_OF_ACCOUNTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('marks contra accounts so an asset cannot be double-negated', () => {
    expect(ACCOUNTS['1590'].contra).toBe(true);
    expect(ACCOUNTS['1500'].contra).toBeUndefined();
  });

  it('gives every expense a structural bucket, and every balance-sheet account none', () => {
    for (const a of CHART_OF_ACCOUNTS) {
      if (a.type === 'EXPENSE') expect(a.bucket, `${a.code} ${a.name}`).toBeTruthy();
      if (a.type === 'ASSET' || a.type === 'LIABILITY' || a.type === 'EQUITY') {
        expect(a.bucket, `${a.code} ${a.name} must not be in a cost bucket`).toBeNull();
      }
    }
  });

  it('rolls cost categories up to accounts without losing a cent', () => {
    const byCategory = { fuel: 100, catering: 250, maintenance_direct: 50 };
    const total = [...categoryTotalsToAccounts(byCategory).values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(400);
  });
});

describe('the balance trigger (plan step 5.1)', () => {
  it('refuses a journal that differs by one cent, and says by how much', () => {
    const r = validateJournal([
      { account: '5100', debitCents: 100 },
      { account: '2100', creditCents: 99 },
    ]);
    const f = rejected(r);
    expect(f.code).toBe('JOURNAL_OUT_OF_BALANCE');
    expect(r.imbalanceCents).toBe(1);
    expect(r.message).toMatch(/1 cents/);
  });

  it('refuses a float amount', () => {
    const r = validateJournal([
      { account: '5100', debitCents: 100.5 },
      { account: '2100', creditCents: 100.5 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NON_INTEGER_CENTS');
  });

  it('refuses a line that is both a debit and a credit', () => {
    const r = validateJournal([
      { account: '5100', debitCents: 10, creditCents: 10 },
      { account: '2100', creditCents: 20 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('BOTH_SIDES');
  });

  it('refuses a negative amount rather than silently netting it', () => {
    const r = validateJournal([
      { account: '5100', debitCents: -50 },
      { account: '2100', creditCents: -50 },
    ]);
    expect(r.code).toBe('NEGATIVE_AMOUNT');
  });

  it('refuses a zero line', () => {
    const r = validateJournal([
      { account: '5100', debitCents: 10, creditCents: 0 },
      { account: '2100', debitCents: 0, creditCents: 0 },
      { account: '1100', creditCents: 10 },
    ]);
    expect(r.code).toBe('ZERO_LINE');
  });

  it('refuses an unknown account', () => {
    const r = validateJournal([
      { account: '9999', debitCents: 10 },
      { account: '2100', creditCents: 10 },
    ]);
    expect(r.code).toBe('UNKNOWN_ACCOUNT');
  });

  it('accepts a balanced journal', () => {
    const r = validateJournal([
      { account: '5100', debitCents: 500 },
      { account: '2100', creditCents: 500 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.debitCents).toBe(500);
  });

  it('a rejected journal posts NOTHING', () => {
    const gl = createGL();
    gl.post({
      period: '2026-08',
      description: 'bad',
      lines: [{ account: '5100', debitCents: 100 }, { account: '2100', creditCents: 99 }],
    });
    expect(gl.journals).toHaveLength(0);
    expect(gl.trialBalance().balanced).toBe(true);
  });
});

describe('trial balance and financial statements', () => {
  /** A small, fully specified company. */
  function seeded() {
    const gl = createGL();
    gl.post({
      period: '2026-08',
      description: 'Passenger revenue received',
      lines: [{ account: '1100', debitCents: 10_000_000 }, { account: '4100', creditCents: 10_000_000 }],
    });
    gl.post({
      period: '2026-08',
      description: 'Fuel accrual',
      lines: [{ account: '5100', debitCents: 4_000_000 }, { account: '2100', creditCents: 4_000_000 }],
    });
    gl.post({
      period: '2026-08',
      description: 'Fleet fixed',
      lines: [{ account: '6100', debitCents: 2_000_000 }, { account: '2300', creditCents: 2_000_000 }],
    });
    return gl;
  }

  it('always foots', () => {
    const tb = seeded().trialBalance('2026-08');
    expect(tb.balanced).toBe(true);
    expect(tb.debitCents).toBe(tb.creditCents);
  });

  it('reports the operating result before finance costs and tax', () => {
    const gl = seeded();
    gl.post({
      period: '2026-08',
      description: 'Interest',
      lines: [{ account: '8100', debitCents: 300_000 }, { account: '2300', creditCents: 300_000 }],
    });
    const pl = gl.incomeStatement('2026-08');
    expect(pl.revenueCents).toBe(10_000_000);
    expect(pl.flightAttributableCents).toBe(4_000_000);
    expect(pl.fleetFixedCents).toBe(2_000_000);
    expect(pl.operatingResultCents).toBe(4_000_000);
    // Interest must NOT be inside operating result.
    expect(pl.netResultCents).toBe(3_700_000);
    expect(pl.operatingMarginPpm).toBe(400_000);
  });

  it('balances the balance sheet, and for the right reason', () => {
    const bs = seeded().balanceSheet('2026-08');
    expect(bs.balanced).toBe(true);
    expect(bs.differenceCents).toBe(0);
    expect(bs.assetsCents).toBe(bs.liabilitiesAndEquityCents);
  });

  it('keeps cumulative periods consistent with period-to-date', () => {
    const gl = seeded();
    gl.post({
      period: '2026-09',
      description: 'September revenue',
      lines: [{ account: '1100', debitCents: 1_000_000 }, { account: '4100', creditCents: 1_000_000 }],
    });
    const sep = gl.trialBalance('2026-09');
    const aug = gl.trialBalance('2026-08');
    expect(sep.debitCents).toBeGreaterThan(aug.debitCents);
    expect(sep.balanced).toBe(true);
  });
});

describe('period close state machine (plan step 5.2)', () => {
  function openGL() {
    const gl = createGL();
    gl.post({
      period: '2026-08',
      description: 'Opening',
      lines: [{ account: '1100', debitCents: 100 }, { account: '4100', creditCents: 100 }],
    });
    return gl;
  }

  it('will not hard close a period that was never soft closed', () => {
    expect(openGL().hardClose('2026-08').code).toBe('MUST_SOFT_CLOSE_FIRST');
  });

  it('closes OPEN -> SOFT_CLOSED -> HARD_CLOSED', () => {
    const gl = openGL();
    expect(gl.softClose('2026-08').ok).toBe(true);
    expect(gl.hardClose('2026-08').ok).toBe(true);
    expect(gl.periodStateOf('2026-08')).toBe('HARD_CLOSED');
  });

  it('REFUSES a posting into a hard-closed period', () => {
    const gl = openGL();
    gl.softClose('2026-08');
    gl.hardClose('2026-08');
    const late = gl.post({
      period: '2026-08',
      description: 'late supplier invoice',
      lines: [{ account: '5100', debitCents: 5 }, { account: '2100', creditCents: 5 }],
    });
    expect(late.ok).toBe(false);
    expect(late.code).toBe('PERIOD_HARD_CLOSED');
    expect(gl.journals.filter((j) => j.period === '2026-08')).toHaveLength(1);
  });

  it('refuses a reopen without accounting authority', () => {
    const gl = openGL();
    gl.softClose('2026-08');
    gl.hardClose('2026-08');
    const r = gl.reopen({ period: '2026-08', actorId: 'p-cfo', roles: ['approver'], reason: 'we need the number back' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('REOPEN_NOT_AUTHORISED');
  });

  it('refuses a reopen without a substantive reason', () => {
    const gl = openGL();
    gl.softClose('2026-08');
    gl.hardClose('2026-08');
    const r = gl.reopen({ period: '2026-08', actorId: 'p-controller', roles: ['controller'], reason: 'fix' });
    expect(r.code).toBe('REASON_REQUIRED');
  });

  it('records the reopen with its reason for the audit trail', () => {
    const gl = openGL();
    gl.softClose('2026-08');
    gl.hardClose('2026-08');
    const r = gl.reopen({
      period: '2026-08', actorId: 'p-controller', roles: ['controller'],
      reason: 'late fuel supplier invoice for August uplift',
    });
    expect(r.ok).toBe(true);
    expect(gl.reopenLog()).toEqual([
      { period: '2026-08', reason: 'late fuel supplier invoice for August uplift' },
    ]);
    expect(gl.periodStateOf('2026-08')).toBe('OPEN');
  });
});

describe('trial-balance hash publication (plan step 5.9)', () => {
  it('is byte-identical across independent computations', () => {
    const a = createGL();
    const b = createGL();
    for (const gl of [a, b]) {
      gl.post({
        period: '2026-08',
        description: 'revenue',
        lines: [{ account: '1100', debitCents: 7 }, { account: '4100', creditCents: 7 }],
      });
    }
    expect(canonicalTrialBalance(a, '2026-08')).toBe(canonicalTrialBalance(b, '2026-08'));
  });

  it('changes when a posting is added — a hash that never moves proves nothing', () => {
    const gl = createGL();
    gl.post({ period: '2026-08', description: 'x', lines: [{ account: '1100', debitCents: 1 }, { account: '4100', creditCents: 1 }] });
    const before = canonicalTrialBalance(gl, '2026-08');
    gl.post({ period: '2026-08', description: 'y', lines: [{ account: '5100', debitCents: 1 }, { account: '2100', creditCents: 1 }] });
    expect(canonicalTrialBalance(gl, '2026-08')).not.toBe(before);
  });

  it('distinguishes periods', () => {
    const gl = createGL();
    gl.post({ period: '2026-08', description: 'x', lines: [{ account: '1100', debitCents: 1 }, { account: '4100', creditCents: 1 }] });
    expect(canonicalTrialBalance(gl, '2026-08')).not.toBe(canonicalTrialBalance(gl));
  });

  it('serialises amounts as integers, so no float formatting can perturb it', () => {
    const gl = createGL();
    gl.post({ period: '2026-08', description: 'x', lines: [{ account: '1100', debitCents: 100000000 }, { account: '4100', creditCents: 100000000 }] });
    expect(canonicalTrialBalance(gl, '2026-08')).toContain('debits=100000000');
    expect(canonicalTrialBalance(gl, '2026-08')).not.toContain('e+');
  });
});

describe('model-to-GL bridge', () => {
  it('produces a journal that balances by construction', () => {
    const lines = costBridgeLines({
      byCategory: { fuel: 5_600_000_000, catering: 2_390_000_000, crew_flight: 900_000_000 },
    });
    expect(accepted(validateJournal(lines)).debitCents).toBeGreaterThan(0);
    const gl = createGL();
    const posted = gl.post({ period: '2026-08', description: 'Cost bridge', source: 'cost-bridge', lines });
    expect(posted.ok).toBe(true);
  });

  it('routes every category to a non-bucket balance-sheet contra account', () => {
    const lines = costBridgeLines({ byCategory: Object.fromEntries(COST_CATEGORIES.map((c) => [c, 100])) });
    const contra = lines.find((l) => l.creditCents > 0);
    expect(ACCOUNTS[contra.account].type).toBe('LIABILITY');
    expect(ACCOUNTS[contra.account].bucket).toBeNull();
  });

  it('makes flight-attributable cost visible in the P&L, separated from fleet-fixed', () => {
    const gl = createGL();
    gl.post({
      period: '2026-08',
      description: 'bridge',
      lines: costBridgeLines({ byCategory: { fuel: 3_000_000, lease_aircraft: 1_000_000, g_a: 500_000 } }),
    });
    const pl = gl.incomeStatement('2026-08');
    expect(pl.flightAttributableCents).toBe(3_000_000);
    expect(pl.fleetFixedCents).toBe(1_000_000);
    expect(pl.periodCostCents).toBe(500_000);
    expect(pl.operatingCostCents).toBe(4_500_000);
  });
});