// Is this email an active Cana member? Used by the client flow to honour
// unlimited bidding. 3-day grace beyond period end covers renewal lag.

const { checkRate, tooMany } = require('./_rate-limit');
const { memberInfo } = require('./_membership');

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (!(await checkRate(event, 'check-membership', 20, 60))) return tooMany(cors);

  try {
    const email = (event.queryStringParameters && event.queryStringParameters.email || '').trim().toLowerCase();
    if (!email) return { statusCode: 400, headers: cors, body: JSON.stringify({ member: false, error: 'Missing email' }) };

    const sbKey = process.env.SUPABASE_ANON_KEY;
    var srv = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Run membership resolution and the account lookup at once. memberInfo does
    // the direct-subscription check first (unchanged for individual members) and
    // falls back to the enterprise owner's subscription for active seats.
    var memPromise = memberInfo(email);

    var acctPromise = srv ? fetch(
      'https://igpjfpncfuawikoyzfcd.supabase.co/auth/v1/admin/users?filter=' + encodeURIComponent(email),
      { headers: { apikey: srv, Authorization: 'Bearer ' + srv } }
    ).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }) : Promise.resolve(null);

    var results = await Promise.all([memPromise, acctPromise]);
    var mem = results[0] || { member: false, via: null, sub: null };
    var acctData = results[1];

    const sub = mem.sub;
    let member = !!mem.member;

    let hasAccount = false;
    if (acctData) {
      var aList = Array.isArray(acctData) ? acctData : (acctData.users || []);
      hasAccount = aList.some(function(u){ return (u.email || '').toLowerCase() === email; });
    }

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        member: member,
        via: mem.via,
        plan: sub ? (sub.plan || null) : null,
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
