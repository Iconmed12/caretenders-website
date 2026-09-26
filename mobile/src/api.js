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

export function isCareTender(t) {
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

// ── sectors ──
// Buckets used for the home tiles, filters and card tags. Colours mirror the
// mockups. Every tender maps to exactly one bucket via sectorKeyOf().
// Category is shown by icon + label, not colour. Every sector uses the same navy
// icon on a neutral surface, keeping the interface restrained and premium.
const SECTOR_INK = '#071A2F';
const SECTOR_SURFACE = '#EFF3F6';
export const SECTORS = [
  { key: 'care', label: 'Care & Health', tag: 'CARE & HEALTH', color: SECTOR_INK, bg: SECTOR_SURFACE },
  { key: 'facilities', label: 'Facilities Management', tag: 'FACILITIES MANAGEMENT', color: SECTOR_INK, bg: SECTOR_SURFACE },
  { key: 'recruitment', label: 'Recruitment & HR', tag: 'RECRUITMENT & HR', color: SECTOR_INK, bg: SECTOR_SURFACE },
  { key: 'construction', label: 'Construction & Property', tag: 'CONSTRUCTION & PROPERTY', color: SECTOR_INK, bg: SECTOR_SURFACE },
  { key: 'it', label: 'IT & Technology', tag: 'IT & TECHNOLOGY', color: SECTOR_INK, bg: SECTOR_SURFACE },
  { key: 'other', label: 'Other', tag: 'OPPORTUNITY', color: SECTOR_INK, bg: SECTOR_SURFACE },
];

export function sectorKeyOf(t) {
  if (isCareTender(t)) return 'care';
  const s = (String(t.category || '') + ' ' + String(t.title || '')).toLowerCase();
  if (/\bict\b|\bit\b|digital|technolog|software|cyber|\bdata\b|network/.test(s)) return 'it';
  if (/recruit|staffing|employ|\bhr\b|workforce|temporary staff|resourcing/.test(s)) return 'recruitment';
  if (/facilit|cleaning|estate|catering|grounds|\bfm\b/.test(s)) return 'facilities';
  if (/construc|building|refurb|property|\bworks\b|highway|civil/.test(s)) return 'construction';
  return 'other';
}

export function sectorOf(t) {
  const key = sectorKeyOf(t);
  return SECTORS.find((x) => x.key === key) || SECTORS[SECTORS.length - 1];
}

export function sectorMeta(key) {
  return SECTORS.find((x) => x.key === key) || SECTORS[SECTORS.length - 1];
}

// Recently added: within two weeks of when we first saw it.
export function isNewTender(t) {
  const d = new Date(t.published_date || t.created_at);
  if (isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) <= 14 * 86400000;
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

/** Live tenders across every sector, newest first. */
export async function fetchTenders() {
  const res = await fetch(`${API_BASE}/.netlify/functions/get-tenders`);
  if (!res.ok) throw new Error('Could not load tenders');
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter((t) => isLive(t));
}

/**
 * Every bid this member has started, running or finished.
 *
 * Generation happens on the server, so this list is the truth about what is
 * happening. Closing the app does not stop a run and does not lose it.
 */
// The server takes the identity from the signed-in token, not from the body, so
// a member can only ever see their own history. Pass the session access token.
export async function fetchOngoing(token) {
  if (!token) return [];
  const res = await fetch(`${API_BASE}/.netlify/functions/get-bid-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: '{}',
  });
  if (!res.ok) throw new Error('Could not load your bids');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// A short, human order reference for a job, shown on the confirmation and in My
// Bids so a member can quote it to us. Derived from the job id, stable per job.
export function orderRef(job) {
  const id = job && typeof job === 'object' ? (job.id != null ? job.id : job.jobId) : job;
  const s = String(id == null ? '' : id).replace(/[^a-zA-Z0-9]/g, '');
  return 'CB-' + (s.slice(-6).toUpperCase() || '000000');
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
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (error) return null;
  return (data && data[0]) || null;
}

// The shared legal entity belongs to the company owner, so an enterprise member
// never writes these columns; their own department owns everything else. Mirrors
// LEGAL_COLS in the website's profile.html.
export const LEGAL_COLS = ['company_name', 'company_number', 'vat_number', 'founded_year', 'company_type', 'registered_address'];

/**
 * If the caller is an enterprise member, returns { role:'member', shared:{...},
 * department, enterprise_name } so the app can lock the legal fields to the
 * owner's values. Owners and solo users get role:'owner_or_solo'. Null on error.
 */
export async function fetchCompanyShared(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/company-shared`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

/**
 * Save the company profile, exactly as the website does: upsert on user_id.
 * Members do not write the shared legal columns, so those stay the owner's.
 */
export async function saveCompanyProfile(userId, data, isMember) {
  const row = Object.assign({}, data, { user_id: userId, updated_at: new Date().toISOString() });
  if (isMember) LEGAL_COLS.forEach((k) => { delete row[k]; });
  const { error } = await supabase.from('company_profiles').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(error.message || 'Could not save your profile.');
  return true;
}

// ── generation ──
// The same two-step flow the website uses: member-start verifies membership and
// creates the job, then generate-cana-background writes and emails the bid. The
// server emails the finished document; the app polls status only.

/** Build the companyDetails the engine expects from a saved company profile. */
export function memberCompanyDetails(profile, email) {
  const p = profile || {};
  return {
    name: p.company_name || '',
    founded: p.founded_year || '',
    staff: p.total_staff || '',
    cqc: p.cqc_status || '',
    services: p.services || '',
    regions: p.regions || '',
    experience: p.experience || '',
    achievements: p.achievements || '',
    policies: p.policies || '',
    accreditations: p.accreditations || '',
    kpis: p.kpis || '',
    social_value: p.social_value || '',
    key_people: p.key_people || [],
    contract_examples: p.contract_examples || [],
    email: email || '',
  };
}

/**
 * Start a real generation for a member. Returns the job id to poll. Throws with
 * the server's message on failure (e.g. no active membership).
 */
export async function startGeneration(tender, user, token) {
  const profile = await fetchCompanyProfile(user.id);
  const companyDetails = memberCompanyDetails(profile, user.email);

  const msRes = await fetch(`${API_BASE}/.netlify/functions/member-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenderId: tender.id, includeSq: false, companyDetails, accessToken: token, wantsReview: false }),
  });
  const data = await msRes.json().catch(() => ({}));
  if (!msRes.ok) throw new Error(data.error || 'Could not start generation.');

  // Kick off the background writer (returns quickly; it runs on the server).
  await fetch(`${API_BASE}/.netlify/functions/generate-cana-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: data.jobId,
      tenderId: data.tenderId || tender.id,
      sessionId: 'member_' + data.jobId,
      includeSq: false,
      wantsReview: false,
      tier: 'none',
      companyDetails: data.companyDetails || companyDetails,
    }),
  }).catch(() => {});

  return { jobId: data.jobId, email: data.email || user.email };
}

/**
 * Membership for an email, via the same check-membership function the website
 * uses (service key, so it works past row-level security, and it resolves
 * enterprise members to the owner's plan). Returns { member, plan, ... } or null.
 */
export async function fetchMembership(email) {
  if (!email) return null;
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/check-membership?email=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

// ── company invite (join an existing company) ──
// An invited teammate joins the owner's company with no purchase, so this stays
// inside App Store / Play rules. The invite email carries a link with ?token=,
// which the app looks up, then creates the already-confirmed account.

/** Pull the token out of a pasted invite link (or accept a bare token). */
export function inviteTokenFrom(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const m = s.match(/[?&]token=([^&\s]+)/i);
  if (m) return decodeURIComponent(m[1]);
  // A bare token: letters, numbers, dashes, no spaces or slashes.
  if (/^[A-Za-z0-9._-]+$/.test(s)) return s;
  return '';
}

/** Look up an invite. Returns { valid, email, department, enterprise_name, reason }. */
export async function fetchInviteInfo(token) {
  if (!token) return { valid: false, reason: 'not_found' };
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/enterprise-invite-info?token=${encodeURIComponent(token)}`);
    if (!res.ok) return { valid: false, reason: 'error' };
    return await res.json();
  } catch (e) { return { valid: false, reason: 'error' }; }
}

/** Accept an invite and create the account. Throws with the server's message. */
export async function acceptInvite({ token, firstName, lastName, password }) {
  const res = await fetch(`${API_BASE}/.netlify/functions/enterprise-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, firstName, lastName, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Could not create your account.'); e.existing = !!data.existing; throw e; }
  return data; // { ok, email, enterprise, department }
}

// ── teams (company circle) ──
// Mirrors the website's enterprise.js. Members see the roster read-only; the
// owner sees an overview and can invite or remove seats. All access is via the
// server (service key), since the tables are locked by row-level security.

/**
 * Returns { role:null } | { role:'member', enterprise, department, members } |
 * { role:'owner', enterprise, seats_used, members }. Null on network error.
 */
export async function fetchTeam(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/enterprise`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

/** Owner actions: {action:'create',name} | {action:'invite',email,department} | {action:'remove',memberId}. */
export async function teamAction(token, payload) {
  const res = await fetch(`${API_BASE}/.netlify/functions/enterprise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// ── S.A.T (Send A Tender) ──
// The customer pastes a tender link they cannot find on Cana; the team sources
// it by hand. Same two functions the website uses. The monthly allowance is set
// by plan (Access 1, Pro 3, Gold unlimited) and SHARED across a company circle,
// and the server, not the app, enforces it.

/** This account's S.A.T requests plus its allowance for the month. */
export async function fetchTenderRequests(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/tender-request-mine`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

/** Send a new S.A.T request. Throws with the server's message on failure. */
export async function createTenderRequest(token, { link, note, companyName }) {
  const res = await fetch(`${API_BASE}/.netlify/functions/tender-request-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ link, note, companyName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not send your request.');
  return data;
}

// Plain-English labels for the status the admin sets on a request.
const SAT_STATUS = {
  new: { label: 'Received', tone: 'wait' },
  sourcing: { label: 'Sourcing', tone: 'wait' },
  sourced: { label: 'Added to Cana', tone: 'good' },
  added: { label: 'Added to Cana', tone: 'good' },
  done: { label: 'Added to Cana', tone: 'good' },
  declined: { label: 'Not found', tone: 'off' },
  rejected: { label: 'Not found', tone: 'off' },
};
export function satStatusOf(status) {
  return SAT_STATUS[String(status || '').toLowerCase()] || { label: 'Received', tone: 'wait' };
}

/** Poll a job's status. Returns the raw status string ('pending' if unknown). */
export async function fetchJobStatus(jobId) {
  if (!jobId) return 'pending';
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/get-cana-result?jobId=${encodeURIComponent(jobId)}`);
    if (!res.ok) return 'running';
    const data = await res.json().catch(() => ({}));
    return data.status || 'pending';
  } catch (e) { return 'running'; }
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
