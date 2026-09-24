// Admin Requests inbox: shows the tender links customers have sent, and lets the
// team move each one through new -> sourcing -> ready (which emails the
// customer) or cannot_source (which also emails them). Adding the actual tender
// stays manual via the normal Tender Import screen; this is just the queue.

var _trAll = [];
var _trFilter = 'open';

function trEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function trChip(status) {
  var map = {
    new:           { t: 'New',        bg: '#e0e7ff', fg: '#3730a3' },
    sourcing:      { t: 'Sourcing',   bg: '#fef9c3', fg: '#854d0e' },
    ready:         { t: 'Ready & notified', bg: '#dcfce7', fg: '#166534' },
    cannot_source: { t: 'Cannot source',    bg: '#fee2e2', fg: '#991b1b' }
  };
  var c = map[status] || map.new;
  return '<span style="background:' + c.bg + ';color:' + c.fg + ';font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;">' + c.t + '</span>';
}

function trFmt(d) { if (!d) return ''; try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return d; } }

function trSetFilter(f) {
  _trFilter = f;
  ['open', 'all', 'done'].forEach(function (k) {
    var el = document.getElementById('tr-tab-' + k);
    if (el) el.classList.toggle('active', k === f);
  });
  trRender();
}

async function loadTenderRequests() {
  var list = document.getElementById('tr-list');
  if (list) list.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;">Loading...</div>';
  try {
    var res = await fetch('/.netlify/functions/tender-requests-admin', { headers: adminHeaders() });
    var data = await res.json();
    if (!res.ok) throw new Error((data && data.error) || 'Failed to load');
    _trAll = (data && data.requests) || [];
    trPaintBadge(_trAll.filter(function (r) { return r.status === 'new' || r.status === 'sourcing'; }).length);
    trRender();
  } catch (e) {
    if (list) list.innerHTML = '<div style="color:#dc2626;font-size:0.85rem;padding:1rem;">Could not load requests: ' + trEsc(e.message) + '</div>';
  }
}

function trRender() {
  var list = document.getElementById('tr-list');
  var empty = document.getElementById('tr-empty');
  if (!list) return;
  var rows = _trAll.filter(function (r) {
    if (_trFilter === 'open') return r.status === 'new' || r.status === 'sourcing';
    if (_trFilter === 'done') return r.status === 'ready' || r.status === 'cannot_source';
    return true;
  });
  if (!rows.length) { list.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  list.innerHTML = rows.map(function (r) {
    var who = (r.company_name ? trEsc(r.company_name) + ' &middot; ' : '') + trEsc(r.email || '');
    var actions = '';
    if (r.status === 'new' || r.status === 'sourcing') {
      actions =
        (r.status === 'new' ? '<button onclick="trUpdate(\'' + r.id + '\',\'sourcing\')" class="tr-btn">Mark as sourcing</button>' : '') +
        '<button onclick="trMarkReady(\'' + r.id + '\')" class="tr-btn tr-btn-primary"><i class="ti ti-mail" style="font-size:14px;vertical-align:-2px;"></i> Mark ready &amp; email</button>' +
        '<button onclick="trCannot(\'' + r.id + '\')" class="tr-btn tr-btn-danger">Cannot source</button>';
    } else {
      actions = '<button onclick="trUpdate(\'' + r.id + '\',\'sourcing\')" class="tr-btn">Reopen</button>';
    }
    return '<div style="background:#fff;border-radius:10px;box-shadow:var(--card-shadow);padding:14px 16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;">' +
      '<div style="min-width:0;"><div style="font-size:0.75rem;color:var(--text-muted);">' + who + ' &middot; ' + trFmt(r.created_at) + '</div></div>' +
      trChip(r.status) + '</div>' +
      '<a href="' + trEsc(r.link) + '" target="_blank" rel="noopener" style="font-size:0.82rem;color:#0ea5b7;word-break:break-all;"><i class="ti ti-external-link" style="font-size:13px;vertical-align:-1px;"></i> ' + trEsc(r.link) + '</a>' +
      (r.note ? '<div style="font-size:0.82rem;color:var(--text);background:#f8fafc;border-radius:8px;padding:8px 10px;margin:10px 0;line-height:1.5;">' + trEsc(r.note) + '</div>' : '<div style="height:10px;"></div>') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + actions + '</div>' +
      '</div>';
  }).join('');
}

async function trUpdate(id, status, adminNote) {
  try {
    var body = { id: id, status: status };
    if (typeof adminNote === 'string') body.adminNote = adminNote;
    var res = await fetch('/.netlify/functions/tender-requests-admin', {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!res.ok) throw new Error((data && data.error) || 'Update failed');
    if (typeof showToast === 'function') showToast(data.emailed ? 'Updated and customer emailed' : 'Updated', 'success');
    loadTenderRequests();
  } catch (e) {
    if (typeof showToast === 'function') showToast('Error: ' + e.message, 'error'); else alert('Error: ' + e.message);
  }
}

function trMarkReady(id) {
  if (!confirm('Mark this request as ready? This emails the customer to say their tender is on their dashboard. Make sure you have added the tender first.')) return;
  trUpdate(id, 'ready');
}

function trCannot(id) {
  var reason = prompt('Optional: a short reason to include in the email to the customer (leave blank for a general message).', '');
  if (reason === null) return;
  trUpdate(id, 'cannot_source', reason.trim());
}

// Paint the sidebar badge, red and bold when requests are waiting so a new one
// is obvious from any admin screen.
function trPaintBadge(n) {
  var b = document.getElementById('sbRequests');
  if (!b) return;
  b.textContent = n;
  if (n > 0) { b.style.background = '#dc2626'; b.style.color = '#fff'; b.style.fontWeight = '700'; }
  else { b.style.background = ''; b.style.color = ''; b.style.fontWeight = ''; }
}

// Live updates: poll in the background so new requests appear (and the badge
// turns red) without the admin having to refresh the page. When the Requests
// page is open, the list itself refreshes too.
async function trPoll() {
  if (!window._adminToken) return;
  try {
    var res = await fetch('/.netlify/functions/tender-requests-admin', { headers: adminHeaders() });
    if (!res.ok) return;
    var data = await res.json();
    _trAll = (data && data.requests) || [];
    trPaintBadge(_trAll.filter(function (r) { return r.status === 'new' || r.status === 'sourcing'; }).length);
    var pg = document.getElementById('page-requests');
    if (pg && pg.classList.contains('active')) trRender();
  } catch (e) { /* silent, will retry next tick */ }
}

// Kick off soon after load (auth token may not be ready immediately), then keep
// it fresh every 15 seconds.
setTimeout(trPoll, 2500);
setTimeout(trPoll, 6000);
setInterval(trPoll, 15000);
