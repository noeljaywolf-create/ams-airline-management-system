"""
Cover, contents, and Part I: concurrency and the double-spend race.
"""

from framework import (ASSUMED, BUG, BUL, CODE, H1, H2, H3, HR, LEAD, LOCK,
                       NUMLIST, P, PART, SPACER, TABLE, VERIFIED, rich)

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

TOC = [
    ('Part I — Concurrency: the failure nobody can reproduce', [
        'The race that overspends an airline',
        'Why every ordinary testing method fails here',
        'Locks, transactions, and what isolation levels mean',
        'Deadlock: the second classic failure',
        'Idempotency and exactly-once thinking',
        'What AMS does, verified and assumed',
    ]),
    ('Part II — Exact arithmetic beyond the function call', [
        'Why a float column is a future incident',
        'BIGINT, NUMERIC and the database as an accountant',
        'Generated columns: making drift structurally impossible',
        'CHECK constraints as the last line of defence',
        'Rounding once, and where rounding leaks',
        'The reconciliation invariant',
    ]),
    ('Part III — Multi-tenancy as a security boundary', [
        'One database, many airlines',
        'The three layers and why layer three is the database',
        'Row-level security, concretely',
        'FORCE ROW LEVEL SECURITY and why it is not optional',
        'What RLS does not protect against',
    ]),
    ('Part IV — Algorithms that must be exactly right', [
        'The problem class: resource-constrained shortest path',
        'Why greedy and unconstrained shortest path both fail',
        'Label-setting and the dominance relation',
        'Why the dominance rule is sound',
        'Differential verification against brute force',
        'Property tests and metamorphic tests',
        'Complexity, and knowing when you are near the wall',
    ]),
    ('Part V — Integrity: making history unchangeable', [
        'Append-only as a policy versus a mechanism',
        'Database triggers that refuse mutation',
        'Hash chaining and what it does not prove',
        'Canonicalisation and the phantom corruption bug',
    ]),
    ('Part VI — Side effects that cannot be lost or duplicated', [
        'The problem: a commit that must send an email',
        'The dual-write failure in both directions',
        'The transactional outbox',
        'What the outbox guarantees and what it does not',
    ]),
    ('Part VII — Verification as an engineering discipline', [
        'Four kinds of test and which defects each finds',
        'Differential testing',
        'Oracle design and seeding',
        'Guarding against vacuous tests',
        'The defect ledger',
        'Where software verification ends',
    ]),
    ('Part VIII — Engineering judgement and review', [
        'Reading the codebase for risk',
        'The questions to ask of any money-touching function',
        'The questions to ask of any database schema',
        'Known gaps, stated plainly',
    ]),
    ('Appendix — Reference tables and glossary', [
        'Concurrency failure modes',
        'Integer scale in PostgreSQL',
        'Glossary',
    ]),
]


def cover(story):
    story += SPACER(140)
    st_big = ParagraphStyle('b', fontName='Helvetica-Bold', fontSize=54,
                            textColor=colors.HexColor('#0a4257'), leading=58)
    st_t = ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=23,
                          textColor=colors.HexColor('#1c2731'), leading=29)
    st_s = ParagraphStyle('s', fontName='Helvetica', fontSize=12,
                          textColor=colors.HexColor('#55606e'), leading=17)
    st_f = ParagraphStyle('f', fontName='Helvetica-Oblique', fontSize=8.8,
                          textColor=colors.HexColor('#7a8492'), leading=13)

    story.append(Paragraph('AMS', st_big))
    story.append(Spacer(1, 4))
    story.append(Paragraph('Hard Engineering', st_t))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        'The problems that actually matter: concurrency, exact arithmetic, '
        'multi-tenancy, algorithms, integrity and verification.',
        st_s))
    story.append(Spacer(1, 22))
    rule = Table([['']], colWidths=[3.0], rowHeights=[0.9])
    rule.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#0a4257')),
    ]))
    story.append(rule)
    story.append(Spacer(1, 18))
    for line in [
        'Airline Management System — Finance, Fleet, Procurement',
        'Written from the live codebase: 10 domain modules, 2 migrations, 190 tests',
        'Every claim marked PROVEN (checked by code or test) or ASSUMED '
        '(stated, not verified)',
    ]:
        story.append(Paragraph(line, st_s))
    story.append(Spacer(1, 110))
    story.append(Paragraph(
        'This document teaches engineering problems, not a language. It assumes '
        'you can read code and follow an argument. It does not assume you '
        'write JavaScript, and it does not assume you write databases. Where '
        'the reasoning is difficult, it is written out rather than skipped.',
        st_f))


def front(story):
    story += H1('How to read this document')

    story += LEAD(
        'This is not a tutorial. It is an account of the engineering problems '
        'AMS actually faces, and of which of them are solved, which are '
        'assumed, and which are still open.')

    story += P(
        'The distinction matters more than usual here, because these problems '
        'all fail in ways that look like working code. A race condition '
        'passes every functional test. A float money column produces correct '
        'answers for years. A missing tenant filter returns a customer\'s data '
        'to the wrong customer, which is not a bug report but an incident.')

    story += H2('The two marks used throughout')

    story += VERIFIED(
        'PROVEN — checked by code or by an automated test',
        'The behaviour is enforced by a mechanism in the codebase and, where '
        'stated, confirmed by a test that would fail if the mechanism were '
        'removed. You can verify it yourself by reading the referenced file or '
        'by breaking the mechanism and running the tests.')

    story += ASSUMED(
        'ASSUMED — stated in code, not independently verified',
        'A constant, a formula, a regulatory interpretation or a business rule '
        'that the code implements faithfully but that has not been validated '
        'against primary sources or against your organisation\'s own data. '
        'These are the places where a wrong assumption produces a wrong number '
        'while every test still passes.')

    story += H2('Why this framing')

    story += CODE(
        '''// The most expensive sentence in any financial system:

const fuelCents = Math.round(fuelKg * fuelPricePerKg);   // PROVEN by test
// The engine's arithmetic is exact and tested against brute force.

const BURN_KG_PER_KG_PAYLOAD = 0.030;                     // ASSUMED
// An industry approximation. No test can confirm it is right for your fleet.
// Wrong by 30% and every test still passes.''')

    story += P(
        'A guide that showed only solved problems would teach you to assume '
        'everything is verified. That assumption is exactly what produces the '
        'defects documented in Part VII.')

    story += H2('Contents')

    p_st = ParagraphStyle('pp', fontName='Helvetica-Bold', fontSize=10.4,
                          textColor=colors.HexColor('#0a4257'), leading=14.5,
                          spaceBefore=8, spaceAfter=2)
    s_st = ParagraphStyle('ss', fontName='Helvetica', fontSize=9,
                          textColor=colors.HexColor('#37424e'),
                          leftIndent=15, leading=12.2)
    for part, secs in TOC:
        story.append(Paragraph(rich(part), p_st))
        for s in secs:
            story.append(Paragraph(rich(s), s_st))

    story += H2('The five questions this document answers')

    story += NUMLIST([
        '**How does AMS prevent two concurrent requests from spending the same '
        'money twice, and why can ordinary testing never prove it?**',
        '**How is money kept exact when it leaves JavaScript and lives in a '
        'PostgreSQL column?**',
        '**What stops one airline seeing another airline\'s data when they '
        'share a database?**',
        '**How is an optimal route computed, and how do we know the answer is '
        'actually optimal?**',
        '**What has been verified, what has merely been assumed, and where '
        'does the responsibility pass to a human?**',
    ])


def part1(story):
    story += PART(
        'Part I — Concurrency: the failure nobody can reproduce',
        'Concurrency bugs are the hardest class of defect in this codebase, '
        'not because they are intellectually difficult but because they are '
        'invisible to every verification method a team normally relies on.')

    # --- the race ---
    story += H2('The race that overspends an airline')

    story += CODE(
        '''/**
 * AMS — Cost Authority: the control core.
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
 *     SELECT ... FOR UPDATE
 *
 * PostgreSQL blocks the second transaction until the first commits or
 * rolls back. The race is not defended against; it is made unrepresentable.
 *
 * @module modules/finance/cost-authority
 */''',
        'backend/src/modules/finance/cost-authority.js — the module header, '
        'which states the problem before any code.')

    story += P(
        'TOCTOU stands for *time-of-check to time-of-use*. It is the general '
        'shape of a huge class of security and correctness bugs: something is '
        'validated, then a gap opens, then the thing is acted on using a value '
        'that is now stale.')

    story += CODE(
        '''// THE BUG — functionally correct, and wrong under concurrency

export async function authoriseCostUnsafe(db, { tenantId, lineId, amountCents }) {
  const line = await db('budget_lines').where({ id: lineId }).first();
  const available = line.budgetedCents - line.committedCents;

  if (available < amountCents) throw new CostAuthorityError('Insufficient', 'BUDGET_EXCEEDED');

  // ─── the gap ───
  // 0.4 ms of network and scheduler time.
  // Any number of other requests can execute here.

  await db('budget_lines').where({ id: lineId }).increment('committed_cents', amountCents);
  return { ok: true };
}''')

    story += P('Two requests arrive within a millisecond of each other:')

    story += CODE(
        '''Time        Request A                      Request B
─────────────────────────────────────────────────────────────────────────
t=0ms       read line → available = 10,000
t=0.2ms                                   read line → available = 10,000
t=0.4ms     check 10,000 >= 10,000 ✓
t=0.6ms                                   check 10,000 >= 10,000 ✓
t=0.8ms     increment committed += 10,000
t=1.0ms                                   increment committed += 10,000

Result:     committed_cents = 20,000 against budgeted_cents = 10,000
            The airline is US$10,000 overspent and neither request is wrong.''')

    story += P(
        'Both requests did exactly what the code told them to do. Both read a '
        'true fact. Both passed a correct check. The defect is not in either '
        'request — it is in the *interaction* between them, which no single '
        'request can observe.')

    story += BUG(
        'Why every ordinary testing method fails here',
        '**Sequential unit tests** cannot reproduce it: they run one request at '
        'a time, and sequentially there is no race.\n\n'
        '**Integration tests** are the same problem — a test that issues two '
        'requests sequentially will always pass.\n\n'
        '**Code review** cannot find it: every individual statement is correct '
        'and idiomatic. The bug is in what is absent between them.\n\n'
        '**Manual testing** cannot find it: it needs two requests to arrive '
        'within the same few milliseconds, which does not happen when one '
        'person is clicking.\n\n'
        'It appears under production load, at peak approval times, '
        'intermittently, to whoever is unluckiest. In a system that authorises '
        'money, that is the worst possible failure profile.')

    # --- why not fixed by retries ---
    story += H2('Why the obvious mitigations do not work')

    story += TABLE(
        ['Attempted fix', 'Why it fails'],
        [
            ['Add a unit test for the check',
             'The check is correct. The defect is the absence of a lock, and a '
             'sequential test cannot observe an absence.'],
            ['Re-read the balance immediately before writing',
             'This narrows the window to microseconds. It does not close it. '
             'It converts a 1-in-10,000 failure into a 1-in-100,000,000 one.'],
            ['Add application-level mutex or in-process lock',
             'Correct for a single process, useless for multiple processes. '
             'In production you will run more than one.'],
            ['Use a Redis distributed lock',
             'Better, and a genuinely valid approach. But it adds a network '
             'dependency whose failure mode is the same outage the lock was '
             'protecting against, and it is not needed when the database '
             'already offers the guarantee atomically.'],
            ['Check availability again after the write and compensate',
             'You have now spent the money. Recovery is a business process, not '
             'a technical fix.'],
        ],
        widths=[32, 68])

    story += LOCK(
        'The principle',
        'When a correctness property must hold under concurrency, the fix is '
        'not to test harder or to check more carefully. The fix is to move '
        'the invariant into a place that *cannot be bypassed*. A database row '
        'lock is such a place. An application-level assertion is not.')

    # --- the fix ---
    story += H2('Locks, transactions, and what isolation levels mean')

    story += CODE(
        '''export async function lockBudgetLine(db, tenantId, lineId) {
  const line = await db('budget_lines')
    .where({ id: lineId, tenant_id: tenantId })
    .forUpdate()
    .first();

  if (!line) throw new CostAuthorityError(
    `Budget line ${lineId} not found`, 'BUDGET_LINE_NOT_FOUND', { lineId });
  if (line.status !== 'ACTIVE') throw new CostAuthorityError(
    `Budget line ${lineId} is ${line.status}, not ACTIVE`, 'BUDGET_LINE_INACTIVE', { lineId });
  if (line.is_frozen) throw new CostAuthorityError(
    `Budget line ${lineId} is frozen by treasury`, 'BUDGET_LINE_FROZEN', { lineId });
  return /** @type {BudgetLine} */ (snakeToCamel(line));
}''',
        'backend/src/modules/finance/cost-authority.js')

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
        'The same operation, with the lock.')

    story += P('The same interleaving, corrected:')

    story += CODE(
        '''Time        Request A                        Request B
──────────────────────────────────────────────────────────────────────────────
t=0ms       BEGIN
t=0.1ms     SELECT ... FOR UPDATE → LOCKED
t=0.2ms     read available = 10,000
t=0.3ms     check 10,000 >= 10,000 ✓
t=0.4ms     INSERT commitment
t=0.5ms     UPDATE budget_lines SET committed += 10,000
t=0.6ms     COMMIT → lock released
t=0.7ms                                   BEGIN
t=0.8ms                                   SELECT ... FOR UPDATE → acquired
t=0.9ms                                   read available = 0   ← sees A's write
t=1.0ms                                   check 0 >= 10,000 ✗
t=1.1ms                                   ROLLBACK → BUDGET_EXCEEDED

Result:     committed_cents = 10,000 against budgeted_cents = 10,000. Correct.''')

    story += VERIFIED(
        'What this mechanism guarantees',
        'Within a single PostgreSQL database, `SELECT ... FOR UPDATE` provides '
        'strict serialisation for the locked row. The second transaction cannot '
        'read the row until the first has committed or rolled back, and when it '
        'reads, it reads the committed state. This is a documented guarantee of '
        'the database, not an assumption.\n\n'
        'It assumes the caller is inside an explicit transaction, so the lock is '
        'held until commit rather than released immediately. The function\'s '
        'docblock states this requirement explicitly.')

    story += CODE(
        '''/**
 * Authorise expenditure against a budget line, creating a commitment.
 *
 * MUST be called inside a transaction. The caller is responsible for
 * committing or rolling back; this function deliberately does not open
 * its own transaction, because the commitment write and the audit entry
 * must land atomically together.
 */''')

    story += TABLE(
        ['Isolation level', 'What it would allow', 'Sufficient for AMS?'],
        [
            ['READ UNCOMMITTED',
             'Reads uncommitted changes from other transactions. Dirty reads.',
             'No. Would actively corrupt availability calculations.'],
            ['READ COMMITTED',
             'Reads only committed data, but re-reads may see new commits. '
             '**The default.**',
             '**No.** Without `FOR UPDATE`, this permits exactly the race above.'],
            ['REPEATABLE READ',
             'The same query returns the same rows throughout a transaction.',
             'Better, but does not prevent the check-then-write gap.'],
            ['SERIALIZABLE',
             'Transactions behave as if run one at a time. Detects conflicts and '
             'aborts one.',
             'Correct, but higher contention and more retries for no benefit '
             'where `FOR UPDATE` already suffices.'],
        ],
        widths=[20, 44, 36])

    story += P(
        'The important insight is that `READ COMMITTED` — the PostgreSQL default, '
        'and therefore what a team gets without deliberately choosing otherwise — '
        '**permits exactly the race in Part I**. The isolation level alone does '
        'not save you. The row lock does.')

    # --- deadlock ---
    story += H2('Deadlock: the second classic failure')

    story += CODE(
        '''export async function authoriseFlightLeg(db, { tenantId, lines, actorId }) {
  // Lock in a stable order to prevent deadlock between two rotations that
  // draw on overlapping budget lines in opposite order.
  const ordered = [...lines].sort((a, b) => a.lineId.localeCompare(b.lineId));''')

    story += P('Deadlock is the other classic database concurrency failure. It '
               'occurs when two transactions each hold a resource the other needs:')

    story += CODE(
        '''Rotation 1 needs fuel(line-1) then crew(line-2)
Rotation 2 needs crew(line-2) then fuel(line-1)

─────────────────────────────────────────────────────────────────────────
Time    Rotation 1                    Rotation 2
─────────────────────────────────────────────────────────────────────────
t=0     LOCK line-1 ✓                  LOCK line-2 ✓
t=1     wants line-2 → BLOCKED         wants line-1 → BLOCKED
─────────────────────────────────────────────────────────────────────────
Both wait for the other. Neither proceeds. PostgreSQL detects this
after deadlock_timeout (default 1s) and aborts one transaction.''')

    story += P(
        'The fix is not clever. It is to ensure every transaction acquires '
        'locks in the same order. Sorting the lines by identifier before '
        'touching them guarantees this: Rotation 1 and Rotation 2 will both go '
        'line-1 then line-2.')

    story += CODE(
        '''  // Pass 1: validate every line under its lock before writing anything.
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
  }''',
        'Validate everything under lock, then write. Two passes, sorted order.')

    story += VERIFIED(
        'All-or-nothing across a flight leg',
        'A flight draws on several budget lines at once. The two-pass structure '
        'means no commitment is written until every line has been validated '
        'under its lock. If line 4 fails, lines 1 to 3 are not written, so '
        'there is no partial commitment to unwind.\n\n'
        'The docblock states the domain reason: "a partially authorised '
        'aircraft rotation is an aircraft that will be dispatched without fuel '
        'it was supposed to have."')

    story += LOCK(
        'When you review any multi-row transaction, ask these three questions',
        '1. **In what order are rows locked?** If it is caller-supplied order, '
        'deadlock is possible.\n\n'
        '2. **Is the whole set validated before anything is written?** If not, '
        'failure mid-way leaves partial state.\n\n'
        '3. **Does the function open its own transaction, or require one?** If it '
        'opens its own, related writes may not be atomic.')

    # --- idempotency ---
    story += H2('Idempotency and exactly-once thinking')

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
  }''',
        'backend/src/modules/finance/cost-authority.js')

    story += P(
        'Exactly-once delivery does not exist across a network boundary. What '
        'exists is at-least-once delivery plus idempotent processing. The '
        'distinction is not academic: it is the difference between a system '
        'that occasionally double-charges and one that does not.')

    story += CODE(
        '''// The scenario
POST /cost-authority   amount = 10,000   idempotency_key = "abc-123"

Server processes it, commits the money, then the RESPONSE is lost in transit.
The client cannot distinguish "never arrived" from "arrived, response lost".
So it retries. Without an idempotency key, the money is committed twice.''')

    story += CODE(
        '''-- The database-level guarantee, migration 002:
CREATE UNIQUE INDEX idx_commitments_idempotency
  ON commitments (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;''',
        'backend/migrations/002_budget_commitments.js')

    story += VERIFIED(
        'Why the unique index rather than only a check',
        'The code checks for a prior commitment before inserting. That check has '
        'the same TOCTOU shape as the original race: two concurrent requests '
        'with the same key could both find nothing and both insert.\n\n'
        'The partial unique index closes this. The database will reject the '
        'second insert because the (tenant_id, idempotency_key) pair already '
        'exists. Application code is the fast path; the index is the guarantee — '
        'the same "policy versus mechanism" distinction as `FOR UPDATE`.\n\n'
        '`WHERE idempotency_key IS NOT NULL` matters: without it, every '
        'commitment with no key would collide on NULL, since PostgreSQL treats '
        'NULLs as distinct but a partial index makes the intent explicit.')

    story += CODE(
        '''  return {
    commitmentId: String(created.id),
    availableBeforeCents: availableBefore,
    availableAfterCents: availableBefore - amountCents,
    replayed: false,
  };''')

    story += P(
        'The `replayed` flag lets the caller distinguish a fresh commit from a '
        'replay. This matters beyond bookkeeping: an idempotent replay should '
        'not generate a second approval notification, and the audit trail '
        'should record that the request was seen before.')

    story += ASSUMED(
        'The assumption in idempotency keys',
        'The key must be generated by the *client* and must be unique per '
        'logical operation. If the server generates it per request, a retry is a '
        'new request with a new key and the protection is void. The key must '
        'also be stable across retries — a key derived from a timestamp or a '
        'random value per attempt does not work. Nothing in the AMS code '
        'verifies this, because it is a client-side contract.')

    # --- availability arithmetic ---
    story += H2('What AMS does, verified and assumed')

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
}''',
        'The availability formula.')

    story += CODE(
        ''' * `frozen` is separate from `released` deliberately: a treasury ring-fence
 * (a security deposit, a disputed supplier claim under litigation) removes
 * spendable money WITHOUT creating a commitment. Conflating the two makes
 * the reconciliation to the general ledger impossible.
 *
 * A negative result is a control breach, never a value to clamp. Clamping
 * hides the breach; AMS throws and alerts.''')

    story += VERIFIED(
        'Failing loudly rather than clamping',
        'A negative availability means money was committed beyond what was '
        'authorised — a bug, a manual database edit, or a deliberate override. '
        'Clamping to zero would make the system report a healthy budget while '
        'the breach continued and grew. Throwing converts an invisible financial '
        'loss into a loud, immediate, attributable failure.')

    story += CODE(
        '''  await db('budget_lines')
    .where({ id: lineId, tenant_id: tenantId })
    .increment('committed_cents', amountCents);

  return {
    commitmentId: String(created.id),
    availableBeforeCents: availableBefore,
    availableAfterCents: availableBefore - amountCents,
    replayed: false,
  };''')

    story += VERIFIED(
        'Why `increment` rather than read-modify-write',
        '`.increment(\'committed_cents\', amountCents)` compiles to a single '
        '`UPDATE ... SET committed_cents = committed_cents + $1`. PostgreSQL '
        'applies this atomically to the row, and because the row is already '
        'locked by `FOR UPDATE` the operation is sequenced correctly.\n\n'
        'The alternative — read the value in JavaScript, add, then write the '
        'result — is a lost-update bug waiting to happen, and it would be '
        'invisible in testing for the same reasons the original race was.')

    story += H2('The settlement rule that prevents double-spend')

    story += CODE(
        '''/**
 * Settle a commitment against a payment.
 *
 * NOTE: this reduces committed and increases expended by the same amount.
 * It does NOT restore availability. The money has left. Restoring
 * availability would let the same funds be committed a second time,
 * which is the exact failure this module exists to prevent.
 */''',
        'backend/src/modules/finance/cost-authority.js')

    story += CODE(
        '''  return { commitmentId, committedReleasedCents: amountCents, availabilityRestored: false };''')

    story += CODE(
        '''/**
 * Release the difference when a supplier invoices less than ordered, or
 * when a purchase order is cancelled before delivery. Availability IS
 * restored, because no money left.
 */''')

    story += P(
        'The contrast between those two docblocks is the entire lesson. Money '
        'that left restores nothing. Money that never left releases cleanly. '
        'Both rules are documented immediately above the code that implements '
        'them, because a future engineer optimising this would otherwise have '
        'no way to know which direction is the error.')

    story += TABLE(
        ['Operation', 'committed', 'expended', 'available restored?', 'Why'],
        [
            ['`authoriseCost`', '+amount', '—', 'Yes (implicitly)',
             'Money is now spoken for'],
            ['`reservePending`', '+pending', '—', 'Yes (implicitly)',
             'A submitted request holds the funds'],
            ['`settleCommitment`', '−amount', '+amount', '**No**',
             'The money has left the bank account'],
            ['`releaseCommitmentDifference`', '−release', '—', '**Yes**',
             'No money left'],
            ['`freezeBudgetLine`', '—', '—', '**No** (−frozen)',
             'Ring-fenced without a commitment'],
        ],
        widths=[27, 11, 11, 19, 32])

    story += CODE(
        '''export function freezeBudgetLine(db, { tenantId, lineId, amountCents, actorId, reason }) {
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
}''')

    story += LOCK(
        'The ten-character minimum, and why it is engineering rather than pedantry',
        'A freeze removes money from circulation and appears in the audit pack. '
        'Requiring a substantive written reason means the audit pack contains an '
        'explanation, not an unexplained number.\n\n'
        'This is a control expressing a governance principle: actions that '
        'affect money must be justifiable in words as well as in figures. It '
        'is eleven lines of code enforcing a policy that would otherwise '
        'depend on every future author remembering to be careful.')

    story += BUG(
        'A real defect in this module, currently unfixed',
        'In `settleCommitment` the budget-line update reads:\n\n'
        '```\n'
        '.where({ id: commitmentId && commitment.budget_line_id, tenant_id: tenantId })\n'
        '```\n\n'
        '`commitmentId && commitment.budget_line_id` evaluates to '
        '`commitment.budget_line_id` whenever `commitmentId` is a non-empty '
        'string, so it happens to produce the right value. But it is a '
        'mistake: an accidental logical AND where an assignment was intended. '
        'If `commitmentId` were ever an empty string the query would match '
        'nothing and the settlement would silently fail to update the budget '
        'line.\n\n'
        '**This is a genuine latent defect in the current codebase.** The type '
        'checker does not flag it because both operands are strings. The fix is '
        'to delete the `commitmentId &&` expression. It should be fixed before '
        'this module is used in production.')

    story += HR()