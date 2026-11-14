// Serves the exported web app (dist/) for Royalman Cloud hosting.
// The platform sets PORT and HOST and checks GET /health.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'dist');
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function send(res, status, body, type, cache) {
  res.writeHead(status, {
    'Content-Type': type, 'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(body);
}

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'Bad request', 'text/plain', 'no-store'); }
  if (urlPath === '/health') return send(res, 200, 'ok', 'text/plain', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain', 'no-store');

  // The build renames assets/node_modules to assets/vendor; keep the old URLs working.
  urlPath = urlPath.replace(/^\/assets\/node_modules\//, '/assets/vendor/');
  const file = path.join(root, path.normalize(urlPath));
  if (!file.startsWith(root)) return send(res, 403, 'Forbidden', 'text/plain', 'no-store');

  fs.stat(file, (err, st) => {
    const target = !err && st.isFile() ? file : path.join(root, 'index.html'); // single-page app fallback
    fs.readFile(target, (e, data) => {
      if (e) return send(res, 404, 'Not found', 'text/plain', 'no-store');
      const ext = path.extname(target);
      const hashed = target.split(path.sep).some((part) => part === '_expo' || part === 'assets');
      send(res, 200, req.method === 'HEAD' ? undefined : data, types[ext] || 'application/octet-stream',
        ext === '.html' ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
    });
  });
}).listen(port, host, () => console.log(`Royal-VPN web listening on http://${host}:${port}`));
