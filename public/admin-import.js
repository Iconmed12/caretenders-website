// ── Tender Import globals ──
var tiAllTenders = [];
var tiCurrentFilter = 'pending_review';
var SUPABASE_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';

async function sbFetch(path, opts) {
  var res = await fetch(SUPABASE_URL + path, Object.assign({
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }
  }, opts || {}));
  return res;
}

// ── Fine subcategory classification (client-side, from title + description) ──
// Broad category stays care/commercial in the data; this is display-only for the breakdown.
var TI_SUBCATS = [
  { key:'care',        label:'Care',         icon:'ti-heart',             color:'#1D9E75', kws:['care','social care','domiciliary','residential','nursing','supported living','mental health','learning disabilit','older people','cqc','personal care','home care','homecare','extra care','respite','reablement','care home','foster'] },
  { key:'cleaning',    label:'Cleaning',     icon:'ti-spray',             color:'#0F6E56', kws:['cleaning','janitorial','custodial'] },
  { key:'construction',label:'Construction', icon:'ti-tools',             color:'#BA7517', kws:['construction','building works','refurbishment','new build','demolition','civil engineering'] },
  { key:'facilities',  label:'Facilities',   icon:'ti-building-warehouse', color:'#534AB7', kws:['facilities','facilities management','grounds','caretaking','building maintenance','maintenance','fm '] },
  { key:'it',          label:'IT & digital', icon:'ti-device-laptop',     color:'#185FA5', kws:['software','digital','technology','ict','cyber','cloud','infrastructure','data '] },
  { key:'transport',   label:'Transport',    icon:'ti-truck',             color:'#993C1D', kws:['transport','fleet','logistics','waste','recycling','passenger transport'] },
  { key:'security',    label:'Security',     icon:'ti-shield',            color:'#A32D2D', kws:['security','guarding','cctv'] },
  { key:'professional',label:'Professional', icon:'ti-briefcase',         color:'#888780', kws:['consultancy','advisory','professional services','training','recruitment','workforce','staffing'] },
  { key:'other',       label:'Other',        icon:'ti-dots',              color:'#888780', kws:[] }
];

function tiSubcat(t) {
  var text = ((t.title||'') + ' ' + (t.description||t.org||'')).toLowerCase();
  for (var i = 0; i < TI_SUBCATS.length; i++) {
    var s = TI_SUBCATS[i];
    if (s.kws.length && s.kws.some(function(kw){ return text.indexOf(kw) !== -1; })) return s.key;
  }
  return 'other';
}

function tiRenderBreakdown() {
  var host = document.getElementById('ti-breakdown');
  if (!host) return;
  var counts = {};
  TI_SUBCATS.forEach(function(s){ counts[s.key] = { waiting: 0, live: 0 }; });
  tiAllTenders.forEach(function(t){
    var k = tiSubcat(t);
    if (!counts[k]) counts[k] = { waiting: 0, live: 0 };
    if (t.status === 'pending_review') counts[k].waiting++;
    else if (t.status !== 'rejected') counts[k].live++;
  });
  var rows = TI_SUBCATS.filter(function(s){ return counts[s.key].waiting > 0 || counts[s.key].live > 0; });
  if (!rows.length) { host.innerHTML = ''; return; }
  host.innerHTML =
    '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 16px;">' +
      '<div style="font-size:0.78rem;color:var(--text-light);margin-bottom:12px;">How much is live vs still waiting in import</div>' +
      rows.map(function(s){
        var c = counts[s.key];
        var total = c.waiting + c.live;
        var pct = total ? Math.round((c.live / total) * 100) : 0;
        var active = window._tiSubFilter === s.key;
        var gap = (c.waiting >= 10 && c.live <= 1) ? ' <span style="background:#fee2e2;color:#991b1b;font-size:0.62rem;font-weight:700;padding:1px 7px;border-radius:999px;">gap</span>' : '';
        return '<button onclick="tiFilterBySub(\'' + s.key + '\')" style="display:block;width:100%;text-align:left;border:none;cursor:pointer;background:' + (active?'#f4f8ff':'none') + ';border-radius:7px;padding:8px 9px;margin-bottom:4px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;margin-bottom:5px;">' +
            '<span style="' + (active?'font-weight:700;':'') + 'color:var(--text);"><i class="ti ' + s.icon + '" style="font-size:13px;color:' + s.color + ';"></i> ' + s.label + gap + '</span>' +
            '<span style="color:var(--text-light);font-size:0.74rem;">' + c.live + ' live · ' + c.waiting + ' waiting</span>' +
          '</div>' +
          '<div style="height:7px;background:#eef1f5;border-radius:999px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:' + s.color + ';border-radius:999px;"></div></div>' +
        '</button>';
      }).join('') +
    '</div>';
}

function tiFilterBySub(key) {
  window._tiSubFilter = (window._tiSubFilter === key) ? '' : key;
  tiRender();
}


async function loadImportedTenders() {
  try {
    var res = await sbFetch('/rest/v1/tenders?source=in.(contracts_finder,find_a_tender)&select=*&order=created_at.desc&limit=200');
    var data = await res.json();
    tiAllTenders = Array.isArray(data) ? data : [];
    tiUpdateStats();
    tiRender();
    // Update nav badge
    var pending = tiAllTenders.filter(function(t){ return t.status === 'pending_review'; }).length;
    var badge = document.getElementById('sbImport');
    if (badge) badge.textContent = pending || 0;
  } catch(e) { console.log('loadImportedTenders error:', e.message); }
}

function tiUpdateStats() {
  var pending  = tiAllTenders.filter(function(t){ return t.status === 'pending_review'; }).length;
  var live     = tiAllTenders.filter(function(t){ return t.status === 'live' || t.status === 'needs_docs'; }).length;
  var rejected = tiAllTenders.filter(function(t){ return t.status === 'rejected'; }).length;
  var setEl = function(id, val) { var el = document.getElementById(id); if(el) el.textContent = val; };
  setEl('ti-count-pending',  pending);
  setEl('ti-count-live',     live);
  setEl('ti-count-rejected', rejected);
  setEl('ti-count-total',    tiAllTenders.length);
  tiPopulateYears();
}

function tiPopulateYears() {
  var sel = document.getElementById('ti-year-filter');
  if (!sel) return;
  var years = {};
  tiAllTenders.forEach(function(t){
    if (t.deadline) { var y = new Date(t.deadline).getFullYear(); if (!isNaN(y)) years[y] = true; }
  });
  var sorted = Object.keys(years).sort();
  var current = sel.value;
  sel.innerHTML = '<option value="">All years</option>' + sorted.map(function(y){ return '<option value="' + y + '">' + y + '</option>'; }).join('');
  if (current) sel.value = current;
}

function tiSetFilter(filter) {
  tiCurrentFilter = filter;
  document.querySelectorAll('.ti-tab').forEach(function(b){ b.classList.remove('active'); });
  var tab = document.getElementById('ti-tab-' + (filter === 'pending_review' ? 'pending' : filter));
  if (tab) tab.classList.add('active');
  tiRender();
}

function tiRender() {
  var search = (document.getElementById('ti-search') ? document.getElementById('ti-search').value : '').toLowerCase();
  var cat    = '';
  var year   = document.getElementById('ti-year-filter') ? document.getElementById('ti-year-filter').value : '';

  var filtered = tiAllTenders.filter(function(t) {
    if (tiCurrentFilter === 'live') {
      if (t.status === 'pending_review' || t.status === 'rejected') return false;
    } else if (tiCurrentFilter !== 'all' && t.status !== tiCurrentFilter) return false;
    if (cat && t.category !== cat) return false;
    if (year) {
      if (!t.deadline) return false;
      if (String(new Date(t.deadline).getFullYear()) !== year) return false;
    }
    if (window._tiSubFilter && tiSubcat(t) !== window._tiSubFilter) return false;
    if (search) {
      var text = ((t.title||'') + ' ' + (t.org||'') + ' ' + (t.buyer||'')).toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  var list  = document.getElementById('ti-list');
  var empty = document.getElementById('ti-empty');
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  list.onclick = function(e) {
    var ab = e.target.closest('[data-approve]');
    var rb = e.target.closest('[data-reject]');
    if (ab) tiApprove(ab.getAttribute('data-approve'));
    if (rb) tiReject(rb.getAttribute('data-reject'));
  };
  list.innerHTML = filtered.map(function(t) {
    var deadline    = t.deadline ? new Date(t.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '-';
    var subKey      = tiSubcat(t);
    var subMeta     = TI_SUBCATS.filter(function(s){ return s.key === subKey; })[0] || { label:'Other', color:'#888780', icon:'ti-dots' };
    var actions;
    if (t.status === 'pending_review') {
      actions = '<button data-approve="' + t.id + '" style="background:#166534;color:#fff;border:none;padding:6px 13px;border-radius:7px;font-size:0.78rem;font-weight:600;cursor:pointer;">Approve</button>' +
                '<button data-reject="' + t.id + '" style="background:#fff;color:#dc2626;border:1px solid #fca5a5;padding:6px 13px;border-radius:7px;font-size:0.78rem;cursor:pointer;">Reject</button>';
    } else if (t.status === 'rejected') {
      actions = '<button data-approve="' + t.id + '" style="background:#e8f7ee;color:#166534;border:1px solid #9FE1CB;padding:6px 13px;border-radius:7px;font-size:0.78rem;cursor:pointer;">Re-approve</button>';
    } else {
      actions = '<button data-reject="' + t.id + '" style="background:#fff;color:#dc2626;border:1px solid #fca5a5;padding:6px 13px;border-radius:7px;font-size:0.78rem;cursor:pointer;">Remove</button>';
    }
    var statusPill = t.status === 'pending_review' ? '<span style="background:#fefce8;color:#92400e;font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:999px;">Pending</span>'
                   : t.status === 'rejected' ? '<span style="background:#fef2f2;color:#dc2626;font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:999px;">Rejected</span>'
                   : '<span style="background:#e8f7ee;color:#166534;font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:999px;">Live</span>';
    var link = t.source_url ? '<a href="' + t.source_url + '" target="_blank" style="background:#f3f4f6;color:#374151;font-size:0.7rem;font-weight:600;padding:2px 8px;border-radius:999px;text-decoration:none;">' + (t.source === 'find_a_tender' ? 'View on FAT ↗' : 'View on CF ↗') + '</a>' : '';

    return '<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:15px 17px;">' +
      '<div style="display:flex;align-items:flex-start;gap:12px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:0.88rem;color:var(--navy);margin-bottom:3px;">' + (t.title||'') + '</div>' +
          '<div style="font-size:0.76rem;color:var(--muted);margin-bottom:8px;">' + (t.buyer||t.org||'') + (t.value ? ' · ' + t.value : '') + ' · Deadline ' + deadline + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
            '<span style="display:inline-flex;align-items:center;gap:4px;background:#f4f6f9;color:' + subMeta.color + ';font-size:0.7rem;font-weight:600;padding:2px 9px;border-radius:999px;"><i class="ti ' + subMeta.icon + '" style="font-size:12px;"></i>' + subMeta.label + '</span>' +
            link +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">' +
          statusPill +
          '<div style="display:flex;gap:6px;">' + actions + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function catBg(cat) { return cat === 'care' ? '#e0f2fe' : '#fef3c7'; }
function catCol(cat) { return cat === 'care' ? '#0369a1' : '#92400e'; }

var tiPendingApproveId = null;

function tiApprove(id) {
  tiPendingApproveId = id;
  var t = tiAllTenders.find(function(x){ return x.id === id; });
  var modal = document.getElementById('ti-approve-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ti-approve-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,42,30,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:480px;width:100%;padding:28px;box-shadow:0 24px 64px rgba(0,0,0,0.3);">' +
        '<div style="font-size:1.25rem;font-weight:800;color:#0a2a1e;margin-bottom:10px;">&#x26A0;&#xFE0F; Before you approve&hellip;</div>' +
        '<p style="font-size:0.95rem;color:#374151;line-height:1.55;margin-bottom:14px;">Have you got <strong>all the following documents</strong> ready to upload for this tender to go live?</p>' +
        '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin-bottom:18px;">' +
          '<div style="font-weight:700;font-size:0.9rem;color:#166534;padding:4px 0;">&#x1F4C4; ITT (Invitation to Tender)</div>' +
          '<div style="font-weight:700;font-size:0.9rem;color:#166534;padding:4px 0;">&#x1F4CB; Service specification(s)</div>' +
          '<div style="font-weight:700;font-size:0.9rem;color:#166534;padding:4px 0;">&#x2753; Quality questions</div>' +
          '<div style="font-weight:700;font-size:0.9rem;color:#166534;padding:4px 0;">&#x1F3AF; Scoring criteria</div>' +
        '</div>' +
        '<p style="font-size:0.82rem;color:#6b7280;margin-bottom:18px;">The tender will sit in <strong>Cana AI &rarr; Needs attention</strong> until every document is uploaded and you set it live.</p>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
          '<button id="ti-approve-cancel" style="background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:0.88rem;">Not yet</button>' +
          '<button id="ti-approve-confirm" style="background:#166534;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:0.88rem;">&#x2713; Yes &mdash; approve</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('ti-approve-cancel').onclick = function() { modal.style.display = 'none'; tiPendingApproveId = null; };
    document.getElementById('ti-approve-confirm').onclick = function() {
      modal.style.display = 'none';
      if (tiPendingApproveId) tiDoApprove(tiPendingApproveId);
      tiPendingApproveId = null;
    };
    modal.onclick = function(e) { if (e.target === modal) { modal.style.display = 'none'; tiPendingApproveId = null; } };
  } else {
    modal.style.display = 'flex';
  }
}

async function tiDoApprove(id) {
  try {
    var res = await sbFetch('/rest/v1/tenders?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'needs_docs' })
    });
    if (!res.ok) {
      var errTxt = await res.text();
      throw new Error('DB update failed (' + res.status + '): ' + errTxt.substring(0, 120));
    }
    tiAllTenders = tiAllTenders.map(function(t){ return t.id === id ? Object.assign({},t,{status:'needs_docs'}) : t; });
    tiUpdateStats(); tiRender();
    // Refresh the Cana AI panels so it appears in Needs Attention immediately
    if (typeof loadTenders === 'function') {
      await loadTenders();
      if (typeof renderCanaPanels === 'function') renderCanaPanels();
      if (typeof populateCanaTenderSelect === 'function') populateCanaTenderSelect();
    }
    showToast('Approved: upload documents in the Cana section, then set live', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function tiReject(id) {
  try {
    await sbFetch('/rest/v1/tenders?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' })
    });
    tiAllTenders = tiAllTenders.map(function(t){ return t.id === id ? Object.assign({},t,{status:'rejected'}) : t; });
    tiUpdateStats(); tiRender();
    showToast('Tender rejected', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function runManualImport() {
  var btn    = document.getElementById('ti-import-btn');
  var status = document.getElementById('ti-import-status');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Importing...'; }
  if (status) status.textContent = 'Fetching from Contracts Finder and Find a Tender...';

  try {
    var res  = await fetch('/.netlify/functions/import-tenders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: 3 })
    });
    var data = await res.json();
    if (status) status.textContent = '✓ Imported ' + (data.imported||0) + ' new · ' + (data.skipped||0) + ' already existed';
    showToast('Imported ' + (data.imported||0) + ' new tenders', 'success');
    await loadImportedTenders();
  } catch(e) {
    if (status) status.textContent = '✗ Import failed: ' + e.message;
    showToast('Import failed', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Import Now'; }
  }
}


// Update sidebar badge on admin load (not just when page opened)
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(async function() {
    try {
      var res = await sbFetch('/rest/v1/tenders?source=in.(contracts_finder,find_a_tender)&status=eq.pending_review&select=id');
      var data = await res.json();
      var badge = document.getElementById('sbImport');
      if (badge && Array.isArray(data)) badge.textContent = data.length;
    } catch(e) {}
  }, 800);
});
