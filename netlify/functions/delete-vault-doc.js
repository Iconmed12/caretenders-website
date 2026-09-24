// Delete one of the signed-in customer's own vault documents. The anon key
// cannot delete rows by design, so deletes must go through a server function
// with the service key. Ownership is verified against the caller's token, so a
// customer can only ever delete their own documents.

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

async function verifyUser(event) {
  try {
    var hdrs = (event && event.headers) || {};
    var auth = hdrs.authorization || hdrs.Authorization || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token) return null;
    var anon = process.env.SUPABASE_ANON_KEY;
    var res = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    var user = await res.json();
    if (!user || !user.id) return null;
    return { id: user.id };
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    var user = await verifyUser(event);
    if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

    var id = (JSON.parse(event.body || '{}').id || '').trim();
    if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing document id.' }) };

    var SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    function sb(path, opts) {
      return fetch(SB_URL + path, Object.assign({ headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' } }, opts || {}));
    }

    // Fetch the doc and confirm it belongs to this user before deleting anything.
    var getRes = await sb('/rest/v1/vault_documents?id=eq.' + encodeURIComponent(id) + '&select=id,user_id,file_path&limit=1');
    var rows = await getRes.json();
    var doc = Array.isArray(rows) && rows[0];
    if (!doc) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Document not found.' }) };
    if (String(doc.user_id) !== String(user.id)) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'You can only delete your own documents.' }) };
    }

    // Remove the stored file (best effort), then delete the row (scoped to this user).
    if (doc.file_path) {
      try {
        await sb('/storage/v1/object/Vault/' + doc.file_path.split('/').map(encodeURIComponent).join('/'), { method: 'DELETE' });
      } catch (e) { console.log('Vault file delete failed (continuing to row delete):', e.message); }
    }
    var delRes = await sb('/rest/v1/vault_documents?id=eq.' + encodeURIComponent(id) + '&user_id=eq.' + encodeURIComponent(user.id), { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'return=minimal' } });
    if (!delRes.ok) { var et = await delRes.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not delete: ' + et.substring(0, 150) }) }; }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
