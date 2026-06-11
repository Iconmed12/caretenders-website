// Client completion pack — documents the CLIENT must complete themselves
// (Form of Tender, appendices, pricing schedules) plus the submission portal.
// Sent with the Cana delivery email as a checklist. Split per tender.

var deliveryState = { docs: [], portal: { name: '', url: '' } };
var DELIVERY_FILE_CAP = 10 * 1024 * 1024;   // 10MB per file
var DELIVERY_TOTAL_WARN = 25 * 1024 * 1024; // warn above 25MB total (email limits)

function loadDeliveryPack(t) {
  deliveryState.docs = (t && Array.isArray(t.completion_docs)) ? t.completion_docs.slice() : [];
  deliveryState.portal = (t && t.submission_portal) ? Object.assign({ name: '', url: '' }, t.submission_portal) : { name: '', url: '' };
  var nameSel = document.getElementById('deliveryPortalName');
  var urlInp = document.getElementById('deliveryPortalUrl');
  if (nameSel) nameSel.value = deliveryState.portal.name || '';
  if (urlInp) urlInp.value = deliveryState.portal.url || '';
  renderDeliveryFiles();
}

function deliveryTotalBytes() {
  return deliveryState.docs.reduce(function(sum, d) { return sum + (d.size || 0); }, 0);
}

function renderDeliveryFiles() {
  var list = document.getElementById('deliveryFileList');
  var totalEl = document.getElementById('deliveryTotal');
  if (!list) return;
  if (!deliveryState.docs.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;font-size:0.8rem;color:var(--text-light);">No completion documents uploaded yet</div>';
  } else {
    list.innerHTML = deliveryState.docs.map(function(d, i) {
      var kb = Math.round((d.size || 0) / 1024);
      return '<div style="display:flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;">' +
        '<span style="font-size:1rem;">📄</span>' +
        '<input value="' + (d.label || '').replace(/"/g, '&quot;') + '" onchange="updateDeliveryLabel(' + i + ', this.value)" ' +
          'style="flex:1;border:1px solid var(--border);border-radius:6px;padding:5px 9px;font-size:0.8rem;" placeholder="Document label e.g. Form of Tender">' +
        '<span style="font-size:0.72rem;color:var(--text-light);white-space:nowrap;">' + (d.fileName || '') + ' · ' + kb + 'KB</span>' +
        '<button onclick="removeDeliveryDoc(' + i + ')" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:0.95rem;" title="Remove">✕</button>' +
      '</div>';
    }).join('');
  }
  if (totalEl) {
    var total = deliveryTotalBytes();
    var mb = (total / (1024 * 1024)).toFixed(1);
    totalEl.textContent = deliveryState.docs.length + ' file' + (deliveryState.docs.length === 1 ? '' : 's') + ' · ' + mb + 'MB total';
    totalEl.style.color = total > DELIVERY_TOTAL_WARN ? '#dc2626' : 'var(--text-light)';
    if (total > DELIVERY_TOTAL_WARN) totalEl.textContent += ' — over 25MB, email may reject attachments';
  }
}

function updateDeliveryLabel(i, val) {
  if (deliveryState.docs[i]) deliveryState.docs[i].label = val;
}

function removeDeliveryDoc(i) {
  deliveryState.docs.splice(i, 1);
  renderDeliveryFiles();
}

async function handleDeliveryUpload(files) {
  if (!files || !files.length) return;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (file.size > DELIVERY_FILE_CAP) {
      showToast(file.name + ' is over the 10MB per-file limit', 'error');
      continue;
    }
    try {
      var b64 = await new Promise(function(res, rej) {
        var reader = new FileReader();
        reader.onload = function(e) { res(e.target.result.split(',')[1]); };
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      var label = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      deliveryState.docs.push({ label: label, fileName: file.name, type: file.type, size: file.size, data: b64 });
      showToast(file.name + ' added to completion pack', 'success');
    } catch (e) {
      showToast('Could not read ' + file.name, 'error');
    }
  }
  renderDeliveryFiles();
}

function deliveryDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function deliveryDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function deliveryOnDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  handleDeliveryUpload(e.dataTransfer.files);
}

async function saveDeliveryPack() {
  var id = document.getElementById('canaTenderSelect') ? document.getElementById('canaTenderSelect').value : '';
  if (!id) { showToast('Please select a tender first', 'error'); return; }
  var t = allTenders.find(function(x) { return x.id === id; });
  if (!t) { showToast('Tender not found', 'error'); return; }

  var nameSel = document.getElementById('deliveryPortalName');
  var urlInp = document.getElementById('deliveryPortalUrl');
  deliveryState.portal.name = nameSel ? nameSel.value : '';
  deliveryState.portal.url = urlInp ? (urlInp.value || '').trim() : '';

  if (deliveryState.portal.url && !/^https?:\/\//i.test(deliveryState.portal.url)) {
    deliveryState.portal.url = 'https://' + deliveryState.portal.url;
  }

  t.completion_docs = deliveryState.docs;
  t.submission_portal = deliveryState.portal;

  try {
    var res = await fetch(API + '/save-tender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', tender: t })
    });
    var d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error || 'Save failed');
    showToast('Completion pack saved', 'success');
    var savedEl = document.getElementById('deliverySaved');
    if (savedEl) { savedEl.style.display = 'inline'; setTimeout(function() { savedEl.style.display = 'none'; }, 2500); }
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}
