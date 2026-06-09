const { Document, Packer, Paragraph, TextRun, BorderStyle, AlignmentType } = require('docx');
const JSZip = require('jszip');

exports.handler = async (event) => {
  const sbKey  = process.env.SUPABASE_ANON_KEY;
  const sbUrl  = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const RESEND = process.env.RESEND_API_KEY;
  const FROM   = process.env.RESEND_FROM_EMAIL || 'noreply@icongrp.co.uk';
  const AI_KEY = process.env.ANTHROPIC_API_KEY;

  async function sbPatch(path, body) {
    return fetch(sbUrl + path, {
      method: 'PATCH',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body)
    });
  }

  async function setStatus(jobId, status) {
    await sbPatch('/rest/v1/cana_jobs?id=eq.' + jobId, { status });
  }

  async function callAI(prompt, maxTokens) {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens || 1200, messages: [{ role: 'user', content: prompt }] })
    });
    var d = await res.json();
    return d.content && d.content[0] ? d.content[0].text.trim() : '';
  }

  try {
    const { jobId, tenderId, companyDetails, sessionId, includeSq } = JSON.parse(event.body || '{}');
    if (!jobId) return;

    await setStatus(jobId, 'processing');

    // ── 1. Load tender ──
    var tRes = await fetch(sbUrl + '/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1', {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });
    var tender = (await tRes.json())[0];
    if (!tender) { await sbPatch('/rest/v1/cana_jobs?id=eq.' + jobId, { status: 'error', error: 'Tender not found' }); return; }

    var co = companyDetails || {};
    var clientEmail = co.email || '';
    var clientName  = co.name  || '';
    var questions   = tender.cana_questions || [];

    // ── 2. Build company context ──
    var ctx = 'Company: ' + clientName + '\n' +
      'CQC: ' + (co.cqc || '') + '\n' +
      'Services: ' + (co.services || '') + '\n' +
      'Regions: ' + (co.regions || '') + '\n' +
      'Staff: ' + (co.staff || '') + '\n' +
      'Founded: ' + (co.founded || '') + '\n' +
      (co.experience    ? 'Experience: ' + co.experience    + '\n' : '') +
      (co.achievements  ? 'Achievements: ' + co.achievements + '\n' : '') +
      (co.policies      ? 'Policies: '     + co.policies     + '\n' : '') +
      (co.accreditations? 'Accreditations: '+ co.accreditations+ '\n' : '');

    var specText = '';
    if (tender.cana_docs && tender.cana_docs.spec && tender.cana_docs.spec.length) {
      specText = (tender.cana_docs.spec[0].text || '').substring(0, 3000);
    }

    // ── 3. Generate bid responses ──
    await setStatus(jobId, 'generating_responses');
    var responses = [];

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var questionText = q.question || q.text || q || '';
      try {
        var prompt = 'You are an expert UK public sector bid writer for a care provider.\n\n' +
          ctx + '\n' +
          (specText ? 'TENDER SPEC:\n' + specText + '\n\n' : '') +
          'Write a detailed, specific bid response (minimum 400 words) for this question. ' +
          'Align your answer to the scoring criteria. Be specific, professional, avoid generic AI-sounding phrases.\n\n' +
          'QUESTION: ' + questionText;
        var answer = await callAI(prompt, 1500);
        responses.push({ question: questionText, answer });
      } catch(e) {
        responses.push({ question: questionText, answer: 'Response unavailable — please contact consulting@icongrp.co.uk' });
      }
    }

    // ── 4. Complete SQ ──
    await setStatus(jobId, 'completing_sq');
    var sqDocBase64 = null;
    var sqFileName  = null;

    if (includeSq && tender.sq_data && tender.sq_data.storagePath) {
      try {
        // Apply default answers
        var draftedFields = {};
        var chData = co.chData || {};

        var defaults = [
          { match: ['single supplier','sole supplier'], value: 'Yes' },
          { match: ['debarment','debarred','exclusion list'], value: 'No' },
          { match: ["employers' liability",'employers liability'], value: 'Yes — Employers Liability Insurance is held.' },
          { match: ['public liability'], value: 'Yes — Public Liability Insurance is held.' },
          { match: ['safeguarding'], value: 'Yes — We have a comprehensive Safeguarding Policy reviewed annually.' },
          { match: ['equality','diversity'], value: 'Yes — Equality, Diversity and Inclusion policy in place, reviewed annually.' },
          { match: ['modern slavery'], value: 'Yes — Modern Slavery Policy in place.' },
          { match: ['ir35','off-payroll'], value: 'Yes — IR35 compliant.' }
        ];

        (tender.sq_data.sections || []).forEach(function(section) {
          (section.fields || []).forEach(function(field) {
            if (field.field_type !== 'ai_draft') return;
            var q = (field.question || '').toLowerCase();

            // Check defaults first
            for (var d of defaults) {
              if (d.match.some(function(kw){ return q.includes(kw); })) {
                draftedFields[field.id] = d.value;
                return;
              }
            }

            // AI-generate for GDPR, H&S, Org Standards
            draftedFields[field.id] = ''; // will fill below
          });
        });

        // AI-generate long answers
        var aiFields = (tender.sq_data.sections || []).flatMap(function(s){
          return (s.fields||[]).filter(function(f){ return f.field_type==='ai_draft' && !draftedFields[f.id]; });
        });

        for (var af of aiFields) {
          var aq = (af.question||'').toLowerCase();
          var aPrompt = 'You are a UK bid writer for a care provider. Write ~400 words.\n' + ctx + '\nQuestion: ' + af.question;
          if (aq.includes('gdpr') || aq.includes('data protection')) {
            aPrompt = 'Write a ~400 word GDPR compliance response for a care provider SQ. Cover: system security, data subject rights, consent management, records of processing, regular testing. Professional first-person plural.\n\nCompany: ' + clientName + '\nCQC: ' + (co.cqc||'') + '\nQuestion: ' + af.question;
          } else if (aq.includes('health and safety') || aq.includes('health & safety')) {
            aPrompt = 'Write a ~400 word Health & Safety response for a care provider SQ. Cover: H&S policy, risk assessments, staff training, incident reporting, CQC compliance. Professional first-person plural.\n\nCompany: ' + clientName + '\nQuestion: ' + af.question;
          } else if (aq.includes('organisational standard') || aq.includes('qualifications')) {
            aPrompt = 'Write a ~400 word Organisational Standards response for a care provider SQ. Cover: CQC registration, qualifications, quality standards, continuous improvement. Professional first-person plural.\n\nCompany: ' + clientName + '\nCQC: ' + (co.cqc||'') + '\nQuestion: ' + af.question;
          }
          try { draftedFields[af.id] = await callAI(aPrompt, 800); } catch(e) {}
        }

        // Fill the original Word document
        var docRes = await fetch(sbUrl + '/storage/v1/object/sq-docs/' + tender.sq_data.storagePath, {
          headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
        });
        if (docRes.ok) {
          var docBuf = Buffer.from(await docRes.arrayBuffer());
          var zip = await JSZip.loadAsync(docBuf);
          var xmlContent = await zip.file('word/document.xml').async('string');

          // Build profile map for auto-fill
          var profileMap = {
            company_name: clientName || (chData.company_name||''),
            company_number: chData.company_number || '',
            registered_address: chData.registered_address || '',
            cqc_status: co.cqc || '',
            sme_status: parseInt(co.staff||'0') < 250 ? 'Yes' : 'No',
            directors: chData.officers ? chData.officers.filter(function(o){return !o.resigned_on;}).map(function(o){return o.name;}).join(', ') : ''
          };

          // Fill table cells by matching question text
          var rowPattern = /(<w:tr[ >][\s\S]*?<\/w:tr>)/g;
          xmlContent = xmlContent.replace(rowPattern, function(row) {
            var cells = [];
            var cellPat = /<w:tc[ >][\s\S]*?<\/w:tc>/g;
            var m;
            while ((m = cellPat.exec(row)) !== null) cells.push(m[0]);
            if (cells.length < 2) return row;

            var qText = '';
            for (var ci = 0; ci < cells.length-1; ci++) {
              var tm = cells[ci].match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
              if (tm) qText += tm.map(function(t){ return t.replace(/<[^>]+>/g,''); }).join(' ');
            }
            qText = qText.toLowerCase().trim();

            var answer = null;

            // Check auto-fill fields
            (tender.sq_data.sections||[]).forEach(function(sec){
              (sec.fields||[]).forEach(function(f){
                if (f.field_type === 'auto_fill' && f.profile_key && profileMap[f.profile_key]) {
                  var kws = (f.question||'').toLowerCase().split(/\s+/).filter(function(w){return w.length>3;});
                  var score = kws.filter(function(kw){return qText.includes(kw);}).length;
                  if (score >= 2 && !answer) answer = profileMap[f.profile_key];
                }
                if (f.field_type === 'ai_draft' && draftedFields[f.id]) {
                  var kws2 = (f.question||'').toLowerCase().split(/\s+/).filter(function(w){return w.length>3;});
                  var score2 = kws2.filter(function(kw){return qText.includes(kw);}).length;
                  if (score2 >= 2 && !answer) answer = draftedFields[f.id];
                }
              });
            });

            if (!answer) return row;

            var lastCell = cells[cells.length-1];
            var cellStart = row.lastIndexOf(lastCell);
            var tcPrM = lastCell.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/);
            var tcPr = tcPrM ? tcPrM[0] : '';
            var safeAns = answer.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            var paras = safeAns.split(/\n/).map(function(line){
              return '<w:p><w:r><w:t xml:space="preserve">' + line + '</w:t></w:r></w:p>';
            }).join('');
            var filledCell = '<w:tc>' + tcPr + paras + '</w:tc>';
            return row.substring(0, cellStart) + filledCell + row.substring(cellStart + lastCell.length);
          });

          zip.file('word/document.xml', xmlContent);
          var filled = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
          sqDocBase64 = filled.toString('base64');
          sqFileName  = (tender.sq_data.fileName||'SQ').replace('.docx','') + '_Completed.docx';
        }
      } catch(e) { console.log('SQ completion error (non-fatal):', e.message); }
    }

    // ── 5. Build bid responses Word document ──
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
          children: [new TextRun({ text: 'Q' + (i+1) + ': ' + (r.question||''), bold: true, size: 24, color: '0B1929', font: 'Arial' })],
          spacing: { before: 400, after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '00C9E0' } }
        }));
        (r.answer||'').split('\n').forEach(function(line){
          if (line.trim()) children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22, font: 'Arial' })], spacing: { after: 100 } }));
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
      docBase64 = (await Packer.toBuffer(doc)).toString('base64');
    } catch(e) { console.log('Word doc error:', e.message); }

    // ── 6. Send email ──
    await setStatus(jobId, 'sending_email');

    var attachments = [];
    if (docBase64)   attachments.push({ filename: 'Cana_AI_Tender_Responses.docx', content: docBase64 });
    if (sqDocBase64) attachments.push({ filename: sqFileName || 'SQ_Completed.docx', content: sqDocBase64 });

    var emailHtml = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
      '<div style="background:#0B1929;padding:24px;border-radius:8px 8px 0 0;"><h1 style="color:#00C9E0;margin:0;">Cana AI</h1><p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px;">ICONGRP Consulting</p></div>' +
      '<div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">' +
      '<h2 style="color:#0B1929;margin:0 0 8px;">Your documents are attached</h2>' +
      '<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.7;"><strong>Tender:</strong> ' + (tender.title||'') + '</p>' +
      '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:20px;">' +
      '<div style="font-weight:700;color:#166534;margin-bottom:8px;font-size:13px;">📎 ' + attachments.length + ' Word document' + (attachments.length>1?'s':'') + ' attached</div>' +
      (docBase64 ? '<div style="font-size:12px;color:#166534;padding:2px 0;">✓ Cana_AI_Tender_Responses.docx — ' + responses.length + ' complete bid responses</div>' : '') +
      (sqDocBase64 ? '<div style="font-size:12px;color:#166534;padding:2px 0;">✓ ' + (sqFileName||'SQ_Completed.docx') + ' — completed SQ on original template</div>' : '') +
      '</div>' +
      '<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:14px;margin-bottom:20px;">' +
      '<div style="font-weight:700;color:#854d0e;margin-bottom:6px;font-size:13px;">⚠️ Before you submit</div>' +
      '<div style="font-size:12px;color:#92400e;line-height:1.8;">• Review all AI-drafted sections carefully<br>• Add your signature to all declaration sections<br>• Attach required certificates (insurance, policies)<br>• Do not submit without reviewing thoroughly</div>' +
      '</div>' +
      '<p style="color:#9ca3af;font-size:11px;text-align:center;">Cana AI | ICONGRP Consulting | consulting@icongrp.co.uk</p>' +
      '</div></div>';

    if (clientEmail) {
      var emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Cana AI <' + FROM + '>', to: clientEmail, subject: '📄 Your Cana AI documents — ' + (tender.title||'').substring(0,50), html: emailHtml, attachments })
      });
      var emailResult = await emailRes.json();
      console.log('Client email result:', JSON.stringify(emailResult));
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Cana AI <' + FROM + '>', to: 'consulting@icongrp.co.uk', subject: 'New — ' + clientName + ' | ' + (tender.title||'').substring(0,40), html: '<p><strong>Client:</strong> ' + clientName + ' | <strong>Email:</strong> ' + clientEmail + ' | <strong>Ref:</strong> ' + sessionId + '</p>' + emailHtml, attachments })
    });

    await sbPatch('/rest/v1/cana_jobs?id=eq.' + jobId, { status: 'complete', completed_at: new Date().toISOString() });

  } catch(err) {
    console.error('Background error:', err.message);
    try {
      const body = JSON.parse(event.body||'{}');
      if (body.jobId) await sbPatch('/rest/v1/cana_jobs?id=eq.' + body.jobId, { status: 'error', error: err.message });
    } catch(e2) {}
  }
};
