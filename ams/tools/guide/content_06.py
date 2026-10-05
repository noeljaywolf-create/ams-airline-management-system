"""
Part IX (server/database), Part X (audit), Part XI (types), Part XII (testing).
"""

from framework import (BUL, CALLOUT, CODE, H1, H2, H3, LEAD, NUMLIST, P,
                       RULEHR, SPACER, TABLE)


def build(story):
    # ================= PART IX =================
    story += H1('Part IX — The server side: money in a database')

    story += LEAD(
        'Everything so far has been calculation. This part covers the module '
        'that prevents an airline spending money it has not authorised — and '
        'the specific concurrency bug that makes it necessary.')

    story += CODE(
        '''/**
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
 * @module modules/finance/cost-authority
 */''',
        'backend/src/modules/finance/cost-authority.js')

    story += H2('What a server is')

    story += P(
        'The modules in Parts II to VIII are pure calculations: you give them '
        'data, they give you an answer, nothing is stored. A *server* is the '
        'part that listens for requests, calls those calculations, and records '
        'the results in a database.')

    story += CODE(
        '''// AMS currently has NO server. The pure domain modules exist and are
// fully tested; the HTTP layer, authentication and frontend are not yet
// built. What follows is the one backend module that is written, which is
// the control that matters most.''')

    story += H2('Asynchronous JavaScript and promises')

    story += P(
        'Database operations take time. While one is waiting, the server must '
        'continue handling other requests. JavaScript handles this with '
        '*promises* — a value that will arrive later — and `async`/`await`, '
        'which makes waiting look sequential.')

    story += CODE(
        '''export async function lockBudgetLine(db, tenantId, lineId) {
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
}''',
        'backend/src/modules/finance/cost-authority.js')

    story += P(
        '`await` means "wait for this to finish before continuing". The three '
        'checks after it are sequential and each one rejects a different '
        'failure: a line that does not exist, one that is closed, and one that '
        'treasury has frozen.')

    story += CODE(
        '''export class CostAuthorityError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CostAuthorityError';
    this.code = code;
    this.details = details;
    this.httpStatus = 422;
  }
}''',
        'A custom error class. Note it carries a machine-readable `code`, '
        'structured `details`, and an HTTP status. This is what lets a caller '
        'distinguish "insufficient funds" from "line frozen" without parsing '
        'the message text.')

    story += CALLOUT(
        'note', 'Why structured error codes matter to you',
        'When something goes wrong in AMS, the response carries a code such as '
        '`BUDGET_EXCEEDED` and a `shortfallCents` figure. That means a '
        'supervisor reading a failed approval sees exactly how much money was '
        'missing, rather than having to infer it from a message. Auditable '
        'errors are a product feature, not just a developer convenience.')

    story += H2('Database queries as chainable objects')

    story += CODE(
        '''await db('commitments')
  .insert({
    tenant_id: tenantId,
    budget_line_id: lineId,
    amount_cents: amountCents,
    movement_type: 'COMMITMENT',
    direction: 'DEBIT',
    available_before_cents: availableBefore,
    available_after_cents: availableBefore - amountCents,
    actor_id: actorId,
    created_at: db.fn.now(),
  })
  .returning(['id']);''',
        'Knex. The query is built by chaining method calls; nothing is sent to '
        'the database until the chain ends with `await`.')

    story += TABLE(
        ['Call', 'Meaning'],
        [
            ['`db(\'commitments\')`', 'start a query against this table'],
            ['`.where({ ... })`', 'filter rows on these columns'],
            ['`.insert({ ... })`', 'add a row with these values'],
            ['`.returning([\'id\'])`', 'give me the new row\'s id back'],
            ['`.increment(\'committed_cents\', amount)`',
             'add to a column by an amount — one atomic database operation'],
            ['`.decrement(...)`', 'subtract from a column'],
            ['`.first()`', 'return one row instead of an array'],
            ['`.forUpdate()`', '**lock the row** until the transaction ends'],
            ['`db.fn.now()`', 'let the database supply the current timestamp'],
        ],
        widths=[34, 66])

    story += CALLOUT(
        'note', 'Why the database supplies the timestamp',
        '`db.fn.now()` means the value comes from the database server, not from '
        'the application. If the application clock were wrong or the servers '
        'disagreed, two entries could be recorded out of order — which would '
        'corrupt the audit chain in Part X. Taking the timestamp from the '
        'system of record removes that possibility.')

    story += H2('The race that overspends an airline')

    story += P('This is worth walking through slowly, because it is invisible in normal testing.')

    story += CODE(
        '''// THE BUG (no lock):

async function authoriseCostUnsafe(db, { tenantId, lineId, amountCents }) {
  const line = await db('budget_lines').where({ id: lineId }).first();
  const available = line.budgetedCents - line.committedCents;

  if (available < amountCents) throw new CostAuthorityError('Insufficient', 'BUDGET_EXCEEDED');

  // ---- another request arrives HERE, sees the same `available` ----
  await db('budget_lines').where({ id: lineId }).increment('committed_cents', amountCents);
  return { ok: true };
}''')

    story += P(
        'Two requests arrive at the same moment. Request A reads the line and '
        'sees US$10,000 available. Before A writes anything, request B reads '
        'the *same* line and sees the *same* US$10,000 available — because A '
        'has not written yet. Both approve US$10,000. The airline is now '
        'committed to US$20,000 against US$10,000 of authority.')

    story += CODE(
        '''// The window between check and write is where the money disappears.
// A test that runs one request at a time will NEVER see this. It requires
// genuine concurrency to reproduce.''')

    story += CALLOUT(
        'bug', 'Why this class of bug survives code review',
        'Sequential testing cannot find it. Code review cannot find it, because '
        'each individual statement is correct. Manual testing cannot find it, '
        'because it needs two requests in the same millisecond. It appears '
        'under production load, occasionally, at peak approval times. This is '
        'the strongest argument in this guide for the testing approach in Part '
        'XII: some failures are only reachable by construction, and the fix is '
        'to make them unrepresentable rather than to test for them.')

    story += H2('Row locks and transactions')

    story += CODE(
        '''  // ---- THE CRITICAL SECTION ----------------------------------------
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
  }''',
        'backend/src/modules/finance/cost-authority.js — the fix, in three '
        'lines.')

    story += P(
        'The same race, with the fix. Request A locks the row and reads '
        'US$10,000. Request B tries to lock the same row and **blocks** — it '
        'cannot proceed. A writes its commitment and commits. Only then does B '
        'acquire the lock and read — and it now sees US$0 available, because '
        'A\'s commitment is already recorded. B correctly refuses.')

    story += CODE(
        '''/**
 * Authorise expenditure against a budget line, creating a commitment.
 *
 * MUST be called inside a transaction. The caller is responsible for
 * committing or rolling back; this function deliberately does not open
 * its own transaction, because the commitment write and the audit entry
 * must land atomically together.
 */''')

    story += CALLOUT(
        'good', 'Why the function does not open its own transaction',
        'A commitment and its audit entry must both happen or neither must. '
        'If this function opened and closed its own transaction, the audit '
        'entry would be written in a separate transaction that could fail '
        'independently — leaving a commitment with no audit trail, which is '
        'precisely the record an auditor would ask about. By refusing to open a '
        'transaction, the function makes the caller take responsibility for '
        'atomicity. A design that cannot be misused by accident.')

    story += H2('Availability arithmetic and the decision to fail loudly')

    story += CODE(
        '''export function availabilityCents(line) {
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
}''')

    story += TABLE(
        ['Component', 'Meaning'],
        [
            ['`budgetedCents`', 'what the board approved'],
            ['`revisedCents`', 'a later authorised revision (up or down)'],
            ['`releasedCents`', 'funds formally released for spending'],
            ['`committedCents`', 'approved but not yet paid'],
            ['`pendingCents`', 'submitted, awaiting approval'],
            ['`expendedCents`', 'paid'],
            ['`frozenCents`', 'ring-fenced by treasury'],
        ],
        widths=[26, 74])

    story += P(
        'The comment explains why frozen is separate from released: "a treasury '
        'ring-fence (a security deposit, a disputed supplier claim under '
        'litigation) removes spendable money WITHOUT creating a commitment. '
        'Conflating the two makes the reconciliation to the general ledger '
        'impossible."')

    story += CALLOUT(
        'good', 'Why a negative balance throws instead of clamping to zero',
        'The comment says: "A negative result is a control breach, never a '
        'value to clamp. Clamping hides the breach; AMS throws and alerts." '
        'A negative availability means money was committed beyond what was '
        'authorised — either a bug, a manual database edit, or a deliberate '
        'override. Silently clamping it to zero would make the system report a '
        'healthy budget while the breach continues. This is the single most '
        'important cultural decision in the backend.')

    story += H2('Idempotency: making retries safe')

    story += CODE(
        '''  // Idempotency: a retried request must not commit twice.
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
  }''')

    story += P(
        'Networks fail. A request may succeed on the server while the response '
        'is lost on the way back, and the client will retry. Without '
        'protection, a retry commits the money a second time.')

    story += CODE(
        '''  return {
    commitmentId: String(created.id),
    availableBeforeCents: availableBefore,
    availableAfterCents: availableBefore - amountCents,
    replayed: false,
  };''')

    story += P(
        'The idempotency key solves this. The client generates a unique value '
        'for the logical operation and sends it with every retry. If the server '
        'sees that key already committed, it returns the original result rather '
        'than performing the work again. The `replayed` flag tells the caller '
        'which happened.')

    story += CALLOUT(
        'note', 'Why this matters beyond technical correctness',
        'The alternative — charging a customer twice because their connection '
        'dropped — is not a bug report, it is a complaint. Idempotency is what '
        'separates a system that can be relied on from one that generates '
        'occasional inexplicable failures that support has to explain.')

    story += H2('All-or-nothing across a flight leg')

    story += CODE(
        '''export async function authoriseFlightLeg(db, { tenantId, lines, actorId }) {
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
    authorised: true, commitments, failures: [],
    totalAuthorisedCents: sum(...commitments.map((c) => c.availableAfterCents)),
  };
}''',
        'backend/src/modules/finance/cost-authority.js')

    story += P('Two design decisions here, both significant.')

    story += CODE(
        ''' * A flight draws on several budget lines at once: fuel, crew, navigation,
 * airport charges, catering. Each line must be checked, and the WHOLE leg
 * must be rejected if any line fails — a partially authorised aircraft
 * rotation is an aircraft that will be dispatched without fuel it was
 * supposed to have.''')

    story += BUL([
        '**Validate everything before writing anything.** Pass 1 checks every '
        'line without writing. Pass 2 writes only after all checks pass. '
        'Writing during validation would leave partial commitments when a later '
        'line fails.',
        '**Lock in a sorted order to prevent deadlock.** If two rotations draw '
        'on the same budget lines in opposite orders, they can wait on each '
        'other forever. Sorting by line id means every transaction acquires '
        'locks in the same sequence, which makes deadlock impossible.',
    ])

    story += CALLOUT(
        'bug', 'Deadlock is not a hypothetical',
        'Deadlock is one of the two classic database concurrency failures (the '
        'other being the race above). It happens when two transactions each hold '
        'a resource the other needs. The fix here is cheap — sort the lock '
        'order — and the comment says exactly why it is there. When reviewing '
        'database code, "in what order are locks acquired?" is a question worth '
        'asking every time.')

    story += H2('The settlement rule that prevents double-spend')

    story += CODE(
        '''/**
 * Settle a commitment against a payment.
 *
 * NOTE: this reduces committed and increases expended by the same amount.
 * It does NOT restore availability. The money has left. Restoring
 * availability would let the same funds be committed a second time,
 * which is the exact failure this module exists to prevent.
 */''')

    story += CODE(
        '''  return { commitmentId, committedReleasedCents: amountCents, availabilityRestored: false };''',
        'A plausible-sounding mistake would be to return the money to the '
        'available balance on settlement. The comment explains why that would be '
        'catastrophic: the money has actually left the bank account. Releasing '
        'it would allow the same funds to be committed again.')

    story += CODE(
        '''/**
 * Release the difference when a supplier invoices less than ordered, or
 * when a purchase order is cancelled before delivery. Availability IS
 * restored, because no money left.
 */''')

    story += P(
        'The contrast between those two functions is the whole lesson. Money '
        'that left restores nothing; money that never left releases cleanly. '
        'Both rules are stated in comments immediately above the code.')

    story += CODE(
        '''export function freezeBudgetLine(db, { tenantId, lineId, amountCents, actorId, reason }) {
  if (!reason || reason.length < 10) {
    throw new CostAuthorityError(
      'A freeze requires a substantive reason of at least 10 characters; it is a '
        + 'governance action that appears in the audit pack',
      'FREEZE_REASON_REQUIRED', { lineId },
    );
  }
  // ...
}''')

    story += CALLOUT(
        'good', 'A ten-character minimum on a reason field',
        'This is a small piece of control design worth understanding. A freeze '
        'removes money from circulation, so it appears in the audit pack. '
        'Requiring a substantive written reason means the audit pack contains '
        'an explanation, not an unexplained number. It is a trivial piece of '
        'code expressing a governance principle: actions that affect money must '
        'be justifiable in words as well as in figures.')

    story += RULEHR()

    # ================= PART X =================
    story += H1('Part X — The audit trail')

    story += LEAD(
        'An airline audit trail is evidence presented to a statutory auditor, '
        'a lessor\'s technical representative, and a foreign civil aviation '
        'authority. If the airline can edit its own history, none of that '
        'evidence is worth anything.')

    story += CODE(
        '''/**
 * AMS — Tamper-evident audit chain.
 *
 * WHY THIS EXISTS
 *
 * An airline audit trail is evidence presented to a statutory auditor, to
 * a lessor's technical representative, and to a foreign civil aviation
 * authority inspecting the operator under the AOC. If the airline can
 * edit its own history, none of that evidence is worth anything.
 *
 * A conventional audit log — even append-only at the application level —
 * is editable by anyone holding database write access. Application-level
 * append-only is a policy; this is a mechanism.
 *
 * HOW IT WORKS
 *
 * Each entry stores the SHA-256 of its own content concatenated with the
 * previous entry's hash:
 *
 *     entry_hash = SHA256(prev_hash || canonical_entry)
 *
 * Any modification, deletion or reordering of an historic entry breaks
 * the chain at that point and every point after it. Recomputing the
 * chain detects it. Rewriting the whole chain requires the database
 * write key, which in production is not the same credential the
 * application runs with, and the chain head is additionally exported for
 * external anchoring.
 *
 * This is the same construction used for public ledgers, applied to
 * internal financial audit. It does not make the data trustworthy — it
 * makes tampering DETECTABLE, which is the property that matters.
 *
 * @module audit/chain
 */''')

    story += H2('Hashing: a fingerprint for data')

    story += CODE(
        '''import { createHash } from 'node:crypto';

/** Genesis sentinel. Chaining starts here. */
export const GENESIS_HASH = '0'.repeat(64);

export function computeHash(entry, prevHash) {
  const canonical = canonicalise({
    id: entry.id,
    tenantId: entry.tenantId,
    actorId: entry.actorId,
    entityType: entry.entityType,
    entityId: String(entry.entityId),
    action: entry.action,
    before: entry.before,
    after: entry.after,
    ip: entry.ip,
    occurredAt: entry.occurredAt,
  });
  return createHash('sha256').update(prevHash, 'utf8').update(canonical, 'utf8').digest('hex');
}''',
        'backend/src/audit/chain.js')

    story += P(
        'A hash takes any input and produces a fixed-length fingerprint. Change '
        'one character anywhere in the input and the fingerprint changes '
        'completely. You cannot work backwards from the fingerprint to the '
        'original, and you cannot find a different input with the same '
        'fingerprint.')

    story += CODE(
        '''createHash('sha256').update('budget line 1: 1000000').digest('hex')
// 'a3f5...'  (64 hexadecimal characters)

createHash('sha256').update('budget line 1: 1000001').digest('hex')
// '7b91...'  — completely different, and there is no relationship between them''')

    story += CALLOUT(
        'note', 'What this does and does not prove',
        'The module comment is explicit: "It does not make the data '
        'trustworthy — it makes tampering DETECTABLE, which is the property '
        'that matters." Someone with write access could still rewrite the whole '
        'chain from scratch. What they cannot do is alter one entry and leave '
        'the rest consistent. The protection is against realistic partial '
        'tampering, not against an attacker who owns the database.')

    story += H2('Chaining entries together')

    story += CODE(
        ''' *     entry_hash = SHA256(prev_hash || canonical_entry)
 *
 * Any modification, deletion or reordering of an historic entry breaks
 * the chain at that point and every point after it.''')

    story += P(
        'Each entry includes the *previous* entry\'s hash in its own '
        'calculation. This is the key idea, and it is what makes the chain a '
        'chain rather than a list of independent fingerprints.')

    story += CODE(
        '''Entry 1: hash(prev = 0000...0, content = "line 1 set to $10,000")  → 8f2a...
Entry 2: hash(prev = 8f2a...,  content = "line 1 set to $20,000")  → 4c71...
Entry 3: hash(prev = 4c71...,  content = "line 1 frozen")          → b93d...

// Someone edits Entry 1 to say $50,000 and recomputes its own hash.
// Entry 2's stored prev-hash no longer matches. Verification fails at 2.''')

    story += CALLOUT(
        'bug', 'Why this stops the realistic attack',
        'An ordinary database operator who wants to hide a single improper '
        'transaction edits one row. That row\'s hash no longer matches what '
        'entry 2 recorded as its predecessor, so the break is detected at entry '
        '2. To hide it they must recompute every subsequent hash — and the '
        'chain head will differ from whatever value was externally anchored. '
        'This is the same construction used in public blockchain ledgers, '
        'applied to an internal financial audit.')

    story += H2('Canonical form: making hashing reliable')

    story += CODE(
        '''/**
 * Deterministic JSON serialisation.
 *
 * Object key order must be stable or the hash is meaningless — the same
 * logical entry would hash differently depending on insertion order, and
 * verification would report corruption that never happened.
 */''')

    story += CODE(
        '''export function canonicalise(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const keys = Object.keys(/** @type {Record<string, unknown>} */ (value)).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalise(/** @type {any} */ (value)[k])}`);
  return `{${parts.join(',')}}`;
}''',
        'backend/src/audit/chain.js')

    story += P(
        'This function solves a problem that looks trivial and is not. Two '
        'objects with the same content can have their fields in different '
        'orders, and JavaScript preserves insertion order when you convert to '
        'text.')

    story += CODE(
        '''canonicalise({ b: 2, a: 1 })   // '{"a":1,"b":2}'
canonicalise({ a: 1, b: 2 })   // '{"a":1,"b":2}'   ← identical, by design''')

    story += CALLOUT(
        'bug', 'A bug that would have been catastrophic and invisible',
        'Without sorting, the first object hashes differently from the second. '
        'Verification would report corruption on a chain that is perfectly '
        'intact. The failure mode is the worst kind: the system reports a '
        'problem that does not exist, and engineers spend weeks investigating a '
        'phantom. This is a small amount of code preventing a large amount of '
        'wasted time.')

    story += H2('Verifying a chain')

    story += CODE(
        '''export function verifyChain(entries) {
  let prev = GENESIS_HASH;
  for (const entry of entries) {
    const expected = computeHash(entry, prev);
    if (expected !== entry.entryHash) {
      return {
        valid: false,
        entriesChecked: entries.indexOf(entry),
        brokenAt: entry.id,
        reason: 'Hash mismatch: entry content or ordering has been altered',
      };
    }
    prev = entry.entryHash;
  }
  return { valid: true, entriesChecked: entries.length, brokenAt: null, reason: null };
}

export function verifyTenantChain(allEntries, tenantId) {
  const scoped = allEntries
    .filter((e) => e.tenantId === tenantId)
    .sort((a, b) => a.id - b.id);
  return { tenantId, ...verifyChain(scoped) };
}

export function chainHead(entries) {
  if (entries.length === 0) return GENESIS_HASH;
  const last = [...entries].sort((a, b) => a.id - b.id).at(-1);
  return last.entryHash;
}''')

    story += P(
        'Verification walks the chain recomputing each hash. The first entry '
        'whose stored hash does not match its recomputed value is reported by '
        'identifier, so an investigator knows exactly where the history diverges.')

    story += CODE(
        '''// verifyTenantChain exists so one tenant's corruption cannot mask or
// contaminate another's. AMS is multi-tenant: each airline is a separate
// customer with separate data. An audit must be provable per customer.''')

    story += H2('Anomalies beyond hash mismatch')

    story += CODE(
        '''export function auditAnomalies(entries) {
  const findings = [];
  const ordered = [...entries].sort((a, b) => a.id - b.id);

  ordered.forEach((e, i) => {
    if (i > 0 && e.id <= ordered[i - 1].id) {
      findings.push({ severity: 'SEV1', code: 'OUT_OF_ORDER', entryId: e.id, detail: 'Non-monotonic entry id' });
    }
    if (!e.actorId || e.actorId === 'system') {
      findings.push({ severity: 'INFO', code: 'SYSTEM_ACTOR', entryId: e.id, detail: 'Entry written by system actor' });
    }
    if (e.action === 'DELETE' && e.before === null) {
      findings.push({ severity: 'SEV2', code: 'DELETE_WITHOUT_SNAPSHOT', entryId: e.id, detail: 'Delete recorded with no prior state' });
    }
    if (e.action === 'APPROVE' && e.entityType === 'cost_authority'
      && String(e.actorId) === String(/** @type {any} */ (e.before)?.approved_by ?? '')) {
      findings.push({ severity: 'SEV1', code: 'SELF_APPROVAL', entryId: e.id, detail: 'Approver matched the authoriser on the prior state' });
    }
  });

  return {
    findings,
    highestSeverity: findings.reduce(
      (worst, f) => (worst === null || rank(f.severity) < rank(worst) ? f.severity : worst),
      /** @type {string|null} */ (null),
    ),
  };
}''')

    story += P(
        'Hash verification answers "was this changed?". Anomaly detection '
        'answers "was this a legitimate thing to do?" Both matter, and they '
        'catch different problems.')

    story += TABLE(
        ['Finding', 'Severity', 'What it suggests'],
        [
            ['`OUT_OF_ORDER`', 'SEV1', 'Entries were reordered or rewritten'],
            ['`SELF_APPROVAL`', 'SEV1',
             'The same person authorised what they requested — a '
             'segregation-of-duties breach'],
            ['`DELETE_WITHOUT_SNAPSHOT`', 'SEV2',
             'A deletion was recorded with no record of what was deleted'],
            ['`SYSTEM_ACTOR`', 'INFO',
             'The entry came from an automated process, not a person'],
        ],
        widths=[26, 11, 63])

    story += CODE(
        '''export const SOD_RULES = [
  'SELF_APPROVAL',            // approver === requester
  'EVALUATOR_IS_AUTHOR',     // evaluator also authored the sourcing event
  'PAYMENT_RELEASER_IS_ORIGINATOR',
  'SUPPLIER_BIDS_OWN_TENDER',
  'TECHNICAL_APPROVES_OWN_CHECK',
  'PERIOD_CERTIFIER_WITHOUT_AUTHORITY',
];''',
        'shared/src/domain.js — the separation-of-duties rules the anomaly '
        'detector looks for.')

    story += RULEHR()

    # ================= PART XI =================
    story += H1('Part XI — Types without TypeScript')

    story += LEAD(
        'AMS is written in plain JavaScript with no compilation step. This part '
        'explains what safety that actually buys, and where the gaps are.')

    story += H2('The decision to write plain JavaScript')

    story += CODE(
        '''## The JavaScript decision (ADR-001)

No TypeScript build. Correctness is carried by Zod validation at every
request boundary, JSDoc annotations, and a `checkJs` **no-emit** gate in
CI. The gate found **47 genuine defects** on first run against this
codebase — including two source bugs (`cyclesPerHour` undefined; an
unreachable branch in `routeVerdict`) that the 118 unit tests missed.

That is the argument for keeping it. Revisit if the team exceeds four
engineers or the codebase passes 250,000 lines.''')

    story += CALLOUT(
        'bug', 'Two corrections to the ADR as written',
        'First, Zod is **not installed and not used anywhere** in this codebase. '
        'That sentence overstates what exists. Second, the test count is now 190 '
        'and there is **no CI pipeline configured** for this project — the gate '
        'can be run locally with `npm run typecheck` but nothing enforces it '
        'automatically. Both claims should be corrected before this document is '
        'used to justify the decision to a reviewer.')

    story += P(
        'The underlying argument is still sound, and the trigger conditions are '
        'sensible. Plain JavaScript with an automated type check is a legitimate '
        'choice for a team that wants no build step. What matters is that the '
        'safety mechanisms claimed actually exist and run.')

    story += H2('What JSDoc does and does not do')

    story += CODE(
        '''/**
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
 */''')

    story += P(
        'Read this as a data dictionary rather than as code. It documents what a '
        'budget line record contains, what type each field is, which fields are '
        'optional (written in square brackets), and — in the trailing comments — '
        'what each one means in business terms.')

    story += TABLE(
        ['Annotation', 'Meaning'],
        [
            ['`@param {number} amountCents`', 'a parameter named amountCents, '
             'which must be a number'],
            ['`@returns {Cents}`', 'the return value is integer cents'],
            ['`@returns {Cents[]}`', 'an array of integer cents'],
            ['`@property {number} [frozenCents]`', 'an optional field; may be '
             'absent'],
            ['`@returns {number|null}`', 'a number, or explicitly nothing'],
            ['`{readonly [number, number]}`', 'a fixed-length array'],
            ['`{Record<string, number>}`', 'an object with string keys and '
             'number values'],
        ],
        widths=[42, 58])

    story += CODE(
        '''/**
 * @typedef {Object} FuelBurn
 * @property {number} upliftKg
 * @property {number} takeoffFuelKg   Fuel on board at brake release
 * @property {number} landingFuelKg   Fuel remaining at touchdown
 */''')

    story += CALLOUT(
        'note', 'Those trailing comments are the most valuable part',
        '`takeoffFuelKg` and `landingFuelKg` are self-explanatory. "Fuel on '
        'board at brake release" and "fuel remaining at touchdown" remove all '
        'ambiguity about *when* the measurement is taken — and getting that '
        'wrong produces a plausible-looking wrong number. This is documentation '
        'doing real work.')

    story += H2('The type-check gate')

    story += CODE(
        '''{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": false,
    "skipLibCheck": true
  },
  "include": ["shared/src/**/*.js", "backend/src/**/*.js", "tests/**/*.js"],
  "exclude": ["node_modules"]
}''')

    story += TABLE(
        ['Setting', 'What it does', 'Why'],
        [
            ['`allowJs`', 'permit JavaScript files', 'the whole point'],
            ['`checkJs`', 'type-check JavaScript without renaming it',
             'safety without a build'],
            ['`noEmit`', 'never write output files',
             'nothing is compiled, so nothing can be emitted'],
            ['`target`', 'assume modern JavaScript',
             '`??`, optional chaining, `at()` are available'],
            ['`skipLibCheck`', 'do not check library type definitions',
             'faster, and third-party types are not our concern'],
            ['`strict: false`', '**relaxed null checking**',
             '**the known gap — see below**'],
        ],
        widths=[22, 40, 38])

    story += CODE(
        '''npm run typecheck    # runs tsc --noEmit; fails on any type error
npx tsc --noEmit     # the same thing directly''')

    story += CALLOUT(
        'warn', 'The strict:false gap, stated plainly',
        'With `strict: false`, TypeScript will not complain if a function that '
        'expects a value is handed `null` or `undefined`. In a codebase that '
        'handles money and airworthiness, that is the wrong default. '
        '`strict: true` would likely surface real defects on first run. This '
        'is a known, recorded weakness rather than an oversight.')

    story += H2('Where the guarantee really comes from')

    story += CODE(
        ''' * Union types
 *
 * These are JSDoc-only. In a plain-JavaScript codebase there is no
 * `export type` syntax, so union types are documented for the editor
 * and for `checkJs`, and enforced at RUNTIME by the CHECK constraints
 * generated on each state column from the const arrays above.
 *
 * A value that is not in the corresponding array cannot reach the
 * database. The type annotation is a convenience; the constraint is
 * the guarantee.
 */''',
        'shared/src/domain.js — this paragraph is the clearest statement of '
        'the project\'s safety philosophy.')

    story += P(
        'Read that twice. It says: *annotations are a convenience, constraints '
        'are the guarantee.* A JSDoc comment can be wrong and nothing breaks. A '
        'database CHECK constraint cannot be violated, whatever any '
        'application code does.')

    story += CODE(
        '''/**
 * @typedef {'A'|'B'|'C'|'D'} MelCategory
 */
export const MEL_CATEGORIES = {
  A: { days: null, note: 'No standard interval specified; starts at deferral' },
  B: { days: 3, note: '3 calendar days excluding the day of discovery' },
  C: { days: 10, note: '10 calendar days excluding the day of discovery' },
  D: { days: 120, note: '120 calendar days excluding the day of discovery' },
};''')

    story += CODE(
        '''if (!spec) throw new TypeError(`Unknown MEL category "${category}"`);
if (spec.days === null) return null; // Category A: no standard interval''')

    story += P(
        'The lookup `MEL_CATEGORIES[category]` returns undefined for an '
        'invalid category, and the very next line throws. This is the pattern '
        'throughout AMS: a JavaScript-level guard, backed by a database-level '
        'constraint. Two independent mechanisms, one of which cannot be '
        'bypassed.')

    story += CALLOUT(
        'good', 'The three-layer safety model, in one paragraph',
        'Layer one: JSDoc annotations and the type-check gate catch mistakes '
        'before the code runs. Layer two: explicit runtime checks (`if (!spec) '
        'throw`) catch them at execution. Layer three: database constraints '
        'catch them regardless of what the application does. No single layer is '
        'trusted alone. This is the actual answer to "is plain JavaScript safe '
        'for this?" — not that the language is safe, but that the design does '
        'not depend on the language being safe.')

    story += RULEHR()

    # ================= PART XII =================
    story += H1('Part XII — Testing as the real safety net')

    story += LEAD(
        'Given that Part XI showed the type annotations are a convenience rather '
        'than a guarantee, the tests are where safety actually lives. This part '
        'explains what the AMS test suite does and, more importantly, what it '
        'deliberately does not do.')

    story += H2('What a test suite is for')

    story += CODE(
        '''/**
 * Verification suite for two optimisation algorithms.
 *
 * These tests do not assert what the code intends to do. They assert
 * agreement between three INDEPENDENT implementations, plus structural
 * properties that must hold for any correct answer.
 *
 *   1. solveRoute        — Pareto label-setting (production)
 *   2. solveRouteDP      — fuel-indexed DP (reference)
 *   3. bruteForceRoute   — exhaustive enumeration (oracle)
 *
 * If all three agree on thousands of random instances, and the oracle is
 * correct by construction, the production algorithm is correct on those
 * instances. That is meaningfully stronger than a test suite written
 * from the same mental model as the implementation — which is how the
 * `_roll` defect shipped through 118 green tests.
 */''',
        'tests/routing.test.js — the file header. Note the last sentence: it '
        'explicitly names the failure mode the suite is designed to avoid.')

    story += H2('Structural tests versus expected values')

    story += CODE(
        '''describe('defect 1 — no fabricated metrics reach the API', () => {
  it('the aggregate carries no internal or underscore-prefixed fields', () => {
    const agg = aggregatePnl([LEG(150), LEG(160)]);
    const offenders = Object.keys(agg).filter((k) => k.startsWith('_'));
    expect(offenders).toEqual([]);
  });

  it('every aggregate metric is a real sum of real flight facts', () => {
    const flights = [LEG(150), LEG(160), LEG(140)];
    const agg = aggregatePnl(flights);
    // ...
  });
});''',
        'tests/costing-defects.test.js')

    story += P(
        'There are two ways to test. The common one is to write down what you '
        'expect the answer to be and check it. That only proves the code does '
        'what you believed it should do.')

    story += P(
        'The stronger one asserts a *property* that must hold for any correct '
        'implementation. "The aggregate has no underscore-prefixed fields" is '
        'that kind of test. It would have failed the `_roll` defect, and it '
        'would have failed it for the right reason — the defect was that a '
        'fabricated field was being returned at all.')

    story += CALLOUT(
        'good', 'Why property tests catch more',
        'A property test survives changes you have not thought about. If '
        'someone later adds a genuinely useful `_internal` field, an '
        'expected-value test still passes but the property test flags it for '
        'review. Conversely, an expected-value test has to be rewritten every '
        'time a correct change alters a number, and the temptation under time '
        'pressure is to update the expectation rather than investigate.')

    story += H2('Testing against three implementations')

    story += CODE(
        '''it('agrees with the exhaustive oracle on 3000 random instances', () => {
  let compared = 0;
  let feasible = 0;
  for (let seed = 1; seed <= 3000; seed += 1) {
    const rand = mulberry32(seed * 2654435761);
    const n = int(rand, 2, 6);
    const inst = randomInstance(rand, n);
    if (inst.flights.length === 0) continue;

    const pareto = solveRoute(inst);
    const oracle = bruteForceRoute(inst);

    compared += 1;
    if (oracle.feasible) feasible += 1;

    expect(pareto.feasible, `seed ${seed}: feasibility must match oracle`).toBe(oracle.feasible);
    if (oracle.feasible) {
      expect(pareto.costCents, `seed ${seed}: optimal cost must match oracle`).toBe(oracle.costCents);
      const { cost } = assertRouteLegal(inst, pareto.stops);
      expect(cost, `seed ${seed}: reported cost must equal the sum of its own legs`).toBe(pareto.costCents);
    }
  }
  expect(compared).toBeGreaterThan(2500);
  expect(feasible / compared).toBeGreaterThan(0.3);
});''')

    story += P(
        'Three assertions do different work in this test. The first says the '
        'two solvers must agree on feasibility. The second says they must agree '
        'on the optimal cost. The third — and this is the one most teams skip — '
        'verifies the returned route is internally consistent, by walking its '
        'own legs and re-adding the cost.')

    story += CODE(
        '''/** Recompute cumulative fuel for a route and assert it is legal. */
function assertRouteLegal(instance, stops) {
  const index = new Map();
  for (const f of instance.flights) index.set(`${f.from}>${f.to}`, f);
  const usable = instance.tankCapacityKg - instance.minReserveKg;
  let cumulative = 0;
  let cost = 0;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const leg = index.get(`${stops[i]}>${stops[i + 1]}`);
    expect(leg, `leg ${stops[i]}->${stops[i + 1]} must exist`).toBeDefined();
    cumulative += leg.fuelKg;
    cost += leg.costCents;
  }
  expect(cumulative).toBeLessThanOrEqual(usable);
  return { cumulative, cost };
}''')

    story += CALLOUT(
        'good', 'Why the self-consistency check is not redundant',
        'A solver could in principle return the correct cost alongside a route '
        'that does not achieve it — for instance if a reconstruction bug '
        'assembled the stops from the wrong predecessor pointers. Comparing two '
        'costs would pass. Walking the returned route and re-adding its own '
        'costs catches that class of bug, and independently confirms the fuel '
        'constraint holds on the answer that will actually be used.')

    story += H2('Property tests: invariants that must hold')

    story += CODE(
        '''describe('monotonicity — properties any correct solver must satisfy', () => {
  it('more tank capacity never increases the optimal cost', () => {
    for (let seed = 1; seed <= 800; seed += 1) {
      const inst = randomInstance(mulberry32(seed * 1103515245 + 12345), int(rand, 3, 6));
      const base = solveRoute({ ...inst, tankCapacityKg: 20, minReserveKg: 3 });
      const bigger = solveRoute({ ...inst, tankCapacityKg: 45, minReserveKg: 3 });
      if (base.feasible && bigger.feasible) {
        expect(bigger.costCents, `seed ${seed}: capacity grew, cost must not rise`)
          .toBeLessThanOrEqual(base.costCents);
      }
    }
  });

  it('a lower mandatory reserve never increases the optimal cost', () => { /* ... */ });

  it('raising any sector cost never decreases the optimal cost', () => { /* ... */ });

  it('when the unconstrained optimum is feasible, it is also the constrained optimum', () => {
    let checked = 0;
    for (let seed = 1; seed <= 1200; seed += 1) {
      // ...
      if (result.costCents === unconstrained) checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });
});''',
        'tests/routing.test.js')

    story += P(
        'These tests know nothing about the algorithm. They express truths '
        'about the *problem* that any correct solution must respect, and they '
        'check thousands of instances. A completely different correct '
        'implementation would pass them.')

    story += TABLE(
        ['Property', 'Intuition'],
        [
            ['More capacity cannot cost more',
             'A bigger tank removes constraints; it cannot add them'],
            ['A lower reserve cannot cost more',
             'Same reasoning — a weaker requirement cannot hurt'],
            ['Higher prices cannot cost less',
             'Expensive flights are never an opportunity'],
            ['Feasible unconstrained optimum = constrained optimum',
             'If the cheap answer is allowed, it should win'],
        ],
        widths=[45, 55])

    story += H2('Making random tests reproducible')

    story += CODE(
        '''expect(pareto.feasible, `seed ${seed}: feasibility must match oracle`).toBe(oracle.feasible);
expect(pareto.costCents, `seed ${seed}: optimal cost must match oracle`).toBe(oracle.costCents);''')

    story += P(
        'Every random assertion includes the seed in its failure message. When a '
        'test fails in CI, the log names the exact case, and the loop can be '
        're-run with that seed to reproduce it. This is a small detail that '
        'decides whether a random failure is a five-minute fix or a two-day '
        'investigation.')

    story += H2('Regression tests for real defects')

    story += CODE(
        '''/**
 * Regression tests for two defects found by REVIEW rather than by any
 * failing test. Both shipped green through 118 tests.
 *
 * DEFECT 1 — aggregatePnl computed a `roll` object from fabricated input
 * (distanceKm: 0, passengers: 0, a `seatsFrom` helper that multiplied by
 * an undefined field and therefore always returned 0). It produced an
 * object of near-zero metrics and attached it to the return value as
 * `_roll`, so it serialised into every route P&L API response.
 *
 * DEFECT 2 — breakEvenPassengers computed
 *   (revenue / X) * 0          ← multiplied by ZERO
 *   and fell back to a hardcoded US$120 fare x 0.62.
 * The number it returned was derived from nothing but a magic constant.
 *
 * The lesson these encode: a test suite that only asserts what the code
 * intends to do will never catch a function whose intent was never
 * implemented. These tests assert STRUCTURAL properties — no fabricated
 * fields reach the API, and no magic constant influences an answer.
 */''',
        'tests/costing-defects.test.js — the header is the most valuable part '
        'of this guide\'s case for how AMS tests.')

    story += H2('What the tests do not prove')

    story += CALLOUT(
        'bug', 'The most important limitation in this document',
        'These tests prove the code does what the authors intended. They do '
        '**not** prove the intent was correct. A complete green suite on the '
        'routing module proves the Pareto solver is optimal *given that the '
        'reserve is `capacity − reserve`* and *given that a sector is flyable '
        'if cumulative fuel fits*. If the regulatory reserve requirement is '
        'wrong, every test still passes.')

    story += P(
        'This is the boundary between what software can verify and what requires '
        'a qualified human. Part XIV returns to it, because for a system that '
        'handles financial and airworthiness decisions, that boundary is where '
        'the real risk lives.')

    story += RULEHR()