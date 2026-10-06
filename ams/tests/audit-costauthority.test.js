import { describe, it, expect } from 'vitest';
import {
  canonicalise, computeHash, chainEntry, verifyChain, verifyTenantChain,
  chainHead, auditAnomalies, GENESIS_HASH,
} from '../backend/src/audit/chain.js';
import { createHash } from 'node:crypto';
import {
  availabilityCents, CostAuthorityError,
} from '../backend/src/modules/finance/cost-authority.js';

/**
 * Build a valid chain from a list of partial entries.
 *
 * ASYNC because chainEntry and verifyChain are async. The module resolves its
 * hash provider lazily — Node's createHash when available, Web Crypto's
 * digest otherwise — so a browser can import this file at all. That laziness
 * is why a bare `import 'node:crypto'` here previously took the entire demo
 * module graph down with no catchable error.
 *
 * @param {Array<any>} specs
 * @param {{ idOffset?: number }} [opts]
 * @returns {Promise<any[]>}
 */
async function buildChain(specs, { idOffset = 0 } = {}) {
  const out = [];
  let prev = GENESIS_HASH;
  for (const [i, s] of specs.entries()) {
    const entry = {
      // `id` is part of the hashed content, so it must be set BEFORE
      // hashing. Mutating it afterwards (as an earlier version of this
      // helper did) silently invalidates the chain.
      id: idOffset + i + 1,
      tenantId: s.tenantId ?? 't-1',
      actorId: s.actorId ?? 'u-9',
      entityType: s.entityType ?? 'cost_authority',
      entityId: s.entityId ?? `E${i + 1}`,
      action: s.action ?? 'APPROVE',
      // `??` would replace a deliberate `null` with the default, so test
      // for key presence explicitly.
      before: 'before' in s ? s.before : { status: 'PENDING_APPROVAL' },
      after: 'after' in s ? s.after : { status: 'APPROVED', approved_by: 'u-9' },
      ip: s.ip ?? '10.0.0.1',
      occurredAt: s.occurredAt ?? `2026-09-30T08:${String(i).padStart(2, '0')}:00.000Z`,
    };
    /** @type {any} */ (entry).entryHash = await chainEntry(/** @type {any} */ (entry), prev);
    prev = entry.entryHash;
    out.push(entry);
  }
  return out;
}

describe('audit — canonicalisation', () => {
  it('is insensitive to object key order', async () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));
  });

  it('preserves array order, which is semantically significant', async () => {
    expect(canonicalise([1, 2])).not.toBe(canonicalise([2, 1]));
  });

  it('handles null and primitives', async () => {
    expect(canonicalise(null)).toBe('null');
    expect(canonicalise(5)).toBe('5');
    expect(canonicalise({ a: null })).toBe('{"a":null}');
  });
});

describe('audit — hash chain integrity', () => {
  it('verifies a chain built correctly', async () => {
    const chain = await buildChain([{}, {}, {}, {}]);
    const r = await verifyChain(chain);
    expect(r.valid).toBe(true);
    expect(r.entriesChecked).toBe(4);
    expect(r.brokenAt).toBeNull();
  });

  it('DETECTS an edited amount in a historic entry', async () => {
    const chain = await buildChain([{}, {}, {}, {}]);
    chain[2].after = { status: 'APPROVED', approved_by: 'u-9', amount_cents: 999_999_99 };
    const r = await verifyChain(chain);
    expect(r.valid).toBe(false);
    expect(r.brokenAt).toBe(3);
    expect(r.reason).toMatch(/altered/);
  });

  it('DETECTS a deleted entry', async () => {
    const chain = await buildChain([{}, {}, {}, {}]);
    chain.splice(1, 1);
    expect((await verifyChain(chain)).valid).toBe(false);
  });

  it('DETECTS reordering, even with hashes intact', async () => {
    const chain = await buildChain([{}, {}, {}]);
    const reordered = [chain[0], chain[2], chain[1]];
    expect((await verifyChain(reordered)).valid).toBe(false);
  });

  it('DETECTS a swapped actor — the classic repudiation attempt', async () => {
    const chain = await buildChain([{ actorId: 'u-1' }, { actorId: 'u-2' }]);
    chain[1].actorId = 'u-1';
    expect((await verifyChain(chain)).valid).toBe(false);
  });

  it('an empty chain is valid and hashes to the genesis sentinel', async () => {
    const r = await verifyChain([]);
    expect(r.valid).toBe(true);
    expect(chainHead([])).toBe(GENESIS_HASH);
  });

  it('the chain head advances with every append', async () => {
    const a = await buildChain([{}]);
    const b = await buildChain([{}, {}]);
    expect(chainHead(a)).not.toBe(chainHead(b));
    expect(chainHead(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — the same logical entry always hashes identically', async () => {
    const c1 = await buildChain([{ entityId: 'X' }]);
    const c2 = await buildChain([{ entityId: 'X' }]);
    expect(c1[0].entryHash).toBe(c2[0].entryHash);
  });
});

describe('audit — tenant isolation of the chain', () => {
  it('one tenant\'s corruption does not invalidate another tenant\'s chain', async () => {
    // Each tenant's chain is built and hashed independently from genesis,
    // which is what per-tenant verification requires.
    const aEntries = await buildChain([{ tenantId: 't-1' }, { tenantId: 't-1' }]);
    const bEntries = await buildChain([{ tenantId: 't-2' }, { tenantId: 't-2' }], { idOffset: 100 });
    // Corrupt tenant t-1 only.
    aEntries[1].actorId = 'attacker';

    const all = [...aEntries, ...bEntries];
    expect((await verifyChain(all)).valid).toBe(false);
    expect((await verifyTenantChain(all, 't-2')).valid).toBe(true);
    expect((await verifyTenantChain(all, 't-1')).valid).toBe(false);
    expect((await verifyTenantChain(all, 't-2')).entriesChecked).toBe(2);
  });
});

describe('audit — anomaly detection', () => {
  it('raises SEV1 on a self-approval pattern', async () => {
    const chain = await buildChain([{ action: 'APPROVE', before: { status: 'PENDING', approved_by: 'u-9' }, actorId: 'u-9' }]);
    const { findings, highestSeverity } = auditAnomalies(chain);
    expect(highestSeverity).toBe('SEV1');
    expect(findings.some((f) => f.code === 'SELF_APPROVAL')).toBe(true);
  });

  it('flags a delete recorded with no prior snapshot', async () => {
    const chain = await buildChain([{ action: 'DELETE', before: null }]);
    const { findings } = auditAnomalies(chain);
    expect(findings.some((f) => f.code === 'DELETE_WITHOUT_SNAPSHOT')).toBe(true);
  });

  it('flags out-of-order entry ids', async () => {
    const chain = await buildChain([{}, {}]);
    chain[1].id = 1;
    const { findings } = auditAnomalies(chain);
    expect(findings.some((f) => f.code === 'OUT_OF_ORDER')).toBe(true);
  });
});

describe('cost authority — availability arithmetic', () => {
  const base = {
    budgetedCents: 10_000_000, revisedCents: 0, releasedCents: 0,
    committedCents: 0, pendingCents: 0, expendedCents: 0, frozenCents: 0,
  };

  it('equals budget when nothing is spent, committed, reserved or frozen', async () => {
    expect(availabilityCents(/** @type {any} */ ({ ...base, id: 'L1' }))).toBe(10_000_000);
  });

  it('subtracts each of committed, pending, expended and frozen independently', async () => {
    const line = {
      ...base, id: 'L1',
      committedCents: 1_000_000, pendingCents: 500_000,
      expendedCents: 2_000_000, frozenCents: 250_000,
    };
    expect(availabilityCents(/** @type {any} */ (line))).toBe(6_250_000);
  });

  it('accounts for revisions as an increase', async () => {
    expect(availabilityCents(/** @type {any} */ ({ ...base, id: 'L1', revisedCents: 750_000 })))
      .toBe(10_750_000);
  });

  it('accounts for released cash as an increase', async () => {
    expect(availabilityCents(/** @type {any} */ ({ ...base, id: 'L1', releasedCents: 300_000 })))
      .toBe(10_300_000);
  });

  it('THROWS on negative availability instead of clamping to zero', async () => {
    const line = { ...base, id: 'L1', committedCents: 20_000_000 };
    // Clamping to 0 would hide a control breach. It must be loud.
    expect(() => availabilityCents(/** @type {any} */ (line)))
      .toThrow(/control breach/);
    try {
      availabilityCents(/** @type {any} */ (line));
    } catch (err) {
      expect(err).toBeInstanceOf(CostAuthorityError);
      expect(/** @type {CostAuthorityError} */ (err).code).toBe('AVAILABILITY_NEGATIVE');
    }
  });

  it('treats frozen funds as unspendable without creating a commitment', async () => {
    const line = { ...base, id: 'L1', frozenCents: 9_000_000 };
    expect(availabilityCents(/** @type {any} */ (line))).toBe(1_000_000);
  });
});
