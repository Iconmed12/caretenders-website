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

    const questions = tender.cana_questions || [];
    if (!questions.length) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'This tender is not yet ready for Cana AI — our team is still setting it up. Please contact us at consulting@icongrp.co.uk.' })
      };
    }

    // Get context documents
    const canaDocs = tender.cana_docs || {};
    const specDocs = Array.isArray(canaDocs.spec) ? canaDocs.spec : (canaDocs.spec ? [canaDocs.spec] : []);
    const scoringDocs = Array.isArray(canaDocs.scoring) ? canaDocs.scoring : (canaDocs.scoring ? [canaDocs.scoring] : []);
    const specText = specDocs.map(d => d.text || '').join(' ').substring(0, 2000);
    const scoringText = scoringDocs.map(d => d.text || '').join(' ').substring(0, 1000);
    const knowledge = tender.cana_knowledge || '';

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are Cana AI, an expert UK public sector tender writer for ICONGRP Consulting. You write high-quality, compliant, and compelling tender responses.

${knowledge ? 'WRITING GUIDANCE:\n' + knowledge + '\n\n' : ''}RULES:
- Write in first person on behalf of the bidding organisation
- Be specific — use the company details provided throughout every answer
- Use professional UK English
- Structure each answer with a strong opening, clear evidence, and confident conclusion
- Every sentence must add value — no generic filler
- Aim for 400-500 words per question`;

    const userPrompt = `Write tender responses for: ${tender.title}
Buyer: ${tender.org || ''}

BIDDING ORGANISATION:
- Name: ${companyDetails.name}
- Founded: ${companyDetails.founded}
- Staff: ${companyDetails.staff}
- CQC Status: ${companyDetails.cqc}
- Services: ${companyDetails.services}
- Regions: ${companyDetails.regions}
${companyDetails.experience ? '- Experience: ' + companyDetails.experience : ''}

${specText ? 'SERVICE SPECIFICATION CONTEXT:\n' + specText + '\n\n' : ''}${scoringText ? 'SCORING CRITERIA:\n' + scoringText + '\n\n' : ''}QUESTIONS TO ANSWER:
${questions.map((q, i) => `Question ${i+1}: ${q.question}${q.scoring ? ' [Scoring: ' + q.scoring + ']' : ''}${q.wordLimit ? ' [Word limit: ' + q.wordLimit + ']' : ''}`).join('\n')}

Write a complete response to EVERY question. Format exactly as:

QUESTION 1: ${questions[0] ? questions[0].question.substring(0, 60) : 'Question 1'}
[your full response here]

QUESTION 2: ${questions[1] ? questions[1].question.substring(0, 60) : 'Question 2'}
[your full response here]

Continue for all ${questions.length} questions.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const fullResponse = message.content[0].text;

    // Parse into question/answer pairs
    const responses = [];
    const blocks = fullResponse.split(/QUESTION \d+:/i).filter(b => b.trim());
    questions.forEach((q, i) => {
      const block = blocks[i] ? blocks[i].trim() : '';
      const lines = block.split('\n');
      const answer = lines.slice(1).join('\n').trim() || block;
      responses.push({ question: q.question, answer: answer || 'Response pending.' });
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
