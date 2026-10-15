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

/**
 * Hashing provider.
 *
 * WHY THIS EXISTS
 * ---------------
 * This module is imported by the browser demo (frontend/js/ecosystem.js), so
 * a bare `import { createHash } from 'node:crypto'` at the top of the file
 * was fatal: a browser cannot resolve a Node builtin, and the failure takes
 * the ENTIRE module graph down with it. The symptom was the demo rendering
 * "Loading domain modules..." forever with no error, because a graph-level
 * resolution failure happens before any application code runs — so no
 * try/catch in app.js can catch it.
 *
 * The fix is to resolve Node's crypto lazily and degrade to a browser
 * implementation. computeHash() below therefore returns a Promise in a
 * browser and a string in Node, which is why every consumer is async.
 * That asymmetry is deliberate and documented rather than hidden: a
 * synchronous API that silently changed shape would be worse.
 *
 * Node (backend):   createHash('sha256').update(a).update(b).digest('hex')
 * Browser (demo):   crypto.subtle.digest('SHA-256', ...) — the Web Crypto
 *                   equivalent, identical output.
 */

/**
 * Hash a string to lowercase hex SHA-256.
 *
 * Always returns a Promise, in both runtimes. Node's createHash is
 * synchronous, so it is wrapped in an async function rather than returned
 * bare — that keeps ONE signature for both runtimes, so a caller cannot
 * accidentally `await` in one place and not another. The two implementations
 * produce identical hex output.
 *
 * @param {string} data
 * @returns {Promise<string>}
 */
export const sha256Hex = await (async () => {
  try {
    const { createHash } = await import('node:crypto');
    /** @type {(data: string) => Promise<string>} */
    const sync = (data) => Promise.resolve(
      createHash('sha256').update(data, 'utf8').digest('hex'),
    );
    return sync;
  } catch {
    const enc = new TextEncoder();
    /** @type {(data: string) => Promise<string>} */
    return async (data) => {
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(data));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    };
  }
})();

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
/**
 * Compute the chain hash for an entry.
 *
 * ASYNC by necessity — see the sha256Hex note above. Web Crypto's digest is
 * asynchronous, so this returns a Promise in a browser. Awaiting it in Node
 * costs one microtask and is correct there too, so one code path serves both
 * runtimes instead of two implementations that can drift apart.
 *
 * @param {AuditEntry} entry
 * @param {string} prevHash
 * @returns {Promise<string>} hex SHA-256
 */
export async function computeHash(entry, prevHash) {
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
  return sha256Hex(prevHash + canonical);
}

/**
 * Build the hash for the next entry in a chain.
 * Convenience wrapper used by the repository on insert.
 * @param {AuditEntry} entry
 * @param {string} prevHash
 * @returns {Promise<string>}
 */
export function chainEntry(entry, prevHash) {
  return computeHash(entry, prevHash || GENESIS_HASH);
}

/**
 * Verify a whole chain.
 *
 * @param {AuditEntry[]} entries in ascending id order
 * @returns {Promise<{ valid: boolean, entriesChecked: number, brokenAt: number | null, reason: string | null }>}
 */
export async function verifyChain(entries) {
  let prev = GENESIS_HASH;
  for (const entry of entries) {
    const expected = await computeHash(entry, prev);
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
export async function verifyTenantChain(allEntries, tenantId) {
  const scoped = allEntries
    .filter((e) => e.tenantId === tenantId)
    .sort((a, b) => a.id - b.id);
  return { tenantId, ...(await verifyChain(scoped)) };
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
