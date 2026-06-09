exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { companyNumber } = JSON.parse(event.body);
    if (!companyNumber) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Company number required' }) };

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    const num = companyNumber.trim().toUpperCase().replace(/\s/g, '');
    const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
    const baseUrl = 'https://api.company-information.service.gov.uk';

    // Fetch company profile, officers and PSC in parallel
    const [profileRes, officersRes, pscRes] = await Promise.all([
      fetch(baseUrl + '/company/' + num, { headers: { Authorization: authHeader } }),
      fetch(baseUrl + '/company/' + num + '/officers?items_per_page=20', { headers: { Authorization: authHeader } }),
      fetch(baseUrl + '/company/' + num + '/persons-with-significant-control?items_per_page=10', { headers: { Authorization: authHeader } })
    ]);

    if (!profileRes.ok) {
      if (profileRes.status === 404) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Company not found. Please check the company number.' }) };
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Could not retrieve company data.' }) };
    }

    const profile = await profileRes.json();
    const officersData = officersRes.ok ? await officersRes.json() : {};
    const pscData = pscRes.ok ? await pscRes.json() : {};

    // Extract active officers/directors
    const officers = (officersData.items || [])
      .filter(function(o){ return !o.resigned_on; })
      .map(function(o){
        return {
          name: o.name,
          role: o.officer_role,
          appointed: o.appointed_on
        };
      });

    // Extract PSC
    const pscs = (pscData.items || [])
      .filter(function(p){ return !p.ceased_on; })
      .map(function(p){
        return {
          name: p.name,
          nature_of_control: (p.natures_of_control || []).join(', ')
        };
      });

    // Format registered address
    var addr = profile.registered_office_address || {};
    var addressParts = [addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code]
      .filter(Boolean).join(', ');

    // Accounts status
    var accounts = profile.accounts || {};
    var nextAccounts = accounts.next_due ? accounts.next_due : null;
    var lastAccounts = accounts.last_accounts ? accounts.last_accounts.made_up_to : null;

    // Confirmation statement
    var confStmt = profile.confirmation_statement || {};
    var nextConfirmation = confStmt.next_due ? confStmt.next_due : null;

    // SIC codes
    var sicCodes = (profile.sic_codes || []).join(', ');

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        company_name: profile.company_name,
        company_number: profile.company_number,
        company_type: profile.type,
        company_status: profile.company_status,
        date_of_creation: profile.date_of_creation,
        registered_address: addressParts,
        sic_codes: sicCodes,
        accounts_next_due: nextAccounts,
        accounts_last_made_up: lastAccounts,
        confirmation_next_due: nextConfirmation,
        officers: officers,
        pscs: pscs,
        jurisdiction: profile.jurisdiction
      })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Lookup failed' }) };
  }
};
