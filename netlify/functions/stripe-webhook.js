// Stripe webhook: keeps the subscriptions table in sync with Stripe.
// Records who is an active Cana member so the platform can honour
// unlimited bidding. Signature-verified with STRIPE_WEBHOOK_SECRET.

const crypto = require('crypto');

function verifySignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  sigHeader.split(',').forEach(p => { const [k, v] = p.split('='); parts[k] = v; });
  if (!parts.t || !parts.v1) return false;
  // Reject events older than 5 minutes (replay protection)
  if (Math.abs(Date.now() / 1000 - parseInt(parts.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(parts.t + '.' + payload, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts.v1, 'hex'));
  } catch (e) { return false; }
}

exports.handler = async (event) => {
  const sbKey = process.env.SUPABASE_ANON_KEY;
  const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  if (!verifySignature(rawBody, sig, whSecret)) {
    console.log('Webhook signature verification FAILED');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  async function upsertSub(row) {
    const res = await fetch(sbUrl + '/rest/v1/subscriptions?on_conflict=id', {
      method: 'POST',
      headers: {
        apikey: sbKey, Authorization: 'Bearer ' + sbKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(Object.assign({ updated_at: new Date().toISOString() }, row))
    });
    if (!res.ok) console.log('Subscription upsert failed:', res.status, (await res.text()).substring(0, 200));
    else console.log('Subscription upserted:', row.id, row.status);
  }

  async function fetchSubscription(subId) {
    const r = await fetch('https://api.stripe.com/v1/subscriptions/' + subId, {
      headers: { Authorization: 'Bearer ' + stripeKey }
    });
    return r.ok ? r.json() : null;
  }

  try {
    const evt = JSON.parse(rawBody);
    const type = evt.type;
    const obj = evt.data && evt.data.object;
    console.log('Webhook event:', type);

    if (type === 'checkout.session.completed' && obj && obj.mode === 'subscription') {
      const email = (obj.customer_details && obj.customer_details.email) || obj.customer_email || '';
      const subId = obj.subscription;
      let periodEnd = null, status = 'active', term = parseInt(obj.metadata && obj.metadata.term_months) || null;
      if (subId) {
        const sub = await fetchSubscription(subId);
        if (sub) {
          periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
          status = sub.status || 'active';
        }
      }
      await upsertSub({
        id: subId || ('cs_' + obj.id),
        email: email.toLowerCase(),
        product: (obj.metadata && obj.metadata.product) || 'membership',
        term_months: term,
        status: status,
        current_period_end: periodEnd
      });
    }

    if (type === 'customer.subscription.updated' && obj) {
      await upsertSub({
        id: obj.id,
        status: obj.status,
        current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null
      });
    }

    if (type === 'customer.subscription.deleted' && obj) {
      await upsertSub({ id: obj.id, status: 'cancelled' });
    }

    if ((type === 'invoice.paid' || type === 'invoice.payment_succeeded') && obj && obj.subscription) {
      const sub = await fetchSubscription(obj.subscription);
      if (sub) {
        await upsertSub({
          id: sub.id,
          status: sub.status,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
        });
      }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.log('Webhook handler error:', err.message);
    return { statusCode: 500, body: 'Webhook error' };
  }
};
