// One-step sign-up for an INVITED teammate.
//
// The invite email you were sent is the verification, so there is no second
// "confirm your email" step: this creates the account already confirmed (via the
// admin API), links the invited seat, marks the invite accepted, and returns so
// the browser can sign the person straight in and drop them on the dashboard.
//
// The email is forced to the invite's email (the invitee cannot change it) and
// the company is the inviting organisation, so nothing is typed that should be
// pre-set. Normal (non-invited) sign-ups still go through register.html.

const { checkRate, tooMany } = require('./_rate-limit');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!(await checkRate(event, 'enterprise-signup', 6, 300))) return tooMany(cors);

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server not configured.' }) };
  function sb(path, opts) { return fetch(SB_URL + path, Object.assign({ headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' } }, opts || {})); }

  try {
    var body = JSON.parse(event.body || '{}');
    var tok = (body.token || '').trim();
    var firstName = (body.firstName || '').trim().substring(0, 60);
    var lastName = (body.lastName || '').trim().substring(0, 60);
    var password = String(body.password || '');

    if (!tok) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing invitation token.' }) };
    if (!firstName) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Please enter your first name.' }) };
    if (password.length < 8) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Please choose a password of at least 8 characters.' }) };

    // Validate the invite.
    var iRes = await sb('/rest/v1/enterprise_invites?token=eq.' + encodeURIComponent(tok) + '&select=*&limit=1');
    var inv = iRes.ok ? (await iRes.json())[0] : null;
    if (!inv) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'This invitation is not valid.' }) };
    if (inv.status !== 'pending') return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'This invitation has already been used.' }) };
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return { statusCode: 410, headers: cors, body: JSON.stringify({ error: 'This invitation has expired. Please ask for a new one.' }) };

    var email = (inv.email || '').toLowerCase();
    if (!email) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'This invitation has no email on file.' }) };

    // Company name for the account metadata: the inviting organisation.
    var companyName = '';
    var eRes = await sb('/rest/v1/enterprises?id=eq.' + encodeURIComponent(inv.enterprise_id) + '&select=name,owner_user_id&limit=1');
    var ent = eRes.ok ? (await eRes.json())[0] : null;
    if (ent) {
      companyName = ent.name || '';
      if (ent.owner_user_id) {
        var pRes = await sb('/rest/v1/company_profiles?user_id=eq.' + encodeURIComponent(ent.owner_user_id) + '&select=company_name&limit=1');
        var prof = pRes.ok ? (await pRes.json())[0] : null;
        if (prof && prof.company_name) companyName = prof.company_name;
      }
    }

    // Create the account, already confirmed (the invite email is the verification).
    var cRes = await sb('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName, company_name: companyName }
      })
    });
    var created = await cRes.json().catch(function () { return {}; });
    if (!cRes.ok) {
      var msg = (created && (created.msg || created.message || created.error_description || created.error)) || '';
      if (/already been registered|already registered|exists/i.test(msg)) {
        return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'You already have a Cana account with this email. Please sign in to accept the invitation instead.', existing: true }) };
      }
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: (msg || 'Could not create your account.').substring(0, 160) }) };
    }
    var userId = created.id || (created.user && created.user.id);
    if (!userId) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Account created but could not be linked. Please contact hello@getcana.co.uk' }) };

    // Link the invited seat to the new account and activate it.
    var upd = await sb('/rest/v1/enterprise_members?enterprise_id=eq.' + encodeURIComponent(inv.enterprise_id) + '&email=eq.' + encodeURIComponent(email) + '&status=eq.invited', {
      method: 'PATCH',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, status: 'active', joined_at: new Date().toISOString() })
    });
    var rows = upd.ok ? await upd.json() : [];
    if (!Array.isArray(rows) || !rows.length) {
      // The seat could not be linked (already taken or removed). The account
      // still exists; tell them to sign in and contact support if needed.
      return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'Your account was created but the team seat is no longer available. Please sign in, or ask for a new invitation.' }) };
    }

    // Mark the invite used.
    await sb('/rest/v1/enterprise_invites?token=eq.' + encodeURIComponent(tok), {
      method: 'PATCH',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'accepted' })
    });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, email: email, enterprise: ent ? ent.name : '', department: inv.department || '' }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
