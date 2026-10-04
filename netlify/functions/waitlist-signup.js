// Pre-launch waitlist signup from the coming-soon page. Stores the email (and
// the referrer, so we can see how people found us), emails the person a short
// confirmation, and pings the team inbox. Public endpoint, rate limited.

const { checkRate, tooMany } = require('./_rate-limit');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

async function sendEmail(to, subject, html, replyTo) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@getcana.co.uk';
  const body = { from: 'Cana Bids <' + from + '>', to: to, subject: subject, html: html };
  if (replyTo) body.reply_to = replyTo;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) { /* best effort */ }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!(await checkRate(event, 'waitlist-signup', 10, 60))) return tooMany(cors);

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  const email = String(body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Please enter a valid email address.' }) };

  const hdrs = event.headers || {};
  const referer = String(hdrs.referer || hdrs.referrer || '').slice(0, 500);
  const ua = String(hdrs['user-agent'] || '').slice(0, 500);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server not configured.' }) };
  const sbHeaders = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

  try {
    // Upsert so a repeat signup is a no-op success rather than an error.
    const res = await fetch(SB_URL + '/rest/v1/waitlist?on_conflict=email', {
      method: 'POST',
      headers: Object.assign({}, sbHeaders, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ email: email, referer: referer, user_agent: ua }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not add you. Please try again.', detail: t }) };
    }

    // Confirmation to the person, and a heads-up (with referrer) to the team.
    await sendEmail(
      email,
      'You are on the Cana Bids list',
      '<div style="font-family:Inter,Arial,sans-serif;color:#0B1929;font-size:15px;line-height:1.6">'
      + '<p style="font-size:20px;font-weight:800">Cana <span style="color:#00C9E0">Bids</span></p>'
      + '<p>Thanks for your interest. You are on the list, and we will email you the moment Cana Bids is live.</p>'
      + '<p>In the meantime, if you have a tender you are working on, just reply to this email and tell us about it.</p>'
      + '<p style="color:#6B8FA3;font-size:13px">Cana Bids, UK public sector tendering</p></div>'
    );
    await sendEmail(
      'hello@getcana.co.uk',
      'New waitlist signup: ' + email,
      '<p>New pre-launch signup.</p><p><b>Email:</b> ' + email + '</p><p><b>Found us via:</b> ' + (referer || 'unknown') + '</p>',
      email
    );

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
