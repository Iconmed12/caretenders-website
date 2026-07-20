// Talks to the same Netlify functions and Supabase project as the website,
// so the app shows the same live care tenders the site does.
import Constants from 'expo-constants';

const extra = (Constants.expoConfig && Constants.expoConfig.extra) || {};
export const API_BASE = extra.apiBase || 'https://caretenders-website.netlify.app';

// ── care detection, mirrors public/index.js isCare() ──
const COMMERCIAL_CATS = ['commercial','construction','facilities','facilities management','cleaning','consultancy','it & digital','it','digital','it & services','logistics','transport','waste','security','employment','business support','marketing','enterprise','training','recruitment','other'];
const CARE_CATS = ['domiciliary care','domiciliary','residential','nursing','supported living','supported','mental health','mental','hospital discharge','discharge'];
const BUSINESS_TITLE_RE = /\b(start[ -]?up|business (support|growth|planning)|enterprise skills?|employab\w*|employment (support|programme|services?)|connect to work|careers?|digital marketing|ux|service design|incubat\w*|accelerat\w*)\b/i;

function isCare(t) {
  if (BUSINESS_TITLE_RE.test(t.title || '')) return false;
  const cat = String(t.category || '').toLowerCase().trim();
  if (!cat) return !!t.is_non_cqc;
  if (COMMERCIAL_CATS.indexOf(cat) !== -1) return false;
  if (CARE_CATS.indexOf(cat) !== -1) return true;
  const ck = ['construction','facilit','cleaning','consultanc','logistic'];
  for (let i = 0; i < ck.length; i++) if (cat.indexOf(ck[i]) !== -1) return false;
  return true;
}
function isLive(t) {
  return t.status !== 'pending_review' && t.status !== 'rejected' && t.status !== 'Draft';
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export function closingLabel(t) {
  const days = daysUntil(t.deadline);
  if (days === null) return '';
  if (days > 1) return `Closes in ${days} days`;
  if (days === 1) return 'Closes tomorrow';
  if (days === 0) return 'Closes today';
  return 'Closed';
}

export function valueLabel(t) {
  const n = t.contract_value != null ? Number(t.contract_value) : null;
  if (n && !isNaN(n)) {
    if (n >= 1000000) return '£' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
    if (n >= 1000) return '£' + Math.round(n / 1000) + 'k';
    return '£' + n.toLocaleString('en-GB');
  }
  return t.value || '';
}

/** Live care tenders, newest first. */
export async function fetchTenders() {
  const res = await fetch(`${API_BASE}/.netlify/functions/get-tenders`);
  if (!res.ok) throw new Error('Could not load tenders');
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter((t) => isCare(t) && isLive(t));
}
