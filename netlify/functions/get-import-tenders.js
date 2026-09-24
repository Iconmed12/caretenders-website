// Admin-only: returns the imported tenders (Contracts Finder + Find a Tender),
// all statuses including pending_review, for the Tender Import screen. This
// replaces the admin page reading the tenders table directly with the public
// key, so the tenders table can be locked with Row-Level Security.

const { requireAdmin } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const denied = await requireAdmin(event, 'get-import-tenders', cors);
  if (denied) return denied;

  try {
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    const res = await fetch(SB_URL + '/rest/v1/tenders?source=in.(contracts_finder,find_a_tender)&select=*&order=created_at.desc&limit=200',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    const rows = await res.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify(Array.isArray(rows) ? rows : []) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
