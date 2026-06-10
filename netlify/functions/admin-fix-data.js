// One-time data fix: resets mis-approved tenders back to pending_review.
// A tender is "mis-approved" if it has needs_docs/open status but has
// NO cana_docs uploaded (i.e. was never properly worked on).
// DELETE THIS FUNCTION after running it once.

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const sbKey = process.env.SUPABASE_ANON_KEY;
  const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

  // Fetch all tenders with needs_docs or open status
  const res = await fetch(`${sbUrl}/rest/v1/tenders?select=id,title,status,category,cana_docs&status=in.(needs_docs,open)`, {
    headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
  });
  const tenders = await res.json();

  const toReset = tenders.filter(t => {
    const docs = t.cana_docs;
    const hasDocs = docs && (
      (docs.quality && docs.quality.length) ||
      (docs.spec && docs.spec.length) ||
      (docs.scoring && docs.scoring.length)
    );
    // Reset if no docs uploaded — they were auto-approved without being worked on
    return !hasDocs;
  });

  const results = [];
  for (const t of toReset) {
    const patch = await fetch(`${sbUrl}/rest/v1/tenders?id=eq.${t.id}`, {
      method: 'PATCH',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'pending_review' })
    });
    results.push({ id: t.id, title: t.title, was: t.status, ok: patch.ok });
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ fixed: results.length, details: results })
  };
};
