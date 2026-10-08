/**
 * Every view must actually render.
 *
 * THE DEFECTS THIS EXISTS TO CATCH
 * -------------------------------
 * Three real bugs reached a live deployment while `npm test` and
 * `tsc --noEmit` both passed, because both run in Node against individual
 * functions and neither ever renders a view:
 *
 *   1. views-exec.js used `onclick: "location.hash='x'"`. `el()` now rejects
 *      string event handlers, so both the Home and Executive views threw.
 *   2. views.js dispatch-gate render callbacks took `(row)`, but `table()`
 *      calls `render(value, row)`. Arg 1 is the looked-up cell value, not
 *      the row, so every callback dereferencing `row.g.*` threw.
 *   3. The directive register and MEL tables had the same signature bug.
 *
 * WHY A SUBPROCESS TEST
 * --------------------
 * `select()` in app.js deliberately CATCHES render errors and paints an
 * error card, which is correct for a user and useless for verification — a
 * broken view is indistinguishable from a working one unless you inspect
 * what was painted. tools/check-browser.mjs does exactly that, against a
 * real build of the real site. Duplicating the DOM stub here would create a
 * second, weaker copy of the same check; running the real one keeps the
 * gate and the tool honest together.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const OUT = resolve(root, '.pages-test');

beforeAll(() => {
  execFileSync(process.execPath, ['tools/build-site.mjs', OUT], { cwd: root, stdio: 'pipe' });
}, 120_000);

describe('the built site renders every view', () => {
  it('renders all 11 views with no render-error card and exits clean', () => {
    let stdout = '';
    let failed = false;
    try {
      stdout = execFileSync(process.execPath, ['tools/check-browser.mjs', OUT], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      failed = true;
      stdout = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    // The assertion message is the whole value of this test: when it fails,
    // the operator must be able to see which view broke and why.
    expect(stdout).toMatch(/BROWSER GRAPH OK/);
    expect(failed, `check-browser reported a problem:\n${stdout}`).toBe(false);

    const rendered = [...stdout.matchAll(/^\s+ok\s+(\w+)\s+/gm)].map((m) => m[1]);
    expect(rendered).toEqual([
      'home', 'executive', 'problem', 'ecosystem', 'dashboard',
      'costing', 'routing', 'fuel', 'airworthiness', 'carbon', 'audit',
    ]);
  }, 120_000);
});

afterAll(() => {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
});
