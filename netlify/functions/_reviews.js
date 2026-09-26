// Shared logic for plan-included expert reviews. An included review is a FREE
// (no Stripe) human review that a member's plan covers, capped per month and
// shared across the whole company circle. Document completion (the £1,000
// review_docs product) is NOT included and stays paid-only.
//
// Allowances (per calendar month, shared across the company):
//   access: none
//   pro:    2 response reviews
//   gold:   2 response reviews + 2 full tender reviews

const SB_URL = 'https://igpjfpncfuawikoyzfcd.supabase.co';

const REVIEW_LIMITS = {
  gold: { response: 2, full: 2 },
  pro: { response: 2, full: 0 },
  access: { response: 0, full: 0 },
};

function limitsFor(plan) {
  return REVIEW_LIMITS[plan] || REVIEW_LIMITS.access;
}

function monthStartISO() {
  var d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// How many included reviews of `type` the company has used this month. Counts
// across the whole circle when we have the scope emails, else just this user.
async function countReviewUsage(scopeEmails, userId, type, sbKey) {
  var filter;
  if (scopeEmails && scopeEmails.length) {
    filter = 'email=in.(' + scopeEmails.map(function (e) { return encodeURIComponent(e); }).join(',') + ')';
  } else {
    filter = 'user_id=eq.' + encodeURIComponent(userId || '');
  }
  var url = SB_URL + '/rest/v1/review_usage?' + filter +
    '&review_type=eq.' + encodeURIComponent(type) +
    '&created_at=gte.' + encodeURIComponent(monthStartISO()) + '&select=id';
  try {
    var res = await fetch(url, { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } });
    return res.ok ? (await res.json()).length : 0;
  } catch (e) { return 0; }
}

// Record one used included review. Best effort; returns true on success.
async function recordReviewUsage(row, sbKey) {
  try {
    var res = await fetch(SB_URL + '/rest/v1/review_usage', {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    return res.ok;
  } catch (e) { return false; }
}

module.exports = { REVIEW_LIMITS, limitsFor, monthStartISO, countReviewUsage, recordReviewUsage };
