exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { sessionId, email } = JSON.parse(event.body);
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;
    const sbKey = process.env.SUPABASE_ANON_KEY;

    // Verify payment with Stripe
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions?limit=20', {
      headers: { 'Authorization': 'Bearer ' + stripeKey }
    });
    const stripeData = await stripeRes.json();

    var paid = false;
    var stripeEmail = email || '';
    if (stripeData.data) {
      for (var i = 0; i < stripeData.data.length; i++) {
        var s = stripeData.data[i];
        if (s.metadata && s.metadata.session_id === sessionId && s.payment_status === 'paid') {
          paid = true;
          if (s.customer_details && s.customer_details.email) {
            stripeEmail = s.customer_details.email;
          }
          break;
        }
      }
    }

    if (!paid) {
      return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Payment not confirmed. If you have paid, please email consulting@icongrp.co.uk with your payment reference.' }) };
    }

    // Get responses from Supabase
    const sbRes = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/cana_responses?id=eq.' + sessionId + '&select=*&limit=1', {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });
    const rows = await sbRes.json();

    if (!rows || !rows[0] || !rows[0].responses) {
      // Payment confirmed but no responses saved - notify ICONGRP to help manually
      await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'ping' }]
        })
      }).catch(function(){});

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          paid: true,
          responses: null,
          message: 'Payment confirmed! Your responses are being prepared. Please email consulting@icongrp.co.uk quoting session: ' + sessionId + ' and we will send your full bid within 1 hour.'
        })
      };
    }

    // Send email with responses if we have an email address
    if (stripeEmail && process.env.RESEND_API_KEY) {
      var emailBody = '<h2>Your Cana AI Tender Responses</h2><p>Thank you for your payment. Here are your full tender responses:</p>';
      rows[0].responses.forEach(function(r, i) {
        emailBody += '<h3>Question ' + (i+1) + ': ' + r.question.substring(0, 100) + '</h3><p>' + r.answer.replace(/\n/g, '<br>') + '</p><hr>';
      });

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Cana AI <cana@icongrp.co.uk>',
          to: stripeEmail,
          subject: 'Your Cana AI Tender Responses',
          html: emailBody
        })
      }).catch(function(e){ console.log('Email error:', e); });
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ paid: true, responses: rows[0].responses })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
