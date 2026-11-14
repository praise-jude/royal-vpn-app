// Local preview: the real app + API on an in-memory database, with one fake exit server.
// Run `npm run build:web` first, then `npm run dev:server` and open http://localhost:3000.
// Payments run in a fake mode: checkout goes straight back as paid.
const path = require('path');
const http = require('http');
const express = require('express');
const { createApi } = require('../server/api');

(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();

  // Fake exit server agent (status + peer registration).
  const agent = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/status') return res.end(JSON.stringify({ memUsedPct: 31, wgActivePeers: 4 }));
    if (req.url === '/peer') return res.end(JSON.stringify({ address: '10.66.0.42' }));
    res.statusCode = 404; res.end('{}');
  }).listen(0, '127.0.0.1');
  await new Promise((r) => agent.once('listening', r));
  const agentPort = agent.address().port;

  const paid = new Set();
  const port = Number(process.env.PORT) || 3000;
  const payments = {
    async initialize({ reference, callbackUrl }) {
      paid.add(reference);
      return { checkoutUrl: callbackUrl.replace('https://vpn.royalmancloud.com', `http://localhost:${port}`) };
    },
    async verify(reference) {
      const amountKobo = (await db.query('SELECT amount_kobo FROM payments WHERE reference = $1', [reference])).rows[0]?.amount_kobo;
      return { paid: paid.has(reference), amountKobo, currency: 'NGN', providerTxnId: `dev-${reference}` };
    },
    verifyWebhook() { return false; },
  };

  const node = (id, city, country, flag, extra = {}) => ({
    id, city, country, flag, statusHost: '127.0.0.1', statusPort: agentPort, statusKey: 'dev',
    wgHost: `${id}.example`, wgPublicKey: 'A'.repeat(43) + '=', ...extra,
  });
  const env = {
    JWT_SECRET: 'dev-only-secret-dev-only-secret-dev-only',
    PLAN_PRO_NGN: '6000', PLAN_FAMILY_NGN: '10000', PLAN_VIP_NGN: '20000',
    REAL_SERVERS: JSON.stringify([
      node('pilot-nyc1', 'New York', 'United States', '🇺🇸'),
      node('london', 'London', 'United Kingdom', '🇬🇧'),
      node('frankfurt', 'Frankfurt', 'Germany', '🇩🇪', { vip: true }),
    ]),
  };

  const root = path.join(__dirname, '..', 'dist');
  const app = express();
  app.use('/api', createApi({ db, env, payments }));
  app.use('/assets/node_modules', express.static(path.join(root, 'assets', 'vendor')));
  app.use(express.static(root, { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  app.listen(port, () => console.log(`Royal-VPN dev preview on http://localhost:${port} (in-memory data)`));
})();
