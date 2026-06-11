// Returns ONE complete tender row, heavy fields included.
// List endpoints (get-tenders) ship light rows; this is the detail fetch
// used when the admin selects a tender to manage or a client opens one.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const id = event.queryStringParameters && event.queryStringParameters.id;
    if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing id' }) };

    const supabase = createClient('https://igpjfpncfuawikoyzfcd.supabase.co', process.env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase.from('tenders').select('*').eq('id', id).single();
    if (error) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };

    return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
