// Starts a Cana generation job for an ACTIVE MEMBER without a Stripe payment.
// Mirrors cana-verify's job creation exactly; membership is re-verified
// server-side so the bypass cannot be forged from the browser.

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { companyDetails, tenderId, includeSq } = JSON.parse(event.body);
    const email = (companyDetails && companyDetails.email || '').trim().toLowerCase();
    if (!email || !tenderId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing email or tender' }) };
    }

    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // ── Server-side membership check (never trust the browser) ──
    const memRes = await fetch(
      sbUrl + '/rest/v1/subscriptions?email=eq.' + encodeURIComponent(email) +
      '&status=in.(active,trialing,past_due)&select=status,current_period_end' +
      '&order=current_period_end.desc&limit=1',
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
    );
    const memRows = await memRes.json();
    const sub = Array.isArray(memRows) && memRows[0];
    let active = false;
    if (sub) {
      if (!sub.current_period_end) active = sub.status === 'active';
      else active = (new Date(sub.current_period_end).getTime() + 3 * 24 * 3600 * 1000) > Date.now();
    }
    if (!active) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'No active membership found for ' + email }) };
    }

    // ── Create job record (identical shape to cana-verify) ──
    var jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    var jobRes = await fetch(sbUrl + '/rest/v1/cana_jobs', {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        id: jobId,
        status: 'pending',
        tender_id: tenderId,
        client_email: email,
        client_name: companyDetails && companyDetails.name || '',
        created_at: new Date().toISOString()
      })
    });
    console.log('Member job created:', jobRes.status, jobId, email);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        member: true,
        jobId,
        email,
        tenderId,
        includeSq: !!includeSq,
        companyDetails: Object.assign({}, companyDetails || {}, { email: email })
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
