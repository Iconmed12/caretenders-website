// Runs daily at 01:00 UTC — moves past-deadline tenders to 'expired' status.
// Expired tenders disappear from the public portal but remain visible in the
// admin under a new Expired tab so nothing is permanently lost.

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const sbKey = process.env.SUPABASE_ANON_KEY;
  const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // Fetch all non-expired, non-pending tenders that have a deadline in the past
    // Statuses that are "live" and should be checked: live, open, needs_docs, closing, urgent
    const res = await fetch(
      `${sbUrl}/rest/v1/tenders?select=id,title,deadline,status` +
      `&status=in.(live,open,needs_docs,closing,urgent)` +
      `&deadline=lt.${today}`,
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
    );

    if (!res.ok) throw new Error('Fetch failed: ' + res.status);
    const tenders = await res.json();

    if (!tenders.length) {
      console.log('No expired tenders found for', today);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ expired: 0, date: today }) };
    }

    // Batch PATCH — set status to 'expired' for all matching rows
    const ids = tenders.map(t => t.id);
    const patch = await fetch(
      `${sbUrl}/rest/v1/tenders?id=in.(${ids.map(id => `"${id}"`).join(',')})`,
      {
        method: 'PATCH',
        headers: {
          apikey: sbKey,
          Authorization: 'Bearer ' + sbKey,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ status: 'expired' })
      }
    );

    if (!patch.ok) {
      const errTxt = await patch.text();
      throw new Error('Patch failed: ' + patch.status + ' ' + errTxt.substring(0, 200));
    }

    console.log(`Expired ${tenders.length} tenders on ${today}:`, tenders.map(t => t.title.substring(0, 50)));
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        expired: tenders.length,
        date: today,
        tenders: tenders.map(t => ({ id: t.id, title: t.title, deadline: t.deadline }))
      })
    };

  } catch (err) {
    console.error('expire-tenders error:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
