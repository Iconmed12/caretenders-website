// Shared admin auth check (Phase 1).
//
// Verifies a Supabase Auth access token and checks the user's email against the
// ADMIN_EMAILS allow-list (comma-separated Netlify env var).
//
// PHASE 1a = MONITOR MODE: callers run checkAdmin(), log the outcome with
// logAdminCheck(), but DO NOT block. Nothing changes about who can call a
// function yet; we are only proving the token flows correctly end to end.
//
// PHASE 1b = ENFORCE MODE: callers will reject the request when
// result.authenticated is false. That change is made later, once the new login
// is confirmed working. This file's checkAdmin() already returns everything
// needed for that; only the callers change.
//
// The file name starts with "_" so Netlify does NOT treat it as its own
// function endpoint; it is bundled as a helper when a function require()s it.

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

async function checkAdmin(event) {
  try {
    var hdrs = (event && event.headers) || {};
    var auth = hdrs.authorization || hdrs.Authorization || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token) return { authenticated: false, email: null, reason: 'no token' };

    var anon = process.env.SUPABASE_ANON_KEY;
    // Ask Supabase who this token belongs to. A valid, unexpired token returns
    // the user; anything else (forged, expired, empty) returns a non-200.
    var res = await fetch(SB_URL + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return { authenticated: false, email: null, reason: 'token rejected (' + res.status + ')' };

    var user = await res.json();
    var email = (user && user.email ? user.email : '').toLowerCase();
    if (!email) return { authenticated: false, email: null, reason: 'no email on token' };

    var allow = String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(Boolean);
    var isAdmin = allow.indexOf(email) !== -1;
    return {
      authenticated: isAdmin,
      email: email,
      reason: isAdmin ? 'ok' : 'not on allow-list'
    };
  } catch (e) {
    return { authenticated: false, email: null, reason: 'check error: ' + e.message };
  }
}

// Monitor-mode logger: records the outcome, never blocks.
function logAdminCheck(fnName, result) {
  console.log('[admin-auth][monitor] ' + fnName +
    ': authenticated=' + result.authenticated +
    ' email=' + (result.email || 'none') +
    ' reason=' + result.reason);
}

// Enforce mode (Phase 1b): returns null when the caller is a valid admin (the
// function should proceed), or a ready-to-return 401 response object when not.
// Usage:  var denied = await requireAdmin(event, 'save-tender', cors);
//         if (denied) return denied;
async function requireAdmin(event, fnName, corsHeaders) {
  var result = await checkAdmin(event);
  if (result.authenticated) {
    console.log('[admin-auth][enforce] ' + fnName + ': allow email=' + result.email);
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

module.exports = { checkAdmin, logAdminCheck, requireAdmin };
