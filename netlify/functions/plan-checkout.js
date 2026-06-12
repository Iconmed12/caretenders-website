// Cana Membership checkout + per-tender Expert Review checkout.
// TEST MODE: everything charges 1 GBP until Joel approves go-live.
// Go-live amounts (pence): membership 29900 monthly, expert review 30000 one-off.

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { product, email, tenderId, tenderTitle } = JSON.parse(event.body);
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;
    const params = new URLSearchParams();

    if (product === 'membership') {
      params.append('mode', 'subscription');
      params.append('line_items[0][price_data][currency]', 'gbp');
      params.append('line_items[0][price_data][product_data][name]', 'Cana Membership (TEST 1 GBP) unlimited tenders, 299 GBP per month billed quarterly');
      params.append('line_items[0][price_data][unit_amount]', '100'); // TEST. Go-live: 89700 (299 x 3, charged quarterly)
      params.append('line_items[0][price_data][recurring][interval]', 'month');
      params.append('line_items[0][price_data][recurring][interval_count]', '3');
      params.append('line_items[0][quantity]', '1');
      params.append('success_url', 'https://caretenders-website.netlify.app/plans.html?subscribed=membership');
      params.append('cancel_url', 'https://caretenders-website.netlify.app/plans.html');
      params.append('metadata[product]', 'membership');
    } else if (product === 'review') {
      params.append('mode', 'payment');
      params.append('line_items[0][price_data][currency]', 'gbp');
      params.append('line_items[0][price_data][product_data][name]', 'Expert Review (TEST 1 GBP): ' + (tenderTitle || 'Tender').substring(0, 60));
      params.append('line_items[0][price_data][unit_amount]', '100'); // TEST. Go-live: 30000
      params.append('line_items[0][quantity]', '1');
      params.append('success_url', 'https://caretenders-website.netlify.app/cana.html?tender=' + (tenderId || '') + '&review=paid');
      params.append('cancel_url', 'https://caretenders-website.netlify.app/cana.html?tender=' + (tenderId || ''));
      params.append('metadata[product]', 'review');
      if (tenderId) params.append('metadata[tender_id]', tenderId);
    } else {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown product' }) };
    }

    if (email) params.append('customer_email', email);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + stripeKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: data.error ? data.error.message : 'Stripe error' }) };
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ url: data.url }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
