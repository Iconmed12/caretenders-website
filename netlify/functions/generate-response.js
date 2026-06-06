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

    var company = 'Organisation: ' + companyDetails.name +
      ', Founded: ' + companyDetails.founded +
      ', Staff: ' + companyDetails.staff +
      ', CQC: ' + companyDetails.cqc +
      ', Services: ' + companyDetails.services +
      ', Regions: ' + companyDetails.regions +
      (companyDetails.experience ? ', Experience: ' + companyDetails.experience : '');

    var responses = [];

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var wordLimit = q.wordLimit ? parseInt(q.wordLimit) : 500;

      var prompt = 'You are an expert UK public sector tender writer. Write a professional, specific tender response on behalf of ' + companyDetails.name + '.\n\n';
      prompt += 'COMPANY DETAILS:\n' + company + '\n\n';
      prompt += 'TENDER: ' + tender.title + ' (' + (tender.org || '') + ')\n\n';
      if (knowledge) { prompt += 'WRITING GUIDANCE:\n' + knowledge + '\n\n'; }
      prompt += 'QUESTION ' + (i+1) + ':\n' + q.question + '\n\n';
      prompt += 'Write a complete, high-quality response to this question. ';
      prompt += 'Use first person (we/our). Be specific. Reference the company details throughout. ';
      prompt += 'Maximum ' + wordLimit + ' words. Do not repeat the question. Just write the answer.';

      const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        responses.push({ question: q.question, answer: 'Could not generate response: ' + errText.substring(0, 100) });
        continue;
      }

      const aiData = await apiResponse.json();
      var answer = aiData.content[0].text.trim();
      responses.push({ question: q.question, answer: answer });
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
