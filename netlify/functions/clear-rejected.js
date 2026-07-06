// Manually deletes ALL rejected tenders. Called by the admin "Clear all
// rejected" button. Uses the service key because the anon key cannot delete.

const { requireAdmin } = require('./_admin-auth');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  // Phase 1b ENFORCE: reject callers without a valid admin token.
  var _denied = await requireAdmin(event, 'clear-rejected', cors);
  if (_denied) return _denied;

  const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

  try {
    // Count first so we can report how many were removed
    const countRes = await fetch(
      `${sbUrl}/rest/v1/tenders?select=id&status=eq.rejected`,
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
    );
    const rows = countRes.ok ? await countRes.json() : [];
    const count = Array.isArray(rows) ? rows.length : 0;

    if (!count) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ deleted: 0 }) };
    }

    const delRes = await fetch(
      `${sbUrl}/rest/v1/tenders?status=eq.rejected`,
      {
        method: 'DELETE',
        headers: {
          apikey: sbKey,
          Authorization: 'Bearer ' + sbKey,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        }
      }
    );

    if (!delRes.ok) {
      const errTxt = await delRes.text();
      throw new Error('Delete failed: ' + delRes.status + ' ' + errTxt.substring(0, 200));
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ deleted: count }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
