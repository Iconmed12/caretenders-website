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

  // Store badges in the footer (coming soon, non-clickable) so every page that
  // loads this file shows them. Swap the spans for links once the apps are public.
  function badgeRow() {
    var apple = '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true"><path d="M16.365 1.43c0 1.14-.42 2.2-1.12 2.99-.85.95-2.24 1.69-3.4 1.6-.14-1.11.44-2.29 1.1-3.03.75-.85 2.06-1.48 3.16-1.56.02.06.02.12.02.18zM20.5 17.02c-.55 1.27-.81 1.84-1.52 2.96-.99 1.56-2.39 3.5-4.12 3.52-1.54.01-1.93-1-4.02-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.77-4.04-3.33C-.02 16.9-.28 12.1 1.4 9.55c1.1-1.68 2.84-2.66 4.47-2.66 1.66 0 2.7 1.01 4.07 1.01 1.33 0 2.14-1.01 4.06-1.01 1.45 0 2.99.79 4.09 2.15-3.6 1.97-3.01 7.11.41 8.98z"/></svg>';
    var play = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#00e0ff" d="M3.7 2.1c-.3.2-.5.5-.5 1v17.8c0 .5.2.8.5 1l9.8-9.9z"/><path fill="#00e676" d="M16.9 8.4 4.9 1.5c-.4-.2-.8-.2-1.1 0l9.7 9.8z"/><path fill="#ff3d00" d="m16.9 8.4-3.4 2.9 3.4 3 3.3-1.9c.8-.5.8-1.6 0-2.1z"/><path fill="#ffc107" d="M3.8 21.9c.3.2.7.2 1.1 0l12-6.9-3.4-3z"/></svg>';
    var box = 'display:inline-flex;align-items:center;gap:10px;background:#17293d;border:1px solid rgba(255,255,255,0.14);color:#fff;border-radius:12px;padding:9px 16px;';
    var txt = 'display:flex;flex-direction:column;line-height:1.15;text-align:left;';
    return '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">'
      + '<span aria-label="Coming soon on the App Store" style="' + box + '">' + apple + '<span style="' + txt + '"><small style="font-size:10px;color:#aab8c4;">Coming soon on the</small><b style="font-size:16px;font-weight:700;">App Store</b></span></span>'
      + '<span aria-label="Coming soon on Google Play" style="' + box + '">' + play + '<span style="' + txt + '"><small style="font-size:10px;color:#aab8c4;">Coming soon on</small><b style="font-size:16px;font-weight:700;">Google Play</b></span></span>'
      + '</div>';
  }
  function addStoreBadges() {
    if (document.getElementById('cana-store-badges')) return;
    var f = document.querySelector('footer');
    if (!f) return;
    var wrap = document.createElement('div');
    wrap.id = 'cana-store-badges';
    wrap.setAttribute('style', 'display:flex;flex-direction:column;align-items:center;gap:12px;padding:28px 16px 6px;border-top:1px solid rgba(255,255,255,0.08);margin-top:20px;');
    wrap.innerHTML = '<div style="font-size:13px;font-weight:600;color:#cdd8e0;">Get the Cana Bids app</div>' + badgeRow();
    f.appendChild(wrap);
  }

  // Mobile menu: the nav links (Home, Opportunities, Pricing, Case Studies,
  // Contact) are hidden under 860px, so without this there is no way to reach
  // them on a phone. We add a hamburger that opens a dropdown built from the
  // existing links and the account buttons. One file, every marketing page.
  function injectMobileNavCss() {
    if (document.getElementById('ch-mobile-css')) return;
    var css = ''
      + '.ch-burger{display:none;background:none;border:0;cursor:pointer;width:42px;height:42px;flex-direction:column;justify-content:center;align-items:center;gap:5px;justify-self:end;padding:0;margin:0}'
      + '.ch-burger span{display:block;width:22px;height:2px;background:#0b1929;border-radius:2px;transition:transform .2s,opacity .2s}'
      + 'body.ch-open .ch-burger span:nth-child(1){transform:translateY(7px) rotate(45deg)}'
      + 'body.ch-open .ch-burger span:nth-child(2){opacity:0}'
      + 'body.ch-open .ch-burger span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}'
      + '#ch-mpanel{display:none;position:fixed;left:0;right:0;background:#fff;border-bottom:1px solid #eef1f5;box-shadow:0 12px 24px rgba(11,25,41,.10);z-index:299}'
      + 'body.ch-open #ch-mpanel{display:block}'
      + '#ch-mpanel a{display:block;padding:15px 22px;color:#0b1929;text-decoration:none;font-size:1.02rem;font-weight:600;font-family:Inter,system-ui,Arial,sans-serif;border-bottom:1px solid #f1f4f7}'
      + '#ch-mpanel .ch-mauth{background:#f8fafb}'
      + '#ch-mpanel .ch-mauth a:last-child{border-bottom:0}'
      + '@media(min-width:861px){#ch-mpanel{display:none!important}}'
      + '@media(max-width:860px){.ch-burger{display:flex}#cana-header .ch-auth{display:none}}';
    var s = document.createElement('style');
    s.id = 'ch-mobile-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function fillMobilePanel() {
    var panel = document.getElementById('ch-mpanel');
    if (!panel) return;
    var header = document.getElementById('cana-header');
    if (header) panel.style.top = header.offsetHeight + 'px';
    var links = document.querySelector('#cana-header .ch-links');
    var auth = document.querySelector('#cana-header .ch-auth');
    var html = '';
    if (links) links.querySelectorAll('a').forEach(function (a) {
      html += '<a href="' + a.getAttribute('href') + '">' + a.textContent + '</a>';
    });
    var authHtml = '';
    if (auth) auth.querySelectorAll('a').forEach(function (a) {
      var so = a.getAttribute('data-signout') !== null ? ' data-signout' : '';
      authHtml += '<a href="' + (a.getAttribute('href') || '#') + '"' + so + '>' + a.textContent + '</a>';
    });
    panel.innerHTML = html + (authHtml ? '<div class="ch-mauth">' + authHtml + '</div>' : '');
  }

  function buildMobileNav() {
    var nav = document.querySelector('#cana-header .ch-nav');
    if (!nav) return;
    injectMobileNavCss();
    if (!document.getElementById('ch-mpanel')) {
      var panel = document.createElement('div');
      panel.id = 'ch-mpanel';
      document.getElementById('cana-header').appendChild(panel);
      panel.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('a')) document.body.classList.remove('ch-open');
      });
    }
    if (!document.getElementById('ch-burger')) {
      var burger = document.createElement('button');
      burger.id = 'ch-burger';
      burger.className = 'ch-burger';
      burger.type = 'button';
      burger.setAttribute('aria-label', 'Menu');
      burger.setAttribute('aria-expanded', 'false');
      burger.innerHTML = '<span></span><span></span><span></span>';
      nav.appendChild(burger);
      burger.addEventListener('click', function () {
        var open = document.body.classList.toggle('ch-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) fillMobilePanel();
      });
    }
    window.addEventListener('resize', function () {
      if (window.innerWidth > 860) document.body.classList.remove('ch-open');
    });
  }

  removeOldNavs();
  buildMobileNav();
  document.addEventListener('DOMContentLoaded', function () { removeOldNavs(); buildMobileNav(); addStoreBadges(); });
  addStoreBadges();
  verify();
})();
