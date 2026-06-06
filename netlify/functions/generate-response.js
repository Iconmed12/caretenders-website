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
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Tender not found' }) };
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Get documents
    const canaDocs = tender.cana_docs || {};
    const qualityDocs = Array.isArray(canaDocs.quality) ? canaDocs.quality : (canaDocs.quality ? [canaDocs.quality] : []);
    const specDocs = Array.isArray(canaDocs.spec) ? canaDocs.spec : (canaDocs.spec ? [canaDocs.spec] : []);
    const scoringDocs = Array.isArray(canaDocs.scoring) ? canaDocs.scoring : (canaDocs.scoring ? [canaDocs.scoring] : []);

    const qualityText = qualityDocs.map(d => d.text || '').join('\n\n');
    const specText = specDocs.map(d => d.text || '').join('\n\n');
    const scoringText = scoringDocs.map(d => d.text || '').join('\n\n');

    const manualQuestions = tender.cana_questions || [];
    const knowledge = tender.cana_knowledge || '';

    // If no documents and no manual questions, error
    if (!qualityText && !manualQuestions.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'No questions uploaded for this tender yet' }) };
    }

    const systemPrompt = `You are Cana AI, an expert UK public sector tender writer. You write high-quality, compliant, and compelling tender responses on behalf of organisations bidding for contracts.

${knowledge ? 'WRITING GUIDANCE:\n' + knowledge + '\n\n' : ''}

RULES:
- Write in first person on behalf of the bidding organisation
- Be specific and use concrete examples based on the company details provided
- Structure answers clearly with strong opening statements
- Use professional UK English
- Match scoring criteria where provided
- Never use generic filler — every sentence must add value
- Aim for 400-600 words per question unless a word limit is specified`;

    let userPrompt;

    if (manualQuestions.length) {
      // Use manual questions
      userPrompt = `Write tender responses for: ${tender.title}

BIDDING ORGANISATION:
- Name: ${companyDetails.name}
- Founded: ${companyDetails.founded}
- Staff: ${companyDetails.staff}
- CQC Status: ${companyDetails.cqc}
- Services: ${companyDetails.services}
- Regions: ${companyDetails.regions}
${companyDetails.experience ? '- Experience: ' + companyDetails.experience : ''}

${specText ? 'SERVICE SPECIFICATION:\n' + specText.substring(0, 3000) + '\n\n' : ''}
${scoringText ? 'SCORING CRITERIA:\n' + scoringText.substring(0, 2000) + '\n\n' : ''}

QUESTIONS TO ANSWER:
${manualQuestions.map((q, i) => `Question ${i+1}: ${q.question}${q.scoring ? '\nScoring: ' + q.scoring : ''}${q.wordLimit ? '\nWord limit: ' + q.wordLimit : ''}`).join('\n\n')}

Write a complete response to each question. Format as:
QUESTION 1: [title]
[response]

QUESTION 2: [title]
[response]`;
    } else {
      // Use uploaded quality questions document
      userPrompt = `You are writing tender responses for: ${tender.title}

BIDDING ORGANISATION:
- Name: ${companyDetails.name}
- Founded: ${companyDetails.founded}
- Staff: ${companyDetails.staff}
- CQC Status: ${companyDetails.cqc}
- Services: ${companyDetails.services}
- Regions: ${companyDetails.regions}
${companyDetails.experience ? '- Experience: ' + companyDetails.experience : ''}

${specText ? 'SERVICE SPECIFICATION:\n' + specText.substring(0, 2000) + '\n\n' : ''}
${scoringText ? 'SCORING CRITERIA:\n' + scoringText.substring(0, 1500) + '\n\n' : ''}

QUALITY QUESTIONS DOCUMENT (extract each question and answer it):
${qualityText.substring(0, 4000)}

First identify all the questions from the quality questions document, then write a complete, high-quality response to each one.

Format your response as:
QUESTION 1: [question title or summary]
[your full response]

QUESTION 2: [question title or summary]
[your full response]

And so on for every question found in the document.`;
    }

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const fullResponse = message.content[0].text;

    // Parse into question/answer pairs
    const responses = [];
    const blocks = fullResponse.split(/QUESTION \d+:/i).filter(b => b.trim());
    blocks.forEach((block, i) => {
      const lines = block.trim().split('\n');
      const question = lines[0].trim();
      const answer = lines.slice(1).join('\n').trim();
      responses.push({ question: question || `Question ${i+1}`, answer });
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
