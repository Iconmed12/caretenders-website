exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  try {
    const sbKey = process.env.SUPABASE_ANON_KEY;
    const res = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/cana_knowledge?id=eq.global&select=*&limit=1',
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } });
    const rows = await res.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify(rows[0] || {}) };
  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
