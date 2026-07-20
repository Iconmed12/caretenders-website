const SUPABASE_URL  = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var currentUser  = null;
var currentProfile = null;
var chResult     = null;

function showError(msg) {
  var el = document.getElementById('error-alert');
  el.textContent = msg;
  el.classList.add('show');
}
function clearError() {
  document.getElementById('error-alert').classList.remove('show');
}

async function lookupCompany() {
  clearError();
  var num = document.getElementById('ch-input').value.trim().replace(/\s/g,'');
  if (!num) { showError('Please enter your Companies House number'); return; }
  if (!/^\d{6,8}$/.test(num) && !/^[A-Z]{2}\d{6}$/.test(num)) {
    showError('Please enter a valid Companies House number (e.g. 12345678)');
    document.getElementById('ch-input').classList.add('error');
    return;
  }
  document.getElementById('ch-input').classList.remove('error');

  var btn = document.getElementById('lookup-btn');
  btn.disabled = true; btn.textContent = 'Looking up...';

  try {
    var res = await fetch('/.netlify/functions/companies-house-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyNumber: num })
    });
    var data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Company not found');

    chResult = data;
    renderResult(data);

  } catch(err) {
    showError(err.message || 'Could not find company. Please check the number and try again.');
  }
  btn.disabled = false; btn.textContent = 'Look up';
}

function renderResult(data) {
  // Company name and status
  document.getElementById('result-name').textContent = data.company_name;
  var statusText = data.company_status
    ? data.company_status.charAt(0).toUpperCase() + data.company_status.slice(1)
    : '';
  document.getElementById('result-status').textContent =
    '● ' + statusText + (data.date_of_creation ? ' · Incorporated ' + formatDate(data.date_of_creation) : '');

  // Detail grid
  var fields = [
    { label: 'Company number',  value: data.company_number },
    { label: 'Company type',    value: formatType(data.company_type) },
    { label: 'Registered address', value: data.registered_address },
    { label: 'SIC codes',       value: data.sic_codes || '-' },
    { label: 'Directors',       value: data.officers && data.officers.length
        ? data.officers.slice(0,3).map(function(o){ return o.name; }).join(', ')
        : '-' },
    { label: 'PSC',             value: data.pscs && data.pscs.length
        ? data.pscs[0].name
        : '-' }
  ];

  document.getElementById('result-grid').innerHTML = fields.map(function(f) {
    return '<div class="result-field">' +
      '<div class="result-field-label">' + f.label + '</div>' +
      '<div class="result-field-value">' + (f.value || '-') + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('result-card').classList.add('show');
  document.getElementById('still-needed').classList.add('show');
  document.getElementById('save-btn').classList.add('show');
  document.getElementById('skip-btn').classList.add('show');
}

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
  catch(e) { return d; }
}

function formatType(t) {
  if (!t) return '-';
  return t.replace(/-/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
}

async function saveAndContinue() {
  if (!chResult) return;
  var btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    // Build profile update from CH data
    var profileUpdate = {
      user_id:            currentUser.id,
      company_name:       chResult.company_name,
      company_number:     chResult.company_number,
      registered_address: chResult.registered_address,
      company_type:       formatType(chResult.company_type),
      founded_year:       chResult.date_of_creation ? chResult.date_of_creation.split('-')[0] : null,
      updated_at:         new Date().toISOString()
    };

    // Add directors if available
    if (chResult.officers && chResult.officers.length) {
      profileUpdate.directors = chResult.officers
        .filter(function(o){ return !o.resigned_on; })
        .map(function(o){ return o.name + ' (' + o.role + ')'; })
        .join(', ');
    }

    // Store full CH data for SQ auto-fill
    profileUpdate.ch_data = JSON.stringify(chResult);

    var { error } = await sb.from('company_profiles')
      .upsert(profileUpdate, { onConflict: 'user_id' });
    if (error) throw error;

    window.location.href = '/sq-assist.html';

  } catch(err) {
    showError('Save failed: ' + (err.message || 'Please try again'));
    btn.disabled = false; btn.textContent = 'Save & continue to SQ Assist';
  }
}

function skipToSq() {
  window.location.href = '/sq-assist.html';
}

async function handleSignOut() {
  await sb.auth.signOut();
  window.location.href = '/';
}

async function init() {
  var { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = '/login.html?redirect=/ch-onboarding.html'; return; }
  currentUser = session.user;

  var meta = session.user.user_metadata || {};
  var initials = ((meta.first_name||'?')[0]+(meta.last_name||'?')[0]).toUpperCase();
  document.getElementById('nav-avatar').textContent = initials;
  document.getElementById('nav-name').textContent = (meta.first_name||'')+' '+(meta.last_name||'');

  // Load existing profile
  var { data: profile } = await sb.from('company_profiles')
    .select('*').eq('user_id', currentUser.id).single();
  currentProfile = profile;

  // If they already have a CH number stored, pre-fill the input
  if (profile && profile.company_number) {
    document.getElementById('ch-input').value = profile.company_number;
  }

  // If they already have full CH data stored AND have been through this before, go straight to SQ Assist
  if (profile && profile.company_number && profile.ch_data) {
    window.location.href = '/sq-assist.html';
    return;
  }

  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('main-page').style.display = 'flex';

  // Show skip button straight away
  document.getElementById('skip-btn').classList.add('show');
}

init();
