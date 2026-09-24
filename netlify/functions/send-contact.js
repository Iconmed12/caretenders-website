// Contact form handler. Takes a message from the public contact page and emails
// it to the team inbox via Resend, the same service the rest of the site uses.
//
// Reply-to is set to the sender, so a reply from the inbox goes straight back to
// them. A hidden honeypot field catches bots: if it is filled, we quietly accept
// and drop the message rather than emailing spam.
const { checkRate, tooMany } = require('./_rate-limit');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (!(await checkRate(event, 'contact', 5, 60))) return tooMany(cors);
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const name    = String(body.name    || '').trim().slice(0, 200);
    const email   = String(body.email   || '').trim().slice(0, 200);
    const company = String(body.company || '').trim().slice(0, 200);
    const reason  = String(body.reason  || 'General enquiry').trim().slice(0, 120);
    const message = String(body.message || '').trim().slice(0, 5000);
    const website = String(body.website || '').trim(); // honeypot

    // Bot filled the hidden field. Look successful, send nothing.
    if (website) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };

    // Basic validation, mirroring the form.
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!name || !emailOk || message.length < 2) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Please fill in your name, a valid email and a message.' }) };
    }

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@getcana.co.uk';
    const toEmail   = 'hello@getcana.co.uk';
    if (!resendKey) {
      console.log('send-contact: RESEND_API_KEY missing');
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Email is not configured.' }) };
    }

    // Escape anything the sender typed before putting it in the HTML email.
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const messageHtml = esc(message).replace(/\n/g, '<br>');

    const html =
      '<div style="font-family:Arial,sans-serif;color:#1c3040;font-size:15px;line-height:1.6">' +
        '<h2 style="color:#0b1929;margin:0 0 12px">New contact form message</h2>' +
        '<p style="margin:0 0 4px"><strong>Reason:</strong> ' + esc(reason) + '</p>' +
        '<p style="margin:0 0 4px"><strong>Name:</strong> ' + esc(name) + '</p>' +
        '<p style="margin:0 0 4px"><strong>Email:</strong> ' + esc(email) + '</p>' +
        (company ? '<p style="margin:0 0 4px"><strong>Company:</strong> ' + esc(company) + '</p>' : '') +
        '<hr style="border:none;border-top:1px solid #e4ecf0;margin:14px 0">' +
        '<p style="margin:0;white-space:pre-wrap">' + messageHtml + '</p>' +
      '</div>';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Cana Contact <' + fromEmail + '>',
        to: toEmail,
        reply_to: email,
        subject: 'Contact form: ' + reason + ' from ' + name,
        html: html
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      console.log('send-contact: Resend error', r.status, detail.slice(0, 300));
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Could not send the message.' }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.log('send-contact: error', e.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Something went wrong.' }) };
  }
};
