const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./_admin-auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, PUT, DELETE, OPTIONS'
      },
      body: ''
    };
  }

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  // Phase 1b ENFORCE: reject callers without a valid admin token.
  var _denied = await requireAdmin(event, 'save-tender', corsHeaders);
  if (_denied) return _denied;

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
    const { action, tender } = JSON.parse(event.body);

    let result;

    if (action === 'upsert') {
      const tenderData = {
        ...tender,
        eligibility: Array.isArray(tender.eligibility) ? tender.eligibility : [],
        pricing: typeof tender.pricing === 'object' ? tender.pricing : {}
      };
      result = await supabase.from('tenders').upsert(tenderData);
    } else if (action === 'delete') {
      result = await supabase.from('tenders').delete().eq('id', tender.id);
    } else {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid action: ' + action })
      };
    }

    if (result.error) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: result.error.message })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Unknown error' })
    };
  }
};
