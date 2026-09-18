const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const supabaseUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';
    const supabaseKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);

    if (!supabaseKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing SUPABASE_ANON_KEY environment variable' })
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Public site shows ONLY tenders the admin explicitly set live (plus legacy
    // manual public statuses). needs_docs = approved but still being prepared,
    // never client-visible. Admin passes ?scope=all for everything.
    const scope = (event.queryStringParameters && event.queryStringParameters.scope) || 'public';
    // Light columns only (verified against live schema). Heavy fields excluded
    // so the DATABASE never reads or sends them for list views.
    // Light columns only -- heavy fields (cana_docs, sq_data, completion_docs)
    // are never selected in list views. docFlags come from get-tender-full.
    const LIST_COLS = 'id,status,title,org,category,region,value,duration,deadline,days_left,link,description,pricing,eligibility,is_non_cqc,why_cqc,created_at,stripe_link,source,source_id,source_url,buyer,published_date,is_cqc,submission_portal';
    let query = supabase.from('tenders').select(LIST_COLS).order('created_at', { ascending: false });
    if (scope !== 'all') query = query.in('status', ['live', 'open', 'closing', 'urgent']);
    const { data, error } = await query;

    if (error) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: error.message })
      };
    }

    let rows = data || [];

    // Admin view (scope=all): the Cana rail needs to know which documents each
    // tender has, so the "Missing" chips are accurate. The list stays light; we
    // pull the doc fields only for the few tenders the rail actually shows
    // (live / needs_docs / open), compute booleans, and never return the heavy
    // content itself.
    if (scope === 'all') {
      const panelIds = rows
        .filter(function (r) { return ['live', 'needs_docs', 'open'].indexOf(r.status) !== -1; })
        .map(function (r) { return r.id; });
      if (panelIds.length) {
        const { data: docRows } = await supabase
          .from('tenders')
          .select('id,cana_docs,cana_questions')
          .in('id', panelIds);
        const byId = {};
        (docRows || []).forEach(function (dr) { byId[dr.id] = dr; });
        rows.forEach(function (r) {
          const dr = byId[r.id];
          if (!dr) return;
          const cd = dr.cana_docs || {};
          const qCount = Array.isArray(dr.cana_questions) ? dr.cana_questions.length : 0;
          r.docFlags = {
            sq: !!cd.sq || (Array.isArray(cd.sq) && cd.sq.length > 0),
            quality: (Array.isArray(cd.quality) && cd.quality.length > 0) || qCount > 0,
            spec: Array.isArray(cd.spec) && cd.spec.length > 0,
            scoring: Array.isArray(cd.scoring) && cd.scoring.length > 0
          };
        });
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(rows)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Unknown error' })
    };
  }
};
