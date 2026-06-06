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
        body: JSON.stringify({ error: 'This tender is not yet ready for Cana AI. Please contact consulting@icongrp.co.uk.' })
      };
    }

    const knowledge = tender.cana_knowledge || '';

    var systemPrompt = 'You are an expert UK public sector tender writer working for ICONGRP Consulting. Write high-quality, professional tender responses in first person on behalf of the bidding organisation. Be specific, reference the company details throughout, and use professional UK English. Do not include any markdown headers or formatting symbols like ## or ---. Just write clean paragraphs.';
    if (knowledge) { systemPrompt += ' ' + knowledge; }

    var company = 'Organisation: ' + companyDetails.name + '. Founded: ' + companyDetails.founded + '. Staff: ' + companyDetails.staff + '. CQC Status: ' + companyDetails.cqc + '. Services: ' + companyDetails.services + '. Regions: ' + companyDetails.regions + (companyDetails.experience ? '. Experience: ' + companyDetails.experience : '') + '.';

    var questionsBlock = '';
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      questionsBlock += 'QUESTION ' + (i+1) + ': ' + q.question;
      if (q.wordLimit) { questionsBlock += ' (Word limit: ' + q.wordLimit + ')'; }
      questionsBlock += '\nANSWER ' + (i+1) + ':\n\n';
    }

    var userPrompt = 'Write tender responses for: ' + tender.title + ' (' + (tender.org || '') + ').\n\n';
    userPrompt += 'COMPANY: ' + company + '\n\n';
    userPrompt += 'Answer every question below. For each question write a complete professional response. Do not use markdown symbols. Format exactly as shown:\n\n';
    userPrompt += questionsBlock;

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'AI error: ' + errText.substring(0, 200) }) };
    }

    const aiData = await apiResponse.json();
    const fullResponse = aiData.content[0].text;

    var responses = [];
    var blocks = fullResponse.split(/ANSWER \d+:/i);
    for (var k = 0; k < questions.length; k++) {
      var answer = blocks[k+1] ? blocks[k+1].split(/QUESTION \d+:/i)[0].trim() : '';
      responses.push({ question: questions[k].question, answer: answer || 'Response could not be generated.' });
    }

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
