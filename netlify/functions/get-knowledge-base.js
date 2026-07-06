const { checkAdmin, logAdminCheck } = require('./_admin-auth');

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  // Phase 1a MONITOR MODE: log who is calling, do not block yet.
  logAdminCheck('get-knowledge-base', await checkAdmin(event));
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
