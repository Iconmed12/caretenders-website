// Updates only the supplied fields on one tender. Replaces whole-object saves,
// which exceeded request limits once tenders carried extracted document text.

const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./_admin-auth');

const ALLOWED_FIELDS = [
  'cana_docs', 'cana_questions', 'sq_data',
  'completion_docs', 'submission_portal', 'status'
];

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  // Phase 1b ENFORCE: reject callers without a valid admin token.
  var _denied = await requireAdmin(event, 'patch-tender', cors);
  if (_denied) return _denied;

  try {
    const { tenderId, fields } = JSON.parse(event.body);
    if (!tenderId || !fields) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing tenderId or fields' }) };

    const update = {};
    for (const k of Object.keys(fields)) {
      if (ALLOWED_FIELDS.includes(k)) update[k] = fields[k];
    }
    if (!Object.keys(update).length) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No allowed fields supplied' }) };

    const supabase = createClient('https://igpjfpncfuawikoyzfcd.supabase.co', process.env.SUPABASE_ANON_KEY);
    const { error } = await supabase.from('tenders').update(update).eq('id', tenderId);
    if (error) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
