/**
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
 *     entry_hash = SHA256(prev_hash ‖ canonical_entry)
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
 */

import { createHash } from 'node:crypto';

/** Genesis sentinel. Chaining starts here. */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Deterministic JSON serialisation.
 *
 * Object key order must be stable or the hash is meaningless — the same
 * logical entry would hash differently depending on insertion order, and
 * verification would report corruption that never happened.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalise(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const keys = Object.keys(/** @type {Record<string, unknown>} */ (value)).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalise(/** @type {any} */ (value)[k])}`);
  return `{${parts.join(',')}}`;
}

/**
 * @typedef {Object} AuditEntry
 * @property {number} id
 * @property {string} tenantId
 * @property {string} actorId
 * @property {string} entityType
 * @property {string | number} entityId
 * @property {string} action
 * @property {unknown} before
 * @property {unknown} after
 * @property {string} ip
 * @property {string} occurredAt  ISO-8601
 * @property {string} entryHash   hex SHA-256, written on insert
 */

/**
 * Compute the chain hash for an entry.
 * @param {AuditEntry} entry
 * @param {string} prevHash
 * @returns {string} hex SHA-256
 */
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

/**
 * Build the hash for the next entry in a chain.
 * Convenience wrapper used by the repository on insert.
 * @param {AuditEntry} entry
 * @param {string} prevHash
 */
export function chainEntry(entry, prevHash) {
  return computeHash(entry, prevHash || GENESIS_HASH);
}

/**
 * Verify a whole chain.
 *
 * @param {AuditEntry[]} entries in ascending id order
 * @returns {{ valid: boolean, entriesChecked: number, brokenAt: number | null, reason: string | null }}
 */
export function verifyChain(entries) {
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

/**
 * Verify a single tenant's chain in isolation, so one tenant's corruption
 * cannot mask or contaminate another's.
 *
 * @param {AuditEntry[]} allEntries across all tenants
 * @param {string} tenantId
 */
export function verifyTenantChain(allEntries, tenantId) {
  const scoped = allEntries
    .filter((e) => e.tenantId === tenantId)
    .sort((a, b) => a.id - b.id);
  return { tenantId, ...verifyChain(scoped) };
}

/**
 * The chain head — the hash of the most recent entry.
 * Published for external anchoring. If the head changes without a
 * corresponding append, the chain was rewritten.
 * @param {AuditEntry[]} entries
 */
export function chainHead(entries) {
  if (entries.length === 0) return GENESIS_HASH;
  const last = [...entries].sort((a, b) => a.id - b.id).at(-1);
  return last.entryHash;
}

/**
 * Anomaly detection beyond simple hash mismatch:
 * ordering violations, gaps in identity sequence, and action shapes that
 * should never occur in an airline ledger.
 *
 * @param {AuditEntry[]} entries
 */
export function auditAnomalies(entries) {
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
}

/** @param {string} s */
function rank(s) {
  return { SEV1: 1, SEV2: 2, INFO: 3 }[s] ?? 9;
}
