// Scheduled daily. Finds tenders that have recently gone live and emails each
// member the ones that match their saved alert. Runs tokenless from Netlify's
// scheduler. Push notifications are intentionally not here yet (they need a
// store build); this is the email channel.

const vocab = require('./_alerts-vocab');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const LIVE = ['live', 'open', 'closing', 'urgent'];
const COLS = 'id,title,org,region,value,deadline,category,description,link,source_url,status,created_at';
const MAX_PER_EMAIL = 15;

function svcKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tenderRow(t) {
  const value = t.value ? esc(String(t.value)) : '';
  const region = t.region ? esc(String(t.region)) : '';
  const deadline = t.deadline ? 'Closes ' + esc(String(t.deadline)) : '';
  const meta = [value, region, deadline].filter(Boolean).join('  ·  ');
  const link = t.link || t.source_url || 'https://getcana.co.uk/dashboard.html';
  return (
    '<tr><td style="padding:14px 16px;border:1px solid #E4E9EE;border-radius:12px;">' +
    '<div style="font-size:15px;font-weight:700;color:#0B1929;">' + esc(t.title || 'Tender') + '</div>' +
    (t.org ? '<div style="font-size:13px;color:#6B8FA3;margin-top:2px;">' + esc(t.org) + '</div>' : '') +
    (meta ? '<div style="font-size:12px;color:#6B8FA3;margin-top:8px;">' + meta + '</div>' : '') +
    '<div style="margin-top:10px;"><a href="' + esc(link) + '" style="font-size:13px;font-weight:700;color:#0099AA;text-decoration:none;">View tender &rarr;</a></div>' +
    '</td></tr><tr><td style="height:10px;"></td></tr>'
  );
}

function digestHtml(name, tenders) {
  const rows = tenders.slice(0, MAX_PER_EMAIL).map(tenderRow).join('');
  const more = tenders.length > MAX_PER_EMAIL
    ? '<p style="font-size:13px;color:#6B8FA3;">and ' + (tenders.length - MAX_PER_EMAIL) + ' more in the app.</p>'
    : '';
  return (
    '<div style="font-family:Inter,Arial,sans-serif;background:#F4F6F9;padding:24px;">' +
    '<div style="max-width:560px;margin:0 auto;">' +
    '<div style="font-size:20px;font-weight:800;color:#0B1929;">Cana <span style="color:#00C9E0;">Bids</span></div>' +
    '<h1 style="font-size:19px;color:#0B1929;margin:18px 0 4px;">New tenders that match your alerts</h1>' +
    '<p style="font-size:13px;color:#6B8FA3;margin:0 0 18px;">' + (tenders.length) + (tenders.length === 1 ? ' new match' : ' new matches') + ' since we last checked.</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;">' + rows + '</table>' +
    more +
    '<p style="font-size:12px;color:#9AA7B3;margin-top:20px;line-height:1.6;">You are getting this because you set up tender alerts. ' +
    'Change what you get alerted about in the Cana app under Tender alerts, or on getcana.co.uk/alerts.html.</p>' +
    '</div></div>'
  );
}

async function sendEmail(to, subject, html) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@getcana.co.uk';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Cana Bids <' + fromEmail + '>', to: to, subject: subject, html: html }),
  });
  return r.ok;
}

// Push to every device this user has registered, via Expo's push service.
async function sendPush(userId, matches, sbHeaders) {
  const tRes = await fetch(SB_URL + '/rest/v1/push_tokens?user_id=eq.' + userId + '&select=token', { headers: sbHeaders });
  const toks = tRes.ok ? await tRes.json() : [];
  if (!toks.length) return false;
  const title = matches.length === 1 ? 'New tender match' : matches.length + ' new tender matches';
  const body = matches[0].title || 'Tap to view in Cana Bids';
  const messages = toks.map(function (t) {
    return { to: t.token, title: title, body: body, sound: 'default', data: { type: 'alerts' } };
  });
  const r = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  return r.ok;
}

exports.handler = async () => {
  const key = svcKey();
  if (!key) return { statusCode: 500, body: 'Not configured' };
  const sbHeaders = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

  const isMonday = new Date().getUTCDay() === 1;

  // Recent live tenders (a 2 day window covers approval lag; per-member we only
  // count tenders newer than that member's last alert).
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const tRes = await fetch(
    SB_URL + '/rest/v1/tenders?select=' + COLS +
    '&status=in.(' + LIVE.join(',') + ')&created_at=gte.' + since +
    '&order=created_at.desc&limit=300',
    { headers: sbHeaders }
  );
  const recent = tRes.ok ? await tRes.json() : [];

  // Everyone with an alert set up (we decide per row whether to email, push, or both).
  const aRes = await fetch(
    SB_URL + '/rest/v1/tender_alerts?select=*',
    { headers: sbHeaders }
  );
  const alerts = aRes.ok ? await aRes.json() : [];

  let sent = 0;
  for (const a of alerts) {
    if (!a.email_on && !a.push_on) continue;
    if (a.frequency === 'weekly' && !isMonday) continue;

    const cutoff = a.last_notified_at ? new Date(a.last_notified_at).getTime() : (Date.now() - 2 * 24 * 60 * 60 * 1000);
    const matches = recent.filter(function (t) {
      const made = new Date(t.created_at).getTime();
      if (made <= cutoff) return false;
      return vocab.matchTender(t, a);
    });

    if (!matches.length) continue;

    let delivered = false;
    if (a.email_on) {
      const subject = matches.length === 1
        ? 'A new tender matches your alerts'
        : matches.length + ' new tenders match your alerts';
      if (await sendEmail(a.email, subject, digestHtml(a.email, matches))) delivered = true;
    }
    if (a.push_on) {
      if (await sendPush(a.user_id, matches, sbHeaders)) delivered = true;
    }

    if (delivered) {
      sent++;
      await fetch(
        SB_URL + '/rest/v1/tender_alerts?user_id=eq.' + a.user_id,
        { method: 'PATCH', headers: Object.assign({}, sbHeaders, { Prefer: 'return=minimal' }), body: JSON.stringify({ last_notified_at: new Date().toISOString() }) }
      );
    }
  }

  return { statusCode: 200, body: JSON.stringify({ alerts: alerts.length, recent: recent.length, sent: sent }) };
};
