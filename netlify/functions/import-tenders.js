exports.handler = async (event) => {
  const cors = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors, body:'' };

  var SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  var SB_KEY = process.env.SUPABASE_ANON_KEY;
  
  function sbFetch(path, opts) {
    return fetch(SB_URL + path, Object.assign({
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }
    }, opts || {}));
  }

  // Business-support / employment programmes are NOT care — checked first, against the TITLE only
  var BUSINESS_TITLE_RE = /\b(start[ -]?up|business (support|growth|planning)|enterprise skills?|employab\w*|employment (support|programme|services?)|connect to work|careers?|digital marketing|ux|service design|incubat\w*|accelerat\w*)\b/i;

  // Categories to import — maps CF keywords to Cana categories.
  // Matching is whole-word (\b boundaries) so e.g. 'care' no longer matches 'careers'.
  const CATEGORY_MAP = [
    { keywords: ['care','social care','domiciliary','residential','nursing','supported living','mental health','learning disabilit','older people','cqc','personal care','home care','homecare','extra care','respite','reablement','care home','foster'], category: 'care' },
    { keywords: ['construction','building','refurbishment','maintenance','repair','facilities','cleaning','grounds','caretaking','security','fm','facilities management'], category: 'commercial' },
    { keywords: ['it','digital','software','technology','ict','cyber','data','infrastructure','cloud'], category: 'commercial' },
    { keywords: ['consultancy','advisory','professional services','training','recruitment'], category: 'commercial' },
    { keywords: ['transport','fleet','logistics','waste','recycling'], category: 'commercial' },
  ];

  function kwMatch(text, kw) {
    var esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 'learning disabilit' is a stem — no trailing boundary for stems ending mid-word
    var trail = /[a-z]$/i.test(kw) && !/disabilit$/.test(kw) ? '\\b' : '';
    return new RegExp('\\b' + esc + trail, 'i').test(text);
  }

  function detectCategory(title, desc) {
    // Employment / business-support programmes routinely mention "careers", "young people"
    // etc. in descriptions, so they are excluded by title before care matching runs.
    if (BUSINESS_TITLE_RE.test(title || '')) return 'commercial';
    var text = ((title||'') + ' ' + (desc||''));
    for (var map of CATEGORY_MAP) {
      if (map.keywords.some(function(kw){ return kwMatch(text, kw); })) {
        return map.category;
      }
    }
    return 'commercial'; // default
  }

  function detectCqc(title, desc) {
    var text = ((title||'') + ' ' + (desc||'')).toLowerCase();
    var cqcKeywords = ['care','domiciliary','residential','nursing','supported living','mental health','learning disabilit','personal care','cqc','social care'];
    return cqcKeywords.some(function(kw){ return text.includes(kw); });
  }

  function cleanText(str) {
    if (!str) return '';
    return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500);
  }

  function formatDate(str) {
    if (!str) return '';
    try { return new Date(str).toISOString().split('T')[0]; } catch(e) { return str; }
  }

  try {
    var imported = 0, skipped = 0, errors = 0;
    var results = [];

    // Fetch from Contracts Finder API — page through results
    var pages = event.body ? JSON.parse(event.body).pages || 3 : 3;
    
    for (var page = 0; page < pages; page++) {
      var apiUrl = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search' +
        '?publishedFrom=' + getYesterdayDate() +
        '&stages=tender' +
        '&size=100&page=' + page +
        '&order=publishedDate&orderDirection=DESC';

      console.log('Fetching CF API page', page, ':', apiUrl);
      var res = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Cana/1.0' }
      });

      if (!res.ok) {
        var errBody = await res.text();
        console.log('CF API page', page, 'failed:', res.status, errBody.substring(0,200));
        break;
      }

      var data = await res.json();
      var releases = data.releases || data.records || [];
      console.log('Page', page, '— fetched', releases.length, 'records, total:', data.total || 'unknown');
      
      if (!releases.length) {
        console.log('No releases on page', page, '— stopping');
        break;
      }

      if (!releases.length) break;

      for (var release of releases) {
        try {
          var tender = release.tender || {};
          var buyer  = (release.buyer || release.parties && release.parties.find(function(p){ return p.roles && p.roles.includes('buyer'); })) || {};
          var planning = release.planning || {};

          var title = tender.title || release.name || '';
          var desc  = cleanText(tender.description || planning.budget && planning.budget.description || '');
          var deadline = formatDate(tender.tenderPeriod && tender.tenderPeriod.endDate);
          var published = formatDate(release.date || tender.datePublished);
          var value = tender.value && tender.value.amount ? '£' + Number(tender.value.amount).toLocaleString('en-GB') : '';
          var buyerName = buyer.name || (release.parties && release.parties[0] && release.parties[0].name) || '';
          // Find the DIRECT human notice page URL (not the API link)
          var sourceUrl = '';
          // 1. CF includes the notice page in tender.documents as documentType tenderNotice
          var docs = (tender.documents || []);
          for (var d of docs) {
            if (d.documentType === 'tenderNotice' && d.url) { sourceUrl = d.url; break; }
          }
          // 2. Fallback: any document URL pointing at a contractsfinder notice page
          if (!sourceUrl) {
            for (var d2 of docs) {
              if (d2.url && d2.url.indexOf('contractsfinder.service.gov.uk/notice') !== -1) { sourceUrl = d2.url; break; }
            }
          }
          // 3. Fallback: derive from OCID (CF notice GUID follows the ocds-b5fd17- prefix)
          if (!sourceUrl && release.ocid && release.ocid.indexOf('ocds-b5fd17-') === 0) {
            sourceUrl = 'https://www.contractsfinder.service.gov.uk/notice/' + release.ocid.replace('ocds-b5fd17-', '');
          }
          // 4. Last resort: the API record link
          if (!sourceUrl) sourceUrl = (release.links && release.links.self) || '';
          var sourceId = release.ocid || release.id || '';
          var category = detectCategory(title, desc);
          var isCqc = detectCqc(title, desc);

          if (!title || !deadline) { skipped++; continue; }

          // Check not already imported — two guards:
          // 1. Same source_id (same portal, exact record match)
          var existRes = await sbFetch('/rest/v1/tenders?source_id=eq.' + encodeURIComponent(sourceId) + '&select=id&limit=1');
          var existData = await existRes.json();
          if (Array.isArray(existData) && existData.length > 0) { skipped++; continue; }

          // 2. Same title + org + deadline from a different portal (cross-source duplicate)
          if (title && buyerName && deadline) {
            var crossRes = await sbFetch(
              '/rest/v1/tenders?select=id&limit=1' +
              '&title=eq.' + encodeURIComponent(title) +
              '&org=eq.'   + encodeURIComponent(buyerName) +
              '&deadline=eq.' + encodeURIComponent(deadline)
            );
            var crossData = await crossRes.json();
            if (Array.isArray(crossData) && crossData.length > 0) { skipped++; continue; }
          }

          // Generate tender ID
          var now = Date.now();
          var randStr = Math.random().toString(36).substring(2, 6);
          var tenderId = 'T-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*900)+100);

          var tenderObj = {
            id: tenderId,
            title: title,
            org: buyerName,
            buyer: buyerName,
            deadline: deadline,
            published_date: published,
            value: value,
            description: desc,
            category: category,
            is_cqc: isCqc,
            status: 'pending_review', // admin must approve before going live
            source: 'contracts_finder',
            source_id: sourceId,
            source_url: sourceUrl,
            created_at: new Date().toISOString()
          };

          var insertRes = await sbFetch('/rest/v1/tenders', {
            method: 'POST',
            body: JSON.stringify(tenderObj),
            headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
          });
          if (!insertRes.ok) {
            var errTxt = await insertRes.text();
            console.log('Insert error:', insertRes.status, errTxt.substring(0,150));
            errors++;
          } else { imported++; results.push({ id: tenderId, title: title.substring(0,60) }); }

        } catch(e) { console.log('Record error:', e.message); errors++; }
      }
    }

    // ── Find a Tender (UK-wide, all values, above + below threshold since Feb 2025) ──
    // Uses the OCDS release package endpoint. Valid params per FAT API spec:
    // stages, limit, cursor, updatedFrom, updatedTo. Pagination is cursor-based via links.next.
    var fatNextUrl = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages' +
      '?updatedFrom=' + getYesterdayDateISO() +
      '&stages=tender' +
      '&limit=100';

    for (var fatLoop = 0; fatLoop < pages && fatNextUrl; fatLoop++) {
      console.log('Fetching FAT API page', fatLoop, ':', fatNextUrl);
      var fatRes = await fetch(fatNextUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Cana/1.0' }
      });

      if (!fatRes.ok) {
        var fatErr = await fatRes.text();
        console.log('FAT API page', fatLoop, 'failed:', fatRes.status, fatErr.substring(0,200));
        break;
      }

      var fatData = await fatRes.json();
      var fatReleases = fatData.releases || fatData.records || [];
      console.log('FAT page', fatLoop, '— fetched', fatReleases.length, 'records');

      // Set up next page from the cursor link FAT returns
      fatNextUrl = (fatData.links && fatData.links.next) ? fatData.links.next : '';

      if (!fatReleases.length) break;

      for (var fatRelease of fatReleases) {
        try {
          var ft = fatRelease.tender || {};
          var fb = fatRelease.buyer || {};
          var title = (ft.title || fatRelease.name || '').trim();
          var desc  = ft.description || '';
          var buyerName = fb.name || (fatRelease.parties && fatRelease.parties.find(p=>p.roles&&p.roles.includes('buyer'))?.name) || '';
          var deadline = '';
          if (ft.tenderPeriod && ft.tenderPeriod.endDate) deadline = formatDate(ft.tenderPeriod.endDate);
          var published = fatRelease.date ? formatDate(fatRelease.date) : new Date().toISOString().split('T')[0];
          var value = '';
          if (ft.value && ft.value.amount) value = '£' + Number(ft.value.amount).toLocaleString('en-GB');
          var sourceId = fatRelease.ocid || fatRelease.id || '';
          var noticeId = fatRelease.id || '';  // FAT notice id is nnnnnn-yyyy, used for the public Notice URL
          var sourceUrl = '';
          if (ft.documents) {
            for (var fd of ft.documents) {
              if (fd.documentType === 'tenderNotice' && fd.url) { sourceUrl = fd.url; break; }
            }
          }
          if (!sourceUrl && noticeId) sourceUrl = 'https://www.find-tender.service.gov.uk/Notice/' + noticeId;

          if (!title || !deadline) continue;

          // Guard 1: source_id match
          var fExist = await sbFetch('/rest/v1/tenders?source_id=eq.' + encodeURIComponent(sourceId) + '&select=id&limit=1');
          var fExistData = await fExist.json();
          if (Array.isArray(fExistData) && fExistData.length > 0) { skipped++; continue; }

          // Guard 2: cross-source duplicate
          if (title && buyerName && deadline) {
            var fCross = await sbFetch('/rest/v1/tenders?select=id&limit=1&title=eq.' + encodeURIComponent(title) + '&org=eq.' + encodeURIComponent(buyerName) + '&deadline=eq.' + encodeURIComponent(deadline));
            var fCrossData = await fCross.json();
            if (Array.isArray(fCrossData) && fCrossData.length > 0) { skipped++; continue; }
          }

          var category = detectCategory(title, desc);
          var isCqc = detectCqc(title, desc);
          var tenderId = 'T-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*900)+100);

          var fatObj = {
            id: tenderId, title, org: buyerName, buyer: buyerName,
            deadline, published_date: published, value, description: desc,
            category, is_cqc: isCqc, status: 'pending_review',
            source: 'find_a_tender', source_id: sourceId, source_url: sourceUrl,
            created_at: new Date().toISOString()
          };

          var fatInsert = await sbFetch('/rest/v1/tenders', {
            method: 'POST',
            body: JSON.stringify(fatObj),
            headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
          });
          if (!fatInsert.ok) { errors++; } else { imported++; results.push({ id: tenderId, title: title.substring(0,60) }); }

        } catch(e) { console.log('FAT record error:', e.message); errors++; }
      }
    }

    console.log('Import complete — imported:', imported, 'skipped:', skipped, 'errors:', errors);
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, imported, skipped, errors, sample: results.slice(0,5) })
    };

  } catch(err) {
    console.error('Importer error:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};

function getYesterdayDate() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0] + 'T00:00:00';
}

function getYesterdayDateISO() {
  var d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('.')[0] + 'Z';
}
