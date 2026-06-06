exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { sessionId } = JSON.parse(event.body);
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;
    const sbKey = process.env.SUPABASE_ANON_KEY;

    // Search Stripe for a paid checkout session with this session_id in metadata
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions?limit=10', {
      headers: { 'Authorization': 'Bearer ' + stripeKey }
    });
    const data = await res.json();

    var paid = false;
    if (data.data) {
      for (var i = 0; i < data.data.length; i++) {
        var s = data.data[i];
        if (s.metadata && s.metadata.session_id === sessionId && s.payment_status === 'paid') {
          paid = true;
          break;
        }
      }
    }

    if (!paid) {
      return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Payment not found or not completed.' }) };
    }

    // Fetch responses from Supabase
    const sbRes = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/rest/v1/cana_responses?id=eq.' + sessionId + '&select=*&limit=1', {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });
    const rows = await sbRes.json();

    if (!rows || !rows[0]) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Responses not found.' }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ responses: rows[0].responses }) };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
