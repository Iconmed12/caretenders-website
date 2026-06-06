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
    const { tenderId, companyDetails, batchStart, batchEnd } = JSON.parse(event.body);

    const supabaseUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    const tenderRes = await fetch(
      supabaseUrl + '/rest/v1/tenders?id=eq.' + tenderId + '&select=*&limit=1',
      { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    const tenders = await tenderRes.json();
    const tender = tenders[0];

    if (!tender) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Tender not found' }) };
    }

    const allQuestions = tender.cana_questions || [];
    if (!allQuestions.length) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'This tender is not yet ready for Cana AI. Please contact consulting@icongrp.co.uk.' })
      };
    }

    // Get the batch of questions to answer
    var start = batchStart || 0;
    var end = batchEnd || allQuestions.length;
    var questions = allQuestions.slice(start, end);

    const knowledge = tender.cana_knowledge || '';
    var systemPrompt = 'You are an expert UK public sector tender writer. Write professional tender responses in first person on behalf of the bidding organisation. Be specific, reference the company details, use professional UK English. Write clean paragraphs with no markdown symbols.';
    if (knowledge) { systemPrompt += ' ' + knowledge; }

    var company = 'Organisation: ' + companyDetails.name + '. Founded: ' + companyDetails.founded + '. Staff: ' + companyDetails.staff + '. CQC: ' + companyDetails.cqc + '. Services: ' + companyDetails.services + '. Regions: ' + companyDetails.regions + (companyDetails.experience ? '. Experience: ' + companyDetails.experience : '') + '.';

    var questionsBlock = 'COMPANY: ' + company + '\nTENDER: ' + tender.title + '\n\n';
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      questionsBlock += 'QUESTION ' + (i+1) + ': ' + q.question;
      if (q.wordLimit) { questionsBlock += ' (max ' + q.wordLimit + ' words)'; }
      questionsBlock += '\nANSWER ' + (i+1) + ':\n\n';
    }

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: [{ role: 'user', content: questionsBlock }]
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'AI error: ' + errText.substring(0, 200) }) };
    }

    const aiData = await aiRes.json();
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
      body: JSON.stringify({
        responses: responses,
        tenderId: tenderId,
        tenderTitle: tender.title,
        totalQuestions: allQuestions.length
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Generation failed' })
    };
  }
};
