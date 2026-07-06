const { requireAdmin } = require('./_admin-auth');

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  // Phase 1b ENFORCE: reject callers without a valid admin token.
  var _denied = await requireAdmin(event, 'save-knowledge-base', cors);
  if (_denied) return _denied;
  try {
    const body = JSON.parse(event.body);
    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sector = body.sector === 'commercial' ? 'commercial' : 'care';
    const rowId = sector === 'commercial' ? 'commercial' : 'global';
    const payload = {
      id: rowId,
      writing_style: body.writing_style || '',
      commissioner_preferences: body.commissioner_preferences || '',
      avoid_patterns_text: body.avoid_patterns_text || '',
      winning_examples: body.winning_examples || [],
      failed_examples: body.failed_examples || [],
      feedback_examples: body.feedback_examples || [],
      updated_at: new Date().toISOString()
    };
    const res = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/cana_knowledge', {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { const e = await res.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e }) }; }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ saved: true }) };
  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
