// Royal-VPN on Royalman Cloud: serves the web app (dist/) and the API (/api) from one process.
// The platform sets PORT, HOST and DATABASE_URL, and checks GET /health.
const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const { createApi } = require('./server/api');

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const root = path.join(__dirname, 'dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // behind the platform's router; req.ip is the visitor's address

app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
  });
  next();
});

app.get('/health', (_req, res) => res.type('text').send('ok'));

// A missing setting turns the API off but keeps the web app up.
let api = null;
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  db.on('error', (e) => console.error('database error:', e.message));
  api = createApi({ db });
} catch (e) {
  console.warn(`API is off (${e.message}); only the web app is served.`);
}
app.use('/api', api || ((_req, res) => res.status(503).json({ error: 'The service is starting up. Try again shortly.' })));

// The build renames assets/node_modules to assets/vendor; keep the old URLs working.
app.use('/assets/node_modules', express.static(path.join(root, 'assets', 'vendor'), { immutable: true, maxAge: '1y' }));
app.use(['/_expo', '/assets'], (req, res, next) => {
  express.static(path.join(root, req.baseUrl.slice(1)), { immutable: true, maxAge: '1y', fallthrough: false })(req, res, next);
});
app.use(express.static(root, { index: false, maxAge: '1h' }));

// Single-page app: every other GET gets index.html.
app.get('*', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(root, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => res.status(err.status || 500).type('text').send(err.status === 404 ? 'Not found' : 'Error'));

app.listen(port, host, () => console.log(`Royal-VPN listening on http://${host}:${port}`));
