exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { base64, fileType, docType } = JSON.parse(event.body);
    if (!base64 || !fileType) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing file data' }) };

    // Build message with document
    var mediaType = fileType;
    var contentBlock;

    if (fileType === 'application/pdf') {
      contentBlock = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 }
      };
    } else {
      // Image
      var imgType = fileType.includes('png') ? 'image/png'
        : fileType.includes('gif') ? 'image/gif'
        : fileType.includes('webp') ? 'image/webp'
        : 'image/jpeg';
      contentBlock = {
        type: 'image',
        source: { type: 'base64', media_type: imgType, data: base64 }
      };
    }

    var prompt = 'Look at this document carefully. Find any expiry date, renewal date, valid until date, or certificate end date.\n\n' +
      'Return ONLY a valid JSON object in exactly this format with no other text:\n' +
      '{"expiry_date": "DD/MM/YYYY"}\n\n' +
      'If there is no expiry date in the document, return:\n' +
      '{"expiry_date": null}\n\n' +
      'Do not include any explanation, preamble or markdown. Only the JSON object.';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [contentBlock, { type: 'text', text: prompt }]
        }]
      })
    });

    if (!res.ok) return { statusCode: 200, headers: cors, body: JSON.stringify({ expiry_date: null }) };

    const data = await res.json();
    const text = data.content && data.content[0] ? data.content[0].text.trim() : '{}';

    // Safely parse JSON response
    var clean = text.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(clean);

    // Validate date format DD/MM/YYYY
    if (parsed.expiry_date) {
      var match = parsed.expiry_date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) {
        // Try to reformat if AI returned different format (YYYY-MM-DD)
        var altMatch = parsed.expiry_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (altMatch) {
          parsed.expiry_date = altMatch[3] + '/' + altMatch[2] + '/' + altMatch[1];
        } else {
          parsed.expiry_date = null;
        }
      }
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ expiry_date: parsed.expiry_date || null }) };

  } catch(err) {
    // Never fail hard — just return null expiry so upload continues
    return { statusCode: 200, headers: cors, body: JSON.stringify({ expiry_date: null }) };
  }
};
