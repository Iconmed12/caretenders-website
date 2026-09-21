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

  var pages = 6;
  try { pages = JSON.parse(event.body || '{}').pages || 6; } catch (e) {}

  try {
    const r = await runImport(pages);
    console.log('[import-now] finished for', who.email, ':', r && r.body ? String(r.body).substring(0, 200) : 'no body');
  } catch (e) {
    console.log('[import-now] error:', e.message);
  }
};
