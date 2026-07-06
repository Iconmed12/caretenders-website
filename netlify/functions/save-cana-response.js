exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { sessionId, tenderId, responses } = JSON.parse(event.body);
    const sbKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    const res = await fetch(sbUrl + '/rest/v1/cana_responses', {
      method: 'POST',
      headers: {
        'apikey': sbKey,
        'Authorization': 'Bearer ' + sbKey,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: sessionId,
        tender_id: tenderId,
        responses: responses
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Save failed: ' + err }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ saved: true }) };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
