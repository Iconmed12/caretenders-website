// Returns the signed-in member's review charges and their outstanding total, for
// the app "Reviews" screen and the website invoices page. Bearer auth, read-only.

const charges = require('./_charges');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  return { id: u.id };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  const user = await verifyUser(event);
  if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const res = await fetch(SB_URL + '/rest/v1/review_charges?user_id=eq.' + user.id + '&select=id,review_type,tender_title,amount,status,created_at,paid_at&order=created_at.desc&limit=50',
      { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
    const rows = res.ok ? await res.json() : [];
    const outstanding = rows.filter(function (r) { return r.status === 'pending' || r.status === 'failed'; }).reduce(function (s, r) { return s + (r.amount || 0); }, 0);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ charges: rows, outstanding: outstanding, prices: charges.REVIEW_PRICES }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
