
const API = '/.netlify/functions';
const ADMIN_PASSWORD = 'CareTenders2024!';
let allTenders = [];
let deleteTarget = { id: null };
let currentSection = 'care';
let extractedData = null;
let selectedFile = null;
let nextId = 1;

function doLogin() {
  var p = document.getElementById('loginPass') ? document.getElementById('loginPass').value : '';
  var valid = ['CareTenders2024!', 'CanaAdmin2024!', 'Cana2024!'];
  if (valid.includes(p)) {
    localStorage.setItem('adminLoggedIn', 'true');
    sessionStorage.setItem('adminLoggedIn', 'true');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    loadTenders();
  } else if (p !== '') {
    document.getElementById('loginError').style.display = 'flex';
  }
}
function doLogout() {
  localStorage.removeItem('adminLoggedIn');
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

const CARE_CATS = ['domiciliary care','domiciliary','residential','nursing','supported living','supported','mental health','mental','hospital discharge','discharge'];
const COMMERCIAL_CATS = ['construction','facilities','facilities management','cleaning','consultancy','it & digital','it','digital','logistics','other','it & services'];

function isCare(t) {
  const cat = (t.category||'').toLowerCase().trim();
  if (!cat) return !!t.is_non_cqc;
  if (COMMERCIAL_CATS.includes(cat)) return false;
  if (CARE_CATS.includes(cat)) return true;
  if (['construction','facilit','cleaning','consultanc','logistic'].some(k => cat.includes(k))) return false;
  return true;
}

function requiresCqcRating(t) {
  const reqs = (t.eligibility||[]).join(' ').toLowerCase();
  return reqs.includes('cqc rating') || reqs.includes('good or outstanding') || reqs.includes('cqc rated') || reqs.includes('cqc inspection') || reqs.includes('rated by cqc');
}

function isNonCqcEligible(t) { return isCare(t) && !requiresCqcRating(t); }

function autoDetectCategory(text) {
  const t = (text||'').toLowerCase();
  if (/construction|refurb|build|contractor|civil engineer|structural/.test(t)) return 'Construction';
  if (/facilit|estate management|hard fm|soft fm/.test(t)) return 'Facilities';
  if (/clean|janitorial|hygiene service|washroom/.test(t)) return 'Cleaning';
  if (/consult|advisory|professional service|strategy/.test(t)) return 'Consultancy';
  if (/it service|digital|software|cyber|data|technology|ict/.test(t)) return 'IT & Digital';
  if (/logistic|transport|courier|supply chain|delivery/.test(t)) return 'Logistics';
  if (/domiciliary|home care|homecare|personal care/.test(t)) return 'Domiciliary care';
  if (/residential|care home|nursing home/.test(t)) return 'Residential';
  if (/nursing|clinical care|registered nurse/.test(t)) return 'Nursing';
  if (/supported living|supported accommodation/.test(t)) return 'Supported living';
  if (/mental health|psychiatric|wellbeing/.test(t)) return 'Mental health';
  if (/hospital discharge|step.?down|reablement/.test(t)) return 'Hospital discharge';
  return null;
}

function showPage(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  btn.classList.add('active');
  const titles = { dashboard:'Dashboard', care:'Care tenders', commercial:'Commercial tenders', noncqc:'Non-CQC listings', cana:'Cana AI', knowledge:'Knowledge Base', settings:'Settings' };
  document.getElementById('topbarTitle').textContent = titles[page] || page;
  ['aiUploadBtn','addTenderBtn','aiCommercialBtn','addCommercialBtn','aiNonCqcBtn','addNonCqcBtn'].forEach(function(id) {
    var el = document.getElementById(id); if(el) el.style.display = 'none';
  });
  if (page === 'care') { document.getElementById('aiUploadBtn').style.display='flex'; document.getElementById('addTenderBtn').style.display='flex'; renderCareTable(); }
  if (page === 'commercial') { document.getElementById('aiCommercialBtn').style.display='flex'; document.getElementById('addCommercialBtn').style.display='flex'; renderCommercialTable(); }
  if (page === 'noncqc') { document.getElementById('aiNonCqcBtn').style.display='flex'; document.getElementById('addNonCqcBtn').style.display='flex'; renderNonCqcTable(); }
  if (page === 'knowledge') { loadKnowledgeBase(); }
  if (page === 'cana') { populateCanaTenderSelect(); }
}

function calcTotal(items) { return (items||[]).reduce(function(s,i){ return s+(parseFloat(i.price)||0); },0); }
function fmtDate(d) { if(!d) return ''; try { return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); } catch(e){ return d; } }
function badgeHtml(s) {
  var map={open:'badge-open',closing:'badge-closing',urgent:'badge-urgent',new:'badge-new',draft:'badge-draft'};
  var lbl={open:'Open',closing:'Closing soon',urgent:'Urgent',new:'New opportunity',draft:'Draft'};
  return '<span class="td-badge '+(map[s]||'badge-draft')+'">'+(lbl[s]||s)+'</span>';
}

function updateCounts() {
  var care=allTenders.filter(isCare);
  var commercial=allTenders.filter(function(t){return !isCare(t);});
  var nc=allTenders.filter(function(t){return isNonCqcEligible(t)||t.is_non_cqc;});
  var withDocs=allTenders.filter(function(t){return t.cana_docs&&(
    (t.cana_docs.quality&&t.cana_docs.quality.length)||
    (t.cana_docs.spec&&t.cana_docs.spec.length)||
    (t.cana_docs.scoring&&t.cana_docs.scoring.length));});
  document.getElementById('sbCare').textContent=care.length;
  document.getElementById('sbCommercial').textContent=commercial.length;
  document.getElementById('sbNonCqc').textContent=nc.length;
  document.getElementById('sbCana').textContent=withDocs.length;
  document.getElementById('statTotal').textContent=allTenders.length;
  document.getElementById('statOpen').textContent=allTenders.filter(function(t){return t.status==='open';}).length;
  document.getElementById('statClosing').textContent=allTenders.filter(function(t){return t.status==='closing'||t.status==='urgent';}).length;
  document.getElementById('statNonCqc').textContent=nc.length;
}

function renderAll() { updateCounts(); renderDashboard(); renderCareTable(); renderCommercialTable(); renderNonCqcTable(); }

function renderDashboard() {
  var rows=allTenders.slice(0,10);
  document.getElementById('dashboardTable').innerHTML=rows.length?rows.map(function(t){return '<tr><td><div class="td-title">'+t.title+'</div><div class="td-org">'+(t.org||'')+'</div></td><td style="font-weight:600">'+(t.value||'')+'</td><td>'+badgeHtml(t.status)+'</td><td style="color:var(--text-muted)">'+fmtDate(t.deadline)+'</td><td><div class="action-btns"><button class="action-btn edit" onclick="openDrawer(\''+t.id+'\',\'care\')" title="Edit"><i class="ti ti-edit"></i></button><button class="action-btn del" onclick="askDelete(\''+t.id+'\')" title="Delete"><i class="ti ti-trash"></i></button></div></td></tr>';}).join(''):'<tr><td colspan="5"><div class="empty-state"><i class="ti ti-file-off"></i>No listings yet</div></td></tr>';
}

function feeStr(t) {
  var p=t.pricing||{};
  if(p.total) return typeof p.total==='number'?'£'+p.total.toLocaleString()+'+VAT':p.total;
  if(Array.isArray(p.items)&&p.items.length){var s=p.items.reduce(function(a,i){return a+(parseFloat(i.price)||0);},0);return s>0?'£'+s.toLocaleString()+'+VAT':'—';}
  return '—';
}

function renderCareTable() {
  var q=(document.getElementById('careSearch').value||'').toLowerCase();
  var rows=allTenders.filter(function(t){return isCare(t)&&(!q||(t.title||'').toLowerCase().includes(q)||(t.org||'').toLowerCase().includes(q));});
  document.getElementById('careCountLabel').textContent='('+rows.length+')';
  var tb=document.getElementById('careTable');
  if(!rows.length){tb.innerHTML='<tr><td colspan="8"><div class="empty-state"><i class="ti ti-file-off"></i>No care tenders yet</div></td></tr>';return;}
  tb.innerHTML=rows.map(function(t){
    var nc=isNonCqcEligible(t);
    var ncBadge=nc?'<span class="td-badge" style="background:#e8f7ee;color:#085041;font-size:10px">Auto</span>':'<span style="color:var(--text-light)">—</span>';
    var publishBtn=t.status==='draft'?'<button class="action-btn" style="background:#e8f7ee;color:#1a7a3f;" onclick="publishDraft(\''+t.id+'\')" title="Publish"><i class="ti ti-send"></i></button>':'';
    return '<tr><td><div class="td-title">'+(t.title||'Untitled')+'</div><div class="td-org">'+(t.org||'')+'</div></td><td>'+(t.organisation||t.org||'')+'</td><td>'+(t.value||'')+'</td><td style="color:var(--green);font-weight:600">'+feeStr(t)+'</td><td>'+ncBadge+'</td><td>'+badgeHtml(t.status)+'</td><td style="color:var(--text-muted);font-size:12px">'+fmtDate(t.deadline)+'</td><td><div class="action-btns">'+publishBtn+'<button class="action-btn edit" onclick="openDrawerById(\''+t.id+'\',\'care\')"><i class="ti ti-edit"></i></button><button class="action-btn del" onclick="askDelete(\''+t.id+'\')"><i class="ti ti-trash"></i></button></div></td></tr>';
  }).join('');
}

function renderCommercialTable() {
  var q=(document.getElementById('commercialSearch').value||'').toLowerCase();
  var rows=allTenders.filter(function(t){return !isCare(t)&&(!q||(t.title||'').toLowerCase().includes(q)||(t.org||'').toLowerCase().includes(q));});
  document.getElementById('commercialCountLabel').textContent='('+rows.length+')';
  var tb=document.getElementById('commercialTable');
  if(!rows.length){tb.innerHTML='<tr><td colspan="7"><div class="empty-state"><i class="ti ti-building-off"></i>No commercial tenders yet</div></td></tr>';return;}
  tb.innerHTML=rows.map(function(t){
    var publishBtn=t.status==='draft'?'<button class="action-btn" style="background:#e8f7ee;color:#1a7a3f;" onclick="publishDraft(\''+t.id+'\')" title="Publish"><i class="ti ti-send"></i></button>':'';
    return '<tr><td><div class="td-title">'+(t.title||'Untitled')+'</div><div class="td-org">'+(t.org||'')+'</div></td><td>'+(t.organisation||t.org||'')+'</td><td>'+(t.value||'')+'</td><td style="color:var(--green);font-weight:600">'+feeStr(t)+'</td><td>'+badgeHtml(t.status)+'</td><td style="color:var(--text-muted);font-size:12px">'+fmtDate(t.deadline)+'</td><td><div class="action-btns">'+publishBtn+'<button class="action-btn edit" onclick="openDrawerById(\''+t.id+'\',\'commercial\')"><i class="ti ti-edit"></i></button><button class="action-btn del" onclick="askDelete(\''+t.id+'\')"><i class="ti ti-trash"></i></button></div></td></tr>';
  }).join('');
}

function renderNonCqcTable() {
  var q=(document.getElementById('nonCqcSearch').value||'').toLowerCase();
  var rows=allTenders.filter(function(t){return (isNonCqcEligible(t)||t.is_non_cqc)&&(!q||(t.title||'').toLowerCase().includes(q)||(t.org||'').toLowerCase().includes(q));});
  document.getElementById('nonCqcCountLabel').textContent='('+rows.length+')';
  var tb=document.getElementById('nonCqcTable');
  if(!rows.length){tb.innerHTML='<tr><td colspan="7"><div class="empty-state"><i class="ti ti-certificate"></i>No non-CQC listings yet</div></td></tr>';return;}
  tb.innerHTML=rows.map(function(t){
    var isAuto=isNonCqcEligible(t)&&!t.is_non_cqc;
    return '<tr><td><div class="td-title">'+(t.title||'')+'</div><div class="td-org">'+(t.org||'')+'</div></td><td>'+(t.organisation||t.org||'')+'</td><td>'+(t.value||'')+'</td><td style="color:var(--green);font-weight:600">'+feeStr(t)+'</td><td>'+(isAuto?'<span class="td-badge" style="background:#e8f7ee;color:#085041;font-size:10px">Auto</span>':'<span style="color:var(--text-light)">Manual</span>')+'</td><td>'+badgeHtml(t.status)+'</td><td style="color:var(--text-muted);font-size:12px">'+fmtDate(t.deadline)+'</td><td><div class="action-btns"><button class="action-btn edit" onclick="openDrawerById(\''+t.id+'\',\'noncqc\')"><i class="ti ti-edit"></i></button><button class="action-btn del" onclick="askDelete(\''+t.id+'\')"><i class="ti ti-trash"></i></button></div></td></tr>';
  }).join('');
}

// AI MODAL
function openAiModal(sectionType) {
  currentSection=sectionType; extractedData=null; selectedFile=null;
  document.getElementById('aiStep1').style.display='block';
  document.getElementById('aiStep2').style.display='none';
  document.getElementById('aiStep3').style.display='none';
  document.getElementById('fileInput').value='';
  document.getElementById('fileSelectedBar').style.display='none';
  document.getElementById('uploadZone').style.display='block';
  document.getElementById('aiAnalyseBtn').style.display='none';
  document.getElementById('aiOpenFormBtn').style.display='none';
  document.getElementById('aiOverlay').classList.add('open');
}
function closeAiModal(){document.getElementById('aiOverlay').classList.remove('open');}
function maybeCloseAi(e){if(e.target===document.getElementById('aiOverlay'))closeAiModal();}
function handleDrag(e){e.preventDefault();document.getElementById('uploadZone').classList.add('dragover');}
function handleDragLeave(){document.getElementById('uploadZone').classList.remove('dragover');}
function handleDrop(e){e.preventDefault();document.getElementById('uploadZone').classList.remove('dragover');var f=e.dataTransfer.files[0];if(f)setFile(f);}
function handleFileSelect(e){var f=e.target.files[0];if(f)setFile(f);}
function setFile(file){
  selectedFile=file;
  document.getElementById('selectedFileName').textContent=file.name;
  document.getElementById('selectedFileSize').textContent=(file.size/1024).toFixed(1)+' KB · Ready to analyse';
  document.getElementById('fileSelectedBar').style.display='flex';
  document.getElementById('uploadZone').style.display='none';
  document.getElementById('aiAnalyseBtn').style.display='flex';
}
function clearFile(){
  selectedFile=null;document.getElementById('fileInput').value='';
  document.getElementById('fileSelectedBar').style.display='none';
  document.getElementById('uploadZone').style.display='block';
  document.getElementById('aiAnalyseBtn').style.display='none';
}

async function runAiExtraction() {
  if(!selectedFile) return;
  document.getElementById('aiStep1').style.display='none';
  document.getElementById('aiStep2').style.display='block';
  document.getElementById('aiAnalyseBtn').style.display='none';
  var steps=['ps1','ps2','ps3','ps4'];
  for(var i=0;i<steps.length;i++){
    await delay(700);
    if(i>0) document.getElementById(steps[i-1]).className='proc-step done';
    document.getElementById(steps[i]).className='proc-step active';
  }
  try {
    var isPdf=selectedFile.type==='application/pdf'||selectedFile.name.toLowerCase().endsWith('.pdf');
    var payload;
    if(isPdf){
      var base64=await readFileAsBase64(selectedFile);
      payload={base64:base64,mimetype:'application/pdf',filename:selectedFile.name};
    } else {
      var text=await readFileAsText(selectedFile);
      payload={text:text,filename:selectedFile.name};
    }
    var res=await fetch(API+'/extract-tender',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    var rawText=await res.text();
    if(!rawText||rawText.trim()==='') throw new Error('Empty response from server (status '+res.status+')');
    var data;
    try{data=JSON.parse(rawText);}catch(e){throw new Error('Bad response: '+rawText.substring(0,200));}
    if(!res.ok||data.error) throw new Error(data.error||'Server error '+res.status);
    extractedData=data;
    document.getElementById('ps4').className='proc-step done';
    await delay(400);
    document.getElementById('aiStep2').style.display='none';
    document.getElementById('aiStep3').style.display='block';
    renderPreview(data);
    document.getElementById('aiOpenFormBtn').style.display='flex';
  } catch(err) {
    document.getElementById('aiStep2').style.display='none';
    document.getElementById('aiStep1').style.display='block';
    document.getElementById('fileSelectedBar').style.display='flex';
    document.getElementById('uploadZone').style.display='none';
    document.getElementById('aiAnalyseBtn').style.display='flex';
    showToast('Extraction failed: '+err.message,'error');
  }
}

function readFileAsBase64(file){
  return new Promise(function(res,rej){
    var reader=new FileReader();
    reader.onload=function(e){res(e.target.result.split(',')[1]);};
    reader.onerror=rej;
    reader.readAsDataURL(file);
  });
}
function readFileAsText(file){
  return new Promise(function(res,rej){
    var reader=new FileReader();
    reader.onload=function(e){res(e.target.result);};
    reader.onerror=rej;
    reader.readAsText(file);
  });
}

function renderPreview(data) {
  var ch='<span class="conf conf-high"><i class="ti ti-check" style="font-size:10px"></i> Extracted</span>';
  var fields=[
    {l:'Tender title',v:data.title||'Not found'},
    {l:'Organisation',v:data.org||'Not found'},
    {l:'Region',v:data.region||'Not found'},
    {l:'Contract value',v:data.value||'Not found'},
    {l:'Duration',v:data.duration||'Not found'},
    {l:'Deadline',v:data.deadline||'Not found'},
    {l:'Our price (from doc)',v:data.our_price||'Not stated'},
    {l:'Description',v:data.description||'Not found',multi:true},
    {l:'Eligibility',v:(data.eligibility||[]).join('\n'),multi:true},
  ];
  document.getElementById('previewFields').innerHTML=fields.map(function(f){return '<div class="pf"><div class="pf-label"><span class="ai-tag">AI</span>'+f.l+ch+'</div><div class="pf-value'+(f.multi?' multi':'')+'">'+(f.v||'')+'</div></div>';}).join('');
}

function openInForm(){closeAiModal();openDrawer(null,currentSection,extractedData);}
function delay(ms){return new Promise(function(r){setTimeout(r,ms);});}

function openDrawerById(id,section){
  var t=allTenders.find(function(x){return x.id===id;});
  if(t) openDrawer(t,section);
}

function openDrawer(tOrId,sectionType,aiData){
  currentSection=sectionType||'care';
  var isNc=sectionType==='noncqc';
  var isCommercial=sectionType==='commercial';
  document.getElementById('editIsNonCqc').value=isNc?'1':'0';
  document.getElementById('categoryRow').style.display=isNc?'none':'grid';
  document.getElementById('whyCqcRow').style.display=isNc?'flex':'none';
  document.getElementById('aiBadge').style.display=aiData?'inline-flex':'none';
  ['Title','Org','Region','Value','Duration','Deadline','Desc','Link'].forEach(function(f){
    var el=document.getElementById('f'+f);if(el)el.classList.remove('ai-filled');
    var hint=document.getElementById('hint'+f);if(hint)hint.style.display='none';
  });
  var t=null;
  if(tOrId&&typeof tOrId==='object') t=tOrId;
  else if(tOrId&&typeof tOrId==='string') t=allTenders.find(function(x){return x.id===tOrId;});
  if(t){
    document.getElementById('editId').value=t.id||'';
    document.getElementById('drawerTitleText').childNodes[0].textContent='Edit tender ';
    document.getElementById('saveLabel').textContent='Save changes';
    document.getElementById('fTitle').value=t.title||'';
    document.getElementById('fOrg').value=t.org||t.organisation||'';
    document.getElementById('fRegion').value=t.region||'';
    document.getElementById('fValue').value=t.value||'';
    document.getElementById('fDuration').value=t.duration||'';
    document.getElementById('fDeadline').value=t.deadline||'';
    document.getElementById('fStatus').value=t.status||'open';
    document.getElementById('fDesc').value=t.description||'';
    document.getElementById('fLink').value=t.link||t.submission_link||'';
    document.getElementById('fStripeLink').value=t.stripe_link||'';
    document.getElementById('fPricingNote').value=(t.pricing||{}).note||'';
    if(!isNc) document.getElementById('fCategory').value=t.category||(isCommercial?'Construction':'Domiciliary care');
    if(isNc) document.getElementById('fWhyCqc').value=t.why_cqc||'';
    buildPriceRows((t.pricing||{}).items||[]);
    buildEligRows(Array.isArray(t.eligibility)?t.eligibility:[]);
  } else if(aiData){
    document.getElementById('editId').value='';
    document.getElementById('drawerTitleText').childNodes[0].textContent='Review AI-extracted tender ';
    document.getElementById('saveLabel').textContent='Publish tender';
    [['fTitle',aiData.title,'hintTitle'],['fOrg',aiData.org,'hintOrg'],['fRegion',aiData.region,'hintRegion'],
     ['fValue',aiData.value,'hintValue'],['fDuration',aiData.duration,'hintDuration'],
     ['fDeadline',aiData.deadline,'hintDeadline'],['fDesc',aiData.description,'hintDesc'],['fLink',aiData.link,'hintLink']
    ].forEach(function(arr){
      var el=document.getElementById(arr[0]);el.value=arr[1]||'';
      if(arr[1]){el.classList.add('ai-filled');var h=document.getElementById(arr[2]);if(h)h.style.display='flex';}
    });
    document.getElementById('fStatus').value='open';
    document.getElementById('fPricingNote').value='One-off fee. No hidden charges. Payable on engagement.';
    if(!isNc){
      var aiCat=aiData.category||autoDetectCategory((aiData.title||'')+' '+(aiData.description||''))||(isCommercial?'Construction':'Domiciliary care');
      document.getElementById('fCategory').value=aiCat;
    }
    var priceItems=aiData.our_price
      ?[{label:'Bid writing and strategy (from document)',price:aiData.our_price.replace(/[^0-9.]/g,'')}]
      :[{label:'Bid writing and strategy',price:''},{label:'Compliance review',price:''},{label:'Submission support',price:''}];
    buildPriceRows(priceItems);
    buildEligRows(aiData.eligibility&&aiData.eligibility.length?aiData.eligibility:['']);
  } else {
    document.getElementById('editId').value='';
    document.getElementById('drawerTitleText').childNodes[0].textContent='Add '+(isNc?'listing ':isCommercial?'commercial tender ':'care tender ');
    document.getElementById('saveLabel').textContent=isNc?'Publish listing':'Publish tender';
    ['fTitle','fOrg','fRegion','fValue','fDuration','fDesc','fWhyCqc','fLink','fStripeLink'].forEach(function(f){
      var el=document.getElementById(f);if(el){el.value='';el.classList.remove('ai-filled');}
    });
    document.getElementById('fDeadline').value='';
    document.getElementById('fStatus').value='open';
    document.getElementById('fPricingNote').value='One-off fee. No hidden charges. Payable on engagement.';
    if(!isNc) document.getElementById('fCategory').value=isCommercial?'Construction':'Domiciliary care';
    buildPriceRows([{label:'Bid writing and strategy',price:''},{label:'Compliance review',price:''},{label:'Submission support',price:''}]);
    buildEligRows(['']);
  }
  document.getElementById('drawerOverlay').classList.add('open');
}

function closeDrawer(){document.getElementById('drawerOverlay').classList.remove('open');}
function maybeCloseDrawer(e){if(e.target===document.getElementById('drawerOverlay'))closeDrawer();}

var prc=0;
function buildPriceRows(items){prc=0;document.getElementById('pricingBuilder').innerHTML='';items.forEach(function(i){_addPR(i.label,i.price);});updatePriceTotal();}
function _addPR(label,price){
  var b=document.getElementById('pricingBuilder');
  var d=document.createElement('div');d.className='price-row';d.id='pr'+prc;
    // Build price row using DOM to avoid quote escaping issues
  var inp1=document.createElement('input');inp1.type='text';inp1.placeholder='e.g. Bid writing';inp1.value=label||'';inp1.oninput=updatePriceTotal;
  var inp2=document.createElement('input');inp2.type='number';inp2.placeholder='Amount';inp2.value=price||'';inp2.oninput=updatePriceTotal;
  var btn=document.createElement('button');btn.className='rm-price';btn.type='button';
  btn.innerHTML='<i class="ti ti-x"></i>';
  var n=prc;btn.onclick=function(){document.getElementById('pr'+n).remove();updatePriceTotal();};
  d.appendChild(inp1);d.appendChild(inp2);d.appendChild(btn);
  b.appendChild(d);prc++;
}
function addPriceRow(){_addPR('','');updatePriceTotal();}
function updatePriceTotal(){var t=Array.from(document.querySelectorAll('#pricingBuilder input[type=number]')).reduce(function(s,i){return s+(parseFloat(i.value)||0);},0);document.getElementById('priceTotalPreview').textContent=t>0?'£'+t.toLocaleString()+'+VAT':'£0';}
function getPriceItems(){return Array.from(document.querySelectorAll('#pricingBuilder .price-row')).map(function(r){var ins=r.querySelectorAll('input');return{label:ins[0].value,price:ins[1].value};}).filter(function(i){return i.label||i.price;});}

var ec=0;
function buildEligRows(items){ec=0;document.getElementById('eligList').innerHTML='';items.forEach(function(v){addEligRow(v);});}
function addEligRow(val){
  val=val||'';
  var list=document.getElementById('eligList');
  var d=document.createElement('div');d.className='elig-item';d.id='el'+ec;
  var inp=document.createElement('input');inp.type='text';inp.placeholder='e.g. CQC registration required';inp.value=val;
  var btn=document.createElement('button');btn.className='rm-elig';btn.innerHTML='<i class="ti ti-x"></i>';
  btn.onclick=function(){d.remove();};
  d.appendChild(inp);d.appendChild(btn);
  list.appendChild(d);ec++;
}
function getEligItems(){return Array.from(document.querySelectorAll('#eligList input')).map(function(i){return i.value;}).filter(function(v){return v.trim();});}

function tryAutoCategory(){
  var title=document.getElementById('fTitle').value;
  var desc=document.getElementById('fDesc').value;
  var detected=autoDetectCategory(title+' '+desc);
  if(detected){var sel=document.getElementById('fCategory');if(sel)sel.value=detected;}
}

async function saveTender(draft){
  draft=draft||false;
  var isNonCqc=document.getElementById('editIsNonCqc').value==='1';
  var id=document.getElementById('editId').value;
  var pItems=getPriceItems();
  var total=pItems.reduce(function(s,i){return s+(parseFloat(i.price)||0);},0);
  var deadline=document.getElementById('fDeadline').value;
  var cat=document.getElementById('fCategory').value||null;
  var commercialCats=['Construction','Facilities','Cleaning','Consultancy','IT & Digital','Logistics','Other'];
  var tender={
    id:id||(isNonCqc?'NC':'T')+'-2026-'+String(nextId++).padStart(3,'0'),
    status:draft?'draft':document.getElementById('fStatus').value,
    title:document.getElementById('fTitle').value,
    org:document.getElementById('fOrg').value,
    region:document.getElementById('fRegion').value,
    value:document.getElementById('fValue').value,
    duration:document.getElementById('fDuration').value,
    deadline:deadline||null,
    days_left:deadline?Math.max(0,Math.round((new Date(deadline)-new Date())/(1000*60*60*24))):0,
    link:document.getElementById('fLink').value,
    stripe_link:document.getElementById('fStripeLink').value||null,
    description:document.getElementById('fDesc').value,
    pricing:{items:pItems.map(function(i){return{label:i.label,price:parseFloat(i.price)||0};}),total:total,note:document.getElementById('fPricingNote').value},
    eligibility:getEligItems(),
    is_non_cqc:commercialCats.includes(cat)?false:(isNonCqc||isNonCqcEligible({category:cat,eligibility:getEligItems()})),
    why_cqc:isNonCqc?document.getElementById('fWhyCqc').value:null,
    category:cat,
  };
  document.getElementById('savingSpinner').style.display='block';
  document.getElementById('saveIcon').style.display='none';
  document.getElementById('publishBtn').disabled=true;
  try {
    var res=await fetch(API+'/save-tender',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upsert',tender:tender})});
    var data=await res.json();
    if(data.error) throw new Error(data.error);
    var idx=allTenders.findIndex(function(x){return x.id===tender.id;});
    if(idx>-1) allTenders[idx]=tender; else allTenders.unshift(tender);
    closeDrawer();renderAll();
    showToast(draft?'Draft saved':'Tender published to live site','success');
  } catch(err){
    showToast('Save failed: '+err.message,'error');
  } finally {
    document.getElementById('savingSpinner').style.display='none';
    document.getElementById('saveIcon').style.display='inline';
    document.getElementById('publishBtn').disabled=false;
  }
}
function saveDraft(){saveTender(true);}

async function publishDraft(id){
  var t=allTenders.find(function(x){return x.id===id;});
  if(!t) return;
  t.status='open';
  try {
    var res=await fetch(API+'/save-tender',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upsert',tender:t})});
    var data=await res.json();
    if(!res.ok||data.error) throw new Error(data.error);
    showToast('Tender published to live site','success');
    await loadTenders();
  } catch(e){showToast('Publish failed: '+e.message,'error');}
}

function askDelete(id){deleteTarget={id:id};document.getElementById('confirmOverlay').classList.add('open');}
async function confirmDelete(){
  var id=deleteTarget.id;
  document.getElementById('confirmOverlay').classList.remove('open');
  try {
    var res=await fetch(API+'/save-tender',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',tender:{id:id}})});
    var data=await res.json();
    if(data.error) throw new Error(data.error);
    allTenders=allTenders.filter(function(x){return x.id!==id;});
    renderAll();showToast('Listing deleted','error');
  } catch(err){showToast('Delete failed: '+err.message,'error');}
}

var canaDocData={quality:[],spec:[],scoring:[]};

function renderCanaPanels() {
  var live = [];
  var pending = [];

  allTenders.filter(function(t){ return t.status !== 'draft'; }).forEach(function(t) {
    var hasSq      = !!(t.sq_data);
    var hasQuality = !!(t.cana_docs && t.cana_docs.quality && t.cana_docs.quality.length);
    var hasSpec    = !!(t.cana_docs && t.cana_docs.spec    && t.cana_docs.spec.length);
    var hasScoring = !!(t.cana_docs && t.cana_docs.scoring && t.cana_docs.scoring.length);
    var isLive = hasSq && hasQuality && hasSpec && hasScoring;

    if (isLive) {
      live.push(t);
    } else {
      var missing = [];
      if (!hasSq)      missing.push('SQ');
      if (!hasQuality) missing.push('Questions');
      if (!hasSpec)    missing.push('Spec');
      if (!hasScoring) missing.push('Scoring');
      pending.push({ tender: t, missing: missing });
    }
  });

  // Update counts
  var liveCount    = document.getElementById('liveTenderCount');
  var pendingCount = document.getElementById('pendingTenderCount');
  if (liveCount)    liveCount.textContent    = live.length;
  if (pendingCount) pendingCount.textContent = pending.length;

  // Render live list
  var liveList = document.getElementById('liveTenderList');
  if (liveList) {
    if (!live.length) {
      liveList.innerHTML = '<div style="padding:12px;text-align:center;font-size:0.82rem;color:var(--text-light);">No live tenders yet</div>';
    } else {
      liveList.innerHTML = live.map(function(t) {
        return '<div data-tid="' + t.id + '" onclick="selectCanaFromPanel(this.dataset.tid)" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;cursor:pointer;transition:background 0.15s;margin-bottom:2px;" class="cana-panel-row">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:0.85rem;font-weight:600;color:#1a7a3f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + t.title + '</div>' +
            '<div style="font-size:0.73rem;color:#2d6a4f;">' + (t.org||'') + '</div>' +
          '</div>' +
          '<span style="font-size:0.7rem;font-weight:700;color:#1a7a3f;background:#e8f7ee;padding:2px 8px;border-radius:999px;margin-left:8px;flex-shrink:0;">● Live</span>' +
        '</div>';
      }).join('');
    }
  }

  // Render pending list
  var pendingList = document.getElementById('pendingTenderList');
  if (pendingList) {
    if (!pending.length) {
      pendingList.innerHTML = '<div style="padding:12px;text-align:center;font-size:0.82rem;color:var(--text-light);">All tenders are live ✓</div>';
    } else {
      pendingList.innerHTML = pending.map(function(item) {
        var missingBadges = item.missing.map(function(m) {
          return '<span style="font-size:0.68rem;font-weight:700;background:rgba(229,62,62,0.1);color:#c53030;padding:1px 6px;border-radius:4px;margin-left:3px;">' + m + '</span>';
        }).join('');
        return '<div data-tid="' + item.tender.id + '" onclick="selectCanaFromPanel(this.dataset.tid)" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;cursor:pointer;transition:background 0.15s;margin-bottom:2px;" class="cana-panel-row pending">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:0.85rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + item.tender.title + '</div>' +
            '<div style="font-size:0.73rem;color:var(--text-light);margin-top:2px;">Missing:' + missingBadges + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }
}

function selectCanaFromPanel(tenderId) {
  // Select the tender in the dropdown and load it
  var sel = document.getElementById('canaTenderSelect');
  if (sel) {
    sel.value = tenderId;
    loadCanaDocs();
    // Scroll to the doc area
    var area = document.getElementById('canaDocArea');
    if (area) setTimeout(function(){ area.scrollIntoView({ behavior:'smooth', block:'start' }); }, 300);
  }
}

function populateCanaTenderSelect(){
  var sel=document.getElementById('canaTenderSelect');
  if(!sel) return;
  var cur=sel.value;
  sel.innerHTML='<option value="">Choose a tender...</option>';
  allTenders.filter(function(t){return t.status!=='draft';}).forEach(function(t){
    var opt=document.createElement('option');
    opt.value=t.id;
    var hasAllDocs = !!(t.sq_data) && t.cana_docs &&
      t.cana_docs.quality && t.cana_docs.quality.length &&
      t.cana_docs.spec && t.cana_docs.spec.length &&
      t.cana_docs.scoring && t.cana_docs.scoring.length;
    opt.textContent = (hasAllDocs ? '✓ ' : '') + t.title + (t.org ? ' — ' + t.org : '');
    sel.appendChild(opt);
  });
  if(cur) sel.value=cur;
  renderCanaPanels();
}

function loadCanaDocs(){
  var id=document.getElementById('canaTenderSelect').value;
  var area=document.getElementById('canaDocArea');
  if(!id){area.style.display='none';return;}
  area.style.display='block';
  canaDocData={quality:[],spec:[],scoring:[]};
  var t=allTenders.find(function(x){return x.id===id;});
  var docs=(t&&t.cana_docs)||{};
  ['quality','spec','scoring'].forEach(function(type){
    canaDocData[type]=Array.isArray(docs[type])?docs[type]:(docs[type]?[docs[type]]:[]);
    renderCanaFiles(type);
  });
  var hasSq = !!(t && t.sq_data);
  var hasQuality = canaDocData.quality.length > 0;
  var hasSpec = canaDocData.spec.length > 0;
  var hasScoring = canaDocData.scoring.length > 0;
  var hasAny = hasSq || hasQuality || hasSpec || hasScoring;
  var hasAll = hasSq && hasQuality && hasSpec && hasScoring;

  var badge = document.getElementById('canaDocStatus');
  if (!hasAny) {
    badge.style.display = 'none';
  } else if (hasAll) {
    badge.style.display = 'block';
    badge.style.background = '#e8f7ee';
    badge.style.border = '1px solid #9FE1CB';
    badge.style.color = '#1a7a3f';
    badge.textContent = '✓ All documents uploaded';
  } else {
    var missing = [];
    if (!hasSq) missing.push('SQ');
    if (!hasQuality) missing.push('Questions');
    if (!hasSpec) missing.push('Spec');
    if (!hasScoring) missing.push('Scoring');
    badge.style.display = 'block';
    badge.style.background = 'rgba(245,166,35,0.1)';
    badge.style.border = '1px solid rgba(245,166,35,0.35)';
    badge.style.color = '#92400e';
    badge.textContent = '⚠ Missing: ' + missing.join(', ');
  }
  document.getElementById('canaDocSaved').style.display='none';
  // Load questions
  buildCanaQuestionRows(t && t.cana_questions ? t.cana_questions : []);
}

function renderCanaFiles(type){
  var container=document.getElementById(type+'Files');
  if(!container) return;
  var files=canaDocData[type]||[];
  if(!files.length){container.innerHTML='';return;}
    container.innerHTML='';
  files.forEach(function(f,i){
    var div=document.createElement('div');
    div.className='cana-file-item';
    var icon=document.createElement('i');icon.className='ti ti-file-text';
    var span=document.createElement('span');span.title=f.name;span.textContent=f.name;span.style.flex='1';span.style.overflow='hidden';span.style.textOverflow='ellipsis';span.style.whiteSpace='nowrap';span.style.fontWeight='500';
    var btn=document.createElement('button');btn.className='cana-file-remove';btn.title='Remove';btn.textContent='x';
    var t2=type,i2=i;btn.onclick=function(){removeCanaFile(t2,i2);};
    div.appendChild(icon);div.appendChild(span);div.appendChild(btn);
    container.appendChild(div);
  });
}

function removeCanaFile(type,index){canaDocData[type].splice(index,1);renderCanaFiles(type);}
function canaDragOver(e,zoneId){e.preventDefault();document.getElementById(zoneId).classList.add('drag-over');}
function canaDragLeave(zoneId){document.getElementById(zoneId).classList.remove('drag-over');}
function canaOnDrop(e,type){e.preventDefault();document.getElementById(type+'Drop').classList.remove('drag-over');handleCanaDoc(type,e.dataTransfer.files);}

async function handleCanaDoc(type,files){
  if(!files||!files.length) return;
  for(var i=0;i<files.length;i++){
    var file=files[i];
    showToast('Extracting '+file.name+'...','ai');
    try{
      var b64=await new Promise(function(res,rej){
        var reader=new FileReader();
        reader.onload=function(e){res(e.target.result.split(',')[1]);};
        reader.onerror=rej;
        reader.readAsDataURL(file);
      });
      var resp=await fetch('/.netlify/functions/extract-cana-doc',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileBase64:b64,fileName:file.name,fileType:file.type})
      });
      var result=await resp.json();
      if(!resp.ok||result.error){showToast('Error: '+(result.error||'Could not read'),'error');continue;}
      canaDocData[type].push({name:file.name,text:result.text});
      showToast(file.name+' extracted successfully','success');
      if(type==='quality'){
        showToast('Detecting questions automatically...','ai');
        try{
          var qResp=await fetch('/.netlify/functions/extract-questions',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({text:result.text})
          });
          var qResult=await qResp.json();
          if(qResp.ok&&qResult.questions&&qResult.questions.length){
            buildCanaQuestionRows(qResult.questions);
            showToast(qResult.questions.length+' questions detected and populated below','success');
          }else{
            showToast('Could not auto-detect questions — please add manually','error');
          }
        }catch(qe){showToast('Auto-detection failed: '+qe.message,'error');}
      }
    }catch(e){showToast('Failed: '+e.message,'error');}
  }
  renderCanaFiles(type);
}

async function saveCanaDocs(){
  var id=document.getElementById('canaTenderSelect').value;
  if(!id){showToast('Please select a tender first','error');return;}
  var t=allTenders.find(function(x){return x.id===id;});
  if(!t){showToast('Tender not found','error');return;}
  t.cana_docs=canaDocData;
  t.cana_questions=getCanaQuestions();
  try{
    var res=await fetch(API+'/save-tender',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upsert',tender:t})});
    var data=await res.json();
    if(!res.ok||data.error)throw new Error(data.error);
    showToast('Cana AI saved successfully','success');
    document.getElementById('canaDocSaved').style.display='inline';
    await loadTenders();
    populateCanaTenderSelect();
    document.getElementById('canaTenderSelect').value=id;
  }catch(e){showToast('Save failed: '+e.message,'error');}
}

async function loadKnowledgeBase(){
  try{
    var res=await fetch('/.netlify/functions/get-knowledge-base');
    if(!res.ok)return;
    var d=await res.json();
    var ws=document.getElementById('kb-writing-style');
    var cp=document.getElementById('kb-commissioner-prefs');
    var av=document.getElementById('kb-avoid');
    if(ws&&d.writing_style)ws.value=d.writing_style;
    if(cp&&d.commissioner_preferences)cp.value=d.commissioner_preferences;
    if(av&&d.avoid_patterns_text)av.value=d.avoid_patterns_text;
    kbData.winning=d.winning_examples||[];
    kbData.failed=d.failed_examples||[];
    kbData.feedback=d.feedback_examples||[];
    renderKbFiles('winning');
    renderKbFiles('failed');
    renderKbFiles('feedback');
  }catch(e){console.log('KB load:',e);}
}

function renderKbFiles(type){
  var list=document.getElementById('kb-'+type+'-list');
  var empty=document.getElementById('kb-'+type+'-empty');
  if(!list)return;
  var files=kbData[type]||[];
  if(empty)empty.style.display=files.length?'none':'block';
  list.innerHTML='';
  files.forEach(function(f,i){
    var d=document.createElement('div');
    d.style.cssText='display:flex;align-items:center;gap:8px;background:#f9fafb;border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:4px;';
    var span=document.createElement('span');
    span.style.cssText='flex:1;font-size:0.82rem;';
    span.textContent=f.name+' ('+Math.round((f.text||'').length/100)/10+'k)';
    var btn=document.createElement('button');
    btn.style.cssText='background:none;border:none;color:#dc2626;cursor:pointer;';
    btn.innerHTML='<i class="ti ti-x"></i>';
    btn.onclick=(function(t,idx){return function(){removeKbFile(t,idx);};})(type,i);
    d.appendChild(span);
    d.appendChild(btn);
    list.appendChild(d);
  });
}

function removeKbFile(type,idx){
  kbData[type].splice(idx,1);
  renderKbFiles(type);
}

async function handleKbUpload(type,files){
  if(!files||!files.length)return;
  for(var i=0;i<files.length;i++){
    var file=files[i];
    showToast('Extracting '+file.name+'...','ai');
    try{
      var b64=await new Promise(function(res,rej){
        var r=new FileReader();
        r.onload=function(e){res(e.target.result.split(',')[1]);};
        r.onerror=rej;
        r.readAsDataURL(file);
      });
      var resp=await fetch('/.netlify/functions/extract-cana-doc',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileBase64:b64,fileName:file.name,fileType:file.type})
      });
      var result=await resp.json();
      if(!resp.ok||result.error){showToast('Error: '+(result.error||'Could not read'),'error');continue;}
      kbData[type].push({name:file.name,text:result.text});
      renderKbFiles(type);
      showToast(file.name+' added','success');
    }catch(e){showToast('Failed: '+e.message,'error');}
  }
}

async function saveKnowledgeBase(){
  var ws=document.getElementById('kb-writing-style');
  var cp=document.getElementById('kb-commissioner-prefs');
  var av=document.getElementById('kb-avoid');
  try{
    var res=await fetch('/.netlify/functions/save-knowledge-base',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        writing_style:ws?ws.value:'',
        commissioner_preferences:cp?cp.value:'',
        avoid_patterns_text:av?av.value:'',
        winning_examples:kbData.winning,
        failed_examples:kbData.failed,
        feedback_examples:kbData.feedback
      })
    });
    var data=await res.json();
    if(!res.ok||data.error)throw new Error(data.error);
    showToast('Knowledge base saved','success');
  }catch(e){showToast('Save failed: '+e.message,'error');}
}

async function loadTenders(){
  try{
    const res=await fetch(API+'/get-tenders');
    allTenders=await res.json()||[];
    // Sync nextId to avoid overwriting existing tenders
    allTenders.forEach(function(t){
      var m=t.id&&t.id.match(/(\d+)$/);
      if(m){var n=parseInt(m[1]);if(n>=nextId)nextId=n+1;}
    });
    renderAll();
    updateCounts();
    populateCanaTenderSelect();
  }catch(e){
    showToast('Could not load tenders','error');
  }
}

// ── GLOBAL VARS ───────────────────────────────────────────
var kbData = { winning: [], failed: [], feedback: [] };

// ── KNOWLEDGE BASE ─────────────────────────────────────────
async function loadKnowledgeBase() {
  try {
    var res = await fetch('/.netlify/functions/get-knowledge-base');
    if (!res.ok) return;
    var d = await res.json();
    var ws = document.getElementById('kb-writing-style');
    var cp = document.getElementById('kb-commissioner-prefs');
    var av = document.getElementById('kb-avoid');
    if (ws && d.writing_style) ws.value = d.writing_style;
    if (cp && d.commissioner_preferences) cp.value = d.commissioner_preferences;
    if (av && d.avoid_patterns_text) av.value = d.avoid_patterns_text;
    kbData.winning = d.winning_examples || [];
    kbData.failed = d.failed_examples || [];
    kbData.feedback = d.feedback_examples || [];
    renderKbFiles('winning');
    renderKbFiles('failed');
    renderKbFiles('feedback');
  } catch(e) { console.log('KB load error:', e); }
}

function renderKbFiles(type) {
  var list = document.getElementById('kb-' + type + '-list');
  var empty = document.getElementById('kb-' + type + '-empty');
  if (!list) return;
  var files = kbData[type] || [];
  if (empty) empty.style.display = files.length ? 'none' : 'block';
  list.innerHTML = '';
  files.forEach(function(f, i) {
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:8px;background:#f9fafb;border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:4px;';
    var span = document.createElement('span');
    span.style.cssText = 'flex:1;font-size:0.82rem;';
    span.textContent = f.name + ' (' + Math.round((f.text||'').length/100)/10 + 'k)';
    var btn = document.createElement('button');
    btn.style.cssText = 'background:none;border:none;color:#dc2626;cursor:pointer;';
    btn.innerHTML = '<i class="ti ti-x"></i>';
    btn.onclick = (function(t, idx) { return function() { removeKbFile(t, idx); }; })(type, i);
    d.appendChild(span);
    d.appendChild(btn);
    list.appendChild(d);
  });
}

function removeKbFile(type, idx) {
  kbData[type].splice(idx, 1);
  renderKbFiles(type);
}

async function handleKbUpload(type, files) {
  if (!files || !files.length) return;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    showToast('Extracting ' + file.name + '...', 'ai');
    try {
      var b64 = await new Promise(function(res, rej) {
        var reader = new FileReader();
        reader.onload = function(e) { res(e.target.result.split(',')[1]); };
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      var resp = await fetch('/.netlify/functions/extract-cana-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: b64, fileName: file.name, fileType: file.type })
      });
      var result = await resp.json();
      if (!resp.ok || result.error) { showToast('Error: ' + (result.error || 'Could not read'), 'error'); continue; }
      kbData[type].push({ name: file.name, text: result.text });
      renderKbFiles(type);
      showToast(file.name + ' added', 'success');
    } catch(e) { showToast('Failed: ' + e.message, 'error'); }
  }
}

async function saveKnowledgeBase() {
  var ws = document.getElementById('kb-writing-style');
  var cp = document.getElementById('kb-commissioner-prefs');
  var av = document.getElementById('kb-avoid');
  try {
    var res = await fetch('/.netlify/functions/save-knowledge-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writing_style: ws ? ws.value : '',
        commissioner_preferences: cp ? cp.value : '',
        avoid_patterns_text: av ? av.value : '',
        winning_examples: kbData.winning,
        failed_examples: kbData.failed,
        feedback_examples: kbData.feedback
      })
    });
    var d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error);
    showToast('Knowledge base saved successfully', 'success');
  } catch(e) { showToast('Save failed: ' + e.message, 'error'); }
}

// ── CANA AI QUESTIONS ──────────────────────────────────────
function buildCanaQuestionRows(questions) {
  var builder = document.getElementById('canaQuestionsBuilder');
  var empty = document.getElementById('canaQuestionsEmpty');
  if (!builder) return;
  builder.innerHTML = '';
  if (empty) empty.style.display = (questions && questions.length) ? 'none' : 'block';
  (questions || []).forEach(function(q) {
    addCanaQuestion(q.question, q.wordLimit, q.scoring);
  });
}

function addCanaQuestion(q, wordLimit, scoring) {
  q = q || ''; wordLimit = wordLimit || ''; scoring = scoring || '';
  var builder = document.getElementById('canaQuestionsBuilder');
  var empty = document.getElementById('canaQuestionsEmpty');
  if (!builder) return;
  if (empty) empty.style.display = 'none';
  var n = builder.children.length + 1;
  var d = document.createElement('div');
  d.style.cssText = 'background:#f9fafb;border:1.5px solid var(--border);border-radius:8px;padding:0.85rem;margin-bottom:8px;';
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
  var num = document.createElement('div');
  num.className = 'q-num';
  num.style.cssText = 'background:#0B1929;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;flex-shrink:0;';
  num.textContent = n;
  var label = document.createElement('div');
  label.className = 'q-label';
  label.style.cssText = 'font-size:0.82rem;font-weight:600;flex:1;';
  label.textContent = 'Question ' + n;
  var rmBtn = document.createElement('button');
  rmBtn.style.cssText = 'background:none;border:none;color:#dc2626;cursor:pointer;';
  rmBtn.innerHTML = '<i class="ti ti-trash"></i>';
  rmBtn.onclick = function() {
    d.remove();
    Array.from(builder.children).forEach(function(item, idx) {
      var numEl = item.querySelector('.q-num');
      var labelEl = item.querySelector('.q-label');
      if (numEl) numEl.textContent = idx + 1;
      if (labelEl) labelEl.textContent = 'Question ' + (idx + 1);
    });
    if (empty) empty.style.display = builder.children.length ? 'none' : 'block';
  };
  header.appendChild(num);
  header.appendChild(label);
  header.appendChild(rmBtn);
  var ta = document.createElement('textarea');
  ta.placeholder = 'Paste or type the question here...';
  ta.value = q;
  ta.style.cssText = 'width:100%;min-height:80px;padding:8px 12px;border:1.5px solid var(--border);border-radius:6px;font-size:0.85rem;font-family:DM Sans,sans-serif;resize:vertical;';
  var meta = document.createElement('div');
  meta.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;';
  var wlInp = document.createElement('input');
  wlInp.type = 'text';
  wlInp.placeholder = 'Word limit (optional)';
  wlInp.value = wordLimit;
  wlInp.style.cssText = 'padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:0.78rem;font-family:DM Sans,sans-serif;';
  var scInp = document.createElement('input');
  scInp.type = 'text';
  scInp.placeholder = 'Scoring (optional) e.g. 22%';
  scInp.value = scoring;
  scInp.style.cssText = 'padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:0.78rem;font-family:DM Sans,sans-serif;';
  meta.appendChild(wlInp);
  meta.appendChild(scInp);
  d.appendChild(header);
  d.appendChild(ta);
  d.appendChild(meta);
  builder.appendChild(d);
}

function getCanaQuestions() {
  var builder = document.getElementById('canaQuestionsBuilder');
  if (!builder) return [];
  return Array.from(builder.children).map(function(d) {
    var ta = d.querySelector('textarea');
    var inputs = d.querySelectorAll('input');
    return {
      question: ta ? ta.value.trim() : '',
      wordLimit: inputs[0] ? inputs[0].value.trim() : '',
      scoring: inputs[1] ? inputs[1].value.trim() : ''
    };
  }).filter(function(q) { return q.question; });
}

async function saveCanaDocs() {
  var id = document.getElementById('canaTenderSelect') ? document.getElementById('canaTenderSelect').value : '';
  if (!id) { showToast('Please select a tender first', 'error'); return; }
  var t = allTenders.find(function(x) { return x.id === id; });
  if (!t) { showToast('Tender not found', 'error'); return; }
  t.cana_docs = canaDocData;
  t.cana_questions = getCanaQuestions();
  try {
    var res = await fetch(API + '/save-tender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', tender: t })
    });
    var d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error);
    showToast('Cana AI saved successfully', 'success');
    var savedEl = document.getElementById('canaDocSaved');
    if (savedEl) savedEl.style.display = 'inline';
    await loadTenders();
    populateCanaTenderSelect();
    document.getElementById('canaTenderSelect').value = id;
  } catch(e) { showToast('Save failed: ' + e.message, 'error'); }
}

// Auto-login on page load



function showToast(msg,type){
  type=type||'success';
  var t=document.getElementById('toast');
  document.getElementById('toastMsg').textContent=msg;
  t.className='toast show '+(type||'');
  var icons={success:'ti-check',error:'ti-alert-circle',ai:'ti-sparkles'};
  document.getElementById('toastIcon').className='ti '+(icons[type]||'ti-check');
  setTimeout(function(){t.classList.remove('show');},4000);
}



// Stay logged in across refreshes
document.addEventListener('DOMContentLoaded', function(){ loadTenders(); });

  // ── SELECTION QUESTIONNAIRE UPLOAD ──────────────────────────────
  var sqSelectedFile = null;

  function handleSqDrop(event) {
    event.preventDefault();
    document.getElementById('sqDrop').style.borderColor = '';
    document.getElementById('sqDrop').style.background = '';
    var file = event.dataTransfer.files[0];
    if (file) validateAndSetSqFile(file);
  }

  function handleSqFileSelect(event) {
    var file = event.target.files[0];
    if (file) validateAndSetSqFile(file);
  }

  function validateAndSetSqFile(file) {
    if (!file.name.endsWith('.docx')) {
      showToast('Please upload a Word document (.docx) only', 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast('File must be under 20MB', 'error');
      return;
    }
    sqSelectedFile = file;
    var filesDiv = document.getElementById('sqDocFiles');
    filesDiv.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(124,58,237,0.06);border-radius:7px;margin-top:8px;">' +
        '<span>📄</span>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + file.name + '</div>' +
          '<div style="font-size:0.73rem;color:var(--text-light);">' + (file.size/1024).toFixed(0) + ' KB</div>' +
        '</div>' +
        '<button onclick="clearSqFile()" style="background:none;border:none;cursor:pointer;color:var(--text-light);">✕</button>' +
      '</div>' +
      '<button onclick="uploadSqDocument()" style="width:100%;margin-top:10px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:8px;padding:10px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:Arial,sans-serif;">⚡ Upload & extract fields</button>';
    document.getElementById('sqExtractStatus').style.display = 'none';
  }

  function clearSqFile() {
    sqSelectedFile = null;
    document.getElementById('sqDocFiles').innerHTML = '';
    document.getElementById('sqDocInput').value = '';
    document.getElementById('sqExtractStatus').style.display = 'none';
  }

  async function uploadSqDocument() {
    var tenderId = document.getElementById('canaTenderSelect').value;
    if (!tenderId) { showToast('Please select a tender first', 'error'); return; }
    if (!sqSelectedFile) { showToast('Please select an SQ file first', 'error'); return; }

    var statusEl = document.getElementById('sqExtractStatus');
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(0,201,224,0.08)';
    statusEl.style.color = '#0099AA';
    statusEl.textContent = '⏳ Reading document and extracting fields...';

    try {
      // Extract text from Word doc using mammoth.js (avoids Claude PDF-only restriction)
      statusEl.textContent = '⏳ Reading Word document...';
      var arrayBuffer = await sqSelectedFile.arrayBuffer();
      var mammothResult = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      var docText = mammothResult.value;
      if (!docText || docText.trim().length < 50) {
        throw new Error('Could not read document text. Make sure it is a valid .docx file.');
      }

      statusEl.textContent = '⏳ Extracting SQ fields with AI...';
      var res = await fetch('/.netlify/functions/extract-sq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId: tenderId, docText: docText, fileName: sqSelectedFile.name })
      });

      var data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Extraction failed');

      statusEl.style.background = 'rgba(56,161,105,0.08)';
      statusEl.style.color = '#1a7a3f';
      statusEl.textContent = '✓ ' + data.totalFields + ' fields extracted — ' +
        data.autoFill + ' auto-fillable, ' + data.aiDraft + ' AI-drafted, ' +
        data.clientConfirm + ' need client confirmation';

      showToast('SQ uploaded and extracted — ' + data.totalFields + ' fields', 'success');
      loadCanaDocs();
      renderCanaPanels();

    } catch(err) {
      statusEl.style.background = 'rgba(229,62,62,0.08)';
      statusEl.style.color = '#c53030';
      statusEl.textContent = '✗ ' + (err.message || 'Extraction failed — please try again');
      showToast('SQ extraction failed: ' + (err.message||'Error'), 'error');
    }
  }

