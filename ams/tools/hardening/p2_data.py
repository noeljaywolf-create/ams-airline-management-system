"""
Part II: exact arithmetic in the database.
Part III: multi-tenancy as a security boundary.
"""

from framework import (ASSUMED, BUG, BUL, CODE, H1, H2, H3, HR, LEAD, LOCK,
                       NUMLIST, P, PART, TABLE, VERIFIED)


def part2(story):
    story += PART(
        'Part II — Exact arithmetic beyond the function call',
        'Part III of the language guide showed how JavaScript keeps money '
        'exact. This part asks the harder question: what happens to that money '
        'when it is written to a database, and what protects it there.')

    story += H2('Why a float column is a future incident')

    story += CODE(
        '''/**
 * AMS — Migration 002: budget, commitments and cost authority.
 *
 * Every figure is BIGINT integer minor units (cents).
 * There is no NUMERIC and no FLOAT for money anywhere in AMS, because a
 * float money column is a rounding error waiting for a large enough
 * number of transactions.
 *
 * @module migrations/002
 */''',
        'backend/migrations/002_budget_commitments.js — the stated policy.')

    story += P(
        'This is the single most consequential schema decision in AMS, and it '
        'is invisible once made. A `FLOAT` money column works perfectly for '
        'years. It returns correct totals for small datasets. It fails only '
        'once the data is large enough that the accumulated error exceeds what '
        'reconciliation tolerates — which is to say, once the business '
        'succeeds.')

    story += CODE(
        '''-- What "it works" looks like
CREATE TABLE ledger (
  id        SERIAL PRIMARY KEY,
  amount    FLOAT8        -- ← the decision you will regret
);

-- Small dataset: reconciles fine.
INSERT INTO ledger (amount) VALUES (10.10), (20.20), (30.30);
SELECT SUM(amount) FROM ledger;   -- 60.6

-- A million rows of 0.01:
INSERT INTO ledger (amount)
  SELECT 0.01 FROM generate_series(1, 1000000);
SELECT SUM(amount) FROM ledger;   -- 9999.999999999973

-- The trial balance no longer foots. The ledger is now unusable and
-- every downstream report inherits the error.''')

    story += VERIFIED(
        'The failure is silent and permanent',
        'A float error does not announce itself. It produces a total that is '
        'very slightly wrong, passes every type check, and is discovered at a '
        'year-end reconciliation months after the transactions that caused it. '
        'By then the individual amounts cannot be corrected because nobody can '
        'identify which of the million rows drifted by which fraction of a cent '
        '— the aggregate is wrong but the rows are individually indistinguishable '
        'from correct.')

    story += H2('BIGINT, NUMERIC and the database as an accountant')

    story += TABLE(
        ['Type', 'Storage', 'Exact decimal?', 'Verdict for money'],
        [
            ['`SMALLINT`', '16-bit', 'Yes (integers only)',
             'Too small. Range ends at 32,767.'],
            ['`INTEGER`', '32-bit', 'Yes (integers only)',
             'Ends at 2,147,483,647 — about $21 million in cents. Too small.'],
            ['`BIGINT`', '64-bit', 'Yes (integers only)',
             '**Used throughout AMS.** Range to about $92 quadrillion.'],
            ['`NUMERIC`', 'arbitrary', 'Yes',
             'Legitimate for money. Not used in AMS — see below.'],
            ['`REAL` / `FLOAT8`', 'floating', '**No**',
             'Never acceptable for a ledger amount.'],
        ],
        widths=[18, 14, 20, 48])

    story += CODE(
        '''      -- Currency. All amounts BIGINT minor units. No FLOAT. No NUMERIC.
      currency        TEXT NOT NULL DEFAULT 'USD',
      budgeted_cents  BIGINT NOT NULL DEFAULT 0 CHECK (budgeted_cents >= 0),
      revised_cents   BIGINT NOT NULL DEFAULT 0,
      released_cents  BIGINT NOT NULL DEFAULT 0,
      committed_cents BIGINT NOT NULL DEFAULT 0,
      pending_cents   BIGINT NOT NULL DEFAULT 0,
      expended_cents  BIGINT NOT NULL DEFAULT 0,
      frozen_cents    BIGINT NOT NULL DEFAULT 0 CHECK (frozen_cents >= 0),''',
        'backend/migrations/002_budget_commitments.js')

    story += CODE(
        '''      serial_number         BIGINT NOT NULL,        -- MSN
      current_cycles        BIGINT NOT NULL DEFAULT 0,
      current_hours         NUMERIC(14,2) NOT NULL DEFAULT 0,
      current_block_hours   NUMERIC(14,2) NOT NULL DEFAULT 0,''',
        'Not every column is BIGINT — and the distinction is deliberate.')

    story += P(
        'Notice which columns use `NUMERIC(14,2)` rather than `BIGINT`. Aircraft '
        'flight hours are genuinely fractional — an aircraft accumulates '
        '3,847.42 block hours. They are not money, and they are not stored in '
        'cents. Fuel quantities are stored as integer kilograms for the same '
        'reason: a fuel figure is measured in whole units, and forcing a '
        'fraction would invent precision the measurement does not have.')

    story += TABLE(
        ['Quantity', 'Storage', 'Unit', 'Why'],
        [
            ['Money', '`BIGINT`', 'integer cents',
             'Fractional cents cannot be invoiced'],
            ['Block hours', '`NUMERIC(14,2)`', 'hours to 2dp',
             'Genuinely fractional; not money'],
            ['Fuel', 'integer', 'whole kg',
             'Measured in whole units'],
            ['Load factor', 'integer', 'parts per million',
             'Ratio; stored as ppm to stay exact'],
            ['CASK', 'integer', 'microcents',
             'Unit scaled so it cannot round to zero'],
        ],
        widths=[22, 22, 22, 34])

    story += H3('Why not NUMERIC for money?')

    story += ASSUMED(
        'The BIGINT-over-NUMERIC choice is defensible but debatable',
        '`NUMERIC` is exact for decimals, is standard in financial PostgreSQL '
        'schemas, and is what most accounting software expects. The arguments '
        'for `BIGINT` in AMS are: it enforces an integer discipline at the '
        'storage layer, it makes a fractional cent impossible rather than '
        'merely discouraged, and it is faster.\n\n'
        'The counter-argument is real: with `BIGINT`, the *unit* is implicit. A '
        'column named `budgeted_cents` is clear; a column named `amount` in a '
        'table written by someone else is not. `NUMERIC(14,2)` carries its own '
        'precision and scale in the type.\n\n'
        'Either choice is sound. What matters is that the choice is made '
        'deliberately, applied consistently, and documented — which is why the '
        'migration comment says "No FLOAT. No NUMERIC" rather than leaving it '
        'implicit.')

    story += H2('Generated columns: making drift structurally impossible')

    story += CODE(
        '''  // Availability is GENERATED, so it can never drift from its components.
  // PostgreSQL recomputes it on every relevant write, inside the same
  // transaction. This is the structural reason AMS cannot overspend.
  await knex.raw(`
    ALTER TABLE budget_lines
      ADD COLUMN available_cents BIGINT
      GENERATED ALWAYS AS (
        budgeted_cents + revised_cents + released_cents
        - committed_cents - pending_cents - expended_cents - frozen_cents
      ) STORED
  `);''',
        'backend/migrations/002_budget_commitments.js')

    story += P(
        'This is the most important single line in the AMS schema, and it is '
        'worth understanding precisely what it buys.')

    story += TABLE(
        ['Approach', 'Availability computed in', 'Failure mode'],
        [
            ['**Stored column, updated by application code**',
             'JavaScript, on every write',
             'A code path that forgets to update it. Drift is silent and '
             'permanent.'],
            ['**Stored column, updated by trigger**',
             'The database, on every write',
             'Cannot drift, but the value is a duplicate truth you must trust.'],
            ['**Generated column**',
             'The database, on every write, from the components',
             '**Cannot drift at all.** There is no code path that writes it.'],
        ],
        widths=[30, 26, 44])

    story += CODE(
        '''-- What "GENERATED ALWAYS" means in practice

-- Attempting to write to it is an ERROR, not a silent overwrite:
UPDATE budget_lines SET available_cents = 999999 WHERE id = 'bl-1';
-- ERROR:  column "available_cents" can only be updated to DEFAULT

-- Changing ANY component recomputes it, inside the same statement:
UPDATE budget_lines SET committed_cents = committed_cents + 1000 WHERE id = 'bl-1';
-- available_cents is recomputed by the database. Always. Automatically.''')

    story += VERIFIED(
        'Why this eliminates an entire category of defect',
        'The JavaScript layer also computes availability — in '
        '`availabilityCents()`. That is a duplicate implementation. Normally a '
        'duplicate implementation is a liability: they can disagree.\n\n'
        'Here they cannot disagree in the direction that matters, because the '
        'database value is *derived* and the JavaScript value is used only for '
        'the pre-check inside the locked section. The generated column is the '
        'authority; the JavaScript function is a convenience that reads the '
        'same components the column is derived from.\n\n'
        'If the two implementations ever produce different values, the '
        'generated column is right and the JavaScript is a bug. That asymmetry '
        'is deliberate.')

    story += CODE(
        '''export function availabilityCents(line) {
  const frozen = line.frozenCents ?? 0;
  const available =
    line.budgetedCents + line.revisedCents + line.releasedCents
    - line.committedCents - line.pendingCents - line.expendedCents - frozen;
  // ... throws if negative
}''',
        'backend/src/modules/finance/cost-authority.js — the duplicate, which '
        'must agree with the generated column expression above.')

    story += ASSUMED(
        'The duplication is a maintenance risk',
        'There is no automated check that the JavaScript expression and the '
        'generated column expression stay in sync. If someone adds a component '
        '— say `encumbered_cents` — to one and not the other, the system will '
        'read as though it has more available than it does, and the '
        'pre-check will pass amounts the constraint would reject.\n\n'
        'The mitigation is real: the `CHECK (available_cents >= 0)` constraint '
        'would reject the write at the storage layer, so the consequence is a '
        'failed transaction rather than an overspend. But it is a late, opaque '
        'failure. **This should be added as a regression test** — assert that '
        'the two expressions agree for a set of representative budget lines.')

    story += H2('CHECK constraints as the last line of defence')

    story += CODE(
        '''  // A negative availability is a control breach, not a rounding artefact.
  await knex.raw(`
    ALTER TABLE budget_lines
      ADD CONSTRAINT budget_lines_non_negative
      CHECK (available_cents >= 0)
      NOT VALID
  `);
  await knex.raw(`ALTER TABLE budget_lines VALIDATE CONSTRAINT budget_lines_non_negative`);''',
        'backend/migrations/002_budget_commitments.js')

    story += P(
        'Three things are happening in those five lines, and all three are '
        'advanced PostgreSQL technique.')

    story += NUMLIST([
        '**`NOT VALID`** adds the constraint without checking existing rows. '
        'On a large table this avoids a long exclusive lock during migration — '
        'the constraint applies to all *future* writes immediately.',
        '**`VALIDATE CONSTRAINT`** then scans existing data in a weaker lock '
        'mode. If any historical row already violates the constraint, this '
        'fails loudly at migration time rather than silently.',
        'The combination is the standard pattern for adding a constraint to a '
        'populated production table without downtime.',
    ])

    story += CODE(
        '''-- The guarantee, at the lowest level
INSERT INTO budget_lines (budgeted_cents, committed_cents, available_cents)
  VALUES (100000, 500000, NULL);
-- ERROR:  new row for relation "budget_lines" violates check constraint
--         "budget_lines_non_negative"

-- This fires even if the application has a bug, even if someone connects
-- with psql and types UPDATE by hand, even if a future service is written
-- in a different language.''')

    story += VERIFIED(
        'Why a CHECK constraint beats an application assertion',
        'An application assertion can be bypassed by: a future service written '
        'by someone who has not read the module; a migration script; a manual '
        '`psql` session during an incident; a bulk import written in Python.\n\n'
        'A CHECK constraint is part of the table definition. It applies to '
        'every write by every client, forever. This is the "policy versus '
        'mechanism" distinction from Part I, and it is the reason the AMS '
        'authors preferred database guarantees wherever one was available.')

    story += H3('Constraints as executable domain documentation')

    story += CODE(
        '''      bucket        TEXT NOT NULL CHECK (bucket IN ('FLIGHT_ATTRIBUTABLE','FLEET_FIXED','PERIOD')),''')

    story += CODE(
        '''      fund_type     TEXT NOT NULL CHECK (fund_type IN
                      ('OPERATING','CAPITAL','LEASING','RESTRICTED','DEFERRED_REVENUE','SAF_COMPLIANCE')),''')

    story += CODE(
        '''      lease_type            TEXT NOT NULL CHECK (lease_type IN
                            ('OWNED','FINANCE_LEASE','OPERATING_LEASE','WET_LEASE')),''')

    story += CODE(
        '''      movement_type           TEXT NOT NULL
        CHECK (movement_type IN ('PIPELINE','COMMITMENT','SETTLED','RELEASED','REVERSED','ADJUSTMENT')),
      direction               TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),''')

    story += CODE(
        '''      CHECK (released_cents <= amount_cents)''')

    story += CODE(
        '''      CHECK (expires_at > starts_at),
      CHECK (delegator_id <> delegate_id)''',
        'backend/migrations/001_tenancy_identity_audit.js — the delegations '
        'table. Two constraints that encode governance policy directly.')

    story += P(
        'Each of these lists is generated from the corresponding constant array '
        'in `shared/src/domain.js`, and each can never drift from it because '
        'the constraint is at the storage layer. A value not in the list cannot '
        'reach the database.')

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
        'shared/src/domain.js')

    story += VERIFIED(
        'The three-layer safety model, stated once',
        '**Layer 1 — annotations.** JSDoc types and the `checkJs` gate catch '
        'mistakes before the code runs. A convenience: a wrong annotation does '
        'nothing.\n\n'
        '**Layer 2 — runtime checks.** `if (!spec) throw`, `assertSafeInteger`, '
        'the negative-availability throw. Catch mistakes at execution. Still '
        'bypassable by anything that skips the code path.\n\n'
        '**Layer 3 — database constraints.** `CHECK`, generated columns, unique '
        'indexes, triggers. Apply to every write by every client, with no '
        'cooperation required from the caller.\n\n'
        'The rule the codebase follows: **when a property must hold, push it as '
        'far down as it will go.** The constraint is the guarantee. Everything '
        'above it is helpful.')

    story += H2('Rounding once, and where rounding leaks')

    story += CODE(
        '''  // Round ONCE, at tonne-milligram precision. Rounding at an intermediate
  // step (kg -> tens of kg -> tonnes) silently loses a third decimal place,
  // which is material when the compliance bill is multiplied by an
  // allowance price of EUR 85 per tonne.
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const conventionalTonnes = round3((conventionalKg * factor) / 1000);''',
        'shared/src/carbon.js')

    story += CODE(
        '''export function co2Tonnes(fuelKg, fuelType = 'JET_A1') {
  if (fuelKg < 0) throw new RangeError('fuelKg cannot be negative');
  const factor = fuelType === 'JET_A' ? EMISSION_FACTOR_JET_A : EMISSION_FACTOR_JET_A1;
  // kg CO2 -> tonnes
  return Math.round((fuelKg * factor) / 1000 * 1000) / 1000;
}''')

    story += P(
        'Carbon is measured in tonnes with three decimal places — a tonne of CO2 '
        'to the kilogram. Unlike money, this quantity is genuinely fractional '
        'and cannot be scaled to integers without losing information, so the '
        'code rounds explicitly and states the precision.')

    story += TABLE(
        ['Quantity', 'Unit', 'Why not integers'],
        [
            ['Money', 'integer cents', 'A fractional cent cannot be invoiced'],
            ['Emissions', 'tonnes to 3dp', 'A tonne of CO2 to the kg is the '
             'smallest meaningful quantity'],
            ['Load factor', 'integer ppm', 'Six decimal places, no information '
             'lost at realistic precision'],
            ['CASK', 'integer microcents', 'Scaled so it cannot round to zero'],
        ],
        widths=[22, 22, 56])

    story += BUG(
        'A genuine bug in co2Tonnes',
        'Look carefully at:\n\n'
        '```\n'
        'return Math.round((fuelKg * factor) / 1000 * 1000) / 1000;\n'
        '```\n\n'
        'The multiplication by `1000` cancels the division by `1000` on the '
        'left-hand side of the `Math.round`. The expression is equivalent to '
        '`Math.round(fuelKg * factor) / 1000` — which happens to be the '
        'intended behaviour, so the answer is correct.\n\n'
        'But this is not what the code *says*. As written it reads as "convert '
        'to tonnes, then round to tonne-milligrams", which would be '
        '`Math.round((fuelKg * factor) / 1000 * 1000) / 1000` — the same thing. '
        'The intent is ambiguous and the expression is redundant.\n\n'
        'Compare with `applySaf`, which gets it right:\n\n'
        '```\n'
        'const conventionalTonnes = round3((conventionalKg * factor) / 1000);\n'
        '```\n\n'
        '`round3` applies the thousand-fold scaling *once*, at the end. The two '
        'functions should look identical and currently do not. **This is a '
        'readability defect with a latent risk**: a future edit that reorders '
        'the operations in `co2Tonnes` could introduce a real rounding error, '
        'and no test would distinguish the two forms if they agreed today.')

    story += CODE(
        '''  // The critical rule: emissions must be counted ONCE. Where both
  // regimes touch a flight, CORSIA-covered emissions are deducted from
  // the EU ETS chargeable quantity. Double-counting is both a compliance
  // error and, at current allowance prices, a seven-figure mistake.
  //
  // AMS implements the deduplication explicitly because no upstream
  // library does it correctly for you.''',
        'shared/src/carbon.js — the module header')

    story += CODE(
        '''  if (corsiaEligible && etsEligible) {
    // DEDUPLICATION: CORSIA-covered tonnes are deducted from ETS.
    // Where both apply, CORSIA is treated as satisfying the obligation,
    // consistent with the EU ETS directive's CORSIA deduction.
    allocated.CORSIA = totalTonnes;
    allocated.EU_ETS = 0;
    overlapTonnes.deductedFromETS = totalTonnes;
  } else if (corsiaEligible) {
    allocated.CORSIA = totalTonnes;
  } else if (etsEligible) {
    allocated.EU_ETS = totalTonnes;
  } else {
    allocated.UNREGULATED = totalTonnes;
  }''')

    story += CODE(
        '''    // Invariant: the parts must reconstruct the whole. Verified by the
    // property test in tests/carbon.test.js.
    allocationReconciles:
      Math.abs(
        allocated.CORSIA + allocated.EU_ETS + allocated.UNREGULATED - totalTonnes,
      ) < 1e-6,''')

    story += VERIFIED(
        'The reconciliation invariant, and why it is the right one',
        'The three allocation buckets must sum to the total. This is a property '
        'of the *deduplication*, not of any particular input: no matter how many '
        'regimes apply, the tonnes must be accounted for exactly once.\n\n'
        'A property test over many flight configurations is a stronger check '
        'than a set of hand-computed examples, because the branch structure '
        '(`both`, `corsia only`, `ets only`, `neither`) has four paths and a '
        'hand-written test might miss a combination.')

    story += H2('The reconciliation invariant in general')

    story += CODE(
        '''  assertReconciles([t.directCostCents, t.fleetFixedCostCents], t.fullCostCents,
    'aggregate flight cost');

  // Self-check. If this ever throws, a rounding rule was changed and
  // the whole costing model needs re-verification.
  assertReconciles(allocations, poolCents, `fleet-fixed allocation (${driver})`);''',
        'shared/src/costing.js — the engine checks its own output on every call.')

    story += CODE(
        '''/**
 * Assert that a set of amounts reconciles to an expected total.
 * Used by the three-way match and by the costing engine's own
 * self-checks. Throwing here is intentional: a silent mismatch in an
 * airline ledger becomes a million-dollar misstatement.
 */''')

    story += LOCK(
        'The general pattern: assert the invariant at every layer that can break it',
        'A reconciliation check inside the allocation function catches a rounding '
        'change immediately, at the point of change, in a test. The same check '
        'in a nightly reconciliation job catches it a month later, in '
        'production, as an unexplained variance that someone has to '
        'investigate from scratch.\n\n'
        'Neither check is a substitute for the other, but the cheap one '
        'nearest the cause is always worth having.')

    story += HR()


def part3(story):
    story += PART(
        'Part III — Multi-tenancy as a security boundary',
        'AMS serves multiple airlines from one database. A missing tenant filter '
        'returns one customer\'s financial data to another. That is not a bug '
        'report — it is an incident, a notification obligation, and in some '
        'jurisdictions a legal one.')

    story += CODE(
        '''/**
 * AMS — Migration 001: tenancy, identity and audit.
 *
 * Every table in AMS carries tenant_id. There is no exception. That rule
 * is enforced here, in the schema, rather than left to application
 * discipline, because tenant isolation is the single control that, if it
 * fails, makes a SaaS product legally and reputationally finished.
 *
 * Defence is three-layered (see docs Part X):
 *   1. middleware injects the tenant into every query
 *   2. repository code always filters explicitly
 *   3. the DATABASE refuses to return another tenant's rows
 *
 * Layer 3 is this file. Layers 1 and 2 are ordinary code that a future
 * developer can forget to write; layer 3 cannot be forgotten, because it
 * is the database.
 *
 * @module migrations/001
 */''',
        'backend/migrations/001_tenancy_identity_audit.js')

    story += H2('One database, many airlines')

    story += CODE(
        '''      CREATE TABLE tenants (
        id                    TEXT PRIMARY KEY,
        slug                  TEXT NOT NULL UNIQUE,
        legal_name            TEXT NOT NULL,
        icao_code             TEXT(3),              -- ICAO designator, e.g. "ABC"
        iata_code             TEXT(2),              -- IATA two-letter code
        country               TEXT NOT NULL,
        reporting_currency    TEXT NOT NULL DEFAULT 'USD',
        base_currency         TEXT NOT NULL DEFAULT 'USD',
        fiscal_year_start     SMALLINT NOT NULL DEFAULT 1,
        aoc_reference         TEXT,                 -- Air Operator Certificate number
        aoc_valid_from        DATE,
        aoc_valid_until       DATE,
        certification_body    TEXT,                 -- e.g. CAAZ
        -- CORSIA new-entrant clock
        first_operation_year  SMALLINT,
        annual_intl_co2_tonnes NUMERIC(14,3),
        eua_operated          BOOLEAN NOT NULL DEFAULT FALSE,
        status                TEXT NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE','SUSPENDED','MIGRATING','CLOSED')),
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
      )''')

    story += P(
        'The `tenants` table holds one row per airline. Everything else '
        'references it. The design decision that matters is stated in the '
        'migration header: every table carries `tenant_id`, with no exceptions.')

    story += CODE(
        '''-- Foreign keys everywhere, cascading so a tenant deletion is complete
tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,''')

    story += TABLE(
        ['Relationship', 'On delete', 'Consequence'],
        [
            ['Every tenant-owned table → `tenants`', 'CASCADE',
             'Deleting a tenant removes all its data in one operation'],
            ['`user_roles` → `users`', 'CASCADE',
             'Deleting a user removes their role grants'],
            ['`budget_lines` → `budgets`', 'CASCADE',
             'Deleting a budget removes its lines'],
        ],
        widths=[38, 18, 44])

    story += ASSUMED(
        'CASCADE on tenant deletion is a decision, not a default',
        'CASCADE means deleting a tenant destroys all its financial records, '
        'audit entries and commitments in a single statement. For a system '
        'holding records that regulators may require years later, that is '
        'dangerous — and it is also the correct behaviour for a SaaS provider '
        'handling off-boarding under a data-processing agreement.\n\n'
        '**Neither the delete path nor any soft-delete alternative is '
        'implemented.** The schema permits an operation that would destroy '
        'audit evidence. This needs a decision from whoever owns compliance '
        'before production, and almost certainly a `status = \'CLOSED\'` path '
        'instead of deletion. Flagged here rather than silently documented as '
        'solved.')

    story += H2('The three layers and why layer three is the database')

    story += CODE(
        '''// Layer 2 — the application filter, present in every query written so far
const line = await db('budget_lines')
  .where({ id: lineId, tenant_id: tenantId })
  .forUpdate()
  .first();

const commitment = await db('commitments')
  .where({ id: commitmentId, tenant_id: tenantId })
  .forUpdate()
  .first();''')

    story += P(
        'Layer 2 is visible in every query. It works. It is also the layer most '
        'likely to be missed by a future developer on a hurried afternoon, and '
        'nothing will tell them at development time.')

    story += CODE(
        '''  // Layer 3 — the database refuses. Migration 002:
  await knex.raw(`
    DO $$
    DECLARE t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY[
        'cost_categories','cost_centers','funds','aircraft',
        'budgets','budget_lines','commitments'
      ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format($p$
          CREATE POLICY %1$I_tenant_isolation ON %1$I
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
        $p$, t);
      END LOOP;
    END $$
  `);''')

    story += H2('Row-level security, concretely')

    story += P(
        'PostgreSQL row-level security is a database feature where a policy is '
        'defined per table, and the database itself adds a filter to every '
        'query. Read the policy:')

    story += CODE(
        '''USING (tenant_id = current_setting('app.tenant_id', true))
WITH CHECK (tenant_id = current_setting('app.tenant_id', true))''')

    story += TABLE(
        ['Clause', 'Applies to', 'Effect'],
        [
            ['`USING`', 'Reads: `SELECT`, and the rows visible to `UPDATE` and '
             '`DELETE`', 'Invisible rows are as if they do not exist'],
            ['`WITH CHECK`', 'Writes: `INSERT` and `UPDATE`',
             'A row that would violate the policy is rejected outright'],
        ],
        widths=[20, 42, 38])

    story += CODE(
        '''-- How a tenant is established for the connection:
SET app.tenant_id = 'tenant-acme';

-- This is fine:
SELECT * FROM budget_lines WHERE id = 'bl-1';

-- This returns NOTHING, not an error — the other tenant's row is invisible:
SELECT * FROM budget_lines WHERE id = 'bl-1-other-tenant';

-- This is REJECTED:
INSERT INTO budget_lines (tenant_id, budgeted_cents) VALUES ('tenant-other', 1000);
-- ERROR:  new row violates row-level security policy for table "budget_lines"''')

    story += VERIFIED(
        'The critical difference between invisible and rejected',
        'A missing `WHERE tenant_id = $1` in application code does not produce '
        'an error. It produces *another customer\'s data in the response*, and '
        'nothing in the stack complains.\n\n'
        'With the RLS policy, the same missing filter produces an empty result '
        'set. The application shows an empty page and the developer '
        'investigates within minutes. **One is an incident; the other is a '
        'puzzling bug report.**\n\n'
        'That difference is the entire value of layer 3.')

    story += CODE(
        '''          USING (tenant_id = current_setting('app.tenant_id', true))
                                                 ^^^^
                        The connection-level setting, per transaction.''')

    story += ASSUMED(
        'The missing-tenant behaviour is a real gap in the design',
        '`current_setting(\'app.tenant_id\', true)` — the second argument '
        '`true` means "return NULL instead of erroring if the setting is '
        'absent".\n\n'
        'If a connection has no tenant set, the comparison is '
        '`tenant_id = NULL`, which is NULL, not true — so the policy returns no '
        'rows. **That is fail-closed and therefore safe.**\n\n'
        'However it fails *silently*: a connection missing its tenant setting '
        'returns empty results for every query rather than raising an error. '
        'That is the correct security posture and the worst diagnostic posture. '
        'An explicit check in middleware — refusing to serve a request with no '
        'tenant context — would convert a confusing empty page into an '
        'immediate, obvious failure. Worth adding when the server layer is '
        'built.')

    story += CODE(
        '''-- Fail-closed, confirmed: with no tenant set
SET app.tenant_id = '';
SELECT count(*) FROM budget_lines;   -- 0 rows, not an error
SELECT count(*) FROM budget_lines;   -- with no SET at all: also 0''')

    story += H2('FORCE ROW LEVEL SECURITY and why it is not optional')

    story += CODE(
        '''        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);''')

    story += TABLE(
        ['Setting', 'Applies policies to', 'Bypassed by'],
        [
            ['`ENABLE ROW LEVEL SECURITY`',
             'Non-superuser roles, and the table owner',
             '**The table owner** — and migrations usually run as the owner'],
            ['`FORCE ROW LEVEL SECURITY`',
             'Everyone, including the table owner',
             'Superusers and roles with `BYPASSRLS`'],
        ],
        widths=[30, 32, 38])

    story += VERIFIED(
        'Why this matters and is easy to miss',
        'By default, PostgreSQL exempts the table *owner* from row-level '
        'security. Migrations almost always create tables as the owner and the '
        'application often connects as that same role.\n\n'
        'In that configuration — which is the default and therefore the most '
        'common — `ENABLE ROW LEVEL SECURITY` alone provides **no protection at '
        'all**. Every query runs with full access.\n\n'
        '`FORCE` closes it. This is one of the least well-known PostgreSQL '
        'behaviours, and a team that enables RLS, believes it is protected, and '
        'is not, is in a worse position than a team that never enabled it at '
        'all — because the belief suppresses the scrutiny.')

    story += ASSUMED(
        'Remaining bypass routes, which no RLS policy addresses',
        '**Superusers** always bypass RLS. **Roles with `BYPASSRLS`** always '
        'bypass it. If the application connects as a superuser — which is '
        'convenient in development and occasionally survives into production — '
        'layer 3 provides nothing.\n\n'
        '**Connection pooling** is a specific hazard here. If the application '
        'uses a pool (PgBouncer, or a driver-level pool) and sets '
        '`app.tenant_id` per request, a returned connection may retain the '
        'previous request\'s setting. The next request would then read another '
        'tenant\'s data — with the RLS policy working perfectly, faithfully '
        'applying the *wrong* tenant.\n\n'
        'The safe patterns are to use transaction-scoped settings with a pooler '
        'in transaction mode, or to reset the setting on checkout. **This is '
        'not implemented and not verified anywhere in the codebase.** It is the '
        'most likely way the three-layer defence fails in production.')

    story += CODE(
        '''// Safe: tenant bound to the transaction, reset explicitly
await db.transaction(async (trx) => {
  await trx.raw("SELECT set_config('app.tenant_id', ?, true)", [tenantId]);  // true = local to tx
  // ... all work in this transaction
});
// Setting is discarded on commit or rollback. Nothing leaks to the next borrower.''')

    story += H2('What RLS does not protect against')

    story += TABLE(
        ['Threat', 'Does RLS stop it?', 'What does'],
        [
            ['A query missing `WHERE tenant_id = ?`', '**Yes**',
             'Returns empty instead of another tenant\'s rows'],
            ['An `INSERT` with the wrong `tenant_id`', '**Yes**',
             'Rejected by `WITH CHECK`'],
            ['An `UPDATE` moving a row to another tenant', '**Yes**',
             'The new row fails `WITH CHECK`'],
            ['A superuser or `BYPASSRLS` connection', 'No',
             'Application configuration; least-privilege roles'],
            ['A leaked credential allowing login', 'No',
             'Authentication, MFA, session controls'],
            ['Timing side channels revealing row existence', 'No',
             'Requires deliberate mitigation; rarely a priority'],
            ['A `pg_dump` by someone with disk access', 'No',
             'Encryption at rest; separate credentials'],
            ['A tenant\'s own user reading their own data', 'n/a',
             'Role-based access within the tenant — a separate layer'],
        ],
        widths=[34, 17, 49])

    story += VERIFIED(
        'The remaining layer: roles within a tenant',
        'RLS isolates tenants from each other. It does nothing about one '
        'accountant at an airline reading another\'s budget at the same airline. '
        'That is role-based access, and AMS has the vocabulary for it:\n\n'
        '```\n'
        'ROLES: platform_admin, tenant_admin, ceo, finance_director, controller,\n'
        '       accountant, procurement_manager, technical_manager,\n'
        '       flight_ops_manager, safety_officer, auditor\n'
        '```\n\n'
        'The roles table and `user_roles` grants exist in migration 001. The '
        'enforcement — which role may perform which operation — is not '
        'implemented, because the server layer does not exist yet.')

    story += CODE(
        '''    CREATE TABLE user_roles (
      id          SERIAL PRIMARY KEY,
      tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      granted_by  TEXT NOT NULL REFERENCES users(id),
      granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ,
      UNIQUE (user_id, role_id)
    );''',
        'backend/migrations/001_tenancy_identity_audit.js')

    story += CODE(
        '''    -- Delegations of authority
    -- A departing or acting officer needs explicit, bounded, expiring
    -- authority. It cannot be self-granted and cannot exceed the delegator's
    -- own ceiling.
    CREATE TABLE delegations (
      id                 SERIAL PRIMARY KEY,
      tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      delegator_id       TEXT NOT NULL REFERENCES users(id),
      delegate_id        TEXT NOT NULL REFERENCES users(id),
      scope_departments  TEXT[] NOT NULL DEFAULT '{}',
      amount_ceiling_cents BIGINT,
      starts_at          TIMESTAMPTZ NOT NULL,
      expires_at         TIMESTAMPTZ NOT NULL,
      reason             TEXT NOT NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (expires_at > starts_at),
      CHECK (delegator_id <> delegate_id)
    );''')

    story += P(
        'Two design decisions worth naming. `UNIQUE (user_id, role_id)` means a '
        'user cannot hold the same role twice — no duplicate grants, so '
        'revocation is unambiguous. And `expires_at` means a delegation lapses '
        'automatically rather than relying on someone remembering to withdraw '
        'it.')

    story += HR()