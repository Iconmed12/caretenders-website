// Delivery desk list: every PAID review (the human work to be done), with its
// delivery state, who has it, and simple capacity counts. Served to any admin or
// writer (requireDelivery). Only paid reviews appear: the money is in, so the
// only thing left is to do and deliver the review.

const { requireDelivery } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const FULL_SELECT = 'id,email,review_type,tender_id,tender_title,amount,paid_at,created_at,delivery_status,assigned_to,assigned_at,delivered_at,delivered_by';
const BASE_SELECT = 'id,email,review_type,tender_id,tender_title,amount,paid_at,created_at';

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const denied = await requireDelivery(event, 'admin-delivery-list', cors);
  if (denied) return denied;
  const me = (event._adminIdentity && event._adminIdentity.email) || '';

  try {
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    const h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

    // Try the full select (with the delivery columns). If the migration has not
    // been run yet, fall back to the base columns so the board still lists the
    // paid reviews, all treated as "to do".
    let res = await fetch(SB_URL + '/rest/v1/review_charges?status=eq.paid&select=' + FULL_SELECT + '&order=paid_at.desc&limit=500', { headers: h });
    let migrated = res.ok;
    if (!res.ok) {
      res = await fetch(SB_URL + '/rest/v1/review_charges?status=eq.paid&select=' + BASE_SELECT + '&order=paid_at.desc&limit=500', { headers: h });
    }
    let rows = await res.json();
    if (!Array.isArray(rows)) rows = [];

    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const counts = { todo: 0, in_progress: 0, delivered7: 0 };
    const byWriter = {};
    rows.forEach(function (r) {
      if (!r.delivery_status) r.delivery_status = 'todo';
      var st = r.delivery_status;
      if (st === 'delivered') {
        if (r.delivered_at && new Date(r.delivered_at).getTime() >= weekAgo) counts.delivered7++;
      } else if (st === 'in_progress') {
        counts.in_progress++;
        var who = r.assigned_to || 'unassigned';
        byWriter[who] = (byWriter[who] || 0) + 1;
      } else {
        counts.todo++;
      }
    });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ jobs: rows, counts: counts, byWriter: byWriter, me: me, migrated: migrated }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
