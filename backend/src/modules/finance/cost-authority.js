/**
 * AMS — Cost Authority: the control core.
 *
 * THIS IS THE FUNCTION THAT PREVENTS AN AIRLINE OVERSPENDING.
 *
 * The problem, stated plainly:
 *
 * An airline's finance department approves purchase orders. Its
 * procurement department raises them. Its warehouse receives goods. Its
 * treasury releases money. Each department is necessary, and each
 * department is also, individually, capable of committing the airline
 * to expenditure the board never authorised.
 *
 * The classic failure is not a single large fraud. It is a hundred
 * individually-reasonable approvals, each taken against a budget line
 * that looked like it had room, which together exceed the board's
 * approved plan by a quarter. Each approver was honest. The aggregate
 * was not authorised.
 *
 * That happens because availability checks are TOCTOU: check the
 * balance, then write the commitment, and between those two operations
 * another request does the same thing. Two requests both see US$10,000
 * available. Both approve. The airline is US$10,000 overspent and nobody
 * was at fault in any individual transaction.
 *
 * THE FIX
 *
 * The read and the write happen inside one database transaction, and the
 * row is locked before it is read:
 *
 *     SELECT ... FOR UPDATE
 *
 * PostgreSQL blocks the second transaction until the first commits or
 * rolls back. The second transaction then re-reads the balance and sees
 * the FIRST transaction's commitment already deducted. The race is not
 * defended against; it is made unrepresentable.
 *
 * This is the same control as the government PFMS commitment control,
 * re-domained. The word changed from "appropriation" to "budget"; the
 * logic did not change, because the logic is correct.
 *
 * @module modules/finance/cost-authority
 */

import { MoneyError, sum } from '../../../../shared/src/money.js';

/**
 * Structural stand-in for the Knex instance, declared locally so the
 * type-check gate works without the runtime dependency installed. When
 * `knex` lands, replace this with `import('knex')` and delete it.
 *
 * @typedef {Object} Knex
 * @param {string} tableName
 * @returns {any} QueryBuilder
 */

/**
 * @typedef {Object} AuthorisationResult
 * @property {string} commitmentId
 * @property {number} availableBeforeCents
 * @property {number} availableAfterCents
 * @property {boolean} replayed  True when an idempotency key matched a prior commit
 */

/**
 * @typedef {Object} BudgetLine
 * @property {string} id
 * @property {string} tenantId
 * @property {string} accountId
 * @property {string} costCenterId
 * @property {string} fundId
 * @property {string} vehicleRegistration  For fuel and maintenance budgets
 * @property {number} fiscalYear
 * @property {string} categoryId
 * @property {number} budgetedCents
 * @property {number} revisedCents
 * @property {number} releasedCents
 * @property {number} committedCents
 * @property {number} pendingCents   Submitted but not yet approved requisitions
 * @property {number} expendedCents
 * @property {number} [frozenCents]  Ring-fenced by treasury (security deposits, disputed claims)
 * @property {boolean} isFrozen
 * @property {string} status         ACTIVE | REVISED | CLOSED
 */

export class CostAuthorityError extends Error {
  /**
   * @param {string} message @param {string} code
   * @param {Record<string, unknown>} [details]
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CostAuthorityError';
    this.code = code;
    this.details = details;
    this.httpStatus = 422;
  }
}

/**
 * Compute availability from a budget line.
 *
 * available = budget + revised + released
 *           − committed − pending − expended − frozen
 *
 * `frozen` is separate from `released` deliberately: a treasury ring-fence
 * (a security deposit, a disputed supplier claim under litigation) removes
 * spendable money WITHOUT creating a commitment. Conflating the two makes
 * the reconciliation to the general ledger impossible.
 *
 * A negative result is a control breach, never a value to clamp. Clamping
 * hides the breach; AMS throws and alerts.
 *
 * @param {BudgetLine} line
 * @returns {number} integer cents, guaranteed >= 0
 */
export function availabilityCents(line) {
  const frozen = line.frozenCents ?? 0;
  const available =
    line.budgetedCents + line.revisedCents + line.releasedCents
    - line.committedCents - line.pendingCents - line.expendedCents - frozen;

  if (available < 0) {
    throw new CostAuthorityError(
      `Budget line ${line.id} has negative availability (${available} cents). ` +
        'This is a control breach, not a data error.',
      'AVAILABILITY_NEGATIVE',
      { lineId: line.id, availableCents: available },
    );
  }
  return available;
}

/**
 * Read a budget line under a row lock, so that availability cannot change
 * between the check and the write.
 *
 * Runs INSIDE the caller's transaction. The lock is held until commit.
 *
 * @param {Knex} db  transaction-bound knex instance
 * @param {string} tenantId
 * @param {string} lineId
 * @returns {Promise<BudgetLine>}
 */
export async function lockBudgetLine(db, tenantId, lineId) {
  const line = await db('budget_lines')
    .where({ id: lineId, tenant_id: tenantId })
    .forUpdate()
    .first();

  if (!line) {
    throw new CostAuthorityError(
      `Budget line ${lineId} not found`, 'BUDGET_LINE_NOT_FOUND', { lineId },
    );
  }
  if (line.status !== 'ACTIVE') {
    throw new CostAuthorityError(
      `Budget line ${lineId} is ${line.status}, not ACTIVE`, 'BUDGET_LINE_INACTIVE', { lineId },
    );
  }
  if (line.is_frozen) {
    throw new CostAuthorityError(
      `Budget line ${lineId} is frozen by treasury`, 'BUDGET_LINE_FROZEN', { lineId },
    );
  }
  return /** @type {BudgetLine} */ (snakeToCamel(line));
}

/**
 * Authorise expenditure against a budget line, creating a commitment.
 *
 * MUST be called inside a transaction. The caller is responsible for
 * committing or rolling back; this function deliberately does not open
 * its own transaction, because the commitment write and the audit entry
 * must land atomically together.
 *
 * @param {Knex} db transaction-bound knex
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {string} params.lineId
 * @param {number} params.amountCents   integer, positive
 * @param {string} params.actorId
 * @param {string} [params.reason]
 * @param {string} [params.reference]   PO, contract or requisition reference
 * @param {string} [params.idempotencyKey]
 * @returns {Promise<AuthorisationResult>}
 */
export async function authoriseCost(db, params) {
  const { tenantId, lineId, amountCents, actorId } = params;

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new CostAuthorityError(
      'Amount must be a positive integer number of cents',
      'AMOUNT_INVALID', { amountCents },
    );
  }

  // Idempotency: a retried request must not commit twice.
  if (params.idempotencyKey) {
    const prior = await db('commitments')
      .where({ tenant_id: tenantId, idempotency_key: params.idempotencyKey })
      .first();
    if (prior) {
      return {
        commitmentId: prior.id,
        availableBeforeCents: prior.available_before_cents,
        availableAfterCents: prior.available_after_cents,
        replayed: true,
      };
    }
  }

  // ---- THE CRITICAL SECTION ----------------------------------------
  // FOR UPDATE serialises every concurrent authorisation against this
  // line. The second transaction waits here, then reads the balance the
  // FIRST transaction left behind. Double-spend is unrepresentable.
  // -----------------------------------------------------------------
  const line = await lockBudgetLine(db, tenantId, lineId);

  const availableBefore = availabilityCents(line);

  if (availableBefore < amountCents) {
    throw new CostAuthorityError(
      `Insufficient cost authority: ${availableBefore} cents available, ${amountCents} cents requested`,
      'BUDGET_EXCEEDED',
      {
        lineId,
        availableCents: availableBefore,
        requestedCents: amountCents,
        shortfallCents: amountCents - availableBefore,
      },
    );
  }

  // Write the commitment and move the balance atomically.
  const [created] = await db('commitments')
    .insert({
      tenant_id: tenantId,
      budget_line_id: lineId,
      account_id: line.accountId,
      cost_center_id: line.costCenterId,
      fund_id: line.fundId,
      vehicle_registration: params.reference ?? line.vehicleRegistration,
      category_id: line.categoryId,
      amount_cents: amountCents,
      movement_type: 'COMMITMENT',
      direction: 'DEBIT',
      available_before_cents: availableBefore,
      available_after_cents: availableBefore - amountCents,
      actor_id: actorId,
      reason: params.reason ?? null,
      idempotency_key: params.idempotencyKey ?? null,
      created_at: db.fn.now(),
    })
    .returning(['id']);

  await db('budget_lines')
    .where({ id: lineId, tenant_id: tenantId })
    .increment('committed_cents', amountCents);

  return {
    commitmentId: String(created.id),
    availableBeforeCents: availableBefore,
    availableAfterCents: availableBefore - amountCents,
    replayed: false,
  };
}

/**
 * Reserve pipeline funds when a requisition is SUBMITTED rather than
 * approved.
 *
 * Without this, an approver opening their inbox sees headroom that is
 * already spoken for by fifteen requests pending beside theirs, and
 * approves a sixteenth. Reserving on submit means the queue cannot
 * over-commit itself.
 *
 * @param {Knex} db @param {string} tenantId @param {string} lineId
 * @param {number} amountCents @param {string} actorId
 */
export async function reservePending(db, tenantId, lineId, amountCents, actorId) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new CostAuthorityError('Amount must be a positive integer', 'AMOUNT_INVALID', { amountCents });
  }

  const line = await lockBudgetLine(db, tenantId, lineId);
  const available = availabilityCents(line);

  if (available < amountCents) {
    throw new CostAuthorityError(
      `Insufficient authority to submit: ${available} available, ${amountCents} requested`,
      'BUDGET_EXCEEDED',
      { lineId, availableCents: available, requestedCents: amountCents },
    );
  }

  const [created] = await db('commitments')
    .insert({
      tenant_id: tenantId,
      budget_line_id: lineId,
      amount_cents: amountCents,
      movement_type: 'PIPELINE',
      direction: 'DEBIT',
      available_before_cents: available,
      available_after_cents: available - amountCents,
      actor_id: actorId,
      created_at: db.fn.now(),
    })
    .returning(['id']);

  await db('budget_lines').where({ id: lineId, tenant_id: tenantId })
    .increment('pending_cents', amountCents);

  return { commitmentId: String(created.id), availableAfterCents: available - amountCents };
}

/**
 * Settle a commitment against a payment.
 *
 * NOTE: this reduces committed and increases expended by the same amount.
 * It does NOT restore availability. The money has left. Restoring
 * availability would let the same funds be committed a second time,
 * which is the exact failure this module exists to prevent.
 *
 * @param {Knex} db @param {Object} params
 * @param {string} params.tenantId
 * @param {string} params.commitmentId
 * @param {number} params.amountCents  must equal the original commitment
 * @param {string} params.actorId
 */
export async function settleCommitment(db, { tenantId, commitmentId, amountCents, actorId }) {
  const commitment = await db('commitments')
    .where({ id: commitmentId, tenant_id: tenantId })
    .forUpdate()
    .first();

  if (!commitment) {
    throw new CostAuthorityError(`Commitment ${commitmentId} not found`, 'COMMITMENT_NOT_FOUND', { commitmentId });
  }
  if (commitment.movement_type !== 'COMMITMENT') {
    throw new CostAuthorityError(
      `Commitment ${commitmentId} is a ${commitment.movement_type}, not an open COMMITMENT`,
      'COMMITMENT_NOT_OPEN', { commitmentId },
    );
  }
  if (commitment.amount_cents !== amountCents) {
    // Partial settlement is legitimate when a supplier invoices less than
    // ordered, but it must be explicit and the difference released.
    throw new CostAuthorityError(
      `Settlement ${amountCents} does not match commitment ${commitment.amount_cents}; ` +
        'use releaseCommitmentDifference() for variance',
      'SETTLEMENT_VARIANCE', { commitmentId, expected: commitment.amount_cents, received: amountCents },
    );
  }

  await db('commitments')
    .where({ id: commitmentId, tenant_id: tenantId })
    .update({ movement_type: 'SETTLED', settled_at: db.fn.now(), settled_by: actorId });

  await db('budget_lines')
    .where({ id: commitmentId && commitment.budget_line_id, tenant_id: tenantId })
    .decrement('committed_cents', amountCents)
    .increment('expended_cents', amountCents);

  return { commitmentId, committedReleasedCents: amountCents, availabilityRestored: false };
}

/**
 * Release the difference when a supplier invoices less than ordered, or
 * when a purchase order is cancelled before delivery. Availability IS
 * restored, because no money left.
 *
 * @param {Knex} db @param {Object} params
 */
export async function releaseCommitmentDifference(db, { tenantId, commitmentId, releaseCents, actorId, reason }) {
  if (!Number.isSafeInteger(releaseCents) || releaseCents <= 0) {
    throw new CostAuthorityError('Release must be a positive integer', 'AMOUNT_INVALID', { releaseCents });
  }
  const commitment = await db('commitments')
    .where({ id: commitmentId, tenant_id: tenantId })
    .forUpdate()
    .first();
  if (!commitment) {
    throw new CostAuthorityError(`Commitment ${commitmentId} not found`, 'COMMITMENT_NOT_FOUND', { commitmentId });
  }
  const releasable = commitment.amount_cents - (commitment.released_cents ?? 0);
  if (releaseCents > releasable) {
    throw new CostAuthorityError(
      `Cannot release ${releaseCents}; only ${releasable} outstanding on ${commitmentId}`,
      'RELEASE_EXCEEDS_COMMITMENT', { commitmentId, releaseCents, releasable },
    );
  }

  await db('commitments').where({ id: commitmentId, tenant_id: tenantId })
    .update({ released_cents: (commitment.released_cents ?? 0) + releaseCents, release_reason: reason ?? null });

  await db('budget_lines').where({ id: commitment.budget_line_id, tenant_id: tenantId })
    .decrement('committed_cents', releaseCents);

  return { commitmentId, releasedCents: releaseCents, availabilityRestored: releaseCents };
}

/**
 * Freeze a budget line — treasury ring-fencing funds without creating a
 * commitment. Used for security deposits, litigation holds, and
 * investigations. Blocked immediately on an airworthiness investigation.
 *
 * @param {Knex} db @param {Object} params
 */
export async function freezeBudgetLine(db, { tenantId, lineId, amountCents, actorId, reason }) {
  if (!reason || reason.length < 10) {
    throw new CostAuthorityError(
      'A freeze requires a substantive reason of at least 10 characters; it is a '
        + 'governance action that appears in the audit pack',
      'FREEZE_REASON_REQUIRED', { lineId },
    );
  }
  const line = await lockBudgetLine(db, tenantId, lineId);
  const free = availabilityCents(line);
  if (amountCents > free) {
    throw new CostAuthorityError(
      `Cannot freeze ${amountCents}; only ${free} available`, 'FREEZE_EXCEEDS_AVAILABLE',
      { lineId, amountCents, availableCents: free },
    );
  }
  await db('budget_lines').where({ id: lineId, tenant_id: tenantId })
    .update({ frozen_cents: (line.frozenCents ?? 0) + amountCents });

  return { lineId, frozenCents: amountCents, availableAfterCents: free - amountCents };
}

/**
 * Batch cost authority for an entire flight leg.
 *
 * A flight draws on several budget lines at once: fuel, crew, navigation,
 * airport charges, catering. Each line must be checked, and the WHOLE leg
 * must be rejected if any line fails — a partially authorised aircraft
 * rotation is an aircraft that will be dispatched without fuel it was
 * supposed to have.
 *
 * @param {Knex} db @param {Object} params
 * @param {string} params.tenantId
 * @param {Array<{lineId: string, amountCents: number}>} params.lines
 * @param {string} params.actorId
 * @returns {Promise<{authorised: boolean, commitments: AuthorisationResult[], failures: object[], totalAuthorisedCents?: number}>}
 */
export async function authoriseFlightLeg(db, { tenantId, lines, actorId }) {
  // Lock in a stable order to prevent deadlock between two rotations that
  // draw on overlapping budget lines in opposite order.
  const ordered = [...lines].sort((a, b) => a.lineId.localeCompare(b.lineId));

  const commitments = [];
  const failures = [];

  // Pass 1: validate every line under its lock before writing anything.
  for (const { lineId, amountCents } of ordered) {
    try {
      const line = await lockBudgetLine(db, tenantId, lineId);
      const available = availabilityCents(line);
      if (available < amountCents) {
        failures.push({ lineId, availableCents: available, requestedCents: amountCents });
      }
    } catch (err) {
      failures.push({ lineId, error: /** @type {CostAuthorityError} */ (err).code ?? 'UNKNOWN' });
    }
  }

  // Any failure aborts the whole leg. All-or-nothing, because a flight
  // cannot be half-authorised.
  if (failures.length > 0) {
    return { authorised: false, commitments: [], failures };
  }

  // Pass 2: all lines cleared — write the commitments.
  for (const { lineId, amountCents } of ordered) {
    commitments.push(await authoriseCost(db, { tenantId, lineId, amountCents, actorId }));
  }

  return {
    authorised: true,
    commitments,
    failures: [],
    totalAuthorisedCents: sum(...commitments.map((c) => c.availableAfterCents)),
  };
}

/** Convert snake_case DB row to camelCase for the domain layer. */
function snakeToCamel(row) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}
