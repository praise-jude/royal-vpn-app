// Royal-VPN on Royalman Cloud: serves the web app (dist/) and the API (/api) from one process.
// The platform sets PORT, HOST and DATABASE_URL, and checks GET /health.
const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const { createApi } = require('./server/api');
const { loadSettings, KEYS } = require('./server/settings');

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

// The API comes up once settings load from the database (server/settings.js); until then, and if the
// database is unreachable, /api answers 503 and the web app keeps working. Settings are re-read every
// minute, so a setting added in the database takes effect without a restart.
let api = null;
let apiKey = '';
const db = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }) : null;
if (db) db.on('error', (e) => console.error('database error:', e.message));
else console.warn('DATABASE_URL is not set: the API is off, only the web app is served.');

async function refreshApi() {
  if (!db) return;
  try {
    const env = await loadSettings(db);
    const key = crypto.createHash('sha256').update(JSON.stringify(KEYS.map((k) => env[k] ?? null))).digest('hex');
    if (key === apiKey) return;
    api = createApi({ db, env });
    apiKey = key;
    let exits = 0;
    try { exits = JSON.parse(env.REAL_SERVERS || '[]').length; } catch { /* reported by the API */ }
    console.log(`API ready (${exits} exit servers, payments ${env.KORAPAY_SECRET_KEY ? 'on' : 'off'})`);
  } catch (e) {
    console.error(`API not ready: ${e.message}`);
  }
}
refreshApi();
setInterval(refreshApi, 60000).unref();

app.use('/api', (req, res, next) => (api ? api(req, res, next) : res.status(503).json({ error: 'The service is starting up. Try again shortly.' })));

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
