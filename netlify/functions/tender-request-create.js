// A logged-in customer sends us the link to a tender they want but cannot find
// on Cana. We save it as a "new" request for the team to source manually. The
// customer's email is taken from their verified Supabase session, never from
// the request body, so a request can never be filed under someone else.

const { checkRate, checkKey, tooMany } = require('./_rate-limit');
const { memberInfo } = require('./_membership');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

// Monthly S.A.T. allowance by plan. Gold is unlimited.
var SAT_LIMITS = { gold: Infinity, pro: 3, access: 1 };
function satLimitFor(plan) { return (plan && SAT_LIMITS[plan] != null) ? SAT_LIMITS[plan] : 1; }
function monthStartISO() { var d = new Date(); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); }

// Verify the caller's Supabase access token and return their identity, or null.
async function verifyUser(event) {
  try {
    var hdrs = (event && event.headers) || {};
    var auth = hdrs.authorization || hdrs.Authorization || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token) return null;
    var anon = process.env.SUPABASE_ANON_KEY;
    var res = await fetch(SB_URL + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return null;
    var user = await res.json();
    if (!user || !user.id) return null;
    return { id: user.id, email: (user.email || '').toLowerCase() };
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!(await checkRate(event, 'tender-request', 6, 60))) return tooMany(cors);

  try {
    var user = await verifyUser(event);
    if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in to request a tender.' }) };

    // Daily cap: at most 10 tender requests per account per day.
    var dayStr = new Date().toISOString().split('T')[0];
    if (!(await checkKey('treq:' + user.id + ':' + dayStr, 10, 86400))) {
      return { statusCode: 429, headers: cors, body: JSON.stringify({ error: 'You have reached today\'s limit of 10 tender requests. Please try again tomorrow, or email hello@getcana.co.uk.' }) };
    }

    var body = JSON.parse(event.body || '{}');
    var link = (body.link || '').trim();
    var note = (body.note || '').trim().substring(0, 1000);
    var companyName = (body.companyName || '').trim().substring(0, 200);
    if (!link) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Please paste the tender link.' }) };
    if (!/^https?:\/\/.+/i.test(link)) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'That does not look like a link. It should start with http.' }) };
    if (link.length > 1000) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'That link is too long.' }) };
    // Reject characters that do not belong in a URL and could be used to inject
    // markup/script when the link is later displayed (defence in depth).
    if (/[\s<>"'`\\]/.test(link)) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'That link contains invalid characters. Please paste the plain web address.' }) };

    var SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    // Per-plan monthly limit: Gold unlimited, Pro 3, Access 1 (team members use the
    // owner's plan, resolved by memberInfo). Locks automatically once used up.
    var mem = await memberInfo(user.email);
    var plan = (mem && mem.sub && mem.sub.plan) || null;
    var limit = satLimitFor(plan);
    if (limit !== Infinity) {
      var cntRes = await fetch(SB_URL + '/rest/v1/tender_requests?user_id=eq.' + encodeURIComponent(user.id) + '&created_at=gte.' + encodeURIComponent(monthStartISO()) + '&select=id', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
      var used = cntRes.ok ? (await cntRes.json()).length : 0;
      if (used >= limit) {
        return { statusCode: 429, headers: cors, body: JSON.stringify({ error: 'You have used your ' + limit + ' S.A.T. request' + (limit > 1 ? 's' : '') + ' for this month.' + (plan === 'gold' ? '' : ' Upgrade your plan for more.'), limitReached: true, limit: limit, used: used, plan: plan }) };
      }
    }

    var row = {
      user_id: user.id,
      email: user.email,
      company_name: companyName,
      link: link,
      note: note,
      status: 'new'
    };
    var ins = await fetch(SB_URL + '/rest/v1/tender_requests', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row)
    });
    if (!ins.ok) { var et = await ins.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not save your request: ' + et.substring(0, 150) }) }; }

    // Let the team know a request came in (best effort, never blocks the save).
    // Every customer-supplied value is HTML-escaped before going into the email.
    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    try {
      var RESEND = process.env.RESEND_API_KEY;
      if (RESEND) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Cana <noreply@getcana.co.uk>',
            to: 'hello@getcana.co.uk',
            subject: 'Tender request from ' + (companyName || user.email),
            html: '<p><strong>New tender request</strong></p>' +
              '<p>From: ' + esc(user.email) + (companyName ? ' (' + esc(companyName) + ')' : '') + '</p>' +
              '<p>Link: <a href="' + esc(link) + '">' + esc(link) + '</a></p>' +
              (note ? '<p>Note: ' + esc(note) + '</p>' : '') +
              '<p>See the Requests inbox in the admin panel to action it.</p>'
          })
        });
      }
    } catch (e) { console.log('Request notify email failed:', e.message); }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
