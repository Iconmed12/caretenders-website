// Admin-only: retry a FAILED (or still pending) review charge from the Orders
// screen. Re-attempts the off-session charge on the member's saved card. On
// success the row is marked paid and the team is emailed to deliver the review.
// Server-side Stripe, no Apple/Google cut.

const { requireAdmin } = require('./_admin-auth');
const charges = require('./_charges');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

async function email(to, subject, html, replyTo) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@getcana.co.uk';
  const body = { from: 'Cana Bids <' + from + '>', to: to, subject: subject, html: html };
  if (replyTo) body.reply_to = replyTo;
  try { await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) {}
}

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  const denied = await requireAdmin(event, 'admin-retry-review-charge', cors);
  if (denied) return denied;

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const id = String(body.id || '').trim();
  if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing charge id.' }) };

  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sbH = { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json' };

  // Load the charge row.
  let row;
  try {
    const r = await fetch(SB_URL + '/rest/v1/review_charges?id=eq.' + encodeURIComponent(id) + '&select=*', { headers: sbH });
    const arr = r.ok ? await r.json() : null;
    row = arr && arr[0];
  } catch (e) { row = null; }
  if (!row) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Charge not found.' }) };
  if (row.status === 'paid') return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'paid', message: 'This review is already paid.' }) };

  async function setStatus(status, extra) {
    try {
      await fetch(SB_URL + '/rest/v1/review_charges?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH', headers: Object.assign({}, sbH, { Prefer: 'return=minimal' }),
        body: JSON.stringify(Object.assign({ status: status }, extra || {})),
      });
    } catch (e) {}
  }

  const type = row.review_type;
  const label = charges.labelFor(type);
  const amount = row.amount || charges.priceFor(type);
  const money = '£' + (amount / 100).toFixed(2);
  const key = charges.stripeKey();

  try {
    const cc = await charges.customerAndCard(row.email, key);
    if (!cc.customer || !cc.paymentMethod) {
      await setStatus('failed', { fail_reason: 'no card on file' });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'failed', message: 'No card on file for ' + row.email + '. Ask them to add one, then retry.' }) };
    }
    const res = await charges.chargeNow({ key: key, amount: amount, customer: cc.customer, paymentMethod: cc.paymentMethod, description: label + ' - ' + (row.tender_title || 'tender'), metadata: { charge_id: row.id, review_type: type, email: row.email, retry: '1' } });
    if (res.ok) {
      await setStatus('paid', { stripe_payment_intent: res.id, paid_at: new Date().toISOString(), fail_reason: null });
      await email('hello@getcana.co.uk', 'PAID review to deliver: ' + label + ' for ' + row.email,
        '<p><b>' + label + '</b> paid (' + money + ') on retry.</p><p><b>Member:</b> ' + row.email + '</p><p><b>Tender:</b> ' + (row.tender_title || row.tender_id) + '</p><p>Please complete and send the review.</p>', row.email);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'paid', message: 'Payment taken (' + money + '). Row marked paid and the team has been emailed.' }) };
    }
    await setStatus('failed', { stripe_payment_intent: res.id || null, fail_reason: res.error || 'charge failed' });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'failed', message: 'Still could not take payment: ' + (res.error || 'declined') + '.' }) };
  } catch (e) {
    await setStatus('failed', { fail_reason: e.message });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'failed', message: 'Something went wrong taking payment. Please try again.' }) };
  }
};
