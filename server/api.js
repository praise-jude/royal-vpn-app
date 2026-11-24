// Royal-VPN API, mounted at /api by server.js.
// Accounts, plans (Korapay), the server list, WireGuard device registration and device limits.
// Prices and plan limits live here on the server; the app only ever sends a plan id.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { korapay } = require('./korapay');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan_id TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
  CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'unknown',
    wg_public_key TEXT NOT NULL,
    server_id TEXT,
    client_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX IF NOT EXISTS devices_active_key ON devices (wg_public_key) WHERE revoked_at IS NULL;
  CREATE TABLE IF NOT EXISTS payments (
    reference TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    provider_txn_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS webhook_events (
    event_id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WG_PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{42,43}=$/;

function loadPlans(env) {
  const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
  return {
    free: { id: 'free', name: 'Free', amountNaira: 0, devices: num(env.PLAN_FREE_DEVICES, 1) },
    pro: { id: 'pro', name: 'Pro', amountNaira: num(env.PLAN_PRO_NGN, 0), devices: num(env.PLAN_PRO_DEVICES, 3) },
    family: { id: 'family', name: 'Family', amountNaira: num(env.PLAN_FAMILY_NGN, 0), devices: num(env.PLAN_FAMILY_DEVICES, 6) },
    vip: { id: 'vip', name: 'VIP', amountNaira: num(env.PLAN_VIP_NGN, 0), devices: num(env.PLAN_VIP_DEVICES, 10) },
  };
}

function loadServers(env) {
  try {
    const list = JSON.parse(env.REAL_SERVERS || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('REAL_SERVERS is not valid JSON:', e.message);
    return [];
  }
}

// Locations shown as "coming soon" until a real exit server exists for them.
const PLANNED_LOCATIONS = [
  { id: 'lag1', city: 'Lagos', country: 'Nigeria', flag: '🇳🇬' },
  { id: 'sin1', city: 'Singapore', country: 'Singapore', flag: '🇸🇬' },
  { id: 'syd1', city: 'Sydney', country: 'Australia', flag: '🇦🇺' },
];

// Small fixed-window limiter, per IP and route, to slow down password guessing.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}|${req.path}`;
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) hits.set(key, { start: now, n: 1 });
    else if (++h.n > max) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    if (hits.size > 10000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    next();
  };
}

const defaultLookup = (host) => require('dns').promises.lookup(host, { all: true });

function createApi({ db, env = process.env, fetchImpl = fetch, payments, dnsLookup = defaultLookup } = {}) {
  const JWT_SECRET = env.JWT_SECRET;
  if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set (32+ characters)');
  const PLANS = loadPlans(env);
  const SERVERS = loadServers(env);
  const PLAN_DAYS = Number(env.PLAN_DAYS || 30);
  const PUBLIC_URL = (env.PUBLIC_URL || 'https://vpn.royalmancloud.com').replace(/\/$/, '');
  const grandfathered = new Set((env.GRANDFATHERED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  const pay = payments !== undefined ? payments
    : env.KORAPAY_SECRET_KEY ? korapay({ secretKey: env.KORAPAY_SECRET_KEY, notificationUrl: `${PUBLIC_URL}/api/payments/korapay/webhook`, fetchImpl })
    : null;

  const ready = db.exec ? db.exec(SCHEMA) : db.query(SCHEMA);
  const api = express.Router();
  api.use(async (_req, _res, next) => { try { await ready; next(); } catch (e) { next(e); } });

  // Webhook signature covers JSON.stringify(body.data), so parse JSON for it too.
  api.use(express.json({ limit: '64kb' }));

  function effectivePlan(user) {
    if (grandfathered.has(user.email.toLowerCase())) return PLANS.vip;
    const expired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date();
    return (!expired && PLANS[user.plan_id]) || PLANS.free;
  }

  function publicUser(user) {
    const plan = effectivePlan(user);
    return {
      email: user.email,
      planId: plan.id,
      planName: plan.name,
      planExpiresAt: plan.id === 'free' || grandfathered.has(user.email.toLowerCase()) ? null : user.plan_expires_at,
      deviceLimit: plan.devices,
    };
  }

  const signToken = (user) => jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });

  async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    try {
      const { uid } = jwt.verify(token, JWT_SECRET);
      const { rows } = await db.query('SELECT id, email, plan_id, plan_expires_at FROM users WHERE id = $1', [uid]);
      if (!rows[0]) return res.status(401).json({ error: 'Please sign in.' });
      req.user = rows[0];
      next();
    } catch {
      res.status(401).json({ error: 'Please sign in.' });
    }
  }

  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

  api.get('/health', (_req, res) => res.json({ ok: true }));

  // ---------- accounts ----------
  api.post('/auth/signup', authLimit, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id, email, plan_id, plan_expires_at',
      [email, hash]
    );
    if (!rows[0]) return res.status(409).json({ error: 'An account with that email already exists.' });
    res.json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
  });

  api.post('/auth/login', authLimit, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  api.get('/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  api.post('/auth/change-password', requireAuth, authLimit, async (req, res) => {
    const current = String(req.body?.currentPassword || '');
    const next = String(req.body?.newPassword || '');
    if (next.length < 8 || next.length > 200) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(current, rows[0].password_hash))) return res.status(401).json({ error: 'Your current password is incorrect.' });
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(next, 10), req.user.id]);
    res.json({ ok: true });
  });

  // ---------- servers ----------
  async function nodeStatus(srv) {
    try {
      const r = await fetchImpl(`http://${srv.statusHost}:${srv.statusPort || 8081}/status`, {
        headers: { 'x-royal-status-key': srv.statusKey }, signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  let serverCache = { at: 0, list: null };
  api.get('/servers', async (_req, res) => {
    if (!serverCache.list || Date.now() - serverCache.at > 15000) {
      const live = await Promise.all(SERVERS.map(async (srv) => {
        const s = await nodeStatus(srv);
        return {
          id: srv.id, city: srv.city, country: srv.country, flag: srv.flag, vip: Boolean(srv.vip), live: true,
          status: s ? 'AVAILABLE' : 'OFFLINE',
          // pingMs stays null: the API's round trip to a server says nothing about the customer's latency.
          // The app measures real latency itself once connected. Kept for older app builds.
          pingMs: null, loadPct: s ? s.memUsedPct ?? null : null, activeUsers: s ? s.wgActivePeers ?? null : null,
        };
      }));
      const taken = new Set(SERVERS.map((s) => s.id));
      const planned = PLANNED_LOCATIONS.filter((l) => !taken.has(l.id)).map((l) => ({
        ...l, vip: false, live: false, status: 'COMING SOON', pingMs: null, loadPct: null, activeUsers: null,
      }));
      serverCache = { at: Date.now(), list: [...live, ...planned] };
    }
    res.json({ servers: serverCache.list });
  });

  // ---------- leak test ----------
  // Where the visitor's traffic appears to come from, and whether that's one of our exit servers.
  // Exit IPs come from each server's optional `exitIps`, else its wgHost resolved (cached 10 minutes).
  let exitCache = { at: 0, ips: new Map() };
  async function exitIps() {
    if (Date.now() - exitCache.at < 600000) return exitCache.ips;
    const ips = new Map();
    await Promise.all(SERVERS.map(async (srv) => {
      const list = Array.isArray(srv.exitIps) ? srv.exitIps : [];
      for (const ip of list) ips.set(ip, srv.id);
      if (!list.length && srv.wgHost) {
        try {
          for (const a of await dnsLookup(srv.wgHost)) ips.set(a.address, srv.id);
        } catch { /* unresolvable host: skip */ }
      }
    }));
    exitCache = { at: Date.now(), ips };
    return ips;
  }

  api.get('/ip', async (req, res) => {
    // Cloudflare puts the real visitor address here; behind it req.ip is Cloudflare's edge.
    const ip = String(req.headers['cf-connecting-ip'] || req.ip || '').replace(/^::ffff:/, '');
    const serverId = (await exitIps()).get(ip) || null;
    const srv = SERVERS.find((s) => s.id === serverId);
    res.set('Cache-Control', 'no-store').json({
      ip, country: req.headers['cf-ipcountry'] || null, protected: Boolean(serverId),
      server: srv ? { id: srv.id, city: srv.city, country: srv.country } : null,
    });
  });

  // ---------- devices + WireGuard ----------
  api.post('/vpn/server-config', requireAuth, async (req, res) => {
    const publicKey = req.body?.publicKey;
    const serverId = String(req.body?.serverId || '');
    const name = String(req.body?.deviceName || 'My device').slice(0, 60);
    const platform = ['android', 'ios', 'web', 'windows', 'macos'].includes(req.body?.platform) ? req.body.platform : 'unknown';
    if (typeof publicKey !== 'string' || !WG_PUBLIC_KEY_RE.test(publicKey)) return res.status(400).json({ error: 'A valid WireGuard public key is required.' });
    const srv = SERVERS.find((s) => s.id === serverId);
    if (!srv) return res.status(404).json({ error: 'That server is not available.' });
    const plan = effectivePlan(req.user);
    if (srv.vip && plan.id === 'free') return res.status(403).json({ error: 'This location needs a paid plan.', upgrade: true });

    const existing = await db.query('SELECT id, user_id FROM devices WHERE wg_public_key = $1 AND revoked_at IS NULL', [publicKey]);
    if (existing.rows[0] && existing.rows[0].user_id !== req.user.id) return res.status(409).json({ error: 'This device key belongs to another account.' });
    if (!existing.rows[0]) {
      const { rows } = await db.query('SELECT count(*)::int AS n FROM devices WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
      if (rows[0].n >= plan.devices) {
        return res.status(403).json({ error: `Your ${plan.name} plan allows ${plan.devices} device${plan.devices === 1 ? '' : 's'}. Sign out another device or upgrade.`, upgrade: true });
      }
    }

    let address;
    try {
      const r = await fetchImpl(`http://${srv.statusHost}:${srv.statusPort || 8081}/peer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-royal-status-key': srv.statusKey },
        body: JSON.stringify({ publicKey }), signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return res.status(502).json({ error: 'Could not register this device with that server.' });
      ({ address } = await r.json());
    } catch {
      return res.status(502).json({ error: 'Could not reach that server.' });
    }

    const clientAddress = `${address}/32`;
    if (existing.rows[0]) {
      await db.query('UPDATE devices SET server_id = $1, client_address = $2, name = $3, platform = $4, last_seen_at = now() WHERE id = $5',
        [srv.id, clientAddress, name, platform, existing.rows[0].id]);
    } else {
      await db.query('INSERT INTO devices (user_id, name, platform, wg_public_key, server_id, client_address) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.user.id, name, platform, publicKey, srv.id, clientAddress]);
    }
    res.json({
      endpoint: `${srv.wgHost}:${srv.wgPort || 51820}`,
      serverPublicKey: srv.wgPublicKey,
      clientAddress,
      dns: srv.dns || '1.1.1.1',
      blockingDns: srv.blockingDns || null,
    });
  });

  api.get('/devices', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      'SELECT id, name, platform, server_id, created_at, last_seen_at, wg_public_key FROM devices WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC',
      [req.user.id]
    );
    const mine = String(req.query.publicKey || '');
    res.json({
      deviceLimit: effectivePlan(req.user).devices,
      devices: rows.map((d) => ({
        id: d.id, name: d.name, platform: d.platform, serverId: d.server_id,
        createdAt: d.created_at, lastSeenAt: d.last_seen_at, thisDevice: Boolean(mine) && d.wg_public_key === mine,
      })),
    });
  });

  // Revoke: the device stops counting against the plan at once, and each exit server is asked to drop the peer.
  // Removes a device's WireGuard key from every exit server; returns how many servers confirmed.
  async function removePeer(publicKey) {
    const results = await Promise.all(SERVERS.map(async (srv) => {
      try {
        const r = await fetchImpl(`http://${srv.statusHost}:${srv.statusPort || 8081}/peer`, {
          method: 'DELETE', headers: { 'content-type': 'application/json', 'x-royal-status-key': srv.statusKey },
          body: JSON.stringify({ publicKey }), signal: AbortSignal.timeout(6000),
        });
        return r.ok;
      } catch { return false; }
    }));
    return results.filter(Boolean).length;
  }

  api.delete('/devices/:id', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      'UPDATE devices SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING wg_public_key',
      [Number(req.params.id) || 0, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Device not found.' });
    res.json({ ok: true, removedFromServers: await removePeer(rows[0].wg_public_key), servers: SERVERS.length });
  });

  // Account deletion (Google Play requires it in the app): password-confirmed; every device is cut off the
  // exit servers, then the account, its devices and its payment rows are erased.
  api.post('/auth/delete-account', requireAuth, authLimit, async (req, res) => {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(String(req.body?.password || ''), rows[0].password_hash))) return res.status(401).json({ error: 'Your password is incorrect.' });
    const { rows: devs } = await db.query('SELECT wg_public_key FROM devices WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
    for (const d of devs) await removePeer(d.wg_public_key);
    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  });

  // ---------- plans + Korapay ----------
  api.get('/plans', (_req, res) => {
    res.json({
      currency: 'NGN', days: PLAN_DAYS, paymentsEnabled: Boolean(pay),
      plans: Object.values(PLANS).map((p) => ({ id: p.id, name: p.name, amountNaira: p.amountNaira, devices: p.devices })),
    });
  });

  api.post('/payments/initialize', requireAuth, async (req, res) => {
    if (!pay) return res.status(503).json({ error: 'Payments are not set up yet.' });
    if (grandfathered.has(req.user.email.toLowerCase())) return res.status(400).json({ error: 'This account already has full VIP access.' });
    const plan = PLANS[req.body?.planId];
    if (!plan || plan.id === 'free' || !plan.amountNaira) return res.status(400).json({ error: 'Choose a valid plan.' });
    const reference = `rvpn-${req.user.id}-${crypto.randomBytes(8).toString('hex')}`;
    const amountKobo = Math.round(plan.amountNaira * 100);
    await db.query('INSERT INTO payments (reference, user_id, plan_id, amount_kobo) VALUES ($1,$2,$3,$4)', [reference, req.user.id, plan.id, amountKobo]);
    try {
      const { checkoutUrl } = await pay.initialize({
        email: req.user.email, amountKobo, reference,
        callbackUrl: `${PUBLIC_URL}/payment-complete?reference=${encodeURIComponent(reference)}`,
        metadata: { plan: plan.id },
      });
      res.json({ checkoutUrl, reference });
    } catch (e) {
      await db.query("UPDATE payments SET status = 'failed' WHERE reference = $1", [reference]);
      res.status(502).json({ error: 'Could not start the payment. Please try again.' });
    }
  });

  // Marks a payment paid only after Korapay itself confirms the exact amount and currency.
  async function confirm(reference) {
    const { rows } = await db.query('SELECT * FROM payments WHERE reference = $1', [reference]);
    const p = rows[0];
    if (!p) return { error: 'unknown payment' };
    if (p.status === 'paid') return { paid: true, planId: p.plan_id, duplicate: true };
    const v = await pay.verify(reference);
    if (!v.paid) return { paid: false };
    if (v.currency !== 'NGN' || v.amountKobo !== p.amount_kobo) {
      await db.query("UPDATE payments SET status = 'amount_mismatch' WHERE reference = $1", [reference]);
      return { error: 'amount mismatch' };
    }
    const done = await db.query(
      "UPDATE payments SET status = 'paid', paid_at = now(), provider_txn_id = $2 WHERE reference = $1 AND status <> 'paid' RETURNING user_id, plan_id",
      [reference, v.providerTxnId]
    );
    if (!done.rows[0]) return { paid: true, planId: p.plan_id, duplicate: true };
    // A renewal of the same plan extends from the current expiry; a new plan starts now.
    await db.query(
      `UPDATE users SET plan_id = $1,
         plan_expires_at = (CASE WHEN plan_id = $1 AND plan_expires_at > now() THEN plan_expires_at ELSE now() END) + make_interval(days => $3::int)
       WHERE id = $2`,
      [p.plan_id, p.user_id, PLAN_DAYS]
    );
    return { paid: true, planId: p.plan_id };
  }

  api.get('/payments/verify/:reference', requireAuth, async (req, res) => {
    if (!pay) return res.status(503).json({ error: 'Payments are not set up yet.' });
    const { rows } = await db.query('SELECT user_id FROM payments WHERE reference = $1', [req.params.reference]);
    if (!rows[0] || rows[0].user_id !== req.user.id) return res.status(404).json({ error: 'Payment not found.' });
    try {
      const r = await confirm(req.params.reference);
      if (r.error) return res.status(409).json({ error: 'This payment could not be confirmed. Contact support.' });
      const u = await db.query('SELECT id, email, plan_id, plan_expires_at FROM users WHERE id = $1', [req.user.id]);
      res.json({ paid: r.paid, user: publicUser(u.rows[0]) });
    } catch {
      res.status(502).json({ error: 'Could not reach the payment provider. Try again shortly.' });
    }
  });

  // Korapay webhook: signature-checked, processed once, and the amount is always re-verified with Korapay.
  api.post('/payments/korapay/webhook', async (req, res) => {
    if (!pay) return res.status(503).json({ error: 'payments not configured' });
    if (!pay.verifyWebhook(req.headers['x-korapay-signature'], req.body)) return res.status(401).json({ error: 'bad signature' });
    const { event, data = {} } = req.body || {};
    if (event !== 'charge.success' || !data.reference) return res.json({ ignored: true });
    const eventId = `${event}:${data.reference}`;
    const fresh = await db.query('INSERT INTO webhook_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id', [eventId]);
    if (!fresh.rows[0]) return res.json({ duplicate: true });
    try {
      const r = await confirm(String(data.reference));
      if (!r.paid && !r.error) throw new Error('not confirmed yet');
      res.json({ ok: !r.error });
    } catch {
      // Not confirmed yet (or Korapay unreachable): forget this delivery so Korapay's retry is processed.
      await db.query('DELETE FROM webhook_events WHERE event_id = $1', [eventId]);
      res.status(503).json({ retry: true });
    }
  });

  api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  api.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error('API error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return api;
}

module.exports = { createApi, loadPlans };
