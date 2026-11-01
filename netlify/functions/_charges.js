// Shared bits for pay-on-account review charges: placeholder prices + the Stripe
// calls to charge a member's saved card off-session (server-side, no Apple/Google
// cut). Prices are PLACEHOLDERS - change REVIEW_PRICES when the real ones are set.

// Pence. PLACEHOLDER values.
const REVIEW_PRICES = { response: 15000, full: 30000 };
const REVIEW_LABEL = { response: 'Response Review', full: 'Full Tender Review' };

function priceFor(type) { return REVIEW_PRICES[type] || 0; }
function labelFor(type) { return REVIEW_LABEL[type] || 'Review'; }

function stripeKey() { return process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key; }

function form(obj) {
  return Object.keys(obj).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
  }).join('&');
}

async function stripeGet(path, key) {
  const r = await fetch('https://api.stripe.com/v1/' + path, { headers: { Authorization: 'Bearer ' + key } });
  return r.ok ? r.json() : null;
}

// Find the member's Stripe customer (by the email they subscribed with) and the
// card Stripe already has on file for their subscription.
async function customerAndCard(email, key) {
  const custs = await stripeGet('customers?email=' + encodeURIComponent(email) + '&limit=1', key);
  const cust = custs && custs.data && custs.data[0];
  if (!cust) return { customer: null, paymentMethod: null };
  let pm = cust.invoice_settings && cust.invoice_settings.default_payment_method;
  if (!pm) {
    const pms = await stripeGet('payment_methods?customer=' + cust.id + '&type=card&limit=1', key);
    pm = pms && pms.data && pms.data[0] && pms.data[0].id;
  }
  return { customer: cust.id, paymentMethod: pm || null };
}

// Charge the saved card now, off-session. Returns {ok, id, status, error}.
async function chargeNow(opts) {
  const body = {
    amount: opts.amount,
    currency: 'gbp',
    customer: opts.customer,
    payment_method: opts.paymentMethod,
    off_session: 'true',
    confirm: 'true',
    description: opts.description || 'Cana review',
  };
  if (opts.metadata) {
    Object.keys(opts.metadata).forEach(function (k) { body['metadata[' + k + ']'] = opts.metadata[k]; });
  }
  const r = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + opts.key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form(body),
  });
  const data = await r.json().catch(function () { return {}; });
  if (!r.ok || (data && data.error)) {
    return { ok: false, id: (data && data.error && data.error.payment_intent && data.error.payment_intent.id) || null, status: 'failed', error: (data && data.error && data.error.message) || 'charge failed' };
  }
  return { ok: data.status === 'succeeded', id: data.id, status: data.status, error: data.status === 'succeeded' ? null : 'not completed' };
}

module.exports = { REVIEW_PRICES, REVIEW_LABEL, priceFor, labelFor, stripeKey, customerAndCard, chargeNow };
