// Store (or refresh) a device's Expo push token for the signed-in user, so the
// send-alerts job can push to them. Auth is the Bearer access token.

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
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

function svcKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const user = await verifyUser(event);
  if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

  const key = svcKey();
  if (!key) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server not configured.' }) };
  const sbHeaders = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  const pushToken = String(body.token || '').trim();
  if (!pushToken) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing token' }) };

  try {
    if (event.httpMethod === 'DELETE') {
      await fetch(SB_URL + '/rest/v1/push_tokens?token=eq.' + encodeURIComponent(pushToken),
        { method: 'DELETE', headers: Object.assign({}, sbHeaders, { Prefer: 'return=minimal' }) });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    const row = {
      token: pushToken,
      user_id: user.id,
      email: user.email,
      platform: body.platform === 'ios' ? 'ios' : 'android',
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(SB_URL + '/rest/v1/push_tokens?on_conflict=token',
      {
        method: 'POST',
        headers: Object.assign({}, sbHeaders, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(row),
      });
    if (!res.ok) {
      const t = await res.text();
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not save token', detail: t }) };
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
