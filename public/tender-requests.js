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

  async function token() {
    try { var r = await sb.auth.getSession(); return r && r.data && r.data.session ? r.data.session.access_token : null; }
    catch (e) { return null; }
  }

  function chip(status) {
    var map = {
      new:           { t: 'Received',    bg: '#eef2ff', fg: '#3730a3' },
      sourcing:      { t: 'Sourcing',    bg: '#fef9c3', fg: '#854d0e' },
      ready:         { t: 'Ready',       bg: '#dcfce7', fg: '#166534' },
      cannot_source: { t: 'Not added',   bg: '#fee2e2', fg: '#991b1b' }
    };
    var c = map[status] || map.new;
    return '<span style="background:' + c.bg + ';color:' + c.fg + ';font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;">' + c.t + '</span>';
  }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  async function loadMine() {
    var tk = await token();
    if (!tk) return;
    try {
      var res = await fetch('/.netlify/functions/tender-request-mine', { headers: { Authorization: 'Bearer ' + tk } });
      var data = await res.json();
      var rows = (data && data.requests) || [];
      if (!rows.length) { mineEl.innerHTML = ''; return; }
      var html = '<div style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">Your requests</div>' +
        '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
      rows.forEach(function (r, i) {
        var when = r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;' + (i ? 'border-top:1px solid var(--border);' : '') + '">' +
          '<div style="min-width:0;"><div style="font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(r.link) + '</div>' +
          '<div style="font-size:0.75rem;color:var(--muted);">Requested ' + when + '</div></div>' +
          chip(r.status) + '</div>';
      });
      html += '</div>';
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
