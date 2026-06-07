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
    const { tenderId, companyDetails, questionIndex } = body;

    const sbKey = process.env.SUPABASE_ANON_KEY;
    const tRes = await fetch(
      'https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/tenders?id=eq.' + tenderId + '&select=id,title,org,cana_questions,cana_knowledge&limit=1',
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
    );
    const rows = await tRes.json();
    const t = rows[0];
    if (!t) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Tender not found' }) };

    const allQ = t.cana_questions || [];
    if (!allQ.length) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No questions set up for this tender yet.' }) };

    const idx = questionIndex || 0;
    const q = allQ[idx];
    if (!q) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Question not found' }) };

    const co = companyDetails;
    const wordLimit = q.wordLimit ? parseInt(q.wordLimit) : 400;
    const maxTokens = Math.min(Math.ceil(wordLimit * 1.5), 1200);

    const prompt = 'Write a tender response for ' + co.name + ' (founded ' + co.founded + ', ' + co.staff + ' staff, CQC: ' + co.cqc + ', services: ' + co.services + ', regions: ' + co.regions + ').\nTender: ' + t.title + ' (' + (t.org||'') + ')\n\nQuestion: ' + q.question + '\n\nWrite a professional first-person response. Max ' + wordLimit + ' words. No markdown.';

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!ai.ok) { const e = await ai.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'AI error: ' + e.substring(0,100) }) }; }

    const aiData = await ai.json();
    const answer = aiData.content[0].text.trim();

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        question: q.question,
        answer: answer,
        questionIndex: idx,
        totalQuestions: allQ.length
      })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Failed' }) };
  }
};
