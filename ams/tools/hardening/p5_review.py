"""
Part VIII: engineering judgement and review.
Appendix: reference tables and glossary.
"""

from framework import (ASSUMED, BUG, BUL, CODE, H1, H2, H3, HR, LEAD, LOCK,
                       NUMLIST, P, PART, TABLE, VERIFIED)
from framework import S, rich

from reportlab.platypus import Paragraph, Spacer


def part8(story):
    story += PART(
        'Part VIII — Engineering judgement and review',
        'The most useful thing this document can give you is a way to read the '
        'codebase for risk — and a question list you can apply to any money-'
        'touching or safety-touching function without reading the whole file.')

    story += H2('Reading the codebase for risk')

    story += P(
        'The modules are not equally risky. Knowing where the risk is '
        'concentrated determines where a reviewer should spend their hour.')

    story += TABLE(
        ['Module', 'What a wrong answer causes', 'Verification', 'Risk'],
        [
            ['`money.js`', 'Every figure in the system drifts',
             'Directly tested; exactness is structural', '**Low**'],
            ['`routing/constrained-path.js`',
             'An unflyable route is dispatched',
             'Three implementations cross-checked; 190 tests',
             '**Low**'],
            ['`metrics.js`', 'Commercial ratios are wrong',
             'Tested; recomputation discipline documented', '**Low**'],
            ['`audit/chain.js`', 'Tampering becomes undetectable',
             'Simple, self-contained; soundness argued', '**Low**'],
            ['`domain.js`', 'Nothing — it is data',
             'Used as the source for DB constraints', '**Very low**'],
            ['`costing.js`', 'Route decisions are wrong',
             'Tested, but two defects shipped green', '**Medium**'],
            ['`carbon.js`',
             'A compliance misstatement; a double-counted obligation',
             'Partially tested; one rounding defect found', '**Medium**'],
            ['`airworthiness.js`',
             '**An aircraft flies with an expired deferral**',
             'Tested against researched rules; not verified by a licensed '
             'professional', '**HIGH**'],
            ['`fuel.js`', 'Tankering decisions are mispriced',
             'Tested; constants are industry assumptions', '**Medium**'],
            ['`cost-authority.js`',
             '**The airline overspends**',
             'Concurrency fixed by lock; **one live defect**', '**HIGH**'],
        ],
        widths=[27, 26, 27, 10])

    story += P(
        'The two HIGH-risk modules are the two where a wrong answer is '
        'unrecoverable: money that leaves the bank account, and an aircraft '
        'that is not legally airworthy. Neither is the most complex code in the '
        'system, and neither is where a naive reviewer would look first.')

    story += H2('The questions to ask of any money-touching function')

    story += CODE(
        '''// Read the function. Then ask, in this order:

// 1. UNITS
//    What unit is every number in? Cents, kg, ppm, hours?
//    Is the unit in the name? (amountCents not amount)
//    If two numbers are multiplied, is the resulting unit what the caller expects?

// 2. VALIDATION
//    Does every monetary input pass through assertSafeInteger or intOr?
//    Is a float rounded, or does it throw?
//    Throwing is correct. Rounding a float that arrived from upstream hides a bug.

// 3. ROUNDING
//    Where exactly is the rounding, and is it stated in a comment?
//    Is it rounded once at creation, or repeatedly downstream?
//    Is the rule symmetric about zero? (Math.round(-0.5) === -0)

// 4. RECONCILIATION
//    Do the parts provably sum to the whole?
//    Is there an assertReconciles or equivalent self-check?
//    Is there a database constraint that enforces it independently?

// 5. ZERO AND NEGATIVE
//    What happens at zero? At negative? At null?
//    Is `??` used where zero carries meaning, rather than `||`?

// 6. PRECISION
//    Could this value be large enough that the chosen unit rounds to zero?
//    CASK in cents rounds to 0 for a long haul. Microcents exist for this.''')

    story += CODE(
        '''// Applied to the DEFECT 2 function — what the questions reveal

// UNITS:     revenueCents ✓, loadFactorPpm ✓ — names are good
// VALIDATION: no check that the division is meaningful
// ROUNDING:  the bug — `(revenue / X) * 0` rounds nothing, it erases everything
// RECONCILIATION: none applicable
// ZERO:      no field could represent "load factor cannot fix this"
// PRECISION: not applicable

// Question 6 and the "what business case can't you express" question
// together would have surfaced that the function had no answer for
// an unprofitable passenger.''')

    story += H2('The questions to ask of any database schema')

    story += CODE(
        '''// 1. TYPES
//    Is every money column BIGINT (or NUMERIC)? Any FLOAT is a defect.
//    Is the unit visible in the column name? (budgeted_cents, not amount)
//    Are non-integer quantities stored as NUMERIC rather than forced to int?
//      aircraft.current_hours NUMERIC(14,2) — correct. Flight hours are fractional.

// 2. CONSTRAINTS
//    Is every enumerated column constrained to its allowed values?
//    Is there a CHECK for every invariant the application relies on?
//    Would the system be safe if a new client ignored every application rule?

// 3. TENANCY
//    Does every table have tenant_id NOT NULL?
//    Is RLS enabled? Is it FORCED? (ENABLE alone protects nothing if the
//      application connects as the table owner — the default)
//    Is the tenant set scoped to the transaction, so pooling cannot leak it?

// 4. DELETION
//    What happens when a tenant is deleted? CASCADE destroys audit evidence.
//    Is there a soft-delete or CLOSED status path? (tenants.status has one;
//      nothing implements the path)

// 5. DERIVED VALUES
//    Is anything computed stored rather than generated?
//    Any stored derived value is a drift risk. GENERATED ALWAYS cannot drift.

// 6. REFERENCES
//    Do foreign keys CASCADE or RESTRICT? Each choice is a decision.
//    Is ON DELETE CASCADE right for a parent that a regulator may ask about?''')

    story += CODE(
        '''// Applied to migration 002 — a real finding

// Q1: budget_lines uses BIGINT for money ✓, with _cents in every name ✓
// Q2: every state column CHECK-constrained ✓
//     available_cents >= 0 ✓
// Q3: every table has tenant_id NOT NULL ✓, RLS ENABLE + FORCE ✓
//     But: app.tenant_id is a connection setting. Pooling is the hazard. Not handled.
// Q4: aircraft, budget_lines etc. CASCADE from tenants. Destroys audit evidence.
//     tenants.status includes 'CLOSED' — the safe path exists in the schema
//     and is not implemented anywhere.
// Q5: available_cents is GENERATED ALWAYS ✓ — the best pattern in the schema.
//     But availabilityCents() duplicates the formula in JavaScript with no
//     automated check that they agree.
// Q6: budget_lines → budgets CASCADE. Deleting a draft budget removes its lines.
//     Defensible, but worth a deliberate decision.''')

    story += CODE(
        '''// 7. CONCURRENCY
//    Is any read-modify-write in the application layer?
//      Read in JS, add, write the result → lost update.
//      Use .increment() / a single UPDATE ... SET x = x + $1.
//    Is any check-then-write outside a lock?
//      → TOCTOU. See Part I.
//    In a multi-row transaction, is the lock order deterministic?
//      → otherwise deadlock is possible.

// 8. ATOMICITY
//    Does a business change and its audit entry land in one transaction?
//    Does a business change and its notification intent land in one transaction?
//    Is there an outbox? (migration 001 has one ✓)

// 9. IMMUTABILITY
//    Should any table be append-only? Is that enforced by trigger, or only convention?
//    (audit_logs has triggers ✓ — the mechanism, not the policy)''')

    story += H2('Known gaps, stated plainly')

    story += P(
        'These are recorded so they are not discovered later. Nothing here is '
        'a suggestion; each is a known limitation of the current code.')

    story += TABLE(
        ['Gap', 'Impact', 'Severity'],
        [
            ['`commitmentId && commitment.budget_line_id` in `settleCommitment` '
             '(cost-authority.js:361)',
             'An accidental logical AND where an assignment was intended. '
             'Currently evaluates correctly; would silently fail if '
             '`commitmentId` were ever an empty string.',
             '**Fix before production**'],
            ['Audit chain has no head lock',
             'Concurrent audit writes for one tenant can produce two entries '
             'with the same predecessor, breaking the chain.',
             '**Fix before audit writes exist**'],
            ['Outbox has no `SKIP LOCKED` claim',
             'Two concurrent workers would deliver the same message twice.',
             '**Fix before a worker exists**'],
            ['No external chain-head anchoring',
             'The audit trail detects partial tampering only. A full rewrite '
             'is undetectable.', 'Design decision needed'],
            ['`strict: false` in tsconfig',
             'Null and undefined are not rigorously checked in code that '
             'handles money and airworthiness.',
             'Should be `true`'],
            ['No CI pipeline',
             '`npm run typecheck` must be run by hand. Nothing enforces it.',
             'Process gap'],
            ['Availability formula duplicated',
             '`availabilityCents()` in JS and the generated column in SQL must '
             'agree. No test asserts it.',
             'Add a regression test'],
            ['Tenant deletion CASCADE',
             'Deleting a tenant destroys audit evidence irreversibly.',
             'Needs a compliance decision'],
            ['Five of six SOD rules unenforced',
             'Declared in `SOD_RULES`, detected for one rule only.',
             'Scope decision'],
            ['No server, no authentication, no API',
             'The system cannot be run. No request can be authenticated; no '
             'tenant context is set.', '**Blocking**'],
            ['Server identity `Knex` typedef is a stand-in',
             'The cost-authority module has never been executed against a '
             'real database.', '**Blocking**'],
            ['Regulatory constants unverified',
             'MEL intervals, emission factors, burn coefficients are '
             'researched but not validated by a qualified professional.',
             '**Blocking for regulated use**'],
        ],
        widths=[27, 45, 18])

    story += CODE(
        '''// The stand-in that blocks execution of the control core:

/**
 * Structural stand-in for the Knex instance, declared locally so the
 * type-check gate works without the runtime dependency installed. When
 * `knex` lands, replace this with `import('knex')` and delete it.
 *
 * @typedef {Object} Knex
 * @param {string} tableName
 * @returns {any} QueryBuilder
 */''')

    story += LOCK(
        'What "blocking" means here, precisely',
        'The pure domain modules — money, metrics, costing, airworthiness, '
        'fuel, carbon, routing — are tested and can be relied on as '
        'calculations.\n\n'
        'The modules that touch a database — cost-authority, audit chain — have '
        '**never been executed**. Their SQL is written but unrun, their type is '
        'a stand-in, and the concurrency behaviour described in Part I is '
        'documented from PostgreSQL\'s specification rather than observed.\n\n'
        'Everything in this document about concurrency, row-level security and '
        'the outbox is engineering reasoning about code that has not run. That '
        'is not a criticism of the reasoning — it is the accurate scope of what '
        'is known.')

    story += H2('What would make this system genuinely production-ready')

    story += NUMLIST([
        '**Write the server, with authentication and tenant context set per '
        'transaction.** Everything in Parts I, III and VI is blocked on this. '
        'Use `FOR UPDATE SKIP LOCKED` for any worker.',
        '**Execute the migrations against a real PostgreSQL 16 instance and '
        'write integration tests that actually hit the database.** The '
        'concurrency claims must be *observed*, not inferred.',
        '**Add a concurrency test that would fail without the lock.** Spawn '
        'parallel authorisation requests against one budget line and assert '
        'that the committed total never exceeds availability. This is the test '
        'the codebase most conspicuously lacks.',
        '**Fix the three defects identified in this document** and add '
        'regression tests for each.',
        '**Turn on `strict: true`** and work through what it finds.',
        '**Wire up CI** so `npm test` and `npm run typecheck` gate every change.',
        '**Add the missing regression test** asserting `availabilityCents()` '
        'and the generated column agree.',
        '**Obtain qualified sign-off** on the regulatory constants: MEL '
        'intervals, emission factors, the reserve model, AD applicability '
        'logic, the cost taxonomy under IFRS and IATA. No amount of testing '
        'substitutes for this.',
        '**Instrument the routing solver** — log `maxFrontier` in production to '
        'turn the O(L) assumption into a measurement.',
        '**Decide the deletion and notification policies** and implement them '
        'before they are needed.',
    ])

    story += LOCK(
        'The single most valuable next step',
        'Not any of the above individually — the **integration test that '
        'reproduces the concurrency scenario**. It is the one class of defect '
        'this codebase has no protection against, it is the one that costs real '
        'money, and it is the one that no amount of unit testing will find.\n\n'
        'Everything else can be added incrementally. That one test either '
        'confirms the central control works or reveals that it does not.')

    story += HR()


def appendix(story):
    story += H1('Appendix — Reference tables')

    story += H2('Concurrency failure modes')

    story += TABLE(
        ['Failure', 'Shape', 'Detection', 'Mechanism that prevents it'],
        [
            ['**Lost update**',
             'Read, modify, write. Two writers overwrite each other.',
             'Only with concurrent writers',
             '`UPDATE x = x + n`, or a row lock'],
            ['**TOCTOU / double spend**',
             'Check, gap, act on a stale value',
             'Only under load',
             '`SELECT ... FOR UPDATE` inside the same transaction'],
            ['**Deadlock**',
             'Two transactions each hold what the other needs',
             'PostgreSQL detects after `deadlock_timeout` (1s)',
             'A deterministic global lock order'],
            ['**Dirty read**',
             'Reading uncommitted data from another transaction',
             'Immediately visible',
             '`READ COMMITTED` or above (the default)'],
            ['**Non-repeatable read**',
             'Re-reading a row and getting a different committed value',
             'Requires a long transaction',
             '`REPEATABLE READ` or `SERIALIZABLE`'],
            ['**Phantom read**',
             'A row matching a predicate appears mid-transaction',
             'Requires a re-query',
             '`SERIALIZABLE`, or a predicate lock'],
            ['**Duplicate side effect**',
             'A side effect performed twice after a retry',
             'Requires a lost response',
             'An idempotency key plus a unique index'],
            ['**Chain fork**',
             'Two concurrent writers read the same predecessor',
             'Only detected at verification time',
             'A lock on the chain head (not implemented)'],
        ],
        widths=[17, 28, 22, 33])

    story += H2('Integer scale in PostgreSQL')

    story += TABLE(
        ['Type', 'Bytes', 'Min', 'Max', 'Money range (as cents)'],
        [
            ['`SMALLINT`', '2', '−32,768', '32,767', 'about $327'],
            ['`INTEGER`', '4', '−2.1 billion', '2.1 billion',
             'about $21 million'],
            ['`BIGINT`', '8', '−9.2 quintillion', '9.2 quintillion',
             'about $92 quadrillion'],
            ['JavaScript safe integer', '8', '−2^53+1', '2^53−1',
             'about $90 trillion'],
        ],
        widths=[24, 8, 20, 20, 28])

    story += TABLE(
        ['Boundary', 'Value', 'Comment'],
        [
            ['`SERIAL`', '2,147,483,647',
             'PostgreSQL runs out of ids well before the range ends'],
            ['`BIGSERIAL`', '9.2 quintillion',
             'Used for `audit_logs.id` and `outbox.id`'],
            ['PostgreSQL index row limit', 'about 8,000 pages',
             'An index over tens of millions of rows needs care'],
        ],
        widths=[32, 24, 44])

    story += H2('Milliseconds since the epoch')

    story += CODE(
        '''// AMS stores dates as milliseconds since the Unix epoch (1970-01-01T00:00:00Z)

const DAY_MS = 86_400_000;

// MEL deadlines — all UTC, which is not optional
export function rectifyDeadline(category, discoveredAtMs) {
  const spec = MEL_CATEGORIES[category];
  if (!spec) throw new TypeError(`Unknown MEL category "${category}"`);
  if (spec.days === null) return null; // Category A: no standard interval

  const discovery = new Date(discoveredAtMs);
  const due = new Date(discovery.getTime());
  // The day of discovery is excluded, so counting starts at day 1 = the
  // following calendar day.
  due.setUTCDate(due.getUTCDate() + spec.days);
  due.setUTCHours(23, 59, 59, 999); // valid to the END of that day
  return due.getTime();
}''')

    story += P(
        'Every method is a UTC method. The code uses `setUTCDate` and '
        '`setUTCHours`, never `setDate` and `setHours`. That is deliberate: '
        'a legal deadline must not shift by an hour when a jurisdiction '
        'changes its clocks, and it must not depend on the server\'s local '
        'timezone setting.')

    story += LOCK(
        'The off-by-one this function exists to get right',
        'Categories B, C and D are "N calendar days **excluding the day of '
        'discovery**", running to the **end** of the resulting day.\n\n'
        'A Category B defect found at 09:00 on Monday is due at 23:59 on '
        'Thursday. Naive duration arithmetic gives Thursday 09:00 — which is '
        'an hour early, meaning an aircraft could be dispatched on a Thursday '
        'morning flight with an expired deferral.\n\n'
        'The `setUTCHours(23, 59, 59, 999)` is what makes it the end of the '
        'day rather than the same time of day.')

    story += H2('Glossary')

    terms = [
        ('ACID', 'Atomicity, Consistency, Isolation, Durability — the four '
         'properties of a database transaction.'),
        ('Advisory lock', 'A lock a transaction takes voluntarily, which the '
         'database does not enforce. Distinct from a row lock, which it does.'),
        ('At-least-once delivery', 'A message may be delivered one or more '
         'times, never zero times. The strongest guarantee available across a '
         'network.'),
        ('BIRD algorithm', 'Bottleneck-Induced Resource Dominance — the '
         'family of label-setting algorithms for resource-constrained '
         'shortest path. AMS uses a variant of it.'),
        ('Canonicalisation', 'Converting a value to a single deterministic '
         'text form so that identical content always produces identical '
         'output. Required for hashing.'),
        ('CHECK constraint', 'A database rule that rejects any row violating '
         'it. Applies to every write by every client.'),
        ('Commit', 'The point at which a transaction\'s changes become '
         'permanent and visible. Nothing before it can be relied on.'),
        ('Deadlock', 'Two or more transactions each holding a resource the '
         'others need, so none can proceed.'),
        ('Differential testing', 'Testing by comparing two implementations '
         'against each other, rather than against expected values.'),
        ('Dual-write problem', 'The difficulty of keeping two systems without '
         'a shared transaction consistent. Solved by an outbox.'),
        ('Exclusive lock', 'A lock that prevents any other transaction from '
         'reading or writing the locked row. What `FOR UPDATE` takes.'),
        ('FOR UPDATE', 'A PostgreSQL clause that locks selected rows until the '
         'current transaction ends. The mechanism that prevents double '
         'spending in AMS.'),
        ('Generated column', 'A column whose value the database computes from '
         'an expression. `GENERATED ALWAYS ... STORED` cannot be written to '
         'directly and cannot drift from its inputs.'),
        ('Graceful degradation', 'A system that loses a capability rather than '
         'failing entirely when a dependency is unavailable.'),
        ('Idempotency key', 'A unique value sent with a request so that a '
         'retry does not perform the work twice.'),
        ('ISOLATION LEVEL', 'The rule determining what a transaction can see '
         'of concurrent work. PostgreSQL defaults to READ COMMITTED, which '
         'permits the TOCTOU race.'),
        ('Livelock', 'Transactions that keep changing state without '
         'progressing, though nothing is blocked. Distinct from deadlock.'),
        ('Lost update', 'A write silently discarded because a concurrent '
         'transaction wrote a stale value.'),
        ('Metamorphic test', 'A test asserting that a known transformation of '
         'the input produces the expected transformation of the output.'),
        ('Monotonicity', 'The property that increasing a constraint never '
         'improves the answer. Routing monotonicity tests assert exactly this.'),
        ('Oracle', 'In testing, an implementation correct by construction — '
         'usually slow and simple — used to validate a fast implementation.'),
        ('Outbox', 'A table recording side effects in the same transaction as '
         'the business change, delivered later by a worker.'),
        ('Pareto frontier', 'The set of non-dominated options: those not '
         'beaten on every dimension by another option.'),
        ('Partial index', 'An index covering only rows matching a predicate. '
         'Smaller, faster, and the correct choice for a worker\'s queue query.'),
        ('Pessimistic locking', 'Preventing other transactions from proceeding '
         'until one finishes. `FOR UPDATE`. Correct for money.'),
        ('Property-based test', 'A test asserting an invariant that must hold '
         'across many generated inputs, rather than specific expected values.'),
        ('Race condition', 'Behaviour that depends on the relative timing of '
         'concurrent operations.'),
        ('Resource-constrained shortest path',
         'Finding the cheapest path subject to a limit on a consumable '
         'resource. The problem AMS `solveRoute` solves.'),
        ('Rollback', 'Undoing all changes in a transaction. The counterpart to '
         'commit, and what happens when a cost authority is refused.'),
        ('Row-level security', 'A PostgreSQL feature where a policy filters '
         'rows per query. Must be FORCED to protect the table owner.'),
        ('SKIP LOCKED', 'A `FOR UPDATE` variant that skips locked rows rather '
         'than waiting. Enables many workers to share one queue safely.'),
        ('Snapshot isolation', 'A transaction sees a consistent snapshot, but '
         'may fail on commit if concurrent data conflicts.'),
        ('TOCTOU', 'Time-of-check to time-of-use. Checking a value, then acting '
         'on it after it has changed. The root of the double-spend race.'),
        ('Unique index', 'A database structure that rejects duplicate values. '
         'The mechanism behind AMS idempotency keys.'),
        ('Vacuum', 'PostgreSQL\'s maintenance process that reclaims space and '
         'updates query-planner statistics.'),
        ('V-model notation', 'In this document\'s proofs: "C composed with L" '
         'means "a path C appended to a path L".'),
        ('WAL', 'Write-Ahead Log. PostgreSQL\'s crash-recovery log. '
         '`synchronous_commit` controls how far durability trades against '
         'performance.'),
    ]
    for term, definition in terms:
        story.append(Paragraph(f'<b>{term}</b><br/>{rich(definition)}', S['bullet']))
        story.append(Spacer(1, 3))

    story += HR()

    story += H2('Final statement')

    story += LEAD(
        'AMS contains genuinely good engineering. The integer money discipline '
        'is structural rather than aspirational. The concurrency control moves '
        'the invariant into the database. The routing algorithm is exact and '
        'verified against an oracle rather than against its author\'s '
        'assumptions. The audit chain refuses mutation at the storage layer.')

    story += P(
        'It is also incomplete in ways that matter, and some of what is missing '
        'is only missing because it has never been run. This document records '
        'both, because a system presented as finished would be more dangerous '
        'than one presented accurately.')

    story += P(
        'The single most important thing a reader should take away: **the '
        'calculations are verified and the regulatory constants are not.** A '
        'fully green test suite tells you the code does what its author '
        'intended. It tells you nothing about whether the intent matches ICAO, '
        'EASA, IFRS or CAAZ. That gap is closed by qualified people, not by '
        'more tests.')

    story += CODE(
        '''// 190 tests passing.
// 0 type errors.
//
// What that establishes: the arithmetic is exact and the algorithms are correct.
//
// What it does not establish:
//   - that the regulatory reserve is legally correct
//   - that the MEL intervals match current EASA CS-GEN-MMEL
//   - that the emission factors are appropriate
//   - that the cost taxonomy satisfies IFRS and IATA
//   - that the fuel burn coefficients match this fleet
//
// That is not a criticism of the tests. It is the boundary of what any test
// can establish, stated honestly.''')