/*
 * Mobile menu for the logged-in dashboard sidebar (.side).
 *
 * On phones the sidebar turns into a top bar and its nav links wrap across
 * several rows, which looks cluttered. This collapses them behind a hamburger:
 * tap to drop the links down, tap a link (or resize to desktop) to close.
 * Self-contained (injects its own CSS); include on every page that uses .side.
 */
(function () {
  function injectCss() {
    if (document.getElementById('dash-nav-css')) return;
    var css = ''
      + '.dash-burger{display:none}'
      + '@media(max-width:820px){'
      +   '.side{position:relative}'
      +   '.shell{grid-template-columns:minmax(0,1fr)}.main{min-width:0}'
      +   'html,body{overflow-x:hidden}'
      +   '.dash-burger{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;position:absolute;top:13px;right:14px;width:42px;height:42px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:10px;cursor:pointer;padding:0;z-index:5}'
      +   '.dash-burger span{display:block;width:20px;height:2px;background:#fff;border-radius:2px;transition:transform .2s,opacity .2s}'
      +   '.side.nav-open .dash-burger span:nth-child(1){transform:translateY(7px) rotate(45deg)}'
      +   '.side.nav-open .dash-burger span:nth-child(2){opacity:0}'
      +   '.side.nav-open .dash-burger span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}'
      +   '.side .nav{display:none!important;flex-direction:column!important;flex-wrap:nowrap!important;gap:2px!important;margin-top:6px}'
      +   '.side .side-foot,.side .org{display:none!important}'
      +   '.side.nav-open .nav{display:flex!important}'
      +   '.side.nav-open .side-foot{display:flex!important}'
      +   '.side.nav-open .org{display:block!important}'
      +   '.side .nav a{width:100%}'
      + '}';
    var s = document.createElement('style');
    s.id = 'dash-nav-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function build() {
    var side = document.querySelector('.side');
    if (!side) return;
    injectCss();
    if (side.querySelector('.dash-burger')) return;

    var burger = document.createElement('button');
    burger.type = 'button';
    burger.className = 'dash-burger';
    burger.setAttribute('aria-label', 'Menu');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML = '<span></span><span></span><span></span>';
    side.appendChild(burger);
    burger.addEventListener('click', function () {
      var open = side.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    var nav = side.querySelector('.nav');
    if (nav) nav.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) side.classList.remove('nav-open');
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 820) side.classList.remove('nav-open');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
