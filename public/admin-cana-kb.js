// Cana AI — knowledge base. Split from admin-cana.js.

var kbData = { winning: [], failed: [], feedback: [] };

async function loadKnowledgeBase() {
  try {
    var res = await fetch('/.netlify/functions/get-knowledge-base');
    if (!res.ok) return;
    var d = await res.json();
    var ws = document.getElementById('kb-writing-style');
    var cp = document.getElementById('kb-commissioner-prefs');
    var av = document.getElementById('kb-avoid');
    if (ws && d.writing_style) ws.value = d.writing_style;
    var wg = document.getElementById('canaKnowledge');
    if (wg && d.writing_guidance) wg.value = d.writing_guidance;
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


async function saveCanaKnowledge() {
  var textarea = document.getElementById('canaKnowledge');
  var savedMsg = document.getElementById('canaKnowledgeSaved');
  if (!textarea) return;
  try {
    var res = await fetch('/.netlify/functions/save-knowledge-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writing_guidance: textarea.value })
    });
    if (!res.ok) throw new Error('Save failed');
    if (savedMsg) { savedMsg.style.display = 'inline'; setTimeout(function(){ savedMsg.style.display = 'none'; }, 2500); }
  } catch(e) {
    alert('Could not save knowledge. Please try again.');
  }
}
