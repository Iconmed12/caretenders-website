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

  // Categories to import — maps CF keywords to Cana categories
  const CATEGORY_MAP = [
    { keywords: ['care','social care','domiciliary','residential','nursing','supported living','mental health','learning disabilit','children','young people','older people','cqc','personal care'], category: 'care' },
    { keywords: ['construction','building','refurbishment','maintenance','repair','facilities','cleaning','grounds','caretaking','security','fm ','facilities management'], category: 'commercial' },
    { keywords: ['it ','digital','software','technology','ict','cyber','data','infrastructure','cloud'], category: 'commercial' },
    { keywords: ['consultancy','advisory','professional services','training','recruitment'], category: 'commercial' },
    { keywords: ['transport','fleet','logistics','waste','recycling'], category: 'commercial' },
  ];

  function detectCategory(title, desc) {
    var text = ((title||'') + ' ' + (desc||'')).toLowerCase();
    for (var map of CATEGORY_MAP) {
      if (map.keywords.some(function(kw){ return text.includes(kw); })) {
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

          // Check not already imported
          var existRes = await sbFetch('/rest/v1/tenders?source_id=eq.' + encodeURIComponent(sourceId) + '&select=id&limit=1');
          var existData = await existRes.json();
          if (Array.isArray(existData) && existData.length > 0) { skipped++; continue; }

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
