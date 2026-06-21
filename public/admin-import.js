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
    else if (t.status === 'live' || t.status === 'needs_docs') counts[k].live++;
  });
  var rows = TI_SUBCATS.filter(function(s){ return counts[s.key].waiting > 0 || counts[s.key].live > 0; });
  if (!rows.length) { host.innerHTML = ''; return; }
  host.innerHTML = '<div style="font-size:0.8rem;color:var(--text-light);margin:0 0 8px;">By category, waiting in import vs live on site</div>' +
    '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:1.25rem;">' +
    rows.map(function(s){
      var c = counts[s.key];
      var active = window._tiSubFilter === s.key;
      var gap = (c.waiting >= 10 && c.live <= 1)
        ? '<span style="background:#fee2e2;color:#991b1b;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:999px;">Big gap</span>' : '';
      return '<button onclick="tiFilterBySub(\'' + s.key + '\')" style="text-align:left;background:' + (active?'#eef6ff':'#fff') + ';border:1px solid ' + (active?'#90c2f0':'var(--border)') + ';border-radius:8px;padding:9px 13px;display:flex;align-items:center;gap:11px;cursor:pointer;">' +
        '<i class="ti ' + s.icon + '" style="font-size:16px;color:' + s.color + ';width:18px;"></i>' +
        '<span style="flex:1;font-size:0.82rem;font-weight:600;color:var(--text);">' + s.label + '</span>' +
        '<span style="font-size:0.8rem;color:var(--text-light);"><strong style="color:var(--text);">' + c.waiting + '</strong> waiting</span>' +
        '<span style="font-size:0.8rem;color:var(--text-light);"><strong style="color:var(--text);">' + c.live + '</strong> live</span>' +
        gap +
      '</button>';
    }).join('') + '</div>';
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
  tiRenderBreakdown();
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
  var cat    = document.getElementById('ti-cat-filter') ? document.getElementById('ti-cat-filter').value : '';

  var filtered = tiAllTenders.filter(function(t) {
    if (tiCurrentFilter === 'live') {
      if (t.status !== 'live' && t.status !== 'needs_docs') return false;
    } else if (tiCurrentFilter !== 'all' && t.status !== tiCurrentFilter) return false;
    if (cat && t.category !== cat) return false;
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
    var statusColor = t.status === 'live' ? '#166534' : t.status === 'needs_docs' ? '#0369a1' : t.status === 'rejected' ? '#dc2626' : '#92400e';
    var statusBg    = t.status === 'live' ? '#e8f7ee' : t.status === 'needs_docs' ? '#e0f2fe' : t.status === 'rejected' ? '#fef2f2' : '#fefce8';
    var statusLabel = t.status === 'live' ? '✓ Live' : t.status === 'needs_docs' ? '📄 Needs docs' : t.status === 'rejected' ? '✗ Rejected' : '⏳ Pending';
    var deadline    = t.deadline ? new Date(t.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
    var catBadge    = t.category === 'care' ? '#e0f2fe' : '#fef3c7';
    var catColor    = t.category === 'care' ? '#0369a1' : '#92400e';

    return '<div style="background:#fff;border:1.5px solid var(--border);border-radius:12px;padding:16px 18px;">' +
      '<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:0.88rem;color:var(--navy);margin-bottom:4px;">' + (t.title||'').substring(0,100) + '</div>' +
          '<div style="font-size:0.78rem;color:var(--muted);margin-bottom:8px;">' + (t.buyer||t.org||'') + (t.value ? ' · ' + t.value : '') + ' · Deadline: ' + deadline + '</div>' +
          (t.description ? '<div style="font-size:0.78rem;color:var(--muted);line-height:1.5;margin-bottom:8px;">' + (t.description||'').substring(0,200) + (t.description && t.description.length > 200 ? '...' : '') + '</div>' : '') +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<span style="background:' + catBg(t.category) + ';color:' + catCol(t.category) + ';font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:999px;">' + (t.category||'').toUpperCase() + '</span>' +
            (t.source_url ? '<a href="' + t.source_url + '" target="_blank" style="background:#f3f4f6;color:#374151;font-size:0.7rem;font-weight:600;padding:2px 8px;border-radius:999px;text-decoration:none;">' + (t.source === 'find_a_tender' ? 'View on FAT ↗' : 'View on CF ↗') + '</a>' : '') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">' +
          '<span style="background:' + statusBg + ';color:' + statusColor + ';font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:999px;">' + statusLabel + '</span>' +
          (t.status === 'pending_review' ?
            '<div style="display:flex;gap:6px;">' +
              '<button data-approve="' + t.id + '" style="background:#166534;color:#fff;border:none;padding:6px 14px;border-radius:7px;font-size:0.78rem;font-weight:700;cursor:pointer;">&#x2713; Approve</button>' +
              '<button data-reject="' + t.id + '" style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;padding:6px 14px;border-radius:7px;font-size:0.78rem;font-weight:700;cursor:pointer;">&#x2717; Reject</button>' +
            '</div>'
          : t.status === 'live' ?
            '<button data-reject="' + t.id + '" style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;padding:5px 12px;border-radius:7px;font-size:0.75rem;cursor:pointer;">Remove</button>'
          :
            '<button data-approve="' + t.id + '" style="background:#e8f7ee;color:#166534;border:1px solid #9FE1CB;padding:5px 12px;border-radius:7px;font-size:0.75rem;cursor:pointer;">Re-approve</button>'
          ) +
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
    showToast('Approved — upload documents in Cana AI section, then set live', 'success');
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
