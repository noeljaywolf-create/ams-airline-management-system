/**
 * Zero-dependency static file server for the AMS UI demo.
 *
 * ES module imports require http:// — a file:// page cannot load them
 * because of the browser's same-origin policy on modules. This exists so
 * `npm run demo` works with nothing installed.
 *
 * Usage:  node tools/serve.js [port]
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] ?? 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Reject any path that escapes the project root. */
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = join(ROOT, clean);
  if (!full.startsWith(ROOT + sep) && full !== ROOT) return null;
  return full;
}

const server = createServer(async (req, res) => {
  let target = safePath(req.url === '/' ? '/frontend/index.html' : req.url);
  if (!target) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    let info = await stat(target);
    if (info.isDirectory()) {
      target = join(target, 'index.html');
      info = await stat(target);
    }

    res.writeHead(200, {
      'Content-Type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      // No caching: this is a demo, and a stale module is a confusing failure.
      'Cache-Control': 'no-store',
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`AMS UI demo  →  http://localhost:${PORT}/`);
  console.log(`serving ${ROOT}`);
});