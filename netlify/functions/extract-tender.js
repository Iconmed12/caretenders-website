exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { text, filename } = JSON.parse(event.body);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are extracting information from a care industry tender document. Extract ONLY what is explicitly stated. Return ONLY valid JSON, no other text:

{
  "title": "exact tender title",
  "org": "exact buyer/commissioner name",
  "region": "location of delivery",
  "value": "contract value exactly as stated",
  "duration": "contract period exactly as stated",
  "deadline": "submission deadline as YYYY-MM-DD or empty string",
  "deadline_notes": "any time or additional deadline notes",
  "category": "one of: domiciliary, residential, nursing, supported, mental, discharge",
  "link": "submission URL if found or empty string",
  "description": "3-4 sentence summary of the work",
  "eligibility": ["requirement 1", "requirement 2"],
  "our_price": "price stated for writing the bid e.g. £1950+VAT or empty string"
}

DOCUMENT:
${text.substring(0, 8000)}`
        }]
      })
    });

    if (!response.ok) {
      throw new Error('Anthropic API error: ' + response.status);
    }

    const data = await response.json();
    const raw = data.content[0].text.trim().replace(/```json|```/g, '');
    const extracted = JSON.parse(raw);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(extracted)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
