// Admin Delivery desk: paid review jobs to be done. Writers (and any admin) can
// claim a job, work it, then mark it delivered. Capacity strip shows the load.
// Data comes from admin-delivery-list; actions go to admin-delivery-update.

var _dlvAll = [];
var _dlvMe = '';
var _dlvFilter = 'all';

function dlvEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function dlvMoney(p) { return '£' + Math.round((p || 0) / 100); }
function dlvReviewLabel(t) { return t === 'full' ? 'Full tender review' : 'Response review'; }
function dlvShortRef(id) { return 'REV-' + String(id || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase(); }
function dlvFmt(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  catch (e) { return ''; }
}
function dlvName(email) { return String(email || '').split('@')[0] || email || ''; }

function dlvStatusMeta(st) {
  if (st === 'delivered') return { label: 'Delivered', bg: '#dcfce7', fg: '#166534', bar: '#16a37b' };
  if (st === 'in_progress') return { label: 'In progress', bg: '#e1f7fa', fg: '#0891a3', bar: '#0891a3' };
  return { label: 'To do', bg: '#fef9c3', fg: '#854d0e', bar: '#e0a93b' };
}

async function loadDelivery() {
  var list = document.getElementById('dlv-list');
  if (list) list.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;">Loading...</div>';
  try {
    var res = await fetch('/.netlify/functions/admin-delivery-list', { headers: adminHeaders() });
    var data = await res.json();
    if (!res.ok) throw new Error((data && data.error) || 'Failed to load');
    _dlvAll = (data && data.jobs) || [];
    _dlvMe = (data && data.me) || '';
    dlvRenderCapacity(data.counts || {}, data.byWriter || {});
    var outstanding = _dlvAll.filter(function (j) { return j.delivery_status !== 'delivered'; }).length;
    var badge = document.getElementById('sbDelivery'); if (badge) badge.textContent = outstanding;
    dlvRender();
  } catch (e) {
    if (list) list.innerHTML = '<div style="color:#dc2626;font-size:0.85rem;padding:1rem;">Could not load delivery: ' + dlvEsc(e.message) + '</div>';
  }
}

function dlvCapCard(label, value, color) {
  return '<div style="background:#fff;border-radius:10px;padding:12px 14px;box-shadow:var(--card-shadow);">' +
    '<div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">' + label + '</div>' +
    '<div style="font-size:1.5rem;font-weight:800;color:' + color + ';margin-top:3px;">' + value + '</div></div>';
}

function dlvRenderCapacity(counts, byWriter) {
  var box = document.getElementById('dlv-capacity');
  if (!box) return;
  var writers = Object.keys(byWriter || {});
  var whoHtml = writers.length
    ? writers.map(function (w) { return dlvEsc(dlvName(w)) + ' ' + byWriter[w]; }).join(' · ')
    : 'Nobody on yet';
  box.innerHTML =
    dlvCapCard('To do', counts.todo || 0, '#854d0e') +
    dlvCapCard('In progress', counts.in_progress || 0, '#0891a3') +
    dlvCapCard('Delivered (7d)', counts.delivered7 || 0, '#166534') +
    '<div style="background:#fff;border-radius:10px;padding:12px 14px;box-shadow:var(--card-shadow);">' +
      '<div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Writers on now</div>' +
      '<div style="font-size:0.84rem;font-weight:700;color:var(--text);margin-top:7px;line-height:1.5;">' + whoHtml + '</div></div>';
}

function dlvSetFilter(f, btn) {
  _dlvFilter = f;
  ['all', 'mine', 'todo', 'in_progress', 'delivered'].forEach(function (k) {
    var el = document.getElementById('dlv-tab-' + k);
    if (el) el.className = 'ti-tab' + (k === f ? ' active' : '');
  });
  dlvRender();
}

function dlvRender() {
  var list = document.getElementById('dlv-list');
  var empty = document.getElementById('dlv-empty');
  if (!list) return;

  var rows = _dlvAll.filter(function (j) {
    if (_dlvFilter === 'mine') return j.assigned_to && j.assigned_to === _dlvMe;
    if (_dlvFilter === 'todo') return j.delivery_status === 'todo';
    if (_dlvFilter === 'in_progress') return j.delivery_status === 'in_progress';
    if (_dlvFilter === 'delivered') return j.delivery_status === 'delivered';
    return true;
  });

  var weight = { todo: 0, in_progress: 1, delivered: 2 };
  rows.sort(function (a, b) {
    var wa = weight[a.delivery_status] != null ? weight[a.delivery_status] : 0;
    var wb = weight[b.delivery_status] != null ? weight[b.delivery_status] : 0;
    if (wa !== wb) return wa - wb;
    return new Date(b.paid_at || b.created_at) - new Date(a.paid_at || a.created_at);
  });

  if (!rows.length) { list.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  list.innerHTML = rows.map(function (j) {
    var m = dlvStatusMeta(j.delivery_status);
    var who = '';
    if (j.delivery_status === 'in_progress' && j.assigned_to) who = ' · ' + dlvEsc(dlvName(j.assigned_to));
    else if (j.delivery_status === 'delivered' && j.delivered_by) who = ' · ' + dlvEsc(dlvName(j.delivered_by)) + ' ' + dlvFmt(j.delivered_at);

    var actions = '';
    if (j.delivery_status === 'todo') {
      actions = '<button onclick="dlvAction(\'' + dlvEsc(j.id) + '\',\'claim\',this)" style="background:#00C9E0;border:none;color:#042c33;font-size:0.76rem;font-weight:700;padding:7px 14px;border-radius:8px;cursor:pointer;">Claim</button>';
    } else if (j.delivery_status === 'in_progress') {
      actions = '<button onclick="dlvAction(\'' + dlvEsc(j.id) + '\',\'deliver\',this)" style="background:#166534;border:none;color:#fff;font-size:0.76rem;font-weight:700;padding:7px 14px;border-radius:8px;cursor:pointer;">Mark delivered</button>';
    } else {
      actions = '<button onclick="dlvAction(\'' + dlvEsc(j.id) + '\',\'reopen\',this)" style="background:none;border:1px solid var(--border);color:var(--text-muted);font-size:0.74rem;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;">Reopen</button>';
    }

    return '<div style="background:#fff;border-radius:10px;box-shadow:var(--card-shadow);padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-left:4px solid ' + m.bar + ';' + (j.delivery_status === 'delivered' ? 'opacity:0.82;' : '') + '">' +
      '<div style="min-width:0;">' +
        '<div style="font-size:0.9rem;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + dlvEsc(j.tender_title || 'Tender') + '</div>' +
        '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:3px;">' +
          '<span style="font-family:monospace;color:#0ea5b7;">' + dlvShortRef(j.id) + '</span> · ' +
          dlvEsc(j.email || '') + ' · paid ' + dlvFmt(j.paid_at) + who +
        '</div>' +
        '<div style="margin-top:6px;"><span style="background:#e1f7fa;color:#0891a3;font-size:0.7rem;font-weight:700;padding:2px 9px;border-radius:999px;">' + dlvEsc(dlvReviewLabel(j.review_type)) + ' · ' + dlvMoney(j.amount) + '</span></div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0;">' +
        '<span style="background:' + m.bg + ';color:' + m.fg + ';font-size:0.7rem;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;">' + m.label + '</span>' +
        actions +
      '</div>' +
    '</div>';
  }).join('');
}

async function dlvAction(id, action, btn) {
  if (action === 'reopen' && !confirm('Put this review back to To do?')) return;
  if (btn) { btn.disabled = true; var old = btn.textContent; btn.textContent = '...'; btn._old = old; }
  try {
    var res = await fetch('/.netlify/functions/admin-delivery-update', {
      method: 'POST', headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: id, action: action })
    });
    var d = await res.json();
    if (!res.ok) throw new Error((d && d.error) || 'failed');
    if (typeof showToast === 'function') {
      showToast(action === 'claim' ? 'Claimed, it is yours' : action === 'deliver' ? 'Marked delivered' : 'Back to to-do', 'success');
    }
    loadDelivery();
  } catch (e) {
    if (typeof showToast === 'function') showToast('Error: ' + e.message, 'error'); else alert('Error: ' + e.message);
    if (btn) { btn.disabled = false; if (btn._old) btn.textContent = btn._old; }
  }
}
