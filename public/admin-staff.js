// Staff tab (Phase 5b). Owner/Manager only. Talks to the admin-manage-staff
// function; the backend enforces the owner/manager gate, this is just the UI.

// Shared small-button style (no dedicated CSS class exists in admin.css).
var SBTN = 'font-size:12px;padding:5px 10px;margin:2px 2px 2px 0;border:1px solid var(--border);background:#fff;border-radius:6px;cursor:pointer;font-family:inherit;';

async function staffApi(payload) {
  var res = await fetch('/.netlify/functions/admin-manage-staff', {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  var data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || ('Failed (' + res.status + ')'));
  return data;
}

async function loadStaff() {
  var tbody = document.getElementById('staffTable');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-light)">Loading...</td></tr>';
  try {
    var data = await staffApi({ action: 'list' });
    renderStaffTable(data.staff || []);
  } catch (e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="color:#c00">' + e.message + '</td></tr>';
  }
}

function renderStaffTable(rows) {
  var tbody = document.getElementById('staffTable');
  if (!tbody) return;
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-light)">No staff yet. Add one above.</td></tr>'; return; }
  tbody.innerHTML = rows.map(function (r) {
    var u = r.username || (r.email || '').split('@')[0];
    var active = r.active !== false;
    var roleLabel = r.role === 'manager' ? 'Manager' : 'Admin';
    var other = r.role === 'manager' ? 'admin' : 'manager';
    var statusHtml = active
      ? '<span style="color:#15803d;font-weight:600">Active</span>'
      : '<span style="color:#b91c1c;font-weight:600">Inactive</span>';
    return '<tr>' +
      '<td><strong>' + u + '</strong></td>' +
      '<td>' + roleLabel + '</td>' +
      '<td>' + statusHtml + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button style="' + SBTN + '" onclick="resetStaffPin(\'' + u + '\')">Reset PIN</button> ' +
        '<button style="' + SBTN + '" onclick="setStaffRole(\'' + u + '\',\'' + other + '\')">Make ' + other + '</button> ' +
        '<button style="' + SBTN + '" onclick="toggleStaffActive(\'' + u + '\',' + (active ? 'false' : 'true') + ')">' + (active ? 'Deactivate' : 'Activate') + '</button> ' +
        '<button style="' + SBTN + 'color:#b91c1c;border-color:#fca5a5" onclick="removeStaff(\'' + u + '\')">Remove</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

async function createStaff() {
  var msg = document.getElementById('staffCreateMsg');
  var username = (document.getElementById('newStaffUsername') || {}).value || '';
  var role = (document.getElementById('newStaffRole') || {}).value || 'admin';
  var pin = (document.getElementById('newStaffPin') || {}).value || '';
  if (msg) { msg.style.color = '#b91c1c'; msg.textContent = ''; }
  if (!/^[0-9]{6}$/.test(pin)) { if (msg) msg.textContent = 'PIN must be exactly 6 digits.'; return; }
  try {
    await staffApi({ action: 'create', username: username, role: role, pin: pin });
    if (msg) { msg.style.color = '#15803d'; msg.textContent = 'Created ' + username.trim().toLowerCase() + ' (' + role + '). Share their username and PIN with them.'; }
    document.getElementById('newStaffUsername').value = '';
    document.getElementById('newStaffPin').value = '';
    loadStaff();
  } catch (e) {
    if (msg) { msg.style.color = '#b91c1c'; msg.textContent = e.message; }
  }
}

async function resetStaffPin(username) {
  var pin = window.prompt('New 6-digit PIN for ' + username + ':');
  if (pin === null) return;
  if (!/^[0-9]{6}$/.test(pin)) { if (typeof showToast === 'function') showToast('PIN must be exactly 6 digits', 'error'); return; }
  try {
    await staffApi({ action: 'resetPin', username: username, pin: pin });
    if (typeof showToast === 'function') showToast('PIN reset for ' + username, 'success');
  } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
}

async function setStaffRole(username, role) {
  try {
    await staffApi({ action: 'setRole', username: username, role: role });
    if (typeof showToast === 'function') showToast(username + ' is now ' + role, 'success');
    loadStaff();
  } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
}

async function toggleStaffActive(username, active) {
  try {
    await staffApi({ action: 'setActive', username: username, active: active });
    if (typeof showToast === 'function') showToast(username + (active ? ' reactivated' : ' deactivated'), 'success');
    loadStaff();
  } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
}

async function removeStaff(username) {
  if (!window.confirm('Remove ' + username + '? This deletes their login permanently.')) return;
  try {
    await staffApi({ action: 'remove', username: username });
    if (typeof showToast === 'function') showToast(username + ' removed', 'success');
    loadStaff();
  } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
}
