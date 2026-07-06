// Owner/Manager-only staff management (Phase 5b).
//
// Each staff member is a real Supabase Auth user (username -> a synthetic email,
// a 6-digit PIN used as the password) plus a row in admin_users carrying their
// role. This function uses the SERVICE key (Supabase Admin API + RLS-bypassing
// table access) and is gated by requireManager, so only an owner or a manager
// can call it. It never creates or modifies an owner account.
//
// Actions (POST JSON { action, ... }):
//   list                                  -> all staff rows
//   create   { username, role, pin }      -> new login (role: manager|admin)
//   setRole  { username, role }           -> change role (manager|admin)
//   setActive{ username, active }         -> deactivate / reactivate login
//   resetPin { username, pin }            -> set a new 6-digit PIN
//   remove   { username }                 -> delete the login and its row

const { requireManager, logAudit } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const STAFF_EMAIL_DOMAIN = 'staff.getcana.co.uk';

function svcKey() { return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY; }
function svcHeaders(extra) {
  var k = svcKey();
  return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {});
}
function emailFor(username) { return String(username).trim().toLowerCase() + '@' + STAFF_EMAIL_DOMAIN; }
function validPin(pin) { return /^[0-9]{6}$/.test(String(pin == null ? '' : pin)); }
function validUsername(u) { return /^[a-z0-9._-]{2,32}$/i.test(String(u || '').trim()); }

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  // Owner or manager only.
  var denied = await requireManager(event, 'admin-manage-staff', cors);
  if (denied) return denied;

  try {
    var body = JSON.parse(event.body || '{}');
    var action = body.action;

    // ---- LIST ----
    if (action === 'list') {
      var lRes = await fetch(SB_URL + '/rest/v1/admin_users?select=email,username,role,active,created_at&order=created_at.desc', { headers: svcHeaders() });
      var rows = lRes.ok ? await lRes.json() : [];
      return { statusCode: 200, headers: cors, body: JSON.stringify({ staff: rows }) };
    }

    // ---- CREATE ----
    if (action === 'create') {
      var username = (body.username || '').trim().toLowerCase();
      var role = body.role;
      var pin = body.pin;
      if (!validUsername(username)) return bad(cors, 'Username must be 2 to 32 letters, numbers, dot, underscore or hyphen');
      if (role !== 'manager' && role !== 'admin') return bad(cors, 'Role must be manager or admin');
      if (!validPin(pin)) return bad(cors, 'PIN must be exactly 6 digits');
      var email = emailFor(username);

      // Create the Supabase Auth user with the PIN as its password.
      var cRes = await fetch(SB_URL + '/auth/v1/admin/users', {
        method: 'POST', headers: svcHeaders(),
        body: JSON.stringify({ email: email, password: String(pin), email_confirm: true, user_metadata: { username: username, role: role } })
      });
      var cData = await cRes.json();
      if (!cRes.ok) return bad(cors, 'Could not create login: ' + ((cData && (cData.msg || cData.error_description || cData.error)) || cRes.status));
      var userId = cData && cData.id;

      // Insert the role row.
      var iRes = await fetch(SB_URL + '/rest/v1/admin_users', {
        method: 'POST', headers: svcHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ email: email, username: username, role: role, active: true, auth_user_id: userId })
      });
      if (!iRes.ok) {
        var iErr = await iRes.text();
        // Roll back the auth user so we do not leave an orphan login.
        if (userId) { try { await fetch(SB_URL + '/auth/v1/admin/users/' + userId, { method: 'DELETE', headers: svcHeaders() }); } catch (e) {} }
        return bad(cors, 'Login could not be saved: ' + iErr.substring(0, 150));
      }
      await logAudit(event, 'staff-create', { username: username, role: role });
      return ok(cors, { username: username, role: role });
    }

    // Remaining actions target an existing staff row.
    var targetEmail = (body.email || (body.username ? emailFor(body.username) : '')).toLowerCase();
    if (!targetEmail) return bad(cors, 'Missing target username');
    var tRes = await fetch(SB_URL + '/rest/v1/admin_users?email=eq.' + encodeURIComponent(targetEmail) + '&select=email,username,role,active,auth_user_id&limit=1', { headers: svcHeaders() });
    var trows = tRes.ok ? await tRes.json() : [];
    var target = trows[0];
    if (!target) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Staff member not found' }) };
    if (target.role === 'owner') return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Cannot modify an owner account here' }) };

    // ---- SET ROLE ----
    if (action === 'setRole') {
      if (body.role !== 'manager' && body.role !== 'admin') return bad(cors, 'Role must be manager or admin');
      var rRes = await fetch(SB_URL + '/rest/v1/admin_users?email=eq.' + encodeURIComponent(targetEmail), {
        method: 'PATCH', headers: svcHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ role: body.role })
      });
      if (!rRes.ok) return bad(cors, 'Role update failed');
      await logAudit(event, 'staff-setRole', { username: target.username, role: body.role });
      return ok(cors, {});
    }

    // ---- SET ACTIVE ----
    if (action === 'setActive') {
      var active = !!body.active;
      var aRes = await fetch(SB_URL + '/rest/v1/admin_users?email=eq.' + encodeURIComponent(targetEmail), {
        method: 'PATCH', headers: svcHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ active: active })
      });
      if (!aRes.ok) return bad(cors, 'Update failed');
      await logAudit(event, 'staff-setActive', { username: target.username, active: active });
      return ok(cors, {});
    }

    // ---- RESET PIN ----
    if (action === 'resetPin') {
      if (!validPin(body.pin)) return bad(cors, 'PIN must be exactly 6 digits');
      if (!target.auth_user_id) return bad(cors, 'Cannot reset PIN: this login predates PIN support, remove and recreate it');
      var pRes = await fetch(SB_URL + '/auth/v1/admin/users/' + target.auth_user_id, {
        method: 'PUT', headers: svcHeaders(), body: JSON.stringify({ password: String(body.pin) })
      });
      if (!pRes.ok) { var pErr = await pRes.text(); return bad(cors, 'PIN reset failed: ' + pErr.substring(0, 120)); }
      await logAudit(event, 'staff-resetPin', { username: target.username });
      return ok(cors, {});
    }

    // ---- REMOVE ----
    if (action === 'remove') {
      if (target.auth_user_id) { try { await fetch(SB_URL + '/auth/v1/admin/users/' + target.auth_user_id, { method: 'DELETE', headers: svcHeaders() }); } catch (e) {} }
      await fetch(SB_URL + '/rest/v1/admin_users?email=eq.' + encodeURIComponent(targetEmail), { method: 'DELETE', headers: svcHeaders({ Prefer: 'return=minimal' }) });
      await logAudit(event, 'staff-remove', { username: target.username });
      return ok(cors, {});
    }

    return bad(cors, 'Unknown action');
  } catch (e) {
    console.log('admin-manage-staff error:', e.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};

function ok(cors, obj) { return { statusCode: 200, headers: cors, body: JSON.stringify(Object.assign({ ok: true }, obj || {})) }; }
function bad(cors, msg) { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: msg }) }; }
