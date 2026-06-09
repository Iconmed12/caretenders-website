const { Document, Packer, Paragraph, TextRun, BorderStyle, AlignmentType, HeadingLevel } = require('docx');
const JSZip = require('jszip');

exports.handler = async (event) => {
  const sbKey  = process.env.SUPABASE_ANON_KEY;
  const sbUrl  = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const RESEND = process.env.RESEND_API_KEY;
  const FROM   = 'cana@icongrp.co.uk';
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
    return d.content && d.content[0] ? d.content[0].text.trim() : '';
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
    const { tenderId, companyDetails, sessionId, includeSq } = body;

    if (!jobId) return;

    await setStatus(jobId, 'processing');

    // ── 1. Load tender + knowledge base ──
    var tRes = await fetch(sbUrl + '/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1', {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });
    var tender = (await tRes.json())[0];
    if (!tender) { await setStatus(jobId, 'error'); return; }

    var kbRes = await fetch(sbUrl + '/rest/v1/cana_knowledge?id=eq.global&select=*&limit=1', {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });
    var kb = (await kbRes.json())[0] || {};

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

    var coCtx = 'Company: ' + clientName + '\n' +
      'CQC: ' + (co.cqc || '') + '\n' +
      'Services: ' + (co.services || '') + '\n' +
      'Regions: ' + (co.regions || '') + '\n' +
      'Staff: ' + (co.staff || '') + '\n' +
      'Founded: ' + (co.founded || '') + '\n' +
      (co.experience ? 'Experience: ' + co.experience + '\n' : '') +
      (co.achievements ? 'Achievements: ' + co.achievements + '\n' : '') +
      (co.policies ? 'Policies: ' + co.policies + '\n' : '') +
      (co.accreditations ? 'Accreditations: ' + co.accreditations + '\n' : '');

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
    var SONNET = 'claude-sonnet-4-5';

    async function callSonnet(prompt, maxTokens) {
      var res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: SONNET, max_tokens: maxTokens || 3500, messages: [{ role: 'user', content: prompt }] })
      });
      var d = await res.json();
      if (d.error) { console.log('Sonnet error:', JSON.stringify(d.error).substring(0,200)); throw new Error(d.error.message || 'AI error'); }
      return d.content && d.content[0] ? d.content[0].text.trim() : '';
    }

    async function generateOne(i) {
      var q = questions[i];
      var qText = q.question || q.text || String(q);
      var target = qLimits[i+1] || wordTarget(qText);
      console.log('Q' + (i+1) + ': target ' + target + ' words');

      // STAGE A — Draft to the rubric
      var draftPrompt =
        'You are an elite UK public sector bid writer with a 90%+ win rate on local authority contracts. ' +
        'You are writing one quality question response for a live tender.\n\n' +
        '═══ THE SCORING RUBRIC (the evaluator will score 0-10 with this) ═══\n' + scoringFull + '\n\n' +
        '═══ HOW TO SCORE 10/10 ═══\n' +
        '1. Address EVERY bullet and sub-requirement in the question criteria below — evaluators tick them off; one missed bullet caps the score at 6.\n' +
        '2. Evidence EVERY claim with specifics from the company evidence provided (real numbers, named roles, concrete processes). Generic assurances score 4.\n' +
        '3. End with a short "added value" element: 2-4 concrete commitments that go beyond the stated requirements (this is the explicit difference between 8 and 10 in the rubric).\n' +
        '4. Reference the specification sections the question points to, showing the requirements are understood and will be met in full.\n\n' +
        '═══ ABSOLUTE RULE No. 1 — ZERO FABRICATION ═══\n' +
        'You must NEVER invent: names of people, statistics, percentages, staff counts, years of experience, tenure figures, retention rates, case studies, client examples, audit results, or track-record claims. Every specific fact MUST appear in the COMPANY EVIDENCE below. Where evidence is missing, write [INSERT: short description of what the client should provide]. A response containing placeholder flags scores higher than one containing invented facts — fabricated claims get bidders disqualified and blacklisted. This rule overrides all style and persuasiveness goals.\n\n' +
        '═══ COMPANY EVIDENCE (the ONLY permitted source of specific facts) ═══\n' + coCtx + '\n\n' +
        (kbContext ? '═══ KNOWLEDGE BASE ═══\n' + kbContext : '') +
        '═══ SERVICE SPECIFICATION ═══\n' + specFull + '\n\n' +
        '═══ FULL QUALITY QUESTION DOCUMENT (locate this question, its criteria bullets, weighting and page limit) ═══\n' + qualityFull + '\n\n' +
        '═══ THE QUESTION TO ANSWER ═══\n' + qText + '\n\n' +
        '═══ OUTPUT REQUIREMENTS ═══\n' +
        '- Target length: ' + target + ' words. You MUST reach at least ' + Math.round(target*0.9) + ' words — submissions that underuse the page limit lose marks.\n' +
        '- Plain flowing prose paragraphs with occasional short headed sections (plain text headings, no markdown symbols).\n' +
        '- ABSOLUTELY NO markdown: no asterisks, no hashes, no bullet symbols. Use sentence-form lists.\n' +
        '- First person plural (we/our). Confident, specific, human. Vary sentence length. No AI tells like "Moreover" chains, "delve", "tapestry", "Furthermore" repetition.\n' +
        '- Write the response only — no preamble, no meta-commentary.';

      var draft = await callSonnet(draftPrompt, 4000);

      // STAGE B — Adversarial self-score and rewrite
      var revisePrompt =
        'You are the council evaluation panel scoring a tender response, then a bid director fixing it.\n\n' +
        '═══ SCORING RUBRIC ═══\n' + scoringFull + '\n\n' +
        '═══ THE QUESTION AND ITS CRITERIA ═══\n' + qText + '\n\n' +
        '═══ FULL QUALITY QUESTION DOCUMENT (for the criteria bullets) ═══\n' + qualityFull.substring(0, 6000) + '\n\n' +
        '═══ COMPANY EVIDENCE (the only permitted source of specifics) ═══\n' + coCtx + '\n\n' +
        '═══ DRAFT RESPONSE ═══\n' + draft + '\n\n' +
        '═══ YOUR TASK ═══\n' +
        'Step 1 (do this silently): score the draft 0-10 against the rubric. Identify every criteria bullet that is missing, thin, unevidenced, or generic. Check the added-value element exists and is concrete.\n' +
        'Step 2 (FABRICATION AUDIT — do this silently): list every specific claim in the draft — named individuals, numbers, percentages, years, counts, case examples, audit results. For each one, verify it appears in the COMPANY EVIDENCE above. Any claim NOT in the evidence must be replaced with [INSERT: what the client should provide] or rephrased without the invented specific. Be ruthless — invented facts disqualify bidders.\n' +
        'Step 3: rewrite the response fixing every identified gap and every fabricated claim. Length is a hard constraint: target ' + target + ' words, minimum ' + Math.round(target*0.9) + ', maximum ' + Math.round(target*1.05) + ' — the council redacts everything beyond the page limit unread, and underusing the limit wastes scoring space. Plain prose, no markdown symbols, first person plural, professional human voice.\n' +
        'Output ONLY the final rewritten response — no scores, no commentary.';

      var final;
      try {
        final = await callSonnet(revisePrompt, 4000);
        if (!final || final.length < draft.length * 0.5) final = draft; // safety: revision collapsed
      } catch(e) {
        console.log('Q' + (i+1) + ' revision failed, using draft:', e.message);
        final = draft;
      }

      return { question: qText, answer: stripMarkdown(final) };
    }

    // Process in batches of 2 for speed within the 900s budget
    for (var b = 0; b < questions.length; b += 2) {
      var batch = [];
      for (var j = b; j < Math.min(b + 2, questions.length); j++) batch.push(j);
      var results = await Promise.all(batch.map(function(idx) {
        return generateOne(idx).catch(function(e) {
          console.log('Q' + (idx+1) + ' failed:', e.message);
          var qq = questions[idx];
          return { question: (qq.question || qq.text || String(qq)), answer: 'Response unavailable — please contact hello@cana.ai' };
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
        question: 'IMPORTANT — Required attachments checklist',
        answer: 'The tender requires the following documents to be attached to your submission. Cana cannot generate these for you — please ensure each is included before submitting:\n\n' + attachmentNotes.join('\n')
      });
    }

    // ── 4. Complete SQ ──
    await setStatus(jobId, 'completing_sq');
    var sqDocBase64 = null;
    var sqFileName  = null;

    // Resolve storagePath — might be missing if uploaded before storagePath was saved
    var sqStoragePath = (tender.sq_data && tender.sq_data.storagePath) ||
      (tender.sq_data && tender.sq_data.fileName ? tenderId + '/' + tender.sq_data.fileName : null);

    console.log('SQ debug — includeSq:', includeSq,
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
          xml = xml.replace(/\[Insert\s+Yes\s+or\s+No\]/gi, 'Yes');
          xml = xml.replace(/\[Insert\s+information\]/gi, 'See attached supporting documentation.');
          xml = xml.replace(/\[Insert\s+date\]/gi, new Date().toLocaleDateString('en-GB'));
          xml = xml.replace(/\[Insert\s+CQC[^\]]*\]/gi, fillData.cqc || '');

          // 2. Row-by-row fill for labelled table cells
          var rowPat = /(<w:tr[ >][\s\S]*?<\/w:tr>)/g;
          xml = xml.replace(rowPat, function(row) {
            // Extract all text from row
            var rowText = ''; var tm; var tPat = /<w:t[^>]*>([^<]*)<\/w:t>/g;
            while ((tm = tPat.exec(row)) !== null) rowText += tm[1] + ' ';
            rowText = rowText.toLowerCase();

            var ans = null;

            // Supplier / company name
            if (!ans && (rowText.includes('supplier name') || rowText.includes('company name') || rowText.includes('organisation name'))) ans = clientName;
            // Company number
            if (!ans && (rowText.includes('company number') || rowText.includes('registration number'))) ans = fillData.company_number;
            // Address
            if (!ans && (rowText.includes('registered address') || rowText.includes('principal address'))) ans = fillData.address;
            // Single supplier
            if (!ans && rowText.includes('single supplier')) ans = 'Yes';
            // SME
            if (!ans && rowText.includes('sme')) ans = parseInt(co.staff||'0') < 250 ? 'Yes' : 'No';
            // Debarment
            if (!ans && (rowText.includes('debarment') || rowText.includes('debarred') || rowText.includes('exclusion list'))) ans = 'No';
            // Employers liability
            if (!ans && rowText.includes("employers' liability") || rowText.includes('employers liability')) ans = 'Yes — Employers Liability Insurance held.';
            // Public liability
            if (!ans && rowText.includes('public liability')) ans = 'Yes — Public Liability Insurance held.';
            // Safeguarding
            if (!ans && rowText.includes('safeguarding')) ans = 'Yes — Comprehensive Safeguarding Policy in place, reviewed annually.';
            // Equality
            if (!ans && (rowText.includes('equality') && rowText.includes('diversity'))) ans = 'Yes — Equality & Diversity Policy in place, reviewed annually.';
            // Modern slavery
            if (!ans && rowText.includes('modern slavery')) ans = 'Yes — Modern Slavery Policy in place.';
            // GDPR / data protection
            if (!ans && (rowText.includes('gdpr') || rowText.includes('data protection'))) ans = 'Yes — UK GDPR compliant. Full details available on request.';
            // Health & safety
            if (!ans && rowText.includes('health') && rowText.includes('safety')) ans = 'Yes — Health & Safety Policy in place, reviewed annually.';
            // CQC
            if (!ans && rowText.includes('cqc')) ans = fillData.cqc || 'Registered with CQC';
            // Email
            if (!ans && rowText.includes('email')) ans = clientEmail;

            if (!ans) return row;

            // Find cells
            var cells = []; var cp; var cPat = /<w:tc[ >][\s\S]*?<\/w:tc>/g;
            while ((cp = cPat.exec(row)) !== null) cells.push(cp[0]);
            if (cells.length < 2) return row;

            var lastCell = cells[cells.length-1];
            var cs = row.lastIndexOf(lastCell);
            var tcPrM = lastCell.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/);
            var tcPr = tcPrM ? tcPrM[0] : '';
            var safe = String(ans).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            var paras = safe.split('\n').map(function(l){
              return '<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">'+l+'</w:t></w:r></w:p>';
            }).join('');
            return row.substring(0,cs) + '<w:tc>' + tcPr + paras + '</w:tc>' + row.substring(cs+lastCell.length);
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
          spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '00C9E0' } }
        }));
        (r.answer || '').split('\n').forEach(function(line) {
          if (line.trim()) children.push(new Paragraph({
            children: [new TextRun({ text: line, size: 22, font: 'Arial' })], spacing: { after: 120 }
          }));
        });
      });

      children.push(new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' } }, spacing: { before: 600, after: 100 }
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Generated by Cana AI  |  ICONGRP Consulting  |  consulting@icongrp.co.uk', size: 18, color: '999999', font: 'Arial' })],
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

    var emailHtml = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
      '<div style="background:#0B1929;padding:24px;border-radius:8px 8px 0 0;"><h1 style="color:#00C9E0;margin:0;">Cana AI</h1></div>' +
      '<div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">' +
      '<h2 style="color:#0B1929;margin:0 0 12px;">Your documents are attached</h2>' +
      '<p style="color:#374151;margin:0 0 8px;"><strong>Tender:</strong> ' + (tender.title||'') + '</p>' +
      '<p style="color:#374151;margin:0 0 20px;"><strong>Organisation:</strong> ' + clientName + '</p>' +
      '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:20px;">' +
      '<div style="font-weight:700;color:#166534;margin-bottom:8px;">📎 ' + attachments.length + ' Word document' + (attachments.length>1?'s':'') + ' attached</div>' +
      (docBase64 ? '<div style="font-size:13px;color:#166534;padding:2px 0;">✓ Cana_AI_Tender_Responses.docx</div>' : '') +
      (sqDocBase64 ? '<div style="font-size:13px;color:#166534;padding:2px 0;">✓ ' + (sqFileName||'SQ_Completed.docx') + '</div>' : '') +
      '</div>' +
      '<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:14px;margin-bottom:20px;">' +
      '<strong style="color:#854d0e;">Before you submit:</strong>' +
      '<div style="font-size:13px;color:#92400e;margin-top:6px;line-height:1.8;">• Review all sections carefully<br>• Sign all declaration sections<br>• Attach required certificates</div>' +
      '</div>' +
      '<p style="color:#9ca3af;font-size:11px;text-align:center;">Cana AI | ICONGRP Consulting | consulting@icongrp.co.uk</p>' +
      '</div></div>';

    // Send to client
    if (clientEmail) {
      try {
        var r1 = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Cana AI <' + FROM + '>', to: clientEmail, subject: '📄 Your Cana AI documents — ' + (tender.title||'').substring(0,50), html: emailHtml, attachments })
        });
        console.log('Client email:', r1.status, clientEmail);
      } catch(e) { console.log('Client email failed:', e.message); }
    }

    // Send to ICONGRP
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Cana AI <' + FROM + '>', to: 'consulting@icongrp.co.uk', subject: 'New — ' + clientName + ' | ' + (tender.title||'').substring(0,40), html: '<p><strong>Client:</strong> ' + clientName + ' | <strong>Email:</strong> ' + clientEmail + '</p>' + emailHtml, attachments })
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
