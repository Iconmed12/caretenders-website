exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { tenderId, companyDetails, questionIndex } = JSON.parse(event.body);
    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    const [tRes, kbRes] = await Promise.all([
      fetch(sbUrl + '/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1',
        { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }),
      fetch(sbUrl + '/rest/v1/cana_knowledge?id=eq.global&select=*&limit=1',
        { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } })
    ]);

    const tRows = await tRes.json();
    const kbRows = await kbRes.json();
    const t = tRows[0];
    const kb = kbRows[0] || {};

    if (!t) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Tender not found' }) };

    const allQ = t.cana_questions || [];
    if (!allQ.length) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No questions set up yet.' }) };

    const idx = questionIndex || 0;
    const q = allQ[idx];
    if (!q) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Question not found' }) };

    const canaDocs = t.cana_docs || {};
    const specDocs = Array.isArray(canaDocs.spec) ? canaDocs.spec : (canaDocs.spec ? [canaDocs.spec] : []);
    const scoringDocs = Array.isArray(canaDocs.scoring) ? canaDocs.scoring : (canaDocs.scoring ? [canaDocs.scoring] : []);
    const specText = specDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 2000);
    const scoringText = scoringDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 1000);

    const wordLimit = q.wordLimit ? parseInt(q.wordLimit) : 500;
    const maxTokens = Math.min(Math.ceil(wordLimit * 1.3), 1200);
    const co = companyDetails;

    var sp = 'You are an expert UK public sector tender writer with 20 years experience winning care contracts.';
    if (kb.writing_style) { sp += ' WRITING STYLE: ' + kb.writing_style.replace(/\n/g, ' '); }
    if (kb.commissioner_preferences) { sp += ' COMMISSIONER PRIORITIES: ' + kb.commissioner_preferences.replace(/\n/g, ' '); }
    if (kb.avoid_patterns_text) { sp += ' AVOID: ' + kb.avoid_patterns_text.replace(/\n/g, ' '); }
    if (kb.winning_examples && kb.winning_examples.length) {
      sp += ' WINNING STYLE EXAMPLES: ' + kb.winning_examples.map(function(w){ return (w.text||'').substring(0,400).replace(/\n/g,' '); }).join(' | ');
    }
    if (kb.feedback_examples && kb.feedback_examples.length) {
      sp += ' COMMISSIONER FEEDBACK: ' + kb.feedback_examples.map(function(f){ return (f.text||'').substring(0,300).replace(/\n/g,' '); }).join(' | ');
    }

    var up = 'Write a tender response for: ' + t.title + ' (' + (t.org||'') + ').';
    up += ' Bidding organisation: ' + co.name + ', founded ' + co.founded + ', ' + co.staff + ' staff, CQC: ' + co.cqc + ', services: ' + co.services + ', regions: ' + co.regions;
    if (co.experience) { up += ', experience: ' + co.experience; }
    if (specText) { up += '. SPECIFICATION: ' + specText; }
    if (scoringText) { up += '. SCORING: ' + scoringText; }
    up += '. QUESTION: ' + q.question;
    if (q.scoring) { up += ' (Scoring weight: ' + q.scoring + ')'; }
    if (q.wordLimit) { up += ' (Word limit: ' + q.wordLimit + ' words)'; }
    up += '. Write the complete response now. Do not repeat the question. Write in flowing paragraphs.';

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: sp,
        messages: [{ role: 'user', content: up }]
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'AI error: ' + errText.substring(0, 200) }) };
    }

    const aiData = await aiRes.json();
    const answer = aiData.content && aiData.content[0] ? aiData.content[0].text.trim() : '';

    if (!answer) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'AI returned empty response' }) };
    }

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
