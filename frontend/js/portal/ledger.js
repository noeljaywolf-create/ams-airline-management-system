/**
 * AMS — Cost Authority, interactive.
 *
 * The browser-side twin of backend/src/modules/finance/cost-authority.js.
 * The backend version is the production control and is Knex-backed: it locks
 * the budget row with SELECT ... FOR UPDATE inside a transaction, which is
 * what makes double-spend unrepresentable under concurrency.
 *
 * WHAT IS REAL HERE
 * -----------------
 *  - Integer cents. No floats anywhere near money.
 *  - Availability is checked and the decrement applied as one operation on
 *    one object. There is no window between the two.
 *  - Idempotency keys. A replayed request returns the ORIGINAL commitment
 *    and does not decrement a second time.
 *  - Every accepted transition appends to the tamper-evident chain from
 *    backend/src/audit/chain.js. Hashes are real SHA-256 via Web Crypto and
 *    verifyChain detects any later edit to an earlier entry.
 *  - Segregation of duties runs inside each transition, via portal/sod.js.
 *
 * WHAT IS NOT REAL, AND IS SAID SO IN THE UI
 * -------------------------------------------
 *  - No database. State lives in this module and dies on reload.
 *  - No authentication. Personas come from a select element.
 *  - No concurrency. A single-threaded browser cannot reproduce two
 *    simultaneous transactions, so the FOR UPDATE guarantee is described
 *    rather than demonstrated. The backend test is the thing that proves it.
 *
 * Claiming the demo proves double-spend safety would be false. It proves
 * the arithmetic, the SoD rules and the audit chain, in a browser.
 *
 * @module frontend/js/portal/ledger
 */

import { MoneyError } from '../../../shared/src/money.js?v=916b8a70583e';
import { evaluateSoD } from './sod.js?v=916b8a70583e';
import { canonicalise, computeHash, GENESIS_HASH } from '../../../backend/src/audit/chain.js?v=916b8a70583e';

/**
 * @typedef {Object} BudgetLine
 * @property {string} id
 * @property {string} label
 * @property {string} account
 * @property {number} allocatedCents
 * @property {number} [committedCents]
 *
 * @typedef {Object} Commitment
 * @property {string} id
 * @property {string} lineId
 * @property {string} reference
 * @property {string} description
 * @property {number} amountCents
 * @property {string} status      DRAFT | PENDING | APPROVED | REJECTED
 * @property {string} authorId
 * @property {string} [approverId]
 * @property {string} [rejectedBy]
 * @property {string} [reason]
 * @property {string} createdAt
 * @property {string} [decidedAt]
 * @property {number} availableAfterCents
 * @property {boolean} [replayed]
 *
 * @typedef {import('../../../backend/src/audit/chain.js?v=916b8a70583e').AuditEntry} AuditEntry
 *
 * @typedef {Object} LedgerState
 * @property {BudgetLine[]} lines
 * @property {Commitment[]} commitments
 * @property {AuditEntry[]} entries
 */

const TENANT = 'zimair';

/** Seed budget lines. Small numbers on purpose: the point is the control, not the scale. */
const SEED_LINES = [
  {
    id: 'bl-insurance', label: 'Insurance', account: '5100 Hull & liability',
    allocatedCents: 6_400_000_00, committedCents: 4_560_000_00,
  },
  {
    id: 'bl-saf', label: 'SAF Compliance', account: '5410 Sustainable aviation fuel',
    allocatedCents: 9_000_000_00, committedCents: 6_240_000_00,
  },
  {
    id: 'bl-maint', label: 'Maintenance materials', account: '5300 Components & materials',
    allocatedCents: 4_100_000_00, committedCents: 1_980_000_00,
  },
  {
    id: 'bl-bfu', label: 'Base flight hours', account: '5200 Flight hours',
    allocatedCents: 3_250_000_00, committedCents: 2_640_000_00,
  },
  {
    id: 'bl-disp', label: 'Dispatch & nav aids', account: '5500 Navigation & dispatch',
    allocatedCents: 900_000_00, committedCents: 742_000_00,
  },
];

export function createLedger() {
  /** @type {LedgerState} */
  const state = {
    lines: SEED_LINES.map((l) => ({ ...l })),
    commitments: [],
    entries: [],
  };

  /** Idempotency map: key -> commitment id. Plan step 1.10. */
  const byIdempotencyKey = new Map();

  let seq = 0;
  const nextId = (p) => `${p}-${String(++seq).padStart(4, '0')}`;

  /**
   * Append to the hash chain. Every accepted transition goes through here,
   * so the ledger and the audit trail cannot drift apart.
   * @param {string} actorId
   * @param {string} action
   * @param {string|number} entityId
   * @param {unknown} before
   * @param {unknown} after
   */
  async function append(actorId, action, entityId, before, after) {
    const prev = state.entries.length ? state.entries[state.entries.length - 1].entryHash : GENESIS_HASH;
    const entry = {
      id: state.entries.length + 1,
      tenantId: TENANT,
      actorId,
      entityType: 'cost_commitment',
      entityId,
      action,
      before,
      after,
      ip: 'demo',
      occurredAt: new Date().toISOString(),
      // Placeholder: the real hash is computed immediately below and
      // overwrites this. An entry is never stored with the placeholder.
      entryHash: '',
    };
    // eslint-disable-next-line no-await-in-loop -- chain entries are sequential by construction
    entry.entryHash = await computeHash(entry, prev);
    state.entries.push(entry);
    return entry;
  }

  const findLine = (id) => state.lines.find((l) => l.id === id);

  const available = (line) => line.allocatedCents - (line.committedCents ?? 0);

  /**
   * Raise a request for approval. Does NOT commit funds: a PENDING request
   * has not consumed the budget. This mirrors the real control, where the
   * commitment is written only on authorisation.
   *
   * @param {{actorId: string, lineId: string, amountCents: number,
   *          description: string, reference?: string,
   *          idempotencyKey?: string}} input
   */
  async function raise(input) {
    const { actorId, lineId, amountCents, description, reference, idempotencyKey } = input;

    if (idempotencyKey && byIdempotencyKey.has(idempotencyKey)) {
      const prior = state.commitments.find((c) => c.id === byIdempotencyKey.get(idempotencyKey));
      // A replay returns the original result and must NOT decrement again.
      if (prior) return { ok: true, commitment: { ...prior, replayed: true }, replayed: true };
    }

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return { ok: false, error: { code: 'AMOUNT_NOT_INTEGER_CENTS', message: 'Amounts must be a whole number of cents.' } };
    }

    const line = findLine(lineId);
    if (!line) return { ok: false, error: { code: 'NO_SUCH_LINE', message: `Unknown budget line ${lineId}.` } };

    const commitment = {
      id: nextId('cc'),
      lineId,
      reference: reference ?? nextId('PO'),
      description,
      amountCents,
      status: /** @type {'PENDING'} */ ('PENDING'),
      authorId: actorId,
      createdAt: new Date().toISOString(),
      availableAfterCents: available(line),
    };

    state.commitments.unshift(commitment);
    if (idempotencyKey) byIdempotencyKey.set(idempotencyKey, commitment.id);
    await append(actorId, 'REQUEST_RAISED', commitment.id, null, { ...commitment });

    return { ok: true, commitment };
  }

  /**
   * Approve or reject. This is the transition the SoD evaluator guards and
   * the only place funds are actually committed.
   *
   * @param {{actorId: string, roles: string[], commitmentId: string,
   *          decision: 'APPROVED'|'REJECTED', reason?: string}} input
   */
  async function decide(input) {
    const { actorId, roles, commitmentId, decision, reason } = input;
    const commitment = state.commitments.find((c) => c.id === commitmentId);
    if (!commitment) return { ok: false, error: { code: 'NO_SUCH_COMMITMENT', message: 'Unknown commitment.' } };

    if (commitment.status !== 'PENDING') {
      return {
        ok: false,
        error: {
          code: 'ALREADY_DECIDED',
          message: `${commitment.reference} was already ${commitment.status.toLowerCase()}. `
            + 'A decided request cannot be decided again — that is what idempotency means.',
        },
      };
    }

    // SoD runs INSIDE the transition, before any state is written.
    const failures = evaluateSoD({
      action: decision === 'APPROVED' ? 'authorise_cost' : 'reject_cost',
      actorId,
      authorId: commitment.authorId,
      roles,
    });
    if (failures.length) {
      // The refusal itself is an audited event. A blocked attempt is exactly
      // the thing an auditor asks to see, so it must be evidence, not silence.
      await append(actorId, 'AUTHORISATION_BLOCKED', commitment.id,
        { status: 'PENDING' }, { status: 'PENDING', blockedBy: failures.map((f) => f.code) });
      return { ok: false, sod: failures };
    }

    const line = findLine(commitment.lineId);
    if (!line) return { ok: false, error: { code: 'NO_SUCH_LINE', message: 'Budget line disappeared.' } };

    const before = { status: 'PENDING', committedCents: line.committedCents ?? 0 };

    if (decision === 'APPROVED') {
      // Availability is read and the write happens together here. In the
      // backend this is the SELECT ... FOR UPDATE window; in a single-threaded
      // browser the same read-then-write is simply not interleavable.
      const availBefore = available(line);
      if (commitment.amountCents > availBefore) {
        await append(actorId, 'AUTHORISATION_REFUSED_INSUFFICIENT', commitment.id, before,
          { requested: commitment.amountCents, availableCents: availBefore });
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_FUNDS',
            message: `Only ${(availBefore / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} `
              + `remains on ${line.label}; the request is for `
              + `${(commitment.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`,
            availableCents: availBefore,
          },
        };
      }

      line.committedCents = (line.committedCents ?? 0) + commitment.amountCents;
      commitment.status = 'APPROVED';
      commitment.approverId = actorId;
      commitment.decidedAt = new Date().toISOString();
      commitment.availableAfterCents = available(line);
      await append(actorId, 'COST_AUTHORISED', commitment.id, before,
        { status: 'APPROVED', approverId: actorId, committedCents: line.committedCents });
      return { ok: true, commitment, line };
    }

    commitment.status = 'REJECTED';
    commitment.rejectedBy = actorId;
    commitment.reason = reason ?? 'no reason recorded';
    commitment.decidedAt = new Date().toISOString();
    await append(actorId, 'COST_REJECTED', commitment.id, before, { status: 'REJECTED', reason: commitment.reason });
    return { ok: true, commitment };
  }

  /**
   * Raise more than the line holds, to demonstrate the ceiling. Used by the
   * demo's "over-commit" control.
   */
  async function raiseOverspendRequest(actorId, lineId, factor = 1.4) {
    const line = findLine(lineId);
    if (!line) return { ok: false, error: { code: 'NO_SUCH_LINE', message: `Unknown budget line ${lineId}.` } };
    // Deliberately one cent over the remaining balance, so the refusal is
    // unambiguous and attributable to the control rather than to rounding.
    const amount = available(line) + 1;
    return raise({
      actorId,
      lineId,
      description: `Uplift request ${factor > 1 ? `${Math.round((factor - 1) * 100)}% above remaining balance` : 'at the limit'}`,
      amountCents: amount,
    });
  }

  return {
    state,
    tenant: TENANT,
    available,
    findLine,
    raise,
    decide,
    raiseOverspendRequest,
    /** Exposed so tests can assert canonical serialisation without a store. */
    canonicalise,
    get committedCents() {
      return state.lines.reduce((a, l) => a + (l.committedCents ?? 0), 0);
    },
    get allocatedCents() {
      return state.lines.reduce((a, l) => a + l.allocatedCents, 0);
    },
  };
}

/** Money-safe formatting for the UI. Guards against the float trap. */
export function centsToDisplay(cents) {
  try {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2,
    });
  } catch (err) {
    if (err instanceof MoneyError) throw err;
    return `${(cents / 100).toFixed(2)}`;
  }
}
