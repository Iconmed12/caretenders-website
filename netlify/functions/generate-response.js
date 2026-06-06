const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

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
    const { tenderId, companyDetails } = JSON.parse(event.body);

    // Get tender from Supabase
    const supabase = createClient(
      'https://igpjfpncfuawikoyzfcd.supabase.co',
      process.env.SUPABASE_ANON_KEY
    );

    const { data: tender, error } = await supabase
      .from('tenders')
      .select('*')
      .eq('id', tenderId)
      .single();

    if (error || !tender) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Tender not found' })
      };
    }

    const questions = tender.cana_questions || [];
    const knowledge = tender.cana_knowledge || process.env.CANA_DEFAULT_KNOWLEDGE || '';

    if (!questions.length) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No questions uploaded for this tender yet' })
      };
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are Cana AI, an expert tender writer for UK public sector contracts. You write high-quality, compliant, and compelling tender responses on behalf of organisations.

${knowledge ? `TENDER WRITING KNOWLEDGE AND GUIDANCE:\n${knowledge}\n\n` : ''}

IMPORTANT RULES:
- Write in first person on behalf of the organisation
- Be specific, use concrete examples where possible
- Match the scoring criteria if provided
- Use professional UK English
- Structure answers clearly with the organisation's strengths front and centre
- Never use generic filler — every sentence should add value
- Aim for 300-500 words per question unless the question suggests otherwise`;

    const userPrompt = `You are writing a tender response for the following opportunity:

TENDER: ${tender.title}
ORGANISATION: ${tender.organisation || tender.org || ''}
CONTRACT VALUE: ${tender.value || ''}

COMPANY DETAILS (the organisation bidding):
- Organisation name: ${companyDetails.name}
- Founded: ${companyDetails.founded}
- Number of staff: ${companyDetails.staff}
- Services provided: ${companyDetails.services}
- Regions operating in: ${companyDetails.regions}
- CQC status: ${companyDetails.cqc}
- Previous contract experience: ${companyDetails.experience || 'Not provided'}

TENDER QUESTIONS TO ANSWER:
${questions.map((q, i) => `Question ${i + 1}: ${q.question}${q.scoring ? `\nScoring criteria: ${q.scoring}` : ''}${q.wordLimit ? `\nWord limit: ${q.wordLimit}` : ''}`).join('\n\n')}

Please write a complete, high-quality response to EACH question. Format your response as:

QUESTION 1: [question title]
[your response]

QUESTION 2: [question title]
[your response]

And so on for all questions.`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt
    });

    const fullResponse = message.content[0].text;

    // Split into individual question responses
    const responses = [];
    const qBlocks = fullResponse.split(/QUESTION \d+:/i).filter(b => b.trim());
    questions.forEach((q, i) => {
      responses.push({
        question: q.question,
        answer: qBlocks[i] ? qBlocks[i].trim() : ''
      });
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ responses, tenderId, tenderTitle: tender.title })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Generation failed' })
    };
  }
};
