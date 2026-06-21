// Runs daily at 02:00 UTC. Permanently deletes tenders that have been
// rejected for more than 7 days. Only deletes rows where rejected_at is set
// AND older than 7 days, so tenders rejected before the rejected_at column
// existed (rejected_at is null) are never touched.

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const sbKey = process.env.SUPABASE_ANON_KEY;
  const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

  // Cutoff: 7 days ago. Anything rejected before this is purged.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // First, find what we would delete (for logging) — rejected, with a real
    // rejected_at, older than the cutoff.
    const findUrl =
      `${sbUrl}/rest/v1/tenders?select=id,title,rejected_at` +
      `&status=eq.rejected` +
      `&rejected_at=not.is.null` +
      `&rejected_at=lt.${cutoff}`;

    const findRes = await fetch(findUrl, {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });
    if (!findRes.ok) {
      const t = await findRes.text();
      throw new Error('Find failed: ' + findRes.status + ' ' + t.substring(0, 200));
    }
    const toDelete = await findRes.json();

    if (!toDelete.length) {
      console.log('purge-rejected: nothing older than 7 days. Cutoff', cutoff);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ deleted: 0, cutoff }) };
    }

    // Delete them. Same filters as the find, so we never delete a null-dated row.
    const delRes = await fetch(
      `${sbUrl}/rest/v1/tenders?status=eq.rejected&rejected_at=not.is.null&rejected_at=lt.${cutoff}`,
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

    console.log('purge-rejected: deleted', toDelete.length, 'tenders rejected before', cutoff);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ deleted: toDelete.length, cutoff }) };
  } catch (err) {
    console.log('purge-rejected error:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
