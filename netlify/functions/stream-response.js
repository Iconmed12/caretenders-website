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
    const specText = specDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 3000);
    const scoringText = scoringDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 1500);

    const wordLimit = q.wordLimit ? parseInt(q.wordLimit) : 500;
    // Allow generous token budget: words * ~1.5 tokens/word, plus 500 buffer, capped at 4000
    const maxTokens = Math.min(Math.ceil(wordLimit * 1.5) + 500, 7000);

    const co = companyDetails;

    // Build system prompt
    var sp = 'You are an expert UK public sector tender writer with 20 years experience winning care contracts. ';
    sp += 'Write detailed, specific, evidence-based responses. Use concrete figures, percentages, and named processes. ';
    sp += 'Never use vague language. Always stay within the word limit. Write in flowing, professional paragraphs. ';
    sp += 'Do not use bullet points unless the question specifically asks for a list. ';
    sp += 'Do not repeat or rephrase the question. Begin your response directly.';

    if (kb.writing_style) {
      sp += '\n\nWRITING STYLE INSTRUCTIONS: ' + kb.writing_style.replace(/\n/g, ' ');
    }
    if (kb.commissioner_preferences) {
      sp += '\n\nCOMMISSIONER PRIORITIES: ' + kb.commissioner_preferences.replace(/\n/g, ' ');
    }
    if (kb.avoid_patterns_text) {
      sp += '\n\nAVOID THESE PATTERNS: ' + kb.avoid_patterns_text.replace(/\n/g, ' ');
    }

    // Include winning examples with more content for better style modelling
    if (kb.winning_examples && kb.winning_examples.length) {
      sp += '\n\nWINNING TENDER RESPONSE EXAMPLES (study these for tone, depth, and specificity):\n';
      kb.winning_examples.forEach(function(w, i) {
        var excerpt = (w.text || '').replace(/\n+/g, ' ').trim().substring(0, 1200);
        sp += '\n--- Example ' + (i + 1) + ' (' + (w.name || 'Winning response') + ') ---\n' + excerpt + '\n';
      });
      sp += '\n--- Use the above examples as your style and quality benchmark. ---';
    }

    // Include commissioner feedback for quality awareness
    if (kb.feedback_examples && kb.feedback_examples.length) {
      sp += '\n\nCOMMISSIONER FEEDBACK FROM PAST TENDERS (use this to understand what evaluators reward):\n';
      kb.feedback_examples.forEach(function(f, i) {
        var excerpt = (f.text || '').replace(/\n+/g, ' ').trim().substring(0, 600);
        sp += '\n--- Feedback ' + (i + 1) + ': ' + excerpt + '\n';
      });
    }

    // Build user prompt
    var up = 'TENDER: ' + t.title + ' (' + (t.org || '') + ')\n\n';
    up += 'BIDDING ORGANISATION:\n';
    up += '- Company: ' + co.name + '\n';
    up += '- Founded: ' + co.founded + '\n';
    up += '- Staff: ' + co.staff + '\n';
    up += '- CQC rating: ' + co.cqc + '\n';
    up += '- Services: ' + co.services + '\n';
    up += '- Regions: ' + co.regions + '\n';
    if (co.experience) { up += '- Additional experience: ' + co.experience + '\n'; }

    if (specText) {
      up += '\nSPECIFICATION CONTEXT:\n' + specText + '\n';
    }
    if (scoringText) {
      up += '\nSCORING CRITERIA:\n' + scoringText + '\n';
    }

    up += '\nQUESTION TO ANSWER: ' + q.question;
    if (q.scoring) { up += '\nScoring weight: ' + q.scoring; }
    if (q.wordLimit) { up += '\nWord limit: ' + q.wordLimit + ' words — write as close to this limit as possible without exceeding it.'; }

    up += '\n\nWrite the complete, high-quality tender response now. Be specific to this organisation and this tender. Use evidence and concrete examples throughout.';

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
