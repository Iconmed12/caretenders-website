exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { tenderId, docText, fileName } = JSON.parse(event.body);
    if (!tenderId || !docText) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing data' }) };

    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // Keep first 10000 chars — enough to capture all question types
    var sqText = docText.length > 10000 ? docText.substring(0, 10000) : docText;

    var prompt = 'You are analysing a UK public sector Selection Questionnaire (SQ).\n\n' +
      'Extract every field or question a bidder must complete. For each field classify it as:\n' +
      '- "auto_fill" — company name, address, company number, VAT, directors, PSC, CQC details, insurance yes/no, SME status, incorporation date\n' +
      '- "ai_draft" — written responses: contract examples, technical capability, GDPR details, experience narratives\n' +
      '- "client_confirm" — personal declarations: exclusions, fraud, bribery, debarment, criminal convictions\n\n' +
      'For auto_fill fields use profile_key from: company_name, company_number, registered_address, vat_number, company_type, founded_year, cqc_status, cqc_provider_id, contact_name, sme_status, directors, psc_details, services, experience, accreditations, insurance_employers, insurance_public, gdpr_policy, ico_number\n\n' +
      'Return ONLY a JSON object. Start immediately with { — no preamble, no markdown, no backticks.\n' +
      'Use this exact structure with double quotes only:\n' +
      '{"sq_title":"...","commissioner":"...","sections":[{"section":"Part 1","title":"Supplier Information","fields":[{"id":"1.1a","question":"Full name","field_type":"auto_fill","profile_key":"company_name","hint":"From Companies House"}]}]}\n\n' +
      'Keep field questions SHORT (under 60 chars). Do not include guidance text, only the actual question.\n\n' +
      'SQ TEXT:\n' + sqText;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) throw new Error('AI call failed: ' + (await res.text()).substring(0, 200));

    const aiData = await res.json();
    var rawText = aiData.content && aiData.content[0] ? aiData.content[0].text.trim() : '';
    if (!rawText) throw new Error('AI returned empty response');

    // Clean and repair the JSON
    var clean = rawText.replace(/```json|```/g, '').trim();

    // Extract the JSON object
    var start = clean.indexOf('{');
    var end = clean.lastIndexOf('}');
    if (start === -1) throw new Error('No JSON object found in response');

    // If response was truncated, try to close open structures
    if (end === -1 || end < start) {
      clean = repairJson(clean.substring(start));
    } else {
      clean = clean.substring(start, end + 1);
    }

    // Remove trailing commas before } or ]
    clean = clean.replace(/,(\s*[}\]])/g, '$1');

    var parsed;
    try {
      parsed = JSON.parse(clean);
    } catch(e) {
      // Try repair
      try {
        parsed = JSON.parse(repairJson(clean));
      } catch(e2) {
        throw new Error('JSON parse failed — the SQ document may be too complex. Try a shorter SQ or contact support. (' + e.message + ')');
      }
    }

    // Count field types
    var totalFields = 0, autoFill = 0, aiDraft = 0, clientConfirm = 0;
    (parsed.sections || []).forEach(function(s) {
      (s.fields || []).forEach(function(f) {
        totalFields++;
        if (f.field_type === 'auto_fill') autoFill++;
        else if (f.field_type === 'ai_draft') aiDraft++;
        else clientConfirm++;
      });
    });

    if (totalFields === 0) throw new Error('No fields extracted — check the document is a valid SQ');

    var sqData = {
      ...parsed,
      fileName: fileName,
      extractedAt: new Date().toISOString(),
      totalFields, autoFill, aiDraft, clientConfirm
    };

    // Save to Supabase
    var saveRes = await fetch(sbUrl + '/rest/v1/tenders?id=eq.' + tenderId, {
      method: 'PATCH',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ sq_data: sqData })
    });
    if (!saveRes.ok) throw new Error('Failed to save: ' + (await saveRes.text()).substring(0, 100));

    return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, totalFields, autoFill, aiDraft, clientConfirm, sqTitle: parsed.sq_title, commissioner: parsed.commissioner }) };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Extraction failed' }) };
  }
};

function repairJson(str) {
  // Count unclosed brackets and braces, close them
  var opens = 0, arrOpens = 0;
  for (var i = 0; i < str.length; i++) {
    if (str[i] === '{') opens++;
    else if (str[i] === '}') opens--;
    else if (str[i] === '[') arrOpens++;
    else if (str[i] === ']') arrOpens--;
  }
  // Remove trailing comma if present
  str = str.replace(/,\s*$/, '');
  // Close open structures
  while (arrOpens > 0) { str += ']'; arrOpens--; }
  while (opens > 0)    { str += '}'; opens--; }
  return str;
}
