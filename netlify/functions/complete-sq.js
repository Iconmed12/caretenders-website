// Applies default answers first, then AI-drafts remaining written sections
exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { tenderId, sqData, profile, chData, tenderSpec } = JSON.parse(event.body);
    if (!sqData) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing sqData' }) };

    var draftedFields = {};
    var co = chData || {};
    var p  = profile || {};
    var companyName = co.company_name || p.company_name || '';

    // ── DEFAULT ANSWERS (applied to every SQ automatically) ──
    var defaults = [
      // Supplier name
      { match: ['supplier name','name of supplier','name of organisation','organisation name','company name'],
        answer: function() { return companyName; } },

      // Single supplier
      { match: ['single supplier','sole supplier','single provider','bidding as a single'],
        answer: function() { return 'Yes'; } },

      // Debarment
      { match: ['debarment list','debarred','central digital platform','exclusion list'],
        answer: function() { return 'No'; } },

      // Insurance confirmations
      { match: ["employers' liability","employer's liability",'employers liability'],
        answer: function() { return 'Yes — Employers Liability Insurance is held at the required level.'; } },
      { match: ["public liability",'public liability insurance'],
        answer: function() { return 'Yes — Public Liability Insurance is held at the required level.'; } },
      { match: ['professional indemnity'],
        answer: function() { return 'Yes — Professional Indemnity Insurance is in place.'; } },

      // Equality & diversity
      { match: ['equality','diversity','equal opportunities'],
        answer: function() { return 'Yes — We have a comprehensive Equality, Diversity and Inclusion policy in place, reviewed annually, which covers all protected characteristics under the Equality Act 2010.'; } },

      // Safeguarding
      { match: ['safeguarding'],
        answer: function() { return 'Yes — We have a robust Safeguarding Policy in place, reviewed annually, compliant with current legislation and aligned to local safeguarding procedures.'; } },

      // IR35
      { match: ['ir35','off-payroll'],
        answer: function() { return 'Yes — We are compliant with IR35 off-payroll working rules.'; } },

      // Modern slavery
      { match: ['modern slavery','human trafficking'],
        answer: function() { return 'Yes — We have a Modern Slavery and Human Trafficking Policy in place and publish an annual statement where required by law.'; } },

      // Environmental
      { match: ['environmental policy','environmental management','iso 14001'],
        answer: function() { return 'Yes — We have an Environmental Policy in place and are committed to reducing our environmental impact across all operational activities.'; } }
    ];

    // Collect fields needing AI generation
    var aiFields = [];

    (sqData.sections || []).forEach(function(section) {
      (section.fields || []).forEach(function(field) {
        if (field.field_type !== 'ai_draft') return;

        var q = (field.question || '').toLowerCase();
        var matched = false;

        // Try defaults first
        for (var i = 0; i < defaults.length; i++) {
          var rule = defaults[i];
          if (rule.match.some(function(kw){ return q.includes(kw); })) {
            var ans = rule.answer();
            if (ans) { draftedFields[field.id] = ans; matched = true; break; }
          }
        }

        // Flag for AI generation if no default matched
        if (!matched) {
          aiFields.push({ id: field.id, question: field.question, hint: field.hint || '' });
        }
      });
    });

    // ── AI GENERATION for remaining fields ──
    if (aiFields.length) {
      // Build company context
      var ctx = 'COMPANY: ' + companyName + '\n';
      ctx += 'CQC: ' + (p.cqc_status || co.cqc_status || 'Registered') + '\n';
      ctx += 'Services: ' + (p.services || 'Care services') + '\n';
      ctx += 'Regions: ' + (p.regions || '') + '\n';
      ctx += 'Staff: ' + (p.total_staff || '') + '\n';
      if (p.experience)      ctx += 'Experience: ' + p.experience + '\n';
      if (p.policies)        ctx += 'Policies: ' + p.policies + '\n';
      if (p.accreditations)  ctx += 'Accreditations: ' + p.accreditations + '\n';
      if (p.achievements)    ctx += 'Achievements: ' + p.achievements + '\n';
      if (p.kpis)            ctx += 'KPIs: ' + p.kpis + '\n';

      // Tender spec for contextual answers
      var specContext = tenderSpec ? 'TENDER SPEC SUMMARY:\n' + tenderSpec.substring(0, 2000) + '\n\n' : '';

      // Special handling for known long-answer questions
      var standardQuestions = [];
      var otherFields = [];

      aiFields.forEach(function(f) {
        var q = f.question.toLowerCase();
        if (q.includes('gdpr') || q.includes('data protection') || q.includes('data subject') || q.includes('uk general data protection')) {
          standardQuestions.push({ ...f, type: 'gdpr' });
        } else if (q.includes('health and safety') || q.includes('health & safety') || q.includes('manage health')) {
          standardQuestions.push({ ...f, type: 'hs' });
        } else if (q.includes('organisational standard') || q.includes('organizational standard') || q.includes('qualifications or standards')) {
          standardQuestions.push({ ...f, type: 'org' });
        } else {
          otherFields.push(f);
        }
      });

      // Generate standard long answers individually (400 words each, spec-aware)
      for (var si = 0; si < standardQuestions.length; si++) {
        var sq = standardQuestions[si];
        var systemPrompts = {
          gdpr: 'You are a UK public sector bid writer. Write a detailed ~400 word response to a GDPR/data protection SQ question for a care provider. Cover: confidentiality & integrity of processing systems, data subject rights (access, rectification, deletion, portability), consent management, international transfer safeguards (if applicable), records of processing activities, and regular testing/assessment. Make it specific to care sector data (service user records, staff data, health data). Write in professional first-person plural (we/our).',
          hs: 'You are a UK public sector bid writer. Write a detailed ~400 word response to a health and safety SQ question for a care provider. Cover: H&S policy and management system, risk assessment processes, staff training and induction, incident reporting and learning, contractor management, and CQC compliance. Make it specific to domiciliary/residential care settings. Write in professional first-person plural (we/our).',
          org: 'You are a UK public sector bid writer. Write a detailed ~400 word response to an organisational standards/qualifications SQ question for a care provider. Cover: CQC registration, relevant qualifications, ISO/quality standards if held, staff qualification requirements, and commitment to continuous improvement. Write in professional first-person plural (we/our).'
        };

        var prompt = systemPrompts[sq.type] + '\n\nFull question: ' + sq.question + '\n\n' + specContext + 'Company context:\n' + ctx + '\n\nWrite the response now (approx 400 words):';

        try {
          var res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 800,
              messages: [{ role: 'user', content: prompt }]
            })
          });
          if (res.ok) {
            var data = await res.json();
            draftedFields[sq.id] = data.content && data.content[0] ? data.content[0].text.trim() : '';
          }
        } catch(e) { console.log('Standard question AI failed:', e.message); }
      }

      // Generate remaining fields in one batch
      if (otherFields.length) {
        var prompt2 = 'You are a UK public sector bid writer completing an SQ for a care provider.\n\n' +
          ctx + '\n' + specContext +
          'Answer each question concisely and professionally. Return ONLY a JSON object {"field_id":"answer"}.\n\n' +
          'Questions:\n' + JSON.stringify(otherFields);

        try {
          var res2 = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 2000,
              messages: [{ role: 'user', content: prompt2 }]
            })
          });
          if (res2.ok) {
            var data2 = await res2.json();
            var text2 = data2.content && data2.content[0] ? data2.content[0].text.trim() : '{}';
            var clean2 = text2.replace(/```json|```/g,'').trim();
            var start = clean2.indexOf('{'); var end = clean2.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
              var batch = JSON.parse(clean2.substring(start, end+1));
              Object.assign(draftedFields, batch);
            }
          }
        } catch(e) { console.log('Batch AI failed:', e.message); }
      }
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ draftedFields }) };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Failed' }) };
  }
};
