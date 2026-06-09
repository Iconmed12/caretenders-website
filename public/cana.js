
  let tenderId = null;
  let tenderData = null;
  let generatedResponses = [];
  let currentSessionId = null;
  const SUPABASE_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzYyMTEsImV4cCI6MjA2NDU1MjIxMX0.tDHJZPl4HZNM5PJuJ6-c7_xoKpgxFPuH5YlSdBEDqHw';

  // Get URL params
  const params = new URLSearchParams(window.location.search);
  tenderId = params.get('tender');
  const sessionId = params.get('session');
  const paid = params.get('paid');

  if (!tenderId) {
    document.getElementById('tender-title').textContent = 'No tender selected';
  } else if (paid === 'true' && sessionId) {
    // Coming back from Stripe - verify payment then show responses
    loadTender().then(() => verifyAndUnlock(sessionId));
  } else {
    loadTender();
  }

  async function verifyAndUnlock(sid) {
    setStep(5);
    showState('loading');
    document.querySelector('.loading-state h3').textContent = 'Verifying your payment...';
    document.querySelector('.loading-state p').textContent = 'Please wait while we confirm your payment with Stripe.';
    try {
      const res = await fetch('/.netlify/functions/cana-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid })
      });
      const data = await res.json();
      if (res.ok && data.paid && data.responses) {
        generatedResponses = data.responses;
        showUnlockedResponses(data.responses);
      } else if (res.ok && data.paid && !data.responses) {
        // Payment confirmed but responses not saved - show helpful message
        showState('results');
        document.getElementById('responses-list').innerHTML = '';
        const paywall = document.getElementById('paywall-card');
        if (paywall) {
          paywall.innerHTML = '<h2 style="font-family:Playfair Display,serif;color:white;margin-bottom:1rem;">Payment Confirmed!</h2>' +
            '<p style="color:rgba(255,255,255,0.8);line-height:1.8;margin-bottom:1rem;">' + (data.message || 'Your payment has been received. Our team will send your full bid responses to your email within 1 hour.') + '</p>' +
            '<p style="color:rgba(255,255,255,0.6);font-size:0.85rem;">Reference: ' + sid + '</p>';
        }
      } else {
        showState('form');
        setStep(1);
        alert('Payment could not be verified: ' + (data.error || 'Please contact consulting@icongrp.co.uk'));
      }
    } catch(e) {
      showState('form');
      setStep(1);
      alert('Verification error: ' + e.message);
    }
  }

  async function saveResponses(sid) {
    const res = await fetch('/.netlify/functions/save-cana-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sid,
        tenderId: tenderId,
        responses: generatedResponses
      })
    });
    const result = await res.json();
    if (!res.ok) {
      console.log('Save failed:', result.error);
    } else {
      console.log('Responses saved successfully:', sid);
    }
  }



  async function loadTender() {
    try {
      const res = await fetch('/.netlify/functions/get-tenders');
      const data = await res.json();
      tenderData = data.find(t => t.id === tenderId);
      window._tenderData = tenderData;

      if (!tenderData) {
        document.getElementById('tender-title').textContent = 'Tender not found';
        return;
      }

      // Populate tender header
      document.getElementById('tender-title').textContent = tenderData.title || '';
      document.getElementById('tender-org').textContent = tenderData.org || tenderData.organisation || '';
      document.getElementById('tender-value').textContent = tenderData.value || '';
      document.getElementById('tender-deadline').textContent = tenderData.deadline ? 'Closes ' + tenderData.deadline : '';

      // Remove empty pills
      ['tender-org','tender-value','tender-deadline'].forEach(id => {
        const el = document.getElementById(id);
        if (!el.textContent.trim()) el.style.display = 'none';
      });



      // Set paywall stripe link
      // Always use the fixed Cana AI payment link
      document.getElementById('paywall-btn').href = 'https://buy.stripe.com/5kQfZgcFx0fJeqR3MUcbC03';

    } catch(e) {
      document.getElementById('tender-title').textContent = 'Could not load tender';
    }
  }

  function setStep(n) {
    [1,2,3,4,5].forEach(i => {
      const el = document.getElementById('step'+i);
      if (!el) return;
      el.classList.remove('active','done');
      if (i < n) el.classList.add('done');
      if (i === n) el.classList.add('active');
    });
  }

  function showState(name) {
    document.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
    document.getElementById('state-' + name).classList.add('active');
  }

  async function generateResponses() {
    const name     = document.getElementById('f-name').value.trim();
    const founded  = document.getElementById('f-founded').value.trim();
    const staff    = document.getElementById('f-staff').value.trim();
    const cqc      = document.getElementById('f-cqc').value;
    const services = document.getElementById('f-services').value.trim();
    const regions  = document.getElementById('f-regions').value.trim();
    const experience = document.getElementById('f-experience').value.trim();
    const achievements = document.getElementById('f-achievements').value.trim();
    const policies = document.getElementById('f-policies').value.trim();
    const accreditations = document.getElementById('f-accreditations').value.trim();
    const kpis = document.getElementById('f-kpis').value.trim();

    const errEl = document.getElementById('form-error');
    const email = document.getElementById('f-email').value.trim();
    if (!name || !founded || !staff || !cqc || !services || !regions || !email) {
      errEl.textContent = 'Please fill in all required fields including your email address.';
      errEl.style.display = '';
      return;
    }
    errEl.style.display = 'none';

    // Show CH lookup step before generating
    setStep(2);
    showState('ch');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window._companyDetails = { name, founded, staff, cqc, services, regions, experience, achievements, policies, accreditations, kpis, email };
  }

  // CH lookup functions
  async function canaChLookup() {
    var errEl = document.getElementById('ch-error-cana');
    errEl.style.display = 'none';
    var num = document.getElementById('ch-num-cana').value.trim().replace(/\s/g,'');
    if (!num) { errEl.textContent = 'Please enter your Companies House number'; errEl.style.display = 'block'; return; }
    var btn = document.getElementById('ch-lookup-btn-cana');
    btn.disabled = true; btn.textContent = 'Looking up...';
    try {
      var res = await fetch('/.netlify/functions/companies-house-lookup', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ companyNumber: num })
      });
      var data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Not found');
      window._chData = data;

      document.getElementById('ch-result-name-cana').textContent = data.company_name;
      document.getElementById('ch-result-status-cana').textContent =
        '● ' + (data.company_status||'') + (data.date_of_creation ? ' · Inc. ' + data.date_of_creation.split('-')[0] : '');

      var fields = [
        { label:'Company number', value: data.company_number },
        { label:'Registered address', value: data.registered_address },
        { label:'Type', value: (data.company_type||'').replace(/-/g,' ') },
        { label:'Directors', value: data.officers && data.officers.length ? data.officers[0].name : '—' }
      ];
      document.getElementById('ch-result-grid-cana').innerHTML = fields.map(function(f){
        return '<div style="background:#fff;border-radius:7px;padding:8px 10px;">' +
          '<div style="font-size:0.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">'+f.label+'</div>' +
          '<div style="font-size:0.82rem;font-weight:600;color:#166534;">'+(f.value||'—')+'</div></div>';
      }).join('');

      document.getElementById('ch-result-cana').style.display = 'block';
      document.getElementById('ch-continue-btn-cana').style.display = 'block';

    } catch(err) {
      errEl.textContent = err.message || 'Could not find company. Check the number and try again.';
      errEl.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = 'Look up →';
  }

  async function canaChContinue() {
    var btn = document.getElementById('ch-continue-btn-cana');
    btn.disabled = true; btn.textContent = 'Loading...';
    try {
      // Save CH data to profile silently if supabase available
      if (window.supabase && window._chData) {
        try {
          var sbClient = window.supabase.createClient(
            'https://igpjfpncfuawikoyzfcd.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA'
          );
          var sess = await sbClient.auth.getSession();
          if (sess.data && sess.data.session) {
            await sbClient.from('company_profiles').upsert({
              user_id: sess.data.session.user.id,
              company_name: window._chData.company_name,
              company_number: window._chData.company_number,
              registered_address: window._chData.registered_address,
              ch_data: JSON.stringify(window._chData),
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
          }
        } catch(saveErr) { console.log('Profile save skipped:', saveErr.message); }
      }
      // Always proceed to SQ step
      setStep(3);
      showState('sq');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await populateSqStep();
    } catch(err) {
      console.error('canaChContinue error:', err);
      // Still proceed even if something failed
      setStep(3);
      try { populateSqStep(); } catch(e) { console.error('populateSqStep error:', e); }
      showState('sq');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    btn.disabled = false; btn.textContent = 'Next step →';
  }

  async function canaChSkip() {
    window._chData = null;
    setStep(3);
    showState('sq');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await populateSqStep();
  }

  async function populateSqStep() {
    var el = document.getElementById('sq-sections-cana');
    if (!el) return;

    // Show loading state immediately
    el.innerHTML = '<div style="text-align:center;padding:2rem;color:#9ca3af;"><div style="font-size:1.5rem;margin-bottom:0.5rem;">⏳</div><div style="font-size:0.85rem;">Loading your SQ...</div></div>';

    var ch = window._chData || {};
    var co = window._companyDetails || {};

    // Fetch fresh tender data to guarantee we have latest sq_data
    var sqData = null;
    try {
      var td = window._tenderData;
      if (td && td.id) {
        var freshRes = await fetch('/.netlify/functions/get-tenders');
        var freshAll = await freshRes.json();
        var fresh = freshAll.find(function(t){ return t.id === td.id; });
        if (fresh && fresh.sq_data) {
          sqData = fresh.sq_data;
          window._tenderData = fresh;
        } else if (td.sq_data) {
          sqData = td.sq_data;
        }
      }
    } catch(e) {
      if (window._tenderData && window._tenderData.sq_data) {
        sqData = window._tenderData.sq_data;
      }
    }

    // Set tender title
    try {
      var tTitle = (window._tenderData && window._tenderData.title) || '';
      var titleEl = document.getElementById('sq-doc-tender-title');
      if (titleEl) titleEl.textContent = tTitle || 'Selection Questionnaire';
    } catch(e) {}

    // Build company values — always have something
    var companyName   = ch.company_name || co.name || '—';
    var companyNum    = ch.company_number || '—';
    var regAddress    = ch.registered_address || '—';
    var companyType   = ch.company_type ? ch.company_type.replace(/-/g,' ') : 'Private limited company';
    var yearInc       = ch.date_of_creation ? ch.date_of_creation.split('-')[0] : (co.founded || '—');
    var coStatus      = ch.company_status || 'Active';
    var cqcStatus     = co.cqc || '—';
    var staffCount    = co.staff || '—';
    var smeStatus     = (parseInt(co.staff||'0') < 250) ? 'Yes — SME' : 'No';

    var h = '';

    // ── Determine sections from real SQ data ──
    var visibleKeys = ['company_name','company_number','registered_address','company_type',
                       'founded_year','directors','psc_details','company_status','sme_status',
                       'cqc_status','contact_name','vat_number'];

    var visibleSection = null;
    var lockedSections = [];

    if (sqData && sqData.sections && sqData.sections.length) {
      sqData.sections.forEach(function(s) {
        var fields = s.fields || [];
        var isDecl = fields.length > 0 && fields.every(function(f){ return f.field_type === 'client_confirm'; });
        if (isDecl) return;
        var hasCompanyField = fields.some(function(f){
          return f.field_type === 'auto_fill' && visibleKeys.indexOf(f.profile_key) !== -1;
        });
        if (hasCompanyField && !visibleSection) {
          visibleSection = s;
        } else {
          lockedSections.push(s);
        }
      });
    }

    // ── VISIBLE SECTION: Company Info ──
    var coFieldValues = {
      company_name: companyName, company_number: companyNum,
      registered_address: regAddress, company_type: companyType,
      founded_year: yearInc, company_status: coStatus,
      cqc_status: cqcStatus, sme_status: smeStatus,
      contact_name: co.name || '', vat_number: co.vat || ''
    };

    var sectionTitle = visibleSection ? (visibleSection.section + ': ' + visibleSection.title) : 'Part 1: Supplier Information';
    var sectionFields = visibleSection ? visibleSection.fields.filter(function(f){ return f.field_type !== 'client_confirm'; }) : [
      { question:'Full registered name', profile_key:'company_name' },
      { question:'Company registration number', profile_key:'company_number' },
      { question:'Registered office address', profile_key:'registered_address' },
      { question:'Company type', profile_key:'company_type' },
      { question:'Year incorporated', profile_key:'founded_year' },
      { question:'Company status', profile_key:'company_status' },
      { question:'CQC registration', profile_key:'cqc_status' },
      { question:'SME status', profile_key:'sme_status' }
    ];

    h += '<div style="margin-bottom:1.75rem;">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;padding-bottom:0.5rem;border-bottom:2px solid #00C9E0;">';
    h += '<div style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#0B1929;">' + sectionTitle + '</div>';
    h += '<span style="font-size:0.69rem;font-weight:700;background:#e8f7ee;color:#1a7a3f;padding:2px 9px;border-radius:999px;">✓ Auto-filled</span>';
    h += '</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">';
    sectionFields.forEach(function(f, i) {
      var val = coFieldValues[f.profile_key] || '—';
      var bg = i % 2 === 0 ? '#fafafa' : '#fff';
      h += '<tr style="background:' + bg + ';">';
      h += '<td style="padding:8px 10px;font-weight:600;color:#374151;width:45%;border-bottom:1px solid #f3f4f6;">' + f.question + '</td>';
      h += '<td style="padding:8px 10px;color:#166534;font-weight:500;border-bottom:1px solid #f3f4f6;">✓ ' + val + '</td>';
      h += '</tr>';
    });
    h += '</table></div>';

    // ── DIRECTORS ──
    var officers = [];
    var pscs = [];
    try { officers = (ch.officers || []).filter(function(o){ return !o.resigned_on; }); } catch(e) {}
    try { pscs = ch.pscs || []; } catch(e) {}

    h += '<div style="margin-bottom:1.75rem;">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;padding-bottom:0.5rem;border-bottom:2px solid #00C9E0;">';
    h += '<div style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#0B1929;">Directors &amp; Persons of Significant Control</div>';
    h += '<span style="font-size:0.69rem;font-weight:700;background:#e8f7ee;color:#1a7a3f;padding:2px 9px;border-radius:999px;">✓ From Companies House</span>';
    h += '</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">';
    if (officers.length || pscs.length) {
      officers.forEach(function(o, i) {
        h += '<tr style="background:' + (i%2===0?'#fafafa':'#fff') + ';">';
        h += '<td style="padding:8px 10px;font-weight:600;color:#166534;border-bottom:1px solid #f3f4f6;width:45%;">✓ ' + o.name + '</td>';
        h += '<td style="padding:8px 10px;color:#374151;text-transform:capitalize;border-bottom:1px solid #f3f4f6;">' + (o.role||'Director') + (o.appointed_on ? ' · ' + o.appointed_on : '') + '</td>';
        h += '<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:right;"><span style="font-size:0.69rem;font-weight:700;background:#e8f7ee;color:#1a7a3f;padding:2px 7px;border-radius:999px;">Director</span></td>';
        h += '</tr>';
      });
      pscs.forEach(function(p, i) {
        h += '<tr style="background:' + ((officers.length+i)%2===0?'#fafafa':'#fff') + ';">';
        h += '<td style="padding:8px 10px;font-weight:600;color:#5b21b6;border-bottom:1px solid #f3f4f6;width:45%;">✓ ' + p.name + '</td>';
        h += '<td style="padding:8px 10px;color:#374151;border-bottom:1px solid #f3f4f6;" colspan="2">' + (p.nature_of_control||'Person of Significant Control') + '</td>';
        h += '</tr>';
      });
    } else {
      h += '<tr><td colspan="3" style="padding:10px;color:#9ca3af;font-style:italic;font-size:0.82rem;">No director data — complete Companies House lookup in Step 2 to auto-fill directors.</td></tr>';
    }
    h += '</table></div>';

    // ── LOCKED SECTIONS ──
    var lockTitles = lockedSections.map(function(s){ return s.section + ': ' + s.title; });
    if (!lockTitles.length) {
      lockTitles = ['Part 2: Exclusion Grounds', 'Part 3: Financial Standing', 'Part 4: Technical Capability', 'Part 5: Insurance & Compliance'];
    }

    lockTitles.forEach(function(title) {
      h += '<div style="margin-bottom:1rem;position:relative;">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;padding-bottom:0.5rem;border-bottom:1px solid #e5e7eb;">';
      h += '<div style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;">' + title + '</div>';
      h += '<span style="font-size:0.69rem;font-weight:700;background:#f3f4f6;color:#9ca3af;padding:2px 9px;border-radius:999px;">🔒 Locked</span>';
      h += '</div>';
      h += '<div style="position:relative;border-radius:6px;overflow:hidden;">';
      h += '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;filter:blur(4px);pointer-events:none;user-select:none;">';
      for (var i=0;i<3;i++) {
        h += '<tr style="background:' + (i%2===0?'#fafafa':'#fff') + ';"><td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;width:45%;">Question ' + (i+1) + '</td><td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">Response required</td></tr>';
      }
      h += '</table>';
      h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(255,255,255,0.5);">';
      h += '<span style="font-size:1.1rem;">🔒</span><span style="font-size:0.78rem;font-weight:700;color:#6b7280;">Completed in your full report after payment</span>';
      h += '</div></div></div>';
    });

    el.innerHTML = h;
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
    setStep(4);
    showState('loading');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await runGeneration(window._companyDetails);
  }

  function populateSqStep(sqData, co) {
    // Auto-fill summary
    var autoFields = [
      { label: 'Company name',   value: co.name },
      { label: 'CQC status',     value: co.cqc },
      { label: 'Staff',          value: co.staff },
      { label: 'Services',       value: co.services ? co.services.substring(0,60)+'...' : '' },
      { label: 'Regions',        value: co.regions },
      { label: 'Founded',        value: co.founded }
    ].filter(function(f){ return f.value; });

    document.getElementById('sq-autofill-fields').innerHTML = autoFields.map(function(f) {
      return '<div style="background:#fff;border-radius:6px;padding:6px 10px;">' +
        '<div style="font-size:0.7rem;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">' + f.label + '</div>' +
        '<div style="font-size:0.82rem;font-weight:600;color:#166534;">' + f.value + '</div>' +
      '</div>';
    }).join('');

    // Extract declarations from sq_data
    var declarations = [];
    (sqData.sections || []).forEach(function(s) {
      (s.fields || []).forEach(function(f) {
        if (f.field_type === 'client_confirm') declarations.push(f);
      });
    });

    // Default declarations if none extracted
    if (!declarations.length) {
      declarations = [
        { id:'d1', question:'I confirm that our organisation is not on the debarment list and has not been subject to any mandatory or discretionary exclusion grounds.' },
        { id:'d2', question:'I confirm that our organisation has no unspent criminal convictions relevant to this procurement.' },
        { id:'d3', question:'I confirm that all information provided in this submission is accurate and complete to the best of my knowledge.' },
        { id:'d4', question:'I confirm that our organisation has not been in administration, receivership or subject to insolvency proceedings in the last 3 years.' }
      ];
    }

    document.getElementById('sq-declarations').innerHTML = declarations.map(function(d) {
      return '<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #fde68a;">' +
        '<input type="checkbox" id="decl-' + d.id + '" style="margin-top:3px;accent-color:#92400e;flex-shrink:0;width:16px;height:16px;">' +
        '<label for="decl-' + d.id + '" style="font-size:0.83rem;color:#78350f;line-height:1.6;cursor:pointer;">' + d.question + '</label>' +
      '</div>';
    }).join('');
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
