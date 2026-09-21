// Manual "Import Now" trigger. Netlify will NOT run a scheduled function from an
// HTTP request, so the admin button hits this BACKGROUND function instead: it is
// HTTP-invokable, returns 202 immediately, and runs up to 15 minutes. It reuses
// the exact same import logic as the scheduled importer. The admin page then
// polls the database to show how many tenders landed.

const { checkAdmin } = require('./_admin-auth');
const { runImport } = require('./import-tenders');

exports.handler = async (event) => {
  // Only run for a signed-in admin. (A background function always returns 202,
  // so we simply do no work when the caller is not an admin.)
  const who = await checkAdmin(event);
  if (!who.authenticated) {
    console.log('[import-now] denied, not an admin:', who.reason);
    return;
  }

  // Deep sweep: page far (40) and look back ~60 days across ALL stages, so
  // currently-open frameworks and re-issued/amended ones are caught. The daily
  // cron stays light. Overridable from the request body.
  var pages = 40, days = 60, deep = true;
  try { var b = JSON.parse(event.body || '{}'); if (b.pages) pages = b.pages; if (b.days) days = b.days; if (b.deep === false) deep = false; } catch (e) {}

  try {
    const r = await runImport(pages, days, deep);
    console.log('[import-now] finished for', who.email, '(pages ' + pages + ', days ' + days + ', deep ' + deep + '):', r && r.body ? String(r.body).substring(0, 200) : 'no body');
  } catch (e) {
    console.log('[import-now] error:', e.message);
  }
};
