exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  try {
    const { tenderId, companyDetails, questionIndex } = JSON.parse(event.body);
    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // Fetch tender and knowledge base in parallel
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

    if (!t) return { statusCode: 404, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Tender not found' }) };

    const allQ = t.cana_questions || [];
    if (!allQ.length) return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No questions set up for this tender yet.' }) };

    const idx = questionIndex || 0;
    const q = allQ[idx];
    if (!q) return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Question not found' }) };

    const canaDocs = t.cana_docs || {};
    const specDocs = Array.isArray(canaDocs.spec) ? canaDocs.spec : (canaDocs.spec ? [canaDocs.spec] : []);
    const scoringDocs = Array.isArray(canaDocs.scoring) ? canaDocs.scoring : (canaDocs.scoring ? [canaDocs.scoring] : []);
    const specText = specDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 3000);
    const scoringText = scoringDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 2000);

    const wordLimit = q.wordLimit ? parseInt(q.wordLimit) : 500;
    const maxTokens = Math.min(Math.ceil(wordLimit * 1.3), 1200);
    const co = companyDetails;

    // Build system prompt
    var sp = 'You are an expert UK public sector tender writer with 20 years experience winning care contracts.';
    if (kb.writing_style) { sp += ' WRITING STYLE: ' + kb.writing_style.replace(/\n/g, ' '); }
    if (kb.commissioner_preferences) { sp += ' COMMISSIONER PRIORITIES: ' + kb.commissioner_preferences.replace(/\n/g, ' '); }
    if (kb.avoid_patterns_text) { sp += ' AVOID: ' + kb.avoid_patterns_text.replace(/\n/g, ' '); }
    if (kb.winning_examples && kb.winning_examples.length) {
      sp += ' WINNING EXAMPLES: ' + kb.winning_examples.map(function(w){ return w.name + ': ' + (w.text||'').substring(0,500).replace(/\n/g,' '); }).join(' | ');
    }
    if (kb.failed_examples && kb.failed_examples.length) {
      sp += ' AVOID THESE PATTERNS: ' + kb.failed_examples.map(function(f){ return f.name + ': ' + (f.text||'').substring(0,300).replace(/\n/g,' '); }).join(' | ');
    }
    if (kb.feedback_examples && kb.feedback_examples.length) {
      sp += ' COMMISSIONER FEEDBACK: ' + kb.feedback_examples.map(function(f){ return f.name + ': ' + (f.text||'').substring(0,400).replace(/\n/g,' '); }).join(' | ');
    }

    // Build user prompt
    var up = 'Write a tender response. Tender: ' + t.title + '. Buyer: ' + (t.org||'') + '.';
    up += ' Organisation: ' + co.name + ', founded ' + co.founded + ', ' + co.staff + ' staff, CQC: ' + co.cqc + ', services: ' + co.services + ', regions: ' + co.regions;
    if (co.experience) { up += ', experience: ' + co.experience; }
    if (specText) { up += '. SERVICE SPECIFICATION: ' + specText; }
    if (scoringText) { up += '. SCORING CRITERIA: ' + scoringText; }
    up += '. QUESTION: ' + q.question;
    if (q.scoring) { up += ' [Scoring: ' + q.scoring + ']'; }
    if (q.wordLimit) { up += ' [Word limit: ' + q.wordLimit + ' words]'; }
    up += '. Write the full response now. Do not repeat the question.';

    // Call Anthropic with streaming
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
      const e = await aiRes.text();
      return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI error: ' + e.substring(0, 200) }) };
    }

    // Collect full streamed response
    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    var fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.startsWith('data: ')) {
          var jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;
          try {
            var parsed = JSON.parse(jsonStr);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              fullText += parsed.delta.text;
            }
          } catch(e) {}
        }
      }
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q.question,
        answer: fullText.trim(),
        questionIndex: idx,
        totalQuestions: allQ.length
      })
    };

  } catch(err) {
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Failed' })
    };
  }
};
