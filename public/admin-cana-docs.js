// Cana AI — tender panels, doc upload, save. Split from admin-cana.js.
// Loads after admin-core.js (provides canaDocData, allTenders, API) and before admin-import.js.

function renderCanaPanels() {
  var live = [];
  var pending = [];

  // Only approved tenders appear in Cana panels (same gate as the main tabs).
  // Live panel = admin explicitly set status to 'live' via Set LIVE button.
  // Everything else approved goes to Needs Attention until promoted.
  var CANA_STATUSES = ['live', 'needs_docs', 'open'];
  allTenders.filter(function(t){ return isApproved(t) && CANA_STATUSES.indexOf(t.status) !== -1; }).forEach(function(t) {
    var f = t.docFlags || {};
    var hasSq      = !!f.sq;
    var hasQuality = !!f.quality;
    var hasSpec    = !!f.spec;
    var hasScoring = !!f.scoring;
    // Live = status explicitly set to 'live' by admin (Set LIVE on site button)
    var isLive = t.status === 'live';

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
  var CANA_STATUSES = ['live','needs_docs','open'];
  allTenders.filter(function(t){ return isApproved(t) && CANA_STATUSES.indexOf(t.status) !== -1; }).forEach(function(t){
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

async function loadCanaDocs(){
  var id=document.getElementById('canaTenderSelect').value;
  var area=document.getElementById('canaDocArea');
  if(!id){area.style.display='none';return;}
  area.style.display='block';
  canaDocData={quality:[],spec:[],scoring:[]};
  var t=allTenders.find(function(x){return x.id===id;});
  renderTenderStatusBar(t);

  // List rows are light. Fetch the full record (extracted text, SQ internals,
  // completion pack) for this one tender so editing and saving work on real data.
  try {
    var fullRes = await fetch(API + '/get-tender-full?id=' + encodeURIComponent(id));
    if (fullRes.ok) {
      var full = await fullRes.json();
      if (t && full && full.id === id) {
        t.cana_docs = full.cana_docs;
        t.cana_questions = full.cana_questions;
        t.sq_data = full.sq_data;
        t.completion_docs = full.completion_docs;
        t.submission_portal = full.submission_portal;
      }
    }
  } catch(e) { showToast('Could not load full tender data: ' + e.message, 'error'); }

  var docs=(t&&t.cana_docs)||{};
  if (typeof loadDeliveryPack === 'function') loadDeliveryPack(t);
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

async function saveCanaDocs() {
  var id = document.getElementById('canaTenderSelect') ? document.getElementById('canaTenderSelect').value : '';
  if (!id) { showToast('Please select a tender first', 'error'); return; }
  var t = allTenders.find(function(x) { return x.id === id; });
  if (!t) { showToast('Tender not found', 'error'); return; }
  try {
    // Send only the changed fields. Whole-tender saves exceed request limits
    // once a tender carries extracted document text.
    var res = await fetch(API + '/patch-tender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: id,
        fields: { cana_docs: canaDocData, cana_questions: getCanaQuestions() }
      })
    });
    var d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error);
    t.cana_docs = canaDocData;
    t.cana_questions = getCanaQuestions();
    showToast('Cana AI saved successfully', 'success');
    var savedEl = document.getElementById('canaDocSaved');
    if (savedEl) savedEl.style.display = 'inline';
    await loadTenders();
    populateCanaTenderSelect();
    document.getElementById('canaTenderSelect').value = id;
  } catch(e) { showToast('Save failed: ' + e.message, 'error'); }
}

// Auto-login on page load

async function loadTenders(){
  try{
    const res=await fetch(API+'/get-tenders?scope=all');
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

