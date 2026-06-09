exports.handler = async (event) => {
  const cors = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors, body:'' };

  try {
    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';
    const { email } = JSON.parse(event.body || '{}');
    if (!email) return { statusCode:400, headers:cors, body: JSON.stringify({ error:'Missing email' }) };

    var res = await fetch(
      sbUrl + '/rest/v1/cana_jobs?client_email=ilike.' + encodeURIComponent(email) +
      '&select=id,tender_id,client_name,status,created_at,completed_at&order=created_at.desc&limit=20',
      { headers: { apikey:sbKey, Authorization:'Bearer '+sbKey } }
    );
    var jobs = await res.json();

    // Enrich with tender titles
    var tenderIds = [...new Set(jobs.map(function(j){ return j.tender_id; }).filter(Boolean))];
    var tenders = {};
    if (tenderIds.length) {
      var tRes = await fetch(
        sbUrl + '/rest/v1/tenders?id=in.(' + tenderIds.join(',') + ')&select=id,title,org,deadline',
        { headers: { apikey:sbKey, Authorization:'Bearer '+sbKey } }
      );
      var tData = await tRes.json();
      (tData||[]).forEach(function(t){ tenders[t.id] = t; });
    }

    var history = jobs.map(function(j) {
      var t = tenders[j.tender_id] || {};
      return {
        id: j.id,
        tender_id: j.tender_id,
        tender_title: t.title || 'Tender',
        org: t.org || '',
        deadline: t.deadline || '',
        client_name: j.client_name,
        status: j.status,
        created_at: j.created_at,
        completed_at: j.completed_at
      };
    });

    return { statusCode:200, headers:cors, body: JSON.stringify(history) };
  } catch(e) {
    return { statusCode:500, headers:cors, body: JSON.stringify({ error:e.message }) };
  }
};
