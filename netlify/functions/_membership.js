// Shared membership resolver.
//
// A person is an ACTIVE MEMBER if EITHER:
//   1. they have their own active subscription (the original individual model), OR
//   2. they are an ACTIVE seat in an enterprise whose OWNER has an active
//      subscription (the enterprise "company circle" model).
//
// The direct check runs first and is untouched, so existing individual members
// behave exactly as before. The enterprise path only runs when the direct check
// finds nothing, and rides on the owner's existing membership (no separate
// enterprise product yet; pricing is deferred).
//
// All lookups use the service key so they work with RLS on.

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

function svcKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
}

async function sbGet(path) {
  var k = svcKey();
  try {
    var r = await fetch(SB_URL + path, { headers: { apikey: k, Authorization: 'Bearer ' + k } });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}

// The subscription-is-active rule, kept identical to the original inline checks
// (3-day grace beyond current_period_end to cover renewal lag).
function subIsActive(sub) {
  if (!sub) return false;
  if (!sub.current_period_end) return sub.status === 'active';
  return (new Date(sub.current_period_end).getTime() + 3 * 24 * 3600 * 1000) > Date.now();
}

// Returns the active subscription row for an email, or null.
async function activeSubFor(email) {
  var rows = await sbGet(
    '/rest/v1/subscriptions?email=eq.' + encodeURIComponent(email) +
    '&status=in.(active,trialing,past_due)&select=*' +
    '&order=current_period_end.desc&limit=1'
  );
  var sub = Array.isArray(rows) && rows[0];
  return subIsActive(sub) ? sub : null;
}

// Returns the enterprise owner's email for an ACTIVE seat with this email, or null.
async function enterpriseOwnerEmailFor(email) {
  var mem = await sbGet(
    '/rest/v1/enterprise_members?email=eq.' + encodeURIComponent(email) +
    '&status=eq.active&select=enterprise_id&limit=1'
  );
  var m = Array.isArray(mem) && mem[0];
  if (!m) return null;
  var ent = await sbGet('/rest/v1/enterprises?id=eq.' + encodeURIComponent(m.enterprise_id) + '&select=owner_email&limit=1');
  var e = Array.isArray(ent) && ent[0];
  return e && e.owner_email ? String(e.owner_email).toLowerCase() : null;
}

// Resolve membership for an email.
//   -> { member: bool, via: 'direct' | 'enterprise' | null, sub: <row|null> }
// `sub` is the subscription the membership is based on (their own, or the
// owner's when via === 'enterprise'), so callers can surface term/period.
async function memberInfo(email) {
  email = (email || '').trim().toLowerCase();
  if (!email) return { member: false, via: null, sub: null };

  var direct = await activeSubFor(email);
  if (direct) return { member: true, via: 'direct', sub: direct };

  var ownerEmail = await enterpriseOwnerEmailFor(email);
  if (ownerEmail && ownerEmail !== email) {
    var ownerSub = await activeSubFor(ownerEmail);
    if (ownerSub) return { member: true, via: 'enterprise', sub: ownerSub };
  }

  return { member: false, via: null, sub: null };
}

// For an enterprise MEMBER seat (role 'member', active), return the owner whose
// company profile is shared with them. Returns null for owners, solo users, or
// anyone not on an active member seat, so callers only override for real members.
//   -> { owner_user_id, department, enterprise_id, enterprise_name } | null
async function enterpriseSeatOwner(email) {
  email = (email || '').trim().toLowerCase();
  if (!email) return null;
  var mem = await sbGet('/rest/v1/enterprise_members?email=eq.' + encodeURIComponent(email) + '&status=eq.active&select=enterprise_id,department,role&limit=1');
  var m = Array.isArray(mem) && mem[0];
  if (!m || m.role === 'owner') return null;
  var ent = await sbGet('/rest/v1/enterprises?id=eq.' + encodeURIComponent(m.enterprise_id) + '&select=owner_user_id,name&limit=1');
  var e = Array.isArray(ent) && ent[0];
  if (!e || !e.owner_user_id) return null;
  return { owner_user_id: e.owner_user_id, department: m.department || '', enterprise_id: m.enterprise_id, enterprise_name: e.name || '' };
}

// The owner's company profile (the shared company profile), by owner user id.
async function companyProfileByUser(userId) {
  if (!userId) return null;
  var rows = await sbGet('/rest/v1/company_profiles?user_id=eq.' + encodeURIComponent(userId) + '&select=*&limit=1');
  return (Array.isArray(rows) && rows[0]) || null;
}

module.exports = { memberInfo, activeSubFor, subIsActive, enterpriseSeatOwner, companyProfileByUser };
