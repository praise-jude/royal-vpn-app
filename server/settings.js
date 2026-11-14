// App settings kept in the app's own database, so the service runs without hand-entered secrets.
// Order: an environment variable always wins; otherwise the app_settings row; otherwise a default.
// JWT_SECRET is generated once on first start and stored here.
const crypto = require('crypto');

const DEFAULTS = {
  PLAN_PRO_NGN: '6000',
  PLAN_FAMILY_NGN: '10000',
  PLAN_VIP_NGN: '20000',
};

// Settings read from the database. Anything else stays env-only.
const KEYS = ['JWT_SECRET', 'REAL_SERVERS', 'GRANDFATHERED_EMAILS', 'KORAPAY_SECRET_KEY', 'PLAN_PRO_NGN', 'PLAN_FAMILY_NGN', 'PLAN_VIP_NGN', 'PLAN_DAYS', 'PUBLIC_URL'];

async function loadSettings(db, env = process.env) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  // Two instances starting together agree on one secret: the first insert wins.
  await db.query('INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', ['JWT_SECRET', crypto.randomBytes(48).toString('hex')]);
  const { rows } = await db.query('SELECT key, value FROM app_settings WHERE key = ANY($1)', [KEYS]);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = { ...env };
  for (const k of KEYS) if (!env[k]) out[k] = stored[k] ?? DEFAULTS[k];
  return out;
}

module.exports = { loadSettings, KEYS };
