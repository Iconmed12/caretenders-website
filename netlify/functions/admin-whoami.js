// Read-only diagnostic (Phase 1 verification).
//
// Returns exactly what the admin auth checker sees for the CALLER: whether their
// Supabase token is valid, which email it maps to, and whether that email is on
// the ADMIN_EMAILS allow-list. It changes nothing and reveals only the caller's
// own token status, so it is safe to leave in place.
//
// Purpose: confirm ADMIN_EMAILS is matching your account BEFORE Phase 1b turns on
// enforcement, without hunting through Netlify function logs.

const { checkAdmin } = require('./_admin-auth');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  var result = await checkAdmin(event);
  // Also report whether the allow-list env var is configured at all, which is the
  // most common reason a valid login still shows authenticated=false.
  result.adminEmailsConfigured = !!(process.env.ADMIN_EMAILS && process.env.ADMIN_EMAILS.trim());
  return { statusCode: 200, headers: cors, body: JSON.stringify(result) };
};
