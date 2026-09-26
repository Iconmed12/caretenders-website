// Returns the signed-in member's included-review allowance for this month, per
// type, shared across their company circle. The app uses it to show how many
// response / full tender reviews are left before Generate.

const { memberInfo, enterpriseScope } = require('./_membership');
const { limitsFor, countReviewUsage } = require('./_reviews');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

async function verifyUser(event) {
  try {
    var hdrs = (event && event.headers) || {};
    var auth = hdrs.authorization || hdrs.Authorization || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token) return null;
    var anon = process.env.SUPABASE_ANON_KEY;
    var res = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    var u = await res.json();
    if (!u || !u.id) return null;
    return { id: u.id, email: (u.email || '').toLowerCase() };
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    var user = await verifyUser(event);
    if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

    var svcKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    var mem = await memberInfo(user.email);
    var plan = (mem && mem.sub && mem.sub.plan) || null;
    var limits = limitsFor(plan);

    var scope = await enterpriseScope(user.email);
    var emails = scope && scope.emails && scope.emails.length ? scope.emails : null;

    var usedResponse = await countReviewUsage(emails, user.id, 'response', svcKey);
    var usedFull = await countReviewUsage(emails, user.id, 'full', svcKey);

    function box(type, used) {
      var limit = limits[type] || 0;
      return { limit: limit, used: used, remaining: Math.max(0, limit - used) };
    }

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        plan: plan,
        member: !!(mem && mem.member),
        shared: !!(scope && scope.emails && scope.emails.length > 1),
        response: box('response', usedResponse),
        full: box('full', usedFull),
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
