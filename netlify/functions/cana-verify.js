const { checkRate, tooMany } = require('./_rate-limit');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (!(await checkRate(event, 'verify', 8, 60))) return tooMany(cors);

  try {
    const { sessionId, cs, companyDetails, tenderId, includeSq } = JSON.parse(event.body);
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;
    const sbKey     = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    const sbUrl     = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    if (!tenderId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing tender.' }) };
    }

    // ── Verify payment with Stripe, by the REAL session id ──
    // We look the checkout session up directly (not by scanning recent sessions)
    // and confirm it is paid AND was for THIS tender. This closes two holes:
    // paying for one tender then generating another, and a genuine payer being
    // missed because their session fell outside a recent-sessions window.
    if (!cs || !/^cs_/.test(cs)) {
      return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Payment not confirmed. If you have paid please email hello@getcana.co.uk with your reference.' }) };
    }
    const sessRes = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(cs), {
      headers: { Authorization: 'Bearer ' + stripeKey, 'Stripe-Version': '2024-06-20' }
    });
    const s = await sessRes.json();
    if (!sessRes.ok || !s || s.error) {
      return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Payment could not be confirmed. If you were charged, email hello@getcana.co.uk with your reference.' }) };
    }

    var paid = s.payment_status === 'paid';
    var okTender = s.metadata && String(s.metadata.tender_id || '') === String(tenderId);
    if (!paid || !okTender) {
      return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Payment not confirmed for this tender. If you have paid please email hello@getcana.co.uk with your reference.' }) };
    }

    var includesReview = s.metadata && s.metadata.includes_review === '1';
    var paidTier = (s.metadata && s.metadata.tier) || 'none';
    var formEmail   = (companyDetails && companyDetails.email) || '';
    var stripeEmail = formEmail || (s.customer_details && s.customer_details.email) || '';

    // ── Create job record, keyed to this Stripe session so one payment can only
    // ever produce one bid. A unique index on stripe_session_id makes a repeat
    // attempt fail (409), which we treat as "already used". ──
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
        stripe_session_id: cs,
        created_at: new Date().toISOString()
      })
    });
    var jobResText = await jobRes.text();
    console.log('Job created:', jobRes.status, jobResText.substring(0, 200));

    // Unique-violation on stripe_session_id => this payment was already used.
    if (jobRes.status === 409 || /duplicate key|unique/i.test(jobResText)) {
      return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'This payment has already been used to generate a bid. If you need another, please start a new order or email hello@getcana.co.uk' }) };
    }
    if (!jobRes.ok) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not start your bid. Please email hello@getcana.co.uk with your payment reference.' }) };
    }

    // Review alert is now sent by generate-cana-background WITH the documents
    // attached (subject 'REVIEW REQUESTED'), so no separate alert here.

    // ── Trigger background function ──
    // Return job details to browser, browser will trigger the background function directly
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        paid: true,
        jobId,
        email: stripeEmail,
        tenderId,
        includeSq: !!includeSq,
        tier: paidTier,
        wantsReview: paidTier !== 'none',
        companyDetails: { ...(companyDetails || {}), email: stripeEmail }
      })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
