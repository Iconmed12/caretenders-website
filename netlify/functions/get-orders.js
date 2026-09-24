// Admin-only: every order (cana_jobs row) newest first, enriched with the
// tender title, for the admin Orders screen. Lets the team see all orders,
// track them by reference, and read simple volume metrics.

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

  const denied = await requireAdmin(event, 'get-orders', cors);
  if (denied) return denied;

  try {
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    function sb(path) { return fetch(SB_URL + path, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }); }

    var res = await sb('/rest/v1/cana_jobs?select=id,tender_id,client_email,client_name,status,created_at,completed_at&order=created_at.desc&limit=500');
    var jobs = await res.json();
    if (!Array.isArray(jobs)) jobs = [];

    // Enrich with tender titles in one query.
    var ids = [...new Set(jobs.map(function (j) { return j.tender_id; }).filter(Boolean))];
    var titles = {};
    if (ids.length) {
      var tRes = await sb('/rest/v1/tenders?id=in.(' + ids.map(encodeURIComponent).join(',') + ')&select=id,title,org');
      var tData = await tRes.json();
      (Array.isArray(tData) ? tData : []).forEach(function (t) { titles[t.id] = t; });
    }

    var orders = jobs.map(function (j) {
      var t = titles[j.tender_id] || {};
      return {
        id: j.id,
        ref: 'CANA-' + String(j.id || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase(),
        tender_id: j.tender_id,
        tender_title: t.title || 'Tender',
        org: t.org || '',
        client_email: j.client_email || '',
        client_name: j.client_name || '',
        status: j.status || '',
        created_at: j.created_at,
        completed_at: j.completed_at
      };
    });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ orders: orders }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
