// Cana, question builder, status bar, toast util. Split from admin-cana.js.

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
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ tenderId: tenderId, docText: docText, base64Doc: fileBase64, fileName: sqSelectedFile.name })
      });

      var data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Extraction failed');

      statusEl.style.background = 'rgba(56,161,105,0.08)';
      statusEl.style.color = '#1a7a3f';
      statusEl.textContent = '✓ ' + data.totalFields + ' fields extracted, ' +
        data.autoFill + ' auto-fillable, ' + data.aiDraft + ' AI-drafted, ' +
        data.clientConfirm + ' need client confirmation';

      showToast('SQ uploaded and extracted: ' + data.totalFields + ' fields', 'success');
      // Reload fresh data so sq_data is in allTenders and panels update correctly
      await loadTenders();
      loadCanaDocs();
      renderCanaPanels();
      populateCanaTenderSelect();

    } catch(err) {
      statusEl.style.background = 'rgba(229,62,62,0.08)';
      statusEl.style.color = '#c53030';
      statusEl.textContent = '✗ ' + (err.message || 'Extraction failed, please try again');
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
  var label = isLive ? '&#x2713; LIVE on site' : status === 'needs_docs' ? '&#x1F4C4; Needs documents, not visible to clients' : '&#x23F3; ' + status;

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
    renderCanaPanels();   // re-sort Live vs Needs Attention immediately
    populateCanaTenderSelect();
    showToast(newStatus === 'live' ? 'Tender is now LIVE on the site' : 'Tender taken offline', 'success');
  } catch(e) { showToast('Status update failed: ' + e.message, 'error'); }
}

