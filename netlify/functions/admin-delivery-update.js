// Delivery desk actions on a paid review. Any admin or writer (requireDelivery).
//   claim    -> assign to the caller and mark in_progress
//   deliver  -> mark delivered, stamping who did it and when
//   reopen   -> back to to-do, unassigned (fixes a mistaken claim/deliver)
// The caller identity comes from the verified token, so a writer cannot claim or
// deliver as someone else. Marking delivered is an internal stamp; the writer
// sends the finished review to the customer themselves.

const { requireDelivery, logAudit } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  const denied = await requireDelivery(event, 'admin-delivery-update', cors);
  if (denied) return denied;
  const me = (event._adminIdentity && event._adminIdentity.email) || '';

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const id = String(body.id || '').trim();
  const action = String(body.action || '').trim();
  if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing job id.' }) };

  var patch;
  var now = new Date().toISOString();
  if (action === 'claim') {
    patch = { delivery_status: 'in_progress', assigned_to: me, assigned_at: now };
  } else if (action === 'deliver') {
    patch = { delivery_status: 'delivered', delivered_by: me, delivered_at: now };
  } else if (action === 'reopen') {
    patch = { delivery_status: 'todo', assigned_to: null, assigned_at: null, delivered_by: null, delivered_at: null };
  } else {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action.' }) };
  }

  try {
    const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const sbH = { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json' };
    const res = await fetch(SB_URL + '/rest/v1/review_charges?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: Object.assign({}, sbH, { Prefer: 'return=representation' }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const txt = await res.text();
      // A missing column means the migration has not been run yet.
      if (/column .* does not exist/i.test(txt)) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Delivery is not set up yet. Run sql/review_delivery.sql in Supabase, then try again.' }) };
      }
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Update failed: ' + txt.substring(0, 160) }) };
    }
    const arr = await res.json();
    const row = Array.isArray(arr) ? arr[0] : null;
    if (!row) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Job not found.' }) };

    await logAudit(event, 'delivery-' + action, { id: id, tender: row.tender_title || row.tender_id, by: me });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, job: row }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
