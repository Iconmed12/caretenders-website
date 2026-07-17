// ONE-OFF cleanup: remove non-care (commercial) tenders left in the DB from
// before the care-only launch. Uses the SERVICE key (deletes are service-only).
// Dry-run by default (lists what WOULD be removed). Execute with ?confirm=REMOVE-NON-CARE.
// This function is intended to be deleted again once the cleanup has run.
exports.handler = async (event) => {
  const cors = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors, body:'' };

  var SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  var SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  function sb(path, opts) {
    return fetch(SB_URL + path, Object.assign({
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }
    }, opts || {}));
  }

  // Care detection, mirrors public/index.js isCare()
  var COMMERCIAL_CATS = ['commercial','construction','facilities','facilities management','cleaning','consultancy','it & digital','it','digital','it & services','logistics','transport','waste','security','employment','business support','marketing','enterprise','training','recruitment','other'];
  var CARE_CATS = ['domiciliary care','domiciliary','residential','nursing','supported living','supported','mental health','mental','hospital discharge','discharge'];
  var BUSINESS_TITLE_RE = /\b(start[ -]?up|business (support|growth|planning)|enterprise skills?|employab\w*|employment (support|programme|services?)|connect to work|careers?|digital marketing|ux|service design|incubat\w*|accelerat\w*)\b/i;
  function isCare(t) {
    if (BUSINESS_TITLE_RE.test(t.title || '')) return false;
    var cat = (t.category || '').toLowerCase().trim();
    if (!cat) return !!t.is_non_cqc;
    if (COMMERCIAL_CATS.indexOf(cat) !== -1) return false;
    if (CARE_CATS.indexOf(cat) !== -1) return true;
    var ck = ['construction','facilit','cleaning','consultanc','logistic'];
    for (var i = 0; i < ck.length; i++) { if (cat.indexOf(ck[i]) !== -1) return false; }
    return true;
  }

  try {
    var res = await sb('/rest/v1/tenders?select=id,title,category,status&limit=5000');
    var all = await res.json();
    if (!Array.isArray(all)) {
      return { statusCode:500, headers:cors, body: JSON.stringify({ error:'could not read tenders', detail: all }) };
    }
    var nonCare = all.filter(function(t){ return !isCare(t); });
    var qs = event.queryStringParameters || {};

    if (qs.confirm === 'REMOVE-NON-CARE') {
      var ids = nonCare.map(function(t){ return t.id; }).filter(function(x){ return x != null; });
      var removed = 0, failed = 0, failSample = [];
      for (var i = 0; i < ids.length; i += 100) {
        var chunk = ids.slice(i, i + 100);
        var inList = chunk.map(function(id){ return '%22' + encodeURIComponent(String(id)) + '%22'; }).join(',');
        var d = await sb('/rest/v1/tenders?id=in.(' + inList + ')', {
          method: 'DELETE',
          headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'return=minimal' }
        });
        if (d.ok) { removed += chunk.length; }
        else { failed += chunk.length; if (failSample.length < 3) { var tx = await d.text(); failSample.push({ status:d.status, body: tx.slice(0,150) }); } }
      }
      return { statusCode:200, headers:cors, body: JSON.stringify({ mode:'executed', totalTenders: all.length, attempted: ids.length, removed, failed, failSample }) };
    }

    return { statusCode:200, headers:cors, body: JSON.stringify({
      mode: 'dry-run',
      totalTenders: all.length,
      careKept: all.length - nonCare.length,
      nonCareToRemove: nonCare.length,
      willRemove: nonCare.slice(0, 80).map(function(t){ return { id:t.id, title:(t.title||'').slice(0,70), category:t.category, status:t.status }; })
    }) };

  } catch (e) {
    return { statusCode:500, headers:cors, body: JSON.stringify({ error: e.message }) };
  }
};
