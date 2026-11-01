// Admin-only: every review charge (review_charges row), newest first, so the
// Orders screen can show a review chip (Paid / Pending / Payment failed) against
// the order it belongs to. Matched to orders by member email + tender id.

const { requireAdmin } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const denied = await requireAdmin(event, 'admin-review-charges', cors);
  if (denied) return denied;

  try {
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    const res = await fetch(SB_URL + '/rest/v1/review_charges?select=id,email,review_type,tender_id,tender_title,amount,status,created_at,paid_at,fail_reason&order=created_at.desc&limit=500', {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
    });
    let charges = await res.json();
    if (!Array.isArray(charges)) charges = [];
    return { statusCode: 200, headers: cors, body: JSON.stringify({ charges: charges }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
