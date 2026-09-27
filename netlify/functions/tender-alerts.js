// Read and save a member's tender alert preferences. Used by the app
// (AlertsScreen) and the website (alerts.html). GET returns the pick-list
// options plus the member's saved row; POST saves the row.

const vocab = require('./_alerts-vocab');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function verifyUser(event) {
  const hdrs = (event && event.headers) || {};
  const auth = hdrs.authorization || hdrs.Authorization || '';
  const token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
  if (!token) return null;
  const anon = process.env.SUPABASE_ANON_KEY;
  const res = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
  if (!res.ok) return null;
  const u = await res.json();
  if (!u || !u.id) return null;
  return { id: u.id, email: (u.email || '').toLowerCase() };
}

function svcKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const VALID_SECTORS = vocab.SECTORS.map(function (x) { return x.key; });
const VALID_SERVICES = vocab.SERVICE_TYPES.map(function (x) { return x.key; });
const VALID_REGIONS = vocab.REGIONS.map(function (x) { return x.key; });
const VALID_BANDS = vocab.VALUE_BANDS.map(function (x) { return x.key; });
const VALID_FREQ = ['instant', 'daily', 'weekly'];

// Keep only known keys, so nothing unmatched can be stored.
function cleanList(v, allowed) {
  if (!Array.isArray(v)) return [];
  return v.filter(function (x) { return allowed.indexOf(x) !== -1; });
}

function defaults() {
  return { sectors: ['care'], service_types: [], regions: [], value_band: 'any', email_on: true, push_on: false, frequency: 'daily' };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const user = await verifyUser(event);
  if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

  const key = svcKey();
  if (!key) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server not configured.' }) };
  const sbHeaders = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

  try {
    if (event.httpMethod === 'GET') {
      const res = await fetch(
        SB_URL + '/rest/v1/tender_alerts?user_id=eq.' + user.id + '&select=*',
        { headers: sbHeaders }
      );
      const rows = res.ok ? await res.json() : [];
      const prefs = (rows && rows[0]) ? rows[0] : defaults();
      return { statusCode: 200, headers: cors, body: JSON.stringify({ prefs: prefs, options: vocab.options() }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const row = {
        user_id: user.id,
        email: user.email,
        sectors: cleanList(body.sectors, VALID_SECTORS),
        service_types: cleanList(body.service_types, VALID_SERVICES),
        regions: cleanList(body.regions, VALID_REGIONS),
        value_band: VALID_BANDS.indexOf(body.value_band) !== -1 ? body.value_band : 'any',
        email_on: body.email_on !== false,
        push_on: body.push_on === true,
        frequency: VALID_FREQ.indexOf(body.frequency) !== -1 ? body.frequency : 'daily',
        updated_at: new Date().toISOString(),
      };

      const res = await fetch(
        SB_URL + '/rest/v1/tender_alerts?on_conflict=user_id',
        {
          method: 'POST',
          headers: Object.assign({}, sbHeaders, { Prefer: 'resolution=merge-duplicates,return=representation' }),
          body: JSON.stringify(row),
        }
      );
      if (!res.ok) {
        const t = await res.text();
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not save', detail: t }) };
      }
      const saved = await res.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify({ prefs: (saved && saved[0]) || row }) };
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
