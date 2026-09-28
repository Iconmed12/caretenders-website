// Send a test push to the signed-in user's own registered devices, so they can
// confirm notifications work end to end. Bearer auth.

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const user = await verifyUser(event);
  if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server not configured.' }) };
  const sbHeaders = { apikey: key, Authorization: 'Bearer ' + key };

  try {
    const tRes = await fetch(SB_URL + '/rest/v1/push_tokens?user_id=eq.' + user.id + '&select=token', { headers: sbHeaders });
    const toks = tRes.ok ? await tRes.json() : [];
    if (!toks.length) return { statusCode: 200, headers: cors, body: JSON.stringify({ sent: 0, reason: 'no devices' }) };

    const messages = toks.map(function (t) {
      return {
        to: t.token,
        title: 'Cana Bids',
        body: 'Push is working. New matching tenders will arrive like this.',
        sound: 'default',
        data: { type: 'test' },
      };
    });
    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers: cors, body: JSON.stringify({ sent: 0, error: 'push service error', detail: detail }) };
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ sent: toks.length }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
