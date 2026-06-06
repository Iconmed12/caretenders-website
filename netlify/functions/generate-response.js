exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const body = JSON.parse(event.body);
    const { tenderId, companyDetails } = body;
    const batchStart = body.batchStart || 0;
    const batchEnd = body.batchEnd || 4;

    const sbKey = process.env.SUPABASE_ANON_KEY;
    const tRes = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1',
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } });
    const rows = await tRes.json();
    const t = rows[0];
    if (!t) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Tender not found' }) };

    const allQ = t.cana_questions || [];
    if (!allQ.length) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No questions set up for this tender yet.' }) };

    const qs = allQ.slice(batchStart, batchEnd);
    const co = companyDetails;
    var prompt = 'You are a UK tender writer. Write responses for ' + co.name + ' (founded ' + co.founded + ', ' + co.staff + ' staff, CQC: ' + co.cqc + ', services: ' + co.services + ', regions: ' + co.regions + ').\nTender: ' + t.title + '\n\n';

    for (var i = 0; i < qs.length; i++) {
      prompt += 'QUESTION ' + (i+1) + ': ' + qs[i].question + (qs[i].wordLimit ? ' (max ' + qs[i].wordLimit + ' words)' : '') + '\nANSWER ' + (i+1) + ':\n\n';
    }

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 3000, system: 'You are an expert UK public sector tender writer. Write professional first-person responses. No markdown symbols.', messages: [{ role: 'user', content: prompt }] })
    });

    if (!ai.ok) { const e = await ai.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'AI error: ' + e.substring(0,100) }) }; }

    const aiData = await ai.json();
    const full = aiData.content[0].text;
    const blocks = full.split(/ANSWER \d+:/i);
    var responses = [];
    for (var k = 0; k < qs.length; k++) {
      var ans = blocks[k+1] ? blocks[k+1].split(/QUESTION \d+:/i)[0].trim() : '';
      responses.push({ question: qs[k].question, answer: ans || 'Could not generate response.' });
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ responses: responses, totalQuestions: allQ.length, tenderId: tenderId, tenderTitle: t.title }) };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Failed' }) };
  }
};
