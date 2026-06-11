const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const supabaseUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

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
    let query = supabase.from('tenders').select('*').order('created_at', { ascending: false });
    if (scope !== 'all') query = query.in('status', ['live', 'open', 'closing', 'urgent']);
    const { data, error } = await query;

    // completion_docs holds base64 files. The admin (scope=all) needs it for the
    // pack editor; the public feed must never carry it. Strip in code rather than
    // whitelisting columns, so the query never depends on guessed schema.
    if (scope !== 'all' && Array.isArray(data)) {
      data.forEach(function(t) { delete t.completion_docs; });
    }

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
