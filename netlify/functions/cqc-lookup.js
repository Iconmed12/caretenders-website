exports.handler = async (event) => {
  const cors = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors, body:'' };

  const KEY = process.env.CQC_API_KEY;
  const BASE = 'https://api.cqc.org.uk/public/v1';

  async function cqcFetch(path) {
    var res = await fetch(BASE + path, {
      headers: { 'Ocp-Apim-Subscription-Key': KEY, 'Accept': 'application/json', 'User-Agent': 'Cana/1.0' }
    });
    if (!res.ok) throw new Error('CQC API ' + res.status + ': ' + (await res.text()).substring(0,150));
    return res.json();
  }

  try {
    const { query, locationId } = JSON.parse(event.body || '{}');

    // ── Mode 1: Fetch full location details + ratings by ID ──
    if (locationId) {
      var loc = await cqcFetch('/locations/' + encodeURIComponent(locationId));

      var ratings = loc.currentRatings || {};
      var overall = ratings.overall || {};
      var domains = {};
      (overall.keyQuestionRatings || []).forEach(function(kq) {
        domains[kq.name] = kq.rating;
      });

      return { statusCode:200, headers:cors, body: JSON.stringify({
        locationId:   loc.locationId,
        name:         loc.name,
        providerId:   loc.providerId,
        address:      [loc.postalAddressLine1, loc.postalAddressTownCity, loc.postalCode].filter(Boolean).join(', '),
        region:       loc.region || '',
        serviceTypes: (loc.gacServiceTypes||[]).map(function(s){ return s.name; }),
        regulatedActivities: (loc.regulatedActivities||[]).map(function(a){ return a.name; }),
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
        website:       loc.website || ''
      })};
    }

    // ── Mode 2: Search locations by name ──
    if (query) {
      var results = await cqcFetch('/locations?partnerCode=Cana&perPage=10&page=1&name=' + encodeURIComponent(query));
      var locations = (results.locations || []).map(function(l) {
        return {
          locationId: l.locationId,
          name:       l.locationName || l.name,
          postcode:   l.postalCode || ''
        };
      });
      return { statusCode:200, headers:cors, body: JSON.stringify({ locations }) };
    }

    return { statusCode:400, headers:cors, body: JSON.stringify({ error:'Provide query or locationId' }) };

  } catch(e) {
    console.error('CQC lookup error:', e.message);
    return { statusCode:500, headers:cors, body: JSON.stringify({ error:e.message }) };
  }
};
