
const SUPABASE_URL  = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var currentUser = null;
var profile = {};
var chData = null;
var allTenders = [];
var currentTender = null;
var fieldValues = {};
var declarations = {};

function showState(name) {
  document.querySelectorAll('.sq-state').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById('state-' + name).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── LOOKUP ──
async function lookupCompany() {
  document.getElementById('lookup-error').classList.remove('show');
  var num = document.getElementById('ch-input').value.trim().replace(/\s/g,'');
  if (!num) { showError('lookup-error', 'Please enter your Companies House number'); return; }
  var btn = document.getElementById('lookup-btn');
  btn.disabled = true; btn.textContent = 'Looking up...';
  try {
    var res = await fetch('/.netlify/functions/companies-house-lookup', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ companyNumber: num })
    });
    var data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Company not found');
    chData = data;
    renderLookupResult(data);
  } catch(err) {
    showError('lookup-error', err.message || 'Could not find company. Check the number and try again.');
  }
  btn.disabled = false; btn.textContent = 'Look up →';
}

function renderLookupResult(data) {
  document.getElementById('result-name').textContent = data.company_name;
  document.getElementById('result-status').textContent = '● ' + (data.company_status||'') +
    (data.date_of_creation ? ' · Incorporated ' + formatDate(data.date_of_creation) : '');
  var fields = [
    { label:'Company number',    value: data.company_number },
    { label:'Company type',      value: formatType(data.company_type) },
    { label:'Registered address',value: data.registered_address },
    { label:'Directors',         value: data.officers && data.officers.length ? data.officers.slice(0,2).map(function(o){ return o.name; }).join(', ') : '—' }
  ];
  document.getElementById('result-grid').innerHTML = fields.map(function(f) {
    return '<div class="result-field"><div class="result-field-label">'+f.label+'</div><div class="result-field-value">'+(f.value||'—')+'</div></div>';
  }).join('');
  document.getElementById('result-card').classList.add('show');
  document.getElementById('lookup-continue-btn').classList.add('show');
  document.getElementById('skip-lookup-btn').classList.add('show');
}

async function saveLookupAndContinue() {
  if (!chData) return;
  var btn = document.getElementById('lookup-continue-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    var update = {
      user_id: currentUser.id,
      company_name: chData.company_name,
      company_number: chData.company_number,
      registered_address: chData.registered_address,
      company_type: formatType(chData.company_type),
      founded_year: chData.date_of_creation ? chData.date_of_creation.split('-')[0] : null,
      directors: chData.officers ? chData.officers.filter(function(o){return !o.resigned_on;}).map(function(o){return o.name+' ('+o.role+')';}).join(', ') : null,
      ch_data: JSON.stringify(chData),
      updated_at: new Date().toISOString()
    };
    var { error } = await sb.from('company_profiles').upsert(update, { onConflict: 'user_id' });
    if (error) throw error;
    profile = { ...profile, ...update };
    showState('tender');
  } catch(err) {
    showError('lookup-error', 'Save failed: ' + (err.message||'Please try again'));
  }
  btn.disabled = false; btn.textContent = 'Continue to select tender →';
}

function skipLookup() { showState('tender'); }

// ── TENDER ──
async function loadTenders() {
  var res = await fetch('/api/get-tenders').catch(function(){ return fetch('/.netlify/functions/get-tenders'); });
  var data = await res.json().catch(function(){ return []; });
  allTenders = Array.isArray(data) ? data : [];
  var sel = document.getElementById('tender-select');
  sel.innerHTML = '<option value="">Choose a tender...</option>';
  allTenders.filter(function(t){ return t.status !== 'draft'; }).forEach(function(t) {
    var hasSq = !!(t.sq_data && t.sq_data.sections && t.sq_data.sections.length);
    var opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = (hasSq ? '✓ ' : '') + t.title + (t.org ? ' — ' + t.org : '');
    sel.appendChild(opt);
  });
}

function continueToSq() {
  var id = document.getElementById('tender-select').value;
  if (!id) { showError('tender-error', 'Please select a tender'); return; }
  var t = allTenders.find(function(x){ return x.id === id; });
  if (!t) return;
  if (!t.sq_data || !t.sq_data.sections || !t.sq_data.sections.length) {
    document.getElementById('no-sq-warning').style.display = 'block'; return;
  }
  document.getElementById('no-sq-warning').style.display = 'none';
  currentTender = t;
  renderSq(t.sq_data);
  showState('sq');
}

// ── SQ RENDER ──
function getProfileValue(key) {
  var ch = chData || (profile.ch_data ? tryParse(profile.ch_data) : null);
  var map = {
    company_name:       profile.company_name || (ch && ch.company_name),
    company_number:     profile.company_number || (ch && ch.company_number),
    registered_address: profile.registered_address || (ch && ch.registered_address),
    vat_number:         profile.vat_number,
    company_type:       profile.company_type || (ch && formatType(ch.company_type)),
    founded_year:       profile.founded_year || (ch && ch.date_of_creation && ch.date_of_creation.split('-')[0]),
    cqc_status:         profile.cqc_status,
    cqc_provider_id:    profile.cqc_provider_id,
    contact_name:       (profile.contact_first_name||'') + ' ' + (profile.contact_last_name||''),
    sme_status:         parseInt(profile.total_staff||'0') < 250 ? 'Yes' : 'No',
    directors:          profile.directors || (ch && ch.officers && ch.officers.length ? ch.officers.slice(0,3).map(function(o){return o.name;}).join(', ') : null),
    psc_details:        ch && ch.pscs && ch.pscs.length ? ch.pscs[0].name + ' — ' + ch.pscs[0].nature_of_control : null,
    services:           profile.services,
    experience:         profile.experience,
    accreditations:     profile.accreditations,
    insurance_employers:'Yes',
    insurance_public:   'Yes',
    gdpr_policy:        'Yes',
    ico_number:         profile.ico_number,
    regulated_activities:profile.regulated_activities
  };
  return map[key] || null;
}

function tryParse(s) { try { return JSON.parse(s); } catch(e) { return null; } }

function renderSq(sqData) {
  document.getElementById('sq-tender-name').textContent = currentTender.title + (currentTender.org ? ' — ' + currentTender.org : '');
  var sections = sqData.sections || [];
  var autoCount = 0, total = 0, gaps = [];
  var html = '';

  sections.forEach(function(section) {
    var fields = section.fields || [];
    if (!fields.length) return;

    var isDecl = fields.every(function(f){ return f.field_type === 'client_confirm'; });

    html += '<div class="sq-section">';
    html += '<div class="sq-section-head">';
    html += '<div class="sq-section-title">' + section.section + ': ' + section.title + '</div>';

    if (isDecl) {
      html += '<span class="sq-section-badge" style="background:rgba(245,166,35,0.1);color:#92400e;">Declarations</span>';
    } else {
      var auto = fields.filter(function(f){ return f.field_type==='auto_fill' && getProfileValue(f.profile_key); }).length;
      html += '<span class="sq-section-badge" style="background:rgba(56,161,105,0.1);color:#276749;">' + auto + '/' + fields.length + ' auto-filled</span>';
    }
    html += '</div>';

    if (isDecl) {
      html += '<div style="background:#fffbeb;padding:0.5rem 0;">';
      fields.forEach(function(f) {
        total++;
        html += '<div class="decl-row">' +
          '<input type="checkbox" id="decl-' + f.id + '" onchange="declarations[\'' + f.id + '\']=this.checked;updateProgress()">' +
          '<label for="decl-' + f.id + '">' + f.question + '</label>' +
          '</div>';
      });
      html += '</div>';
    } else {
      fields.forEach(function(f) {
        total++;
        var value = null;
        if (f.field_type === 'auto_fill') {
          value = getProfileValue(f.profile_key);
          if (value) autoCount++;
          else gaps.push(f.question);
        }

        html += '<div class="sq-field">';
        html += '<div><div class="sq-field-label">' + (f.id ? '<span style="color:var(--muted);font-weight:400;">' + f.id + ' </span>' : '') + f.question + '</div>';
        if (f.hint) html += '<div class="sq-field-hint">' + f.hint + '</div>';
        html += '</div>';
        html += '<div>';

        if (f.field_type === 'auto_fill') {
          if (value) {
            html += '<div style="display:flex;align-items:flex-start;gap:5px;"><span style="color:var(--success);flex-shrink:0;">✓</span><span class="sq-field-value">' + value + '</span></div>';
          } else {
            html += '<span class="sq-field-missing">Missing — <a href="/profile.html" style="color:var(--error);">add to profile</a></span>';
          }
        } else if (f.field_type === 'ai_draft') {
          html += '<textarea class="sq-field-textarea" id="ai-' + f.id + '" placeholder="AI will draft this..." onchange="fieldValues[\'' + f.id + '\']=this.value"></textarea>';
        }

        html += '</div></div>';
      });
    }
    html += '</div>';
  });

  document.getElementById('sq-sections').innerHTML = html;

  // Gap box
  if (gaps.length) {
    document.getElementById('gap-box').style.display = 'block';
    document.getElementById('gap-list').innerHTML = gaps.slice(0,5).map(function(g){ return '<div>⚠ ' + g + '</div>'; }).join('') +
      (gaps.length > 5 ? '<div>...and ' + (gaps.length-5) + ' more</div>' : '');
  }

  updateProgress();
}

function updateProgress() {
  if (!currentTender || !currentTender.sq_data) return;
  var sections = currentTender.sq_data.sections || [];
  var total = 0, done = 0;
  sections.forEach(function(s) {
    (s.fields||[]).forEach(function(f) {
      total++;
      if (f.field_type === 'auto_fill' && getProfileValue(f.profile_key)) done++;
      else if (f.field_type === 'client_confirm' && declarations[f.id]) done++;
      else if (f.field_type === 'ai_draft' && fieldValues[f.id]) done++;
    });
  });
  var pct = total > 0 ? Math.round((done/total)*100) : 0;
  document.getElementById('sq-progress-fill').style.width = pct + '%';
  document.getElementById('sq-progress-pct').textContent = pct + '%';
}

async function generateSq() {
  if (!currentTender) return;
  var btn = document.getElementById('generate-sq-btn');
  btn.disabled = true; btn.textContent = 'Generating...';

  try {
    // AI draft written sections first
    var aiFields = [];
    (currentTender.sq_data.sections||[]).forEach(function(s) {
      (s.fields||[]).forEach(function(f) {
        if (f.field_type === 'ai_draft' && !fieldValues[f.id]) aiFields.push({ id: f.id, question: f.question });
      });
    });

    if (aiFields.length) {
      btn.textContent = 'AI drafting written sections...';
      var draftRes = await fetch('/.netlify/functions/complete-sq', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ sqData: currentTender.sq_data, profile: profile, chData: chData })
      });
      if (draftRes.ok) {
        var draftData = await draftRes.json();
        if (draftData.draftedFields) {
          Object.keys(draftData.draftedFields).forEach(function(id) {
            fieldValues[id] = draftData.draftedFields[id];
            var el = document.getElementById('ai-' + id);
            if (el) el.value = draftData.draftedFields[id];
          });
        }
      }
    }

    // Fill the document if we have the original
    if (currentTender.sq_data.storagePath) {
      btn.textContent = 'Filling document...';
      var fillRes = await fetch('/.netlify/functions/fill-sq-doc', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          tenderId: currentTender.id,
          companyDetails: buildCoDetails(),
          sqAnswers: fieldValues,
          sqData: currentTender.sq_data
        })
      });
      if (fillRes.ok) {
        var fillData = await fillRes.json();
        if (fillData.docBase64) {
          // Trigger download
          var link = document.createElement('a');
          link.href = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + fillData.docBase64;
          link.download = fillData.fileName || 'SQ_Completed.docx';
          link.click();
        }
      }
    }

    btn.textContent = '✓ Done — check your downloads';
    setTimeout(function(){ btn.disabled = false; btn.textContent = '⚡ Generate & download completed SQ'; }, 4000);

  } catch(err) {
    btn.disabled = false; btn.textContent = '⚡ Generate & download completed SQ';
    alert('Error: ' + (err.message||'Please try again'));
  }
}

function buildCoDetails() {
  var ch = chData || tryParse(profile.ch_data);
  return {
    name: profile.company_name || (ch && ch.company_name) || '',
    company_number: profile.company_number || (ch && ch.company_number) || '',
    registered_address: profile.registered_address || (ch && ch.registered_address) || '',
    company_type: profile.company_type || '',
    cqc: profile.cqc_status || '',
    cqc_provider_id: profile.cqc_provider_id || '',
    founded: profile.founded_year || '',
    staff: profile.total_staff || '',
    services: profile.services || '',
    experience: profile.experience || '',
    accreditations: profile.accreditations || '',
    directors: profile.directors || (ch && ch.officers ? ch.officers.slice(0,3).map(function(o){return o.name;}).join(', ') : ''),
    psc_details: ch && ch.pscs && ch.pscs.length ? ch.pscs[0].name : '',
    ico_number: profile.ico_number || '',
    vat_number: profile.vat_number || ''
  };
}

function showError(id, msg) {
  var el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}
function formatDate(d) { try { return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); } catch(e){ return d; } }
function formatType(t) { if (!t) return '—'; return t.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();}); }
async function handleSignOut() { await sb.auth.signOut(); window.location.href = '/'; }

async function init() {
  var { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = '/login.html?redirect=/sq-assist.html'; return; }
  currentUser = session.user;

  var meta = session.user.user_metadata || {};
  document.getElementById('nav-avatar').textContent = ((meta.first_name||'?')[0]+(meta.last_name||'?')[0]).toUpperCase();
  document.getElementById('nav-name').textContent = (meta.first_name||'')+' '+(meta.last_name||'');

  var { data: p } = await sb.from('company_profiles').select('*').eq('user_id', currentUser.id).single();
  profile = p || {};

  // Load tenders
  await loadTenders();

  // If already has CH data, pre-fill and skip to tender step
  if (profile.ch_data) {
    try {
      chData = JSON.parse(profile.ch_data);
      document.getElementById('ch-input').value = profile.company_number || '';
      renderLookupResult(chData);
      // Auto-advance to tender selection
      showState('tender');
    } catch(e) {}
  }

  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('main-page').style.display = 'flex';
}

init();
