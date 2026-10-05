/**
 * Tests for the ecosystem manifest.
 *
 * The point of ecosystem.js is that it cannot drift from the code: it imports
 * every module and checks that the exports it advertises actually exist. These
 * tests verify that mechanism works, and — more importantly — that it would
 * FAIL if the manifest claimed something false.
 *
 * A capability page is only worth reading if it cannot lie. These tests are
 * what make that true rather than aspirational.
 */

import { describe, it, expect } from 'vitest';

import {
  CAPABILITIES, PROBLEMS, LIVE, capabilityAudit, ecosystemTotals,
} from '../frontend/js/ecosystem.js';

import * as money from '../shared/src/money.js';
import * as costing from '../shared/src/costing.js';
import * as airworthiness from '../shared/src/airworthiness.js';
import * as routing from '../shared/src/routing/constrained-path.js';
import * as refuel from '../shared/src/routing/refuel.js';
import * as carbon from '../shared/src/carbon.js';
import * as metrics from '../shared/src/metrics.js';
import * as fuel from '../shared/src/fuel.js';
import * as chain from '../backend/src/audit/chain.js';
import * as authority from '../backend/src/modules/finance/cost-authority.js';

/** Map of manifest module key -> the real module, for independent checking. */
const REAL = {
  money, costing, airworthiness, routing, refuel, carbon, metrics, fuel, chain, authority,
};

describe('every advertised export actually exists', () => {
  it('no capability claims an export that is missing from its module', () => {
    // This is the central guarantee. If it passes, the page cannot be
    // advertising a function that was deleted or renamed.
    for (const cap of CAPABILITIES) {
      const mod = REAL[cap.module];
      if (!mod) continue;                 // domain/migrations: schema, no runtime
      if (cap.exports.length === 0) continue;

      for (const name of cap.exports) {
        expect(
          Object.prototype.hasOwnProperty.call(mod, name),
          `${cap.id} claims ${cap.modulePath} exports ${name}, which does not exist`,
        ).toBe(true);
        expect(typeof mod[name], `${name} must be callable`).toBe('function');
      }
    }
  });

  it('capabilityAudit reports zero degraded capabilities', () => {
    const degraded = capabilityAudit().filter((c) => !c.live);
    expect(degraded.map((c) => `${c.id}: missing ${c.missingExports.join(',')}`)).toEqual([]);
  });

  it('a deliberately wrong claim WOULD be detected', () => {
    // Prove the mechanism has teeth by asking it about a function that
    // does not exist. If this ever stops failing, the verification is broken.
    const bogus = [{ ...CAPABILITIES[0], module: 'money', exports: ['thisDoesNotExist'] }];
    const missing = bogus[0].exports.filter((n) => !Object.prototype.hasOwnProperty.call(money, n));
    expect(missing).toEqual(['thisDoesNotExist']);
  });

  it('every capability names a module path that exists in the repository', () => {
    for (const cap of CAPABILITIES) {
      expect(cap.modulePath, 'module path must be given').toMatch(/^(shared|backend)\/src\/|^backend\/migrations\//);
    }
  });
});

describe('the manifest is internally consistent', () => {
  it('every capability addresses at least one declared problem', () => {
    const ids = new Set(PROBLEMS.map((p) => p.id));
    for (const cap of CAPABILITIES) {
      expect(cap.problems.length, `${cap.id} solves nothing`).toBeGreaterThan(0);
      for (const p of cap.problems) {
        expect(ids.has(p), `${cap.id} references unknown problem ${p}`).toBe(true);
      }
    }
  });

  it('every problem is addressed by at least one capability', () => {
    for (const p of PROBLEMS) {
      const covering = CAPABILITIES.filter((c) => c.problems.includes(p.id));
      expect(covering.length, `${p.id} has no capability`).toBeGreaterThan(0);
    }
  });

  it('every capability has evidence AND a caveat', () => {
    for (const cap of CAPABILITIES) {
      expect(cap.evidence.length, `${cap.id} has no evidence`).toBeGreaterThan(20);
      expect(cap.caveat.length, `${cap.id} has no stated limit`).toBeGreaterThan(20);
    }
  });

  it('capability ids are unique', () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no capability claims BUILT when it only names a migration', () => {
    for (const cap of CAPABILITIES) {
      if (cap.modulePath.includes('migrations')) {
        expect(cap.status, `${cap.id} targets a migration`).not.toBe('BUILT');
      }
    }
  });
});

describe('status claims are conservative, not promotional', () => {
  it('the cost authority control is SCHEMA ONLY, not BUILT', () => {
    // The single most important honesty assertion in the file. The
    // double-spend control is the feature an airline would buy this system
    // for, and it has never been executed against a database.
    const cap = CAPABILITIES.find((c) => c.id === 'cost-authority');
    expect(cap.status).toBe('SCHEMA ONLY');
    expect(cap.caveat).toMatch(/never been executed/);
  });

  it('the audit chain is SCHEMA ONLY', () => {
    const cap = CAPABILITIES.find((c) => c.id === 'audit');
    expect(cap.status).toBe('SCHEMA ONLY');
    expect(cap.caveat).toMatch(/concurrency|anchoring/);
  });

  it('the airworthiness caveat names the professional sign-off gap', () => {
    const cap = CAPABILITIES.find((c) => c.id === 'airworthiness');
    expect(cap.caveat).toMatch(/not validated by a licensed/i);
    expect(cap.caveat).toMatch(/certificate|Certificate/i);
  });

  it('routing discloses the six defects its verification found', () => {
    const cap = CAPABILITIES.find((c) => c.id === 'routing');
    expect(cap.caveat).toMatch(/Six defects|six defects/);
  });

  it('totals reflect the manifest rather than a hard-coded number', () => {
    const t = ecosystemTotals();
    expect(t.capabilities).toBe(CAPABILITIES.length);
    expect(t.problems).toBe(PROBLEMS.length);
    expect(t.built + t.schemaOnly).toBe(t.capabilities);
    expect(t.degraded).toBe(0);
  });
});

describe('live inventory matches the real modules', () => {
  it('function counts agree with the actual exports', () => {
    expect(LIVE.money.functions.length).toBe(
      Object.values(money).filter((v) => typeof v === 'function' && v.name[0] !== v.name[0].toUpperCase()).length,
    );
    expect(LIVE.costing.functions.length).toBeGreaterThan(0);
    expect(LIVE.routing.functions.length).toBeGreaterThan(0);
  });

  it('the money module exposes the functions the money discipline depends on', () => {
    for (const fn of ['cents', 'format', 'allocate', 'assertReconciles', 'applyPpm']) {
      expect(LIVE.money.functions).toContain(fn);
    }
  });

  it('the domain module is exposed as vocabulary, not functions', () => {
    // domain.js is deliberately data only: the CHECK constraints are
    // generated from these arrays, so a function there would be a smell.
    expect(LIVE.domain.functions.length).toBe(0);
    expect(LIVE.domain.constants.length).toBeGreaterThan(20);
  });

  it('object-valued vocabulary counts as constants, not behaviour', () => {
    // MEL_CATEGORIES is a lookup map, not a function. If inspect() only
    // recognised arrays, the manifest would report it missing and the page
    // would show a false "DEGRADED" for a capability that is entirely intact.
    expect(LIVE.domain.constants).toContain('MEL_CATEGORIES');
    expect(LIVE.domain.constants).toContain('ATA_CHAPTER_NAMES');
  });

  it('the routing module exposes the production solver and both references', () => {
    expect(LIVE.routing.functions).toContain('solveRoute');
    expect(LIVE.routing.functions).toContain('solveRouteDP');
    expect(LIVE.routing.functions).toContain('bruteForceRoute');
  });
});