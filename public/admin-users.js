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

function daysLeft(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function membershipCell(m) {
  if (!m || !m.member) {
    return '<span style="font-size:11px;font-weight:700;background:#eef3f6;color:#5a6b7a;padding:3px 9px;border-radius:999px">Free</span>';
  }
  var months = parseInt(m.term_months, 10) || 0;
  var planName = m.plan ? (m.plan.charAt(0).toUpperCase() + m.plan.slice(1)) : '';
  var viaEnt = m.via === 'enterprise';
  var isOwner = m.role === 'owner' && m.enterprise;

  var badgeText = viaEnt ? 'Team member' : 'Member';
  var badgeBg = viaEnt ? '#e6f5f7' : '#e8f7ee';
  var badgeFg = viaEnt ? '#0891a3' : '#1a7a3f';
  var out = '<span style="font-size:11px;font-weight:700;background:' + badgeBg + ';color:' + badgeFg + ';padding:3px 9px;border-radius:999px">' + badgeText + '</span>';

  var parts = [];
  if (planName) parts.push(planName);
  if (viaEnt) {
    if (m.enterprise) parts.push('via ' + m.enterprise);
    if (m.department) parts.push(m.department);
  } else {
    if (months) parts.push(months + ' month' + (months > 1 ? 's' : ''));
    if (isOwner) parts.push(m.enterprise + ' (owner)');
  }
  var term = parts.join(' · ');
  if (term) out += '<div style="font-size:11px;color:var(--text-light);margin-top:3px">' + term + '</div>';
  // Team members inherit the owner's renewal, so do not repeat expiry lines for them.
  if (viaEnt) return out;
  if (m.renews) {
    var dl = daysLeft(m.renews);
    var colour = 'var(--text-light)';
    var txt;
    if (dl === null) { txt = 'renews ' + fmtDate(m.renews); }
    else if (dl < 0) { colour = '#c53030'; txt = 'Expired ' + fmtDate(m.renews); }
    else if (dl <= 10) { colour = '#c53030'; txt = 'Expires in ' + dl + ' day' + (dl === 1 ? '' : 's'); }
    else if (dl <= 30) { colour = '#b7791f'; txt = fmtDate(m.renews) + ' · ' + dl + ' days left'; }
    else { txt = fmtDate(m.renews) + ' · ' + dl + ' days left'; }
    out += '<div style="font-size:11px;font-weight:600;color:' + colour + ';margin-top:2px">' + txt + '</div>';
  } else {
    out += '<div style="font-size:11px;color:var(--text-light);margin-top:2px">No expiry set</div>';
  }
  return out;
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
      '<td>' +
        (u.is_staff ? '' :
          '<button style="' + UBTN + 'margin:0 6px 6px 0;color:#0f6e56;border-color:#9fe1cb;font-weight:600" ' +
            'data-email="' + String(u.email || '').replace(/"/g, '&quot;') + '" ' +
            'onclick="openMembershipModal(this.dataset.email)">Manage membership</button>') +
        '<button style="' + UBTN + 'margin:0 6px 6px 0" data-email="' + String(u.email || '').replace(/"/g, '&quot;') + '" onclick="resetUserPassword(this.dataset.email, this)">Send password reset</button>' +
        (u.is_staff ? '' :
          '<button style="' + UBTN + 'margin:0 0 6px 0;color:#c53030;border-color:#f0c2c2" ' +
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

// ── Manage membership modal ──────────────────────────────────────────────
function ensureMemStyles() {
  if (document.getElementById('mm-styles')) return;
  var css = document.createElement('style');
  css.id = 'mm-styles';
  css.textContent =
    '.mm-overlay{position:fixed;inset:0;background:rgba(11,25,41,.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px}' +
    '.mm-card{background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.25);width:520px;max-width:100%;max-height:92vh;overflow:auto;font-family:inherit}' +
    '.mm-head{background:#0a2a1e;color:#fff;padding:18px 22px}' +
    '.mm-head h3{margin:0;font-size:17px;font-weight:700}' +
    '.mm-head p{margin:4px 0 0;font-size:12.5px;color:#9fc9b8}' +
    '.mm-body{padding:20px 22px}' +
    '.mm-cur{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:20px;font-size:13.5px}' +
    '.mm-fl{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted);display:block;margin:0 0 8px}' +
    '.mm-seg{display:flex;gap:8px;margin-bottom:18px}' +
    '.mm-seg button{flex:1;border:1.5px solid var(--border);background:#fff;border-radius:8px;padding:10px;font-family:inherit;font-size:13px;font-weight:700;color:var(--text-muted);cursor:pointer}' +
    '.mm-seg button.on{border-color:var(--green);background:var(--green-light);color:var(--green-dark)}' +
    '.mm-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}' +
    '.mm-row input,.mm-row select,.mm-note input{width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:14px;color:var(--text);background:#fff}' +
    '.mm-note{margin-bottom:18px}' +
    '.mm-computed{background:var(--green-light);border:1px solid #9fe1cb;border-radius:8px;padding:12px 14px;margin-bottom:18px}' +
    '.mm-comp-k{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--green-dark)}' +
    '.mm-comp-v{font-size:15px;font-weight:800;color:var(--green-dark);margin-top:3px}' +
    '.mm-actions{display:flex;gap:10px}' +
    '.mm-actions button{flex:1;border-radius:8px;padding:12px;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;border:1.5px solid}' +
    '.mm-save{background:var(--green);border-color:var(--green);color:#fff}' +
    '.mm-down{background:#fff;border-color:#f0c2c2;color:#c53030}' +
    '.mm-note-p{font-size:12px;color:var(--text-light);margin-top:14px;line-height:1.6}' +
    '.mm-x{float:right;background:none;border:0;color:#9fc9b8;font-size:20px;cursor:pointer;line-height:1}';
  document.head.appendChild(css);
}

function closeMembershipModal() {
  var o = document.getElementById('mm-overlay');
  if (o) o.remove();
}

function mmRecompute() {
  var modal = document.getElementById('mm-overlay');
  if (!modal) return;
  var termSel = modal.querySelector('#mm-term');
  var customWrap = modal.querySelector('#mm-custom-wrap');
  var months = termSel.value === 'custom'
    ? parseInt((modal.querySelector('#mm-custom') || {}).value, 10)
    : parseInt(termSel.value, 10);
  customWrap.style.display = termSel.value === 'custom' ? 'block' : 'none';

  var startVal = modal.querySelector('#mm-start').value;
  var start = startVal ? new Date(startVal) : new Date();
  var box = modal.querySelector('#mm-computed');
  if (!months || months < 1 || months > 60 || isNaN(start.getTime())) {
    box.innerHTML = '<div class="mm-comp-k">Membership will run until</div><div class="mm-comp-v">Enter a valid term (1 to 60 months)</div>';
    return;
  }
  var end = new Date(start.getTime());
  end.setMonth(end.getMonth() + months);
  var days = Math.ceil((end.getTime() - Date.now()) / 86400000);
  box.innerHTML = '<div class="mm-comp-k">Membership will run until</div><div class="mm-comp-v">' +
    end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' + days + ' days</div>';
}

function openMembershipModal(email) {
  var u = ALL_USERS.filter(function (x) { return String(x.email || '').toLowerCase() === String(email || '').toLowerCase(); })[0];
  if (!u) return;
  ensureMemStyles();
  closeMembershipModal();

  var m = u.membership || {};
  var isMember = !!m.member;
  var curPlan = m.plan || '';
  var curPlanCap = curPlan ? (curPlan.charAt(0).toUpperCase() + curPlan.slice(1)) : '';
  var today = new Date().toISOString().slice(0, 10);
  var curText = isMember
    ? ((curPlanCap ? curPlanCap : 'Member') + (m.term_months ? ', ' + m.term_months + ' month' + (m.term_months > 1 ? 's' : '') : '') +
        (m.renews ? ', expires ' + fmtDate(m.renews) : ''))
    : 'Free account';

  // Team members inherit the owner's plan, so they cannot be managed here. Show a
  // locked view that points to the owner instead.
  var isTeamMember = m.role === 'member' && m.enterprise;
  if (isTeamMember) {
    var lo = document.createElement('div');
    lo.className = 'mm-overlay';
    lo.id = 'mm-overlay';
    var ownerEmail = m.owner_email || '';
    lo.innerHTML =
      '<div class="mm-card">' +
        '<div class="mm-head"><button class="mm-x" onclick="closeMembershipModal()">&times;</button>' +
          '<h3>Manage membership</h3><p>' + (u.name || u.email) + ' · ' + (u.email || '') + '</p></div>' +
        '<div class="mm-body">' +
          '<div class="mm-cur"><strong>Current:</strong> ' + curText + (m.department ? ' · ' + m.department : '') + '</div>' +
          '<div style="background:#e6f5f7;border:1px solid rgba(0,201,224,.35);border-radius:10px;padding:14px 16px;font-size:13px;color:#0b1929;line-height:1.55;margin-top:4px;">' +
            '<strong>' + (u.name || 'This person') + ' is a team member of ' + (m.enterprise || 'a company circle') + '.</strong> ' +
            'Their plan flows from the account owner, so it cannot be changed here. Manage the plan on the owner, or remove them from the team on the owner\'s Team screen.' +
          '</div>' +
          '<div class="mm-actions" style="margin-top:16px;">' +
            (ownerEmail ? '<button class="mm-save" onclick="openMembershipModal(\'' + ownerEmail.replace(/'/g, "\\'") + '\')">Manage ' + (m.enterprise || 'the owner') + '’s plan</button>' : '') +
            '<button class="mm-down" onclick="closeMembershipModal()">Close</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    lo.addEventListener('click', function (e) { if (e.target === lo) closeMembershipModal(); });
    document.body.appendChild(lo);
    return;
  }

  var o = document.createElement('div');
  o.className = 'mm-overlay';
  o.id = 'mm-overlay';
  o.setAttribute('data-email', u.email || '');
  o.innerHTML =
    '<div class="mm-card">' +
      '<div class="mm-head"><button class="mm-x" onclick="closeMembershipModal()">&times;</button>' +
        '<h3>Manage membership</h3><p>' + (u.name || u.email) + ' · ' + (u.email || '') + '</p></div>' +
      '<div class="mm-body">' +
        '<div class="mm-cur"><strong>Current:</strong> ' + curText + '</div>' +
        '<span class="mm-fl">Set to</span>' +
        '<div class="mm-seg">' +
          '<button type="button" id="mm-plan-member" class="on" onclick="mmSetPlan(true)">Member</button>' +
          '<button type="button" id="mm-plan-free" onclick="mmSetPlan(false)">Free</button>' +
        '</div>' +
        '<div id="mm-member-fields">' +
          '<div class="mm-row">' +
            '<div><span class="mm-fl">Plan</span>' +
              '<select id="mm-tier">' +
                '<option value="access"' + (curPlan === 'access' ? ' selected' : '') + '>Access</option>' +
                '<option value="pro"' + (curPlan === 'pro' || !curPlan ? ' selected' : '') + '>Pro</option>' +
                '<option value="gold"' + (curPlan === 'gold' ? ' selected' : '') + '>Gold</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="mm-row">' +
            '<div><span class="mm-fl">Term</span>' +
              '<select id="mm-term" onchange="mmRecompute()">' +
                '<option value="3">3 months</option>' +
                '<option value="6">6 months</option>' +
                '<option value="12" selected>12 months</option>' +
                '<option value="custom">Custom</option>' +
              '</select>' +
              '<div id="mm-custom-wrap" style="display:none;margin-top:8px"><input type="number" id="mm-custom" min="1" max="60" placeholder="Months" oninput="mmRecompute()"></div>' +
            '</div>' +
            '<div><span class="mm-fl">Start date</span><input type="date" id="mm-start" value="' + today + '" onchange="mmRecompute()"></div>' +
          '</div>' +
          '<div id="mm-computed" class="mm-computed"></div>' +
          '<div class="mm-note"><span class="mm-fl">Note (optional, saved to the audit log)</span>' +
            '<input type="text" id="mm-note" placeholder="e.g. Paid 249 by bank transfer, ref 4471"></div>' +
        '</div>' +
        '<div class="mm-actions">' +
          '<button class="mm-save" id="mm-save" onclick="mmSave()">Save membership</button>' +
          (isMember ? '<button class="mm-down" id="mm-down" onclick="mmDowngrade()">Downgrade to Free</button>' : '') +
        '</div>' +
        '<p class="mm-note-p">This sets the membership in Cana only. It does not take payment and does not touch Stripe, so use it when you have already received the money another way. Every change is written to the admin audit log.</p>' +
      '</div>' +
    '</div>';
  o.addEventListener('click', function (e) { if (e.target === o) closeMembershipModal(); });
  document.body.appendChild(o);
  mmRecompute();
}

// Toggle the Member/Free choice inside the modal.
function mmSetPlan(member) {
  var modal = document.getElementById('mm-overlay');
  if (!modal) return;
  modal.querySelector('#mm-plan-member').classList.toggle('on', member);
  modal.querySelector('#mm-plan-free').classList.toggle('on', !member);
  modal.querySelector('#mm-member-fields').style.display = member ? 'block' : 'none';
  var save = modal.querySelector('#mm-save');
  save.textContent = member ? 'Save membership' : 'Set to Free';
}

async function mmSave() {
  var modal = document.getElementById('mm-overlay');
  if (!modal) return;
  var email = modal.getAttribute('data-email');
  var toFree = modal.querySelector('#mm-plan-free').classList.contains('on');
  var note = (modal.querySelector('#mm-note') || {}).value || '';

  if (toFree) { mmDowngrade(); return; }

  var termSel = modal.querySelector('#mm-term').value;
  var months = termSel === 'custom'
    ? parseInt((modal.querySelector('#mm-custom') || {}).value, 10)
    : parseInt(termSel, 10);
  if (!months || months < 1 || months > 60) { alert('Enter a term between 1 and 60 months.'); return; }
  var start = modal.querySelector('#mm-start').value || new Date().toISOString().slice(0, 10);
  var tierSel = modal.querySelector('#mm-tier');
  var tier = tierSel ? tierSel.value : '';

  var btn = modal.querySelector('#mm-save');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await usersApi({ action: 'set-membership', email: email, plan: 'member', tier: tier, term_months: months, start_date: start, note: note });
    if (typeof showToast === 'function') showToast('Membership set for ' + email, 'success');
    closeMembershipModal();
    loadUsers();
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Save membership';
    if (typeof showToast === 'function') showToast(e.message, 'error'); else alert(e.message);
  }
}

async function mmDowngrade() {
  var modal = document.getElementById('mm-overlay');
  if (!modal) return;
  var email = modal.getAttribute('data-email');
  var note = (modal.querySelector('#mm-note') || {}).value || '';
  if (!confirm('Downgrade ' + email + ' to a Free account?\n\nTheir unlimited bidding stops. This does not refund anything.')) return;
  var btn = modal.querySelector('#mm-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Working...'; }
  try {
    await usersApi({ action: 'set-membership', email: email, plan: 'free', note: note });
    if (typeof showToast === 'function') showToast(email + ' set to Free', 'success');
    closeMembershipModal();
    loadUsers();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save membership'; }
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
