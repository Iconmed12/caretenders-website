// Extracts all fields and questions from an uploaded SQ Word document
// Classifies each field as: auto_fill, ai_draft, or client_confirm
// Stores structured data in Supabase tenders table under sq_data column

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { tenderId, base64, fileName } = JSON.parse(event.body);
    if (!tenderId || !base64) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing data' }) };

    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // Extract text from Word document using Claude's document understanding
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
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: base64 }
            },
            {
              type: 'text',
              text: `Analyse this Selection Questionnaire (SQ) document carefully. Extract every question, field and section that needs to be completed by a bidder.

For each field/question, classify it as one of:
- "auto_fill" — can be filled from company registration data (company name, address, company number, VAT, directors, PSC, CQC number, insurance confirmations, SME status, date of incorporation)
- "ai_draft" — needs a written response that AI can draft (contract examples, technical capability, GDPR policy confirmation, experience narratives)
- "client_confirm" — must be personally confirmed by the client (exclusion declarations, fraud declarations, bribery declarations, debarment confirmation, embargo history)

Return ONLY a valid JSON object in this exact format, no other text:
{
  "sq_title": "name of the SQ document",
  "commissioner": "name of the commissioning authority",
  "sections": [
    {
      "section": "Part 1",
      "title": "Potential Supplier Information",
      "fields": [
        {
          "id": "1.1a",
          "question": "Full name of the potential supplier",
          "field_type": "auto_fill",
          "profile_key": "company_name",
          "hint": "Taken from Companies House registration"
        }
      ]
    }
  ]
}`
            }
          ]
        }]
      })
    });

    if (!extractRes.ok) {
      const errText = await extractRes.text();
      throw new Error('AI extraction failed: ' + errText.substring(0, 200));
    }

    const extractData = await extractRes.json();
    const rawText = extractData.content && extractData.content[0] ? extractData.content[0].text.trim() : '{}';

    // Parse the JSON response
    var clean = rawText.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(clean);

    // Count field types
    var totalFields = 0, autoFill = 0, aiDraft = 0, clientConfirm = 0;
    (parsed.sections || []).forEach(function(section) {
      (section.fields || []).forEach(function(field) {
        totalFields++;
        if (field.field_type === 'auto_fill') autoFill++;
        else if (field.field_type === 'ai_draft') aiDraft++;
        else if (field.field_type === 'client_confirm') clientConfirm++;
      });
    });

    // Save to Supabase tenders table
    var sqData = {
      ...parsed,
      fileName: fileName,
      extractedAt: new Date().toISOString(),
      totalFields: totalFields,
      autoFill: autoFill,
      aiDraft: aiDraft,
      clientConfirm: clientConfirm
    };

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

    if (!saveRes.ok) {
      const saveErr = await saveRes.text();
      throw new Error('Failed to save SQ data: ' + saveErr.substring(0, 200));
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        totalFields: totalFields,
        autoFill: autoFill,
        aiDraft: aiDraft,
        clientConfirm: clientConfirm,
        sqTitle: parsed.sq_title,
        commissioner: parsed.commissioner
      })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Extraction failed' }) };
  }
};
