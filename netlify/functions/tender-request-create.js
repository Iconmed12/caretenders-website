// A logged-in customer sends us the link to a tender they want but cannot find
// on Cana. We save it as a "new" request for the team to source manually. The
// customer's email is taken from their verified Supabase session, never from
// the request body, so a request can never be filed under someone else.

const { checkRate, tooMany } = require('./_rate-limit');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

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
