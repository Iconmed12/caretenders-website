exports.handler = async (event) => {
  const cors = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors, body:'' };

  const KEY  = process.env.CQC_API_KEY;
  // Old public API, no auth required, stable, works for direct lookups
  const BASE = 'https://api.cqc.org.uk/public/v1';

  async function cqcFetch(path) {
    var res = await fetch(BASE + path + (path.includes('?') ? '&' : '?') + 'partnerCode=Cana', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Cana-Procurement/1.0' }
    });
    if (!res.ok) {
      var body = await res.text();
      console.log('CQC error:', res.status, body.substring(0,200));
      throw new Error('CQC ' + res.status + ': ' + body.substring(0,100));
    }
    return res.json();
  }

  try {
    const { locationId, query } = JSON.parse(event.body || '{}');

    // ── Lookup by location ID (primary mode) ──
    if (locationId) {
      var loc = await cqcFetch('/locations/' + encodeURIComponent(locationId.trim()));
      var ratings = loc.currentRatings || {};
      var overall = ratings.overall || {};
      var domains = {};
      (overall.keyQuestionRatings || []).forEach(function(kq) { domains[kq.name] = kq.rating; });

      return { statusCode:200, headers:cors, body: JSON.stringify({
        locationId:    loc.locationId,
        name:          loc.name,
        providerId:    loc.providerId,
        address:       [loc.postalAddressLine1, loc.postalAddressTownCity, loc.postalCode].filter(Boolean).join(', '),
        region:        loc.region || '',
        serviceTypes:  (loc.gacServiceTypes||[]).map(function(s){ return s.name; }),
        registrationDate: loc.registrationDate || '',
        overallRating: overall.rating || 'Not yet rated',
        ratingDate:    overall.reportDate || '',
        domains: {
          safe:       domains['Safe'] || '',
          effective:  domains['Effective'] || '',
          caring:     domains['Caring'] || '',
          responsive: domains['Responsive'] || '',
          wellLed:    domains['Well-led'] || ''
        },
        lastInspection: loc.lastInspection && loc.lastInspection.date || '',
        numberOfBeds:   loc.numberOfBeds || 0,
        localAuthority: loc.localAuthority || ''
      })};
    }

    // ── Name search fallback: search by provider name via old API ──
    if (query) {
      try {
        // The old API doesn't support name search directly.
        // We try inspectionDirectorate=Adult social care and page through
        // first few pages looking for a match (limited but functional)
        var matches = [];
        var q = query.toLowerCase();
        var res = await fetch(BASE + '/providers?page=1&perPage=100&inspectionDirectorate=Adult+social+care&partnerCode=Cana',
          { headers: { 'Accept': 'application/json', 'User-Agent': 'Cana-Procurement/1.0' } });
        if (res.ok) {
          var data = await res.json();
          (data.providers || []).forEach(function(p) {
            if ((p.name || '').toLowerCase().includes(q)) {
              matches.push({ locationId: p.providerId, name: p.name, postcode: p.postalCode || '' });
            }
          });
        }
        return { statusCode:200, headers:cors, body: JSON.stringify({ locations: matches.slice(0,10) }) };
      } catch(e) {
        return { statusCode:200, headers:cors, body: JSON.stringify({ locations: [] }) };
      }
    }

    return { statusCode:400, headers:cors, body: JSON.stringify({ error:'Provide locationId or query' }) };

  } catch(e) {
    console.error('CQC error:', e.message);
    return { statusCode:500, headers:cors, body: JSON.stringify({ error:e.message }) };
  }
};
