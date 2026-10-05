/**
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
 */

exports.up = async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // ---------- tenants ----------
  await knex.raw(`
    CREATE TABLE tenants (
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
    )
  `);

  // ---------- departments ----------
  // The portal registry. Aviation regulations mandate named accountable
  // managers, so the department structure is a regulatory artefact.
  await knex.raw(`
    CREATE TABLE departments (
      id          SERIAL PRIMARY KEY,
      tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code        TEXT NOT NULL,
      name        TEXT NOT NULL,
      phase       SMALLINT NOT NULL DEFAULT 1 CHECK (phase IN (1,2,3)),
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (tenant_id, code)
    )
  `);

  // ---------- users ----------
  await knex.raw(`
    CREATE TABLE users (
      id                  TEXT PRIMARY KEY,
      tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email               TEXT NOT NULL,
      full_name           TEXT NOT NULL,
      password_hash       TEXT NOT NULL,
      -- Aviation regulatory appointments
      is_accountable_manager BOOLEAN NOT NULL DEFAULT FALSE,
      accountable_roles   TEXT[] NOT NULL DEFAULT '{}',
      licence_number      TEXT,                 -- personnel licence, ICAO Annex 1
      licence_type        TEXT,                 -- ATPL, MPL, ATPL(A), CABIN
      licence_valid_until DATE,
      medical_valid_until DATE,
      recurrent_training_valid_until DATE,
      national_id_ref     TEXT,                 -- PII: encrypted column in production
      status              TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','SUSPENDED','INVITED','DISABLED')),
      failed_login_count  SMALLINT NOT NULL DEFAULT 0,
      locked_until        TIMESTAMPTZ,
      last_login_at       TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, email)
    )
  `);
  await knex.raw(`CREATE INDEX idx_users_tenant ON users (tenant_id)`);

  // ---------- roles ----------
  await knex.raw(`
    CREATE TABLE roles (
      id          SERIAL PRIMARY KEY,
      tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code        TEXT NOT NULL,
      name        TEXT NOT NULL,
      scope       TEXT NOT NULL DEFAULT 'TENANT',
      is_system   BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (tenant_id, code)
    )
  `);

  await knex.raw(`
    CREATE TABLE user_roles (
      id          SERIAL PRIMARY KEY,
      tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      granted_by  TEXT NOT NULL REFERENCES users(id),
      granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ,
      UNIQUE (user_id, role_id)
    )
  `);

  // ---------- delegations of authority ----------
  // A departing or acting officer needs explicit, bounded, expiring
  // authority. It cannot be self-granted and cannot exceed the delegator's
  // own ceiling.
  await knex.raw(`
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
    )
  `);

  // ---------- sessions ----------
  await knex.raw(`
    CREATE TABLE sessions (
      id                 TEXT PRIMARY KEY,
      tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash TEXT NOT NULL,
      ip                 INET,
      user_agent         TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at         TIMESTAMPTZ,
      revoked_reason     TEXT
    )
  `);
  await knex.raw(`CREATE INDEX idx_sessions_user ON sessions (user_id) WHERE revoked_at IS NULL`);

  // ---------- audit_logs: append-only, hash-chained ----------
  await knex.raw(`
    CREATE TABLE audit_logs (
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
  await knex.raw(`CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id)`);

  // Append-only enforcement at the DATABASE level. Application-level
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
  `);

  // ---------- transactional outbox ----------
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
  `);

  // ---------- apply RLS to everything above ----------
  await knex.raw(`
    DO $$
    DECLARE t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY[
        'departments','users','roles','user_roles','delegations',
        'sessions','audit_logs','outbox'
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
  await knex.raw('DROP TABLE IF EXISTS outbox, audit_logs, sessions, delegations, user_roles, roles, users, departments, tenants CASCADE');
};
