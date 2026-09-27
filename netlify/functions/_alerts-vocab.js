// One source of truth for the tender-alerts pick lists AND the matching logic.
// The tender-alerts function serves these options to the app and website, and
// the send-alerts job uses matchTender() so what a member picks is exactly what
// gets alerted. No free text anywhere, so a choice can never be misspelt.

// The six sectors, same keys the app uses (mobile/src/api.js SECTORS).
const SECTORS = [
  { key: 'care', label: 'Care & Health' },
  { key: 'facilities', label: 'Facilities Management' },
  { key: 'recruitment', label: 'Recruitment & HR' },
  { key: 'construction', label: 'Construction & Property' },
  { key: 'it', label: 'IT & Technology' },
  { key: 'other', label: 'Other' },
];

// Service types are a fixed vocabulary. Each carries the terms we look for in a
// tender's title and description, so a selection maps to real, matchable words.
const SERVICE_TYPES = [
  // Care & Health (the live launch sector, so it is the fullest).
  { key: 'home_care', sector: 'care', label: 'Home and domiciliary care', terms: ['domiciliary', 'home care', 'care at home', 'care in the home'] },
  { key: 'supported_living', sector: 'care', label: 'Supported living', terms: ['supported living', 'supported accommodation'] },
  { key: 'residential_nursing', sector: 'care', label: 'Residential and nursing', terms: ['residential care', 'nursing home', 'care home'] },
  { key: 'learning_disabilities', sector: 'care', label: 'Learning disabilities', terms: ['learning disab', 'learning difficult'] },
  { key: 'mental_health', sector: 'care', label: 'Mental health', terms: ['mental health'] },
  { key: 'older_people', sector: 'care', label: 'Older people', terms: ['older people', 'elderly', 'older adults'] },
  { key: 'childrens', sector: 'care', label: "Children's services", terms: ["children's", 'childrens', 'young people', 'fostering', 'looked after children'] },
  { key: 'reablement', sector: 'care', label: 'Reablement and rehab', terms: ['reablement', 'rehabilitation', 'rehab', 'enablement'] },
  { key: 'extra_care', sector: 'care', label: 'Extra care', terms: ['extra care'] },
  { key: 'day_services', sector: 'care', label: 'Day services', terms: ['day service', 'day care', 'day centre'] },
  // Facilities Management.
  { key: 'cleaning', sector: 'facilities', label: 'Cleaning', terms: ['cleaning', 'janitorial'] },
  { key: 'security', sector: 'facilities', label: 'Security', terms: ['security', 'guarding', 'manned guarding'] },
  { key: 'catering', sector: 'facilities', label: 'Catering', terms: ['catering', 'meals', 'food service'] },
  { key: 'grounds', sector: 'facilities', label: 'Grounds and landscaping', terms: ['grounds maintenance', 'landscaping', 'grounds'] },
  { key: 'waste', sector: 'facilities', label: 'Waste and recycling', terms: ['waste', 'recycling', 'refuse'] },
  { key: 'building_maint', sector: 'facilities', label: 'Building maintenance', terms: ['building maintenance', 'repairs and maintenance', 'planned maintenance'] },
  // Recruitment & HR.
  { key: 'temp_staffing', sector: 'recruitment', label: 'Temporary staffing', terms: ['temporary staff', 'agency staff', 'temporary staffing', 'agency work'] },
  { key: 'perm_recruitment', sector: 'recruitment', label: 'Permanent recruitment', terms: ['permanent recruitment', 'executive search', 'recruitment services'] },
  { key: 'health_staffing', sector: 'recruitment', label: 'Health and social care staffing', terms: ['locum', 'healthcare staffing', 'nursing agency', 'social care staffing'] },
  // Construction & Property.
  { key: 'new_build', sector: 'construction', label: 'New build', terms: ['new build', 'construction of', 'newbuild'] },
  { key: 'refurbishment', sector: 'construction', label: 'Refurbishment', terms: ['refurbishment', 'refurb', 'fit out', 'fit-out'] },
  { key: 'civils', sector: 'construction', label: 'Civil engineering', terms: ['civil engineering', 'highways', 'groundworks'] },
  { key: 'property_maint', sector: 'construction', label: 'Property maintenance', terms: ['property maintenance', 'responsive repairs', 'void works'] },
  // IT & Technology.
  { key: 'software', sector: 'it', label: 'Software and applications', terms: ['software', 'application', 'saas', 'platform'] },
  { key: 'infrastructure', sector: 'it', label: 'Infrastructure and hardware', terms: ['hardware', 'infrastructure', 'network', 'servers'] },
  { key: 'managed_it', sector: 'it', label: 'Managed IT services', terms: ['managed service', 'it support', 'service desk'] },
  { key: 'cyber', sector: 'it', label: 'Cyber security', terms: ['cyber', 'information security', 'penetration test'] },
];

const REGIONS = [
  { key: 'london', label: 'London' },
  { key: 'south_east', label: 'South East' },
  { key: 'south_west', label: 'South West' },
  { key: 'east', label: 'East of England' },
  { key: 'east_midlands', label: 'East Midlands' },
  { key: 'west_midlands', label: 'West Midlands' },
  { key: 'north_east', label: 'North East' },
  { key: 'north_west', label: 'North West' },
  { key: 'yorkshire', label: 'Yorkshire and the Humber' },
  { key: 'scotland', label: 'Scotland' },
  { key: 'wales', label: 'Wales' },
  { key: 'northern_ireland', label: 'Northern Ireland' },
  { key: 'national', label: 'National / UK-wide' },
];

const VALUE_BANDS = [
  { key: 'any', label: 'Any value', min: 0, max: null },
  { key: 'u100k', label: 'Under £100k', min: 0, max: 100000 },
  { key: '100k_500k', label: '£100k to £500k', min: 100000, max: 500000 },
  { key: '500k_1m', label: '£500k to £1m', min: 500000, max: 1000000 },
  { key: '1m_5m', label: '£1m to £5m', min: 1000000, max: 5000000 },
  { key: '5m_plus', label: '£5m and above', min: 5000000, max: null },
];

const REGION_LABEL = {};
REGIONS.forEach(function (r) { REGION_LABEL[r.key] = r.label; });
const BAND_BY_KEY = {};
VALUE_BANDS.forEach(function (b) { BAND_BY_KEY[b.key] = b; });
const TERMS_BY_SERVICE = {};
SERVICE_TYPES.forEach(function (s) { TERMS_BY_SERVICE[s.key] = s.terms; });

// Which of the six sectors a tender belongs to. Ported to match the app's
// sectorKeyOf: category first, then title/description keywords.
function sectorKeyOf(t) {
  const cat = String((t && t.category) || '').toLowerCase();
  const text = (String((t && t.title) || '') + ' ' + String((t && t.description) || '')).toLowerCase();
  if (cat === 'care' || /\b(care|health|nhs|nursing|domiciliary|supported living|safeguard)/.test(text)) return 'care';
  if (/(recruit|staffing|temporary staff|agency work|locum)/.test(text)) return 'recruitment';
  if (/(software|digital|cyber|network|hardware|\bsaas\b|\bict\b|\bit\b)/.test(text)) return 'it';
  if (/(construction|new build|refurbish|civil engineering|highways|demolition|groundwork)/.test(text)) return 'construction';
  if (/(cleaning|facilities|maintenance|catering|security|grounds|waste|janitor)/.test(text)) return 'facilities';
  return 'other';
}

// Pull a number out of the value, which is stored as a string like "£1,234,567".
function valueNumber(t) {
  const raw = (t && (t.value != null ? t.value : t.contract_value));
  if (raw == null) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return isNaN(n) ? null : n;
}

// Does a live tender match a saved alert? Missing data never excludes (region
// blank or value unknown still counts), so members are not silently starved of
// alerts on tenders that simply lack that field.
function matchTender(tender, prefs) {
  const text = (String(tender.title || '') + ' ' + String(tender.description || '')).toLowerCase();

  const sectors = Array.isArray(prefs.sectors) ? prefs.sectors : [];
  if (sectors.length) {
    if (sectors.indexOf(sectorKeyOf(tender)) === -1) return false;
  }

  const services = Array.isArray(prefs.service_types) ? prefs.service_types : [];
  if (services.length) {
    let hit = false;
    for (let i = 0; i < services.length && !hit; i++) {
      const terms = TERMS_BY_SERVICE[services[i]] || [];
      for (let j = 0; j < terms.length; j++) {
        if (text.indexOf(terms[j]) !== -1) { hit = true; break; }
      }
    }
    if (!hit) return false;
  }

  const regions = Array.isArray(prefs.regions) ? prefs.regions : [];
  const tRegion = String(tender.region || '').toLowerCase();
  if (regions.length && tRegion) {
    // National tenders always pass; otherwise the tender region must contain one
    // of the chosen region labels.
    const wantsNational = regions.indexOf('national') !== -1;
    let regionHit = wantsNational && /(national|uk-wide|nationwide)/.test(tRegion);
    for (let i = 0; i < regions.length && !regionHit; i++) {
      const lbl = String(REGION_LABEL[regions[i]] || '').toLowerCase();
      if (lbl && tRegion.indexOf(lbl) !== -1) regionHit = true;
    }
    if (!regionHit) return false;
  }

  const band = BAND_BY_KEY[prefs.value_band] || BAND_BY_KEY.any;
  if (band && band.key !== 'any') {
    const v = valueNumber(tender);
    if (v != null) {
      if (v < band.min) return false;
      if (band.max != null && v > band.max) return false;
    }
  }

  return true;
}

module.exports = {
  SECTORS, SERVICE_TYPES, REGIONS, VALUE_BANDS,
  options: function () { return { sectors: SECTORS, serviceTypes: SERVICE_TYPES, regions: REGIONS, valueBands: VALUE_BANDS }; },
  sectorKeyOf, valueNumber, matchTender,
};
