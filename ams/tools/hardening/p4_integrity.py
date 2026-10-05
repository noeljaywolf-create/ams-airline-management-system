"""
Part V: integrity (audit chain).
Part VI: the transactional outbox.
Part VII: verification discipline.
"""

from framework import (ASSUMED, BUG, BUL, CODE, H1, H2, H3, HR, LEAD, LOCK,
                       NUMLIST, P, PART, TABLE, VERIFIED)


def part5(story):
    story += PART(
        'Part V — Integrity: making history unchangeable',
        'An airline audit trail is evidence presented to a statutory auditor, a '
        'lessor\'s technical representative, and a foreign civil aviation '
        'authority. If the airline can edit its own history, none of that '
        'evidence is worth anything.')

    story += CODE(
        '''/**
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
 */''',
        'backend/src/audit/chain.js')

    story += H2('Append-only as a policy versus a mechanism')

    story += TABLE(
        ['Approach', 'What it is', 'Who can defeat it'],
        [
            ['**Policy**', 'A convention. "Do not update audit rows."',
             'Anyone with database write access. Including a privileged '
             'operator, a migration script, a mistaken `UPDATE`.'],
            ['**Application constraint**',
             'The repository exposes only `insert` and `select` for audit rows',
             'Still anyone with direct database access. And any future code '
             'path that writes raw SQL.'],
            ['**Mechanism**',
             'The database itself refuses `UPDATE` and `DELETE`',
             'A superuser, or someone who drops the trigger. Both are '
             'deliberate, logged, and rare.'],
        ],
        widths=[20, 40, 40])

    story += CODE(
        '''  // Append-only enforcement at the DATABASE level. Application-level
  // append-only is a policy a privileged operator can bypass; this is not.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION ams_forbid_audit_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION
        'audit_logs is append-only. entry % attempted %', OLD.id, TG_OP
        USING ERRCODE = 'restrict_violation';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER audit_logs_no_update
      BEFORE UPDATE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION ams_forbid_audit_mutation();
  `);
  await knex.raw(`
    CREATE TRIGGER audit_logs_no_delete
      BEFORE DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION ams_forbid_audit_mutation();
  `);''',
        'backend/migrations/001_tenancy_identity_audit.js')

    story += TABLE(
        ['Keyword in the trigger', 'What it means', 'Why it matters'],
        [
            ['`BEFORE`', 'Runs before the change is applied',
             'The statement is aborted; the row is untouched'],
            ['`FOR EACH ROW`', 'Once per affected row',
             'A multi-row `UPDATE` is blocked row by row'],
            ['`RAISE EXCEPTION`', 'Aborts the whole statement/transaction',
             'The change never happens'],
            ['`ERRCODE = \'restrict_violation\'`',
             'SQLSTATE 23000',
             'The application receives a *recognisable* error class rather than '
             'a generic failure'],
        ],
        widths=[26, 30, 44])

    story += VERIFIED(
        'Why `BEFORE` rather than `AFTER`',
        'A `BEFORE` trigger can veto the change. An `AFTER` trigger runs once '
        'the row is already modified and can only *report* the problem — the '
        'write has happened. For a guarantee, the veto must come first.\n\n'
        'The consequence is that a blocked mutation rolls back entirely: no '
        'partial write, no partial audit entry.')

    story += CODE(
        '''-- Demonstrating the guarantee
UPDATE audit_logs SET actor_id = 'someone-else' WHERE id = 5001;
-- ERROR:  audit_logs is append-only. entry 5001 attempted UPDATE

DELETE FROM audit_logs WHERE id = 5001;
-- ERROR:  audit_logs is append-only. entry 5001 attempted DELETE

-- Not even a superuser avoids the trigger unless they disable it:
SET session_replication_role = replica;   -- requires superuser
-- ... which is precisely the kind of act the external chain head detects.''')

    story += ASSUMED(
        'The one remaining bypass, stated plainly',
        'A superuser can disable triggers with `session_replication_role = '
        'replica`, or drop them. That is not a defect — it is the nature of a '
        'database administrator.\n\n'
        'The design assumes such an act leaves another trace: the chain head is '
        '"additionally exported for external anchoring" per the module header, '
        'so a rewritten chain produces a different head than the anchored one.\n\n'
        '**No code implements the external anchoring.** It is stated as a '
        'production intention. Without it, the protection reduces to "the '
        'database and its administrator are honest", which is a weaker claim '
        'than the header implies.')

    story += H2('Hash chaining and what it does not prove')

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
}

export function chainEntry(entry, prevHash) {
  return computeHash(entry, prevHash || GENESIS_HASH);
}''')

    story += CODE(
        '''// The chain in concrete form
Entry 1: hash(prev = 0000...0, content = "line 1 set to $10,000")  → 8f2a...
Entry 2: hash(prev = 8f2a...,  content = "line 1 set to $20,000")  → 4c71...
Entry 3: hash(prev = 4c71...,  content = "line 1 frozen")          → b93d...

// Someone edits Entry 1 to say $50,000 and recomputes its own hash.
// Entry 2's stored prev_hash no longer matches. Verification fails at entry 2.''')

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
}''')

    story += TABLE(
        ['Property', 'PROVEN', 'NOT proven'],
        [
            ['Entry 1 altered', 'Chain breaks at entry 2',
             'Who altered it, or with what credential'],
            ['Entry 5 deleted', 'Chain breaks at entry 6',
             'Whether the deletion was legitimate'],
            ['Entries reordered', 'Chain breaks immediately',
             'That reordering was accidental'],
            ['Entire chain rewritten', 'Only by changing the head',
             'Anything — if nothing external records the head'],
            ['Entry written by the application', 'It is in the chain',
             'That the underlying action was justified'],
        ],
        widths=[24, 34, 42])

    story += LOCK(
        'The precise claim, and why precision matters here',
        'The module says it "does not make the data trustworthy — it makes '
        'tampering DETECTABLE".\n\n'
        'That is a real and valuable property. But a system that presents '
        'tamper-evidence as trustworthiness will eventually be asked to prove '
        'something it cannot prove. The correct statement to an auditor is: '
        '*any alteration of recorded history breaks the chain and is '
        'detectable on verification* — not *the history is correct*.')

    story += H2('Canonicalisation and the phantom corruption bug')

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
}''')

    story += CODE(
        '''canonicalise({ b: 2, a: 1 })   // '{"a":1,"b":2}'
canonicalise({ a: 1, b: 2 })   // '{"a":1,"b":2}'   ← identical, by design

// Without the .sort(), these would hash differently and verification
// would report corruption on a chain that is perfectly intact.''')

    story += BUG(
        'A bug that would have been catastrophic and invisible',
        'JavaScript preserves object key insertion order. Two objects with '
        'identical content but different insertion order serialise differently '
        'and therefore hash differently.\n\n'
        'The failure mode is the worst kind: the system reports a problem that '
        '**does not exist**. Engineers would investigate a phantom corruption, '
        'and if they believed it they might "fix" it by disabling verification — '
        'removing the control because it produced false alarms.\n\n'
        'This is a small amount of code (`.sort()`) preventing a large amount '
        'of wasted time and a potentially dangerous response.')

    story += CODE(
        '''export function verifyTenantChain(allEntries, tenantId) {
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

    story += VERIFIED(
        'Per-tenant verification, and why it is necessary',
        'A single global chain means one tenant\'s corruption would be reported '
        'against a shared sequence, contaminating every other tenant\'s audit '
        'result. For a multi-tenant SaaS, that is unacceptable: customer A\'s '
        'bad row would make customer B\'s audit fail.\n\n'
        '`verifyTenantChain` scopes first, then verifies. Each customer\'s audit '
        'is provable independently, which is also what an auditor examining one '
        'customer\'s records would require.')

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
        'answers "was this a legitimate thing to do?". Both are needed, and they '
        'catch different problems.')

    story += TABLE(
        ['Finding', 'Severity', 'Meaning'],
        [
            ['`OUT_OF_ORDER`', 'SEV1', 'Entries reordered or rewritten'],
            ['`SELF_APPROVAL`', 'SEV1',
             'The same person authorised what they requested — a '
             'segregation-of-duties breach'],
            ['`DELETE_WITHOUT_SNAPSHOT`', 'SEV2',
             'A deletion recorded with no record of what was deleted'],
            ['`SYSTEM_ACTOR`', 'INFO',
             'Written by an automated process, not a person'],
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
        'shared/src/domain.js — the rules the anomaly detector implements. Note '
        'that only the first is currently detected; the other five are declared '
        'but not enforced anywhere.')

    story += ASSUMED(
        'Five of six segregation-of-duties rules are declared but not enforced',
        '`SOD_RULES` lists six violations. `auditAnomalies` detects one '
        '(`SELF_APPROVAL`), and only for `cost_authority` entities. The other '
        'five have no implementation.\n\n'
        'This is the honest reading: the vocabulary is defined, the detection '
        'for one rule exists, and the remaining five are a specification rather '
        'than a feature. `EVALUATOR_IS_AUTHOR` in particular — an evaluator who '
        'also wrote the tender — is a procurement fraud pattern that most '
        'control frameworks treat as mandatory.')

    story += CODE(
        '''    CREATE TABLE audit_logs (
      id            BIGSERIAL PRIMARY KEY,
      tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      actor_id      TEXT,
      actor_ip      INET,
      entity_type   TEXT NOT NULL,
      entity_id     TEXT NOT NULL,
      action        TEXT NOT NULL,
      before_json   JSONB,
      after_json    JSONB,
      correlation_id UUID,
      occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      prev_hash     CHAR(64) NOT NULL,
      entry_hash    CHAR(64) NOT NULL
    )
  `);
  await knex.raw(`CREATE INDEX idx_audit_tenant ON audit_logs (tenant_id, id)`);
  await knex.raw(`CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id)`);''')

    story += P(
        'The `idx_audit_tenant` index on `(tenant_id, id)` matches how '
        '`verifyTenantChain` reads: filter by tenant, order by id. The composite '
        'index serves both the filter and the sort from one structure.')

    story += BUG(
        'Hash chaining has a concurrency hole that is not addressed',
        'Computing entry N+1\'s hash requires reading entry N\'s hash. If two '
        'audit entries for the same tenant are written concurrently, both read '
        'the same `prev_hash` and both chain from it — producing two entries '
        'with the same predecessor. One of them breaks the chain.\n\n'
        'The fix is the same pattern as the budget line: `SELECT ... FOR UPDATE` '
        'on the tenant\'s chain head before inserting, so writes to one tenant\'s '
        'chain serialise. **No such lock exists in the codebase.** The chain '
        'head lock would need to be taken in the same transaction as the '
        'business change, which is exactly the structure described in Part I.\n\n'
        'This is a genuine gap. It is not currently exploitable because no '
        'server writes audit entries, but it must be addressed before one does.')

    story += HR()


def part6(story):
    story += PART(
        'Part VI — Side effects that cannot be lost or duplicated',
        'A committed financial change frequently needs a side effect: send an '
        'email, produce a bank file, notify a supplier, update a carbon report. '
        'Getting that correct is a genuinely hard problem, and the schema in '
        'migration 001 already anticipates it.')

    story += CODE(
        '''  // ---------- transactional outbox ----------
  // Every side effect (email, SMS, bank file, carbon report) is written
  // here in the same transaction as the business change, then delivered by
  // a worker. This is why a committed change can never lose its side effect.
  await knex.raw(`
    CREATE TABLE outbox (
      id              BIGSERIAL PRIMARY KEY,
      tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      aggregate_type  TEXT NOT NULL,
      aggregate_id    TEXT NOT NULL,
      message_type    TEXT NOT NULL,
      payload         JSONB NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at    TIMESTAMPTZ,
      attempts        SMALLINT NOT NULL DEFAULT 0,
      last_error      TEXT
    )
  `);
  await knex.raw(`
    CREATE INDEX idx_outbox_unpublished ON outbox (created_at)
      WHERE published_at IS NULL
  `);''',
        'backend/migrations/001_tenancy_identity_audit.js')

    story += H2('The problem: a commit that must send an email')

    story += P(
        'Consider approving a purchase commitment. The approval must be '
        'recorded, money must move, and the requester must be notified. These '
        'are two systems: a PostgreSQL database and an email provider. There is '
        'no transaction spanning both.')

    story += CODE(
        '''// The naive approach
await db.transaction(async (trx) => {
  await trx('commitments').insert({ /* ... */ });
  await trx('budget_lines').increment('committed_cents', amountCents);
});

await sendEmail({ to: requester, subject: 'Approved', body: '...' });''')

    story += TABLE(
        ['Failure', 'Result'],
        [
            ['Process crashes between commit and send',
             '**Money committed, no notification.** The requester does not know.'],
            ['Email provider is down',
             '**Money committed, no notification**, and an exception thrown '
             'after the commit — which might be caught and retried, causing a '
             'double approval.'],
            ['Email sends, response is lost',
             '**Two notifications** for one approval, or a retry that commits '
             'again.'],
            ['Database commit fails',
             'An email announces an approval that did not happen.'],
        ],
        widths=[32, 68])

    story += LOCK(
        'The dual-write problem',
        'This is called the *dual-write problem*, and it has no correct solution '
        'when you attempt to coordinate two systems that cannot share a '
        'transaction. Every mitigation trades one failure mode for another.\n\n'
        'The standard fix is to stop treating the email as a separate act. '
        'Record the *intent* to send, atomically with the business change, and '
        'let a separate process turn the intent into an email.')

    story += H2('The transactional outbox')

    story += CODE(
        '''// Step 1 — one transaction: the business change AND the intent to notify
await db.transaction(async (trx) => {
  await trx('commitments').insert({ /* ... */ });
  await trx('budget_lines').increment('committed_cents', amountCents);

  // The email is now recorded. If we crash here, nothing happened at all.
  await trx('outbox').insert({
    tenant_id: tenantId,
    aggregate_type: 'cost_authority',
    aggregate_id: commitmentId,
    message_type: 'COMMITMENT_APPROVED',
    payload: JSON.stringify({ amountCents, requesterEmail }),
  });
});

// Step 2 — a separate worker, possibly minutes later
const pending = await db('outbox')
  .whereNull('published_at')
  .orderBy('created_at')
  .limit(100);

for (const message of pending) {
  try {
    await sendEmail(JSON.parse(message.payload));
    await db('outbox').where({ id: message.id })
      .update({ published_at: db.fn.now() });
  } catch (err) {
    await db('outbox').where({ id: message.id }).increment('attempts', 1);
  }
}''')

    story += VERIFIED(
        'What the outbox eliminates',
        '**The "lost side effect" failure is now impossible.** If the '
        'transaction commits, the notification is recorded. If it rolls back, '
        'neither the commitment nor the notification exists. There is no window '
        'in which money moved and the notification did not.\n\n'
        'This is the same principle as `FOR UPDATE` and the CHECK constraints: '
        'move the invariant into a place that cannot be bypassed. Here it is '
        '"the intent to notify is atomic with the change" — enforced by the '
        'database transaction itself.')

    story += TABLE(
        ['Failure', 'Naive approach', 'With outbox'],
        [
            ['Crash after commit, before send', 'Notification lost forever',
             '**Impossible.** The intent was committed.'],
            ['Email provider down', 'Commit succeeds, exception thrown',
             'Recorded, retried by the worker.'],
            ['Worker crashes mid-batch', 'n/a',
             'Un-published rows remain; the next worker picks them up.'],
            ['Notification delivered twice',
             'Possible on retry', '**Possible** — see below.'],
        ],
        widths=[28, 36, 36])

    story += ASSUMED(
        'What the outbox does NOT give you, and the honest statement',
        'Delivery is **at-least-once**, not exactly-once. If the worker sends '
        'the email successfully and then crashes before writing `published_at`, '
        'the next run sends it again.\n\n'
        'This is a real and unsolved problem: **exactly-once delivery across a '
        'network boundary does not exist.** The mitigations are all partial:\n\n'
        '- Make the recipient idempotent (a visible reference number, so a '
        'duplicate is recognisable)\n- Use an email provider that supports '
        'idempotency keys\n- Accept duplicates for messages where they are '
        'harmless, and never for messages that trigger money movement\n\n'
        'The schema anticipates retries with `attempts` and `last_error`, and '
        'the partial index serves the worker\'s query. **No worker exists and '
        'no delivery policy is documented.** This should be settled before any '
        'notification is wired up.')

    story += CODE(
        '''  await knex.raw(`
    CREATE INDEX idx_outbox_unpublished ON outbox (created_at)
      WHERE published_at IS NULL
  `);''')

    story += VERIFIED(
        'Why the index is partial',
        'A partial index on `WHERE published_at IS NULL` stores only unpublished '
        'rows. Once a message is published its index entry disappears.\n\n'
        'For a table holding every notification ever sent, this is the '
        'difference between an index that grows without bound and one that '
        'stays proportional to the backlog. The worker\'s query — "what is '
        'unpublished, oldest first" — is exactly the index\'s predicate and '
        'ordering.\n\n'
        'This is the correct pattern, and it also appears in the commitments '
        'table: `idx_commitments_open ... WHERE movement_type IN '
        '(\'PIPELINE\',\'COMMITMENT\')`.')

    story += BUG(
        'The outbox has no claim mechanism, and a naive worker will duplicate',
        'The loop above reads pending messages and sends them. If two workers '
        'run concurrently — which is the normal case for a reliable queue — '
        'both read the same rows and both send.\n\n'
        'The correct pattern is `FOR UPDATE SKIP LOCKED`:')

    story += CODE(
        '''-- Correct worker claim: each row goes to exactly one worker
SELECT id, payload FROM outbox
  WHERE published_at IS NULL
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED      -- skip rows another worker already holds
  LIMIT 100;

-- Process them, then set published_at. The row locks prevent overlap.''')

    story += P(
        '`SKIP LOCKED` is the crucial keyword: instead of waiting for a locked '
        'row, the worker steps over it to the next available one. That is what '
        'allows horizontal scaling without coordinating the workers at all.\n\n'
        '**This is not implemented.** No worker exists. It is recorded here '
        'because the schema is designed for it and the eventual implementation '
        'must use it.')

    story += H2('What the outbox guarantees and what it does not')

    story += TABLE(
        ['Property', 'Guaranteed?', 'Mechanism'],
        [
            ['The business change and the intent to notify are atomic',
             '**Yes**', 'One database transaction'],
            ['A committed change always has a recorded notification',
             '**Yes**', 'Same transaction'],
            ['A rolled-back change has no notification',
             '**Yes**', 'Same transaction'],
            ['Notifications are eventually attempted',
             '**Yes**, given a running worker', 'Partial index polling'],
            ['A notification is delivered exactly once',
             '**No**', 'At-least-once delivery'],
            ['A notification is delivered in order',
             '**No**', 'Parallel workers; no sequence guarantee'],
            ['The notification content is current at send time',
             '**No**', 'The payload is a snapshot from commit time'],
        ],
        widths=[38, 22, 40])

    story += ASSUMED(
        'Snapshot payloads and stale notifications',
        'The payload is serialised into the row at commit time. If the '
        'commitment is subsequently reversed, the pending notification still '
        'says "approved" and will be sent with no correction.\n\n'
        'Two defensible designs exist: send the snapshot and accept that a '
        'rarely-concurrent reversal produces a stale message, or have the worker '
        're-read current state before sending. The first is simpler and faster; '
        'the second is accurate. **No decision is recorded**, and it should be '
        'before notifications exist, because changing it later is expensive.')

    story += HR()


def part7(story):
    story += PART(
        'Part VII — Verification as an engineering discipline',
        'AMS has 190 tests. That number is not the point. The point is what '
        'those tests can and cannot find, and this part is explicit about the '
        'boundary.')

    story += H2('Four kinds of test and which defects each finds')

    story += TABLE(
        ['Kind', 'What it asserts', 'Finds', 'Blind to'],
        [
            ['**Expected value**', 'A hand-written answer',
             'Regressions in known cases',
             'Anything the author did not think of — including errors in '
             'their own expectation'],
            ['**Structural / property**', 'An invariant that must always hold',
             'Whole classes of defect',
             'Cases where the invariant is the wrong invariant'],
            ['**Differential**', 'Two implementations agree',
             'Bugs where one implementation is wrong',
             'Bugs where both are wrong the same way'],
            ['**Metamorphic**', 'A known transformation preserves a relation',
             'Bugs without needing a reference',
             'Bugs in the relation itself'],
        ],
        widths=[19, 25, 22, 34])

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
    expect(agg.passengers).toBe(450);
  });
});''',
        'tests/costing-defects.test.js — a structural test. It would fail '
        'regardless of what the correct numbers are.')

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
 *   (revenue / X) * 0          <- multiplied by ZERO
 *   and fell back to a hardcoded US$120 fare x 0.62.
 * The number it returned was derived from nothing but a magic constant.
 *
 * The lesson these encode: a test suite that only asserts what the code
 * intends to do will never catch a function whose intent was never
 * implemented. These tests assert STRUCTURAL properties — no fabricated
 * fields reach the API, and no magic constant influences an answer.
 */''')

    story += CODE(
        '''// DEFECT 2 — before and after
function breakEvenPassengers(agg) {
  return (agg.revenueCents / agg.loadFactorPpm) * 0;   // always 0
  const HARDCODED_FARE = 12_000;
  return HARDCODED_FARE * 0.62;                          // always 7440
}

function breakEvenPassengers(agg) {
  const flights = agg.flights || 1;
  const passengers = agg.passengers || 0;

  const revenuePerPassengerCents = passengers > 0
    ? Math.round(agg.revenueCents / passengers) : 0;
  const marginalCostCents = agg.marginalSeatCostCents ?? 0;
  const contributionPerPassengerCents = revenuePerPassengerCents - marginalCostCents;

  const perFlightLoss = Math.max(0, -agg.contributionCents) / flights;
  if (perFlightLoss === 0) {
    return { additionalPassengersPerFlight: 0, closeableByLoadFactor: true,
      revenuePerPassengerCents, contributionPerPassengerCents };
  }

  // Carrying a passenger costs more than they pay. More load does not
  // fix this; the route needs re-pricing, a fleet change or withdrawal.
  if (contributionPerPassengerCents <= 0) {
    return { additionalPassengersPerFlight: Number.MAX_SAFE_INTEGER,
      closeableByLoadFactor: false,
      revenuePerPassengerCents, contributionPerPassengerCents };
  }

  return {
    additionalPassengersPerFlight: Math.ceil(perFlightLoss / contributionPerPassengerCents),
    closeableByLoadFactor: true,
    revenuePerPassengerCents,
    contributionPerPassengerCents,
  };
}''')

    story += LOCK(
        'What the fix reveals that the original could not express',
        'The original function had no way to represent the case where a '
        'passenger costs more to carry than they pay. There was no field for '
        'it, so the branch could not exist.\n\n'
        'In that situation more load makes the loss **worse**, and the honest '
        'answer is that load factor cannot fix the problem. The corrected '
        'version returns `closeableByLoadFactor: false`.\n\n'
        '**A function that can only ever produce a positive answer is usually '
        'hiding a case.** When you review a calculation, ask what business '
        'situations it cannot represent.')

    story += TABLE(
        ['Situation', 'Correct answer', 'What the old code said'],
        [
            ['Loss, passengers profitable', 'A real number of extra passengers',
             '7440, always'],
            ['Loss, each passenger costs more than they pay',
             'Cannot be closed by load factor', '7440'],
            ['Already profitable', '0', '7440'],
        ],
        widths=[36, 32, 32])

    story += H2('Oracle design and seeding')

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
 */''')

    story += CODE(
        '''function randomInstance(rand, n) {
  const nodes = Array.from({ length: n }, (_, i) => `N${i}`);
  const flights = [];
  for (const from of nodes) {
    for (const to of nodes) {
      if (from === to) continue;
      if (rand() < 0.42) continue; // sparse
      flights.push({
        from, to,
        costCents: int(rand, 1, 5000),
        fuelKg: int(rand, 1, 12),
      });
    }
  }
  return {
    flights,
    source: nodes[0],
    destination: nodes[n - 1],
    tankCapacityKg: int(rand, 10, 40),
    minReserveKg: int(rand, 0, 6),
  };
}''')

    story += P(
        'Two properties of this generator matter more than the rest of the '
        'function. **Cost and fuel are drawn independently**, so genuinely '
        'incomparable cost/fuel trade-offs arise — which is what exercises the '
        'dominance rule. And **the density is ~58%**, sparse enough to produce '
        'disconnected networks and dead ends, dense enough to produce many '
        'candidate routes.')

    story += CODE(
        '''function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}''')

    story += P(
        'The seed is derived from the loop counter, so test *n* always produces '
        'the same instance. A failure at seed 3 is a permanent, shareable '
        'regression case rather than a rumour.')

    story += H2('Guarding against vacuous tests')

    story += CODE(
        '''      compared += 1;
      if (oracle.feasible) feasible += 1;
      expect(pareto.feasible, `seed ${seed}: feasibility must match oracle`).toBe(oracle.feasible);
      // ...
    }
    expect(compared).toBeGreaterThan(2500);
    // The test is worthless if every instance was trivially infeasible.
    expect(feasible / compared).toBeGreaterThan(0.3);''')

    story += LOCK(
        'The most underrated line in the suite',
        'If a change to the generator produced only infeasible networks, every '
        'comparison would trivially pass — both solvers would correctly report '
        '"no route" — and the test would prove nothing while reporting green.\n\n'
        '**A test suite that cannot fail is worse than no test suite**, because '
        'it manufactures confidence. Asserting that your test data is '
        'interesting is a necessary and frequently omitted step.\n\n'
        'The suite goes further and includes a test whose job is to prove the '
        '*other* tests are meaningful:')

    story += CODE(
        '''describe('the fuel constraint actually binds', () => {
  it('finds many instances where the unconstrained shortest path is INFEASIBLE', () => {
    // ...
    // A naive Dijkstra would be wrong this often. Proof the constraint matters.
    expect(disagreements).toBeGreaterThan(50);
  });
});''')

    story += H2('The defect ledger')

    story += TABLE(
        ['#', 'Defect', 'Type', 'Found by', 'Would a test have found it?'],
        [
            ['1', 'Fabricated `_roll` object in `aggregatePnl`',
             'Wrong data returned', 'Reading the code',
             '**No** — 118 green tests'],
            ['2', '`breakEvenPassengers` multiplied by zero',
             'Wrong arithmetic', 'Reading the code',
             '**No** — 118 green tests'],
            ['3', '`requiredAtDeparture` under-fuelled first departure',
             'Wrong formula', 'Exhaustive oracle', 'No — the test agreed with it'],
            ['4', 'DP carried departure node instead of arrival node',
             'Wrong state', 'Cross-implementation check',
             '**No** — no existing test'],
            ['5', 'Feasibility check demanded whole route fit in tanks',
             'Wrong condition', 'Exhaustive oracle', 'No'],
            ['6', 'Infinite loop on identical labels',
             'Non-termination', 'Test suite timeout',
             '**No** — not a wrong answer'],
        ],
        widths=[5, 30, 16, 22, 27])

    story += CODE(
        '''// One defect, in full — the infinite loop

// A zero-cost, zero-fuel cycle produces a label identical to one already
// present. Identical labels do not strictly dominate one another, so
// without this the planner re-queues the same (cost, fuel) pair forever
// and never terminates.

      for (const other of target) {
        if (dominates(other.costCents, other.fuelUsedKg, costCents, fuelUsedKg)) {
          dominated = true; break;
        }
        if (other.costCents === costCents && other.fuelUsedKg === fuelUsedKg) {
          dominated = true; break;
        }
      }''')

    story += TABLE(
        ['Pattern', 'Count', 'Implication'],
        [
            ['Found by reading code', '2',
             'The test suite was not looking for these'],
            ['Found by differential testing', '3',
             'The highest-yield technique in the codebase'],
            ['Found by the test simply running', '1',
             'Non-termination is invisible to assertions'],
            ['Code and test wrong together', '1',
             'The normal failure mode of hand-written expectations'],
        ],
        widths=[38, 12, 50])

    story += HR()

    story += H2('Where software verification ends')

    story += TABLE(
        ['Area', 'What the code guarantees', 'What requires a qualified human'],
        [
            ['Cost taxonomy',
             'Categories are valid; totals reconcile; parts sum exactly',
             'Whether the categories match IFRS and IATA reporting requirements'],
            ['Regulatory reserve',
             'Fuel never drops below the configured figure',
             'Whether the configured figure is legally correct for the '
             'jurisdiction'],
            ['MEL intervals',
             'Deadlines computed from the category table, UTC, end-of-day',
             'Whether the category table matches current EASA CS-GEN-MMEL'],
            ['AD applicability',
             'Serial range and threshold rules applied as given',
             'Whether the model matches how a regulator actually determines '
             'applicability'],
            ['Emission factors',
             'Tonnes computed from the configured factor',
             'Whether the factor is correct; whether the operator\'s own '
             'approved MRV method is required instead'],
            ['Fuel burn coefficients',
             'Marginal seat cost computed from the constants',
             'Validation against this fleet\'s measured data'],
            ['Operating policy',
             'The numbers are computed and shown',
             'What the airline should do about them'],
        ],
        widths=[18, 38, 44])

    story += LOCK(
        'The boundary, stated as precisely as it can be',
        'Every test in AMS proves the code does what its authors intended. '
        '**No test can prove the intent was correct.**\n\n'
        '```\n'
        '// What the system proves:\n'
        '//   "Cumulative fuel on this route never exceeds capacity minus the\n'
        '//    configured reserve of 1500 kg."\n'
        '//\n'
        '// What it cannot prove:\n'
        '//   "1500 kg is the legally correct reserve for this operation."\n'
        '```\n\n'
        'If the regulatory reserve requirement is wrong, all 190 tests pass and '
        'the aircraft is dispatched below its legal minimum. Software can '
        'enforce a rule; only a qualified person can establish that the rule is '
        'the right one.\n\n'
        'This is not a limitation to be engineered away. It is a permanent '
        'division of responsibility, and pretending otherwise is how systems '
        'cause harm.')

    story += HR()