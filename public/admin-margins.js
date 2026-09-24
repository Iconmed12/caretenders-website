// Owner-only margin model inside the admin panel. Pure client-side calculator,
// no data leaves the page. Element ids are mm-prefixed and styles are scoped to
// #page-margins so nothing clashes with the rest of the admin app.
(function () {
  function gbp(n) { if (!isFinite(n)) return '-'; return '£' + Math.round(n).toLocaleString('en-GB'); }
  function pence(n) { return (Math.round(n * 100) / 100).toFixed(2) + 'p'; }
  function num(id) { var el = document.getElementById(id); if (!el) return 0; var v = parseFloat(el.value); return isFinite(v) ? v : 0; }

  var TIERS = [
    { key: 'access', name: 'Access', seats: 1, price: 99 },
    { key: 'pro', name: 'Pro', seats: 5, price: 299 },
    { key: 'business', name: 'Business', seats: 20, price: 799 }
  ];
  var ADDONS = [
    { name: 'Expert review', charge: 350, cost: 150 },
    { name: 'PSQ / SQ completion', charge: 600, cost: 250 },
    { name: 'ITT / form completion', charge: 800, cost: 350 },
    { name: 'Full service', charge: 1500, cost: 600 }
  ];
  var TERMS = [{ m: 6, rate: 499 }, { m: 12, rate: 399 }, { m: 24, rate: 329 }, { m: 36, rate: 279 }];

  function costPerBid() {
    // engine rates: input 240p per 1M tokens, output 1200p per 1M tokens
    return ((num('mmInTok') * 240 / 1e6) + (num('mmOutTok') * 1200 / 1e6) + num('mmResearch')) / 100;
  }

  function render() {
    if (!document.getElementById('mmCostPerBid')) return; // section not present
    var cpb = costPerBid();
    document.getElementById('mmCostPerBid').textContent = pence(cpb * 100);

    var bidsUser = num('mmBidsPerUser'), oh = num('mmOverhead');

    TIERS.forEach(function (t) { var el = document.getElementById('mmprice-' + t.key); if (el) t.price = parseFloat(el.value) || 0; });

    var tb = document.getElementById('mmTierBody'); tb.innerHTML = '';
    TIERS.forEach(function (t) {
      var rev = t.price * 12;
      var aiCost = t.seats * bidsUser * cpb;
      var profit = rev - aiCost - oh;
      var margin = rev > 0 ? (profit / rev * 100) : 0;
      tb.innerHTML += '<tr><td>' + t.name + ' <span class="mm-seats">' + t.seats + (t.seats > 1 ? ' users' : ' user') + '</span></td>' +
        '<td><input class="mm-price-in" id="mmprice-' + t.key + '" type="number" value="' + t.price + '"></td>' +
        '<td class="mm-mono">' + gbp(rev) + '</td>' +
        '<td class="mm-mono">' + gbp(aiCost) + '</td>' +
        '<td class="mm-mono mm-profit ' + (profit >= 0 ? 'mm-pos' : 'mm-neg') + '">' + gbp(profit) + '</td>' +
        '<td class="mm-mono ' + (margin >= 0 ? 'mm-pos' : 'mm-neg') + '">' + Math.round(margin) + '%</td></tr>';
    });
    TIERS.forEach(function (t) { var el = document.getElementById('mmprice-' + t.key); if (el) el.addEventListener('input', render); });

    var planSel = document.getElementById('mmTermPlan');
    var plan = TIERS.filter(function (t) { return t.key === (planSel ? planSel.value : 'pro'); })[0] || TIERS[1];
    var tg = document.getElementById('mmTermGrid'); tg.innerHTML = '';
    TERMS.forEach(function (tm, i) {
      var cv = tm.rate * tm.m;
      var aiCostTerm = plan.seats * bidsUser * cpb * (tm.m / 12);
      var profit = cv - aiCostTerm;
      tg.innerHTML += '<div class="mm-term"><div class="t">' + tm.m + ' months</div>' +
        '<div class="r">£<input class="mm-price-in" style="width:66px;text-align:center" id="mmterm-' + i + '" type="number" value="' + tm.rate + '">/mo</div>' +
        '<div class="cv">' + gbp(cv) + '</div><div class="cvl">contract value</div>' +
        '<div class="cvl" style="margin-top:6px">profit after AI: <b class="' + (profit >= 0 ? 'mm-pos' : 'mm-neg') + '">' + gbp(profit) + '</b></div></div>';
    });
    TERMS.forEach(function (tm, i) { var el = document.getElementById('mmterm-' + i); if (el) el.addEventListener('input', function () { TERMS[i].rate = parseFloat(el.value) || 0; render(); }); });

    var ab = document.getElementById('mmAddonBody'); ab.innerHTML = '';
    ADDONS.forEach(function (a, i) {
      ab.innerHTML += '<tr><td>' + a.name + '</td>' +
        '<td><input class="mm-price-in" id="mmac-' + i + '" type="number" value="' + a.charge + '"></td>' +
        '<td><input class="mm-price-in" id="mmacost-' + i + '" type="number" value="' + a.cost + '"></td>' +
        '<td class="mm-mono mm-profit mm-pos">' + gbp(a.charge - a.cost) + '</td></tr>';
    });
    ADDONS.forEach(function (a, i) {
      var c = document.getElementById('mmac-' + i), k = document.getElementById('mmacost-' + i);
      if (c) c.addEventListener('input', function () { a.charge = parseFloat(c.value) || 0; render(); });
      if (k) k.addEventListener('input', function () { a.cost = parseFloat(k.value) || 0; render(); });
    });

    // scenario: Business, 36 months, plus reviews and full-service jobs
    var biz = TIERS[2], term36 = TERMS[3];
    var licence = term36.rate * 36;
    var licenceAI = biz.seats * bidsUser * cpb * 3;
    var review = ADDONS[0], reviewsOver3yr = 20, reviewProfit = reviewsOver3yr * (review.charge - review.cost);
    var full = ADDONS[3], fullOver3yr = 5, fullProfit = fullOver3yr * (full.charge - full.cost);
    var total = (licence - licenceAI) + reviewProfit + fullProfit;
    var sb = document.getElementById('mmScenarioBody');
    if (sb) sb.innerHTML =
      '<div class="mm-sline"><span>Business licence, 36 months (' + gbp(term36.rate) + '/mo)</span><span class="v">' + gbp(licence) + '</span></div>' +
      '<div class="mm-sline"><span>Less AI cost to serve over 3 years</span><span class="v">-' + gbp(licenceAI) + '</span></div>' +
      '<div class="mm-sline"><span>20 expert reviews (' + gbp(review.charge - review.cost) + ' profit each)</span><span class="v">' + gbp(reviewProfit) + '</span></div>' +
      '<div class="mm-sline"><span>5 full-service jobs (' + gbp(full.charge - full.cost) + ' profit each)</span><span class="v">' + gbp(fullProfit) + '</span></div>' +
      '<div class="mm-stot"><span>Profit from one customer over 3 years</span><span class="v">' + gbp(total) + '</span></div>';
  }

  function init() {
    ['mmInTok', 'mmOutTok', 'mmResearch', 'mmBidsPerUser', 'mmOverhead', 'mmTermPlan'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener('input', render); el.addEventListener('change', render); }
    });
    render();
  }

  window.initMargins = init;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
