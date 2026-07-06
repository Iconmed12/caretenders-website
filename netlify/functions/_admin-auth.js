// Shared admin auth + roles (Phase 1 and Phase 5).
//
// checkAdmin(event) verifies a Supabase Auth access token and resolves the
// caller's ROLE:
//   - owner: email is in the ADMIN_EMAILS env allow-list (guaranteed, so the
//     founder can never be locked out), OR a row in admin_users with role=owner.
//   - staff: an active row in the admin_users table with role=staff.
//   - otherwise: not authenticated.
//
// requireAdmin  -> allows owner or staff (used by tender functions).
// requireOwner  -> allows owner only (used by the knowledge base and staff mgmt).
// logAudit      -> writes a timestamped row to admin_audit_log (who/what/when).
//
// The file name starts with "_" so Netlify does NOT treat it as its own function
// endpoint; it is bundled as a helper when a function require()s it.

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

async function checkAdmin(event) {
  try {
    var hdrs = (event && event.headers) || {};
    var auth = hdrs.authorization || hdrs.Authorization || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token) return { authenticated: false, email: null, role: null, reason: 'no token' };

    var anon = process.env.SUPABASE_ANON_KEY;
    // Ask Supabase who this token belongs to. A valid, unexpired token returns
    // the user; anything else (forged, expired, empty) returns a non-200.
    var res = await fetch(SB_URL + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return { authenticated: false, email: null, role: null, reason: 'token rejected (' + res.status + ')' };

    var user = await res.json();
    var email = (user && user.email ? user.email : '').toLowerCase();
    if (!email) return { authenticated: false, email: null, role: null, reason: 'no email on token' };

    // 1) Owner via the env allow-list. This is the guaranteed, never-locked-out
    //    path, independent of any database table.
    var owners = String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(Boolean);
    if (owners.indexOf(email) !== -1) {
      return { authenticated: true, email: email, role: 'owner', reason: 'ok (owner via allow-list)' };
    }

    // 2) Otherwise look up the admin_users table for a staff/owner role. Wrapped
    //    so that if the table does not exist yet, we simply fall through to
    //    "not on allow-list" rather than error (owner access is unaffected).
    try {
      var svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
      var uRes = await fetch(SB_URL + '/rest/v1/admin_users?email=eq.' + encodeURIComponent(email) + '&select=role,active&limit=1', {
        headers: { apikey: svc, Authorization: 'Bearer ' + svc }
      });
      if (uRes.ok) {
        var rows = await uRes.json();
        var row = rows && rows[0];
        if (row && row.active === false) {
          return { authenticated: false, email: email, role: null, reason: 'account deactivated' };
        }
        if (row && (row.role === 'owner' || row.role === 'staff')) {
          return { authenticated: true, email: email, role: row.role, reason: 'ok (' + row.role + ' via admin_users)' };
        }
      }
    } catch (e) {
      console.log('[admin-auth] admin_users lookup failed (owner access unaffected): ' + e.message);
    }

    return { authenticated: false, email: email, role: null, reason: 'not on allow-list' };
  } catch (e) {
    return { authenticated: false, email: null, role: null, reason: 'check error: ' + e.message };
  }
}

// Monitor-mode logger: records the outcome, never blocks.
function logAdminCheck(fnName, result) {
  console.log('[admin-auth][monitor] ' + fnName +
    ': authenticated=' + result.authenticated +
    ' role=' + (result.role || 'none') +
    ' email=' + (result.email || 'none') +
    ' reason=' + result.reason);
}

// Enforce: any admin (owner or staff). Returns null to proceed, or a 401 to
// return. Stashes the caller identity on the event for logAudit to reuse.
async function requireAdmin(event, fnName, corsHeaders) {
  var result = await checkAdmin(event);
  if (event) event._adminIdentity = result;
  if (result.authenticated) {
    console.log('[admin-auth][enforce] ' + fnName + ': allow ' + result.role + ' ' + result.email);
    return null;
  }
  console.log('[admin-auth][enforce] ' + fnName + ': DENY reason=' + result.reason +
    ' email=' + (result.email || 'none'));
  return {
    statusCode: 401,
    headers: corsHeaders || { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Admin authentication required' })
  };
}

// Enforce: owner only. Staff get 403. Used for the knowledge base and staff mgmt.
async function requireOwner(event, fnName, corsHeaders) {
  var result = await checkAdmin(event);
  if (event) event._adminIdentity = result;
  if (result.authenticated && result.role === 'owner') {
    console.log('[admin-auth][enforce] ' + fnName + ': allow owner ' + result.email);
    return null;
  }
  var reason = result.authenticated ? 'not an owner (role=' + result.role + ')' : result.reason;
  console.log('[admin-auth][enforce] ' + fnName + ': DENY(owner) reason=' + reason +
    ' email=' + (result.email || 'none'));
  return {
    statusCode: result.authenticated ? 403 : 401,
    headers: corsHeaders || { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: result.authenticated ? 'Owner access required' : 'Admin authentication required' })
  };
}

// Best-effort audit trail. Writes who/what/when to admin_audit_log using the
// service key. Never throws and never blocks the action: if the log write fails
// (e.g. table missing), the action still succeeds.
async function logAudit(event, action, details) {
  try {
    var id = (event && event._adminIdentity) || {};
    var svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    await fetch(SB_URL + '/rest/v1/admin_audit_log', {
      method: 'POST',
      headers: { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ email: id.email || null, role: id.role || null, action: action, details: details || null })
    });
  } catch (e) {
    console.log('[audit] write failed for ' + action + ': ' + e.message);
  }
}

module.exports = { checkAdmin, logAdminCheck, requireAdmin, requireOwner, logAudit };
