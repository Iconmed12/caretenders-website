// Talks to the same Netlify functions and Supabase project as the website,
// so the app shows the same live care tenders the site does.
import Constants from 'expo-constants';
import { supabase } from './auth';

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

/**
 * Every bid this member has started, running or finished.
 *
 * Generation happens on the server, so this list is the truth about what is
 * happening. Closing the app does not stop a run and does not lose it.
 */
export async function fetchOngoing(email) {
  if (!email) return [];
  const res = await fetch(`${API_BASE}/.netlify/functions/get-bid-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error('Could not load your bids');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// The server records a run as pending, processing, done or error. Everything
// the app shows hangs off these three buckets.
export function jobState(job) {
  const st = String((job && job.status) || '').toLowerCase();
  if (st === 'done' || st === 'complete' || st === 'completed') return 'ready';
  if (st === 'error' || st === 'failed') return 'failed';
  if (st === 'pending' || st === 'queued') return 'queued';
  return 'running';
}

// ── featured tender ──

/** "£3.1m" rather than "£3,100,000", for the big figure on the home card. */
export function valueCompact(t) {
  const raw = t.contract_value != null ? t.contract_value : t.value;
  const n = Number(String(raw == null ? '' : raw).replace(/[^0-9.]/g, ''));
  if (!n || isNaN(n)) return '';
  if (n >= 1000000) return '£' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (n >= 1000) return '£' + Math.round(n / 1000) + 'k';
  return '£' + n.toLocaleString('en-GB');
}

/** When the tender went live. Falls back to when we first saw it. */
export function openedDate(t) {
  const d = new Date(t.published_date || t.created_at);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * How much of the bidding window has gone, 0 to 1, for the countdown bar.
 * Returns null when we cannot work out both ends honestly.
 */
export function deadlineProgress(t) {
  const start = openedDate(t);
  const end = t.deadline ? new Date(t.deadline) : null;
  if (!start || !end || isNaN(end.getTime())) return null;
  const span = end.getTime() - start.getTime();
  if (span <= 0) return null;
  const gone = Date.now() - start.getTime();
  return Math.min(1, Math.max(0, gone / span));
}

/** The tender to feature: the biggest one open. */
export function pickFeatured(tenders) {
  const withValue = tenders.slice().sort((a, b) => {
    const av = Number(String(a.contract_value != null ? a.contract_value : a.value || '').replace(/[^0-9.]/g, '')) || 0;
    const bv = Number(String(b.contract_value != null ? b.contract_value : b.value || '').replace(/[^0-9.]/g, '')) || 0;
    return bv - av;
  });
  return withValue.slice(0, 3);
}

// ── company profile ──
// Used by the setup checklist, and by the writer to fill in company details.
export async function fetchCompanyProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('company_profiles')
    .select('user_id,company_name')
    .eq('user_id', userId)
    .limit(1);
  if (error) return null;
  return (data && data[0]) || null;
}

// ── evidence vault ──
// The same documents the website's vault holds, per member.

/**
 * The vault stores expiry as DD/MM/YYYY, which `new Date()` reads as American
 * and gets wrong. Parse it the way check-vault-expiry.js does, and still cope
 * if a row ever holds a plain ISO date.
 */
export function parseVaultDate(value) {
  if (!value) return null;
  const parts = String(value).split('/');
  if (parts.length === 3) {
    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(value);
  return isNaN(iso.getTime()) ? null : iso;
}

/** Days until a document expires. Null when it has no expiry at all. */
export function docDaysLeft(doc) {
  const d = parseVaultDate(doc && (doc.expiry_date || doc.review_date));
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export async function fetchVaultDocs(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('vault_documents')
    .select('id,doc_type,doc_label,file_name,expiry_date,review_date,uploaded_at')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error('Could not load your documents');
  return data || [];
}

export function docLabelOf(doc) {
  return (doc && (doc.doc_label || doc.doc_type || doc.file_name)) || 'Document';
}

// The writer already records which stage it has reached, so a running bid can
// say what it is actually doing without any change to the generation engine.
const STAGES = {
  pending: 'Queued',
  queued: 'Queued',
  processing: 'Starting',
  generating_responses: 'Writing answers',
  completing_sq: 'Completing your SQ',
  building_documents: 'Building documents',
  sending_email: 'Sending your email',
};

export function jobStageLabel(job) {
  const st = String((job && job.status) || '').toLowerCase();
  return STAGES[st] || 'Writing';
}

/** "2 hours ago", "yesterday", for the ongoing list. */
export function agoLabel(dateStr) {
  if (!dateStr) return '';
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + (mins === 1 ? ' min ago' : ' mins ago');
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  return new Date(then).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
