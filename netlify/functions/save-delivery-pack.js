// Saves ONLY the completion pack fields for one tender.
// Exists because sending the whole tender object (with all extracted Cana
// document text) exceeds request size limits on heavily loaded tenders.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { tenderId, completion_docs, submission_portal } = JSON.parse(event.body);
    if (!tenderId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing tenderId' }) };

    const supabase = createClient('https://igpjfpncfuawikoyzfcd.supabase.co', process.env.SUPABASE_ANON_KEY);
    const { error } = await supabase
      .from('tenders')
      .update({
        completion_docs: completion_docs || [],
        submission_portal: submission_portal || null
      })
      .eq('id', tenderId);

    if (error) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
