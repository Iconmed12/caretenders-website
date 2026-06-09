async function populateSqStep() {
    var el = document.getElementById('sq-sections-cana');
    if (!el) return;

    var ch = window._chData || {};
    var co = window._companyDetails || {};
    var td = window._tenderData;

    try {
      var tEl = document.getElementById('sq-doc-tender-title');
      if (tEl && td) tEl.textContent = td.title || 'Selection Questionnaire';
    } catch(e) {}

    var companyName = ch.company_name || co.name || '—';

    var h = '';

    // ── 1. COMPANY NAME — visible, auto-filled ──
    h += '<div style="margin-bottom:1.25rem;">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;padding-bottom:0.5rem;border-bottom:2px solid #00C9E0;">';
    h += '<div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#0B1929;">Supplier Name</div>';
    h += '<span style="font-size:0.69rem;font-weight:700;background:#e8f7ee;color:#1a7a3f;padding:2px 9px;border-radius:999px;">✓ Auto-filled</span>';
    h += '</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">';
    h += '<tr style="background:#fafafa;"><td style="padding:8px 10px;font-weight:600;color:#374151;width:45%;border-bottom:1px solid #f3f4f6;">Supplier name</td>';
    h += '<td style="padding:8px 10px;color:#166534;font-weight:500;border-bottom:1px solid #f3f4f6;">✓ ' + escHtml(companyName) + '</td></tr>';
    h += '<tr><td style="padding:8px 10px;font-weight:600;color:#374151;">Single supplier</td>';
    h += '<td style="padding:8px 10px;color:#166534;font-weight:500;">✓ Yes</td></tr>';
    h += '</table></div>';

    // ── 2. GDPR — visible, pre-answered ──
    var gdprLines = [
      'Yes. We confirm that we have in place, and will maintain by the date of contract award, the human and technical resources to perform the contract in full compliance with the UK General Data Protection Regulation (UK GDPR) and to ensure the protection of the rights of all data subjects.',
      '',
      'Our technical and organisational measures include:',
      '',
      '\u2022 Confidentiality, integrity and resilience: All personal data is held on encrypted, access-controlled systems with regular security patching and monitoring. Access is restricted on a strict need-to-know basis.',
      '',
      '\u2022 Data subject rights: We have documented procedures to respond to subject access requests, right to erasure, rectification and portability within statutory timeframes.',
      '',
      '\u2022 Consent management: Where processing is consent-based, we obtain active, informed consent. All consents are recorded with timestamps and are fully auditable.',
      '',
      '\u2022 International transfers: We do not transfer personal data outside the UK unless appropriate safeguards are in place.',
      '',
      '\u2022 Records of processing: We maintain a comprehensive Record of Processing Activities (ROPA) reviewed quarterly.',
      '',
      '\u2022 Testing and evaluation: We conduct annual data protection impact assessments and periodic reviews of all technical and organisational measures.'
    ];
    var gdprAnswer = gdprLines.join('\n');

    h += '<div style="margin-bottom:1.25rem;">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;padding-bottom:0.5rem;border-bottom:2px solid #00C9E0;">';
    h += '<div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#0B1929;">Data Protection &amp; GDPR</div>';
    h += '<span style="font-size:0.69rem;font-weight:700;background:#e8f7ee;color:#1a7a3f;padding:2px 9px;border-radius:999px;">✓ Pre-answered</span>';
    h += '</div>';
    h += '<div style="background:#fafafa;border-radius:8px;padding:12px;font-size:0.82rem;color:#166534;line-height:1.7;white-space:pre-line;">' + gdprAnswer + '</div>';
    h += '</div>';

    // ── 3. ALL OTHER SECTIONS — locked ──
    var lockedSections = [];
    if (td && td.sq_data && td.sq_data.sections) {
      td.sq_data.sections.forEach(function(s) {
        var hasCompany = (s.fields||[]).some(function(f){
          return ['company_name','company_number','sme_status'].indexOf(f.profile_key) !== -1;
        });
        var isGdpr = (s.fields||[]).some(function(f){
          return (f.question||'').toLowerCase().includes('gdpr') || (f.question||'').toLowerCase().includes('data protection');
        });
        var isDecl = (s.fields||[]).every(function(f){ return f.field_type === 'client_confirm'; });
        if (!hasCompany && !isGdpr && !isDecl) {
          lockedSections.push(s.section + ': ' + s.title);
        }
      });
    }
    if (!lockedSections.length) {
      lockedSections = ['Part 2: Financial Standing', 'Part 3: Technical Capability', 'Part 4: Health & Safety', 'Part 5: Insurance & Compliance', 'Part 6: Organisational Standards'];
    }

    lockedSections.forEach(function(title) {
      h += '<div style="margin-bottom:1rem;position:relative;">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;padding-bottom:0.5rem;border-bottom:1px solid #e5e7eb;">';
      h += '<div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;">' + escHtml(title) + '</div>';
      h += '<span style="font-size:0.69rem;font-weight:700;background:#f3f4f6;color:#9ca3af;padding:2px 9px;border-radius:999px;">🔒 Completed in full report</span>';
      h += '</div>';
      h += '<div style="position:relative;border-radius:6px;overflow:hidden;">';
      h += '<div style="filter:blur(4px);pointer-events:none;user-select:none;opacity:0.25;background:#fafafa;padding:10px;">';
      for (var i=0;i<3;i++) h += '<div style="height:10px;background:#e5e7eb;border-radius:4px;margin-bottom:7px;width:' + [80,60,70][i] + '%;"></div>';
      h += '</div>';
      h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;">';
      h += '<span style="font-size:1rem;">🔒</span><span style="font-size:0.76rem;font-weight:700;color:#6b7280;">Completed after payment</span>';
      h += '</div></div></div>';
    });

    el.innerHTML = h;
  }


  function renderRealDocument(htmlPreview, ch, co, sqData) {
    var el = document.getElementById('sq-sections-cana');
    if (!el) return;

    // Add document styles
    if (!document.getElementById('sq-doc-styles')) {
      var style = document.createElement('style');
      style.id = 'sq-doc-styles';
      style.textContent = [
        '.sq-doc-section { margin-bottom:1.5rem; }',
        '.sq-doc-section table { width:100%; border-collapse:collapse; font-size:0.84rem; }',
        '.sq-doc-section td, .sq-doc-section th { padding:7px 10px; border:1px solid #e5e7eb; vertical-align:top; }',
        '.sq-doc-section th { background:#f3f4f6; font-weight:600; }',
        '.sq-doc-section p { font-size:0.84rem; margin-bottom:0.4rem; line-height:1.6; color:#374151; }',
        '.sq-doc-section h2, .sq-doc-section h3 { font-size:0.9rem; font-weight:700; color:#0B1929; margin-bottom:0.5rem; }',
        '.sq-doc-live table { width:100%; border-collapse:collapse; font-size:0.83rem; }','.sq-doc-live td, .sq-doc-live th { padding:6px 10px; border:1px solid #e5e7eb; vertical-align:top; word-break:break-word; }','.sq-doc-live tr:nth-child(even) { background:#fafafa; }','.sq-doc-live p { font-size:0.83rem; margin:0; line-height:1.5; }','.sq-locked { position:relative; }',
        '.sq-locked-inner { filter:blur(4px); pointer-events:none; user-select:none; opacity:0.35; }',
        '.sq-lock-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:8px; background:rgba(255,255,255,0.6); }',
      ].join('');
      document.head.appendChild(style);
    }

    var h = '';

    // Split HTML into tables — show first table, lock the rest
    var tables = htmlPreview.split('</table>');
    var firstTable = tables[0] + (tables.length > 1 ? '</table>' : '');
    var restTables = tables.slice(1).map(function(t, i) {
      return t + (i < tables.length - 2 ? '</table>' : '');
    }).filter(function(t){ return t.trim(); });

    h += '<div style="margin-bottom:1.5rem;">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;padding-bottom:0.5rem;border-bottom:2px solid #00C9E0;">';
    h += '<div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#0B1929;">Supplier Information</div>';
    h += '<span style="font-size:0.69rem;font-weight:700;background:#e8f7ee;color:#1a7a3f;padding:2px 9px;border-radius:999px;">✓ Reviewed &amp; auto-filled</span>';
    h += '</div>';
    h += '<div class="sq-doc-live">' + firstTable + '</div>';
    // Only add directors if the SQ actually asks for them
    if (sqData && sqData.sections) {
      var asksDirs = (sqData.sections || []).some(function(s){
        return (s.fields||[]).some(function(f){
          return f.profile_key === 'directors' || f.profile_key === 'psc_details';
        });
      });
      if (asksDirs) h += buildDirectorsHtml(ch);
    }
    h += '</div>';

    // Lock all remaining tables/sections
    if (restTables.length) {
      h += '<div style="position:relative;border-radius:8px;overflow:hidden;margin-bottom:1rem;">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;padding-bottom:0.5rem;border-bottom:1px solid #e5e7eb;">';
      h += '<div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Remaining sections</div>';
      h += '<span style="font-size:0.69rem;font-weight:700;background:#f3f4f6;color:#9ca3af;padding:2px 9px;border-radius:999px;">🔒 Locked</span>';
      h += '</div>';
      h += '<div style="filter:blur(4px);pointer-events:none;user-select:none;opacity:0.3;">' + restTables.join('') + '</div>';
      h += '<div style="position:absolute;bottom:0;left:0;right:0;top:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(255,255,255,0.7);">';
      h += '<span style="font-size:1.5rem;">🔒</span>';
      h += '<span style="font-size:0.82rem;font-weight:700;color:#374151;text-align:center;">These sections are completed in your full report<br><span style="font-weight:400;color:#6b7280;">Unlock after payment</span></span>';
      h += '</div></div>';
    }

    el.innerHTML = h;
  }

  function buildDirectorsHtml(ch) {
    var officers = (ch.officers || []).filter(function(o){ return o && !o.resigned_on; });
    var pscs = ch.pscs || [];
    if (!officers.length && !pscs.length) return '';

    var h = '<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #f3f4f6;">';
    h += '<div style="font-size:0.78rem;font-weight:700;color:#374151;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;">Directors &amp; Persons of Significant Control</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">';
    officers.forEach(function(o, i) {
      if (!o) return;
      h += '<tr style="background:' + (i%2===0?'#fafafa':'#fff') + ';"><td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:600;color:#166534;">✓ ' + escHtml(o.name) + '</td>';
      h += '<td style="padding:7px 10px;border:1px solid #e5e7eb;text-transform:capitalize;">' + escHtml(o.role||'Director') + '</td>';
      h += '<td style="padding:7px 10px;border:1px solid #e5e7eb;"><span style="font-size:0.69rem;font-weight:700;background:#e8f7ee;color:#1a7a3f;padding:2px 7px;border-radius:999px;">Director</span></td></tr>';
    });
    pscs.forEach(function(p, i) {
      if (!p) return;
      h += '<tr style="background:' + ((officers.length+i)%2===0?'#fafafa':'#fff') + ';"><td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:600;color:#5b21b6;">✓ ' + escHtml(p.name) + '</td>';
      h += '<td style="padding:7px 10px;border:1px solid #e5e7eb;" colspan="2">' + escHtml(p.nature_of_control||'PSC') + '</td></tr>';
    });
    h += '</table></div>';
    return h;
  }

  function renderFromSqData(sqData, ch, co) {
    // Render from extracted field data — used when HTML preview not yet stored
    // Admin should re-upload SQ to generate preview
    var el = document.getElementById('sq-sections-cana');
    if (!el) return;
    var sections = sqData.sections || [];
    var h = '<div style="background:#fff8ed;border:1px solid #fed7aa;border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.8rem;color:#92400e;">⚠ Preview unavailable — ask your administrator to re-upload the SQ document to enable the full preview.</div>';
    // Still show company info
    h += '<div style="font-weight:700;font-size:0.85rem;margin-bottom:0.5rem;">Your confirmed details:</div>';
    var coName = (ch.company_name || co.name || '—');
    var coNum  = ch.company_number || '—';
    h += '<div style="background:#f0fdf4;border-radius:6px;padding:0.75rem 1rem;font-size:0.83rem;"><div style="color:#166534;">✓ ' + escHtml(coName) + ' (' + escHtml(coNum) + ')</div></div>';
    el.innerHTML = h;
  }

  function renderFallbackSq(ch, co) {
    var el = document.getElementById('sq-sections-cana');
    if (!el) return;
    var coName = ch.company_name || co.name || '—';
    el.innerHTML = '<div style="padding:1.5rem;background:#fff8f0;border-radius:8px;border:1px solid #fed7aa;text-align:center;">' +
      '<div style="font-size:1.25rem;margin-bottom:0.5rem;">📋</div>' +
      '<div style="font-weight:700;font-size:0.9rem;color:#c2410c;margin-bottom:0.5rem;">SQ document not yet uploaded</div>' +
      '<div style="font-size:0.82rem;color:#92400e;line-height:1.6;">The administrator needs to upload the Selection Questionnaire document for this tender before this preview can show. Please contact your administrator.</div>' +
      '<div style="margin-top:1rem;background:#fff;border-radius:6px;padding:0.75rem;font-size:0.82rem;color:#374151;text-align:left;">' +
      '<div style="font-weight:600;margin-bottom:4px;">Company confirmed:</div>' +
      '<div style="color:#166534;">✓ ' + escHtml(coName) + '</div>' +
      '</div></div>';
  }

  function escHtml(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }


  async function sqContinue() {
    // Check declarations
    var all = ['decl1','decl2','decl3','decl4'].every(function(id){
      return document.getElementById(id) && document.getElementById(id).checked;
    });
    if (!all) {
      document.getElementById('sq-decl-error').style.display = 'block';
      return;
    }
    document.getElementById('sq-decl-error').style.display = 'none';
    // Skip preview — go straight to paywall
    setStep(4);
    showState('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Update paywall to show SQ is included
    var pNote = document.querySelector('.paywall-note');
    if (pNote) pNote.textContent = 'Secure payment via Stripe · Responses + completed SQ delivered to your email as Word documents';
  }

async function confirmSqAndGenerate() {
    // Check all declarations ticked
    var declInputs = document.querySelectorAll('#sq-declarations input[type=checkbox]');
    var allChecked = Array.from(declInputs).every(function(cb){ return cb.checked; });
    if (!allChecked) {
      document.getElementById('sq-decl-error').style.display = 'block';
      return;
    }
    document.getElementById('sq-decl-error').style.display = 'none';
    window._includeSq = true;
    setStep(3);
    showState('loading');
    runGeneration(window._companyDetails);
  }

  function skipSqAndGenerate() {
    window._includeSq = false;
    setStep(3);
    showState('loading');
    runGeneration(window._companyDetails);
  }

  async function runGeneration(companyDetails) {

    async function callOne(questionIndex) {
      const res = await fetch('/.netlify/functions/stream-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId, companyDetails, questionIndex })
      });
      const rawText = await res.text();
      if (!rawText) throw new Error('Empty response (status ' + res.status + ')');
      if (rawText.trim().startsWith('<')) throw new Error('Function error (status ' + res.status + '): ' + rawText.substring(0, 150));
      let data;
      try { data = JSON.parse(rawText); } catch(e) { throw new Error('Bad response: ' + rawText.substring(0, 100)); }
      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed');
      return data;
    }

    try {
      // Get total questions first
      const first = await callOne(0);
      const total = first.totalQuestions || 1;
      const allResponses = [{ question: first.question, answer: first.answer }];

      // Get remaining questions one by one
      for (let qi = 1; qi < total; qi++) {
        const r = await callOne(qi);
        allResponses.push({ question: r.question, answer: r.answer });
      }

      generatedResponses = allResponses;

      // Save to Supabase
      const sid = 'cana_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      currentSessionId = sid;
      try { await saveResponses(sid); } catch(saveErr) { console.log('Save error:', saveErr); }

      renderResults();
      setStep(3);
      showState('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch(e) {
      setStep(1);
      showState('form');
      const errEl = document.getElementById('form-error');
      errEl.textContent = e.message || 'Something went wrong. Please try again.';
      errEl.style.display = '';
    }
  }

  async function handlePayNow() {
    const btn = document.getElementById('paywall-btn');
    btn.textContent = 'Preparing payment...';
    btn.style.opacity = '0.7';
    btn.disabled = true;
    try {
      // Save client details before redirect
      try {
        sessionStorage.setItem('cana_email', document.getElementById('f-email') ? document.getElementById('f-email').value : '');
        sessionStorage.setItem('cana_name', document.getElementById('f-name') ? document.getElementById('f-name').value : '');
        sessionStorage.setItem('cana_session', currentSessionId);
        sessionStorage.setItem('cana_tender_title', tenderData ? tenderData.title : '');
        // Persist FULL company details across the Stripe redirect (page reload wipes window._companyDetails)
        var fullCo = Object.assign({}, window._companyDetails || {}, {
          name:       (document.getElementById('f-name')       || {}).value || (window._companyDetails||{}).name || '',
          founded:    (document.getElementById('f-founded')    || {}).value || '',
          staff:      (document.getElementById('f-staff')      || {}).value || '',
          email:      (document.getElementById('f-email')      || {}).value || '',
          cqc:        (document.getElementById('f-cqc')        || {}).value || '',
          services:   (document.getElementById('f-services')   || {}).value || '',
          regions:    (document.getElementById('f-regions')    || {}).value || '',
          experience: (document.getElementById('f-experience') || {}).value || '',
          achievements: (document.getElementById('f-achievements') || {}).value || '',
          chData: window._chData || {}
        });
        localStorage.setItem('cana_company_details', JSON.stringify(fullCo));
      } catch(e) {}

      const res = await fetch('/.netlify/functions/cana-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          tenderId: tenderId,
          tenderTitle: tenderData ? tenderData.title : ''
        })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Could not create payment session');
      }
    } catch(e) {
      btn.textContent = 'Pay £480 and unlock full bid';
      btn.style.opacity = '1';
      btn.disabled = false;
      alert('Payment error: ' + e.message);
    }
  }

  function showUnlockedResponses(responses) {
    const container = document.getElementById('responses-list');
    container.innerHTML = responses.map(function(r, i) {
      var words = r.answer ? r.answer.split(' ').length : 0;
      return '<div class="response-card"><div class="response-card-header"><div class="response-q-num">' + (i+1) + '</div><div class="response-q-text">' + r.question + '</div></div><div class="response-body"><div class="response-text">' + r.answer + '</div><div class="word-count">' + words + ' words</div></div></div>';
    }).join('');
    var paywall = document.getElementById('paywall-card');
    if (paywall) {
      paywall.innerHTML = '<h2 style="font-family:Playfair Display,serif;color:white;margin-bottom:0.75rem;">Your full bid is unlocked!</h2>' +
        '<p style="color:rgba(255,255,255,0.7);margin-bottom:0.5rem;">All ' + responses.length + ' responses are now visible above.</p>' +
        '<p style="color:rgba(255,255,255,0.6);font-size:0.85rem;">A Word document with all your responses has been emailed to you. Check your inbox.</p>';
    }
    setStep(3);
    showState('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Send emails with Word doc
    sendResponseEmails(responses);
  }

  var emailsSent = false;
  async function sendResponseEmails(responses) {
    if (emailsSent) { console.log('Emails already sent - skipping'); return; }
    emailsSent = true;
    try {
      // Try form fields first, then sessionStorage (for post-payment redirect)
      var clientEmail = '';
      var clientName = '';
      try { clientEmail = (document.getElementById('f-email') && document.getElementById('f-email').value) || sessionStorage.getItem('cana_email') || ''; } catch(e){}
      try { clientName = (document.getElementById('f-name') && document.getElementById('f-name').value) || sessionStorage.getItem('cana_name') || ''; } catch(e){}
      if (!currentSessionId) { try { currentSessionId = sessionStorage.getItem('cana_session') || ''; } catch(e){} }

      var tTitle = '';
      try { tTitle = (tenderData && tenderData.title) || sessionStorage.getItem('cana_tender_title') || 'Tender'; } catch(e){ tTitle = 'Tender'; }

      // If SQ was included, generate the filled document before sending email
      var sqDocBase64 = null;
      var sqFileName = null;
      var sqDataForEmail = null;

      if (window._includeSq && window._tenderData && window._tenderData.sq_data && window._tenderData.sq_data.storagePath) {
        try {
          var sqFillRes = await fetch('/.netlify/functions/fill-sq-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenderId: tenderId,
              companyDetails: window._companyDetails || {},
              sqData: window._tenderData.sq_data
            })
          });
          if (sqFillRes.ok) {
            var sqFillData = await sqFillRes.json();
            sqDocBase64 = sqFillData.docBase64;
            sqFileName  = sqFillData.fileName;
            sqDataForEmail = window._tenderData.sq_data;
          }
        } catch(e) {
          console.log('SQ fill failed (non-fatal):', e.message);
        }
      }

      var res = await fetch('/.netlify/functions/send-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: responses,
          clientEmail: clientEmail,
          clientName: clientName,
          tenderTitle: tTitle,
          sessionId: currentSessionId || sessionStorage.getItem('cana_session') || '',
          sqDocBase64: sqDocBase64,
          sqFileName: sqFileName,
          sqData: sqDataForEmail,
          includeSq: !!(sqDocBase64)
        })
      });
      var result = await res.json();
      if (!res.ok || result.error) {
        console.error('Email error:', result.error);
      } else {
        console.log('Emails sent successfully');
      }
    } catch(e) {
      console.error('Email send error:', e);
    }
  }

  function renderResults() {
    const container = document.getElementById('responses-list');
    const PREVIEW_WORDS = 80;

    container.innerHTML = generatedResponses.map((r, i) => {
      const words = r.answer.split(/\s+/);
      const isFirst = i === 0;
      const previewText = words.slice(0, PREVIEW_WORDS).join(' ');
      const hasMore = words.length > PREVIEW_WORDS;

      return `
        <div class="response-card">
          <div class="response-card-header">
            <div class="response-q-num">${i+1}</div>
            <div class="response-q-text">${r.question}</div>
          </div>
          <div class="response-body">
            ${isFirst ? `
              <div class="response-text">${r.answer}</div>
              <div class="word-count">${words.length} words</div>
            ` : `
              <div class="response-text${hasMore ? ' blurred' : ''}">${previewText}${hasMore ? '...' : ''}</div>
              ${hasMore ? `
                <div class="blur-overlay">
                  <div style="text-align:center;">
                    <div style="font-size:0.82rem;font-weight:600;color:var(--navy);margin-bottom:4px;">🔒 Full response locked</div>
                    <div style="font-size:0.75rem;color:var(--muted);">Pay to unlock all ${generatedResponses.length} complete answers</div>
                  </div>
                </div>
              ` : ''}
              <div class="word-count">${words.length} words total</div>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Profile pre-fill ──
  async function prefillFromProfile() {
    try {
      var sb = window._supabase;
      if (!sb) return;
      var { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      var { data: profile } = await sb.from('company_profiles').select('*').eq('user_id', user.id).single();
      if (!profile) return;

      function setVal(id, val) {
        var el = document.getElementById(id);
        if (el && val) el.value = val;
      }
      function setSelect(id, val) {
        var el = document.getElementById(id);
        if (!el || !val) return;
        for (var i = 0; i < el.options.length; i++) {
          if (el.options[i].value === val || el.options[i].text === val) { el.selectedIndex = i; break; }
        }
      }

      setVal('f-name',           profile.company_name);
      setVal('f-founded',        profile.founded_year);
      setVal('f-staff',          profile.staff_count);
      setVal('f-email',          profile.contact_email);
      setVal('f-experience',     profile.experience);
      setVal('f-achievements',   profile.achievements);
      setVal('f-policies',       profile.policies);
      setVal('f-accreditations', profile.accreditations);
      setVal('f-regions',        profile.regions);
      setVal('f-services',       profile.services);
      setSelect('f-cqc',         profile.cqc_status);

      // Show subtle badge
      var badge = document.getElementById('prefill-badge');
      if (badge) { badge.style.display = 'flex'; }
      console.log('Profile pre-filled from company_profiles');
    } catch(e) { console.log('Profile pre-fill skipped:', e.message); }
  }
