// Temporary inspection function — DELETE after use
exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const sbKey = process.env.SUPABASE_ANON_KEY;
  const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

  const res = await fetch(`${sbUrl}/rest/v1/tenders?select=id,title,status,category,cana_docs&order=created_at.desc`, {
    headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
  });
  const tenders = await res.json();

  const summary = tenders.map(t => ({
    title: t.title,
    status: t.status,
    category: t.category,
    has_quality: !!(t.cana_docs?.quality?.length),
    has_spec: !!(t.cana_docs?.spec?.length),
    has_scoring: !!(t.cana_docs?.scoring?.length),
  }));

  return { statusCode: 200, headers: cors, body: JSON.stringify(summary, null, 2) };
};
