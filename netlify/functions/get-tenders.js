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

    const { data, error } = await supabase
      .from('tenders')
      .select('*')
      .order('created_at', { ascending: false });

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
