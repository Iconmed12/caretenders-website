exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { sessionId, tenderId, tenderTitle, wantsReview, tier } = JSON.parse(event.body);
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.Stripe_Key;

    // Normalise tier (back-compat: old callers send only wantsReview)
    let chosenTier = tier || (wantsReview ? 'review' : 'none');
    if (['none','review','review_docs'].indexOf(chosenTier) === -1) chosenTier = 'none';

    // Prices in pence: base bid 48000 (£480), Expert Review add-on 35000 (£350),
    // Review + document completion add-on 100000 (£1000).
    // PRE-LAUNCH SAFETY: with a LIVE key everything is forced to £1 so no real
    // money can move before launch. TEST keys charge the real prices so the full
    // journey can be tested with Stripe test cards.
    // GO-LIVE STEP: change GUARD to false so live keys charge the real amounts.
    const GUARD = /sk_live/.test(stripeKey || '');
    const px = function (real) { return GUARD ? '100' : String(real); };
    const addonName = chosenTier === 'review_docs'
      ? 'Expert Review + document completion (SQ + required tender documents, excluding pricing)'
      : 'Expert Review: consultant check within 48 hours';

    const params = new URLSearchParams({
      'mode': 'payment',
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][product_data][name]': 'Cana bid response: ' + (tenderTitle || 'Tender').substring(0, 60),
      'line_items[0][price_data][unit_amount]': px(48000),
      'line_items[0][quantity]': '1',
      'success_url': 'https://getcana.co.uk/cana.html?tender=' + tenderId + '&session=' + sessionId + '&paid=true',
      'cancel_url': 'https://getcana.co.uk/cana.html?tender=' + tenderId,
      'metadata[session_id]': sessionId,
      'metadata[tender_id]': tenderId,
      'metadata[tier]': chosenTier,
      'metadata[includes_review]': (chosenTier !== 'none') ? '1' : '0'
    });

    // Add-on line item for review or review+docs tiers (SAME payment)
    if (chosenTier !== 'none') {
      params.append('line_items[1][price_data][currency]', 'gbp');
      params.append('line_items[1][price_data][product_data][name]', addonName);
      params.append('line_items[1][price_data][unit_amount]', px(chosenTier === 'review_docs' ? 100000 : 35000));
      params.append('line_items[1][quantity]', '1');
    }

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
