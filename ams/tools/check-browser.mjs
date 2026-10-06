/**
 * Headless browser-graph simulation.
 *
 * Loads the built site exactly as a browser would — no `node:` resolution,
 * no Node builtins available — and imports the entry point. This is the
 * check that was missing when the deployed demo showed "Loading domain
 * modules..." forever: every previous verification ran in Node, where
 * `node:crypto` resolves perfectly and the failure is invisible.
 *
 * Usage:  node tools/check-browser.mjs <builtSiteDir>
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.argv[2]);
const ENTRY = 'frontend/js/app.js';

if (!existsSync(ROOT)) {
  console.error(`no built site at ${ROOT}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * 1. Static scan: does anything the browser loads import a Node builtin?
 * ------------------------------------------------------------------ */

const NODE_BUILTINS = new Set([
  'fs', 'path', 'crypto', 'http', 'https', 'url', 'os', 'child_process',
  'zlib', 'stream', 'net', 'tls', 'worker_threads', 'perf_hooks', 'util',
  'events', 'buffer', 'assert', 'querystring', 'readline', 'v8', 'vm',
]);

const reachable = new Set();
const queue = [ENTRY];
while (queue.length) {
  const rel = queue.pop();
  if (reachable.has(rel)) continue;
  reachable.add(rel);
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) continue;
  const src = readFileSync(abs, 'utf8');
  const specs = [
    ...[...src.matchAll(/\bfrom\s+'(\.[^']+)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bimport\s+'(\.[^']+)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bimport\s*\(\s*'(\.[^']+)'\s*\)/g)].map((m) => m[1]),
  ];
  for (const s of specs) {
    queue.push(relative(ROOT, resolve(dirname(abs), s)).replace(/\\/g, '/'));
  }
}

console.log(`module graph: ${reachable.size} modules reachable from ${ENTRY}`);

let fatal = 0;
for (const rel of reachable) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) { console.log(`  MISSING FILE  ${rel}`); fatal++; continue; }
  const src = readFileSync(abs, 'utf8');
  // STATIC imports only. A dynamic `await import('node:crypto')` inside a
  // try/catch resolves at call time and is safe; a top-level
  // `import ... from 'node:crypto'` kills the whole graph silently.
  for (const m of src.matchAll(/^\s*import\s+[^;]*?from\s+'(node:)?([a-z_]+)'/gm)) {
    if (m[1] === 'node:' || NODE_BUILTINS.has(m[2])) {
      console.log(`  FATAL         ${rel} statically imports node:${m[2]}`);
      fatal++;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2. index.html must not reference root-absolute assets
 * ------------------------------------------------------------------ */

const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const absolute = [...html.matchAll(/(?:href|src)="(\/[^/][^"]*)"/g)].map((m) => m[1]);
if (absolute.length) {
  console.log(`  FATAL         index.html has root-absolute paths: ${absolute.join(', ')}`);
  fatal++;
}

/* ------------------------------------------------------------------ *
 * 3. Actually execute the entry point with a minimal DOM
 *
 * The demo touches document/window at import time, so this stubs enough of
 * the DOM for app.js to boot. That is the only way to catch a throw inside
 * boot() without launching a browser.
 * ------------------------------------------------------------------ */

class StubNode {}
class StubFragment extends StubNode {
  constructor() { super(); this.children = []; this.nodeType = 11; }
  append(...items) {
    for (const i of items.flat()) {
      if (i === null || i === undefined || i === false) continue;
      this.children.push(i instanceof StubNode ? i : Object.assign(new StubNode(), { nodeType: 3, textContent: String(i) }));
    }
  }
  get firstChild() { return this.children[0] ?? null; }
}

class StubElement extends StubNode {
  constructor(id = '') {
    super();
    this.id = id; this.nodeType = 1;
    this.className = ''; this.textContent = ''; this.innerHTML = ''; this.style = {};
    this.dataset = {}; this.children = []; this._attrs = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  get firstChild() { return this.children[0] ?? null; }
  appendChild(c) { this.children.push(c); return c; }
  // `append` is variadic and flattens arrays; views.js uses
  // `story += el(...)` and `node.append(Node, ...)` throughout.
  append(...items) {
    for (const i of items.flat()) {
      if (i === null || i === undefined || i === false) continue;
      this.children.push(i instanceof StubNode ? i : Object.assign(new StubNode(), { nodeType: 3, textContent: String(i) }));
    }
  }
  prepend(...items) { this.append(...items); }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  replaceChildren(...c) { this.children = c.flat(); }
  remove() {}
  addEventListener() {}
  removeEventListener() {}
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] ?? null; }
  removeAttribute(k) { delete this._attrs[k]; }
  querySelector() { return new StubElement(); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 0, height: 0 }; }
  closest() { return null; }
  focus() {}
  click() {}
}

const stubElement = (id = '') => new StubElement(id);

const nodes = new Map();
globalThis.Node = StubNode;
globalThis.document = {
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, new StubElement(id));
    return nodes.get(id);
  },
  createElement(tag) { return new StubElement(tag); },
  createElementNS() { return new StubElement('svg'); },
  createTextNode(t) { return Object.assign(new StubNode(), { nodeType: 3, textContent: String(t) }); },
  createDocumentFragment() { return new StubFragment(); },
  querySelector() { return new StubElement(); },
  querySelectorAll() { return []; },
};
// `location` is a bare global in browsers (window.location), not a property
// reached through the window object. app.js reads it directly, so it must be
// defined as its own global or the reference throws.
globalThis.location = { hash: '', href: '', origin: 'https://example.github.io' };
globalThis.window = {
  scrollTo() {},
  location: globalThis.location,
  addEventListener() {},
};
globalThis.history = { replaceState() {} };
globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.getComputedStyle = () => ({});
// Node already exposes a read-only global crypto with Web Crypto's subtle
// implementation, which is exactly what a browser would offer. Attempting to
// assign it throws in strict mode, so it is only defined if genuinely absent.
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
}

try {
  await import(pathToFileURL(resolve(ROOT, ENTRY)).href);

  const view = nodes.get('view');
  const badge = nodes.get('verdict-badge');
  const tenant = nodes.get('tenant-label');

  console.log('\nentry point executed without throwing');
  console.log(`  tenant label:      ${JSON.stringify(tenant?.textContent)}`);
  console.log(`  verdict badge:     ${JSON.stringify(badge?.textContent)}`);
  console.log(`  view child nodes:  ${view ? view.children.length : 0}`);

  const problems = [];
  if (!view || view.children.length === 0) {
    problems.push('view rendered no children — the loading placeholder is still showing');
  }
  if (!badge || !badge.textContent || /computing/i.test(badge.textContent)) {
    problems.push('verdict badge was never set — boot() did not complete');
  }
  if (!tenant || !tenant.textContent) {
    problems.push('tenant label was never set');
  }

  if (problems.length) {
    for (const p of problems) console.log(`  PROBLEM          ${p}`);
    fatal += problems.length;
  } else {
    console.log('\nBOOT COMPLETED: the demo rendered, not the loading placeholder');
  }
} catch (err) {
  console.log(`\nENTRY POINT THREW: ${err.constructor.name}`);
  console.log(`  ${err.message}`);
  console.log(err.stack?.split('\n').slice(1, 4).join('\n'));
  fatal++;
}

console.log(fatal === 0 ? '\nBROWSER GRAPH OK' : `\n${fatal} FATAL PROBLEM(S)`);
process.exit(fatal === 0 ? 0 : 1);
