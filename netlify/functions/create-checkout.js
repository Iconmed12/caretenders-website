// Uses native fetch — no npm packages needed
exports.handler = async (event) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY environment variable' })
      };
    }

    const { tenderTitle, subtotal } = JSON.parse(event.body);

    if (!subtotal || isNaN(subtotal) || Number(subtotal) <= 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid amount' })
      };
    }

    // Amount in pence inc. VAT
    const amountPence = Math.round(Number(subtotal) * 1.2 * 100);
    const title = tenderTitle || 'Tender';

    // Build form-encoded body for Stripe API
    const params = new URLSearchParams();
    params.append('payment_method_types[]', 'card');
    params.append('line_items[0][price_data][currency]', 'gbp');
    params.append('line_items[0][price_data][product_data][name]', 'Bid Support: ' + title);
    params.append('line_items[0][price_data][product_data][description]', 'Full managed service: SQ completion, tender writing, quality review and submission. Price includes VAT.');
    params.append('line_items[0][price_data][unit_amount]', String(amountPence));
    params.append('line_items[0][quantity]', '1');
    params.append('mode', 'payment');
    params.append('success_url', 'https://caretenders-website.netlify.app/?payment=success');
    params.append('cancel_url', 'https://caretenders-website.netlify.app/?payment=cancelled');
    params.append('metadata[tender_title]', title);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + stripeKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await response.json();

    if (!response.ok || !session.url) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: session.error?.message || 'Stripe error' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Unknown error' })
    };
  }
};
