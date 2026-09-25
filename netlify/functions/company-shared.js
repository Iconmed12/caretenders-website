// Returns the shared company profile for the signed-in caller, if they are an
// enterprise MEMBER. The member's profile page shows these company-level fields
// read-only (a live mirror of the account owner's profile). Owners and solo
// users get role !== 'member' and edit their own profile as normal.

const { enterpriseSeatOwner, companyProfileByUser } = require('./_membership');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

async function verifyUser(event) {
  try {
    var hdrs = (event && event.headers) || {};
    var auth = hdrs.authorization || hdrs.Authorization || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token) return null;
    var anon = process.env.SUPABASE_ANON_KEY;
    var res = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    var u = await res.json();
    if (!u || !u.id) return null;
    return { id: u.id, email: (u.email || '').toLowerCase() };
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    var user = await verifyUser(event);
    if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

    var seat = await enterpriseSeatOwner(user.email);
    if (!seat) return { statusCode: 200, headers: cors, body: JSON.stringify({ role: 'owner_or_solo' }) };

    var op = await companyProfileByUser(seat.owner_user_id) || {};
    // Only the shared LEGAL ENTITY. Everything else (services, CQC, accreditations,
    // case studies, key people) is the member's own department profile.
    var shared = {
      company_name: op.company_name || '',
      company_number: op.company_number || '',
      vat_number: op.vat_number || '',
      founded_year: op.founded_year || '',
      company_type: op.company_type || '',
      registered_address: op.registered_address || ''
    };

    return { statusCode: 200, headers: cors, body: JSON.stringify({ role: 'member', department: seat.department || '', enterprise_name: seat.enterprise_name || '', shared: shared }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
