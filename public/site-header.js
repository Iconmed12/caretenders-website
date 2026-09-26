/*
 * Verify-only companion for the shared public header.
 *
 * The header markup + CSS are baked into each page (so they render in the first
 * paint with no flicker), and a tiny inline script sets the account area from a
 * cache. This file only runs the background membership check, corrects the
 * account area if the cache was wrong, sweeps any leftover old <nav>, and wires
 * the Sign out link. It can load late (deferred) without affecting the header.
 */
(function () {
  var REF = 'igpjfpncfuawikoyzfcd';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';

  function removeOldNavs() { document.querySelectorAll('nav').forEach(function (n) { if (!n.classList.contains('ch-nav')) n.remove(); }); }
  function setAuth(html) { var a = document.getElementById('nav-right'); if (a) a.innerHTML = html; }
  function loggedOutHTML() { return '<a href="/login.html" class="ch-link">Log in</a><a href="/register.html" class="ch-btn">Get started</a>'; }
  function planStyle(p) {
    if (p === 'gold') return { grad: 'radial-gradient(circle at 34% 28%,#f8ebb4,#d8b038)', fg: '#5f4c0e' };
    return { grad: 'radial-gradient(circle at 34% 28%,#d6f3f8,#00c9e0)', fg: '#04303a' };
  }
  function memberHTML(plan) {
    var out = '';
    if (plan !== false) {
      var s = planStyle(plan), ch = plan ? plan.charAt(0).toUpperCase() : 'M', label = plan ? (plan.charAt(0).toUpperCase() + plan.slice(1) + ' member') : 'Member';
      out += '<span class="ch-status"><span class="ch-coin" style="background:' + s.grad + ';color:' + s.fg + ';box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.55),0 1px 2px rgba(0,0,0,.2)">' + ch + '</span>' + label + '</span>';
    }
    out += '<a href="/dashboard.html" class="ch-btn">My dashboard</a><a href="#" data-signout class="ch-link">Sign out</a>';
    return out;
  }

  function verify() {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = doVerify; document.head.appendChild(s);
      return;
    }
    doVerify();
  }
  function doVerify() {
    try {
      var sb = supabase.createClient('https://' + REF + '.supabase.co', ANON);
      window._canaSb = sb;
      sb.auth.getSession().then(function (r) {
        var sess = r && r.data && r.data.session;
        var email = sess && sess.user && String(sess.user.email || '').toLowerCase();
        if (!email || email.indexOf('getcana.co.uk') !== -1) {
          try { localStorage.removeItem('cana_nav'); } catch (e) {}
          setAuth(loggedOutHTML());
          return;
        }
        fetch('/.netlify/functions/check-membership?email=' + encodeURIComponent(email))
          .then(function (x) { return x.json(); })
          .then(function (mem) {
            var isMem = !!(mem && mem.member);
            setAuth(memberHTML(isMem ? (mem.plan || null) : false));
            try { localStorage.setItem('cana_nav', JSON.stringify({ signedIn: true, member: isMem, plan: (mem && mem.plan) || null })); } catch (e) {}
          })
          .catch(function () { setAuth(memberHTML(false)); });
      }).catch(function () {});
    } catch (e) {}
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('[data-signout]') : null;
    if (!link) return;
    e.preventDefault();
    try { localStorage.removeItem('cana_nav'); } catch (e2) {}
    if (window._canaSb) { window._canaSb.auth.signOut().then(function () { location.href = '/'; }).catch(function () { location.href = '/'; }); }
    else { location.href = '/'; }
  });

  removeOldNavs();
  document.addEventListener('DOMContentLoaded', removeOldNavs);
  verify();
})();
