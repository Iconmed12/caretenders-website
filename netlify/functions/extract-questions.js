const { checkAdmin, logAdminCheck } = require('./_admin-auth');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  // Phase 1a MONITOR MODE: log who is calling, do not block yet.
  logAdminCheck('extract-questions', await checkAdmin(event));

  try {
    const { text } = JSON.parse(event.body);
    if (!text) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No text provided' }) };

    const prompt = 'You are reading a UK public sector tender quality questions document. Extract every question that bidders are required to answer.\n\nFor each question identify:\n1. The full question text (include any scenario or context that is part of the question)\n2. The word limit if mentioned (just the number)\n3. The scoring weight if mentioned (e.g. 22%, Pass/Fail)\n\nReturn ONLY a JSON array with no other text, like this:\n[{"question":"Full question text here","wordLimit":"500","scoring":"22%"},{"question":"Second question","wordLimit":"1000","scoring":"Pass/Fail"}]\n\nIf no word limit is mentioned use empty string. If no scoring is mentioned use empty string. Include the full scenario text as part of the question if scenarios are provided.\n\nDOCUMENT TEXT:\n' + text.substring(0, 8000);

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!ai.ok) {
      const e = await ai.text();
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'AI error: ' + e.substring(0, 100) }) };
    }

    const aiData = await ai.json();
    var rawText = aiData.content[0].text.trim();

    // Strip markdown code blocks if present
    rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    var questions;
    try {
      questions = JSON.parse(rawText);
    } catch(e) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not parse questions from document. Please check the document contains clear questions.' }) };
    }

    if (!Array.isArray(questions) || !questions.length) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No questions found in this document.' }) };
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ questions: questions })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
