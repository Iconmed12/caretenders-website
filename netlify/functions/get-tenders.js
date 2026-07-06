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

    // Heavy fields not selected -- list rows are already light.

    if (error) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: error.message })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(data || [])
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Unknown error' })
    };
  }
};
