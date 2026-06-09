
async function loadImportedTenders() {
  try {
    var res = await sbFetch('/rest/v1/tenders?source=eq.contracts_finder&select=*&order=created_at.desc&limit=200');
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
  var live     = tiAllTenders.filter(function(t){ return t.status === 'live'; }).length;
  var rejected = tiAllTenders.filter(function(t){ return t.status === 'rejected'; }).length;
  var setEl = function(id, val) { var el = document.getElementById(id); if(el) el.textContent = val; };
  setEl('ti-count-pending',  pending);
  setEl('ti-count-live',     live);
  setEl('ti-count-rejected', rejected);
  setEl('ti-count-total',    tiAllTenders.length);
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
    if (tiCurrentFilter !== 'all' && t.status !== tiCurrentFilter) return false;
    if (cat && t.category !== cat) return false;
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
    var statusColor = t.status === 'live' ? '#166534' : t.status === 'rejected' ? '#dc2626' : '#92400e';
    var statusBg    = t.status === 'live' ? '#e8f7ee' : t.status === 'rejected' ? '#fef2f2' : '#fefce8';
    var statusLabel = t.status === 'live' ? '✓ Live' : t.status === 'rejected' ? '✗ Rejected' : '⏳ Pending';
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
            (t.source_url ? '<a href="' + t.source_url + '" target="_blank" style="background:#f3f4f6;color:#374151;font-size:0.7rem;font-weight:600;padding:2px 8px;border-radius:999px;text-decoration:none;">View on CF ↗</a>' : '') +
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

async function tiApprove(id) {
  try {
    await sbFetch('/rest/v1/tenders?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'live' })
    });
    tiAllTenders = tiAllTenders.map(function(t){ return t.id === id ? Object.assign({},t,{status:'live'}) : t; });
    tiUpdateStats(); tiRender();
    showToast('Tender approved — now live', 'success');
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
  if (status) status.textContent = 'Fetching from Contracts Finder...';

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
