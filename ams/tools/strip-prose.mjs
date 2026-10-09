/**
 * One-shot refactor: remove explanatory prose blocks from the view layer.
 *
 * The demo explained itself with paragraphs. It should explain itself by
 * being used. This strips the prose constructs that turned screens into
 * documents:
 *
 *   el('p',  { class: 'lede' },    ...)   long introductory paragraph
 *   el('div', { class: 'explain' }, ...)   explanatory aside
 *   el('div', { class: 'hint' },   ...)   "do this then" instructions
 *
 * Two shapes have to be handled, and the first attempt handled only one:
 *
 *   STATEMENT   frag.append(el('p', { class: 'lede' }, ...));
 *               -> remove the whole statement, including the `frag.` prefix,
 *                  or a dangling `frag.` is left behind.
 *
 *   ARGUMENT    frag.append(card('t', 'n', el('div', {},
 *                    el('div', { class: 'explain' }, ...),   <-- this one
 *                    table([...]))));
 *               -> remove only from the separating comma to the call's close.
 *                  Removing the statement form here would delete the table
 *                  that follows it.
 *
 * Bracket matching rather than regex: these calls span many lines and
 * contain nested calls, parentheses inside strings, and template literals.
 *
 * Usage: node tools/strip-prose.mjs <file> [...files]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TARGETS = ["class: 'lede'", "class: 'explain'", "class: 'hint'"];

function scan(src, openIdx) {
  // openIdx points at '('; return index just past the matching ')'
  let depth = 0;
  let i = openIdx;
  let inStr = null;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; i += 1; continue; }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (ch === '(') depth += 1;
    else if (ch === ')') { depth -= 1; if (depth === 0) return i + 1; }
    i += 1;
  }
  return -1;
}

function findSemicolon(src, from) {
  let i = from;
  let inStr = null;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; i += 1; continue; }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i) + 1; continue; }
    if (ch === ';') return i + 1;
    i += 1;
  }
  return -1;
}

for (const file of process.argv.slice(2)) {
  let src = readFileSync(file, 'utf8');
  const before = src.length;
  let removed = 0;
  let args = 0;

  for (const target of TARGETS) {
    for (;;) {
      const at = src.indexOf(target);
      if (at < 0) break;

      const elIdx = src.lastIndexOf('el(', at);
      if (elIdx < 0) break;
      const openIdx = src.indexOf('(', elIdx);
      const closeIdx = scan(src, openIdx);
      if (closeIdx < 0) break;

      // What immediately precedes this call?
      let p = elIdx - 1;
      while (p >= 0 && /\s/.test(src[p])) p -= 1;
      const prev = src[p];

      if (prev === ',') {
        // ARGUMENT form: take the separating comma with it.
        src = src.slice(0, p) + src.slice(closeIdx);
        args += 1;
        removed += 1;
        continue;
      }

      // STATEMENT form: walk back to the statement boundary, swallowing any
      // `frag.` / `body.` prefix and the trailing semicolon.
      let s = elIdx;
      while (s > 0 && /\s/.test(src[s - 1])) s -= 1;
      const stmtEnd = findSemicolon(src, closeIdx);
      if (stmtEnd < 0) break;
      let start = p + 1;
      if (prev === '(') {
        // The call is wrapped: `frag.append(`. Find it and include the
        // receiver, or a dangling `frag.` survives.
        const wIdx = src.lastIndexOf('append(', start);
        if (wIdx > 0) {
        const wOpen = src.indexOf('(', wIdx);
        const wClose = scan(src, wOpen);
        // The wrapper's closing paren necessarily comes AFTER the inner
        // call's, because it has to contain it. Testing `wClose <= closeIdx`
        // is always false and silently leaves `frag.append(` behind.
        if (wClose > 0 && wClose >= closeIdx) {
            start = wIdx;
            while (start > 0 && /\s/.test(src[start - 1])) start -= 1;
            if (src[start - 1] === '.') {
              start -= 1;
              while (start > 0 && /[\w$]/.test(src[start - 1])) start -= 1;
            }
          }
        }
      }
      src = src.slice(0, start) + src.slice(stmtEnd);
      removed += 1;
    }
  }

  writeFileSync(file, src, 'utf8');
  console.log(`${file}: removed ${removed} prose block(s) [${args} nested argument(s)], ${before} -> ${src.length} bytes`);
}
