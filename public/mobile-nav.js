/**
 * Mobile navigation.
 *
 * Every page has its own <nav> and none of them collapsed on a phone, which
 * forced the whole page wider than the screen. Rather than edit ten navs by
 * hand, this enhances whatever nav is already on the page: it hides the desktop
 * links below a breakpoint and puts them behind a button instead.
 *
 * The panel is built fresh each time it opens, so it always matches the current
 * nav. That matters because some pages rewrite their nav in JavaScript once the
 * member is signed in.
 */
(function () {
  var BREAKPOINT = 860;

  function injectStyles() {
    if (document.getElementById('mnav-styles')) return;
    var css = document.createElement('style');
    css.id = 'mnav-styles';
    css.textContent = [
      '.mnav-btn{display:none;align-items:center;justify-content:center;width:42px;height:42px;',
      'margin-left:auto;background:transparent;border:0;padding:0;cursor:pointer;color:inherit;border-radius:10px}',
      '.mnav-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}',
      '.mnav-btn span{display:block;width:21px;height:2px;background:currentColor;border-radius:2px;',
      'position:relative;transition:background .18s ease}',
      '.mnav-btn span::before,.mnav-btn span::after{content:"";position:absolute;left:0;width:21px;height:2px;',
      'background:currentColor;border-radius:2px;transition:transform .18s ease,top .18s ease}',
      '.mnav-btn span::before{top:-7px}.mnav-btn span::after{top:7px}',
      '.mnav-open .mnav-btn span{background:transparent}',
      '.mnav-open .mnav-btn span::before{top:0;transform:rotate(45deg)}',
      '.mnav-open .mnav-btn span::after{top:0;transform:rotate(-45deg)}',

      '.mnav-panel{position:fixed;left:0;right:0;z-index:9998;display:none;flex-direction:column;',
      'padding:14px 20px 26px;gap:2px;overflow-y:auto;-webkit-overflow-scrolling:touch;',
      'box-shadow:0 22px 40px -22px rgba(11,25,41,.4)}',
      '.mnav-panel.is-open{display:flex}',
      '.mnav-panel a,.mnav-panel button{display:block;width:100%;text-align:left;font-size:17px;',
      'font-weight:600;padding:15px 4px;border:0;background:transparent;text-decoration:none;',
      'border-bottom:1px solid rgba(127,143,155,.18);cursor:pointer;font-family:inherit}',
      '.mnav-panel a:last-child,.mnav-panel button:last-child{border-bottom:0}',
      '.mnav-scrim{position:fixed;inset:0;z-index:9997;background:rgba(11,25,41,.4);display:none}',
      '.mnav-scrim.is-open{display:block}',

      '@media(max-width:' + BREAKPOINT + 'px){',
      '.mnav-hide{display:none!important}',
      '.mnav-btn{display:flex}',
      '}',
      '@media(min-width:' + (BREAKPOINT + 1) + 'px){',
      '.mnav-panel,.mnav-scrim{display:none!important}',
      '}'
    ].join('');
    document.head.appendChild(css);
  }

  function init() {
    var nav = document.querySelector('nav');
    if (!nav || nav.querySelector('.mnav-btn')) return;

    injectStyles();

    var btn = document.createElement('button');
    btn.className = 'mnav-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.appendChild(document.createElement('span'));

    // Sit inside the nav's own flex row where there is one, so the button lines
    // up with the logo rather than dropping onto a line of its own.
    //
    // Some pages wrap the row in a container, others hang the logo, links and
    // buttons straight off <nav>. Only treat a lone child as the row: taking
    // firstElementChild blindly picks the logo on the unwrapped pages and hides
    // the wordmark instead of the menu.
    var host = nav.querySelector('.nav-in');
    if (!host) {
      host = (nav.children.length === 1 && nav.firstElementChild.children.length > 1)
        ? nav.firstElementChild
        : nav;
    }

    // The pages do not share nav markup: some use .nav-links and .nav-right,
    // others a bare <ul> and .nav-auth. So rather than naming classes, keep the
    // logo and hide every other block in the row. Works whatever the markup.
    var kids = [].slice.call(host.children);
    var logo = null;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].tagName === 'A' && (kids[i].querySelector('svg, img') || /logo|brand/i.test(kids[i].className))) {
        logo = kids[i];
        break;
      }
    }
    if (!logo && kids.length) logo = kids[0];

    var hidden = [];
    kids.forEach(function (el) {
      if (el === logo) return;
      el.classList.add('mnav-hide');
      hidden.push(el);
    });

    host.appendChild(btn);

    var scrim = document.createElement('div');
    scrim.className = 'mnav-scrim';
    var panel = document.createElement('div');
    panel.className = 'mnav-panel';
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    function paint() {
      // Match whatever the nav looks like on this page, light or dark. Navs are
      // often translucent so they blur what is behind them; the panel must not
      // be, or the page shows straight through the menu.
      var navBg = getComputedStyle(nav).backgroundColor;
      var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/.exec(navBg || '');
      var solid = '#ffffff';
      if (m) {
        var alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
        // Fully transparent means the nav sits on the page background, so fall
        // back to white rather than inheriting nothing.
        if (alpha > 0.05) solid = 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')';
      }
      panel.style.background = solid;
      panel.style.color = getComputedStyle(nav).color;
      var r = nav.getBoundingClientRect();
      panel.style.top = Math.max(0, r.bottom) + 'px';
      panel.style.maxHeight = 'calc(100vh - ' + Math.max(0, r.bottom) + 'px)';
      scrim.style.top = Math.max(0, r.bottom) + 'px';
    }

    function build() {
      panel.innerHTML = '';
      // Rebuilt on every open so it reflects the signed in nav, which some
      // pages write after load.
      hidden.forEach(function (block) {
        var items = block.matches('a, button')
          ? [block]
          : [].slice.call(block.querySelectorAll('a, button'));
        items.forEach(function (el) {
          if (!el.textContent.trim()) return;
          var copy = el.cloneNode(true);
          copy.style.color = 'inherit';
          copy.style.background = 'transparent';
          copy.addEventListener('click', function () { close(); });
          panel.appendChild(copy);
        });
      });
    }

    function open() {
      build();
      paint();
      panel.classList.add('is-open');
      scrim.classList.add('is-open');
      document.documentElement.classList.add('mnav-open');
      document.body.style.overflow = 'hidden';
      btn.setAttribute('aria-expanded', 'true');
    }

    function close() {
      panel.classList.remove('is-open');
      scrim.classList.remove('is-open');
      document.documentElement.classList.remove('mnav-open');
      document.body.style.overflow = '';
      btn.setAttribute('aria-expanded', 'false');
    }

    function toggle() {
      if (panel.classList.contains('is-open')) close(); else open();
    }

    btn.addEventListener('click', toggle);
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > BREAKPOINT) close(); else if (panel.classList.contains('is-open')) paint();
    });
    window.addEventListener('scroll', function () {
      if (panel.classList.contains('is-open')) paint();
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
