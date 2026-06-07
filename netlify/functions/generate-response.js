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
      'https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1',
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
    );
    const rows = await tRes.json();
    const t = rows[0];
    if (!t) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Tender not found' }) };

    // Fetch global knowledge base
    var kb = {};
    try {
      var kbRes = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/cana_knowledge?id=eq.global&select=*&limit=1',
        { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } });
      var kbRows = await kbRes.json();
      kb = kbRows[0] || {};
    } catch(e) { console.log('KB fetch error:', e.message); }

    const allQ = t.cana_questions || [];
    if (!allQ.length) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No questions set up for this tender yet.' }) };

    const idx = questionIndex || 0;
    const q = allQ[idx];
    if (!q) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Question not found' }) };

    // Extract spec and scoring docs
    const canaDocs = t.cana_docs || {};
    const specDocs = Array.isArray(canaDocs.spec) ? canaDocs.spec : (canaDocs.spec ? [canaDocs.spec] : []);
    const scoringDocs = Array.isArray(canaDocs.scoring) ? canaDocs.scoring : (canaDocs.scoring ? [canaDocs.scoring] : []);
    const specText = specDocs.map(function(d){ return d.text || ''; }).join('\n').substring(0, 3000);
    const scoringText = scoringDocs.map(function(d){ return d.text || ''; }).join('\n').substring(0, 2000);
    const knowledge = t.cana_knowledge || '';

    const co = companyDetails;
    const wordLimit = q.wordLimit ? parseInt(q.wordLimit) : 500;
    const maxTokens = Math.min(Math.ceil(wordLimit * 1.8), 2000);

    var systemPrompt = 'You are an expert UK public sector tender writer with 20 years of experience winning care contracts. You write high-quality, compelling, evidence-based tender responses that score maximum marks.';

    if (kb.writing_style) {
      systemPrompt += '

WRITING STYLE GUIDANCE:
' + kb.writing_style;
    }
    if (kb.commissioner_preferences) {
      systemPrompt += '

WHAT COMMISSIONERS LOOK FOR:
' + kb.commissioner_preferences;
    }
    if (kb.avoid_patterns_text) {
      systemPrompt += '

WHAT TO AVOID:
' + kb.avoid_patterns_text;
    }
    if (kb.winning_examples && kb.winning_examples.length) {
      var winText = kb.winning_examples.map(function(w){ return 'Example (' + w.name + '):
' + (w.text||'').substring(0,800); }).join('

---

');
      systemPrompt += '

WINNING TENDER EXAMPLES (study this style and approach):
' + winText;
    }
    if (kb.failed_examples && kb.failed_examples.length) {
      var failText = kb.failed_examples.map(function(f){ return 'Failed example (' + f.name + '):
' + (f.text||'').substring(0,400); }).join('

---

');
      systemPrompt += '

FAILED TENDER EXAMPLES (avoid these patterns):
' + failText;
    }
    systemPrompt += '\n\nWRITING RULES:';
    systemPrompt += '\n- Write in first person (we/our) on behalf of the bidding organisation';
    systemPrompt += '\n- Always reference the specific company details provided — name, CQC rating, staff numbers, regions, experience';
    systemPrompt += '\n- Structure every answer: strong opening statement, detailed evidence, specific examples, confident conclusion';
    systemPrompt += '\n- Use professional UK English — formal but readable';
    systemPrompt += '\n- Never use vague language like "we will endeavour to" — be specific and committal';
    systemPrompt += '\n- Reference the service specification requirements where relevant';
    systemPrompt += '\n- Align every answer to the scoring criteria to maximise marks';
    systemPrompt += '\n- Do not use markdown symbols, bullet points with dashes, or headers with # symbols';
    systemPrompt += '\n- Write in clear paragraphs only';
    if (knowledge) { systemPrompt += '\n\nADDITIONAL GUIDANCE:\n' + knowledge; }

    var userPrompt = 'Write a tender response for the following question.\n\n';
    userPrompt += 'TENDER: ' + t.title + '\n';
    userPrompt += 'BUYER: ' + (t.org || '') + '\n\n';
    userPrompt += 'BIDDING ORGANISATION:\n';
    userPrompt += '- Name: ' + co.name + '\n';
    userPrompt += '- Founded: ' + co.founded + '\n';
    userPrompt += '- Staff: ' + co.staff + '\n';
    userPrompt += '- CQC Status: ' + co.cqc + '\n';
    userPrompt += '- Services: ' + co.services + '\n';
    userPrompt += '- Regions: ' + co.regions + '\n';
    if (co.experience) { userPrompt += '- Previous experience: ' + co.experience + '\n'; }

    if (specText) {
      userPrompt += '\nSERVICE SPECIFICATION (use this to align your answer to what the commissioner requires):\n' + specText + '\n';
    }
    if (scoringText) {
      userPrompt += '\nSCORING CRITERIA (align your answer to score maximum marks):\n' + scoringText + '\n';
    }

    userPrompt += '\nQUESTION ' + (idx + 1) + ': ' + q.question;
    if (q.scoring) { userPrompt += '\nScoring weight: ' + q.scoring; }
    if (q.wordLimit) { userPrompt += '\nWord limit: ' + q.wordLimit + ' words'; }
    userPrompt += '\n\nWrite a complete, high-quality response. Stay within the word limit. Do not repeat the question. Just write the answer in clear paragraphs.';

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!ai.ok) { const e = await ai.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'AI error: ' + e.substring(0,200) }) }; }

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
