// One-time fix: correct two bad category values in the DB. Delete after running.
exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const sbKey = process.env.SUPABASE_ANON_KEY;
  const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

  const fixes = [
    // Item 5: Dog Kennelling miscategorised as care
    { match: 'Dog Kennelling', category: 'commercial' },
    // Item 6: Reading tender has capital-M "Mental health" — normalise to lowercase
    { match: 'Targeted Short Breaks', category: 'mental health' },
  ];

  const results = [];
  for (const fix of fixes) {
    const res = await fetch(
      `${sbUrl}/rest/v1/tenders?title=ilike.*${encodeURIComponent(fix.match)}*`,
      { method: 'PATCH',
        headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey,
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ category: fix.category }) }
    );
    const rows = await res.json();
    results.push({ fix: fix.match, category: fix.category, updated: Array.isArray(rows) ? rows.length : 0 });
  }

  return { statusCode: 200, headers: cors, body: JSON.stringify({ results }) };
};
