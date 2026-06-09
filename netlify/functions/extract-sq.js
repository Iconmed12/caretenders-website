const mammoth = require('mammoth');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { tenderId, docText, base64Doc, fileName } = JSON.parse(event.body);
    if (!tenderId || !docText) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing data' }) };

    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // ── 1. Save original .docx to Supabase Storage ──
    var storagePath = null;
    if (base64Doc) {
      try {
        var docBytes = Buffer.from(base64Doc, 'base64');
        var storageRes = await fetch(
          `${sbUrl}/storage/v1/object/sq-docs/${tenderId}/${fileName || 'sq.docx'}`,
          {
            method: 'POST',
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbKey}`,
              'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'x-upsert': 'true'
            },
            body: docBytes
          }
        );
        var storageBody = await storageRes.text();
        console.log('Storage upload:', storageRes.status, storageBody.substring(0, 300));
        if (storageRes.ok) {
          storagePath = `${tenderId}/${fileName || 'sq.docx'}`;
          console.log('storagePath set:', storagePath);
        }
      } catch(e) { console.log('Storage save failed:', e.message); }
    }

    // ── 2. Generate HTML preview from docx (store once, serve instantly) ──
    var htmlPreview = null;
    if (base64Doc) {
      try {
        var docBuf = Buffer.from(base64Doc, 'base64');
        var mammothResult = await mammoth.convertToHtml({ buffer: docBuf });
        htmlPreview = mammothResult.value;
      } catch(e) { console.log('HTML preview generation failed:', e.message); }
    }

    // ── 3. Extract fields with AI ──
    var sqText = docText.length > 10000 ? docText.substring(0, 10000) : docText;

    var prompt = 'You are analysing a UK public sector Selection Questionnaire (SQ).\n\n' +
      'Extract every field or question a bidder must complete. Classify each as:\n' +
      '- "auto_fill" — company name, address, company number, VAT, directors, PSC, CQC, insurance yes/no, SME status, incorporation date\n' +
      '- "ai_draft" — written responses: contract examples, technical capability, GDPR, experience narratives\n' +
      '- "client_confirm" — personal declarations: exclusions, fraud, bribery, debarment, criminal convictions\n\n' +
      'For auto_fill use profile_key from: company_name, company_number, registered_address, vat_number, company_type, founded_year, cqc_status, cqc_provider_id, contact_name, sme_status, directors, psc_details, services, experience, accreditations, insurance_employers, insurance_public, gdpr_policy, ico_number\n\n' +
      'Return ONLY a JSON object starting with {:\n' +
      '{"sq_title":"...","commissioner":"...","sections":[{"section":"Part 1","title":"Supplier Information","fields":[{"id":"1.1a","question":"Full name","field_type":"auto_fill","profile_key":"company_name","hint":"From Companies House"}]}]}\n\n' +
      'Keep questions SHORT (under 60 chars).\n\nSQ TEXT:\n' + sqText;

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

    var clean = rawText.replace(/```json|```/g, '').trim();
    var start = clean.indexOf('{');
    var end = clean.lastIndexOf('}');
    if (start === -1) throw new Error('No JSON found in response');
    clean = end === -1 ? repairJson(clean.substring(start)) : clean.substring(start, end + 1);
    clean = clean.replace(/,(\s*[}\]])/g, '$1');

    var parsed;
    try { parsed = JSON.parse(clean); }
    catch(e) {
      try { parsed = JSON.parse(repairJson(clean)); }
      catch(e2) { throw new Error('JSON parse failed — try uploading again. (' + e.message + ')'); }
    }

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

    // ── 4. Save everything to Supabase ──
    var sqData = {
      ...parsed,
      fileName,
      storagePath,
      htmlPreview,          // stored once here, served instantly to clients
      extractedAt: new Date().toISOString(),
      totalFields, autoFill, aiDraft, clientConfirm
    };

    var saveRes = await fetch(`${sbUrl}/rest/v1/tenders?id=eq.${tenderId}`, {
      method: 'PATCH',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ sq_data: sqData })
    });
    if (!saveRes.ok) throw new Error('Failed to save: ' + (await saveRes.text()).substring(0, 100));

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, totalFields, autoFill, aiDraft, clientConfirm, sqTitle: parsed.sq_title, commissioner: parsed.commissioner, hasPreview: !!htmlPreview })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Extraction failed' }) };
  }
};

function repairJson(str) {
  var opens = 0, arrOpens = 0;
  for (var i = 0; i < str.length; i++) {
    if (str[i] === '{') opens++;
    else if (str[i] === '}') opens--;
    else if (str[i] === '[') arrOpens++;
    else if (str[i] === ']') arrOpens--;
  }
  str = str.replace(/,\s*$/, '');
  while (arrOpens > 0) { str += ']'; arrOpens--; }
  while (opens > 0)    { str += '}'; opens--; }
  return str;
}
