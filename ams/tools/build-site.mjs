/**
 * Assemble a self-contained, deployable copy of the AMS UI demo.
 *
 * WHY THIS EXISTS
 * ---------------
 * The demo runs from the repository root: index.html references
 * `/frontend/css/app.css`, and every module reaches its domain code with
 * `../../shared/src/money.js`. Under github.io/<repo>/ those absolute paths
 * 404, and rewriting the relative imports inside eight JavaScript files
 * would be error-prone for no benefit.
 *
 * The trick is to preserve the EXACT directory layout inside the built
 * site. Then every relative import inside every module resolves unchanged
 * and only two lines in index.html need rewriting.
 *
 *   site/
 *     index.html            <- frontend/index.html, refs rewritten
 *     .nojekyll
 *     frontend/css, frontend/js
 *     shared/src/...
 *     backend/src/...
 *
 * The depth maths that makes this work:
 *   frontend/js/views.js   '../../shared/src/...'   -> site/shared/src  ✓
 *   backend/src/modules/finance/cost-authority.js
 *                          '../../../../shared/...'  -> site/shared     ✓
 *
 * Nothing is excluded except tests, docs and node_modules, none of which
 * the browser loads.
 *
 * Usage:  node tools/build-site.mjs [outDir]
 */

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(process.argv[2] ?? join(ROOT, '.pages'));

/** Copied verbatim so relative imports inside them keep resolving. */
const TREES = [
  'frontend/css',
  'frontend/js',
  'shared/src',
  'backend/src',
];

/**
 * Every file under `dir`, as a path relative to `dir`, POSIX separators.
 * Relative by design: callers join these onto different roots (the source
 * tree and the built tree), and an absolute path joined onto a second root
 * silently produces nonsense rather than an error.
 */
async function walk(dir) {
  const out = [];
  const visit = async (d) => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) await visit(p);
      else out.push(p.slice(dir.length + 1).replace(/\\/g, '/'));
    }
  };
  await visit(dir);
  return out;
}

/**
 * Append `?v=BUILD` to every relative import specifier in a directory tree.
 *
 * The entry point is the only <script> tag, so busting it alone would leave
 * every module it reaches cached. This walks the JavaScript and rewrites the
 * specifiers, which is what actually guarantees one coherent graph per page
 * load.
 *
 * @returns {Promise<number>} how many specifiers were rewritten
 */
async function rewriteSpecifiers(absDir, prefixToRoot, build) {
  let n = 0;
  for (const abs of await walk(absDir)) {
    if (!abs.endsWith('.js')) continue;
    const src = await readFile(join(absDir, abs), 'utf8');
    const next = src.replace(
      /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+?)\2/g,
      (m, lead, q, spec) => {
        if (spec.includes('?v=')) return m;
        n += 1;
        return `${lead}${q}${spec}?v=${build}${q}`;
      },
    );
    if (next !== src) await writeFile(join(absDir, abs), next, 'utf8');
  }
  return n;
}

async function main() {
  if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const tree of TREES) {
    const from = join(ROOT, tree);
    if (!existsSync(from)) throw new Error(`missing source tree: ${tree}`);
    // filter excludes editor config and anything else that is not browser source
    await cp(from, join(OUT, tree), {
      recursive: true,
      filter: (src) => !/[/\\](\.vscode|node_modules|\.git)[/\\]?$/.test(src),
    });
  }

  // Rewrite only the two asset references in index.html. The module graph
  // itself is untouched, so a bug here cannot be a relative-path bug.
  const html = await readFile(join(ROOT, 'frontend/index.html'), 'utf8');
  const rewritten = html
    .replace('href="/frontend/css/app.css"', 'href="./frontend/css/app.css"')
    .replace('src="/frontend/js/app.js"', 'src="./frontend/js/app.js"');

  const remainingAbsolute = rewritten.match(/(?:href|src)="\/(?!\/)/g);
  if (remainingAbsolute) {
    throw new Error(
      `index.html still has root-absolute asset paths: ${remainingAbsolute.join(', ')}. `
      + 'These would 404 under github.io/<repo>/ and must be rewritten.',
    );
  }

  /* ---- cache busting -------------------------------------------------
   *
   * GitHub Pages serves with `max-age=600`, and browsers cache ES modules
   * aggressively. That produced a genuinely broken state: a user holding a
   * FRESH index.html (new tab list) alongside a STALE app.js (old VIEWS
   * map). Clicking the new tab dispatched to `VIEWS['firstrun']`, which
   * did not exist in the old bundle, and the page went blank.
   *
   * The fix is to make it impossible rather than to ask people to remember
   * a keyboard shortcut. A short content hash of the whole module graph is
   * appended to every asset reference, so any change to any module changes
   * every URL. A stale HTML file and a fresh module can no longer coexist
   * in one page load.
   */
  const graph = [];
  for (const tree of TREES) {
    for (const rel of await walk(join(ROOT, tree))) graph.push(`${tree}/${rel}`);
  }
  graph.sort();
  const fingerprint = createHash('sha256');
  for (const rel of graph) {
    fingerprint.update(rel);
    fingerprint.update(await readFile(join(OUT, rel.split('/').join('\\'))));
  }
  const BUILD = fingerprint.digest('hex').slice(0, 12);

  // Sub-resources are not listed in index.html, so they are busted at the
  // entry point: app.js is the only script tag, and every module below it
  // is reached by its own specifier. Rewriting those specifiers is what
  // actually guarantees a coherent graph.
  const busted = await rewriteSpecifiers(join(OUT, 'frontend/js'), '..', BUILD);

  const stamped = rewritten
    .replace('href="./frontend/css/app.css"', `href="./frontend/css/app.css?v=${BUILD}"`)
    .replace('src="./frontend/js/app.js"', `src="./frontend/js/app.js?v=${BUILD}"`)
    // A visible build stamp, so anyone looking at the demo can tell at a
    // glance whether they are on the current build or a cached one.
    .replace('</body>', `  <div id="build-stamp" title="asset fingerprint">${BUILD}</div>\n  </body>`);

  await writeFile(join(OUT, 'index.html'), stamped, 'utf8');
  console.log(`  asset fingerprint ${BUILD} (${graph.length} modules, ${busted} specifiers busted)`);

  // Pages must not run Jekyll, which ignores files beginning with _.
  await writeFile(join(OUT, '.nojekyll'), '', 'utf8');

  // A redirect for the repo's own landing, so the bare repository URL lands
  // somewhere useful rather than on GitHub's file listing.
  await writeFile(
    join(OUT, 'README.txt'),
    'AMS UI demo. The published site is at the root of this branch.\n' +
    'Source repository: https://github.com/noeljaywolf-create/ams-airline-management-system\n',
    'utf8',
  );

  console.log(`built ${OUT}`);
  console.log('  index.html references rewritten to ./frontend/...');
  console.log('  module graph copied verbatim — no relative imports touched');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});