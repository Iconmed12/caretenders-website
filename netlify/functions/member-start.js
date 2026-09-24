// Starts a Cana generation job for an ACTIVE MEMBER without a Stripe payment.
// Mirrors cana-verify's job creation exactly; membership is re-verified
// server-side so the bypass cannot be forged from the browser.

const { checkRate, checkKey, tooMany } = require('./_rate-limit');
const { memberInfo } = require('./_membership');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (!(await checkRate(event, 'member-start', 8, 60))) return tooMany(cors);

  try {
    const { companyDetails, tenderId, includeSq, accessToken, wantsReview, reviewSessionId } = JSON.parse(event.body);
    const email = (companyDetails && companyDetails.email || '').trim().toLowerCase();
    if (!email || !tenderId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing email or tender' }) };
    }

    const sbKey = process.env.SUPABASE_ANON_KEY;                                   // for the /auth/v1/user identity check
    const svcKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY; // for DB (works once RLS is on)
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // ── Identity check: the login token must belong to this email ──
    // Knowing a member's email is not enough; they must be signed in as them.
    if (!accessToken) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in to use your membership' }) };
    }
    const userRes = await fetch(sbUrl + '/auth/v1/user', {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + accessToken }
    });
    if (!userRes.ok) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Sign-in could not be verified. Please sign in again.' }) };
    }
    const userData = await userRes.json();
    const authedEmail = (userData && userData.email || '').toLowerCase();
    if (!authedEmail || authedEmail !== email) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'This membership belongs to a different account. Sign in with the email you joined with.' }) };
    }

    // ── Server-side membership check (never trust the browser) ──
    // memberInfo checks the person's own subscription first (unchanged), then
    // falls back to the enterprise owner's subscription for an active seat.
    const mem = await memberInfo(email);
    if (!mem.member) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'No active membership found for ' + email }) };
    }

    // ── Paid add-on: verify the REAL Stripe payment before generating ──
    // A member's base bid is free, but a paid add-on (expert review) must be
    // paid for. We retrieve the exact Stripe checkout session by id and confirm
    // it is paid, is a review product, and is for THIS tender. This closes the
    // hole where someone could hit the return URL without paying.
    var verifiedTier = 'none';
    if (wantsReview) {
      if (!reviewSessionId) {
        return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Add-on payment was not found. Please try again or email hello@getcana.co.uk' }) };
      }
      const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;
      const sessRes = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(reviewSessionId), {
        headers: { Authorization: 'Bearer ' + stripeKey, 'Stripe-Version': '2024-06-20' }
      });
      const sess = await sessRes.json();
      const okPaid = sess && sess.payment_status === 'paid';
      const okProduct = sess && sess.metadata && sess.metadata.product === 'review';
      const okTender = sess && sess.metadata && String(sess.metadata.tender_id || '') === String(tenderId);
      if (!okPaid || !okProduct || !okTender) {
        return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Add-on payment could not be confirmed. If you were charged, email hello@getcana.co.uk with your reference.' }) };
      }
      verifiedTier = (sess.metadata.tier === 'review_docs') ? 'review_docs' : 'review';
    }

    // ── Daily anti-extraction cap: at most 10 DISTINCT tenders per member per
    // day. Multi-lot is safe: extra lots of the same tender do not count again,
    // because the first generation for a tender "claims" it for the day and only
    // that first one is counted against the daily variety cap. ──
    var dayStr = new Date().toISOString().split('T')[0];
    var firstForTender = await checkKey('gentender:' + authedEmail + ':' + dayStr + ':' + tenderId, 1, 86400);
    if (firstForTender) {
      var underDailyCap = await checkKey('genvariety:' + authedEmail + ':' + dayStr, 10, 86400);
      if (!underDailyCap) {
        return { statusCode: 429, headers: cors, body: JSON.stringify({ error: 'You have reached today\'s limit of 10 tenders. Please email hello@getcana.co.uk if you need more today.' }) };
      }
    }

    // ── Create job record (identical shape to cana-verify) ──
    var jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    var jobRes = await fetch(sbUrl + '/rest/v1/cana_jobs', {
      method: 'POST',
      headers: { apikey: svcKey, Authorization: 'Bearer ' + svcKey, 'Content-Type': 'application/json', Prefer: 'return=representation' },
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
        wantsReview: verifiedTier !== 'none',
        tier: verifiedTier,
        companyDetails: Object.assign({}, companyDetails || {}, { email: email })
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
