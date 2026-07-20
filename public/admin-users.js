// Users tab. Owner/Manager only (the backend enforces it, this is just the UI).
var UBTN = 'font-size:12px;padding:6px 11px;border:1px solid var(--border);background:#fff;border-radius:6px;cursor:pointer;font-family:inherit;';
var ALL_USERS = [];

async function usersApi(payload) {
  var res = await fetch('/.netlify/functions/admin-users', {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  var data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || ('Failed (' + res.status + ')'));
  return data;
}

function fmtDate(d) {
  if (!d) return '<span style="color:var(--text-light)">Never</span>';
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function membershipCell(m) {
  if (!m || !m.member) {
    return '<span style="font-size:11px;font-weight:700;background:#eef3f6;color:#5a6b7a;padding:3px 9px;border-radius:999px">Free</span>';
  }
  var term = m.term_months ? (m.term_months + ' month') : '';
  var renews = m.renews ? ('renews ' + fmtDate(m.renews)) : '';
  var sub = [term, renews].filter(Boolean).join(' · ');
  return '<span style="font-size:11px;font-weight:700;background:#e8f7ee;color:#1a7a3f;padding:3px 9px;border-radius:999px">Member</span>' +
         (sub ? '<div style="font-size:11px;color:var(--text-light);margin-top:3px">' + sub + '</div>' : '');
}

function renderUsersTable(list) {
  var tbody = document.getElementById('usersTable');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-light);padding:16px">No users found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(function (u) {
    var name = u.name || '<span style="color:var(--text-light)">No name given</span>';
    var staffTag = u.is_staff ? ' <span style="font-size:10px;font-weight:700;background:#eef3f6;color:#5a6b7a;padding:2px 7px;border-radius:999px">Staff login</span>' : '';
    var unconfirmed = !u.confirmed ? ' <span style="font-size:10px;font-weight:700;background:#fff4e2;color:#8a5a12;padding:2px 7px;border-radius:999px">Unconfirmed</span>' : '';
    return '<tr>' +
      '<td><div style="font-weight:600">' + name + staffTag + unconfirmed + '</div>' +
        '<div style="font-size:12px;color:var(--text-light)">' + (u.email || '') + '</div>' +
        (u.company ? '<div style="font-size:12px;color:var(--text-light)">' + u.company + '</div>' : '') + '</td>' +
      '<td>' + membershipCell(u.membership) + '</td>' +
      '<td style="font-size:13px">' + fmtDate(u.created_at) + '</td>' +
      '<td style="font-size:13px">' + fmtDate(u.last_sign_in_at) + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button style="' + UBTN + '" data-email="' + String(u.email || '').replace(/"/g, '&quot;') + '" onclick="resetUserPassword(this.dataset.email, this)">Send password reset</button>' +
        (u.is_staff ? '' :
          '<button style="' + UBTN + 'margin-left:6px;color:#c53030;border-color:#f0c2c2" ' +
            'data-id="' + String(u.id || '') + '" ' +
            'data-email="' + String(u.email || '').replace(/"/g, '&quot;') + '" ' +
            'data-member="' + (u.membership && u.membership.member ? '1' : '') + '" ' +
            'onclick="deleteUser(this.dataset.id, this.dataset.email, this.dataset.member, this)">Delete</button>') +
      '</td>' +
    '</tr>';
  }).join('');
}

function filterUsers() {
  var q = ((document.getElementById('userSearch') || {}).value || '').toLowerCase().trim();
  var hideStaff = (document.getElementById('userHideStaff') || {}).checked;
  var list = ALL_USERS.filter(function (u) {
    if (hideStaff && u.is_staff) return false;
    if (!q) return true;
    return (u.email || '').toLowerCase().indexOf(q) !== -1 ||
           (u.name || '').toLowerCase().indexOf(q) !== -1 ||
           (u.company || '').toLowerCase().indexOf(q) !== -1;
  });
  renderUsersTable(list);
}

async function loadUsers() {
  var tbody = document.getElementById('usersTable');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-light);padding:16px">Loading users...</td></tr>';
  try {
    var data = await usersApi({ action: 'list' });
    ALL_USERS = data.users || [];
    var c = data.counts || {};
    var el = function (id) { return document.getElementById(id); };
    if (el('uCountTotal'))   el('uCountTotal').textContent   = c.total   != null ? c.total   : '-';
    if (el('uCountMembers')) el('uCountMembers').textContent = c.members != null ? c.members : '-';
    if (el('uCountStaff'))   el('uCountStaff').textContent   = c.staff   != null ? c.staff   : '-';
    filterUsers();
  } catch (e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="color:#c53030;padding:16px">' + e.message + '</td></tr>';
  }
}

async function deleteUser(id, email, isMember, btn) {
  if (!id) return;

  var warning = 'Permanently delete ' + email + '?\n\n' +
    'This removes their login for good. It cannot be undone and they would have to sign up again.';
  if (isMember) {
    warning += '\n\nWARNING: this person is an ACTIVE MEMBER. Deleting the login does NOT cancel their Stripe billing, ' +
               'so cancel their subscription in Stripe first or they may keep being charged.';
  }
  warning += '\n\nTheir billing history is kept for your records.';
  if (!confirm(warning)) return;

  var typed = prompt('To confirm, type the email address exactly:\n\n' + email);
  if (typed === null) return;
  if (String(typed).trim().toLowerCase() !== String(email).trim().toLowerCase()) {
    alert('That did not match, so nothing was deleted.');
    return;
  }

  var original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }
  try {
    await usersApi({ action: 'delete', id: id, email: email });
    if (typeof showToast === 'function') showToast(email + ' deleted', 'success');
    loadUsers();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = original; }
    if (typeof showToast === 'function') showToast(e.message, 'error'); else alert(e.message);
  }
}

async function resetUserPassword(email, btn) {
  if (!email) return;
  if (!confirm('Send a password reset email to ' + email + '?\n\nThey will get a link to set a new password themselves. Their current password stays active until they use it.')) return;
  var original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  try {
    await usersApi({ action: 'reset', email: email });
    if (btn) { btn.textContent = 'Reset sent ✓'; btn.style.color = '#1a7a3f'; btn.style.borderColor = '#1a7a3f'; }
    if (typeof showToast === 'function') showToast('Password reset email sent to ' + email, 'success');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = original; }
    if (typeof showToast === 'function') showToast(e.message, 'error'); else alert(e.message);
  }
}
