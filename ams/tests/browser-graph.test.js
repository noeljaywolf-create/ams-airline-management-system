/**
 * Catch a browser-only failure that Node cannot see.
 *
 * THE DEFECT THIS EXISTS TO CATCH
 * ------------------------------
 * `backend/src/audit/chain.js` had a top-level
 *   import { createHash } from 'node:crypto'
 * `frontend/js/ecosystem.js` imports that module to inventory its exports.
 * A browser cannot resolve a Node builtin, so the ENTIRE module graph failed
 * to link and `app.js` never executed. The page rendered its static
 * "Loading domain modules..." placeholder forever, with no error anywhere —
 * because a graph-level resolution failure happens before any application
 * code runs, so no try/catch inside app.js can observe it.
 *
 * `npm test` passed throughout. `tsc --noEmit` passed. Both run in Node,
 * where `node:crypto` resolves perfectly. Neither can see this class of bug.
 *
 * WHAT THIS CHECKS
 * ----------------
 * Every module reachable from the browser entry point, scanned for imports
 * of Node builtins, plus a real dynamic import of the whole graph with
 * `node:` stripped from consideration. A browser cannot be launched here, so
 * the honest guarantee is: "no node: builtin is statically imported by
 * anything the browser loads." That is the failure that bit us.
 */

import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/** Modules the browser actually loads, reachable from the entry point. */
const ENTRY = 'frontend/js/app.js';

const NODE_BUILTINS = [
  'fs', 'path', 'crypto', 'http', 'https', 'url', 'os', 'child_process',
  'zlib', 'stream', 'net', 'tls', 'worker_threads', 'perf_hooks', 'util',
  'events', 'buffer', 'assert', 'querystring', 'readline', 'v8', 'vm',
];

/** Walk every relative import from the entry point. */
function reachable(root, entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    let src;
    try {
      src = readFileSync(resolve(root, rel), 'utf8');
    } catch {
      continue; // a node_modules or absent file is out of scope
    }
    const specs = [
      ...[...src.matchAll(/\bfrom\s+'(\.[^']+)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/\bimport\s*\(\s*'(\.[^']+)'\s*\)/g)].map((m) => m[1]),
      ...[...src.matchAll(/\bimport\s+'(\.[^']+)'/g)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      queue.push(relative(root, resolve(dirname(resolve(root, rel)), spec)).replace(/\\/g, '/'));
    }
  }
  return seen;
}

describe('the browser module graph contains no Node builtins', () => {
  const root = resolve(process.cwd());
  const modules = [...reachable(root, ENTRY)];

  it('the entry point resolves to a non-trivial graph', () => {
    expect(modules.length).toBeGreaterThan(8);
  });

  it('NO module reachable from the browser entry statically imports a node: builtin', () => {
    const offenders = [];
    for (const rel of modules) {
      let src;
      try {
        src = readFileSync(resolve(root, rel), 'utf8');
      } catch {
        continue;
      }
      // A STATIC import is fatal: `import x from 'node:crypto'` at the top
      // level fails at graph-link time, before any code runs, so nothing can
      // catch it. A DYNAMIC import inside try/catch is safe — it resolves at
      // call time and the catch handles absence. Only the former is checked
      // here, which is precisely the distinction that matters.
      for (const m of src.matchAll(/^\s*import\s+[^;]*?from\s+'(node:)?([a-z_]+)'/gm)) {
        const isNode = m[1] === 'node:' || (m[2] && NODE_BUILTINS.includes(m[2]));
        if (isNode) offenders.push(`${rel} statically imports node:${m[2]}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('chain.js resolves its hash provider lazily rather than statically', () => {
    const src = readFileSync(resolve(root, 'backend/src/audit/chain.js'), 'utf8');
    // Dynamic import inside a try/catch is what makes the module portable.
    expect(src).toMatch(/await import\('node:crypto'\)/);
    expect(src).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+'node:crypto'/m);
  });

  it('the audit hash functions are async, so one signature serves both runtimes', () => {
    const src = readFileSync(resolve(root, 'backend/src/audit/chain.js'), 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+computeHash/);
    expect(src).toMatch(/export\s+async\s+function\s+verifyChain/);
    expect(src).toMatch(/export\s+async\s+function\s+verifyTenantChain/);
  });
});

describe('the demo entry point would execute in a browser', () => {
  it('app.js imports only relative paths — no absolute or bare specifiers', () => {
    const src = readFileSync(resolve(process.cwd(), ENTRY), 'utf8');
    const bare = [...src.matchAll(/\bfrom\s+'([^'.][^']*)'/g)].map((m) => m[1]);
    for (const spec of bare) {
      expect(spec.startsWith('.'), `${ENTRY} must not import a bare specifier: ${spec}`).toBe(true);
    }
  });

  it('index.html uses absolute paths that the build rewrites to relative ones', () => {
    // The source shell uses /frontend/... which is correct when served from
    // the repo root by tools/serve.js. Under github.io/<repo>/ those would
    // 404, so build-site.mjs rewrites them and then ASSERTS nothing absolute
    // survived. This test pins both halves of that contract.
    const src = readFileSync(resolve(process.cwd(), 'frontend/index.html'), 'utf8');
    expect(src).toMatch(/(?:href|src)="\/frontend\/css\/app\.css"/);
    expect(src).toMatch(/(?:href|src)="\/frontend\/js\/app\.js"/);

    // The builder must fail rather than deploy a site with root-absolute paths.
    const builder = readFileSync(resolve(process.cwd(), 'tools/build-site.mjs'), 'utf8');
    expect(builder).toMatch(/still has root-absolute asset paths/);
  });
});
