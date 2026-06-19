// Is this email an active Cana member? Used by the client flow to honour
// unlimited bidding. 3-day grace beyond period end covers renewal lag.

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const email = (event.queryStringParameters && event.queryStringParameters.email || '').trim().toLowerCase();
    if (!email) return { statusCode: 400, headers: cors, body: JSON.stringify({ member: false, error: 'Missing email' }) };

    const sbKey = process.env.SUPABASE_ANON_KEY;
    var srv = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Run BOTH lookups at once instead of waiting for one then the other
    var subPromise = fetch(
      'https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/subscriptions' +
      '?email=eq.' + encodeURIComponent(email) +
      '&status=in.(active,trialing,past_due)' +
      '&select=id,status,term_months,current_period_end,created_at' +
      '&order=current_period_end.desc&limit=1',
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
    ).then(function(r){ return r.json(); }).catch(function(){ return []; });

    var acctPromise = srv ? fetch(
      'https://igpjfpncfuawikoyzfcd.supabase.co/auth/v1/admin/users?filter=' + encodeURIComponent(email),
      { headers: { apikey: srv, Authorization: 'Bearer ' + srv } }
    ).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }) : Promise.resolve(null);

    var results = await Promise.all([subPromise, acctPromise]);
    var rows = results[0];
    var acctData = results[1];

    const sub = Array.isArray(rows) && rows[0];
    let member = false;
    if (sub) {
      if (!sub.current_period_end) member = sub.status === 'active';
      else member = (new Date(sub.current_period_end).getTime() + 3 * 24 * 3600 * 1000) > Date.now();
    }

    let hasAccount = false;
    if (acctData) {
      var aList = Array.isArray(acctData) ? acctData : (acctData.users || []);
      hasAccount = aList.some(function(u){ return (u.email || '').toLowerCase() === email; });
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
