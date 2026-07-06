const { requireOwner } = require('./_admin-auth');

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  // Phase 5 ENFORCE: knowledge base is OWNER ONLY (staff are refused and never see it).
  var _denied = await requireOwner(event, 'get-knowledge-base', cors);
  if (_denied) return _denied;
  try {
    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sector = (event.queryStringParameters && event.queryStringParameters.sector) || 'care';
    const rowId = sector === 'commercial' ? 'commercial' : 'global';
    const res = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/cana_knowledge?id=eq.' + rowId + '&select=*&limit=1',
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } });
    const rows = await res.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify(rows[0] || {}) };
  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
