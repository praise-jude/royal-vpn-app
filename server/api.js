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
  -- Sales features: invite codes, free trial, agent vouchers.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_code TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
  CREATE UNIQUE INDEX IF NOT EXISTS users_ref_code ON users (ref_code);
  CREATE TABLE IF NOT EXISTS referral_rewards (
    referred_id INTEGER PRIMARY KEY,
    referrer_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS vouchers (
    code TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    days INTEGER NOT NULL,
    batch TEXT NOT NULL,
    agent TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    redeemed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS vouchers_batch ON vouchers (batch);
  CREATE TABLE IF NOT EXISTS webhook_events (
    event_id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WG_PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{42,43}=$/;

function loadPlans(env) {
  const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
  const days = num(env.PLAN_DAYS, 30);
  return {
    free: { id: 'free', name: 'Free', amountNaira: 0, devices: num(env.PLAN_FREE_DEVICES, 1), days: 0 },
    weekly: { id: 'weekly', name: 'Pro Weekly', amountNaira: num(env.PLAN_WEEKLY_NGN, 0), devices: num(env.PLAN_PRO_DEVICES, 3), days: num(env.PLAN_WEEKLY_DAYS, 7) },
    pro: { id: 'pro', name: 'Pro', amountNaira: num(env.PLAN_PRO_NGN, 0), devices: num(env.PLAN_PRO_DEVICES, 3), days },
    family: { id: 'family', name: 'Family', amountNaira: num(env.PLAN_FAMILY_NGN, 0), devices: num(env.PLAN_FAMILY_DEVICES, 6), days },
    vip: { id: 'vip', name: 'VIP', amountNaira: num(env.PLAN_VIP_NGN, 0), devices: num(env.PLAN_VIP_DEVICES, 10), days },
  };
}

// Codes people type or read out over the phone: no 0/O/1/I.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(n) {
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}
const fmtVoucher = (c) => `${c.slice(0, 2)}-${c.slice(2, 6)}-${c.slice(6)}`;
const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

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
  const admins = new Set((env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  const TRIAL_DAYS = Number(env.TRIAL_DAYS || 0);
  const REFERRAL_DAYS = Number(env.REFERRAL_DAYS || 0);
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
    const forever = grandfathered.has(user.email.toLowerCase());
    const onTrial = !forever && plan.id !== 'free' && Boolean(user.trial_ends_at) && user.plan_expires_at
      && new Date(user.trial_ends_at).getTime() === new Date(user.plan_expires_at).getTime();
    return {
      email: user.email,
      planId: plan.id,
      planName: plan.name,
      planExpiresAt: plan.id === 'free' || forever ? null : user.plan_expires_at,
      deviceLimit: plan.devices,
      lifetime: forever,
      trial: Boolean(onTrial),
      isAdmin: admins.has(user.email.toLowerCase()),
    };
  }

  // Gives a user time on a plan. 'replace' (payments, vouchers): the same plan is extended from its current end,
  // any other plan starts now. 'bonus' (invite rewards): days are added to the current paid plan, or Pro if on Free.
  async function applyPlan(userId, planId, days, mode = 'replace') {
    const { rows: [u] } = await db.query('SELECT plan_id, plan_expires_at FROM users WHERE id = $1', [userId]);
    if (!u) return null;
    const active = u.plan_id !== 'free' && u.plan_expires_at && new Date(u.plan_expires_at) > new Date();
    let keep = planId;
    let from = new Date();
    if (mode === 'bonus') { if (active) { keep = u.plan_id; from = new Date(u.plan_expires_at); } }
    else if (active && u.plan_id === planId) from = new Date(u.plan_expires_at);
    const until = new Date(from.getTime() + days * 86400000);
    await db.query('UPDATE users SET plan_id = $1, plan_expires_at = $2 WHERE id = $3', [keep, until, userId]);
    return { planId: keep, until };
  }

  async function ensureRefCode(userId) {
    for (let i = 0; i < 5; i++) {
      const { rows } = await db.query('UPDATE users SET ref_code = COALESCE(ref_code, $1) WHERE id = $2 RETURNING ref_code', [randomCode(6), userId]).catch(() => ({ rows: [] }));
      if (rows[0]) return rows[0].ref_code;
    }
    throw new Error('could not make an invite code');
  }
  const USER_COLS = 'id, email, plan_id, plan_expires_at, trial_ends_at, ref_code, referred_by';

  const signToken = (user) => jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });

  async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    try {
      const { uid } = jwt.verify(token, JWT_SECRET);
      const { rows } = await db.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [uid]);
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
    const ref = cleanCode(req.body?.refCode);
    let referrer = null;
    if (ref) {
      const r = await db.query('SELECT id FROM users WHERE ref_code = $1', [ref]);
      if (!r.rows[0]) return res.status(400).json({ error: 'That invite code is not valid. Check it, or leave it empty.' });
      referrer = r.rows[0].id;
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash, referred_by) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id',
      [email, hash, referrer]
    );
    if (!rows[0]) return res.status(409).json({ error: 'An account with that email already exists.' });
    // New accounts start with a free Pro trial (TRIAL_DAYS; 0 turns it off).
    if (TRIAL_DAYS > 0) {
      await db.query("UPDATE users SET plan_id = 'pro', trial_ends_at = now() + make_interval(days => $2::int) WHERE id = $1", [rows[0].id, TRIAL_DAYS]);
      await db.query('UPDATE users SET plan_expires_at = trial_ends_at WHERE id = $1', [rows[0].id]);
    }
    await ensureRefCode(rows[0].id);
    const u = await db.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [rows[0].id]);
    res.json({ token: signToken(u.rows[0]), user: publicUser(u.rows[0]) });
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
      currency: 'NGN', days: PLAN_DAYS, paymentsEnabled: Boolean(pay), trialDays: TRIAL_DAYS, referralDays: REFERRAL_DAYS,
      plans: Object.values(PLANS).filter((p) => p.id === 'free' || p.amountNaira > 0).map((p) => ({ id: p.id, name: p.name, amountNaira: p.amountNaira, devices: p.devices, days: p.days })),
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

  // First payment by an invited user: both get REFERRAL_DAYS free, once per invited user.
  async function rewardReferral(userId) {
    if (!REFERRAL_DAYS) return;
    const { rows: [u] } = await db.query('SELECT referred_by FROM users WHERE id = $1', [userId]);
    if (!u?.referred_by) return;
    const fresh = await db.query('INSERT INTO referral_rewards (referred_id, referrer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING referred_id', [userId, u.referred_by]);
    if (!fresh.rows[0]) return;
    await applyPlan(u.referred_by, 'pro', REFERRAL_DAYS, 'bonus');
    await applyPlan(userId, 'pro', REFERRAL_DAYS, 'bonus');
  }

  // ---------- invite friends ----------
  api.get('/referral', requireAuth, async (req, res) => {
    const code = await ensureRefCode(req.user.id);
    const { rows: [n] } = await db.query(
      'SELECT (SELECT count(*)::int FROM users WHERE referred_by = $1) AS joined, (SELECT count(*)::int FROM referral_rewards WHERE referrer_id = $1) AS paid', [req.user.id]);
    res.json({ code, link: `${PUBLIC_URL}/?ref=${code}`, days: REFERRAL_DAYS, joined: n.joined, paid: n.paid });
  });

  // ---------- vouchers (sold by you or your agents) ----------
  const voucherLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
  api.post('/vouchers/redeem', requireAuth, voucherLimit, async (req, res) => {
    if (grandfathered.has(req.user.email.toLowerCase())) return res.status(400).json({ error: 'This account already has lifetime VIP — give the code to someone else.' });
    const code = cleanCode(req.body?.code);
    if (code.length < 8) return res.status(400).json({ error: 'Enter the voucher code exactly as written.' });
    const { rows } = await db.query(
      'UPDATE vouchers SET redeemed_by = $1, redeemed_at = now() WHERE code = $2 AND redeemed_at IS NULL RETURNING plan_id, days', [req.user.id, code]);
    if (!rows[0]) {
      const used = await db.query('SELECT 1 FROM vouchers WHERE code = $1', [code]);
      return res.status(400).json({ error: used.rows[0] ? 'This voucher has already been used.' : 'That voucher code is not valid.' });
    }
    await db.query('UPDATE users SET trial_ends_at = NULL WHERE id = $1', [req.user.id]);
    await applyPlan(req.user.id, rows[0].plan_id, rows[0].days);
    const u = await db.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.user.id]);
    res.json({ ok: true, user: publicUser(u.rows[0]), days: rows[0].days, planName: PLANS[rows[0].plan_id]?.name || rows[0].plan_id });
  });

  // ---------- admin (ADMIN_EMAILS): voucher batches for agents, sales numbers ----------
  function requireAdmin(req, res, next) {
    if (!admins.has(req.user.email.toLowerCase())) return res.status(403).json({ error: 'Admins only.' });
    next();
  }
  api.post('/admin/vouchers', requireAuth, requireAdmin, async (req, res) => {
    const plan = PLANS[req.body?.planId];
    if (!plan || plan.id === 'free') return res.status(400).json({ error: 'Choose a paid plan.' });
    const days = Number(req.body?.days || plan.days);
    const count = Number(req.body?.count || 1);
    if (!Number.isInteger(days) || days < 1 || days > 366) return res.status(400).json({ error: 'Days must be 1–366.' });
    if (!Number.isInteger(count) || count < 1 || count > 500) return res.status(400).json({ error: 'Make 1–500 codes at a time.' });
    const agent = String(req.body?.agent || '').trim().slice(0, 60) || null;
    const batch = `${new Date().toISOString().slice(0, 10)}-${randomCode(4)}`;
    const codes = [];
    while (codes.length < count) {
      const code = `RV${randomCode(8)}`;
      const r = await db.query('INSERT INTO vouchers (code, plan_id, days, batch, agent, created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING code',
        [code, plan.id, days, batch, agent, req.user.email]);
      if (r.rows[0]) codes.push(code);
    }
    res.json({ batch, planName: plan.name, days, agent, codes: codes.map(fmtVoucher) });
  });
  api.get('/admin/vouchers', requireAuth, requireAdmin, async (_req, res) => {
    const { rows } = await db.query(
      `SELECT batch, plan_id, days, agent, min(created_at) AS created_at, count(*)::int AS total, count(redeemed_at)::int AS used
       FROM vouchers GROUP BY batch, plan_id, days, agent ORDER BY min(created_at) DESC LIMIT 100`);
    res.json({ batches: rows.map((b) => ({ batch: b.batch, planName: PLANS[b.plan_id]?.name || b.plan_id, days: b.days, agent: b.agent, createdAt: b.created_at, total: b.total, used: b.used })) });
  });
  api.get('/admin/vouchers/:batch', requireAuth, requireAdmin, async (req, res) => {
    const { rows } = await db.query(
      'SELECT v.code, v.redeemed_at, u.email FROM vouchers v LEFT JOIN users u ON u.id = v.redeemed_by WHERE v.batch = $1 ORDER BY v.code', [String(req.params.batch)]);
    res.json({ codes: rows.map((r) => ({ code: fmtVoucher(r.code), usedAt: r.redeemed_at, usedBy: r.email || null })) });
  });
  api.get('/admin/stats', requireAuth, requireAdmin, async (_req, res) => {
    const { rows: [s] } = await db.query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM users WHERE created_at > now() - interval '7 days') AS new_week,
      (SELECT count(*)::int FROM users WHERE plan_id <> 'free' AND plan_expires_at > now() AND trial_ends_at IS NULL) AS paying,
      (SELECT count(*)::int FROM users WHERE trial_ends_at > now() AND plan_expires_at = trial_ends_at) AS on_trial,
      (SELECT coalesce(sum(amount_kobo), 0)::bigint FROM payments WHERE status = 'paid' AND paid_at > now() - interval '30 days') AS revenue_kobo,
      (SELECT count(*)::int FROM vouchers WHERE redeemed_at > now() - interval '30 days') AS vouchers_used,
      (SELECT count(*)::int FROM referral_rewards) AS referrals_paid`);
    res.json({ users: s.users, newThisWeek: s.new_week, paying: s.paying, onTrial: s.on_trial, revenue30dNaira: Number(s.revenue_kobo) / 100, vouchersUsed30d: s.vouchers_used, referralsPaid: s.referrals_paid });
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
    // A renewal of the same plan extends from the current expiry; a new plan starts now. Paying ends a trial.
    await db.query('UPDATE users SET trial_ends_at = NULL WHERE id = $1', [p.user_id]);
    await applyPlan(p.user_id, p.plan_id, PLANS[p.plan_id]?.days || PLAN_DAYS);
    await rewardReferral(p.user_id);
    return { paid: true, planId: p.plan_id };
  }

  api.get('/payments/verify/:reference', requireAuth, async (req, res) => {
    if (!pay) return res.status(503).json({ error: 'Payments are not set up yet.' });
    const { rows } = await db.query('SELECT user_id FROM payments WHERE reference = $1', [req.params.reference]);
    if (!rows[0] || rows[0].user_id !== req.user.id) return res.status(404).json({ error: 'Payment not found.' });
    try {
      const r = await confirm(req.params.reference);
      if (r.error) return res.status(409).json({ error: 'This payment could not be confirmed. Contact support.' });
      const u = await db.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.user.id]);
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
