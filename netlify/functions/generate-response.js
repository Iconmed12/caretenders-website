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
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // Fetch tender and knowledge base in parallel
    const [tRes, kbRes] = await Promise.all([
      fetch(sbUrl + '/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1', { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }),
      fetch(sbUrl + '/rest/v1/cana_knowledge?id=eq.global&select=*&limit=1', { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } })
    ]);

    const tRows = await tRes.json();
    const kbRows = await kbRes.json();
    const t = tRows[0];
    const kb = kbRows[0] || {};

    if (!t) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Tender not found' }) };

    const allQ = t.cana_questions || [];
    if (!allQ.length) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No questions set up for this tender yet.' }) };

    const idx = questionIndex || 0;
    const q = allQ[idx];
    if (!q) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Question not found' }) };

    const canaDocs = t.cana_docs || {};
    const specDocs = Array.isArray(canaDocs.spec) ? canaDocs.spec : (canaDocs.spec ? [canaDocs.spec] : []);
    const scoringDocs = Array.isArray(canaDocs.scoring) ? canaDocs.scoring : (canaDocs.scoring ? [canaDocs.scoring] : []);
    const specText = specDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 3000);
    const scoringText = scoringDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 2000);

    const wordLimit = q.wordLimit ? parseInt(q.wordLimit) : 500;
    const maxTokens = Math.min(Math.ceil(wordLimit * 1.8), 2000);
    const co = companyDetails;

    // Build system prompt
    var sp = 'You are an expert UK public sector tender writer with 20 years experience winning care contracts.';
    if (kb.writing_style) { sp = sp + ' WRITING STYLE: ' + kb.writing_style.replace(/\n/g, ' '); }
    if (kb.commissioner_preferences) { sp = sp + ' COMMISSIONER PRIORITIES: ' + kb.commissioner_preferences.replace(/\n/g, ' '); }
    if (kb.avoid_patterns_text) { sp = sp + ' AVOID: ' + kb.avoid_patterns_text.replace(/\n/g, ' '); }
    if (kb.winning_examples && kb.winning_examples.length) {
      sp = sp + ' WINNING EXAMPLES TO STUDY: ' + kb.winning_examples.map(function(w){ return w.name + ': ' + (w.text||'').substring(0,500).replace(/\n/g,' '); }).join(' | ');
    }
    if (kb.failed_examples && kb.failed_examples.length) {
      sp = sp + ' FAILED PATTERNS TO AVOID: ' + kb.failed_examples.map(function(f){ return f.name + ': ' + (f.text||'').substring(0,300).replace(/\n/g,' '); }).join(' | ');
    }

    // Build user prompt
    var up = 'Write a tender response for this question.';
    up = up + ' Tender: ' + t.title + '. Buyer: ' + (t.org||'') + '.';
    up = up + ' Organisation: ' + co.name + ', founded ' + co.founded + ', ' + co.staff + ' staff, CQC: ' + co.cqc + ', services: ' + co.services + ', regions: ' + co.regions + (co.experience ? ', experience: ' + co.experience : '') + '.';
    if (specText) { up = up + ' SERVICE SPECIFICATION: ' + specText; }
    if (scoringText) { up = up + ' SCORING CRITERIA: ' + scoringText; }
    up = up + ' QUESTION: ' + q.question;
    if (q.scoring) { up = up + ' [Scoring weight: ' + q.scoring + ']'; }
    if (q.wordLimit) { up = up + ' [Word limit: ' + q.wordLimit + ' words]'; }
    up = up + ' Write the full response now. Stay within the word limit. Do not repeat the question.';

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: maxTokens, system: sp, messages: [{ role: 'user', content: up }] })
    });

    if (!ai.ok) { const e = await ai.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'AI error: ' + e.substring(0,200) }) }; }

    const aiData = await ai.json();
    const answer = aiData.content[0].text.trim();

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ question: q.question, answer: answer, questionIndex: idx, totalQuestions: allQ.length })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Failed' }) };
  }
};
