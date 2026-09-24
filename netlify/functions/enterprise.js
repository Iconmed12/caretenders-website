// Enterprise ("company circle") management for customers.
//   GET               -> the caller's enterprise context (owner overview, or member view, or none)
//   POST {action:create, name}                -> create an enterprise (caller becomes owner)
//   POST {action:invite, email, department}   -> owner invites a seat (emails a join link)
//   POST {action:remove, memberId}            -> owner removes/cancels a seat
// Auth is the caller's own Supabase token (verified via /auth/v1/user). All DB
// access uses the service key (tables are RLS-locked). Owner-only actions are
// enforced by checking the caller owns the enterprise.

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';
const FROM = 'Cana <noreply@getcana.co.uk>';
const SITE = 'https://getcana.co.uk';

async function verifyUser(event) {
  try {
    var hdrs = (event && event.headers) || {};
    var auth = hdrs.authorization || hdrs.Authorization || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token) return null;
    var anon = process.env.SUPABASE_ANON_KEY;
    var res = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    var u = await res.json();
    if (!u || !u.id) return null;
    return { id: u.id, email: (u.email || '').toLowerCase() };
  } catch (e) { return null; }
}

function token() { return 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  function sb(path, opts) {
    return fetch(SB_URL + path, Object.assign({ headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' } }, opts || {}));
  }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  try {
    var user = await verifyUser(event);
    if (!user) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in.' }) };

    // Resolve the caller's enterprise: as owner first, else as an active member.
    async function findEnterpriseForUser() {
      var oRes = await sb('/rest/v1/enterprises?owner_user_id=eq.' + encodeURIComponent(user.id) + '&select=*&limit=1');
      var owned = oRes.ok ? (await oRes.json())[0] : null;
      if (owned) return { ent: owned, role: 'owner' };
      var mRes = await sb('/rest/v1/enterprise_members?user_id=eq.' + encodeURIComponent(user.id) + '&status=eq.active&select=enterprise_id,department&limit=1');
      var mem = mRes.ok ? (await mRes.json())[0] : null;
      if (mem) {
        var eRes = await sb('/rest/v1/enterprises?id=eq.' + encodeURIComponent(mem.enterprise_id) + '&select=*&limit=1');
        var ent = eRes.ok ? (await eRes.json())[0] : null;
        if (ent) return { ent: ent, role: 'member', department: mem.department };
      }
      return null;
    }

    // ── GET: return context ──
    if (event.httpMethod === 'GET') {
      var ctx = await findEnterpriseForUser();
      if (!ctx) return { statusCode: 200, headers: cors, body: JSON.stringify({ role: null }) };
      if (ctx.role === 'member') {
        return { statusCode: 200, headers: cors, body: JSON.stringify({ role: 'member', enterprise: { name: ctx.ent.name }, department: ctx.department }) };
      }
      // Owner overview: members + a simple bid count per member email.
      var listRes = await sb('/rest/v1/enterprise_members?enterprise_id=eq.' + encodeURIComponent(ctx.ent.id) + '&status=in.(invited,active)&select=id,email,department,role,status,joined_at&order=created_at.asc');
      var members = listRes.ok ? (await listRes.json()) : [];
      var emails = members.map(function (m) { return (m.email || '').toLowerCase(); }).filter(Boolean);
      var counts = {};
      if (emails.length) {
        var inList = emails.map(function (e) { return encodeURIComponent(e); }).join(',');
        var jRes = await sb('/rest/v1/cana_jobs?client_email=in.(' + inList + ')&select=client_email');
        if (jRes.ok) { (await jRes.json()).forEach(function (j) { var k = (j.client_email || '').toLowerCase(); counts[k] = (counts[k] || 0) + 1; }); }
      }
      members.forEach(function (m) { m.bids = counts[(m.email || '').toLowerCase()] || 0; });
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        role: 'owner',
        enterprise: { id: ctx.ent.id, name: ctx.ent.name, seat_limit: ctx.ent.seat_limit },
        seats_used: members.length,
        members: members
      }) };
    }

    // ── POST: actions ──
    var body = JSON.parse(event.body || '{}');
    var action = body.action;

    if (action === 'create') {
      var name = (body.name || '').trim().substring(0, 120);
      if (!name) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Please enter a company name.' }) };
      var existing = await findEnterpriseForUser();
      if (existing) return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'You are already part of an enterprise.' }) };
      var ins = await sb('/rest/v1/enterprises', { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ name: name, owner_user_id: user.id, owner_email: user.email, seat_limit: 5 }) });
      if (!ins.ok) { var et = await ins.text(); return { statusCode: 500, headers: cors, body: JSON.stringify({ error: et.substring(0, 150) }) }; }
      var ent = (await ins.json())[0];
      // Owner is seat #1.
      await sb('/rest/v1/enterprise_members', { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ enterprise_id: ent.id, user_id: user.id, email: user.email, role: 'owner', status: 'active', joined_at: new Date().toISOString() }) });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, enterprise: { id: ent.id, name: ent.name, seat_limit: ent.seat_limit } }) };
    }

    // Owner-only from here.
    var mine = await findEnterpriseForUser();
    if (!mine || mine.role !== 'owner') return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Only the enterprise owner can do that.' }) };
    var entId = mine.ent.id;

    if (action === 'invite') {
      var email = (body.email || '').trim().toLowerCase();
      var department = (body.department || '').trim().substring(0, 60);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Please enter a valid email address.' }) };
      // Seat limit check (invited + active).
      var cRes = await sb('/rest/v1/enterprise_members?enterprise_id=eq.' + encodeURIComponent(entId) + '&status=in.(invited,active)&select=id');
      var used = cRes.ok ? (await cRes.json()).length : 0;
      if (used >= (mine.ent.seat_limit || 5)) return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'All ' + (mine.ent.seat_limit || 5) + ' seats are in use. Remove a member to free a seat.' }) };
      var tok = token();
      // Member row (invited) + invite token.
      var mIns = await sb('/rest/v1/enterprise_members', { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ enterprise_id: entId, email: email, department: department, role: 'member', status: 'invited' }) });
      if (!mIns.ok) { var e2 = await mIns.text(); if (/duplicate|unique/i.test(e2)) return { statusCode: 409, headers: cors, body: JSON.stringify({ error: 'That person is already invited or a member.' }) }; return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e2.substring(0, 150) }) }; }
      await sb('/rest/v1/enterprise_invites', { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ token: tok, enterprise_id: entId, email: email, department: department, expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }) });
      // Email the invite link.
      try {
        var RESEND = process.env.RESEND_API_KEY;
        if (RESEND) {
          var link = SITE + '/join.html?token=' + tok;
          await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: email, subject: 'You have been invited to join ' + esc(mine.ent.name) + ' on Cana Bids', html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;"><div style="background:#0B1929;padding:20px;border-radius:8px 8px 0 0;"><h1 style="color:#00C9E0;margin:0;">Cana</h1></div><div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;"><h2 style="color:#0B1929;margin:0 0 12px;">Join ' + esc(mine.ent.name) + '</h2><p style="color:#374151;">You have been invited to join <strong>' + esc(mine.ent.name) + '</strong>' + (department ? ' (' + esc(department) + ')' : '') + ' on Cana Bids, so you can find and bid for tenders for your team.</p><p style="margin:22px 0;"><a href="' + link + '" style="display:inline-block;background:#00C9E0;color:#0B1929;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;">Accept invitation</a></p><p style="color:#9ca3af;font-size:12px;">If the button does not work, paste this link into your browser:<br>' + link + '</p></div></div>' }) });
        }
      } catch (e) { console.log('Invite email failed:', e.message); }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'remove') {
      var memberId = (body.memberId || '').trim();
      if (!memberId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing member id.' }) };
      // Do not allow removing the owner seat.
      var mRes = await sb('/rest/v1/enterprise_members?id=eq.' + encodeURIComponent(memberId) + '&enterprise_id=eq.' + encodeURIComponent(entId) + '&select=role,email&limit=1');
      var target = mRes.ok ? (await mRes.json())[0] : null;
      if (!target) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Member not found.' }) };
      if (target.role === 'owner') return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'You cannot remove the owner.' }) };
      await sb('/rest/v1/enterprise_members?id=eq.' + encodeURIComponent(memberId), { method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'removed', user_id: null }) });
      await sb('/rest/v1/enterprise_invites?enterprise_id=eq.' + encodeURIComponent(entId) + '&email=eq.' + encodeURIComponent((target.email || '').toLowerCase()) + '&status=eq.pending', { method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'revoked' }) });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action.' }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
