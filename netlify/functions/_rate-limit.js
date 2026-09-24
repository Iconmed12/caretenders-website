// Shared, best-effort rate limiter for public endpoints. Backed by a Postgres
// function (rl_hit) so the count is atomic and shared across all of Netlify's
// serverless instances. It FAILS OPEN: if the limiter or database is
// unavailable, the request is allowed, so a limiter problem can never block a
// genuine customer. Leading underscore means Netlify does not treat this file
// as its own endpoint.

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

function clientIp(event) {
  var h = (event && event.headers) || {};
  return h['x-nf-client-connection-ip'] ||
    (h['x-forwarded-for'] || '').split(',')[0].trim() ||
    h['client-ip'] || 'unknown';
}

// Returns true if the caller is allowed, false if they are over the limit.
// bucket: a short name for the endpoint (e.g. 'checkout'); limit: max hits in
// the window; windowSec: window length in seconds.
async function checkRate(event, bucket, limit, windowSec) {
  try {
    var SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!SB_KEY) return true; // no key configured -> do not block
    var key = bucket + ':' + clientIp(event);
    var res = await fetch(SB_URL + '/rest/v1/rpc/rl_hit', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key, p_limit: limit, p_window: windowSec })
    });
    if (!res.ok) return true; // limiter error -> fail open
    var allowed = await res.json();
    return allowed !== false;
  } catch (e) {
    return true; // any failure -> fail open
  }
}

function tooMany(corsHeaders) {
  return {
    statusCode: 429,
    headers: corsHeaders || { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' })
  };
}

module.exports = { checkRate, tooMany, clientIp };
