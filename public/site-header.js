/*
 * One shared public header for every marketing page, so the header is identical
 * across the site: same height, same white background, links centred, and the
 * account area (status + My dashboard + Sign out, or Log in + Get started) always
 * pinned to the right. This replaces each page's own <nav>, which had drifted to
 * different links, heights and colours.
 *
 * Load it with a normal <script src="/site-header.js"></script> in <head>.
 */
(function () {
  var REF = 'igpjfpncfuawikoyzfcd';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';

  // Hide any existing page nav straight away so it never flashes before ours.
  var hide = document.createElement('style');
  hide.textContent = [
    'nav:not(.ch-nav){display:none!important}',
    // Reserve the header height immediately (before the header is inserted) so the
    // page never jumps: the header is fixed and overlays this reserved space.
    'body{padding-top:67px!important}',
    '#cana-header{position:fixed;top:0;left:0;right:0;z-index:300;background:#fff;border-bottom:1px solid #eef1f5;font-family:Inter,system-ui,Arial,sans-serif}',
    '#cana-header .ch-nav{max-width:1280px;margin:0 auto;padding:0 2rem;height:66px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem}',
    '#cana-header .ch-logo{justify-self:start;display:inline-flex;align-items:center;gap:9px;text-decoration:none;line-height:1}',
    '#cana-header .ch-word{font-weight:700;font-size:1.5rem;letter-spacing:-0.02em;color:#0b1929}',
    '#cana-header .ch-word b{color:#00C9E0;font-weight:700;margin-left:0.3em}',
    '#cana-header .ch-links{justify-self:center;display:flex;gap:1.9rem;list-style:none;margin:0;padding:0}',
    '#cana-header .ch-links a{color:#33475b;text-decoration:none;font-size:0.92rem;font-weight:500;white-space:nowrap}',
    '#cana-header .ch-links a.on,#cana-header .ch-links a:hover{color:#0891a3}',
    '#cana-header .ch-auth{justify-self:end;display:flex;align-items:center;gap:14px;white-space:nowrap}',
    '#cana-header .ch-btn{background:#00c9e0;color:#04303a;font-weight:700;border-radius:10px;padding:9px 16px;text-decoration:none;font-size:14px}',
    '#cana-header .ch-btn:hover{filter:brightness(.96)}',
    '#cana-header .ch-link{color:#5b6b78;font-size:13px;text-decoration:none;cursor:pointer;background:none;border:none;font-family:inherit}',
    '#cana-header .ch-link:hover{color:#0b1929}',
    '#cana-header .ch-status{display:inline-flex;align-items:center;gap:9px;color:#0b1929;font-weight:600;font-size:14px}',
    '#cana-header .ch-coin{width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800}',
    '@media(max-width:860px){#cana-header .ch-links{display:none}#cana-header .ch-nav{grid-template-columns:1fr auto;padding:0 1rem}#cana-header .ch-status{display:none}}'
  ].join('');
  (document.head || document.documentElement).appendChild(hide);

  var LINKS = [['/', 'Home'], ['/tenders.html', 'Opportunities'], ['/plans.html', 'Pricing'], ['/case-studies.html', 'Case Studies'], ['/contact.html', 'Contact']];

  function here() { return location.pathname.replace(/\/index\.html$/, '/'); }
  function isOn(h) { var p = here(); if (h === '/') return p === '/' || p === ''; return p.indexOf(h) === 0; }

  function loggedOutHTML() {
    return '<a href="/login.html" class="ch-link">Log in</a><a href="/register.html" class="ch-btn">Get started</a>';
  }
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
  function setAuth(html) { var a = document.getElementById('nav-right'); if (a) a.innerHTML = html; }

  function build() {
    if (document.getElementById('cana-header')) return;
    var logo = '<a href="/" class="ch-logo"><svg viewBox="0 0 64 64" style="height:40px;width:40px;flex:none" aria-hidden="true"><path d="M46 17 A22 22 0 1 0 46 47" fill="none" stroke="#0b1929" stroke-width="7" stroke-linecap="round"/><path d="M24 33 l6 6 L44 22" fill="none" stroke="#00C9E0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="ch-word">Cana<b>Bids</b></span></a>';
    var links = '<ul class="ch-links">' + LINKS.map(function (l) { return '<li><a href="' + l[0] + '"' + (isOn(l[0]) ? ' class="on"' : '') + '>' + l[1] + '</a></li>'; }).join('') + '</ul>';
    var header = document.createElement('header');
    header.id = 'cana-header';
    header.innerHTML = '<nav class="ch-nav">' + logo + links + '<div class="ch-auth" id="nav-right">' + loggedOutHTML() + '</div></nav>';
    document.body.insertBefore(header, document.body.firstChild);
    document.querySelectorAll('nav').forEach(function (n) { if (!n.classList.contains('ch-nav')) n.remove(); });

    // Instant render from cache so a returning member never sees the wrong state.
    try { var c = JSON.parse(localStorage.getItem('cana_nav') || 'null'); if (c && c.signedIn) setAuth(memberHTML(c.member ? (c.plan || null) : false)); } catch (e) {}
    verify();
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

  // Sign out from the account area.
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('[data-signout]') : null;
    if (!link) return;
    e.preventDefault();
    try { localStorage.removeItem('cana_nav'); } catch (e2) {}
    if (window._canaSb) { window._canaSb.auth.signOut().then(function () { location.href = '/'; }).catch(function () { location.href = '/'; }); }
    else { location.href = '/'; }
  });

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
