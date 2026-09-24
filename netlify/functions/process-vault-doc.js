const { checkRate, tooMany } = require('./_rate-limit');

async function verifyUser(event) {
  try {
    var hdrs = (event && event.headers) || {};
    var auth = hdrs.authorization || hdrs.Authorization || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token) return null;
    var anon = process.env.SUPABASE_ANON_KEY;
    var res = await fetch('https://igpjfpncfuawikoyzfcd.supabase.co/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    var u = await res.json();
    return (u && u.id) ? { id: u.id } : null;
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  // Must be a signed-in user, and rate-limited: this endpoint calls the AI, so
  // leaving it open would let anyone run up AI costs by spamming uploads.
  var user = await verifyUser(event);
  if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };
  if (!(await checkRate(event, 'vault-extract', 15, 60))) return tooMany(cors);

  try {
    const { base64, fileType, docType, isReviewType } = JSON.parse(event.body);
    if (!base64 || !fileType) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing file data' }) };
    // Only PDFs and images are processed; reject anything else.
    if (fileType !== 'application/pdf' && !/^image\//.test(fileType)) {
      return { statusCode: 415, headers: cors, body: JSON.stringify({ error: 'Unsupported file type.' }) };
    }
    // Size guard: 10MB file is ~13.4MB of base64; cap a bit above that.
    if (typeof base64 !== 'string' || base64.length > 15 * 1024 * 1024) {
      return { statusCode: 413, headers: cors, body: JSON.stringify({ error: 'File is too large.' }) };
    }

    var contentBlock;
    if (fileType === 'application/pdf') {
      contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
    } else {
      var imgType = fileType.includes('png') ? 'image/png' : fileType.includes('gif') ? 'image/gif' : fileType.includes('webp') ? 'image/webp' : 'image/jpeg';
      contentBlock = { type: 'image', source: { type: 'base64', media_type: imgType, data: base64 } };
    }

    var prompt;

    if (isReviewType) {
      // For policies: find last reviewed date and add 1 year
      prompt = 'Look at this document carefully. Find any date related to when it was last reviewed, approved or written. ' +
        'Look for phrases like "Last reviewed", "Date reviewed", "Review date", "Approved", "Written", "Date", "Version date", "Last updated". ' +
        'Once you find that date, calculate exactly 1 year (365 days) later, that is the next review date. ' +
        'Return ONLY a valid JSON object with no other text:\n' +
        '{"review_date": "DD/MM/YYYY", "last_reviewed": "DD/MM/YYYY"}\n\n' +
        'If you cannot find any date at all, return:\n' +
        '{"review_date": null, "last_reviewed": null}\n\n' +
        'Only the JSON object. No explanation. No markdown.';
    } else {
      // For insurance/regulatory: find direct expiry date
      prompt = 'Look at this document carefully. Find the expiry date, renewal date, valid until date, or certificate end date. ' +
        'Look for phrases like "Expiry date", "Renewal date", "Valid until", "Valid to", "Expires", "Period of insurance", "To:", "End date". ' +
        'Return ONLY a valid JSON object with no other text:\n' +
        '{"expiry_date": "DD/MM/YYYY"}\n\n' +
        'If there is no expiry date, return:\n' +
        '{"expiry_date": null}\n\n' +
        'Only the JSON object. No explanation. No markdown.';
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }]
      })
    });

    if (!res.ok) return { statusCode: 200, headers: cors, body: JSON.stringify({ expiry_date: null, review_date: null }) };

    const data = await res.json();
    const text = data.content && data.content[0] ? data.content[0].text.trim() : '{}';
    var clean = text.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(clean);

    // Normalise date format to DD/MM/YYYY
    function normaliseDate(d) {
      if (!d) return null;
      // Already DD/MM/YYYY
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) return d;
      // YYYY-MM-DD
      var m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return m[3] + '/' + m[2] + '/' + m[1];
      // DD-MM-YYYY
      var m2 = d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (m2) return m2[1] + '/' + m2[2] + '/' + m2[3];
      return null;
    }

    if (isReviewType) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        review_date: normaliseDate(parsed.review_date),
        last_reviewed: normaliseDate(parsed.last_reviewed)
      })};
    } else {
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        expiry_date: normaliseDate(parsed.expiry_date)
      })};
    }

  } catch(err) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ expiry_date: null, review_date: null }) };
  }
};
