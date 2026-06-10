function renderCanaPanels() {
  var live = [];
  var pending = [];

  allTenders.filter(function(t){ return t.status !== 'draft'; }).forEach(function(t) {
    var hasSq      = !!(t.sq_data && (t.sq_data.fileName || t.sq_data.htmlPreview || (t.sq_data.sections && t.sq_data.sections.length > 0)));
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
      liveList.innerHTML = live.map(function(t, i) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;margin-bottom:2px;transition:background 0.15s;" class="cana-panel-row">' +
          '<span style="font-size:0.75rem;font-weight:700;color:#2d6a4f;min-width:18px;">' + (i+1) + ')</span>' +
          '<div data-tid="' + t.id + '" onclick="selectCanaFromPanel(this.dataset.tid)" style="flex:1;min-width:0;cursor:pointer;">' +
            '<div style="font-size:0.85rem;font-weight:600;color:#1a7a3f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + t.title + '</div>' +
            '<div style="font-size:0.73rem;color:#2d6a4f;">' + (t.org||'') + '</div>' +
          '</div>' +
          '<span style="font-size:0.7rem;font-weight:700;color:#1a7a3f;background:#e8f7ee;padding:2px 8px;border-radius:999px;flex-shrink:0;">● Live</span>' +
          '<button data-tid="' + t.id + '" data-title="' + t.title.replace(/"/g,"'") + '" onclick="removeTenderFromLive(this.dataset.tid, this.dataset.title)" style="background:none;border:none;color:#c53030;font-size:0.9rem;cursor:pointer;padding:2px 4px;flex-shrink:0;opacity:0.6;transition:opacity 0.2s;" title="Move back to Needs Attention" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✕</button>' +
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
      pendingList.innerHTML = pending.map(function(item, i) {
        var missingBadges = item.missing.map(function(m) {
          return '<span style="font-size:0.68rem;font-weight:700;background:rgba(229,62,62,0.1);color:#c53030;padding:1px 6px;border-radius:4px;margin-left:3px;">' + m + '</span>';
        }).join('');
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;margin-bottom:2px;transition:background 0.15s;" class="cana-panel-row pending">' +
          '<span style="font-size:0.75rem;font-weight:700;color:#92400e;min-width:18px;">' + (i+1) + ')</span>' +
          '<div data-tid="' + item.tender.id + '" onclick="selectCanaFromPanel(this.dataset.tid)" style="flex:1;min-width:0;cursor:pointer;">' +
            '<div style="font-size:0.85rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + item.tender.title + '</div>' +
            '<div style="font-size:0.73rem;color:var(--text-light);margin-top:2px;">Missing:' + missingBadges + '</div>' +
          '</div>' +
          '<button data-tid="' + item.tender.id + '" data-title="' + item.tender.title.replace(/"/g,"'") + '" onclick="removeTenderFromLive(this.dataset.tid, this.dataset.title)" style="background:none;border:none;color:#c53030;font-size:0.9rem;cursor:pointer;padding:2px 4px;flex-shrink:0;opacity:0.6;transition:opacity 0.2s;" title="Move back to Needs Attention" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✕</button>' +
        '</div>';
      }).join('');
    }
  }
}

async function removeTenderFromLive(tenderId, tenderTitle) {
  if (!confirm('Move "' + tenderTitle + '" back to Needs Attention?\n\nThe SQ will be cleared so it needs re-uploading. All other documents and questions are kept.')) return;
  try {
    const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';
    var res = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/tenders?id=eq.' + tenderId, {
      method: 'PATCH',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ sq_data: null })
    });
    if (!res.ok) throw new Error('Could not update tender');
    // Update local allTenders
    var t = allTenders.find(function(x){ return x.id === tenderId; });
    if (t) t.sq_data = null;
    renderCanaPanels();
    populateCanaTenderSelect();
    showToast('"' + tenderTitle + '" moved back to Needs Attention', 'success');
  } catch(err) {
    showToast('Failed: ' + (err.message||'Error'), 'error');
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
  var cur=sel.value||localStorage.getItem('cana_last_tender')||'';
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
  if(sel.value) { localStorage.setItem('cana_last_tender',sel.value); loadCanaDocs(); }
}

function loadCanaDocs(){
  var id=document.getElementById('canaTenderSelect').value;
  var area=document.getElementById('canaDocArea');
  if(!id){area.style.display='none';return;}
  area.style.display='block';
  canaDocData={quality:[],spec:[],scoring:[]};
  var t=allTenders.find(function(x){return x.id===id;});
  renderTenderStatusBar(t);
  var docs=(t&&t.cana_docs)||{};
  console.log('sq_data for tender', id, ':', JSON.stringify(t&&t.sq_data));
  ['quality','spec','scoring'].forEach(function(type){
    canaDocData[type]=Array.isArray(docs[type])?docs[type]:(docs[type]?[docs[type]]:[]);
    renderCanaFiles(type);
  });
  var hasSq = !!(t && t.sq_data && (t.sq_data.fileName || t.sq_data.htmlPreview || (t.sq_data.sections && t.sq_data.sections.length > 0)));
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

  // Show already-uploaded SQ file if it exists in sq_data
  var sqFilesEl = document.getElementById('sqDocFiles');
  var sqStatusEl = document.getElementById('sqExtractStatus');
  if (sqFilesEl) {
    if (t && t.sq_data && t.sq_data.fileName) {
      var fn = t.sq_data.fileName;
      var fields = t.sq_data.totalFields || 0;
      var uploaded = t.sq_data.extractedAt ? new Date(t.sq_data.extractedAt).toLocaleDateString('en-GB') : '';
      sqFilesEl.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f0fdf4;border:1.5px solid #9FE1CB;border-radius:8px;">' +
        '<span style="font-size:1.1rem;">✅</span>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:0.82rem;font-weight:700;color:#166534;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + fn + '</div>' +
        '<div style="font-size:0.75rem;color:#4a7c59;">' + (fields ? fields + ' fields extracted' : 'Uploaded') + (uploaded ? ' · ' + uploaded : '') + '</div>' +
        '</div>' +
        '<button onclick="clearSqFile();loadCanaDocs();" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:1rem;padding:2px 6px;">↺</button>' +
        '</div>';
      if (sqStatusEl) sqStatusEl.style.display = 'none';
    } else {
      sqFilesEl.innerHTML = '';
      if (sqStatusEl) sqStatusEl.style.display = 'none';
    }
  }

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
    await loadTenders(); renderCanaPanels(); populateCanaTenderSelect();
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
      // Also send original file as base64 for storage
      var fileBase64 = await new Promise(function(resolve, reject) {
        var fr = new FileReader();
        fr.onload = function(){ resolve(fr.result.split(',')[1]); };
        fr.onerror = reject;
        fr.readAsDataURL(sqSelectedFile);
      });

      var res = await fetch('/.netlify/functions/extract-sq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId: tenderId, docText: docText, base64Doc: fileBase64, fileName: sqSelectedFile.name })
      });

      var data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Extraction failed');

      statusEl.style.background = 'rgba(56,161,105,0.08)';
      statusEl.style.color = '#1a7a3f';
      statusEl.textContent = '✓ ' + data.totalFields + ' fields extracted — ' +
        data.autoFill + ' auto-fillable, ' + data.aiDraft + ' AI-drafted, ' +
        data.clientConfirm + ' need client confirmation';

      showToast('SQ uploaded and extracted — ' + data.totalFields + ' fields', 'success');
      // Reload fresh data so sq_data is in allTenders and panels update correctly
      await loadTenders();
      loadCanaDocs();
      renderCanaPanels();
      populateCanaTenderSelect();

    } catch(err) {
      statusEl.style.background = 'rgba(229,62,62,0.08)';
      statusEl.style.color = '#c53030';
      statusEl.textContent = '✗ ' + (err.message || 'Extraction failed — please try again');
      showToast('SQ extraction failed: ' + (err.message||'Error'), 'error');
    }
  }



// ── Tender status bar with Set Live control ──
function renderTenderStatusBar(t) {
  if (!t) return;
  var area = document.getElementById('canaDocArea');
  if (!area) return;
  var bar = document.getElementById('tender-status-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'tender-status-bar';
    area.insertBefore(bar, area.firstChild);
  }
  var status = t.status || 'unknown';
  var isLive = status === 'live';
  var color = isLive ? '#166534' : status === 'needs_docs' ? '#0369a1' : '#92400e';
  var bg    = isLive ? '#e8f7ee' : status === 'needs_docs' ? '#e0f2fe' : '#fefce8';
  var label = isLive ? '&#x2713; LIVE on site' : status === 'needs_docs' ? '&#x1F4C4; Needs documents — not visible to clients' : '&#x23F3; ' + status;

  bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;background:' + bg + ';border:1.5px solid ' + color + '33;border-radius:10px;padding:12px 16px;margin-bottom:1rem;';
  var srcLink = t.source_url
    ? '<a href="' + t.source_url + '" target="_blank" style="font-size:0.8rem;color:#0369a1;font-weight:600;text-decoration:none;margin-left:auto;margin-right:12px;">Open original notice &#x2197;</a>'
    : '';
  bar.innerHTML =
    '<span style="font-weight:700;font-size:0.85rem;color:' + color + ';">' + label + '</span>' + srcLink +
    (isLive
      ? '<button data-status-action="needs_docs" data-tender="' + t.id + '" style="background:#fff;color:#92400e;border:1px solid #fbbf24;padding:7px 14px;border-radius:7px;font-size:0.8rem;font-weight:700;cursor:pointer;font-family:inherit;">Take offline</button>'
      : '<button data-status-action="live" data-tender="' + t.id + '" style="background:#166534;color:#fff;border:none;padding:7px 16px;border-radius:7px;font-size:0.8rem;font-weight:700;cursor:pointer;font-family:inherit;">&#x1F680; Set LIVE on site</button>');

  bar.onclick = function(e) {
    var btn = e.target.closest('[data-status-action]');
    if (btn) setTenderStatus(btn.getAttribute('data-tender'), btn.getAttribute('data-status-action'));
  };
}

async function setTenderStatus(id, newStatus) {
  try {
    const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';
    var res = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/tenders?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var t = allTenders.find(function(x){ return x.id === id; });
    if (t) t.status = newStatus;
    renderTenderStatusBar(t);
    showToast(newStatus === 'live' ? 'Tender is now LIVE on the site' : 'Tender taken offline', 'success');
  } catch(e) { showToast('Status update failed: ' + e.message, 'error'); }
}
