// Netlify Background Function — runs up to 15 mins, no timeout pressure
// Full pipeline: generate responses → complete SQ → fill Word docs → send email
const { Document, Packer, Paragraph, TextRun, BorderStyle, AlignmentType } = require('docx');

exports.handler = async (event) => {
  try {
    const { jobId, tenderId, companyDetails, sessionId, includeSq } = JSON.parse(event.body);
    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    async function sb(path, opts) {
      return fetch(sbUrl + path, {
        ...opts,
        headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', ...(opts && opts.headers) }
      });
    }

    async function updateJob(data) {
      await sb('/rest/v1/cana_jobs?id=eq.' + jobId, {
        method: 'PATCH', body: JSON.stringify(data)
      });
    }

    await updateJob({ status: 'processing' });

    // ── 1. Load tender + knowledge base ──
    const [tRes, kbRes] = await Promise.all([
      sb('/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1'),
      sb('/rest/v1/cana_knowledge?id=eq.global&select=*&limit=1')
    ]);
    const tender = (await tRes.json())[0];
    const kb = (await kbRes.json())[0] || {};
    if (!tender) { await updateJob({ status: 'error', error: 'Tender not found' }); return; }

    const questions = tender.cana_questions || [];
    const co = companyDetails || {};
    const clientEmail = co.email;
    const clientName  = co.name;

    // ── 2. Generate all bid responses ──
    await updateJob({ status: 'generating_responses' });
    var responses = [];

    for (var i = 0; i < questions.length; i++) {
      try {
        var res = await fetch(sbUrl.replace('igpjfpncfuawikoyzfcd.supabase.co', '') + '/.netlify/functions/stream-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenderId, companyDetails: co, questionIndex: i, knowledgeBase: kb })
        }).catch(() => null);

        // Use direct AI call as fallback
        var answer = '';
        var q = questions[i];
        var prompt = 'You are an expert UK public sector bid writer for a care provider.\n\n' +
          'Company: ' + clientName + '\nCQC: ' + (co.cqc||'') + '\nServices: ' + (co.services||'') + '\nRegions: ' + (co.regions||'') + '\n\n' +
          'Question: ' + (q.question || q) + '\n\n' +
          'Write a high-quality, detailed response (minimum 400 words). Be specific to the company and the question. Do not use generic AI-sounding language.';

        var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
        });
        var aiData = await aiRes.json();
        answer = aiData.content && aiData.content[0] ? aiData.content[0].text : '';
        responses.push({ question: q.question || q, answer });
      } catch(e) { responses.push({ question: questions[i].question || questions[i], answer: 'Response generation failed for this question.' }); }
    }

    // ── 3. Complete SQ if applicable ──
    var sqDocBase64 = null;
    var sqFileName  = null;

    if (includeSq && tender.sq_data && tender.sq_data.storagePath) {
      try {
        await updateJob({ status: 'completing_sq' });

        // AI-draft SQ written sections
        var sqRes = await fetch(process.env.URL + '/.netlify/functions/complete-sq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenderId, sqData: tender.sq_data, profile: co, chData: co.chData || null })
        });
        var sqData = sqRes.ok ? await sqRes.json() : { draftedFields: {} };

        // Fill the original Word document
        var fillRes = await fetch(process.env.URL + '/.netlify/functions/fill-sq-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenderId, companyDetails: co, sqAnswers: sqData.draftedFields || {}, sqData: tender.sq_data })
        });
        if (fillRes.ok) {
          var fillData = await fillRes.json();
          sqDocBase64 = fillData.docBase64;
          sqFileName  = fillData.fileName;
        }
      } catch(e) { console.log('SQ completion failed (non-fatal):', e.message); }
    }

    // ── 4. Build responses Word document ──
    await updateJob({ status: 'building_documents' });
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
        children: [new TextRun({ text: tender.title || 'Tender Response Document', bold: true, size: 32, font: 'Arial' })],
        alignment: AlignmentType.CENTER, spacing: { after: 200 }
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Organisation: ' + clientName, size: 22, font: 'Arial' })],
        alignment: AlignmentType.CENTER, spacing: { after: 600 }
      }));

      responses.forEach(function(r, i) {
        children.push(new Paragraph({
          children: [new TextRun({ text: 'Q' + (i+1) + ': ' + (r.question || ''), bold: true, size: 24, color: '00C9E0', font: 'Arial' })],
          spacing: { before: 400, after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '00C9E0' } }
        }));
        (r.answer || '').split('\n').forEach(function(line) {
          if (line.trim()) {
            children.push(new Paragraph({
              children: [new TextRun({ text: line, size: 22, font: 'Arial' })],
              spacing: { after: 100 }
            }));
          }
        });
      });

      children.push(new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' } }, spacing: { before: 600, after: 100 }
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Generated by Cana AI  |  ICONGRP Consulting  |  consulting@icongrp.co.uk', size: 18, color: '999999', font: 'Arial' })],
        alignment: AlignmentType.CENTER
      }));

      var doc = new Document({ sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }] });
      var buf = await Packer.toBuffer(doc);
      docBase64 = buf.toString('base64');
    } catch(e) { console.log('Word doc build failed:', e.message); }

    // ── 5. Send email with Word doc attachments ──
    await updateJob({ status: 'sending_email' });

    var attachments = [];
    if (docBase64) attachments.push({ filename: 'Cana_AI_Tender_Responses.docx', content: docBase64 });
    if (sqDocBase64) attachments.push({ filename: sqFileName || 'Selection_Questionnaire_Completed.docx', content: sqDocBase64 });

    var emailHtml = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
      '<div style="background:#0B1929;padding:24px;border-radius:8px 8px 0 0;">' +
        '<h1 style="color:#00C9E0;margin:0;font-size:22px;">Cana AI</h1>' +
        '<p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px;">ICONGRP Consulting</p>' +
      '</div>' +
      '<div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">' +
        '<h2 style="color:#0B1929;font-size:20px;margin:0 0 8px;">Your documents are ready</h2>' +
        '<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.7;">Your bid responses' + (sqDocBase64 ? ' and completed Selection Questionnaire are' : ' are') + ' attached as Word documents. Please review all AI-drafted sections carefully before submission.</p>' +
        '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:24px;">' +
          '<div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:8px;">📎 ' + attachments.length + ' document' + (attachments.length>1?'s':'') + ' attached</div>' +
          (docBase64 ? '<div style="font-size:12px;color:#166534;padding:2px 0;">✓ <strong>Cana_AI_Tender_Responses.docx</strong> — ' + responses.length + ' complete bid responses</div>' : '') +
          (sqDocBase64 ? '<div style="font-size:12px;color:#166534;padding:2px 0;">✓ <strong>' + (sqFileName||'Selection_Questionnaire_Completed.docx') + '</strong> — completed SQ on original template</div>' : '') +
        '</div>' +
        '<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:14px 16px;margin-bottom:24px;">' +
          '<div style="font-size:13px;font-weight:700;color:#854d0e;margin-bottom:6px;">⚠️ Before you submit</div>' +
          '<div style="font-size:12px;color:#92400e;line-height:1.8;">' +
            '• Review all AI-drafted sections and confirm accuracy<br>' +
            '• Add your signature to all declaration sections<br>' +
            '• Attach required certificates (insurance, policies etc)<br>' +
            '• Do not submit without reviewing thoroughly' +
          '</div>' +
        '</div>' +
        '<p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:24px;">Generated by Cana AI | ICONGRP Consulting | consulting@icongrp.co.uk</p>' +
      '</div></div>';

    const RESEND = process.env.RESEND_API_KEY;
    const FROM   = process.env.RESEND_FROM_EMAIL || 'noreply@icongrp.co.uk';

    // Send to client
    if (clientEmail) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Cana AI <' + FROM + '>',
          to: clientEmail,
          subject: '📄 Your Cana AI documents — ' + (tender.title || '').substring(0, 50),
          html: emailHtml,
          attachments
        })
      });
    }

    // Send copy to ICONGRP
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Cana AI <' + FROM + '>',
        to: 'consulting@icongrp.co.uk',
        subject: 'New sale — ' + clientName + ' | ' + (tender.title || '').substring(0, 40),
        html: '<p><strong>Client:</strong> ' + clientName + ' | <strong>Email:</strong> ' + clientEmail + ' | <strong>Ref:</strong> ' + sessionId + '</p>' + emailHtml,
        attachments
      })
    });

    // ── 6. Mark job complete ──
    await updateJob({
      status: 'complete',
      responses: JSON.stringify(responses),
      completed_at: new Date().toISOString()
    });

  } catch(err) {
    console.error('Background job error:', err.message);
    try {
      const { jobId } = JSON.parse(event.body || '{}');
      if (jobId) {
        const sbKey = process.env.SUPABASE_ANON_KEY;
        const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';
        await fetch(sbUrl + '/rest/v1/cana_jobs?id=eq.' + jobId, {
          method: 'PATCH',
          headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'error', error: err.message })
        });
      }
    } catch(e2) {}
  }
};
