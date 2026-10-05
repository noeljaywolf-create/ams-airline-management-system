/**
 * AMS — Migration 002: budget, commitments and cost authority.
 *
 * The control core. Every figure is BIGINT integer minor units (cents).
 * There is no NUMERIC and no FLOAT for money anywhere in AMS, because a
 * float money column is a rounding error waiting for a large enough
 * number of transactions.
 *
 * The CHECK constraint on available_cents is deliberately NOT present.
 * Availability is a computed expression, not a stored truth — it is
 * recomputed inside the transaction that changes one of its inputs, so
 * that it can never drift out of agreement with the components.
 */

exports.up = async function up(knex) {
  // ---------- chart of accounts (IFRS-aligned, airline cost taxonomy) ----------
  await knex.raw(`
    CREATE TABLE cost_categories (
      id            SERIAL PRIMARY KEY,
      tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code          TEXT NOT NULL,
      name          TEXT NOT NULL,
      -- Structural bucket. Determines whether the category contributes to
      -- CASK, is allocated to flights by driver, or is a period cost
      -- excluded from unit cost entirely.
      bucket        TEXT NOT NULL CHECK (bucket IN ('FLIGHT_ATTRIBUTABLE','FLEET_FIXED','PERIOD')),
      -- IATA traffic metrics affected by this category
      drives        TEXT[] NOT NULL DEFAULT '{}',
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (tenant_id, code)
    )
  `);

  // ---------- cost centres (divisions) ----------
  await knex.raw(`
    CREATE TABLE cost_centers (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code          TEXT NOT NULL,
      name          TEXT NOT NULL,
      parent_id     TEXT REFERENCES cost_centers(id),
      owner_user_id TEXT REFERENCES users(id),
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (tenant_id, code)
    )
  `);

  // ---------- funds (airline accounting: not governmental funds) ----------
  await knex.raw(`
    CREATE TABLE funds (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code          TEXT NOT NULL,
      name          TEXT NOT NULL,
      fund_type     TEXT NOT NULL CHECK (fund_type IN
                      ('OPERATING','CAPITAL','LEASING','RESTRICTED','DEFERRED_REVENUE','SAF_COMPLIANCE')),
      parent_fund_id TEXT REFERENCES funds(id),
      currency      TEXT NOT NULL DEFAULT 'USD',
      is_restricted BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (tenant_id, code)
    )
  `);

  // ---------- aircraft: the fleet master ----------
  await knex.raw(`
    CREATE TABLE aircraft (
      id                    TEXT PRIMARY KEY,
      tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      registration          TEXT NOT NULL,          -- tail number, e.g. Z-WAB
      serial_number         BIGINT NOT NULL,        -- MSN
      type_code             TEXT NOT NULL,          -- B738
      type_description      TEXT NOT NULL,          -- Boeing 737-800
      icao_type             TEXT NOT NULL,          -- B738
      airline_designator    TEXT NOT NULL,
      year_manufactured     SMALLINT NOT NULL,
      seats_installed       SMALLINT NOT NULL,
      mtom_kg               INTEGER NOT NULL,
      lease_type            TEXT NOT NULL CHECK (lease_type IN
                            ('OWNED','FINANCE_LEASE','OPERATING_LEASE','WET_LEASE')),
      -- IFRS 16 right-of-use asset
      rou_asset_id          TEXT,
      lease_start           DATE,
      lease_end             DATE,
      lease_monthly_cents   BIGINT,
      ownership_cost_center_id TEXT REFERENCES cost_centers(id),
      status                TEXT NOT NULL DEFAULT 'IN_SERVICE'
        CHECK (status IN ('IN_SERVICE','IN_MAINTENANCE','GROUNDED','STORED','RETIRED')),
      current_cycles        BIGINT NOT NULL DEFAULT 0,
      current_hours         NUMERIC(14,2) NOT NULL DEFAULT 0,
      current_block_hours   NUMERIC(14,2) NOT NULL DEFAULT 0,
      last_verified_at      DATE,
      UNIQUE (tenant_id, registration)
    )
  `);
  await knex.raw(`CREATE INDEX idx_aircraft_status ON aircraft (tenant_id, status)`);

  // ---------- budgets ----------
  await knex.raw(`
    CREATE TABLE budgets (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      cost_center_id TEXT NOT NULL REFERENCES cost_centers(id),
      fiscal_year   SMALLINT NOT NULL,
      version       SMALLINT NOT NULL DEFAULT 1,
      status        TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVE','REVISED','CLOSED')),
      currency      TEXT NOT NULL DEFAULT 'USD',
      approved_by   TEXT REFERENCES users(id),
      approved_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, cost_center_id, fiscal_year, version)
    )
  `);

  // ---------- budget lines: THE CONTROL OBJECT ----------
  await knex.raw(`
    CREATE TABLE budget_lines (
      id              TEXT PRIMARY KEY,
      tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      budget_id       TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      cost_center_id  TEXT NOT NULL REFERENCES cost_centers(id),
      fund_id         TEXT NOT NULL REFERENCES funds(id),
      category_id     INTEGER NOT NULL REFERENCES cost_categories(id),
      vehicle_registration TEXT REFERENCES aircraft(registration),
      fiscal_year     SMALLINT NOT NULL,
      fiscal_period   SMALLINT NOT NULL CHECK (fiscal_period BETWEEN 1 AND 12),

      -- Currency. All amounts BIGINT minor units. No FLOAT. No NUMERIC.
      currency        TEXT NOT NULL DEFAULT 'USD',
      budgeted_cents  BIGINT NOT NULL DEFAULT 0 CHECK (budgeted_cents >= 0),
      revised_cents   BIGINT NOT NULL DEFAULT 0,
      released_cents  BIGINT NOT NULL DEFAULT 0,
      committed_cents BIGINT NOT NULL DEFAULT 0,
      pending_cents   BIGINT NOT NULL DEFAULT 0,
      expended_cents  BIGINT NOT NULL DEFAULT 0,
      frozen_cents    BIGINT NOT NULL DEFAULT 0 CHECK (frozen_cents >= 0),

      is_frozen       BOOLEAN NOT NULL DEFAULT FALSE,
      freeze_reason   TEXT,
      status          TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','REVISED','CLOSED')),

      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX idx_budget_lines_lookup ON budget_lines (tenant_id, cost_center_id, category_id, fiscal_year)`);
  await knex.raw(`CREATE INDEX idx_budget_lines_fleet ON budget_lines (tenant_id, vehicle_registration)`);

  // Availability is GENERATED, so it can never drift from its components.
  // PostgreSQL recomputes it on every relevant write, inside the same
  -- transaction. This is the structural reason AMS cannot overspend.
  await knex.raw(`
    ALTER TABLE budget_lines
      ADD COLUMN available_cents BIGINT
      GENERATED ALWAYS AS (
        budgeted_cents + revised_cents + released_cents
        - committed_cents - pending_cents - expended_cents - frozen_cents
      ) STORED
  `);
  // A negative availability is a control breach, not a rounding artefact.
  await knex.raw(`
    ALTER TABLE budget_lines
      ADD CONSTRAINT budget_lines_non_negative
      CHECK (available_cents >= 0)
      NOT VALID
  `);
  await knex.raw(`ALTER TABLE budget_lines VALIDATE CONSTRAINT budget_lines_non_negative`);

  // ---------- commitments: the append-only cost-authority ledger ----------
  await knex.raw(`
    CREATE TABLE commitments (
      id                      TEXT PRIMARY KEY,
      tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      budget_line_id          TEXT NOT NULL REFERENCES budget_lines(id),
      vehicle_registration    TEXT REFERENCES aircraft(registration),
      category_id             INTEGER REFERENCES cost_categories(id),
      -- Reference to the PO, contract or requisition that caused this.
      document_type           TEXT,
      document_id             TEXT,
      amount_cents            BIGINT NOT NULL CHECK (amount_cents > 0),
      movement_type           TEXT NOT NULL
        CHECK (movement_type IN ('PIPELINE','COMMITMENT','SETTLED','RELEASED','REVERSED','ADJUSTMENT')),
      direction               TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
      available_before_cents  BIGINT NOT NULL,
      available_after_cents   BIGINT NOT NULL,
      released_cents          BIGINT NOT NULL DEFAULT 0,
      actor_id                TEXT REFERENCES users(id),
      reason                  TEXT,
      idempotency_key         TEXT,
      -- Retried requests must not commit twice.
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      settled_at              TIMESTAMPTZ,
      settled_by              TEXT REFERENCES users(id),
      release_reason          TEXT,
      CHECK (released_cents <= amount_cents)
    )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX idx_commitments_idempotency
      ON commitments (tenant_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_commitments_open
      ON commitments (budget_line_id)
      WHERE movement_type IN ('PIPELINE','COMMITMENT')
  `);

  // ---------- RLS ----------
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
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS commitments, budget_lines, budgets, aircraft, funds, cost_centers, cost_categories CASCADE');
};
