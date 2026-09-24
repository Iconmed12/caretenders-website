// Returns the signed-in customer's own bid history. The email is taken from the
// verified Supabase token, NOT from the request body, so a caller can only ever
// see their own history (previously any email could be queried without auth).

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
    if (!u || !u.email) return null;
    return { email: (u.email || '').toLowerCase() };
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  const cors = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors, body:'' };

  try {
    var user = await verifyUser(event);
    if (!user) return { statusCode:401, headers:cors, body: JSON.stringify({ error:'Please sign in.' }) };

    const sbKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
    const email = user.email;

    var res = await fetch(
      SB_URL + '/rest/v1/cana_jobs?client_email=ilike.' + encodeURIComponent(email) +
      '&select=id,tender_id,client_name,status,created_at,completed_at&order=created_at.desc&limit=20',
      { headers: { apikey:sbKey, Authorization:'Bearer '+sbKey } }
    );
    var jobs = await res.json();
    if (!Array.isArray(jobs)) jobs = [];

    // Enrich with tender titles
    var tenderIds = [...new Set(jobs.map(function(j){ return j.tender_id; }).filter(Boolean))];
    var tenders = {};
    if (tenderIds.length) {
      var tRes = await fetch(
        SB_URL + '/rest/v1/tenders?id=in.(' + tenderIds.join(',') + ')&select=id,title,org,deadline',
        { headers: { apikey:sbKey, Authorization:'Bearer '+sbKey } }
      );
      var tData = await tRes.json();
      (tData||[]).forEach(function(t){ tenders[t.id] = t; });
    }

    var history = jobs.map(function(j) {
      var t = tenders[j.tender_id] || {};
      return {
        id: j.id,
        tender_id: j.tender_id,
        tender_title: t.title || 'Tender',
        org: t.org || '',
        deadline: t.deadline || '',
        client_name: j.client_name,
        status: j.status,
        created_at: j.created_at,
        completed_at: j.completed_at
      };
    });

    return { statusCode:200, headers:cors, body: JSON.stringify(history) };
  } catch(e) {
    return { statusCode:500, headers:cors, body: JSON.stringify({ error:e.message }) };
  }
};
