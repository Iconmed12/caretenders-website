
function buildImportPage() {
  var el = document.getElementById('page-tenders-import');
  if (!el || el.innerHTML.trim()) return;
  el.innerHTML = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:1.5rem;flex-wrap:wrap;">' +
    '<div><h2 style="font-size:1.3rem;font-weight:700;margin-bottom:4px;">Tender Import</h2>' +
    '<p style="color:var(--text-muted);font-size:0.875rem;">Auto-imported from Contracts Finder. Review and approve before going live.</p></div>' +
    '<div style="display:flex;gap:10px;align-items:center;">' +
    '<button onclick="runManualImport()" id="ti-import-btn" style="background:var(--navy);color:#fff;border:none;padding:9px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:0.84rem;">&#x2B07; Import Now</button>' +
    '<span id="ti-import-status" style="font-size:0.8rem;color:var(--text-muted);"></span>' +
    '</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:1.25rem;">' +
    '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Pending</div><div style="font-size:1.6rem;font-weight:700;color:var(--navy);" id="ti-count-pending">0</div></div>' +
    '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Approved</div><div style="font-size:1.6rem;font-weight:700;color:#166534;" id="ti-count-live">0</div></div>' +
    '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Rejected</div><div style="font-size:1.6rem;font-weight:700;color:#dc2626;" id="ti-count-rejected">0</div></div>' +
    '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Total</div><div style="font-size:1.6rem;font-weight:700;color:var(--navy);" id="ti-count-total">0</div></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">' +
    '<button onclick="tiSetFilter(&quot;pending_review&quot;)" class="ti-tab active" id="ti-tab-pending">Pending</button>' +
    '<button onclick="tiSetFilter(&quot;live&quot;)" class="ti-tab" id="ti-tab-live">Approved</button>' +
    '<button onclick="tiSetFilter(&quot;rejected&quot;)" class="ti-tab" id="ti-tab-rejected">Rejected</button>' +
    '<button onclick="tiSetFilter(&quot;all&quot;)" class="ti-tab" id="ti-tab-all">All</button>' +
    '<input type="text" id="ti-search" placeholder="Search..." oninput="tiRender()" style="margin-left:auto;padding:7px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.82rem;font-family:inherit;outline:none;width:160px;">' +
    '<select id="ti-cat-filter" onchange="tiRender()" style="padding:7px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.82rem;font-family:inherit;outline:none;background:#fff;">' +
    '<option value="">All categories</option><option value="care">Care</option><option value="commercial">Commercial</option>' +
    '</select></div>' +
    '<div id="ti-list" style="display:flex;flex-direction:column;gap:10px;"></div>' +
    '<div id="ti-empty" style="display:none;text-align:center;padding:3rem;color:var(--text-muted);">No tenders yet. Click <b>Import Now</b> to fetch from Contracts Finder.</div>';
}

async function loadImportedTenders() {
  buildImportPage();
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
              '<button onclick="tiApprove(\'' + t.id + '\')"' style="background:#166534;color:#fff;border:none;padding:6px 14px;border-radius:7px;font-size:0.78rem;font-weight:700;cursor:pointer;">✓ Approve</button>' +
              '<button onclick="tiReject('' + t.id + '')" style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;padding:6px 14px;border-radius:7px;font-size:0.78rem;font-weight:700;cursor:pointer;">✗ Reject</button>' +
            '</div>'
          : t.status === 'live' ?
            '<button onclick="tiReject('' + t.id + '')" style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;padding:5px 12px;border-radius:7px;font-size:0.75rem;cursor:pointer;">Remove</button>'
          :
            '<button onclick="tiApprove(\'' + t.id + '\')"' style="background:#e8f7ee;color:#166534;border:1px solid #9FE1CB;padding:5px 12px;border-radius:7px;font-size:0.75rem;cursor:pointer;">Re-approve</button>'
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
