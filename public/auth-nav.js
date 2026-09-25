/*
 * Shared logged-in nav for the public pages (homepage, tenders).
 *
 * The problem this solves: the nav used to start logged-out (or show the name)
 * and only correct once the Supabase library loaded, which flashed the wrong
 * thing. This renders the right nav immediately from a tiny cache in the
 * browser (cana_nav), then quietly verifies with Supabase and refreshes it.
 *
 * Load this with a normal (blocking) script tag right after the <nav>, so it
 * runs before the page paints and there is no flash for a returning member.
 */
(function () {
  var REF = 'igpjfpncfuawikoyzfcd';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';

  var target = document.getElementById('nav-right') || document.getElementById('nav-auth');
  if (!target) return;
  var loggedOutHTML = target.innerHTML; // keep the original so we can restore it

  // Plan coin: Gold plan gets a gold coin, Access/Pro get teal, unknown a plain teal.
  function planStyle(plan) {
    if (plan === 'gold') return { grad: 'radial-gradient(circle at 34% 28%,#f8ebb4,#d8b038)', fg: '#5f4c0e' };
    return { grad: 'radial-gradient(circle at 34% 28%,#d6f3f8,#00c9e0)', fg: '#04303a' };
  }
  function planLabel(plan) {
    if (!plan) return 'Member';
    return plan.charAt(0).toUpperCase() + plan.slice(1) + ' member';
  }

  function chipHTML(plan) {
    var out = '';
    // Members get a coin + plan name (Access / Pro / Gold). Non-members get nothing.
    if (plan !== false) {
      var t = planStyle(plan);
      var ch = plan ? plan.charAt(0).toUpperCase() : 'M';
      var coin = '<span style="width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;background:' + t.grad + ';color:' + t.fg + ';box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.55),0 1px 2px rgba(0,0,0,.2)">' + ch + '</span>';
      out += '<a href="/dashboard.html" style="display:inline-flex;align-items:center;gap:9px;text-decoration:none;color:#0b1929;font-weight:600;font-size:14.5px;margin-right:14px">' + coin + '<span>' + planLabel(plan) + '</span></a>';
    }
    out += '<a href="/dashboard.html" style="display:inline-block;background:#00c9e0;color:#04303a;font-weight:700;border-radius:10px;padding:9px 16px;text-decoration:none;font-size:14px;margin-right:12px">My dashboard</a>' +
      '<a href="#" data-signout style="color:#5b6b78;font-size:13px;text-decoration:none;cursor:pointer">Sign out</a>';
    return out;
  }

  function showChip(tier) { target.innerHTML = chipHTML(tier); }
  function showLoggedOut() { target.innerHTML = loggedOutHTML; }

  // 1. Instant render from cache, so a returning member never sees the wrong nav.
  try {
    var cached = JSON.parse(localStorage.getItem('cana_nav') || 'null');
    if (cached && cached.signedIn) showChip(cached.member ? (cached.plan || null) : false);
  } catch (e) {}

  // 2. Verify with Supabase once the library is available, then refresh + cache.
  var tries = 0;
  (function verify() {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      if (tries++ > 40) return; // give up after ~6s; cache view stands
      return setTimeout(verify, 150);
    }
    var sb = supabase.createClient('https://' + REF + '.supabase.co', ANON);
    window._canaSb = sb;
    sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      var email = s && s.user && String(s.user.email || '').toLowerCase();
      // No session, or an internal staff/owner account: this is not a customer.
      if (!email || email.indexOf('getcana.co.uk') !== -1) {
        try { localStorage.removeItem('cana_nav'); } catch (e) {}
        showLoggedOut();
        return;
      }
      // Safety net: if this browser has a pending team invite (from an invite
      // link where the confirmation round trip did not return the person to the
      // join page), finish joining them now that they are signed in.
      try {
        var pend = localStorage.getItem('cana_pending_invite');
        if (pend && s.access_token) {
          fetch('/.netlify/functions/enterprise-accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
            body: JSON.stringify({ token: pend })
          }).then(function (rr) {
            if (rr.ok || [400, 404, 409, 410].indexOf(rr.status) >= 0) { try { localStorage.removeItem('cana_pending_invite'); } catch (e) {} }
          }).catch(function () {});
        }
      } catch (e) {}
      fetch('/.netlify/functions/check-membership?email=' + encodeURIComponent(email))
        .then(function (x) { return x.json(); })
        .then(function (mem) {
          var isMem = !!(mem && mem.member);
          showChip(isMem ? (mem.plan || null) : false);
          try { localStorage.setItem('cana_nav', JSON.stringify({ signedIn: true, member: isMem, plan: (mem && mem.plan) || null })); } catch (e) {}
        })
        .catch(function () { showChip(false); });
    }).catch(function () {});
  })();

  // Sign out from the chip.
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('[data-signout]') : null;
    if (!link) return;
    e.preventDefault();
    try { localStorage.removeItem('cana_nav'); } catch (e2) {}
    if (window._canaSb) {
      window._canaSb.auth.signOut().then(function () { location.href = '/'; }).catch(function () { location.href = '/'; });
    } else {
      location.href = '/';
    }
  });
})();
