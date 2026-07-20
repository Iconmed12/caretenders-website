
  let allCareTenders       = [];
  let allCommercialTenders = [];
  let careFilter           = 'all';
  let commercialFilter     = 'all';

  // All possible care category values (full names, short names, legacy values)
  const CARE_CATS = [
    'domiciliary care','domiciliary',
    'residential',
    'nursing',
    'supported living','supported',
    'mental health','mental',
    'hospital discharge','discharge'
  ];
  // All possible commercial category values
  const COMMERCIAL_CATS = [
    'commercial',
    'construction',
    'facilities','facilities management',
    'cleaning',
    'consultancy',
    'it & digital','it','digital','it & services',
    'logistics',
    'transport','waste','security',
    'employment','business support','marketing','enterprise','training','recruitment',
    'other'
  ];

  // Employment / business-support programmes are never care (mirrors admin-core.js)
  const BUSINESS_TITLE_RE = /\b(start[ -]?up|business (support|growth|planning)|enterprise skills?|employab\w*|employment (support|programme|services?)|connect to work|careers?|digital marketing|ux|service design|incubat\w*|accelerat\w*)\b/i;

  function isCare(t) {
    if (BUSINESS_TITLE_RE.test(t.title||'')) return false;
    const cat = (t.category||'').toLowerCase().trim();
    if (!cat) {
      // No category fall back to is_non_cqc flag (care side) or treat as unknown
      return !!t.is_non_cqc;
    }
    // If it matches commercial list commercial
    if (COMMERCIAL_CATS.includes(cat)) return false;
    // If it matches care list care
    if (CARE_CATS.includes(cat)) return true;
    // Partial match fallback if it contains a commercial keyword
    const commercialKeywords = ['construction','facilit','cleaning','consultanc','logistic'];
    if (commercialKeywords.some(k => cat.includes(k))) return false;
    // Default to care for anything unrecognised on the care side
    return true;
  }

  // Tenders awaiting approval are not shown on the public site
  function isApproved(t) { return t.status !== 'pending_review' && t.status !== 'rejected'; }

  /* ── NAVIGATION ── */
  function showHome() {
    document.getElementById('home-view').style.display = '';
    document.getElementById('care-section').classList.remove('active');
    document.getElementById('commercial-section')?.classList.remove('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function showSection(type) {
    document.getElementById('home-view').style.display = 'none';
    document.getElementById('care-section').classList.remove('active');
    document.getElementById('commercial-section')?.classList.remove('active');
    document.getElementById(type+'-section').classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function setFilter(type,value,btn) {
    if(type==='care') careFilter=value; else commercialFilter=value;
    document.getElementById(type+'-filters').querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderTenders(type);
  }

  /* ── BADGE ── */
  function statusBadge(s) {
    const map={'Open':'badge-open','Closing soon':'badge-closing','Urgent':'badge-urgent','New opportunity':'badge-new'};
    return `<span class="tender-badge ${map[s]||'badge-new'}">${s||'Open'}</span>`;
  }

  /* ── RICH CARE CARD (for the redesigned Care Tenders page) ── */
  function fmtCloseDate(d){
    if(!d) return '';
    var dt=new Date(d);
    if(isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  }
  var CT_ICONS={
    cal:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    pound:'<svg viewBox="0 0 24 24"><path d="M7 20h10M9 20c1.6-1.6 2-3 2-5V8a3 3 0 016 0M7 13h6"/></svg>',
    clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin:'<svg viewBox="0 0 24 24"><path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
    bm:'<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h12v18l-6-4-6 4z"/></svg>'
  };
  /* Saved tenders (browser-local until user accounts exist) */
  function getSaved(){ try{ return JSON.parse(localStorage.getItem('cana_saved')||'[]'); }catch(e){ return []; } }
  function isSaved(id){ return getSaved().indexOf(String(id))!==-1; }
  function toggleSave(id, ev){
    if(ev){ ev.stopPropagation(); }
    id=String(id);
    var s=getSaved(); var i=s.indexOf(id);
    if(i===-1) s.push(id); else s.splice(i,1);
    try{ localStorage.setItem('cana_saved', JSON.stringify(s)); }catch(e){}
    var saved=s.indexOf(id)!==-1;
    var btn=ev&&ev.currentTarget;
    if(btn){ btn.classList.toggle('is-saved', saved); var l=btn.querySelector('.tc-save-label'); if(l) l.textContent = saved?'Saved':'Save'; }
  }
  window.toggleSave = toggleSave;

  function careCardHTML(t){
    var json=JSON.stringify(t).replace(/'/g,"&#39;");
    var org=String(t.org||t.organisation||'').toUpperCase();
    var reg=t.region?' · '+String(t.region).toUpperCase():'';
    var val=t.value||(t.contract_value?'£'+Number(t.contract_value).toLocaleString('en-GB'):'');
    var tags=t.category?'<div class="tc-tags"><span>'+t.category+'</span></div>':'';
    var meta='';
    if(t.deadline) meta+='<span>'+CT_ICONS.cal+'Closes '+fmtCloseDate(t.deadline)+'</span>';
    if(val) meta+='<span>'+CT_ICONS.pound+val+'</span>';
    if(t.duration) meta+='<span>'+CT_ICONS.clock+t.duration+'</span>';
    if(t.region) meta+='<span>'+CT_ICONS.pin+t.region+'</span>';
    var rawId=t.id!=null?t.id:(t.title||'');
    var sid=String(rawId).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
    var saved=isSaved(rawId);
    return '<div class="tc-card" onclick=\'openModal('+json+')\'>'
      +'<button class="tc-save'+(saved?' is-saved':'')+'" onclick="toggleSave(\''+sid+'\',event)">'+CT_ICONS.bm+'<span class="tc-save-label">'+(saved?'Saved':'Save')+'</span></button>'
      +'<div class="tc-head-row"><span class="tc-badge">'+(t.status||'Open')+'</span><span class="tc-org">'+org+reg+'</span></div>'
      +'<h3 class="tc-title">'+(t.title||'')+'</h3>'
      +tags
      +'<div class="tc-meta">'+meta+'</div>'
      +'<span class="tc-view">View details &amp; pricing</span>'
      +'</div>';
  }

  /* ── RENDER LIST ── */
  function renderTenders(type) {
    const list   = type==='care' ? allCareTenders : allCommercialTenders;
    const filter = type==='care' ? careFilter     : commercialFilter;
    const search = (document.getElementById(type+'-search').value||'').toLowerCase();
    const el     = document.getElementById(type+'-tenders-list');

    let items = list.filter(t=>t.status!=='Draft');
    if(filter!=='all') items=items.filter(t=>(t.category||'').toLowerCase()===filter.toLowerCase());
    if(search) items=items.filter(t=>
      (t.title||'').toLowerCase().includes(search)||
      (t.org||t.organisation||'').toLowerCase().includes(search)||
      (t.region||'').toLowerCase().includes(search)
    );

    if(!items.length){
      el.innerHTML=`<div class="empty-state"><h3>No tenders found</h3><p>Try adjusting your search or filter.</p></div>`;
      return;
    }

    el.innerHTML=items.map(careCardHTML).join('');
  }

  /* ── RENDER NON-CQC ── */
  function renderNonCQC() {
    // Check both field names (is_non_cqc from Supabase, non_cqc from sample data)
    // Also include care tenders where no CQC rating is required in eligibility
    const CQC_KEYWORDS = ['cqc rating','good or outstanding','cqc rated','cqc inspection','rated by cqc','cqc registered and rated'];
    function requiresCqcRating(t) {
      return (t.eligibility||[]).join(' ').toLowerCase().split(' ').some(w =>
        CQC_KEYWORDS.some(k => (t.eligibility||[]).join(' ').toLowerCase().includes(k))
      );
    }
    const list = allCareTenders.filter(t => {
      if (t.status === 'Draft') return false;
      // Explicitly flagged as non-CQC
      if (t.is_non_cqc || t.non_cqc) return true;
      // Auto-detect: care tender with no CQC rating requirement in eligibility
      if (!requiresCqcRating(t)) return true;
      return false;
    });
    const el=document.getElementById('non-cqc-list');
    if(!list.length){
      el.innerHTML=`<p style="color:var(--muted);font-size:0.88rem;padding:0.5rem 0;">No pre-CQC listings at the moment check back soon.</p>`;
      return;
    }
    el.innerHTML=list.map(careCardHTML).join('');
  }

  /* ── MODAL ── */
  function openModal(t) {
    // Header
    document.getElementById('modal-status-badge').outerHTML=`<span id="modal-status-badge">${statusBadge(t.status)}</span>`;
    document.getElementById('modal-category-badge').textContent=t.category||'';
    document.getElementById('modal-org').textContent=t.org||t.org||t.organisation||'';
    document.getElementById('modal-title').textContent=t.title||'';

    // Meta pills
    setpill('modal-value-pill',   t.value,    'Contract value');
    setpill('modal-region-pill',  t.region,   'Region');
    setpill('modal-deadline-pill',t.deadline, 'Deadline');
    setpill('modal-duration-pill',t.duration, 'Duration');

    // Description
    const descEl=document.getElementById('modal-desc');
    const descSec=document.getElementById('modal-desc-section');
    if(t.description){ descEl.textContent=t.description; descSec.style.display=''; }
    else { descEl.textContent='Full tender details available on request. Contact our team for more information.'; descSec.style.display=''; }

    // Eligibility check both field names used across sample data and Supabase
    const reqSec=document.getElementById('modal-req-section');
    const reqList=document.getElementById('modal-req-list');
    const reqs=Array.isArray(t.eligibility) ? t.eligibility :
               Array.isArray(t.eligibility_requirements) ? t.eligibility_requirements : [];
    if(reqs.length){
      reqList.innerHTML=reqs.map(r=>`<li>${r}</li>`).join('');
      reqSec.style.display='';
    } else { reqSec.style.display=''; reqList.innerHTML='<li>Please contact us for full eligibility details</li>'; }

    // Pricing stored as object in Supabase e.g. { items:[{label,amount}], total, note }
    const pricingEl=document.getElementById('modal-pricing-items');
    const pricing=t.pricing||{};

    // Handle all pricing formats from Supabase
    let pricingItems=[];
    if(Array.isArray(pricing)){
      pricingItems=pricing;
    } else if(pricing.items && Array.isArray(pricing.items)){
      pricingItems=pricing.items;
    } else if(typeof pricing==='object' && Object.keys(pricing).length){
      pricingItems=Object.entries(pricing)
        .filter(([k])=>k!=='total'&&k!=='note'&&k!=='fee_note'&&k!=='price'&&k!=='stripe_link')
        .map(([k,v])=>({label:k,amount:v}));
    }

    // Calculate subtotal
    window._currentTenderSubtotal = 0;
    window._currentTenderTitle = t.title||'';
    const itemsSum = sumPricing(pricingItems);

    // Strip currency symbols before parsing
    function parseFee(v){ return Number(String(v||0).replace(/[^0-9.]/g,''))||0; }
    const explicitTotal = parseFee(pricing.total) || parseFee(pricing.price) ||
                          parseFee(t.total_fee)   || parseFee(t.fee) ||
                          parseFee(t.our_fee)     || parseFee(t.price) || 0;

    const subtotal = explicitTotal || itemsSum || 0;
    window._currentTenderSubtotal = subtotal;
    window._currentStripeLink = t.stripe_link||'';
    const totalIncVat = subtotal ? subtotal : 0;

    // Full bid support was withdrawn, so these elements no longer exist on the
    // page. Keep the writes guarded so the modal still opens cleanly.
    if(pricingEl){
      if(pricingItems.length){
        pricingEl.innerHTML=pricingItems.map(p=>`
          <div class="pricing-row">
            <span class="pricing-label">${p.label||p.name||p.description||''}</span>
            <span class="pricing-amount">${formatFee(Number(p.amount||p.price||p.value)||0)}</span>
          </div>
        `).join('');
      } else if(subtotal){
        pricingEl.innerHTML=`<div class="pricing-row"><span class="pricing-label">Tender completion fee</span><span class="pricing-amount">${formatFee(subtotal)}</span></div>`;
      } else {
        pricingEl.innerHTML='<div class="pricing-row"><span class="pricing-label">Tender completion fee</span><span class="pricing-amount">Contact us for pricing</span></div>';
      }
    }

    var totalFeeEl=document.getElementById('modal-total-fee');
    if(totalFeeEl) totalFeeEl.textContent=totalIncVat?'£'+totalIncVat.toLocaleString('en-GB'):'Contact us for pricing';
    var feeNoteEl=document.getElementById('modal-fee-note');
    if(feeNoteEl) feeNoteEl.textContent=pricing.note||pricing.fee_note||t.fee_note||'Payable on engagement.';
    // Store stripe link for Pay Now button
    window._currentStripeLink = t.stripe_link || '';

    // Cana button always shows the same regardless of submission link
    const applyBtn=document.getElementById('modal-apply-btn');
    applyBtn.href='/cana.html?tender=' + (t.id||'');
    applyBtn.innerHTML='<div class="btn-cta-icon"></div><div class="btn-cta-text"><span class="btn-cta-label">Write with Cana</span><span class="btn-cta-desc">Let Cana draft your full tender response instantly</span></div>';
    applyBtn.className='btn-cta btn-cta--ai';

    // Source link  - shown on both public modal and admin
    var srcEl = document.getElementById('modal-source-link');
    if (srcEl) {
      if (t.source_url) {
        var srcLabel = t.source === 'find_a_tender' ? 'View on Find a Tender' :
                       t.source === 'contracts_finder' ? 'View on Contracts Finder' : 'View original notice';
        srcEl.innerHTML = '<a href="' + t.source_url + '" target="_blank" rel="noopener" class="modal-source-btn">' +
          '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9M10 2h4m0 0v4m0-4L7 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          srcLabel + '</a>';
        srcEl.style.display = '';
      } else {
        srcEl.style.display = 'none';
      }
    }

    document.getElementById('modal-overlay').classList.add('open');
    document.body.style.overflow='hidden';
  }

  function setpill(id,val,label){
    const el=document.getElementById(id);
    if(val){ el.innerHTML=`<strong>${label}:</strong> ${val}`; el.style.display=''; }
    else { el.style.display='none'; }
  }

  function formatFee(amount){
    if(!amount||isNaN(amount)) return String(amount||'');
    return '£'+Number(amount).toLocaleString('en-GB');
  }

  function addVat(amount){
    return Math.round(Number(amount)*1.2);
  }

  function sumPricing(items){
    if(!items||!items.length) return 0;
    return items.reduce((s,p)=>s+(Number(p.amount||p.price||0)),0);
  }

  function handlePayNow() {
    const link  = window._currentStripeLink || '';
    const title = window._currentTenderTitle || 'Tender';
    if (link) {
      window.location.href = link;
    } else {
      window.location.href = 'mailto:hello@getcana.co.uk?subject=Payment enquiry: ' + encodeURIComponent(title);
    }
  }

  function closeModal(){
    document.getElementById('modal-overlay').classList.remove('open');
    document.body.style.overflow='';
  }

  function closeModalOnBg(e){
    if(e.target===document.getElementById('modal-overlay')) closeModal();
  }

  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });

  /* ── SAMPLE DATA (shown when database is empty) ── */

    /* ── LOAD DATA ── */
  async function loadData() {
    try {
      const res=await fetch('/.netlify/functions/get-tenders');
      if(!res.ok) throw new Error('fetch failed');
      const data=await res.json();

      allCareTenders       = data.filter(t=>isCare(t));
      allCommercialTenders = data.filter(t=>!isCare(t));

      const lc=allCareTenders.filter(t=>t.status!=='Draft').length;
      const lm=allCommercialTenders.filter(t=>t.status!=='Draft').length;
      document.getElementById('stat-care-count').textContent       = lc||'0';
      var _scc = document.getElementById('stat-commercial-count'); if (_scc) _scc.textContent = lm||'0';

      renderTenders('care');
      // commercial-hidden-for-launch: renderTenders('commercial');
      renderNonCQC();
      initTicker(allCareTenders);
      initBentoFeed(allCareTenders);
    } catch(e) {
      console.error('loadData error:', e.message, e.stack);
      var msg = '<div class="empty-state"><h3>Could not load tenders</h3><p>Please try refreshing the page.</p></div>';
      document.getElementById('care-tenders-list').innerHTML = msg;
      var _ctl = document.getElementById('commercial-tenders-list'); if (_ctl) _ctl.innerHTML = msg;
    }
  }

  loadData();



  const SUPABASE_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';
  const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  _sb.auth.getSession().then(function(r) {
    var session = r.data.session;
    var navAuth = document.getElementById('nav-auth');
    if (!navAuth) return;
    if (session && session.user) {
      var meta = session.user.user_metadata || {};
      var initials = ((meta.first_name || '?')[0] + (meta.last_name || '?')[0]).toUpperCase();
      var firstName = meta.first_name || 'My Account';
      var email = (session.user.email || '').toLowerCase();
      fetch('/.netlify/functions/check-membership?email=' + encodeURIComponent(email))
        .then(function(r){ return r.json(); })
        .then(function(m) {
          var memberPill = m && m.member
            ? '<a href="/plans.html" style="display:inline-flex;align-items:center;gap:4px;background:var(--teal);color:var(--navy);font-size:0.7rem;font-weight:700;border-radius:999px;padding:3px 10px;text-decoration:none;margin-right:4px;">Member</a>'
            : '';
          navAuth.innerHTML =
            memberPill +
            '<a href="/dashboard.html" class="nav-account">' +
              '<div class="nav-account-dot">' + initials + '</div>' +
              firstName +
            '</a>' +
            '<a href="#" onclick="handleSignOut(); return false;" class="nav-signin">Sign out</a>';
        }).catch(function() {
          navAuth.innerHTML =
            '<a href="/dashboard.html" class="nav-account">' +
              '<div class="nav-account-dot">' + initials + '</div>' +
              firstName +
            '</a>' +
            '<a href="#" onclick="handleSignOut(); return false;" class="nav-signin">Sign out</a>';
        });
    }
  });

  async function handleSignOut() {
    await _sb.auth.signOut();
    window.location.reload();
  }

// ══ TICKER ══
function initTicker(tenders) {
  var inner = document.getElementById('ticker-inner');
  if (!inner) return;
  if (!tenders || !tenders.length) { inner.innerHTML = '<span class="ticker-loading">No live opportunities at this time</span>'; return; }

  var approved = tenders.filter(function(t){ return isApproved(t); });
  if (!approved.length) { inner.innerHTML = '<span class="ticker-loading">Opportunities loading…</span>'; return; }

  // Build items (duplicate for seamless loop)
  function makeItem(t) {
    var isC = isCare(t);
    var val = t.contract_value ? '£' + Number(t.contract_value).toLocaleString('en-GB') : '';
    var el = document.createElement('span');
    el.className = 'ticker-item';
    el.innerHTML =
      '<span class="ticker-item-dot ' + (isC ? 'care' : 'commercial') + '"></span>' +
      '<span class="ticker-item-title">' + (t.title||'').slice(0,55) + (t.title && t.title.length > 55 ? '…' : '') + '</span>' +
      (val ? '<span class="ticker-item-val">' + val + '</span>' : '') +
      '<span class="ticker-item-sep">|</span>';
    el.onclick = function(){ openModal(t); };
    return el;
  }

  inner.innerHTML = '';
  var items = approved.slice(0, 20);
  // Double up for seamless scroll
  items.concat(items).forEach(function(t){ inner.appendChild(makeItem(t)); });

  // Measure and animate
  var totalW = inner.scrollWidth / 2;
  var speed = 40; // px/s
  var duration = totalW / speed;
  inner.style.animation = 'tickerScroll ' + duration + 's linear infinite';

  // Pause on hover
  var track = inner.parentElement;
  track.addEventListener('mouseenter', function(){ inner.style.animationPlayState = 'paused'; });
  track.addEventListener('mouseleave', function(){ inner.style.animationPlayState = 'running'; });
}

// Add ticker keyframe once
(function(){
  var s = document.createElement('style');
  s.textContent = '@keyframes tickerScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }';
  document.head.appendChild(s);
})();

// ══ CANA DEMO TYPING ANIMATION ══
(function(){
  var DEMOS = [
    {
      tender: 'Domiciliary Care Framework, Reading Borough Council',
      question: 'Describe your approach to person-centred care and how care plans reflect individual needs.',
      response: 'Our approach to person-centred care begins at the initial assessment stage, where we invest time understanding not just clinical and care needs but the individual\'s preferences, routines, relationships and personal goals. Each care plan is co-produced with the service user and, where appropriate, their family or representative. We use Care Planner to maintain live, accessible care records that are reviewed formally every 12 weeks and informally at every visit, ensuring the plan always reflects the person\'s current wishes rather than historical assumptions.'
    },
    {
      tender: 'Supported Living Services Framework, Birmingham City Council',
      question: 'How will you ensure continuity of care for service users during periods of staff absence or transition?',
      response: 'Continuity of care is protected through a dedicated cover rota maintained by our registered manager, which ensures that any absence, planned or unplanned, is filled by a worker already known to the service user. All cover staff complete a handover review using the individual\'s care profile in Birdie before attending, so they arrive informed of current needs, preferences and any recent changes. We never use agency staff for continuity-critical roles without a supervised introduction period.'
    },
    {
      tender: 'Mental Health Support Services, NHS South West ICB',
      question: 'What safeguarding measures will you put in place to protect vulnerable adults in your care?',
      response: 'Safeguarding is embedded into every layer of our service delivery. All staff complete Level 2 safeguarding adults training before working unsupervised, with refresher training annually and an immediate debrief process following any concern. We operate a clear reporting pathway: concerns are logged in Care Planner within two hours, escalated to our safeguarding lead the same day, and reported to the local authority designated officer where the threshold is met. We maintain a rolling safeguarding audit reviewed at monthly governance meetings.'
    }
  ];

  var demoIdx = 0;
  var charIdx = 0;
  var typing = false;
  var loopTimeout;

  function getEls(){
    return {
      text: document.getElementById('demo-response-text'),
      cursor: document.getElementById('demo-cursor'),
      bar: document.getElementById('demo-progress-bar'),
      label: document.getElementById('demo-progress-label'),
      tname: document.getElementById('demo-tender-name'),
      question: document.getElementById('demo-question')
    };
  }

  function typeChar(){
    var els = getEls();
    if (!els.text) return;
    var demo = DEMOS[demoIdx];
    if (charIdx <= demo.response.length) {
      els.text.textContent = demo.response.slice(0, charIdx);
      var pct = Math.round((charIdx / demo.response.length) * 100);
      if (els.bar) els.bar.style.width = pct + '%';
      if (els.label) els.label.textContent = charIdx >= demo.response.length ? 'Complete ✓' : 'Writing…';
      charIdx++;
      var delay = charIdx < demo.response.length ? (Math.random() < 0.04 ? 60 : 18) : 0;
      loopTimeout = setTimeout(typeChar, delay);
    } else {
      // Pause then cycle to next demo
      loopTimeout = setTimeout(function(){
        demoIdx = (demoIdx + 1) % DEMOS.length;
        charIdx = 0;
        var nextDemo = DEMOS[demoIdx];
        var els2 = getEls();
        if (els2.tname) els2.tname.textContent = nextDemo.tender;
        if (els2.question) els2.question.textContent = nextDemo.question;
        if (els2.text) els2.text.textContent = '';
        if (els2.bar) els2.bar.style.width = '0%';
        if (els2.label) els2.label.textContent = 'Writing…';
        loopTimeout = setTimeout(typeChar, 600);
      }, 3500);
    }
  }

  function startDemo(){
    var els = getEls();
    if (!els.text) return;
    clearTimeout(loopTimeout);
    charIdx = 0;
    demoIdx = 0;
    var demo = DEMOS[0];
    if (els.tname) els.tname.textContent = demo.tender;
    if (els.question) els.question.textContent = demo.question;
    if (els.text) els.text.textContent = '';
    if (els.bar) els.bar.style.width = '0%';
    if (els.label) els.label.textContent = 'Writing…';
    setTimeout(typeChar, 1200);
  }

  // Start when home view is visible
  document.addEventListener('DOMContentLoaded', function(){
    startDemo();
    // Restart whenever user returns to home
    var orig = window.showHome;
    if (typeof orig === 'function') {
      window.showHome = function(){
        orig();
        clearTimeout(loopTimeout);
        charIdx = 0;
        demoIdx = 0;
        setTimeout(startDemo, 300);
      };
    }
  });

  window._restartDemo = startDemo;
})();

// ══ BENTO LIVE FEED ══
function initBentoFeed(tenders) {
  var feed = document.getElementById('bento-feed');
  var countEl = document.getElementById('bento-live-count');
  if (!feed) return;

  var approved = (tenders || []).filter(function(t){ return isApproved(t); });
  if (countEl) countEl.textContent = approved.length;
  if (!approved.length) { feed.innerHTML = '<div class="bento-feed-row"><span class="bento-feed-text">New opportunities arriving daily</span></div>'; return; }

  var pool = approved.slice(0, 30);
  var idx = 0;

  function row(t) {
    var d = document.createElement('div');
    d.className = 'bento-feed-row';
    var isC = isCare(t);
    var val = t.contract_value ? '£' + Number(t.contract_value).toLocaleString('en-GB') : '';
    d.innerHTML = '<span class="bento-feed-dot' + (isC ? '' : ' amber') + '"></span>' +
      '<span class="bento-feed-text">' + (t.title||'') + '</span>' +
      (val ? '<span class="bento-feed-val">' + val + '</span>' : '');
    return d;
  }

  function render() {
    feed.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      feed.appendChild(row(pool[(idx + i) % pool.length]));
    }
  }

  render();
  setInterval(function(){
    idx = (idx + 1) % pool.length;
    render();
  }, 3200);
}

// ══ COMPARISON SCROLL REVEAL ══
(function(){
  function setup(){
    var grid = document.getElementById('compare-grid');
    if (!grid || !('IntersectionObserver' in window)) {
      // Fallback: just show everything
      document.querySelectorAll('.cmp-item').forEach(function(el){ el.classList.add('in'); });
      return;
    }
    var observer = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        // Stagger: old-way items first, then Cana items sweep in
        var olds = entry.target.querySelectorAll('.cmp-old-item');
        var news = entry.target.querySelectorAll('.cmp-new-item');
        olds.forEach(function(el, i){ setTimeout(function(){ el.classList.add('in'); }, i * 140); });
        news.forEach(function(el, i){ setTimeout(function(){ el.classList.add('in'); }, 400 + i * 140); });
      });
    }, { threshold: 0.25 });
    observer.observe(grid);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();

// ══ PROOF BAND: COUNT-UP + REVEAL ══
(function(){
  function animateCount(el, duration){
    var target = parseFloat(el.getAttribute('data-count'));
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var decimals = parseInt(el.getAttribute('data-decimals') || '0');
    var start = null;
    function step(ts){
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      var val = (target * eased).toFixed(decimals);
      el.textContent = prefix + val + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = prefix + target.toFixed(decimals).replace(/\.0$/, decimals ? '.0' : '') + suffix;
    }
    requestAnimationFrame(step);
  }

  function setup(){
    var section = document.getElementById('proof-section');
    if (!section) return;

    // Set bar widths from data attributes as CSS vars
    section.querySelectorAll('.proof-bar-fill').forEach(function(b){
      b.style.setProperty('--w', (b.getAttribute('data-width') || 0) + '%');
    });

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function fire(){
      section.classList.add('in');
      section.querySelectorAll('.proof-num[data-count]').forEach(function(el, i){
        if (reduced) {
          var t = parseFloat(el.getAttribute('data-count'));
          var d = parseInt(el.getAttribute('data-decimals') || '0');
          el.textContent = (el.getAttribute('data-prefix')||'') + t.toFixed(d) + (el.getAttribute('data-suffix')||'');
        } else {
          setTimeout(function(){ animateCount(el, 1600); }, i * 120);
        }
      });
    }

    if (!('IntersectionObserver' in window)) { fire(); return; }
    var obs = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting) { obs.unobserve(e.target); fire(); }
      });
    }, { threshold: 0.3 });
    obs.observe(section);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
