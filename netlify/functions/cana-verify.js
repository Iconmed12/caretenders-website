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
    var includesReview = false;
    var formEmail   = (companyDetails && companyDetails.email) || '';
    var stripeEmail = formEmail; // Default: use the email the client typed in the form

    if (stripeData.data) {
      for (var i = 0; i < stripeData.data.length; i++) {
        var s = stripeData.data[i];
        if (s.metadata && s.metadata.session_id === sessionId && s.payment_status === 'paid') {
          paid = true;
          // Only use Stripe email if the client didn't type one in the form
          if (!formEmail && s.customer_details && s.customer_details.email) {
            stripeEmail = s.customer_details.email;
          }
          if (s.metadata.includes_review === '1') includesReview = true;
          break;
        }
      }
    }

    if (!paid) {
      return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Payment not confirmed. If you have paid please email hello@getcana.co.uk with your reference.' }) };
    }

    // ── Create job record ──
    var jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

    var jobRes = await fetch(sbUrl + '/rest/v1/cana_jobs', {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        id: jobId,
        status: 'pending',
        tender_id: tenderId,
        client_email: stripeEmail,
        client_name: companyDetails && companyDetails.name || '',
        created_at: new Date().toISOString()
      })
    });
    var jobResText = await jobRes.text();
    console.log('Job created:', jobRes.status, jobResText.substring(0, 200));

    // If the bid included Expert Review, alert the team to action it
    if (includesReview) {
      try {
        const RESEND_KEY = process.env.RESEND_API_KEY;
        const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@getcana.co.uk';
        if (RESEND_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Cana <' + FROM_EMAIL + '>',
              to: 'hello@getcana.co.uk',
              reply_to: stripeEmail || undefined,
              subject: 'Expert Review purchased with a bid',
              html: '<div style="font-family:Arial,sans-serif;"><h2 style="color:#0B1929;">Expert Review purchased</h2>' +
                '<p>A client bought a bid with Expert Review. Please review within 48 hours.</p>' +
                '<p><strong>Client:</strong> ' + (stripeEmail || 'unknown') + '<br>' +
                '<strong>Tender ID:</strong> ' + tenderId + '<br>' +
                '<strong>Job:</strong> ' + jobId + '</p></div>'
            })
          });
          console.log('Review alert sent for combined bid+review');
        }
      } catch (e) { console.log('Review alert failed (non-fatal):', e.message); }
    }

    // ── Trigger background function ──
    // Return job details to browser — browser will trigger the background function directly
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        paid: true,
        jobId,
        email: stripeEmail,
        tenderId,
        includeSq: !!includeSq,
        companyDetails: { ...(companyDetails || {}), email: stripeEmail }
      })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
