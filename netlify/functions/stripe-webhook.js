// Stripe webhook: keeps the subscriptions table in sync with Stripe.
// Records who is an active Cana member so the platform can honour
// unlimited bidding. Signature-verified with STRIPE_WEBHOOK_SECRET.

const crypto = require('crypto');

function verifySignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  sigHeader.split(',').forEach(p => { const [k, v] = p.split('='); parts[k] = v; });
  if (!parts.t || !parts.v1) return false;
  // Reject events older than 5 minutes (replay protection)
  if (Math.abs(Date.now() / 1000 - parseInt(parts.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(parts.t + '.' + payload, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts.v1, 'hex'));
  } catch (e) { return false; }
}

exports.handler = async (event) => {
  const sbKey = process.env.SUPABASE_ANON_KEY;
  const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  if (!verifySignature(rawBody, sig, whSecret)) {
    console.log('Webhook signature verification FAILED');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  async function upsertSub(row) {
    const res = await fetch(sbUrl + '/rest/v1/subscriptions?on_conflict=id', {
      method: 'POST',
      headers: {
        apikey: sbKey, Authorization: 'Bearer ' + sbKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(Object.assign({ updated_at: new Date().toISOString() }, row))
    });
    if (!res.ok) console.log('Subscription upsert failed:', res.status, (await res.text()).substring(0, 200));
    else console.log('Subscription upserted:', row.id, row.status);
  }

  async function fetchSubscription(subId) {
    const r = await fetch('https://api.stripe.com/v1/subscriptions/' + subId, {
      headers: { Authorization: 'Bearer ' + stripeKey }
    });
    return r.ok ? r.json() : null;
  }

  try {
    const evt = JSON.parse(rawBody);
    const type = evt.type;
    const obj = evt.data && evt.data.object;
    console.log('Webhook event:', type);

    if (type === 'checkout.session.completed' && obj && obj.mode === 'subscription') {
      const email = (obj.customer_details && obj.customer_details.email) || obj.customer_email || '';
      const subId = obj.subscription;
      let periodEnd = null, status = 'active', term = parseInt(obj.metadata && obj.metadata.term_months) || null;
      if (subId) {
        const sub = await fetchSubscription(subId);
        if (sub) {
          periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
          status = sub.status || 'active';
        }
      }
      await upsertSub({
        id: subId || ('cs_' + obj.id),
        email: email.toLowerCase(),
        product: (obj.metadata && obj.metadata.product) || 'membership',
        term_months: term,
        status: status,
        current_period_end: periodEnd
      });

      // Welcome email: tells the member which email unlocks their bidding.
      // Fully guarded, never blocks the webhook response.
      try {
        const RESEND_KEY = process.env.RESEND_API_KEY;
        const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@icongrp.co.uk';
        if (RESEND_KEY && email) {
          const welcomeHtml = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
            '<div style="background:#0B1929;padding:24px;border-radius:8px 8px 0 0;"><h1 style="color:#00C9E0;margin:0;">Cana AI</h1></div>' +
            '<div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">' +
            '<h2 style="color:#0B1929;margin:0 0 12px;">Welcome to Cana Membership</h2>' +
            '<p style="color:#374151;margin:0 0 16px;">Your membership is active. Bid on as many tenders as you want: Cana writes the SQ and responses, emails you the full pack with a submission checklist, and you submit.</p>' +
            '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:16px;">' +
            '<strong style="color:#854d0e;">One important thing:</strong>' +
            '<div style="font-size:13px;color:#92400e;margin-top:6px;line-height:1.7;">Your membership is linked to <strong>' + email + '</strong>. Create your free account (or sign in) with this exact email, and when you bid while signed in your unlimited access unlocks automatically with no payment step.</div>' +
            '</div>' +
            '<p style="padding:4px 0;"><a href="https://caretenders-website.netlify.app/register.html?email=' + encodeURIComponent(email) + '" style="display:inline-block;background:#00C9E0;color:#0B1929;font-weight:700;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;margin-right:8px;">Create your account &rarr;</a> <a href="https://caretenders-website.netlify.app" style="display:inline-block;background:#fff;border:1.5px solid #0B1929;color:#0B1929;font-weight:700;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px;">Browse tenders</a></p>' +
            '<p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:18px;">Cana Consulting Solutions | 01268 20 30 10 | consulting@icongrp.co.uk</p>' +
            '</div></div>';
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Cana AI <' + FROM_EMAIL + '>', to: email, subject: 'Welcome to Cana Membership: one important detail', html: welcomeHtml })
          });
          console.log('Welcome email sent to', email);
        }
      } catch (e) { console.log('Welcome email failed (non-fatal):', e.message); }
    }

    if (type === 'customer.subscription.updated' && obj) {
      await upsertSub({
        id: obj.id,
        status: obj.status,
        current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null
      });
    }

    if (type === 'customer.subscription.deleted' && obj) {
      await upsertSub({ id: obj.id, status: 'cancelled' });
    }

    if ((type === 'invoice.paid' || type === 'invoice.payment_succeeded') && obj && obj.subscription) {
      const sub = await fetchSubscription(obj.subscription);
      if (sub) {
        await upsertSub({
          id: sub.id,
          status: sub.status,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
        });
      }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.log('Webhook handler error:', err.message);
    return { statusCode: 500, body: 'Webhook error' };
  }
};
