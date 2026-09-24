// Accept an enterprise invite. The invitee signs in (or signs up) first, then
// this links their account to the invited seat. Auth is the caller's own token;
// the invite token comes from the emailed link.

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
    var u = await res.json();
    if (!u || !u.id) return null;
    return { id: u.id, email: (u.email || '').toLowerCase() };
  } catch (e) { return null; }
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

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  function sb(path, opts) { return fetch(SB_URL + path, Object.assign({ headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' } }, opts || {})); }

  try {
    var user = await verifyUser(event);
    if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in to accept the invitation.' }) };

    var tok = (JSON.parse(event.body || '{}').token || '').trim();
    if (!tok) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing invite token.' }) };

    var iRes = await sb('/rest/v1/enterprise_invites?token=eq.' + encodeURIComponent(tok) + '&select=*&limit=1');
    var inv = iRes.ok ? (await iRes.json())[0] : null;
    if (!inv) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'This invitation is not valid.' }) };
    if (inv.status !== 'pending') return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'This invitation has already been used.' }) };
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return { statusCode: 410, headers: cors, body: JSON.stringify({ error: 'This invitation has expired. Please ask for a new one.' }) };

    // Link the invited seat to this account and activate it.
    var upd = await sb('/rest/v1/enterprise_members?enterprise_id=eq.' + encodeURIComponent(inv.enterprise_id) + '&email=eq.' + encodeURIComponent((inv.email || '').toLowerCase()) + '&status=eq.invited', {
      method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: user.id, status: 'active', joined_at: new Date().toISOString() })
    });
    if (!upd.ok) { var et = await upd.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: et.substring(0, 150) }) }; }
    var rows = await upd.json();
    if (!Array.isArray(rows) || !rows.length) return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'This seat is no longer available.' }) };

    await sb('/rest/v1/enterprise_invites?token=eq.' + encodeURIComponent(tok), { method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'accepted' }) });

    var eRes = await sb('/rest/v1/enterprises?id=eq.' + encodeURIComponent(inv.enterprise_id) + '&select=name&limit=1');
    var ent = eRes.ok ? (await eRes.json())[0] : null;
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, enterprise: ent ? ent.name : '', department: inv.department || '' }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
