// Admin-only: read/adjust the generation kill switch and daily AI budget, and
// read today's estimated AI spend. GET returns status; POST updates it.

const { requireManager, logAudit } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  // Manager/owner only: pausing generation and changing the AI budget is a
  // high-impact control, so ordinary staff are refused.
  const denied = await requireManager(event, 'generation-control', cors);
  if (denied) return denied;

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  function sb(path, opts) {
    return fetch(SB_URL + path, Object.assign({ headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' } }, opts || {}));
  }

  async function readConfig() {
    var res = await sb('/rest/v1/app_config?key=eq.generation&select=value&limit=1');
    var row = res.ok ? (await res.json())[0] : null;
    var v = (row && row.value) || {};
    return { paused: v.paused === true, daily_budget_pennies: typeof v.daily_budget_pennies === 'number' ? v.daily_budget_pennies : 5000 };
  }

  async function spentToday() {
    var todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
    var res = await sb('/rest/v1/ai_usage?created_at=gte.' + todayStart + '&select=cost_pennies');
    if (!res.ok) return 0;
    var total = 0; (await res.json()).forEach(function (r) { total += Number(r.cost_pennies) || 0; });
    return total;
  }

  try {
    if (event.httpMethod === 'GET') {
      var cfg = await readConfig();
      var spent = await spentToday();
      return { statusCode: 200, headers: cors, body: JSON.stringify({ paused: cfg.paused, daily_budget_pennies: cfg.daily_budget_pennies, spent_today_pennies: spent }) };
    }

    var body = JSON.parse(event.body || '{}');
    var cur = await readConfig();
    var next = { paused: cur.paused, daily_budget_pennies: cur.daily_budget_pennies };
    if (typeof body.paused === 'boolean') next.paused = body.paused;
    if (typeof body.dailyBudgetPennies === 'number' && body.dailyBudgetPennies >= 0) next.daily_budget_pennies = Math.round(body.dailyBudgetPennies);

    var up = await sb('/rest/v1/app_config?key=eq.generation', {
      method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ value: next, updated_at: new Date().toISOString() })
    });
    if (!up.ok) { var et = await up.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: et.substring(0, 150) }) }; }
    await logAudit(event, 'generation-control', next);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, paused: next.paused, daily_budget_pennies: next.daily_budget_pennies }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
