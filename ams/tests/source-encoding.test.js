/**
 * Source files must be valid UTF-8 with no double-encoded characters.
 *
 * WHY THIS EXISTS
 * ---------------
 * A previous mojibake check used PowerShell's
 * `Get-ChildItem -Recurse -Include *.js ...`. `-Include` only filters when
 * the path is a wildcard or `-Recurse` is applied to a single root; passing
 * several directory paths made it match NOTHING. The check therefore
 * reported "no mojibake" after examining zero files — a false negative that
 * looked exactly like a pass.
 *
 * A second trap: Windows PowerShell 5.1's `Get-Content` defaults to
 * Windows-1252, so reading a UTF-8 file that contains U+00B7 (MIDDLE DOT)
 * displays it as U+00C2 U+00B7 — that is, a Latin-1 supplement char glued
 * to a continuation byte. That is a DISPLAY artifact, not file damage.
 * Chasing it rewrites correct files. Node always reads UTF-8 correctly,
 * which is why this test is written in Node and why all assertions here run
 * over bytes read by `readFileSync(path, 'utf8')`.
 *
 * The corrupt pair is spelled with escapes above rather than literally, so
 * this file does not trip the very check it implements.
 *
 * WHAT IT DETECTS
 * ---------------
 * Classic mojibake: UTF-8 bytes decoded a second time as Latin-1. A lead
 * character in U+00C0..U+00FF immediately followed by U+0080..U+00BF is
 * always an artifact — real text never pairs a Latin-1 supplement char with
 * a bare continuation byte. U+FFFD is the replacement character, i.e. data
 * was lost irrecoverably.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd());
const EXTS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.md']);
const SKIP = new Set(['node_modules', '.pages', '.pages-test', '.git', 'dist', 'coverage']);

/** Enumerate ourselves so the file list cannot silently come back empty. */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (EXTS.has(extname(p))) out.push(p);
  }
  return out;
}

function mojibake(text) {
  const hits = [];
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i);
    if (cp === 0xfffd) { hits.push(`U+FFFD at ${i}`); continue; }
    if (cp >= 0x00c0 && cp <= 0x00ff) {
      const next = i + 1 < text.length ? text.codePointAt(i + 1) : -1;
      if (next >= 0x0080 && next <= 0x00bf) {
        hits.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')} + U+${next.toString(16).toUpperCase().padStart(4, '0')} at ${i}`);
      }
    }
  }
  return hits;
}

const files = collect(ROOT);

describe('source encoding is clean UTF-8', () => {
  it('actually collected files (guards against a silently empty glob)', () => {
    // The previous version of this check passed on zero files. If the
    // enumeration ever breaks again, fail loudly rather than vacuously.
    expect(files.length).toBeGreaterThan(20);
  });

  it('contains no double-encoded or replaced characters', () => {
    const offenders = [];
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      for (const hit of mojibake(readFileSync(f, 'utf8'))) {
        offenders.push(`${rel}: ${hit}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every file round-trips as UTF-8 without loss', () => {
    const lossy = [];
    for (const f of files) {
      const buf = readFileSync(f);
      const decoded = buf.toString('utf8');
      // U+FFFD present after a clean decode means the bytes were not UTF-8.
      if (decoded.includes('\uFFFD')) lossy.push(relative(ROOT, f).replace(/\\/g, '/'));
    }
    expect(lossy, lossy.join('\n')).toEqual([]);
  });
});
