// Manually add one tender from a pasted notice link (admin only). This closes
// the gap where the automatic importer cannot see a notice (e.g. it is on a
// portal the free feeds do not carry). Find a Tender links are fetched directly
// from its OCDS API. The classification mirrors import-tenders.js.

const { requireAdmin, logAudit } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

// ── Classification (kept in sync with import-tenders.js) ──
var CARE_TRANSPORT_RE = /\b(passenger assistant|special educational needs|send|sen|home[ -]to[ -]school|school transport|patient transport|non[ -]?emergency( patient)? transport|dial[ -]a[ -]ride|community transport|wheelchair|escort)\b/i;
var CARE_KEYWORDS = ['care','social care','domiciliary','home care','homecare','residential','nursing','care home','supported living','supported accommodation','sheltered housing','extra care','respite','reablement','day service','day services','day care','shared lives','direct payments','personal care','mental health','learning disabilit','autism','autistic','dementia','end of life','palliative','hospice','older people','vulnerable','disabilit','disabled','send','special educational needs','safeguarding','advocacy','wellbeing','welfare','carer','carers','family support','children','young people','youth','looked after children','foster','fostering','adoption','substance misuse','drug and alcohol','domestic abuse','homeless','community support','cqc'];
var BUSINESS_TITLE_RE = /\b(start[ -]?up|business (support|growth|planning)|enterprise skills?|employab\w*|employment (support|programme|services?)|connect to work|careers?|digital marketing|ux|service design|incubat\w*|accelerat\w*)\b/i;
function kwMatch(text, kw) {
  var esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var trail = /[a-z]$/i.test(kw) && !/disabilit$/.test(kw) ? '\\b' : '';
  return new RegExp('\\b' + esc + trail, 'i').test(text);
}
function collectCpv(tender) {
  var ids = [];
  function add(cls) { if (cls && cls.id && (!cls.scheme || /cpv/i.test(cls.scheme))) ids.push(String(cls.id)); }
  add(tender.classification);
  (tender.additionalClassifications || []).forEach(add);
  (tender.items || []).forEach(function (it) { add(it.classification); (it.additionalClassifications || []).forEach(add); });
  return ids;
}
function cpvSaysCare(ids, text) {
  for (var i = 0; i < ids.length; i++) {
    var c = ids[i]; if (!c) continue;
    if (c.indexOf('85') === 0) return true;
    if (c.indexOf('60') === 0 && CARE_TRANSPORT_RE.test(text)) return true;
  }
  return false;
}
function detectCategory(title, desc, ids) {
  var text = ((title || '') + ' ' + (desc || ''));
  if (ids && ids.length && cpvSaysCare(ids, text)) return 'care';
  if (BUSINESS_TITLE_RE.test(title || '')) return 'commercial';
  if (CARE_KEYWORDS.some(function (kw) { return kwMatch(text, kw); })) return 'care';
  return 'commercial';
}
function detectCqc(title, desc, ids) {
  if (ids) { for (var i = 0; i < ids.length; i++) { var c = ids[i] || ''; if (c.indexOf('853') === 0 || c.indexOf('8514') === 0 || c.indexOf('8511') === 0) return true; } }
  var text = ((title || '') + ' ' + (desc || '')).toLowerCase();
  return ['care','domiciliary','residential','nursing','supported living','mental health','learning disabilit','personal care','cqc','social care'].some(function (kw) { return text.includes(kw); });
}
function cleanText(str) { return str ? String(str).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500) : ''; }
function formatDate(str) { if (!str) return ''; try { return new Date(str).toISOString().split('T')[0]; } catch (e) { return str; } }

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const denied = await requireAdmin(event, 'add-tender', cors);
  if (denied) return denied;

  try {
    const url = (JSON.parse(event.body || '{}').url || '').trim();
    if (!url) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Please paste a tender link.' }) };

    const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    function sbFetch(path, opts) {
      return fetch(SB_URL + path, Object.assign({ headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' } }, opts || {}));
    }

    // Contracts Finder single notices are not fetchable via its API; guide the user.
    if (/contractsfinder\.service\.gov\.uk/i.test(url)) {
      return { statusCode: 422, headers: cors, body: JSON.stringify({ error: 'Contracts Finder links cannot be fetched automatically. If this tender is also on Find a Tender (most are), paste that link instead.' }) };
    }

    if (!/find-tender\.service\.gov\.uk/i.test(url)) {
      return { statusCode: 422, headers: cors, body: JSON.stringify({ error: 'Please paste a Find a Tender link (find-tender.service.gov.uk/Notice/...).' }) };
    }

    // FAT notice id looks like 089351-2026 in the URL path.
    const m = url.match(/(\d{4,7}-\d{4})/);
    if (!m) return { statusCode: 422, headers: cors, body: JSON.stringify({ error: 'Could not read the notice number from that link. It should look like .../Notice/089351-2026.' }) };
    const noticeId = m[1];

    const apiUrl = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages/' + noticeId;
    const res = await fetch(apiUrl, { headers: { Accept: 'application/json', 'User-Agent': 'Cana/1.0' } });
    if (!res.ok) return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Find a Tender did not return that notice (status ' + res.status + '). Check the link.' }) };
    const pkg = await res.json();
    const releases = pkg.releases || pkg.records || [];
    // Prefer the release with the latest tender period / most complete tender.
    let release = releases[0] || {};
    for (const r of releases) { if (r.tender && r.tender.tenderPeriod && r.tender.tenderPeriod.endDate) { release = r; break; } }

    const t = release.tender || {};
    const title = (t.title || release.name || '').trim();
    const desc = cleanText(t.description || '');
    const buyerName = (t.buyer && t.buyer.name) || (release.buyer && release.buyer.name) || (release.parties && release.parties.find(function (p) { return p.roles && p.roles.includes('buyer'); }) || {}).name || (release.parties && release.parties[0] && release.parties[0].name) || '';
    const deadline = t.tenderPeriod && t.tenderPeriod.endDate ? formatDate(t.tenderPeriod.endDate) : '';
    const published = release.date ? formatDate(release.date) : new Date().toISOString().split('T')[0];
    const value = t.value && t.value.amount ? '£' + Number(t.value.amount).toLocaleString('en-GB') : '';
    const sourceId = release.ocid || release.id || noticeId;
    const cpvIds = collectCpv(t);
    const category = detectCategory(title, desc, cpvIds);
    const isCqc = detectCqc(title, desc, cpvIds);
    const sourceUrl = 'https://www.find-tender.service.gov.uk/Notice/' + noticeId;

    if (!title) return { statusCode: 422, headers: cors, body: JSON.stringify({ error: 'That notice has no title, it may not be a tender.' }) };

    // Already in Cana?
    const existRes = await sbFetch('/rest/v1/tenders?source_id=eq.' + encodeURIComponent(sourceId) + '&select=id,status,title&limit=1');
    const existData = await existRes.json();
    if (Array.isArray(existData) && existData.length > 0) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ duplicate: true, title: existData[0].title, status: existData[0].status }) };
    }

    const tenderId = 'T-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 900) + 100);
    const obj = {
      id: tenderId, title: title, org: buyerName, buyer: buyerName,
      deadline: deadline, published_date: published, value: value, description: desc,
      category: category, is_cqc: isCqc, status: 'pending_review',
      source: 'find_a_tender', source_id: sourceId, source_url: sourceUrl,
      created_at: new Date().toISOString()
    };
    const ins = await sbFetch('/rest/v1/tenders', { method: 'POST', body: JSON.stringify(obj), headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' } });
    if (!ins.ok) { const et = await ins.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not save: ' + et.substring(0, 150) }) }; }

    await logAudit(event, 'add-tender', { url: url, tenderId: tenderId, title: title.substring(0, 80) });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ added: true, id: tenderId, title: title, category: category, deadline: deadline }) };

  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
