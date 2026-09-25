// Public lookup of an enterprise invite by its token, so the join page can show
// the locked email, the company being joined and the department. The token is
// the secret (a long random string sent to the invitee's email), so this needs
// no login. It returns only what the join screen needs.

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  function sb(path) { return fetch(SB_URL + path, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }); }

  try {
    var tok = ((event.queryStringParameters && event.queryStringParameters.token) || '').trim();
    if (!tok) return { statusCode: 400, headers: cors, body: JSON.stringify({ valid: false, error: 'Missing token.' }) };

    var iRes = await sb('/rest/v1/enterprise_invites?token=eq.' + encodeURIComponent(tok) + '&select=*&limit=1');
    var inv = iRes.ok ? (await iRes.json())[0] : null;
    if (!inv) return { statusCode: 200, headers: cors, body: JSON.stringify({ valid: false, reason: 'not_found' }) };
    if (inv.status !== 'pending') return { statusCode: 200, headers: cors, body: JSON.stringify({ valid: false, reason: 'used' }) };
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return { statusCode: 200, headers: cors, body: JSON.stringify({ valid: false, reason: 'expired' }) };

    var eRes = await sb('/rest/v1/enterprises?id=eq.' + encodeURIComponent(inv.enterprise_id) + '&select=name,owner_user_id&limit=1');
    var ent = eRes.ok ? (await eRes.json())[0] : null;

    // Prefer the owner's registered company name (the shared profile) for display.
    var companyName = ent ? ent.name : '';
    if (ent && ent.owner_user_id) {
      var pRes = await sb('/rest/v1/company_profiles?user_id=eq.' + encodeURIComponent(ent.owner_user_id) + '&select=company_name&limit=1');
      var prof = pRes.ok ? (await pRes.json())[0] : null;
      if (prof && prof.company_name) companyName = prof.company_name;
    }

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        valid: true,
        email: inv.email || '',
        department: inv.department || '',
        enterprise_name: ent ? ent.name : '',
        company_name: companyName
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ valid: false, error: err.message }) };
  }
};
