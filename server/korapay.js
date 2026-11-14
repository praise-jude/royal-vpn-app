// Korapay checkout (https://developers.korapay.com), following the Royalman Cloud platform's rules:
// we send whole naira, never trust a webhook amount, and confirm every charge with Korapay's API.
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function korapay({ secretKey, notificationUrl, fetchImpl = fetch }) {
  async function call(method, path, body) {
    const r = await fetchImpl(`https://api.korapay.com/merchant/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status === false) throw new Error(`korapay: ${j.message || r.status}`);
    return j.data;
  }
  const toKobo = (v) => Math.round(Number.parseFloat(v ?? 0) * 100);

  return {
    async initialize({ email, amountKobo, reference, callbackUrl, metadata }) {
      if (!Number.isInteger(amountKobo / 100)) throw new Error('korapay: amount must be whole naira');
      const d = await call('POST', '/charges/initialize', {
        amount: amountKobo / 100, currency: 'NGN', reference,
        redirect_url: callbackUrl, notification_url: notificationUrl,
        customer: { email }, metadata,
      });
      return { checkoutUrl: d.checkout_url, reference: d.reference || reference };
    },
    async verify(reference) {
      const d = await call('GET', `/charges/${encodeURIComponent(reference)}`);
      const paid = d.status === 'success';
      return {
        paid,
        amountKobo: paid ? toKobo(d.amount_paid || d.amount) : 0,
        currency: d.currency,
        providerTxnId: String(d.payment_reference || d.reference || reference),
      };
    },
    // Korapay signs JSON.stringify(body.data) with HMAC-SHA256.
    verifyWebhook(signature, body) {
      const want = crypto.createHmac('sha256', secretKey).update(JSON.stringify(body?.data ?? null)).digest('hex');
      return safeEqual(signature || '', want);
    },
  };
}

module.exports = { korapay };
