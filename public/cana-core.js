
  let tenderId = null;
  let tenderData = null;
  let generatedResponses = [];
  let currentSessionId = null;
  const SUPABASE_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlncGpmcG5jZnVhd2lrb3l6ZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzYyMTEsImV4cCI6MjA2NDU1MjIxMX0.tDHJZPl4HZNM5PJuJ6-c7_xoKpgxFPuH5YlSdBEDqHw';

  // Get URL params
  const params = new URLSearchParams(window.location.search);
  tenderId = params.get('tender');
  const sessionId = params.get('session');
  const paid = params.get('paid');

  if (!tenderId) {
    document.getElementById('tender-title').textContent = 'No tender selected';
  } else if (paid === 'true' && sessionId) {
    // Coming back from Stripe - verify payment then show responses
    loadTender().then(() => verifyAndUnlock(sessionId));
  } else {
    loadTender();
  }

  async function verifyAndUnlock(sid) {
    setStep(5);
    showState('loading');
    document.querySelector('.loading-state h3').textContent = 'Verifying your payment...';
    document.querySelector('.loading-state p').textContent  = 'Please wait while we confirm your payment.';

    try {
      var co = window._companyDetails || {};
      var res = await fetch('/.netlify/functions/cana-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          tenderId: tenderId,
          includeSq: !!(window._tenderData && window._tenderData.sq_data && window._tenderData.sq_data.storagePath),
          companyDetails: co
        })
      });
      var data = await res.json();

      if (!res.ok || !data.paid) {
        showState('form'); setStep(1);
        alert('Payment could not be verified: ' + (data.error || 'Please contact consulting@icongrp.co.uk'));
        return;
      }

      // Payment confirmed — show processing screen
      showProcessingScreen(data.jobId, data.email);
      pollJobStatus(data.jobId);