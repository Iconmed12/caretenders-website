// Customer "request a tender" panel on the dashboard. Lets a logged-in customer
// send us a link to a tender they cannot find on Cana, and shows the status of
// their own past requests. Relies on the page's global `sb` Supabase client.

(function () {
  var linkEl = document.getElementById('tr-link');
  var noteEl = document.getElementById('tr-note');
  var sendEl = document.getElementById('tr-send');
  var msgEl  = document.getElementById('tr-msg');
  var mineEl = document.getElementById('tr-mine');
  if (!sendEl || typeof sb === 'undefined') return;

  // Allowance line above the form (used/limit, or unlimited). Locks the form when
  // the monthly S.A.T. allowance is used up.
  var allowEl = document.getElementById('tr-allow');
  var cardEl = document.getElementById('tr-card');
  var formEl = document.getElementById('tr-form');
  if (!allowEl && cardEl && formEl) {
    allowEl = document.createElement('div');
    allowEl.id = 'tr-allow';
    allowEl.style.cssText = 'font-size:13px;margin-bottom:14px;';
    cardEl.insertBefore(allowEl, formEl);
  }
  function applyAllowance(data) {
    if (!allowEl || !data) return;
    if (data.unlimited) {
      allowEl.innerHTML = '<span style="color:#0891a3;font-weight:600;">Unlimited S.A.T requests on your plan.</span>';
      if (sendEl) sendEl.disabled = false;
      if (linkEl) linkEl.disabled = false;
      if (noteEl) noteEl.disabled = false;
      return;
    }
    var lim = data.limit || 0;
    var used = data.used_this_month || 0;
    var rem = (data.remaining != null) ? data.remaining : Math.max(0, lim - used);
    allowEl.innerHTML = '<span style="color:#63707f;">S.A.T requests this month: <strong style="color:#0b1929;">' + used + ' of ' + lim + ' used</strong>' + (rem <= 0 ? ' &mdash; limit reached' : ' &middot; ' + rem + ' left') + '</span>';
    var locked = rem <= 0;
    if (sendEl) sendEl.disabled = locked;
    if (linkEl) linkEl.disabled = locked;
    if (noteEl) noteEl.disabled = locked;
    if (locked && msgEl) { msgEl.textContent = 'You have used your ' + lim + ' request' + (lim > 1 ? 's' : '') + ' for this month. Upgrade your plan for more.'; msgEl.style.color = '#b91c1c'; }
  }

  async function token() {
    try { var r = await sb.auth.getSession(); return r && r.data && r.data.session ? r.data.session.access_token : null; }
    catch (e) { return null; }
  }

  function chip(status) {
    var map = {
      new:           { t: 'Received', bg: '#eef2ff', fg: '#4338ca', dot: '#6366f1' },
      sourcing:      { t: 'Sourcing', bg: '#fff7e6', fg: '#b45309', dot: '#f59e0b' },
      ready:         { t: 'Ready',    bg: '#ecfdf5', fg: '#047857', dot: '#10b981' },
      cannot_source: { t: 'Not added',bg: '#fef2f2', fg: '#b91c1c', dot: '#ef4444' }
    };
    var c = map[status] || map.new;
    return '<span style="display:inline-flex;align-items:center;gap:6px;background:' + c.bg + ';color:' + c.fg + ';font-size:0.73rem;font-weight:600;padding:4px 11px;border-radius:999px;white-space:nowrap;">' +
      '<span style="width:6px;height:6px;border-radius:50%;background:' + c.dot + ';"></span>' + c.t + '</span>';
  }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Show a tidy version of the link (host + path, no messy query string).
  function pretty(link) {
    try { var u = new URL(link); return esc((u.hostname + u.pathname).replace(/^www\./, '').replace(/\/$/, '')); }
    catch (e) { return esc(String(link).split('?')[0]); }
  }

  async function loadMine() {
    var tk = await token();
    if (!tk) return;
    try {
      var res = await fetch('/.netlify/functions/tender-request-mine', { headers: { Authorization: 'Bearer ' + tk } });
      var data = await res.json();
      applyAllowance(data);
      var rows = (data && data.requests) || [];
      if (!rows.length) { mineEl.innerHTML = ''; return; }
      var html = '<div style="font-size:0.72rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#9aa3b2;margin:0 0 4px;padding-top:18px;border-top:1px solid #eef1f5;">Your requests</div>';
      rows.forEach(function (r) {
        var when = r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #f2f4f7;">' +
          '<div style="min-width:0;"><div style="font-size:0.86rem;color:var(--navy);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + pretty(r.link) + '</div>' +
          '<div style="font-size:0.75rem;color:var(--muted);margin-top:2px;">Requested ' + when + '</div></div>' +
          chip(r.status) + '</div>';
      });
      mineEl.innerHTML = html;
    } catch (e) { /* silent */ }
  }

  sendEl.addEventListener('click', async function () {
    var link = (linkEl.value || '').trim();
    msgEl.textContent = '';
    msgEl.style.color = '';
    if (!link) { msgEl.textContent = 'Please paste the tender link.'; msgEl.style.color = '#b91c1c'; return; }
    if (!/^https?:\/\/.+/i.test(link)) { msgEl.textContent = 'That does not look like a link. It should start with http.'; msgEl.style.color = '#b91c1c'; return; }
    var tk = await token();
    if (!tk) { msgEl.textContent = 'Please sign in again to send a request.'; msgEl.style.color = '#b91c1c'; return; }

    sendEl.disabled = true;
    var original = sendEl.textContent;
    sendEl.textContent = 'Sending...';
    try {
      var res = await fetch('/.netlify/functions/tender-request-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
        body: JSON.stringify({ link: link, note: (noteEl.value || '').trim() })
      });
      var data = await res.json();
      if (!res.ok) { msgEl.textContent = (data && data.error) || 'Something went wrong. Please try again.'; msgEl.style.color = '#b91c1c'; }
      else {
        msgEl.textContent = 'Got it. We are on it and will email you when it is ready.';
        msgEl.style.color = '#166534';
        linkEl.value = ''; noteEl.value = '';
        loadMine();
      }
    } catch (e) {
      msgEl.textContent = 'Something went wrong. Please try again.'; msgEl.style.color = '#b91c1c';
    } finally {
      sendEl.disabled = false; sendEl.textContent = original;
    }
  });

  loadMine();
})();
