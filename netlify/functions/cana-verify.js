exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { sessionId, companyDetails, tenderId, includeSq } = JSON.parse(event.body);
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;
    const sbKey     = process.env.SUPABASE_ANON_KEY;
    const sbUrl     = 'https://igpjfpncfuawikoyzfcd.supabase.co';
    const siteUrl   = 'https://caretenders-website.netlify.app';

    // ── Verify payment with Stripe ──
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions?limit=20', {
      headers: { Authorization: 'Bearer ' + stripeKey }
    });
    const stripeData = await stripeRes.json();

    var paid = false;
    var stripeEmail = (companyDetails && companyDetails.email) || '';

    if (stripeData.data) {
      for (var i = 0; i < stripeData.data.length; i++) {
        var s = stripeData.data[i];
        if (s.metadata && s.metadata.session_id === sessionId && s.payment_status === 'paid') {
          paid = true;
          if (s.customer_details && s.customer_details.email) stripeEmail = s.customer_details.email;
          break;
        }
      }
    }

    if (!paid) {
      return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Payment not confirmed. If you have paid please email consulting@icongrp.co.uk with your reference.' }) };
    }

    // ── Create job record ──
    var jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

    await fetch(sbUrl + '/rest/v1/cana_jobs', {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: jobId,
        status: 'pending',
        tender_id: tenderId,
        client_email: stripeEmail,
        client_name: companyDetails && companyDetails.name || '',
        created_at: new Date().toISOString()
      })
    });

    // ── Trigger background function ──
    var bgPayload = JSON.stringify({
      jobId,
      tenderId,
      sessionId,
      includeSq: !!includeSq,
      companyDetails: { ...(companyDetails || {}), email: stripeEmail }
    });
    console.log('Triggering background function for job:', jobId);
    fetch(siteUrl + '/.netlify/functions/generate-cana-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bgPayload
    }).then(function(r){ console.log('Background triggered, status:', r.status); })
      .catch(function(e){ console.log('Background trigger failed:', e.message); });

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ paid: true, jobId, email: stripeEmail })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
