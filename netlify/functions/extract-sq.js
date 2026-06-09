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

    // Truncate if very long — Claude context limit
    var sqText = docText.length > 30000 ? docText.substring(0, 30000) + '\n...[document truncated]' : docText;

    var prompt = 'Analyse this Selection Questionnaire (SQ) document text carefully. Extract every question and field that a bidder needs to complete.\n\n' +
      'Classify each field as:\n' +
      '- "auto_fill" — can be filled from company registration data (company name, address, company number, VAT, directors, PSC, CQC number/rating, insurance confirmations yes/no, SME status, incorporation date, trading name, website)\n' +
      '- "ai_draft" — needs a written response AI can draft (contract examples, technical capability descriptions, GDPR policy confirmation details, experience narratives, social value statements)\n' +
      '- "client_confirm" — must be personally confirmed by the client (exclusion declarations, fraud/bribery statements, debarment confirmation, embargo history, criminal conviction declarations)\n\n' +
      'For auto_fill fields, include a "profile_key" from this list: company_name, company_number, registered_address, vat_number, company_type, founded_year, cqc_status, cqc_provider_id, contact_name, contact_email, sme_status, directors, psc_details, company_status, sic_codes, regulated_activities, services, regions, experience, accreditations, insurance_employers, insurance_public, insurance_professional, gdpr_policy, ico_number\n\n' +
      'Return ONLY valid JSON, no other text:\n' +
      '{"sq_title":"...","commissioner":"...","sections":[{"section":"Part 1","title":"...","fields":[{"id":"1.1a","question":"...","field_type":"auto_fill","profile_key":"company_name","hint":"..."}]}]}\n\n' +
      'SQ DOCUMENT TEXT:\n' + sqText;

    const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!extractRes.ok) {
      const errText = await extractRes.text();
      throw new Error('AI extraction failed: ' + errText.substring(0, 300));
    }

    const extractData = await extractRes.json();
    const rawText = extractData.content && extractData.content[0] ? extractData.content[0].text.trim() : '{}';
    var clean = rawText.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(clean);

    // Count field types
    var totalFields = 0, autoFill = 0, aiDraft = 0, clientConfirm = 0;
    (parsed.sections || []).forEach(function(section) {
      (section.fields || []).forEach(function(field) {
        totalFields++;
        if (field.field_type === 'auto_fill') autoFill++;
        else if (field.field_type === 'ai_draft') aiDraft++;
        else clientConfirm++;
      });
    });

    var sqData = {
      ...parsed,
      fileName: fileName,
      extractedAt: new Date().toISOString(),
      totalFields: totalFields,
      autoFill: autoFill,
      aiDraft: aiDraft,
      clientConfirm: clientConfirm
    };

    // Save to Supabase
    var saveRes = await fetch(sbUrl + '/rest/v1/tenders?id=eq.' + tenderId, {
      method: 'PATCH',
      headers: {
        apikey: sbKey,
        Authorization: 'Bearer ' + sbKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ sq_data: sqData })
    });

    if (!saveRes.ok) throw new Error('Failed to save: ' + (await saveRes.text()).substring(0, 200));

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        totalFields, autoFill, aiDraft, clientConfirm,
        sqTitle: parsed.sq_title,
        commissioner: parsed.commissioner
      })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Extraction failed' }) };
  }
};
