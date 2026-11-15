// Claim / release / take over a pending tender, so two staff never work the same
// one (and never upload the same tender twice). The claim is atomic: it only
// succeeds if nobody else holds a fresh lock, so a race between two clicks can
// only ever grant one of them. Identity comes from the verified admin token, not
// the client, so a lock can't be spoofed.
//
// Body: { id, action }  where action is 'claim' | 'release' | 'takeover'.
//  - claim:    take it if free, held by you already, or the holder's lock is stale.
//  - release:  give it back (only clears it if you are the holder).
//  - takeover: owner/manager only, grabs it regardless of who holds it.

const { createClient } = require('@supabase/supabase-js');
const { requireAdmin, logAudit } = require('./_admin-auth');

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const LOCK_TTL_MS = 15 * 60 * 1000; // a claim older than this counts as abandoned

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const denied = await requireAdmin(event, 'admin-tender-lock', cors);
  if (denied) return denied;

  const id = (event._adminIdentity) || {};
  const email = (id.email || '').toLowerCase();
  const role = id.role || '';

  try {
    const body = JSON.parse(event.body || '{}');
    const tenderId = body.id;
    const action = body.action;
    if (!tenderId || !action) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing id or action' }) };

    const supabase = createClient(SB_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
    const nowIso = new Date().toISOString();
    const cutoff = new Date(Date.now() - LOCK_TTL_MS).toISOString();

    if (action === 'claim') {
      // Only grant it if free, already mine, or the current hold has gone stale.
      const { data, error } = await supabase
        .from('tenders')
        .update({ locked_by: email, locked_at: nowIso })
        .eq('id', tenderId)
        .or('locked_by.is.null,locked_by.eq.' + email + ',locked_at.lt.' + cutoff)
        .select('id,locked_by,locked_at');
      if (error) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };
      if (!data || !data.length) {
        // Someone else holds a fresh lock. Tell the client who, so it can show it.
        const cur = await supabase.from('tenders').select('locked_by,locked_at').eq('id', tenderId).maybeSingle();
        const row = (cur && cur.data) || {};
        return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'Already claimed', locked_by: row.locked_by, locked_at: row.locked_at }) };
      }
      await logAudit(event, 'tender-claim', { tenderId: tenderId });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, locked_by: email, locked_at: nowIso }) };
    }

    if (action === 'release') {
      // Idempotent: clears the lock only if you are the holder; a no-op otherwise.
      const { error } = await supabase
        .from('tenders')
        .update({ locked_by: null, locked_at: null })
        .eq('id', tenderId)
        .eq('locked_by', email);
      if (error) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'takeover') {
      if (role !== 'owner' && role !== 'manager') {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Only an owner or manager can take over a claim' }) };
      }
      const { error } = await supabase
        .from('tenders')
        .update({ locked_by: email, locked_at: nowIso })
        .eq('id', tenderId);
      if (error) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };
      await logAudit(event, 'tender-takeover', { tenderId: tenderId });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, locked_by: email, locked_at: nowIso }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
