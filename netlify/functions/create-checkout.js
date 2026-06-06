const Stripe = require('stripe');

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
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { tenderTitle, subtotal } = JSON.parse(event.body);

    if (!subtotal || isNaN(subtotal)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid amount' })
      };
    }

    // Amount in pence, inc. VAT (multiply by 1.2)
    const amountPence = Math.round(Number(subtotal) * 1.2 * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: 'Bid Support — ' + (tenderTitle || 'Tender'),
            description: 'Full managed service: SQ completion, tender writing, quality review and submission on your behalf. Price includes VAT.',
          },
          unit_amount: amountPence,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://caretenders-website.netlify.app/?payment=success',
      cancel_url:  'https://caretenders-website.netlify.app/?payment=cancelled',
      metadata: {
        tender_title: tenderTitle || '',
      },
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Stripe error' })
    };
  }
};
