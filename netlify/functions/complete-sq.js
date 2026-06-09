// AI-drafts all written sections of the SQ using company profile data
exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { tenderId, sqData, profile, chData } = JSON.parse(event.body);
    if (!sqData || !profile) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing data' }) };

    // Collect all ai_draft fields
    var aiFields = [];
    (sqData.sections || []).forEach(function(section) {
      (section.fields || []).forEach(function(field) {
        if (field.field_type === 'ai_draft') {
          aiFields.push({ id: field.id, question: field.question, hint: field.hint || '' });
        }
      });
    });

    if (!aiFields.length) return { statusCode: 200, headers: cors, body: JSON.stringify({ draftedFields: {} }) };

    // Build company context
    var co = 'Company: ' + (profile.company_name || chData && chData.company_name || 'Unknown') + '\n';
    co += 'Founded: ' + (profile.founded_year || chData && chData.date_of_creation || 'Unknown') + '\n';
    co += 'Staff: ' + (profile.total_staff || 'Unknown') + '\n';
    co += 'CQC: ' + (profile.cqc_status || 'Not specified') + '\n';
    co += 'CQC Provider ID: ' + (profile.cqc_provider_id || 'Not specified') + '\n';
    co += 'Services: ' + (profile.services || 'Not specified') + '\n';
    co += 'Regions: ' + (profile.regions || 'Not specified') + '\n';
    if (profile.experience) co += 'Contract experience: ' + profile.experience + '\n';
    if (profile.achievements) co += 'Achievements: ' + profile.achievements + '\n';
    if (profile.kpis) co += 'KPIs: ' + profile.kpis + '\n';
    if (profile.policies) co += 'Policies: ' + profile.policies + '\n';
    if (profile.accreditations) co += 'Accreditations: ' + profile.accreditations + '\n';
    if (profile.social_value) co += 'Social value: ' + profile.social_value + '\n';

    var tender = sqData.commissioner ? 'Commissioner: ' + sqData.commissioner : '';

    var prompt = 'You are an expert UK public sector bid writer completing a Selection Questionnaire for a care provider.\n\n' +
      'COMPANY DETAILS:\n' + co + '\n' +
      (tender ? tender + '\n\n' : '\n') +
      'For each question below, write a concise, professional response suitable for a public sector SQ. ' +
      'Use the company details above. Be specific, avoid generic language. ' +
      'Keep each response under 300 words unless the question clearly requires more. ' +
      'Do not use bullet points unless the question asks for a list.\n\n' +
      'Return ONLY a JSON object where keys are the field IDs and values are the drafted responses. No other text.\n\n' +
      'QUESTIONS:\n' + JSON.stringify(aiFields);

    var res = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!res.ok) throw new Error('AI drafting failed');
    var data = await res.json();
    var text = data.content && data.content[0] ? data.content[0].text.trim() : '{}';
    var clean = text.replace(/```json|```/g, '').trim();
    var draftedFields = JSON.parse(clean);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ draftedFields: draftedFields }) };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Failed' }) };
  }
};
