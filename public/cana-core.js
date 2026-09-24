
  let tenderId = null;
  let tenderData = null;
  let generatedResponses = [];
  let currentSessionId = null;
  const SUPABASE_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';

  // Get URL params
  const params = new URLSearchParams(window.location.search);
  tenderId = params.get('tender');
  const sessionId = params.get('session');
  const paid = params.get('paid');
  const reviewPaid = params.get('review');

  if (!tenderId) {
    document.getElementById('tender-title').textContent = 'No tender selected';
  } else if (paid === 'true' && sessionId) {
    // Coming back from Stripe - verify payment then show responses
    loadTender().then(() => verifyAndUnlock(sessionId));
  } else if (reviewPaid === 'paid') {
    // Member returning from an add-on payment. Nothing was generated before
    // payment, so we generate now that Stripe has taken the money.
    loadTender().then(() => resumeMemberAfterAddon());
  } else {
    // If a session token is present, the visitor is likely a signed-in member.
    // Show a loading state right away instead of the empty guest form, so their
    // saved details do not flash in after it. initMemberExperience() then shows
    // the member dashboard, or falls back to the form for guests/non-members.
    try {
      if (localStorage.getItem('sb-igpjfpncfuawikoyzfcd-auth-token')) {
        window._sessionHint = true;
        showState('loading');
        var _lh = document.querySelector('.loading-state h3'); if (_lh) _lh.textContent = 'Loading your details...';
        var _lp = document.querySelector('.loading-state p');  if (_lp) _lp.textContent  = 'One moment while we load your saved profile.';
        var _ls = document.querySelector('.loading-state .loading-spinner'); if (_ls) _ls.style.display = '';
        // Safety net: never leave someone stuck on the loading state.
        setTimeout(function () { var s = document.getElementById('state-loading'); if (s && s.classList.contains('active')) showState('form'); }, 8000);
      }
    } catch (e) {}
    loadTender();
  }

  async function verifyAndUnlock(sid) {
    setStep(5);
    showState('loading');
    document.querySelector('.loading-state h3').textContent = 'Verifying your payment...';
    document.querySelector('.loading-state p').textContent  = 'Please wait while we confirm your payment.';

    try {
      var co = window._companyDetails || {};
      // Restore from localStorage, Stripe redirect reloads the page and wipes in-memory state
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
          cs: params.get('cs'), // real Stripe session id, used for secure server-side verification
          tenderId: tenderId,
          includeSq: false, // SQ auto-fill paused for launch - see SQ_FEATURE_PAUSED note
          companyDetails: mergedCo
        })
      });
      var data = await res.json();

      if (!res.ok || !data.paid) {
        showState('form'); setStep(1);
        alert('Payment could not be verified: ' + (data.error || 'Please contact hello@getcana.co.uk'));
        return;
      }

      // Payment confirmed, show processing screen immediately
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
          wantsReview: (data.tier && data.tier !== 'none') || (function(){ var w = localStorage.getItem('cana_wants_review') === '1'; localStorage.removeItem('cana_wants_review'); return w; })(),
          tier: data.tier || (function(){ var t = localStorage.getItem('cana_tier') || 'none'; localStorage.removeItem('cana_tier'); return t; })(),
          companyDetails: data.companyDetails || mergedCo
        })
      }).then(function(r){
        console.log('Background function response status:', r.status);
      }).catch(function(e){
        console.error('Background function trigger failed:', e.message);
      });

      // Expert Review (if ticked) was already paid in the same checkout as the
      // 480, so nothing extra to charge here.

      // Start polling for status updates
      pollJobStatus(data.jobId);

} catch(e) {
      showState('form'); setStep(1);
      alert('Verification error: ' + e.message);
    }
  }

  function showProcessingScreen(jobId, email) {
    showState('loading');
    // Move the step tracker to the final step instead of leaving it stranded.
    setStep(5);
    var h3 = document.querySelector('.loading-state h3');
    var p  = document.querySelector('.loading-state p');
    var spinner = document.querySelector('.loading-state .loading-spinner');
    if (spinner) spinner.style.display = 'none';
    // Members pay nothing (it is included), so do not tell them "Payment received".
    var isMember = !!window._isMember;
    if (h3) { h3.innerHTML = isMember ? '&#9989; You are all set, Cana is writing your bid' : '&#9989; Payment received, Cana is on it'; }
    if (p)  { p.innerHTML =
      'Your bid responses will be sent to <strong>' + (email||'your email') + '</strong> as Word documents.<br><br>' +
      '<span style="color:var(--muted);font-size:0.88em;">Cana is researching your local area and writing your responses in full. Please allow up to a couple of hours for your documents to arrive by email; there is no need to keep this page open. ' +
      'If nothing has arrived after that, please email <strong>hello@getcana.co.uk</strong></span>'; }

    // Prompt guest buyers to create an account. Never show it to someone who is
    // already signed in or is a member.
    setTimeout(function() {
      var loadingState = document.querySelector('.loading-state');
      if (!loadingState) return;
      if (document.getElementById('register-prompt')) return;
      if (window._sessEmail || window._isMember) return; // signed in / member: skip
      var promptDiv = document.createElement('div');
      promptDiv.id = 'register-prompt';
      promptDiv.style.cssText = 'margin-top:2rem;padding:1.5rem;background:linear-gradient(135deg,rgba(0,201,224,0.08),rgba(11,25,41,0.04));border:1.5px solid rgba(0,201,224,0.3);border-radius:14px;text-align:center;';
      promptDiv.innerHTML =
        '<div style="font-family:\'Playfair Display\',serif;font-size:1.15rem;font-weight:700;color:var(--navy);margin-bottom:0.5rem;">Save your details for next time</div>' +
        '<p style="color:var(--muted);font-size:0.88rem;margin-bottom:1rem;line-height:1.6;">Create a free account to track this bid, store your company profile and CQC rating, and complete future bids in minutes instead of starting from scratch.</p>' +
        '<a href="/register.html?email=' + encodeURIComponent(email||'') + '" style="display:inline-block;background:var(--navy);color:#fff;padding:11px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:0.9rem;">Create free account</a>';
      loadingState.appendChild(promptDiv);
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
      '<div class="cana-tracker-title">' + (isComplete ? '✅ Your documents are ready' : 'Cana is preparing your documents') + '</div>' +
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
        return; // Simple message already showing, just stop polling
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
      if (p)  p.innerHTML = 'Our team has been notified. Please email <strong>hello@getcana.co.uk</strong> with your payment reference and we will send your documents manually, usually within a couple of hours.';
    } else {
      if (h3) h3.innerHTML = '✅ Your documents are on their way';
      if (p)  p.innerHTML =
        'Your bid responses have been sent to <strong>' + email + '</strong> as Word documents.<br><br>' +
        '<span style="font-size:0.85em;color:var(--muted);">Check your spam folder if you don\'t see it within 5 minutes. If you need help email hello@getcana.co.uk</span>';
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
      const res = await fetch('/.netlify/functions/get-tender-full?id=' + encodeURIComponent(tenderId));
      tenderData = res.ok ? await res.json() : null;
      if (tenderData && tenderData.error) tenderData = null;
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
      // Always use the fixed Cana payment link
      document.getElementById('paywall-btn').href = 'https://buy.stripe.com/5kQfZgcFx0fJeqR3MUcbC03';

    initMemberExperience();
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
    var missing = [];
    if (!name) missing.push('organisation name');
    if (!founded) missing.push('year founded');
    if (!staff) missing.push('number of staff');
    if (!cqc) missing.push('CQC status');
    if (!services) missing.push('services');
    if (!regions) missing.push('regions');
    if (!email) missing.push('email');
    if (missing.length) {
      errEl.textContent = 'Please complete: ' + missing.join(', ') + '.';
      errEl.style.display = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    errEl.style.display = 'none';

    // Show CH lookup step before generating
    setStep(2);
    showState('ch');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window._companyDetails = { name, founded, staff, cqc, services, regions, experience, achievements, policies, accreditations, kpis, email };
    checkMembership(email);
  }

  // ── On page load: detect member and route to the right experience ──
  async function initMemberExperience() {
    // Single auth call, then parallel membership + profile fetches
    var sess = await getAuthSession();
    if (!sess || !sess.email) { showState('form'); return; } // no real session: show the form

    // Signed in: pre-fill the email field so they don't retype it, and greet them
    var emailField = document.getElementById('f-email');
    if (emailField && !emailField.value) {
      emailField.value = sess.email;
      window.canaEmailCheck(sess.email);
    }

    // Parallel: check membership AND load profile at the same time
    var [memRes, profile] = await Promise.all([
      checkMembership(sess.email),
      loadSavedProfile(sess.token)
    ]);

    // Verified paid member with a profile -> member dashboard (free generate)
    if (memRes && memRes.member && memRes.verified && profile) {
      showMemberDashboard(sess.email, memRes, profile);
      return;
    }

    // Signed-in account holder (not a paid member) with a saved profile ->
    // pre-fill the form so they don't retype onboarding details. They still
    // pay the 480 because they are not members.
    if (profile) {
      prefillFormFromProfile(profile, sess.email);
    }
    // Not a member dashboard, so land on the form (revealing it if we had shown
    // the loading state for a signed-in visitor).
    showState('form');
  }

  // Fill the Cana company form from a saved company_profiles row
  function prefillFormFromProfile(p, email) {
    var cpData = p.ch_data ? (typeof p.ch_data === 'string' ? (function(){ try { return JSON.parse(p.ch_data); } catch(e){ return {}; } })() : p.ch_data) : {};
    var map = {
      'f-name':          p.company_name || cpData.company_name || '',
      'f-founded':       p.founded_year || p.year_founded || '',
      'f-staff':         p.total_staff || p.staff_count || '',
      'f-services':      p.services || '',
      'f-regions':       p.regions || '',
      'f-experience':    p.experience || '',
      'f-achievements':  p.achievements || '',
      'f-policies':      p.policies || '',
      'f-accreditations':p.accreditations || '',
      'f-kpis':          p.kpis || ''
    };
    Object.keys(map).forEach(function(id){
      var el = document.getElementById(id);
      if (el && map[id] && !el.value) el.value = map[id];
    });
    // CQC dropdown: profile and form word these differently, so match on the
    // rating keyword (Outstanding / Good / Requires Improvement / etc)
    var cqcEl = document.getElementById('f-cqc');
    if (cqcEl && p.cqc_status) {
      var ps = p.cqc_status.toLowerCase();
      var key = ps.indexOf('outstanding') >= 0 ? 'outstanding'
              : ps.indexOf('good') >= 0 ? 'good'
              : ps.indexOf('requires') >= 0 ? 'requires'
              : ps.indexOf('inadequate') >= 0 ? 'inadequate'
              : ps.indexOf('awaiting') >= 0 ? 'awaiting'
              : ps.indexOf('not yet') >= 0 ? 'not yet'
              : ps.indexOf('not applicable') >= 0 ? 'not applicable'
              : ps.indexOf('registered') >= 0 ? 'registered' : '';
      for (var i=0;i<cqcEl.options.length;i++){
        var optTxt = (cqcEl.options[i].value + ' ' + cqcEl.options[i].text).toLowerCase();
        if (key && optTxt.indexOf(key) >= 0){ cqcEl.selectedIndex = i; break; }
      }
    }
    // Stash company number so the CH lookup step can be skipped
    if (p.company_number) window._savedCompanyNumber = p.company_number;
    // Stash key_people + contract_examples so generation uses them
    window._savedProfileExtras = { key_people: p.key_people || [], contract_examples: p.contract_examples || [], social_value: p.social_value || '' };

    // Show a small note that details were pre-filled
    var note = document.getElementById('prefill-note');
    if (!note) {
      var emailField = document.getElementById('f-email');
      if (emailField && emailField.parentNode) {
        note = document.createElement('div');
        note.id = 'prefill-note';
        note.style.cssText = 'margin-top:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:9px 13px;font-size:0.78rem;color:#1e40af;';
        note.innerHTML = '✓ We filled in your company details from your profile. Check them over, then continue.';
        emailField.parentNode.appendChild(note);
      }
    }
  }

  async function loadSavedProfile(token) {
    try {
      var sb = sharedSb();
      if (!sb) return null;
      var sess = await getAuthSession();
      if (!sess || !sess.userId) return null;
      var r = await sb.from('company_profiles').select('*').eq('user_id', sess.userId).single();
      return (r && r.data) ? r.data : null;
    } catch (e) { return null; }
  }

  function showMemberDashboard(email, memRes, profile) {
    // Mirror tender details onto the member state header
    var t1 = document.getElementById('tender-title-member');
    var t2 = document.getElementById('tender-title');
    if (t1 && t2) t1.innerHTML = t2.innerHTML;
    ['org','value','deadline'].forEach(function(f) {
      var src = document.getElementById('tender-' + f);
      var dst = document.getElementById('tender-' + f + '-member');
      if (src && dst) dst.innerHTML = src.innerHTML;
    });

    // Membership status card. Term maps to tier: 3 Bronze, 6 Silver, 12+ Gold.
    var planLabel = document.getElementById('member-plan-label');
    var renewsLabel = document.getElementById('member-renews-label');
    var mmT = parseInt(memRes.term_months, 10) || 0;
    var tierT = mmT >= 12 ? { n:'Gold',   grad:'radial-gradient(circle at 34% 28%,#f8ebb4,#d8b038)', fg:'#5f4c0e' }
              : mmT >= 6  ? { n:'Silver', grad:'radial-gradient(circle at 34% 28%,#f3f5f8,#b7c0cb)', fg:'#3f4a56' }
              :             { n:'Bronze', grad:'radial-gradient(circle at 34% 28%,#eccba0,#b3763f)', fg:'#5c3a17' };
    // Always show the tier for a member. When the term is missing this defaults
    // to Bronze, matching how the nav labels the same membership.
    if (planLabel) {
      planLabel.textContent = tierT.n + ' membership';
    }
    var tierCoin = document.getElementById('member-tier-coin');
    if (tierCoin) {
      tierCoin.textContent = tierT.n.charAt(0);
      tierCoin.style.background = tierT.grad;
      tierCoin.style.color = tierT.fg;
      tierCoin.style.boxShadow = 'inset 0 0 0 1.5px rgba(255,255,255,.55), 0 1px 2px rgba(0,0,0,.25)';
    }
    if (renewsLabel && memRes.current_period_end) {
      var d = new Date(memRes.current_period_end);
      renewsLabel.textContent = 'Renews ' + d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
    }

    // Company profile summary
    var nameEl = document.getElementById('member-company-name');
    var linesEl = document.getElementById('member-profile-lines');
    var cpData = profile.ch_data ? (typeof profile.ch_data === 'string' ? JSON.parse(profile.ch_data) : profile.ch_data) : {};
    var companyName = profile.company_name || cpData.company_name || 'Your company';
    if (nameEl) nameEl.textContent = companyName;
    if (linesEl) {
      var lines = [];
      if (profile.cqc_status) lines.push('CQC: ' + profile.cqc_status);
      if (profile.services) lines.push('Services: ' + profile.services.substring(0, 80) + (profile.services.length > 80 ? '...' : ''));
      if (profile.regions) lines.push('Regions: ' + profile.regions);
      if (profile.total_staff || profile.staff_count) lines.push('Staff: ' + (profile.total_staff || profile.staff_count));
      linesEl.innerHTML = lines.map(function(l){ return '<div>' + l + '</div>'; }).join('');
    }

    // Store profile for generation
    window._memberProfile = profile;
    window._memberEmail = email;

    renderMemberLots();
    showState('member');
  }

  // Build companyDetails from saved profile, used by both SQ and generation
  function memberCompanyDetails() {
    var p = window._memberProfile || {};
    var cpData = p.ch_data ? (typeof p.ch_data === 'string' ? JSON.parse(p.ch_data) : p.ch_data) : {};
    return {
      name: p.company_name || cpData.company_name || '',
      founded: p.founded_year || p.year_founded || '',
      staff: p.total_staff || p.staff_count || '',
      cqc: p.cqc_status || '',
      services: p.services || '',
      regions: p.regions || '',
      experience: p.experience || '',
      achievements: p.achievements || '',
      policies: p.policies || '',
      accreditations: p.accreditations || '',
      kpis: p.kpis || '',
      social_value: p.social_value || '',
      key_people: p.key_people || [],
      contract_examples: p.contract_examples || [],
      email: window._memberEmail || ''
    };
  }

  // ── Multi-lot support (customer side) ──
  function escLot(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function tenderLots(){ return (tenderData && Array.isArray(tenderData.lots)) ? tenderData.lots.filter(function(l){return l&&l.name;}) : []; }
  function renderMemberLots() {
    var wrap = document.getElementById('member-lots'); if (!wrap) return;
    var lots = tenderLots();
    if (!lots.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    wrap.style.display = 'block';
    wrap.innerHTML =
      '<div style="font-size:0.85rem;font-weight:600;color:#0B1929;margin-bottom:8px;">This tender has ' + lots.length + ' lots. Choose which to bid for, Cana writes a tailored response for each.</div>' +
      lots.map(function(l){
        return '<label style="display:flex;align-items:center;gap:10px;border:1.5px solid #e6e9ef;border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer;">' +
          '<input type="checkbox" class="member-lot-cb" data-name="' + escLot(l.name) + '" data-ref="' + escLot(l.ref) + '" style="width:16px;height:16px;flex-shrink:0;accent-color:#0B1929;">' +
          '<span style="font-size:0.85rem;color:#0B1929;">' + escLot(l.name) + (l.ref ? ' <span style="color:#8b93a1;">· ' + escLot(l.ref) + '</span>' : '') + '</span></label>';
      }).join('');
    var btn = document.getElementById('member-generate-btn');
    if (btn) btn.textContent = 'Generate my lot responses';
  }
  function getSelectedLots() {
    return Array.from(document.querySelectorAll('.member-lot-cb:checked')).map(function(cb){
      return { name: cb.getAttribute('data-name'), ref: cb.getAttribute('data-ref') };
    });
  }
  window.renderMemberLots = renderMemberLots;

  // A member generating for a multi-lot tender: one tailored response per lot,
  // each emailed as it is ready. Base bids are included, so no payment.
  async function memberGenerateLots() {
    var selected = getSelectedLots();
    if (!selected.length) { alert('Please pick at least one lot to bid for.'); return; }
    var companyDetails = memberCompanyDetails();
    window._companyDetails = companyDetails; window._isMember = true;
    setStep(5); showState('loading');
    var h = document.querySelector('.loading-state h3'); if (h) h.textContent = 'Cana is writing your ' + selected.length + ' lot response' + (selected.length > 1 ? 's' : '');
    var p = document.querySelector('.loading-state p');  if (p) p.textContent  = 'Each lot is written separately, they will email through as they finish.';
    var sp = document.querySelector('.loading-state .loading-spinner'); if (sp) sp.style.display = '';
    var ok = 0;
    for (var i = 0; i < selected.length; i++) {
      var lot = selected[i];
      try {
        var res = await fetch('/.netlify/functions/member-start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenderId: tenderId, includeSq: false, companyDetails: companyDetails, accessToken: window._authToken || '', wantsReview: false })
        });
        var data = await res.json();
        if (!res.ok || !data.member) throw new Error(data.error || 'Membership could not be verified');
        fetch('/.netlify/functions/generate-cana-background', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: data.jobId, tenderId: data.tenderId || tenderId, sessionId: 'member_' + data.jobId, includeSq: false, wantsReview: false, tier: 'none', lotName: lot.name, lotRef: lot.ref, companyDetails: data.companyDetails || companyDetails })
        }).catch(function(e){ console.error('Lot generation trigger failed:', e.message); });
        ok++;
      } catch (e) { console.error('Lot start failed (' + lot.name + '):', e.message); }
    }
    if (h) h.textContent = ok ? 'You are all set' : 'Something went wrong';
    if (p) p.textContent = ok
      ? ('Cana is writing ' + ok + ' lot response' + (ok > 1 ? 's' : '') + '. Each will be emailed to ' + (companyDetails.email || 'you') + ' as it is ready.')
      : 'We could not start the lot responses. Please try again or contact hello@getcana.co.uk';
    if (sp) sp.style.display = 'none';
  }

  window.memberGenerate = function() {
    // Multi-lot tender: use the lot picker flow instead of the single SQ flow.
    if (tenderLots().length) { return memberGenerateLots(); }
    // Store company details + CH data from the saved profile so the SQ
    // preview renders exactly as it does in the normal flow
    window._companyDetails = memberCompanyDetails();
    var prof = window._memberProfile || {};
    try {
      window._chData = prof.ch_data ? (typeof prof.ch_data === 'string' ? JSON.parse(prof.ch_data) : prof.ch_data) : {};
    } catch(e) { window._chData = {}; }
    window._isMember = true;
    setStep(2);
    showState('sq');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // This is what fills the SQ preview, the CH path calls it, members must too
    if (typeof populateSqStep === 'function') {
      populateSqStep().catch(function(e){ console.warn('SQ populate warning:', e.message); });
    }
  };

  // Called by the SQ confirm button (same path as non-member) -- fires generation
  window.memberStartGeneration = async function() {
    var btn = document.getElementById('sq-confirm-btn');
    if (btn) { btn.disabled = true; }
    try {
      var companyDetails = window._companyDetails || memberCompanyDetails();

      // Paid add-on chosen: take payment FIRST. Nothing is generated and no
      // email goes out until Stripe confirms. Generation happens on return.
      if (window._wantsExpertReview) {
        if (await startMemberAddonPayment(companyDetails)) return;
      }

      var res = await fetch('/.netlify/functions/member-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId: tenderId,
          includeSq: false, // SQ auto-fill paused for launch - see SQ_FEATURE_PAUSED note
          companyDetails: companyDetails,
          accessToken: window._authToken || '',
          wantsReview: false
        })
      });
      var data = await res.json();
      if (!res.ok || !data.member) throw new Error(data.error || 'Membership could not be verified');

      // No add-on: the base bid is included in membership, generate now.
      showProcessingScreen(data.jobId, data.email);
      try {
        await fetch('/.netlify/functions/generate-cana-background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: data.jobId,
            tenderId: data.tenderId || tenderId,
            sessionId: 'member_' + data.jobId,
            includeSq: data.includeSq,
            wantsReview: false,
            tier: 'none',
            companyDetails: data.companyDetails || companyDetails
          })
        });
      } catch(e) { console.error('Background trigger:', e.message); }

      pollJobStatus(data.jobId);
    } catch (e) {
      alert('Could not start: ' + e.message);
      if (btn) { btn.disabled = false; }
    }
  };

  // Opens Stripe's on-page checkout in an overlay (customer stays on
  // getcana.co.uk). Returns true if it opened. Needs window.STRIPE_PK + Stripe.js.
  var _stripeClient = null, _embeddedCo = null;
  window.openEmbeddedCheckout = async function (clientSecret, title) {
    if (!window.STRIPE_PK || typeof Stripe === 'undefined') return false;
    var t = document.getElementById('pay-overlay-title'); if (t && title) t.textContent = title;
    var mount = document.getElementById('checkout-mount'); if (mount) mount.innerHTML = '';
    var ov = document.getElementById('pay-overlay'); if (ov) ov.style.display = 'block';
    try {
      if (!_stripeClient) _stripeClient = Stripe(window.STRIPE_PK);
      _embeddedCo = await _stripeClient.initEmbeddedCheckout({ clientSecret: clientSecret });
      _embeddedCo.mount('#checkout-mount');
      return true;
    } catch (e) {
      window.closeEmbeddedCheckout();
      alert('Could not open payment: ' + e.message);
      return false;
    }
  };
  window.closeEmbeddedCheckout = function () {
    try { if (_embeddedCo) { _embeddedCo.destroy(); _embeddedCo = null; } } catch (e) {}
    var ov = document.getElementById('pay-overlay'); if (ov) ov.style.display = 'none';
  };

  // A member paying for a chosen add-on BEFORE anything is generated. Opens the
  // on-page checkout; on payment the return URL brings us back to generate.
  // Returns true if handled (caller should stop). Details/tier are saved so we
  // can generate on return.
  async function startMemberAddonPayment(companyDetails) {
    try {
      localStorage.setItem('cana_company_details', JSON.stringify(companyDetails || {}));
      localStorage.setItem('cana_tier', window._canaTier || 'review');
      localStorage.setItem('cana_wants_review', '1');
    } catch (e) {}
    try {
      var rRes = await fetch('/.netlify/functions/plan-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: 'review',
          tier: window._canaTier || 'review',
          tenderId: tenderId,
          tenderTitle: (tenderData && tenderData.title) || (window._tenderData && window._tenderData.title) || '',
          email: (companyDetails && companyDetails.email) || window._memberEmail || '',
          embedded: (typeof Stripe !== 'undefined' && !!window.STRIPE_PK)
        })
      });
      var rData = await rRes.json();
      if (rData.clientSecret && window.openEmbeddedCheckout) {
        var ttl = (window._canaTier === 'review_docs') ? 'Add review + documents' : 'Add expert review';
        if (await window.openEmbeddedCheckout(rData.clientSecret, ttl)) return true;
      }
      if (rData.url) { window.location.href = rData.url; return true; }
      throw new Error(rData.error || 'Could not start payment');
    } catch (e) {
      showState('form');
      alert('Could not start payment: ' + e.message);
      return false;
    }
  }

  // Member is back from paying for an add-on. Verify membership via member-start
  // (which needs their sign-in token), then generate and email the bid.
  async function resumeMemberAfterAddon() {
    setStep(5);
    showState('loading');
    var h = document.querySelector('.loading-state h3'); if (h) h.textContent = 'Payment received';
    var p = document.querySelector('.loading-state p');  if (p) p.textContent  = 'Cana is now writing your bid.';
    var s = document.querySelector('.loading-state .loading-spinner'); if (s) s.style.display = '';
    try {
      var co = {};
      try { co = JSON.parse(localStorage.getItem('cana_company_details') || '{}'); } catch (e) {}
      var reviewSessionId = params.get('rs') || '';
      var token = window._authToken || '';
      if (!token) {
        try {
          var raw = JSON.parse(localStorage.getItem('sb-igpjfpncfuawikoyzfcd-auth-token') || '{}');
          token = raw.access_token || (raw.currentSession && raw.currentSession.access_token) || '';
        } catch (e) {}
      }
      var res = await fetch('/.netlify/functions/member-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId: tenderId,
          includeSq: false,
          companyDetails: co,
          accessToken: token,
          wantsReview: true,
          reviewSessionId: reviewSessionId
        })
      });
      var data = await res.json();
      if (!res.ok || !data.member) throw new Error(data.error || 'Membership could not be verified');

      showProcessingScreen(data.jobId, data.email);
      fetch('/.netlify/functions/generate-cana-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: data.jobId,
          tenderId: data.tenderId || tenderId,
          sessionId: 'member_' + data.jobId,
          includeSq: data.includeSq,
          wantsReview: data.wantsReview !== false,
          tier: data.tier || 'review',
          companyDetails: data.companyDetails || co
        })
      }).catch(function (e) { console.error('Background trigger failed:', e.message); });

      try {
        localStorage.removeItem('cana_wants_review');
        localStorage.removeItem('cana_tier');
      } catch (e) {}
      pollJobStatus(data.jobId);
    } catch (e) {
      showState('form');
      alert('Could not finish after payment: ' + e.message + '. Please contact hello@getcana.co.uk');
    }
  }

  // ── ONE shared Supabase client for the whole page (kills the
  //    'Multiple GoTrueClient instances' warning and repeated setup cost) ──
  function sharedSb() {
    if (window._sbShared) return window._sbShared;
    if (!window.supabase) return null;
    window._sbShared = window.supabase.createClient(
      'https://igpjfpncfuawikoyzfcd.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA'
    );
    return window._sbShared;
  }

  // Session fetched once per page, cached promise reused everywhere
  function getAuthSession() {
    if (window._sessPromise) return window._sessPromise;
    window._sessPromise = (async function() {
      try {
        var sb = sharedSb();
        if (!sb) return null;
        var sess = await sb.auth.getSession();
        if (sess.data && sess.data.session) {
          window._sessEmail = (sess.data.session.user.email || '').toLowerCase();
          return { email: window._sessEmail, token: sess.data.session.access_token, userId: sess.data.session.user.id };
        }
      } catch (e) {}
      return null;
    })();
    return window._sessPromise;
  }

  // Live check as the person leaves the email field.
  // Member + signed in with that email  -> green badge, bypass armed.
  // Member but NOT signed in as them    -> amber prompt to sign in. No access.
  function renderEmailBadge(badge, state, email) {
    if (!badge || !state) return;
    var signedInAs = window._sessEmail && window._sessEmail === email;
    if (state.member && state.verified) {
      badge.style.background = '#f0fdf4'; badge.style.borderColor = '#bbf7d0'; badge.style.color = '#166534';
      badge.innerHTML = '✓ Cana Membership recognised, unlimited bidding active. No payment step for you.';
      badge.style.display = 'block';
    } else if (state.member && !state.verified) {
      badge.style.background = '#fffbeb'; badge.style.borderColor = '#fde68a'; badge.style.color = '#92400e';
      badge.innerHTML = 'This email has a Cana Membership. <a href="/login.html" target="_blank" style="color:#92400e;font-weight:700;">Sign in</a> to unlock unlimited bidding, then <a href="#" onclick="canaEmailCheck(document.getElementById(\'f-email\').value); return false;" style="color:#92400e;font-weight:700;">check again</a>.';
      badge.style.display = 'block';
    } else if (signedInAs) {
      badge.style.background = '#eff6ff'; badge.style.borderColor = '#bfdbfe'; badge.style.color = '#1e40af';
      badge.innerHTML = '✓ Signed in as ' + email + '. Your details are saved for this bid.';
      badge.style.display = 'block';
    } else if (state.has_account) {
      badge.style.background = '#eff6ff'; badge.style.borderColor = '#bfdbfe'; badge.style.color = '#1e40af';
      badge.innerHTML = 'You have a Cana account. <a href="/login.html" target="_blank" style="color:#1e40af;font-weight:700;">Sign in</a> to use your saved details, then <a href="#" onclick="canaEmailCheck(document.getElementById(\'f-email\').value); return false;" style="color:#1e40af;font-weight:700;">check again</a>.';
      badge.style.display = 'block';
    }
  }

  window.canaEmailCheck = function(val) {
    var badge = document.getElementById('member-badge');
    if (badge) badge.style.display = 'none';
    var email = (val || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 1) return;

    // Instant, no server call: if you're signed in as this email, greet now
    if (window._sessEmail && window._sessEmail === email) {
      renderEmailBadge(badge, { member: false, verified: false, has_account: true, signedIn: true }, email);
    }

    // Instant: if we already have this email cached, render immediately
    try {
      var cachedRaw = sessionStorage.getItem('cana_member_' + email);
      if (cachedRaw) {
        var cd = JSON.parse(cachedRaw);
        if (Date.now() - cd.ts < 10 * 60 * 1000) {
          var sInAs = window._sessEmail && window._sessEmail === email;
          renderEmailBadge(badge, { member: cd.member, verified: sInAs && cd.member, has_account: cd.has_account }, email);
        }
      }
    } catch(e) {}

    checkMembership(email).then(function(state) {
      renderEmailBadge(badge, state, email);
    });
  };

  // ── Membership: unlimited only for a signed-in account that owns the email ──
  async function checkMembership(email) {
    window._isMember = false;
    window._authToken = null;
    if (!email) return { member: false, verified: false };
    var member = false;
    var cacheKey = 'cana_member_' + email.toLowerCase();
    // Always fetch fresh so the tier and term are current: a cached value went
    // stale right after an upgrade (e.g. Silver still showing as Bronze). The
    // cache is only a fallback if the network call fails.
    try {
      var res = await fetch('/.netlify/functions/check-membership?email=' + encodeURIComponent(email));
      var data = await res.json();
      member = !!data.member;
      window._memberMeta = { member: member, has_account: !!data.has_account, term_months: data.term_months, current_period_end: data.current_period_end, ts: Date.now() };
      try { sessionStorage.setItem(cacheKey, JSON.stringify(window._memberMeta)); } catch(e2) {}
    } catch (e) {
      try {
        var c = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
        if (c) { member = !!c.member; window._memberMeta = c; }
      } catch (e3) {}
    }

    var verified = false;
    if (member) {
      var sess = await getAuthSession();
      if (sess && sess.email === email.toLowerCase()) {
        verified = true;
        window._isMember = true;
        window._authToken = sess.token;
      }
    }
    if (window._isMember && typeof window.applyMemberPaywall === 'function') window.applyMemberPaywall();
    var meta = window._memberMeta || {};
    return {
      member: member,
      verified: verified,
      has_account: !!meta.has_account,
      term_months: meta.term_months || null,       // needed for the tier (was missing -> always Bronze)
      current_period_end: meta.current_period_end || null
    };
  }

  window.applyMemberPaywall = function() {
    if (!window._isMember) return;
    var btn = document.getElementById('paywall-btn');
    if (btn) {
      btn.textContent = 'Generate now, included in your membership';
      btn.onclick = memberStartFlow;
    }
    var amt = document.querySelector('.paywall-price-amount');
    var lbl = document.querySelector('.paywall-price-label');
    if (amt) amt.textContent = 'Included';
    if (lbl) lbl.textContent = 'with your Cana Membership';
  };

  async function memberStartFlow() {
    var btn = document.getElementById('paywall-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }
    try {
      var co = window._companyDetails || {};
      var chData = window._chData || {};
      var mergedCo = Object.assign({}, co, {
        name: co.name || chData.company_name || '',
        company_name: co.name || chData.company_name || '',
        chData: chData
      });

      // Paid add-on chosen: take payment FIRST. Nothing is generated and no
      // email goes out until Stripe confirms. Generation happens on return.
      if (window._wantsExpertReview) {
        if (await startMemberAddonPayment(mergedCo)) return;
      }

      var res = await fetch('/.netlify/functions/member-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId: tenderId,
          includeSq: false, // SQ auto-fill paused for launch - see SQ_FEATURE_PAUSED note
          companyDetails: mergedCo,
          accessToken: window._authToken || '',
          wantsReview: false
        })
      });
      var data = await res.json();
      if (!res.ok || !data.member) throw new Error(data.error || 'Membership could not be verified');

      // No add-on: the base bid is included in membership, generate now.
      showProcessingScreen(data.jobId, data.email);
      fetch('/.netlify/functions/generate-cana-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: data.jobId,
          tenderId: data.tenderId || tenderId,
          sessionId: 'member_' + data.jobId,
          wantsReview: false,
          tier: 'none',
          includeSq: data.includeSq,
          companyDetails: data.companyDetails || mergedCo
        })
      }).catch(function(e){ console.error('Background trigger failed:', e.message); });
      pollJobStatus(data.jobId);
    } catch (e) {
      alert('Could not start: ' + e.message);
      if (btn) { btn.disabled = false; window.applyMemberPaywall(); }
    }
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
        dropdown.innerHTML = '<div style="padding:12px 16px;font-size:0.83rem;color:#9ca3af;">No companies found, try a different name or number</div>';
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
      dropdown.innerHTML = '<div style="padding:12px 16px;font-size:0.83rem;color:#c53030;">Search failed, try again</div>';
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
      { label:'Directors',        value: data.officers && data.officers.length ? data.officers[0].name : '-' }
    ];
    document.getElementById('ch-result-grid-cana').innerHTML = fields.map(function(f){
      return '<div style="background:#fff;border-radius:7px;padding:8px 10px;">' +
        '<div style="font-size:0.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">' + f.label + '</div>' +
        '<div style="font-size:0.82rem;font-weight:600;color:#166534;">' + escapeHtml(f.value||'-') + '</div>' +
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
      if (btn) { btn.disabled = false; btn.textContent = 'Next step'; }
      populateSqStep().catch(function(e){ console.warn('SQ populate warning:', e.message); });
    } catch(err) {
      console.error('canaChContinue error:', err.message);
      // Force show SQ anyway
      try { setStep(3); showState('sq'); } catch(e2) {}
    }

    // Save profile in background, fire and forget
    if (window.supabase && window._chData) {
      try {
        var sbClient = sharedSb();
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