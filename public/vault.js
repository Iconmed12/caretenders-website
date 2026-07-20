
  const SUPABASE_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTE5NDEsImV4cCI6MjA5NjE2Nzk0MX0.7s3EEk5pJzwJm8jrY4c6XNN2hga2LB1AEWb_vsxNakA';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  var currentUser = null;
  var allDocs = [];
  var selectedFile = null;
  var currentFilter = 'all';

  var DOC_CATEGORIES = {
    public_liability:'insurance', employers_liability:'insurance', professional_indemnity:'insurance',
    cqc_certificate:'regulatory', ico_registration:'regulatory',
    safeguarding:'policies', health_safety:'policies', equality_diversity:'policies',
    modern_slavery:'policies', business_continuity:'policies', gdpr_policy:'policies',
    infection_control:'policies', medication_management:'policies',
    latest_accounts:'financial',
    case_study:'experience', reference_letter:'experience',
    accreditation_cert:'accreditations', other:'other'
  };

  var DOC_LABELS = {
    public_liability:'Public Liability Insurance', employers_liability:'Employers Liability Insurance',
    professional_indemnity:'Professional Indemnity Insurance', cqc_certificate:'CQC Certificate',
    ico_registration:'ICO Registration', safeguarding:'Safeguarding Policy',
    health_safety:'Health & Safety Policy', equality_diversity:'Equality & Diversity Policy',
    modern_slavery:'Modern Slavery Statement', business_continuity:'Business Continuity Plan',
    gdpr_policy:'GDPR / Data Protection Policy', infection_control:'Infection Control Policy',
    medication_management:'Medication Management Policy', latest_accounts:'Latest Accounts',
    case_study:'Case Study', reference_letter:'Reference Letter',
    accreditation_cert:'Accreditation Certificate', other:'Document'
  };

  var CAT_LABELS = {
    insurance:'Insurance', regulatory:'Regulatory', policies:'Policies',
    financial:'Financial', experience:'Experience', accreditations:'Accreditations', other:'Other'
  };

  function showToast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show ' + (type||'');
    setTimeout(function(){ t.classList.remove('show'); }, 3500);
  }

  function getExpiryStatus(expiryDate, docType, reviewDate) {
    var isReview = REVIEW_DATE_TYPES && REVIEW_DATE_TYPES.includes(docType);
    var dateToUse = isReview ? reviewDate : expiryDate;
    if (!dateToUse) return { label: isReview ? 'No review date' : 'No expiry set', cls:'none', days:null };
    var parts = dateToUse.split('/');
    if (parts.length !== 3) return { label:'No date set', cls:'none', days:null };
    var exp = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
    var today = new Date(); today.setHours(0,0,0,0);
    var days = Math.ceil((exp - today) / (1000*60*60*24));
    if (days < 0) return { label: isReview ? 'Review overdue' : 'Expired', cls:'expired', days:days };
    if (days <= 14) return { label: (isReview ? 'Review in ' : 'Expires in ') + days + 'd', cls:'expired', days:days };
    if (days <= 30) return { label: (isReview ? 'Review in ' : 'Expires in ') + days + 'd', cls:'soon', days:days };
    return { label: (isReview ? 'Review: ' : 'Valid until ') + dateToUse, cls:'valid', days:days };
  }

  function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
  }

  function renderDocs() {
    var grid = document.getElementById('doc-grid');
    var filtered = currentFilter === 'all' ? allDocs : allDocs.filter(function(d){
      return DOC_CATEGORIES[d.doc_type] === currentFilter;
    });

    // Update stats
    var total = allDocs.length;
    var expiring = 0, expired = 0, valid = 0;
    allDocs.forEach(function(d){
      var s = getExpiryStatus(d.expiry_date);
      if (s.cls === 'expired') expired++;
      else if (s.cls === 'soon') expiring++;
      else if (s.cls === 'valid') valid++;
    });
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-valid').textContent = valid;
    document.getElementById('stat-expiring').textContent = expiring;
    document.getElementById('stat-expired').textContent = expired;

    // Expiry alert banner
    var alert = document.getElementById('expiry-alert');
    if (expiring > 0 || expired > 0) {
      var msgs = [];
      if (expired > 0) msgs.push(expired + ' document' + (expired>1?'s are':' is') + ' expired');
      if (expiring > 0) msgs.push(expiring + ' document' + (expiring>1?'s are':' is') + ' expiring within 30 days');
      document.getElementById('expiry-alert-text').textContent = msgs.join('. ') + '. Please re-upload to avoid submitting outdated documents.';
      alert.classList.add('show');
    } else {
      alert.classList.remove('show');
    }

    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🗂️</div><h3>' +
        (currentFilter==='all' ? 'Your vault is empty' : 'No '+CAT_LABELS[currentFilter]+' documents') +
        '</h3><p>' + (currentFilter==='all' ? 'Upload your first document using the button above.' : 'Upload a document and select the '+CAT_LABELS[currentFilter]+' category.') + '</p></div>';
      return;
    }

    grid.innerHTML = filtered.map(function(doc) {
      var status = getExpiryStatus(doc.expiry_date, doc.doc_type, doc.review_date);
      var isImage = doc.file_name && /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name);
      var cardCls = status.cls === 'expired' ? 'expired' : status.cls === 'soon' ? 'expiring' : '';
      var thumb = isImage
        ? '<img src="' + (doc._signedUrl||'') + '" alt="" onerror="this.parentElement.innerHTML=\'<div class=doc-thumb-pdf><span>🖼️</span></div>\'">'
        : '<div class="doc-thumb-pdf"><span>📄</span></div>';
      var uploadedDate = new Date(doc.uploaded_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      return '<div class="doc-card ' + cardCls + '" onclick="viewDoc(\'' + doc.id + '\')">' +
        '<div class="doc-thumb">' + thumb +
          '<span class="expiry-badge ' + status.cls + '">' + status.label + '</span>' +
        '</div>' +
        '<div class="doc-info">' +
          '<div class="doc-category">' + (CAT_LABELS[DOC_CATEGORIES[doc.doc_type]]||'Document') + '</div>' +
          '<div class="doc-name">' + (doc.doc_label || DOC_LABELS[doc.doc_type] || doc.file_name) + '</div>' +
          '<div class="doc-date">' + (
            status.cls !== 'none'
              ? (REVIEW_DATE_TYPES.includes(doc.doc_type) ? '🔄 Review: ' : '📅 Expires: ') + (doc.review_date || doc.expiry_date)
              : ''
          ) + '</div>' +
          '<div class="doc-meta">Uploaded ' + uploadedDate + '</div>' +
        '</div>' +
        '<div class="doc-actions" onclick="event.stopPropagation()">' +
          '<button class="doc-btn" onclick="viewDoc(\'' + doc.id + '\')">👁 View</button>' +
          '<button class="doc-btn" onclick="downloadDoc(\'' + doc.id + '\')">⬇ Save</button>' +
          '<button class="doc-btn" onclick="editDoc(\'' + doc.id + '\')">✏️ Edit</button>' +
          '<button class="doc-btn danger" onclick="deleteDoc(\'' + doc.id + '\')">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  async function loadDocs() {
    var { data, error } = await sb.from('vault_documents')
      .select('*').eq('user_id', currentUser.id).order('uploaded_at', { ascending:false });
    if (error) { showToast('Could not load documents', 'error'); return; }
    allDocs = data || [];
    // Generate signed URLs for images
    for (var i = 0; i < allDocs.length; i++) {
      var doc = allDocs[i];
      if (doc.file_path && /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name||'')) {
        var { data: urlData } = await sb.storage.from('Vault').createSignedUrl(doc.file_path, 3600);
        if (urlData) doc._signedUrl = urlData.signedUrl;
      }
    }
    renderDocs();
  }

  function filterDocs(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(function(t){ t.classList.remove('active'); });
    btn.classList.add('active');
    renderDocs();
  }

  // ── UPLOAD ──
  function openUploadModal() {
    document.getElementById('upload-modal').classList.add('show');
  }
  function closeUploadModal() {
    if (document.getElementById('upload-btn').textContent === 'Uploading...') return;
    // Reset to upload mode if we were in edit mode
    var btn = document.getElementById('upload-btn');
    if (btn.textContent === 'Update dates') {
      btn.textContent = 'Upload & scan';
      btn.onclick = uploadDocument;
    }
    document.getElementById('upload-modal').classList.remove('show');
    clearFile();
    document.getElementById('doc-type-select').value = '';
    document.getElementById('doc-label-input').value = '';
    document.getElementById('doc-expiry-input').value = '';
    document.getElementById('doc-review-input').value = '';
    document.getElementById('upload-progress').classList.remove('show');
  }

  // Doc types that have review dates rather than expiry dates
  var REVIEW_DATE_TYPES = ['safeguarding','health_safety','equality_diversity','modern_slavery',
    'business_continuity','gdpr_policy','infection_control','medication_management',
    'case_study','reference_letter'];

  // Doc types with no date needed
  var NO_DATE_TYPES = ['case_study','reference_letter'];

  function updateDateFields(type) {
    var expiryGroup = document.getElementById('expiry-group');
    var reviewGroup = document.getElementById('review-group');
    if (!expiryGroup || !reviewGroup) return;
    if (!type) {
      // No type selected, show both dimmed
      expiryGroup.style.opacity = '0.5';
      reviewGroup.style.opacity = '0.5';
      return;
    }
    if (NO_DATE_TYPES.includes(type)) {
      expiryGroup.style.display = 'none';
      reviewGroup.style.display = 'none';
    } else if (REVIEW_DATE_TYPES.includes(type)) {
      // Policy: review date is primary, hide expiry
      expiryGroup.style.display = 'none';
      reviewGroup.style.display = '';
      reviewGroup.style.opacity = '1';
    } else {
      // Insurance/regulatory: expiry is primary, hide review
      expiryGroup.style.display = '';
      reviewGroup.style.display = 'none';
      expiryGroup.style.opacity = '1';
    }
  }

  document.getElementById('doc-type-select').addEventListener('change', function() {
    updateDateFields(this.value);
    // Clear both date fields on type change
    document.getElementById('doc-expiry-input').value = '';
    document.getElementById('doc-review-input').value = '';
  });

  // Init: show both dimmed on load
  updateDateFields('');

  function handleDragOver(e) { e.preventDefault(); document.getElementById('drop-zone').classList.add('drag-over'); }
  function handleDragLeave(e) { document.getElementById('drop-zone').classList.remove('drag-over'); }
  function handleDrop(e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.remove('drag-over');
    var file = e.dataTransfer.files[0];
    if (file) processSelectedFile(file);
  }
  function handleFileSelect(e) { if (e.target.files[0]) processSelectedFile(e.target.files[0]); }

  function processSelectedFile(file) {
    var allowed = ['application/pdf','image/jpeg','image/png','image/gif','image/webp'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|gif|webp)$/i)) {
      showToast('Only PDF and image files are accepted', 'error'); return;
    }
    if (file.size > 10 * 1024 * 1024) { showToast('File must be under 10MB', 'error'); return; }
    selectedFile = file;
    document.getElementById('sel-icon').textContent = file.type === 'application/pdf' ? '📄' : '🖼️';
    document.getElementById('sel-name').textContent = file.name;
    document.getElementById('sel-size').textContent = formatFileSize(file.size);
    document.getElementById('selected-file').classList.add('show');
    document.getElementById('drop-zone').style.display = 'none';
    // Auto-set label from filename
    var baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g,' ');
    if (!document.getElementById('doc-label-input').value) {
      document.getElementById('doc-label-input').value = baseName;
    }
  }

  function clearFile() {
    selectedFile = null;
    document.getElementById('selected-file').classList.remove('show');
    document.getElementById('drop-zone').style.display = '';
    document.getElementById('file-input').value = '';
  }

  function setProgress(pct, label) {
    document.getElementById('upload-progress').classList.add('show');
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-label').textContent = label;
  }

  async function uploadDocument() {
    if (!selectedFile) { showToast('Please select a file first', 'error'); return; }
    var docType = document.getElementById('doc-type-select').value;
    if (!docType) { showToast('Please select a document type', 'error'); return; }

    var btn = document.getElementById('upload-btn');
    btn.disabled = true; btn.textContent = 'Uploading...';

    try {
      var docLabel = document.getElementById('doc-label-input').value.trim() || DOC_LABELS[docType] || 'Document';
      var manualExpiry = document.getElementById('doc-expiry-input').value.trim();
      var manualReview = document.getElementById('doc-review-input').value.trim();
      var isReviewType = REVIEW_DATE_TYPES.includes(docType);

      // 1. Upload to Supabase Storage
      setProgress(20, 'Uploading file to vault...');
      var ext = selectedFile.name.split('.').pop().toLowerCase();
      var filePath = currentUser.id + '/' + docType + '/' + Date.now() + '_' + selectedFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');

      var { error: uploadErr } = await sb.storage.from('Vault').upload(filePath, selectedFile, {
        contentType: selectedFile.type, upsert: false
      });
      if (uploadErr) throw uploadErr;

      // 2. Automatic extraction of expiry date
      var extractedExpiry = manualExpiry || null;
      if (!manualExpiry && selectedFile.size < 4 * 1024 * 1024) {
        setProgress(55, 'Scanning document for expiry date...');
        try {
          var base64 = await fileToBase64(selectedFile);
          var res = await fetch('/.netlify/functions/process-vault-doc', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ base64: base64, fileType: selectedFile.type, docType: docType, isReviewType: isReviewType })
          });
          if (res.ok) {
            var result = await res.json();
            if (isReviewType && result.review_date) {
              extractedExpiry = result.review_date;
              document.getElementById('doc-review-input').value = extractedExpiry;
            } else if (!isReviewType && result.expiry_date) {
              extractedExpiry = result.expiry_date;
              document.getElementById('doc-expiry-input').value = extractedExpiry;
            }
          }
        } catch(e) { /* extraction failed, no problem, just skip */ }
      }

      // 3. Save metadata to vault_documents
      setProgress(85, 'Saving document record...');
      var { error: dbErr } = await sb.from('vault_documents').insert({
        user_id: currentUser.id,
        doc_type: docType,
        doc_label: docLabel,
        file_name: selectedFile.name,
        file_path: filePath,
        file_size: selectedFile.size,
        expiry_date: isReviewType ? null : (manualExpiry || extractedExpiry || null),
        review_date: isReviewType ? (manualReview || extractedExpiry || null) : null,
        uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      if (dbErr) throw dbErr;

      setProgress(100, 'Done!');
      btn.disabled = false;
      btn.textContent = 'Upload & scan';
      closeUploadModal();
      await new Promise(r => setTimeout(r, 800));
      await loadDocs();
      showToast(extractedExpiry ? isReviewType ? 'Document uploaded, review date: ' : 'Document uploaded, expiry: ' + extractedExpiry : 'Document uploaded successfully', 'success');

    } catch(err) {
      showToast('Upload failed: ' + (err.message||'Unknown error'), 'error');
      btn.disabled = false; btn.textContent = 'Upload & scan';
    }
  }

  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── VIEW ──
  async function viewDoc(id) {
    var doc = allDocs.find(function(d){ return d.id === id; });
    if (!doc) return;
    var { data } = await sb.storage.from('Vault').createSignedUrl(doc.file_path, 3600);
    if (!data) { showToast('Could not load document', 'error'); return; }
    var url = data.signedUrl;
    var isImage = doc.file_name && /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name);
    document.getElementById('viewer-title').textContent = doc.doc_label || DOC_LABELS[doc.doc_type] || doc.file_name;
    var status = getExpiryStatus(doc.expiry_date, doc.doc_type, doc.review_date);
    document.getElementById('viewer-meta').textContent = (doc.expiry_date ? 'Expires: ' + doc.expiry_date + ' · ' : '') + status.label;
    var dl = document.getElementById('viewer-download');
    dl.href = url; dl.download = doc.file_name || 'document';
    var body = document.getElementById('viewer-body');
    body.innerHTML = isImage
      ? '<img src="' + url + '" alt="' + (doc.doc_label||'Document') + '">'
      : '<iframe src="' + url + '"></iframe>';
    document.getElementById('viewer-overlay').classList.add('show');
  }

  function closeViewer() {
    document.getElementById('viewer-overlay').classList.remove('show');
    document.getElementById('viewer-body').innerHTML = '';
  }

  // ── DOWNLOAD ──
  async function downloadDoc(id) {
    var doc = allDocs.find(function(d){ return d.id === id; });
    if (!doc) return;
    var { data } = await sb.storage.from('Vault').createSignedUrl(doc.file_path, 300);
    if (!data) { showToast('Could not download document', 'error'); return; }
    var a = document.createElement('a');
    a.href = data.signedUrl; a.download = doc.file_name || 'document';
    a.click();
  }

  // ── DELETE ──
  async function deleteDoc(id) {
    var doc = allDocs.find(function(d){ return d.id === id; });
    if (!doc) return;
    if (!confirm('Delete "' + (doc.doc_label||doc.file_name) + '"? This cannot be undone.')) return;
    await sb.storage.from('Vault').remove([doc.file_path]);
    await sb.from('vault_documents').delete().eq('id', id);
    allDocs = allDocs.filter(function(d){ return d.id !== id; });
    renderDocs();
    showToast('Document deleted', '');
  }

  // ── EDIT ──
  function editDoc(id) {
    var doc = allDocs.find(function(d){ return d.id === id; });
    if (!doc) return;
    // Open upload modal in edit mode
    openUploadModal();
    document.getElementById('doc-type-select').value = doc.doc_type;
    // Trigger change event to show correct fields
    document.getElementById('doc-type-select').dispatchEvent(new Event('change'));
    document.getElementById('doc-label-input').value = doc.doc_label || '';
    if (doc.expiry_date) document.getElementById('doc-expiry-input').value = doc.expiry_date;
    if (doc.review_date) document.getElementById('doc-review-input').value = doc.review_date;
    // Switch button to update mode
    var btn = document.getElementById('upload-btn');
    btn.textContent = 'Update dates';
    btn.onclick = function() { saveEditedDates(id); };
  }

  async function saveEditedDates(id) {
    var btn = document.getElementById('upload-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      var docType = document.getElementById('doc-type-select').value;
      var isReview = REVIEW_DATE_TYPES.includes(docType);
      var expiry = document.getElementById('doc-expiry-input').value.trim() || null;
      var review = document.getElementById('doc-review-input').value.trim() || null;
      var label = document.getElementById('doc-label-input').value.trim();
      var { error } = await sb.from('vault_documents').update({
        doc_label: label || undefined,
        expiry_date: isReview ? null : expiry,
        review_date: isReview ? review : null,
        updated_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
      closeUploadModal();
      // Reset button
      document.getElementById('upload-btn').textContent = 'Upload & scan';
      document.getElementById('upload-btn').onclick = uploadDocument;
      await new Promise(r => setTimeout(r, 400));
      await loadDocs();
      showToast('Document updated successfully', 'success');
    } catch(err) {
      showToast('Update failed: ' + (err.message||'Error'), 'error');
      btn.disabled = false; btn.textContent = 'Update dates';
    }
  }

  async function handleSignOut() { await sb.auth.signOut(); window.location.href = '/'; }

  // ── INIT ──
  async function init() {
    var { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '/login.html?redirect=/vault.html'; return; }
    currentUser = session.user;
    var meta = session.user.user_metadata || {};
    var initials = ((meta.first_name||'?')[0]+(meta.last_name||'?')[0]).toUpperCase();
    document.getElementById('nav-avatar').textContent = initials;
    document.getElementById('nav-name').textContent = (meta.first_name||'')+' '+(meta.last_name||'');
    await loadDocs();
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('main-page').style.display = 'block';
  }

  // Close viewer on escape
  document.addEventListener('keydown', function(e){ if (e.key==='Escape') closeViewer(); });

  init();
