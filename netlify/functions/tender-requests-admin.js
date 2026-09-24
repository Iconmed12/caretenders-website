// Admin inbox for customer tender requests.
//   GET  -> list all requests (most recent first)
//   POST -> update one request's status (and optionally link it to a tender or
//           add an internal note). When the status becomes "ready" or
//           "cannot_source" the customer is emailed automatically.
// Admin-gated with the shared requireAdmin helper.

const { requireAdmin, logAudit } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const FROM = 'Cana <noreply@getcana.co.uk>';
const SITE = 'https://getcana.co.uk';
const VALID = ['new', 'sourcing', 'ready', 'cannot_source'];

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const denied = await requireAdmin(event, 'tender-requests-admin', cors);
  if (denied) return denied;

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  function sb(path, opts) {
    return fetch(SB_URL + path, Object.assign({ headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' } }, opts || {}));
  }

  try {
    if (event.httpMethod === 'GET') {
      var res = await sb('/rest/v1/tender_requests?select=*&order=created_at.desc&limit=200');
      if (!res.ok) { var et = await res.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: et.substring(0, 150) }) }; }
      var rows = await res.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify({ requests: Array.isArray(rows) ? rows : [] }) };
    }

    // POST: update one request
    var body = JSON.parse(event.body || '{}');
    var id = (body.id || '').trim();
    var status = (body.status || '').trim();
    if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing request id.' }) };
    if (status && VALID.indexOf(status) === -1) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown status.' }) };

    var patch = { updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    if (typeof body.tenderId === 'string') patch.tender_id = body.tenderId.trim() || null;
    if (typeof body.adminNote === 'string') patch.admin_note = body.adminNote.substring(0, 1000);

    var upd = await sb('/rest/v1/tender_requests?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
    if (!upd.ok) { var e2 = await upd.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e2.substring(0, 150) }) }; }
    var updatedRows = await upd.json();
    var reqRow = Array.isArray(updatedRows) ? updatedRows[0] : null;

    // Email the customer when the request reaches a customer-facing outcome.
    var emailed = false;
    if (reqRow && reqRow.email && (status === 'ready' || status === 'cannot_source')) {
      var RESEND = process.env.RESEND_API_KEY;
      if (RESEND) {
        var subject, html;
        if (status === 'ready') {
          subject = 'Your requested tender is ready on Cana';
          html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
            '<div style="background:#0B1929;padding:20px;border-radius:8px 8px 0 0;"><h1 style="color:#00C9E0;margin:0;">Cana</h1></div>' +
            '<div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">' +
            '<h2 style="color:#0B1929;margin:0 0 12px;">Good news, it is ready</h2>' +
            '<p style="color:#374151;">The tender you asked us to find is now on your Cana dashboard and ready to generate.</p>' +
            '<p style="margin:20px 0;"><a href="' + SITE + '/dashboard.html" style="display:inline-block;background:#00C9E0;color:#0B1929;font-weight:700;padding:11px 22px;border-radius:8px;text-decoration:none;">Go to your dashboard</a></p>' +
            '<p style="color:#9ca3af;font-size:12px;">Cana | hello@getcana.co.uk</p></div></div>';
        } else {
          subject = 'About the tender you asked us to find';
          html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
            '<div style="background:#0B1929;padding:20px;border-radius:8px 8px 0 0;"><h1 style="color:#00C9E0;margin:0;">Cana</h1></div>' +
            '<div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">' +
            '<h2 style="color:#0B1929;margin:0 0 12px;">We could not add this one</h2>' +
            '<p style="color:#374151;">Thank you for sending it over. Unfortunately we were not able to add this particular tender to Cana' +
            (reqRow.admin_note ? ': ' + String(reqRow.admin_note).replace(/</g, '&lt;') : '.') + '</p>' +
            '<p style="color:#374151;">If you have another link or any questions, just reply to this email and we will help.</p>' +
            '<p style="color:#9ca3af;font-size:12px;">Cana | hello@getcana.co.uk</p></div></div>';
        }
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, to: reqRow.email, subject: subject, html: html })
          });
          emailed = true;
        } catch (e) { console.log('Customer status email failed:', e.message); }
      }
    }

    await logAudit(event, 'tender-request-update', { id: id, status: status || '(none)', emailed: emailed });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, emailed: emailed, request: reqRow }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
