// Supports both:
// - { companyNumber } — fetch full company profile + officers + PSC
// - { query } — search by company name, return list of matches
exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
    const baseUrl = 'https://api.company-information.service.gov.uk';

    // ── SEARCH MODE ──
    if (body.query) {
      const q = body.query.trim();
      const res = await fetch(
        `${baseUrl}/search/companies?q=${encodeURIComponent(q)}&items_per_page=8`,
        { headers: { Authorization: authHeader } }
      );
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const items = (data.items || []).map(function(c) {
        return {
          company_name:    c.title,
          company_number:  c.company_number,
          company_status:  c.company_status,
          company_type:    c.company_type,
          date_of_creation: c.date_of_creation,
          registered_address: c.registered_office_address
            ? [c.registered_office_address.address_line_1, c.registered_office_address.address_line_2, c.registered_office_address.locality, c.registered_office_address.postal_code].filter(Boolean).join(', ')
            : ''
        };
      });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ results: items }) };
    }

    // ── LOOKUP MODE (by number) ──
    if (!body.companyNumber) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Company number or search query required' }) };
    }

    const num = body.companyNumber.trim().toUpperCase().replace(/\s/g, '');

    const [profileRes, officersRes, pscRes] = await Promise.all([
      fetch(`${baseUrl}/company/${num}`,                 { headers: { Authorization: authHeader } }),
      fetch(`${baseUrl}/company/${num}/officers`,        { headers: { Authorization: authHeader } }),
      fetch(`${baseUrl}/company/${num}/persons-with-significant-control`, { headers: { Authorization: authHeader } })
    ]);

    if (!profileRes.ok) {
      const err = await profileRes.json().catch(() => ({}));
      throw new Error(err.error || 'Company not found. Please check the number.');
    }

    const [profile, officers, pscs] = await Promise.all([
      profileRes.json(),
      officersRes.ok ? officersRes.json() : { items: [] },
      pscRes.ok ? pscRes.json() : { items: [] }
    ]);

    const address = profile.registered_office_address || {};
    const registered_address = [
      address.address_line_1, address.address_line_2,
      address.locality, address.region, address.postal_code, address.country
    ].filter(Boolean).join(', ');

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        company_name:     profile.company_name,
        company_number:   profile.company_number,
        company_type:     profile.type,
        company_status:   profile.company_status,
        date_of_creation: profile.date_of_creation,
        registered_address,
        sic_codes:        (profile.sic_codes || []).join(', '),
        accounts:         profile.accounts,
        officers: (officers.items || [])
          .filter(o => o.resigned_on == null)
          .map(o => ({
            name: o.name,
            role: o.officer_role,
            appointed_on: o.appointed_on,
            resigned_on:  o.resigned_on
          })),
        pscs: (pscs.items || []).map(p => ({
          name: p.name || (p.identification && p.identification.registration_number) || 'Unknown',
          nature_of_control: (p.natures_of_control || []).join(', ')
        }))
      })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Lookup failed' }) };
  }
};
