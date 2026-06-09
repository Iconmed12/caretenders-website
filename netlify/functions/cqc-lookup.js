exports.handler = async (event) => {
  const cors = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors, body:'' };

  const KEY  = process.env.CQC_API_KEY;
  const BASE = 'https://api.service.cqc.org.uk';

  async function cqcFetch(path) {
    var res = await fetch(BASE + path, {
      headers: {
        'Authorization': 'Bearer ' + KEY,
        'Ocp-Apim-Subscription-Key': KEY,
        'Accept': 'application/json',
        'User-Agent': 'Cana-Procurement/1.0'
      }
    });
    if (!res.ok) {
      var body = await res.text();
      console.log('CQC API error:', res.status, body.substring(0,300));
      throw new Error('CQC ' + res.status + ': ' + body.substring(0,150));
    }
    return res.json();
  }

  try {
    const { query, locationId } = JSON.parse(event.body || '{}');

    // ── Mode 1: Full location details + ratings by ID ──
    if (locationId) {
      var loc = await cqcFetch('/locations/' + encodeURIComponent(locationId));
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

    // ── Mode 2: Search by name ──
    if (query) {
      var locations = [];
      console.log('CQC search:', query);

      var provRes = await cqcFetch('/providers?perPage=8&page=1&name=' + encodeURIComponent(query));
      var providers = provRes.providers || [];
      console.log('Providers found:', providers.length);

      for (var p of providers.slice(0, 3)) {
        try {
          var pDetail = await cqcFetch('/providers/' + encodeURIComponent(p.providerId));
          var locIds = (pDetail.locationIds || []).slice(0, 5);
          for (var lid of locIds) {
            try {
              var lDetail = await cqcFetch('/locations/' + encodeURIComponent(lid));
              if (lDetail.registrationStatus === 'Registered') {
                locations.push({
                  locationId: lDetail.locationId,
                  name:       lDetail.name,
                  postcode:   lDetail.postalCode || ''
                });
              }
            } catch(e) {}
            if (locations.length >= 10) break;
          }
        } catch(e) {}
        if (locations.length >= 10) break;
      }

      return { statusCode:200, headers:cors, body: JSON.stringify({ locations }) };
    }

    return { statusCode:400, headers:cors, body: JSON.stringify({ error:'Provide query or locationId' }) };

  } catch(e) {
    console.error('CQC lookup error:', e.message);
    return { statusCode:500, headers:cors, body: JSON.stringify({ error:e.message }) };
  }
};
