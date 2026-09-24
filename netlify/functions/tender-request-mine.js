// Return the logged-in customer's own tender requests (most recent first) so
// they can see progress. Served server-side with the service key and filtered
// to their own user id, so a customer can never read anyone else's requests
// (Row-Level Security is not yet enabled on the database).

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

async function verifyUser(event) {
  try {
    var hdrs = (event && event.headers) || {};
    var auth = hdrs.authorization || hdrs.Authorization || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token) return null;
    var anon = process.env.SUPABASE_ANON_KEY;
    var res = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    var user = await res.json();
    if (!user || !user.id) return null;
    return { id: user.id, email: (user.email || '').toLowerCase() };
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    var user = await verifyUser(event);
    if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

    var SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    var path = '/rest/v1/tender_requests?user_id=eq.' + encodeURIComponent(user.id) +
      '&select=id,created_at,link,note,status,tender_id&order=created_at.desc&limit=50';
    var res = await fetch(SB_URL + path, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    if (!res.ok) { var et = await res.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: et.substring(0, 150) }) }; }
    var rows = await res.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify({ requests: Array.isArray(rows) ? rows : [] }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
