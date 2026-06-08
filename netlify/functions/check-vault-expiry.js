// Netlify scheduled function — runs daily at 9am UTC (schedule set in netlify.toml)
// Checks for documents expiring within 14 days and sends email reminders via Resend

exports.handler = async () => {
  try {
    const sbKey = process.env.SUPABASE_ANON_KEY;
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@icongrp.co.uk';
    const siteUrl = process.env.SITE_URL || 'https://caretenders.netlify.app';

    // Get all documents with expiry dates
    const docsRes = await fetch(
      sbUrl + '/rest/v1/vault_documents?select=*&expiry_date=not.is.null',
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
    );
    const docs = await docsRes.json();
    if (!docs || !docs.length) return { statusCode: 200, body: 'No documents to check' };

    const today = new Date(); today.setHours(0,0,0,0);

    // Group documents expiring within 14 days by user
    var userExpiringDocs = {};
    docs.forEach(function(doc) {
      if (!doc.expiry_date) return;
      var parts = doc.expiry_date.split('/');
      if (parts.length !== 3) return;
      var expiry = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
      var daysLeft = Math.ceil((expiry - today) / (1000*60*60*24));
      if (daysLeft >= 0 && daysLeft <= 14) {
        if (!userExpiringDocs[doc.user_id]) userExpiringDocs[doc.user_id] = [];
        userExpiringDocs[doc.user_id].push({ ...doc, daysLeft });
      }
    });

    if (!Object.keys(userExpiringDocs).length) return { statusCode: 200, body: 'No expiring documents' };

    var emailsSent = 0;

    for (var userId of Object.keys(userExpiringDocs)) {
      var expiringDocs = userExpiringDocs[userId];

      // Get user email from company_profiles
      var profileRes = await fetch(
        sbUrl + '/rest/v1/company_profiles?user_id=eq.' + userId + '&select=contact_email,contact_first_name,company_name&limit=1',
        { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
      );
      var profiles = await profileRes.json();
      var profile = profiles && profiles[0];
      if (!profile || !profile.contact_email) continue;

      var docRows = expiringDocs.map(function(d) {
        var urgency = d.daysLeft === 0 ? 'Expires TODAY'
          : d.daysLeft <= 3 ? 'Expires in ' + d.daysLeft + ' day' + (d.daysLeft===1?'':'s') + ' ⚠️'
          : 'Expires in ' + d.daysLeft + ' days';
        var color = d.daysLeft <= 3 ? '#c53030' : '#92400e';
        return '<tr>' +
          '<td style="padding:10px 12px;border-bottom:1px solid #f0f2f5;font-size:14px;color:#0B1929;">' + (d.doc_label || d.doc_type.replace(/_/g,' ')) + '</td>' +
          '<td style="padding:10px 12px;border-bottom:1px solid #f0f2f5;font-size:14px;color:#6B8FA3;">' + d.expiry_date + '</td>' +
          '<td style="padding:10px 12px;border-bottom:1px solid #f0f2f5;font-size:13px;font-weight:600;color:' + color + ';">' + urgency + '</td>' +
        '</tr>';
      }).join('');

      var firstName = profile.contact_first_name || 'there';
      var companyName = profile.company_name || 'your company';

      var emailHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F4F6F9;font-family:Arial,sans-serif;">' +
        '<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(11,25,41,0.08);">' +
        '<div style="background:#0B1929;padding:28px 32px;">' +
          '<div style="font-size:18px;font-weight:700;color:#ffffff;">Tender <span style="color:#00C9E0;">Experts</span></div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;">by ICONGRP</div>' +
        '</div>' +
        '<div style="padding:32px;">' +
          '<div style="background:rgba(217,119,6,0.08);border:1px solid rgba(217,119,6,0.25);border-radius:10px;padding:14px 18px;margin-bottom:24px;">' +
            '<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:4px;">⚠️ Documents expiring soon</div>' +
            '<div style="font-size:13px;color:#92400e;opacity:0.8;">Action required before your next tender submission</div>' +
          '</div>' +
          '<p style="font-size:15px;color:#0B1929;margin:0 0 8px;">Hi ' + firstName + ',</p>' +
          '<p style="font-size:14px;color:#6B8FA3;line-height:1.7;margin:0 0 24px;">The following documents in your <strong style="color:#0B1929;">' + companyName + '</strong> Evidence Vault are expiring soon. Please log in and upload updated versions before submitting your next tender.</p>' +
          '<table style="width:100%;border-collapse:collapse;background:#f8f9fb;border-radius:10px;overflow:hidden;margin-bottom:24px;">' +
            '<thead><tr style="background:#0B1929;">' +
              '<th style="padding:10px 12px;text-align:left;font-size:12px;color:rgba(255,255,255,0.6);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Document</th>' +
              '<th style="padding:10px 12px;text-align:left;font-size:12px;color:rgba(255,255,255,0.6);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Expiry date</th>' +
              '<th style="padding:10px 12px;text-align:left;font-size:12px;color:rgba(255,255,255,0.6);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Status</th>' +
            '</tr></thead>' +
            '<tbody>' + docRows + '</tbody>' +
          '</table>' +
          '<a href="' + siteUrl + '/vault.html" style="display:block;background:#0B1929;color:#ffffff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:700;margin-bottom:24px;">Go to Evidence Vault →</a>' +
          '<p style="font-size:13px;color:#6B8FA3;line-height:1.6;margin:0;">Submitting a tender with expired documents is one of the most common reasons for automatic disqualification. Keep your vault up to date and you\'ll never miss this.</p>' +
        '</div>' +
        '<div style="background:#f8f9fb;padding:20px 32px;border-top:1px solid #eef0f4;">' +
          '<p style="font-size:12px;color:#6B8FA3;margin:0;">You\'re receiving this because you have an Evidence Vault with Tender Experts. <a href="' + siteUrl + '/dashboard.html" style="color:#00C9E0;text-decoration:none;">Manage account</a></p>' +
        '</div>' +
        '</div></body></html>';

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
        body: JSON.stringify({
          from: fromEmail,
          to: [profile.contact_email],
          subject: '⚠️ ' + expiringDocs.length + ' document' + (expiringDocs.length>1?'s':'') + ' in your Evidence Vault ' + (expiringDocs.length>1?'are':'is') + ' expiring soon',
          html: emailHtml
        })
      });

      emailsSent++;
    }

    return { statusCode: 200, body: 'Sent ' + emailsSent + ' reminder email(s)' };

  } catch(err) {
    console.error('check-vault-expiry error:', err.message);
    return { statusCode: 500, body: 'Error: ' + err.message };
  }
};
