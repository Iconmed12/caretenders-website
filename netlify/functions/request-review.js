// A member requests an extra review (beyond their included allowance) on account.
// We log the charge, then charge their saved card immediately (off-session). On
// success the team is emailed so the review can be delivered; on failure the
// charge is marked failed and the team is alerted to follow up. Bearer auth.

const charges = require('./_charges');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function verifyUser(event) {
  const hdrs = (event && event.headers) || {};
  const auth = hdrs.authorization || hdrs.Authorization || '';
  const token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
  if (!token) return null;
  const anon = process.env.SUPABASE_ANON_KEY;
  const res = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
  if (!res.ok) return null;
  const u = await res.json();
  if (!u || !u.id) return null;
  return { id: u.id, email: (u.email || '').toLowerCase() };
}

async function email(to, subject, html, replyTo) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@getcana.co.uk';
  const body = { from: 'Cana Bids <' + from + '>', to: to, subject: subject, html: html };
  if (replyTo) body.reply_to = replyTo;
  try { await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) {}
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  const user = await verifyUser(event);
  if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const type = body.review_type === 'full' ? 'full' : (body.review_type === 'response' ? 'response' : null);
  if (!type) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Pick a review type.' }) };
  const amount = charges.priceFor(type);
  const label = charges.labelFor(type);
  const tenderTitle = String(body.tender_title || '').slice(0, 300);
  const tenderId = String(body.tender_id || '').slice(0, 120);

  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sbH = { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json' };

  // 1) Log the charge as pending.
  let row;
  try {
    const ins = await fetch(SB_URL + '/rest/v1/review_charges', {
      method: 'POST',
      headers: Object.assign({}, sbH, { Prefer: 'return=representation' }),
      body: JSON.stringify({ user_id: user.id, email: user.email, review_type: type, tender_id: tenderId, tender_title: tenderTitle, amount: amount, status: 'pending' }),
    });
    const arr = ins.ok ? await ins.json() : null;
    row = arr && arr[0];
    if (!row) throw new Error('insert failed');
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not record the request. Please try again.' }) };
  }

  async function setStatus(status, extra) {
    try {
      await fetch(SB_URL + '/rest/v1/review_charges?id=eq.' + row.id, {
        method: 'PATCH', headers: Object.assign({}, sbH, { Prefer: 'return=minimal' }),
        body: JSON.stringify(Object.assign({ status: status }, extra || {})),
      });
    } catch (e) {}
  }

  // 2) Charge the saved card right away.
  const key = charges.stripeKey();
  const money = '£' + (amount / 100).toFixed(2);
  try {
    const cc = await charges.customerAndCard(user.email, key);
    if (!cc.customer || !cc.paymentMethod) {
      await setStatus('failed', { fail_reason: 'no card on file' });
      await email('hello@getcana.co.uk', 'Review request could not be charged (no card): ' + user.email,
        '<p>' + user.email + ' requested a <b>' + label + '</b> (' + money + ') for "' + tenderTitle + '" but has no card on file to charge. Follow up manually.</p>', user.email);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'failed', reason: 'no_card', amount: amount, message: 'We could not find a card on file. Our team will be in touch to arrange payment.' }) };
    }
    const res = await charges.chargeNow({ key: key, amount: amount, customer: cc.customer, paymentMethod: cc.paymentMethod, description: label + ' - ' + (tenderTitle || 'tender'), metadata: { charge_id: row.id, review_type: type, email: user.email } });
    if (res.ok) {
      await setStatus('paid', { stripe_payment_intent: res.id, paid_at: new Date().toISOString() });
      await email('hello@getcana.co.uk', 'PAID review to deliver: ' + label + ' for ' + user.email,
        '<p><b>' + label + '</b> paid (' + money + ').</p><p><b>Member:</b> ' + user.email + '</p><p><b>Tender:</b> ' + (tenderTitle || tenderId) + '</p><p>Please complete and send the review.</p>', user.email);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'paid', amount: amount, message: 'Payment taken. Your ' + label + ' is now with our team and we will email it to you.' }) };
    }
    await setStatus('failed', { stripe_payment_intent: res.id || null, fail_reason: res.error || 'charge failed' });
    await email('hello@getcana.co.uk', 'Review charge FAILED: ' + user.email,
      '<p>' + user.email + ' requested a <b>' + label + '</b> (' + money + ') for "' + tenderTitle + '" but the card charge failed: ' + (res.error || '') + '. Follow up.</p>', user.email);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'failed', amount: amount, message: 'We could not take payment automatically. Our team will be in touch to sort it out.' }) };
  } catch (e) {
    await setStatus('failed', { fail_reason: e.message });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'failed', amount: amount, message: 'Something went wrong taking payment. Our team will be in touch.' }) };
  }
};
