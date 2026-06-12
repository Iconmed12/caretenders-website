// Plan subscription checkout. TEST MODE: every plan charges £1 until Joel
// approves go-live. Real amounts are in the PLANS map comments below.
// Billing: every 3 months (the 3-month minimum, no contracts needed).

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  // TEST £1 everywhere. Go-live amounts (pence, per quarterly charge):
  // core 74700 (£249/mo), growth 134700 (£449/mo), pro 269700 (£899/mo),
  // profile setup one-off 19900 (£199).
  const PLANS = {
    core:   { name: 'Cana Core Plan',   amount: 100, monthly: '£249' },
    growth: { name: 'Cana Growth Plan', amount: 100, monthly: '£449' },
    pro:    { name: 'Cana Pro Plan',    amount: 100, monthly: '£899' }
  };
  const SETUP_AMOUNT = 100; // TEST £1. Go-live: 19900

  try {
    const { plan, withSetup, email } = JSON.parse(event.body);
    const p = PLANS[plan];
    if (!p) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown plan' }) };

    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;

    const params = new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][product_data][name]': p.name + ' (TEST £1) ' + p.monthly + ' per month, billed quarterly',
      'line_items[0][price_data][unit_amount]': String(p.amount),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][recurring][interval_count]': '3',
      'line_items[0][quantity]': '1',
      'success_url': 'https://caretenders-website.netlify.app/plans.html?subscribed=' + plan,
      'cancel_url': 'https://caretenders-website.netlify.app/plans.html',
      'metadata[plan]': plan
    });

    // Core can add Profile Setup as a one-off in the same checkout
    // (free and pre-included on Growth and Pro, so never added there).
    if (plan === 'core' && withSetup) {
      params.append('line_items[1][price_data][currency]', 'gbp');
      params.append('line_items[1][price_data][product_data][name]', 'Profile Setup (one-off, TEST £1)');
      params.append('line_items[1][price_data][unit_amount]', String(SETUP_AMOUNT));
      params.append('line_items[1][quantity]', '1');
    }

    if (email) params.append('customer_email', email);

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

  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
