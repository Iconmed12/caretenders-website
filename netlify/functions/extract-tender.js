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

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'ANTHROPIC_API_KEY environment variable is not set' })
      };
    }

    const body = JSON.parse(event.body);
    const { text, filename, base64, mimetype } = body;

    let messageContent;

    if (base64 && mimetype === 'application/pdf') {
      messageContent = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64
          }
        },
        {
          type: 'text',
          text: `Extract information from this care industry tender document. Return ONLY valid JSON with no other text:

{
  "title": "exact tender title",
  "org": "exact buyer/commissioner organisation name",
  "region": "location of delivery",
  "value": "contract value exactly as stated e.g. £3,100,000",
  "duration": "contract period exactly as stated",
  "deadline": "submission deadline as YYYY-MM-DD or empty string if not found",
  "deadline_notes": "any additional deadline notes e.g. 12pm",
  "category": "best match from: domiciliary, residential, nursing, supported, mental, discharge",
  "link": "submission URL if found or empty string",
  "description": "3-4 sentence summary of the description of work",
  "eligibility": ["requirement 1", "requirement 2", "requirement 3"],
  "our_price": "price stated for writing the bid e.g. £1950+VAT or empty string"
}`
        }
      ];
    } else {
      const content = text || 'No content provided';
      messageContent = [
        {
          type: 'text',
          text: `Extract information from this care industry tender document. Return ONLY valid JSON with no other text:

{
  "title": "exact tender title",
  "org": "exact buyer/commissioner organisation name",
  "region": "location of delivery",
  "value": "contract value exactly as stated e.g. £3,100,000",
  "duration": "contract period exactly as stated",
  "deadline": "submission deadline as YYYY-MM-DD or empty string if not found",
  "deadline_notes": "any additional deadline notes e.g. 12pm",
  "category": "best match from: domiciliary, residential, nursing, supported, mental, discharge",
  "link": "submission URL if found or empty string",
  "description": "3-4 sentence summary of the description of work",
  "eligibility": ["requirement 1", "requirement 2", "requirement 3"],
  "our_price": "price stated for writing the bid e.g. £1950+VAT or empty string"
}

DOCUMENT CONTENT:
${content.substring(0, 8000)}`
        }
      ];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Anthropic API error ${response.status}: ${errText}` })
      };
    }

    const data = await response.json();
    const raw = data.content[0].text.trim().replace(/```json|```/g, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(raw);
    } catch (parseErr) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Could not parse AI response: ' + raw.substring(0, 200) })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(extracted)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Unknown server error' })
    };
  }
};
