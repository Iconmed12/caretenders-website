const { Document, Packer, Paragraph, TextRun, BorderStyle, AlignmentType, HeadingLevel } = require('docx');
const JSZip = require('jszip');

exports.handler = async (event) => {
  const sbKey  = process.env.SUPABASE_ANON_KEY;
  const sbUrl  = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const RESEND = process.env.RESEND_API_KEY;
  const FROM   = 'noreply@getcana.co.uk';
  const AI_KEY = process.env.ANTHROPIC_API_KEY;
  const SITE   = 'https://caretenders-website.netlify.app';

  var jobId = null;

  async function sbPatch(path, body) {
    return fetch(sbUrl + path, {
      method: 'PATCH',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body)
    });
  }

  async function setStatus(id, status) {
    try { await sbPatch('/rest/v1/cana_jobs?id=eq.' + id, { status }); }
    catch(e) { console.log('setStatus failed:', e.message); }
  }

  async function callAI(prompt, maxTokens) {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens || 1500, messages: [{ role: 'user', content: prompt }] })
    });
    var d = await res.json();
    if (!res.ok) {
      console.log('AI call failed:', res.status, JSON.stringify(d).substring(0, 300));
      throw new Error('AI ' + res.status + ': ' + ((d.error && d.error.message) || 'unknown'));
    }
    if (!(d.content && d.content[0] && d.content[0].text)) {
      console.log('AI returned no text:', JSON.stringify(d).substring(0, 300));
      throw new Error('AI returned empty content');
    }
    return d.content[0].text.trim();
  }

  // Strip markdown formatting from AI responses
  function stripMarkdown(text) {
    return text
      .replace(/^#{1,6}\s+/gm, '')           // Remove # headings
      .replace(/\*\*(.+?)\*\*/g, '$1')        // Remove bold **
      .replace(/\*(.+?)\*/g, '$1')            // Remove italic *
      .replace(/^[-•]\s+/gm, '\u2022 ')       // Normalise bullets
      .replace(/\n{3,}/g, '\n\n')             // Max 2 newlines
      .trim();
  }

  try {
    const body = JSON.parse(event.body || '{}');
    jobId = body.jobId;
    const { tenderId, companyDetails, sessionId, includeSq, wantsReview, tier } = body;

    if (!jobId) return;

    await setStatus(jobId, 'processing');

    // ── 1. Load tender + knowledge base ──
    var tRes = await fetch(sbUrl + '/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1', {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });
    var tender = (await tRes.json())[0];
    if (!tender) { await setStatus(jobId, 'error'); return; }

    // Pick knowledge base by tender sector: commercial tenders use the commercial
    // KB row; everything else (care, non-CQC) uses the care row 'global'.
    var kbRowId = (tender.category === 'commercial') ? 'commercial' : 'global';
    var kbRes = await fetch(sbUrl + '/rest/v1/cana_knowledge?id=eq.' + kbRowId + '&select=*&limit=1', {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });
    var kb = (await kbRes.json())[0] || {};
    // Fallback: if a commercial tender has no commercial KB set up yet, use the care KB
    if (kbRowId === 'commercial' && !kb.writing_style && !kb.commissioner_preferences) {
      var kbFb = await fetch(sbUrl + '/rest/v1/cana_knowledge?id=eq.global&select=*&limit=1', {
        headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
      });
      kb = (await kbFb.json())[0] || {};
    }

    var co           = companyDetails || {};
    var clientEmail  = co.email || '';
    var clientName   = co.name  || co.company_name || '';
    var questions    = tender.cana_questions || [];

    // ── 2. Build context (full documents, no harsh truncation) ──
    var specFull = '', qualityFull = '', scoringFull = '';
    if (tender.cana_docs) {
      specFull    = (tender.cana_docs.spec    || []).map(function(d){ return d.text||''; }).join('\n\n').substring(0, 30000);
      qualityFull = (tender.cana_docs.quality || []).map(function(d){ return d.text||''; }).join('\n\n').substring(0, 12000);
      scoringFull = (tender.cana_docs.scoring || []).map(function(d){ return d.text||''; }).join('\n\n').substring(0, 8000);
    }

    var kbContext = '';
    function kbStr(val) {
      if (!val) return '';
      if (Array.isArray(val)) return val.map(function(v){ return typeof v === 'object' ? JSON.stringify(v) : String(v); }).join(' | ');
      return String(val);
    }
    if (kb.writing_style)            kbContext += 'HOUSE WRITING STYLE:\n'        + kbStr(kb.writing_style).substring(0,800) + '\n\n';
    if (kb.winning_examples)         kbContext += 'EXAMPLES FROM WINNING BIDS:\n' + kbStr(kb.winning_examples).substring(0,2500) + '\n\n';
    if (kb.commissioner_preferences) kbContext += 'WHAT COMMISSIONERS WANT:\n'    + kbStr(kb.commissioner_preferences).substring(0,800) + '\n\n';
    if (kb.avoid)                    kbContext += 'NEVER DO THIS:\n'              + kbStr(kb.avoid).substring(0,600) + '\n\n';

    // Key people: named, qualified staff the client provided at onboarding
    var keyPeopleStr = '';
    var kp = co.key_people;
    if (typeof kp === 'string') { try { kp = JSON.parse(kp); } catch(e) { kp = null; } }
    if (Array.isArray(kp) && kp.length) {
      keyPeopleStr = 'NAMED KEY PEOPLE (use these real names, roles and qualifications wherever the question calls for named accountability):\n' +
        kp.map(function(person) {
          return '- ' + (person.name || '') + ', ' + (person.role || '') +
            (person.qualifications ? ' (' + person.qualifications + ')' : '') +
            (person.experience ? '. Experience: ' + person.experience : '');
        }).join('\n') + '\n';
    }

    var coCtx = 'Company: ' + clientName + '\n' +
      (co.cqc ? 'CQC: ' + co.cqc + '\n' : '') +
      'Services: ' + (co.services || '') + '\n' +
      'Regions: ' + (co.regions || '') + '\n' +
      'Staff: ' + (co.staff || '') + '\n' +
      'Founded: ' + (co.founded || '') + '\n' +
      (co.experience ? 'Experience: ' + co.experience + '\n' : '') +
      (co.achievements ? 'Achievements: ' + co.achievements + '\n' : '') +
      (co.policies ? 'Policies: ' + co.policies + '\n' : '') +
      (co.accreditations ? 'Accreditations: ' + co.accreditations + '\n' : '') +
      (co.kpis ? 'KPIs tracked: ' + co.kpis + '\n' : '') +
      (co.social_value ? 'Social value: ' + co.social_value + '\n' : '') +
      keyPeopleStr;

    // Contract examples: real past contracts used as evidence. The description
    // MUST always be re-shaped to match THIS tender's specification.
    var contractExStr = '';
    var ce = co.contract_examples;
    if (typeof ce === 'string') { try { ce = JSON.parse(ce); } catch(e) { ce = null; } }
    if (Array.isArray(ce) && ce.length) {
      contractExStr = '\n=== REAL CONTRACT EXAMPLES (use as genuine evidence in relevant answers) ===\n' +
        ce.map(function(c, i) {
          return 'Contract ' + (i+1) + ': ' + (c.customer || '') +
            (c.value ? ' | Value: ' + c.value : '') +
            (c.start || c.end ? ' | ' + (c.start||'') + ' to ' + (c.end||'ongoing') : '') +
            (c.contact_name ? ' | Reference: ' + c.contact_name + (c.contact_position ? ', ' + c.contact_position : '') : '') +
            '\nWhat they delivered: ' + (c.description || '');
        }).join('\n\n') +
        '\n\n*** CRITICAL COMMAND ABOUT CONTRACT EXAMPLES ***\n' +
        'The contract descriptions above are the TRUE facts of real contracts. ' +
        'You MUST ALWAYS re-shape and tailor each description so it directly addresses ' +
        'THIS tender\'s specification and scoring criteria. NEVER copy a description word for word. ' +
        'Keep every fact true (the customer, dates, value, what was actually delivered) but ' +
        'frame, emphasise and word the description so it reads as relevant evidence for the ' +
        'specific service this buyer is asking for. The same real contract must read as ' +
        'tailored, relevant proof no matter which tender the client is bidding for. ' +
        'Do not invent contracts or change the underlying facts; only re-frame how they are described.\n';
    }
    coCtx = coCtx + contractExStr;

    // ── Sector-aware framing ──
    var isCare = (tender.category === 'care') || tender.is_cqc;
    var roleExamples = isCare
      ? 'the registered manager, the designated safeguarding lead, activity coordinators, training leads'
      : 'the contracts manager, operations/site manager, health and safety (SHEQ) lead, account manager, quality manager';
    var complianceRule = isCare
      ? '═══ CQC RULE ═══\nOnly state a CQC registration status or rating if it appears verbatim in the company evidence. If the CQC field is empty or unclear, write [INSERT: confirm your CQC registration status and current rating] instead. Never assume a rating: councils verify CQC claims against the public register.\n\n'
      : '═══ ACCREDITATIONS RULE ═══\nOnly state accreditations and certifications (ISO 9001/14001/45001, CHAS, Constructionline, SafeContractor, Cyber Essentials, SSIP and similar) if they appear verbatim in the company evidence. If relevant accreditations are missing from the evidence, write [INSERT: list your relevant accreditations e.g. ISO 9001, CHAS], never assume them, buyers verify certificates.\n\n';

    // Derive word target from page/word limits in the question text
    function wordTarget(qText) {
      var pm = qText.match(/limit[:\s]+(\d+)\s*Page/i);
      if (pm) return Math.round(parseInt(pm[1]) * 470); // ~470 words per A4 page at 11pt Arial 1.5 spacing
      var wm = qText.match(/(\d{3,5})\s*word/i);
      if (wm) return parseInt(wm[1]);
      return 700;
    }

    // Parse per-question limits from the quality document itself (stored questions often lack the limit line)
    var qLimits = {};
    (function() {
      var segs = qualityFull.split(/Question\s+(\d+)/i);
      for (var s = 1; s < segs.length; s += 2) {
        var num = parseInt(segs[s]);
        var seg = segs[s+1] || '';
        var pm = seg.match(/limit\s+(\d+)\s*Page/i);
        var wm = seg.match(/(\d{3,5})\s*word/i);
        if (pm)      qLimits[num] = Math.round(parseInt(pm[1]) * 470);
        else if (wm) qLimits[num] = parseInt(wm[1]);
      }
      console.log('Parsed question limits:', JSON.stringify(qLimits));
    })();

    // ── 3. Generate responses: DRAFT (Sonnet) → SELF-SCORE & REVISE (Sonnet) ──
    await setStatus(jobId, 'generating_responses');
    var responses = [];
    var SONNET = 'claude-sonnet-4-6';

    async function callSonnet(prompt, maxTokens) {
      var res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: SONNET, max_tokens: maxTokens || 3500, messages: [{ role: 'user', content: prompt }] })
      });
      if (!res.ok) {
        var errTxt = await res.text();
        console.log('Anthropic API error:', res.status, errTxt.substring(0,300));
        throw new Error('API ' + res.status + ': ' + errTxt.substring(0,100));
      }
      var d = await res.json();
      if (d.error) { console.log('Sonnet error:', JSON.stringify(d.error).substring(0,200)); throw new Error(d.error.message || 'AI error'); }
      return d.content && d.content[0] ? d.content[0].text.trim() : '';
    }

    async function generateOne(i) {
      var q = questions[i];
      var qText = q.question || q.text || String(q);
      var target = qLimits[i+1] || wordTarget(qText);
      console.log('Q' + (i+1) + ': target ' + target + ' words');

      // STAGE A: Draft to the rubric
      var draftPrompt =
        'You are an elite UK public sector bid writer with a 90%+ win rate on local authority contracts. ' +
        'You are writing one quality question response for a live tender.\n\n' +
        '═══ THE SCORING RUBRIC (the evaluator will score 0-10 with this) ═══\n' + scoringFull + '\n\n' +
        '═══ HOW TO SCORE 10/10 ═══\n' +
        '1. Address EVERY bullet and sub-requirement in the question criteria below, evaluators tick them off; one missed bullet caps the score at 6.\n' +
        '2. Evidence EVERY claim with specifics from the company evidence provided (real numbers, named roles, concrete processes). Generic assurances score 4.\n' +
        '3. End with a short "added value" element: 2-4 concrete commitments that go beyond the stated requirements (this is the explicit difference between 8 and 10 in the rubric).\n' +
        '4. Reference the specification sections the question points to, showing the requirements are understood and will be met in full.\n\n' +
        '═══ ABSOLUTE RULE No. 1: ZERO FABRICATION ═══\n' +
        'You must NEVER invent: names of people, statistics, percentages, staff counts, years of experience, tenure figures, retention rates, case studies, client examples, audit results, or track-record claims. Every specific fact MUST appear in the COMPANY EVIDENCE below. Where evidence is missing, write [INSERT: short description of what the client should provide]. A response containing placeholder flags scores higher than one containing invented facts, fabricated claims get bidders disqualified and blacklisted. This rule overrides all style and persuasiveness goals.\n\n' +
        '═══ NAMED ROLES REQUIREMENT ═══\n' +
        'Evaluators award marks for named accountability. For any content about staffing, safeguarding, management, training, mobilisation or quality assurance, the response MUST identify key individuals by name, role and qualification, e.g.' + roleExamples + '. Where the company evidence does not contain a name or qualification, write [INSERT: full name and qualification of your <role>] at that exact point. NEVER write around the gap with generic phrasing like "our experienced manager" or "our qualified safeguarding lead", unnamed roles lose marks; flagged gaps tell the client exactly what to add.\n\n' +
        complianceRule +
        '═══ COMPANY EVIDENCE (the ONLY permitted source of specific facts) ═══\n' + coCtx + '\n\n' +
        (kbContext ? '═══ KNOWLEDGE BASE ═══\n' + kbContext : '') +
        '═══ SERVICE SPECIFICATION ═══\n' + specFull + '\n\n' +
        '═══ FULL QUALITY QUESTION DOCUMENT (locate this question, its criteria bullets, weighting and page limit) ═══\n' + qualityFull + '\n\n' +
        '═══ THE QUESTION TO ANSWER ═══\n' + qText + '\n\n' +
        '═══ OUTPUT REQUIREMENTS ═══\n' +
        '- HARD LIMIT: ' + target + ' words, the council REDACTS everything beyond the page limit unread, so exceeding it destroys the response. Write to ' + Math.round(target*0.78) + ' words. Do not exceed ' + Math.round(target*0.85) + ' words under any circumstances.\n' +
        '- Plain flowing prose paragraphs with occasional short headed sections (plain text headings, no markdown symbols).\n' +
        '- ABSOLUTELY NO markdown: no asterisks, no hashes, no bullet symbols. Use sentence-form lists.\n' +
        '- First person plural (we/our). Confident, specific, human. Vary sentence length. No AI tells like "Moreover" chains, "delve", "tapestry", "Furthermore" repetition.\n' +
        '- Write the response only: no preamble, no meta-commentary.';

      var draft = await callSonnet(draftPrompt, 8000);

      // STAGE B: Adversarial self-score and rewrite
      var revisePrompt =
        'You are the council evaluation panel scoring a tender response, then a bid director fixing it.\n\n' +
        '═══ SCORING RUBRIC ═══\n' + scoringFull + '\n\n' +
        '═══ THE QUESTION AND ITS CRITERIA ═══\n' + qText + '\n\n' +
        '═══ FULL QUALITY QUESTION DOCUMENT (for the criteria bullets) ═══\n' + qualityFull.substring(0, 6000) + '\n\n' +
        '═══ COMPANY EVIDENCE (the only permitted source of specifics) ═══\n' + coCtx + '\n\n' +
        '═══ DRAFT RESPONSE ═══\n' + draft + '\n\n' +
        '═══ YOUR TASK ═══\n' +
        'Step 1 (do this silently): score the draft 0-10 against the rubric. Identify every criteria bullet that is missing, thin, unevidenced, or generic. Check the added-value element exists and is concrete.\n' +
        'Step 2 (FABRICATION AUDIT, do this silently): list every specific claim in the draft: named individuals, numbers, percentages, years, counts, case examples, audit results, CQC ratings. For each one, verify it appears in the COMPANY EVIDENCE above. Any claim NOT in the evidence must be replaced with [INSERT: what the client should provide] or rephrased without the invented specific. Be ruthless: invented facts disqualify bidders.\n' +
        'Step 2b (NAMED ROLES CHECK, do this silently): wherever the draft discusses staffing, safeguarding, management, training or mobilisation, verify it either names real individuals from the evidence (with role and qualification) or carries an [INSERT: full name and qualification of your <role>] flag. Generic unnamed references like "our experienced team" or "a dedicated manager" are gaps, replace them with named individuals or [INSERT] flags.\n' +
        'Step 3: rewrite the response fixing every identified gap and every fabricated claim. Length is a hard constraint: write to ' + Math.round(target*0.82) + ' words, never exceed ' + Math.round(target*0.9) + ', the council redacts everything beyond the page limit unread. Plain prose, no markdown symbols, first person plural, professional human voice.\n' +
        'Output ONLY the final rewritten response: no scores, no commentary.';

      var final;
      try {
        final = await callSonnet(revisePrompt, 8000);
        // House rule: no em dashes anywhere. Replace with comma or spaced hyphen.
        if (final) final = final.replace(/\s*\u2014\s*/g, ', ').replace(/\u2013/g, '-');
        if (!final || final.length < draft.length * 0.5) final = draft; // safety: revision collapsed
      } catch(e) {
        console.log('Q' + (i+1) + ' revision failed, using draft:', e.message);
        final = draft;
      }

      // Programmatic length enforcement: models can't count words; we can
      function countWords(s) { return s.trim().split(/\s+/).length; }
      var attempts = 0;
      while (countWords(final) > target * 1.02 && attempts < 2) {
        attempts++;
        var wc = countWords(final);
        console.log('Q' + (i+1) + ' over limit (' + wc + '/' + target + '), AI trim attempt ' + attempts);
        try {
          var trimmed = await callSonnet(
            'CRITICAL LENGTH VIOLATION. This tender response is ' + wc + ' words; the absolute page limit is ' + target + ' words; the council deletes everything past the limit unread.\n' +
            'Rewrite it at EXACTLY ' + Math.round(target*0.88) + ' words or fewer. Cut adjectives, merge sentences, drop the weakest examples, but keep every response-criteria point, every piece of company evidence, every [INSERT] flag, and the added-value element.\n' +
            'Plain prose, no markdown. Output only the rewritten response.\n\n' + final,
            4000);
          if (trimmed && countWords(trimmed) < wc) final = trimmed;
          else break;
        } catch(e) { console.log('Trim failed:', e.message); break; }
      }
      // Deterministic last resort: truncate at sentence boundary just under the limit
      if (countWords(final) > target * 1.1) {
        console.log('Q' + (i+1) + ' still over after trims, hard truncation');
        var words = final.trim().split(/\s+/);
        var cut = words.slice(0, Math.round(target * 1.0)).join(' ');
        var lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
        if (lastStop > cut.length * 0.7) cut = cut.substring(0, lastStop + 1);
        final = cut;
      }

      var finalText = stripMarkdown(final);
      var wc = finalText.split(/\s+/).filter(Boolean).length;
      return { question: qText, answer: finalText, wordCount: wc, wordLimit: target };
    }

    // Process in batches of 2 for speed within the 900s budget
    for (var b = 0; b < questions.length; b += 2) {
      var batch = [];
      for (var j = b; j < Math.min(b + 2, questions.length); j++) batch.push(j);
      var results = await Promise.all(batch.map(function(idx) {
        return generateOne(idx).catch(function(e) {
          console.log('Q' + (idx+1) + ' failed:', e.message);
          var qq = questions[idx];
          return { question: (qq.question || qq.text || String(qq)), answer: 'Response unavailable: please contact hello@getcana.co.uk' };
        });
      }));
      responses.push.apply(responses, results);
      console.log('Batch done: ' + responses.length + '/' + questions.length);
    }

    // ── 3b. Attachment checklist (consultancy value: tell the client what to attach) ──
    var attachmentNotes = [];
    questions.forEach(function(q, i) {
      var qt = (q.question || q.text || String(q));
      var matches = qt.match(/(?:attach|upload)[^.]*?(policy|plan|document|statement)[^.]*\./gi);
      if (matches) matches.forEach(function(m) {
        attachmentNotes.push('Question ' + (i+1) + ': ' + m.trim());
      });
    });
    if (attachmentNotes.length) {
      responses.push({
        question: 'IMPORTANT: Required attachments checklist',
        answer: 'The tender requires the following documents to be attached to your submission. Cana cannot generate these for you, please ensure each is included before submitting:\n\n' + attachmentNotes.join('\n')
      });
    }

    // ── 4. Complete SQ ──
    await setStatus(jobId, 'completing_sq');
    var sqDocBase64 = null;
    var sqFileName  = null;

    // Resolve storagePath, might be missing if uploaded before storagePath was saved
    var sqStoragePath = (tender.sq_data && tender.sq_data.storagePath) ||
      (tender.sq_data && tender.sq_data.fileName ? tenderId + '/' + tender.sq_data.fileName : null);

    console.log('SQ debug, includeSq:', includeSq,
      '| sq_data exists:', !!(tender.sq_data),
      '| storagePath:', tender.sq_data && tender.sq_data.storagePath,
      '| fileName:', tender.sq_data && tender.sq_data.fileName,
      '| resolved path:', sqStoragePath);

    if (includeSq && tender.sq_data && sqStoragePath) {
      try {
        // URL-encode path segments (handles spaces, parentheses in filenames)
        var encodedSqPath = sqStoragePath.split('/').map(function(seg){ return encodeURIComponent(seg); }).join('/');
        console.log('Fetching SQ from storage:', encodedSqPath);
        var docRes = await fetch(sbUrl + '/storage/v1/object/sq-docs/' + encodedSqPath, {
          headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
        });
        console.log('SQ storage fetch status:', docRes.status);
        if (docRes.ok) {
          var docBuf = Buffer.from(await docRes.arrayBuffer());
          var zip = await JSZip.loadAsync(docBuf);
          var xml = await zip.file('word/document.xml').async('string');
          var chData = co.chData || {};

          // ── Simple placeholder replacement ──
          // Replaces [Insert X] style placeholders AND empty table cells
          var fillData = {
            name:           clientName,
            company_name:   clientName,
            company_number: chData.company_number || co.company_number || '',
            address:        chData.registered_address || '',
            cqc:            co.cqc || '',
            email:          clientEmail,
            staff:          co.staff || ''
          };

          // 1. Replace [Insert name] / [Insert company name] style placeholders
          xml = xml.replace(/\[Insert(?:\s+(?:your\s+)?(?:company\s+)?name)?\]/gi, function() {
            return clientName || '[Company Name]';
          });
          xml = xml.replace(/\[Insert(?:\s+company)?\s+number\]/gi, fillData.company_number || '');
          xml = xml.replace(/\[Insert(?:\s+registered)?\s+address\]/gi, fillData.address || '');
          xml = xml.replace(/\[Insert\s+date\]/gi, new Date().toLocaleDateString('en-GB'));
          xml = xml.replace(/\[Insert\s+CQC[^\]]*\]/gi, fillData.cqc || '');

          // ── SQ FILL ENGINE v2: handles right-cell, below-cell, and contract grids ──
          function rowTextLocal(row) {
            var t=''; var m; var tp=/<w:t[^>]*>([^<]*)<\/w:t>/g;
            while((m=tp.exec(row))!==null) t+=m[1]+' ';
            return t.replace(/\s+/g,' ').trim();
          }
          function getCells(row){ return row.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || []; }
          function cellTxt(cell){
            var t=''; var m; var tp=/<w:t[^>]*>([^<]*)<\/w:t>/g;
            while((m=tp.exec(cell))!==null) t+=m[1]+' ';
            return t.replace(/\s+/g,' ').trim();
          }
          function fillable(txt){
            var t=(txt||'').trim();
            if(t==='') return true;
            if(/\[insert/i.test(t)) return true;
            if(/yes\s*\/?\s*no/i.test(t)&&t.length<40) return true;
            if(/click here|enter text|\.{4,}|_{4,}/i.test(t)) return true;
            return false;
          }
          function writeCell(row, cellIdx, answer){
            var cells=getCells(row);
            if(!cells||cellIdx>=cells.length) return row;
            var target=cells[cellIdx];
            var tcPrM=target.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/);
            var tcPr=tcPrM?tcPrM[0]:'';
            var esc=String(answer).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            var isFlag=/^\[INSERT:/.test(String(answer).trim());
            var rPr=isFlag?'<w:rPr><w:b/><w:color w:val="C00000"/></w:rPr>':'<w:rPr><w:b/></w:rPr>';
            var newCell='<w:tc>'+tcPr+'<w:p><w:r>'+rPr+'<w:t xml:space="preserve">'+esc+'</w:t></w:r></w:p></w:tc>';
            var pos=row.lastIndexOf(target);
            return row.substring(0,pos)+newCell+row.substring(pos+target.length);
          }

          // Contract grid field-label -> which saved field to use
          function contractFieldFor(label){
            var l=label.toLowerCase();
            if(/name of customer|customer organisation who signed/.test(l)) return 'customer';
            if(/name of supplier who signed/.test(l)) return '__supplier__';
            if(/point of contact/.test(l)) return 'contact_name';
            if(/position in the customer/.test(l)) return 'contact_position';
            if(/e-?mail address/.test(l)) return 'contact_email';
            if(/description of (the )?(contract|agreement)/.test(l)) return 'description';
            if(/(contract|agreement) start date/.test(l)) return 'start';
            if(/(contract|agreement) (completion|end) date/.test(l)) return 'end';
            if(/(estimated )?(contract|agreement) value/.test(l)) return 'value';
            return null;
          }

          var ceArr = co.contract_examples;
          if(typeof ceArr==='string'){ try{ ceArr=JSON.parse(ceArr); }catch(e){ ceArr=null; } }
          if(!Array.isArray(ceArr)) ceArr=[];

          // Split into rows and process
          var rows = xml.split(/(<w:tr[ >][\s\S]*?<\/w:tr>)/);
          var contractIdx = -1; // which contract block we're in (0,1,2)

          for(var ri=0; ri<rows.length; ri++){
            if(!/^<w:tr[ >]/.test(rows[ri])) continue;
            var qText = rowTextLocal(rows[ri]);
            if(!qText) continue;

            // Detect contract block headers: "Contract 1/2/3" or "Agreement 1/2/3"
            var cMatch = qText.match(/^(contract|agreement)\s*([123])\b/i);
            if(cMatch){ contractIdx = parseInt(cMatch[2]) - 1; continue; }

            var cells = getCells(rows[ri]);

            // CASE A: contract grid field row (label cell + empty answer cell, inside a contract block)
            if(contractIdx >= 0){
              var cf = contractFieldFor(qText);
              if(cf && cells.length >= 2){
                var ex = ceArr[contractIdx];
                var val;
                if(cf === '__supplier__'){ val = clientName; }
                else if(ex && ex[cf]){ val = ex[cf]; }
                else { val = ex ? '[INSERT: ' + qText.replace(/:$/,'') + ']' : '[INSERT: ' + qText.replace(/:$/,'') + ']'; }
                rows[ri] = writeCell(rows[ri], cells.length-1, val);
                continue;
              }
            }

            // CASE B: label + answer in the SAME row (answer cell to the right is fillable)
            if(cells.length >= 2){
              var lastTxt = cellTxt(cells[cells.length-1]);
              var labelTxt = cellTxt(cells[0]);
              // only if last cell is fillable and the label cell carries the question text
              if(fillable(lastTxt) && labelTxt && labelTxt.length > 3){
                for(var qi=0; qi<QA_MAP.length; qi++){
                  if(QA_MAP[qi].pat.test(qText)){
                    rows[ri] = writeCell(rows[ri], cells.length-1, QA_MAP[qi].ans);
                    break;
                  }
                }
                continue;
              }
            }

            // CASE C: question row, answer in the NEXT row (classic PSQ below-layout)
            for(var qj=0; qj<QA_MAP.length; qj++){
              if(QA_MAP[qj].pat.test(qText)){
                var nj=ri+1;
                while(nj<rows.length && !/^<w:tr[ >]/.test(rows[nj])) nj++;
                if(nj<rows.length){
                  var aTxt=rowTextLocal(rows[nj]);
                  if(fillable(aTxt)){
                    var ncells=getCells(rows[nj]);
                    rows[nj]=writeCell(rows[nj], ncells.length-1, QA_MAP[qj].ans);
                    ri=nj;
                  }
                }
                break;
              }
            }
          }
          xml = rows.join('');

          // 3. Signature block: fill simple labelled single-cell rows on the same row
          var sigRows = /(<w:tr[ >][\s\S]*?<\/w:tr>)/g;
          xml = xml.replace(sigRows, function(row) {
            var t = rowText(row).trim().toLowerCase();
            if (/^email\s*$/.test(t.replace(/\s+/g,' ').split(' ').slice(0,1).join(' ')) && t.length < 30 && t.indexOf('email') === 0) return setRowAnswer(row, clientEmail);
            if (t === 'date' || t.indexOf('date ') === 0 && t.length < 20) return setRowAnswer(row, new Date().toLocaleDateString('en-GB'));
            if (t === 'name' || (t.indexOf('name') === 0 && t.length < 20)) return setRowAnswer(row, '[INSERT: full name of signatory]');
            if (t === 'role' || (t.indexOf('role') === 0 && t.length < 20)) return setRowAnswer(row, '[INSERT: role of signatory]');
            return row;
          });

          console.log('SQ fill complete');

          zip.file('word/document.xml', xml);
          sqDocBase64 = (await zip.generateAsync({ type:'nodebuffer', compression:'DEFLATE' })).toString('base64');
          sqFileName = (tender.sq_data.fileName||'SQ').replace('.docx','') + '_Completed.docx';
        }
      } catch(e) { console.log('SQ fill failed:', e.message); }
    }

    // ── 5. Build responses Word document ──
    await setStatus(jobId, 'building_documents');
    var docBase64 = null;
    try {
      var children = [];
      children.push(new Paragraph({
        children: [new TextRun({ text: 'CANA AI  |  ICONGRP CONSULTING', bold: true, size: 20, color: '00C9E0', font: 'Arial' })],
        alignment: AlignmentType.CENTER, spacing: { after: 100 }
      }));
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '00C9E0' } }, spacing: { after: 300 }
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: tender.title || 'Tender Response', bold: true, size: 32, font: 'Arial' })],
        alignment: AlignmentType.CENTER, spacing: { after: 200 }
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Anything shown in red, like [INSERT: ...], must be completed by you before you submit.', size: 20, font: 'Arial', bold: true, color: 'C00000' })],
        spacing: { after: 160 }
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Organisation: ' + clientName, size: 22, font: 'Arial' })],
        alignment: AlignmentType.CENTER, spacing: { after: 600 }
      }));

      responses.forEach(function(r, i) {
        children.push(new Paragraph({
          children: [new TextRun({ text: 'Question ' + (i+1), bold: true, size: 22, color: 'FFFFFF', font: 'Arial' })],
          spacing: { before: 400, after: 80 }, shading: { fill: '0B1929', type: 'clear', color: '0B1929' }
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: r.question || '', bold: true, size: 22, font: 'Arial', color: '0B1929' })],
          spacing: { after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '00C9E0' } }
        }));
        // Word count line: green within limit, red if over the tender's limit
        if (typeof r.wordCount === 'number' && r.wordLimit) {
          var over = r.wordCount > r.wordLimit;
          var countText = over
            ? 'Word count: ' + r.wordCount + ' of ' + r.wordLimit + ' allowed. OVER LIMIT, please shorten before submitting.'
            : 'Word count: ' + r.wordCount + ' of ' + r.wordLimit + ' allowed. Within limit.';
          children.push(new Paragraph({
            children: [new TextRun({ text: countText, size: 18, font: 'Arial', italics: true, bold: over, color: over ? 'C00000' : '15803D' })],
            spacing: { after: 160 }
          }));
        }
        (r.answer || '').split('\n').forEach(function(line) {
          if (!line.trim()) return;
          // Split the line around [INSERT: ...] flags and render those bold red
          var parts = line.split(/(\[INSERT:[^\]]*\])/g);
          var runs = parts.filter(function(seg){ return seg.length; }).map(function(seg) {
            if (/^\[INSERT:/.test(seg)) {
              return new TextRun({ text: seg, size: 22, font: 'Arial', bold: true, color: 'C00000' });
            }
            return new TextRun({ text: seg, size: 22, font: 'Arial' });
          });
          children.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
        });
      });

      children.push(new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' } }, spacing: { before: 600, after: 100 }
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Generated by Cana  |  ICONGRP Consulting  |  hello@getcana.co.uk', size: 18, color: '999999', font: 'Arial' })],
        alignment: AlignmentType.CENTER
      }));

      var doc = new Document({ sections: [{ properties: { page: { margin: { top:1440, right:1440, bottom:1440, left:1440 } } }, children }] });
      docBase64 = (await Packer.toBuffer(doc)).toString('base64');
    } catch(e) { console.log('Word doc build failed:', e.message); }

    // ── 6. Send emails ──
    await setStatus(jobId, 'sending_email');

    var attachments = [];
    if (docBase64)   attachments.push({ filename: 'Cana_AI_Tender_Responses.docx', content: docBase64 });
    if (sqDocBase64) attachments.push({ filename: sqFileName || 'SQ_Completed.docx', content: sqDocBase64 });

    // ── Completion pack (additive, fully guarded, never blocks the send) ──
    // tender was loaded with select=*, so completion_docs/submission_portal are present.
    var packChecklistHtml = '';
    try {
      var completionDocs = (tender && Array.isArray(tender.completion_docs)) ? tender.completion_docs : [];
      var portal = (tender && tender.submission_portal) || null;
      var packBytes = attachments.reduce(function(sum, a){ return sum + Math.ceil((a.content||'').length * 0.75); }, 0);
      var skippedPack = [];
      completionDocs.forEach(function(d) {
        if (!d || !d.data) return;
        var bytes = Math.ceil((d.data||'').length * 0.75);
        if (packBytes + bytes > 35 * 1024 * 1024) { skippedPack.push(d.fileName || d.label); return; }
        attachments.push({ filename: d.fileName || ((d.label || 'document') + '.pdf'), content: d.data });
        packBytes += bytes;
      });
      if (skippedPack.length) console.log('Pack docs skipped (size):', skippedPack.join(', '));

      if (completionDocs.length || (portal && portal.name)) {
        packChecklistHtml += '<div style="border:2px solid #0B1929;border-radius:10px;overflow:hidden;margin-bottom:20px;">' +
          '<div style="background:#0B1929;padding:12px 16px;"><span style="color:#00C9E0;font-weight:800;font-size:14px;letter-spacing:0.04em;">YOUR SUBMISSION CHECKLIST</span></div>' +
          '<div style="padding:16px;">';
        if (completionDocs.length) {
          packChecklistHtml += '<div style="font-size:13px;font-weight:800;color:#0B1929;margin-bottom:6px;">Attached for your completion</div>' +
            '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:14px;">';
          completionDocs.forEach(function(d) {
            packChecklistHtml += '<div style="font-size:13px;color:#78350f;padding:3px 0;">&#9744; ' + (d.label || d.fileName || 'Document') + ': complete, sign and include with your submission</div>';
          });
          packChecklistHtml += '</div>';
        }
        packChecklistHtml += '<div style="font-size:13px;font-weight:800;color:#0B1929;margin-bottom:6px;">Where to submit</div>' +
          '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;">';
        if (portal && portal.name) {
          packChecklistHtml += '<div style="font-size:13px;color:#166534;padding:2px 0;">Portal: <strong>' + portal.name + '</strong></div>';
          if (portal.url) packChecklistHtml += '<div style="padding:8px 0 2px;"><a href="' + portal.url + '" style="display:inline-block;background:#166534;color:#fff;font-size:13px;font-weight:700;padding:8px 16px;border-radius:7px;text-decoration:none;">Go to submission portal &rarr;</a></div>';
        } else {
          packChecklistHtml += '<div style="font-size:13px;color:#166534;">Submit via the buyer portal stated in the tender documents.</div>';
        }
        if (tender && tender.deadline) packChecklistHtml += '<div style="font-size:13px;font-weight:700;color:#c53030;padding-top:6px;">&#9200; Deadline: ' + tender.deadline + '</div>';
        packChecklistHtml += '</div></div></div>';
      }
    } catch (packErr) {
      console.log('Completion pack step failed (non-fatal, email still sends):', packErr.message);
      packChecklistHtml = '';
    }

    var emailHtml = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
      '<div style="background:#0B1929;padding:24px;border-radius:8px 8px 0 0;"><h1 style="color:#00C9E0;margin:0;">Cana</h1></div>' +
      '<div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">' +
      '<h2 style="color:#0B1929;margin:0 0 12px;">Your documents are attached</h2>' +
      '<p style="color:#374151;margin:0 0 8px;"><strong>Tender:</strong> ' + (tender.title||'') + '</p>' +
      '<p style="color:#374151;margin:0 0 20px;"><strong>Organisation:</strong> ' + clientName + '</p>' +
      '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:20px;">' +
      '<div style="font-weight:700;color:#166534;margin-bottom:8px;">📎 ' + attachments.length + ' Word document' + (attachments.length>1?'s':'') + ' attached</div>' +
      (docBase64 ? '<div style="font-size:13px;color:#166534;padding:2px 0;">✓ Cana_AI_Tender_Responses.docx</div>' : '') +
      (sqDocBase64 ? '<div style="font-size:13px;color:#166534;padding:2px 0;">✓ ' + (sqFileName||'SQ_Completed.docx') + '</div>' : '') +
      '</div>' +
      packChecklistHtml +
      '<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:14px;margin-bottom:20px;">' +
      '<strong style="color:#854d0e;">Before you submit:</strong>' +
      '<div style="font-size:13px;color:#92400e;margin-top:6px;line-height:1.8;">• Review all sections carefully<br>• Sign all declaration sections<br>• Attach required certificates</div>' +
      '</div>' +
      '<p style="color:#9ca3af;font-size:11px;text-align:center;">Cana | ICONGRP Consulting | hello@getcana.co.uk</p>' +
      '</div></div>';

    // Send to client
    if (clientEmail) {
      try {
        var r1 = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Cana <' + FROM + '>', to: clientEmail, subject: '📄 Your Cana documents: ' + (tender.title||'').substring(0,50), html: emailHtml, attachments })
        });
        console.log('Client email:', r1.status, clientEmail);
      } catch(e) { console.log('Client email failed:', e.message); }
    }

    // Send to ICONGRP, flag the order by tier so the team sees the scope at a glance
    try {
      var orderTier = tier || (wantsReview ? 'review' : 'none');
      var subjectPrefix, banner;
      if (orderTier === 'review_docs') {
        subjectPrefix = 'REVIEW + DOC COMPLETION: ';
        banner = '<div style="background:#fee2e2;border:2px solid #dc2626;border-radius:8px;padding:14px 16px;margin-bottom:16px;color:#991b1b;font-weight:700;">REVIEW + DOCUMENT COMPLETION PURCHASED (£1,000 add-on). The client has paid for us to: (1) review and sharpen their responses, AND (2) complete their SQ and all other required tender documents, EXCLUDING pricing. Documents are attached. Please action within agreed turnaround.</div>';
      } else if (orderTier === 'review') {
        subjectPrefix = 'REVIEW REQUESTED: ';
        banner = '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#92400e;font-weight:700;">EXPERT REVIEW PURCHASED: please review and sharpen the attached responses against the scoring criteria within 48 hours.</div>';
      } else {
        subjectPrefix = 'New: ';
        banner = '';
      }
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Cana <' + FROM + '>', to: 'hello@getcana.co.uk', subject: subjectPrefix + clientName + ' | ' + (tender.title||'').substring(0,40), html: banner + '<p><strong>Client:</strong> ' + clientName + ' | <strong>Email:</strong> ' + clientEmail + '</p>' + emailHtml, attachments })
      });
    } catch(e) { console.log('ICONGRP email failed:', e.message); }

    // ── 7. Always mark complete ──
    await setStatus(jobId, 'complete');
    console.log('Job complete:', jobId);

  } catch(err) {
    console.error('Background error:', err.message, err.stack);
    if (jobId) await setStatus(jobId, 'error');
  }
};
