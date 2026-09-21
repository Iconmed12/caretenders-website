const { checkAdmin, logAdminCheck } = require('./_admin-auth');

exports.handler = async (event) => {
  const cors = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors, body:'' };

  // Phase 1a MONITOR MODE: log who is calling, do not block yet. NOTE: this
  // function is ALSO run by cron (no token); enforcement in Phase 1b must allow
  // the scheduled run as well as an admin token.
  logAdminCheck('import-tenders', await checkAdmin(event));

  var SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  var SB_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
  
  function sbFetch(path, opts) {
    return fetch(SB_URL + path, Object.assign({
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }
    }, opts || {}));
  }

  // Business-support / employment programmes are NOT care, checked against the
  // TITLE only. Only used in the keyword fallback (a real care CPV overrides it).
  var BUSINESS_TITLE_RE = /\b(start[ -]?up|business (support|growth|planning)|enterprise skills?|employab\w*|employment (support|programme|services?)|connect to work|careers?|digital marketing|ux|service design|incubat\w*|accelerat\w*)\b/i;

  // TIGHT care terms, used ONLY when a notice has no official CPV code at all.
  // Deliberately narrow and unambiguous: broad words like "children", "young
  // people", "training", "welfare" were pulling in colleges and generic
  // programmes, so they are NOT here.
  var CARE_STRICT = ['social care','domiciliary care','home care','homecare','care home','residential care','nursing home','nursing care','supported living','supported accommodation','extra care','respite care','reablement','shared lives','day care service','learning disabilit','dementia','palliative care','end of life care','safeguarding','cqc','care at home'];

  // Care-related transport terms (SEN / patient / community transport). Keeps
  // passenger transport for vulnerable people while excluding freight/logistics.
  var CARE_TRANSPORT_RE = /\b(passenger assistant|special educational needs|send|sen|home[ -]to[ -]school|school transport|patient transport|non[ -]?emergency( patient)? transport|dial[ -]a[ -]ride|community transport|wheelchair|escort)\b/i;

  function kwMatch(text, kw) {
    var esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 'learning disabilit' is a stem, no trailing boundary for stems ending mid-word
    var trail = /[a-z]$/i.test(kw) && !/disabilit$/.test(kw) ? '\\b' : '';
    return new RegExp('\\b' + esc + trail, 'i').test(text);
  }

  // Collect every CPV (official category) code on a tender: main classification,
  // line items and any additional classifications.
  function collectCpv(tender) {
    var ids = [];
    function add(cls) { if (cls && cls.id && (!cls.scheme || /cpv/i.test(cls.scheme))) ids.push(String(cls.id)); }
    add(tender.classification);
    (tender.additionalClassifications || []).forEach(add);
    (tender.items || []).forEach(function (it) { add(it.classification); (it.additionalClassifications || []).forEach(add); });
    return ids;
  }

  // The official codes decide "care" first (most reliable):
  //   85 = health & social work services (social care + NHS/clinical)
  //   60 = transport, but only care-related passenger transport (needs a keyword)
  // Community / wellbeing work (advocacy, carers, family support) is coded too
  // broadly under 98 (which also covers maritime, mining, car parks, laundry),
  // so it is caught by the care keyword fallback instead, not by CPV 98.
  function cpvSaysCare(cpvIds, text) {
    for (var i = 0; i < cpvIds.length; i++) {
      var c = cpvIds[i];
      if (!c) continue;
      if (c.indexOf('85') === 0) return true;
      if (c.indexOf('60') === 0 && CARE_TRANSPORT_RE.test(text)) return true;
    }
    return false;
  }

  function detectCategory(title, desc, cpvIds) {
    var text = ((title || '') + ' ' + (desc || ''));
    // If the notice has an official CPV code, TRUST it and do not keyword-guess.
    // (Guessing from descriptions pulled in colleges, training, generic
    // programmes that merely mention "young people" etc.)
    if (cpvIds && cpvIds.length) {
      return cpvSaysCare(cpvIds, text) ? 'care' : 'commercial';
    }
    // No CPV at all: fall back to the tight, unambiguous care terms only.
    if (BUSINESS_TITLE_RE.test(title || '')) return 'commercial';
    if (CARE_STRICT.some(function (kw) { return kwMatch(text, kw); })) return 'care';
    return 'commercial';
  }

  function detectCqc(title, desc, cpvIds) {
    // Social-care CPVs: 853x social work, 8514x nursing, 8511x hospital/home health.
    if (cpvIds) {
      for (var i = 0; i < cpvIds.length; i++) {
        var c = cpvIds[i] || '';
        if (c.indexOf('853') === 0 || c.indexOf('8514') === 0 || c.indexOf('8511') === 0) return true;
      }
    }
    var text = ((title || '') + ' ' + (desc || '')).toLowerCase();
    var cqcKeywords = ['care', 'domiciliary', 'residential', 'nursing', 'supported living', 'mental health', 'learning disabilit', 'personal care', 'cqc', 'social care'];
    return cqcKeywords.some(function (kw) { return text.includes(kw); });
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

    // pages = how many result pages to walk per feed; days = how far back to look.
    // The daily cron uses light defaults; the manual "Import Now" passes a deep
    // sweep (many pages, ~120 days) to catch open frameworks published weeks ago.
    var _b = {}; try { _b = event.body ? JSON.parse(event.body) : {}; } catch (e) {}
    var pages = _b.pages || 5;
    var days = _b.days || 21;
    // deep = the manual "Import Now" sweep: pull ALL stages on Find a Tender so
    // re-issued/amended frameworks are caught. The light daily cron stays on the
    // 'tender' stage only (new opportunities), which keeps it fast.
    var deep = !!_b.deep;
    
    for (var page = 0; page < pages; page++) {
      var apiUrl = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search' +
        '?publishedFrom=' + getDateDaysAgo(Math.min(days, 30)) + // CF caps the range; 30 days is safe
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
      console.log('Page', page, 'fetched', releases.length, 'records, total:', data.total || 'unknown');
      
      if (!releases.length) {
        console.log('No releases on page', page, 'stopping');
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
          var cpvIds = collectCpv(tender);
          var category = detectCategory(title, desc, cpvIds);
          var isCqc = detectCqc(title, desc, cpvIds);

          // Care-only launch: do not import non-care (commercial) tenders
          if (category !== 'care') { skipped++; continue; }

          if (!title || !deadline) { skipped++; continue; }
          // Skip already-closed tenders (deadline in the past)
          if (new Date(deadline) < new Date()) { skipped++; continue; }

          // Check not already imported, two guards:
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
    // The OCDS API rejects a stages list and even 'tenderUpdate', and 'tender'
    // alone misses re-issued/amended frameworks. So we pull EVERYTHING in the
    // window and keep only care tenders whose deadline is still in the future
    // (the open-deadline check below drops closed/awarded notices). Dedup guards
    // stop the same notice being imported twice across its releases.
    var fatNextUrl = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages' +
      '?updatedFrom=' + getIsoDaysAgo(Math.min(days, 60)) +
      (deep ? '' : '&stages=tender') +
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
      console.log('FAT page', fatLoop, 'fetched', fatReleases.length, 'records');

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
          // Skip already-closed tenders (deadline in the past)
          if (new Date(deadline) < new Date()) { skipped++; continue; }

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

          var cpvIds = collectCpv(ft);
          var category = detectCategory(title, desc, cpvIds);
          var isCqc = detectCqc(title, desc, cpvIds);

          // Care-only launch: do not import non-care (commercial) tenders
          if (category !== 'care') { skipped++; continue; }

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

    console.log('Import complete, imported:', imported, 'skipped:', skipped, 'errors:', errors);
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

// Contracts Finder look-back window (days). Dedup guards stop repeats.
function getDateDaysAgo(days) {
  var d = new Date();
  d.setDate(d.getDate() - (days || 21));
  return d.toISOString().split('T')[0] + 'T00:00:00';
}

// Find a Tender look-back window (days, ISO). Dedup guards prevent re-imports.
function getIsoDaysAgo(days) {
  var d = new Date();
  d.setDate(d.getDate() - (days || 21));
  return d.toISOString().split('.')[0] + 'Z';
}

// Reusable entry point so the manual (background) importer can run exactly the
// same logic as the scheduled one. Returns the handler's { statusCode, body }.
exports.runImport = function (pages, days, deep) {
  return exports.handler({ httpMethod: 'POST', body: JSON.stringify({ pages: pages, days: days, deep: deep }) });
};
