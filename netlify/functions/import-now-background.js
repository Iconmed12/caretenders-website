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

  // Deep sweep: page much further and look back ~120 days, so currently-open
  // frameworks and DPS published weeks ago are caught (the daily cron stays
  // light). Overridable from the request body.
  var pages = 15, days = 120;
  try { var b = JSON.parse(event.body || '{}'); if (b.pages) pages = b.pages; if (b.days) days = b.days; } catch (e) {}

  try {
    const r = await runImport(pages, days);
    console.log('[import-now] finished for', who.email, '(pages ' + pages + ', days ' + days + '):', r && r.body ? String(r.body).substring(0, 200) : 'no body');
  } catch (e) {
    console.log('[import-now] error:', e.message);
  }
};
