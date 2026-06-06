exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { sessionId, tenderId, tenderTitle } = JSON.parse(event.body);
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    const params = new URLSearchParams({
      'mode': 'payment',
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][product_data][name]': 'Cana AI — Full Bid: ' + (tenderTitle || 'Tender').substring(0, 60),
      'line_items[0][price_data][unit_amount]': '48000',
      'line_items[0][quantity]': '1',
      'success_url': 'https://caretenders-website.netlify.app/cana.html?tender=' + tenderId + '&session=' + sessionId + '&paid=true',
      'cancel_url': 'https://caretenders-website.netlify.app/cana.html?tender=' + tenderId,
      'metadata[session_id]': sessionId,
      'metadata[tender_id]': tenderId
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + stripeKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: data.error ? data.error.message : 'Stripe error' }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ url: data.url }) };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
