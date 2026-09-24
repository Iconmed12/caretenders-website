// Customer accounts admin. Owner/Manager only.
//  - list  : every signed-up user, with their membership status
//  - reset : send that user a password-reset email (they set their own new one)
// Password resets go out as an email link on purpose: nobody, including an
// admin, ever sees or sets the customer's password.
const { requireManager, requireOwner, logAudit } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const action = body.action || 'list';

  // Deleting an account is permanent, so it is owner-only. Listing and sending
  // a reset link stay available to managers.
  const gate = action === 'delete'
    ? await requireOwner(event, 'admin-users:delete', cors)
    : await requireManager(event, 'admin-users', cors);
  if (gate) return gate;

  const srv = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!srv) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Service key not configured' }) };

  const svcHeaders = { apikey: srv, Authorization: 'Bearer ' + srv, 'Content-Type': 'application/json' };

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

      // Active means the status is live AND, if there is an end date, it has not
      // passed (plus a 3 day grace). This matches check-membership, so the admin
      // count and what the customer actually gets can never disagree.
      const ACTIVE = ['active', 'trialing', 'past_due'];
      const GRACE_MS = 3 * 24 * 3600 * 1000;
      function activeNow(sub) {
        if (!sub) return false;
        if (ACTIVE.indexOf(String(sub.status || '').toLowerCase()) === -1) return false;
        if (!sub.current_period_end) return String(sub.status || '').toLowerCase() === 'active';
        return (new Date(sub.current_period_end).getTime() + GRACE_MS) > Date.now();
      }

      const rows = users.map(function (u) {
        const email = String(u.email || '').toLowerCase();
        const meta = u.user_metadata || {};
        const sub = subByEmail[email] || null;
        const isMember = activeNow(sub);
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

      const site = (process.env.URL || 'https://getcana.co.uk').replace(/\/$/, '');
      const r = await fetch(SB_URL + '/auth/v1/recover', {
        method: 'POST',
        headers: { apikey: anon || srv, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, redirect_to: site + '/login.html' })
      });

      if (!r.ok) {
        const t = await r.text();
        return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Could not send reset email', detail: t.slice(0, 160) }) };
      }

      try { await logAudit(event, 'admin-users:password_reset_sent', { email: email }); } catch (e) {}
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, sent: email }) };
    }

    if (action === 'delete') {
      const id = String(body.id || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing user id' }) };

      // Never let an owner delete themselves out of the system.
      const me = String((event._adminIdentity && event._adminIdentity.email) || '').toLowerCase();
      if (email && me && email === me) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'You cannot delete your own account' }) };
      }

      // Staff logins belong to the Staff tab, which also cleans up admin_users.
      if (email.indexOf('@staff.getcana.co.uk') !== -1) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Staff logins are managed on the Staff tab' }) };
      }

      // Protect anyone on the owner allow-list.
      const owners = String(process.env.ADMIN_EMAILS || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      if (email && owners.indexOf(email) !== -1) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'That is an owner account and cannot be deleted here' }) };
      }

      const r = await fetch(SB_URL + '/auth/v1/admin/users/' + encodeURIComponent(id), { method: 'DELETE', headers: svcHeaders });
      if (!r.ok) {
        const t = await r.text();
        return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Could not delete user', detail: t.slice(0, 160) }) };
      }

      // Subscription rows are deliberately left in place: they are the billing
      // record. Deleting the login does not cancel Stripe billing.
      try { await logAudit(event, 'admin-users:user_deleted', { email: email, id: id }); } catch (e) {}
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, deleted: email || id }) };
    }

    if (action === 'set-membership') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing email' }) };
      // Internal accounts (staff/owner on getcana.co.uk) are not customers.
      if (email.indexOf('getcana.co.uk') !== -1) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Internal accounts do not have a membership' }) };
      }

      const patchHeaders = Object.assign({ Prefer: 'return=minimal' }, svcHeaders);
      const note = String(body.note || '').slice(0, 300);
      const plan = body.plan === 'free' ? 'free' : 'member';

      // Downgrade: mark every subscription row for this email cancelled. Rows are
      // kept as the record; check-membership ignores cancelled ones.
      if (plan === 'free') {
        const r = await fetch(SB_URL + '/rest/v1/subscriptions?email=eq.' + encodeURIComponent(email), {
          method: 'PATCH', headers: patchHeaders,
          body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() })
        });
        if (!r.ok && r.status !== 404) {
          const t = await r.text();
          return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Could not downgrade', detail: t.slice(0, 160) }) };
        }
        try { await logAudit(event, 'admin-users:membership_downgraded', { email: email, note: note }); } catch (e) {}
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, membership: { member: false } }) };
      }

      // Upgrade / set: work out the end date from the term and start date.
      const term = parseInt(body.term_months, 10);
      if (!term || term < 1 || term > 60) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Term must be a whole number of months between 1 and 60' }) };
      }
      let start = body.start_date ? new Date(body.start_date) : new Date();
      if (isNaN(start.getTime())) start = new Date();
      const end = new Date(start.getTime());
      end.setMonth(end.getMonth() + term);
      const endISO = end.toISOString();

      const payload = {
        email: email,
        product: 'membership',
        term_months: term,
        status: 'active',
        current_period_end: endISO,
        updated_at: new Date().toISOString()
      };

      // Reuse the latest existing row for this email if there is one, otherwise
      // create a manual row (id prefixed so it is clearly not from Stripe).
      const findRes = await fetch(
        SB_URL + '/rest/v1/subscriptions?email=eq.' + encodeURIComponent(email) + '&select=id&order=current_period_end.desc.nullslast&limit=1',
        { headers: svcHeaders }
      );
      const found = findRes.ok ? await findRes.json() : [];
      const existingId = found && found[0] && found[0].id;

      let w;
      if (existingId) {
        w = await fetch(SB_URL + '/rest/v1/subscriptions?id=eq.' + encodeURIComponent(existingId), {
          method: 'PATCH', headers: patchHeaders, body: JSON.stringify(payload)
        });
      } else {
        payload.id = 'manual_' + Date.now();
        payload.created_at = new Date().toISOString();
        w = await fetch(SB_URL + '/rest/v1/subscriptions', {
          method: 'POST', headers: patchHeaders, body: JSON.stringify(payload)
        });
      }
      if (!w.ok) {
        const t = await w.text();
        return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Could not save membership', detail: t.slice(0, 160) }) };
      }

      try { await logAudit(event, 'admin-users:membership_set', { email: email, term_months: term, current_period_end: endISO, note: note }); } catch (e) {}
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, membership: { member: true, term_months: term, renews: endISO } }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
