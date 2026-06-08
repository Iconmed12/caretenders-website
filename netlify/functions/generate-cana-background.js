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

    // ── UNIQUE PERSONA BUILDER ──
    // Generates a distinct voice for each company so no two responses read the same
    function buildPersona(co) {
      var staffNum = parseInt(co.staff) || 0;
      var sizeDesc = staffNum < 25
        ? 'small, owner-operated provider with a close-knit team'
        : staffNum < 60
          ? 'growing mid-sized provider with a structured management team'
          : staffNum < 150
            ? 'established regional provider with dedicated operational leads'
            : 'large, multi-site provider with a corporate governance structure';

      var founded = parseInt(co.founded) || 2015;
      var age = new Date().getFullYear() - founded;
      var maturityDesc = age <= 4
        ? 'a newer organisation that has grown rapidly and brings a fresh, evidence-led approach'
        : age <= 10
          ? 'an organisation with a solid track record built over the past decade'
          : age <= 20
            ? 'a well-established provider with deep sector roots and long-standing commissioner relationships'
            : 'a long-standing provider with over two decades of operational experience';

      var cqcDesc = co.cqc && co.cqc.includes('Outstanding')
        ? 'CQC-rated Outstanding — position this as a differentiator and weave it into evidence points'
        : co.cqc && co.cqc.includes('Good')
          ? 'CQC-rated Good — reference the inspection findings as validation of quality processes'
          : co.cqc && co.cqc.includes('Improvement')
            ? 'on a demonstrable improvement journey — focus on actions taken and progress made since the inspection'
            : 'building towards first CQC registration — focus on the rigour of processes being put in place';

      // Randomly vary the structural opening approach so no two responses lead the same way
      var openingApproaches = [
        'Lead with your single strongest piece of evidence for this question, then build the full argument around it.',
        'Open by naming the commissioner's core need directly, then demonstrate how your model meets it with specific evidence.',
        'Open with a concrete outcome you have already achieved that is directly relevant to this question, then explain the process behind it.',
        'Open with a clear statement of your organisational approach, then ground every claim in named evidence and figures.',
        'Open from the service user perspective — what they experience — then show the operational capability that delivers it.'
      ];
      var approach = openingApproaches[Math.floor(Math.random() * openingApproaches.length)];

      // Vary paragraph rhythm instruction to prevent structural sameness
      var rhythmOptions = [
        'Vary sentence length throughout — mix short punchy sentences with longer evidential ones.',
        'Use confident, declarative statements. Avoid hedging language. Each paragraph should make one clear claim and then prove it.',
        'Write with authority. Each paragraph should open with a strong assertion and close with a specific piece of evidence.',
        'Use a direct, professional tone. Front-load the key point in each paragraph, then elaborate with evidence.'
      ];
      var rhythm = rhythmOptions[Math.floor(Math.random() * rhythmOptions.length)];

      return { sizeDesc, maturityDesc, cqcDesc, approach, rhythm };
    }

    var persona = buildPersona(co);

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
    sp += '\nTHIS ORGANISATION\'S VOICE AND CHARACTER:\n';
    sp += co.name + ' is ' + persona.sizeDesc + ', and ' + persona.maturityDesc + '. ';
    sp += 'CQC status: ' + persona.cqcDesc + '. ';
    sp += 'Write in a voice that reflects this specific type of organisation — the tone, confidence level, and language should feel authentic to who they are. ';
    sp += 'Do not write as if this is a large corporate if they are small, and do not write as if they are a fledgling provider if they are established.\n';
    sp += '\nSTRUCTURAL APPROACH FOR THIS RESPONSE: ' + persona.approach + '\n';
    sp += 'RHYTHM AND TONE: ' + persona.rhythm + '\n';

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
        temperature: 1.0,
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
          temperature: 1.0,
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
