// Admin Orders screen: lists every bid generated (from cana_jobs), with a
// reference, customer, tender, date/time and status, plus simple volume metrics.

var _ordAll = [];

function ordEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function ordFmt(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return d; }
}

function ordStatusChip(status) {
  var s = String(status || '').toLowerCase();
  var c;
  if (s === 'complete') c = { t: 'Sent', bg: '#dcfce7', fg: '#166534' };
  else if (s === 'error') c = { t: 'Error', bg: '#fee2e2', fg: '#991b1b' };
  else c = { t: (status || 'Processing'), bg: '#fef9c3', fg: '#854d0e' };
  return '<span style="background:' + c.bg + ';color:' + c.fg + ';font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;">' + ordEsc(c.t) + '</span>';
}

async function loadGenControl() {
  var box = document.getElementById('gen-control');
  if (!box) return;
  try {
    var res = await fetch('/.netlify/functions/generation-control', { headers: adminHeaders() });
    var d = await res.json();
    if (!res.ok) throw new Error(d && d.error || 'failed');
    var spent = ((d.spent_today_pennies || 0) / 100).toFixed(2);
    var budget = ((d.daily_budget_pennies || 0) / 100).toFixed(2);
    var paused = d.paused === true;
    box.innerHTML =
      '<div>' +
        '<div style="font-size:0.9rem;font-weight:700;color:' + (paused ? '#b91c1c' : '#166534') + ';">' +
          (paused ? '⏸ Generation is PAUSED' : '▶ Generation is running') + '</div>' +
        '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">Estimated AI spend today: £' + spent + ' of £' + budget + ' daily budget</div>' +
      '</div>' +
      '<button onclick="toggleGeneration(' + (paused ? 'false' : 'true') + ')" style="border:none;color:#fff;font-weight:700;font-size:0.84rem;padding:9px 18px;border-radius:8px;cursor:pointer;background:' + (paused ? '#166534' : '#dc2626') + ';">' +
        (paused ? 'Resume generation' : 'Pause all generation') + '</button>';
  } catch (e) {
    box.innerHTML = '<div style="font-size:0.82rem;color:#dc2626;">Could not load generation status: ' + ordEsc(e.message) + '</div>';
  }
}

async function toggleGeneration(pause) {
  if (pause && !confirm('Pause ALL bid generation? Customers will not receive documents until you resume. Use this only if costs are spiking or you suspect abuse.')) return;
  try {
    var res = await fetch('/.netlify/functions/generation-control', {
      method: 'POST', headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ paused: !!pause })
    });
    var d = await res.json();
    if (!res.ok) throw new Error(d && d.error || 'failed');
    if (typeof showToast === 'function') showToast(pause ? 'Generation paused' : 'Generation resumed', 'success');
    loadGenControl();
  } catch (e) {
    if (typeof showToast === 'function') showToast('Error: ' + e.message, 'error'); else alert('Error: ' + e.message);
  }
}

async function loadOrders() {
  loadGenControl();
  var list = document.getElementById('ord-list');
  if (list) list.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;">Loading...</div>';
  try {
    var res = await fetch('/.netlify/functions/get-orders', { headers: adminHeaders() });
    var data = await res.json();
    if (!res.ok) throw new Error((data && data.error) || 'Failed to load');
    _ordAll = (data && data.orders) || [];
    ordUpdateStats();
    renderOrders();
  } catch (e) {
    if (list) list.innerHTML = '<div style="color:#dc2626;font-size:0.85rem;padding:1rem;">Could not load orders: ' + ordEsc(e.message) + '</div>';
  }
}

function ordUpdateStats() {
  var now = Date.now();
  var day = 24 * 3600 * 1000;
  function since(ms) { return _ordAll.filter(function (o) { return o.created_at && (now - new Date(o.created_at).getTime()) <= ms; }).length; }
  var elToday = document.getElementById('ord-today'); if (elToday) elToday.textContent = since(day);
  var elWeek = document.getElementById('ord-week'); if (elWeek) elWeek.textContent = since(7 * day);
  var elMonth = document.getElementById('ord-month'); if (elMonth) elMonth.textContent = since(30 * day);
  var elTotal = document.getElementById('ord-total'); if (elTotal) elTotal.textContent = _ordAll.length;
  var badge = document.getElementById('sbOrders'); if (badge) badge.textContent = _ordAll.length;
}

function renderOrders() {
  var list = document.getElementById('ord-list');
  var empty = document.getElementById('ord-empty');
  if (!list) return;
  var q = (document.getElementById('ord-search') || {}).value || '';
  q = q.trim().toLowerCase();
  var rows = !q ? _ordAll : _ordAll.filter(function (o) {
    return (o.ref + ' ' + o.client_name + ' ' + o.client_email + ' ' + o.tender_title + ' ' + o.org).toLowerCase().indexOf(q) !== -1;
  });
  if (!rows.length) { list.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  list.innerHTML = rows.map(function (o) {
    return '<div style="background:#fff;border-radius:10px;box-shadow:var(--card-shadow);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
      '<div style="min-width:0;">' +
        '<div style="font-size:0.9rem;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + ordEsc(o.tender_title) + '</div>' +
        '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px;">' +
          '<span style="font-family:monospace;color:#0ea5b7;">' + ordEsc(o.ref) + '</span> &middot; ' +
          ordEsc(o.client_name || o.client_email || 'Customer') + ' &middot; ' + ordFmt(o.created_at) +
        '</div>' +
      '</div>' +
      ordStatusChip(o.status) +
    '</div>';
  }).join('');
}
