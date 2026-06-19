// Is this email an active Cana member? Used by the client flow to honour
// unlimited bidding. 3-day grace beyond period end covers renewal lag.

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const email = (event.queryStringParameters && event.queryStringParameters.email || '').trim().toLowerCase();
    if (!email) return { statusCode: 400, headers: cors, body: JSON.stringify({ member: false, error: 'Missing email' }) };

    const sbKey = process.env.SUPABASE_ANON_KEY;
    const res = await fetch(
      'https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/subscriptions' +
      '?email=eq.' + encodeURIComponent(email) +
      '&status=in.(active,trialing,past_due)' +
      '&select=id,status,term_months,current_period_end,created_at' +
      '&order=current_period_end.desc&limit=1',
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
    );
    const rows = await res.json();
    const sub = Array.isArray(rows) && rows[0];

    let member = false;
    if (sub) {
      if (!sub.current_period_end) member = sub.status === 'active';
      else member = (new Date(sub.current_period_end).getTime() + 3 * 24 * 3600 * 1000) > Date.now();
    }

    // Does a site account exist for this email? Drives the 'please sign in' prompt.
    let hasAccount = false;
    var srv = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (srv) {
      try {
        // The admin filter param is GoTrue-version dependent; fetch a page and match.
        var uRes = await fetch(
          'https://igpjfpncfuawikoyzfcd.supabase.co/auth/v1/admin/users?per_page=200',
          { headers: { apikey: srv, Authorization: 'Bearer ' + srv } }
        );
        if (uRes.ok) {
          var uData = await uRes.json();
          var list = Array.isArray(uData) ? uData : (uData.users || []);
          hasAccount = list.some(function(u){ return (u.email || '').toLowerCase() === email; });
        } else {
          console.log('admin users lookup failed:', uRes.status);
        }
      } catch (e) { console.log('account check error:', e.message); }
    } else {
      console.log('SUPABASE_SERVICE_KEY not set');
    }

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        member: member,
        has_account: hasAccount,
        status: sub ? sub.status : null,
        term_months: sub ? sub.term_months : null,
        current_period_end: sub ? sub.current_period_end : null,
        created_at: sub ? sub.created_at : null
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ member: false, error: err.message }) };
  }
};
