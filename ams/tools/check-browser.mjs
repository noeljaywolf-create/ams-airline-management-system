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
  /* Listeners are STORED and dispatched by `click()`. The previous stub
   * discarded them, which meant a button could be wired to nothing and the
   * check still passed — the exact failure mode this script exists to
   * catch. Storing them is what makes the scripted journey below possible.
   */
  addEventListener(type, fn) {
    (this._listeners ??= {})[type] = [...(this._listeners[type] ?? []), fn];
  }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners?.[type] ?? []).filter((f) => f !== fn);
  }
  /** Fire a listener. The event carries the target so delegated handlers work. */
  fire(type, extra = {}) {
    const evt = { type, target: this, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const fn of this._listeners?.[type] ?? []) fn.call(this, evt);
    return evt;
  }
  click() { return this.fire('click'); }
  /**
   * Deep query by tag name or a `.class` selector.
   *
   * Descends into EVERY child, including document fragments (nodeType 11).
   * `el()` returns a fragment whose children are the actual elements, so a
   * walker that only recurses into elements finds nothing at all — which is
   * exactly what happened the first time.
   */
  walk(sel) {
    const isClass = sel.startsWith('.');
    // Tag names are compared case-insensitively (HTML uppercases them);
    // CLASS names are not. Uppercasing a class selector silently made every
    // `.foo` lookup return nothing, which is how a genuinely broken
    // derivation panel could look like a passing test.
    const want = isClass ? sel.slice(1) : sel.toUpperCase();
    const out = [];
    const visit = (n) => {
      for (const c of n.children ?? []) {
        if (c.nodeType === 1) {
          const cls = String(c.className ?? c._attrs?.class ?? '');
          const hit = isClass
            ? cls.split(/\s+/).includes(want)
            : String(c.tagName ?? '').toUpperCase() === want;
          if (hit) out.push(c);
        }
        visit(c);
      }
    };
    visit(this);
    return out;
  }
  querySelectorAll(sel) { return this.walk(sel); }
  querySelector(sel) { return this.walk(sel)[0] ?? null; }
  get text() {
    // Text nodes carry textContent; elements expose the recursive getter.
    let s = this.textContent ?? '';
    for (const c of this.children ?? []) s += ' ' + (c.text ?? c.textContent ?? '');
    return s;
  }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] ?? null; }
  hasAttribute(k) { return k in this._attrs; }
  removeAttribute(k) { delete this._attrs[k]; }
  /**
   * A browser's `<select>` reads as its first option until one is chosen, and
   * `<input>` reads its `value` attribute. The stub originally returned
   * undefined for both, so a form read `lineId: undefined`, the raise failed
   * with NO_SUCH_LINE, and the journey looked like it had raised a request.
   */
  get value() {
    if (this._value !== undefined) return this._value;
    if (this._attrs?.value !== undefined) return this._attrs.value;
    if (this.tagName === 'SELECT') {
      const first = this.walk('option')[0];
      return first ? (first._attrs?.value ?? first.textContent ?? '') : '';
    }
    return '';
  }
  set value(v) { this._value = v; }
  getBoundingClientRect() { return { width: 0, height: 0 }; }
  focus() {}
  /**
   * `closest()` supports the delegated `[data-goto]` navigation in app.js.
   * Returning null here — as this stub originally did — silently disabled
   * every delegated handler, which is the same class of invisible failure as
   * an unwired button.
   */
  closest(sel) {
    const want = sel.replace(/^\[|\]$/g, '');
    let n = this;
    while (n) {
      if (n.nodeType === 1 && n._attrs && want in n._attrs) return n;
      n = n.parent ?? null;
    }
    return null;
  }
}

const stubElement = (id = '') => new StubElement(id);

const nodes = new Map();
globalThis.Node = StubNode;
globalThis.document = {
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, new StubElement(id));
    return nodes.get(id);
  },
  createElement(tag) {
    const e = new StubElement();
    e.tagName = String(tag).toUpperCase();
    return e;
  },
  createElementNS(_ns, tag) {
    const e = new StubElement();
    e.tagName = String(tag).toUpperCase();
    return e;
  },
  createTextNode(t) { return Object.assign(new StubNode(), { nodeType: 3, textContent: String(t) }); },
  createDocumentFragment() { return new StubFragment(); },
  querySelector(sel) { return this.getElementById('view').querySelector(sel); },
  querySelectorAll(sel) { return this.getElementById('view').querySelectorAll(sel); },
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
  // app.js holds its router in module scope. Exporting it lets this script
  // render EVERY view, not just the default — the gap that let a broken
  // executive brief pass verification and deploy.
  const appNs = await import(pathToFileURL(resolve(ROOT, ENTRY)).href);
  const select = appNs.__select;
  if (typeof select !== 'function') {
    console.log('\ncannot render every view: app.js does not export __select');
    console.log('only the default view was checked, which is the gap that let a');
    console.log('broken view deploy unnoticed. Export __select from app.js.');
    process.exit(1);
  }
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

  /* ---- render EVERY view, not just the default ----
   *
   * This is the check that was missing. The executive brief shipped broken
   * while the previous version of this script reported BROWSER GRAPH OK,
   * because it only rendered whichever view the hash selected. A view that
   * throws at runtime is invisible until someone opens that tab.
   *
   * Two traps are handled explicitly:
   *   1. app.js `select()` CATCHES render errors and paints an error card
   *      instead of rethrowing. That is right for a user, wrong for
   *      verification, so success is judged by what was painted.
   *   2. The DOM stub never serialises innerHTML, so checking innerHTML for
   *      the failure text would always pass. Walk the tree instead.
   */
  const textOf = (n) => {
    if (!n) return '';
    let out = n.textContent ?? '';
    for (const c of n.children ?? []) out += ' ' + textOf(c);
    return out;
  };

  const TABS = appNs.__viewNames ?? [];
  if (!Array.isArray(TABS) || TABS.length === 0) {
    problems.push('app.js exported no view names — every-view check cannot run');
  } else {
    console.log(`\nrendering ${TABS.length} views:`);
    for (const name of TABS) {
      try {
        select(name);
        const host = nodes.get('view');
        const kids = host?.children?.length ?? 0;
        const painted = textOf(host);
        const unevaluated = painted.match(/\$\{[^{}]*\}/g);
        if (/View failed to render/i.test(painted)) {
          console.log(`  FAIL ${name.padEnd(16)} painted a render-error card`);
          problems.push(`view "${name}" threw during render and was replaced by an error card`);
        } else if (unevaluated) {
          // A single-quoted string where a template literal was meant
          // ("${money(x)}") renders the expression verbatim instead of
          // throwing, so it produces a plausible-looking KPI with nonsense
          // in it. The dashboard shipped CASK and RASP that way.
          const sample = unevaluated.slice(0, 3).join(' ');
          console.log(`  FAIL ${name.padEnd(16)} leaked un-evaluated template: ${sample}`);
          problems.push(`view "${name}" displays un-evaluated interpolation: ${sample}`);
        } else if (kids === 0 || painted.trim() === '') {
          console.log(`  FAIL ${name.padEnd(16)} rendered no visible content`);
          problems.push(`view "${name}" rendered no visible content`);
        } else {
          console.log(`  ok   ${name.padEnd(16)} ${kids} root node(s), ${painted.trim().length} chars`);
        }
      } catch (err) {
        console.log(`  THREW ${name}: ${err.message}`);
        problems.push(`view "${name}" threw: ${err.message}`);
      }
    }
  }

  if (problems.length) {
    for (const p of problems) console.log(`  PROBLEM          ${p}`);
    fatal += problems.length;
  } else {
    console.log('\nBOOT COMPLETED and every view rendered');
  }

  /* ---- scripted journey: click the controls ---------------------------
   *
   * Rendering is not working. A button can be wired to nothing, a listener
   * can never fire, and the page still looks perfect. This drives the real
   * handlers in sequence and asserts the observable state changed, which is
   * the only honest definition of "the demo works".
   *
   * The journey is the demo's sales pitch, run headlessly:
   *   raise a request -> try to approve your own -> get blocked by SoD
   *   -> switch role -> approve -> budget moves -> chain verifies.
   */
  console.log('\nclicking the controls:');
  const host = nodes.get('view');
  const byText = (sel, text) => host.querySelectorAll(sel).find((n) => (n.text ?? '').includes(text));

  /**
   * The click handlers are ASYNC (they hash an audit entry before updating),
   * so asserting immediately after `.click()` would read the DOM before the
   * work happened. Every step therefore awaits its own handler, and clicks
   * are followed by `settle()`.
   */
  const settle = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };

  const step = async (label, fn) => {
    try {
      const detail = await fn();
      console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
    } catch (err) {
      console.log(`  FAIL ${label}: ${err.message}`);
      problems.push(`interaction "${label}": ${err.message}`);
    }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  let chainValid = null;

  await step('switch to the portal and raise a request', async () => {
    select('portal');
    const btn = byText('button', 'Raise request');
    assert(btn, 'no "Raise request" button found');
    assert(btn._listeners?.click?.length, '"Raise request" has no click handler wired');
    btn.click();
    await settle();
    return 'handler fired';
  });

  await step('a pending request appears in the queue', async () => {
    select('portal');
    assert(!host.text.includes('Nothing awaiting approval'), 'the request was never actually raised');
    assert(host.text.includes('awaiting approval'), 'queue did not show a pending request');
    assert(byText('button', 'Approve'), 'no Approve/Reject controls on the pending row');
    return 'visible';
  });

  await step('the author CANNOT approve their own request', async () => {
    select('portal');
    const approve = byText('button', 'Approve');
    assert(approve, 'no Approve button in the queue');
    approve.click();
    await settle();
    assert(host.text.includes('SOD_SELF_APPROVAL'), 'self-approval was NOT blocked');
    assert(host.text.includes('awaiting approval'), 'the blocked request was still consumed');
    return 'blocked, and a refusal was recorded';
  });

  await step('the budget has not moved after the blocked attempt', async () => {
    select('portal');
    assert(!host.text.includes('Cost authorised'), 'a cost was authorised by a blocked actor');
    return 'unchanged';
  });

  await step('hand off to the CEO, who did not raise it', async () => {
    select('portal');
    const sel = host.querySelectorAll('select')[0];
    assert(sel, 'no persona select rendered');
    sel.value = 'p-ceo';
    sel.fire('change');
    select('portal');
    assert(host.text.includes('R. Moyo'), 'the persona switcher did not change the signed-in user');
    return 'now acting as the CEO, who raised nothing';
  });

  await step('the CEO CAN approve, and the budget moves', async () => {
    select('portal');
    const approve = byText('button', 'Approve');
    assert(approve, 'no Approve button for the CEO');
    approve.click();
    await settle();
    assert(host.text.includes('Cost authorised'), 'the CEO approval did not go through');
    return 'authorised and committed';
  });

  await step('the audit chain verifies after real actions', async () => {
    select('portal');
    const verify = byText('button', 'Verify the chain');
    assert(verify, 'no "Verify the chain" button');
    verify.click();
    await settle();
    assert(host.text.includes('Chain valid'), 'the chain did not verify after the journey');
    chainValid = true;
    return 'hashes recomputed and matched';
  });

  await step('a what-if input recomputes the model', async () => {
    select('whatif');
    const slider = host.querySelectorAll('input')[0];
    assert(slider, 'no what-if slider rendered');
    const before = slider.value;
    slider.value = '180';
    slider.fire('input');
    select('whatif');
    assert(host.text.includes('Effect on this year'), 'moving a slider produced no effect panel');
    assert(slider.value !== before, 'the slider did not change');
    return 'fuel index moved, ratios recomputed';
  });

  await step('every figure on the dashboard can explain itself', async () => {
    select('dashboard');
    // `el()` assigns `class` to `className`, not to the attribute bag.
    const explainable = host.walk('div').filter((n) =>
      String(n.className ?? '').split(/\s+/).includes('kpi-why'));
    assert(explainable.length >= 5, `only ${explainable.length} KPI tiles carry a derivation`);

    // Click one and prove the panel actually opens. A tile that looks
    // clickable and does nothing is worse than a plain label.
    const first = explainable[0];
    const panel = first.querySelector('.kpi-detail');
    assert(panel, 'clickable KPI has no derivation panel');
    assert(panel.getAttribute('hidden') !== null, 'derivation panel starts open instead of collapsed');

    first.click();
    assert(panel.getAttribute('hidden') === null, 'clicking the tile did not reveal its derivation');
    const text = panel.text ?? '';
    assert(text.includes('formula'), 'derivation panel has no formula row');
    assert(text.includes('pinned by'), 'derivation panel does not name the test that pins the figure');

    first.click();
    assert(panel.getAttribute('hidden') !== null, 'clicking again did not collapse the panel');
    return `${explainable.length} KPI tiles derive on click`;
  });

  await step('index.html declares a tab button for every view', async () => {
    // The DOM stub never parses index.html, so it cannot see the tab strip —
    // and a view with no button is invisible in the demo while still passing
    // every render test. Count the real markup instead. This is the check
    // that would have caught Audit Trail being unreachable.
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    const buttons = [...html.matchAll(/class="tab"\s+data-view="(\w+)"/g)].map((m) => m[1]);
    assert(buttons.length >= 14, `only ${buttons.length} tab buttons in index.html: ${buttons.join(', ')}`);
    for (const required of ['home', 'executive', 'portal', 'whatif', 'accounts', 'audit']) {
      assert(buttons.includes(required), `no tab button for "${required}"`);
    }
    return `${buttons.length} tab buttons declared`;
  });

  if (problems.length) {
    console.log('\nINTERACTION PROBLEMS:');
    for (const p of problems) console.log(`  ${p}`);
    fatal += problems.filter((p) => p.startsWith('interaction')).length;
  } else if (chainValid) {
    console.log('\nEVERY CONTROL FIRED AND THE SYSTEM RESPONDED CORRECTLY');
  }
} catch (err) {
  console.log(`\nENTRY POINT THREW: ${err.constructor.name}`);
  console.log(`  ${err.message}`);
  console.log(err.stack?.split('\n').slice(1, 4).join('\n'));
  fatal++;
}

console.log(fatal === 0 ? '\nBROWSER GRAPH OK' : `\n${fatal} FATAL PROBLEM(S)`);
process.exit(fatal === 0 ? 0 : 1);
