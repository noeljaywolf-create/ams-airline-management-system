/**
 * AMS — General Ledger.
 *
 * Plan step 5.1 (double-entry journals with a balance trigger), 5.2 (period
 * close state machine) and 5.9 (trial-balance hash publication).
 *
 * WHY DOUBLE-ENTRY IS THE NON-NEGOTIABLE PART
 * -------------------------------------------
 * AMS previously computed costs. Computing costs and accounting for them are
 * different jobs. Cost tells you what a flight cost; the ledger tells you
 * what the company owns, owes and earned, and — critically — proves the two
 * agree. Without a ledger there is no balance sheet, no trial balance, no
 * close, and no way to answer the only question an auditor actually asks:
 * "show me that the accounts foot."
 *
 * The rule this module exists to enforce: a journal does not post unless its
 * debits equal its credits, to the cent. One unbalanced journal is a rounding
 * error; a thousand are a company whose trial balance will not foot and
 * whose month-end takes three extra weeks to find.
 *
 * INTEGER CENTS, EVERYWHERE
 * -------------------------
 * Amounts are integer cents, never floats. `0.1 + 0.2 !== 0.3` is true in
 * IEEE 754 and it is how real ledgers acquire phantom imbalances that
 * nobody can reproduce.
 *
 * HONEST SCOPE
 * ------------
 * This is a real double-entry engine with a real period state machine. It is
 * NOT yet a tax engine, a consolidation engine, or an SAP General Ledger.
 * Multi-entity consolidation, FX revaluation, deferred tax and statutory
 * reporting are absent and must not be implied by the presence of a trial
 * balance.
 *
 * @module shared/src/ledger
 */

import { ACCOUNTS, CATEGORY_TO_ACCOUNT } from './accounts.js';

/**
 * @typedef {'OPEN'|'SOFT_CLOSED'|'HARD_CLOSED'} PeriodState
 *
 * @typedef {Object} JournalLine
 * @property {string} account
 * @property {number} [debitCents]   integer, >= 0
 * @property {number} [creditCents]  integer, >= 0
 * @property {string} [memo]
 *
 * @typedef {Object} Journal
 * @property {string} id
 * @property {string} period       YYYY-MM
 * @property {string} description
 * @property {string} source       subsystem that raised it
 * @property {JournalLine[]} lines
 * @property {string} postedAt     ISO-8601
 * @property {string} actorId
 *
 * @typedef {Object} GLResult
 * @property {boolean} ok
 * @property {string} [code]
 * @property {string} [message]
 * @property {Journal} [journal]
 * @property {number} [imbalanceCents]
 */

export class LedgerError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {object} [detail]
   */
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
    Object.assign(this, detail);
  }
}

/* ==================================================================== *
 * JOURNAL POSTING
 * ==================================================================== */

/**
 * Validate a set of lines without posting. Separated from `post()` so the
 * UI can validate a form as the accountant types, using exactly the same
 * rules the ledger enforces on posting.
 *
 * One flat result shape rather than a discriminated union: under checkJs the
 * union defeated narrowing in every consumer, and a caller that had to cast
 * before reading `code` is a caller that eventually forgets to check `ok`.
 * `ok` is the only thing a caller must test.
 *
 * @param {{account: string, debitCents?: number, creditCents?: number}[]} lines
 * @returns {{ok: boolean, message: string, code?: string,
 *            debitCents?: number, creditCents?: number, imbalanceCents?: number}}
 */
export function validateJournal(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return { ok: false, code: 'JOURNAL_TOO_SHORT', message: 'A journal needs at least two lines.' };
  }

  let debit = 0;
  let credit = 0;

  for (const [i, line] of lines.entries()) {
    const d = line.debitCents ?? 0;
    const c = line.creditCents ?? 0;

    if (!Number.isInteger(d) || !Number.isInteger(c)) {
      return {
        ok: false,
        code: 'NON_INTEGER_CENTS',
        message: `Line ${i + 1}: amounts must be whole cents. A float amount is a defect, not a rounding case.`,
      };
    }
    if (d < 0 || c < 0) {
      return { ok: false, code: 'NEGATIVE_AMOUNT', message: `Line ${i + 1}: amounts cannot be negative. Use the opposite side.` };
    }
    if (d > 0 && c > 0) {
      return { ok: false, code: 'BOTH_SIDES', message: `Line ${i + 1}: a line cannot be both a debit and a credit. Split it.` };
    }
    if (d === 0 && c === 0) {
      return { ok: false, code: 'ZERO_LINE', message: `Line ${i + 1}: a zero line is not a posting. Remove it.` };
    }
    if (!ACCOUNTS[line.account]) {
      return { ok: false, code: 'UNKNOWN_ACCOUNT', message: `Line ${i + 1}: unknown account ${line.account}.` };
    }

    debit += d;
    credit += c;
  }

  if (debit !== credit) {
    // The exact imbalance, in cents. An accountant who can see "out by 1
    // cent" fixes it in seconds; one shown only "does not balance" spends an
    // hour looking for it.
    const imbalance = debit - credit;
    return {
      ok: false,
      code: 'JOURNAL_OUT_OF_BALANCE',
      imbalanceCents: imbalance,
      message: `Journal is out of balance by ${imbalance} cents `
        + `(debits ${debit}, credits ${credit}). It cannot be posted.`,
    };
  }

  return { ok: true, message: 'Journal balances.', debitCents: debit, creditCents: credit };
}

/**
 * Create the general ledger and its period state machine.
 *
 * @param {{actorId?: string}} [opts]
 */
export function createGL(opts = {}) {
  const actorId = opts.actorId ?? 'system';

  /** @type {Journal[]} */
  const journals = [];
  /** @type {Map<string, PeriodState>} */
  const periodState = new Map();
  /** @type {Map<string, string>} */
  const reopened = new Map();

  let seq = 0;

  const stateOf = (period) => periodState.get(period) ?? 'OPEN';

  /**
   * Post a balanced journal to an open period.
   * @param {{period: string, description: string, source?: string,
   *          lines: JournalLine[], actorId?: string}} input
   * @returns {GLResult}
   */
  function post(input) {
    const period = input.period;
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return { ok: false, code: 'BAD_PERIOD', message: `Period must be YYYY-MM, received "${period}".` };
    }

    const state = stateOf(period);
    if (state === 'HARD_CLOSED') {
      // Enforced HERE, not by convention at a controller. A hard-closed
      // period that a later release can quietly post into is not closed.
      return {
        ok: false,
        code: 'PERIOD_HARD_CLOSED',
        message: `${period} is hard closed. Posting requires a reopen by the accounting officer, `
          + 'which is itself audited.',
      };
    }

    const check = validateJournal(input.lines);
    if (!check.ok) return check;

    const journal = {
      id: `JE-${String(++seq).padStart(6, '0')}`,
      period,
      description: input.description,
      source: input.source ?? 'manual',
      lines: input.lines.map((l) => ({ ...l, debitCents: l.debitCents ?? 0, creditCents: l.creditCents ?? 0 })),
      postedAt: new Date().toISOString(),
      actorId: input.actorId ?? actorId,
    };
    journals.push(journal);
    return { ok: true, journal };
  }

  /**
   * Convenience: post a two-sided entry given account + cents + contra account.
   * Used by the cost-bridge and the AP/AR modules, which almost always post
   * a simple pair.
   *
   * @param {{period: string, description: string, account: string,
   *          contraAccount: string, cents: number, source?: string,
   *          actorId?: string}} input
   * @returns {GLResult}
   */
  function postSimple(input) {
    return post({
      period: input.period,
      description: input.description,
      source: input.source ?? 'system',
      actorId: input.actorId,
      lines: [
        { account: input.account, debitCents: input.cents, creditCents: 0 },
        { account: input.contraAccount, debitCents: 0, creditCents: input.cents },
      ],
    });
  }

  /**
   * Trial balance at a point in time.
   *
   * @param {string} [period] include this period and all before; omit for all
   * @returns {{rows: Array<{account: string, name: string, type: string,
   *   bucket: string|null, debitCents: number, creditCents: number,
   *   balanceCents: number}>,
   *   debitCents: number, creditCents: number, balanced: boolean}}
   */
  function trialBalance(period) {
    /** @type {Map<string, {debitCents: number, creditCents: number}>} */
    const byAccount = new Map();
    for (const j of journals) {
      if (period && j.period > period) continue;
      for (const l of j.lines) {
        const row = byAccount.get(l.account) ?? { debitCents: 0, creditCents: 0 };
        row.debitCents += l.debitCents;
        row.creditCents += l.creditCents;
        byAccount.set(l.account, row);
      }
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const rows = [...byAccount.entries()]
      .map(([code, v]) => {
        totalDebit += v.debitCents;
        totalCredit += v.creditCents;
        return {
          account: code,
          name: ACCOUNTS[code]?.name ?? 'UNKNOWN',
          type: ACCOUNTS[code]?.type ?? 'UNKNOWN',
          bucket: ACCOUNTS[code]?.bucket ?? null,
          debitCents: v.debitCents,
          creditCents: v.creditCents,
          balanceCents: v.debitCents - v.creditCents,
        };
      })
      .sort((a, b) => a.account.localeCompare(b.account));

    return {
      rows,
      debitCents: totalDebit,
      creditCents: totalCredit,
      balanced: totalDebit === totalCredit,
    };
  }

  /**
   * Profit and loss. Revenue positive, expenses positive, result = revenue -
   * expenses. Presented the way an airline P&L is read, so operating result
   * is visible before finance costs and tax.
   *
   * @param {string} [period]
   */
  function incomeStatement(period) {
    const tb = trialBalance(period);
    let revenue = 0;
    let flightAttributable = 0;
    let fleetFixed = 0;
    let periodCost = 0;
    let financeCost = 0;
    let tax = 0;

    for (const r of tb.rows) {
      // A credit-balance revenue account is revenue. Assets and expenses
      // carry debit balances.
      const amount = r.type === 'REVENUE' ? r.creditCents - r.debitCents : r.debitCents - r.creditCents;
      if (r.type === 'REVENUE') { revenue += amount; continue; }
      if (r.type !== 'EXPENSE') continue;
      if (r.account === '8100') { financeCost += amount; continue; }
      if (r.account === '8200') { tax += amount; continue; }
      if (r.bucket === 'FLIGHT_ATTRIBUTABLE') flightAttributable += amount;
      else if (r.bucket === 'FLEET_FIXED') fleetFixed += amount;
      else periodCost += amount;
    }

    const operatingCost = flightAttributable + fleetFixed + periodCost;
    const operatingResult = revenue - operatingCost;

    return {
      revenueCents: revenue,
      flightAttributableCents: flightAttributable,
      fleetFixedCents: fleetFixed,
      periodCostCents: periodCost,
      operatingCostCents: operatingCost,
      operatingResultCents: operatingResult,
      financeCostCents: financeCost,
      taxCents: tax,
      netResultCents: operatingResult - financeCost - tax,
      operatingMarginPpm: revenue === 0 ? 0
        : Math.round((operatingResult / revenue) * 1_000_000),
    };
  }

  /**
   * Balance sheet. Assets less liabilities and equity. `balanced` is the
   * proof: in a correct double-entry system this is always true, so a false
   * here means a posting bypassed the balance trigger.
   *
   * @param {string} [period]
   */
  function balanceSheet(period) {
    const tb = trialBalance(period);
    let assets = 0;
    let liabilities = 0;
    let equity = 0;

    for (const r of tb.rows) {
      if (r.type === 'ASSET') assets += r.balanceCents;
      else if (r.type === 'LIABILITY') liabilities += -r.balanceCents;
      else if (r.type === 'EQUITY') equity += -r.balanceCents;
    }

    const pl = incomeStatement(period);
    // Retained earnings absorbs the current-period result so the sheet
    // balances before a close is run. This is the classic unclosed-period
    // adjustment, and hiding it would make the sheet balance for the wrong
    // reason.
    equity += pl.netResultCents;

    return {
      assetsCents: assets,
      liabilitiesCents: liabilities,
      equityCents: equity,
      liabilitiesAndEquityCents: liabilities + equity,
      balanced: assets === liabilities + equity,
      differenceCents: assets - (liabilities + equity),
    };
  }

  /* ---- period state machine (plan step 5.2) ---- */

  /** @param {string} period */
  function softClose(period) {
    if (stateOf(period) === 'HARD_CLOSED') {
      return { ok: false, code: 'ALREADY_HARD_CLOSED', message: `${period} is hard closed.` };
    }
    const tb = trialBalance(period);
    if (!tb.balanced) {
      return {
        ok: false,
        code: 'TRIAL_BALANCE_UNBALANCED',
        message: `${period} cannot be soft closed: trial balance differs by `
          + `${tb.debitCents - tb.creditCents} cents.`,
      };
    }
    periodState.set(period, 'SOFT_CLOSED');
    return { ok: true, state: 'SOFT_CLOSED' };
  }

  /** @param {string} period */
  function hardClose(period) {
    if (stateOf(period) !== 'SOFT_CLOSED') {
      return {
        ok: false,
        code: 'MUST_SOFT_CLOSE_FIRST',
        message: `${period} must be soft closed before it can be hard closed.`,
      };
    }
    periodState.set(period, 'HARD_CLOSED');
    return { ok: true, state: 'HARD_CLOSED' };
  }

  /**
   * Reopen. Requires explicit accounting-officer authority AND a mandatory
   * reason, because "someone reopened last month and nobody knows why" is the
   * normal state in most finance departments and it is why nobody trusts
   * their own numbers.
   *
   * @param {{period: string, actorId: string, roles: string[], reason: string}} input
   */
  function reopen(input) {
    if (!input.roles?.includes('accounting_officer') && !input.roles?.includes('controller')) {
      return {
        ok: false,
        code: 'REOPEN_NOT_AUTHORISED',
        message: `${input.actorId} may not reopen a closed period. `
          + 'Reopening requires the accounting officer or the controller.',
      };
    }
    if (!input.reason || input.reason.trim().length < 10) {
      return {
        ok: false,
        code: 'REASON_REQUIRED',
        message: 'A reopen reason of at least 10 characters is mandatory and is written to the audit trail.',
      };
    }
    const previous = stateOf(input.period);
    periodState.set(input.period, 'OPEN');
    reopened.set(input.period, input.reason);
    return { ok: true, state: 'OPEN', previous, reason: input.reason };
  }

  /** Reopen events for the audit trail. */
  const reopenLog = () => [...reopened.entries()].map(([period, reason]) => ({ period, reason }));

  return {
    journals,
    post,
    postSimple,
    trialBalance,
    incomeStatement,
    balanceSheet,
    softClose,
    hardClose,
    reopen,
    reopenLog,
    periodStateOf: stateOf,
    /** Postings accepted into a period, for the close checklist. */
    countIn: (period) => journals.filter((j) => j.period === period).length,
  };
}

/**
 * The trial balance as a deterministic serialisation, for hashing.
 *
 * Plan step 5.9: because the audit log is hash-chained and a period is
 * closed, the trial balance becomes a deterministic function of append-only
 * data and can be published for external verification. Determinism is the
 * whole point — run it twice and you MUST get the same hash. If you do not,
 * something in the period is mutable and the guarantee is void.
 *
 * Rows are sorted and amounts rendered as decimal strings so that no float
 * formatting or object key order can perturb the digest.
 *
 * @param {ReturnType<createGL>} gl
 * @param {string} [period]
 * @returns {string}
 */
export function canonicalTrialBalance(gl, period) {
  const tb = gl.trialBalance(period);
  const rows = tb.rows
    .map((r) => `${r.account}|${r.debitCents}|${r.creditCents}`)
    .join('\n');
  return [
    `period=${period ?? 'ALL'}`,
    `debits=${tb.debitCents}`,
    `credits=${tb.creditCents}`,
    rows,
  ].join('\n');
}

/**
 * Every cost category posted as a balanced accrual against the operating
 * accounts, for the model-to-GL bridge.
 *
 * The expense side is explicit rather than derived: it is the chart that
 * decides what the P&L looks like, and a derivation would quietly drift.
 *
 * The period is NOT a parameter here. It belongs to `post()`, which is the
 * only thing that may assign a journal to a period — taking it here would
 * invite two functions disagreeing about which period a posting lands in.
 *
 * @param {{byCategory: Record<string, number>, contraAccount?: string}} input
 * @returns {JournalLine[]}
 */
export function costBridgeLines({ byCategory, contraAccount = '2100' }) {
  /** @type {JournalLine[]} */
  const lines = [];
  for (const [category, cents] of Object.entries(byCategory)) {
    const account = CATEGORY_TO_ACCOUNT[category];
    if (!account || cents === 0) continue;
    lines.push({ account, debitCents: cents, creditCents: 0, memo: category });
  }
  const total = lines.reduce((a, l) => a + l.debitCents, 0);
  if (total > 0) lines.push({ account: contraAccount, debitCents: 0, creditCents: total, memo: 'accrual' });
  return lines;
}