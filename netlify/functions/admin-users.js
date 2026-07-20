// Customer accounts admin. Owner/Manager only.
//  - list  : every signed-up user, with their membership status
//  - reset : send that user a password-reset email (they set their own new one)
// Password resets go out as an email link on purpose: nobody, including an
// admin, ever sees or sets the customer's password.
const { requireManager, logAudit } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const gate = await requireManager(event, 'admin-users', cors);
  if (gate) return gate;

  const srv = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!srv) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Service key not configured' }) };

  const svcHeaders = { apikey: srv, Authorization: 'Bearer ' + srv, 'Content-Type': 'application/json' };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const action = body.action || 'list';

  try {
    if (action === 'list') {
      // Auth users (paged, service key). Staff logins live on the Staff tab, so
      // they are flagged rather than mixed in with real customers.
      let users = [];
      for (let page = 1; page <= 10; page++) {
        const r = await fetch(SB_URL + '/auth/v1/admin/users?page=' + page + '&per_page=200', { headers: svcHeaders });
        if (!r.ok) break;
        const j = await r.json();
        const batch = j.users || j || [];
        if (!batch.length) break;
        users = users.concat(batch);
        if (batch.length < 200) break;
      }

      // Membership from the subscriptions table, newest period first
      const subRes = await fetch(
        SB_URL + '/rest/v1/subscriptions?select=email,status,term_months,current_period_end,created_at&order=current_period_end.desc',
        { headers: { apikey: srv, Authorization: 'Bearer ' + srv } }
      );
      const subs = subRes.ok ? await subRes.json() : [];
      const subByEmail = {};
      (Array.isArray(subs) ? subs : []).forEach(function (s) {
        const key = String(s.email || '').toLowerCase();
        if (key && !subByEmail[key]) subByEmail[key] = s;   // first = latest period
      });

      const ACTIVE = ['active', 'trialing', 'past_due'];
      const rows = users.map(function (u) {
        const email = String(u.email || '').toLowerCase();
        const meta = u.user_metadata || {};
        const sub = subByEmail[email] || null;
        const isMember = !!(sub && ACTIVE.indexOf(String(sub.status || '').toLowerCase()) !== -1);
        return {
          id: u.id,
          email: u.email || '',
          name: [meta.first_name || '', meta.last_name || ''].join(' ').trim(),
          company: meta.company || meta.company_name || '',
          created_at: u.created_at || '',
          last_sign_in_at: u.last_sign_in_at || '',
          confirmed: !!(u.email_confirmed_at || u.confirmed_at),
          is_staff: email.indexOf('@staff.getcana.co.uk') !== -1,
          membership: {
            member: isMember,
            status: sub ? sub.status : null,
            term_months: sub ? sub.term_months : null,
            renews: sub ? sub.current_period_end : null
          }
        };
      });

      rows.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });

      return { statusCode: 200, headers: cors, body: JSON.stringify({
        users: rows,
        counts: {
          total: rows.filter(function(r){ return !r.is_staff; }).length,
          members: rows.filter(function(r){ return r.membership.member && !r.is_staff; }).length,
          staff: rows.filter(function(r){ return r.is_staff; }).length
        }
      }) };
    }

    if (action === 'reset') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing email' }) };

      const site = (process.env.URL || 'https://caretenders-website.netlify.app').replace(/\/$/, '');
      const r = await fetch(SB_URL + '/auth/v1/recover', {
        method: 'POST',
        headers: { apikey: anon || srv, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, redirect_to: site + '/login.html' })
      });

      if (!r.ok) {
        const t = await r.text();
        return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Could not send reset email', detail: t.slice(0, 160) }) };
      }

      try { await logAudit(event, 'admin-users', 'password_reset_sent', { email: email }); } catch (e) {}
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, sent: email }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
