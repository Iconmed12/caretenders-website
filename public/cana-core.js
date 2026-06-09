
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
    document.querySelector('.loading-state p').textContent  = 'Please wait while we confirm your payment.';

    try {
      var co = window._companyDetails || {};
      // Restore from localStorage — Stripe redirect reloads the page and wipes in-memory state
      if (!co.name && !co.email) {
        try {
          var saved = JSON.parse(localStorage.getItem('cana_company_details') || '{}');
          if (saved && (saved.name || saved.email)) co = saved;
        } catch(e) {}
      }
      // Merge CH data so company name is always available
      var chData = window._chData || {};
      if ((!chData || !chData.company_name) && co.chData) chData = co.chData;
      var mergedCo = Object.assign({}, co, {
        name: co.name || chData.company_name || '',
        company_name: co.name || chData.company_name || '',
        chData: chData
      });
      var res = await fetch('/.netlify/functions/cana-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          tenderId: tenderId,
          includeSq: !!(window._tenderData && window._tenderData.sq_data),
          companyDetails: mergedCo
        })
      });
      var data = await res.json();

      if (!res.ok || !data.paid) {
        showState('form'); setStep(1);
        alert('Payment could not be verified: ' + (data.error || 'Please contact consulting@icongrp.co.uk'));
        return;
      }

      // Payment confirmed — show processing screen immediately
      showProcessingScreen(data.jobId, data.email);

      // Browser triggers background function directly (more reliable than function-to-function)
      console.log('Triggering background function from browser for job:', data.jobId);
      fetch('/.netlify/functions/generate-cana-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: data.jobId,
          tenderId: data.tenderId || tenderId,
          sessionId: sid,
          includeSq: data.includeSq,
          companyDetails: data.companyDetails || mergedCo
        })
      }).then(function(r){
        console.log('Background function response status:', r.status);
      }).catch(function(e){
        console.error('Background function trigger failed:', e.message);
      });

      // Start polling for status updates
      pollJobStatus(data.jobId);

} catch(e) {
      showState('form'); setStep(1);
      alert('Verification error: ' + e.message);
    }
  }

  function showProcessingScreen(jobId, email) {
    showState('loading');
    var h3 = document.querySelector('.loading-state h3');
    var p  = document.querySelector('.loading-state p');
    var spinner = document.querySelector('.loading-state .loading-spinner');
    if (spinner) spinner.style.display = 'none';
    if (h3) { h3.innerHTML = '✅ Payment received — Cana AI is on it'; }
    if (p)  { p.innerHTML =
      'Your bid responses and completed SQ will be sent to <strong>' + (email||'your email') + '</strong> as Word documents.<br><br>' +
      '<span style="color:var(--muted);font-size:0.88em;">Expect to receive your documents within 1 hour. ' +
      'If you don\'t receive anything please email <strong>hello@cana.ai</strong></span>'; }

    // Prompt to register an account (for guest buyers)
    setTimeout(function() {
      var loadingState = document.querySelector('.loading-state');
      if (!loadingState) return;
      var existing = document.getElementById('register-prompt');
      if (existing) return;
      // Only show if not already logged in
      var sb = window._supabase;
      var showPrompt = function() {
        var promptDiv = document.createElement('div');
        promptDiv.id = 'register-prompt';
        promptDiv.style.cssText = 'margin-top:2rem;padding:1.5rem;background:linear-gradient(135deg,rgba(0,201,224,0.08),rgba(11,25,41,0.04));border:1.5px solid rgba(0,201,224,0.3);border-radius:14px;text-align:center;';
        promptDiv.innerHTML =
          '<div style="font-family:\'Playfair Display\',serif;font-size:1.15rem;font-weight:700;color:var(--navy);margin-bottom:0.5rem;">Save your details for next time</div>' +
          '<p style="color:var(--muted);font-size:0.88rem;margin-bottom:1rem;line-height:1.6;">Create a free account to track this bid, store your company profile and CQC rating, and complete future bids in minutes instead of starting from scratch.</p>' +
          '<a href="/register.html?email=' + encodeURIComponent(email||'') + '" style="display:inline-block;background:var(--navy);color:#fff;padding:11px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:0.9rem;">Create free account →</a>';
        loadingState.appendChild(promptDiv);
      };
      if (sb && sb.auth) {
        sb.auth.getUser().then(function(res){ if (!res || !res.data || !res.data.user) showPrompt(); }).catch(showPrompt);
      } else {
        showPrompt();
      }
    }, 2500);

    window._jobId = jobId;
  }

  var STAGES = [
    { key: 'pending',              label: 'Payment confirmed',           icon: '💳' },
    { key: 'processing',           label: 'Reading tender specification', icon: '📄' },
    { key: 'generating_responses', label: 'Writing bid responses',        icon: '✍️' },
    { key: 'completing_sq',        label: 'Completing your SQ',           icon: '📋' },
    { key: 'building_documents',   label: 'Building Word documents',      icon: '📝' },
    { key: 'sending_email',        label: 'Sending to your email',        icon: '📧' },
    { key: 'complete',             label: 'Done!',                        icon: '✅' }
  ];

  function renderTracker(currentStatus) {
    var currentIdx = STAGES.findIndex(function(s){ return s.key === currentStatus; });
    if (currentIdx === -1) currentIdx = 0;
    var email = window._companyDetails && window._companyDetails.email || '';
    var stage = STAGES[currentIdx];
    var isComplete = currentStatus === 'complete';

    // Mini progress dots
    var dots = STAGES.map(function(s, i) {
      var cls = i < currentIdx ? 'tracker-dot done' : (i === currentIdx ? 'tracker-dot active' : 'tracker-dot');
      return '<div class="' + cls + '"></div>';
    }).join('');

    var html = '<div class="cana-tracker">' +
      '<div class="cana-tracker-title">' + (isComplete ? '✅ Your documents are ready' : 'Cana AI is preparing your documents') + '</div>' +
      '<div class="cana-tracker-email">' + (isComplete ? 'Sent to <strong>' + email + '</strong>' : 'Will be sent to <strong>' + email + '</strong> as Word documents') + '</div>' +
      '<div class="tracker-dots">' + dots + '</div>' +
      '<div class="tracker-current-stage ' + (isComplete ? 'stage-complete' : '') + '">' +
        '<div class="tracker-current-icon">' + stage.icon + '</div>' +
        '<div class="tracker-current-label">' + stage.label + '</div>' +
        '<div class="tracker-current-step">Step ' + (currentIdx + 1) + ' of ' + STAGES.length + '</div>' +
        (!isComplete ? '<div class="tracker-progress-bar"><div class="tracker-progress-fill"></div></div>' : '') +
      '</div>' +
      '<div class="tracker-completed-list">';

    for (var i = 0; i < currentIdx; i++) {
      html += '<div class="tracker-done-item">✓ ' + STAGES[i].label + '</div>';
    }

    html += '</div></div>';
    return html;
  }

  function showProcessingTracker(status) {
    var loadingState = document.querySelector('.loading-state');
    if (!loadingState) return;
    var spinner = loadingState.querySelector('.loading-spinner');
    if (spinner) spinner.style.display = 'none';
    var h3 = loadingState.querySelector('h3');
    var p  = loadingState.querySelector('p');
    if (h3) h3.style.display = 'none';
    if (p)  p.innerHTML = renderTracker(status);
  }

  async function pollJobStatus(jobId) {
    if (!jobId) return;
    var maxPolls = 72;
    var polls = 0;
    console.log('Polling job silently:', jobId);

    var interval = setInterval(async function() {
      polls++;
      if (polls > maxPolls) {
        clearInterval(interval);
        return; // Simple message already showing — just stop polling
      }
      try {
        var res = await fetch('/.netlify/functions/get-cana-result?jobId=' + encodeURIComponent(jobId));
        var job = await res.json();
        console.log('Job status:', job.status);
        if (job.status === 'complete') {
          clearInterval(interval);
          showJobComplete(job, false);
        } else if (job.status === 'error') {
          clearInterval(interval);
          showJobComplete(job, false, job.error || null);
        }
      } catch(e) { console.log('Poll error:', e.message); }
    }, 5000);
  }

  function showJobComplete(job, timedOut, errorMsg) {
    var email = (window._companyDetails && window._companyDetails.email) || 'your email';
    showState('loading');
    var h3 = document.querySelector('.loading-state h3');
    var p  = document.querySelector('.loading-state p');
    var spinner = document.querySelector('.loading-state .loading-spinner');
    if (spinner) spinner.style.display = 'none';

    if (errorMsg) {
      if (h3) h3.textContent = 'Something went wrong';
      if (p)  p.innerHTML = 'Our team has been notified. Please email <strong>consulting@icongrp.co.uk</strong> with your payment reference and we will send your documents manually within 1 hour.';
    } else {
      if (h3) h3.innerHTML = '✅ Your documents are on their way';
      if (p)  p.innerHTML =
        'Your bid responses and completed SQ have been sent to <strong>' + email + '</strong> as Word documents.<br><br>' +
        '<span style="font-size:0.85em;color:var(--muted);">Check your spam folder if you don\'t see it within 5 minutes. If you need help email consulting@icongrp.co.uk</span>';
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
  var _chSearchTimer = null;

  function canaChSearch(val) {
    clearTimeout(_chSearchTimer);
    var dropdown = document.getElementById('ch-dropdown-cana');
    if (!val || val.trim().length < 2) { dropdown.style.display = 'none'; return; }
    dropdown.style.display = 'block';
    dropdown.innerHTML = '<div style="padding:12px 16px;font-size:0.83rem;color:#9ca3af;">Searching...</div>';
    _chSearchTimer = setTimeout(function(){ runCanaChSearch(val.trim()); }, 350);
  }

  async function runCanaChSearch(query) {
    var dropdown = document.getElementById('ch-dropdown-cana');
    try {
      var res = await fetch('/.netlify/functions/companies-house-lookup', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ query: query })
      });
      var data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error);
      var results = data.results || [];
      if (!results.length) {
        dropdown.innerHTML = '<div style="padding:12px 16px;font-size:0.83rem;color:#9ca3af;">No companies found — try a different name or number</div>';
        return;
      }
      dropdown.innerHTML = results.map(function(c, i) {
        var addr = c.registered_address || '';
        var status = c.company_status || '';
        var statusColor = status === 'active' ? '#166534' : '#9ca3af';
        return '<div onclick="selectCanaChResult(' + i + ')" data-idx="' + i + '"' +
          ' style="padding:10px 16px;cursor:pointer;border-bottom:1px solid #f3f4f6;transition:background 0.15s;"' +
          ' class="ch-result-item">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
            '<div style="font-weight:600;font-size:0.88rem;color:#0B1929;">' + escapeHtml(c.company_name) + '</div>' +
            '<span style="font-size:0.7rem;font-weight:700;color:' + statusColor + ';flex-shrink:0;">' + status + '</span>' +
          '</div>' +
          '<div style="font-size:0.75rem;color:#6b7280;margin-top:2px;">' + escapeHtml(c.company_number) + (addr ? ' · ' + escapeHtml(addr.substring(0,50)) : '') + '</div>' +
          '</div>';
      }).join('');
      window._chSearchResults = results;
    } catch(e) {
      dropdown.innerHTML = '<div style="padding:12px 16px;font-size:0.83rem;color:#c53030;">Search failed — try again</div>';
    }
  }

  function selectCanaChResult(idx) {
    var result = window._chSearchResults && window._chSearchResults[idx];
    if (!result) return;
    closeCanaChDropdown();
    document.getElementById('ch-search-cana').value = result.company_name;
    // Now fetch full details by company number
    canaChLookupByNumber(result.company_number);
  }

  function closeCanaChDropdown() {
    var d = document.getElementById('ch-dropdown-cana');
    if (d) d.style.display = 'none';
  }

  function escapeHtml(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  async function canaChLookupByNumber(num) {
    var errEl = document.getElementById('ch-error-cana');
    errEl.style.display = 'none';
    var input = document.getElementById('ch-search-cana');
    if (input) { input.disabled = true; }
    try {
      var res = await fetch('/.netlify/functions/companies-house-lookup', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ companyNumber: num })
      });
      var data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Not found');
      window._chData = data;
      showCanaChResult(data);
    } catch(err) {
      errEl.textContent = err.message || 'Could not find company. Try again.';
      errEl.style.display = 'block';
    }
    if (input) input.disabled = false;
  }

  // Keep canaChLookup as alias for direct number entry
  async function canaChLookup() {
    var input = document.getElementById('ch-search-cana');
    var val = input ? input.value.trim() : '';
    if (!val) return;
    // If it looks like a company number, look up directly
    if (/^[0-9A-Z]{6,8}$/.test(val.replace(/\s/g,''))) {
      canaChLookupByNumber(val.replace(/\s/g,''));
    } else {
      runCanaChSearch(val);
    }
  }

  function showCanaChResult(data) {
    document.getElementById('ch-result-name-cana').textContent = data.company_name;
    document.getElementById('ch-result-status-cana').textContent =
      '● ' + (data.company_status||'') + (data.date_of_creation ? ' · Inc. ' + data.date_of_creation.split('-')[0] : '');
    var fields = [
      { label:'Company number',   value: data.company_number },
      { label:'Registered address', value: data.registered_address },
      { label:'Type',             value: (data.company_type||'').replace(/-/g,' ') },
      { label:'Directors',        value: data.officers && data.officers.length ? data.officers[0].name : '—' }
    ];
    document.getElementById('ch-result-grid-cana').innerHTML = fields.map(function(f){
      return '<div style="background:#fff;border-radius:7px;padding:8px 10px;">' +
        '<div style="font-size:0.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">' + f.label + '</div>' +
        '<div style="font-size:0.82rem;font-weight:600;color:#166534;">' + escapeHtml(f.value||'—') + '</div>' +
        '</div>';
    }).join('');
    document.getElementById('ch-result-cana').style.display = 'block';
    document.getElementById('ch-continue-btn-cana').style.display = 'block';
  }


  async function canaChContinue() {
    try {
      var btn = document.getElementById('ch-continue-btn-cana');
      if (btn) btn.disabled = true;

      setStep(3);
      showState('sq');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (btn) { btn.disabled = false; btn.textContent = 'Next step →'; }
      populateSqStep().catch(function(e){ console.warn('SQ populate warning:', e.message); });
    } catch(err) {
      console.error('canaChContinue error:', err.message);
      // Force show SQ anyway
      try { setStep(3); showState('sq'); } catch(e2) {}
    }

    // Save profile in background — fire and forget
    if (window.supabase && window._chData) {
      try {
        var sbClient = window.supabase.createClient(
          'https://igpjfpncfuawikoyzfcd.supabase.co',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA'
        );
        var sess = await sbClient.auth.getSession();
        if (sess.data && sess.data.session) {
          sbClient.from('company_profiles').upsert({
            user_id: sess.data.session.user.id,
            company_name: window._chData.company_name,
            company_number: window._chData.company_number,
            registered_address: window._chData.registered_address,
            ch_data: JSON.stringify(window._chData),
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' }).then(function(){
            console.log('Profile saved silently');
          }).catch(function(e){ console.log('Profile save skipped:', e.message); });
        }
      } catch(e) { console.log('Profile save skipped:', e.message); }
    }
  }

  function canaChSkip() {
    window._chData = null;
    setStep(3);
    populateSqStep();
    showState('sq');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }