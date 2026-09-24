exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const jobId = event.queryStringParameters && event.queryStringParameters.jobId;
    if (!jobId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing jobId' }) };

    const sbKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // Return ONLY the status (the poller uses nothing else). Previously this
    // returned the whole job row (client email, Stripe session id, etc.) to
    // anyone holding the job id; now no sensitive fields are exposed.
    const res = await fetch(sbUrl + '/rest/v1/cana_jobs?id=eq.' + encodeURIComponent(jobId) + '&select=status&limit=1', {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });

    const rows = await res.json();
    const job = Array.isArray(rows) ? rows[0] : null;

    if (!job) {
      // Job not yet created by background function, still starting
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'pending' }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ status: job.status }) };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Failed' }) };
  }
};
