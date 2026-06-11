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

    // LIST PAYLOADS ARE LIGHT. Heavy fields (document base64, extracted text,
    // SQ internals) are stripped to presence summaries here; the full record
    // comes from get-tender-full when one tender is opened. This keeps list
    // loads fast no matter how loaded individual tenders become.
    if (Array.isArray(data)) {
      data.forEach(function(t) {
        delete t.completion_docs;
        if (t.cana_docs && typeof t.cana_docs === 'object') {
          var light = {};
          ['quality', 'spec', 'scoring'].forEach(function(k) {
            var arr = Array.isArray(t.cana_docs[k]) ? t.cana_docs[k] : (t.cana_docs[k] ? [t.cana_docs[k]] : []);
            light[k] = arr.map(function(d) { return { name: d && d.name }; });
          });
          t.cana_docs = light;
        }
        if (t.sq_data && typeof t.sq_data === 'object') {
          t.sq_data = {
            fileName: t.sq_data.fileName || null,
            storagePath: t.sq_data.storagePath || null,
            hasSections: !!(t.sq_data.sections && t.sq_data.sections.length)
          };
        }
      });
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
