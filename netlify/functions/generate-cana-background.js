exports.handler = async (event) => {
  // Netlify background function — runs up to 15 mins, returns 202 immediately
  try {
    const { tenderId, companyDetails, jobId, questionIndex } = JSON.parse(event.body);
    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    async function sbFetch(path, opts) {
      return fetch(sbUrl + path, {
        ...opts,
        headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', ...(opts && opts.headers) }
      });
    }

    async function setJobError(msg) {
      await sbFetch('/rest/v1/cana_jobs?id=eq.' + jobId, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'error', error: msg })
      });
    }

    // Mark job as started
    await sbFetch('/rest/v1/cana_jobs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id: jobId, status: 'pending', question_index: questionIndex })
    });

    // Load tender + knowledge base in parallel
    const [tRes, kbRes] = await Promise.all([
      sbFetch('/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1'),
      sbFetch('/rest/v1/cana_knowledge?id=eq.global&select=*&limit=1')
    ]);

    const tRows = await tRes.json();
    const kbRows = await kbRes.json();
    const t = tRows[0];
    const kb = kbRows[0] || {};

    if (!t) { await setJobError('Tender not found'); return; }

    const allQ = t.cana_questions || [];
    if (!allQ.length) { await setJobError('No questions set up yet.'); return; }

    const idx = questionIndex || 0;
    const q = allQ[idx];
    if (!q) { await setJobError('Question not found'); return; }

    // ── PER-QUESTION SPEC EXTRACTION ──
    const canaDocs = t.cana_docs || {};
    const specDocs = Array.isArray(canaDocs.spec) ? canaDocs.spec : (canaDocs.spec ? [canaDocs.spec] : []);
    const scoringDocs = Array.isArray(canaDocs.scoring) ? canaDocs.scoring : (canaDocs.scoring ? [canaDocs.scoring] : []);
    const fullSpecText = specDocs.map(function(d){ return d.text || ''; }).join('\n');
    const fullScoringText = scoringDocs.map(function(d){ return d.text || ''; }).join('\n');

    function extractRelevantSection(fullText, question, maxChars) {
      if (!fullText || fullText.length <= maxChars) return fullText;
      var stopWords = ['what','with','your','that','this','have','will','from','they','been','their','about','which','when','where','how','provide','please','describe','explain','detail','organisation','service','services'];
      var keywords = question.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(function(w){ return w.length > 4 && !stopWords.includes(w); });
      if (!keywords.length) return fullText.substring(0, maxChars);
      var paragraphs = fullText.split(/\n{2,}/);
      var scored = paragraphs.map(function(p, i) {
        var pl = p.toLowerCase();
        var score = keywords.reduce(function(s, kw){ return s + (pl.includes(kw) ? 1 : 0); }, 0);
        return { text: p, score: score, index: i };
      });
      scored.sort(function(a, b){ return b.score - a.score || a.index - b.index; });
      var result = '';
      for (var i = 0; i < scored.length; i++) {
        if ((result + scored[i].text).length > maxChars) break;
        result += scored[i].text + '\n\n';
      }
      return result.trim() || fullText.substring(0, maxChars);
    }

    function extractScoringThemes(scoringText, question) {
      if (!scoringText) return null;
      var lines = scoringText.split('\n').filter(function(l){ return l.trim().length > 10; });
      var keywords = question.toLowerCase().split(/\s+/).filter(function(w){ return w.length > 4; });
      var relevant = lines.filter(function(l){
        var ll = l.toLowerCase();
        return keywords.some(function(k){ return ll.includes(k); });
      }).slice(0, 8);
      if (!relevant.length) relevant = lines.slice(0, 6);
      return relevant.length ? relevant.join('\n') : null;
    }

    var specText = extractRelevantSection(fullSpecText, q.question, 4000);
    var scoringText = extractRelevantSection(fullScoringText, q.question, 2000);
    var scoringThemes = extractScoringThemes(scoringText, q.question);

    const wordLimit = q.wordLimit ? parseInt(q.wordLimit) : 500;
    const maxTokens = Math.min(Math.ceil(wordLimit * 1.5) + 500, 7000);
    const co = companyDetails;

    // ── SYSTEM PROMPT ──
    var sp = 'You are a senior UK public sector bid writer with 20 years of experience winning care and support contracts for local authorities and NHS commissioners.\n\n';
    sp += 'WRITING RULES — follow these absolutely:\n';
    sp += '1. Write in flowing professional paragraphs. No bullet points unless the question explicitly asks for a list.\n';
    sp += '2. Never use vague phrases like "we are committed to", "we strive to", "we believe in", "we endeavour". Replace every vague phrase with a specific action, figure, or named process.\n';
    sp += '3. Use concrete evidence: percentages, timescales, staff numbers, named policies, inspection outcomes, contract examples.\n';
    sp += '4. Write directly to the scoring criteria — structure your answer so every scoring theme is explicitly addressed.\n';
    sp += '5. Sound like an experienced human bid writer, not an AI. Vary sentence length. Use authoritative, confident language.\n';
    sp += '6. Do not repeat or rephrase the question. Begin your answer immediately.\n';
    sp += '7. Stay within the word limit. Write as close to it as possible without exceeding it.\n';
    sp += '8. Be specific to this organisation and this tender — do not write generic responses.\n';

    if (kb.writing_style) { sp += '\nHOUSE STYLE: ' + kb.writing_style.replace(/\n/g, ' ') + '\n'; }
    if (kb.commissioner_preferences) { sp += '\nWHAT THIS COMMISSIONER VALUES: ' + kb.commissioner_preferences.replace(/\n/g, ' ') + '\n'; }
    if (kb.avoid_patterns_text) { sp += '\nNEVER USE THESE PATTERNS: ' + kb.avoid_patterns_text.replace(/\n/g, ' ') + '\n'; }

    if (kb.winning_examples && kb.winning_examples.length) {
      sp += '\nWINNING RESPONSE EXAMPLES — match this quality, tone and depth:\n';
      kb.winning_examples.slice(0, 3).forEach(function(w, i) {
        var excerpt = (w.text || '').replace(/\n+/g, ' ').trim().substring(0, 1500);
        sp += '\n[Example ' + (i + 1) + ' — ' + (w.name || 'Winning response') + ']\n' + excerpt + '\n';
      });
      sp += '\n[These examples show the required standard. Match their specificity and confidence.]\n';
    }

    if (kb.feedback_examples && kb.feedback_examples.length) {
      sp += '\nCOMMISSIONER FEEDBACK (what evaluators reward and penalise):\n';
      kb.feedback_examples.slice(0, 3).forEach(function(f, i) {
        var excerpt = (f.text || '').replace(/\n+/g, ' ').trim().substring(0, 700);
        sp += '[Feedback ' + (i + 1) + '] ' + excerpt + '\n';
      });
    }

    // ── USER PROMPT ──
    var up = 'TENDER: ' + t.title + '\n';
    up += 'COMMISSIONER: ' + (t.org || 'Not specified') + '\n';
    up += 'REGION: ' + (t.region || 'Not specified') + '\n\n';
    up += 'BIDDING ORGANISATION:\n';
    up += '- Name: ' + co.name + '\n';
    up += '- Founded: ' + co.founded + '\n';
    up += '- Total staff: ' + co.staff + '\n';
    up += '- CQC status: ' + co.cqc + '\n';
    up += '- Services delivered: ' + co.services + '\n';
    up += '- Operating regions: ' + co.regions + '\n';
    if (co.achievements) { up += '- Key achievements / awards: ' + co.achievements + '\n'; }
    if (co.policies) { up += '- Named policies and frameworks: ' + co.policies + '\n'; }
    if (co.accreditations) { up += '- Accreditations / memberships: ' + co.accreditations + '\n'; }
    if (co.kpis) { up += '- Performance KPIs: ' + co.kpis + '\n'; }
    if (co.experience) { up += '- Contract experience: ' + co.experience + '\n'; }

    if (specText) { up += '\nRELEVANT SPECIFICATION SECTION:\n' + specText + '\n'; }
    if (scoringThemes) {
      up += '\nSCORING CRITERIA FOR THIS QUESTION (your response MUST address each of these themes):\n' + scoringThemes + '\n';
    } else if (scoringText) {
      up += '\nSCORING CRITERIA:\n' + scoringText + '\n';
    }

    up += '\nQUESTION: ' + q.question + '\n';
    if (q.scoring) { up += 'Scoring weight: ' + q.scoring + '\n'; }
    if (q.wordLimit) { up += 'Word limit: ' + q.wordLimit + ' words\n'; }
    up += '\nWrite the complete tender response now. Address every scoring theme explicitly. Use specific evidence from the organisation details above. Sound like an experienced human bid writer.';

    // ── CALL SONNET (no timeout risk in background function) ──
    var modelUsed = 'claude-sonnet-4-6';
    var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: sp,
        messages: [{ role: 'user', content: up }]
      })
    });

    // If Sonnet fails for any reason, fall back to Haiku
    if (!aiRes.ok) {
      aiRes = await fetch('https://api.anthropic.com/v1/messages', {
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
      modelUsed = 'claude-haiku-4-5-20251001';
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      await setJobError('AI error: ' + errText.substring(0, 200));
      return;
    }

    const aiData = await aiRes.json();
    const answer = aiData.content && aiData.content[0] ? aiData.content[0].text.trim() : '';

    if (!answer) { await setJobError('AI returned empty response'); return; }

    // Save completed result
    await sbFetch('/rest/v1/cana_jobs?id=eq.' + jobId, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'done',
        question: q.question,
        answer: answer,
        question_index: idx,
        total_questions: allQ.length,
        model: modelUsed
      })
    });

  } catch(err) {
    // Best-effort error save
    try {
      const { jobId } = JSON.parse(event.body);
      const sbKey = process.env.SUPABASE_ANON_KEY;
      await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/cana_jobs?id=eq.' + jobId, {
        method: 'PATCH',
        headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'error', error: err.message || 'Unknown error' })
      });
    } catch(e) {}
  }
};
