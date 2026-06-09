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

    // ── 2. Build context ──
    var specText = '';
    if (tender.cana_docs) {
      var specDocs = tender.cana_docs.spec || [];
      var qualDocs = tender.cana_docs.quality || [];
      var scoreDocs = tender.cana_docs.scoring || [];
      specText = [...specDocs, ...qualDocs, ...scoreDocs]
        .map(function(d){ return d.text||''; }).join('\n\n').substring(0, 4000);
    }

    var kbContext = '';
    function kbStr(val) {
      if (!val) return '';
      if (Array.isArray(val)) return val.map(function(v){ return typeof v === 'object' ? JSON.stringify(v) : String(v); }).join(' | ');
      return String(val);
    }
    if (kb.writing_style)            kbContext += 'WRITING STYLE: '            + kbStr(kb.writing_style).substring(0,400) + '\n';
    if (kb.winning_examples)         kbContext += 'WINNING EXAMPLES: '         + kbStr(kb.winning_examples).substring(0,800) + '\n';
    if (kb.commissioner_preferences) kbContext += 'COMMISSIONER PREFERENCES: ' + kbStr(kb.commissioner_preferences).substring(0,400) + '\n';

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

    // ── 3. Generate responses — direct Anthropic API calls ──
    await setStatus(jobId, 'generating_responses');
    var responses = [];

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var qText = q.question || q.text || String(q);
      console.log('Generating Q' + (i+1) + ' of ' + questions.length);
      try {
        var prompt =
          'You are a highly experienced UK public sector bid writer specialising in health and social care contracts. ' +
          'Your responses consistently score full marks because they are specific, evidence-based, and directly address the scoring criteria.\n\n' +
          'COMPANY INFORMATION:\n' + coCtx + '\n' +
          (specText ? 'TENDER SPECIFICATION (relevant extract):\n' + specText + '\n\n' : '') +
          (kbContext ? kbContext + '\n' : '') +
          'INSTRUCTIONS:\n' +
          '- Write 450-600 words minimum\n' +
          '- Use plain prose paragraphs — absolutely NO markdown, NO asterisks, NO hash symbols\n' +
          '- Be specific to this company and this tender — never write generic statements\n' +
          '- Reference the commissioner\'s stated requirements and outcomes directly\n' +
          '- Use first-person plural (we/our) throughout\n' +
          '- Write as a professional bid writer, not as an AI\n\n' +
          'QUESTION ' + (i+1) + ':\n' + qText;

        var ans = await callAI(prompt, 1800);
        responses.push({ question: qText, answer: stripMarkdown(ans) });
        console.log('Q' + (i+1) + ' done — ' + (ans||'').length + ' chars');
      } catch(e) {
        console.log('Q' + (i+1) + ' failed:', e.message);
        responses.push({ question: qText, answer: 'Response unavailable — please contact consulting@icongrp.co.uk' });
      }
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
        var docRes = await fetch(sbUrl + '/storage/v1/object/sq-docs/' + sqStoragePath, {
          headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
        });
        if (docRes.ok) {
          var docBuf = Buffer.from(await docRes.arrayBuffer());
          var zip = await JSZip.loadAsync(docBuf);
          var xml = await zip.file('word/document.xml').async('string');

          // Build auto-fill map
          var chData = co.chData || {};
          var fillMap = {
            company_name: clientName,
            company_number: chData.company_number || co.company_number || '',
            registered_address: chData.registered_address || '',
            cqc_status: co.cqc || '',
            sme_status: parseInt(co.staff||'0') < 250 ? 'Yes' : 'No',
            single_supplier: 'Yes',
            debarment: 'No'
          };

          // Fill table cells
          var rowPat = /(<w:tr[ >][\s\S]*?<\/w:tr>)/g;
          xml = xml.replace(rowPat, function(row) {
            var cells = []; var cp; var cPat = /<w:tc[ >][\s\S]*?<\/w:tc>/g;
            while ((cp = cPat.exec(row)) !== null) cells.push(cp[0]);
            if (cells.length < 2) return row;
            var qText = ''; var tm; var tPat = /<w:t[^>]*>([^<]*)<\/w:t>/g;
            for (var ci = 0; ci < cells.length-1; ci++) {
              while ((tm = tPat.exec(cells[ci])) !== null) qText += tm[1] + ' ';
              tPat.lastIndex = 0;
            }
            qText = qText.toLowerCase().trim();
            var ans = null;

            // Check field mappings
            (tender.sq_data.sections||[]).forEach(function(s){
              (s.fields||[]).forEach(function(f){
                if (ans) return;
                var kws = (f.question||'').toLowerCase().split(/\s+/).filter(function(w){return w.length>3;});
                var score = kws.filter(function(kw){return qText.includes(kw);}).length;
                if (score < 2) return;
                if (f.field_type==='auto_fill' && fillMap[f.profile_key]) ans = fillMap[f.profile_key];
                if (f.field_type==='client_confirm') ans = 'Yes — confirmed by authorised signatory';
              });
            });

            if (!ans) return row;
            var lastCell = cells[cells.length-1];
            var cs = row.lastIndexOf(lastCell);
            var tcPrM = lastCell.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/);
            var tcPr = tcPrM ? tcPrM[0] : '';
            var safe = ans.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            var paras = safe.split('\n').map(function(l){ return '<w:p><w:r><w:t xml:space="preserve">'+l+'</w:t></w:r></w:p>'; }).join('');
            return row.substring(0,cs) + '<w:tc>' + tcPr + paras + '</w:tc>' + row.substring(cs+lastCell.length);
          });

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
