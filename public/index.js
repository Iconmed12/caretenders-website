
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
    'construction',
    'facilities','facilities management',
    'cleaning',
    'consultancy',
    'it & digital','it','digital','it & services',
    'logistics',
    'other'
  ];

  function isCare(t) {
    const cat = (t.category||'').toLowerCase().trim();
    if (!cat) {
      // No category fall back to is_non_cqc flag (care side) or treat as unknown
      return !!t.is_non_cqc;
    }
    // If it matches commercial list → commercial
    if (COMMERCIAL_CATS.includes(cat)) return false;
    // If it matches care list → care
    if (CARE_CATS.includes(cat)) return true;
    // Partial match fallback if it contains a commercial keyword
    const commercialKeywords = ['construction','facilit','cleaning','consultanc','logistic'];
    if (commercialKeywords.some(k => cat.includes(k))) return false;
    // Default to care for anything unrecognised on the care side
    return true;
  }

  /* ── NAVIGATION ── */
  function showHome() {
    document.getElementById('home-view').style.display = '';
    document.getElementById('care-section').classList.remove('active');
    document.getElementById('commercial-section').classList.remove('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function showSection(type) {
    document.getElementById('home-view').style.display = 'none';
    document.getElementById('care-section').classList.remove('active');
    document.getElementById('commercial-section').classList.remove('active');
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

    el.innerHTML=items.map(t=>`
      <div class="tender-card" onclick='openModal(${JSON.stringify(t).replace(/'/g,"&#39;")})'>
        <div>
          <div class="tender-org">${t.org||t.organisation||'Unknown'} · ${t.region||''}</div>
          <div class="tender-title">${t.title}</div>
          <div class="tender-meta">
            ${statusBadge(t.status)}
            ${t.category?`<span>${t.category}</span>`:''}
            ${t.duration?`<span>${t.duration}</span>`:''}
          </div>
          <span class="tender-view-btn">View details &amp; pricing →</span>
        </div>
        <div class="tender-right">
          <div class="tender-value">${t.value||''}</div>
          <div class="tender-deadline">${t.deadline?'Closes '+t.deadline:''}</div>
        </div>
      </div>
    `).join('');
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
    el.innerHTML=list.map(t=>`
      <div class="tender-card" style="margin-bottom:0.75rem;" onclick='openModal(${JSON.stringify(t).replace(/'/g,"&#39;")})'>
        <div>
          <div class="tender-org">${t.org||t.organisation||''} · ${t.region||''}</div>
          <div class="tender-title">${t.title}</div>
          <div class="tender-meta">${statusBadge(t.status)}${t.why_new_providers?`<span style="color:var(--muted);font-size:0.8rem;">${t.why_new_providers}</span>`:''}</div>
          <span class="tender-view-btn">View details &amp; pricing →</span>
        </div>
        <div class="tender-right">
          <div class="tender-value">${t.value||''}</div>
          <div class="tender-deadline">${t.deadline?'Closes '+t.deadline:''}</div>
        </div>
      </div>
    `).join('');
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
    const totalIncVat = subtotal ? addVat(subtotal) : 0;

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

    // Total inc VAT — never show POA
    document.getElementById('modal-total-fee').textContent=totalIncVat?'£'+totalIncVat.toLocaleString('en-GB')+' inc. VAT':'Contact us for pricing';
    document.getElementById('modal-fee-note').textContent=pricing.note||pricing.fee_note||t.fee_note||'Price shown includes VAT. Payable on engagement.';
    // Store stripe link for Pay Now button
    window._currentStripeLink = t.stripe_link || '';

    // Cana AI button always shows the same regardless of submission link
    const applyBtn=document.getElementById('modal-apply-btn');
    applyBtn.href='/cana.html?tender=' + (t.id||'');
    applyBtn.innerHTML='<div class="btn-cta-icon">⚡</div><div class="btn-cta-text"><span class="btn-cta-label">Write with Cana AI</span><span class="btn-cta-desc">Let our AI system draft your full tender response instantly</span></div><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    applyBtn.className='btn-cta btn-cta--ai';

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
      window.location.href = 'mailto:consulting@cana.ai?subject=Payment enquiry: ' + encodeURIComponent(title);
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
      document.getElementById('stat-commercial-count').textContent = lm||'0';

      renderTenders('care');
      renderTenders('commercial');
      renderNonCQC();
    } catch(e) {
      document.getElementById('care-tenders-list').innerHTML='<div class="empty-state"><h3>Could not load tenders</h3><p>Please try refreshing the page.</p></div>';
      document.getElementById('commercial-tenders-list').innerHTML='<div class="empty-state"><h3>Could not load tenders</h3><p>Please try refreshing the page.</p></div>';
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
      navAuth.innerHTML =
        '<a href="/dashboard.html" class="nav-account">' +
          '<div class="nav-account-dot">' + initials + '</div>' +
          firstName +
        '</a>' +
        '<a href="#" onclick="handleSignOut(); return false;" class="nav-signin">Sign out</a>';
    }
  });

  async function handleSignOut() {
    await _sb.auth.signOut();
    window.location.reload();
  }
