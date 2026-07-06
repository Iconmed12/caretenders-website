// Returns the completion pack (documents + portal + deadline) for ONE tender.
// Kept separate from get-tenders so the public feed never carries base64 payloads.

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

    const supabase = createClient('https://igpjfpncfuawikoyzfcd.supabase.co', (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY));
    const { data, error } = await supabase
      .from('tenders')
      .select('id,title,deadline,completion_docs,submission_portal')
      .eq('id', id)
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        id: data.id,
        title: data.title,
        deadline: data.deadline,
        completion_docs: data.completion_docs || [],
        submission_portal: data.submission_portal || null
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
