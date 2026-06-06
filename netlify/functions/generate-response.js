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
        body: JSON.stringify({ error: 'This tender is not yet ready — our team is still adding the questions. Please contact consulting@icongrp.co.uk.' })
      };
    }

    const canaDocs = tender.cana_docs || {};
    const specDocs = Array.isArray(canaDocs.spec) ? canaDocs.spec : (canaDocs.spec ? [canaDocs.spec] : []);
    const scoringDocs = Array.isArray(canaDocs.scoring) ? canaDocs.scoring : (canaDocs.scoring ? [canaDocs.scoring] : []);
    const specText = specDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 1500);
    const scoringText = scoringDocs.map(function(d){ return d.text || ''; }).join(' ').substring(0, 800);
    const knowledge = tender.cana_knowledge || '';

    const systemPrompt = 'You are Cana AI, an expert UK public sector tender writer for ICONGRP Consulting. You write high-quality, compliant, and compelling tender responses on behalf of organisations bidding for contracts.' +
      (knowledge ? '

WRITING GUIDANCE:
' + knowledge : '') +
      '

RULES:
- Write in first person on behalf of the bidding organisation
- Be specific — use the company details provided throughout every answer
- Use professional UK English
- Structure each answer with a strong opening, clear evidence, and confident conclusion
- Every sentence must add value — no generic filler
- Respect word limits specified for each question';

    const questionsText = questions.map(function(q, i) {
      return 'Question ' + (i+1) + ': ' + q.question +
        (q.scoring ? ' [Scoring weight: ' + q.scoring + ']' : '') +
        (q.wordLimit ? ' [Word limit: ' + q.wordLimit + ' words]' : '');
    }).join('

');

    const userPrompt = 'Write tender responses for: ' + tender.title + '
Buyer: ' + (tender.org || '') +
      '

BIDDING ORGANISATION:
' +
      '- Name: ' + companyDetails.name + '
' +
      '- Founded: ' + companyDetails.founded + '
' +
      '- Staff: ' + companyDetails.staff + '
' +
      '- CQC Status: ' + companyDetails.cqc + '
' +
      '- Services: ' + companyDetails.services + '
' +
      '- Regions: ' + companyDetails.regions + '
' +
      (companyDetails.experience ? '- Experience: ' + companyDetails.experience + '
' : '') +
      (specText ? '
SERVICE SPECIFICATION CONTEXT:
' + specText + '
' : '') +
      (scoringText ? '
SCORING CRITERIA:
' + scoringText + '
' : '') +
      '
QUESTIONS TO ANSWER:
' + questionsText +
      '

Write a complete response to EVERY question. Format exactly as:

QUESTION 1: [first few words of question]
[your full response]

QUESTION 2: [first few words of question]
[your full response]

And so on for all ' + questions.length + ' questions.';

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'AI API error: ' + errText.substring(0, 200) }) };
    }

    const aiData = await apiResponse.json();
    const fullResponse = aiData.content[0].text;

    const responses = [];
    const blocks = fullResponse.split(/QUESTION \d+:/i).filter(function(b){ return b.trim(); });
    questions.forEach(function(q, i) {
      const block = blocks[i] ? blocks[i].trim() : '';
      const lines = block.split('
');
      const answer = lines.slice(1).join('
').trim() || block;
      responses.push({ question: q.question, answer: answer || 'Response pending.' });
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ responses: responses, tenderId: tenderId, tenderTitle: tender.title })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Generation failed' })
    };
  }
};
