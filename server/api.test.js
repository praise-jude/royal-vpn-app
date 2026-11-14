// API tests against an in-memory Postgres (PGlite). Run: npm run test:api
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const express = require('express');
const { createApi } = require('./api');

const KEY = (n) => crypto.createHash('sha256').update(String(n)).digest('base64'); // 44 chars, valid WG key shape
const SECRET = 'sk_test_royal';

async function setup({ withPayments = true } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const peers = [];
  const fetchImpl = async (url, opts = {}) => {
    if (url.endsWith('/status')) return new Response(JSON.stringify({ memUsedPct: 20, wgActivePeers: 3 }), { status: 200 });
    if (url.endsWith('/peer')) { peers.push([opts.method, JSON.parse(opts.body).publicKey]); return new Response(JSON.stringify({ address: '10.66.0.9' }), { status: 200 }); }
    throw new Error(`unexpected fetch ${url}`);
  };
  const charges = new Map();
  const payments = withPayments ? {
    async initialize({ amountKobo, reference }) { charges.set(reference, { amountKobo, paid: false }); return { checkoutUrl: `https://checkout.test/${reference}` }; },
    async verify(reference) { const c = charges.get(reference); return { paid: !!c?.paid, amountKobo: c?.paidKobo ?? c?.amountKobo, currency: 'NGN', providerTxnId: `tx-${reference}` }; },
    verifyWebhook(sig, body) { return sig === crypto.createHmac('sha256', SECRET).update(JSON.stringify(body?.data ?? null)).digest('hex'); },
  } : null;
  const env = {
    JWT_SECRET: 'x'.repeat(40), PLAN_PRO_NGN: '6000', PLAN_VIP_NGN: '20000', PLAN_FREE_DEVICES: '1',
    REAL_SERVERS: JSON.stringify([
      { id: 'nyc', city: 'New York', country: 'United States', flag: '🇺🇸', statusHost: 'n', statusKey: 'k', wgHost: 'nyc.example', wgPublicKey: KEY('srv') },
      { id: 'vip1', city: 'London', country: 'United Kingdom', flag: '🇬🇧', vip: true, statusHost: 'l', statusKey: 'k', wgHost: 'lon.example', wgPublicKey: KEY('srv2') },
    ]),
    GRANDFATHERED_EMAILS: 'boss@royal.test',
  };
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use('/api', createApi({ db, env, fetchImpl, payments }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body, token, headers = {}) => {
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  return { call, charges, peers, db, close: () => server.close() };
}

test('signup, login, me; bad input and duplicates rejected', async () => {
  const t = await setup();
  try {
    assert.equal((await t.call('POST', '/auth/signup', { email: 'nope', password: 'longenough' })).status, 400);
    assert.equal((await t.call('POST', '/auth/signup', { email: 'a@b.co', password: 'short' })).status, 400);
    const s = await t.call('POST', '/auth/signup', { email: 'Ada@Example.com', password: 'correct-horse' });
    assert.equal(s.status, 200);
    assert.equal(s.body.user.email, 'ada@example.com');
    assert.equal(s.body.user.planId, 'free');
    assert.equal((await t.call('POST', '/auth/signup', { email: 'ada@example.com', password: 'correct-horse' })).status, 409);
    assert.equal((await t.call('POST', '/auth/login', { email: 'ada@example.com', password: 'wrong-password' })).status, 401);
    const l = await t.call('POST', '/auth/login', { email: 'ADA@example.com', password: 'correct-horse' });
    assert.equal(l.status, 200);
    assert.equal((await t.call('GET', '/auth/me', undefined, l.body.token)).body.user.email, 'ada@example.com');
    assert.equal((await t.call('GET', '/auth/me', undefined, 'garbage')).status, 401);
  } finally { t.close(); }
});

test('servers list shows live and coming-soon locations', async () => {
  const t = await setup();
  try {
    const r = await t.call('GET', '/servers');
    const nyc = r.body.servers.find((s) => s.id === 'nyc');
    assert.equal(nyc.status, 'AVAILABLE');
    assert.equal(nyc.activeUsers, 3);
    assert.ok(!('statusKey' in nyc) && !('statusHost' in nyc), 'node secrets must not leak');
    assert.ok(r.body.servers.some((s) => s.status === 'COMING SOON'));
  } finally { t.close(); }
});

test('device limit, VIP-only server, revoke', async () => {
  const t = await setup();
  try {
    const { token } = (await t.call('POST', '/auth/signup', { email: 'f@x.co', password: 'password1' })).body;
    assert.equal((await t.call('POST', '/vpn/server-config', { publicKey: 'bad', serverId: 'nyc' }, token)).status, 400);
    assert.equal((await t.call('POST', '/vpn/server-config', { publicKey: KEY(1), serverId: 'vip1' }, token)).status, 403);
    const ok = await t.call('POST', '/vpn/server-config', { publicKey: KEY(1), serverId: 'nyc', deviceName: 'Pixel', platform: 'android' }, token);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.clientAddress, '10.66.0.9/32');
    assert.equal(ok.body.endpoint, 'nyc.example:51820');
    // same device reconnecting doesn't use another slot
    assert.equal((await t.call('POST', '/vpn/server-config', { publicKey: KEY(1), serverId: 'nyc' }, token)).status, 200);
    const second = await t.call('POST', '/vpn/server-config', { publicKey: KEY(2), serverId: 'nyc' }, token);
    assert.equal(second.status, 403);
    assert.ok(second.body.upgrade);
    // another account can't take over this device's key
    const other = (await t.call('POST', '/auth/signup', { email: 'g@x.co', password: 'password1' })).body.token;
    assert.equal((await t.call('POST', '/vpn/server-config', { publicKey: KEY(1), serverId: 'nyc' }, other)).status, 409);

    const list = await t.call('GET', `/devices?publicKey=${encodeURIComponent(KEY(1))}`, undefined, token);
    assert.equal(list.body.devices.length, 1);
    assert.equal(list.body.devices[0].thisDevice, true);
    assert.equal((await t.call('DELETE', `/devices/${list.body.devices[0].id}`, undefined, other)).status, 404);
    const rev = await t.call('DELETE', `/devices/${list.body.devices[0].id}`, undefined, token);
    assert.equal(rev.status, 200);
    assert.ok(t.peers.some(([m, k]) => m === 'DELETE' && k === KEY(1)));
    assert.equal((await t.call('POST', '/vpn/server-config', { publicKey: KEY(2), serverId: 'nyc' }, token)).status, 200);
  } finally { t.close(); }
});

test('payment: server-side price, verify upgrades, amount mismatch refused', async () => {
  const t = await setup();
  try {
    const { token } = (await t.call('POST', '/auth/signup', { email: 'p@x.co', password: 'password1' })).body;
    assert.equal((await t.call('POST', '/payments/initialize', { planId: 'free' }, token)).status, 400);
    assert.equal((await t.call('POST', '/payments/initialize', { planId: 'family' }, token)).status, 400); // no price set
    const init = await t.call('POST', '/payments/initialize', { planId: 'pro', amountNaira: 1 }, token);
    assert.equal(init.status, 200);
    const ref = init.body.reference;
    assert.equal(t.charges.get(ref).amountKobo, 600000);
    assert.equal((await t.call('GET', `/payments/verify/${ref}`, undefined, token)).body.paid, false);

    t.charges.get(ref).paid = true;
    const v = await t.call('GET', `/payments/verify/${ref}`, undefined, token);
    assert.equal(v.body.paid, true);
    assert.equal(v.body.user.planId, 'pro');
    assert.equal(v.body.user.deviceLimit, 3);
    assert.ok(new Date(v.body.user.planExpiresAt) > new Date(Date.now() + 29 * 864e5));

    // someone else can't look at this payment
    const other = (await t.call('POST', '/auth/signup', { email: 'q@x.co', password: 'password1' })).body.token;
    assert.equal((await t.call('GET', `/payments/verify/${ref}`, undefined, other)).status, 404);

    // a charge paid for less than the price is never accepted
    const cheap = (await t.call('POST', '/payments/initialize', { planId: 'vip' }, other)).body.reference;
    Object.assign(t.charges.get(cheap), { paid: true, paidKobo: 100 });
    assert.equal((await t.call('GET', `/payments/verify/${cheap}`, undefined, other)).status, 409);
    assert.equal((await t.call('GET', '/auth/me', undefined, other)).body.user.planId, 'free');
  } finally { t.close(); }
});

test('webhook: bad signature rejected, valid one upgrades once', async () => {
  const t = await setup();
  try {
    const { token } = (await t.call('POST', '/auth/signup', { email: 'w@x.co', password: 'password1' })).body;
    const ref = (await t.call('POST', '/payments/initialize', { planId: 'vip' }, token)).body.reference;
    const body = { event: 'charge.success', data: { reference: ref, amount: 1 } };
    const sig = crypto.createHmac('sha256', SECRET).update(JSON.stringify(body.data)).digest('hex');
    assert.equal((await t.call('POST', '/payments/korapay/webhook', body, null, { 'x-korapay-signature': 'nope' })).status, 401);
    // not paid yet at Korapay: ask for a retry, and the retry is not dropped as a duplicate
    assert.equal((await t.call('POST', '/payments/korapay/webhook', body, null, { 'x-korapay-signature': sig })).status, 503);
    t.charges.get(ref).paid = true;
    assert.equal((await t.call('POST', '/payments/korapay/webhook', body, null, { 'x-korapay-signature': sig })).status, 200);
    assert.equal((await t.call('POST', '/payments/korapay/webhook', body, null, { 'x-korapay-signature': sig })).body.duplicate, true);
    assert.equal((await t.call('GET', '/auth/me', undefined, token)).body.user.planId, 'vip');
  } finally { t.close(); }
});

test('grandfathered email is VIP; payments off returns 503', async () => {
  const t = await setup({ withPayments: false });
  try {
    const { body } = await t.call('POST', '/auth/signup', { email: 'boss@royal.test', password: 'password1' });
    assert.equal(body.user.planId, 'vip');
    const plans = await t.call('GET', '/plans');
    assert.equal(plans.body.paymentsEnabled, false);
    assert.equal(plans.body.plans.find((p) => p.id === 'pro').amountNaira, 6000);
    const u = (await t.call('POST', '/auth/signup', { email: 'x@y.co', password: 'password1' })).body.token;
    assert.equal((await t.call('POST', '/payments/initialize', { planId: 'pro' }, u)).status, 503);
  } finally { t.close(); }
});
