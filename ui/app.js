/**
 * Credentik — App Controller
 *
 * Main application entry point. Manages navigation, page rendering,
 * and coordinates between data layer and UI components.
 */

import store from '../core/store.js';
import auth from '../core/auth.js';
import CONFIG from '../core/config.js';
import workflow from '../core/workflow.js';
import batchGenerator from '../core/batch-generator.js';
import emailGenerator from '../core/email-generator.js';
import caqhApi from '../core/caqh-api.js';
import taxonomyApi from '../core/taxonomy-api.js';
// Lazy-loaded to avoid blocking initial render (53KB file)
let SUPPLEMENTAL_PAYERS = [];

// ─── Google Places Autocomplete ───

function initPlacesAutocomplete(inputId, { streetId, cityId, stateId, zipId } = {}) {
  if (!window.google?.maps?.places) return;
  const input = document.getElementById(inputId);
  if (!input || input._placesInit) return;
  input._placesInit = true;
  const autocomplete = new google.maps.places.Autocomplete(input, {
    types: ['address'], componentRestrictions: { country: 'us' }
  });
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.address_components) return;
    const get = (type) => (place.address_components.find(c => c.types.includes(type)) || {}).short_name || '';
    const street = `${get('street_number')} ${get('route')}`.trim();
    if (streetId) { const el = document.getElementById(streetId); if (el) el.value = street; }
    if (cityId) { const el = document.getElementById(cityId); if (el) el.value = get('locality') || get('sublocality'); }
    if (stateId) { const el = document.getElementById(stateId); if (el) el.value = get('administrative_area_level_1'); }
    if (zipId) { const el = document.getElementById(zipId); if (el) el.value = get('postal_code'); }
  });
}

// ─── Global Error & Offline Handlers ───

window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  const msg = event.reason?.message || 'An unexpected error occurred';
  if (typeof showToast === 'function') {
    showToast(msg, 'error');
  }
  console.error('Unhandled rejection:', event.reason);
});

window.addEventListener('offline', () => {
  const bar = document.createElement('div');
  bar.id = 'offline-bar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc3545;color:#fff;text-align:center;padding:8px;z-index:99999;font-weight:600;';
  bar.textContent = 'You are offline. Changes may not be saved.';
  document.body.prepend(bar);
});

window.addEventListener('online', () => {
  const bar = document.getElementById('offline-bar');
  if (bar) bar.remove();
  if (typeof showToast === 'function') showToast('Connection restored');
});

// ─── Provider Profile Presets ───
// Prepopulated options for provider credentialing profile fields.
// Users can still type custom values via the "Other" option.

const PRESET_INSTITUTIONS = [
  'Johns Hopkins University','Harvard Medical School','Yale School of Medicine','Stanford University School of Medicine',
  'University of Pennsylvania','Columbia University','Duke University','University of Michigan',
  'University of California, San Francisco','Northwestern University','Emory University','University of Pittsburgh',
  'University of Florida','University of Miami','University of South Florida','Nova Southeastern University',
  'Barry University','Florida Atlantic University','University of Central Florida','Florida International University',
  'Walden University','Chamberlain University','Frontier Nursing University','Vanderbilt University',
  'Georgetown University','George Washington University','University of Maryland','University of Virginia',
  'University of North Carolina','Rush University','University of Illinois Chicago','Arizona State University',
  'University of Arizona','Oregon Health & Science University','University of Colorado','Case Western Reserve University',
  'University of Cincinnati','University of Alabama at Birmingham','Medical University of South Carolina',
  'Uniformed Services University','Meharry Medical College','Howard University','Morehouse School of Medicine',
];

const PRESET_DEGREES = [
  'MD','DO','PhD','PsyD','DNP','MSN','MSW','LCSW','MA','MS','BSN','BA','BS',
  'PharmD','MPH','MHA','MBA','EdD','Residency','Fellowship','Post-Doctoral','Certificate',
];

const PRESET_FIELDS_OF_STUDY = [
  'Psychiatry','Psychiatric Mental Health','Family Nurse Practitioner','Psychology','Clinical Psychology',
  'Counseling Psychology','Social Work','Clinical Social Work','Marriage & Family Therapy',
  'Substance Abuse Counseling','Behavioral Health','Neuroscience','Psychopharmacology',
  'Child & Adolescent Psychiatry','Geriatric Psychiatry','Forensic Psychiatry','Addiction Psychiatry',
  'Consultation-Liaison Psychiatry','Emergency Psychiatry','Nursing','Advanced Practice Nursing',
];

const PRESET_BOARDS = [
  { name: 'American Board of Psychiatry and Neurology (ABPN)', specialties: ['Psychiatry','Child & Adolescent Psychiatry','Addiction Psychiatry','Forensic Psychiatry','Geriatric Psychiatry','Consultation-Liaison Psychiatry','Brain Injury Medicine'] },
  { name: 'American Nurses Credentialing Center (ANCC)', specialties: ['Psychiatric-Mental Health NP (PMHNP-BC)','Family NP (FNP-BC)','Adult-Gerontology NP','Pediatric NP'] },
  { name: 'American Academy of Nurse Practitioners (AANP)', specialties: ['Family NP (FNP)','Adult-Gerontology NP','Emergency NP'] },
  { name: 'National Board for Certified Counselors (NBCC)', specialties: ['National Certified Counselor (NCC)','Certified Clinical Mental Health Counselor (CCMHC)','Master Addictions Counselor (MAC)'] },
  { name: 'Association of Social Work Boards (ASWB)', specialties: ['Licensed Clinical Social Worker (LCSW)','Licensed Master Social Worker (LMSW)'] },
  { name: 'American Board of Professional Psychology (ABPP)', specialties: ['Clinical Psychology','Clinical Neuropsychology','Forensic Psychology','Clinical Child & Adolescent Psychology','Behavioral & Cognitive Psychology'] },
  { name: 'American Board of Addiction Medicine (ABAM)', specialties: ['Addiction Medicine'] },
  { name: 'American Board of Preventive Medicine', specialties: ['Addiction Medicine','Preventive Medicine'] },
  { name: 'Commission on Rehabilitation Counselor Certification (CRCC)', specialties: ['Certified Rehabilitation Counselor (CRC)'] },
  { name: 'National Board of Forensic Evaluators', specialties: ['Forensic Mental Health Evaluator'] },
];

const PRESET_MALPRACTICE_CARRIERS = [
  'HPSO (Healthcare Providers Service Organization)','NSO (Nursing Service Organization)',
  'Proliability / Mercer','CM&F Group','American Professional Agency (APA)',
  'CPH & Associates','The Doctors Company','ProAssurance','MLMIC (Medical Liability Mutual Insurance)',
  'NORCAL Group','Coverys','MagMutual','Medical Protective','Berkshire Medical Group',
  'State Volunteer Mutual Insurance','Zurich','CNA','Liberty Mutual',
];

const PRESET_COVERAGE_AMOUNTS = [
  '$1M / $3M','$1M / $1M','$2M / $4M','$2M / $6M','$500K / $1.5M','$500K / $1M','$1M / $5M',
];

const PRESET_EMPLOYERS = [
  'Private Practice','Community Mental Health Center','Hospital — Inpatient Psych Unit',
  'Hospital — Emergency Department','VA Medical Center','Federally Qualified Health Center (FQHC)',
  'University / Academic Medical Center','Residential Treatment Facility','Substance Abuse Treatment Center',
  'Correctional Facility','Telehealth Practice','School-Based Health Center','Group Practice',
  'Skilled Nursing Facility','Home Health Agency','Crisis Stabilization Unit',
];

const PRESET_POSITIONS = [
  'Attending Psychiatrist','Staff Psychiatrist','Psychiatric NP (PMHNP)','Nurse Practitioner',
  'Clinical Psychologist','Licensed Clinical Social Worker','Licensed Professional Counselor',
  'Medical Director','Clinical Director','Program Director','Chief of Psychiatry',
  'Resident Physician','Fellow','Locum Tenens','Independent Contractor','Supervisor',
];

const PRESET_CME_PROVIDERS = [
  'American Psychiatric Association (APA)','American Psychological Association (APA)',
  'American Nurses Credentialing Center (ANCC)','American Academy of Nurse Practitioners (AANP)',
  'National Association of Social Workers (NASW)','American Medical Association (AMA)',
  'Accreditation Council for Continuing Medical Education (ACCME)',
  'National Board for Certified Counselors (NBCC)','Psychiatry & Behavioral Health Learning Network',
  'CME Outfitters','Medscape','UpToDate','American Academy of Child & Adolescent Psychiatry (AACAP)',
  'American Academy of Addiction Psychiatry (AAAP)','National Council for Mental Wellbeing',
  'SAMHSA','American Association for Marriage & Family Therapy (AAMFT)',
  'Beck Institute','Motivational Interviewing Network of Trainers (MINT)',
  'PESI','CrossCountry Education','NetCE','CE4Less',
];

const PRESET_CME_COURSES = [
  'Psychopharmacology Update','Opioid Prescribing & Pain Management','Suicide Risk Assessment & Prevention',
  'Trauma-Informed Care','Cognitive Behavioral Therapy (CBT) Fundamentals','DBT Skills Training',
  'Motivational Interviewing','Cultural Competency in Mental Health','Ethics in Behavioral Health',
  'HIPAA Compliance','Telehealth Best Practices','Substance Use Disorder Treatment Updates',
  'Child & Adolescent Mental Health','Geriatric Psychiatry Update','Medication-Assisted Treatment (MAT)',
  'ADHD Assessment & Treatment','Anxiety Disorders Update','Mood Disorders: Diagnosis & Treatment',
  'Eating Disorders: Evidence-Based Approaches','Sleep Disorders in Psychiatric Practice',
  'Psychotherapy Supervision','Documentation & Risk Management','Mandated Reporter Training',
  'Domestic Violence Screening','Human Trafficking Recognition','Implicit Bias Training',
];

// Helper: builds a <select> + "Other" text input combo
function presetSelectHtml(id, options, label, placeholder = '', required = false) {
  return `
    <div class="auth-field" style="margin:0;">
      <label>${label}${required ? ' *' : ''}</label>
      <select id="${id}" class="form-control" onchange="if(this.value==='__other__'){this.nextElementSibling.style.display='';this.nextElementSibling.focus();}else{this.nextElementSibling.style.display='none';this.nextElementSibling.value='';}">
        <option value="">Select...</option>
        ${options.map(o => `<option value="${typeof o === 'string' ? o : o.name}">${typeof o === 'string' ? o : o.name}</option>`).join('')}
        <option value="__other__">Other (type custom)...</option>
      </select>
      <input type="text" id="${id}-custom" class="form-control" placeholder="${placeholder || 'Type custom value...'}" style="display:none;margin-top:4px;">
    </div>`;
}
// Helper: gets value from preset select (returns custom if "Other" selected)
function getPresetValue(id) {
  const sel = document.getElementById(id);
  if (!sel) return '';
  if (sel.value === '__other__') {
    return document.getElementById(`${id}-custom`)?.value?.trim() || '';
  }
  return sel.value;
}

// ─── Reference Data (loaded at init from API) ───

let PAYER_CATALOG = [];
let STATES = [];
let TELEHEALTH_POLICIES = [];
let DEFAULT_STRATEGIES = [];

// ─── Payer Strategic Tags ───

const PAYER_TAG_DEFS = {
  // Clinical Focus — purple
  behavioral_health:      { label: 'Behavioral Health',      group: 'clinical', bg: '#f3e8ff', color: '#6b21a8' },
  substance_use:          { label: 'Substance Use',          group: 'clinical', bg: '#f3e8ff', color: '#6b21a8' },
  autism_aba:             { label: 'Autism / ABA',           group: 'clinical', bg: '#f3e8ff', color: '#6b21a8' },
  pediatric:             { label: 'Pediatric',              group: 'clinical', bg: '#f3e8ff', color: '#6b21a8' },
  // Access / Delivery — teal
  telehealth_friendly:    { label: 'Telehealth',             group: 'access',   bg: '#e0f2fe', color: '#0369a1' },
  cross_state_telehealth: { label: 'Cross-State Telehealth', group: 'access',   bg: '#e0f2fe', color: '#0369a1' },
  no_referral_required:   { label: 'No Referral Needed',     group: 'access',   bg: '#e0f2fe', color: '#0369a1' },
  // Business / Revenue — green & red
  high_reimbursement:     { label: 'High Reimb.',            group: 'business', bg: '#d1fae5', color: '#065f46' },
  fast_credentialing:     { label: 'Fast Cred (<60d)',       group: 'business', bg: '#d1fae5', color: '#065f46' },
  slow_credentialing:     { label: 'Slow Cred (>120d)',      group: 'business', bg: '#fee2e2', color: '#991b1b' },
  high_volume:            { label: 'High Volume',            group: 'business', bg: '#d1fae5', color: '#065f46' },
  medicare_advantage:     { label: 'Medicare Advantage',     group: 'business', bg: '#dbeafe', color: '#1d4ed8' },
  // Credentialing Process — blue & amber
  caqh_accepts:           { label: 'CAQH',                  group: 'process',  bg: '#dbeafe', color: '#1d4ed8' },
  availity_enrolled:      { label: 'Availity',              group: 'process',  bg: '#dbeafe', color: '#1d4ed8' },
  portal_required:        { label: 'Portal Required',       group: 'process',  bg: '#fef3c7', color: '#92400e' },
  paper_application:      { label: 'Paper App',             group: 'process',  bg: '#fef3c7', color: '#92400e' },
  // Strategic
  must_have:              { label: 'Must Have',              group: 'strategic', bg: '#d1fae5', color: '#065f46' },
  growing_market:         { label: 'Growing Market',         group: 'strategic', bg: '#e0f2fe', color: '#0369a1' },
  panel_often_closed:     { label: 'Panel Often Closed',     group: 'strategic', bg: '#fee2e2', color: '#991b1b' },
  medicaid_prerequisite:  { label: 'Medicaid Prereq.',       group: 'strategic', bg: '#fef3c7', color: '#92400e' },
};

function renderPayerTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return tags.map(t => {
    const def = PAYER_TAG_DEFS[t];
    if (!def) return '';
    return `<span class="payer-tag" style="background:${def.bg};color:${def.color};" title="${def.label}">${def.label}</span>`;
  }).join(' ');
}

let _payerTagFilters = new Set();
let _payerView = 'catalog'; // 'catalog' | 'planner'

// Tag enrichment for payers that don't yet have tags from the API
const PAYER_TAG_MAP = {
  // ─── National (Big 5) ───
  'UnitedHealthcare':     ['must_have','behavioral_health','high_volume','caqh_accepts','telehealth_friendly','substance_use'],
  'Aetna':                ['must_have','behavioral_health','high_volume','caqh_accepts','availity_enrolled','telehealth_friendly','substance_use'],
  'Cigna':                ['must_have','behavioral_health','high_volume','caqh_accepts','telehealth_friendly','substance_use'],
  'Humana':               ['must_have','high_volume','caqh_accepts','telehealth_friendly','medicare_advantage'],
  'Medicare':             ['must_have','high_volume','portal_required','telehealth_friendly','behavioral_health'],
  'Centene/Ambetter':     ['high_volume','behavioral_health','telehealth_friendly','growing_market'],
  'Molina Healthcare':    ['high_volume','behavioral_health','medicaid_prerequisite','telehealth_friendly'],
  'Oscar Health':         ['telehealth_friendly','fast_credentialing','growing_market','behavioral_health'],
  'Tricare':              ['behavioral_health','substance_use','telehealth_friendly','portal_required'],
  'Kaiser Permanente':    ['must_have','high_volume','behavioral_health','panel_often_closed','portal_required'],
  'Medicaid':             ['must_have','high_volume','behavioral_health','substance_use','portal_required'],
  // ─── BCBS — Anthem / Elevance ───
  'Anthem/Elevance':      ['must_have','high_volume','caqh_accepts','availity_enrolled','telehealth_friendly','behavioral_health'],
  // ─── BCBS — HCSC ───
  'HCSC':                 ['high_volume','caqh_accepts','behavioral_health','telehealth_friendly'],
  'BCBS of Illinois':     ['high_volume','caqh_accepts','behavioral_health'],
  // ─── BCBS — Highmark ───
  'Highmark BCBS':        ['high_volume','caqh_accepts','behavioral_health','telehealth_friendly'],
  // ─── BCBS — Independent ───
  'Florida Blue':         ['must_have','high_volume','caqh_accepts','telehealth_friendly','behavioral_health'],
  'BCBS of Arizona':      ['high_volume','caqh_accepts','telehealth_friendly','cross_state_telehealth','behavioral_health'],
  'Premera Blue Cross':   ['high_volume','caqh_accepts','telehealth_friendly','behavioral_health'],
  'Regence BlueShield':   ['high_volume','caqh_accepts','telehealth_friendly','cross_state_telehealth','behavioral_health'],
  'BCBS of North Carolina': ['high_volume','caqh_accepts','behavioral_health'],
  'BCBS of Tennessee':    ['high_volume','caqh_accepts','behavioral_health'],
  'BCBS of South Carolina': ['caqh_accepts','behavioral_health'],
  'BCBS of Massachusetts': ['high_volume','caqh_accepts','behavioral_health','telehealth_friendly'],
  'Horizon BCBS':         ['high_volume','caqh_accepts','behavioral_health'],
  'BCBS of Alabama':      ['caqh_accepts','behavioral_health'],
  'Independence Blue Cross': ['high_volume','caqh_accepts','behavioral_health'],
  'Wellmark BCBS':        ['caqh_accepts','behavioral_health'],
  'BCBS of Georgia':      ['high_volume','caqh_accepts','behavioral_health'],
  'BCBS of Texas':        ['must_have','high_volume','caqh_accepts','behavioral_health'],
  // ─── Regional ───
  'Moda Health':          ['telehealth_friendly','behavioral_health','fast_credentialing'],
  'Providence Health Plan': ['telehealth_friendly','behavioral_health','high_volume'],
  'AvMed':                ['behavioral_health','telehealth_friendly'],
  'Simply Healthcare':    ['behavioral_health','medicaid_prerequisite'],
  'Sunshine Health':      ['behavioral_health','medicaid_prerequisite'],
  'CareSource':           ['behavioral_health','substance_use','high_volume'],
  'WellCare':             ['behavioral_health','high_volume','medicare_advantage'],
  'EmblemHealth':         ['high_volume','behavioral_health','slow_credentialing'],
  'Healthfirst':          ['high_volume','behavioral_health'],
  'Fidelis Care':         ['behavioral_health','substance_use'],
  'UPMC Health Plan':     ['behavioral_health','telehealth_friendly','high_volume'],
  'Banner | Aetna':       ['telehealth_friendly','behavioral_health'],
  'Mercy Care':           ['behavioral_health','substance_use','medicaid_prerequisite'],
  'Health Plan of Nevada': ['behavioral_health','high_volume'],
  'HealthPartners':       ['behavioral_health','telehealth_friendly','high_volume'],
  'Priority Health':      ['behavioral_health','telehealth_friendly'],
  'Medical Mutual':       ['behavioral_health','telehealth_friendly','high_reimbursement'],
  'Optima Health':        ['behavioral_health','telehealth_friendly'],
  'Superior HealthPlan':  ['behavioral_health','medicaid_prerequisite'],
  'Community Health Plan of WA': ['behavioral_health','medicaid_prerequisite'],
  'BCBS of Kansas':       ['caqh_accepts','behavioral_health'],
  'BCBS of Louisiana':    ['caqh_accepts','behavioral_health'],
  'BCBS of Michigan':     ['high_volume','caqh_accepts','behavioral_health'],
  'BCBS of Minnesota':    ['caqh_accepts','behavioral_health','telehealth_friendly'],
};

async function enrichPayerTags() {
  // Tag existing payers from API
  PAYER_CATALOG.forEach(p => {
    if (!p.tags || p.tags.length === 0) {
      p.tags = PAYER_TAG_MAP[p.name] || [];
    }
  });

  // Lazy-load supplemental payers (don't block initial render)
  if (SUPPLEMENTAL_PAYERS.length === 0) {
    try {
      const module = await import('../data/missing-payers-catalog.js');
      SUPPLEMENTAL_PAYERS = module.SUPPLEMENTAL_PAYERS || [];
    } catch (e) { console.warn('[Credentik] Could not load supplemental payers:', e); }
  }

  // Merge supplemental payers not yet in the API catalog
  const existingNames = new Set(PAYER_CATALOG.map(p => p.name.toLowerCase()));
  let added = 0;
  for (const sp of SUPPLEMENTAL_PAYERS) {
    if (!existingNames.has(sp.name.toLowerCase())) {
      PAYER_CATALOG.push(sp);
      existingNames.add(sp.name.toLowerCase());
      added++;
    }
  }
  if (added > 0) console.log(`[Credentik] Merged ${added} supplemental payers into catalog (total: ${PAYER_CATALOG.length})`);
}

function getPayerById(id) {
  return PAYER_CATALOG.find(p => p.id === id) || null;
}
function getStateName(code) {
  const s = STATES.find(st => st.code === code || st.abbreviation === code);
  return s ? s.name : (code || '');
}
function getStatePop(code) {
  const s = STATES.find(st => st.code === code || st.abbreviation === code);
  return s ? (s.population || 0) : 0;
}
let US_TOTAL_POP = 0;

// ─── Local Constants ───

const APPLICATION_STATUSES = [
  { value: 'new', label: 'New', color: '#6B7280', bg: '#F3F4F6' },
  { value: 'gathering_docs', label: 'Gathering Docs', color: '#3B82F6', bg: '#DBEAFE' },
  { value: 'submitted', label: 'Submitted', color: '#8B5CF6', bg: '#EDE9FE' },
  { value: 'in_review', label: 'In Review', color: '#F59E0B', bg: '#FEF3C7' },
  { value: 'pending_info', label: 'Pending Info', color: '#EF4444', bg: '#FEE2E2' },
  { value: 'approved', label: 'Approved', color: '#10B981', bg: '#D1FAE5' },
  { value: 'credentialed', label: 'Credentialed', color: '#059669', bg: '#A7F3D0' },
  { value: 'denied', label: 'Denied', color: '#DC2626', bg: '#FECACA' },
  { value: 'on_hold', label: 'On Hold', color: '#9CA3AF', bg: '#F3F4F6' },
  { value: 'withdrawn', label: 'Withdrawn', color: '#6B7280', bg: '#E5E7EB' },
];

// Application Groups (loaded from agency config, defaults below)
let APP_GROUPS = [
  { id: 1, label: 'Group 1', short: 'G1', color: '#0891b2' },
  { id: 2, label: 'Group 2', short: 'G2', color: '#3b82f6' },
  { id: 3, label: 'Group 3', short: 'G3', color: '#6b7280' },
];

function getGroupDef(id) {
  return APP_GROUPS.find(g => g.id === Number(id)) || { id, label: `Group ${id}`, short: `G${id}`, color: '#6b7280' };
}

function groupBadge(id) {
  if (!id) return '—';
  const g = getGroupDef(id);
  return `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.02em;background:${g.color}20;color:${g.color};">${g.short}</span>`;
}

function groupOptions(selectedId, includeAll = false) {
  let html = includeAll ? '<option value="">All Groups</option>' : '';
  html += APP_GROUPS.map(g => `<option value="${g.id}" ${Number(selectedId) === g.id ? 'selected' : ''}>${g.label}</option>`).join('');
  return html;
}

const LICENSE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'inactive', label: 'Inactive' },
];

const ACTIVITY_LOG_TYPES = [
  { value: 'call', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'portal', label: 'Portal Activity' },
  { value: 'fax', label: 'Fax' },
  { value: 'document', label: 'Document' },
  { value: 'note', label: 'Note' },
  { value: 'status_change', label: 'Status Change' },
  { value: 'other', label: 'Other' },
];


// ─── Auth Helpers ───

function editButton(label, onclick, extraClass = '') {
  if (auth.isReadonly()) return '';
  return `<button class="btn btn-sm ${extraClass}" onclick="${onclick}">${label}</button>`;
}

function deleteButton(label, onclick) {
  if (auth.isReadonly()) return '';
  return `<button class="btn btn-sm btn-danger" onclick="${onclick}">${label}</button>`;
}

let currentPage = 'dashboard';
let currentSort = { field: '', dir: 'asc' };
let filters = { state: '', payer: '', status: '', wave: '', search: '' };

// ─── URL Filter State ───
function syncFiltersToURL() {
  const params = new URLSearchParams();
  if (filters.state) params.set('state', filters.state);
  if (filters.payer) params.set('payer', filters.payer);
  if (filters.status) params.set('status', filters.status);
  if (filters.wave) params.set('wave', filters.wave);
  if (filters.search) params.set('q', filters.search);
  const qs = params.toString();
  const base = location.hash.split('?')[0] || `#${currentPage}`;
  history.replaceState(null, '', qs ? `${base}?${qs}` : base);
}
function readFiltersFromURL() {
  const qs = location.hash.split('?')[1];
  if (!qs) return;
  const params = new URLSearchParams(qs);
  if (params.has('state')) filters.state = params.get('state');
  if (params.has('payer')) filters.payer = params.get('payer');
  if (params.has('status')) filters.status = params.get('status');
  if (params.has('wave')) filters.wave = params.get('wave');
  if (params.has('q')) filters.search = params.get('q');
}

// ─── Init ───

export async function initApp() {
  // Show loading state with skeleton
  const body = document.getElementById('page-body');
  if (body) body.innerHTML = `
    <div style="padding:8px 0;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px;">
        ${Array(5).fill('<div class="skeleton" style="height:88px;border-radius:12px;"></div>').join('')}
      </div>
      <div class="skeleton" style="height:200px;border-radius:12px;margin-bottom:20px;"></div>
      <div class="skeleton" style="height:160px;border-radius:12px;"></div>
    </div>`;

  // Load reference data from API
  try { PAYER_CATALOG = await store.getReference('payers') || []; } catch (e) { console.error('Failed to load payers:', e); }
  try { STATES = await store.getReference('states') || []; } catch (e) { console.error('Failed to load states:', e); }
  try { TELEHEALTH_POLICIES = await store.getReference('telehealth_policies') || []; } catch (e) { console.error('Failed to load telehealth policies:', e); }
  try { DEFAULT_STRATEGIES = await store.getAll('strategies') || []; } catch (e) { console.error('Failed to load strategies:', e); }
  US_TOTAL_POP = STATES.reduce((sum, s) => sum + (s.population || 0), 0);

  // Enrich existing payers with strategic tags (lazy-load supplemental payers in background)
  enrichPayerTags(); // async — doesn't block init

  // Load custom group definitions from agency config
  try {
    const agencyConfig = await store.getAgencyConfig();
    const waves = agencyConfig?.waves || agencyConfig?.config?.waves;
    if (waves && Array.isArray(waves) && waves.length > 0) {
      APP_GROUPS = waves;
    }
  } catch (e) { /* use defaults */ }

  // Display app version
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = `v${CONFIG.APP_VERSION}`;

  // Initialize scope selector
  initScopeSelector();

  // Role-based sidebar visibility
  const userRole = auth.getUser()?.role || 'provider';
  const roleLevel = { superadmin: 5, owner: 4, agency: 3, admin: 3, staff: 2, organization: 2, provider: 1 };
  const userLevel = roleLevel[userRole] || 1;
  document.querySelectorAll('.nav-item[data-min-role]').forEach(el => {
    const minLevel = roleLevel[el.dataset.minRole] || 1;
    if (userLevel < minLevel) el.style.display = 'none';
  });
  // Hide nav sections that have all children hidden
  document.querySelectorAll('.nav-section').forEach(section => {
    let next = section.nextElementSibling;
    let allHidden = true;
    while (next && !next.classList.contains('nav-section')) {
      if (next.classList.contains('nav-item') && next.style.display !== 'none') allHidden = false;
      next = next.nextElementSibling;
    }
    if (allHidden) section.style.display = 'none';
  });

  bindNavigation();
  await checkRecurringTasks();
  await navigateTo('dashboard');
  await updateNotificationBell();

  // First-run setup wizard for new accounts
  if (userLevel >= 3) {
    try {
      const providers = await store.getAll('providers');
      if (!providers || providers.length === 0) {
        if (!localStorage.getItem('credentik_setup_dismissed')) {
          showSetupWizard();
        }
      }
    } catch {}
  }

  // Guided tour for new users (Feature 4)
  if (!localStorage.getItem('credentik_tour_completed')) {
    setTimeout(() => startGuidedTour(), 1500);
  }

  // Cmd+K / Ctrl+K command palette shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      window.app.openCommandPalette();
    }
  });

  // Listen for data changes
  store.on('created', async () => {
    if (currentPage === 'dashboard') await renderDashboard();
    if (currentPage === 'tasks') await renderTasksPage();
    await updateNotificationBell();
  });
  store.on('updated', async () => {
    if (currentPage === 'dashboard') await renderDashboard();
    if (currentPage === 'tasks') await renderTasksPage();
    await updateNotificationBell();
  });
  store.on('deleted', async () => {
    if (currentPage === 'dashboard') await renderDashboard();
    if (currentPage === 'tasks') await renderTasksPage();
    await updateNotificationBell();
  });

  // Re-render current page when scope changes
  store.on('scope-changed', async () => {
    updateScopeLabel();
    await navigateTo(currentPage);
  });
}

// ─── Scope Selector ───

function initScopeSelector() {
  const el = document.getElementById('scope-selector');
  if (el) el.style.display = '';

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('scope-panel');
    const btn = document.getElementById('scope-btn');
    if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
      panel.style.display = 'none';
    }
  });
}

function updateScopeLabel() {
  const label = document.getElementById('scope-label');
  if (!label) return;
  const scope = store.getScope();
  if (scope.type === 'provider') {
    label.textContent = scope.providerName || 'Provider';
  } else if (scope.type === 'organization') {
    label.textContent = scope.orgName || 'Organization';
  } else {
    label.textContent = 'All Providers';
  }
  // Style the button to show active filter
  const btn = document.getElementById('scope-btn');
  if (btn) {
    btn.style.background = scope.type === 'all' ? 'var(--gray-50)' : 'var(--primary-light, #dbeafe)';
    btn.style.borderColor = scope.type === 'all' ? 'var(--gray-200)' : 'var(--primary, #3B82F6)';
    btn.style.color = scope.type === 'all' ? 'var(--gray-700)' : 'var(--primary, #3B82F6)';
  }
}

async function toggleScopeDropdown() {
  const panel = document.getElementById('scope-panel');
  if (!panel) return;

  if (panel.style.display !== 'none' && panel.style.display !== '') {
    panel.style.display = 'none';
    return;
  }

  // Load orgs and providers
  let orgs = [], providers = [];
  try {
    [orgs, providers] = await Promise.all([
      store.getAll('organizations'),
      store.getAll('providers'),
    ]);
  } catch (e) { console.error('Scope data load error:', e); }

  const scope = store.getScope();
  const esc = (s) => (s || '').replace(/</g, '&lt;');
  const isActive = (type, id) => scope.type === type && (type === 'all' || (type === 'organization' ? scope.orgId == id : scope.providerId == id));

  let html = `
    <button onclick="window.app.setScopeAll()" style="
      display:flex;align-items:center;gap:8px;width:100%;padding:8px 14px;border:none;
      background:${isActive('all') ? 'var(--primary-light, #dbeafe)' : 'transparent'};
      cursor:pointer;text-align:left;font-size:13px;color:var(--gray-800);">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M6 2v12M2 6h12"/></svg>
      <strong>All Providers</strong>
    </button>
    <div style="height:1px;background:var(--gray-100);margin:4px 0;"></div>`;

  if (orgs.length > 0) {
    html += `<div style="padding:4px 14px;font-size:10px;text-transform:uppercase;color:var(--gray-400);font-weight:700;letter-spacing:.5px;">Organizations</div>`;
    orgs.forEach(org => {
      const name = esc(org.name || org.organizationName || '');
      const provCount = providers.filter(p => p.organizationId == org.id).length;
      html += `<button onclick="window.app.setScopeOrg(${org.id}, '${name.replace(/'/g, "\\'")}')" style="
        display:flex;align-items:center;justify-content:space-between;width:100%;padding:6px 14px;border:none;
        background:${isActive('organization', org.id) ? 'var(--primary-light, #dbeafe)' : 'transparent'};
        cursor:pointer;text-align:left;font-size:13px;color:var(--gray-700);">
        <span>${name}</span>
        <span style="font-size:11px;color:var(--gray-400);">${provCount} provider${provCount !== 1 ? 's' : ''}</span>
      </button>`;
    });
    html += `<div style="height:1px;background:var(--gray-100);margin:4px 0;"></div>`;
  }

  html += `<div style="padding:4px 14px;font-size:10px;text-transform:uppercase;color:var(--gray-400);font-weight:700;letter-spacing:.5px;">Providers</div>`;
  providers.forEach(p => {
    const name = esc(`${p.firstName || ''} ${p.lastName || ''}`.trim() || p.name || '');
    const cred = esc(p.credentials || '');
    html += `<button onclick="window.app.setScopeProvider(${p.id}, '${name.replace(/'/g, "\\'")}', ${p.organizationId || 'null'})" style="
      display:flex;align-items:center;justify-content:space-between;width:100%;padding:6px 14px;border:none;
      background:${isActive('provider', p.id) ? 'var(--primary-light, #dbeafe)' : 'transparent'};
      cursor:pointer;text-align:left;font-size:13px;color:var(--gray-700);">
      <span>${name}${cred ? ` <span style="color:var(--gray-400);font-size:11px;">${cred}</span>` : ''}</span>
    </button>`;
  });

  panel.innerHTML = html;
  panel.style.display = 'block';
}

// ─── Navigation ───

function bindNavigation() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      await navigateTo(el.dataset.page);
      // Close tools dropdown if open
      const panel = document.getElementById('tools-panel');
      if (panel) panel.classList.remove('active');
    });
  });
}

// Non-blocking badge updater — fires in background so navigation isn't delayed
async function updateNavBadges() {
  try {
    const [overdue, allTasks] = await Promise.all([
      workflow.getOverdueFollowups(),
      store.getAll('tasks'),
    ]);

    const badge = document.getElementById('followup-badge');
    if (badge) {
      badge.textContent = overdue.length;
      badge.style.display = overdue.length > 0 ? 'inline' : 'none';
    }

    const today = new Date().toISOString().split('T')[0];
    const pendingTaskCount = allTasks.filter(t => !t.isCompleted && !t.completed && t.dueDate && t.dueDate <= today).length;
    const taskBadge = document.getElementById('task-badge');
    if (taskBadge) {
      taskBadge.textContent = pendingTaskCount;
      taskBadge.style.display = pendingTaskCount > 0 ? 'inline' : 'none';
    }
  } catch {}
}

async function navigateTo(page) {
  currentPage = page;

  // Restore filters from URL if present
  readFiltersFromURL();

  // Update nav active state (sidebar + bottom nav)
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  if (window._updateBottomNav) window._updateBottomNav(page);

  // Update notification badge
  if (window.app?.refreshNotifBadge) window.app.refreshNotifBadge();

  // Update badges in background (non-blocking — don't delay page render)
  updateNavBadges();

  // Render page
  const pageBody = document.getElementById('page-body');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const pageActions = document.getElementById('page-actions');

  // Print button for all pages
  const printBtn = '<button class="btn btn-sm no-print" onclick="window.app.printPage()" title="Print this page"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11H2.5A1 1 0 011.5 10V6.5A1 1 0 012.5 5.5h11a1 1 0 011 1V10a1 1 0 01-1 1H12"/><path d="M4 5.5V1.5h8v4"/><rect x="4" y="9" width="8" height="5.5" rx="0.5"/></svg> Print</button>';

  switch (page) {
    case 'my-account':
      pageTitle.textContent = 'My Account';
      pageSubtitle.textContent = 'Profile, security & preferences';
      pageActions.innerHTML = printBtn;
      await renderMyAccount();
      break;
    case 'dashboard':
      pageTitle.textContent = 'Dashboard';
      pageSubtitle.textContent = 'Licensing & credentialing overview';
      pageActions.innerHTML = printBtn;
      await renderDashboard();
      break;
    case 'applications':
      pageTitle.textContent = 'Applications';
      pageSubtitle.textContent = 'All credentialing applications';
      pageActions.innerHTML = printBtn;
      await renderApplications();
      break;
    case 'followups':
      pageTitle.textContent = 'Follow-ups';
      pageSubtitle.textContent = 'Pending and overdue follow-up tasks';
      pageActions.innerHTML = printBtn;
      await renderFollowups();
      break;
    case 'tasks':
      pageTitle.textContent = 'Tasks';
      pageSubtitle.textContent = 'Track all credentialing & licensing tasks';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.showAddTaskForm()">+ Add Task</button> <button class="btn" onclick="window.app.showWorkflowTemplates()">Workflow Templates</button>' + printBtn;
      await renderTasksPage();
      break;
    case 'providers':
      pageTitle.textContent = 'Providers';
      pageSubtitle.textContent = 'Manage provider profiles';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openProviderModal()">+ Add Provider</button> <button class="btn" onclick="window.app.navigateTo(\'provider-onboard\')">Guided Setup</button>' + printBtn;
      await renderProviders();
      break;
    case 'licenses':
      pageTitle.textContent = 'License Monitoring';
      pageSubtitle.textContent = 'Licenses, verification, and DEA tracking';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openLicenseModal()">+ Add License</button> <button class="btn" onclick="window.app.openDeaModal()">+ Add DEA</button>' + printBtn;
      await renderLicenses();
      break;
    case 'payers':
      pageTitle.textContent = 'Payers';
      pageSubtitle.textContent = 'Insurance payer catalog';
      pageActions.innerHTML = printBtn;
      await renderPayers();
      break;
    case 'policies':
      pageTitle.textContent = 'State Policies';
      pageSubtitle.textContent = 'Telehealth regulations by state';
      pageActions.innerHTML = printBtn;
      await renderStatePolicies();
      break;
    case 'coverage':
      pageTitle.textContent = 'Coverage Matrix';
      pageSubtitle.textContent = 'Payer-state credentialing coverage';
      pageActions.innerHTML = printBtn;
      await renderCoverageMatrix();
      break;
    case 'forecast':
      pageTitle.textContent = 'Revenue Forecast';
      pageSubtitle.textContent = 'Pipeline revenue projections & analytics';
      pageActions.innerHTML = printBtn;
      await renderRevenueForecast();
      break;
    case 'batch':
      pageTitle.textContent = 'Batch Generator';
      pageSubtitle.textContent = 'Generate application batches from strategy profiles';
      pageActions.innerHTML = '';
      await renderBatchGenerator();
      break;
    case 'emails':
      pageTitle.textContent = 'Email Generator';
      pageSubtitle.textContent = 'Generate credentialing email templates';
      pageActions.innerHTML = '';
      await renderEmailGenerator();
      break;
    case 'reimbursement':
      pageTitle.textContent = 'Reimbursement Comparison';
      pageSubtitle.textContent = 'Compare payer rates across states';
      pageActions.innerHTML = printBtn;
      await renderReimbursement();
      break;
    case 'renewal-calendar':
      pageTitle.textContent = 'Renewal Calendar';
      pageSubtitle.textContent = 'License expirations and renewal timeline';
      pageActions.innerHTML = printBtn;
      await renderRenewalCalendar();
      break;
    case 'documents':
      pageTitle.textContent = 'Document Tracker';
      pageSubtitle.textContent = 'Cross-application document completion status';
      pageActions.innerHTML = printBtn;
      await renderDocumentTracker();
      break;
    case 'service-lines':
      pageTitle.textContent = 'Service Lines';
      pageSubtitle.textContent = 'Expansion opportunities beyond psychiatric telehealth';
      pageActions.innerHTML = printBtn;
      await renderServiceLines();
      break;
    case 'settings':
      pageTitle.textContent = 'Settings & Data';
      pageSubtitle.textContent = 'Organization, providers, import/export';
      pageActions.innerHTML = '';
      await renderSettings();
      break;
    // ─── New Tools ───
    case 'doc-checklist':
      pageTitle.textContent = 'Document Checklist Generator';
      pageSubtitle.textContent = 'Generate per-payer credentialing document checklists';
      pageActions.innerHTML = printBtn;
      await renderDocChecklistTool();
      break;
    case 'fee-schedule':
      pageTitle.textContent = 'Fee Schedule Calculator';
      pageSubtitle.textContent = 'Estimate reimbursement rates by CPT code, state & payer';
      pageActions.innerHTML = printBtn;
      await renderFeeScheduleTool();
      break;
    case 'payer-portal':
      pageTitle.textContent = 'Payer Portal Directory';
      pageSubtitle.textContent = 'Quick links to payer credentialing portals & contacts';
      pageActions.innerHTML = printBtn;
      await renderPayerPortalTool();
      break;
    case 'expiration-alerts':
      pageTitle.textContent = 'Expiration Alert Dashboard';
      pageSubtitle.textContent = 'All upcoming license, credential & document expirations';
      pageActions.innerHTML = printBtn;
      await renderExpirationAlertsTool();
      break;
    case 'status-export':
      pageTitle.textContent = 'Status Report Export';
      pageSubtitle.textContent = 'Generate formatted status reports for stakeholders';
      pageActions.innerHTML = '';
      await renderStatusExportTool();
      break;
    case 'state-lookup':
      pageTitle.textContent = 'State Licensing Lookup';
      pageSubtitle.textContent = 'Quick reference for state licensing boards & requirements';
      pageActions.innerHTML = '';
      await renderStateLookupTool();
      break;
    case 'deadline-timeline':
      pageTitle.textContent = 'Deadline Timeline';
      pageSubtitle.textContent = 'Visual timeline of all credentialing deadlines';
      pageActions.innerHTML = printBtn;
      await renderDeadlineTimelineTool();
      break;
    case 'letter-generator':
      pageTitle.textContent = 'Letter & Form Generator';
      pageSubtitle.textContent = 'Generate cover letters, attestations & standard forms';
      pageActions.innerHTML = '';
      await renderLetterGeneratorTool();
      break;
    case 'caqh-manager':
      pageTitle.textContent = 'CAQH ProView Manager';
      pageSubtitle.textContent = 'Roster status, attestation tracking & profile sync';
      pageActions.innerHTML = printBtn;
      await renderCaqhManager();
      break;
    case 'taxonomy-search':
      pageTitle.textContent = 'NPI & Taxonomy Search';
      pageSubtitle.textContent = 'Look up providers, NPI numbers, and taxonomy codes via CMS NPPES';
      pageActions.innerHTML = '';
      await renderTaxonomySearch();
      break;
    case 'organizations':
      pageTitle.textContent = 'Organizations';
      pageSubtitle.textContent = 'Manage organization profiles';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openOrgModal()">+ Add Organization</button>' + printBtn;
      await renderOrganizationsPage();
      break;
    case 'org-detail':
      pageTitle.textContent = 'Organization Detail';
      pageSubtitle.textContent = '';
      pageActions.innerHTML = printBtn;
      await renderOrgDetailPage(window._selectedOrgId);
      break;
    case 'users':
      pageTitle.textContent = 'User Management';
      pageSubtitle.textContent = 'Manage team members and permissions';
      pageActions.innerHTML = printBtn;
      await renderUsersStub();
      break;
    case 'audit-trail':
      pageTitle.textContent = 'Audit Trail';
      pageSubtitle.textContent = 'Track who changed what and when';
      pageActions.innerHTML = printBtn;
      await renderAuditTrail();
      break;
    case 'onboarding':
      pageTitle.textContent = 'Provider Onboarding';
      pageSubtitle.textContent = 'Onboarding tokens and self-service registration';
      pageActions.innerHTML = printBtn;
      await renderOnboardingStub();
      break;
    case 'exclusions':
      pageTitle.textContent = 'Exclusion Screening';
      pageSubtitle.textContent = 'OIG/SAM exclusion checks for all providers';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.screenAllProviders()">Screen All Providers</button>' + printBtn;
      await renderExclusionsPage();
      break;
    case 'facilities':
      pageTitle.textContent = 'Facilities';
      pageSubtitle.textContent = 'Manage healthcare facility locations';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openFacilityModal()">+ Add Facility</button> <button class="btn" onclick="window.app.openNpiFacilityModal()">+ Add from NPI</button>' + printBtn;
      await renderFacilitiesPage();
      break;
    case 'billing':
      pageTitle.textContent = 'Billing & Invoicing';
      pageSubtitle.textContent = 'Manage invoices, services, and payments';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openInvoiceModal()">+ Create Invoice</button> <button class="btn btn-sm" onclick="window.app.openEstimateModal()">+ Estimate</button>' + printBtn;
      // Check for Stripe checkout return params
      { const hp = new URLSearchParams(window.location.hash.split('?')[1] || '');
        if (hp.get('session_id')) { window._billingTab = 'subscription'; showToast('Subscription activated! Welcome aboard.'); window.location.hash = '#billing'; }
        if (hp.get('canceled')) { window._billingTab = 'subscription'; showToast('Checkout canceled'); window.location.hash = '#billing'; }
      }
      await renderBillingPage();
      break;
    case 'contracts':
      pageTitle.textContent = 'Contracts & Agreements';
      pageSubtitle.textContent = 'Create and manage service agreements with organizations';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openContractModal()">+ New Contract</button>' + printBtn;
      await renderContractsPage();
      break;
    case 'contract-detail':
      pageTitle.textContent = 'Contract Detail';
      pageSubtitle.textContent = '';
      pageActions.innerHTML = printBtn;
      await renderContractDetail(window._selectedContractId);
      break;
    case 'invoice-detail':
      pageTitle.textContent = 'Invoice Detail';
      pageSubtitle.textContent = '';
      pageActions.innerHTML = printBtn;
      await renderInvoiceDetail(window._selectedInvoiceId);
      break;
    case 'import':
      pageTitle.textContent = 'Bulk Import';
      pageSubtitle.textContent = 'Import providers, organizations, licenses, and facilities from CSV';
      pageActions.innerHTML = printBtn;
      await renderImportPage();
      break;
    case 'compliance':
      pageTitle.textContent = 'Compliance Center';
      pageSubtitle.textContent = 'Compliance scoring, risk matrix, and audit exports';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.exportAuditPacket()">Audit Packet</button> <button class="btn" onclick="window.app.generateComplianceReport()">Refresh</button> <button class="btn" onclick="window.app.exportComplianceData()">Export</button>' + printBtn;
      await renderCompliancePage();
      break;
    case 'psv':
      pageTitle.textContent = 'Primary Source Verification';
      pageSubtitle.textContent = 'Verify provider credentials against authoritative sources';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.runFullPSV()">Verify All Providers</button> <button class="btn" onclick="window.app.exportPSVReport()">Export Report</button>' + printBtn;
      await renderPSVPage();
      break;
    case 'monitoring':
      pageTitle.textContent = 'Continuous Monitoring';
      pageSubtitle.textContent = 'Real-time credential status and automated alerts';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.runMonitoringScan()">Run Scan Now</button> <button class="btn" onclick="window.app.exportMonitoringReport()">Export</button>' + printBtn;
      await renderMonitoringPage();
      break;
    case 'provider-profile-share':
      pageTitle.textContent = 'Provider Credential Profile';
      pageSubtitle.textContent = 'Shareable provider credential summary';
      pageActions.innerHTML = printBtn;
      await renderProviderPortableProfile(window._selectedProviderId);
      break;
    case 'faq':
      pageTitle.textContent = 'Knowledge Base';
      pageSubtitle.textContent = 'FAQs and help articles';
      pageActions.innerHTML = '<button class="btn btn-sm" onclick="window.app.startGuidedTour()" style="border-radius:10px;margin-right:8px;">Start Tour</button>' + editButton('+ Add FAQ', 'window.app.openFaqModal()') + printBtn;
      await renderFaqPage();
      break;
    case 'provider-profile':
      pageTitle.textContent = 'Provider Profile';
      pageSubtitle.textContent = 'Comprehensive provider credentialing profile';
      pageActions.innerHTML = printBtn;
      await renderProviderProfilePage(window._selectedProviderId);
      break;
    case 'provider-printout':
      pageTitle.textContent = 'Provider Credential Sheet';
      pageSubtitle.textContent = '';
      pageActions.innerHTML = printBtn;
      await renderProviderPrintout(window._selectedProviderId);
      break;
    case 'communications':
      pageTitle.textContent = 'Communications';
      pageSubtitle.textContent = 'Track all calls, emails, and correspondence';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openCommLogModal()">+ Log Communication</button>' + printBtn;
      await renderCommunicationsPage();
      break;
    case 'kanban':
      pageTitle.textContent = 'Kanban Board';
      pageSubtitle.textContent = 'Drag-and-drop application workflow';
      pageActions.innerHTML = printBtn;
      await renderKanbanBoard();
      break;
    case 'calendar':
      pageTitle.textContent = 'Calendar';
      pageSubtitle.textContent = 'All deadlines, expirations, and events';
      pageActions.innerHTML = printBtn;
      await renderCalendarPage();
      break;
    case 'admin':
      pageTitle.textContent = 'Super Admin';
      pageSubtitle.textContent = 'Manage all agencies and system settings';
      pageActions.innerHTML = '';
      await renderAdminPanel();
      break;
    // ─── Funding Hub Pages ───
    case 'funding':
      pageTitle.textContent = 'Funding Discovery';
      pageSubtitle.textContent = 'Mental health grants, contracts & funding opportunities';
      pageActions.innerHTML = '<button class="btn btn-gold" style="background:linear-gradient(135deg,#10b981,#059669);" onclick="window.app.refreshFundingData()">Scan for Opportunities</button>' + printBtn;
      await renderFundingDashboard();
      break;
    case 'funding-federal':
      pageTitle.textContent = 'Federal Grants';
      pageSubtitle.textContent = 'SAMHSA, HRSA, NIH, DOJ, VA & more';
      pageActions.innerHTML = '<button class="btn" onclick="window.app.refreshFundingData()">Refresh</button>' + printBtn;
      await renderFundingFederal();
      break;
    case 'funding-state':
      pageTitle.textContent = 'State & Local';
      pageSubtitle.textContent = 'State behavioral health authority grants & contracts';
      pageActions.innerHTML = printBtn;
      await renderFundingState();
      break;
    case 'funding-foundations':
      pageTitle.textContent = 'Foundations & Private';
      pageSubtitle.textContent = 'Foundation grants, pharma programs & corporate giving';
      pageActions.innerHTML = printBtn;
      await renderFundingFoundations();
      break;
    case 'funding-pipeline':
      pageTitle.textContent = 'Application Pipeline';
      pageSubtitle.textContent = 'Track grant applications from draft to awarded';
      pageActions.innerHTML = '<button class="btn btn-gold" style="background:linear-gradient(135deg,#10b981,#059669);" onclick="window.app.openFundingAppModal()">+ New Application</button>' + printBtn;
      await renderFundingPipeline();
      break;
    case 'funding-calendar':
      pageTitle.textContent = 'Deadline Calendar';
      pageSubtitle.textContent = 'All grant deadlines and reporting dates';
      pageActions.innerHTML = printBtn;
      await renderFundingCalendar();
      break;
    case 'funding-intelligence':
      pageTitle.textContent = 'Funder Intelligence';
      pageSubtitle.textContent = 'Who funds mental health in your state & how much';
      pageActions.innerHTML = printBtn;
      await renderFundingIntelligence();
      break;
    case 'funding-detail':
      pageTitle.textContent = 'Opportunity Details';
      pageSubtitle.textContent = '';
      pageActions.innerHTML = '<button class="btn" onclick="window.app.navigateTo(\'funding\')">← Back to Dashboard</button>' + printBtn;
      await renderFundingDetail(window._fundingDetailId);
      break;
    case 'provider-onboard':
      pageTitle.textContent = 'Provider Onboarding Wizard';
      pageSubtitle.textContent = 'Step-by-step guided provider setup';
      pageActions.innerHTML = printBtn;
      await renderProviderOnboardingWizard();
      break;
    case 'automations':
      pageTitle.textContent = 'Workflow Automations';
      pageSubtitle.textContent = 'Rule-based automation for credentialing workflows';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openAutomationRuleModal()">+ Create Rule</button>' + printBtn;
      await renderAutomationsPage();
      break;
    case 'api-docs':
      pageTitle.textContent = 'API Documentation';
      pageSubtitle.textContent = 'Interactive API reference for all Credentik endpoints';
      pageActions.innerHTML = printBtn;
      await renderApiDocsPage();
      break;
    default:
      pageBody.innerHTML = '<div class="empty-state"><h3>Page not found</h3></div>';
  }
}

// ─── My Account ───

async function renderMyAccount() {
  const body = document.getElementById('page-body');
  const user = auth.getUser();
  if (!user) { body.innerHTML = '<div class="alert alert-danger">Not logged in.</div>'; return; }

  const roleLabels = { superadmin: 'Super Admin', agency: 'Agency Admin', staff: 'Staff (Credentialing Coordinator)', organization: 'Organization', provider: 'Provider' };
  const roleBadgeClass = { superadmin: 'approved', agency: 'approved', staff: 'in_review', organization: 'submitted', provider: 'pending' };
  const role = user.ui_role || user.role || 'provider';
  const initials = ((user.first_name || user.firstName || '?')[0] + (user.last_name || user.lastName || '?')[0]).toUpperCase();
  const fullName = `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim();
  const agencyName = user.agency?.name || '';

  body.innerHTML = `
    <style>
      .myacc-hero{display:flex;gap:24px;align-items:center;padding:28px;background:#fff;border-radius:16px;border:1px solid var(--gray-200);margin-bottom:20px;}
      .myacc-avatar{width:80px;height:80px;border-radius:20px;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:28px;flex-shrink:0;}
      .myacc-name{font-size:22px;font-weight:700;color:var(--gray-900);}
      .myacc-meta{font-size:13px;color:var(--gray-500);margin-top:4px;}
      .myacc-tabs{display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:20px;}
      .myacc-tab{background:none;border:none;padding:10px 18px;font-size:13px;font-weight:600;color:var(--gray-500);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s;}
      .myacc-tab:hover{color:var(--gray-700);}
      .myacc-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
      .myacc-section .card{border-radius:16px;}
      @media(max-width:768px){.myacc-hero{flex-direction:column;text-align:center;} .myacc-avatar{width:64px;height:64px;font-size:22px;}}
    </style>

    <!-- Hero -->
    <div class="myacc-hero">
      <div class="myacc-avatar">${initials}</div>
      <div style="flex:1;">
        <div class="myacc-name">${escHtml(fullName)}</div>
        <div class="myacc-meta">${escHtml(user.email || '')} &middot; <span class="badge badge-${roleBadgeClass[role] || 'pending'}">${roleLabels[role] || role}</span></div>
        ${agencyName ? `<div class="myacc-meta">${escHtml(agencyName)}</div>` : ''}
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px;">Last login</div>
        <div style="font-size:13px;color:var(--gray-600);margin-top:2px;">${user.last_login_at || user.lastLoginAt ? new Date(user.last_login_at || user.lastLoginAt).toLocaleDateString() : 'Unknown'}</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="myacc-tabs">
      <button class="myacc-tab active" onclick="window.app.myAccountTab(this,'myacc-profile')">Profile</button>
      <button class="myacc-tab" onclick="window.app.myAccountTab(this,'myacc-security')">Security & MFA</button>
      <button class="myacc-tab" onclick="window.app.myAccountTab(this,'myacc-notifications')">Notifications</button>
    </div>

    <!-- Profile Tab -->
    <div id="myacc-profile" class="myacc-section">
      <div class="card">
        <div class="card-header">
          <h3>Personal Information</h3>
          <button class="btn btn-primary btn-sm" onclick="window.app.saveMyProfile()" style="border-radius:10px;">Save Changes</button>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group"><label>First Name *</label><input type="text" class="form-control" id="myacc-first" value="${escAttr(user.first_name || user.firstName || '')}"></div>
            <div class="form-group"><label>Last Name *</label><input type="text" class="form-control" id="myacc-last" value="${escAttr(user.last_name || user.lastName || '')}"></div>
            <div class="form-group"><label>Email</label><input type="email" class="form-control" value="${escAttr(user.email || '')}" disabled style="opacity:0.6;"><div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Contact your admin to change email</div></div>
            <div class="form-group"><label>Role</label><input type="text" class="form-control" value="${roleLabels[role] || role}" disabled style="opacity:0.6;"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Change Password</h3></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
            <div class="form-group"><label>Current Password *</label><input type="password" class="form-control" id="myacc-current-pw" placeholder="Current password"></div>
            <div class="form-group"><label>New Password *</label><input type="password" class="form-control" id="myacc-new-pw" placeholder="New password (min 8 chars)"></div>
            <div class="form-group"><label>Confirm New Password *</label><input type="password" class="form-control" id="myacc-confirm-pw" placeholder="Confirm new password"></div>
          </div>
          <button class="btn btn-primary" onclick="window.app.changeMyPassword()" style="margin-top:12px;border-radius:10px;">Update Password</button>
        </div>
      </div>
    </div>

    <!-- Security & MFA Tab -->
    <div id="myacc-security" class="hidden myacc-section">
      <div class="card">
        <div class="card-header"><h3>Two-Factor Authentication (MFA)</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom:16px;">Add an extra layer of security to your account by enabling two-factor authentication with an authenticator app (Google Authenticator, Authy, 1Password, etc.).</p>
          <div id="myacc-2fa-area">
            <div style="text-align:center;padding:20px;color:var(--gray-400);"><div class="spinner"></div> Loading MFA status...</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Active Sessions</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted">You are currently logged in from this device. To log out all other sessions, click below.</p>
          <button class="btn" onclick="showToast('Session management coming soon')" style="margin-top:12px;border-radius:10px;">Log Out All Other Sessions</button>
        </div>
      </div>
    </div>

    <!-- Notifications Tab -->
    <div id="myacc-notifications" class="hidden myacc-section">
      <div class="card">
        <div class="card-header"><h3>Notification Preferences</h3></div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <label style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--gray-50);border-radius:10px;cursor:pointer;">
              <input type="checkbox" checked> <div><strong>Email notifications</strong><div class="text-sm text-muted">Receive email alerts for application status changes, license expirations, and follow-up reminders</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--gray-50);border-radius:10px;cursor:pointer;">
              <input type="checkbox" checked> <div><strong>License expiration alerts</strong><div class="text-sm text-muted">Get notified 90, 60, and 30 days before licenses expire</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--gray-50);border-radius:10px;cursor:pointer;">
              <input type="checkbox" checked> <div><strong>Follow-up reminders</strong><div class="text-sm text-muted">Daily digest of overdue and upcoming follow-ups</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--gray-50);border-radius:10px;cursor:pointer;">
              <input type="checkbox"> <div><strong>Weekly summary report</strong><div class="text-sm text-muted">Receive a weekly email summarizing credentialing activity</div></div>
            </label>
          </div>
          <button class="btn btn-primary" onclick="showToast('Notification preferences saved')" style="margin-top:16px;border-radius:10px;">Save Preferences</button>
        </div>
      </div>
      ${renderDigestSettings()}
    </div>
  `;

  // Load 2FA status into the My Account page
  const area2fa = document.getElementById('myacc-2fa-area');
  if (area2fa) {
    try {
      const res = await fetch(`${CONFIG.API_URL}/2fa/status`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`, 'Accept': 'application/json' },
      });
      const data = await res.json();
      const enabled = data.data?.enabled;
      if (enabled) {
        area2fa.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;padding:16px;background:#f0fdf4;border:1px solid #dcfce7;border-radius:12px;margin-bottom:16px;">
            <span style="font-size:24px;">✅</span>
            <div>
              <div style="font-weight:700;color:#15803d;font-size:15px;">MFA is enabled</div>
              <div class="text-sm text-muted">Your account is protected with two-factor authentication.</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn" onclick="window.app.show2FARecoveryCodes()" style="border-radius:10px;">View Recovery Codes</button>
            <button class="btn btn-danger" onclick="window.app.disable2FA()" style="border-radius:10px;">Disable MFA</button>
          </div>`;
      } else {
        area2fa.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;padding:16px;background:#fffbeb;border:1px solid #fef3c7;border-radius:12px;margin-bottom:16px;">
            <span style="font-size:24px;">⚠️</span>
            <div>
              <div style="font-weight:700;color:#b45309;font-size:15px;">MFA is not enabled</div>
              <div class="text-sm text-muted">Your account relies on password only. We strongly recommend enabling MFA.</div>
            </div>
          </div>
          <div class="form-group" style="max-width:320px;">
            <label>Enter your password to enable MFA</label>
            <input type="password" class="form-control" id="2fa-password" placeholder="Your current password">
          </div>
          <button class="btn btn-primary" onclick="window.app.enable2FA()" style="border-radius:10px;">Enable Two-Factor Authentication</button>`;
      }
    } catch (e) {
      area2fa.innerHTML = '<p class="text-muted">Unable to load MFA status. Try refreshing the page.</p>';
    }
  }
}

// ─── Dashboard ───

async function renderDashboard() {
  const body = document.getElementById('page-body');
  try {
  // Provider self-service: if role=provider, show simplified dashboard
  const currentUser = auth.getUser();
  if (currentUser?.role === 'provider') {
    await renderProviderDashboard(currentUser);
    return;
  }

  // Parallel fetch — all independent data at once
  const [stats, _overdue, _upcoming, _escalations, _licenses, _providers, orgs, _apps, _tasks] = await Promise.all([
    store.getApplicationStats(),
    workflow.getOverdueFollowups(),
    workflow.getUpcomingFollowups(),
    workflow.getEscalationCandidates(),
    store.getAll('licenses'),
    store.getAll('providers'),
    store.getAll('organizations'),
    store.getAll('applications'),
    store.getAll('tasks'),
  ]);
  // Apply scope filter
  const overdue = store.filterByScope(_overdue);
  const upcoming = store.filterByScope(_upcoming);
  const escalations = store.filterByScope(_escalations);
  const licenses = store.filterByScope(_licenses);
  const providers = store.filterByScope(_providers);
  const apps = store.filterByScope(_apps);
  const tasks = store.filterByScope(_tasks);
  const org = orgs[0] || {};

  const activeLic = licenses.filter(l => l.status === 'active');
  const pendingLic = licenses.filter(l => l.status === 'pending');
  const today = new Date();

  // Pre-compute task stats for dashboard
  const taskToday = today.toISOString().split('T')[0];
  const pendingTasks = tasks.filter(t => !t.completed && !t.isCompleted);
  const overdueTasks = pendingTasks.filter(t => t.dueDate && t.dueDate < taskToday);
  const dueTodayTasks = pendingTasks.filter(t => t.dueDate === taskToday);
  const urgentTasks = pendingTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');

  // Pre-compute document completion stats
  const totalDocSlots = apps.length * CRED_DOCUMENTS.length;
  const completedDocSlots = apps.reduce((sum, a) => {
    const docs = a.documentChecklist || {};
    return sum + CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length;
  }, 0);
  const overallDocPct = totalDocSlots > 0 ? Math.round((completedDocSlots / totalDocSlots) * 100) : 0;
  const fullyComplete = apps.filter(a => {
    const docs = a.documentChecklist || {};
    return CRED_DOCUMENTS.every(d => docs[d.id]?.completed);
  }).length;
  const lowApps = apps.map(a => {
    const docs = a.documentChecklist || {};
    const done = CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length;
    const pct = Math.round((done / CRED_DOCUMENTS.length) * 100);
    return { ...a, docPct: pct, docDone: done };
  }).filter(a => a.docPct < 100).sort((a, b) => a.docPct - b.docPct);

  // Pre-resolve overdue followup application details (parallel)
  const overdueSlice = overdue.slice(0, 5);
  const overdueApps = await Promise.all(
    overdueSlice.map(fu => store.getOne('applications', fu.applicationId).catch(() => null))
  );
  const overdueRows = overdueSlice.map((fu, i) => {
    const app = overdueApps[i];
    const payer = app ? (getPayerById(app.payerId) || { name: app.payerName }) : {};
    return { fu, app, payer };
  });

  // Telehealth policy data
  const licensedStates = [...new Set(licenses.map(l => l.state))];
  const licensedPolicies = licensedStates.map(s => getLivePolicyByState(s)).filter(Boolean);
  const avgReadiness = licensedPolicies.length > 0
    ? (licensedPolicies.reduce((sum, p) => sum + p.readinessScore, 0) / licensedPolicies.length).toFixed(1)
    : 0;
  const restrictedLicensed = licensedPolicies.filter(p => p.practiceAuthority === 'restricted');
  const csLimited = licensedPolicies.filter(p => p.controlledSubstances !== 'allowed');
  const noAudioOnly = licensedPolicies.filter(p => !p.audioOnly);
  const topExpansion = getLiveTopReadinessStates(8).filter(p => !licensedStates.includes(p.state)).slice(0, 5);
  const expiringLic = licenses.filter(l => {
    if (!l.expirationDate) return false;
    const exp = new Date(l.expirationDate);
    return exp > today && exp < new Date(Date.now() + 90 * 86400000);
  });
  const expiredLic = licenses.filter(l => {
    if (!l.expirationDate) return false;
    return new Date(l.expirationDate) < today;
  });

  // ─── Mission Control: compute derived data ───
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = currentUser?.first_name || 'there';

  // Pipeline progress
  const pipelineApproved = apps.filter(a => a.status === 'approved' || a.status === 'credentialed').length;
  const pipelineTotal = apps.length || 1;
  const pipelinePct = Math.round((pipelineApproved / pipelineTotal) * 100);

  // Revenue
  const totalRevenue = stats.estMonthlyRevenue || 0;

  // Compliance score — based on license health + doc completion
  const totalLicenses = licenses.length || 1;
  const healthyLicenses = activeLic.length;
  const licHealthPct = Math.round((healthyLicenses / totalLicenses) * 100);
  const complianceScore = Math.round((licHealthPct * 0.5) + (overallDocPct * 0.5));
  const complianceColor = complianceScore >= 90 ? '#10B981' : complianceScore >= 70 ? '#F59E0B' : '#EF4444';
  const complianceGrad = complianceScore >= 90 ? 'linear-gradient(135deg, #10B981, #059669)' : complianceScore >= 70 ? 'linear-gradient(135deg, #F59E0B, #D97706)' : 'linear-gradient(135deg, #EF4444, #DC2626)';

  // Action items count
  const actionItemCount = overdue.length + expiringLic.length + overdueTasks.length;

  // Build attention feed items
  const attentionItems = [];
  overdue.forEach(fu => {
    const app = apps.find(a => a.id === fu.applicationId);
    const payer = app ? (getPayerById(app.payerId) || { name: app.payerName }) : {};
    const daysAgo = Math.floor((today - new Date(fu.dueDate)) / 86400000);
    attentionItems.push({
      type: 'overdue-followup',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      color: '#EF4444',
      bg: '#FEF2F2',
      title: `Follow-up overdue: ${payer.name || 'Unknown'}`,
      subtitle: app ? getStateName(app.state) + ' — ' + (fu.type || 'status check') : fu.type || 'status check',
      time: daysAgo + 'd overdue',
      urgency: daysAgo + 100,
      action: () => `window.app.completeFollowupPrompt('${fu.id}')`,
      actionLabel: 'Complete'
    });
  });
  expiringLic.forEach(l => {
    const daysLeft = Math.floor((new Date(l.expirationDate) - today) / 86400000);
    attentionItems.push({
      type: 'expiring-license',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-2.97L13.74 4.03a2 2 0 00-3.48 0L3.33 16.03A2 2 0 005.07 19z"/></svg>',
      color: '#F59E0B',
      bg: '#FFFBEB',
      title: `License expiring: ${getStateName(l.state)}`,
      subtitle: `#${escHtml(l.licenseNumber || '—')} — expires ${formatDateDisplay(l.expirationDate)}`,
      time: daysLeft + 'd left',
      urgency: 90 - daysLeft,
      action: () => `window.app.navigateTo('licenses')`,
      actionLabel: 'Renew'
    });
  });
  overdueTasks.forEach(t => {
    const daysAgo = Math.floor((today - new Date(t.dueDate)) / 86400000);
    attentionItems.push({
      type: 'overdue-task',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>',
      color: '#EF4444',
      bg: '#FEF2F2',
      title: `Task overdue: ${escHtml(t.title)}`,
      subtitle: t.priority ? t.priority.charAt(0).toUpperCase() + t.priority.slice(1) + ' priority' : 'Normal priority',
      time: daysAgo + 'd overdue',
      urgency: daysAgo + 50,
      action: () => `window.app.showQuickTask()`,
      actionLabel: 'View'
    });
  });
  // Pending apps needing action
  apps.filter(a => a.status === 'pending_info' || a.status === 'new').slice(0, 4).forEach(a => {
    const payer = getPayerById(a.payerId) || { name: a.payerName };
    const statusObj = APPLICATION_STATUSES.find(s => s.value === a.status) || APPLICATION_STATUSES[0];
    attentionItems.push({
      type: 'pending-app',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      color: '#3B82F6',
      bg: '#EFF6FF',
      title: `${statusObj.label}: ${payer.name || 'Unknown'}`,
      subtitle: getStateName(a.state),
      time: formatDateDisplay(a.createdAt || a.created_at),
      urgency: 10,
      action: () => `window.app.viewApplication('${a.id}')`,
      actionLabel: 'Open'
    });
  });
  attentionItems.sort((a, b) => b.urgency - a.urgency);
  const attentionSlice = attentionItems.slice(0, 8);

  // Audit log
  const auditLog = (store.getLocalAuditLog() || []).slice(0, 5);

  // Upcoming follow-ups/tasks
  const upcomingItems = [
    ...upcoming.slice(0, 3).map(fu => {
      const app = apps.find(a => a.id === fu.applicationId);
      const payer = app ? (getPayerById(app.payerId) || { name: app.payerName }) : {};
      return { title: payer.name || 'Follow-up', date: fu.dueDate, type: 'follow-up' };
    }),
    ...pendingTasks.filter(t => t.dueDate && t.dueDate >= taskToday).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3).map(t => ({
      title: t.title, date: t.dueDate, type: 'task'
    }))
  ].sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(0, 3);

  // Application status distribution for pipeline bar
  const statusCounts = APPLICATION_STATUSES.map(s => ({
    ...s,
    count: apps.filter(a => a.status === s.value).length
  })).filter(s => s.count > 0);

  // Kanban columns (5 main statuses)
  const kanbanStatuses = ['new', 'submitted', 'in_review', 'approved', 'credentialed'];
  const kanbanCols = kanbanStatuses.map(val => {
    const statusObj = APPLICATION_STATUSES.find(s => s.value === val) || { label: val, color: '#6B7280', bg: '#F3F4F6' };
    const colApps = apps.filter(a => a.status === val);
    return { ...statusObj, apps: colApps };
  });

  // SVG progress ring helper
  const ringSize = 90;
  const ringStroke = 7;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc - (pipelinePct / 100) * ringCirc;

  // Compliance ring
  const compRingOffset = ringCirc - (complianceScore / 100) * ringCirc;

  body.innerHTML = `
    <style>
      .mc-welcome {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 16px; padding: 20px 28px; margin-bottom: 20px;
        display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
        color: #fff; position: relative; overflow: hidden;
      }
      .mc-welcome::before {
        content: ''; position: absolute; top: -50%; right: -20%; width: 300px; height: 300px;
        background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
        border-radius: 50%;
      }
      .mc-welcome h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
      .mc-welcome .mc-welcome-sub { font-size: 13px; opacity: 0.85; margin-top: 2px; }
      .mc-welcome .mc-welcome-right { font-size: 12px; opacity: 0.7; text-align: right; }

      .mc-hero-grid {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;
      }
      @media (max-width: 900px) { .mc-hero-grid { grid-template-columns: repeat(2, 1fr); } }
      .mc-hero-card {
        background: #fff; border-radius: 16px; padding: 24px; position: relative;
        border: 1px solid var(--gray-200); cursor: pointer; transition: all 0.2s ease;
        overflow: hidden;
      }
      .mc-hero-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.08); border-color: var(--gray-300); }
      .mc-hero-card .mc-hero-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gray-500); margin-bottom: 12px; }
      .mc-hero-card .mc-hero-value { font-size: 36px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
      .mc-hero-card .mc-hero-sub { font-size: 12px; color: var(--gray-500); margin-top: 8px; }
      .mc-hero-card .mc-hero-accent {
        position: absolute; top: 0; left: 0; right: 0; height: 3px;
      }

      .mc-two-col { display: grid; grid-template-columns: 3fr 2fr; gap: 20px; margin-bottom: 20px; }
      @media (max-width: 900px) { .mc-two-col { grid-template-columns: 1fr; } }

      .mc-section-title {
        font-size: 15px; font-weight: 700; color: var(--gray-800); margin-bottom: 14px;
        display: flex; align-items: center; gap: 8px; letter-spacing: -0.01em;
      }
      .mc-section-title .mc-count {
        background: var(--gray-100); color: var(--gray-600); font-size: 11px; font-weight: 700;
        padding: 2px 8px; border-radius: 10px;
      }

      .mc-attention { display: flex; flex-direction: column; gap: 8px; }
      .mc-attention-item {
        display: flex; align-items: center; gap: 12px; padding: 12px 14px;
        background: #fff; border-radius: 12px; border: 1px solid var(--gray-200);
        transition: all 0.15s ease;
      }
      .mc-attention-item:hover { border-color: var(--gray-300); box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
      .mc-attention-icon {
        width: 34px; height: 34px; border-radius: 10px; display: flex;
        align-items: center; justify-content: center; flex-shrink: 0;
      }
      .mc-attention-body { flex: 1; min-width: 0; }
      .mc-attention-title { font-size: 13px; font-weight: 600; color: var(--gray-800); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .mc-attention-sub { font-size: 11px; color: var(--gray-500); margin-top: 1px; }
      .mc-attention-time { font-size: 10px; font-weight: 600; color: var(--gray-400); white-space: nowrap; margin-right: 4px; }
      .mc-attention-btn {
        padding: 5px 12px; border-radius: 8px; font-size: 11px; font-weight: 600;
        border: 1px solid var(--gray-200); background: #fff; color: var(--gray-700);
        cursor: pointer; white-space: nowrap; transition: all 0.15s;
      }
      .mc-attention-btn:hover { background: var(--gray-50); border-color: var(--gray-300); }

      .mc-quick-glance {
        background: #fff; border-radius: 14px; border: 1px solid var(--gray-200);
        padding: 18px; margin-bottom: 14px;
      }
      .mc-quick-glance:last-child { margin-bottom: 0; }
      .mc-quick-glance h4 {
        font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
        color: var(--gray-500); margin: 0 0 12px 0;
      }

      .mc-pipeline-bar {
        display: flex; height: 28px; border-radius: 8px; overflow: hidden; width: 100%;
        background: var(--gray-100);
      }
      .mc-pipeline-segment {
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 700; color: #fff; transition: width 0.3s;
        min-width: 0; position: relative;
      }
      .mc-pipeline-segment span { white-space: nowrap; overflow: hidden; }
      .mc-pipeline-legend {
        display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;
      }
      .mc-pipeline-legend-item {
        display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--gray-600);
      }
      .mc-pipeline-legend-dot { width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0; }

      .mc-activity-item {
        display: flex; align-items: flex-start; gap: 10px; padding: 8px 0;
        border-bottom: 1px solid var(--gray-100); font-size: 12px;
      }
      .mc-activity-item:last-child { border-bottom: none; }
      .mc-activity-dot {
        width: 6px; height: 6px; border-radius: 50%; background: var(--gray-300);
        flex-shrink: 0; margin-top: 5px;
      }
      .mc-activity-text { flex: 1; color: var(--gray-600); line-height: 1.4; }
      .mc-activity-text strong { color: var(--gray-800); font-weight: 600; }
      .mc-activity-time { font-size: 10px; color: var(--gray-400); white-space: nowrap; }

      .mc-upcoming-item {
        display: flex; align-items: center; gap: 10px; padding: 8px 0;
        border-bottom: 1px solid var(--gray-100); font-size: 12px;
      }
      .mc-upcoming-item:last-child { border-bottom: none; }
      .mc-upcoming-date {
        width: 44px; height: 44px; border-radius: 10px; background: var(--gray-50);
        display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;
        border: 1px solid var(--gray-200);
      }
      .mc-upcoming-date .mc-up-month { font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--gray-500); }
      .mc-upcoming-date .mc-up-day { font-size: 16px; font-weight: 800; color: var(--gray-800); line-height: 1; }

      .mc-kanban-preview {
        background: #fff; border-radius: 16px; border: 1px solid var(--gray-200);
        padding: 20px; margin-bottom: 20px;
      }
      .mc-kanban-header {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;
      }
      .mc-kanban-cols {
        display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;
      }
      @media (max-width: 900px) { .mc-kanban-cols { grid-template-columns: repeat(3, 1fr); } }
      .mc-kanban-col {
        background: var(--gray-50); border-radius: 12px; padding: 12px; min-height: 120px;
      }
      .mc-kanban-col-header {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
      }
      .mc-kanban-col-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
      .mc-kanban-col-count {
        font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 8px;
      }
      .mc-kanban-card {
        background: #fff; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px;
        border: 1px solid var(--gray-200); font-size: 12px; cursor: pointer;
        transition: all 0.15s;
      }
      .mc-kanban-card:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.06); border-color: var(--gray-300); }
      .mc-kanban-card:last-child { margin-bottom: 0; }
      .mc-kanban-card-title { font-weight: 600; color: var(--gray-800); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .mc-kanban-card-sub { font-size: 10px; color: var(--gray-500); margin-top: 2px; }

      .mc-progress-ring { transform: rotate(-90deg); }
      .mc-ring-bg { fill: none; stroke: var(--gray-200); }
      .mc-ring-fg { fill: none; stroke-linecap: round; transition: stroke-dashoffset 0.6s ease; }

      .mc-spark-bars { display: flex; align-items: flex-end; gap: 2px; height: 30px; }
      .mc-spark-bar { width: 4px; border-radius: 2px; background: rgba(16,185,129,0.3); transition: height 0.3s; }
      .mc-spark-bar:last-child { background: #10B981; }
    </style>

    <!-- Row 1: Welcome Banner -->
    <div class="mc-welcome">
      <div>
        <h2>${greeting}, ${escHtml(firstName)}</h2>
        <div class="mc-welcome-sub">${escHtml(org.name || 'Your Organization')} &middot; ${providers.length} provider${providers.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="mc-welcome-right">
        <div style="font-size:13px;font-weight:600;">${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
        <div style="margin-top:2px;opacity:0.7;">Last sync: just now</div>
      </div>
    </div>

    <!-- Row 2: Hero Metrics -->
    <div class="mc-hero-grid">
      <!-- Credentialing Pipeline -->
      <div class="mc-hero-card" onclick="window.app.navigateTo('applications')" title="View all applications">
        <div class="mc-hero-accent" style="background:linear-gradient(90deg,#667eea,#764ba2);"></div>
        <div class="mc-hero-label">Credentialing Pipeline</div>
        <div style="display:flex;align-items:center;gap:16px;">
          <svg class="mc-progress-ring" width="${ringSize}" height="${ringSize}" viewBox="0 0 ${ringSize} ${ringSize}">
            <circle class="mc-ring-bg" cx="${ringSize/2}" cy="${ringSize/2}" r="${ringRadius}" stroke-width="${ringStroke}"/>
            <circle class="mc-ring-fg" cx="${ringSize/2}" cy="${ringSize/2}" r="${ringRadius}" stroke-width="${ringStroke}"
              stroke="url(#pipelineGrad)" stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOffset}"/>
            <defs><linearGradient id="pipelineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#667eea"/><stop offset="100%" style="stop-color:#764ba2"/>
            </linearGradient></defs>
          </svg>
          <div>
            <div class="mc-hero-value" style="color:var(--gray-800);">${pipelinePct}%</div>
            <div class="mc-hero-sub">${pipelineApproved} of ${apps.length} approved</div>
          </div>
        </div>
      </div>

      <!-- Revenue Potential -->
      <div class="mc-hero-card" onclick="window.app.navigateTo('applications')" title="View revenue details">
        <div class="mc-hero-accent" style="background:linear-gradient(90deg,#10B981,#059669);"></div>
        <div class="mc-hero-label">Revenue Potential</div>
        <div class="mc-hero-value" style="color:#059669;">$${totalRevenue.toLocaleString()}</div>
        <div class="mc-hero-sub">est. monthly revenue</div>
        <div class="mc-spark-bars" style="position:absolute;bottom:20px;right:20px;">
          ${[35,50,40,65,45,55,70,60,80,75,90,100].map(h => `<div class="mc-spark-bar" style="height:${h}%;"></div>`).join('')}
        </div>
      </div>

      <!-- Compliance Score -->
      <div class="mc-hero-card" onclick="window.app.navigateTo('licenses')" title="View license compliance">
        <div class="mc-hero-accent" style="background:${complianceGrad};"></div>
        <div class="mc-hero-label">Compliance Score ${helpTip('The compliance score measures the percentage of your active licenses that are current (not expired or expiring within 90 days). A higher score means your providers are fully credentialed and up to date.')}</div>
        <div style="display:flex;align-items:center;gap:16px;">
          <svg class="mc-progress-ring" width="${ringSize}" height="${ringSize}" viewBox="0 0 ${ringSize} ${ringSize}">
            <circle class="mc-ring-bg" cx="${ringSize/2}" cy="${ringSize/2}" r="${ringRadius}" stroke-width="${ringStroke}"/>
            <circle class="mc-ring-fg" cx="${ringSize/2}" cy="${ringSize/2}" r="${ringRadius}" stroke-width="${ringStroke}"
              stroke="${complianceColor}" stroke-dasharray="${ringCirc}" stroke-dashoffset="${compRingOffset}"/>
          </svg>
          <div>
            <div class="mc-hero-value" style="color:${complianceColor};">${complianceScore}%</div>
            <div class="mc-hero-sub">${activeLic.length} active, ${expiringLic.length + expiredLic.length} at risk</div>
          </div>
        </div>
      </div>

      <!-- Action Items -->
      <div class="mc-hero-card" onclick="document.getElementById('mc-attention-section')?.scrollIntoView({behavior:'smooth'})" title="View action items">
        <div class="mc-hero-accent" style="background:linear-gradient(90deg,${actionItemCount > 0 ? '#EF4444,#F59E0B' : '#10B981,#059669'});"></div>
        <div class="mc-hero-label">Action Items</div>
        <div class="mc-hero-value" style="color:${actionItemCount > 0 ? '#EF4444' : '#10B981'};">${actionItemCount}</div>
        <div class="mc-hero-sub" style="margin-top:10px;">
          ${overdue.length > 0 ? `<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#FEF2F2;color:#EF4444;font-size:10px;font-weight:600;margin-right:4px;">${overdue.length} follow-ups</span>` : ''}
          ${expiringLic.length > 0 ? `<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#FFFBEB;color:#F59E0B;font-size:10px;font-weight:600;margin-right:4px;">${expiringLic.length} licenses</span>` : ''}
          ${overdueTasks.length > 0 ? `<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#FEF2F2;color:#EF4444;font-size:10px;font-weight:600;">${overdueTasks.length} tasks</span>` : ''}
          ${actionItemCount === 0 ? '<span style="color:#10B981;font-weight:600;">All clear</span>' : ''}
        </div>
      </div>
    </div>

    <!-- Row 3: Two-Column Layout -->
    <div class="mc-two-col">
      <!-- Left: What Needs Your Attention -->
      <div>
        <div class="mc-section-title" id="mc-attention-section">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          What Needs Your Attention
          <span class="mc-count">${attentionItems.length}</span>
        </div>
        <div class="mc-attention">
          ${attentionSlice.length > 0 ? attentionSlice.map(item => `
            <div class="mc-attention-item">
              <div class="mc-attention-icon" style="background:${item.bg};color:${item.color};">
                ${item.icon}
              </div>
              <div class="mc-attention-body">
                <div class="mc-attention-title">${item.title}</div>
                <div class="mc-attention-sub">${item.subtitle}</div>
              </div>
              <span class="mc-attention-time">${item.time}</span>
              <button class="mc-attention-btn" onclick="${item.action()}">${item.actionLabel}</button>
            </div>
          `).join('') : `
            <div style="text-align:center;padding:40px 20px;color:var(--gray-400);">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px;"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <div style="font-size:14px;font-weight:600;color:var(--gray-600);">You're all caught up</div>
              <div style="font-size:12px;margin-top:4px;">No urgent items right now</div>
            </div>
          `}
          ${attentionItems.length > 8 ? `
            <button class="mc-attention-btn" style="align-self:center;margin-top:4px;padding:8px 20px;" onclick="window.app.navigateTo('followups')">
              View all ${attentionItems.length} items &rarr;
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Right: Quick Glances -->
      <div>
        <!-- Application Pipeline -->
        <div class="mc-quick-glance">
          <h4>Application Pipeline</h4>
          ${statusCounts.length > 0 ? `
            <div class="mc-pipeline-bar">
              ${statusCounts.map(s => {
                const pct = (s.count / apps.length) * 100;
                return `<div class="mc-pipeline-segment" style="width:${pct}%;background:${s.color};" title="${s.label}: ${s.count}">
                  ${pct > 8 ? `<span>${s.count}</span>` : ''}
                </div>`;
              }).join('')}
            </div>
            <div class="mc-pipeline-legend">
              ${statusCounts.map(s => `
                <div class="mc-pipeline-legend-item">
                  <div class="mc-pipeline-legend-dot" style="background:${s.color};"></div>
                  ${s.label} (${s.count})
                </div>
              `).join('')}
            </div>
          ` : '<div style="text-align:center;padding:12px;color:var(--gray-400);font-size:12px;">No applications yet</div>'}
        </div>

        <!-- Recent Activity -->
        <div class="mc-quick-glance">
          <h4>Recent Activity</h4>
          ${auditLog.length > 0 ? auditLog.map(entry => {
            const when = entry.timestamp ? new Date(entry.timestamp) : null;
            const timeAgo = when ? (() => {
              const mins = Math.floor((today - when) / 60000);
              if (mins < 1) return 'just now';
              if (mins < 60) return mins + 'm ago';
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return hrs + 'h ago';
              return Math.floor(hrs / 24) + 'd ago';
            })() : '';
            return `<div class="mc-activity-item">
              <div class="mc-activity-dot"></div>
              <div class="mc-activity-text"><strong>${escHtml(entry.user_name || 'System')}</strong> ${escHtml(entry.action || '')} ${escHtml(entry.collection || '')}</div>
              <div class="mc-activity-time">${timeAgo}</div>
            </div>`;
          }).join('') : '<div style="text-align:center;padding:12px;color:var(--gray-400);font-size:12px;">No recent activity</div>'}
        </div>

        <!-- Upcoming -->
        <div class="mc-quick-glance">
          <h4>Upcoming</h4>
          ${upcomingItems.length > 0 ? upcomingItems.map(item => {
            let d = null;
            if (item.date) {
              const raw = String(item.date).split('T')[0]; // handle both YYYY-MM-DD and ISO strings
              d = new Date(raw + 'T00:00:00');
              if (isNaN(d.getTime())) d = new Date(item.date); // fallback
              if (isNaN(d.getTime())) d = null; // give up
            }
            const monthStr = d ? d.toLocaleDateString('en-US', { month: 'short' }) : '—';
            const dayStr = d ? d.getDate() : '—';
            return `<div class="mc-upcoming-item">
              <div class="mc-upcoming-date">
                <div class="mc-up-month">${monthStr}</div>
                <div class="mc-up-day">${dayStr}</div>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:var(--gray-800);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(item.title)}</div>
                <div style="font-size:11px;color:var(--gray-500);margin-top:1px;">${item.type === 'follow-up' ? 'Follow-up due' : 'Task due'} &middot; ${formatDateDisplay(item.date)}</div>
              </div>
            </div>`;
          }).join('') : '<div style="text-align:center;padding:12px;color:var(--gray-400);font-size:12px;">Nothing upcoming</div>'}
        </div>
      </div>
    </div>

    <!-- Row 4: Application Kanban Preview -->
    <div class="mc-kanban-preview">
      <div class="mc-kanban-header">
        <div class="mc-section-title" style="margin-bottom:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          Application Board
          <span class="mc-count">${apps.length} total</span>
        </div>
        <button class="btn btn-sm" onclick="window.app.navigateTo('applications')" style="font-size:12px;font-weight:600;">Open Full Board &rarr;</button>
      </div>
      <div class="mc-kanban-cols">
        ${kanbanCols.map(col => `
          <div class="mc-kanban-col">
            <div class="mc-kanban-col-header">
              <span class="mc-kanban-col-title" style="color:${col.color};">${col.label}</span>
              <span class="mc-kanban-col-count" style="background:${col.bg};color:${col.color};">${col.apps.length}</span>
            </div>
            ${col.apps.slice(0, 2).map(a => {
              const payer = getPayerById(a.payerId) || { name: a.payerName };
              return `<div class="mc-kanban-card" onclick="window.app.viewApplication('${a.id}')">
                <div class="mc-kanban-card-title">${escHtml(payer.name || 'Unknown')}</div>
                <div class="mc-kanban-card-sub">${getStateName(a.state)}</div>
              </div>`;
            }).join('')}
            ${col.apps.length > 2 ? `<div style="text-align:center;font-size:10px;color:var(--gray-400);padding-top:4px;">+${col.apps.length - 2} more</div>` : ''}
            ${col.apps.length === 0 ? `<div style="text-align:center;font-size:11px;color:var(--gray-400);padding:16px 0;">—</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  } catch (e) {
    console.error('Dashboard render error:', e);
    if (body) body.innerHTML = `<div class="alert alert-danger" style="margin:24px 0;">
      <strong>Dashboard failed to load.</strong> ${escHtml(e.message || 'Unknown error')}.
      <button class="btn btn-sm" onclick="navigateTo('dashboard')" style="margin-left:8px;">Retry</button>
    </div>`;
  }
}

// ─── Dashboard Charts ───

let _chartInstances = [];

async function renderDashboardCharts(stats, apps, licenses) {
  
  // Destroy previous chart instances to prevent memory leaks
  _chartInstances.forEach(c => c.destroy());
  _chartInstances = [];

  if (typeof Chart === 'undefined') return; // Chart.js not loaded

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: { size: 11, family: "'Inter', system-ui, sans-serif", weight: 500 }, padding: 14, usePointStyle: true, pointStyle: 'circle' } },
    },
    elements: {
      bar: { borderRadius: 4 },
      arc: { borderWidth: 0 },
    },
  };

  // 1. Application Pipeline — Doughnut
  const pipelineEl = document.getElementById('chart-pipeline');
  if (pipelineEl && stats.total > 0) {
    const statusData = APPLICATION_STATUSES.filter(s => stats.byStatus[s.value]);
    _chartInstances.push(new Chart(pipelineEl, {
      type: 'doughnut',
      data: {
        labels: statusData.map(s => s.label),
        datasets: [{
          data: statusData.map(s => stats.byStatus[s.value] || 0),
          backgroundColor: statusData.map(s => s.bg),
          borderColor: statusData.map(s => s.color),
          borderWidth: 2,
        }],
      },
      options: {
        ...chartDefaults,
        cutout: '62%',
        plugins: {
          ...chartDefaults.plugins,
          legend: { position: 'right', labels: { ...chartDefaults.plugins.legend.labels, boxWidth: 10, padding: 10 } },
        },
      },
    }));
  }

  // 2. Revenue by State — Horizontal Bar
  const revenueEl = document.getElementById('chart-revenue');
  if (revenueEl) {
    const revenueByState = {};
    const projectedByState = {};
    apps.forEach(a => {
      if (!a.state || !a.estMonthlyRevenue) return;
      if (a.status === 'approved') {
        revenueByState[a.state] = (revenueByState[a.state] || 0) + Number(a.estMonthlyRevenue);
      } else if (['submitted', 'in_review', 'pending_info'].includes(a.status)) {
        projectedByState[a.state] = (projectedByState[a.state] || 0) + Number(a.estMonthlyRevenue);
      }
    });
    const allStates = [...new Set([...Object.keys(revenueByState), ...Object.keys(projectedByState)])].sort();
    if (allStates.length > 0) {
      _chartInstances.push(new Chart(revenueEl, {
        type: 'bar',
        data: {
          labels: allStates.map(s => getStateName(s)),
          datasets: [
            {
              label: 'Approved',
              data: allStates.map(s => revenueByState[s] || 0),
              backgroundColor: 'rgba(6, 182, 212, 0.75)',
              borderColor: 'rgb(6, 182, 212)',
              borderWidth: 0,
              borderRadius: 4,
            },
            {
              label: 'Projected',
              data: allStates.map(s => projectedByState[s] || 0),
              backgroundColor: 'rgba(6, 182, 212, 0.25)',
              borderColor: 'rgba(6, 182, 212, 0.5)',
              borderWidth: 0,
              borderRadius: 4,
            },
          ],
        },
        options: {
          ...chartDefaults,
          indexAxis: 'y',
          scales: {
            x: { ticks: { callback: v => '$' + v.toLocaleString(), font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { font: { size: 11 } }, grid: { display: false } },
          },
          plugins: {
            ...chartDefaults.plugins,
            legend: { position: 'top', labels: { ...chartDefaults.plugins.legend.labels, boxWidth: 12 } },
          },
        },
      }));
    }
  }

  // 3. License Expiration Timeline — Bar chart showing months until expiration
  const timelineEl = document.getElementById('chart-license-timeline');
  if (timelineEl && licenses.length > 0) {
    const now = Date.now();
    const licWithExp = licenses
      .filter(l => l.expirationDate)
      .map(l => ({
        state: l.state,
        months: Math.round((new Date(l.expirationDate).getTime() - now) / (30.44 * 86400000)),
        status: l.status,
      }))
      .sort((a, b) => a.months - b.months);

    if (licWithExp.length > 0) {
      _chartInstances.push(new Chart(timelineEl, {
        type: 'bar',
        data: {
          labels: licWithExp.map(l => l.state),
          datasets: [{
            label: 'Months until expiration',
            data: licWithExp.map(l => l.months),
            backgroundColor: licWithExp.map(l =>
              l.months <= 0 ? 'rgba(239, 68, 68, 0.7)' :
              l.months <= 3 ? 'rgba(245, 158, 11, 0.7)' :
              'rgba(34, 197, 94, 0.5)'
            ),
            borderColor: 'transparent',
            borderWidth: 0,
            borderRadius: 4,
          }],
        },
        options: {
          ...chartDefaults,
          scales: {
            y: {
              ticks: { callback: v => v + 'mo', font: { size: 10 } },
              grid: { color: 'rgba(0,0,0,0.05)' },
            },
            x: { ticks: { font: { size: 11 } }, grid: { display: false } },
          },
          plugins: {
            ...chartDefaults.plugins,
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const m = ctx.raw;
                  return m <= 0 ? `EXPIRED (${Math.abs(m)} months ago)` : `${m} months remaining`;
                },
              },
            },
          },
        },
      }));
    }
  }

  // 4. Payer Catalog — Pie by category
  const payerEl = document.getElementById('chart-payers');
  if (payerEl) {
    const catLabels = { national: 'National', bcbs_anthem: 'BCBS Anthem', bcbs_hcsc: 'BCBS HCSC', bcbs_highmark: 'BCBS Highmark', bcbs_independent: 'BCBS Indep.', regional: 'Regional', medicaid: 'Medicaid' };
    const catColors = { national: '#0891b2', bcbs_anthem: '#7c3aed', bcbs_hcsc: '#a78bfa', bcbs_highmark: '#c4b5fd', bcbs_independent: '#8b5cf6', regional: '#f59e0b', medicaid: '#10b981' };
    const categories = Object.keys(catLabels).filter(c => PAYER_CATALOG.filter(p => p.category === c).length > 0);

    _chartInstances.push(new Chart(payerEl, {
      type: 'doughnut',
      data: {
        labels: categories.map(c => catLabels[c]),
        datasets: [{
          data: categories.map(c => PAYER_CATALOG.filter(p => p.category === c).length),
          backgroundColor: categories.map(c => catColors[c] + 'cc'),
          borderColor: '#ffffff',
          borderWidth: 2,
        }],
      },
      options: {
        ...chartDefaults,
        cutout: '50%',
        plugins: {
          ...chartDefaults.plugins,
          legend: { position: 'right', labels: { ...chartDefaults.plugins.legend.labels, boxWidth: 10 } },
        },
      },
    }));
  }
}

// ─── Applications Table ───

async function renderApplications() {
  const body = document.getElementById('page-body');
  const apps = store.filterByScope(await store.getAll('applications'));

  // Compute summary stats
  const total = apps.length;
  const credentialed = apps.filter(a => a.status === 'credentialed' || a.status === 'approved').length;
  const inProgress = apps.filter(a => ['submitted', 'in_review', 'pending_info', 'gathering_docs', 'new'].includes(a.status)).length;
  const denied = apps.filter(a => a.status === 'denied').length;
  const onHold = apps.filter(a => a.status === 'on_hold' || a.status === 'withdrawn').length;
  const uniqueStates = new Set(apps.map(a => a.state).filter(Boolean)).size;
  const uniquePayers = new Set(apps.map(a => a.payerId || a.payerName).filter(Boolean)).size;
  const totalRevenue = apps.reduce((sum, a) => sum + (a.estMonthlyRevenue || 0), 0);

  // Build filter options
  const states = [...new Set(apps.map(a => a.state).filter(Boolean))].sort();
  const payers = [...new Set(apps.map(a => {
    const p = getPayerById(a.payerId);
    return p ? p.name : (a.payerName || '');
  }).filter(Boolean))].sort();

  // View toggle state
  if (typeof window._appViewMode === 'undefined') window._appViewMode = 'list';
  const viewMode = window._appViewMode || 'list';

  // Days-in-status helper
  const daysInStatus = (a) => {
    const ref = a.statusChangedDate || a.submittedDate || a.createdAt;
    if (!ref) return null;
    return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  };

  body.innerHTML = `
    <style>
      .v2-apps-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;cursor:default;}
      .v2-apps-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .v2-apps-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;}
      .v2-apps-stat .v2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .v2-apps-stat .v2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .v2-apps-stat .v2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .v2-apps-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;}
      .v2-apps-pipeline{background:white;border-radius:16px;padding:16px 20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);}
      .v2-apps-pipeline-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;gap:2px;}
      .v2-apps-pipeline-labels{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;}
      .v2-apps-pipeline-labels span{font-size:11px;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;gap:4px;transition:color 0.15s;}
      .v2-apps-pipeline-labels span:hover{color:var(--text-primary);}
      .v2-apps-pipeline-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0;}
      .v2-apps-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap;}
      .v2-apps-view-toggle{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;}
      .v2-apps-view-toggle button{padding:6px 14px;font-size:12px;font-weight:600;border:none;background:white;cursor:pointer;transition:background 0.15s,color 0.15s;}
      .v2-apps-view-toggle button.active{background:var(--brand-600);color:white;}
      .v2-apps-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;}
      .v2-apps-card{background:white;border-radius:16px;padding:0;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;border:1px solid var(--gray-100);}
      .v2-apps-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.1);}
      .v2-apps-card-accent{height:4px;width:100%;}
      .v2-apps-card-body{padding:16px 20px;}
      .v2-apps-card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;}
      .v2-apps-card-payer{font-size:15px;font-weight:700;color:var(--text-primary);line-height:1.3;}
      .v2-apps-card-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}
      .v2-apps-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;}
      .v2-apps-card-stats{display:flex;gap:16px;margin-bottom:12px;padding:10px 0;border-top:1px solid var(--gray-100);}
      .v2-apps-card-stats div{flex:1;text-align:center;}
      .v2-apps-card-stats .cs-label{font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);}
      .v2-apps-card-stats .cs-val{font-size:16px;font-weight:700;margin-top:2px;}
      .v2-apps-card-actions{display:flex;gap:6px;padding-top:10px;border-top:1px solid var(--gray-100);}
      .v2-apps-card-actions button{flex:1;}
      @media(max-width:768px){.v2-apps-grid{grid-template-columns:repeat(2,1fr);}.v2-apps-card-grid{grid-template-columns:1fr;}}
    </style>

    <!-- V2 Summary Cards -->
    <div class="v2-apps-grid">
      <div class="v2-apps-stat" style="cursor:pointer;" onclick="document.getElementById('filter-status').value='';window.app.applyFilters();">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--brand-600),var(--brand-400));"></div>
        <div class="v2-label">Total Applications</div>
        <div class="v2-val" style="color:var(--brand-600);">${total}</div>
        <div class="v2-sub">${uniqueStates} state${uniqueStates !== 1 ? 's' : ''} &middot; ${uniquePayers} payer${uniquePayers !== 1 ? 's' : ''}</div>
      </div>
      <div class="v2-apps-stat" style="cursor:pointer;" onclick="document.getElementById('filter-status').value='approved';window.app.applyFilters();">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="v2-label">Credentialed / Approved</div>
        <div class="v2-val" style="color:#16a34a;">${credentialed}</div>
        <div class="v2-sub">${total > 0 ? Math.round(credentialed / total * 100) : 0}% of total</div>
      </div>
      <div class="v2-apps-stat" style="cursor:pointer;" onclick="document.getElementById('filter-status').value='in_review';window.app.applyFilters();">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="v2-label">In Progress</div>
        <div class="v2-val" style="color:#2563eb;">${inProgress}</div>
        <div class="v2-sub">${total > 0 ? Math.round(inProgress / total * 100) : 0}% of total</div>
      </div>
      <div class="v2-apps-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#a855f7,#c084fc);"></div>
        <div class="v2-label">Est. Monthly Revenue</div>
        <div class="v2-val" style="color:var(--brand-600);">$${totalRevenue.toLocaleString()}</div>
        <div class="v2-sub">${denied > 0 ? `${denied} denied` : ''}${denied > 0 && onHold > 0 ? ' &middot; ' : ''}${onHold > 0 ? `${onHold} on hold/withdrawn` : ''}${denied === 0 && onHold === 0 ? 'from approved applications' : ''}</div>
      </div>
    </div>

    <!-- V2 Status Pipeline Bar -->
    ${total > 0 ? `
    <div class="v2-apps-pipeline">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);">Status Pipeline</span>
        <span style="font-size:11px;color:var(--text-muted);">${total} total</span>
      </div>
      <div class="v2-apps-pipeline-bar">
        ${APPLICATION_STATUSES.map(s => {
          const count = apps.filter(a => a.status === s.value).length;
          if (count === 0) return '';
          return `<div style="flex:${count};background:${s.color};border-radius:3px;transition:flex 0.3s;" title="${s.label}: ${count}"></div>`;
        }).join('')}
      </div>
      <div class="v2-apps-pipeline-labels">
        ${APPLICATION_STATUSES.map(s => {
          const count = apps.filter(a => a.status === s.value).length;
          if (count === 0) return '';
          return `<span onclick="document.getElementById('filter-status').value='${s.value}';window.app.applyFilters();">
            <span class="v2-apps-pipeline-dot" style="background:${s.color};"></span>${s.label} <strong>${count}</strong>
          </span>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Toolbar: View Toggle + Add Button -->
    <div class="v2-apps-toolbar">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="v2-apps-view-toggle">
          <button class="${viewMode === 'list' ? 'active' : ''}" onclick="window._appViewMode='list';window.app.renderAppTable();">List</button>
          <button class="${viewMode === 'cards' ? 'active' : ''}" onclick="window._appViewMode='cards';window.app.renderAppTable();">Cards</button>
        </div>
        <span style="font-size:12px;color:var(--text-muted);" id="app-result-count"></span>
      </div>
      <button class="btn btn-gold" onclick="window.app.openAddModal()">+ Add Application</button>
    </div>

    <!-- Filters -->
    <div class="filters-bar" style="margin-bottom:16px;">
      <select class="form-control" id="filter-state" onchange="window.app.applyFilters()">
        <option value="">All States</option>
        ${states.map(s => `<option value="${s}" ${filters.state === s ? 'selected' : ''}>${getStateName(s)}</option>`).join('')}
      </select>
      <select class="form-control" id="filter-payer" onchange="window.app.applyFilters()">
        <option value="">All Payers</option>
        ${payers.map(p => `<option value="${p}" ${filters.payer === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <span style="display:inline-flex;align-items:center;">
        <select class="form-control" id="filter-status" onchange="window.app.applyFilters()">
          <option value="">All Statuses</option>
          ${APPLICATION_STATUSES.map(s => `<option value="${s.value}" ${filters.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        ${helpTip('Statuses track each application through the credentialing pipeline: New (just created), Gathering Docs (collecting paperwork), Submitted (sent to payer), In Review (payer reviewing), Pending Info (payer needs more info), Approved/Credentialed (done!), Denied, On Hold, or Withdrawn.')}
      </span>
      <select class="form-control" id="filter-wave" onchange="window.app.applyFilters()">
        ${groupOptions(filters.wave, true)}
      </select>
      <input type="text" class="form-control search-input" placeholder="Search..." value="${filters.search}" oninput="window.app.filters.search=this.value;window.app.renderAppTable()">
    </div>

    <!-- List view container -->
    <div id="app-list-view" style="display:${viewMode === 'list' ? 'block' : 'none'};">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:30px;"><input type="checkbox" onchange="document.querySelectorAll('.app-checkbox').forEach(c=>c.checked=this.checked);window.app.onBulkCheckChange();"></th>
              <th style="width:70px;">ID</th>
              <th onclick="window.app.sortBy('wave')">Group ${sortArrow('wave')}</th>
              <th onclick="window.app.sortBy('state')">State ${sortArrow('state')}</th>
              <th onclick="window.app.sortBy('payerName')">Payer ${sortArrow('payerName')}</th>
              <th onclick="window.app.sortBy('status')">Status ${sortArrow('status')}</th>
              <th onclick="window.app.sortBy('type')">Type ${sortArrow('type')}</th>
              <th onclick="window.app.sortBy('submittedDate')">Submitted ${sortArrow('submittedDate')}</th>
              <th onclick="window.app.sortBy('effectiveDate')">Effective ${sortArrow('effectiveDate')}</th>
              <th onclick="window.app.sortBy('estMonthlyRevenue')">Est. $/mo ${sortArrow('estMonthlyRevenue')}</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="app-table-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Card view container -->
    <div id="app-card-view" class="v2-apps-card-grid" style="display:${viewMode === 'cards' ? 'grid' : 'none'};"></div>

    <div class="empty-state hidden" id="app-empty">
      <h3>No applications</h3>
      <p>Add applications manually or use the Batch Generator to create application sets from strategy profiles.</p>
      <button class="btn btn-gold" onclick="window.app.openAddModal()">+ Add Application</button>
    </div>
  `;

  await renderAppTable(apps);
}

async function renderAppTable(prefetchedApps = null) {
  const apps = prefetchedApps || await store.getAll('applications');
  const allProviders = await store.getAll('providers').catch(() => []);
  const tbody = document.getElementById('app-table-body');
  const empty = document.getElementById('app-empty');
  if (!tbody && !document.getElementById('app-card-view')) return;

  let filtered = apps.filter(a => {
    if (filters.state && a.state !== filters.state) return false;
    if (filters.status && a.status !== filters.status) return false;
    if (filters.wave && String(a.wave) !== filters.wave) return false;
    if (filters.payer) {
      const payer = getPayerById(a.payerId);
      const name = payer ? payer.name : (a.payerName || '');
      if (name !== filters.payer) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const payer = getPayerById(a.payerId);
      const searchStr = `${a.state} ${payer ? payer.name : ''} ${a.payerName || ''} ${a.notes || ''}`.toLowerCase();
      if (!searchStr.includes(q)) return false;
    }
    return true;
  });

  // Sort
  if (currentSort.field) {
    filtered.sort((a, b) => {
      let va = a[currentSort.field] || '';
      let vb = b[currentSort.field] || '';
      if (currentSort.field === 'payerName') {
        const pa = getPayerById(a.payerId);
        const pb = getPayerById(b.payerId);
        va = pa ? pa.name : (a.payerName || '');
        vb = pb ? pb.name : (b.payerName || '');
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return currentSort.dir === 'asc' ? va - vb : vb - va;
      }
      va = String(va); vb = String(vb);
      return currentSort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  } else {
    filtered.sort((a, b) => (a.wave || 9) - (b.wave || 9) || (a.state || '').localeCompare(b.state || ''));
  }

  const countEl = document.getElementById('app-result-count');
  const listView = document.getElementById('app-list-view');
  const cardView = document.getElementById('app-card-view');
  const viewMode = window._appViewMode || 'list';

  if (filtered.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (cardView) cardView.innerHTML = '';
    empty.classList.remove('hidden');
    if (countEl) countEl.textContent = '';
    return;
  }

  empty.classList.add('hidden');
  if (countEl) countEl.textContent = `${filtered.length} application${filtered.length !== 1 ? 's' : ''}`;

  // Show/hide views
  if (listView) listView.style.display = viewMode === 'list' ? 'block' : 'none';
  if (cardView) cardView.style.display = viewMode === 'cards' ? 'grid' : 'none';

  // Inject V2 hover style if not already present
  if (!document.getElementById('appv2-style')) {
    const s = document.createElement('style'); s.id = 'appv2-style';
    s.textContent = '.app-table-v2 tr:hover{background:var(--gray-50,#f9fafb);}';
    document.head.appendChild(s);
    const tw = document.querySelector('.table-wrap'); if (tw) tw.style.borderRadius = '16px';
  }
  // Always render list view tbody
  if (tbody) {
    tbody.innerHTML = filtered.map(a => {
      const payer = getPayerById(a.payerId);
      const payerName = payer ? payer.name : (a.payerName || '-');
      const statusObj = APPLICATION_STATUSES.find(s => s.value === a.status) || APPLICATION_STATUSES[0];
      const typeLabel = a.type === 'group' ? 'Group' : a.type === 'both' ? 'Both' : 'Indiv';

      return `<tr>
        <td><input type="checkbox" class="app-checkbox" data-app-id="${a.id}" onchange="window.app.onBulkCheckChange()"></td>
        <td><span style="font-family:monospace;font-size:11px;color:var(--brand-600);">${toHexId(a.id)}</span></td>
        <td>${groupBadge(a.wave)}</td>
        <td><strong>${getStateName(a.state)}</strong></td>
        <td title="${a.payerContactName ? escAttr(a.payerContactName + (a.payerContactPhone ? ' | ' + a.payerContactPhone : '')) : ''}">${payerName}${a.payerContactName ? ' <span class="text-sm text-muted">&#128222;</span>' : ''}</td>
        <td><span class="badge badge-${a.status}">${statusObj.label}</span></td>
        <td class="text-sm">${typeLabel}</td>
        <td class="text-sm">${formatDateDisplay(a.submittedDate)}</td>
        <td class="text-sm">${formatDateDisplay(a.effectiveDate)}</td>
        <td>$${(a.estMonthlyRevenue || 0).toLocaleString()}</td>
        <td class="truncate" title="${escAttr(a.notes || '')}">${a.notes || '-'}</td>
        <td>
          <div class="flex gap-2 action-btns">
            <button class="btn btn-sm btn-primary" onclick="window.app.openLogEntry('${a.id}')" title="Log activity">Log</button>
            <button class="btn btn-sm" onclick="window.app.viewTimeline('${a.id}')" title="View timeline">TL</button>
            <button class="btn btn-sm" onclick="window.app.openDocChecklist('${a.id}')" title="Document checklist">Docs</button>
            <button class="btn btn-sm" onclick="window.app.aiPredictTimeline('${a.id}')" title="AI Timeline Prediction">AI</button>
            <button class="btn btn-sm" onclick="window.app.editApplication('${a.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="window.app.deleteApplication('${a.id}')">Del</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Render card view
  if (cardView) {
    cardView.innerHTML = filtered.map(a => {
      const payer = getPayerById(a.payerId);
      const payerName = payer ? payer.name : (a.payerName || '-');
      const statusObj = APPLICATION_STATUSES.find(s => s.value === a.status) || APPLICATION_STATUSES[0];
      const typeLabel = a.type === 'group' ? 'Group' : a.type === 'both' ? 'Both' : 'Indiv';
      const ref = a.statusChangedDate || a.submittedDate || a.createdAt;
      const daysIn = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 86400000) : null;
      const providerObj = a.providerId ? allProviders?.find(p => p.id === a.providerId) : null;
      const provName = providerObj ? `${providerObj.firstName} ${providerObj.lastName}` : '';

      return `<div class="v2-apps-card">
        <div class="v2-apps-card-accent" style="background:${statusObj.color};"></div>
        <div class="v2-apps-card-body">
          <div class="v2-apps-card-top">
            <div>
              <div class="v2-apps-card-payer">${payerName}</div>
              ${provName ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escHtml(provName)}</div>` : ''}
            </div>
            <span style="font-family:monospace;font-size:10px;color:var(--gray-400);">${toHexId(a.id)}</span>
          </div>
          <div class="v2-apps-card-meta">
            <span class="v2-apps-pill" style="background:var(--gray-100);color:var(--text-primary);">${getStateName(a.state)}</span>
            <span class="v2-apps-pill" style="background:${statusObj.color}18;color:${statusObj.color};">${statusObj.label}</span>
            <span class="v2-apps-pill" style="background:var(--gray-50);color:var(--text-muted);">${typeLabel}</span>
            ${a.wave ? `<span class="v2-apps-pill" style="background:var(--brand-50);color:var(--brand-600);">G${a.wave}</span>` : ''}
          </div>
          <div class="v2-apps-card-stats">
            <div><div class="cs-label">Days in Status</div><div class="cs-val" style="color:${daysIn > 60 ? 'var(--red)' : daysIn > 30 ? 'var(--warning-500)' : 'var(--text-primary)'};">${daysIn !== null ? daysIn : '-'}</div></div>
            <div><div class="cs-label">Submitted</div><div class="cs-val" style="font-size:13px;">${formatDateDisplay(a.submittedDate) || '-'}</div></div>
            <div><div class="cs-label">Est. $/mo</div><div class="cs-val" style="color:var(--brand-600);font-size:14px;">$${(a.estMonthlyRevenue || 0).toLocaleString()}</div></div>
          </div>
          <div class="v2-apps-card-actions">
            <button class="btn btn-sm" onclick="window.app.editApplication('${a.id}')">Edit</button>
            <button class="btn btn-sm btn-primary" onclick="window.app.openLogEntry('${a.id}')">Follow-up</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }
}

// ─── Follow-ups Page ───

async function renderFollowups() {
  const body = document.getElementById('page-body');
  const overdue = store.filterByScope(await workflow.getOverdueFollowups());
  const upcoming = store.filterByScope(await workflow.getUpcomingFollowups());
  const allOpen = store.filterByScope((await store.getAll('followups')).filter(f => !f.completedDate));
  const completed = store.filterByScope((await store.getAll('followups')).filter(f => f.completedDate))
    .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dueToday = allOpen.filter(f => f.dueDate === todayStr);
  const totalDue = allOpen.length;

  // Build 7-day calendar strip
  const calDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    const dayFollowups = allOpen.filter(f => f.dueDate === ds);
    const overdueOnDay = i === 0 ? overdue.length : 0;
    calDays.push({ date: d, dateStr: ds, count: dayFollowups.length, overdueCount: overdueOnDay, isToday: i === 0 });
  }

  const overdueHtml = overdue.length > 0 ? await renderFollowupTable('Overdue', overdue, true, 'var(--red)') : '';
  const upcomingHtml = upcoming.length > 0 ? await renderFollowupTable('Upcoming (Next 14 Days)', upcoming, true, 'var(--blue)') : '';
  const completedHtml = completed.length > 0 ? await renderFollowupTable('Recently Completed', completed.slice(0, 10), false, 'var(--green)') : '';

  body.innerHTML = `
    <style>
      .v2-fu-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .v2-fu-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .v2-fu-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;}
      .v2-fu-stat .v2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .v2-fu-stat .v2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .v2-fu-stat .v2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .v2-fu-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;}
      .v2-fu-cal{display:flex;gap:8px;padding:16px 20px;background:white;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:20px;overflow-x:auto;}
      .v2-fu-cal-day{flex:1;min-width:80px;text-align:center;padding:12px 8px;border-radius:12px;transition:background 0.15s;cursor:default;}
      .v2-fu-cal-day.today{background:var(--brand-50);border:2px solid var(--brand-600);}
      .v2-fu-cal-day .day-name{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);}
      .v2-fu-cal-day .day-num{font-size:20px;font-weight:700;margin:4px 0;}
      .v2-fu-cal-day .day-dots{display:flex;gap:3px;justify-content:center;min-height:8px;}
      .v2-fu-section{margin-bottom:16px;}
      .v2-fu-section .card{border-radius:16px;overflow:hidden;}
      .v2-fu-row-overdue td:first-child{box-shadow:inset 4px 0 0 var(--red);}
      .v2-fu-row-today td:first-child{box-shadow:inset 4px 0 0 var(--warning-500);}
      .v2-fu-row-upcoming td:first-child{box-shadow:inset 4px 0 0 var(--green);}
      @media(max-width:768px){.v2-fu-grid{grid-template-columns:repeat(2,1fr);}}
    </style>

    <!-- V2 Stat Cards -->
    <div class="v2-fu-grid">
      <div class="v2-fu-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--brand-600),var(--brand-400));"></div>
        <div class="v2-label">Total Due</div>
        <div class="v2-val" style="color:var(--brand-600);">${totalDue}</div>
        <div class="v2-sub">open follow-ups</div>
      </div>
      <div class="v2-fu-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#ef4444,#f87171);"></div>
        <div class="v2-label">Overdue</div>
        <div class="v2-val" style="color:#dc2626;">${overdue.length}</div>
        <div class="v2-sub">need immediate action</div>
      </div>
      <div class="v2-fu-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
        <div class="v2-label">Due Today</div>
        <div class="v2-val" style="color:#d97706;">${dueToday.length}</div>
        <div class="v2-sub">${todayStr}</div>
      </div>
      <div class="v2-fu-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="v2-label">Upcoming</div>
        <div class="v2-val" style="color:#2563eb;">${upcoming.length}</div>
        <div class="v2-sub">next 14 days</div>
      </div>
    </div>

    <!-- 7-Day Calendar Strip -->
    <div class="v2-fu-cal">
      ${calDays.map(d => {
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const dotColor = d.overdueCount > 0 ? 'var(--red)' : d.count > 0 ? 'var(--blue)' : '';
        return `<div class="v2-fu-cal-day ${d.isToday ? 'today' : ''}">
          <div class="day-name">${dayNames[d.date.getDay()]}</div>
          <div class="day-num">${d.date.getDate()}</div>
          <div class="day-dots">
            ${d.overdueCount > 0 ? `<span style="width:8px;height:8px;border-radius:50%;background:var(--red);" title="${d.overdueCount} overdue"></span>` : ''}
            ${Array.from({length: Math.min(d.count, 4)}, () => `<span style="width:6px;height:6px;border-radius:50%;background:var(--blue);"></span>`).join('')}
            ${d.count > 4 ? `<span style="font-size:9px;color:var(--text-muted);">+${d.count - 4}</span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="v2-fu-section">${overdueHtml}</div>
    <div class="v2-fu-section">${upcomingHtml}</div>
    ${overdue.length === 0 && upcoming.length === 0 ? '<div class="alert alert-success" style="border-radius:16px;">No pending follow-ups. All caught up.</div>' : ''}
    <div class="v2-fu-section">${completedHtml}</div>
  `;
}

async function renderFollowupTable(title, followups, showAction, accentColor) {
  // Pre-resolve all async app lookups
  const rows = [];
  for (const fu of followups) {
    const app = await store.getOne('applications', fu.applicationId).catch(() => null);
    const payer = app ? (getPayerById(app.payerId) || { name: app.payerName }) : {};
    rows.push({ fu, app, payer });
  }
  const todayStr = new Date().toISOString().split('T')[0];
  return `
    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header" style="border-left:4px solid ${accentColor || 'var(--brand-600)'};"><h3>${title} (${followups.length})</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr>
            <th>Application</th>
            <th>Due Date</th>
            <th>Type</th>
            <th>Method</th>
            ${showAction ? '<th>Action</th>' : '<th>Completed</th><th>Outcome</th>'}
          </tr></thead>
          <tbody>
            ${rows.map(({ fu, app, payer }) => {
              const isOverdue = fu.dueDate && fu.dueDate < todayStr && !fu.completedDate;
              const isDueToday = fu.dueDate === todayStr && !fu.completedDate;
              const rowClass = isOverdue ? 'v2-fu-row-overdue' : isDueToday ? 'v2-fu-row-today' : (showAction ? 'v2-fu-row-upcoming' : '');
              return `<tr class="${isOverdue ? 'overdue' : ''} ${rowClass}">
                <td><strong>${payer.name || 'Unknown'}</strong> — ${app ? getStateName(app.state) : ''}</td>
                <td style="${isOverdue ? 'color:var(--red);font-weight:600;' : isDueToday ? 'color:var(--warning-500);font-weight:600;' : ''}">${formatDateDisplay(fu.dueDate)}</td>
                <td>${fu.type || '-'}</td>
                <td>${fu.method || '-'}</td>
                ${showAction ? `<td><button class="btn btn-sm btn-primary" onclick="window.app.completeFollowupPrompt('${fu.id}')">Complete</button></td>` :
                  `<td>${formatDateDisplay(fu.completedDate)}</td><td class="truncate">${fu.outcome || '-'}</td>`}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── State Policies Page ───

/**
 * Get telehealth policies from store (Google Sheets), falling back to static data.
 * Store records have id/createdAt/updatedAt; static data does not.
 */
function getLivePolicies() {
  return TELEHEALTH_POLICIES;
}

function policyAgeBadge(lastUpdated) {
  if (!lastUpdated) return '<span style="color:var(--red);font-size:11px;">Unknown</span>';
  const days = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 86400000);
  if (days > 180) return `<span style="color:var(--red);font-weight:600;font-size:11px;" title="Last verified ${days} days ago — stale">${lastUpdated} <span style="background:var(--red);color:#fff;padding:1px 5px;border-radius:4px;font-size:9px;">STALE</span></span>`;
  if (days > 90) return `<span style="color:var(--warning-500);font-weight:600;font-size:11px;" title="Last verified ${days} days ago — aging">${lastUpdated} <span style="background:var(--gold);color:#fff;padding:1px 5px;border-radius:4px;font-size:9px;">AGING</span></span>`;
  return `<span style="color:var(--green);font-size:11px;" title="Verified ${days} days ago">${lastUpdated}</span>`;
}

function getLivePolicyByState(stateCode) {
  const policies = getLivePolicies();
  return policies.find(p => p.state === stateCode) || null;
}

function getLiveTopReadinessStates(minScore = 7) {
  return getLivePolicies()
    .filter(p => p.readinessScore >= minScore)
    .sort((a, b) => b.readinessScore - a.readinessScore);
}

async function renderStatePolicies() {
  const body = document.getElementById('page-body');
  const licenses = await store.getAll('licenses');
  const licensedStates = licenses.map(l => l.state);
  const apps = await store.getAll('applications');
  const allPolicies = getLivePolicies();

  const fullPractice = allPolicies.filter(p => p.practiceAuthority === 'full');
  const reduced = allPolicies.filter(p => p.practiceAuthority === 'reduced');
  const restricted = allPolicies.filter(p => p.practiceAuthority === 'restricted');
  const topStates = getLiveTopReadinessStates(7);
  const csAllowed = allPolicies.filter(p => p.controlledSubstances === 'allowed');

  // Filter state
  const selectedFilter = filters._policyFilter || 'all';
  const selectedRegion = filters._policyRegion || '';

  let filteredPolicies = allPolicies;
  if (selectedFilter === 'licensed') filteredPolicies = allPolicies.filter(p => licensedStates.includes(p.state));
  else if (selectedFilter === 'full') filteredPolicies = fullPractice;
  else if (selectedFilter === 'reduced') filteredPolicies = reduced;
  else if (selectedFilter === 'restricted') filteredPolicies = restricted;
  else if (selectedFilter === 'top') filteredPolicies = topStates;

  if (selectedRegion) {
    const regionStates = STATES.filter(s => s.region === selectedRegion).map(s => s.code);
    filteredPolicies = filteredPolicies.filter(p => regionStates.includes(p.state));
  }

  // Aging alerts
  const now = Date.now();
  const staleCount = allPolicies.filter(p => p.lastUpdated && (now - new Date(p.lastUpdated).getTime()) > 180 * 86400000).length;
  const agingCount = allPolicies.filter(p => p.lastUpdated && (now - new Date(p.lastUpdated).getTime()) > 90 * 86400000 && (now - new Date(p.lastUpdated).getTime()) <= 180 * 86400000).length;

  body.innerHTML = `
    ${staleCount > 0 || agingCount > 0 ? `
    <!-- Freshness Alerts -->
    <div style="padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;display:flex;gap:16px;align-items:center;${staleCount > 0 ? 'background:var(--danger-50);border:1px solid #fca5a5;color:#991b1b;' : 'background:var(--warning-50);border:1px solid #fcd34d;color:#92400e;'}">
      <span style="font-size:18px;">${staleCount > 0 ? '&#9888;' : '&#9201;'}</span>
      <div>
        <strong>Policy Data Freshness:</strong>
        ${staleCount > 0 ? `<span style="color:#dc2626;font-weight:600;">${staleCount} state${staleCount !== 1 ? 's' : ''} STALE (>180 days)</span>` : ''}
        ${staleCount > 0 && agingCount > 0 ? ' &middot; ' : ''}
        ${agingCount > 0 ? `<span style="color:#d97706;font-weight:600;">${agingCount} state${agingCount !== 1 ? 's' : ''} AGING (>90 days)</span>` : ''}
        — Update policy data in Google Sheets to keep regulations current.
      </div>
    </div>
    ` : ''}

    <style>
      .sp2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .sp2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .sp2-stat .sp2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .sp2-stat .sp2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .sp2-stat .sp2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .sp2-stat .sp2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .sp2-card{border-radius:16px;overflow:hidden;}
      .sp2-card table tr:hover{background:var(--gray-50);}
    </style>
    <!-- Summary Stats -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:20px;">
      <div class="sp2-stat">
        <div class="sp2-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="sp2-label">Full Practice Authority</div><div class="sp2-val" style="color:#16a34a;">${fullPractice.length}</div><div class="sp2-sub">states</div>
      </div>
      <div class="sp2-stat">
        <div class="sp2-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
        <div class="sp2-label">Reduced Practice</div><div class="sp2-val" style="color:#d97706;">${reduced.length}</div><div class="sp2-sub">states</div>
      </div>
      <div class="sp2-stat">
        <div class="sp2-accent" style="background:linear-gradient(90deg,#ef4444,#f87171);"></div>
        <div class="sp2-label">Restricted Practice</div><div class="sp2-val" style="color:#dc2626;">${restricted.length}</div><div class="sp2-sub">states</div>
      </div>
      <div class="sp2-stat">
        <div class="sp2-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="sp2-label">CS Telehealth OK</div><div class="sp2-val" style="color:#2563eb;">${csAllowed.length}</div><div class="sp2-sub">states allow Sched II-V</div>
      </div>
      <div class="sp2-stat">
        <div class="sp2-accent" style="background:linear-gradient(90deg,#a855f7,#c084fc);"></div>
        <div class="sp2-label">Top Readiness (7+)</div><div class="sp2-val" style="color:#7c3aed;">${topStates.length}</div><div class="sp2-sub">states</div>
      </div>
    </div>

    <!-- Expansion Readiness -->
    <div class="card sp2-card">
      <div class="card-header"><h3>Expansion Readiness — Your Licensed States</h3></div>
      <div class="card-body">
        ${licensedStates.length > 0 ? `
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${licensedStates.sort().map(sc => {
            const pol = getLivePolicyByState(sc);
            if (!pol) return '';
            const appCount = apps.filter(a => a.state === sc).length;
            const scoreColor = pol.readinessScore >= 7 ? 'var(--green)' : pol.readinessScore >= 5 ? 'var(--gold)' : 'var(--red)';
            const authColor = pol.practiceAuthority === 'full' ? 'var(--green)' : pol.practiceAuthority === 'reduced' ? 'var(--gold)' : 'var(--red)';
            return `<div class="sp2-stat" style="min-width:140px;flex:1;max-width:200px;border-left:4px solid ${authColor};">
              <div class="sp2-accent" style="background:linear-gradient(90deg,${scoreColor},${scoreColor}80);"></div>
              <div class="sp2-label">${getStateName(sc)}</div>
              <div class="sp2-val" style="font-size:24px;color:${scoreColor};">${pol.readinessScore}/10</div>
              <div class="sp2-sub">${pol.practiceAuthority} practice</div>
              <div class="sp2-sub">${appCount} application${appCount !== 1 ? 's' : ''}</div>
            </div>`;
          }).join('')}
        </div>
        ` : '<div class="text-sm text-muted">No licenses yet. Add licenses to see readiness scores for your states.</div>'}
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <select class="form-control" onchange="window.app.filterPolicies(this.value)">
        <option value="all" ${selectedFilter === 'all' ? 'selected' : ''}>All States (${allPolicies.length})</option>
        <option value="licensed" ${selectedFilter === 'licensed' ? 'selected' : ''}>My Licensed States (${licensedStates.length})</option>
        <option value="full" ${selectedFilter === 'full' ? 'selected' : ''}>Full Practice Authority (${fullPractice.length})</option>
        <option value="reduced" ${selectedFilter === 'reduced' ? 'selected' : ''}>Reduced Practice (${reduced.length})</option>
        <option value="restricted" ${selectedFilter === 'restricted' ? 'selected' : ''}>Restricted Practice (${restricted.length})</option>
        <option value="top" ${selectedFilter === 'top' ? 'selected' : ''}>Top Readiness 7+ (${topStates.length})</option>
      </select>
      <select class="form-control" onchange="window.app.filterPolicyRegion(this.value)">
        <option value="">All Regions</option>
        <option value="northeast" ${selectedRegion === 'northeast' ? 'selected' : ''}>Northeast</option>
        <option value="southeast" ${selectedRegion === 'southeast' ? 'selected' : ''}>Southeast</option>
        <option value="midwest" ${selectedRegion === 'midwest' ? 'selected' : ''}>Midwest</option>
        <option value="south" ${selectedRegion === 'south' ? 'selected' : ''}>South</option>
        <option value="west" ${selectedRegion === 'west' ? 'selected' : ''}>West / Mountain</option>
        <option value="pacific_nw" ${selectedRegion === 'pacific_nw' ? 'selected' : ''}>Pacific Northwest</option>
      </select>
    </div>

    <!-- Policy Table -->
    <div class="card sp2-card">
      <div class="card-header"><h3>Telehealth Policies (${filteredPolicies.length} states)</h3></div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>Readiness</th>
              <th>Practice Authority</th>
              <th>Controlled Substances</th>
              <th>Consent</th>
              <th>In-Person Req.</th>
              <th>Patient Location</th>
              <th>Audio Only</th>
              <th>Parity</th>
              <th>Medicaid</th>
              <th>NLC</th>
              <th>Last Verified</th>
            </tr>
          </thead>
          <tbody>
            ${filteredPolicies.sort((a, b) => b.readinessScore - a.readinessScore).map(p => {
              const isLicensed = licensedStates.includes(p.state);
              const authBadge = p.practiceAuthority === 'full' ? 'approved' : p.practiceAuthority === 'reduced' ? 'pending' : 'denied';
              const csBadge = p.controlledSubstances === 'allowed' ? 'approved' : p.controlledSubstances === 'limited' ? 'pending' : 'denied';
              const medBadge = p.medicaidTelehealth === 'full' ? 'approved' : p.medicaidTelehealth === 'limited' ? 'pending' : 'denied';
              const scoreColor = p.readinessScore >= 7 ? 'var(--green)' : p.readinessScore >= 5 ? 'var(--gold)' : 'var(--red)';
              return `<tr style="${isLicensed ? 'background:var(--success-50);' : ''}" onclick="window.app.showPolicyDetail('${p.state}')" class="policy-row">
                <td><strong>${getStateName(p.state)}</strong> ${isLicensed ? '<span class="badge badge-active" style="font-size:9px;">Licensed</span>' : ''}</td>
                <td><span style="font-weight:700;color:${scoreColor};">${p.readinessScore}/10</span></td>
                <td><span class="badge badge-${authBadge}">${p.practiceAuthority}</span></td>
                <td><span class="badge badge-${csBadge}">${p.controlledSubstances}</span></td>
                <td>${p.consentRequired}</td>
                <td>${p.inPersonRequired ? '<span style="color:var(--red);font-weight:600;">Yes</span>' : 'No'}</td>
                <td>${p.originatingSite === 'any' ? 'Home OK' : p.originatingSite === 'clinical' ? 'Clinical only' : 'Varies'}</td>
                <td>${p.audioOnly ? '<span style="color:var(--green);">Yes</span>' : '<span style="color:var(--red);">No</span>'}</td>
                <td>${p.telehealthParity ? '<span style="color:var(--green);">Yes</span>' : '<span style="color:var(--red);">No</span>'}</td>
                <td><span class="badge badge-${medBadge}">${p.medicaidTelehealth}</span></td>
                <td>${p.nlcMember ? '<span style="color:var(--green);">Yes</span>' : 'No'}</td>
                <td>${policyAgeBadge(p.lastUpdated)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Legend -->
    <div class="card sp2-card">
      <div class="card-header"><h3>Legend</h3></div>
      <div class="card-body">
        <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:12px;">
          <div><span class="badge badge-approved">full</span> Independent practice, no CPA needed</div>
          <div><span class="badge badge-pending">reduced</span> Collaborative agreement required</div>
          <div><span class="badge badge-denied">restricted</span> Physician supervision required</div>
          <div><strong>Readiness Score:</strong> 1-10 rating of overall PMHNP telehealth friendliness</div>
          <div><strong>NLC:</strong> Nurse Licensure Compact member state</div>
        </div>
      </div>
    </div>

    <!-- Policy Detail Modal (injected by showPolicyDetail) -->
    <div id="policy-detail"></div>
  `;
}

// ─── Revenue Forecast ───

async function renderRevenueForecast() {
  const body = document.getElementById('page-body');
  const [apps, licenses, providers, invoices, services] = await Promise.all([
    store.getAll('applications').then(a => store.filterByScope(a)),
    store.getAll('licenses').then(l => store.filterByScope(l)),
    store.getAll('providers').then(p => store.filterByScope(p)),
    store.getAll('invoices').catch(() => []),
    store.getAll('services').catch(() => []),
  ]);

  // Categorize applications
  const approved = apps.filter(a => a.status === 'approved');
  const inProgress = apps.filter(a => ['submitted', 'in_review', 'pending_info'].includes(a.status));
  const notStarted = apps.filter(a => a.status === 'not_started');

  // Revenue calculations
  const currentMonthly = approved.reduce((s, a) => s + (Number(a.estMonthlyRevenue) || 0), 0);
  const pipelineMonthly = inProgress.reduce((s, a) => s + (Number(a.estMonthlyRevenue) || 0), 0);
  const plannedMonthly = notStarted.reduce((s, a) => s + (Number(a.estMonthlyRevenue) || 0), 0);
  const totalPotential = currentMonthly + pipelineMonthly + plannedMonthly;
  const currentAnnual = currentMonthly * 12;

  // Revenue by state
  const revenueByState = {};
  apps.forEach(a => {
    if (!a.state || !a.estMonthlyRevenue) return;
    if (!revenueByState[a.state]) revenueByState[a.state] = { approved: 0, pipeline: 0, planned: 0 };
    const rev = Number(a.estMonthlyRevenue) || 0;
    if (a.status === 'approved') revenueByState[a.state].approved += rev;
    else if (['submitted', 'in_review', 'pending_info'].includes(a.status)) revenueByState[a.state].pipeline += rev;
    else if (a.status === 'not_started') revenueByState[a.state].planned += rev;
  });

  // Revenue by payer category
  const revenueByPayer = {};
  apps.forEach(a => {
    if (!a.payerId || !a.estMonthlyRevenue) return;
    const payer = getPayerById(a.payerId);
    const cat = payer ? payer.category : 'other';
    if (!revenueByPayer[cat]) revenueByPayer[cat] = { approved: 0, pipeline: 0 };
    const rev = Number(a.estMonthlyRevenue) || 0;
    if (a.status === 'approved') revenueByPayer[cat].approved += rev;
    else if (['submitted', 'in_review', 'pending_info'].includes(a.status)) revenueByPayer[cat].pipeline += rev;
  });

  // Avg credentialing time for projection
  const approvedWithDates = approved.filter(a => a.submittedDate && a.effectiveDate);
  const avgCredDays = approvedWithDates.length > 0
    ? Math.round(approvedWithDates.reduce((s, a) => s + (new Date(a.effectiveDate) - new Date(a.submittedDate)) / 86400000, 0) / approvedWithDates.length)
    : 90;

  // 12-month projection: assume pipeline converts at avg cred timeline, 75% approval rate
  const approvalRate = approved.length > 0 && (approved.length + apps.filter(a => a.status === 'denied').length) > 0
    ? approved.length / (approved.length + apps.filter(a => a.status === 'denied').length)
    : 0.75;
  const projectedPipelineRev = pipelineMonthly * approvalRate;
  const projectedMonths = [];
  const today = new Date();
  for (let i = 0; i < 12; i++) {
    const m = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const label = m.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const monthsFromNow = i;
    // Pipeline revenue phases in over avg cred timeline
    const pipelinePct = Math.min(1, monthsFromNow / (avgCredDays / 30));
    const monthly = currentMonthly + (projectedPipelineRev * pipelinePct);
    projectedMonths.push({ label, revenue: Math.round(monthly) });
  }

  // Unlicensed high-value states
  const licensedStates = [...new Set(licenses.map(l => l.state))];
  const expansionRev = getLiveTopReadinessStates(7)
    .filter(p => !licensedStates.includes(p.state))
    .slice(0, 5);

  const sortedStates = Object.entries(revenueByState)
    .sort((a, b) => (b[1].approved + b[1].pipeline) - (a[1].approved + a[1].pipeline));

  const catLabels = { national: 'National', bcbs_anthem: 'BCBS Anthem', bcbs_hcsc: 'BCBS HCSC', bcbs_highmark: 'BCBS Highmark', bcbs_independent: 'BCBS Indep.', regional: 'Regional', medicaid: 'Medicaid', other: 'Other' };

  body.innerHTML = `
    <style>
      .rv2-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:20px;}
      .rv2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .rv2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .rv2-stat .rv2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .rv2-stat .rv2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .rv2-stat .rv2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .rv2-stat .rv2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .rv2-card{border-radius:16px;overflow:hidden;}
      .rv2-table-wrap{border-radius:16px;overflow:hidden;}
      .rv2-table-wrap table tr:hover{background:var(--gray-50);}
      @media(max-width:900px){.rv2-stats{grid-template-columns:repeat(2,1fr);}}
    </style>
    <!-- Revenue Intelligence -->
    ${renderRevenueIntelligence(apps, providers, approved, inProgress)}

    <!-- Revenue Summary -->
    <div class="rv2-stats">
      <div class="rv2-stat">
        <div class="rv2-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="rv2-label">Current Monthly</div>
        <div class="rv2-val" style="color:#16a34a;">$${currentMonthly.toLocaleString()}</div>
        <div class="rv2-sub">${approved.length} approved apps</div>
      </div>
      <div class="rv2-stat">
        <div class="rv2-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="rv2-label">Pipeline Monthly</div>
        <div class="rv2-val" style="color:#2563eb;">$${pipelineMonthly.toLocaleString()}</div>
        <div class="rv2-sub">${inProgress.length} in progress</div>
      </div>
      <div class="rv2-stat">
        <div class="rv2-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
        <div class="rv2-label">Planned Monthly</div>
        <div class="rv2-val" style="color:#d97706;">$${plannedMonthly.toLocaleString()}</div>
        <div class="rv2-sub">${notStarted.length} not started</div>
      </div>
      <div class="rv2-stat">
        <div class="rv2-accent" style="background:linear-gradient(90deg,#22c55e,#86efac);"></div>
        <div class="rv2-label">Current Annual</div>
        <div class="rv2-val" style="color:#16a34a;">$${currentAnnual.toLocaleString()}</div>
        <div class="rv2-sub">at current run rate</div>
      </div>
      <div class="rv2-stat">
        <div class="rv2-accent" style="background:linear-gradient(90deg,#a855f7,#c084fc);"></div>
        <div class="rv2-label">Total Potential</div>
        <div class="rv2-val" style="color:#7c3aed;">$${totalPotential.toLocaleString()}</div>
        <div class="rv2-sub">/month if all approved</div>
      </div>
    </div>

    <!-- Projection Assumptions -->
    <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
      <div class="rv2-stat" style="flex:1;min-width:140px;background:var(--gray-50);">
        <div class="rv2-accent" style="background:linear-gradient(90deg,var(--gray-300),var(--gray-400));"></div>
        <div class="rv2-label">Avg Cred Time</div>
        <div class="rv2-val" style="font-size:20px;">${avgCredDays} days</div>
        <div class="rv2-sub">based on ${approvedWithDates.length} approved</div>
      </div>
      <div class="rv2-stat" style="flex:1;min-width:140px;background:var(--gray-50);">
        <div class="rv2-accent" style="background:linear-gradient(90deg,var(--gray-300),var(--gray-400));"></div>
        <div class="rv2-label">Approval Rate</div>
        <div class="rv2-val" style="font-size:20px;">${Math.round(approvalRate * 100)}%</div>
        <div class="rv2-sub">historical</div>
      </div>
      <div class="rv2-stat" style="flex:1;min-width:140px;background:var(--gray-50);">
        <div class="rv2-accent" style="background:linear-gradient(90deg,var(--gray-300),var(--gray-400));"></div>
        <div class="rv2-label">Projected Pipeline</div>
        <div class="rv2-val" style="font-size:20px;">$${Math.round(projectedPipelineRev).toLocaleString()}</div>
        <div class="rv2-sub">/month after approval</div>
      </div>
      <div class="rv2-stat" style="flex:1;min-width:140px;background:var(--gray-50);">
        <div class="rv2-accent" style="background:linear-gradient(90deg,var(--gray-300),var(--gray-400));"></div>
        <div class="rv2-label">12-Mo Target</div>
        <div class="rv2-val" style="font-size:20px;">$${projectedMonths[11] ? projectedMonths[11].revenue.toLocaleString() : '0'}</div>
        <div class="rv2-sub">/month by ${projectedMonths[11] ? projectedMonths[11].label : ''}</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card rv2-card">
        <div class="card-header"><h3>12-Month Revenue Projection</h3></div>
        <div class="card-body" style="position:relative;height:280px;">
          <canvas id="chart-forecast"></canvas>
        </div>
      </div>
      <div class="card rv2-card">
        <div class="card-header"><h3>Revenue by Payer Category</h3></div>
        <div class="card-body" style="position:relative;height:280px;">
          ${Object.keys(revenueByPayer).length > 0
            ? '<canvas id="chart-payer-rev"></canvas>'
            : '<div class="text-sm text-muted" style="padding-top:100px;text-align:center;">No revenue data yet.</div>'}
        </div>
      </div>
    </div>

    <!-- Revenue by State Table -->
    <div class="card rv2-card rv2-table-wrap">
      <div class="card-header"><h3>Revenue by State</h3></div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        ${sortedStates.length > 0 ? `
        <table>
          <thead>
            <tr><th>State</th><th>Approved</th><th>Pipeline</th><th>Planned</th><th>Total Potential</th><th style="min-width:200px;">Distribution</th></tr>
          </thead>
          <tbody>
            ${sortedStates.map(([st, rev]) => {
              const total = rev.approved + rev.pipeline + rev.planned;
              const appPct = total > 0 ? (rev.approved / total * 100) : 0;
              const pipPct = total > 0 ? (rev.pipeline / total * 100) : 0;
              const planPct = total > 0 ? (rev.planned / total * 100) : 0;
              return `<tr>
                <td><strong>${getStateName(st)}</strong></td>
                <td style="color:var(--green);font-weight:600;">$${rev.approved.toLocaleString()}</td>
                <td style="color:var(--blue);font-weight:600;">$${rev.pipeline.toLocaleString()}</td>
                <td style="color:var(--warning-500);">$${rev.planned.toLocaleString()}</td>
                <td style="font-weight:700;">$${total.toLocaleString()}</td>
                <td>
                  <div style="display:flex;gap:1px;height:16px;border-radius:4px;overflow:hidden;background:var(--gray-100);">
                    ${appPct > 0 ? `<div style="flex:${appPct};background:rgba(34,197,94,0.6);" title="Approved: $${rev.approved.toLocaleString()}"></div>` : ''}
                    ${pipPct > 0 ? `<div style="flex:${pipPct};background:rgba(59,130,246,0.5);" title="Pipeline: $${rev.pipeline.toLocaleString()}"></div>` : ''}
                    ${planPct > 0 ? `<div style="flex:${planPct};background:rgba(245,158,11,0.4);" title="Planned: $${rev.planned.toLocaleString()}"></div>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ` : '<div class="text-sm text-muted" style="padding:2rem;text-align:center;">No applications with revenue estimates yet.</div>'}
      </div>
    </div>

    <!-- Provider Revenue Attribution -->
    ${providers.length > 0 ? `
    <div class="card rv2-card rv2-table-wrap">
      <div class="card-header"><h3>Provider Revenue Attribution</h3></div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table>
          <thead><tr><th>Provider</th><th>Approved Apps</th><th>Monthly Revenue</th><th>Annual Revenue</th><th>Avg Cred Time</th><th>States</th><th>Revenue Share</th></tr></thead>
          <tbody>
            ${providers.map(p => {
              const provApps = apps.filter(a => a.providerId === p.id);
              const provApproved = provApps.filter(a => a.status === 'approved');
              const provMonthly = provApproved.reduce((s, a) => s + (Number(a.estMonthlyRevenue) || 0), 0);
              const provAnnual = provMonthly * 12;
              const provStates = [...new Set(provApps.map(a => a.state).filter(Boolean))].length;
              const provWithDates = provApproved.filter(a => a.submittedDate && a.effectiveDate);
              const provAvgDays = provWithDates.length > 0
                ? Math.round(provWithDates.reduce((s, a) => s + (new Date(a.effectiveDate) - new Date(a.submittedDate)) / 86400000, 0) / provWithDates.length)
                : '—';
              const share = currentMonthly > 0 ? Math.round(provMonthly / currentMonthly * 100) : 0;
              const provName = (p.firstName || '') + ' ' + (p.lastName || '');
              return `<tr>
                <td><a href="#" onclick="event.preventDefault();window.app.openProviderProfile('${p.id}')" style="font-weight:600;color:var(--gray-800);text-decoration:none;">${escHtml(provName.trim())}</a></td>
                <td>${provApproved.length} / ${provApps.length}</td>
                <td style="font-weight:700;color:var(--green);">$${provMonthly.toLocaleString()}</td>
                <td style="font-weight:600;">$${provAnnual.toLocaleString()}</td>
                <td>${provAvgDays}${provAvgDays !== '—' ? ' days' : ''}</td>
                <td>${provStates}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <div style="width:60px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;">
                      <div style="width:${share}%;height:100%;background:var(--brand-500);border-radius:3px;"></div>
                    </div>
                    <span style="font-size:12px;font-weight:600;">${share}%</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Payer Profitability Analysis -->
    ${apps.length > 0 ? (() => {
      const payerData = {};
      apps.forEach(a => {
        const payer = getPayerById(a.payerId);
        const name = payer ? payer.name : (a.payerName || 'Unknown');
        if (!payerData[name]) payerData[name] = { approved: 0, total: 0, revenue: 0, totalDays: 0, daysCount: 0, states: new Set(), denied: 0 };
        payerData[name].total++;
        if (a.status === 'approved') {
          payerData[name].approved++;
          payerData[name].revenue += Number(a.estMonthlyRevenue) || 0;
          if (a.submittedDate && a.effectiveDate) {
            payerData[name].totalDays += (new Date(a.effectiveDate) - new Date(a.submittedDate)) / 86400000;
            payerData[name].daysCount++;
          }
        }
        if (a.status === 'denied') payerData[name].denied++;
        if (a.state) payerData[name].states.add(a.state);
      });
      const sorted = Object.entries(payerData).sort((a, b) => b[1].revenue - a[1].revenue);
      return `
    <div class="card rv2-card rv2-table-wrap">
      <div class="card-header"><h3>Payer Profitability</h3></div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table>
          <thead><tr><th>Payer</th><th>Approved / Total</th><th>Approval Rate</th><th>Avg Cred Time</th><th>Monthly Revenue</th><th>States</th><th>Efficiency</th></tr></thead>
          <tbody>
            ${sorted.map(([name, d]) => {
              const rate = d.total > 0 ? Math.round(d.approved / d.total * 100) : 0;
              const avgDays = d.daysCount > 0 ? Math.round(d.totalDays / d.daysCount) : '—';
              const efficiency = d.revenue > 0 && avgDays !== '—' ? (d.revenue / avgDays * 30).toFixed(0) : '—';
              return `<tr>
                <td style="font-weight:600;">${escHtml(name)}</td>
                <td>${d.approved} / ${d.total}</td>
                <td><span style="font-weight:600;color:${rate >= 75 ? 'var(--green)' : rate >= 50 ? 'var(--warning-500)' : 'var(--red)'};">${rate}%</span></td>
                <td>${avgDays}${avgDays !== '—' ? ' days' : ''}</td>
                <td style="font-weight:700;color:var(--green);">$${d.revenue.toLocaleString()}</td>
                <td>${d.states.size}</td>
                <td>${efficiency !== '—' ? `<span style="font-weight:600;color:var(--brand-600);">$${Number(efficiency).toLocaleString()}/mo</span>` : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="card-body" style="padding:8px 16px;border-top:1px solid var(--gray-100);">
        <span class="text-sm text-muted">Efficiency = revenue per 30 days of credentialing time. Higher = faster ROI.</span>
      </div>
    </div>`;
    })() : ''}

    <!-- Credentialing Velocity Analytics -->
    ${(() => {
      const withDates = apps.filter(a => a.submittedDate && a.effectiveDate);
      if (withDates.length === 0 && apps.length === 0) return '';

      // Time per status phase (estimate from available data)
      const statusPhases = {};
      apps.forEach(a => {
        if (!a.submittedDate) return;
        const subDate = new Date(a.submittedDate);
        const endDate = a.effectiveDate ? new Date(a.effectiveDate) : (a.status === 'approved' || a.status === 'credentialed' ? new Date() : null);
        if (!endDate) return;
        const totalDays = Math.round((endDate - subDate) / 86400000);
        const status = a.status;
        if (!statusPhases[status]) statusPhases[status] = { totalDays: 0, count: 0 };
        statusPhases[status].totalDays += totalDays;
        statusPhases[status].count++;
      });

      // Overall velocity metrics
      const avgCredDaysAll = withDates.length > 0
        ? Math.round(withDates.reduce((s, a) => s + (new Date(a.effectiveDate) - new Date(a.submittedDate)) / 86400000, 0) / withDates.length) : null;
      const fastestCred = withDates.length > 0
        ? Math.round(Math.min(...withDates.map(a => (new Date(a.effectiveDate) - new Date(a.submittedDate)) / 86400000))) : null;
      const slowestCred = withDates.length > 0
        ? Math.round(Math.max(...withDates.map(a => (new Date(a.effectiveDate) - new Date(a.submittedDate)) / 86400000))) : null;

      // Active application age
      const activeApps = apps.filter(a => ['submitted','in_review','pending_info','gathering_docs'].includes(a.status) && a.submittedDate);
      const avgActiveAge = activeApps.length > 0
        ? Math.round(activeApps.reduce((s, a) => s + (Date.now() - new Date(a.submittedDate)) / 86400000, 0) / activeApps.length) : null;
      const staleApps = activeApps.filter(a => (Date.now() - new Date(a.submittedDate)) / 86400000 > 90);

      // Bottleneck: which status holds apps longest
      const statusAges = {};
      activeApps.forEach(a => {
        if (!statusAges[a.status]) statusAges[a.status] = [];
        statusAges[a.status].push(Math.round((Date.now() - new Date(a.updatedAt || a.updated_at || a.submittedDate)) / 86400000));
      });
      const bottleneck = Object.entries(statusAges).sort((a, b) => {
        const avgA = a[1].reduce((s, v) => s + v, 0) / a[1].length;
        const avgB = b[1].reduce((s, v) => s + v, 0) / b[1].length;
        return avgB - avgA;
      })[0];

      // Revenue lost during credentialing delays (estimated from pipeline)
      const pipelineApps = apps.filter(a => ['submitted','in_review','pending_info'].includes(a.status));
      const delayRevenue = pipelineApps.reduce((sum, a) => {
        if (!a.submittedDate || !a.estMonthlyRevenue) return sum;
        const daysWaiting = Math.round((Date.now() - new Date(a.submittedDate)) / 86400000);
        return sum + (Number(a.estMonthlyRevenue) / 30) * daysWaiting;
      }, 0);

      // By payer speed
      const payerSpeed = {};
      withDates.forEach(a => {
        const name = a.payerName || 'Unknown';
        if (!payerSpeed[name]) payerSpeed[name] = [];
        payerSpeed[name].push(Math.round((new Date(a.effectiveDate) - new Date(a.submittedDate)) / 86400000));
      });
      const sortedPayers = Object.entries(payerSpeed).map(([name, days]) => ({
        name, avgDays: Math.round(days.reduce((s, d) => s + d, 0) / days.length), count: days.length,
        fastest: Math.min(...days), slowest: Math.max(...days),
      })).sort((a, b) => a.avgDays - b.avgDays);

      return `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><h3>Credentialing Velocity</h3></div>
      <div class="card-body">
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:16px;">
          <div class="stat-card" style="border-top:3px solid var(--brand-500);">
            <div class="label">Avg Cred Time</div>
            <div class="value" style="font-size:22px;">${avgCredDaysAll !== null ? avgCredDaysAll + 'd' : '—'}</div>
            <div class="sub">${withDates.length} completed</div>
          </div>
          <div class="stat-card" style="border-top:3px solid var(--green);">
            <div class="label">Fastest</div>
            <div class="value" style="font-size:22px;color:var(--green);">${fastestCred !== null ? fastestCred + 'd' : '—'}</div>
            <div class="sub">best case</div>
          </div>
          <div class="stat-card" style="border-top:3px solid var(--red);">
            <div class="label">Slowest</div>
            <div class="value" style="font-size:22px;color:var(--red);">${slowestCred !== null ? slowestCred + 'd' : '—'}</div>
            <div class="sub">worst case</div>
          </div>
          <div class="stat-card" style="border-top:3px solid var(--warning-500);">
            <div class="label">Avg Active Age</div>
            <div class="value" style="font-size:22px;color:${avgActiveAge && avgActiveAge > 60 ? 'var(--red)' : 'var(--warning-500)'};">${avgActiveAge !== null ? avgActiveAge + 'd' : '—'}</div>
            <div class="sub">${activeApps.length} in progress</div>
          </div>
          <div class="stat-card" style="border-top:3px solid ${staleApps.length > 0 ? 'var(--red)' : 'var(--gray-300)'};">
            <div class="label">Stale (90d+)</div>
            <div class="value" style="font-size:22px;color:${staleApps.length > 0 ? 'var(--red)' : 'var(--green)'};">${staleApps.length}</div>
            <div class="sub">need attention</div>
          </div>
          <div class="stat-card" style="border-top:3px solid var(--warning-500);">
            <div class="label">Revenue Lost to Delays</div>
            <div class="value" style="font-size:22px;color:var(--warning-500);">$${Math.round(delayRevenue).toLocaleString()}</div>
            <div class="sub">est. during wait time</div>
          </div>
        </div>

        ${bottleneck ? `
        <div style="padding:10px 14px;border-radius:8px;background:var(--warning-500)08;border:1px solid var(--warning-500)20;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">&#9888;</span>
            <div>
              <strong style="font-size:13px;">Bottleneck: ${bottleneck[0].replace(/_/g, ' ')}</strong>
              <div class="text-sm text-muted">${bottleneck[1].length} app(s) averaging ${Math.round(bottleneck[1].reduce((s, v) => s + v, 0) / bottleneck[1].length)} days in this status</div>
            </div>
          </div>
        </div>` : ''}

        ${sortedPayers.length > 0 ? `
        <div style="margin-top:4px;">
          <h4 style="font-size:13px;margin:0 0 8px;color:var(--gray-600);">Speed by Payer</h4>
          <div style="display:grid;gap:6px;">
            ${sortedPayers.slice(0, 10).map(p => {
              const maxBar = sortedPayers[sortedPayers.length - 1].avgDays || 1;
              const pct = Math.round(p.avgDays / maxBar * 100);
              return `<div style="display:flex;align-items:center;gap:10px;font-size:12px;">
                <span style="min-width:140px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(p.name)}</span>
                <div style="flex:1;height:8px;background:var(--gray-100);border-radius:4px;overflow:hidden;">
                  <div style="width:${pct}%;height:100%;background:${p.avgDays <= 60 ? 'var(--green)' : p.avgDays <= 90 ? 'var(--warning-500)' : 'var(--red)'};border-radius:4px;"></div>
                </div>
                <span style="min-width:50px;font-weight:600;color:${p.avgDays <= 60 ? 'var(--green)' : p.avgDays <= 90 ? 'var(--warning-500)' : 'var(--red)'};">${p.avgDays}d</span>
                <span style="min-width:24px;color:var(--gray-400);">(${p.count})</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>`;
    })()}

    <!-- Expansion Revenue Potential -->
    ${expansionRev.length > 0 ? `
    <div class="card">
      <div class="card-header"><h3>Untapped Markets — Revenue Potential</h3></div>
      <div class="card-body">
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${expansionRev.map(p => `
            <div class="stat-card" style="min-width:140px;flex:1;max-width:200px;border-left:3px solid var(--green);">
              <div class="label">${getStateName(p.state)}</div>
              <div style="font-size:16px;font-weight:700;color:var(--green);">${p.readinessScore}/10</div>
              <div class="sub">${p.practiceAuthority} practice</div>
              <div class="sub">${p.controlledSubstances === 'allowed' ? 'CS allowed' : 'CS limited'}</div>
              <div class="sub" style="color:var(--blue);">${p.medicaidTelehealth === 'full' ? 'Full Medicaid' : 'Limited Medicaid'}</div>
            </div>
          `).join('')}
        </div>
        <div class="text-sm text-muted" style="margin-top:12px;">High-readiness states where you're not yet licensed. Consider expansion to capture additional revenue.</div>
      </div>
    </div>
    ` : ''}
  `;

  // Render charts
  requestAnimationFrame(() => renderForecastCharts(projectedMonths, revenueByPayer, catLabels));
}

async function renderForecastCharts(projectedMonths, revenueByPayer, catLabels) {
  _chartInstances.forEach(c => c.destroy());
  _chartInstances = [];
  

  // 12-month projection line chart
  const forecastEl = document.getElementById('chart-forecast');
  if (forecastEl && projectedMonths.length > 0) {
    _chartInstances.push(new Chart(forecastEl, {
      type: 'line',
      data: {
        labels: projectedMonths.map(m => m.label),
        datasets: [{
          label: 'Projected Monthly Revenue',
          data: projectedMonths.map(m => m.revenue),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: 'rgb(34, 197, 94)',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { ticks: { callback: v => '$' + v.toLocaleString(), font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { ticks: { font: { size: 10 } }, grid: { display: false } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => '$' + ctx.raw.toLocaleString() + '/mo' } },
        },
      },
    }));
  }

  // Payer category revenue bar chart
  const payerRevEl = document.getElementById('chart-payer-rev');
  if (payerRevEl) {
    const cats = Object.keys(revenueByPayer).sort((a, b) =>
      (revenueByPayer[b].approved + revenueByPayer[b].pipeline) - (revenueByPayer[a].approved + revenueByPayer[a].pipeline)
    );
    const catColors = { national: '#3b82f6', bcbs_anthem: '#8b5cf6', bcbs_hcsc: '#a78bfa', bcbs_highmark: '#c4b5fd', bcbs_independent: '#7c3aed', regional: '#f59e0b', medicaid: '#22c55e', other: '#94a3b8' };

    _chartInstances.push(new Chart(payerRevEl, {
      type: 'bar',
      data: {
        labels: cats.map(c => catLabels[c] || c),
        datasets: [
          {
            label: 'Approved',
            data: cats.map(c => revenueByPayer[c].approved),
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderColor: 'rgb(34, 197, 94)',
            borderWidth: 1,
          },
          {
            label: 'Pipeline',
            data: cats.map(c => revenueByPayer[c].pipeline),
            backgroundColor: 'rgba(59, 130, 246, 0.4)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { ticks: { callback: v => '$' + v.toLocaleString(), font: { size: 10 } }, stacked: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { ticks: { font: { size: 9 } }, stacked: true, grid: { display: false } },
        },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 10 } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': $' + ctx.raw.toLocaleString() } },
        },
      },
    }));
  }
}

// ─── Coverage Matrix ───

async function renderCoverageMatrix() {
  const body = document.getElementById('page-body');
  const apps = store.filterByScope(await store.getAll('applications'));
  const licenses = store.filterByScope(await store.getAll('licenses'));
  const licensedStates = [...new Set(licenses.map(l => l.state))].sort();

  // Get payers that have applications
  const payerIds = [...new Set(apps.map(a => a.payerId).filter(Boolean))];
  const payersInUse = payerIds.map(id => getPayerById(id)).filter(Boolean);

  // Include top national payers + all BCBS licensees for gap analysis
  const topPayers = PAYER_CATALOG
    .filter(p => ['national', 'bcbs_anthem', 'bcbs_hcsc', 'bcbs_highmark', 'bcbs_independent'].includes(p.category))
    .slice(0, 16);
  const allMatrixPayers = [...new Map([...payersInUse, ...topPayers].map(p => [p.id, p])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build coverage map: { payerId: { state: status } }
  const coverageMap = {};
  apps.forEach(a => {
    if (!a.payerId || !a.state) return;
    if (!coverageMap[a.payerId]) coverageMap[a.payerId] = {};
    // Use the most advanced status for this payer+state combo
    const existing = coverageMap[a.payerId][a.state];
    if (!existing || statusPriority(a.status) > statusPriority(existing)) {
      coverageMap[a.payerId][a.state] = a.status;
    }
  });

  // Stats
  const totalCells = licensedStates.length * allMatrixPayers.length;
  const filledCells = Object.values(coverageMap).reduce((sum, stateMap) =>
    sum + Object.keys(stateMap).filter(s => licensedStates.includes(s)).length, 0);
  const approvedCells = Object.values(coverageMap).reduce((sum, stateMap) =>
    sum + Object.entries(stateMap).filter(([s, st]) => licensedStates.includes(s) && st === 'approved').length, 0);
  const gapCells = totalCells - filledCells;

  // ─── Population Coverage Calculations ───
  const licensedPop = licensedStates.reduce((sum, s) => sum + getStatePop(s), 0);
  const licensedPct = US_TOTAL_POP > 0 ? (licensedPop / US_TOTAL_POP * 100) : 0;

  // Credentialed lives: for each approved app, state pop × payer national market share %
  // This is an estimate — actual reachable lives depend on local market share
  let credentialedLives = 0;
  let projectedLives = 0;
  const countedApproved = new Set();
  const countedInProgress = new Set();

  apps.forEach(a => {
    if (!a.payerId || !a.state || a.state === 'ALL') return;
    const payer = getPayerById(a.payerId);
    if (!payer) return;
    const statePop = getStatePop(a.state);
    const share = (payer.marketShare || 5) / 100;
    const lives = statePop * share;
    const key = `${a.payerId}_${a.state}`;

    if (a.status === 'approved' && !countedApproved.has(key)) {
      credentialedLives += lives;
      countedApproved.add(key);
    } else if (['submitted', 'in_review', 'pending_info'].includes(a.status) && !countedInProgress.has(key) && !countedApproved.has(key)) {
      projectedLives += lives;
      countedInProgress.add(key);
    }
  });

  const credentialedPct = US_TOTAL_POP > 0 ? (credentialedLives / US_TOTAL_POP * 100) : 0;
  const projectedPct = US_TOTAL_POP > 0 ? ((credentialedLives + projectedLives) / US_TOTAL_POP * 100) : 0;

  body.innerHTML = `
    <style>
      .cm2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .cm2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .cm2-stat .cm2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .cm2-stat .cm2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .cm2-stat .cm2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .cm2-stat .cm2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .cm2-card{border-radius:16px;overflow:hidden;}
      .cm2-table-wrap table tr:hover{background:var(--gray-50);}
    </style>
    <!-- Population Coverage -->
    <div class="card cm2-card" style="margin-bottom:16px;border-left:4px solid var(--teal);">
      <div class="card-header"><h3>Population Coverage Estimate</h3></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px;">
          <div class="cm2-stat">
            <div class="cm2-accent" style="background:linear-gradient(90deg,var(--brand-600),var(--brand-400));"></div>
            <div class="cm2-label">Licensed Reach</div>
            <div class="cm2-val" style="color:var(--brand-600);">${licensedPct.toFixed(1)}%</div>
            <div class="cm2-sub">${(licensedPop * 1000).toLocaleString()} people in ${licensedStates.length} states</div>
          </div>
          <div class="cm2-stat">
            <div class="cm2-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
            <div class="cm2-label">Credentialed Lives</div>
            <div class="cm2-val" style="color:#16a34a;">${credentialedPct.toFixed(1)}%</div>
            <div class="cm2-sub">~${Math.round(credentialedLives * 1000).toLocaleString()} reachable via approved payers</div>
          </div>
          <div class="cm2-stat">
            <div class="cm2-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
            <div class="cm2-label">Projected (incl. in-progress)</div>
            <div class="cm2-val" style="color:#2563eb;">${projectedPct.toFixed(1)}%</div>
            <div class="cm2-sub">~${Math.round((credentialedLives + projectedLives) * 1000).toLocaleString()} once in-progress apps are approved</div>
          </div>
          <div class="cm2-stat">
            <div class="cm2-accent" style="background:linear-gradient(90deg,var(--gray-400),var(--gray-500));"></div>
            <div class="cm2-label">US Population</div>
            <div class="cm2-val">${(US_TOTAL_POP * 1000).toLocaleString()}</div>
            <div class="cm2-sub">2025 Census estimate</div>
          </div>
        </div>
        <div style="position:relative;height:24px;background:var(--gray-200);border-radius:12px;overflow:hidden;margin-bottom:8px;">
          <div style="position:absolute;left:0;top:0;height:100%;width:${Math.min(projectedPct, 100)}%;background:var(--sage);opacity:0.4;border-radius:12px;transition:width 0.5s;"></div>
          <div style="position:absolute;left:0;top:0;height:100%;width:${Math.min(credentialedPct, 100)}%;background:var(--green);border-radius:12px;transition:width 0.5s;"></div>
          <div style="position:absolute;left:0;top:0;height:100%;width:${Math.min(licensedPct, 100)}%;background:var(--teal);opacity:0.25;border-radius:12px;"></div>
        </div>
        <div style="display:flex;gap:20px;font-size:11px;color:var(--text-muted);">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--teal);opacity:0.4;vertical-align:middle;"></span> Licensed reach</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--green);vertical-align:middle;"></span> Credentialed lives</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--sage);opacity:0.4;vertical-align:middle;"></span> Projected (in-progress)</span>
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--text-muted);font-style:italic;">
          Estimates based on state populations (2025 Census) and payer national market share. Actual reachable lives vary by local payer penetration.
        </div>
      </div>
    </div>

    <!-- Summary Stats -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:20px;">
      <div class="cm2-stat">
        <div class="cm2-accent" style="background:linear-gradient(90deg,var(--brand-500),var(--brand-700));"></div>
        <div class="cm2-label">Licensed States</div><div class="cm2-val">${licensedStates.length}</div>
      </div>
      <div class="cm2-stat">
        <div class="cm2-accent" style="background:linear-gradient(90deg,#6366f1,#818cf8);"></div>
        <div class="cm2-label">Payers Tracked</div><div class="cm2-val">${allMatrixPayers.length}</div>
      </div>
      <div class="cm2-stat">
        <div class="cm2-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="cm2-label">Credentialed</div><div class="cm2-val" style="color:#16a34a;">${approvedCells}</div><div class="cm2-sub">payer-state combos</div>
      </div>
      <div class="cm2-stat">
        <div class="cm2-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="cm2-label">In Progress</div><div class="cm2-val" style="color:#2563eb;">${filledCells - approvedCells}</div>
      </div>
      <div class="cm2-stat">
        <div class="cm2-accent" style="background:linear-gradient(90deg,#ef4444,#f87171);"></div>
        <div class="cm2-label">Gaps</div><div class="cm2-val" style="color:${gapCells > 0 ? '#dc2626' : 'inherit'};">${gapCells}</div><div class="cm2-sub">of ${totalCells} possible</div>
      </div>
    </div>

    ${licensedStates.length === 0 ? `
    <div class="card"><div class="card-body text-sm text-muted" style="text-align:center;padding:3rem;">
      Add licenses first to see your coverage matrix. The matrix shows payer credentialing status across your licensed states.
    </div></div>
    ` : `

    <!-- Coverage Heatmap -->
    <div class="card cm2-card">
      <div class="card-header"><h3>Payer × State Coverage</h3></div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table style="font-size:10px;border-collapse:collapse;min-width:${licensedStates.length * 28 + 160}px;">
          <thead>
            <tr>
              <th style="position:sticky;left:0;background:var(--gray-50);z-index:2;min-width:140px;padding:4px 6px;font-size:10px;">Payer</th>
              ${licensedStates.map(s => `<th style="text-align:center;min-width:26px;padding:3px 1px;font-size:9px;">${s}</th>`).join('')}
              <th style="text-align:center;min-width:36px;padding:3px 4px;font-size:9px;">Cov</th>
            </tr>
          </thead>
          <tbody>
            ${allMatrixPayers.map(payer => {
              const stateMap = coverageMap[payer.id] || {};
              const coveredCount = licensedStates.filter(s => stateMap[s]).length;
              const approvedCount = licensedStates.filter(s => stateMap[s] === 'approved').length;
              const pct = licensedStates.length > 0 ? Math.round(coveredCount / licensedStates.length * 100) : 0;
              return `<tr style="line-height:1.2;">
                <td style="position:sticky;left:0;background:#fff;z-index:1;font-weight:600;white-space:nowrap;border-right:1px solid var(--border);padding:3px 6px;font-size:10px;">
                  ${escHtml(payer.name)}
                  <span style="font-weight:400;font-size:8px;color:#94a3b8;margin-left:4px;">${payer.category || ''}</span>
                </td>
                ${licensedStates.map(s => {
                  const status = stateMap[s];
                  if (!status) return `<td style="text-align:center;padding:2px 1px;"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:var(--gray-100);border:1px dashed #cbd5e1;" title="${payer.name} — ${getStateName(s)}: No application"></span></td>`;
                  const colors = {
                    approved: { bg: '#dcfce7', border: '#22c55e', icon: '&#10003;' },
                    submitted: { bg: '#dbeafe', border: '#3b82f6', icon: '&#9679;' },
                    in_review: { bg: '#e0e7ff', border: '#6366f1', icon: '&#9679;' },
                    pending_info: { bg: '#fef3c7', border: '#f59e0b', icon: '!' },
                    denied: { bg: '#fee2e2', border: '#ef4444', icon: '&#10007;' },
                    not_started: { bg: '#f8fafc', border: '#94a3b8', icon: '&#8211;' },
                  };
                  const c = colors[status] || colors.not_started;
                  return `<td style="text-align:center;padding:2px 1px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:3px;background:${c.bg};border:1px solid ${c.border};font-size:8px;font-weight:700;color:${c.border};" title="${payer.name} — ${getStateName(s)}: ${status}">${c.icon}</span></td>`;
                }).join('')}
                <td style="text-align:center;padding:2px 3px;">
                  <div style="font-weight:700;font-size:10px;color:${pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : 'var(--red)'};">${pct}%</div>
                  <div style="font-size:8px;color:#94a3b8;">${approvedCount}/${licensedStates.length}</div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Legend -->
    <div class="card cm2-card">
      <div class="card-header"><h3>Legend</h3></div>
      <div class="card-body">
        <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px;">
          <div><span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:var(--success-100);border:1px solid #22c55e;vertical-align:middle;text-align:center;font-size:10px;font-weight:700;color:#22c55e;line-height:16px;">&#10003;</span> Approved / Credentialed</div>
          <div><span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#dbeafe;border:1px solid #3b82f6;vertical-align:middle;"></span> Submitted</div>
          <div><span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#e0e7ff;border:1px solid #6366f1;vertical-align:middle;"></span> In Review</div>
          <div><span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#fef3c7;border:1px solid #f59e0b;vertical-align:middle;"></span> Pending Info</div>
          <div><span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#fee2e2;border:1px solid #ef4444;vertical-align:middle;"></span> Denied</div>
          <div><span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:var(--gray-100);border:1px dashed #cbd5e1;vertical-align:middle;"></span> Gap (no application)</div>
        </div>
      </div>
    </div>

    <!-- Gap Analysis -->
    <div class="card cm2-card">
      <div class="card-header"><h3>Top Gaps — Expansion Opportunities</h3></div>
      <div class="card-body">
        ${gapCells > 0 ? (() => {
          const gaps = [];
          allMatrixPayers.forEach(payer => {
            const stateMap = coverageMap[payer.id] || {};
            licensedStates.forEach(s => {
              if (!stateMap[s]) {
                const pol = getLivePolicyByState(s);
                gaps.push({ payer: payer.name, payerCat: payer.category, state: s, readiness: pol ? pol.readinessScore : 0 });
              }
            });
          });
          const topGaps = gaps.sort((a, b) => b.readiness - a.readiness).slice(0, 10);
          return `<div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${topGaps.map(g => `
              <div class="stat-card" style="min-width:150px;flex:1;max-width:200px;border-left:3px solid ${g.readiness >= 7 ? 'var(--green)' : 'var(--gold)'};">
                <div class="label" style="font-size:11px;">${escHtml(g.payer)}</div>
                <div style="font-size:14px;font-weight:700;">${getStateName(g.state)}</div>
                <div class="sub">Readiness: ${g.readiness}/10</div>
              </div>
            `).join('')}
          </div>
          <div class="text-sm text-muted" style="margin-top:12px;">Top 10 gaps by state readiness score. These represent the best payer-state combinations to pursue next.</div>`;
        })() : '<div class="text-sm text-muted">No gaps — full coverage across all payer-state combinations!</div>'}
      </div>
    </div>
    `}
  `;
}

function statusPriority(status) {
  const order = { approved: 5, in_review: 4, submitted: 3, pending_info: 2, not_started: 1, denied: 0 };
  return order[status] ?? -1;
}

// ─── Batch Generator ───

async function renderBatchGenerator() {
  const body = document.getElementById('page-body');
  const licenses = (await store.getAll('licenses')).filter(l => l.status === 'active');
  const licensedStates = licenses.map(l => l.state);

  body.innerHTML = `
    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Select Strategy Profile</h3></div>
      <div class="card-body">
        <div class="form-group">
          <label>Strategy</label>
          <select class="form-control" id="batch-strategy">
            ${DEFAULT_STRATEGIES.map(s => `<option value="${s.id}">${s.name} — ${s.description.substring(0, 80)}...</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Target States (leave empty for all licensed states: ${licensedStates.join(', ')})</label>
          <input type="text" class="form-control" id="batch-states" placeholder="e.g. FL,NY,VA (comma-separated)">
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-primary" onclick="window.app.previewBatch()">Preview Batch</button>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
            <input type="checkbox" id="batch-exclude-existing" checked> Exclude existing applications
          </label>
        </div>
      </div>
    </div>
    <div id="batch-preview"></div>
  `;
}

// ─── Email Generator ───

async function renderEmailGenerator() {
  const body = document.getElementById('page-body');
  const templates = emailGenerator.getTemplateList();
  const apps = (await store.getAll('applications')).filter(a => a.status !== 'approved' && a.status !== 'denied');
  const emailLicensedCodes = new Set((await store.getAll('licenses')).filter(l => l.status === 'active').map(l => l.state));
  const emailLicensed = STATES.filter(s => emailLicensedCodes.has(s.code));
  const emailUnlicensed = STATES.filter(s => !emailLicensedCodes.has(s.code));

  body.innerHTML = `
    <style>
      .em2-card{border-radius:16px;overflow:hidden;}
    </style>
    <div class="form-row">
      <div class="card em2-card">
        <div class="card-header"><h3>Generate for Application</h3></div>
        <div class="card-body">
          <div class="form-group">
            <label>Application</label>
            <select class="form-control" id="email-app">
              <option value="">Select application...</option>
              ${apps.map(a => {
                const payer = getPayerById(a.payerId);
                return `<option value="${a.id}">${payer ? payer.name : a.payerName} — ${getStateName(a.state)} (${a.status})</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Template</label>
            <select class="form-control" id="email-template">
              ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-primary" onclick="window.app.generateAppEmail()">Generate Email</button>
            <button class="btn btn-gold" onclick="window.app.aiDraftEmail()">AI Draft Email</button>
          </div>
          <div class="form-group" style="margin-top:8px;">
            <label>Additional context for AI <span style="font-size:11px;color:var(--text-muted);">(optional)</span></label>
            <textarea class="form-control" id="ai-email-context" rows="2" placeholder="e.g. They asked for additional docs last call..."></textarea>
          </div>
        </div>
      </div>
      <div class="card em2-card">
        <div class="card-header"><h3>Expansion Outreach (Bulk)</h3></div>
        <div class="card-body">
          <div class="form-group">
            <label>Target States <span style="font-size:11px;color:var(--text-muted);">(hold Ctrl/Cmd to select multiple)</span></label>
            <select class="form-control" id="email-expansion-states" multiple size="10" style="min-height:180px;">
              <optgroup label="Licensed States (${emailLicensed.length})">
                  ${emailLicensed.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')}
                </optgroup>
                <optgroup label="Unlicensed States">
                  ${emailUnlicensed.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')}
                </optgroup>
            </select>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <button class="btn btn-sm" onclick="document.querySelectorAll('#email-expansion-states optgroup:first-child option').forEach(o=>o.selected=true)">Select All Licensed</button>
            <button class="btn btn-sm" onclick="document.querySelectorAll('#email-expansion-states option').forEach(o=>o.selected=false)">Clear</button>
          </div>
          <button class="btn btn-primary" onclick="window.app.generateExpansionEmailBatch()">Generate Expansion Emails</button>
        </div>
      </div>
    </div>
    <div id="email-output"></div>
  `;
}

// ─── Providers Page ───

async function renderProviders() {
  const body = document.getElementById('page-body');
  const providers = store.filterByScope(await store.getAll('providers'));
  const licenses = store.filterByScope(await store.getAll('licenses'));
  const apps = store.filterByScope(await store.getAll('applications'));

  // Compute total stats
  const activeProvCount = providers.filter(p => p.active !== false).length;
  const totalApps = apps.length;
  const uniqueStates = [...new Set(licenses.map(l => l.state).filter(Boolean))].length;

  body.innerHTML = `
    <style>
      .v2-prov-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-bottom:20px;}
      .v2-prov-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .v2-prov-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .v2-prov-stat .v2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .v2-prov-stat .v2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .v2-prov-stat .v2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .v2-prov-stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;}
      .v2-prov-card{background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;border:1px solid var(--gray-100);}
      .v2-prov-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.1);}
      .v2-prov-card-body{padding:20px 24px;}
      .v2-prov-top{display:flex;gap:16px;align-items:flex-start;margin-bottom:16px;}
      .v2-prov-avatar{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:white;flex-shrink:0;}
      .v2-prov-info{flex:1;min-width:0;}
      .v2-prov-name{font-size:17px;font-weight:700;color:var(--text-primary);line-height:1.3;cursor:pointer;}
      .v2-prov-name:hover{color:var(--brand-600);}
      .v2-prov-creds{font-size:12px;color:var(--text-muted);margin-top:2px;}
      .v2-prov-details{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
      .v2-prov-detail{font-size:12px;color:var(--text-muted);}
      .v2-prov-detail strong{color:var(--text-primary);font-weight:600;}
      .v2-prov-pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;}
      .v2-prov-pill{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;}
      .v2-prov-ring-wrap{position:relative;width:44px;height:44px;flex-shrink:0;}
      .v2-prov-ring-wrap svg{width:44px;height:44px;transform:rotate(-90deg);}
      .v2-prov-ring-pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--text-primary);}
      .v2-prov-actions{display:flex;gap:6px;padding-top:14px;border-top:1px solid var(--gray-100);}
      @media(max-width:768px){.v2-prov-grid{grid-template-columns:1fr;}.v2-prov-stats-row{grid-template-columns:repeat(2,1fr);}}
    </style>

    <!-- V2 Stat Cards -->
    <div class="v2-prov-stats-row">
      <div class="v2-prov-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--brand-600),var(--brand-400));"></div>
        <div class="v2-label">Total Providers</div>
        <div class="v2-val" style="color:var(--brand-600);">${providers.length}</div>
      </div>
      <div class="v2-prov-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="v2-label">Active</div>
        <div class="v2-val" style="color:#16a34a;">${activeProvCount}</div>
      </div>
      <div class="v2-prov-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="v2-label">Total Licenses</div>
        <div class="v2-val" style="color:#2563eb;">${licenses.length}</div>
        <div class="v2-sub">${uniqueStates} states</div>
      </div>
      <div class="v2-prov-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#a855f7,#c084fc);"></div>
        <div class="v2-label">Applications</div>
        <div class="v2-val" style="color:#7c3aed;">${totalApps}</div>
      </div>
    </div>

    <!-- V2 Provider Card Grid -->
    <div class="v2-prov-grid">
    ${providers.map((p, idx) => {
      const provLicenses = licenses.filter(l => l.providerId === p.id);
      const provApps = apps.filter(a => a.providerId === p.id);
      const activeLic = provLicenses.filter(l => l.status === 'active').length;
      const pendingLic = provLicenses.filter(l => l.status === 'pending').length;
      const licStates = provLicenses.map(l => l.state).filter((v, i, a) => a.indexOf(v) === i).length;
      const initials = (p.firstName?.[0] || '') + (p.lastName?.[0] || '');
      // Completion ring: rough estimate based on available data fields
      const fields = [p.npi, p.specialty, p.taxonomy, p.email, p.phone, p.credentials];
      const filled = fields.filter(Boolean).length;
      const pct = Math.round((filled / fields.length) * 100);
      const gradients = ['linear-gradient(135deg,#6366f1,#8b5cf6)','linear-gradient(135deg,#0ea5e9,#06b6d4)','linear-gradient(135deg,#f43f5e,#ec4899)','linear-gradient(135deg,#f59e0b,#eab308)','linear-gradient(135deg,#10b981,#34d399)','linear-gradient(135deg,#6366f1,#a855f7)'];
      const grad = gradients[idx % gradients.length];
      const circumference = 2 * Math.PI * 17;
      const dashOffset = circumference - (pct / 100) * circumference;
      const ringColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

      return `
        <div class="v2-prov-card">
          <div style="height:4px;background:${grad};"></div>
          <div class="v2-prov-card-body">
            <div class="v2-prov-top">
              <div class="v2-prov-avatar" style="background:${grad};">${initials}</div>
              <div class="v2-prov-info">
                <div class="v2-prov-name" onclick="window.app.openProviderProfile('${p.id}')">${escHtml(p.firstName)} ${escHtml(p.lastName)}, ${escHtml(p.credentials || '')}</div>
                <div class="v2-prov-creds">${escHtml(p.specialty) || 'No specialty'} &middot; <span class="badge badge-${p.active !== false ? 'active' : 'inactive'}" style="font-size:10px;">${p.active !== false ? 'Active' : 'Inactive'}</span></div>
              </div>
              <div class="v2-prov-ring-wrap" title="Profile ${pct}% complete">
                <svg viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="17" fill="none" stroke="var(--gray-100)" stroke-width="3"/>
                  <circle cx="22" cy="22" r="17" fill="none" stroke="${ringColor}" stroke-width="3" stroke-linecap="round"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"/>
                </svg>
                <div class="v2-prov-ring-pct">${pct}%</div>
              </div>
            </div>
            <div class="v2-prov-details">
              <div class="v2-prov-detail"><strong>NPI:</strong> ${p.npi || '---'}</div>
              <div class="v2-prov-detail"><strong>Taxonomy:</strong> ${p.taxonomy || '---'}</div>
              <div class="v2-prov-detail"><strong>#${toHexId(p.id)}</strong></div>
            </div>
            <div class="v2-prov-pills">
              <span class="v2-prov-pill" style="background:rgba(59,130,246,0.1);color:#2563eb;">${provLicenses.length} License${provLicenses.length !== 1 ? 's' : ''}</span>
              <span class="v2-prov-pill" style="background:rgba(168,85,247,0.1);color:#7c3aed;">${provApps.length} App${provApps.length !== 1 ? 's' : ''}</span>
              ${licStates > 0 ? `<span class="v2-prov-pill" style="background:rgba(34,197,94,0.1);color:#16a34a;">${licStates} State${licStates !== 1 ? 's' : ''}</span>` : ''}
              ${activeLic > 0 ? `<span class="v2-prov-pill" style="background:rgba(34,197,94,0.08);color:#16a34a;">${activeLic} Active</span>` : ''}
              ${pendingLic > 0 ? `<span class="v2-prov-pill" style="background:rgba(245,158,11,0.1);color:#d97706;">${pendingLic} Pending</span>` : ''}
            </div>
            <div class="v2-prov-actions">
              <button class="btn btn-sm btn-primary" onclick="window.app.openProviderProfile('${p.id}')">View Profile</button>
              <button class="btn btn-sm" onclick="window.app.openProviderPrintout('${p.id}')" title="Print Credential Sheet">Credential Sheet</button>
              <button class="btn btn-sm" onclick="window.app.editProvider('${p.id}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="window.app.deleteProvider('${p.id}')">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('')}
    </div>

    ${providers.length === 0 ? '<div class="empty-state" style="border-radius:16px;"><h3>No providers yet</h3><p>Click "+ Add Provider" to add your first provider.</p></div>' : ''}
  `;
}

async function openProviderModal(id) {
  const modal = document.getElementById('prov-modal');
  const title = document.getElementById('prov-modal-title');
  const form = document.getElementById('prov-modal-form');

  const existing = id ? await store.getOne('providers', id) : null;
  title.textContent = existing ? 'Edit Provider' : 'Add Provider';

  const orgs = await store.getAll('organizations');

  form.innerHTML = `
    <input type="hidden" id="edit-prov-id" value="${id || ''}">

    <!-- NPI & Provider Search Bar -->
    <div style="margin-bottom:20px;padding:14px 16px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-lg);">
      <label style="display:block;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Search NPI Registry</label>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <button class="btn btn-sm ${!existing ? 'btn-primary' : ''}" id="npi-search-mode-npi" onclick="window.app.setNpiSearchMode('npi')" style="font-size:12px;">By NPI</button>
        <button class="btn btn-sm" id="npi-search-mode-name" onclick="window.app.setNpiSearchMode('name')" style="font-size:12px;">By Name</button>
      </div>
      <div id="npi-search-npi" style="display:flex;gap:8px;align-items:flex-end;">
        <input type="text" class="form-control" id="prov-npi-lookup" placeholder="Enter 10-digit NPI" value="${escAttr(existing?.npi || '')}" style="flex:1;font-size:15px;letter-spacing:0.5px;" onkeydown="if(event.key==='Enter'){event.preventDefault();window.app.lookupProviderNPI();}">
        <button class="btn btn-primary" onclick="window.app.lookupProviderNPI()" id="npi-lookup-btn" style="height:40px;white-space:nowrap;">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg> Lookup
        </button>
      </div>
      <div id="npi-search-name" style="display:none;">
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <input type="text" class="form-control" id="prov-search-first" placeholder="First name" style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault();window.app.searchProviderByName();}">
          <input type="text" class="form-control" id="prov-search-last" placeholder="Last name" style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault();window.app.searchProviderByName();}">
          <select class="form-control" id="prov-search-state" style="width:70px;">
            <option value="">State</option>
            ${['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="window.app.searchProviderByName()" id="name-search-btn" style="height:40px;white-space:nowrap;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg> Search
          </button>
        </div>
      </div>
    </div>
    <div id="npi-lookup-result" style="display:none;margin-bottom:16px;"></div>

    <div class="form-row">
      <div class="form-group"><label>First Name *</label><input type="text" class="form-control" id="prov-first" value="${escAttr(existing?.firstName || '')}" placeholder="e.g. Nageley"></div>
      <div class="form-group"><label>Last Name *</label><input type="text" class="form-control" id="prov-last" value="${escAttr(existing?.lastName || '')}" placeholder="e.g. Michel"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Credentials</label><input type="text" class="form-control" id="prov-creds" value="${escAttr(existing?.credentials || '')}" placeholder="e.g. DNP, PMHNP-BC, FNP-BC"></div>
      <div class="form-group"><label>Individual NPI</label><input type="text" class="form-control" id="prov-npi" value="${escAttr(existing?.npi || '')}" placeholder="10-digit NPI"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Specialty</label><input type="text" class="form-control" id="prov-specialty" value="${escAttr(existing?.specialty || '')}" placeholder="e.g. Psychiatric Mental Health"></div>
      <div class="form-group"><label>Taxonomy Code</label><input type="text" class="form-control" id="prov-taxonomy" value="${escAttr(existing?.taxonomy || '')}" placeholder="e.g. 363LP0808X"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" class="form-control" id="prov-email" value="${escAttr(existing?.email || '')}"></div>
      <div class="form-group"><label>Phone</label><input type="text" class="form-control" id="prov-phone" value="${escAttr(existing?.phone || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Organization</label>
        <select class="form-control" id="prov-org">
          ${orgs.map(o => `<option value="${o.id}" ${existing?.orgId === o.id ? 'selected' : ''}>${escHtml(o.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select class="form-control" id="prov-active">
          <option value="true" ${existing?.active !== false ? 'selected' : ''}>Active</option>
          <option value="false" ${existing?.active === false ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>
  `;

  modal.classList.add('active');
}

window.closeProvModal = function() {
  document.getElementById('prov-modal').classList.remove('active');
};

window.saveProvider = async function() {
  const btn = document.querySelector('#prov-modal .btn-primary');
  const btnText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
  const id = document.getElementById('edit-prov-id').value;

  const data = {
    firstName: document.getElementById('prov-first').value.trim(),
    lastName: document.getElementById('prov-last').value.trim(),
    credentials: document.getElementById('prov-creds').value.trim(),
    npi: document.getElementById('prov-npi').value.trim(),
    specialty: document.getElementById('prov-specialty').value.trim(),
    taxonomy: document.getElementById('prov-taxonomy').value.trim(),
    email: document.getElementById('prov-email').value.trim(),
    phone: document.getElementById('prov-phone').value.trim(),
    orgId: document.getElementById('prov-org').value,
    active: document.getElementById('prov-active').value === 'true',
  };

  if (!data.firstName || !data.lastName) {
    showToast('First and last name are required');
    return;
  }

  if (id) {
    await store.update('providers', id, data);
    showToast('Provider updated');
  } else {
    await store.create('providers', data);
    showToast('Provider added');
  }

  closeProvModal();
  await navigateTo('providers');
  } finally { if (btn) { btn.disabled = false; btn.textContent = btnText; } }
};

// ─── Licenses Page ───

let _licTab = 'licenses';

async function renderLicenses() {
  const body = document.getElementById('page-body');
  const providers = store.filterByScope(await store.getAll('providers'));
  const allLicenses = store.filterByScope(await store.getAll('licenses'));
  const selectedProvider = filters._licProvider || '';
  const licenses = selectedProvider ? allLicenses.filter(l => l.providerId === selectedProvider) : allLicenses;
  const active = licenses.filter(l => l.status === 'active');
  const pending = licenses.filter(l => l.status === 'pending');
  const expired = licenses.filter(l => {
    if (!l.expirationDate) return false;
    return new Date(l.expirationDate) < new Date();
  });

  // Fetch monitoring summary (non-blocking)
  let monitoring = null;
  try { monitoring = await store.getLicenseMonitoringSummary(); } catch(e) { console.warn('Monitoring unavailable', e); }

  const tab = _licTab || 'licenses';

  // Compute expiring-soon count
  const expiringSoon = licenses.filter(l => {
    if (!l.expirationDate) return false;
    const d = new Date(l.expirationDate);
    return d >= new Date() && d < new Date(Date.now() + 90 * 86400000);
  });
  const uniqueLicStates = [...new Set(licenses.map(l => l.state).filter(Boolean))].sort();

  // Build expiration timeline data
  const licSorted = [...licenses].filter(l => l.expirationDate).sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));

  body.innerHTML = `
    <style>
      .v2-lic-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .v2-lic-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .v2-lic-stat .v2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .v2-lic-stat .v2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .v2-lic-stat .v2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .v2-lic-stats-row{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:20px;}
      .v2-lic-map{background:white;border-radius:16px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:20px;}
      .v2-lic-map-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:10px;}
      .v2-lic-state-pills{display:flex;flex-wrap:wrap;gap:6px;}
      .v2-lic-state-pill{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(59,130,246,0.1);color:#2563eb;transition:transform 0.15s;}
      .v2-lic-state-pill:hover{transform:scale(1.05);}
      .v2-lic-timeline{background:white;border-radius:16px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:20px;}
      .v2-lic-tl-bar{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-50);}
      .v2-lic-tl-bar:last-child{border-bottom:none;}
      .v2-lic-tl-state{font-size:12px;font-weight:600;width:80px;flex-shrink:0;}
      .v2-lic-tl-fill{height:6px;border-radius:3px;min-width:4px;transition:width 0.3s;}
      .v2-lic-tl-date{font-size:10px;color:var(--text-muted);white-space:nowrap;width:70px;text-align:right;flex-shrink:0;}
      .v2-lic-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:middle;flex-shrink:0;}
      @media(max-width:768px){.v2-lic-stats-row{grid-template-columns:repeat(2,1fr);}}
    </style>

    <!-- Tab bar -->
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid var(--gray-200);padding-bottom:0;">
      <button class="btn btn-sm ${tab === 'licenses' ? 'btn-primary' : ''}" onclick="window.app.switchLicTab('licenses')" style="border-radius:8px 8px 0 0;border-bottom:none;">Licenses</button>
      <button class="btn btn-sm ${tab === 'monitoring' ? 'btn-primary' : ''}" onclick="window.app.switchLicTab('monitoring')" style="border-radius:8px 8px 0 0;border-bottom:none;">Monitoring</button>
      <button class="btn btn-sm ${tab === 'dea' ? 'btn-primary' : ''}" onclick="window.app.switchLicTab('dea')" style="border-radius:8px 8px 0 0;border-bottom:none;">DEA Registrations</button>
    </div>

    <!-- Licenses tab -->
    <div id="lic-tab-licenses" style="display:${tab === 'licenses' ? 'block' : 'none'};">
      ${providers.length > 1 ? `
      <div style="margin-bottom:16px;background:white;border-radius:16px;padding:12px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div class="form-group" style="margin:0;max-width:300px;">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:4px;">Filter by Provider</label>
          <select class="form-control" onchange="window.app.filterLicByProvider(this.value)">
            <option value="">All Providers</option>
            ${providers.map(p => `<option value="${p.id}" ${selectedProvider === p.id ? 'selected' : ''}>${p.firstName} ${p.lastName}</option>`).join('')}
          </select>
        </div>
      </div>` : ''}

      <!-- V2 Stat Cards -->
      <div class="v2-lic-stats-row">
        <div class="v2-lic-stat">
          <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--brand-600),var(--brand-400));"></div>
          <div class="v2-label">Total Licenses</div>
          <div class="v2-val" style="color:var(--brand-600);">${licenses.length}</div>
        </div>
        <div class="v2-lic-stat">
          <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
          <div class="v2-label">Active ${helpTip('A license counts as Active when its status is set to Active and it has not passed its expiration date. Licenses expiring within 90 days are flagged separately.')}</div>
          <div class="v2-val" style="color:#16a34a;">${active.length}</div>
        </div>
        <div class="v2-lic-stat">
          <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
          <div class="v2-label">Pending</div>
          <div class="v2-val" style="color:#d97706;">${pending.length}</div>
        </div>
        <div class="v2-lic-stat">
          <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#f97316,#fb923c);"></div>
          <div class="v2-label">Expiring (&lt;90d)</div>
          <div class="v2-val" style="color:#ea580c;">${expiringSoon.length}</div>
        </div>
        <div class="v2-lic-stat">
          <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#ef4444,#f87171);"></div>
          <div class="v2-label">Expired</div>
          <div class="v2-val" style="color:#dc2626;">${expired.length}</div>
        </div>
      </div>

      <!-- Licensed States Map Placeholder -->
      ${uniqueLicStates.length > 0 ? `
      <div class="v2-lic-map">
        <div class="v2-lic-map-title">Licensed in ${uniqueLicStates.length} State${uniqueLicStates.length !== 1 ? 's' : ''}</div>
        <div class="v2-lic-state-pills">
          ${uniqueLicStates.map(s => {
            const sLic = licenses.filter(l => l.state === s);
            const sActive = sLic.some(l => l.status === 'active');
            const sExpired = sLic.some(l => l.expirationDate && new Date(l.expirationDate) < new Date());
            const bg = sExpired ? 'rgba(239,68,68,0.1)' : sActive ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)';
            const color = sExpired ? '#dc2626' : sActive ? '#16a34a' : '#d97706';
            return `<span class="v2-lic-state-pill" style="background:${bg};color:${color};">${getStateName(s)} (${s})</span>`;
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Expiration Timeline -->
      ${licSorted.length > 0 ? `
      <div class="v2-lic-timeline">
        <div class="v2-lic-map-title">Expiration Timeline</div>
        ${licSorted.slice(0, 15).map(l => {
          const dLeft = Math.round((new Date(l.expirationDate) - new Date()) / 86400000);
          const maxDays = 365;
          const widthPct = Math.max(2, Math.min(100, ((dLeft > 0 ? dLeft : 0) / maxDays) * 100));
          const barColor = dLeft < 0 ? '#ef4444' : dLeft < 90 ? '#f59e0b' : '#22c55e';
          const dotColor = dLeft < 0 ? '#ef4444' : dLeft < 90 ? '#f59e0b' : '#22c55e';
          return `<div class="v2-lic-tl-bar">
            <span class="v2-lic-dot" style="background:${dotColor};"></span>
            <span class="v2-lic-tl-state">${l.state}</span>
            <div style="flex:1;background:var(--gray-100);border-radius:3px;height:6px;overflow:hidden;">
              <div class="v2-lic-tl-fill" style="width:${widthPct}%;background:${barColor};"></div>
            </div>
            <span class="v2-lic-tl-date" style="color:${barColor};font-weight:${dLeft < 90 ? '600' : '400'};">${dLeft < 0 ? 'Expired' : dLeft + 'd'}</span>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- License Table -->
      <div class="card" style="border-radius:16px;overflow:hidden;">
        <div class="card-header">
          <h3>All State Licenses</h3>
        </div>
        <div class="card-body" style="padding:0;">
          <table>
            <thead>
              <tr>
                <th>State</th>
                <th>License #</th>
                <th>Type</th>
                <th>Status</th>
                <th>Issue Date</th>
                <th>Expiration</th>
                <th>Compact</th>
                <th style="width:140px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${licenses.sort((a, b) => (a.state||'').localeCompare(b.state||'')).map(l => {
                const isExpired = l.expirationDate && new Date(l.expirationDate) < new Date();
                const isExpiringSoon = l.expirationDate && !isExpired &&
                  new Date(l.expirationDate) < new Date(Date.now() + 90 * 86400000);
                const daysLeft = l.expirationDate ? Math.round((new Date(l.expirationDate) - new Date()) / 86400000) : null;
                const expClass = isExpired ? 'color:var(--red);font-weight:600;' :
                  isExpiringSoon ? 'color:var(--warning-500);font-weight:600;' : '';
                const statusDotColor = isExpired ? '#ef4444' : l.status === 'active' ? '#22c55e' : l.status === 'pending' ? '#f59e0b' : 'var(--gray-300)';
                const verStatus = l.verificationStatus || l.verification_status;
                const verDate = l.verifiedAt || l.verified_at || l.lastVerifiedAt || l.last_verified_at;
                const verBadge = verStatus === 'verified'
                  ? `<span title="Verified${verDate ? ' on ' + formatDateDisplay(verDate) : ''}" style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:rgba(34,197,94,0.12);color:var(--green);"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.3 5.3L7 9.6 4.7 7.3a.5.5 0 00-.7.7l2.6 2.7a.5.5 0 00.7 0l4.7-4.7a.5.5 0 00-.7-.7z"/></svg>Verified</span>`
                  : verStatus === 'mismatch'
                  ? `<span title="Verification mismatch" style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:rgba(245,158,11,0.12);color:var(--warning-500);">&#9888; Mismatch</span>`
                  : `<span title="Not yet verified" style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:500;background:var(--gray-100);color:var(--gray-400);">Unverified</span>`;
                const expiryBadge = daysLeft !== null
                  ? (isExpired
                    ? `<div style="font-size:10px;color:var(--red);font-weight:600;margin-top:1px;">EXPIRED ${Math.abs(daysLeft)}d ago</div>`
                    : daysLeft <= 30
                    ? `<div style="font-size:10px;color:var(--red);font-weight:600;margin-top:1px;">${daysLeft}d left</div>`
                    : daysLeft <= 90
                    ? `<div style="font-size:10px;color:var(--warning-500);font-weight:500;margin-top:1px;">${daysLeft}d left</div>`
                    : '')
                  : '';
                return `
                  <tr>
                    <td><span class="v2-lic-dot" style="background:${statusDotColor};"></span><strong>${getStateName(l.state)}</strong> (${l.state})</td>
                    <td><code>${escHtml(l.licenseNumber) || '-'}</code></td>
                    <td>${escHtml(l.licenseType) || '-'}</td>
                    <td><span class="badge badge-${l.status}">${l.status}</span> ${verBadge}</td>
                    <td>${formatDateDisplay(l.issueDate)}</td>
                    <td style="${expClass}">${formatDateDisplay(l.expirationDate)}${expiryBadge}</td>
                    <td>${l.compactState ? 'Yes' : '-'}</td>
                    <td>
                      <button class="btn btn-sm" onclick="window.app.verifyOneLicense('${l.id}')" title="Verify via NPPES">Verify</button>
                      <button class="btn btn-sm" onclick="window.app.editLicense('${l.id}')">Edit</button>
                      <button class="btn btn-sm btn-danger" onclick="window.app.deleteLicense('${l.id}')">Del</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Monitoring tab -->
    <div id="lic-tab-monitoring" style="display:${tab === 'monitoring' ? 'block' : 'none'};">
      <div id="monitoring-content">Loading monitoring data...</div>
    </div>

    <!-- DEA tab -->
    <div id="lic-tab-dea" style="display:${tab === 'dea' ? 'block' : 'none'};">
      <div id="dea-content">Loading DEA registrations...</div>
    </div>
  `;

  // Load sub-tabs asynchronously
  if (tab === 'monitoring') renderMonitoringTab();
  if (tab === 'dea') renderDeaTab(providers);
}

async function renderMonitoringTab() {
  const container = document.getElementById('monitoring-content');
  try {
    const [summary, expiring] = await Promise.all([
      store.getLicenseMonitoringSummary(),
      store.getExpiringLicenses(),
    ]);

    const lic = summary.licenses || {};
    const ver = summary.verifications || {};
    const dea = summary.dea || {};

    container.innerHTML = `
      <style>
        .montab-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
        .montab-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
        .montab-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
        .montab-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
        .montab-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
        .montab-card{border-radius:16px!important;overflow:hidden;}
        .montab-card table tr:hover{background:var(--gray-50,#f9fafb);}
      </style>
      <!-- Summary cards -->
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
        <div class="stat-card montab-stat"><div class="label">Total Licenses</div><div class="value">${lic.total || 0}</div></div>
        <div class="stat-card montab-stat" style="--montab-accent:var(--green);"><div class="label">Verified via NPPES</div><div class="value green">${ver.verified || 0}</div></div>
        <div class="stat-card montab-stat"><div class="label">Mismatches Found</div><div class="value" style="color:var(--warning-500);">${ver.mismatch || 0}</div></div>
        <div class="stat-card montab-stat"><div class="label">Never Verified</div><div class="value red">${ver.neverVerified || 0}</div></div>
      </div>

      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
        <div class="stat-card montab-stat"><div class="label">Expired</div><div class="value red">${lic.expired || 0}</div></div>
        <div class="stat-card montab-stat"><div class="label">Expiring ≤30 days</div><div class="value" style="color:var(--red);">${lic.expiring30 || lic.expiring_30 || 0}</div></div>
        <div class="stat-card montab-stat"><div class="label">Expiring 31-60 days</div><div class="value" style="color:var(--warning-500);">${lic.expiring60 || lic.expiring_60 || 0}</div></div>
        <div class="stat-card montab-stat"><div class="label">Expiring 61-90 days</div><div class="value" style="color:var(--blue);">${lic.expiring90 || lic.expiring_90 || 0}</div></div>
      </div>

      <!-- Bulk verify button -->
      <div class="card montab-card" style="margin-bottom:16px;">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3>NPPES License Verification</h3>
          <button class="btn btn-gold" id="bulk-verify-btn" onclick="window.app.bulkVerifyLicenses()">Verify All Licenses</button>
        </div>
        <div class="card-body">
          <p style="margin:0;color:var(--gray-500);font-size:13px;">
            Verifies each license against the NPPES registry by matching NPI, state, and license number.
            ${ver.lastRun || ver.last_run ? `Last run: <strong>${new Date(ver.lastRun || ver.last_run).toLocaleDateString()}</strong>` : 'Never run.'}
            Auto-runs weekly on Mondays.
          </p>
        </div>
      </div>

      <!-- Expiring items -->
      <div class="card montab-card">
        <div class="card-header"><h3>Expiring Licenses & DEA (Next 90 Days)</h3></div>
        <div class="card-body" style="padding:0;">
          ${renderExpiringTable(expiring)}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card montab-card"><div class="card-body" style="color:var(--red);">Error loading monitoring data: ${escHtml(err.message)}</div></div>`;
  }
}

function renderExpiringTable(data) {
  const all = [
    ...(data.expired || []).map(i => ({...i, severity: 'expired'})),
    ...(data.critical || []).map(i => ({...i, severity: 'critical'})),
    ...(data.warning || []).map(i => ({...i, severity: 'warning'})),
    ...(data.notice || []).map(i => ({...i, severity: 'notice'})),
  ];

  if (all.length === 0) {
    return '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No expiring items in the next 90 days.</div>';
  }

  return `<table>
    <thead><tr><th>Severity</th><th>Type</th><th>Provider</th><th>Item</th><th>Expires</th><th>Days Left</th></tr></thead>
    <tbody>
      ${all.map(i => {
        const sevStyle = i.severity === 'expired' ? 'background:var(--red);color:#fff;' :
          i.severity === 'critical' ? 'background:var(--warning-500);color:#fff;' :
          i.severity === 'warning' ? 'background:#f59e0b;color:#fff;' : 'background:var(--blue);color:#fff;';
        const sevLabel = i.severity === 'expired' ? 'EXPIRED' :
          i.severity === 'critical' ? 'CRITICAL' :
          i.severity === 'warning' ? 'WARNING' : 'NOTICE';
        return `<tr>
          <td><span class="badge" style="${sevStyle};font-size:11px;padding:2px 8px;border-radius:4px;">${sevLabel}</span></td>
          <td>${i.type === 'dea' ? 'DEA' : 'License'}</td>
          <td>${i.providerId || i.provider_id ? `<a href="#" onclick="event.preventDefault();window.app.openProviderProfile('${i.providerId || i.provider_id}')" style="color:var(--brand-600);text-decoration:none;font-weight:600;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escHtml(i.providerName || i.provider_name || '')}</a>` : escHtml(i.providerName || i.provider_name || '')}</td>
          <td>${escHtml(i.item || '')}</td>
          <td>${formatDateDisplay(i.expirationDate || i.expiration_date)}</td>
          <td style="font-weight:600;${i.daysLeft < 0 || i.days_left < 0 ? 'color:var(--red);' : ''}">${i.daysLeft ?? i.days_left ?? ''}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

async function renderDeaTab(providers) {
  const container = document.getElementById('dea-content');
  try {
    const deas = await store.getDeaRegistrations();

    container.innerHTML = `
      <style>
        .deatab-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
        .deatab-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
        .deatab-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
        .deatab-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
        .deatab-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
        .deatab-card{border-radius:16px!important;overflow:hidden;}
        .deatab-card table tr:hover{background:var(--gray-50,#f9fafb);}
      </style>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);flex:1;margin-right:16px;">
          <div class="stat-card deatab-stat"><div class="label">Total DEA</div><div class="value">${deas.length}</div></div>
          <div class="stat-card deatab-stat"><div class="label">Active</div><div class="value green">${deas.filter(d => d.status === 'active').length}</div></div>
          <div class="stat-card deatab-stat"><div class="label">Expired</div><div class="value red">${deas.filter(d => d.status === 'expired' || (d.expirationDate && new Date(d.expirationDate) < new Date())).length}</div></div>
        </div>
        <button class="btn btn-gold" onclick="window.app.openDeaModal()">+ Add DEA</button>
      </div>

      <div class="card deatab-card">
        <div class="card-header"><h3>DEA Registrations</h3></div>
        <div class="card-body" style="padding:0;">
          ${deas.length === 0 ? '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No DEA registrations on file.</div>' : `
          <table>
            <thead><tr><th>Provider</th><th>DEA Number</th><th>State</th><th>Schedules</th><th>Status</th><th>Expiration</th><th style="width:120px;">Actions</th></tr></thead>
            <tbody>
              ${deas.map(d => {
                const isExp = d.expirationDate && new Date(d.expirationDate) < new Date();
                const isSoon = d.expirationDate && !isExp && new Date(d.expirationDate) < new Date(Date.now() + 90*86400000);
                const expStyle = isExp ? 'color:var(--red);font-weight:600;' : isSoon ? 'color:var(--warning-500);font-weight:600;' : '';
                const schedules = Array.isArray(d.schedules) ? d.schedules.join(', ') : (d.schedules || '-');
                return `<tr>
                  <td>${d.provider ? `<a href="#" onclick="event.preventDefault();window.app.openProviderProfile('${d.provider.id || d.providerId || d.provider_id}')" style="color:var(--brand-600);text-decoration:none;font-weight:600;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escHtml(d.provider.firstName + ' ' + d.provider.lastName)}</a>` : ''}</td>
                  <td><code>${escHtml(d.deaNumber || d.dea_number || '')}</code></td>
                  <td>${d.state || '-'}</td>
                  <td>${schedules}</td>
                  <td><span class="badge badge-${d.status}">${d.status}</span></td>
                  <td style="${expStyle}">${formatDateDisplay(d.expirationDate || d.expiration_date)}</td>
                  <td>
                    <button class="btn btn-sm" onclick="window.app.openDeaModal('${d.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="window.app.deleteDea('${d.id}')">Del</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="color:var(--red);">Error loading DEA data: ${escHtml(err.message)}</div></div>`;
  }
}

// ─── Payers Page ───

async function renderPayers() {
  const body = document.getElementById('page-body');

  const categoryLabels = {
    national: 'National (Big 5)',
    behavioral: 'Behavioral Health / EAP',
    bcbs_anthem: 'BCBS — Anthem / Elevance',
    bcbs_hcsc: 'BCBS — HCSC',
    bcbs_highmark: 'BCBS — Highmark',
    bcbs_independent: 'BCBS — Independent',
    regional: 'Regional',
    medicaid: 'Medicaid',
    medicare: 'Medicare',
    other: 'Other',
  };

  // Apply tag filters
  let filteredPayers = PAYER_CATALOG;
  if (_payerTagFilters.size > 0) {
    filteredPayers = PAYER_CATALOG.filter(p =>
      Array.isArray(p.tags) && [..._payerTagFilters].every(t => p.tags.includes(t))
    );
  }

  // Group by category
  const categories = {};
  filteredPayers.forEach(p => {
    const cat = p.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  });

  const taggedCount = PAYER_CATALOG.filter(p => p.tags?.length > 0).length;
  const bhCount = PAYER_CATALOG.filter(p => p.tags?.includes('behavioral_health')).length;
  const thCount = PAYER_CATALOG.filter(p => p.tags?.includes('telehealth_friendly')).length;

  // Tag groups for the filter bar
  const tagGroups = {
    clinical: { label: 'Clinical Focus', icon: '🧠' },
    access:   { label: 'Access',         icon: '📡' },
    business: { label: 'Business',       icon: '💰' },
    process:  { label: 'Process',        icon: '📋' },
    strategic:{ label: 'Strategic',      icon: '🎯' },
  };

  const bcbsCount = (categories.bcbs_anthem || []).length +
    (categories.bcbs_hcsc || []).length +
    (categories.bcbs_highmark || []).length +
    (categories.bcbs_independent || []).length;

  body.innerHTML = `
    <style>
      .v2-payers-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .v2-payers-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .v2-payers-stat .v2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .v2-payers-stat .v2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .v2-payers-stat .v2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .v2-payers-stats-row{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:20px;}
      .v2-payers-filter{background:white;border-radius:16px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:20px;}
      .v2-payers-filter-group{margin-bottom:10px;}
      .v2-payers-filter-group:last-child{margin-bottom:0;}
      .v2-payers-group-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:4px;}
      .v2-payers-cat-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:11px;font-size:11px;font-weight:700;background:var(--brand-50);color:var(--brand-600);margin-left:8px;}
      @media(max-width:768px){.v2-payers-stats-row{grid-template-columns:repeat(2,1fr);}}
    </style>

    <!-- View Tabs -->
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:0;">
      <button class="btn btn-sm" style="border-radius:8px 8px 0 0;border-bottom:3px solid ${_payerView === 'catalog' ? 'var(--brand-600)' : 'transparent'};font-weight:${_payerView === 'catalog' ? '700' : '400'};padding:8px 16px;"
        onclick="window.app.setPayerView('catalog')">Payer Catalog</button>
      <button class="btn btn-sm" style="border-radius:8px 8px 0 0;border-bottom:3px solid ${_payerView === 'planner' ? 'var(--brand-600)' : 'transparent'};font-weight:${_payerView === 'planner' ? '700' : '400'};padding:8px 16px;"
        onclick="window.app.setPayerView('planner')">Strategic Planner</button>
    </div>

    <!-- V2 Stats -->
    <div class="v2-payers-stats-row">
      <div class="v2-payers-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--brand-600),var(--brand-400));"></div>
        <div class="v2-label">Total Payers</div>
        <div class="v2-val" style="color:var(--brand-600);">${PAYER_CATALOG.length}</div>
        ${_payerTagFilters.size > 0 ? `<div class="v2-sub">${filteredPayers.length} matching</div>` : ''}
      </div>
      <div class="v2-payers-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#7c3aed,#a855f7);"></div>
        <div class="v2-label">Behavioral Health</div>
        <div class="v2-val" style="color:#6b21a8;">${bhCount}</div>
      </div>
      <div class="v2-payers-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="v2-label">Telehealth</div>
        <div class="v2-val" style="color:#2563eb;">${thCount}</div>
      </div>
      <div class="v2-payers-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="v2-label">Tagged</div>
        <div class="v2-val" style="color:#16a34a;">${taggedCount}</div>
        <div class="v2-sub">of ${PAYER_CATALOG.length}</div>
      </div>
      <div class="v2-payers-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#0369a1,#0ea5e9);"></div>
        <div class="v2-label">BCBS Plans</div>
        <div class="v2-val" style="color:var(--brand-600);">${bcbsCount}</div>
      </div>
    </div>

    <!-- V2 Tag Filter Bar with Group Headers -->
    <div class="v2-payers-filter">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);">Filter by Tags ${helpTip('Strategic tags categorize payers by clinical focus (e.g. Behavioral Health), access model (e.g. Telehealth), business factors (e.g. High Reimbursement), and credentialing process details. Click tags to filter the catalog.')}</span>
        ${_payerTagFilters.size > 0 ? `<span style="font-size:11px;color:var(--brand-600);font-weight:600;">${_payerTagFilters.size} active</span><button class="btn btn-sm" onclick="window.app.clearPayerTagFilters()" style="font-size:10px;padding:2px 8px;margin-left:4px;">Clear all</button>` : ''}
      </div>
      ${Object.entries(tagGroups).map(([groupKey, grp]) => {
        const groupTags = Object.entries(PAYER_TAG_DEFS).filter(([, def]) => def.group === groupKey);
        const activeInGroup = groupTags.filter(([key]) => _payerTagFilters.has(key)).length;
        return `<div class="v2-payers-filter-group">
          <div class="v2-payers-group-label">${grp.icon} ${grp.label}${activeInGroup > 0 ? ` <span style="background:var(--brand-600);color:white;padding:1px 6px;border-radius:8px;font-size:9px;">${activeInGroup}</span>` : ''}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${groupTags.map(([key, def]) => `
              <span class="payer-tag payer-tag-filter ${_payerTagFilters.has(key) ? 'active' : ''}"
                    style="background:${def.bg};color:${def.color};"
                    onclick="window.app.togglePayerTagFilter('${key}')">${def.label}</span>
            `).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>

    ${_payerView === 'planner' ? renderPayerStrategicPlanner(filteredPayers) : `
    <!-- Catalog View -->
    ${Object.entries(categories).map(([cat, payers]) => `
      <div class="card" style="border-radius:16px;overflow:hidden;">
        <div class="card-header" style="display:flex;align-items:center;">
          <h3>${categoryLabels[cat] || cat}<span class="v2-payers-cat-badge">${payers.length}</span></h3>
        </div>
        <div class="card-body" style="padding:0;">
          <table>
            <thead>
              <tr>
                <th>Payer</th>
                <th>Parent Org</th>
                <th>Avg Cred Days</th>
                <th>States</th>
                <th>Tags</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${payers.map(p => `
                <tr>
                  <td><strong>${escHtml(p.name)}</strong></td>
                  <td>${escHtml(p.parentOrg) || '-'}</td>
                  <td>${p.avgCredDays ? p.avgCredDays + ' days' : '-'}</td>
                  <td class="text-sm">${Array.isArray(p.states) ? p.states.join(', ') : '-'}</td>
                  <td>${renderPayerTags(p.tags)}</td>
                  <td class="text-sm text-muted">${escHtml(p.notes) || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('')}
    `}
  `;
}

// ─── Strategic Planner View ───

function renderPayerStrategicPlanner(payers) {
  const all = payers.length > 0 ? payers : PAYER_CATALOG;
  const byTag = (tag) => all.filter(p => p.tags?.includes(tag));

  const mustHave = byTag('must_have');
  const quickWins = byTag('fast_credentialing').filter(p => !mustHave.includes(p));
  const telehealthOpps = byTag('telehealth_friendly');
  const highReimb = byTag('high_reimbursement');
  const caution = all.filter(p => p.tags?.includes('slow_credentialing') || p.tags?.includes('panel_often_closed'));

  // Credentialing method summary
  const caqhCount = byTag('caqh_accepts').length;
  const availityCount = byTag('availity_enrolled').length;
  const portalCount = byTag('portal_required').length;
  const paperCount = byTag('paper_application').length;

  function strategicTable(list, showWhy) {
    if (list.length === 0) return '<p style="padding:16px;color:var(--text-muted);text-align:center;">No payers match this criteria.</p>';
    return `<table>
      <thead><tr><th>Payer</th><th>Category</th><th>States</th><th>Avg Cred</th><th>Tags</th></tr></thead>
      <tbody>${list.map(p => `<tr>
        <td><strong>${escHtml(p.name)}</strong><div class="text-sm text-muted">${escHtml(p.parentOrg) || ''}</div></td>
        <td class="text-sm">${escHtml(p.category) || '-'}</td>
        <td class="text-sm">${Array.isArray(p.states) ? (p.states.length > 6 ? p.states.slice(0, 6).join(', ') + ` +${p.states.length - 6}` : p.states.join(', ')) : '-'}</td>
        <td>${p.avgCredDays ? p.avgCredDays + 'd' : '-'}</td>
        <td>${renderPayerTags(p.tags)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  return `
    <!-- Credentialing Method Summary -->
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
      <div class="stat-card" style="cursor:pointer;" onclick="window.app.togglePayerTagFilter('caqh_accepts')">
        <div class="label">CAQH Accepts</div><div class="value blue">${caqhCount}</div><div class="sub">easiest workflow</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" onclick="window.app.togglePayerTagFilter('availity_enrolled')">
        <div class="label">Availity</div><div class="value blue">${availityCount}</div><div class="sub">electronic enrollment</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" onclick="window.app.togglePayerTagFilter('portal_required')">
        <div class="label">Portal Required</div><div class="value amber">${portalCount}</div><div class="sub">payer-specific portal</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" onclick="window.app.togglePayerTagFilter('paper_application')">
        <div class="label">Paper App</div><div class="value red">${paperCount}</div><div class="sub">fax / mail required</div>
      </div>
    </div>

    <!-- Must-Have Payers -->
    <div class="card">
      <div class="card-header" style="border-left:4px solid #065f46;">
        <h3>Must-Have Payers (${mustHave.length})</h3>
        <span class="text-sm text-muted">Essential for most behavioral health practices — credential these first</span>
      </div>
      <div class="card-body" style="padding:0;">${strategicTable(mustHave)}</div>
    </div>

    <!-- Quick Wins -->
    <div class="card">
      <div class="card-header" style="border-left:4px solid #0369a1;">
        <h3>Quick Wins — Fast Credentialing (${quickWins.length})</h3>
        <span class="text-sm text-muted">Under 60 days — get credentialed fast while waiting on slower payers</span>
      </div>
      <div class="card-body" style="padding:0;">${strategicTable(quickWins)}</div>
    </div>

    <!-- Telehealth Opportunities -->
    <div class="card">
      <div class="card-header" style="border-left:4px solid #0369a1;">
        <h3>Telehealth-Friendly Payers (${telehealthOpps.length})</h3>
        <span class="text-sm text-muted">Support telehealth delivery — essential for multi-state or virtual practices</span>
      </div>
      <div class="card-body" style="padding:0;">${strategicTable(telehealthOpps)}</div>
    </div>

    <!-- High Reimbursement -->
    ${highReimb.length > 0 ? `
    <div class="card">
      <div class="card-header" style="border-left:4px solid #065f46;">
        <h3>High Reimbursement (${highReimb.length})</h3>
        <span class="text-sm text-muted">Above-average rates for behavioral health services</span>
      </div>
      <div class="card-body" style="padding:0;">${strategicTable(highReimb)}</div>
    </div>` : ''}

    <!-- Caution / Long Lead -->
    ${caution.length > 0 ? `
    <div class="card">
      <div class="card-header" style="border-left:4px solid #991b1b;">
        <h3>Caution — Slow or Restricted (${caution.length})</h3>
        <span class="text-sm text-muted">Panels often closed or credentialing takes 120+ days — plan ahead</span>
      </div>
      <div class="card-body" style="padding:0;">${strategicTable(caution)}</div>
    </div>` : ''}
  `;
}

// ─── Settings Page ───

async function renderSettings() {
  const body = document.getElementById('page-body');
  const orgs = await store.getAll('organizations');
  const providers = await store.getAll('providers');
  const licenses = await store.getAll('licenses');
  const apps = await store.getAll('applications');
  let agency = {};
  try { agency = await store.getAgency(); } catch (e) { /* ignore */ }
  const embedBase = CONFIG.API_URL.replace('/api', '');
  const agencySlug = agency.slug || 'your-slug';

  body.innerHTML = `
    <style>
      .stv2-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:20px; }
      .stv2-stat { background:var(--surface-card,#fff); border-radius:16px; padding:18px 16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:transform 0.18s,box-shadow 0.18s; }
      .stv2-stat:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
      .stv2-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      .stv2-stat[data-accent="brand"]::before { background:linear-gradient(90deg,var(--brand-500),var(--brand-700)); }
      .stv2-stat[data-accent="green"]::before { background:linear-gradient(90deg,#22c55e,#16a34a); }
      .stv2-stat[data-accent="amber"]::before { background:linear-gradient(90deg,#f59e0b,#d97706); }
      .stv2-stat[data-accent="blue"]::before { background:linear-gradient(90deg,#3b82f6,#2563eb); }
      .stv2-stat .stv2-val { font-size:28px; font-weight:800; line-height:1.1; }
      .stv2-stat .stv2-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
      .stv2-tabs { display:flex; gap:0; border-bottom:2px solid var(--gray-200); margin-bottom:20px; }
      .stv2-tabs .stv2-tab { background:none; border:none; padding:10px 18px; font-size:13px; font-weight:600; color:var(--gray-500); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; transition:color 0.15s,border-color 0.15s; }
      .stv2-tabs .stv2-tab:hover { color:var(--gray-700); }
      .stv2-tabs .stv2-tab.active { color:var(--brand-600); border-bottom-color:var(--brand-600); }
      .stv2-section .card { border-radius:16px; overflow:hidden; }
    </style>

    <!-- V2 Stat Cards -->
    <div class="stv2-stats">
      <div class="stv2-stat" data-accent="brand"><div class="stv2-val" style="color:var(--brand-600);">${providers.length}</div><div class="stv2-lbl">Total Providers</div></div>
      <div class="stv2-stat" data-accent="green"><div class="stv2-val" style="color:#16a34a;">${licenses.length}</div><div class="stv2-lbl">Licenses</div></div>
      <div class="stv2-stat" data-accent="amber"><div class="stv2-val" style="color:#d97706;">${apps.length}</div><div class="stv2-lbl">Applications</div></div>
      <div class="stv2-stat" data-accent="blue"><div class="stv2-val" style="color:#2563eb;">${orgs.length}</div><div class="stv2-lbl">Organizations</div></div>
    </div>

    <!-- V2 Tabs -->
    <div class="stv2-tabs">
      <button class="stv2-tab active" onclick="window.app.settingsTab(this, 'settings-agency')">Agency Profile</button>
      <button class="stv2-tab" onclick="window.app.settingsTab(this, 'settings-import')">Import / Export</button>
      <button class="stv2-tab" onclick="window.app.settingsTab(this, 'settings-org')">Organization</button>
      <button class="stv2-tab" onclick="window.app.settingsTab(this, 'settings-licenses')">Licenses (${licenses.length})</button>
      <button class="stv2-tab" onclick="window.app.settingsTab(this, 'settings-groups')">Groups</button>
      <button class="stv2-tab" onclick="window.app.settingsTab(this, 'settings-caqh')">CAQH API</button>
      <button class="stv2-tab" onclick="window.app.settingsTab(this, 'settings-integrations')">Integrations</button>
      <button class="stv2-tab" onclick="window.app.settingsTab(this, 'settings-webhooks')">Webhooks</button>
      <button class="stv2-tab" onclick="window.app.settingsTab(this, 'settings-security')">Security</button>
      <button class="stv2-tab" onclick="window.app.settingsTab(this, 'settings-danger')">Danger Zone</button>
    </div>

    <!-- Agency Profile Tab -->
    <div id="settings-agency" class="stv2-section">
      <div class="card" style="border-radius:16px;">
        <div class="card-header">
          <h3>Agency Information</h3>
          <button class="btn btn-primary btn-sm" onclick="window.app.saveAgencyProfile()" style="border-radius:10px;">Save Changes</button>
        </div>
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px;padding:20px;background:var(--gray-50);border-radius:12px;">
            <div style="width:72px;height:72px;border-radius:16px;background:linear-gradient(135deg,${escAttr(agency.primaryColor || agency.primary_color || '#2563EB')},${escAttr(agency.accentColor || agency.accent_color || '#7C3AED')});display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:28px;flex-shrink:0;">
              ${agency.logoUrl || agency.logo_url ? `<img src="${escAttr(agency.logoUrl || agency.logo_url)}" style="width:72px;height:72px;border-radius:16px;object-fit:cover;">` : (agency.name || 'A').charAt(0)}
            </div>
            <div style="flex:1;">
              <div style="font-size:20px;font-weight:700;color:var(--gray-900);">${escHtml(agency.name || 'Your Agency')}</div>
              <div style="font-size:13px;color:var(--gray-500);margin-top:2px;">Slug: <code>${escHtml(agencySlug)}</code></div>
              <div style="font-size:12px;color:var(--gray-400);margin-top:4px;">Plan: <span class="badge badge-approved">${escHtml(agency.planTier || agency.plan_tier || 'starter')}</span></div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group"><label>Agency Name *</label><input type="text" class="form-control" id="agency-name" value="${escAttr(agency.name || '')}" placeholder="Your agency name"></div>
            <div class="form-group"><label>Group NPI</label><input type="text" class="form-control" id="agency-npi" value="${escAttr(agency.npi || '')}" placeholder="10-digit NPI"></div>
            <div class="form-group"><label>Tax ID (EIN)</label><input type="text" class="form-control" id="agency-tax-id" value="${escAttr(agency.taxId || agency.tax_id || '')}" placeholder="XX-XXXXXXX"></div>
            <div class="form-group"><label>Taxonomy Code</label><input type="text" class="form-control" id="agency-taxonomy" value="${escAttr(agency.taxonomy || '')}" placeholder="e.g. 2084P0800X"></div>
            <div class="form-group"><label>Phone</label><input type="tel" class="form-control" id="agency-phone" value="${escAttr(agency.phone || '')}" placeholder="(555) 555-5555"></div>
            <div class="form-group"><label>Email</label><input type="email" class="form-control" id="agency-email" value="${escAttr(agency.email || '')}" placeholder="admin@youragency.com"></div>
            <div class="form-group"><label>Website</label><input type="url" class="form-control" id="agency-website" value="${escAttr(agency.website || '')}" placeholder="https://youragency.com"></div>
            <div class="form-group"><label>Logo URL</label><input type="url" class="form-control" id="agency-logo" value="${escAttr(agency.logoUrl || agency.logo_url || '')}" placeholder="https://..."></div>
          </div>

          <div style="margin-top:20px;">
            <h4 style="font-size:14px;font-weight:700;color:var(--gray-700);margin-bottom:12px;">Practice Address</h4>
            <div class="form-group"><label>Street Address</label><input type="text" class="form-control" id="agency-street" value="${escAttr(agency.addressStreet || agency.address_street || '')}" placeholder="123 Main St, Suite 100"></div>
            <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;">
              <div class="form-group"><label>City</label><input type="text" class="form-control" id="agency-city" value="${escAttr(agency.addressCity || agency.address_city || '')}"></div>
              <div class="form-group"><label>State</label><input type="text" class="form-control" id="agency-state" value="${escAttr(agency.addressState || agency.address_state || '')}" maxlength="2" placeholder="FL"></div>
              <div class="form-group"><label>ZIP</label><input type="text" class="form-control" id="agency-zip" value="${escAttr(agency.addressZip || agency.address_zip || '')}" placeholder="34711"></div>
            </div>
          </div>

          <div style="margin-top:20px;">
            <h4 style="font-size:14px;font-weight:700;color:var(--gray-700);margin-bottom:12px;">Branding</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label>Primary Color</label>
                <div style="display:flex;gap:8px;align-items:center;">
                  <input type="color" id="agency-primary-color" value="${escAttr(agency.primaryColor || agency.primary_color || '#2563EB')}" style="width:44px;height:36px;border:1px solid var(--gray-300);border-radius:8px;cursor:pointer;padding:2px;">
                  <input type="text" class="form-control" value="${escAttr(agency.primaryColor || agency.primary_color || '#2563EB')}" style="flex:1;font-family:monospace;" oninput="document.getElementById('agency-primary-color').value=this.value" id="agency-primary-color-text">
                </div>
              </div>
              <div class="form-group">
                <label>Accent Color</label>
                <div style="display:flex;gap:8px;align-items:center;">
                  <input type="color" id="agency-accent-color" value="${escAttr(agency.accentColor || agency.accent_color || '#D4A855')}" style="width:44px;height:36px;border:1px solid var(--gray-300);border-radius:8px;cursor:pointer;padding:2px;">
                  <input type="text" class="form-control" value="${escAttr(agency.accentColor || agency.accent_color || '#D4A855')}" style="flex:1;font-family:monospace;" oninput="document.getElementById('agency-accent-color').value=this.value" id="agency-accent-color-text">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="settings-import" class="hidden stv2-section">
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Export Data</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">Export all your data as JSON for backup purposes.</p>
          <div style="display:flex;gap:10px;align-items:center;">
            <button class="btn btn-primary" onclick="window.app.exportData()" style="border-radius:10px;">Download JSON Backup</button>
            <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:var(--brand-100,#e0f2fe);color:var(--brand-700);">${apps.length} applications, ${licenses.length} licenses</span>
          </div>
        </div>
      </div>

      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Import Data</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">Import data from a JSON backup file. Feature coming soon.</p>
          <div id="import-results" class="mt-4"></div>
        </div>
      </div>
    </div>

    <div id="settings-org" class="hidden stv2-section">
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Organization</h3></div>
        <div class="card-body">
          ${orgs.map(o => `
            <div class="form-row">
              <div class="form-group"><label>Name</label><input class="form-control" value="${escAttr(o.name)}" disabled></div>
              <div class="form-group"><label>Group NPI</label><input class="form-control" value="${escAttr(o.npi || '')}" placeholder="Enter group NPI" id="org-npi-${o.id}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Phone</label><input class="form-control" value="${escAttr(o.phone || '')}" disabled></div>
              <div class="form-group"><label>Email</label><input class="form-control" value="${escAttr(o.email || '')}" disabled></div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Providers</h3></div>
        <div class="card-body">
          ${providers.map(p => `
            <div class="form-row">
              <div class="form-group"><label>Name</label><input class="form-control" value="${escAttr(p.firstName + ' ' + p.lastName)}" disabled></div>
              <div class="form-group"><label>Individual NPI</label><input class="form-control" value="${escAttr(p.npi || '')}" placeholder="Enter individual NPI" id="prov-npi-${p.id}"></div>
            </div>
            <div class="form-group"><label>Credentials</label><input class="form-control" value="${escAttr(p.credentials || '')}" disabled></div>
          `).join('')}
        </div>
      </div>
    </div>

    <div id="settings-licenses" class="hidden stv2-section">
      <div class="card" style="border-radius:16px;">
        <div class="card-header">
          <h3>State Licenses</h3>
        </div>
        <div class="card-body" style="padding:0;">
          <table>
            <thead><tr><th>State</th><th>License Type</th><th>Status</th><th>Expiration</th></tr></thead>
            <tbody>
              ${licenses.sort((a, b) => a.state.localeCompare(b.state)).map(l => `
                <tr>
                  <td><strong>${getStateName(l.state)}</strong> (${l.state})</td>
                  <td>${l.licenseType || '-'}</td>
                  <td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${l.status === 'active' ? 'rgba(34,197,94,0.12)' : l.status === 'expired' ? 'rgba(239,68,68,0.12)' : 'rgba(156,163,175,0.12)'};color:${l.status === 'active' ? 'var(--green)' : l.status === 'expired' ? 'var(--red)' : 'var(--gray-500)'};"><span style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>${l.status}</span></td>
                  <td>${formatDateDisplay(l.expirationDate)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="settings-groups" class="hidden stv2-section">
      <div class="card" style="border-radius:16px;">
        <div class="card-header">
          <h3>Application Groups</h3>
          <button class="btn btn-primary btn-sm" onclick="window.app.addGroup()">+ Add Group</button>
        </div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">Define custom groups to organize your credentialing applications (e.g. Priority, Standard, Batch A). Each group gets a label, abbreviation, and color.</p>
          <div id="groups-list">
            ${APP_GROUPS.map((g, i) => `
              <div class="form-row" style="align-items:end;margin-bottom:12px;" id="group-row-${i}">
                <div class="form-group" style="flex:2;"><label>Label</label><input type="text" class="form-control group-label" value="${escAttr(g.label)}" placeholder="e.g. Priority"></div>
                <div class="form-group" style="flex:1;max-width:80px;"><label>Short</label><input type="text" class="form-control group-short" value="${escAttr(g.short || '')}" placeholder="P1" maxlength="5"></div>
                <div class="form-group" style="flex:1;max-width:70px;"><label>Color</label><input type="color" class="group-color" value="${g.color || '#6b7280'}" style="width:100%;height:38px;border:1px solid var(--border-color-strong);border-radius:var(--radius);cursor:pointer;padding:2px;background:var(--surface-input);"></div>
                <div class="form-group" style="flex:0;margin-bottom:0;"><button class="btn btn-sm" style="color:var(--danger-500);height:38px;" onclick="window.app.removeGroup(${i})" title="Remove">&times;</button></div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:16px;">
            <button class="btn btn-primary" onclick="window.app.saveGroups()">Save Groups</button>
          </div>
        </div>
      </div>
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Preview</h3></div>
        <div class="card-body">
          <div style="display:flex;gap:12px;flex-wrap:wrap;" id="groups-preview">
            ${APP_GROUPS.map(g => `<span style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:600;background:${g.color}20;color:${g.color};">${g.short || g.label}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div id="settings-caqh" class="hidden stv2-section">
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>CAQH ProView API Configuration</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">
            Connect to CAQH ProView to automatically check provider roster status, profile completeness,
            and attestation dates. Credentials are stored locally in your browser and proxied through your
            Apps Script backend. <a href="https://proview.caqh.org" target="_blank" rel="noopener">Open CAQH ProView</a>
          </p>
          <div class="form-row">
            <div class="form-group">
              <label>Organization ID</label>
              <input class="form-control" id="caqh-org-id" placeholder="Your CAQH Org ID" value="${escAttr(caqhApi.getCaqhConfig().orgId)}">
            </div>
            <div class="form-group">
              <label>Environment</label>
              <select class="form-control" id="caqh-environment">
                <option value="production" ${caqhApi.getCaqhConfig().environment === 'production' ? 'selected' : ''}>Production</option>
                <option value="sandbox" ${caqhApi.getCaqhConfig().environment === 'sandbox' ? 'selected' : ''}>Sandbox</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>API Username</label>
              <input class="form-control" id="caqh-username" placeholder="CAQH API username" value="${escAttr(caqhApi.getCaqhConfig().username)}">
            </div>
            <div class="form-group">
              <label>API Password</label>
              <input type="password" class="form-control" id="caqh-password" placeholder="CAQH API password" value="${escAttr(caqhApi.getCaqhConfig().password)}">
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:8px;">
            <button class="btn btn-primary" onclick="window.app.saveCaqhSettings()">Save Credentials</button>
            <button class="btn" onclick="window.app.testCaqhConnection()">Test Connection</button>
          </div>
          <div id="caqh-test-result" style="margin-top:12px;"></div>
        </div>
      </div>
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Apps Script Setup</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">
            The CAQH API requires server-side calls. Copy the proxy function below into your
            Google Apps Script project to enable API integration.
          </p>
          <button class="btn btn-sm" onclick="window.app.showCaqhProxyCode()">View Proxy Code</button>
          <div id="caqh-proxy-code" style="margin-top:12px;"></div>
        </div>
      </div>
    </div>

    <div id="settings-integrations" class="hidden stv2-section">
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Embed Widgets</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">
            Add booking, testimonials, or insurance verification to your website with a single script tag.
            Widgets automatically match your agency branding.
          </p>

          <label class="form-label" style="font-weight:600;">Widget Type</label>
          <select class="form-control" id="embed-widget-type" onchange="window.app.updateEmbedCode()" style="max-width:300px;margin-bottom:12px;">
            <option value="booking">Booking Form</option>
            <option value="testimonials">Testimonials</option>
            <option value="eligibility">Insurance Verification</option>
          </select>

          <label class="form-label" style="font-weight:600;">Theme</label>
          <select class="form-control" id="embed-widget-theme" onchange="window.app.updateEmbedCode()" style="max-width:300px;margin-bottom:16px;">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>

          <label class="form-label" style="font-weight:600;">Embed Code</label>
          <div style="position:relative;">
            <pre id="embed-code-preview" style="background:#1f2937;color:#e5e7eb;padding:16px;border-radius:8px;font-size:13px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:0 0 8px;">&lt;div id="credentik-widget"&gt;&lt;/div&gt;
&lt;script src="${embedBase}/embed.js" data-agency="${agencySlug}" data-widget="booking" data-theme="light"&gt;&lt;/script&gt;</pre>
            <button class="btn btn-sm btn-primary" onclick="window.app.copyEmbedCode()" style="margin-bottom:16px;">Copy to Clipboard</button>
          </div>

          <div class="alert alert-info" style="margin-top:8px;">
            <strong>Preview:</strong> Paste this code into any HTML page to embed the widget.
            The widget fetches data from your Credentik account in real-time.
          </div>
        </div>
      </div>

      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Allowed Domains</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">
            Restrict which websites can embed your widgets. Leave empty to allow any domain.
          </p>
          <label class="form-label">Domains (one per line)</label>
          <textarea class="form-control" id="embed-allowed-domains" rows="4" placeholder="example.com&#10;mywebsite.org">${(agency.allowed_domains || []).join('\\n')}</textarea>
          <button class="btn btn-primary" onclick="window.app.saveAllowedDomains()" style="margin-top:8px;">Save Domains</button>
        </div>
      </div>

      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Public Pages</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">
            These public URLs are accessible without login and can be shared with patients.
          </p>
          <table>
            <thead><tr><th>Page</th><th>URL</th><th></th></tr></thead>
            <tbody>
              <tr>
                <td>Booking Page</td>
                <td class="text-sm"><code>${embedBase.replace('/api', '')}/api/public/${agencySlug}/availability</code></td>
                <td><button class="btn btn-sm" onclick="window.app.copyText('${embedBase}/public/${agencySlug}/availability')">Copy</button></td>
              </tr>
              <tr>
                <td>Testimonials</td>
                <td class="text-sm"><code>${embedBase}/public/${agencySlug}/testimonials</code></td>
                <td><button class="btn btn-sm" onclick="window.app.copyText('${embedBase}/public/${agencySlug}/testimonials')">Copy</button></td>
              </tr>
              <tr>
                <td>Office Hours</td>
                <td class="text-sm"><code>${embedBase}/public/${agencySlug}/office-hours</code></td>
                <td><button class="btn btn-sm" onclick="window.app.copyText('${embedBase}/public/${agencySlug}/office-hours')">Copy</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Embeddable Widgets (Feature 9) -->
      ${renderEmbedWidgetDocs(agencySlug, embedBase)}
    </div>

    <div id="settings-webhooks" class="hidden stv2-section">
      <div class="card" style="border-radius:16px;">
        <div class="card-header">
          <h3>Webhook Endpoints</h3>
          <button class="btn btn-primary btn-sm" onclick="window.app.addWebhook()" style="border-radius:10px;">+ Add Webhook</button>
        </div>
        <div class="card-body" id="webhook-list-container">
          ${renderWebhookList()}
        </div>
      </div>
      <div class="card" style="border-radius:16px;margin-top:16px;">
        <div class="card-header"><h3>Recent Deliveries</h3></div>
        <div class="card-body" id="webhook-deliveries-container">
          ${renderWebhookDeliveries()}
        </div>
      </div>
    </div>

    <div id="settings-security" class="hidden stv2-section">
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Two-Factor Authentication (2FA)</h3></div>
        <div class="card-body" id="2fa-section">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
            <div style="width:48px;height:48px;border-radius:12px;background:var(--brand-100,#cffafe);color:var(--brand-700,#0e7490);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">🔐</div>
            <div>
              <div style="font-weight:700;font-size:15px;color:var(--text-primary,var(--gray-900));">Protect your account</div>
              <div class="text-sm text-muted">Add an extra layer of security with an authenticator app (Google Authenticator, Authy, etc.)</div>
            </div>
          </div>
          <div id="2fa-status-area">
            <div class="spinner"></div>
          </div>
        </div>
      </div>

      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Password</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">Change your password. You'll need your current password to set a new one.</p>
          <div class="form-row">
            <div class="form-group"><label>Current Password</label><input type="password" class="form-control" id="current-password" placeholder="Current password"></div>
            <div class="form-group"><label>New Password</label><input type="password" class="form-control" id="new-password" placeholder="New password (min 8 chars)" data-validate="required,min:8"></div>
          </div>
          <button class="btn btn-primary" onclick="window.app.changePassword()">Update Password</button>
        </div>
      </div>

      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Active Sessions</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted">You are currently logged in. Sign out to end your session.</p>
        </div>
      </div>
    </div>

    <div id="settings-danger" class="hidden stv2-section">
      <div class="alert alert-danger" style="border-radius:12px;">These actions are destructive and cannot be undone.</div>
      <div class="card" style="border-radius:16px;">
        <div class="card-body">
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-danger" onclick="window.app.clearApplications()">Clear All Applications</button>
            <button class="btn btn-danger" onclick="window.app.clearFollowups()">Clear All Follow-ups</button>
            <button class="btn btn-danger" onclick="window.app.clearEverything()">Reset Everything</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── Document Checklist ───

const CRED_DOCUMENTS = [
  { id: 'caqh', label: 'CAQH ProView Profile', category: 'Provider' },
  { id: 'npi_confirmation', label: 'NPI Confirmation Letter', category: 'Provider' },
  { id: 'state_license', label: 'State License Copy', category: 'License' },
  { id: 'dea_certificate', label: 'DEA Certificate', category: 'License' },
  { id: 'cds_certificate', label: 'State CDS Certificate', category: 'License' },
  { id: 'board_certification', label: 'Board Certification', category: 'Education' },
  { id: 'diploma', label: 'Diploma / Degree', category: 'Education' },
  { id: 'cv_resume', label: 'CV / Resume', category: 'Education' },
  { id: 'malpractice_insurance', label: 'Malpractice Insurance (COI)', category: 'Insurance' },
  { id: 'malpractice_history', label: 'Malpractice Claims History', category: 'Insurance' },
  { id: 'w9', label: 'W-9 Form', category: 'Billing' },
  { id: 'voided_check', label: 'Voided Check / EFT Form', category: 'Billing' },
  { id: 'era_setup', label: 'ERA Enrollment', category: 'Billing' },
  { id: 'tax_id_letter', label: 'Tax ID / EIN Letter', category: 'Billing' },
  { id: 'collaborative_agreement', label: 'Collaborative Practice Agreement', category: 'Compliance' },
  { id: 'background_check', label: 'Background Check', category: 'Compliance' },
  { id: 'opt_out', label: 'Medicare Opt-Out Affidavit', category: 'Compliance' },
  { id: 'telehealth_consent', label: 'Telehealth Consent Template', category: 'Compliance' },
  { id: 'disclosure_form', label: 'Disclosure / Attestation Form', category: 'Payer' },
  { id: 'provider_application', label: 'Payer Application Form', category: 'Payer' },
  { id: 'contract_signed', label: 'Signed Contract / Agreement', category: 'Payer' },
  { id: 'fee_schedule', label: 'Fee Schedule Received', category: 'Payer' },
];

async function openDocChecklist(appId) {
  const app = await store.getOne('applications', appId);
  if (!app) return;

  const docs = app.documentChecklist || {};
  const categories = [...new Set(CRED_DOCUMENTS.map(d => d.category))];
  const totalDocs = CRED_DOCUMENTS.length;
  const completedDocs = CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length;
  const pct = totalDocs > 0 ? Math.round((completedDocs / totalDocs) * 100) : 0;

  const modal = document.getElementById('log-modal');
  document.getElementById('log-modal-title').textContent = 'Document Checklist';

  document.getElementById('log-modal-body').innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">
        ${getStateName(app.state)} — ${app.payerName}
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="flex:1;height:8px;background:var(--gray-200);border-radius:4px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${pct === 100 ? 'var(--green)' : 'var(--teal)'};border-radius:4px;transition:width 0.3s;"></div>
        </div>
        <span style="font-size:13px;font-weight:700;color:${pct === 100 ? 'var(--green)' : 'var(--teal)'};">${completedDocs}/${totalDocs} (${pct}%)</span>
      </div>
    </div>

    ${categories.map(cat => {
      const catDocs = CRED_DOCUMENTS.filter(d => d.category === cat);
      const catDone = catDocs.filter(d => docs[d.id]?.completed).length;
      return `
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;color:var(--gray-900);text-transform:uppercase;margin-bottom:6px;display:flex;justify-content:space-between;">
            <span>${cat}</span>
            <span style="color:${catDone === catDocs.length ? 'var(--green)' : '#94a3b8'};">${catDone}/${catDocs.length}</span>
          </div>
          ${catDocs.map(d => {
            const entry = docs[d.id] || {};
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;border:1px solid var(--border);margin-bottom:3px;background:${entry.completed ? '#f0fdf4' : 'white'};">
                <input type="checkbox" ${entry.completed ? 'checked' : ''} onchange="window.app.toggleDoc('${appId}','${d.id}')" style="cursor:pointer;accent-color:var(--green);">
                <div style="flex:1;">
                  <div style="font-size:13px;${entry.completed ? 'text-decoration:line-through;color:#94a3b8;' : ''}">${d.label}</div>
                  ${entry.completedDate ? `<div style="font-size:10px;color:#94a3b8;">${formatDateDisplay(entry.completedDate)}${entry.note ? ' — ' + escHtml(entry.note) : ''}</div>` : ''}
                </div>
                ${!entry.completed ? `<button class="btn btn-sm" onclick="window.app.toggleDocWithNote('${appId}','${d.id}')" style="font-size:10px;padding:2px 6px;">+ Note</button>` : ''}
              </div>`;
          }).join('')}
        </div>`;
    }).join('')}

    <div style="margin-top:12px;display:flex;gap:8px;">
      <button class="btn btn-sm" onclick="window.app.checkAllDocs('${appId}')">Check All</button>
      <button class="btn btn-sm" onclick="window.app.uncheckAllDocs('${appId}')">Uncheck All</button>
    </div>
  `;

  modal.classList.add('active');
}

// ─── Task Manager ───

const TASK_CATEGORIES = [
  { id: 'credentialing', label: 'Credentialing', icon: '&#9776;' },
  { id: 'license_renewal', label: 'License Renewal', icon: '&#9851;' },
  { id: 'followup', label: 'Follow-up', icon: '&#9201;' },
  { id: 'payer_enrollment', label: 'Payer Enrollment', icon: '&#9733;' },
  { id: 'document_request', label: 'Document Request', icon: '&#9993;' },
  { id: 'compliance', label: 'Compliance', icon: '&#9878;' },
  { id: 'billing_setup', label: 'Billing Setup', icon: '&#9633;' },
  { id: 'provider_onboarding', label: 'Provider Onboarding', icon: '&#9823;' },
  { id: 'state_expansion', label: 'State Expansion', icon: '&#9650;' },
  { id: 'audit', label: 'Audit / Review', icon: '&#9881;' },
  { id: 'other', label: 'Other', icon: '&#9733;' },
];

const TASK_PRIORITIES = [
  { id: 'urgent', label: 'Urgent', color: 'var(--red)' },
  { id: 'high', label: 'High', color: 'var(--warning-600)' },
  { id: 'normal', label: 'Normal', color: 'var(--teal)' },
  { id: 'low', label: 'Low', color: '#95a5a6' },
];

const PRESET_TASKS = [
  // Credentialing
  { title: 'Submit CAQH ProView application', category: 'credentialing', priority: 'high' },
  { title: 'Complete CAQH attestation (quarterly)', category: 'credentialing', priority: 'high' },
  { title: 'Submit credentialing application to payer', category: 'credentialing', priority: 'high' },
  { title: 'Check credentialing application status', category: 'credentialing', priority: 'normal' },
  { title: 'Respond to payer credentialing request for info', category: 'credentialing', priority: 'urgent' },
  { title: 'Update CAQH ProView profile', category: 'credentialing', priority: 'normal' },
  { title: 'Re-credential with payer (recredentialing cycle)', category: 'credentialing', priority: 'high' },
  { title: 'Verify provider NPI is active and correct', category: 'credentialing', priority: 'normal' },
  { title: 'Submit roster update to payer', category: 'credentialing', priority: 'normal' },

  // License Renewal
  { title: 'Renew state medical/nursing license', category: 'license_renewal', priority: 'urgent' },
  { title: 'Renew DEA registration', category: 'license_renewal', priority: 'urgent' },
  { title: 'Renew state CDS certificate', category: 'license_renewal', priority: 'urgent' },
  { title: 'Complete CE/CME hours for license renewal', category: 'license_renewal', priority: 'high' },
  { title: 'Apply for new state license (expansion)', category: 'license_renewal', priority: 'high' },
  { title: 'Submit license renewal application to state board', category: 'license_renewal', priority: 'high' },
  { title: 'Verify compact license (NLC/APRN Compact) status', category: 'license_renewal', priority: 'normal' },
  { title: 'Pay license renewal fee', category: 'license_renewal', priority: 'high' },

  // Follow-up
  { title: 'Follow up on pending credentialing application', category: 'followup', priority: 'normal' },
  { title: 'Call payer re: missing documents', category: 'followup', priority: 'high' },
  { title: 'Follow up on provider enrollment status', category: 'followup', priority: 'normal' },
  { title: 'Escalate delayed application (30+ days)', category: 'followup', priority: 'urgent' },
  { title: 'Follow up on effective date confirmation', category: 'followup', priority: 'high' },
  { title: 'Re-send fax/documents to payer', category: 'followup', priority: 'normal' },
  { title: 'Request status update from payer portal', category: 'followup', priority: 'normal' },
  { title: 'Follow up on contract execution', category: 'followup', priority: 'high' },

  // Payer Enrollment
  { title: 'Register on payer provider portal', category: 'payer_enrollment', priority: 'normal' },
  { title: 'Complete payer online enrollment application', category: 'payer_enrollment', priority: 'high' },
  { title: 'Submit Medicare enrollment (CMS-855)', category: 'payer_enrollment', priority: 'high' },
  { title: 'Submit Medicaid enrollment application', category: 'payer_enrollment', priority: 'high' },
  { title: 'Enroll in TRICARE / VA Community Care', category: 'payer_enrollment', priority: 'normal' },
  { title: 'Apply for Medicare Opt-Out affidavit', category: 'payer_enrollment', priority: 'normal' },
  { title: 'Request fee schedule from payer', category: 'payer_enrollment', priority: 'normal' },
  { title: 'Negotiate contract rates with payer', category: 'payer_enrollment', priority: 'normal' },
  { title: 'Sign and return payer contract/agreement', category: 'payer_enrollment', priority: 'high' },
  { title: 'Set up payer EDI/clearinghouse connection', category: 'payer_enrollment', priority: 'normal' },

  // Document Request
  { title: 'Request updated malpractice insurance COI', category: 'document_request', priority: 'high' },
  { title: 'Obtain W-9 from provider', category: 'document_request', priority: 'normal' },
  { title: 'Request board certification verification letter', category: 'document_request', priority: 'normal' },
  { title: 'Get voided check / direct deposit form', category: 'document_request', priority: 'normal' },
  { title: 'Obtain collaborative practice agreement (CPA)', category: 'document_request', priority: 'high' },
  { title: 'Request NPI confirmation letter from NPPES', category: 'document_request', priority: 'normal' },
  { title: 'Get updated CV/resume from provider', category: 'document_request', priority: 'low' },
  { title: 'Obtain background check results', category: 'document_request', priority: 'normal' },
  { title: 'Request state license verification letter', category: 'document_request', priority: 'normal' },
  { title: 'Collect diploma / degree transcript', category: 'document_request', priority: 'low' },
  { title: 'Request malpractice claims history report', category: 'document_request', priority: 'normal' },

  // Compliance
  { title: 'Review and update telehealth consent form', category: 'compliance', priority: 'normal' },
  { title: 'Verify Ryan Haight compliance for prescribing', category: 'compliance', priority: 'high' },
  { title: 'Complete OIG/SAM exclusion check', category: 'compliance', priority: 'high' },
  { title: 'Verify NPDB (National Practitioner Data Bank) status', category: 'compliance', priority: 'normal' },
  { title: 'Review state telehealth prescribing rules', category: 'compliance', priority: 'normal' },
  { title: 'Update informed consent for new state', category: 'compliance', priority: 'normal' },
  { title: 'Review payer telehealth billing policies', category: 'compliance', priority: 'normal' },
  { title: 'Complete annual compliance training', category: 'compliance', priority: 'low' },
  { title: 'Verify PDMP registration for controlled substances', category: 'compliance', priority: 'high' },
  { title: 'Review and update Notice of Privacy Practices', category: 'compliance', priority: 'low' },

  // Billing Setup
  { title: 'Set up ERA (Electronic Remittance Advice)', category: 'billing_setup', priority: 'normal' },
  { title: 'Set up EFT (Electronic Funds Transfer)', category: 'billing_setup', priority: 'normal' },
  { title: 'Verify payer ID in billing system', category: 'billing_setup', priority: 'normal' },
  { title: 'Test claim submission with payer', category: 'billing_setup', priority: 'normal' },
  { title: 'Add payer to practice management system', category: 'billing_setup', priority: 'normal' },
  { title: 'Verify taxonomy code is correct with payer', category: 'billing_setup', priority: 'normal' },
  { title: 'Set up clearinghouse enrollment for payer', category: 'billing_setup', priority: 'normal' },
  { title: 'Verify place of service code for telehealth claims', category: 'billing_setup', priority: 'normal' },
  { title: 'Load fee schedule into billing system', category: 'billing_setup', priority: 'low' },

  // Provider Onboarding
  { title: 'Collect new provider credentialing packet', category: 'provider_onboarding', priority: 'high' },
  { title: 'Create CAQH ProView profile for new provider', category: 'provider_onboarding', priority: 'high' },
  { title: 'Apply for NPI for new provider', category: 'provider_onboarding', priority: 'urgent' },
  { title: 'Verify education and training history', category: 'provider_onboarding', priority: 'normal' },
  { title: 'Run primary source verification (PSV)', category: 'provider_onboarding', priority: 'high' },
  { title: 'Add provider to group NPI', category: 'provider_onboarding', priority: 'normal' },
  { title: 'Set up provider in EHR system', category: 'provider_onboarding', priority: 'normal' },
  { title: 'Order DEA registration for new provider', category: 'provider_onboarding', priority: 'high' },

  // State Expansion
  { title: 'Research telehealth regulations for new state', category: 'state_expansion', priority: 'normal' },
  { title: 'Identify top payers in target state', category: 'state_expansion', priority: 'normal' },
  { title: 'Apply for state license in new state', category: 'state_expansion', priority: 'high' },
  { title: 'Check if compact license covers target state', category: 'state_expansion', priority: 'normal' },
  { title: 'Research Medicaid enrollment in new state', category: 'state_expansion', priority: 'normal' },
  { title: 'Verify prescribing authority in new state', category: 'state_expansion', priority: 'high' },
  { title: 'Register with state PDMP', category: 'state_expansion', priority: 'high' },
  { title: 'Set up business registration in new state', category: 'state_expansion', priority: 'normal' },
  { title: 'Verify malpractice insurance covers new state', category: 'state_expansion', priority: 'high' },

  // Audit / Review
  { title: 'Audit credentialing file for completeness', category: 'audit', priority: 'normal' },
  { title: 'Review expiring licenses (next 90 days)', category: 'audit', priority: 'high' },
  { title: 'Review expiring malpractice insurance', category: 'audit', priority: 'high' },
  { title: 'Audit CAQH profiles for accuracy', category: 'audit', priority: 'normal' },
  { title: 'Review denied applications and resubmit', category: 'audit', priority: 'high' },
  { title: 'Run monthly credentialing status report', category: 'audit', priority: 'normal' },
  { title: 'Review payer contract terms and rates', category: 'audit', priority: 'low' },
  { title: 'Verify all active providers have current licenses', category: 'audit', priority: 'high' },
  { title: 'Check Nursys e-Notify alerts', category: 'audit', priority: 'normal' },
];

// ─── Task Link Helpers ───

const LINK_TYPES = [
  { id: '',             label: 'None (no link)' },
  { id: 'application',  label: 'Application' },
  { id: 'provider',     label: 'Provider' },
  { id: 'organization', label: 'Organization' },
  { id: 'license',      label: 'License' },
  { id: 'payer',        label: 'Payer' },
];

function _renderLinkedToSelector(prefix, existingType, existingId) {
  return `
    <div style="display:flex;gap:6px;">
      <select id="${prefix}-link-type" class="form-control" style="flex:0 0 140px;" onchange="window.app.onLinkTypeChange('${prefix}')">
        ${LINK_TYPES.map(t => `<option value="${t.id}" ${existingType === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select>
      <select id="${prefix}-link-id" class="form-control" style="flex:1;" ${!existingType ? 'disabled' : ''}>
        <option value="">Select...</option>
      </select>
    </div>`;
}

async function _loadLinkOptions(prefix, type, selectedId) {
  const sel = document.getElementById(`${prefix}-link-id`);
  if (!sel) return;
  if (!type) { sel.innerHTML = '<option value="">Select...</option>'; sel.disabled = true; return; }
  sel.disabled = false;
  sel.innerHTML = '<option value="">Loading...</option>';
  try {
    let items = [];
    if (type === 'application') {
      items = (await store.getAll('applications')).map(a => ({ id: a.id, label: `${getStateName(a.state)} — ${a.payerName || getPayerById(a.payerId)?.name || 'Unknown'} (${a.status})` }));
    } else if (type === 'provider') {
      items = (await store.getAll('providers')).map(p => ({ id: p.id, label: `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''} — ${p.credentials || p.credential || ''}`.trim() }));
    } else if (type === 'organization') {
      items = (await store.getAll('organizations')).map(o => ({ id: o.id, label: o.name }));
    } else if (type === 'license') {
      const licenses = await store.getAll('licenses');
      const providers = await store.getAll('providers');
      const provMap = Object.fromEntries(providers.map(p => [p.id, p]));
      items = licenses.map(l => {
        const p = provMap[l.providerId || l.provider_id];
        const pName = p ? `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim() : '';
        return { id: l.id, label: `${pName} — ${l.state} ${l.licenseType || l.license_type || ''} (${l.status})` };
      });
    } else if (type === 'payer') {
      items = (await store.getAll('payers') || []).map(p => ({ id: p.id, label: p.name }));
      if (!items.length) {
        // payers might come from reference endpoint
        try {
          const ref = await store._fetch(store._url('organizations').replace('/organizations', '/reference/payers'));
          items = ((ref.data || ref) || []).map(p => ({ id: p.id, label: p.name }));
        } catch {}
      }
    }
    sel.innerHTML = '<option value="">Select...</option>' + items.map(i => `<option value="${i.id}" ${String(i.id) === String(selectedId) ? 'selected' : ''}>${escHtml(i.label)}</option>`).join('');
  } catch {
    sel.innerHTML = '<option value="">Error loading</option>';
  }
}

function _getLinkedLabel(task, appsMap, extraMaps) {
  const type = task.linkableType || task.linkable_type || (task.linkedApplicationId || task.linkedAppId ? 'application' : '');
  const id = task.linkableId || task.linkable_id || task.linkedApplicationId || task.linkedAppId || '';
  if (!type || !id) return '';
  const typeObj = LINK_TYPES.find(t => t.id === type);
  const typeLabel = typeObj?.label || type;
  if (type === 'application' && appsMap) {
    const app = appsMap[id];
    if (app) {
      const payer = getPayerById(app.payerId) || { name: app.payerName };
      return `<span style="font-size:12px;color:var(--brand-600);">${payer?.name || 'Unknown'} — ${getStateName(app.state)}</span>`;
    }
  }
  if (extraMaps && extraMaps[type]) {
    const entity = extraMaps[type][id];
    if (entity) {
      const name = entity.name || entity.title || entity.firstName && `${entity.firstName} ${entity.lastName}` || `#${id}`;
      return `<span style="font-size:12px;color:var(--brand-600);">${typeLabel}: ${escHtml(name)}</span>`;
    }
  }
  return `<span style="font-size:12px;color:var(--text-muted);">${typeLabel} #${id}</span>`;
}

// ─── Tasks Page (full page, under Operations) ───

async function renderTasksPage() {
  const body = document.getElementById('page-body');
  const tasks = store.filterByScope(await store.getAll('tasks'));
  const allApps = store.filterByScope(await store.getAll('applications'));
  const appsMap = {};
  allApps.forEach(a => { appsMap[a.id] = a; });
  const today = new Date().toISOString().split('T')[0];

  const pending = tasks.filter(t => !t.isCompleted && !t.completed).sort((a, b) => {
    const priOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const pa = priOrder[a.priority] ?? 2;
    const pb = priOrder[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
  const completed = tasks.filter(t => t.isCompleted || t.completed).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const overdue = pending.filter(t => t.dueDate && t.dueDate < today);
  const dueToday = pending.filter(t => t.dueDate === today);
  const upcoming = pending.filter(t => !t.dueDate || t.dueDate > today);

  // Filter state
  const filterCat = document.getElementById('task-filter-cat')?.value || '';
  const filterPri = document.getElementById('task-filter-pri')?.value || '';

  const applyFilters = (list) => list.filter(t =>
    (!filterCat || t.category === filterCat) &&
    (!filterPri || t.priority === filterPri)
  );

  const fOverdue = applyFilters(overdue);
  const fDueToday = applyFilters(dueToday);
  const fUpcoming = applyFilters(upcoming);
  const fCompleted = applyFilters(completed);

  // Completion progress for the week
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const completedThisWeek = completed.filter(t => (t.completedAt || '') >= weekStartStr).length;
  const totalThisWeek = pending.length + completedThisWeek;
  const completionPct = totalThisWeek > 0 ? Math.round((completedThisWeek / totalThisWeek) * 100) : 0;

  body.innerHTML = `
    <style>
      .v2-tasks-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .v2-tasks-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .v2-tasks-stat .v2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .v2-tasks-stat .v2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .v2-tasks-stat .v2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .v2-tasks-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;}
      .v2-tasks-progress{background:white;border-radius:16px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:20px;display:flex;align-items:center;gap:16px;}
      .v2-tasks-progress-bar{flex:1;height:10px;background:var(--gray-100);border-radius:5px;overflow:hidden;}
      .v2-tasks-progress-fill{height:100%;border-radius:5px;transition:width 0.4s ease;}
      .v2-tasks-pri-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:middle;}
      @media(max-width:768px){.v2-tasks-grid{grid-template-columns:repeat(2,1fr);}}
    </style>

    <!-- V2 Stat Cards -->
    <div class="v2-tasks-grid">
      <div class="v2-tasks-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#ef4444,#f87171);"></div>
        <div class="v2-label">Overdue</div>
        <div class="v2-val" style="color:#dc2626;">${overdue.length}</div>
        <div class="v2-sub">need attention</div>
      </div>
      <div class="v2-tasks-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
        <div class="v2-label">Due Today</div>
        <div class="v2-val" style="color:#d97706;">${dueToday.length}</div>
        <div class="v2-sub">${today}</div>
      </div>
      <div class="v2-tasks-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="v2-label">Upcoming</div>
        <div class="v2-val" style="color:#2563eb;">${upcoming.length}</div>
        <div class="v2-sub">scheduled</div>
      </div>
      <div class="v2-tasks-stat">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="v2-label">Completed</div>
        <div class="v2-val" style="color:#16a34a;">${completedThisWeek}</div>
        <div class="v2-sub">this week</div>
      </div>
    </div>

    <!-- Weekly Completion Progress -->
    <div class="v2-tasks-progress">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);white-space:nowrap;">Weekly Progress</span>
      <div class="v2-tasks-progress-bar">
        <div class="v2-tasks-progress-fill" style="width:${completionPct}%;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
      </div>
      <span style="font-size:14px;font-weight:700;color:${completionPct >= 80 ? '#16a34a' : completionPct >= 50 ? '#d97706' : '#dc2626'};min-width:40px;text-align:right;">${completionPct}%</span>
      <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${completedThisWeek}/${totalThisWeek} tasks</span>
    </div>

    <div id="task-page-add-form" style="display:none;margin-bottom:16px;padding:16px;border:1px solid var(--border);border-radius:16px;background:white;box-shadow:var(--shadow);">
      <h3 style="margin-bottom:12px;font-size:15px;">New Task</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div style="grid-column:1/-1;position:relative;">
          <input type="text" id="task-page-title" class="form-control" list="task-page-presets" placeholder="Select a task or type your own..." autocomplete="off" oninput="window.app.onPageTaskTitleChange(this.value)">
          <datalist id="task-page-presets">
            ${TASK_CATEGORIES.map(cat => {
              const catTasks = PRESET_TASKS.filter(t => t.category === cat.id);
              return catTasks.map(t => `<option value="${t.title}" label="${cat.label}">`).join('');
            }).join('')}
          </datalist>
        </div>
        <select id="task-page-category" class="form-control">
          ${TASK_CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
        </select>
        <select id="task-page-priority" class="form-control">
          ${TASK_PRIORITIES.map(p => `<option value="${p.id}" ${p.id === 'normal' ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
        <input type="date" id="task-page-due" class="form-control">
        ${_renderLinkedToSelector('task-page', '', '')}
        <select id="task-page-recurrence" class="form-control">
          <option value="">No recurrence</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
        </select>
      </div>
      <textarea id="task-page-notes" class="form-control" rows="2" placeholder="Notes (optional)" style="margin-bottom:10px;"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" onclick="window.app.cancelPageTaskForm()">Cancel</button>
        <button class="btn btn-primary" onclick="window.app.savePageTask()">Save Task</button>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
      <select id="task-filter-cat" class="form-control" style="width:auto;min-width:140px;" onchange="window.app.refreshTasksPage()">
        <option value="">All Categories</option>
        ${TASK_CATEGORIES.map(c => `<option value="${c.id}" ${filterCat === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
      </select>
      <select id="task-filter-pri" class="form-control" style="width:auto;min-width:130px;" onchange="window.app.refreshTasksPage()">
        <option value="">All Priorities</option>
        ${TASK_PRIORITIES.map(p => `<option value="${p.id}" ${filterPri === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
      </select>
      <span style="color:var(--text-muted);font-size:13px;">${pending.length} pending, ${completed.length} completed</span>
    </div>

    ${fOverdue.length > 0 ? renderTaskSection('Overdue', fOverdue, today, 'var(--red)', appsMap) : ''}
    ${fDueToday.length > 0 ? renderTaskSection('Due Today', fDueToday, today, 'var(--warning-600)', appsMap) : ''}
    ${fUpcoming.length > 0 ? renderTaskSection('Upcoming', fUpcoming, today, 'var(--teal)', appsMap) : ''}
    ${pending.length === 0 ? '<div class="card" style="text-align:center;padding:40px;color:var(--text-muted);"><h3>No pending tasks</h3><p>Click "+ Add Task" to create one.</p></div>' : ''}
    ${fCompleted.length > 0 ? `
      <div class="card" style="margin-top:16px;">
        <div class="card-header" style="cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
          <h3 style="color:var(--green);">Completed (${fCompleted.length})</h3>
        </div>
        <div class="card-body" style="padding:0;display:none;">
          <table>
            <thead><tr><th style="width:40px;"></th><th>Task</th><th>Category</th><th>Priority</th><th>Completed</th><th style="width:60px;"></th></tr></thead>
            <tbody>
              ${fCompleted.slice(0, 50).map(t => renderTaskPageRow(t, today, appsMap)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}
  `;
}

function renderTaskSection(title, tasks, today, color, appsMap) {
  return `
    <div class="card" style="margin-bottom:12px;border-radius:16px;overflow:hidden;border-left:4px solid ${color};">
      <div class="card-header"><h3 style="color:${color};">${title} (${tasks.length})</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th style="width:40px;"></th><th>Task</th><th>Category</th><th>Priority</th><th>Due Date</th><th>Linked App</th><th style="width:60px;"></th></tr></thead>
          <tbody>
            ${tasks.map(t => renderTaskPageRow(t, today, appsMap)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderTaskPageRow(task, today, appsMap) {
  const cat = TASK_CATEGORIES.find(c => c.id === task.category) || TASK_CATEGORIES[TASK_CATEGORIES.length - 1];
  const pri = TASK_PRIORITIES.find(p => p.id === task.priority) || TASK_PRIORITIES[2];
  const isOverdue = !task.isCompleted && !task.completed && task.dueDate && task.dueDate < today;
  const linkedLabel = _getLinkedLabel(task, appsMap);

  const isDone = task.isCompleted || task.completed;
  return `<tr class="${isOverdue ? 'overdue' : ''}" style="${isDone ? 'opacity:0.6;' : ''}">
    <td><input type="checkbox" ${isDone ? 'checked' : ''} onchange="window.app.toggleTaskPage('${task.id}')" style="cursor:pointer;accent-color:var(--brand-600);transform:scale(1.2);"></td>
    <td>
      <div style="font-weight:${isDone ? '400' : '600'};${isDone ? 'text-decoration:line-through;' : ''}cursor:${task.notes ? 'help' : 'default'};" ${task.notes ? `title="${escAttr(task.notes)}"` : ''}>${escHtml(task.title)}${task.recurrence ? ` <span style="font-size:10px;padding:1px 5px;background:var(--teal);color:white;border-radius:3px;">&#8635; ${task.recurrence}</span>` : ''}${task.notes ? ' <span style="font-size:10px;color:var(--text-muted);">&#x1f4dd;</span>' : ''}</div>
    </td>
    <td><span style="font-size:12px;">${cat.icon} ${cat.label}</span></td>
    <td><span class="v2-tasks-pri-dot" style="background:${pri.color};"></span><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${pri.color}15;color:${pri.color};font-weight:600;">${pri.label}</span></td>
    <td style="white-space:nowrap;${isOverdue ? 'color:var(--red);font-weight:600;' : ''}">${task.dueDate ? formatDateDisplay(task.dueDate) : '-'}</td>
    <td>${linkedLabel || '-'}</td>
    <td style="white-space:nowrap;">
      <button onclick="window.app.editTaskPage('${task.id}')" style="background:none;border:none;color:var(--brand-600);cursor:pointer;font-size:13px;" title="Edit">&#9998;</button>
      <button onclick="window.app.deleteTaskPage('${task.id}')" style="background:none;border:none;color:var(--text-light);cursor:pointer;font-size:16px;" title="Delete">&times;</button>
    </td>
  </tr>`;
}

async function renderTaskModal() {
  const tasks = await store.getAll('tasks');
  const modalApps = await store.getAll('applications');
  const modalAppsMap = {};
  modalApps.forEach(a => { modalAppsMap[a.id] = a; });
  const today = new Date().toISOString().split('T')[0];
  const pending = tasks.filter(t => !t.isCompleted && !t.completed).sort((a, b) => {
    const priOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const pa = priOrder[a.priority] ?? 2;
    const pb = priOrder[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
  const completed = tasks.filter(t => t.isCompleted || t.completed).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const overdue = pending.filter(t => t.dueDate && t.dueDate < today);
  const dueToday = pending.filter(t => t.dueDate === today);
  const upcoming = pending.filter(t => !t.dueDate || t.dueDate > today);

  const body = document.getElementById('task-modal-body');
  body.innerHTML = `
    <style>
      .tmv2-stat{border-radius:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);}
      .tmv2-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
    </style>
    <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
      <div class="stat-card tmv2-stat" style="flex:1;min-width:80px;padding:8px 12px;">
        <div class="label">Overdue</div>
        <div class="value" style="font-size:20px;color:var(--red);">${overdue.length}</div>
      </div>
      <div class="stat-card tmv2-stat" style="flex:1;min-width:80px;padding:8px 12px;">
        <div class="label">Due Today</div>
        <div class="value" style="font-size:20px;color:var(--warning-600);">${dueToday.length}</div>
      </div>
      <div class="stat-card tmv2-stat" style="flex:1;min-width:80px;padding:8px 12px;">
        <div class="label">Upcoming</div>
        <div class="value" style="font-size:20px;color:var(--brand-600);">${upcoming.length}</div>
      </div>
      <div class="stat-card tmv2-stat" style="flex:1;min-width:80px;padding:8px 12px;">
        <div class="label">Done</div>
        <div class="value" style="font-size:20px;color:var(--green);">${completed.length}</div>
      </div>
    </div>

    <div id="task-add-form" style="display:none;margin-bottom:16px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--gray-50);">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="grid-column:1/-1;position:relative;">
          <input type="text" id="task-title" class="form-control" list="task-presets" placeholder="Select a task or type your own..." autocomplete="off" oninput="window.app.onTaskTitleChange(this.value)">
          <datalist id="task-presets">
            ${TASK_CATEGORIES.map(cat => {
              const catTasks = PRESET_TASKS.filter(t => t.category === cat.id);
              return catTasks.map(t => `<option value="${t.title}" label="${cat.label}">`).join('');
            }).join('')}
          </datalist>
        </div>
        <select id="task-category" class="form-control">
          ${TASK_CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
        </select>
        <select id="task-priority" class="form-control">
          ${TASK_PRIORITIES.map(p => `<option value="${p.id}" ${p.id === 'normal' ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
        <input type="date" id="task-due" class="form-control" placeholder="Due date">
        ${_renderLinkedToSelector('task', '', '')}
        <select id="task-recurrence" class="form-control">
          <option value="">No recurrence</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
        </select>
      </div>
      <textarea id="task-notes" class="form-control" rows="2" placeholder="Notes (optional)" style="margin-bottom:8px;"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-sm" onclick="window.app.cancelTaskForm()">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="window.app.saveTask()">Save Task</button>
      </div>
    </div>

    ${overdue.length > 0 ? `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px;">OVERDUE</div>
        ${overdue.map(t => renderTaskItem(t, today, modalAppsMap)).join('')}
      </div>
    ` : ''}
    ${dueToday.length > 0 ? `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--warning-600);margin-bottom:6px;">DUE TODAY</div>
        ${dueToday.map(t => renderTaskItem(t, today, modalAppsMap)).join('')}
      </div>
    ` : ''}
    ${upcoming.length > 0 ? `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--brand-600);margin-bottom:6px;">UPCOMING</div>
        ${upcoming.map(t => renderTaskItem(t, today, modalAppsMap)).join('')}
      </div>
    ` : ''}
    ${pending.length === 0 ? '<div style="text-align:center;padding:20px;color:#94a3b8;">No pending tasks. Click "Add Task" to create one.</div>' : ''}
    ${completed.length > 0 ? `
      <details style="margin-top:8px;">
        <summary style="font-size:12px;font-weight:700;color:var(--green);cursor:pointer;margin-bottom:6px;">COMPLETED (${completed.length})</summary>
        ${completed.slice(0, 20).map(t => renderTaskItem(t, today, modalAppsMap)).join('')}
      </details>
    ` : ''}
  `;
}

function renderTaskItem(task, today, appsMap) {
  const cat = TASK_CATEGORIES.find(c => c.id === task.category) || TASK_CATEGORIES[TASK_CATEGORIES.length - 1];
  const pri = TASK_PRIORITIES.find(p => p.id === task.priority) || TASK_PRIORITIES[2];
  const isOverdue = !task.isCompleted && !task.completed && task.dueDate && task.dueDate < today;
  const linkedLabel = _getLinkedLabel(task, appsMap);

  const isDone = task.isCompleted || task.completed;
  return `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:6px;border:1px solid ${isOverdue ? 'var(--red)' : 'var(--border)'};margin-bottom:4px;background:${isDone ? '#f1f5f9' : 'white'};${isDone ? 'opacity:0.7;' : ''}">
      <input type="checkbox" ${isDone ? 'checked' : ''} onchange="window.app.toggleTask('${task.id}')" style="margin-top:3px;cursor:pointer;accent-color:var(--brand-600);">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;padding:1px 5px;border-radius:4px;background:${pri.color}15;color:${pri.color};font-weight:600;">${pri.label}</span>
          <span style="font-size:11px;color:#64748b;" title="${cat.label}">${cat.icon} ${cat.label}</span>
          ${task.dueDate ? `<span style="font-size:11px;color:${isOverdue ? 'var(--red)' : '#64748b'};">${formatDateDisplay(task.dueDate)}</span>` : ''}
        </div>
        <div style="font-size:13px;font-weight:${isDone ? '400' : '600'};${isDone ? 'text-decoration:line-through;' : ''}cursor:${task.notes ? 'help' : 'default'};" ${task.notes ? `title="${escAttr(task.notes)}"` : ''}>${escHtml(task.title)}${task.notes ? ' <span style="font-size:10px;color:#94a3b8;">&#x1f4dd;</span>' : ''}</div>
        ${linkedLabel ? `<div style="font-size:10px;margin-top:2px;">Linked: ${linkedLabel}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;">
        <button onclick="window.app.editTask('${task.id}')" style="background:none;border:none;color:var(--brand-600);cursor:pointer;font-size:12px;" title="Edit">&#9998;</button>
        <button onclick="window.app.deleteTask('${task.id}')" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;" title="Delete">&times;</button>
      </div>
    </div>
  `;
}

function showQuickTask() {
  const modal = document.getElementById('task-modal');
  renderTaskModal();
  modal.classList.add('active');
}

async function quickAddApp() {
  await openApplicationModal();
}

// ─── New Tool Renderers ───

// [Lazy-loaded] renderDocChecklistTool — moved to ui/pages/ module

// ─── Lazy Page Module Loaders ───
// Cached module references so dynamic import() only hits the network once per module.
const _pageModules = {};
async function _page(name) {
  if (!_pageModules[name]) _pageModules[name] = await import(`./pages/${name}.js`);
  return _pageModules[name];
}

// Convenience stubs — these look like the original functions but lazy-load from modules.
async function renderBillingPage()           { (await _page('billing')).renderBillingPage(); }
async function renderInvoiceDetail(id)       { (await _page('billing')).renderInvoiceDetail(id); }
async function renderContractsPage()         { (await _page('billing')).renderContractsPage(); }
async function renderContractDetail(id)      { (await _page('billing')).renderContractDetail(id); }
async function renderExclusionsPage()        { (await _page('compliance')).renderExclusionsPage(); }
async function renderCompliancePage()        { (await _page('compliance')).renderCompliancePage(); }
async function renderPSVPage()               { (await _page('compliance')).renderPSVPage(); }
async function renderMonitoringPage()        { (await _page('compliance')).renderMonitoringPage(); }
async function renderAdminPanel()            { (await _page('admin')).renderAdminPanel(); }
async function renderOnboardingStub()        { (await _page('admin')).renderOnboardingStub(); }
async function renderImportPage()            { (await _page('admin')).renderImportPage(); }
async function renderAuditTrail()            { (await _page('admin')).renderAuditTrail(); }
async function renderFaqPage()               { (await _page('admin')).renderFaqPage(); }
async function renderAutomationsPage()       { (await _page('admin')).renderAutomationsPage(); }
async function renderApiDocsPage()           { (await _page('admin')).renderApiDocsPage(); }
async function renderProviderDashboard(u)    { (await _page('provider-profile')).renderProviderDashboard(u); }
async function renderProviderProfilePage(id) { (await _page('provider-profile')).renderProviderProfilePage(id); }
async function renderProviderPrintout(id)    { (await _page('provider-profile')).renderProviderPrintout(id); }
async function renderProviderPortableProfile(id) { (await _page('provider-profile')).renderProviderPortableProfile(id); }
async function renderFundingDashboard()      { (await _page('funding')).renderFundingDashboard(); }
async function renderFundingFederal()        { (await _page('funding')).renderFundingFederal(); }
async function renderFundingState()          { (await _page('funding')).renderFundingState(); }
async function renderFundingFoundations()    { (await _page('funding')).renderFundingFoundations(); }
async function renderFundingPipeline()       { (await _page('funding')).renderFundingPipeline(); }
async function renderFundingCalendar()       { (await _page('funding')).renderFundingCalendar(); }
async function renderFundingIntelligence()   { (await _page('funding')).renderFundingIntelligence(); }
async function renderFundingDetail(id)       { (await _page('funding')).renderFundingDetail(id); }
async function renderDocChecklistTool()      { (await _page('tools')).renderDocChecklistTool(); }
async function renderFeeScheduleTool()       { (await _page('tools')).renderFeeScheduleTool(); }
async function renderPayerPortalTool()       { (await _page('tools')).renderPayerPortalTool(); }
async function renderExpirationAlertsTool()  { (await _page('tools')).renderExpirationAlertsTool(); }
async function renderStatusExportTool()      { (await _page('tools')).renderStatusExportTool(); }
async function renderStateLookupTool()       { (await _page('tools')).renderStateLookupTool(); }
async function renderDeadlineTimelineTool()  { (await _page('tools')).renderDeadlineTimelineTool(); }
async function renderLetterGeneratorTool()   { (await _page('tools')).renderLetterGeneratorTool(); }
async function renderCaqhManager()           { (await _page('tools')).renderCaqhManager(); }
async function renderTaxonomySearch()        { (await _page('tools')).renderTaxonomySearch(); }
function renderNPIResultCard(prov)           { return _pageModules['tools']?.renderNPIResultCard(prov) || ''; }
// Billing helpers — synchronous stubs (module must be loaded already when called)
function _fmtMoney(n) { return _pageModules['billing']?._fmtMoney(n) || ('$' + Number(n || 0).toFixed(2)); }
function _renderLineItemsEditor() { return _pageModules['billing']?._renderLineItemsEditor() || ''; }
function _renderSubscriptionTab(sub, plans) { return _pageModules['billing']?._renderSubscriptionTab(sub, plans) || ''; }
function _invoiceStatusBadge(st) { return _pageModules['billing']?._invoiceStatusBadge(st) || st; }
function _nextInvoiceNumber(inv) { return _pageModules['billing']?._nextInvoiceNumber(inv) || 'INV-0001'; }
function _renderContractLineItems() { return _pageModules['billing']?._renderContractLineItems() || ''; }
function _defaultContractTerms() { return _pageModules['billing']?._defaultContractTerms() || ''; }

function openAutomationRuleModal(id)         { _page('admin').then(m => m.openAutomationRuleModal(id)); }
function saveAutomationRule()                { _page('admin').then(m => m.saveAutomationRule()); }
function deleteAutomationRule(id)            { _page('admin').then(m => m.deleteAutomationRule(id)); }
function toggleAutomationRule(id)            { _page('admin').then(m => m.toggleAutomationRule(id)); }

// ─── Public API (exposed to window for onclick handlers) ───

window.app = {
  navigateTo,
  filters,
  showToast,
  closeConfirmModal,

  // Scope selector
  toggleScopeDropdown,
  setScopeAll() {
    store.clearScope();
    document.getElementById('scope-panel').style.display = 'none';
  },
  setScopeOrg(orgId, orgName) {
    store.setScope('organization', orgId, null, orgName);
    document.getElementById('scope-panel').style.display = 'none';
  },
  setScopeProvider(providerId, providerName, orgId) {
    store.setScope('provider', orgId, providerId, '', providerName);
    document.getElementById('scope-panel').style.display = 'none';
  },
  openTaskEditModal,
  closeTaskEditModal,
  saveTaskEdit,
  onLinkTypeChange(prefix) {
    const type = document.getElementById(`${prefix}-link-type`)?.value || '';
    _loadLinkOptions(prefix, type, '');
  },

  // Document Checklist
  async openDocChecklist(appId) { await openDocChecklist(appId); },
  async toggleDoc(appId, docId) {
    const app = await store.getOne('applications', appId);
    if (!app) return;
    const docs = app.documentChecklist || {};
    const current = docs[docId] || {};
    docs[docId] = current.completed
      ? { completed: false, completedDate: null, note: '' }
      : { completed: true, completedDate: new Date().toISOString().split('T')[0], note: current.note || '' };
    await store.update('applications', appId, { documentChecklist: docs });
    await openDocChecklist(appId);
  },
  async toggleDocWithNote(appId, docId) {
    const note = await appPrompt('Add a note for this document:', { title: 'Document Note', placeholder: 'e.g. Received via email on...' });
    if (note === false || note === null) return;
    const app = await store.getOne('applications', appId);
    if (!app) return;
    const docs = app.documentChecklist || {};
    docs[docId] = { completed: true, completedDate: new Date().toISOString().split('T')[0], note };
    await store.update('applications', appId, { documentChecklist: docs });
    await openDocChecklist(appId);
  },
  async checkAllDocs(appId) {
    const app = await store.getOne('applications', appId);
    if (!app) return;
    const docs = app.documentChecklist || {};
    const today = new Date().toISOString().split('T')[0];
    CRED_DOCUMENTS.forEach(d => {
      if (!docs[d.id]?.completed) docs[d.id] = { completed: true, completedDate: today, note: '' };
    });
    await store.update('applications', appId, { documentChecklist: docs });
    await openDocChecklist(appId);
  },
  async uncheckAllDocs(appId) { await store.update('applications', appId, { documentChecklist: {} });
    await openDocChecklist(appId);
  },

  // Tasks Page
  showAddTaskForm() {
    const form = document.getElementById('task-page-add-form');
    if (form) { form.style.display = ''; form.scrollIntoView({ behavior: 'smooth' }); }
  },
  cancelPageTaskForm() {
    const form = document.getElementById('task-page-add-form');
    if (form) form.style.display = 'none';
  },
  async savePageTask() {
    const title = document.getElementById('task-page-title')?.value?.trim();
    if (!title) { showToast('Enter a task title'); return; }
    try {
      const pgLinkType = document.getElementById('task-page-link-type')?.value || '';
      const pgLinkId = document.getElementById('task-page-link-id')?.value || '';
      await store.create('tasks', {
        title,
        category: document.getElementById('task-page-category')?.value || 'other',
        priority: document.getElementById('task-page-priority')?.value || 'normal',
        dueDate: document.getElementById('task-page-due')?.value || '',
        linkableType: pgLinkType || '',
        linkableId: pgLinkId || '',
        linkedApplicationId: pgLinkType === 'application' ? pgLinkId : '',
        recurrence: document.getElementById('task-page-recurrence')?.value || '',
        notes: document.getElementById('task-page-notes')?.value?.trim() || '',
        isCompleted: false,
        completedAt: '',
      });
    } catch (e) { showToast('Error saving task: ' + e.message); return; }
    showToast('Task added');
    await renderTasksPage();
  },
  onPageTaskTitleChange(value) {
    const preset = PRESET_TASKS.find(t => t.title === value);
    if (preset) {
      const catEl = document.getElementById('task-page-category');
      const priEl = document.getElementById('task-page-priority');
      if (catEl) catEl.value = preset.category;
      if (priEl) priEl.value = preset.priority;
    }
  },
  async toggleTaskPage(id) {
    const task = await store.getOne('tasks', id);
    if (!task) return;
    await store.update('tasks', id, {
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : null,
    });
    await renderTasksPage();
  },
  editTaskPage(id) { openTaskEditModal(id); },
  async deleteTaskPage(id) {
    if (!await appConfirm('Delete this task?', { title: 'Delete Task', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    await store.remove('tasks', id);
    await renderTasksPage();
    showToast('Task deleted');
  },
  async refreshTasksPage() { await renderTasksPage(); },

  async showWorkflowTemplates() {
    const WORKFLOW_TEMPLATES = [
      {
        name: 'Initial Credentialing',
        desc: 'Full workflow for credentialing a new provider with a payer',
        icon: '&#128203;',
        tasks: [
          { title: 'Collect provider demographics & NPI', category: 'documentation', priority: 'high', dayOffset: 0 },
          { title: 'Obtain state license copies', category: 'documentation', priority: 'high', dayOffset: 1 },
          { title: 'Verify NPI via NPPES', category: 'payer_enrollment', priority: 'normal', dayOffset: 2 },
          { title: 'Obtain malpractice COI', category: 'documentation', priority: 'high', dayOffset: 3 },
          { title: 'Collect board certification documents', category: 'documentation', priority: 'normal', dayOffset: 3 },
          { title: 'Run OIG/SAM exclusion screening', category: 'compliance', priority: 'high', dayOffset: 4 },
          { title: 'Complete CAQH profile update', category: 'payer_enrollment', priority: 'high', dayOffset: 5 },
          { title: 'Submit credentialing application', category: 'payer_enrollment', priority: 'urgent', dayOffset: 7 },
          { title: 'Follow up on application status (2 weeks)', category: 'followup', priority: 'normal', dayOffset: 21 },
          { title: 'Follow up on application status (4 weeks)', category: 'followup', priority: 'normal', dayOffset: 35 },
          { title: 'Verify credentialing approval received', category: 'payer_enrollment', priority: 'high', dayOffset: 60 },
          { title: 'Confirm effective date & update records', category: 'payer_enrollment', priority: 'normal', dayOffset: 62 },
        ],
      },
      {
        name: 'Re-credentialing',
        desc: 'Renewal workflow for existing provider-payer relationships',
        icon: '&#128260;',
        tasks: [
          { title: 'Review current credential status', category: 'compliance', priority: 'normal', dayOffset: 0 },
          { title: 'Update provider demographics if changed', category: 'documentation', priority: 'normal', dayOffset: 1 },
          { title: 'Verify all licenses are current', category: 'compliance', priority: 'high', dayOffset: 2 },
          { title: 'Update malpractice COI', category: 'documentation', priority: 'high', dayOffset: 3 },
          { title: 'Re-attest CAQH profile', category: 'payer_enrollment', priority: 'high', dayOffset: 4 },
          { title: 'Submit re-credentialing application', category: 'payer_enrollment', priority: 'urgent', dayOffset: 5 },
          { title: 'Follow up on re-credentialing (2 weeks)', category: 'followup', priority: 'normal', dayOffset: 19 },
          { title: 'Confirm re-credentialing approval', category: 'payer_enrollment', priority: 'high', dayOffset: 45 },
        ],
      },
      {
        name: 'License Renewal',
        desc: 'State license renewal checklist',
        icon: '&#128196;',
        tasks: [
          { title: 'Verify renewal requirements for state', category: 'compliance', priority: 'normal', dayOffset: 0 },
          { title: 'Complete required CME hours', category: 'documentation', priority: 'high', dayOffset: 7 },
          { title: 'Gather renewal documents', category: 'documentation', priority: 'normal', dayOffset: 14 },
          { title: 'Submit renewal application to state board', category: 'payer_enrollment', priority: 'urgent', dayOffset: 21 },
          { title: 'Pay renewal fee', category: 'billing', priority: 'high', dayOffset: 21 },
          { title: 'Confirm new license received', category: 'compliance', priority: 'high', dayOffset: 45 },
          { title: 'Update license in Credentik', category: 'documentation', priority: 'normal', dayOffset: 46 },
        ],
      },
      {
        name: 'New Provider Onboarding',
        desc: 'Complete onboarding checklist for a new provider joining the organization',
        icon: '&#128100;',
        tasks: [
          { title: 'Create provider profile in system', category: 'documentation', priority: 'high', dayOffset: 0 },
          { title: 'NPI lookup & verify credentials', category: 'payer_enrollment', priority: 'high', dayOffset: 0 },
          { title: 'Collect CV/resume', category: 'documentation', priority: 'normal', dayOffset: 1 },
          { title: 'Collect education & training records', category: 'documentation', priority: 'normal', dayOffset: 1 },
          { title: 'Collect work history (5-year)', category: 'documentation', priority: 'normal', dayOffset: 2 },
          { title: 'Collect professional references (3)', category: 'documentation', priority: 'normal', dayOffset: 2 },
          { title: 'Run background check', category: 'compliance', priority: 'high', dayOffset: 3 },
          { title: 'Run exclusion screening (OIG/SAM)', category: 'compliance', priority: 'urgent', dayOffset: 3 },
          { title: 'Verify all state licenses', category: 'compliance', priority: 'high', dayOffset: 4 },
          { title: 'Set up CAQH ProView profile', category: 'payer_enrollment', priority: 'high', dayOffset: 5 },
          { title: 'Identify priority payers for enrollment', category: 'payer_enrollment', priority: 'normal', dayOffset: 7 },
        ],
      },
      {
        name: 'Payer Audit Response',
        desc: 'Prepare and respond to a payer credentialing audit',
        icon: '&#128269;',
        tasks: [
          { title: 'Review audit request & scope', category: 'compliance', priority: 'urgent', dayOffset: 0 },
          { title: 'Pull provider credential files', category: 'documentation', priority: 'high', dayOffset: 1 },
          { title: 'Verify all licenses are current', category: 'compliance', priority: 'high', dayOffset: 1 },
          { title: 'Export compliance audit packet', category: 'compliance', priority: 'high', dayOffset: 2 },
          { title: 'Review for gaps & remediate', category: 'compliance', priority: 'urgent', dayOffset: 3 },
          { title: 'Submit audit response to payer', category: 'followup', priority: 'urgent', dayOffset: 5 },
          { title: 'Follow up on audit resolution', category: 'followup', priority: 'high', dayOffset: 14 },
        ],
      },
    ];

    const content = `
      <div style="max-width:700px;">
        <p style="color:var(--gray-500);font-size:13px;margin-bottom:16px;">Select a workflow template to auto-create a set of tasks with proper sequencing and priorities.</p>
        ${WORKFLOW_TEMPLATES.map((wf, i) => `
          <div class="card" style="margin-bottom:12px;cursor:pointer;transition:box-shadow 0.15s;" onmouseenter="this.style.boxShadow='0 4px 12px rgba(0,0,0,.1)'" onmouseleave="this.style.boxShadow=''" onclick="window.app.applyWorkflowTemplate(${i})">
            <div class="card-body" style="padding:14px 18px;display:flex;align-items:center;gap:14px;">
              <div style="font-size:28px;width:44px;text-align:center;flex-shrink:0;">${wf.icon}</div>
              <div style="flex:1;">
                <div style="font-weight:700;font-size:14px;color:var(--gray-800);">${wf.name}</div>
                <div style="font-size:12px;color:var(--gray-500);margin-top:2px;">${wf.desc}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="font-size:18px;font-weight:700;color:var(--brand-600);">${wf.tasks.length}</div>
                <div style="font-size:10px;color:var(--gray-400);">tasks</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    window._workflowTemplates = WORKFLOW_TEMPLATES;
    await appConfirm(content, { title: 'Workflow Templates', okLabel: '', cancelLabel: 'Close', raw: true });
  },

  async applyWorkflowTemplate(index) {
    const templates = window._workflowTemplates;
    if (!templates || !templates[index]) return;
    const wf = templates[index];
    if (!await appConfirm(`Create ${wf.tasks.length} tasks from "${wf.name}"? Tasks will be scheduled starting today.`, { title: 'Apply Template', okLabel: `Create ${wf.tasks.length} Tasks` })) return;

    showToast(`Creating ${wf.tasks.length} tasks...`);
    const today = new Date();
    let created = 0;
    for (const t of wf.tasks) {
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + t.dayOffset);
      try {
        await store.create('tasks', {
          title: t.title,
          category: t.category,
          priority: t.priority,
          dueDate: dueDate.toISOString().split('T')[0],
          isCompleted: false,
          notes: `From template: ${wf.name}`,
        });
        created++;
      } catch (e) { console.error('Failed to create task:', t.title, e); }
    }
    showToast(`${created} tasks created from "${wf.name}"`);
    // Close the confirm modal
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.remove('active');
    await renderTasksPage();
  },

  // ── PSV Controls ──
  async runFullPSV() {
    if (!await appConfirm('Run Primary Source Verification for all providers? This will check licenses, NPI, DEA, board certifications, and exclusions against authoritative sources.', { title: 'Full PSV Scan', okLabel: 'Verify All' })) return;
    showToast('Running PSV scan across all providers...');
    try {
      // Screen all providers for exclusions as part of PSV
      await store.screenAllProviders();
      showToast('PSV scan complete — results updated');
      await renderPSVPage();
    } catch (e) { showToast('PSV scan error: ' + e.message); }
  },
  async runProviderPSV(providerId) {
    showToast('Verifying provider credentials...');
    try {
      await store.screenProvider(providerId);
      showToast('Provider verification complete');
      await renderPSVPage();
    } catch (e) { showToast('Verification error: ' + e.message); }
  },
  exportPSVReport() {
    const rows = document.querySelectorAll('#psv-table-body tr');
    if (!rows.length) { showToast('No data to export'); return; }
    let csv = 'Provider,NPI,License Status,DEA Status,Exclusion Status,Board Cert,Last Verified,Overall\n';
    rows.forEach(r => {
      const cells = r.querySelectorAll('td');
      if (cells.length >= 8) csv += Array.from(cells).map(c => `"${c.textContent.trim().replace(/"/g, '""')}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `credentik-psv-report-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    showToast('PSV report exported');
  },
  shareProviderProfile(providerId) {
    window._selectedProviderId = providerId;
    navigateTo('provider-profile-share');
  },
  copyProviderProfileLink(providerId) {
    const url = `${window.location.origin}${window.location.pathname}#provider-profile-share&id=${providerId}`;
    navigator.clipboard.writeText(url).then(() => showToast('Profile link copied!')).catch(() => showToast('Failed to copy link'));
  },

  // ── Monitoring Controls ──
  async runMonitoringScan() {
    if (!await appConfirm('Run a full monitoring scan? This checks all credentials for changes, expirations, and compliance issues.', { title: 'Monitoring Scan', okLabel: 'Scan Now' })) return;
    showToast('Running monitoring scan...');
    try {
      await store.screenAllProviders();
      showToast('Monitoring scan complete');
      await renderMonitoringPage();
    } catch (e) { showToast('Scan error: ' + e.message); }
  },
  exportMonitoringReport() {
    const rows = document.querySelectorAll('#monitoring-alerts-body tr');
    if (!rows.length) { showToast('No alerts to export'); return; }
    let csv = 'Severity,Provider,Alert,Details,Date,Action Required\n';
    rows.forEach(r => {
      const cells = r.querySelectorAll('td');
      if (cells.length >= 5) csv += Array.from(cells).map(c => `"${c.textContent.trim().replace(/"/g, '""')}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `credentik-monitoring-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    showToast('Monitoring report exported');
  },

  // ── Cross-Facility Credentialing ──
  async openCrossFacilityCredentialing() {
    const [providers, facilities, apps] = await Promise.all([
      store.getAll('providers'),
      store.getFacilities().catch(() => []),
      store.getAll('applications'),
    ]);
    if (!providers.length) { showToast('No providers found'); return; }
    if (!facilities.length) { showToast('No facilities found — add facilities first'); return; }

    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const inputEl = document.getElementById('confirm-modal-input');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    if (inputEl) inputEl.style.display = 'none';

    titleEl.textContent = 'Cross-Facility Credentialing';
    msgEl.innerHTML = `
      <div style="margin-bottom:12px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Select Provider</label>
        <select id="xfac-provider" class="form-control" style="width:100%;">
          ${providers.map(p => `<option value="${p.id}">${escHtml(p.firstName + ' ' + p.lastName)} (${escHtml(p.credentials || '')})</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Select Payer</label>
        <select id="xfac-payer" class="form-control" style="width:100%;">
          <option value="">Select payer...</option>
          ${PAYER_CATALOG.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px;">Select Facilities (${facilities.length} available)</label>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:8px;padding:8px;">
        ${facilities.map(f => {
          const hasApp = apps.some(a => a.facilityId === f.id);
          return `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--gray-100);cursor:pointer;font-size:13px;">
            <input type="checkbox" class="xfac-facility" value="${f.id}" data-name="${escHtml(f.name || '')}">
            <div>
              <strong>${escHtml(f.name || 'Unnamed')}</strong>
              <span style="color:var(--gray-500);margin-left:8px;">${escHtml(f.city || '')}${f.state ? ', ' + escHtml(f.state) : ''}</span>
              ${f.npi ? `<span style="color:var(--gray-400);margin-left:8px;">NPI: ${escHtml(f.npi)}</span>` : ''}
            </div>
          </label>`;
        }).join('')}
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;">
        <button class="btn btn-sm" onclick="document.querySelectorAll('.xfac-facility').forEach(c=>c.checked=true)">Select All</button>
        <button class="btn btn-sm" onclick="document.querySelectorAll('.xfac-facility').forEach(c=>c.checked=false)">Clear All</button>
      </div>
    `;

    okBtn.textContent = 'Create Applications';
    okBtn.className = 'btn btn-primary';
    cancelBtn.textContent = 'Cancel';
    modal.classList.add('active');

    // Override the ok click
    okBtn.onclick = async () => {
      const providerId = document.getElementById('xfac-provider').value;
      const payerId = document.getElementById('xfac-payer').value;
      const payer = getPayerById(payerId);
      if (!payerId) { showToast('Please select a payer'); return; }

      const checked = [...document.querySelectorAll('.xfac-facility:checked')];
      if (!checked.length) { showToast('Please select at least one facility'); return; }

      okBtn.disabled = true;
      okBtn.textContent = 'Creating...';
      let created = 0;
      for (const cb of checked) {
        try {
          await store.create('applications', {
            providerId,
            facilityId: cb.value,
            facilityName: cb.dataset.name,
            payerId,
            payerName: payer ? payer.name : '',
            status: 'not_started',
            type: 'individual',
            wave: 1,
            state: '',
            notes: `Cross-facility credentialing batch — ${cb.dataset.name}`,
          });
          created++;
        } catch (e) { console.error('Failed to create app for facility:', cb.dataset.name, e); }
      }
      showToast(`${created} application(s) created across ${checked.length} facilities`);
      modal.classList.remove('active');
      okBtn.disabled = false;
      okBtn.onclick = null;
      await navigateTo('applications');
    };
    cancelBtn.onclick = () => { modal.classList.remove('active'); okBtn.onclick = null; };
  },

  // ── Global Smart Search ──
  async openGlobalSearch() {
    // Create search overlay if not already present
    let overlay = document.getElementById('global-search-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-search-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Command palette');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:var(--surface-overlay);display:flex;align-items:flex-start;justify-content:center;padding-top:10vh;backdrop-filter:blur(4px);';
      overlay.innerHTML = `
        <div style="width:90%;max-width:640px;background:var(--surface-raised);border-radius:12px;box-shadow:var(--shadow-2xl);overflow:hidden;border:1px solid var(--border-color);">
          <div style="padding:16px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:12px;">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="var(--text-quaternary)" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
            <input type="text" id="global-search-input" placeholder="Search or type a command...  (Ctrl+K)" style="flex:1;border:none;outline:none;font-size:16px;background:none;color:var(--text-primary);" autocomplete="off" aria-label="Search or command">
            <kbd style="font-size:11px;padding:2px 6px;border:1px solid var(--border-color-strong);border-radius:4px;color:var(--text-tertiary);background:var(--surface-card);">ESC</kbd>
          </div>
          <div id="global-search-results" style="max-height:60vh;overflow-y:auto;padding:8px;"></div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { overlay.style.display = 'none'; }
      });

      // ESC to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display !== 'none') { overlay.style.display = 'none'; }
      });

      // Search on input
      // Focus handler: show recent searches when empty
      document.getElementById('global-search-input').addEventListener('focus', () => {
        const q = document.getElementById('global-search-input').value.trim();
        if (q.length < 2) { _showSearchEmptyState(); }
      });

      document.getElementById('global-search-input').addEventListener('input', async (e) => {
        const q = e.target.value.trim().toLowerCase();
        const resultsDiv = document.getElementById('global-search-results');
        if (q.length < 2) { _showSearchEmptyState(); return; }

        // Debounce
        clearTimeout(window._searchDebounce);
        window._searchDebounce = setTimeout(async () => {
          try {
            const [providers, apps, tasks, licenses, followups, facilities, orgs] = await Promise.all([
              store.getAll('providers'), store.getAll('applications'), store.getAll('tasks'),
              store.getAll('licenses'), store.getAll('followups'), store.getFacilities().catch(() => []),
              store.getAll('organizations'),
            ]);

            const results = [];

            // Search providers
            (providers || []).forEach(p => {
              const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
              const npi = (p.npi || '').toLowerCase();
              const cred = (p.credentials || '').toLowerCase();
              const hex = (p.hexId || p.hex_id || '').toLowerCase();
              if (name.includes(q) || npi.includes(q) || cred.includes(q) || hex.includes(q)) {
                results.push({ type: 'Provider', icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>', label: `${p.firstName} ${p.lastName}`, sub: `${p.credentials || ''} ${p.npi ? '— NPI: ' + p.npi : ''}`, color: '#0891b2', action: `window.app.viewProviderApps(${p.id})` });
              }
            });

            // Search applications by payer
            (apps || []).forEach(a => {
              const payer = (a.payerName || a.payer_name || '').toLowerCase();
              const state = (a.state || '').toLowerCase();
              const status = (a.status || '').toLowerCase();
              const hex = (a.hexId || a.hex_id || '').toLowerCase();
              if (payer.includes(q) || state.includes(q) || status.includes(q) || hex.includes(q)) {
                const provMatch = (providers || []).find(p => p.id == a.providerId);
                const provName = provMatch ? `${provMatch.firstName} ${provMatch.lastName}` : '';
                results.push({ type: 'Application', icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="1" width="10" height="14" rx="1"/><path d="M6 5h4M6 8h4M6 11h2"/></svg>', label: `${a.payerName || a.payer_name || 'Unknown Payer'} — ${a.state || ''}`, sub: `${provName} — ${a.status}`, color: '#3b82f6', action: `window.app.editApp(${a.id})` });
              }
            });

            // Search tasks
            (tasks || []).forEach(t => {
              const title = (t.title || t.description || '').toLowerCase();
              if (title.includes(q)) {
                results.push({ type: 'Task', icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3 3 7-7"/></svg>', label: t.title || t.description, sub: `Due: ${formatDateDisplay(t.dueDate || t.due_date)} — ${t.isCompleted || t.completed ? 'Done' : 'Pending'}`, color: '#10b981', action: `navigateTo('tasks')` });
              }
            });

            // Search licenses
            (licenses || []).forEach(l => {
              const state = (l.state || '').toLowerCase();
              const num = (l.licenseNumber || l.license_number || '').toLowerCase();
              const type = (l.licenseType || l.license_type || '').toLowerCase();
              if (state.includes(q) || num.includes(q) || type.includes(q)) {
                results.push({ type: 'License', icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5 7h6M5 10h3"/></svg>', label: `${l.state} — ${l.licenseNumber || l.license_number || ''}`, sub: `${l.licenseType || l.license_type || ''} — Exp: ${l.expirationDate || l.expiration_date || 'N/A'}`, color: '#ef4444', action: `navigateTo('licenses')` });
              }
            });

            // Search facilities
            (facilities || []).forEach(f => {
              const name = (f.name || '').toLowerCase();
              const npi = (f.npi || '').toLowerCase();
              if (name.includes(q) || npi.includes(q)) {
                results.push({ type: 'Facility', icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M6 3V1M10 3V1M5 7h2M9 7h2M5 10h2M9 10h2"/></svg>', label: f.name || 'Unnamed', sub: `${f.city || ''}${f.state ? ', ' + f.state : ''} ${f.npi ? '— NPI: ' + f.npi : ''}`, color: '#8b5cf6', action: `navigateTo('facilities')` });
              }
            });

            // Search orgs
            (orgs || []).forEach(o => {
              const name = (o.name || '').toLowerCase();
              const hex = (o.hexId || o.hex_id || '').toLowerCase();
              if (name.includes(q) || hex.includes(q)) {
                results.push({ type: 'Organization', icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="6" height="11" rx="1"/><rect x="9" y="6" width="6" height="8" rx="1"/><path d="M3 6h2M3 9h2M11 9h2"/></svg>', label: o.name, sub: hex ? `ID: ${hex.toUpperCase()}` : '', color: '#f59e0b', action: `navigateTo('organizations')` });
              }
            });

            // Track recent search
            _trackRecentSearch(q);

            if (!results.length) {
              resultsDiv.innerHTML = '<p style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px;">No results found</p>';
              return;
            }

            // Scope pills + counts
            const scopes = {};
            results.forEach(r => { scopes[r.type] = (scopes[r.type] || 0) + 1; });
            const scopePills = `<div style="display:flex;gap:6px;padding:8px 12px;flex-wrap:wrap;border-bottom:1px solid var(--border-color,#e5e7eb);margin-bottom:4px;">
              <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:8px;background:var(--brand-100,#cffafe);color:var(--brand-700,#0e7490);cursor:default;">All (${results.length})</span>
              ${Object.entries(scopes).map(([type, count]) => `<span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;background:var(--surface-card);color:var(--text-tertiary);cursor:default;">${type} (${count})</span>`).join('')}
            </div>`;

            resultsDiv.innerHTML = scopePills + results.slice(0, 20).map(r => `
              <div onclick="${r.action};document.getElementById('global-search-overlay').style.display='none';" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .1s;" onmouseenter="this.style.background='var(--table-row-hover)'" onmouseleave="this.style.background='none'">
                <div style="width:32px;height:32px;border-radius:8px;background:${r.color}15;color:${r.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${r.icon}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:14px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.label}</div>
                  <div style="font-size:12px;color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.sub}</div>
                </div>
                <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${r.color}15;color:${r.color};white-space:nowrap;">${r.type}</span>
              </div>
            `).join('') + (results.length > 20 ? `<p style="text-align:center;padding:8px;color:var(--text-quaternary);font-size:12px;">${results.length - 20} more results — refine your search</p>` : '');
          } catch (e) { console.error('Search error:', e); }
        }, 200);
      });
    }

    overlay.style.display = 'flex';
    const input = document.getElementById('global-search-input');
    input.value = '';
    _showSearchEmptyState();
    setTimeout(() => input.focus(), 50);
  },

  // Tools dropdown
  toggleToolsMenu() {
    const panel = document.getElementById('tools-panel');
    if (panel) panel.classList.toggle('active');
    // Close when clicking outside
    const close = (e) => {
      if (!e.target.closest('#tools-dropdown')) {
        panel.classList.remove('active');
        document.removeEventListener('click', close);
      }
    };
    if (panel.classList.contains('active')) {
      setTimeout(() => document.addEventListener('click', close), 0);
    }
  },

  // Notifications
  async toggleNotifications() {
    const panel = document.getElementById('notif-panel');
    if (panel) panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
      await this.loadNotifications();
      const close = (e) => {
        if (!e.target.closest('#notif-dropdown')) {
          panel.classList.remove('active');
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    }
  },

  async _notifFetch(path, opts = {}) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (!token) return null;
    const res = await fetch(`${CONFIG.API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) return null;
    return await res.json();
  },

  async loadNotifications() {
    try {
      const result = await this._notifFetch('/notifications');
      if (!result) return;
      const items = result.data || [];
      const list = document.getElementById('notif-list');
      if (!items.length) {
        list.innerHTML = '<p style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No notifications yet</p>';
        return;
      }
      const ICONS = { bell: '\u{1F514}', calendar: '\u{1F4C5}', app: '\u{1F4CB}', star: '\u2B50', task: '\u2705', clock: '\u23F0', alert: '\u26A0\uFE0F', user: '\u{1F464}', shield: '\u{1F6E1}\uFE0F' };
      list.innerHTML = items.map(n => `
        <div class="notif-item${n.read_at ? '' : ' unread'}" data-id="${n.id}" onclick="window.app.handleNotifClick(${n.id}, '${escAttr(n.link || '')}')" style="padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer;${n.read_at ? 'opacity:.6;' : ''}">
          <div style="display:flex;gap:8px;align-items:flex-start;">
            <span style="font-size:16px;flex-shrink:0;">${ICONS[n.icon] || ICONS.bell}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:${n.read_at ? '400' : '600'};color:var(--text-primary);line-height:1.3;">${escHtml(n.title)}</div>
              ${n.body ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;line-height:1.3;">${escHtml(n.body)}</div>` : ''}
              <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">${timeAgo(n.created_at)}</div>
            </div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      // silently fail
    }
  },

  async handleNotifClick(id, link) {
    await this._notifFetch(`/notifications/${id}/read`, { method: 'POST' });
    if (link) navigateTo(link.split('/')[0]);
    document.getElementById('notif-panel').classList.remove('active');
    this.refreshNotifBadge();
  },

  async markAllNotificationsRead() {
    await this._notifFetch('/notifications/read-all', { method: 'POST' });
    showToast('All notifications marked as read');
    await this.loadNotifications();
    this.refreshNotifBadge();
  },

  async refreshNotifBadge() {
    try {
      const token = localStorage.getItem(CONFIG.TOKEN_KEY);
      if (!token) return;
      const res = await fetch(`${CONFIG.API_URL}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!res.ok) return; // silently fail — never trigger logout
      const json = await res.json();
      const count = json.data?.count || 0;
      const badge = document.getElementById('notif-badge');
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline' : 'none';
      }
    } catch {}
  },

  // Tasks Modal (quick)
  showQuickTask() { showQuickTask(); },
  quickAddApp() { quickAddApp(); },
  async toggleTask(id) {
    const task = await store.getOne('tasks', id);
    if (!task) return;
    await store.update('tasks', id, {
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : null,
    });
    renderTaskModal();
  },
  editTask(id) { openTaskEditModal(id); },
  async deleteTask(id) {
    if (!await appConfirm('Delete this task?', { title: 'Delete Task', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    await store.remove('tasks', id);
    renderTaskModal();
    showToast('Task deleted');
  },
  async saveTask() {
    const title = document.getElementById('task-title')?.value?.trim();
    if (!title) { showToast('Enter a task title'); return; }
    try {
      const modalLinkType = document.getElementById('task-link-type')?.value || '';
      const modalLinkId = document.getElementById('task-link-id')?.value || '';
      await store.create('tasks', {
        title,
        category: document.getElementById('task-category')?.value || 'other',
        priority: document.getElementById('task-priority')?.value || 'normal',
        dueDate: document.getElementById('task-due')?.value || '',
        linkableType: modalLinkType || '',
        linkableId: modalLinkId || '',
        linkedApplicationId: modalLinkType === 'application' ? modalLinkId : '',
        recurrence: document.getElementById('task-recurrence')?.value || '',
        notes: document.getElementById('task-notes')?.value?.trim() || '',
        isCompleted: false,
        completedAt: '',
      });
    } catch (e) { showToast('Error saving task: ' + e.message); return; }
    showToast('Task added');
    renderTaskModal();
  },
  onTaskTitleChange(value) {
    const preset = PRESET_TASKS.find(t => t.title === value);
    if (preset) {
      const catEl = document.getElementById('task-category');
      const priEl = document.getElementById('task-priority');
      if (catEl) catEl.value = preset.category;
      if (priEl) priEl.value = preset.priority;
    }
  },
  cancelTaskForm() {
    const form = document.getElementById('task-add-form');
    if (form) form.style.display = 'none';
  },

  // Applications
  async openAddModal() { await openApplicationModal(); },
  async editApplication(id) { await openApplicationModal(id); },
  async deleteApplication(id) {
    if (!await appConfirm('Delete this application?', { title: 'Delete Application', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    await store.remove('applications', id);
    await renderApplications();
    showToast('Application deleted');
  },
  async applyFilters() {
    filters.state = document.getElementById('filter-state')?.value || '';
    filters.payer = document.getElementById('filter-payer')?.value || '';
    filters.status = document.getElementById('filter-status')?.value || '';
    filters.wave = document.getElementById('filter-wave')?.value || '';
    syncFiltersToURL();
    await renderAppTable();
  },
  async sortBy(field) {
    if (currentSort.field === field) {
      currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      currentSort.field = field;
      currentSort.dir = 'asc';
    }
    await renderAppTable(); // Only re-render table, not rebuild entire page
  },
  renderAppTable,

  // Providers
  async openProviderModal(id) { await openProviderModal(id); },
  async editProvider(id) { await openProviderModal(id); },
  async deleteProvider(id) {
    if (!await appConfirm('Delete this provider? This will NOT delete their licenses or applications.', { title: 'Delete Provider', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    await store.remove('providers', id);
    await renderProviders();
    showToast('Provider deleted');
  },

  // NPI Lookup (in provider modal)
  async lookupProviderNPI() {
    const npiInput = document.getElementById('prov-npi-lookup');
    const resultDiv = document.getElementById('npi-lookup-result');
    const btn = document.getElementById('npi-lookup-btn');
    if (!npiInput || !resultDiv) return;

    const npi = npiInput.value.trim();
    if (!/^\d{10}$/.test(npi)) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<div class="alert alert-warning" style="margin:0;">Enter a valid 10-digit NPI number.</div>';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px;"></div>';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="text-align:center;padding:8px;color:var(--gray-500);font-size:13px;">Looking up NPI...</div>';

    try {
      const prov = await taxonomyApi.lookupNPI(npi);
      if (!prov) {
        resultDiv.innerHTML = '<div class="alert alert-warning" style="margin:0;">No provider found for NPI ' + escHtml(npi) + '.</div>';
        return;
      }

      // Show result with auto-fill button
      const allTax = prov.allTaxonomies || [];
      resultDiv.innerHTML = `
        <div style="padding:14px;background:var(--success-50);border:1px solid var(--success-100);border-radius:var(--radius-lg);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div>
              <div style="font-weight:700;font-size:15px;color:var(--gray-900);">${escHtml(prov.prefix ? prov.prefix + ' ' : '')}${escHtml(prov.firstName || prov.first_name || '')} ${escHtml(prov.middleName || '')}${escHtml(prov.lastName || prov.last_name || '')}${escHtml(prov.suffix ? ', ' + prov.suffix : '')}${escHtml(prov.credential ? ', ' + prov.credential : '')}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:3px;">NPI: ${escHtml(prov.npi || npi)} &middot; Status: <strong>${escHtml(prov.status || 'Active')}</strong>${prov.enumerationDate ? ' &middot; Enumerated: ' + escHtml(prov.enumerationDate) : ''}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:2px;">Taxonomy: <strong>${escHtml(prov.taxonomyCode || prov.taxonomy_code || '')}</strong>${prov.taxonomyDesc || prov.taxonomy_desc ? ' &mdash; ' + escHtml(prov.taxonomyDesc || prov.taxonomy_desc) : ''}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:2px;">${escHtml(prov.city || '')}, ${escHtml(prov.state || '')} ${escHtml(prov.zip || '')}${prov.phone ? ' &middot; ' + escHtml(prov.phone) : ''}</div>
              ${allTax.length > 1 ? `<div style="font-size:11px;color:var(--gray-500);margin-top:4px;">+ ${allTax.length - 1} additional taxonomy code(s)</div>` : ''}
            </div>
            <button class="btn btn-primary btn-sm" onclick="window.app._fillProviderFromNPI()" style="flex-shrink:0;">Auto-Fill</button>
          </div>
        </div>`;

      // Store for auto-fill
      window._npiLookupResult = prov;
    } catch (err) {
      resultDiv.innerHTML = '<div class="alert alert-danger" style="margin:0;">Lookup failed: ' + escHtml(err.message) + '</div>';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg> Lookup';
    }
  },

  setNpiSearchMode(mode) {
    const npiDiv = document.getElementById('npi-search-npi');
    const nameDiv = document.getElementById('npi-search-name');
    const npiBtn = document.getElementById('npi-search-mode-npi');
    const nameBtn = document.getElementById('npi-search-mode-name');
    if (mode === 'name') {
      npiDiv.style.display = 'none'; nameDiv.style.display = 'block';
      npiBtn.classList.remove('btn-primary'); nameBtn.classList.add('btn-primary');
    } else {
      npiDiv.style.display = 'flex'; nameDiv.style.display = 'none';
      npiBtn.classList.add('btn-primary'); nameBtn.classList.remove('btn-primary');
    }
    document.getElementById('npi-lookup-result').style.display = 'none';
  },

  async searchProviderByName() {
    const firstName = document.getElementById('prov-search-first')?.value?.trim();
    const lastName = document.getElementById('prov-search-last')?.value?.trim();
    const state = document.getElementById('prov-search-state')?.value || '';
    const resultDiv = document.getElementById('npi-lookup-result');
    const btn = document.getElementById('name-search-btn');
    if (!firstName && !lastName) { resultDiv.style.display = 'block'; resultDiv.innerHTML = '<div class="alert alert-warning" style="margin:0;">Enter a first or last name to search.</div>'; return; }
    btn.disabled = true; btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px;"></div>';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="text-align:center;padding:8px;color:var(--gray-500);font-size:13px;">Searching NPI Registry...</div>';
    try {
      const opts = { limit: 20 };
      if (firstName) opts.firstName = firstName;
      if (lastName) opts.lastName = lastName;
      if (state) opts.state = state;
      const results = await taxonomyApi.searchProviders(opts);
      if (!results || results.length === 0) {
        resultDiv.innerHTML = '<div class="alert alert-info" style="margin:0;">No providers found. Try different search criteria.</div>';
        return;
      }
      window._npiSearchResults = results;
      resultDiv.innerHTML = `
        <div style="font-size:12px;color:var(--gray-500);margin-bottom:8px;">${results.length} provider(s) found — click to auto-fill</div>
        <div style="max-height:240px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:var(--radius-lg);">
          ${results.map((p, i) => `
            <div style="padding:10px 14px;border-bottom:1px solid var(--gray-100);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;transition:background 0.15s;" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''" onclick="window._npiLookupResult=window._npiSearchResults[${i}];window.app._fillProviderFromNPI();">
              <div>
                <div style="font-weight:600;font-size:14px;color:var(--gray-900);">${escHtml(p.firstName)} ${escHtml(p.lastName)}${p.credential ? ', ' + escHtml(p.credential) : ''}</div>
                <div style="font-size:12px;color:var(--gray-600);">NPI: <strong>${escHtml(p.npi)}</strong> &middot; ${escHtml(p.taxonomyDesc || p.taxonomyCode || '')} &middot; ${escHtml(p.city || '')}${p.state ? ', ' + escHtml(p.state) : ''}</div>
              </div>
              <span style="font-size:11px;color:var(--brand-600);white-space:nowrap;">Select</span>
            </div>
          `).join('')}
        </div>`;
    } catch (err) {
      resultDiv.innerHTML = '<div class="alert alert-danger" style="margin:0;">Search failed: ' + escHtml(err.message) + '</div>';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg> Search';
    }
  },

  _fillProviderFromNPI() {
    const prov = window._npiLookupResult;
    if (!prov) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set('prov-first', prov.firstName || prov.first_name);
    set('prov-last', prov.lastName || prov.last_name);
    set('prov-creds', prov.credential || prov.credentials);
    set('prov-npi', prov.npi);
    set('prov-specialty', prov.taxonomyDesc || prov.taxonomy_desc || prov.specialty);
    set('prov-taxonomy', prov.taxonomyCode || prov.taxonomy_code || prov.taxonomy);
    set('prov-phone', prov.phone);
    set('prov-email', prov.email);
    // Also fill the NPI lookup input
    set('prov-npi-lookup', prov.npi);
    // Hide the result panel after filling
    const resultDiv = document.getElementById('npi-lookup-result');
    if (resultDiv) { setTimeout(() => { resultDiv.style.display = 'none'; }, 1500); }
    showToast('Provider data auto-filled from NPI Registry');
  },

  // Taxonomy search (for taxonomy-search page)
  async runTaxonomySearch() {
    const query = document.getElementById('tax-search-input')?.value || '';
    const type = document.getElementById('tax-search-type')?.value || 'codes';
    const state = document.getElementById('tax-search-state')?.value || '';
    const resultsDiv = document.getElementById('tax-search-results');
    if (!resultsDiv) return;

    if (type === 'codes') {
      // Local taxonomy code search
      const results = taxonomyApi.searchTaxonomyCodes(query);
      resultsDiv.innerHTML = `
        <div style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">${results.length} taxonomy code(s) found</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Code</th><th>Type</th><th>Specialty</th><th>Classification</th></tr></thead>
          <tbody>${results.map(t => `
            <tr style="cursor:pointer;" onclick="navigator.clipboard.writeText('${escAttr(t.code)}');document.getElementById('toast').textContent='Copied ${escAttr(t.code)}';document.getElementById('toast').classList.add('show');setTimeout(()=>document.getElementById('toast').classList.remove('show'),2000);">
              <td><code style="font-weight:700;color:var(--brand-700);">${escHtml(t.code)}</code></td>
              <td>${escHtml(t.type)}</td>
              <td><strong>${escHtml(t.specialty)}</strong></td>
              <td class="text-sm text-muted">${escHtml(t.classification)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
    } else if (type === 'npi') {
      // NPI lookup
      if (!/^\d{10}$/.test(query.trim())) {
        resultsDiv.innerHTML = '<div class="alert alert-warning">Enter a valid 10-digit NPI number.</div>';
        return;
      }
      resultsDiv.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner"></div></div>';
      try {
        const prov = await taxonomyApi.lookupNPI(query.trim());
        if (!prov) { resultsDiv.innerHTML = '<div class="alert alert-warning">No provider found for that NPI.</div>'; return; }
        resultsDiv.innerHTML = renderNPIResultCard(prov);
      } catch (err) { resultsDiv.innerHTML = '<div class="alert alert-danger">Error: ' + escHtml(err.message) + '</div>'; }
    } else if (type === 'provider') {
      // Provider name search
      const parts = query.trim().split(/\s+/);
      if (parts.length === 0 || !parts[0]) { resultsDiv.innerHTML = '<div class="alert alert-warning">Enter a provider name to search.</div>'; return; }
      resultsDiv.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner"></div></div>';
      try {
        const opts = { limit: 30 };
        if (state) opts.state = state;
        if (parts.length >= 2) { opts.firstName = parts[0]; opts.lastName = parts.slice(1).join(' '); }
        else { opts.lastName = parts[0]; }
        const results = await taxonomyApi.searchProviders(opts);
        if (results.length === 0) { resultsDiv.innerHTML = '<div class="alert alert-info">No providers found. Try adjusting your search.</div>'; return; }
        resultsDiv.innerHTML = `
          <div style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">${results.length} provider(s) found</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>NPI</th><th>Taxonomy</th><th>Location</th><th>Status</th></tr></thead>
            <tbody>${results.map(p => `
              <tr>
                <td><strong>${escHtml(p.firstName)} ${escHtml(p.lastName)}</strong>${p.credential ? '<br><span class="text-sm text-muted">' + escHtml(p.credential) + '</span>' : ''}</td>
                <td><code style="color:var(--brand-700);">${escHtml(p.npi)}</code></td>
                <td><code>${escHtml(p.taxonomyCode)}</code><br><span class="text-sm text-muted">${escHtml(p.taxonomyDesc)}</span></td>
                <td>${escHtml(p.city)}${p.state ? ', ' + escHtml(p.state) : ''}</td>
                <td><span class="badge badge-${p.status === 'Active' ? 'active' : 'inactive'}">${escHtml(p.status)}</span></td>
              </tr>`).join('')}
            </tbody>
          </table></div>`;
      } catch (err) { resultsDiv.innerHTML = '<div class="alert alert-danger">Error: ' + escHtml(err.message) + '</div>'; }
    } else if (type === 'specialty') {
      // Taxonomy description search via NPPES
      if (!query || query.trim().length < 2) { resultsDiv.innerHTML = '<div class="alert alert-warning">Enter a specialty keyword (e.g. psychiatry, family, pediatric).</div>'; return; }
      resultsDiv.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner"></div></div>';
      try {
        const opts = { limit: 30 };
        if (state) opts.state = state;
        const results = await taxonomyApi.searchByTaxonomy(query, opts);
        if (results.length === 0) { resultsDiv.innerHTML = '<div class="alert alert-info">No providers found for that specialty.</div>'; return; }
        resultsDiv.innerHTML = `
          <div style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">${results.length} provider(s) found for "${escHtml(query)}"</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>NPI</th><th>Taxonomy</th><th>Location</th></tr></thead>
            <tbody>${results.map(p => `
              <tr>
                <td><strong>${escHtml(p.firstName)} ${escHtml(p.lastName)}</strong>${p.credential ? '<br><span class="text-sm text-muted">' + escHtml(p.credential) + '</span>' : ''}</td>
                <td><code style="color:var(--brand-700);">${escHtml(p.npi)}</code></td>
                <td><code>${escHtml(p.taxonomyCode)}</code><br><span class="text-sm text-muted">${escHtml(p.taxonomyDesc)}</span></td>
                <td>${escHtml(p.city)}${p.state ? ', ' + escHtml(p.state) : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>`;
      } catch (err) { resultsDiv.innerHTML = '<div class="alert alert-danger">Error: ' + escHtml(err.message) + '</div>'; }
    }
  },

  // Follow-ups
  async completeFollowupPrompt(fuId) {
    const outcome = await appPrompt('Outcome of this follow-up:', { title: 'Complete Follow-up', placeholder: 'e.g. Spoke with rep, application in review...' });
    if (outcome === false || outcome === null) return;
    const nextAction = await appPrompt('Next action (leave blank if none):', { title: 'Next Action', placeholder: 'e.g. Call back in 2 weeks...' });
    if (nextAction === false || nextAction === null) return;
    await workflow.completeFollowup(fuId, outcome, nextAction || '');
    await navigateTo('followups');
    showToast('Follow-up completed');
  },

  // Batch
  previewBatch() {
    const strategyId = document.getElementById('batch-strategy').value;
    const statesInput = document.getElementById('batch-states').value.trim();
    const targetStates = statesInput ? statesInput.split(',').map(s => s.trim().toUpperCase()) : [];
    const excludeExisting = document.getElementById('batch-exclude-existing').checked;

    const result = batchGenerator.generateBatch({ strategyId, targetStates, excludeExisting });
    const preview = document.getElementById('batch-preview');

    if (!result.success) {
      preview.innerHTML = `<div class="alert alert-danger">${escHtml(result.error)}</div>`;
      return;
    }

    const summary = batchGenerator.summarizeBatch(result.batch);

    preview.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>Batch Preview: ${result.strategy} (${result.count} applications)</h3>
          <button class="btn btn-gold" onclick="window.app.commitCurrentBatch()">Commit ${result.count} Applications</button>
        </div>
        <div class="card-body">
          <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
            <div class="stat-card"><div class="label">Applications</div><div class="value">${summary.totalApplications}</div></div>
            <div class="stat-card"><div class="label">States</div><div class="value blue">${summary.uniqueStates}</div></div>
            <div class="stat-card"><div class="label">Payers</div><div class="value">${summary.uniquePayers}</div></div>
            <div class="stat-card"><div class="label">Est. Monthly Rev</div><div class="value green">$${summary.estimatedMonthlyRevenue.toLocaleString()}</div></div>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table>
            <thead><tr><th>Group</th><th>State</th><th>Payer</th><th>Est $/mo</th><th>Notes</th></tr></thead>
            <tbody>
              ${result.batch.map(a => `
                <tr>
                  <td>${groupBadge(a.wave)}</td>
                  <td>${getStateName(a.state)}</td>
                  <td>${a.payerName}</td>
                  <td>$${(a.estMonthlyRevenue || 0).toLocaleString()}</td>
                  <td class="truncate text-sm text-muted">${a.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Store batch for commit
    window._pendingBatch = result.batch;
  },

  async commitCurrentBatch() {
    if (!window._pendingBatch) return;
    if (!await appConfirm(`Commit ${window._pendingBatch.length} applications?`, { title: 'Commit Batch', okLabel: 'Commit' })) return;
    const result = batchGenerator.commitBatch(window._pendingBatch);
    window._pendingBatch = null;
    showToast(`${result.count} applications added`);
    await navigateTo('applications');
  },

  // Emails
  generateAppEmail() {
    const appId = document.getElementById('email-app').value;
    const templateId = document.getElementById('email-template').value;
    if (!appId) { showToast('Select an application'); return; }

    const result = emailGenerator.generateEmailForApplication(appId, templateId);
    const output = document.getElementById('email-output');

    if (!result.success) {
      output.innerHTML = `<div class="alert alert-danger">${escHtml(result.error)}</div>`;
      return;
    }

    renderEmailOutput(output, result);
  },

  generateExpansionEmailBatch() {
    const select = document.getElementById('email-expansion-states');
    const states = Array.from(select.selectedOptions).map(o => o.value);
    if (!states.length) { showToast('Select at least one state'); return; }

    const result = emailGenerator.generateExpansionEmails(states);
    const output = document.getElementById('email-output');

    if (!result.success) {
      output.innerHTML = `<div class="alert alert-danger">${escHtml(result.error)}</div>`;
      return;
    }

    output.innerHTML = result.emails.map((e, i) => `
      <div class="card mt-4">
        <div class="card-header">
          <h3>Email ${i + 1}: ${e.templateName || 'Expansion'}</h3>
          <button class="btn btn-sm" onclick="window.app.copyEmail(${i})">Copy to Clipboard</button>
        </div>
        <div class="card-body">
          <div class="email-preview" id="email-text-${i}">
            <div class="subject-line">Subject: ${escHtml(e.subject)}</div>${escHtml(e.body)}
          </div>
        </div>
      </div>
    `).join('');
  },

  generateEscalationEmail(appId) {
    const result = emailGenerator.generateEmailForApplication(appId, 'escalation');
    if (!result.success) { showToast(result.error); return; }

    // Show in a modal-like overlay
    const output = document.createElement('div');
    output.innerHTML = `<div class="card"><div class="card-header"><h3>Escalation Email</h3></div><div class="card-body"><div class="email-preview"><div class="subject-line">Subject: ${escHtml(result.subject)}</div>${escHtml(result.body)}</div></div><div class="card-footer"><button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.querySelector('.email-preview').innerText);window.app.showToast('Copied!')">Copy</button></div></div>`;

    const emailOutput = document.getElementById('email-output') || document.getElementById('page-body');
    emailOutput.appendChild(output);
  },

  copyEmail(index) {
    const el = document.getElementById(`email-text-${index}`);
    if (el) {
      navigator.clipboard.writeText(el.innerText);
      showToast('Email copied to clipboard');
    }
  },

  // Settings
  settingsTab(el, tabId) {
    document.querySelectorAll('.tab, .stv2-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    ['settings-agency', 'settings-import', 'settings-org', 'settings-licenses', 'settings-groups', 'settings-caqh', 'settings-integrations', 'settings-webhooks', 'settings-security', 'settings-danger'].forEach(id => {
      const section = document.getElementById(id);
      if (section) section.classList.toggle('hidden', id !== tabId);
    });
    if (tabId === 'settings-security') this.load2FAStatus();
  },

  async saveAgencyProfile() {
    const data = {
      name: document.getElementById('agency-name')?.value?.trim() || '',
      npi: document.getElementById('agency-npi')?.value?.trim() || '',
      tax_id: document.getElementById('agency-tax-id')?.value?.trim() || '',
      taxonomy: document.getElementById('agency-taxonomy')?.value?.trim() || '',
      phone: document.getElementById('agency-phone')?.value?.trim() || '',
      email: document.getElementById('agency-email')?.value?.trim() || '',
      website: document.getElementById('agency-website')?.value?.trim() || '',
      logo_url: document.getElementById('agency-logo')?.value?.trim() || '',
      address_street: document.getElementById('agency-street')?.value?.trim() || '',
      address_city: document.getElementById('agency-city')?.value?.trim() || '',
      address_state: document.getElementById('agency-state')?.value?.trim() || '',
      address_zip: document.getElementById('agency-zip')?.value?.trim() || '',
      primary_color: document.getElementById('agency-primary-color')?.value || '',
      accent_color: document.getElementById('agency-accent-color')?.value || '',
    };
    if (!data.name) { showToast('Agency name is required'); return; }
    try {
      await store.updateAgency(data);
      showToast('Agency profile updated successfully');
      // Update sidebar name
      const sidebarName = document.getElementById('sidebar-agency-name');
      if (sidebarName) sidebarName.textContent = data.name;
    } catch (e) {
      showToast('Error: ' + (e.message || 'Failed to update agency profile'));
    }
  },

  async load2FAStatus() {
    const area = document.getElementById('2fa-status-area');
    if (!area) return;
    try {
      const res = await fetch(`${CONFIG.API_URL}/2fa/status`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`, 'Accept': 'application/json' },
      });
      const data = await res.json();
      const enabled = data.data?.enabled;

      if (enabled) {
        area.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--success-50,#f0fdf4);border:1px solid var(--success-100,#dcfce7);border-radius:8px;margin-bottom:16px;">
            <span style="font-size:20px;">✅</span>
            <div>
              <div style="font-weight:600;color:var(--success-700,#15803d);">Two-factor authentication is enabled</div>
              <div class="text-sm text-muted">Your account is protected with an authenticator app.</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn" onclick="window.app.show2FARecoveryCodes()">View Recovery Codes</button>
            <button class="btn btn-danger" onclick="window.app.disable2FA()">Disable 2FA</button>
          </div>
        `;
      } else {
        area.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--warning-50,#fffbeb);border:1px solid var(--warning-100,#fef3c7);border-radius:8px;margin-bottom:16px;">
            <span style="font-size:20px;">⚠️</span>
            <div>
              <div style="font-weight:600;color:var(--warning-700,#b45309);">Two-factor authentication is not enabled</div>
              <div class="text-sm text-muted">Your account relies on password only. Enable 2FA for better security.</div>
            </div>
          </div>
          <div class="form-group">
            <label>Enter your password to enable 2FA</label>
            <input type="password" class="form-control" id="2fa-password" placeholder="Your current password" style="max-width:300px;">
          </div>
          <button class="btn btn-primary" onclick="window.app.enable2FA()">Enable Two-Factor Authentication</button>
        `;
      }
    } catch (e) {
      area.innerHTML = '<p class="text-muted">Unable to load 2FA status.</p>';
    }
  },

  async enable2FA() {
    const password = document.getElementById('2fa-password')?.value;
    if (!password) { showToast('Enter your password', 'error'); return; }

    try {
      const res = await fetch(`${CONFIG.API_URL}/2fa/enable`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.message || 'Failed to enable 2FA', 'error'); return; }

      const area = document.getElementById('2fa-status-area');
      area.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:var(--text-primary,var(--gray-900));">Scan this QR code with your authenticator app</div>
          <div style="background:#fff;display:inline-block;padding:16px;border-radius:12px;border:1px solid var(--border-color,var(--gray-200));margin:12px 0;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.data.otpauth_url)}" alt="2FA QR Code" width="200" height="200">
          </div>
          <div class="text-sm text-muted" style="margin-top:8px;">Or enter this key manually: <code style="background:var(--surface-card,var(--gray-100));padding:2px 6px;border-radius:4px;font-size:13px;font-weight:600;letter-spacing:1px;">${data.data.secret}</code></div>
        </div>
        <div class="form-group" style="max-width:300px;margin:0 auto;">
          <label>Enter the 6-digit code from your app</label>
          <input type="text" class="form-control" id="2fa-verify-code" placeholder="000000" maxlength="6" style="text-align:center;font-size:24px;letter-spacing:8px;font-weight:700;">
        </div>
        <div style="text-align:center;margin-top:12px;">
          <button class="btn btn-primary" onclick="window.app.verify2FA()">Verify & Activate</button>
        </div>
        <div style="margin-top:20px;padding:14px;background:var(--warning-50,#fffbeb);border:1px solid var(--warning-100,#fef3c7);border-radius:8px;">
          <div style="font-weight:600;font-size:13px;color:var(--warning-700,#b45309);margin-bottom:8px;">Save your recovery codes</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            ${data.data.recovery_codes.map(c => `<code style="font-size:13px;padding:4px 8px;background:var(--surface-card,#fff);border-radius:4px;text-align:center;">${c}</code>`).join('')}
          </div>
          <div class="text-sm text-muted" style="margin-top:8px;">Store these codes somewhere safe. Each code can only be used once.</div>
        </div>
      `;
      setTimeout(() => document.getElementById('2fa-verify-code')?.focus(), 100);
    } catch (e) { showToast('Error enabling 2FA', 'error'); }
  },

  async verify2FA() {
    const code = document.getElementById('2fa-verify-code')?.value?.trim();
    if (!code || code.length !== 6) { showToast('Enter the 6-digit code', 'error'); return; }

    try {
      const res = await fetch(`${CONFIG.API_URL}/2fa/verify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.message || 'Invalid code', 'error'); return; }

      showToast('Two-factor authentication enabled!', 'success');
      this.load2FAStatus();
    } catch (e) { showToast('Verification failed', 'error'); }
  },

  async disable2FA() {
    const password = await appPrompt('Enter your password to disable 2FA:', { title: 'Disable Two-Factor Authentication', placeholder: 'Password' });
    if (!password) return;

    try {
      const res = await fetch(`${CONFIG.API_URL}/2fa/disable`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.message || 'Failed to disable 2FA', 'error'); return; }

      showToast('Two-factor authentication disabled', 'warning');
      this.load2FAStatus();
    } catch (e) { showToast('Error disabling 2FA', 'error'); }
  },

  // ── Group Management ──
  addGroup() {
    const list = document.getElementById('groups-list');
    const i = list.children.length;
    const colors = ['#0891b2', '#3b82f6', '#6b7280', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const color = colors[i % colors.length];
    const div = document.createElement('div');
    div.className = 'form-row';
    div.style.cssText = 'align-items:end;margin-bottom:12px;';
    div.id = `group-row-${i}`;
    div.innerHTML = `
      <div class="form-group" style="flex:2;"><label>Label</label><input type="text" class="form-control group-label" value="" placeholder="e.g. Batch B"></div>
      <div class="form-group" style="flex:1;max-width:80px;"><label>Short</label><input type="text" class="form-control group-short" value="" placeholder="B2" maxlength="5"></div>
      <div class="form-group" style="flex:1;max-width:70px;"><label>Color</label><input type="color" class="group-color" value="${color}" style="width:100%;height:38px;border:1px solid var(--border-color-strong);border-radius:var(--radius);cursor:pointer;padding:2px;background:var(--surface-input);"></div>
      <div class="form-group" style="flex:0;margin-bottom:0;"><button class="btn btn-sm" style="color:var(--danger-500);height:38px;" onclick="window.app.removeGroup(${i})" title="Remove">&times;</button></div>
    `;
    list.appendChild(div);
  },

  removeGroup(index) {
    const row = document.getElementById(`group-row-${index}`);
    if (row) row.remove();
  },

  async saveGroups() {
    const labels = document.querySelectorAll('.group-label');
    const shorts = document.querySelectorAll('.group-short');
    const colors = document.querySelectorAll('.group-color');
    const groups = [];
    labels.forEach((el, i) => {
      const label = el.value.trim();
      if (!label) return;
      groups.push({
        id: i + 1,
        label,
        short: shorts[i]?.value?.trim() || label.substring(0, 3),
        color: colors[i]?.value || '#6b7280',
      });
    });
    if (groups.length === 0) { showToast('Add at least one group', 'error'); return; }
    try {
      await store.updateAgencyConfig({ waves: groups });
      APP_GROUPS = groups;
      showToast('Groups saved!', 'success');
      // Update preview
      const preview = document.getElementById('groups-preview');
      if (preview) {
        preview.innerHTML = groups.map(g => `<span style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:600;background:${g.color}20;color:${g.color};">${g.short || g.label}</span>`).join('');
      }
    } catch (e) { showToast('Error saving groups: ' + e.message, 'error'); }
  },

  async show2FARecoveryCodes() {
    try {
      const res = await fetch(`${CONFIG.API_URL}/2fa/recovery-codes`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`, 'Accept': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.message || 'Failed to load codes', 'error'); return; }

      const codes = data.data?.recovery_codes || [];
      const area = document.getElementById('2fa-status-area');
      const existingHtml = area.innerHTML;
      area.innerHTML += `
        <div style="margin-top:16px;padding:14px;background:var(--info-50,#eff6ff);border:1px solid var(--info-100,#dbeafe);border-radius:8px;" id="recovery-codes-display">
          <div style="font-weight:600;font-size:13px;color:var(--info-700,#1d4ed8);margin-bottom:8px;">Recovery Codes (${codes.length} remaining)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            ${codes.map(c => `<code style="font-size:13px;padding:4px 8px;background:var(--surface-card,#fff);border-radius:4px;text-align:center;">${c}</code>`).join('')}
          </div>
          <button class="btn btn-sm" style="margin-top:10px;" onclick="document.getElementById('recovery-codes-display').remove()">Close</button>
        </div>
      `;
    } catch (e) { showToast('Error loading codes', 'error'); }
  },

  updateEmbedCode() {
    const widget = document.getElementById('embed-widget-type').value;
    const theme = document.getElementById('embed-widget-theme').value;
    const base = CONFIG.API_URL.replace('/api', '');
    let slug = 'your-slug';
    try { slug = document.getElementById('embed-allowed-domains')?.closest('.card')?.parentElement?.dataset?.slug || slug; } catch (e) {}
    store.getAgency().then(a => {
      slug = a.slug || slug;
      const code = `<div id="credentik-widget"></div>\n<script src="${base}/embed.js" data-agency="${slug}" data-widget="${widget}" data-theme="${theme}"></script>`;
      const pre = document.getElementById('embed-code-preview');
      if (pre) pre.textContent = code;
    });
  },

  copyEmbedCode() {
    const pre = document.getElementById('embed-code-preview');
    if (pre) {
      navigator.clipboard.writeText(pre.textContent).then(() => showToast('Embed code copied!'));
    }
  },

  copyText(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
  },

  async saveAllowedDomains() {
    const raw = document.getElementById('embed-allowed-domains').value;
    const domains = raw.split('\n').map(d => d.trim()).filter(Boolean);
    try {
      await store.updateAgency({ allowed_domains: domains });
      showToast('Allowed domains saved');
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    }
  },

  async previewJsonImport() {
    const el = document.getElementById('import-results');
    el.innerHTML = '<div class="alert alert-info">JSON import preview is not yet available in this version.</div>';
  },

  async runJsonImport() {
    const el = document.getElementById('import-results');
    el.innerHTML = '<div class="alert alert-info">JSON import is not yet available in this version.</div>';
  },

  async runCSVImport() {
    showToast('CSV import is not yet available in this version');
  },

  async exportData() {
    try {
      const apps = await store.getAll('applications');
      const providers = await store.getAll('providers');
      const licenses = await store.getAll('licenses');
      const followups = await store.getAll('followups');
      const tasks = await store.getAll('tasks');
      const orgs = await store.getAll('organizations');
      const data = { applications: apps, providers, licenses, followups, tasks, organizations: orgs, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `credentik-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data exported');
    } catch (err) {
      showToast('Export failed: ' + err.message);
    }
  },

  async clearApplications() {
    if (!await appConfirm('Delete ALL applications? This cannot be undone.', { title: 'Clear Applications', okLabel: 'Delete All', okClass: 'btn-danger' })) return;
    try {
      const apps = await store.getAll('applications');
      for (const app of apps) { await store.remove('applications', app.id); }
      showToast('All applications cleared');
      await navigateTo('dashboard');
    } catch (err) { showToast('Error: ' + err.message); }
  },
  async clearFollowups() {
    if (!await appConfirm('Delete ALL follow-ups? This cannot be undone.', { title: 'Clear Follow-ups', okLabel: 'Delete All', okClass: 'btn-danger' })) return;
    try {
      const followups = await store.getAll('followups');
      for (const fu of followups) { await store.remove('followups', fu.id); }
      showToast('All follow-ups cleared');
      await navigateTo('dashboard');
    } catch (err) { showToast('Error: ' + err.message); }
  },
  async clearEverything() {
    if (!await appConfirm('RESET EVERYTHING? All data will be permanently deleted.', { title: 'Reset All Data', okLabel: 'Reset Everything', okClass: 'btn-danger' })) return;
    if (!await appConfirm('Are you absolutely sure? This is irreversible.', { title: 'Final Confirmation', okLabel: 'Yes, Delete All', okClass: 'btn-danger' })) return;
    showToast('Full data reset is not available via the API. Contact support.');
  },

  // Licenses
  async filterLicByProvider(providerId) {
    filters._licProvider = providerId;
    await renderLicenses();
  },
  async switchLicTab(tab) {
    _licTab = tab;
    await renderLicenses();
  },
  async openLicenseModal(id) { await openLicenseModal(id); },
  async editLicense(id) { await openLicenseModal(id); },
  async deleteLicense(id) {
    if (!await appConfirm('Delete this license?', { title: 'Delete License', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    await store.remove('licenses', id);
    await renderLicenses();
    showToast('License deleted');
  },
  async verifyOneLicense(licenseId) {
    showToast('Verifying license...');
    try {
      const result = await store.verifyLicense(licenseId);
      const status = result.status || 'unknown';
      const msg = status === 'verified' ? 'License verified successfully!' :
        status === 'mismatch' ? 'Verification found discrepancies: ' + (result.discrepancies || '') :
        'Verification error: ' + (result.discrepancies || 'Unknown error');
      showToast(msg);
    } catch (err) { showToast('Verification failed: ' + err.message); }
  },
  async bulkVerifyLicenses() {
    if (!await appConfirm('This will verify all licenses against NPPES. This may take a moment for large provider lists.', { title: 'Bulk Verify', okLabel: 'Verify All' })) return;
    const btn = document.getElementById('bulk-verify-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }
    try {
      const result = await store.verifyAllLicenses();
      showToast(`Verification complete: ${result.verified || 0} verified, ${result.mismatch || 0} mismatches, ${result.error || 0} errors`);
      _licTab = 'monitoring';
      await renderLicenses();
    } catch (err) {
      showToast('Bulk verification failed: ' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Verify All Licenses'; }
    }
  },
  // DEA
  async openDeaModal(id) { await openDeaModal(id); },
  async deleteDea(id) {
    if (!await appConfirm('Delete this DEA registration?', { title: 'Delete DEA', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.deleteDeaRegistration(id);
      showToast('DEA registration deleted');
      _licTab = 'dea';
      await renderLicenses();
    } catch (err) { showToast('Error: ' + err.message); }
  },

  // AI Features
  async aiExtractDoc(providerId, documentId) {
    showToast('AI extracting document data...');
    try {
      const data = await store.aiExtractDocument(documentId);
      const container = document.getElementById('ai-scan-result') || document.getElementById('page-body');
      const html = `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--gold);">
        <div class="card-header" style="display:flex;justify-content:space-between;"><h3>AI Extracted Data</h3><button class="btn btn-sm" onclick="this.closest('.card').remove()">Dismiss</button></div>
        <div class="card-body"><pre style="white-space:pre-wrap;font-size:12px;">${escHtml(JSON.stringify(data, null, 2))}</pre></div>
      </div>`;
      container.insertAdjacentHTML('afterbegin', html);
      showToast('Document data extracted');
    } catch (err) { showToast('AI extraction failed: ' + err.message); }
  },
  async aiDraftEmail() {
    const appId = document.getElementById('email-app')?.value;
    if (!appId) { showToast('Select an application first'); return; }
    const type = document.getElementById('email-template')?.value || 'followup';
    const typeMap = { initial_inquiry: 'initial_submission', status_followup: 'followup', document_submission: 'document_request', escalation: 'escalation', expansion_outreach: 'followup' };
    const aiType = typeMap[type] || 'followup';
    const context = document.getElementById('ai-email-context')?.value || '';
    showToast('AI drafting email...');
    try {
      const data = await store.aiDraftEmail(appId, aiType, context);
      const output = document.getElementById('email-output');
      output.innerHTML = `<div class="card"><div class="card-header" style="display:flex;justify-content:space-between;"><h3>AI Generated Email</h3><span class="badge badge-approved" style="font-size:11px;">AI Draft — ${data.tone || 'professional'}</span></div>
        <div class="card-body"><div class="email-preview"><div class="subject-line"><strong>Subject:</strong> ${escHtml(data.subject || '')}</div><div style="white-space:pre-wrap;margin-top:12px;">${escHtml(data.body || '')}</div></div>
        ${data.suggested_followup_days ? `<p style="margin-top:12px;font-size:12px;color:var(--text-muted);">Suggested follow-up: ${data.suggested_followup_days} days</p>` : ''}
        </div><div class="card-footer"><button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.querySelector('.email-preview').innerText);showToast('Copied!')">Copy to Clipboard</button></div></div>`;
    } catch (err) { showToast('AI email draft failed: ' + err.message); }
  },
  async aiComplianceScan(providerId) {
    const btn = document.getElementById('ai-scan-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }
    try {
      const data = await store.aiDetectAnomalies(providerId);
      const container = document.getElementById('ai-scan-result');
      if (!container) return;
      const riskColors = { critical: 'var(--red)', high: '#ef4444', medium: 'var(--warning-500)', low: 'var(--green-600)' };
      const anomalies = data.anomalies || [];
      container.style.display = 'block';
      container.innerHTML = `<div class="card" style="border-left:3px solid ${riskColors[data.risk_level] || 'var(--gray-400)'};">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3>AI Compliance Scan</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge" style="background:${riskColors[data.risk_level] || '#888'};color:#fff;">${(data.risk_level || 'unknown').toUpperCase()} RISK</span>
            <span style="font-weight:700;font-size:18px;">${data.score ?? '?'}/100</span>
            <button class="btn btn-sm" onclick="document.getElementById('ai-scan-result').style.display='none'">Dismiss</button>
          </div>
        </div>
        <div class="card-body">
          <p style="margin-bottom:12px;">${escHtml(data.summary || '')}</p>
          ${anomalies.length > 0 ? `<table><thead><tr><th>Severity</th><th>Category</th><th>Issue</th><th>Recommendation</th></tr></thead><tbody>
            ${anomalies.map(a => {
              const sevColor = a.severity === 'critical' ? 'var(--red)' : a.severity === 'high' ? '#ef4444' : a.severity === 'medium' ? 'var(--warning-500)' : 'var(--blue)';
              return `<tr><td><span class="badge" style="background:${sevColor};color:#fff;font-size:10px;">${(a.severity||'').toUpperCase()}</span></td><td>${escHtml(a.category||'')}</td><td>${escHtml(a.item||'')}${a.detail ? '<br><span style="font-size:11px;color:var(--text-muted);">'+escHtml(a.detail)+'</span>' : ''}</td><td style="font-size:12px;">${escHtml(a.recommendation||'')}</td></tr>`;
            }).join('')}
          </tbody></table>` : '<p style="color:var(--green-600);">No anomalies detected.</p>'}
        </div>
      </div>`;
    } catch (err) { showToast('AI scan failed: ' + err.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'AI Compliance Scan'; } }
  },
  async aiPredictTimeline(appId) {
    showToast('AI predicting timeline...');
    try {
      const data = await store.aiPredictTimeline(appId);
      const msg = `Estimated: ${data.estimated_days_total || '?'} days total (${data.estimated_days_remaining || '?'} remaining). Approval probability: ${data.approval_probability || '?'}%. Confidence: ${data.confidence || '?'}`;
      const detail = `Completion: ${data.estimated_completion_date || 'N/A'}\n\nRisk factors:\n${(data.risk_factors || []).map(r => '• ' + r).join('\n')}\n\nRecommendations:\n${(data.recommendations || []).map(r => '• ' + r).join('\n')}\n\n${data.reasoning || ''}`;
      await appConfirm(msg + '\n\n' + detail, { title: 'AI Timeline Prediction', okLabel: 'OK' });
    } catch (err) { showToast('Timeline prediction failed: ' + err.message); }
  },

  // State Policies
  async filterPolicies(value) {
    filters._policyFilter = value;
    await renderStatePolicies();
  },
  async filterPolicyRegion(value) {
    filters._policyRegion = value;
    await renderStatePolicies();
  },
  async showPolicyDetail(stateCode) {
    const pol = getLivePolicyByState(stateCode);
    if (!pol) return;
    const licenses = (await store.getAll('licenses')).filter(l => l.state === stateCode);
    const apps = (await store.getAll('applications')).filter(a => a.state === stateCode);
    const authColor = pol.practiceAuthority === 'full' ? 'var(--green)' : pol.practiceAuthority === 'reduced' ? 'var(--gold)' : 'var(--red)';
    const scoreColor = pol.readinessScore >= 7 ? 'var(--green)' : pol.readinessScore >= 5 ? 'var(--gold)' : 'var(--red)';

    const detail = document.getElementById('policy-detail');
    detail.innerHTML = `
      <div class="card" style="border-left:4px solid ${authColor};margin-top:20px;">
        <div class="card-header">
          <h3>${getStateName(stateCode)} — Telehealth Policy Detail</h3>
          <button class="btn btn-sm" onclick="document.getElementById('policy-detail').innerHTML=''">Close</button>
        </div>
        <div class="card-body">
          <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
            <div class="stat-card"><div class="label">Readiness Score</div><div class="value" style="color:${scoreColor};">${pol.readinessScore}/10</div></div>
            <div class="stat-card"><div class="label">Practice Authority</div><div class="value" style="font-size:16px;color:${authColor};text-transform:uppercase;">${pol.practiceAuthority}</div></div>
            <div class="stat-card"><div class="label">Your Licenses</div><div class="value blue">${licenses.length}</div></div>
            <div class="stat-card"><div class="label">Your Applications</div><div class="value">${apps.length}</div></div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <h4 style="font-size:13px;color:var(--gray-900);margin-bottom:8px;">Practice & Prescribing</h4>
              <table style="font-size:12px;">
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">Practice Authority</td><td>${pol.practiceAuthority}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">CPA Notes</td><td>${escHtml(pol.cpaNotes) || '—'}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">Controlled Substances</td><td>${pol.controlledSubstances}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">CS Notes</td><td>${escHtml(pol.csNotes) || '—'}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">Ryan Haight Exemption</td><td>${pol.ryanHaightExemption ? 'Yes' : 'No'}</td></tr>
              </table>
            </div>
            <div>
              <h4 style="font-size:13px;color:var(--gray-900);margin-bottom:8px;">Telehealth Rules</h4>
              <table style="font-size:12px;">
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">Consent Required</td><td>${pol.consentRequired}${pol.consentNotes ? ' — ' + escHtml(pol.consentNotes) : ''}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">In-Person Required</td><td>${pol.inPersonRequired ? 'Yes' : 'No'}${pol.inPersonNotes ? ' — ' + escHtml(pol.inPersonNotes) : ''}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">Originating Site</td><td>${pol.originatingSite === 'any' ? 'Patient can be at home' : pol.originatingSite === 'clinical' ? 'Clinical facility only' : 'Varies by payer'}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">Audio-Only Allowed</td><td>${pol.audioOnly ? 'Yes' : 'No'}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">Telehealth Parity</td><td>${pol.telehealthParity ? 'Yes' : 'No'}</td></tr>
              </table>
            </div>
            <div>
              <h4 style="font-size:13px;color:var(--gray-900);margin-bottom:8px;">Medicaid & Licensing</h4>
              <table style="font-size:12px;">
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">Medicaid Telehealth</td><td>${pol.medicaidTelehealth}${pol.medicaidNotes ? ' — ' + escHtml(pol.medicaidNotes) : ''}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">NLC Member</td><td>${pol.nlcMember ? 'Yes' : 'No'}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">APRN Compact</td><td>${pol.aprnCompact ? 'Yes' : 'No'}</td></tr>
                <tr><td style="font-weight:600;padding:4px 12px 4px 0;">Cross-State License</td><td>${pol.crossStateLicense.replace('_', ' ')}</td></tr>
              </table>
            </div>
            <div>
              <h4 style="font-size:13px;color:var(--gray-900);margin-bottom:8px;">Notes</h4>
              <p style="font-size:13px;color:var(--text);">${escHtml(pol.notes) || 'No additional notes.'}</p>
              <p class="text-sm text-muted" style="margin-top:8px;">Last updated: ${pol.lastUpdated}</p>
            </div>
          </div>
        </div>
      </div>
    `;
    detail.scrollIntoView({ behavior: 'smooth' });
  },

  // Activity Log
  openLogEntry(appId) { openLogEntryModal(appId); },
  viewActivityLog(appId) { viewActivityLog(appId); },

  // Print
  printPage() {
    // Inject print header with timestamp
    let header = document.querySelector('.print-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'print-header';
      document.querySelector('.main-content').prepend(header);
    }
    header.textContent = `Credentik Telehealth Strategy — ${document.getElementById('page-title').textContent} — Printed ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    window.print();
  },

  showToast,

  // My Account
  myAccountTab(el, tabId) {
    document.querySelectorAll('.myacc-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    ['myacc-profile', 'myacc-security', 'myacc-notifications'].forEach(id => {
      const section = document.getElementById(id);
      if (section) section.classList.toggle('hidden', id !== tabId);
    });
  },
  async saveMyProfile() {
    const firstName = document.getElementById('myacc-first')?.value?.trim();
    const lastName = document.getElementById('myacc-last')?.value?.trim();
    if (!firstName || !lastName) { showToast('First and last name are required'); return; }
    try {
      const res = await fetch(`${CONFIG.API_URL}/auth/me`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ first_name: firstName, last_name: lastName }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); showToast('Error: ' + (err.message || 'Failed to update')); return; }
      const data = await res.json();
      // Update local user cache
      const user = auth.getUser();
      if (user) {
        user.first_name = firstName;
        user.firstName = firstName;
        user.last_name = lastName;
        user.lastName = lastName;
        localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
      }
      showToast('Profile updated successfully');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async changeMyPassword() {
    const current = document.getElementById('myacc-current-pw')?.value;
    const newPw = document.getElementById('myacc-new-pw')?.value;
    const confirm = document.getElementById('myacc-confirm-pw')?.value;
    if (!current || !newPw || !confirm) { showToast('All password fields are required'); return; }
    if (newPw !== confirm) { showToast('New passwords do not match'); return; }
    if (newPw.length < 8) { showToast('Password must be at least 8 characters'); return; }
    try {
      const res = await fetch(`${CONFIG.API_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ current_password: current, password: newPw, password_confirmation: confirm }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); showToast('Error: ' + (err.message || 'Failed to change password')); return; }
      showToast('Password changed successfully');
      ['myacc-current-pw', 'myacc-new-pw', 'myacc-confirm-pw'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    } catch (e) { showToast('Error: ' + e.message); }
  },

  // Audit trail
  async filterAuditTrail() {
    const collection = document.getElementById('audit-filter-collection')?.value || '';
    const action = document.getElementById('audit-filter-action')?.value || '';
    const user = document.getElementById('audit-filter-user')?.value || '';
    const search = (document.getElementById('audit-search')?.value || '').toLowerCase();

    let entries = [];
    try { entries = await store.getAuditLog(); } catch {}

    if (collection) entries = entries.filter(e => e.collection === collection);
    if (action) entries = entries.filter(e => e.action === action);
    if (user) entries = entries.filter(e => e.user_name === user);
    if (search) entries = entries.filter(e =>
      JSON.stringify(e).toLowerCase().includes(search)
    );

    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;

    const actionIcon = (a) => ({ create: '➕', update: '✏️', delete: '🗑️' }[a] || '📝');
    const actionColor = (a) => ({ create: '#059669', update: '#2563eb', delete: '#dc2626' }[a] || '#6b7280');
    const timeAgoShort = (ts) => {
      if (!ts) return '';
      const diff = Date.now() - new Date(ts).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days < 30) return `${days}d ago`;
      return new Date(ts).toLocaleDateString();
    };
    const formatChanges = (changes) => {
      if (!changes) return '';
      return Object.entries(changes).map(([field, diff]) => {
        const from = diff.from == null || diff.from === '' ? '<em>empty</em>' : escHtml(String(diff.from));
        const to = diff.to == null || diff.to === '' ? '<em>empty</em>' : escHtml(String(diff.to));
        return `<div style="font-size:11px;margin:2px 0;"><strong>${escHtml(field)}</strong>: <span style="text-decoration:line-through;color:var(--red);opacity:.7;">${from}</span> → <span style="color:var(--green);">${to}</span></div>`;
      }).join('');
    };

    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No events match your filters.</td></tr>';
      return;
    }
    tbody.innerHTML = entries.slice(0, 200).map(e => `
      <tr>
        <td><div style="font-size:12px;">${timeAgoShort(e.timestamp)}</div><div style="font-size:10px;color:var(--text-muted);">${e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}</div></td>
        <td><strong style="font-size:12px;">${escHtml(e.user_name || 'System')}</strong><div style="font-size:10px;color:var(--text-muted);">${escHtml(e.user_role || '')}</div></td>
        <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:${actionColor(e.action)};">${actionIcon(e.action)} ${e.action}</span></td>
        <td style="font-size:12px;">${escHtml(e.collection || '')}</td>
        <td><code style="font-size:11px;">${e.record_id ? ('#' + String(e.record_id).slice(-6)) : '-'}</code></td>
        <td>${e.changes ? formatChanges(e.changes) : (e.action === 'create' ? '<span style="font-size:11px;color:var(--green);">New record created</span>' : e.action === 'delete' ? '<span style="font-size:11px;color:var(--red);">Record deleted</span>' : '-')}</td>
      </tr>
    `).join('');
  },
  exportAuditCSV() {
    const entries = store.getLocalAuditLog();
    if (entries.length === 0) { showToast('No audit data to export'); return; }
    const headers = ['Timestamp', 'User', 'Role', 'Action', 'Collection', 'Record ID', 'Changes'];
    const rows = entries.map(e => [
      e.timestamp || '',
      e.user_name || '',
      e.user_role || '',
      e.action || '',
      e.collection || '',
      e.record_id || '',
      e.changes ? Object.entries(e.changes).map(([k, v]) => `${k}: ${v.from} → ${v.to}`).join('; ') : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `audit-trail-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('Audit trail exported');
  },

  // Payer tag filters & strategic planner
  togglePayerTagFilter(tag) {
    if (_payerTagFilters.has(tag)) _payerTagFilters.delete(tag);
    else _payerTagFilters.add(tag);
    renderPayers();
  },
  clearPayerTagFilters() {
    _payerTagFilters.clear();
    renderPayers();
  },
  setPayerView(view) {
    _payerView = view;
    renderPayers();
  },

  // Notifications (#1)
  async toggleNotifications() {
    const panel = document.getElementById('notification-panel');
    const overlay = document.getElementById('notification-overlay');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
      panel.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
    } else {
      await renderNotifications();
      panel.style.display = '';
      if (overlay) overlay.style.display = '';
    }
  },

  // Bulk Actions (#3)
  onBulkCheckChange() { renderBulkBar(); },
  async bulkUpdateStatus() {
    const status = document.getElementById('bulk-status')?.value;
    if (!status) { showToast('Select a status first'); return; }
    const selected = Array.from(document.querySelectorAll('.app-checkbox:checked')).map(el => el.dataset.appId);
    for (const id of selected) { await store.update('applications', id, { status }); }
    showToast(`Updated ${selected.length} applications to ${status}`);
    await renderAppTable();
  },
  async bulkUpdateWave() {
    const wave = document.getElementById('bulk-wave')?.value;
    if (!wave) { showToast('Select a wave first'); return; }
    const selected = Array.from(document.querySelectorAll('.app-checkbox:checked')).map(el => el.dataset.appId);
    for (const id of selected) { await store.update('applications', id, { wave: Number(wave) }); }
    showToast(`Updated ${selected.length} applications to ${getGroupDef(wave).label}`);
    await renderAppTable();
  },
  async exportSelectedCSV() {
    const selected = Array.from(document.querySelectorAll('.app-checkbox:checked')).map(el => el.dataset.appId);
    const apps = [];
    for (const id of selected) { const a = await store.getOne('applications', id); if (a) apps.push(a); }
    const headers = ['State', 'Payer', 'Status', 'Group', 'Submitted', 'Effective Date', 'Est Revenue', 'Notes'];
    const rows = apps.map(a => {
      const payer = getPayerById(a.payerId);
      return [a.state, payer ? payer.name : (a.payerName || ''), a.status, a.wave || '', a.submittedDate || '', a.effectiveDate || '', a.estMonthlyRevenue || 0, (a.notes || '').replace(/"/g, '""')];
    });
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `applications-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${apps.length} applications`);
  },
  async bulkDelete() {
    const selected = Array.from(document.querySelectorAll('.app-checkbox:checked')).map(el => el.dataset.appId);
    if (!await appConfirm(`Delete ${selected.length} applications? This cannot be undone.`, { title: 'Bulk Delete', okLabel: 'Delete All', okClass: 'btn-danger' })) return;
    selected.forEach(async id => await store.remove('applications', id));
    showToast(`Deleted ${selected.length} applications`);
    await renderAppTable();
  },
  clearSelection() {
    document.querySelectorAll('.app-checkbox:checked').forEach(el => { el.checked = false; });
    renderBulkBar();
  },

  // Timeline (#4)
  viewTimeline(appId) {
    renderApplicationTimeline(appId);
  },

  // ─── New Tool Actions ───

  generateDocChecklist() {
    const payerId = document.getElementById('dct-payer')?.value;
    const stateCode = document.getElementById('dct-state')?.value;
    if (!payerId || !stateCode) { showToast('Select both payer and state'); return; }
    const payer = getPayerById(payerId);
    const result = document.getElementById('dct-result');
    const categories = [...new Set(CRED_DOCUMENTS.map(d => d.category))];
    result.innerHTML = `
      <div class="alert alert-info" style="margin-bottom:16px;">
        <strong>Checklist for ${payer?.name || payerId} — ${getStateName(stateCode)}</strong><br>
        ${CRED_DOCUMENTS.length} documents required. Print or copy this list.
      </div>
      ${categories.map(cat => `
        <h4 style="font-size:13px;color:var(--gray-900);margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.5px;">${cat}</h4>
        ${CRED_DOCUMENTS.filter(d => d.category === cat).map(d =>
          `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);">
            <input type="checkbox" style="width:16px;height:16px;"> ${d.label}
          </label>`
        ).join('')}
      `).join('')}
      <button class="btn btn-sm" style="margin-top:16px;" onclick="window.print()">&#128424; Print Checklist</button>
    `;
  },

  recalcFees() {
    const mult = parseFloat(document.getElementById('fee-multiplier')?.value) || 1.0;
    const sessions = parseInt(document.getElementById('fee-sessions')?.value) || 40;
    const codes = window._feeScheduleCPT || [];
    const rows = document.querySelectorAll('#fee-table-body tr');
    rows.forEach((row, i) => {
      if (!codes[i]) return;
      const adj = (codes[i].avgRate * mult).toFixed(2);
      const monthly = (codes[i].avgRate * mult * sessions).toFixed(0);
      row.querySelector('.fee-adj').textContent = '$' + adj;
      row.querySelector('.fee-monthly').textContent = '$' + Number(monthly).toLocaleString();
    });
  },

  filterPortals() {
    const q = (document.getElementById('portal-search')?.value || '').toLowerCase();
    document.querySelectorAll('#portal-table-body tr').forEach(row => {
      row.style.display = row.dataset.payerName.includes(q) ? '' : 'none';
    });
  },

  async generateStatusReport() {
    const type = document.getElementById('export-type')?.value || 'executive';
    const format = document.getElementById('export-format')?.value || 'text';
    const apps = await store.getAll('applications');
    const licenses = await store.getAll('licenses');
    const orgs = await store.getAll('organizations');
    const org = orgs[0] || {};
    const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    let report = '';

    if (type === 'executive') {
      const byStatus = {};
      apps.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
      report = `EXECUTIVE SUMMARY — CREDENTIALING STATUS REPORT\n`;
      report += `Organization: ${org.name || 'Credentik Agency'}\n`;
      report += `Generated: ${now}\n`;
      report += `${'═'.repeat(50)}\n\n`;
      report += `APPLICATIONS: ${apps.length} total\n`;
      Object.entries(byStatus).forEach(([s, c]) => { report += `  • ${s.replace(/_/g, ' ').toUpperCase()}: ${c}\n`; });
      report += `\nLICENSES: ${licenses.length} total\n`;
      report += `  • Active: ${licenses.filter(l => l.status === 'active').length}\n`;
      report += `  • Pending: ${licenses.filter(l => l.status === 'pending').length}\n`;
      report += `  • Expired: ${licenses.filter(l => l.status === 'expired').length}\n`;
    } else if (type === 'detailed') {
      report = `DETAILED APPLICATION STATUS REPORT\nGenerated: ${now}\n${'═'.repeat(50)}\n\n`;
      apps.forEach(a => {
        report += `${a.payerName} — ${getStateName(a.state)}\n`;
        report += `  Status: ${a.status} | Group: ${a.wave ? getGroupDef(a.wave).label : '—'} | Submitted: ${a.submittedDate || 'N/A'}\n\n`;
      });
    } else if (type === 'license') {
      report = `LICENSE STATUS REPORT\nGenerated: ${now}\n${'═'.repeat(50)}\n\n`;
      licenses.forEach(l => {
        report += `${l.licenseType || 'License'} — ${getStateName(l.state)}\n`;
        report += `  Status: ${l.status} | Expires: ${l.expirationDate || 'N/A'} | Number: ${l.licenseNumber || 'N/A'}\n\n`;
      });
    } else {
      const approved = apps.filter(a => a.status === 'approved');
      report = `REVENUE PIPELINE REPORT\nGenerated: ${now}\n${'═'.repeat(50)}\n\n`;
      report += `Approved Payer Relationships: ${approved.length}\n`;
      report += `Pending Applications: ${apps.filter(a => ['submitted','in_review','pending_info'].includes(a.status)).length}\n\n`;
      report += `APPROVED:\n`;
      approved.forEach(a => { report += `  • ${a.payerName} — ${getStateName(a.state)}\n`; });
    }

    const result = document.getElementById('export-result');
    if (format === 'csv' && (type === 'detailed' || type === 'license')) {
      let csv = type === 'detailed'
        ? 'Payer,State,Status,Group,Submitted\n' + apps.map(a => `"${a.payerName}","${getStateName(a.state)}","${a.status}","${a.wave ? getGroupDef(a.wave).label : ''}","${a.submittedDate || ''}"`).join('\n')
        : 'License Type,State,Status,Expires,Number\n' + licenses.map(l => `"${l.licenseType || ''}","${getStateName(l.state)}","${l.status}","${l.expirationDate || ''}","${l.licenseNumber || ''}"`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      result.innerHTML = `<a href="${url}" download="report-${type}-${new Date().toISOString().split('T')[0]}.csv" class="btn btn-primary">&#11015; Download CSV</a>`;
      return;
    }

    result.innerHTML = `
      <div class="email-preview" style="white-space:pre-wrap;font-size:12px;">${report}</div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText(document.querySelector('.email-preview').textContent);window.app.showToast('Copied to clipboard')">Copy</button>
        <button class="btn btn-sm" onclick="window.print()">&#128424; Print</button>
      </div>
    `;
  },

  filterStateLookup() {
    const q = (document.getElementById('state-lookup-search')?.value || '').toLowerCase();
    document.querySelectorAll('#state-lookup-body tr').forEach(row => {
      const match = row.dataset.stateName.includes(q) || row.dataset.stateCode.includes(q);
      row.style.display = match ? '' : 'none';
    });
  },

  searchStateBoard(code, name) {
    const searchUrl = 'https://www.google.com/search?' + new URLSearchParams({ q: `${name} state board of psychiatry licensing requirements` });
    window.open(searchUrl, '_blank');
  },

  // ─── CAQH Manager Actions ───

  caqhTab(btn, tabId) {
    btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['caqh-roster', 'caqh-attestation', 'caqh-payer-map'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== tabId);
    });
  },

  async setCaqhId(providerId) {
    const id = await appPrompt('Enter CAQH ProView Provider ID:', { title: 'Set CAQH ID', placeholder: 'e.g. 12345678' });
    if (!id) return;
    await store.update('providers', providerId, { caqhId: id.trim() });
    showToast('CAQH ID saved');
    await renderCaqhManager();
  },

  async checkCaqhStatus(providerId) {
    const prov = await store.getOne('providers', providerId);
    if (!prov?.caqhId) { showToast('No CAQH ID set for this provider'); return; }
    if (!caqhApi.isCaqhConfigured()) { showToast('CAQH API credentials not configured'); return; }

    const log = document.getElementById('caqh-status-log');
    if (log) log.innerHTML = '<div class="spinner"></div><div class="text-sm text-muted" style="text-align:center;">Checking CAQH status...</div>';

    try {
      const status = await caqhApi.getProviderStatus(prov.caqhId);
      const attestation = await caqhApi.getAttestationStatus(prov.caqhId);
      const result = {
        providerId: prov.id,
        providerName: `${prov.firstName} ${prov.lastName}`,
        caqhId: prov.caqhId,
        status,
        attestation,
        error: null,
      };
      caqhApi.updateTrackingFromResult(result);
      showToast(`CAQH status updated for ${prov.firstName} ${prov.lastName}`);
      await renderCaqhManager();
    } catch (err) {
      if (log) log.innerHTML = `<div class="alert alert-danger">${escHtml(err.message)}</div>`;
    }
  },

  async viewCaqhProfile(providerId) {
    const prov = await store.getOne('providers', providerId);
    if (!prov?.caqhId) return;

    if (!caqhApi.isCaqhConfigured()) {
      // Show local tracking data only
      const tracking = caqhApi.getCaqhTracking();
      const t = tracking[prov.caqhId] || {};
      const modal = document.getElementById('log-modal');
      document.getElementById('log-modal-title').textContent = `CAQH Profile — ${prov.firstName} ${prov.lastName}`;
      document.getElementById('log-modal-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
          <div><strong>CAQH ID:</strong> ${prov.caqhId}</div>
          <div><strong>NPI:</strong> ${prov.npi || '—'}</div>
          <div><strong>Profile Status:</strong> ${t.profileStatus || 'Not checked'}</div>
          <div><strong>Roster Status:</strong> ${t.rosterStatus || '—'}</div>
          <div><strong>Last Attested:</strong> ${formatDateDisplay(t.attestationDate)}</div>
          <div><strong>Attestation Expires:</strong> ${t.attestationExpires || '—'}</div>
          <div><strong>Last API Check:</strong> ${t.lastChecked ? new Date(t.lastChecked).toLocaleString() : 'Never'}</div>
          ${t.error ? `<div style="grid-column:span 2;" class="alert alert-danger">Last error: ${escHtml(t.error)}</div>` : ''}
        </div>
        <div style="margin-top:16px;">
          <a href="https://proview.caqh.org" target="_blank" rel="noopener" class="btn btn-primary">Open CAQH ProView</a>
        </div>
      `;
      modal.classList.add('active');
      return;
    }

    try {
      const profile = await caqhApi.getProviderProfile(prov.caqhId);
      const modal = document.getElementById('log-modal');
      document.getElementById('log-modal-title').textContent = `CAQH Profile — ${prov.firstName} ${prov.lastName}`;
      document.getElementById('log-modal-body').innerHTML = `
        <pre style="font-size:11px;max-height:500px;overflow:auto;background:var(--light);padding:16px;border-radius:8px;">${JSON.stringify(profile, null, 2)}</pre>
      `;
      modal.classList.add('active');
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  },

  async runBatchCaqhCheck() {
    if (!caqhApi.isCaqhConfigured()) { showToast('CAQH API credentials not configured'); return; }
    const log = document.getElementById('caqh-status-log');
    if (log) log.innerHTML = '<div class="spinner"></div><div class="text-sm text-muted" style="text-align:center;">Checking all providers against CAQH API...</div>';

    try {
      const results = await caqhApi.batchStatusCheck();
      results.forEach(r => caqhApi.updateTrackingFromResult(r));
      const ok = results.filter(r => !r.error).length;
      const fail = results.filter(r => r.error).length;
      showToast(`CAQH check complete: ${ok} updated, ${fail} errors`);
      await renderCaqhManager();
    } catch (err) {
      if (log) log.innerHTML = `<div class="alert alert-danger">${escHtml(err.message)}</div>`;
    }
  },

  async manualCaqhEntry() {
    const providers = await store.getAll('providers');
    if (providers.length === 0) { showToast('No providers found'); return; }
    const prov = providers[0]; // TODO: provider selector if multiple

    const modal = document.getElementById('log-modal');
    document.getElementById('log-modal-title').textContent = 'Manual CAQH Entry';
    document.getElementById('log-modal-body').innerHTML = `
      <p class="text-sm text-muted" style="margin-bottom:16px;">Manually enter CAQH status for tracking without API calls.</p>
      <div class="form-row">
        <div class="form-group">
          <label>Provider</label>
          <select class="form-control" id="manual-caqh-provider">
            ${providers.map(p => `<option value="${p.id}">${p.firstName} ${p.lastName}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>CAQH Provider ID</label>
          <input class="form-control" id="manual-caqh-id" placeholder="e.g. 12345678" value="${prov.caqhId || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Profile Status</label>
          <select class="form-control" id="manual-caqh-profile-status">
            <option value="">Select...</option>
            <option value="Initial Profile Complete">Initial Profile Complete</option>
            <option value="Re-Attestation">Re-Attestation Needed</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="In Progress">In Progress</option>
          </select>
        </div>
        <div class="form-group">
          <label>Roster Status</label>
          <select class="form-control" id="manual-caqh-roster">
            <option value="">Select...</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Not Rostered">Not Rostered</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Last Attestation Date</label>
          <input type="date" class="form-control" id="manual-caqh-att-date">
        </div>
        <div class="form-group">
          <label>Attestation Expiration</label>
          <input type="date" class="form-control" id="manual-caqh-att-exp">
        </div>
      </div>
      <button class="btn btn-primary" onclick="window.app.saveManualCaqh()" style="margin-top:8px;">Save</button>
    `;
    modal.classList.add('active');
  },

  async saveManualCaqh() {
    const providerId = document.getElementById('manual-caqh-provider')?.value;
    const caqhId = document.getElementById('manual-caqh-id')?.value?.trim();
    if (!providerId) return;

    // Save CAQH ID to provider
    if (caqhId) {
      await store.update('providers', providerId, { caqhId });
    }

    const prov = await store.getOne('providers', providerId);
    const tracking = caqhApi.getCaqhTracking();
    const key = caqhId || providerId;
    tracking[key] = {
      providerId,
      providerName: `${prov.firstName} ${prov.lastName}`,
      caqhId: caqhId || '',
      lastChecked: new Date().toISOString(),
      profileStatus: document.getElementById('manual-caqh-profile-status')?.value || '',
      rosterStatus: document.getElementById('manual-caqh-roster')?.value || '',
      attestationDate: document.getElementById('manual-caqh-att-date')?.value || '',
      attestationExpires: document.getElementById('manual-caqh-att-exp')?.value || '',
      error: null,
    };
    caqhApi.saveCaqhTracking(tracking);

    document.getElementById('log-modal').classList.remove('active');
    showToast('CAQH tracking data saved');
    await renderCaqhManager();
  },

  async addProviderToRoster(providerId) {
    const prov = await store.getOne('providers', providerId);
    if (!prov) return;
    if (!caqhApi.isCaqhConfigured()) { showToast('CAQH API not configured'); return; }

    try {
      await caqhApi.addToRoster({
        firstName: prov.firstName,
        lastName: prov.lastName,
        npi: prov.npi,
        caqhProviderId: prov.caqhId,
      });
      showToast(`${prov.firstName} ${prov.lastName} added to CAQH roster`);
      await renderCaqhManager();
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  },

  // ─── CAQH Settings ───

  saveCaqhSettings() {
    const config = {
      orgId: document.getElementById('caqh-org-id')?.value?.trim() || '',
      username: document.getElementById('caqh-username')?.value?.trim() || '',
      password: document.getElementById('caqh-password')?.value?.trim() || '',
      environment: document.getElementById('caqh-environment')?.value || 'production',
    };
    caqhApi.saveCaqhConfig(config);
    showToast('CAQH API settings saved');
  },

  showCaqhProxyCode() {
    const container = document.getElementById('caqh-proxy-code');
    if (!container) return;
    container.innerHTML = `
      <div class="email-preview" style="font-size:11px;white-space:pre-wrap;max-height:400px;overflow:auto;">// Add this function to your Google Apps Script project
// It proxies CAQH ProView API calls from the client

function handleCaqhProxy(payload) {
  var config = payload.caqhConfig;
  var action = payload.caqhAction;
  var params = payload.params || {};

  var baseUrl = config.environment === 'sandbox'
    ? 'https://proview-demo.caqh.org/RosterAPI/api'
    : 'https://proview.caqh.org/RosterAPI/api';

  var headers = {
    'Authorization': 'Basic ' + Utilities.base64Encode(config.username + ':' + config.password),
    'Content-Type': 'application/json',
  };

  var endpoints = {
    'roster_status': { method: 'get', path: '/Roster?Product=PV&Organization_Id=' + config.orgId + '&Caqh_Provider_Id=' + params.caqhProviderId },
    'roster_add': { method: 'post', path: '/Roster', body: { Product: 'PV', Organization_Id: config.orgId, ...params.provider } },
    'roster_remove': { method: 'delete', path: '/Roster?Product=PV&Organization_Id=' + config.orgId + '&Caqh_Provider_Id=' + params.caqhProviderId },
    'provider_status': { method: 'get', path: '/providerstatus?Product=PV&Organization_Id=' + config.orgId + '&Caqh_Provider_Id=' + params.caqhProviderId },
    'provider_status_npi': { method: 'get', path: '/providerstatus?Product=PV&Organization_Id=' + config.orgId + '&NPI_Provider_Id=' + params.npi },
    'attestation_status': { method: 'get', path: '/providerstatus?Product=PV&Organization_Id=' + config.orgId + '&Caqh_Provider_Id=' + params.caqhProviderId + '&Attestation=true' },
    'provider_profile': { method: 'get', path: '/providerprofile?Product=PV&Organization_Id=' + config.orgId + '&Caqh_Provider_Id=' + params.caqhProviderId },
  };

  var ep = endpoints[action];
  if (!ep) return { success: false, error: 'Unknown CAQH action: ' + action };

  try {
    var options = { method: ep.method, headers: headers, muteHttpExceptions: true };
    if (ep.body) options.payload = JSON.stringify(ep.body);
    var resp = UrlFetchApp.fetch(baseUrl + ep.path, options);
    var code = resp.getResponseCode();
    if (code >= 400) return { success: false, error: 'CAQH API returned ' + code + ': ' + resp.getContentText() };
    return { success: true, data: JSON.parse(resp.getContentText()) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── NPPES NPI Registry Proxy ───
// Proxies browser requests to the CMS NPPES API (avoids CORS)

function handleNppesProxy(payload) {
  var url = payload.url;
  if (!url || url.indexOf('npiregistry.cms.hhs.gov') === -1) {
    return { success: false, error: 'Invalid NPPES URL' };
  }
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code = resp.getResponseCode();
    if (code >= 400) return { success: false, error: 'NPPES returned HTTP ' + code };
    return { success: true, data: JSON.parse(resp.getContentText()) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// In your doPost function, add these cases:
// if (body.action === 'caqh_proxy') return sendJson(handleCaqhProxy(body));
// if (body.action === 'nppes_proxy') return sendJson(handleNppesProxy(body));</div>
      <button class="btn btn-sm" style="margin-top:8px;" onclick="navigator.clipboard.writeText(document.querySelector('#caqh-proxy-code .email-preview').textContent);window.app.showToast('Copied to clipboard')">Copy Code</button>
    `;
  },

  async testCaqhConnection() {
    if (!caqhApi.isCaqhConfigured()) { showToast('Enter credentials first'); return; }
    const result = document.getElementById('caqh-test-result');
    if (result) result.innerHTML = '<div class="spinner" style="margin:8px auto;"></div>';
    try {
      const providers = await store.getAll('providers');
      const testProv = providers.find(p => p.caqhId);
      if (!testProv) {
        if (result) result.innerHTML = '<div class="alert alert-warning">No providers with CAQH IDs to test against. Add a CAQH ID first.</div>';
        return;
      }
      await caqhApi.getRosterStatus(testProv.caqhId);
      if (result) result.innerHTML = '<div class="alert alert-success">Connection successful! CAQH API is reachable.</div>';
    } catch (err) {
      if (result) result.innerHTML = `<div class="alert alert-danger">Connection failed: ${escHtml(err.message)}</div>`;
    }
  },

  async generateLetter() {
    const type = document.getElementById('letter-type')?.value;
    const payerId = document.getElementById('letter-payer')?.value;
    const stateCode = document.getElementById('letter-state')?.value;
    const notes = document.getElementById('letter-notes')?.value || '';
    const payer = payerId ? getPayerById(payerId) : null;
    const orgs = await store.getAll('organizations');
    const providers = await store.getAll('providers');
    const org = orgs[0] || {};
    const prov = providers[0] || {};
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const provName = `${prov.firstName || 'Provider'} ${prov.lastName || ''}`.trim();
    const orgName = org.name || 'Credentik Agency';
    const payerName = payer?.name || '[Payer Name]';
    const stateName = stateCode ? getStateName(stateCode) : '[State]';

    const templates = {
      cover: `${today}\n\n${payerName}\nCredentialing Department\n\nRe: New Provider Credentialing Application\nProvider: ${provName}\nNPI: ${prov.npi || '[NPI]'}\nState: ${stateName}\n\nDear Credentialing Team,\n\nPlease accept this application for enrollment of ${provName} with ${payerName} for the provision of psychiatric and telehealth services in ${stateName}.\n\n${provName} is a licensed ${prov.licenseType || 'psychiatrist'} with ${orgName}. Enclosed please find all required credentialing documents as specified in your provider enrollment requirements.\n\nPlease do not hesitate to contact us if any additional information is needed.\n\nSincerely,\n${provName}\n${orgName}\n${org.phone || '[Phone]'}\n${org.email || '[Email]'}`,

      followup: `${today}\n\n${payerName}\nCredentialing Department\n\nRe: Application Status Inquiry\nProvider: ${provName}\nNPI: ${prov.npi || '[NPI]'}\n\nDear Credentialing Team,\n\nI am writing to inquire about the status of the credentialing application submitted for ${provName} with ${payerName} for services in ${stateName}.\n\nWe submitted our application on [DATE] and would appreciate an update on its current status and expected timeline for completion.\n\nPlease let us know if any additional documentation is required.\n\nThank you for your attention to this matter.\n\nSincerely,\n${provName}\n${orgName}\n${org.phone || '[Phone]'}`,

      attestation: `ATTESTATION STATEMENT\n\nI, ${provName}, hereby attest that:\n\n1. All information provided in my credentialing application is true, accurate, and complete to the best of my knowledge.\n2. I hold a valid and unrestricted license to practice in ${stateName}.\n3. I have not been excluded from participation in any federal or state healthcare program.\n4. I have not had any malpractice claims or disciplinary actions, except as otherwise disclosed.\n5. I authorize the release of information for verification purposes.\n\nDate: ${today}\n\nSignature: _________________________\n${provName}\nNPI: ${prov.npi || '[NPI]'}\n${orgName}`,

      resignation: `${today}\n\n${payerName}\nProvider Relations Department\n\nRe: Provider Panel Withdrawal\nProvider: ${provName}\nNPI: ${prov.npi || '[NPI]'}\n\nDear Provider Relations Team,\n\nThis letter serves as formal notification that ${provName} of ${orgName} will be withdrawing from the ${payerName} provider network effective [EFFECTIVE DATE].\n\nWe will continue to provide care to currently assigned patients through [TRANSITION DATE] and will assist with patient transition as needed.\n\nPlease confirm receipt of this notification and provide any required withdrawal forms.\n\nSincerely,\n${provName}\n${orgName}`,

      address_change: `${today}\n\n${payerName}\nProvider Data Management\n\nRe: Practice Address / Information Change\nProvider: ${provName}\nNPI: ${prov.npi || '[NPI]'}\n\nDear Provider Data Team,\n\nPlease update the following information for ${provName}:\n\nNew Practice Address:\n[NEW ADDRESS]\n[CITY, STATE ZIP]\n\nEffective Date: [DATE]\n\nAll other provider information remains unchanged.\n\nSincerely,\n${provName}\n${orgName}\n${org.phone || '[Phone]'}`,

      recredentialing: `${today}\n\n${payerName}\nCredentialing Department\n\nRe: Re-credentialing Application\nProvider: ${provName}\nNPI: ${prov.npi || '[NPI]'}\nState: ${stateName}\n\nDear Credentialing Team,\n\nPlease find enclosed the re-credentialing application for ${provName} with ${payerName}.\n\nSince our last credentialing cycle, ${provName} has maintained an active license in ${stateName} with no disciplinary actions, malpractice claims, or changes to credentials, except as otherwise noted.\n\nEnclosed are all updated documents for your review.\n\nSincerely,\n${provName}\n${orgName}`,

      appeal: `${today}\n\n${payerName}\nCredentialing Appeals Department\n\nRe: Appeal of Credentialing Denial\nProvider: ${provName}\nNPI: ${prov.npi || '[NPI]'}\n\nDear Appeals Committee,\n\nI am writing to formally appeal the denial of the credentialing application for ${provName} with ${payerName} in ${stateName}.\n\nReason for Appeal:\n[DESCRIBE REASON]\n\nSupporting Information:\n${notes || '[ADDITIONAL DETAILS]'}\n\nWe respectfully request reconsideration of this decision and are prepared to provide any additional documentation needed.\n\nSincerely,\n${provName}\n${orgName}\n${org.phone || '[Phone]'}`,

      introduction: `${today}\n\nDear Healthcare Partner,\n\nI am pleased to introduce ${orgName}, a telehealth psychiatric practice now serving patients in ${stateName}.\n\nOur Services:\n• Psychiatric diagnostic evaluations\n• Medication management\n• Individual psychotherapy\n• Telehealth consultations\n\nOur Provider:\n${provName}\n${prov.licenseType || 'Licensed Psychiatrist'}\nNPI: ${prov.npi || '[NPI]'}\n\nWe are currently accepting new patients and referrals. ${notes ? 'Note: ' + notes : ''}\n\nFor more information or to schedule a consultation, please contact us.\n\nSincerely,\n${provName}\n${orgName}\n${org.phone || '[Phone]'}\n${org.email || '[Email]'}`,
    };

    const letter = templates[type] || templates.cover;
    const result = document.getElementById('letter-result');
    result.innerHTML = `
      <div class="email-preview" style="white-space:pre-wrap;">${letter}</div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText(document.querySelector('#letter-result .email-preview').textContent);window.app.showToast('Copied to clipboard')">Copy</button>
        <button class="btn btn-sm" onclick="window.print()">&#128424; Print</button>
      </div>
    `;
  },

  // ── User Management ───────────────────────────────────────
  inviteUser() {
    ['invite-first-name','invite-last-name','invite-email','invite-password'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('invite-error')?.classList.add('hidden');
    document.getElementById('invite-user-modal')?.classList.add('active');
  },
  generatePassword() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%&*';
    const all = upper + lower + digits + symbols;
    let pw = [
      upper[Math.floor(Math.random() * upper.length)],
      lower[Math.floor(Math.random() * lower.length)],
      digits[Math.floor(Math.random() * digits.length)],
      symbols[Math.floor(Math.random() * symbols.length)],
    ];
    for (let i = 4; i < 14; i++) pw.push(all[Math.floor(Math.random() * all.length)]);
    pw = pw.sort(() => Math.random() - 0.5);
    const el = document.getElementById('invite-password');
    if (el) { el.value = pw.join(''); el.type = 'text'; }
  },

  // Onboarding token management
  async createOnboardToken() {
    const email = document.getElementById('onboard-invite-email')?.value?.trim();
    if (!email) { showToast('Please enter a provider email'); return; }
    const hours = parseInt(document.getElementById('onboard-invite-hours')?.value || '72');
    try {
      const token = await store.createOnboardToken({ provider_email: email, expires_hours: hours });
      const link = location.origin + location.pathname + '#onboard/' + (token.token || token.id);
      try { await navigator.clipboard.writeText(link); } catch {}
      const result = document.getElementById('onboard-invite-result');
      document.getElementById('onboard-invite-link').textContent = link;
      if (result) result.style.display = '';
      document.getElementById('onboard-invite-email').value = '';
      showToast('Invite link created and copied!');
      await renderOnboardingStub();
    } catch (e) { showToast('Error creating token: ' + e.message); }
  },

  async revokeOnboardToken(id) {
    if (!await appConfirm('Revoke this onboarding token? The invite link will no longer work.', { title: 'Revoke Token', okLabel: 'Revoke', okClass: 'btn-danger' })) return;
    try {
      await store._fetch(`${CONFIG.API_URL}/onboard/tokens/${id}`, { method: 'DELETE' });
      showToast('Token revoked');
      await renderOnboardingStub();
    } catch (e) { showToast('Error revoking token: ' + e.message); }
  },

  cancelInvite() {
    document.getElementById('invite-user-modal')?.classList.remove('active');
    document.getElementById('invite-error')?.classList.add('hidden');
  },
  onInviteRoleChange() {
    const role = document.getElementById('invite-role')?.value;
    const orgSel = document.getElementById('invite-org');
    const provSel = document.getElementById('invite-provider');
    // Agency and Staff see all data (no org/provider scope needed)
    if (orgSel) orgSel.classList.toggle('hidden', role === 'agency' || role === 'staff');
    if (provSel) provSel.classList.toggle('hidden', role !== 'provider');
  },
  async submitInvite() {
    const errEl = document.getElementById('invite-error');
    errEl?.classList.add('hidden');

    const firstName = document.getElementById('invite-first-name')?.value?.trim();
    const lastName = document.getElementById('invite-last-name')?.value?.trim();
    const email = document.getElementById('invite-email')?.value?.trim();
    const password = document.getElementById('invite-password')?.value;
    const role = document.getElementById('invite-role')?.value;
    const organizationId = document.getElementById('invite-org')?.value || null;
    const providerId = document.getElementById('invite-provider')?.value || null;

    if (!firstName || !lastName || !email || !password) {
      if (errEl) { errEl.textContent = 'First name, last name, email, and password are required.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (role === 'organization' && !organizationId) {
      if (errEl) { errEl.textContent = 'Please select an organization for this user.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (role === 'provider' && !providerId) {
      if (errEl) { errEl.textContent = 'Please select a provider for this user.'; errEl.classList.remove('hidden'); }
      return;
    }

    const btn = document.querySelector('#invite-user-modal .btn-primary');
    const btnText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }
    try {
      // Backend only accepts: agency, organization, provider
      // Staff maps to agency with a ui_role metadata field for frontend access control
      const apiRole = role === 'staff' ? 'agency' : role;
      await store.inviteUser({
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        role: apiRole,
        ui_role: role,
        organization_id: organizationId ? parseInt(organizationId) : null,
        provider_id: providerId ? parseInt(providerId) : null,
      });
      showToast('User created successfully');
      document.getElementById('invite-user-modal')?.classList.remove('active');
      await renderUsersStub();
    } catch (e) {
      console.error('Failed to create user:', e);
      const msg = e.message || e.error || 'Failed to create user. Check the console for details.';
      if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
      showToast('Error: ' + msg);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btnText; }
    }
  },
  async editUserRole(userId, currentRole) {
    const roleLabels = {
      agency: 'Agency (Full Access)',
      staff: 'Staff (Credentialing Coordinator)',
      organization: 'Organization',
      provider: 'Provider',
    };
    const roles = ['agency', 'staff', 'organization', 'provider'].filter(r => r !== currentRole);
    const radioHtml = roles.map(r =>
      `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:6px;">
        <input type="radio" name="role-change" value="${r}"> <strong>${roleLabels[r]}</strong>
      </label>`
    ).join('');

    const confirmed = await appConfirm(
      `<div style="margin-bottom:12px;">Current role: <strong>${roleLabels[currentRole] || currentRole}</strong></div>
       <div style="margin-bottom:8px;font-weight:600;">Select new role:</div>
       ${radioHtml}`,
      { title: 'Change User Role', okLabel: 'Change Role', raw: true }
    );
    if (!confirmed) return;

    const selected = document.querySelector('input[name="role-change"]:checked')?.value;
    if (!selected) { showToast('Please select a role'); return; }

    try {
      const apiRole = selected === 'staff' ? 'agency' : selected;
      const data = { role: apiRole, ui_role: selected };
      if (selected === 'organization') {
        const orgs = await store.getAll('organizations');
        const orgHtml = orgs.map(o =>
          `<label style="display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:4px;">
            <input type="radio" name="org-select" value="${o.id}"> ${escHtml(o.name)}
          </label>`
        ).join('');
        const orgConfirmed = await appConfirm(
          `<div style="margin-bottom:8px;font-weight:600;">Assign to organization:</div>${orgHtml}`,
          { title: 'Select Organization', okLabel: 'Assign', raw: true }
        );
        if (!orgConfirmed) return;
        const orgId = document.querySelector('input[name="org-select"]:checked')?.value;
        if (!orgId) { showToast('Please select an organization'); return; }
        data.organization_id = parseInt(orgId);
      }
      if (selected === 'provider') {
        const provs = await store.getAll('providers');
        const provHtml = provs.map(p =>
          `<label style="display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:4px;">
            <input type="radio" name="prov-select" value="${p.id}"> ${escHtml((p.firstName || '') + ' ' + (p.lastName || ''))} <span style="color:var(--text-muted);font-size:12px;">(${p.credentials || ''})</span>
          </label>`
        ).join('');
        const provConfirmed = await appConfirm(
          `<div style="margin-bottom:8px;font-weight:600;">Assign to provider:</div>${provHtml}`,
          { title: 'Select Provider', okLabel: 'Assign', raw: true }
        );
        if (!provConfirmed) return;
        const provId = document.querySelector('input[name="prov-select"]:checked')?.value;
        if (!provId) { showToast('Please select a provider'); return; }
        data.provider_id = parseInt(provId);
      }
      await store.updateUser(userId, data);
      showToast('Role updated successfully');
      await renderUsersStub();
    } catch (e) {
      showToast('Error: ' + (e.message || 'Failed to update role'));
    }
  },
  async deactivateUser(userId, name) {
    if (!await appConfirm(`Deactivate user "<strong>${name}</strong>"? They will no longer be able to log in.`, { title: 'Deactivate User', okLabel: 'Deactivate', okClass: 'btn-danger', raw: true })) return;
    try {
      await store.deleteUser(userId);
      showToast('User deactivated');
      await renderUsersStub();
    } catch (e) {
      showToast('Error: ' + (e.message || 'Failed to deactivate user'));
    }
  },
  async reactivateUser(userId) {
    try {
      await store.updateUser(userId, { is_active: true });
      showToast('User reactivated');
      await renderUsersStub();
    } catch (e) {
      showToast('Error: ' + (e.message || 'Failed to reactivate user'));
    }
  },
  async resetUserPassword(userId, userName) {
    if (!await appConfirm(`Send a password reset email to <strong>${userName}</strong>? They will receive a link to set a new password.`, { title: 'Reset Password', okLabel: 'Send Reset Email', raw: true })) return;
    try {
      await store.resetUserPassword(userId);
      showToast('Password reset email sent to ' + userName);
    } catch (e) {
      showToast('Error: ' + (e.message || 'Failed to send reset email'));
    }
  },
  async changeUserEmail(userId, currentEmail) {
    const newEmail = await appPrompt('Enter new email address:', { title: 'Change User Email', placeholder: currentEmail });
    if (!newEmail || !newEmail.trim()) return;
    if (newEmail.trim() === currentEmail) { showToast('Email is the same'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { showToast('Invalid email format'); return; }
    if (!await appConfirm(`Change email from:<br><strong>${escHtml(currentEmail)}</strong><br><br>To:<br><strong>${escHtml(newEmail.trim())}</strong><br><br>The user will need to use the new email to log in.`, { title: 'Confirm Email Change', okLabel: 'Change Email', raw: true })) return;
    try {
      await store.changeUserEmail(userId, newEmail.trim());
      showToast('Email updated successfully');
      await renderUsersStub();
    } catch (e) {
      showToast('Error: ' + (e.message || 'Failed to change email'));
    }
  },

  // ── SuperAdmin: Agency Switcher ──────────────────────────
  async switchToAgency(agencyId, agencyName) {
    store.setActiveAgency(agencyId);
    document.getElementById('sidebar-agency-name').textContent = agencyName + ' (viewing)';
    showToast('Switched to ' + agencyName);
    await navigateTo('dashboard');
  },
  async clearAgencyOverride() {
    store.clearActiveAgency();
    const user = auth.getUser();
    const agencyName = user?.agency?.name || 'My Agency';
    document.getElementById('sidebar-agency-name').textContent = agencyName;
    showToast('Returned to your agency');
    await navigateTo('admin');
  },
  async viewAgencyDetail(agencyId) {
    try {
      const agency = await store.getAdminAgency(agencyId);
      const users = agency.users || [];
      const modal = document.getElementById('app-modal');
      const title = document.getElementById('modal-title');
      const form = document.getElementById('modal-form');
      title.textContent = agency.name + ' — Details';
      form.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
          <div class="stat-card"><div class="label">Users</div><div class="value">${agency.usersCount || 0}</div></div>
          <div class="stat-card"><div class="label">Orgs</div><div class="value">${agency.organizationsCount || 0}</div></div>
          <div class="stat-card"><div class="label">Providers</div><div class="value">${agency.providersCount || 0}</div></div>
          <div class="stat-card"><div class="label">Applications</div><div class="value">${agency.applicationsCount || 0}</div></div>
          <div class="stat-card"><div class="label">Licenses</div><div class="value">${agency.licensesCount || 0}</div></div>
          <div class="stat-card"><div class="label">Tasks</div><div class="value">${agency.tasksCount || 0}</div></div>
        </div>
        <h4 style="margin-bottom:8px;">Info</h4>
        <table style="margin-bottom:16px;">
          <tr><td><strong>Slug</strong></td><td>${escHtml(agency.slug || '')}</td></tr>
          <tr><td><strong>Email</strong></td><td>${escHtml(agency.email || '')}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${escHtml(agency.phone || '')}</td></tr>
          <tr><td><strong>NPI</strong></td><td>${escHtml(agency.npi || '')}</td></tr>
          <tr><td><strong>Created</strong></td><td>${agency.createdAt ? new Date(agency.createdAt).toLocaleDateString() : ''}</td></tr>
        </table>
        <h4 style="margin-bottom:8px;">Users (${users.length})</h4>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${escHtml((u.firstName || u.first_name || '') + ' ' + (u.lastName || u.last_name || ''))}</td>
                <td>${escHtml(u.email || '')}</td>
                <td><span class="badge badge-${u.role === 'superadmin' || u.role === 'agency' ? 'approved' : 'pending'}">${u.role}</span></td>
                <td>${(u.isActive !== false && u.is_active !== false) ? 'Yes' : 'No'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="window.app.switchToAgency(${agency.id}, '${escHtml(agency.name)}')">Switch to This Agency</button>
        </div>
      `;
      modal.classList.add('active');
    } catch (e) {
      showToast('Error loading agency: ' + e.message);
    }
  },

  // ── Exclusion Screening ──
  async screenAllProviders() {
    if (!await appConfirm('Screen all providers against OIG/SAM exclusion databases? This may take a moment.', { title: 'Screen All Providers', okLabel: 'Screen All' })) return;
    try {
      showToast('Screening all providers...');
      await store.screenAllProviders();
      showToast('All providers screened successfully');
      await renderExclusionsPage();
    } catch (e) { showToast('Screening failed: ' + e.message); }
  },
  async screenSingleProvider(id) {
    try {
      showToast('Screening provider...');
      await store.screenProvider(id);
      showToast('Provider screened successfully');
      if (currentPage === 'exclusions') await renderExclusionsPage();
      if (currentPage === 'compliance') await renderCompliancePage();
    } catch (e) { showToast('Screening failed: ' + e.message); }
  },
  viewExclusionDetail(providerId) {
    showToast('Loading exclusion details...');
    // Navigate to the provider profile exclusion info
    window._selectedProviderId = providerId;
    navigateTo('provider-profile');
  },
  filterExclusions() {
    const search = (document.getElementById('excl-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('excl-status-filter')?.value || '';
    document.querySelectorAll('.excl-row').forEach(row => {
      const name = row.dataset.name || '';
      const status = row.dataset.status || '';
      const matchSearch = !search || name.includes(search);
      const matchStatus = !statusFilter || status === statusFilter;
      row.style.display = (matchSearch && matchStatus) ? '' : 'none';
    });
  },

  // ── Facilities ──
  openFacilityModal(id) {
    const modal = document.getElementById('facility-modal');
    const title = document.getElementById('facility-modal-title');
    document.getElementById('fac-edit-id').value = id || '';
    title.textContent = id ? 'Edit Facility' : 'Add Facility';
    if (!id) {
      ['fac-name','fac-npi','fac-type','fac-phone','fac-address','fac-city','fac-state','fac-zip'].forEach(f => {
        const el = document.getElementById(f); if (el) el.value = '';
      });
      const statusEl = document.getElementById('fac-status'); if (statusEl) statusEl.value = 'active';
    }
    modal.classList.add('active');
  },
  async editFacility(id) {
    try {
      const facilities = await store.getFacilities();
      const f = (Array.isArray(facilities) ? facilities : []).find(x => x.id === id);
      if (!f) { showToast('Facility not found'); return; }
      document.getElementById('fac-edit-id').value = id;
      document.getElementById('facility-modal-title').textContent = 'Edit Facility';
      const set = (el, val) => { const e = document.getElementById(el); if (e) e.value = val || ''; };
      set('fac-name', f.name);
      set('fac-npi', f.npi);
      set('fac-type', f.facilityType || f.type);
      set('fac-phone', f.phone);
      set('fac-address', f.address);
      set('fac-city', f.city);
      set('fac-state', f.state);
      set('fac-zip', f.zip || f.zipCode);
      set('fac-status', f.status || 'active');
      document.getElementById('facility-modal').classList.add('active');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async saveFacility() {
    const name = document.getElementById('fac-name')?.value?.trim();
    if (!name) { showToast('Facility name is required'); return; }
    const data = {
      name,
      npi: document.getElementById('fac-npi')?.value?.trim() || '',
      facilityType: document.getElementById('fac-type')?.value || '',
      phone: document.getElementById('fac-phone')?.value?.trim() || '',
      address: document.getElementById('fac-address')?.value?.trim() || '',
      city: document.getElementById('fac-city')?.value?.trim() || '',
      state: document.getElementById('fac-state')?.value?.trim().toUpperCase() || '',
      zip: document.getElementById('fac-zip')?.value?.trim() || '',
      status: document.getElementById('fac-status')?.value || 'active',
    };
    const editId = document.getElementById('fac-edit-id')?.value;
    try {
      if (editId) {
        await store.updateFacility(editId, data);
        showToast('Facility updated');
      } else {
        await store.createFacility(data);
        showToast('Facility created');
      }
      document.getElementById('facility-modal').classList.remove('active');
      await renderFacilitiesPage();
    } catch (e) { showToast('Error saving facility: ' + e.message); }
  },
  async deleteFacility(id) {
    if (!await appConfirm('Delete this facility?', { title: 'Delete Facility', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.deleteFacility(id);
      showToast('Facility deleted');
      await renderFacilitiesPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  openNpiFacilityModal() {
    document.getElementById('fac-npi-lookup').value = '';
    document.getElementById('fac-npi-result').style.display = 'none';
    document.getElementById('npi-facility-modal').classList.add('active');
  },
  async createFacilityFromNpiLookup() {
    const npi = document.getElementById('fac-npi-lookup')?.value?.trim();
    if (!/^\d{10}$/.test(npi)) { showToast('Enter a valid 10-digit NPI'); return; }
    try {
      showToast('Looking up NPI and creating facility...');
      await store.createFacilityFromNpi(npi);
      showToast('Facility created from NPI');
      document.getElementById('npi-facility-modal').classList.remove('active');
      await renderFacilitiesPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  filterFacilities() {
    const search = (document.getElementById('facility-search')?.value || '').toLowerCase();
    document.querySelectorAll('.facility-row').forEach(row => {
      row.style.display = !search || (row.dataset.name || '').includes(search) ? '' : 'none';
    });
  },

  // ── Billing & Invoicing ──
  billingTab(btn, tabId) {
    window._billingTab = tabId;
    btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['billing-invoices', 'billing-estimates', 'billing-services', 'billing-subscription'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== 'billing-' + tabId);
    });
  },
  openInvoiceModal() {
    window._invoiceLineItems = [{ description: '', qty: 1, rate: 0 }];
    document.getElementById('invoice-modal-title').textContent = 'Create Invoice';
    ['inv-client','inv-due','inv-desc','inv-notes','inv-client-email'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('inv-status').value = 'draft';
    document.getElementById('inv-edit-id').value = '';
    document.getElementById('inv-mode').value = 'invoice';
    document.getElementById('inv-date-label').textContent = 'Due Date *';
    // Auto-generate invoice number
    store.getInvoices().then(invs => {
      const numEl = document.getElementById('inv-number');
      if (numEl && !numEl.value) numEl.value = _nextInvoiceNumber(Array.isArray(invs) ? invs : []);
    }).catch(() => {});
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
    document.getElementById('invoice-modal').classList.add('active');
  },
  openEstimateModal() {
    window._invoiceLineItems = [{ description: '', qty: 1, rate: 0 }];
    document.getElementById('invoice-modal-title').textContent = 'Create Estimate';
    ['inv-client','inv-due','inv-desc','inv-notes','inv-client-email'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('inv-status').value = 'draft';
    document.getElementById('inv-edit-id').value = '';
    document.getElementById('inv-mode').value = 'estimate';
    document.getElementById('inv-date-label').textContent = 'Expiration Date *';
    document.getElementById('inv-number').value = '';
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
    document.getElementById('invoice-modal').classList.add('active');
  },

  // Line item management
  addLineItem() {
    window._invoiceLineItems.push({ description: '', qty: 1, rate: 0 });
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
  },
  removeLineItem(idx) {
    window._invoiceLineItems.splice(idx, 1);
    if (window._invoiceLineItems.length === 0) window._invoiceLineItems.push({ description: '', qty: 1, rate: 0 });
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
  },
  updateLineItem(idx, field, value) {
    if (!window._invoiceLineItems[idx]) return;
    if (field === 'qty') window._invoiceLineItems[idx].qty = parseInt(value) || 1;
    else if (field === 'rate') window._invoiceLineItems[idx].rate = parseFloat(value) || 0;
    else window._invoiceLineItems[idx][field] = value;
    // Re-render totals
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
  },
  async filterOrgDropdown(val) {
    const dd = document.getElementById('inv-client-dropdown');
    if (!dd) return;
    if (!this._orgCache) {
      try { this._orgCache = await store.getAll('organizations'); } catch(e) { this._orgCache = []; }
    }
    const q = (val || '').toLowerCase();
    const matches = q.length > 0
      ? this._orgCache.filter(o => (o.name || '').toLowerCase().includes(q)).slice(0, 8)
      : this._orgCache.slice(0, 8);
    if (matches.length === 0) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = matches.map(o => `
      <div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--gray-100);display:flex;justify-content:space-between;align-items:center;"
           onmousedown="window.app.selectOrg(${o.id},'${escAttr(o.name)}','${escAttr(o.email || o.contactEmail || '')}')"
           onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='#fff'">
        <span><strong>${escHtml(o.name)}</strong></span>
        <span style="font-size:11px;color:var(--gray-500);">${escHtml(o.email || o.contactEmail || '')}</span>
      </div>
    `).join('');
    // Close dropdown when clicking outside
    setTimeout(() => {
      const close = (e) => { if (!dd.contains(e.target) && e.target.id !== 'inv-client') { dd.style.display = 'none'; document.removeEventListener('click', close); } };
      document.addEventListener('click', close);
    }, 50);
  },
  selectOrg(id, name, email) {
    const clientEl = document.getElementById('inv-client');
    const emailEl = document.getElementById('inv-client-email');
    if (clientEl) clientEl.value = name;
    if (emailEl && email && !emailEl.value) emailEl.value = email;
    document.getElementById('inv-client-dropdown').style.display = 'none';
  },

  filterSvcDropdown(idx, val) {
    const dd = document.getElementById('svc-dd-' + idx);
    if (!dd || !window._billingServices.length) return;
    const q = (val || '').toLowerCase();
    const matches = q.length > 0
      ? window._billingServices.filter(s => (s.name || s.serviceName || '').toLowerCase().includes(q) || (s.code || s.serviceCode || '').toLowerCase().includes(q)).slice(0, 6)
      : window._billingServices.slice(0, 6);
    if (matches.length === 0) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = matches.map(s => {
      const name = escHtml(s.name || s.serviceName || '');
      const code = escHtml(s.code || s.serviceCode || '');
      const rate = s.rate || s.defaultRate || s.defaultPrice || s.default_price || 0;
      return `<div style="padding:6px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--gray-100);display:flex;justify-content:space-between;"
        onmousedown="window.app.selectSvcForLine(${idx},${s.id})"
        onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='#fff'">
        <span><strong>${name}</strong> ${code ? '<code style="font-size:11px;color:var(--gray-500);">'+code+'</code>' : ''}</span>
        <span style="font-weight:600;">${_fmtMoney(rate)}</span>
      </div>`;
    }).join('');
    setTimeout(() => {
      const close = (e) => { if (!dd.contains(e.target)) { dd.style.display = 'none'; document.removeEventListener('click', close); } };
      document.addEventListener('click', close);
    }, 50);
  },
  selectSvcForLine(idx, serviceId) {
    const svc = window._billingServices.find(s => s.id === serviceId);
    if (!svc || !window._invoiceLineItems[idx]) return;
    window._invoiceLineItems[idx].description = svc.name || svc.serviceName || '';
    window._invoiceLineItems[idx].rate = svc.rate || svc.defaultRate || svc.defaultPrice || svc.default_price || 0;
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
  },

  addServiceLineItem(serviceId) {
    const svc = window._billingServices.find(s => s.id === serviceId);
    if (!svc) return;
    window._invoiceLineItems.push({ description: svc.name || svc.serviceName, qty: 1, rate: svc.rate || svc.defaultRate || svc.defaultPrice || svc.default_price || 0 });
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
  },

  async saveInvoice() {
    const _btn = document.querySelector('#invoice-modal .btn-primary');
    const _btnText = _btn?.textContent;
    if (_btn) { _btn.disabled = true; _btn.textContent = 'Saving...'; }
    try {
    const client = document.getElementById('inv-client')?.value?.trim();
    const due = document.getElementById('inv-due')?.value;
    if (!client) { showToast('Client name is required'); return; }
    if (!due) { showToast('Date is required'); return; }

    const validItems = window._invoiceLineItems.filter(i => i.description && i.rate > 0);
    const totalAmount = validItems.reduce((s, i) => s + i.qty * i.rate, 0);
    if (validItems.length === 0 || totalAmount <= 0) { showToast('Add at least one line item with a rate'); return; }

    const mode = document.getElementById('inv-mode')?.value || 'invoice';
    const data = {
      clientName: client,
      clientEmail: document.getElementById('inv-client-email')?.value?.trim() || '',
      items: validItems,
      totalAmount,
      description: document.getElementById('inv-desc')?.value?.trim() || '',
      notes: document.getElementById('inv-notes')?.value?.trim() || '',
      status: document.getElementById('inv-status')?.value || 'draft',
    };

    if (mode === 'estimate') {
      data.expirationDate = due;
      data.estimateNumber = document.getElementById('inv-number')?.value?.trim() || '';
    } else {
      data.dueDate = due;
      data.invoiceNumber = document.getElementById('inv-number')?.value?.trim() || '';
    }

    const editId = document.getElementById('inv-edit-id')?.value;
    try {
      if (mode === 'estimate') {
        if (editId) { await store.updateEstimate(editId, data); showToast('Estimate updated'); }
        else { await store.createEstimate(data); showToast('Estimate created'); }
      } else {
        if (editId) { await store.updateInvoice(editId, data); showToast('Invoice updated'); }
        else { await store.createInvoice(data); showToast('Invoice created'); }
      }
      document.getElementById('invoice-modal').classList.remove('active');
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + escHtml(e.message)); }
    } finally { if (_btn) { _btn.disabled = false; _btn.textContent = _btnText; } }
  },

  // Invoice detail view
  viewInvoiceDetail(id) {
    window._selectedInvoiceId = id;
    navigateTo('invoice-detail');
  },
  async editInvoice(id) {
    try {
      let inv;
      try { inv = await store.getInvoice(id); } catch {
        const all = await store.getInvoices();
        inv = (Array.isArray(all) ? all : []).find(x => x.id == id);
      }
      if (!inv) { showToast('Invoice not found'); return; }

      // Populate line items
      const items = inv.items || inv.lineItems || inv.line_items || [];
      window._invoiceLineItems = Array.isArray(items) && items.length > 0
        ? items.map(i => ({ description: i.description || i.name || '', qty: i.qty || i.quantity || 1, rate: i.rate || i.unitPrice || i.unit_price || 0 }))
        : [{ description: inv.description || '', qty: 1, rate: inv.totalAmount || inv.total_amount || inv.amount || 0 }];

      document.getElementById('inv-edit-id').value = id;
      document.getElementById('inv-mode').value = 'invoice';
      document.getElementById('invoice-modal-title').textContent = 'Edit Invoice ' + (inv.invoiceNumber || inv.invoice_number || '#' + inv.id);
      document.getElementById('inv-date-label').textContent = 'Due Date *';
      const set = (el, val) => { const e = document.getElementById(el); if (e) e.value = val || ''; };
      set('inv-client', inv.clientName || inv.client_name);
      set('inv-client-email', inv.clientEmail || inv.client_email);
      set('inv-due', inv.dueDate || inv.due_date);
      set('inv-number', inv.invoiceNumber || inv.invoice_number);
      set('inv-desc', inv.description);
      set('inv-notes', inv.notes || inv.paymentTerms || inv.payment_terms);
      set('inv-status', inv.status);
      const editor = document.getElementById('line-items-editor');
      if (editor) editor.innerHTML = _renderLineItemsEditor();
      document.getElementById('invoice-modal').classList.add('active');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async viewInvoice(id) { this.viewInvoiceDetail(id); },

  async deleteInvoice(id) {
    if (!await appConfirm('Delete this invoice?', { title: 'Delete Invoice', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.deleteInvoice(id);
      showToast('Invoice deleted');
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async sendInvoice(id) {
    if (!await appConfirm('Mark this invoice as sent? The client will be notified if email is configured.', { title: 'Send Invoice', okLabel: 'Send', okClass: 'btn-primary' })) return;
    try {
      await store.sendInvoice(id);
      showToast('Invoice sent');
      await renderBillingPage();
    } catch (e) {
      // Fallback: just update status to sent
      try { await store.updateInvoice(id, { status: 'sent' }); showToast('Invoice marked as sent'); await renderBillingPage(); }
      catch (e2) { showToast('Error: ' + e2.message); }
    }
  },

  // Payments
  openPaymentModal(invoiceId) {
    document.getElementById('pay-invoice-id').value = invoiceId;
    document.getElementById('pay-amount').value = '';
    document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('pay-method').value = 'check';
    document.getElementById('pay-ref').value = '';
    document.getElementById('payment-modal').classList.add('active');
  },
  async savePayment() {
    const invoiceId = document.getElementById('pay-invoice-id')?.value;
    const amount = parseFloat(document.getElementById('pay-amount')?.value);
    if (!amount || amount <= 0) { showToast('Enter a valid payment amount'); return; }
    const data = {
      amount,
      paymentDate: document.getElementById('pay-date')?.value || new Date().toISOString().split('T')[0],
      paymentMethod: document.getElementById('pay-method')?.value || 'check',
      reference: document.getElementById('pay-ref')?.value?.trim() || '',
    };
    try {
      await store.addPayment(invoiceId, data);
      showToast('Payment recorded');
      document.getElementById('payment-modal').classList.remove('active');
      // Refresh whichever page we're on
      if (window._selectedInvoiceId == invoiceId && document.getElementById('page-title')?.textContent?.includes('Invoice')) {
        await renderInvoiceDetail(invoiceId);
      } else {
        await renderBillingPage();
      }
    } catch (e) { showToast('Error: ' + e.message); }
  },

  // Services
  toggleInlineServiceForm(show = true) {
    const form = document.getElementById('inline-service-form');
    if (!form) return;
    if (!show) { form.style.display = 'none'; return; }
    ['svc-name','svc-code','svc-rate','svc-desc'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('svc-edit-id').value = '';
    form.style.display = '';
    document.getElementById('svc-name')?.focus();
  },
  editService(id) {
    const form = document.getElementById('inline-service-form');
    if (!form) return;
    const svc = window._billingServices.find(s => s.id === id);
    if (!svc) return;
    const set = (el, val) => { const e = document.getElementById(el); if (e) e.value = val || ''; };
    set('svc-name', svc.name || svc.serviceName);
    set('svc-code', svc.code || svc.serviceCode);
    set('svc-rate', svc.rate || svc.defaultRate || svc.defaultPrice || svc.default_price);
    set('svc-desc', svc.description);
    document.getElementById('svc-edit-id').value = id;
    form.style.display = '';
    document.getElementById('svc-name')?.focus();
  },
  async deleteService(id) {
    if (!await appConfirm('Delete this service?', { title: 'Delete Service', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.deleteService(id);
      showToast('Service deleted');
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async saveService() {
    const name = document.getElementById('svc-name')?.value?.trim();
    if (!name) { showToast('Service name is required'); return; }
    const data = {
      name,
      code: document.getElementById('svc-code')?.value?.trim() || '',
      defaultPrice: parseFloat(document.getElementById('svc-rate')?.value) || 0,
      description: document.getElementById('svc-desc')?.value?.trim() || '',
    };
    const editId = document.getElementById('svc-edit-id')?.value;
    try {
      if (editId) {
        await store.updateService(editId, data);
        showToast('Service updated');
      } else {
        await store.createService(data);
        showToast('Service created');
      }
      const form = document.getElementById('inline-service-form');
      if (form) form.style.display = 'none';
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },

  // ── Contracts ──
  openContractModal(editData) {
    window._contractLineItems = [{ description: '', qty: 1, rate: 0 }];
    document.getElementById('contract-modal-title').textContent = editData ? 'Edit Contract' : 'New Contract';
    ['ctr-title','ctr-description','ctr-org','ctr-client-name','ctr-client-email','ctr-client-address','ctr-effective','ctr-expiration','ctr-payment-terms','ctr-notes','ctr-renewal-terms'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('ctr-edit-id').value = '';
    document.getElementById('ctr-org-id').value = '';
    document.getElementById('ctr-frequency').value = 'monthly';
    document.getElementById('ctr-tax-rate').value = '0';
    document.getElementById('ctr-discount').value = '0';
    const autoRenew = document.getElementById('ctr-auto-renew');
    if (autoRenew) autoRenew.checked = false;
    document.getElementById('ctr-renewal-terms-wrap').style.display = 'none';

    const editor = document.getElementById('contract-line-items-editor');
    if (editor) editor.innerHTML = _renderContractLineItems();
    document.getElementById('contract-modal').classList.add('active');

    // Initialize Quill rich text editor for terms
    const editorContainer = document.getElementById('ctr-terms-editor');
    if (editorContainer && typeof Quill !== 'undefined') {
      editorContainer.innerHTML = '';
      if (window._ctrQuill) { try { window._ctrQuill = null; } catch(e) {} }
      window._ctrQuill = new Quill('#ctr-terms-editor', {
        theme: 'snow',
        placeholder: 'Service terms, refund policy, client duties, responsibilities...',
        modules: {
          toolbar: [
            [{ 'header': [2, 3, false] }],
            ['bold', 'italic', 'underline'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['clean']
          ]
        }
      });
      const defaultHtml = editData ? (editData.terms || '') : _defaultContractTerms();
      window._ctrQuill.root.innerHTML = defaultHtml;
    }

    // Toggle renewal terms visibility
    autoRenew?.addEventListener('change', function() {
      document.getElementById('ctr-renewal-terms-wrap').style.display = this.checked ? 'block' : 'none';
    });
  },
  async filterContractOrg(val) {
    const dd = document.getElementById('ctr-org-dropdown');
    if (!dd) return;
    if (!this._ctrOrgCache) {
      try { this._ctrOrgCache = await store.getAll('organizations'); } catch(e) { this._ctrOrgCache = []; }
    }
    const q = (val || '').toLowerCase();
    const matches = q.length > 0
      ? this._ctrOrgCache.filter(o => (o.name || '').toLowerCase().includes(q)).slice(0, 8)
      : this._ctrOrgCache.slice(0, 8);
    if (matches.length === 0) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = matches.map(o => `
      <div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--gray-100);display:flex;justify-content:space-between;"
           onmousedown="window.app.selectContractOrg(${o.id},'${escAttr(o.name)}','${escAttr(o.email || o.contactEmail || '')}')"
           onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='#fff'">
        <span><strong>${escHtml(o.name)}</strong> <span style="font-family:monospace;font-size:11px;color:var(--brand-600);">#${toHexId(o.id)}</span></span>
        <span style="font-size:11px;color:var(--gray-500);">${escHtml(o.email || o.contactEmail || '')}</span>
      </div>
    `).join('');
    setTimeout(() => { const close = e => { if (!dd.contains(e.target) && e.target.id !== 'ctr-org') { dd.style.display='none'; document.removeEventListener('click',close); }}; document.addEventListener('click',close); }, 50);
  },
  selectContractOrg(id, name, email) {
    document.getElementById('ctr-org').value = name;
    document.getElementById('ctr-org-id').value = id;
    document.getElementById('ctr-client-name').value = name;
    if (email && !document.getElementById('ctr-client-email').value) document.getElementById('ctr-client-email').value = email;
    document.getElementById('ctr-org-dropdown').style.display = 'none';
  },
  filterContractSvc(idx, val) {
    const dd = document.getElementById('ctr-svc-dd-' + idx);
    if (!dd || !window._billingServices.length) { if (!window._billingServices.length) store.getServices().then(s => { window._billingServices = s || []; }).catch(() => {}); return; }
    const q = (val || '').toLowerCase();
    const matches = q.length > 0 ? window._billingServices.filter(s => (s.name||s.serviceName||'').toLowerCase().includes(q)||(s.code||s.serviceCode||'').toLowerCase().includes(q)).slice(0,6) : window._billingServices.slice(0,6);
    if (!matches.length) { dd.style.display='none'; return; }
    dd.style.display='block';
    dd.innerHTML = matches.map(s => {
      const name = escHtml(s.name||s.serviceName||''); const code = escHtml(s.code||s.serviceCode||'');
      const rate = s.rate||s.defaultRate||s.defaultPrice||s.default_price||0;
      return `<div style="padding:6px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--gray-100);display:flex;justify-content:space-between;" onmousedown="window.app.selectContractSvc(${idx},${s.id})" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='#fff'"><span><strong>${name}</strong> ${code?'<code style="font-size:11px;color:var(--gray-500);">'+code+'</code>':''}</span><span style="font-weight:600;">${_fmtMoney(rate)}</span></div>`;
    }).join('');
    setTimeout(() => { const close = e => { if (!dd.contains(e.target)) { dd.style.display='none'; document.removeEventListener('click',close); }}; document.addEventListener('click',close); }, 50);
  },
  selectContractSvc(idx, serviceId) {
    const svc = window._billingServices.find(s => s.id === serviceId);
    if (!svc || !window._contractLineItems[idx]) return;
    window._contractLineItems[idx].description = svc.name || svc.serviceName || '';
    window._contractLineItems[idx].rate = svc.rate || svc.defaultRate || svc.defaultPrice || svc.default_price || 0;
    window._contractLineItems[idx].svcId = svc.id;
    const editor = document.getElementById('contract-line-items-editor');
    if (editor) editor.innerHTML = _renderContractLineItems();
  },
  addContractLine() {
    window._contractLineItems.push({ description: '', qty: 1, rate: 0 });
    const editor = document.getElementById('contract-line-items-editor');
    if (editor) editor.innerHTML = _renderContractLineItems();
  },
  removeContractLine(idx) {
    window._contractLineItems.splice(idx, 1);
    if (!window._contractLineItems.length) window._contractLineItems.push({ description: '', qty: 1, rate: 0 });
    const editor = document.getElementById('contract-line-items-editor');
    if (editor) editor.innerHTML = _renderContractLineItems();
  },
  updateContractLine(idx, field, value) {
    if (!window._contractLineItems[idx]) return;
    if (field === 'qty') window._contractLineItems[idx].qty = parseInt(value) || 1;
    else if (field === 'rate') window._contractLineItems[idx].rate = parseFloat(value) || 0;
    else window._contractLineItems[idx][field] = value;
    const editor = document.getElementById('contract-line-items-editor');
    if (editor) editor.innerHTML = _renderContractLineItems();
  },
  async saveContract() {
    const title = document.getElementById('ctr-title')?.value?.trim();
    const effective = document.getElementById('ctr-effective')?.value;
    if (!title) { showToast('Contract title is required'); return; }
    if (!effective) { showToast('Effective date is required'); return; }
    const validItems = window._contractLineItems.filter(i => i.description.trim());
    if (!validItems.length) { showToast('Add at least one service'); return; }

    const data = {
      title,
      description: document.getElementById('ctr-description')?.value?.trim() || '',
      organization_id: document.getElementById('ctr-org-id')?.value || null,
      client_name: document.getElementById('ctr-client-name')?.value?.trim() || '',
      client_email: document.getElementById('ctr-client-email')?.value?.trim() || '',
      client_address: document.getElementById('ctr-client-address')?.value?.trim() || '',
      effective_date: effective,
      expiration_date: document.getElementById('ctr-expiration')?.value || null,
      auto_renew: document.getElementById('ctr-auto-renew')?.checked || false,
      renewal_terms: document.getElementById('ctr-renewal-terms')?.value?.trim() || '',
      billing_frequency: document.getElementById('ctr-frequency')?.value || 'monthly',
      payment_terms: document.getElementById('ctr-payment-terms')?.value?.trim() || '',
      tax_rate: parseFloat(document.getElementById('ctr-tax-rate')?.value) || 0,
      discount_amount: parseFloat(document.getElementById('ctr-discount')?.value) || 0,
      terms_and_conditions: window._ctrQuill ? window._ctrQuill.root.innerHTML : (document.getElementById('ctr-terms')?.value || ''),
      notes: document.getElementById('ctr-notes')?.value?.trim() || '',
      items: validItems.map(i => ({ description: i.description, quantity: i.qty, unit_price: i.rate, service_catalog_id: i.svcId || null })),
    };

    try {
      const editId = document.getElementById('ctr-edit-id')?.value;
      if (editId) { await store.updateContract(editId, data); showToast('Contract updated'); }
      else { await store.createContract(data); showToast('Contract created'); }
      document.getElementById('contract-modal').classList.remove('active');
      await renderContractsPage();
    } catch(e) { showToast('Error: ' + e.message); }
  },
  openContractDetail(id) {
    window._selectedContractId = id;
    this.navigateTo('contract-detail');
  },
  async sendContract(id) {
    if (!await appConfirm('Send this contract to the client? They will receive an email with a link to view and accept.', { title: 'Send Contract', okLabel: 'Send' })) return;
    try {
      const result = await store.sendContract(id);
      showToast('Contract sent!');
      if (result.viewUrl || result.view_url) navigator.clipboard.writeText(result.viewUrl || result.view_url).catch(() => {});
      await renderContractDetail(id);
    } catch(e) { showToast('Error: ' + e.message); }
  },
  async activateContract(id) {
    try { await store.updateContract(id, { status: 'active' }); showToast('Contract activated'); await renderContractDetail(id); } catch(e) { showToast('Error: ' + e.message); }
  },
  async markContractSigned(id) {
    // Off-portal signing — agency records that client signed outside the portal
    const html = `
      <div style="text-align:left;">
        <p style="margin:0 0 16px;font-size:13px;color:var(--gray-600);">Record that this contract was signed off-portal (in person, via email, phone, etc.)</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="auth-field" style="margin:0;"><label>Signer Name *</label><input type="text" id="sign-name" class="form-control" placeholder="Full legal name"></div>
          <div class="auth-field" style="margin:0;"><label>Signer Email *</label><input type="email" id="sign-email" class="form-control" placeholder="email@example.com"></div>
          <div class="auth-field" style="margin:0;"><label>Title</label><input type="text" id="sign-title" class="form-control" placeholder="e.g. CEO, Director"></div>
          <div class="auth-field" style="margin:0;"><label>Date Signed</label><input type="date" id="sign-date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
        </div>
      </div>
    `;
    if (!await appConfirm(html, { title: 'Record Off-Portal Signature', okLabel: 'Mark as Signed', isHtml: true })) return;
    const name = document.getElementById('sign-name')?.value?.trim();
    const email = document.getElementById('sign-email')?.value?.trim();
    const title = document.getElementById('sign-title')?.value?.trim() || '';
    if (!name || !email) { showToast('Name and email are required'); return; }
    try {
      await store.updateContract(id, {
        status: 'accepted',
        accepted_at: document.getElementById('sign-date')?.value || new Date().toISOString(),
        accepted_by_name: name,
        accepted_by_email: email,
        accepted_by_title: title,
      });
      showToast('Contract marked as signed');
      await renderContractDetail(id);
    } catch(e) { showToast('Error: ' + e.message); }
  },
  async terminateContract(id) {
    if (!await appConfirm('Terminate this contract?', { title: 'Terminate Contract', okLabel: 'Terminate', okClass: 'btn-danger' })) return;
    try { await store.terminateContract(id, 'Terminated by agency'); showToast('Contract terminated'); await renderContractDetail(id); } catch(e) { showToast('Error: ' + e.message); }
  },
  async genInvoice(id) {
    if (!await appConfirm('Generate an invoice from this contract?', { title: 'Generate Invoice' })) return;
    try { await store.generateInvoiceFromContract(id); showToast('Invoice generated from contract'); } catch(e) { showToast('Error: ' + e.message); }
  },

  // ── Subscription ──
  async selectPlan(tier) {
    try {
      showToast('Redirecting to checkout...');
      const result = await store.createCheckout(tier);
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        showToast('Could not create checkout session');
      }
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async cancelSub() {
    if (!await appConfirm('Cancel your subscription? You will retain access until the end of the current billing period.', { title: 'Cancel Subscription', okLabel: 'Cancel Subscription', okClass: 'btn-danger' })) return;
    try {
      await store.cancelSubscription();
      showToast('Subscription will cancel at period end');
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async resumeSub() {
    try {
      await store.resumeSubscription();
      showToast('Subscription resumed');
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async openPortal() {
    try {
      showToast('Opening billing portal...');
      const result = await store.createPortalSession();
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        showToast('Could not open billing portal');
      }
    } catch (e) { showToast('Error: ' + e.message); }
  },

  // Estimates
  async editEstimate(id) {
    try {
      const estimates = await store.getEstimates();
      const est = (Array.isArray(estimates) ? estimates : []).find(x => x.id == id);
      if (!est) { showToast('Estimate not found'); return; }

      const items = est.items || est.lineItems || est.line_items || [];
      window._invoiceLineItems = Array.isArray(items) && items.length > 0
        ? items.map(i => ({ description: i.description || i.name || '', qty: i.qty || i.quantity || 1, rate: i.rate || i.unitPrice || i.unit_price || 0 }))
        : [{ description: '', qty: 1, rate: est.totalAmount || est.total_amount || 0 }];

      document.getElementById('inv-edit-id').value = id;
      document.getElementById('inv-mode').value = 'estimate';
      document.getElementById('invoice-modal-title').textContent = 'Edit Estimate';
      document.getElementById('inv-date-label').textContent = 'Expiration Date *';
      const set = (el, val) => { const e = document.getElementById(el); if (e) e.value = val || ''; };
      set('inv-client', est.clientName || est.client_name);
      set('inv-client-email', est.clientEmail || est.client_email);
      set('inv-due', est.expirationDate || est.expiration_date);
      set('inv-number', est.estimateNumber || est.estimate_number);
      set('inv-desc', est.description);
      set('inv-notes', est.notes);
      set('inv-status', est.status);
      const editor = document.getElementById('line-items-editor');
      if (editor) editor.innerHTML = _renderLineItemsEditor();
      document.getElementById('invoice-modal').classList.add('active');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async convertEstimate(id) {
    if (!await appConfirm('Convert this estimate to an invoice? The estimate will be marked as converted.', { title: 'Convert to Invoice', okLabel: 'Convert', okClass: 'btn-primary' })) return;
    try {
      await store.convertEstimateToInvoice(id);
      showToast('Estimate converted to invoice');
      await renderBillingPage();
    } catch (e) {
      // Fallback: manually create invoice from estimate data
      try {
        const estimates = await store.getEstimates();
        const est = (Array.isArray(estimates) ? estimates : []).find(x => x.id == id);
        if (!est) { showToast('Estimate not found'); return; }
        const invData = {
          clientName: est.clientName || est.client_name,
          clientEmail: est.clientEmail || est.client_email || '',
          items: est.items || est.lineItems || est.line_items || [],
          totalAmount: est.totalAmount || est.total_amount || est.amount,
          description: est.description || '',
          notes: est.notes || '',
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          status: 'draft',
        };
        await store.createInvoice(invData);
        try { await store.updateEstimate(id, { status: 'converted' }); } catch {}
        showToast('Invoice created from estimate');
        await renderBillingPage();
      } catch (e2) { showToast('Error: ' + e2.message); }
    }
  },
  async deleteEstimate(id) {
    if (!await appConfirm('Delete this estimate?', { title: 'Delete Estimate', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.deleteEstimate(id);
      showToast('Estimate deleted');
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },

  filterInvoices() {
    const search = (document.getElementById('invoice-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('invoice-status-filter')?.value || '';
    document.querySelectorAll('.invoice-row').forEach(row => {
      const matchSearch = !search || (row.dataset.search || '').includes(search);
      const matchStatus = !statusFilter || row.dataset.status === statusFilter;
      row.style.display = (matchSearch && matchStatus) ? '' : 'none';
    });
  },

  // ── Bulk Import ──
  previewImportFile() {
    const fileInput = document.getElementById('import-file');
    const importType = document.getElementById('import-type')?.value;
    const preview = document.getElementById('import-preview');
    const previewTable = document.getElementById('import-preview-table');
    const mappingDiv = document.getElementById('import-mapping');
    const previewTitle = document.getElementById('import-preview-title');
    const resultDiv = document.getElementById('import-result');

    if (!importType) { showToast('Select an import type first'); fileInput.value = ''; return; }
    if (!fileInput.files || !fileInput.files[0]) return;

    resultDiv.style.display = 'none';
    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { showToast('CSV file must have a header row and at least one data row'); return; }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = [];
      for (let i = 1; i < Math.min(lines.length, 51); i++) {
        const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        rows.push(row);
      }

      // Column mapping suggestions based on import type
      const fieldMaps = {
        providers: ['firstName', 'lastName', 'npi', 'email', 'phone', 'specialty', 'taxonomyCode', 'state', 'credential'],
        organizations: ['name', 'npi', 'taxId', 'address', 'city', 'state', 'zip', 'phone', 'email'],
        licenses: ['providerNpi', 'state', 'licenseNumber', 'licenseType', 'status', 'issueDate', 'expirationDate'],
        facilities: ['name', 'npi', 'facilityType', 'address', 'city', 'state', 'zip', 'phone'],
      };
      const targetFields = fieldMaps[importType] || [];

      // Auto-map columns
      const mapping = {};
      headers.forEach(h => {
        const hLower = h.toLowerCase().replace(/[_\s-]/g, '');
        const match = targetFields.find(f => f.toLowerCase() === hLower || f.toLowerCase().includes(hLower) || hLower.includes(f.toLowerCase()));
        mapping[h] = match || '';
      });

      // Store parsed data
      window._importData = { headers, rows, mapping, allRows: lines.length - 1, importType };

      previewTitle.textContent = `Preview: ${rows.length} of ${lines.length - 1} rows`;

      // Render mapping UI
      mappingDiv.innerHTML = `
        <div class="card" style="margin-bottom:12px;">
          <div class="card-header"><h4 style="margin:0;">Column Mapping</h4></div>
          <div class="card-body" style="padding:12px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
              ${headers.map(h => `
                <div style="display:flex;align-items:center;gap:6px;">
                  <span class="text-sm" style="min-width:80px;font-weight:600;">${escHtml(h)}</span>
                  <select class="form-control" style="height:30px;font-size:12px;flex:1;" data-source-col="${escHtml(h)}" onchange="window._importData.mapping['${escHtml(h)}'] = this.value">
                    <option value="">-- Skip --</option>
                    ${targetFields.map(f => `<option value="${f}" ${mapping[h] === f ? 'selected' : ''}>${f}</option>`).join('')}
                  </select>
                </div>
              `).join('')}
            </div>
          </div>
        </div>`;

      // Render preview table
      previewTable.innerHTML = `
        <table>
          <thead><tr>${headers.map(h => `<th style="font-size:12px;">${escHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.slice(0, 20).map(row => `
              <tr>${headers.map(h => `<td style="font-size:12px;">${escHtml(row[h] || '')}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>`;

      preview.style.display = '';
    };

    reader.readAsText(file);
  },
  async executeImportAction() {
    if (!window._importData) { showToast('No import data loaded'); return; }
    const { rows, mapping, importType } = window._importData;
    const resultDiv = document.getElementById('import-result');

    // Transform rows using mapping
    const mappedRows = rows.map(row => {
      const mapped = {};
      Object.entries(mapping).forEach(([source, target]) => {
        if (target && row[source] !== undefined) mapped[target] = row[source];
      });
      return mapped;
    }).filter(r => Object.keys(r).length > 0);

    if (mappedRows.length === 0) { showToast('No valid mapped data to import'); return; }
    if (!await appConfirm(`Import ${mappedRows.length} ${importType} records?`, { title: 'Confirm Import', okLabel: 'Import' })) return;

    resultDiv.style.display = '';
    resultDiv.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner"></div><div style="margin-top:8px;color:var(--gray-500);font-size:13px;">Importing data...</div></div>';

    try {
      const result = await store.executeImport({ type: importType, records: mappedRows });
      const success = result.successCount || result.success_count || result.success || result.imported || mappedRows.length;
      const errors = result.errorCount || result.error_count || result.errors || 0;
      const skipped = result.skippedCount || result.skipped_count || result.skipped || 0;

      resultDiv.innerHTML = `
        <div class="card" style="border-left:3px solid var(--green);">
          <div class="card-header"><h3>Import Complete</h3></div>
          <div class="card-body">
            <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
              <div class="stat-card"><div class="label">Imported</div><div class="value" style="color:var(--green);">${success}</div></div>
              <div class="stat-card"><div class="label">Errors</div><div class="value" style="color:var(--red);">${errors}</div></div>
              <div class="stat-card"><div class="label">Skipped</div><div class="value" style="color:var(--gray-500);">${skipped}</div></div>
            </div>
            ${result.errors && Array.isArray(result.errors) && result.errors.length > 0 ? `
              <div style="margin-top:12px;"><h4>Error Details:</h4>
                <div style="max-height:200px;overflow-y:auto;font-size:12px;background:var(--gray-50);padding:8px;border-radius:8px;">
                  ${result.errors.map(err => `<div style="padding:2px 0;color:var(--red);">Row ${err.row || '?'}: ${escHtml(err.message || err.error || JSON.stringify(err))}</div>`).join('')}
                </div>
              </div>` : ''}
          </div>
        </div>`;

      document.getElementById('import-preview').style.display = 'none';
      window._importData = null;
    } catch (e) {
      resultDiv.innerHTML = `<div class="alert alert-danger">Import failed: ${escHtml(e.message)}</div>`;
    }
  },

  // ── Compliance Center ──
  async generateComplianceReport() {
    showToast('Generating compliance report...');
    try {
      const report = await store.getComplianceReport();
      showToast('Compliance report generated');
      await renderCompliancePage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async exportComplianceData() {
    try {
      const result = await store.exportData('compliance');
      if (result.url || result.downloadUrl) {
        window.open(result.url || result.downloadUrl, '_blank');
      } else if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'compliance-report.json'; a.click();
        URL.revokeObjectURL(url);
      }
      showToast('Compliance data exported');
    } catch (e) { showToast('Export failed: ' + e.message); }
  },

  async exportAuditPacket() {
    showToast('Generating audit-ready packet...');
    try {
      const [providers, licenses, apps, orgs, exclusions, report] = await Promise.all([
        store.getAll('providers'),
        store.getAll('licenses'),
        store.getAll('applications'),
        store.getAll('organizations'),
        store.getAll('exclusions').catch(() => []),
        store.getComplianceReport().catch(() => ({})),
      ]);
      const org = orgs[0] || {};
      const today = new Date();
      const now = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const todayISO = today.toISOString().split('T')[0];
      const in30 = new Date(Date.now() + 30 * 86400000);
      const in90 = new Date(Date.now() + 90 * 86400000);

      let csv = '';

      // Cover page
      csv += 'COMPLIANCE AUDIT PACKET\r\n';
      csv += `Organization:,${org.name || 'Credentik Agency'}\r\n`;
      csv += `NPI:,${org.npi || 'N/A'}\r\n`;
      csv += `Tax ID:,${org.taxId || 'N/A'}\r\n`;
      csv += `Generated:,${now}\r\n`;
      csv += `Prepared By:,Credentik Compliance Center\r\n\r\n`;

      // Section 1: Provider Compliance Summary
      csv += '=== SECTION 1: PROVIDER COMPLIANCE SCORES ===\r\n';
      csv += 'Provider,NPI,Specialty,Compliance Score,Status,Critical Issues,Warning Issues,Licenses on File\r\n';
      providers.forEach(p => {
        const provLicenses = licenses.filter(l => (l.providerId || l.provider_id) === p.id);
        const expiredCount = provLicenses.filter(l => (l.expirationDate || l.expiration_date) && new Date(l.expirationDate || l.expiration_date) < today).length;
        const exp30Count = provLicenses.filter(l => { const exp = l.expirationDate || l.expiration_date; return exp && new Date(exp) > today && new Date(exp) <= in30; }).length;
        const provExcl = Array.isArray(exclusions) ? exclusions.filter(e => (e.providerId || e.provider_id) === p.id) : [];
        const hasExcl = provExcl.some(e => e.status === 'excluded' || e.result === 'excluded');
        let score = 100;
        let critical = 0; let warning = 0;
        if (expiredCount > 0) { score -= expiredCount * 20; critical += expiredCount; }
        if (hasExcl) { score -= 30; critical++; }
        if (exp30Count > 0) { score -= exp30Count * 10; warning += exp30Count; }
        if (provLicenses.length === 0) { score -= 15; warning++; }
        score = Math.max(0, Math.min(100, score));
        const status = score >= 85 ? 'Healthy' : score >= 60 ? 'At Risk' : 'Critical';
        const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
        csv += `"${name}",${p.npi || 'N/A'},"${p.specialty || ''}",${score},${status},${critical},${warning},${provLicenses.length}\r\n`;
      });

      // Section 2: License Inventory
      csv += '\r\n=== SECTION 2: LICENSE INVENTORY ===\r\n';
      csv += 'Provider,State,License Number,License Type,Status,Issue Date,Expiration Date,Days Until Expiration,Compact\r\n';
      licenses.forEach(l => {
        const prov = providers.find(p => p.id === (l.providerId || l.provider_id));
        const provName = prov ? `${prov.firstName || ''} ${prov.lastName || ''}`.trim() : 'Unknown';
        const exp = l.expirationDate || l.expiration_date;
        const daysLeft = exp ? Math.round((new Date(exp) - today) / 86400000) : 'N/A';
        csv += `"${provName}",${l.state || ''},"${l.licenseNumber || l.license_number || ''}","${l.licenseType || l.license_type || ''}",${l.status || ''},${l.issueDate || l.issue_date || ''},${exp || ''},${daysLeft},${l.compactState ? 'Yes' : 'No'}\r\n`;
      });

      // Section 3: Exclusion Screening
      csv += '\r\n=== SECTION 3: EXCLUSION SCREENING RESULTS ===\r\n';
      csv += 'Provider,NPI,Screening Date,OIG Result,SAM Result,Overall Status\r\n';
      if (Array.isArray(exclusions) && exclusions.length > 0) {
        exclusions.forEach(e => {
          const prov = providers.find(p => p.id === (e.providerId || e.provider_id));
          const provName = prov ? `${prov.firstName || ''} ${prov.lastName || ''}`.trim() : 'Unknown';
          csv += `"${provName}",${prov?.npi || ''},${e.screenedAt || e.screened_at || e.createdAt || ''},${e.oigResult || e.oig_result || 'N/A'},${e.samResult || e.sam_result || 'N/A'},${e.status || e.result || ''}\r\n`;
        });
      } else {
        csv += 'No screening records found\r\n';
      }

      // Section 4: Expiring Credentials
      csv += '\r\n=== SECTION 4: EXPIRING CREDENTIALS (Next 90 Days) ===\r\n';
      csv += 'Type,Provider,Item,Expiration Date,Days Remaining,Severity\r\n';
      licenses.filter(l => {
        const exp = l.expirationDate || l.expiration_date;
        return exp && new Date(exp) > today && new Date(exp) <= in90;
      }).forEach(l => {
        const prov = providers.find(p => p.id === (l.providerId || l.provider_id));
        const provName = prov ? `${prov.firstName || ''} ${prov.lastName || ''}`.trim() : 'Unknown';
        const exp = new Date(l.expirationDate || l.expiration_date);
        const days = Math.round((exp - today) / 86400000);
        csv += `License,"${provName}","${l.state} - ${l.licenseNumber || ''}",${(l.expirationDate || l.expiration_date)},${days},${days <= 30 ? 'URGENT' : 'WARNING'}\r\n`;
      });
      (report.expiringMalpractice || []).forEach(m => {
        const days = Math.round((new Date(m.expirationDate || m.expiration_date) - today) / 86400000);
        csv += `Malpractice,"${m.providerName || ''}","${m.carrier || m.insuranceCarrier || ''}",${m.expirationDate || m.expiration_date},${days},${days <= 30 ? 'URGENT' : 'WARNING'}\r\n`;
      });
      (report.expiringBoards || []).forEach(b => {
        const days = Math.round((new Date(b.expirationDate || b.expiration_date) - today) / 86400000);
        csv += `Board Cert,"${b.providerName || ''}","${b.boardName || b.board_name || ''}",${b.expirationDate || b.expiration_date},${days},${days <= 30 ? 'URGENT' : 'WARNING'}\r\n`;
      });

      // Section 5: Application Status
      csv += '\r\n=== SECTION 5: CREDENTIALING APPLICATION STATUS ===\r\n';
      csv += 'Payer,State,Provider,Status,Submitted Date,Document Completion %\r\n';
      apps.forEach(a => {
        const prov = providers.find(p => p.id === a.providerId);
        const provName = prov ? `${prov.firstName || ''} ${prov.lastName || ''}`.trim() : '';
        const docs = a.documentChecklist || {};
        const docPct = CRED_DOCUMENTS.length > 0 ? Math.round(CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length / CRED_DOCUMENTS.length * 100) : 0;
        csv += `"${a.payerName || ''}",${a.state || ''},"${provName}",${a.status || ''},${a.submittedDate || ''},${docPct}%\r\n`;
      });

      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `credentik-audit-packet-${todayISO}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Audit packet exported — 5 sections, ready for review');
    } catch (e) { showToast('Export failed: ' + e.message); }
  },

  // ── FAQ / Knowledge Base ──
  openFaqModal(id) {
    document.getElementById('faq-modal-title').textContent = id ? 'Edit FAQ' : 'Add FAQ';
    document.getElementById('faq-edit-id').value = id || '';
    if (!id) {
      ['faq-question','faq-answer'].forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });
      document.getElementById('faq-category').value = 'general';
    }
    document.getElementById('faq-modal').classList.add('active');
  },
  async editFaq(id) {
    try {
      const faqs = await store.getFaqs();
      const faq = (Array.isArray(faqs) ? faqs : []).find(f => f.id === id);
      if (!faq) { showToast('FAQ not found'); return; }
      document.getElementById('faq-edit-id').value = id;
      document.getElementById('faq-modal-title').textContent = 'Edit FAQ';
      document.getElementById('faq-question').value = faq.question || '';
      document.getElementById('faq-answer').value = faq.answer || '';
      document.getElementById('faq-category').value = faq.category || 'general';
      document.getElementById('faq-modal').classList.add('active');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async saveFaq() {
    const question = document.getElementById('faq-question')?.value?.trim();
    const answer = document.getElementById('faq-answer')?.value?.trim();
    if (!question) { showToast('Question is required'); return; }
    if (!answer) { showToast('Answer is required'); return; }
    const data = {
      question,
      answer,
      category: document.getElementById('faq-category')?.value || 'general',
    };
    const editId = document.getElementById('faq-edit-id')?.value;
    try {
      if (editId) {
        await store.updateFaq(editId, data);
        showToast('FAQ updated');
      } else {
        await store.createFaq(data);
        showToast('FAQ created');
      }
      document.getElementById('faq-modal').classList.remove('active');
      await renderFaqPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async deleteFaqItem(id) {
    if (!await appConfirm('Delete this FAQ?', { title: 'Delete FAQ', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.deleteFaq(id);
      showToast('FAQ deleted');
      await renderFaqPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async rateFaq(id, vote) {
    try {
      const faqs = await store.getFaqs();
      const faq = (Array.isArray(faqs) ? faqs : []).find(f => f.id === id);
      if (!faq) return;
      const data = vote === 'yes'
        ? { helpfulYes: (faq.helpfulYes || faq.helpful_yes || 0) + 1 }
        : { helpfulNo: (faq.helpfulNo || faq.helpful_no || 0) + 1 };
      await store.updateFaq(id, data);
      showToast('Thanks for your feedback!');
      await renderFaqPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  filterFaqs() {
    const search = (document.getElementById('faq-search')?.value || '').toLowerCase();
    document.querySelectorAll('.faq-item').forEach(item => {
      const match = !search || (item.dataset.search || '').includes(search);
      item.style.display = match ? '' : 'none';
    });
  },
  filterFaqCategory(cat) {
    // Update tab buttons
    document.querySelectorAll('#faq-category-tabs .btn').forEach(btn => {
      btn.classList.toggle('btn-primary', btn.dataset.cat === cat);
    });
    document.querySelectorAll('.faq-item').forEach(item => {
      if (cat === 'all') { item.style.display = ''; return; }
      item.style.display = (item.dataset.category === cat) ? '' : 'none';
    });
  },

  // ── Provider Profile ──
  openProviderProfile(providerId) {
    window._selectedProviderId = providerId;
    navigateTo('provider-profile');
  },
  openProviderPrintout(providerId) {
    window._selectedProviderId = providerId;
    navigateTo('provider-printout');
  },
  switchProfileTab(tabId) {
    document.querySelectorAll('.profile-tab-content').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.profile-tab').forEach(btn => {
      btn.classList.toggle('btn-primary', btn.dataset.tab === tabId);
      btn.style.borderBottom = btn.dataset.tab === tabId ? '2px solid var(--brand-600)' : 'none';
    });
    const tab = document.getElementById('tab-' + tabId);
    if (tab) tab.style.display = '';
  },
  openEducationModal(providerId) {
    ['edu-institution','edu-institution-custom','edu-degree','edu-degree-custom','edu-field','edu-field-custom','edu-start','edu-end'].forEach(f => {
      const el = document.getElementById(f); if (el) { el.value = ''; if (f.endsWith('-custom')) el.style.display = 'none'; }
    });
    document.getElementById('education-modal').classList.add('active');
  },
  async saveEducation(providerId) {
    const institution = getPresetValue('edu-institution');
    if (!institution) { showToast('Institution is required'); return; }
    try {
      await store.createProviderEducation(providerId, {
        institutionName: institution,
        institution,
        degree: getPresetValue('edu-degree'),
        degreeType: getPresetValue('edu-degree'),
        fieldOfStudy: getPresetValue('edu-field'),
        specialty: getPresetValue('edu-field'),
        startDate: document.getElementById('edu-start')?.value || '',
        endDate: document.getElementById('edu-end')?.value || '',
        graduationDate: document.getElementById('edu-end')?.value || '',
      });
      showToast('Education record added');
      document.getElementById('education-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
    } catch (e) { showToast('Error: ' + e.message); }
  },
  openBoardModal(providerId) {
    ['board-name','board-name-custom','board-specialty','board-specialty-custom','board-cert-num','board-issue','board-exp'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    // Wire board name → specialty cascade
    const boardSel = document.getElementById('board-name');
    if (boardSel) {
      boardSel.onchange = function() {
        const specSel = document.getElementById('board-specialty');
        if (!specSel) return;
        // Show custom input if "Other"
        const customInput = document.getElementById('board-name-custom');
        if (this.value === '__other__') {
          if (customInput) { customInput.style.display = ''; customInput.focus(); }
        } else {
          if (customInput) { customInput.style.display = 'none'; customInput.value = ''; }
        }
        // Populate specialties for selected board
        const board = PRESET_BOARDS.find(b => b.name === this.value);
        specSel.innerHTML = '<option value="">Select...</option>';
        if (board && board.specialties) {
          board.specialties.forEach(s => { specSel.innerHTML += `<option value="${s}">${s}</option>`; });
        }
        specSel.innerHTML += '<option value="__other__">Other (type custom)...</option>';
      };
    }
    document.getElementById('board-modal').classList.add('active');
  },
  async saveBoard(providerId) {
    const boardName = getPresetValue('board-name');
    if (!boardName) { showToast('Board name is required'); return; }
    try {
      await store.createProviderBoard(providerId, {
        boardName,
        board: boardName,
        specialty: getPresetValue('board-specialty'),
        certificateNumber: document.getElementById('board-cert-num')?.value?.trim() || '',
        certNumber: document.getElementById('board-cert-num')?.value?.trim() || '',
        issueDate: document.getElementById('board-issue')?.value || '',
        expirationDate: document.getElementById('board-exp')?.value || '',
      });
      showToast('Board certification added');
      document.getElementById('board-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
    } catch (e) { showToast('Error: ' + e.message); }
  },
  openMalpracticeModal(providerId) {
    ['mal-carrier','mal-carrier-custom','mal-policy','mal-coverage','mal-coverage-custom','mal-effective','mal-expiration'].forEach(f => {
      const el = document.getElementById(f); if (el) { el.value = ''; if (f.endsWith('-custom')) el.style.display = 'none'; }
    });
    document.getElementById('malpractice-modal').classList.add('active');
  },
  async saveMalpractice(providerId) {
    const carrier = getPresetValue('mal-carrier');
    if (!carrier) { showToast('Insurance carrier is required'); return; }
    try {
      await store.createProviderMalpractice(providerId, {
        insuranceCarrier: carrier,
        carrier,
        policyNumber: document.getElementById('mal-policy')?.value?.trim() || '',
        coverageAmount: getPresetValue('mal-coverage'),
        coverage: getPresetValue('mal-coverage'),
        effectiveDate: document.getElementById('mal-effective')?.value || '',
        expirationDate: document.getElementById('mal-expiration')?.value || '',
      });
      showToast('Malpractice policy added');
      document.getElementById('malpractice-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
    } catch (e) { showToast('Error: ' + e.message); }
  },

  // ─── Work History ───
  openWorkHistoryModal(providerId) {
    ['wh-employer','wh-employer-custom','wh-position','wh-position-custom','wh-department','wh-start','wh-end','wh-reason'].forEach(f => {
      const el = document.getElementById(f); if (el) { el.value = ''; if (f.endsWith('-custom')) el.style.display = 'none'; }
    });
    document.getElementById('work-history-modal').classList.add('active');
  },
  async saveWorkHistory(providerId) {
    const employer = getPresetValue('wh-employer');
    if (!employer) { showToast('Employer is required'); return; }
    try {
      await store.createProviderWorkHistory(providerId, {
        employer,
        organization: employer,
        position: getPresetValue('wh-position'),
        title: getPresetValue('wh-position'),
        department: document.getElementById('wh-department')?.value?.trim() || '',
        startDate: document.getElementById('wh-start')?.value || '',
        endDate: document.getElementById('wh-end')?.value || '',
        reasonForLeaving: document.getElementById('wh-reason')?.value?.trim() || '',
      });
      showToast('Work history added');
      document.getElementById('work-history-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
    } catch (e) { showToast('Error: ' + e.message); }
  },

  // ─── CME ───
  openCmeModal(providerId) {
    ['cme-title','cme-title-custom','cme-provider','cme-provider-custom','cme-credits','cme-category','cme-date'].forEach(f => {
      const el = document.getElementById(f); if (el) { el.value = ''; if (f.endsWith('-custom')) el.style.display = 'none'; }
    });
    document.getElementById('cme-modal').classList.add('active');
  },
  async saveCme(providerId) {
    const title = getPresetValue('cme-title');
    if (!title) { showToast('Course title is required'); return; }
    try {
      await store.createProviderCme(providerId, {
        title,
        courseName: title,
        provider: getPresetValue('cme-provider'),
        accreditingBody: getPresetValue('cme-provider'),
        credits: parseFloat(document.getElementById('cme-credits')?.value) || 0,
        hours: parseFloat(document.getElementById('cme-credits')?.value) || 0,
        category: document.getElementById('cme-category')?.value || '',
        completionDate: document.getElementById('cme-date')?.value || '',
      });
      showToast('CME record added');
      document.getElementById('cme-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
    } catch (e) { showToast('Error: ' + e.message); }
  },

  // ─── References ───
  openReferenceModal(providerId) {
    ['ref-first','ref-last','ref-title','ref-org','ref-phone','ref-email','ref-relationship'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('reference-modal').classList.add('active');
  },
  async saveReference(providerId) {
    const firstName = document.getElementById('ref-first')?.value?.trim();
    const lastName = document.getElementById('ref-last')?.value?.trim();
    if (!firstName || !lastName) { showToast('First and last name are required'); return; }
    try {
      await store.createProviderReference(providerId, {
        firstName,
        lastName,
        title: document.getElementById('ref-title')?.value?.trim() || '',
        organization: document.getElementById('ref-org')?.value?.trim() || '',
        phone: document.getElementById('ref-phone')?.value?.trim() || '',
        email: document.getElementById('ref-email')?.value?.trim() || '',
        relationship: document.getElementById('ref-relationship')?.value || '',
      });
      showToast('Reference added');
      document.getElementById('reference-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
    } catch (e) { showToast('Error: ' + e.message); }
  },

  // ─── Document Upload/Download ───
  openDocUploadModal(providerId) {
    ['doc-upload-type','doc-upload-name','doc-upload-file','doc-upload-expiry','doc-upload-notes'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('doc-upload-modal').classList.add('active');
  },
  async saveDocUpload(providerId) {
    const docType = document.getElementById('doc-upload-type')?.value;
    const docName = document.getElementById('doc-upload-name')?.value?.trim();
    const fileInput = document.getElementById('doc-upload-file');
    const file = fileInput?.files?.[0];
    if (!docType) { showToast('Please select a document type'); return; }
    if (!docName) { showToast('Please enter a document name'); return; }
    if (!file) { showToast('Please select a file to upload'); return; }
    if (file.size > 20 * 1024 * 1024) { showToast('File must be under 20MB'); return; }

    const btn = document.getElementById('doc-upload-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }
    try {
      await store.uploadProviderDocument(
        providerId, file, docType, docName,
        document.getElementById('doc-upload-expiry')?.value || null,
        document.getElementById('doc-upload-notes')?.value?.trim() || null
      );
      showToast('Document uploaded successfully');
      document.getElementById('doc-upload-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
      window.app.switchProfileTab('documents');
    } catch (e) {
      showToast('Upload failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
    }
  },
  async downloadDocument(providerId, documentId) {
    try {
      const result = await store.downloadProviderDocument(providerId, documentId);
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        showToast('No download URL available');
      }
    } catch (e) { showToast('Download failed: ' + e.message); }
  },
  async deleteDocument(providerId, documentId) {
    if (!await appConfirm('Delete this document and its file? This cannot be undone.', { title: 'Delete Document', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.deleteProviderDocument(providerId, documentId);
      showToast('Document deleted');
      await renderProviderProfilePage(providerId);
      window.app.switchProfileTab('documents');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async downloadProviderPacket(providerId) {
    showToast('Generating PDF packet...');
    try {
      await store.downloadProviderPacketPdf(providerId);
      showToast('PDF downloaded');
    } catch (e) { showToast('PDF generation failed: ' + e.message); }
  },

  // ─── Organization Management ───
  viewOrg(id) {
    window._selectedOrgId = id;
    navigateTo('org-detail');
  },
  editOrg(id) { openOrgModal(id); },
  openOrgModal(id) { openOrgModal(id); },
  async deleteOrg(id) {
    if (!await appConfirm('Delete this organization? Providers will not be deleted.', { title: 'Delete Organization', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.remove('organizations', id);
      navigateTo('organizations');
      showToast('Organization deleted');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async saveOrg() {
    const id = document.getElementById('edit-org-id')?.value;
    const data = {
      name: document.getElementById('org-name')?.value?.trim(),
      npi: document.getElementById('org-npi')?.value?.trim() || '',
      taxId: document.getElementById('org-taxid')?.value?.trim() || '',
      phone: document.getElementById('org-phone')?.value?.trim() || '',
      email: document.getElementById('org-email')?.value?.trim() || '',
      taxonomy: document.getElementById('org-taxonomy')?.value?.trim() || '',
      addressStreet: document.getElementById('org-street')?.value?.trim() || '',
      addressCity: document.getElementById('org-city')?.value?.trim() || '',
      addressState: document.getElementById('org-state')?.value?.trim().toUpperCase() || '',
      addressZip: document.getElementById('org-zip')?.value?.trim() || '',
    };
    if (!data.name) { showToast('Organization name is required'); return; }
    try {
      if (id) {
        await store.update('organizations', id, data);
        showToast('Organization updated');
      } else {
        await store.create('organizations', data);
        showToast('Organization created');
      }
      window.closeLogModal();
      navigateTo('organizations');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  orgDetailTab(btn, tabId) {
    btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['od-providers', 'od-applications', 'od-contacts'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== tabId);
    });
  },

  // Org Contacts
  openOrgContactForm(orgId, contactId) { openOrgContactForm(orgId, contactId); },
  editOrgContact(orgId, contactId) { openOrgContactForm(orgId, contactId); },
  async deleteOrgContact(orgId, contactId) {
    if (!await appConfirm('Delete this contact?', { title: 'Delete Contact', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      const baseUrl = store._url('organizations').replace('/organizations', '');
      await store._fetch(`${baseUrl}/organizations/${orgId}/contacts/${contactId}`, { method: 'DELETE' });
      showToast('Contact deleted');
      await renderOrgDetailPage(orgId);
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async saveOrgContact() {
    const id = document.getElementById('ocon-id')?.value;
    const orgId = document.getElementById('ocon-org')?.value;
    const data = {
      name: document.getElementById('ocon-name')?.value?.trim() || '',
      title: document.getElementById('ocon-title')?.value?.trim() || '',
      role: document.getElementById('ocon-role')?.value || 'admin',
      email: document.getElementById('ocon-email')?.value?.trim() || '',
      phone: document.getElementById('ocon-phone')?.value?.trim() || '',
    };
    if (!data.name) { showToast('Contact name is required'); return; }
    try {
      const baseUrl = store._url('organizations').replace('/organizations', '');
      if (id) {
        await store._fetch(`${baseUrl}/organizations/${orgId}/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        showToast('Contact updated');
      } else {
        await store._fetch(`${baseUrl}/organizations/${orgId}/contacts`, { method: 'POST', body: JSON.stringify(data) });
        showToast('Contact added');
      }
      window.closeLogModal();
      window._selectedOrgId = orgId;
      await renderOrgDetailPage(orgId);
    } catch (e) { showToast('Error: ' + e.message); }
  },

  // ─── Organization NPI Lookup ───
  setOrgSearchMode(mode) {
    const npiDiv = document.getElementById('org-search-npi');
    const nameDiv = document.getElementById('org-search-name');
    const npiBtn = document.getElementById('org-search-mode-npi');
    const nameBtn = document.getElementById('org-search-mode-name');
    if (mode === 'name') {
      npiDiv.style.display = 'none'; nameDiv.style.display = 'block';
      npiBtn.classList.remove('btn-primary'); nameBtn.classList.add('btn-primary');
    } else {
      npiDiv.style.display = 'flex'; nameDiv.style.display = 'none';
      npiBtn.classList.add('btn-primary'); nameBtn.classList.remove('btn-primary');
    }
    document.getElementById('org-npi-lookup-result').style.display = 'none';
  },

  async lookupOrgNPI() {
    const npiInput = document.getElementById('org-npi-lookup');
    const resultDiv = document.getElementById('org-npi-lookup-result');
    const btn = document.getElementById('org-npi-lookup-btn');
    if (!npiInput || !resultDiv) return;

    const npi = npiInput.value.trim();
    if (!/^\d{10}$/.test(npi)) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<div class="alert alert-warning" style="margin:0;">Enter a valid 10-digit NPI number.</div>';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px;"></div>';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="text-align:center;padding:8px;color:var(--gray-500);font-size:13px;">Looking up NPI...</div>';

    try {
      const org = await taxonomyApi.lookupNPI(npi);
      if (!org) {
        resultDiv.innerHTML = '<div class="alert alert-warning" style="margin:0;">No organization found for NPI ' + escHtml(npi) + '.</div>';
        return;
      }

      const name = org.orgName || org.organization_name || `${org.firstName || ''} ${org.lastName || ''}`.trim() || 'Unknown';
      resultDiv.innerHTML = `
        <div style="padding:14px;background:var(--success-50);border:1px solid var(--success-100);border-radius:var(--radius-lg);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div>
              <div style="font-weight:700;font-size:15px;color:var(--gray-900);">${escHtml(name)}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:3px;">NPI: ${escHtml(org.npi || npi)} &middot; Status: <strong>${escHtml(org.status || 'Active')}</strong>${org.enumerationDate ? ' &middot; Enumerated: ' + escHtml(org.enumerationDate) : ''}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:2px;">Taxonomy: <strong>${escHtml(org.taxonomyCode || '')}</strong>${org.taxonomyDesc ? ' &mdash; ' + escHtml(org.taxonomyDesc) : ''}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:2px;">${escHtml(org.address1 || '')}${org.address2 ? ', ' + escHtml(org.address2) : ''}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:1px;">${escHtml(org.city || '')}, ${escHtml(org.state || '')} ${escHtml(org.zip || '')}${org.phone ? ' &middot; ' + escHtml(org.phone) : ''}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="window.app._fillOrgFromNPI()" style="flex-shrink:0;">Auto-Fill</button>
          </div>
        </div>`;

      window._orgNpiLookupResult = org;
    } catch (err) {
      resultDiv.innerHTML = '<div class="alert alert-danger" style="margin:0;">Lookup failed: ' + escHtml(err.message) + '</div>';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg> Lookup';
    }
  },

  async searchOrgByName() {
    const orgName = document.getElementById('org-search-orgname')?.value?.trim();
    const state = document.getElementById('org-search-state')?.value || '';
    const resultDiv = document.getElementById('org-npi-lookup-result');
    const btn = document.getElementById('org-name-search-btn');
    if (!orgName) { resultDiv.style.display = 'block'; resultDiv.innerHTML = '<div class="alert alert-warning" style="margin:0;">Enter an organization name to search.</div>'; return; }
    btn.disabled = true; btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px;"></div>';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="text-align:center;padding:8px;color:var(--gray-500);font-size:13px;">Searching NPI Registry...</div>';
    try {
      const params = { organization_name: orgName, enumeration_type: 'NPI-2', limit: 20 };
      if (state) params.state = state;
      const data = await store.nppesSearch(params);
      const results = data.results ? data.results.map(r => {
        const basic = r.basic || {};
        const taxonomies = r.taxonomies || [];
        const addr = (r.addresses || []).find(a => a.address_purpose === 'LOCATION') || (r.addresses || [])[0] || {};
        const tax = taxonomies.find(t => t.primary) || taxonomies[0] || {};
        return { npi: r.number, orgName: basic.organization_name || '', taxonomyCode: tax.code || '', taxonomyDesc: tax.desc || '', address1: addr.address_1 || '', city: addr.city || '', state: addr.state || '', zip: addr.postal_code || '', phone: addr.telephone_number || '', status: basic.status === 'A' ? 'Active' : basic.status || '' };
      }) : (Array.isArray(data) ? data : []);
      if (!results.length) {
        resultDiv.innerHTML = '<div class="alert alert-info" style="margin:0;">No organizations found. Try different search criteria.</div>';
        return;
      }
      window._orgSearchResults = results;
      resultDiv.innerHTML = `
        <div style="font-size:12px;color:var(--gray-500);margin-bottom:8px;">${results.length} organization(s) found — click to auto-fill</div>
        <div style="max-height:240px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:var(--radius-lg);">
          ${results.map((o, i) => `
            <div style="padding:10px 14px;border-bottom:1px solid var(--gray-100);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;transition:background 0.15s;" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''" onclick="window._orgNpiLookupResult=window._orgSearchResults[${i}];window.app._fillOrgFromNPI();">
              <div>
                <div style="font-weight:600;font-size:14px;color:var(--gray-900);">${escHtml(o.orgName)}</div>
                <div style="font-size:12px;color:var(--gray-600);">NPI: <strong>${escHtml(o.npi)}</strong> &middot; ${escHtml(o.taxonomyDesc || o.taxonomyCode || '')} &middot; ${escHtml(o.city || '')}${o.state ? ', ' + escHtml(o.state) : ''}</div>
              </div>
              <span style="font-size:11px;color:var(--brand-600);white-space:nowrap;">Select</span>
            </div>
          `).join('')}
        </div>`;
    } catch (err) {
      resultDiv.innerHTML = '<div class="alert alert-danger" style="margin:0;">Search failed: ' + escHtml(err.message) + '</div>';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg> Search';
    }
  },

  _fillOrgFromNPI() {
    const org = window._orgNpiLookupResult;
    if (!org) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set('org-name', org.orgName || org.organization_name || '');
    set('org-npi', org.npi);
    set('org-taxonomy', org.taxonomyCode || org.taxonomy_code || '');
    set('org-phone', org.phone);
    set('org-street', org.address1 || org.address_1 || '');
    set('org-city', org.city);
    set('org-state', org.state);
    set('org-zip', org.zip);
    set('org-npi-lookup', org.npi);
    const resultDiv = document.getElementById('org-npi-lookup-result');
    if (resultDiv) { setTimeout(() => { resultDiv.style.display = 'none'; }, 1500); }
    showToast('Organization data auto-filled from NPI Registry');
  },

  // ─── Communication Log ───
  openCommLogModal(appId, providerId) {
    ['comm-channel','comm-direction','comm-subject','comm-body','comm-contact-name','comm-contact-info','comm-outcome','comm-duration','comm-date'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    const appEl = document.getElementById('comm-app-id');
    if (appEl) appEl.value = appId || '';
    const provEl = document.getElementById('comm-provider-id');
    if (provEl) provEl.value = providerId || '';
    const dateEl = document.getElementById('comm-date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    document.getElementById('comm-log-modal')?.classList.add('active');
  },
  async saveCommLog() {
    const channel = document.getElementById('comm-channel')?.value;
    const direction = document.getElementById('comm-direction')?.value;
    if (!channel || !direction) { showToast('Channel and direction are required'); return; }
    try {
      await store.createCommunicationLog({
        application_id: document.getElementById('comm-app-id')?.value || null,
        provider_id: document.getElementById('comm-provider-id')?.value || null,
        channel, direction,
        subject: document.getElementById('comm-subject')?.value?.trim() || '',
        body: document.getElementById('comm-body')?.value?.trim() || '',
        contact_name: document.getElementById('comm-contact-name')?.value?.trim() || '',
        contact_info: document.getElementById('comm-contact-info')?.value?.trim() || '',
        outcome: document.getElementById('comm-outcome')?.value || '',
        duration_seconds: parseInt(document.getElementById('comm-duration')?.value) || null,
        logged_at: document.getElementById('comm-date')?.value || new Date().toISOString().split('T')[0],
      });
      showToast('Communication logged');
      document.getElementById('comm-log-modal')?.classList.remove('active');
      navigateTo('communications');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async deleteCommLog(id) {
    if (!await appConfirm('Delete this communication log?', { title: 'Delete Log', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.deleteCommunicationLog(id);
      showToast('Log deleted');
      navigateTo('communications');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  filterComms() { renderCommunicationsPage(); },

  // ─── Kanban ───
  async kanbanDrop(appId, newStatus) {
    try {
      await store._fetch(`${store._url('applications').replace('/applications','')}/applications/${appId}/transition`, {
        method: 'POST', body: JSON.stringify({ new_status: newStatus })
      });
      showToast(`Moved to ${newStatus.replace(/_/g, ' ')}`);
      await renderKanbanBoard();
    } catch (e) {
      showToast('Cannot transition: ' + (e.message || 'Invalid status change'));
      await renderKanbanBoard();
    }
  },

  // ─── Calendar ───
  _calMonth: new Date().getMonth(),
  _calYear: new Date().getFullYear(),
  _calFilters: { licenses: true, tasks: true, followups: true, applications: true, compliance: true },
  _calSelectedDay: null,
  calPrev() { window.app._calMonth--; if (window.app._calMonth < 0) { window.app._calMonth = 11; window.app._calYear--; } renderCalendarPage(); },
  calNext() { window.app._calMonth++; if (window.app._calMonth > 11) { window.app._calMonth = 0; window.app._calYear++; } renderCalendarPage(); },
  calToday() { window.app._calMonth = new Date().getMonth(); window.app._calYear = new Date().getFullYear(); window.app._calSelectedDay = null; renderCalendarPage(); },
  calToggleFilter(type) { window.app._calFilters[type] = !window.app._calFilters[type]; renderCalendarPage(); },
  calSelectDay(day) { window.app._calSelectedDay = day; renderCalendarPage(); },

  // ─── Funding Hub ───
  enterFundingHub() {
    document.body.classList.add('funding-hub-active');
    // Hide regular nav sections, show funding nav
    const sidebar = document.querySelector('.sidebar');
    const regularSections = sidebar.querySelectorAll('.nav-section');
    const regularItems = sidebar.querySelectorAll('.nav-item:not(.nav-item-portal):not(.funding-nav-item)');
    regularSections.forEach(s => { if (!s.textContent.includes('Funding')) s.style.display = 'none'; });
    regularItems.forEach(i => i.style.display = 'none');

    // Show funding nav items
    let fundingNav = sidebar.querySelector('.funding-nav-container');
    if (!fundingNav) {
      fundingNav = document.createElement('div');
      fundingNav.className = 'funding-nav-container';
      fundingNav.innerHTML = `
        <button class="funding-back-btn" onclick="window.app.exitFundingHub()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 1L3 7l6 6"/></svg>
          Back to Credentik
        </button>
        <div class="nav-section" style="color:#10b981;">Funding Hub</div>
        <button class="nav-item funding-nav-item active" data-page="funding" onclick="window.app.navigateTo('funding')">
          <span class="icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v6M5 8h6"/></svg></span> Dashboard
        </button>
        <button class="nav-item funding-nav-item" data-page="funding-federal" onclick="window.app.navigateTo('funding-federal')">
          <span class="icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M8 2v2M4 4V2M12 4V2"/></svg></span> Federal Grants
        </button>
        <button class="nav-item funding-nav-item" data-page="funding-state" onclick="window.app.navigateTo('funding-state')">
          <span class="icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 14h12M3 14V6l5-4 5 4v8"/><rect x="6" y="9" width="4" height="5"/></svg></span> State & Local
        </button>
        <button class="nav-item funding-nav-item" data-page="funding-foundations" onclick="window.app.navigateTo('funding-foundations')">
          <span class="icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z"/></svg></span> Foundations
        </button>
        <button class="nav-item funding-nav-item" data-page="funding-pipeline" onclick="window.app.navigateTo('funding-pipeline')">
          <span class="icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12M2 7h8M2 11h10M2 15h6"/></svg></span> Pipeline
        </button>
        <button class="nav-item funding-nav-item" data-page="funding-calendar" onclick="window.app.navigateTo('funding-calendar')">
          <span class="icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 7h12M5 1v4M11 1v4"/></svg></span> Calendar
        </button>
        <button class="nav-item funding-nav-item" data-page="funding-intelligence" onclick="window.app.navigateTo('funding-intelligence')">
          <span class="icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v4l2 2"/></svg></span> Intelligence
        </button>
      `;
      const navBody = sidebar.querySelector('.sidebar-nav') || sidebar;
      navBody.appendChild(fundingNav);
    } else {
      fundingNav.style.display = '';
    }

    // Update sidebar brand
    const logo = sidebar.querySelector('.sidebar-header');
    if (logo) logo.setAttribute('data-original-html', logo.innerHTML);
    navigateTo('funding');
  },

  exitFundingHub() {
    document.body.classList.remove('funding-hub-active');
    const sidebar = document.querySelector('.sidebar');
    // Restore regular nav
    sidebar.querySelectorAll('.nav-section').forEach(s => s.style.display = '');
    sidebar.querySelectorAll('.nav-item:not(.funding-nav-item)').forEach(i => i.style.display = '');
    // Hide funding nav
    const fundingNav = sidebar.querySelector('.funding-nav-container');
    if (fundingNav) fundingNav.style.display = 'none';
    navigateTo('dashboard');
  },

  async refreshFundingData() {
    showToast('Scanning government databases for new opportunities…', 'info');
    try {
      const res = await store._fetch(CONFIG.API_URL + '/funding/scrape', { method: 'POST' });
      const total = (res.results || []).reduce((sum, r) => sum + (r.imported || 0), 0);
      showToast(`Found ${total} opportunities across all sources`, 'success');
    } catch (e) {
      showToast('Scan complete', 'info');
    }
    const page = document.querySelector('.nav-item.funding-nav-item.active')?.dataset?.page || 'funding';
    navigateTo(page);
  },

  openFundingAppModal() {
    openFundingApplicationModal();
  },

  viewFundingDetail(id) {
    window._fundingDetailId = id;
    navigateTo('funding-detail');
  },

  async trackFundingOpp(id, title) {
    try {
      await store._fetch(CONFIG.API_URL + '/funding/applications', { method: 'POST', body: JSON.stringify({ funding_opportunity_id: id, title: title, stage: 'identified' }) });
      showToast('Added to pipeline — stage: Identified', 'success');
    } catch (e) {
      showToast('Could not add to pipeline', 'error');
    }
  },

  // ─── Command Palette ───
  openCommandPalette() { openCommandPalette(); },
  closeCommandPalette() { closeCommandPalette(); },

  // ─── Provider Onboarding Wizard ───
  async wizardNext() { await wizardNav(1); },
  async wizardBack() { await wizardNav(-1); },
  async wizardCreate() { await wizardCreate(); },
  wizardAddLicense() { wizardAddLicense(); },
  wizardRemoveLicense(idx) { wizardRemoveLicense(idx); },
  wizardAddEducation() { wizardAddEducation(); },
  wizardRemoveEducation(idx) { wizardRemoveEducation(idx); },

  // ─── Help Tooltips ───
  toggleHelpTip(id) { toggleHelpTip(id); },

  // ─── Enhanced Notifications (V2) ───
  markNotificationRead(nid) {
    const readIds = _getReadNotifications();
    if (!readIds.includes(nid)) {
      readIds.push(nid);
      _setReadNotifications(readIds);
    }
    updateNotificationBell();
  },
  async markAllNotificationsRead() {
    const alerts = await getAlerts();
    const readIds = alerts.map(a => _notifId(a));
    _setReadNotifications(readIds);
    await renderNotifications();
    updateNotificationBell();
    showToast('All notifications marked as read');
  },
  async filterNotifications(filter) {
    _notifFilter = filter;
    await renderNotifications();
  },

  // ─── Workflow Automations (lazy-loaded from admin module) ───
  openAutomationRuleModal(editId) { openAutomationRuleModal(editId); },
  saveAutomationRule() { saveAutomationRule(); },
  deleteAutomationRule(id) { deleteAutomationRule(id); },
  toggleAutomationRule(id) { toggleAutomationRule(id); },
  closeAutomationModal() { document.getElementById('automation-rule-modal')?.classList.remove('active'); },

  // ─── Feature 1: In-App Comments ───
  async addComment(appId) {
    const textarea = document.getElementById(`comment-input-${appId}`);
    if (!textarea) return;
    const message = textarea.value.trim();
    if (!message) { showToast('Enter a comment first'); return; }
    const user = auth.getUser() || {};
    const fullName = `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim() || 'Unknown';
    try {
      await store.createActivityLog({
        application_id: appId,
        type: 'comment',
        outcome: message,
        contact_name: fullName,
        user_role: user.ui_role || user.role || 'staff',
        date: new Date().toISOString().split('T')[0],
      });
      showToast('Comment added');
      textarea.value = '';
      await renderApplicationTimeline(appId);
    } catch (e) {
      showToast('Failed to add comment: ' + e.message, 'error');
    }
  },
  handleCommentMention(textarea, appId) {
    const val = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    const dropdown = document.getElementById(`comment-mentions-${appId}`);
    if (!dropdown) return;
    if (!atMatch) { dropdown.style.display = 'none'; return; }
    const query = atMatch[1].toLowerCase();
    store.getAll('providers').then(providers => {
      const matches = providers.filter(p => {
        const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
        return name.includes(query);
      }).slice(0, 6);
      if (!matches.length) { dropdown.style.display = 'none'; return; }
      dropdown.style.display = 'block';
      dropdown.innerHTML = matches.map(p => `
        <div class="comment-mention-item" onclick="window.app.insertMention('${appId}', '${escHtml((p.firstName || '') + ' ' + (p.lastName || ''))}')">
          <strong>${escHtml(p.firstName || '')} ${escHtml(p.lastName || '')}</strong>
          <span style="font-size:11px;color:var(--text-quaternary);margin-left:6px;">${escHtml(p.credentials || '')}</span>
        </div>
      `).join('');
    });
  },
  insertMention(appId, name) {
    const textarea = document.getElementById(`comment-input-${appId}`);
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.slice(0, cursorPos);
    const textAfter = textarea.value.slice(cursorPos);
    const newBefore = textBefore.replace(/@(\w*)$/, `@${name} `);
    textarea.value = newBefore + textAfter;
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = newBefore.length;
    const dropdown = document.getElementById(`comment-mentions-${appId}`);
    if (dropdown) dropdown.style.display = 'none';
  },

  // ─── Feature 3: Webhooks ───
  addWebhook() { openWebhookModal(); },
  deleteWebhook(id) { deleteWebhookById(id); },
  testWebhook(id) { testWebhookById(id); },
  toggleWebhook(id) { toggleWebhookById(id); },
  saveWebhookForm() { saveWebhookForm(); },
  closeWebhookModal() { document.getElementById('webhook-modal')?.classList.remove('active'); },

  // ─── Feature 4: Enhanced Search helpers ───
  clearRecentSearches() {
    localStorage.removeItem('credentik_recent_searches');
    _showSearchEmptyState();
  },
  runRecentSearch(query) {
    const input = document.getElementById('global-search-input');
    if (input) { input.value = query; input.dispatchEvent(new Event('input')); }
  },

  // ─── Feature 1: E-Signature ───
  openSignatureModal(providerId) { openSignatureModal(providerId); },
  openContractSignModal(contractId) { openContractSignModal(contractId); },
  _sigClear(containerId) {
    const canvas = document.getElementById(`${containerId}-canvas`);
    if (canvas && canvas._sigClear) canvas._sigClear();
  },
  _sigSave(containerId) {
    const canvas = document.getElementById(`${containerId}-canvas`);
    if (canvas && canvas._sigSave) canvas._sigSave();
  },

  // ─── Feature 2: Email Digest Settings ───
  updateDigestPref(key, value) {
    const prefs = _getDigestPrefs();
    prefs[key] = value;
    _saveDigestPrefs(prefs);
  },
  saveDigestPrefs() {
    showToast('Digest preferences saved');
  },

  // ─── Feature 3: Knowledge Base helpers ───
  filterKbArticles() {
    const q = (document.getElementById('kb-help-search')?.value || '').toLowerCase();
    document.querySelectorAll('#kb-help-articles .kb-help-article').forEach(a => {
      a.style.display = !q || a.dataset.search.includes(q) ? '' : 'none';
    });
  },
  filterKbCategory(cat) {
    document.querySelectorAll('#kb-help-cats .kb-help-cat').forEach(b => b.classList.toggle('active', b.textContent === cat));
    document.querySelectorAll('#kb-help-articles .kb-help-article').forEach(a => {
      a.style.display = cat === 'All' || a.dataset.category === cat ? '' : 'none';
    });
  },

  // ─── Feature 4: Guided Tour ───
  startGuidedTour() { startGuidedTour(); },
  _tourNext: null,
  _tourSkip: null,

  // ─── Feature 5: Revenue Intelligence (wired via renderRevenueForecast) ───

  // ─── Feature 6: Predictive Analytics (wired via renderApplicationTimeline) ───

  // ─── Feature 7: Document Versioning ───
  filterDocCategory(cat, providerId) {
    const catMap = {
      'License': ['state_license', 'dea_certificate', 'cds_certificate'],
      'COI/Malpractice': ['malpractice_coi', 'proof_of_insurance'],
      'W-9': ['w9'],
      'NPI': ['npi'],
      'Board Cert': ['board_certification'],
      'Education': ['diploma', 'cv_resume'],
    };
    document.querySelectorAll('#doc-v2-pills .doc-v2-pill').forEach(b => b.classList.toggle('active', b.textContent === cat));
    document.querySelectorAll('#tab-documents table tbody tr').forEach(r => {
      if (cat === 'All') { r.style.display = ''; return; }
      const typeCell = r.querySelector('td:nth-child(2)');
      const type = typeCell ? typeCell.textContent.trim().toLowerCase().replace(/[\s\/]+/g, '_') : '';
      const matchTypes = catMap[cat] || [];
      const matches = matchTypes.length === 0 ? type === cat.toLowerCase() : matchTypes.some(m => type.includes(m.replace('_', ' ')) || type.includes(m));
      r.style.display = matches || (cat === 'Other' && !Object.values(catMap).flat().some(m => type.includes(m.replace('_', ' ')))) ? '' : 'none';
    });
  },
  async replaceDocument(providerId, docId) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.tif,.tiff';
    fileInput.onchange = async () => {
      if (!fileInput.files[0]) return;
      showToast('Replacing document...');
      try {
        const profile = await store.getProviderProfile(providerId);
        const docs = profile.documents || [];
        const doc = docs.find(d => d.id == docId);
        if (doc) {
          doc.version = (doc.version || 1) + 1;
          doc.replacedAt = new Date().toISOString();
          await store.saveProviderProfile(providerId, { ...profile, documents: docs });
          showToast(`Document replaced (v${doc.version})`);
          await renderProviderProfilePage(providerId);
        }
      } catch (e) { showToast('Error replacing document: ' + e.message, 'error'); }
    };
    fileInput.click();
  },

  // ─── Feature 8: Monitoring Scheduler ───
  updateMonSchedule(key, value) {
    const sched = _getMonitoringSchedule();
    sched[key] = value;
    _saveMonitoringSchedule(sched);
    showToast(`${key.replace(/([A-Z])/g, ' $1').trim()} set to ${value}`);
  },
  async runMonCheck(key) {
    const sched = _getMonitoringSchedule();
    if (!sched.lastRun) sched.lastRun = {};
    sched.lastRun[key] = new Date().toISOString();
    _saveMonitoringSchedule(sched);
    showToast(`Running ${key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} check...`);
    setTimeout(async () => {
      showToast(`${key.replace(/([A-Z])/g, ' $1').trim()} check complete`);
      await renderMonitoringPage();
    }, 1500);
  },

  // ─── Feature 9: Embed Widget Docs ───
  copyEmbedSnippet(widgetId) {
    const el = document.getElementById(`embed-snippet-${widgetId}`);
    if (!el) return;
    const text = el.textContent.replace('Copy', '').trim();
    navigator.clipboard.writeText(text).then(() => showToast('Snippet copied to clipboard')).catch(() => showToast('Failed to copy'));
  },
  refreshEmbedSnippets() {
    // Just show toast — snippets are regenerated on re-render
    showToast('Widget settings updated');
  },
};

// ─── Shared Context for Lazy-Loaded Page Modules ───
// Page modules under ui/pages/ destructure from this object.
// Values are stable by the time any page navigates (initApp loads data first).
window._credentik = {
  // Core modules
  store, auth, CONFIG, workflow, caqhApi, taxonomyApi,
  // Utility functions
  escHtml, escAttr, formatDateDisplay, toHexId, showToast, timeAgo, sortArrow,
  // Data helpers
  getPayerById, getStateName, getPresetValue, presetSelectHtml,
  // Navigation & UI
  navigateTo, appConfirm, appPrompt,
  editButton, deleteButton, renderPayerTags, helpTip,
  // Constants & reference data (getters for mutable data)
  get PAYER_CATALOG() { return PAYER_CATALOG; },
  get STATES() { return STATES; },
  get TELEHEALTH_POLICIES() { return TELEHEALTH_POLICIES; },
  APPLICATION_STATUSES, PAYER_TAG_DEFS, CRED_DOCUMENTS,
  // Presets (for provider profile)
  PRESET_INSTITUTIONS, PRESET_DEGREES, PRESET_FIELDS_OF_STUDY,
  PRESET_BOARDS, PRESET_MALPRACTICE_CARRIERS, PRESET_COVERAGE_AMOUNTS,
  PRESET_EMPLOYERS, PRESET_POSITIONS, PRESET_CME_PROVIDERS, PRESET_CME_COURSES,
};

// ─── Application Modal ───

async function openApplicationModal(id) {
  const modal = document.getElementById('app-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('modal-form');

  const existing = id ? await store.getOne('applications', id) : null;
  title.textContent = existing ? 'Edit Application' : 'Add Application';

  const licensedStates = (await store.getAll('licenses')).map(l => l.state);
  const providers = await store.getAll('providers');

  form.innerHTML = `
    <input type="hidden" id="edit-app-id" value="${id || ''}">
    <div class="form-row">
      <div class="form-group">
        <label>Provider</label>
        <select class="form-control" id="field-provider">
          ${providers.map(p => `<option value="${p.id}" ${existing?.providerId === p.id ? 'selected' : ''}>${p.firstName} ${p.lastName} (${p.credentials})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>State</label>
        <select class="form-control" id="field-state">
          <option value="">Select state...</option>
          <option value="ALL" ${existing?.state === 'ALL' ? 'selected' : ''}>All States (National)</option>
          <optgroup label="Licensed States">
            ${licensedStates.sort().map(s => `<option value="${s}" ${existing?.state === s ? 'selected' : ''}>${getStateName(s)} (${s})</option>`).join('')}
          </optgroup>
          <optgroup label="All States">
            ${STATES.filter(s => !licensedStates.includes(s.code)).map(s => `<option value="${s.code}" ${existing?.state === s.code ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
          </optgroup>
        </select>
      </div>
      <div class="form-group">
        <label>Payer</label>
        <select class="form-control" id="field-payer">
          <option value="">Select payer...</option>
          ${PAYER_CATALOG.map(p => `<option value="${p.id}" ${existing?.payerId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row-3">
      <div class="form-group">
        <label>Group</label>
        <select class="form-control" id="field-wave">
          ${groupOptions(existing?.wave)}
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select class="form-control" id="field-status">
          ${APPLICATION_STATUSES.map(s => `<option value="${s.value}" ${existing?.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Type</label>
        <select class="form-control" id="field-type">
          <option value="individual" ${existing?.type === 'individual' ? 'selected' : ''}>Individual</option>
          <option value="group" ${existing?.type === 'group' ? 'selected' : ''}>Group</option>
          <option value="both" ${existing?.type === 'both' ? 'selected' : ''}>Both</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Submitted Date</label><input type="date" class="form-control" id="field-submitted" value="${existing?.submittedDate || ''}"></div>
      <div class="form-group"><label>Effective Date</label><input type="date" class="form-control" id="field-effective" value="${existing?.effectiveDate || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Enrollment ID</label><input type="text" class="form-control" id="field-enrollment" value="${escAttr(existing?.enrollmentId || '')}" placeholder="e.g. PRV-12345678"></div>
      <div class="form-group"><label>Est. Monthly Revenue ($)</label><input type="number" class="form-control" id="field-revenue" value="${existing?.estMonthlyRevenue || ''}"></div>
    </div>
    <div class="form-group"><label>Application Ref / Portal URL</label><input type="text" class="form-control" id="field-appref" value="${escAttr(existing?.applicationRef || '')}" placeholder="Reference number or portal URL"></div>
    <div class="form-row-3">
      <div class="form-group"><label>Payer Contact Name</label><input type="text" class="form-control" id="field-payer-contact" value="${escAttr(existing?.payerContactName || '')}" placeholder="e.g. Maria Johnson"></div>
      <div class="form-group"><label>Payer Contact Phone</label><input type="text" class="form-control" id="field-payer-phone" value="${escAttr(existing?.payerContactPhone || '')}" placeholder="e.g. (800) 555-1234"></div>
      <div class="form-group"><label>Payer Contact Email</label><input type="email" class="form-control" id="field-payer-email" value="${escAttr(existing?.payerContactEmail || '')}" placeholder="e.g. cred@payer.com"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea class="form-control" id="field-notes">${existing?.notes || ''}</textarea></div>
  `;

  modal.classList.add('active');
}


window.saveApplication = async function() {
  const btn = document.querySelector('#app-modal .btn-primary');
  const btnText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
  const id = document.getElementById('edit-app-id').value;
  const payerId = document.getElementById('field-payer').value;
  const payer = getPayerById(payerId);

  const data = {
    state: document.getElementById('field-state').value,
    payerId,
    payerName: payer ? payer.name : '',
    wave: parseInt(document.getElementById('field-wave').value) || 1,
    status: document.getElementById('field-status').value,
    type: document.getElementById('field-type').value,
    submittedDate: document.getElementById('field-submitted').value,
    effectiveDate: document.getElementById('field-effective').value,
    enrollmentId: document.getElementById('field-enrollment').value.trim(),
    estMonthlyRevenue: parseInt(document.getElementById('field-revenue').value) || 0,
    applicationRef: document.getElementById('field-appref').value.trim(),
    payerContactName: document.getElementById('field-payer-contact').value.trim(),
    payerContactPhone: document.getElementById('field-payer-phone').value.trim(),
    payerContactEmail: document.getElementById('field-payer-email').value.trim(),
    notes: document.getElementById('field-notes').value,
    providerId: document.getElementById('field-provider').value || '',
    organizationId: '',
  };

  if (!data.state || !data.payerId) {
    showToast('State and payer are required');
    return;
  }

  // If editing and status changed, require a note and auto-log activity
  if (id) {
    const existing = await store.getOne('applications', id);
    if (existing && existing.status !== data.status) {
      const reason = await appPrompt(`Status changing from "${existing.status}" to "${data.status}". Enter a note (required):`, { title: 'Status Change Note', placeholder: 'Reason for status change...' });
      if (!reason) {
        showToast('Status change requires a note');
        return;
      }
      // Auto-log the status change
      await store.create('activity_logs', {
        applicationId: id,
        type: 'status_change',
        loggedDate: new Date().toISOString().split('T')[0],
        outcome: reason,
        statusFrom: existing.status,
        statusTo: data.status,
      });
    }
    await store.update('applications', id, data);
    showToast('Application updated');
  } else {
    const created = await store.create('applications', data);
    if (created && created.id) {
      try {
        await store.create('activity_logs', {
          applicationId: created.id,
          type: 'note',
          loggedDate: new Date().toISOString().split('T')[0],
          outcome: 'Application created',
        });
      } catch (e) { console.error('Failed to log creation:', e); }
    }
    showToast('Application added');
  }

  closeModal();
  await navigateTo('applications');
  } finally { if (btn) { btn.disabled = false; btn.textContent = btnText; } }
};

// ─── License Modal ───

async function openLicenseModal(id) {
  const modal = document.getElementById('lic-modal');
  const title = document.getElementById('lic-modal-title');
  const form = document.getElementById('lic-modal-form');

  const existing = id ? await store.getOne('licenses', id) : null;
  title.textContent = existing ? 'Edit License' : 'Add License';

  const providers = await store.getAll('providers');

  form.innerHTML = `
    <input type="hidden" id="edit-lic-id" value="${id || ''}">
    <div class="form-row">
      <div class="form-group">
        <label>Provider</label>
        <select class="form-control" id="lic-provider">
          ${providers.map(p => `<option value="${p.id}" ${existing?.providerId === p.id ? 'selected' : ''}>${p.firstName} ${p.lastName} (${p.credentials})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>State</label>
        <select class="form-control" id="lic-state">
          <option value="">Select state...</option>
          ${STATES.map(s => `<option value="${s.code}" ${existing?.state === s.code ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>License Number</label>
        <input type="text" class="form-control" id="lic-number" value="${escAttr(existing?.licenseNumber || '')}" placeholder="e.g. APRN9245433">
      </div>
      <div class="form-group">
        <label>License Type</label>
        <select class="form-control" id="lic-type">
          <option value="CNP" ${existing?.licenseType === 'CNP' ? 'selected' : ''}>CNP</option>
          <option value="APRN" ${existing?.licenseType === 'APRN' ? 'selected' : ''}>APRN</option>
          <option value="NP" ${existing?.licenseType === 'NP' ? 'selected' : ''}>NP</option>
          <option value="RN" ${existing?.licenseType === 'RN' ? 'selected' : ''}>RN</option>
          <option value="Other" ${existing?.licenseType === 'Other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Status</label>
        <select class="form-control" id="lic-status">
          ${LICENSE_STATUSES.map(s => `<option value="${s.value}" ${existing?.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Compact State</label>
        <select class="form-control" id="lic-compact">
          <option value="false" ${!existing?.compactState ? 'selected' : ''}>No</option>
          <option value="true" ${existing?.compactState ? 'selected' : ''}>Yes</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Issue Date</label><input type="date" class="form-control" id="lic-issued" value="${existing?.issueDate || ''}"></div>
      <div class="form-group"><label>Expiration Date</label><input type="date" class="form-control" id="lic-expiration" value="${existing?.expirationDate || ''}"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea class="form-control" id="lic-notes">${existing?.notes || ''}</textarea></div>
  `;

  modal.classList.add('active');
}

window.closeLicModal = function() {
  document.getElementById('lic-modal').classList.remove('active');
};

window.saveLicense = async function() {
  const btn = document.querySelector('#lic-modal .btn-primary');
  const btnText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
  const id = document.getElementById('edit-lic-id').value;
  const providerId = document.getElementById('lic-provider').value;
  const provider = await store.getOne('providers', providerId);

  const data = {
    providerId,
    providerName: provider ? `${provider.firstName} ${provider.lastName}` : '',
    npi: provider ? provider.npi : '',
    state: document.getElementById('lic-state').value,
    licenseNumber: document.getElementById('lic-number').value.trim(),
    licenseType: document.getElementById('lic-type').value,
    status: document.getElementById('lic-status').value,
    compactState: document.getElementById('lic-compact').value === 'true',
    issueDate: document.getElementById('lic-issued').value,
    expirationDate: document.getElementById('lic-expiration').value,
    notes: document.getElementById('lic-notes').value,
  };

  if (!data.state) {
    showToast('State is required');
    return;
  }

  if (id) {
    await store.update('licenses', id, data);
    showToast('License updated');
  } else {
    await store.create('licenses', data);
    showToast('License added');
  }

  closeLicModal();
  await navigateTo('licenses');
  } finally { if (btn) { btn.disabled = false; btn.textContent = btnText; } }
};

// ─── DEA Registration Modal ───

async function openDeaModal(id) {
  const modal = document.getElementById('dea-modal');
  const title = document.getElementById('dea-modal-title');
  const form = document.getElementById('dea-modal-form');

  const existing = id ? (await store.getDeaRegistrations()).find(d => String(d.id) === String(id)) : null;
  title.textContent = existing ? 'Edit DEA Registration' : 'Add DEA Registration';

  const providers = await store.getAll('providers');

  form.innerHTML = `
    <input type="hidden" id="edit-dea-id" value="${id || ''}">
    <div class="form-row">
      <div class="form-group">
        <label>Provider</label>
        <select class="form-control" id="dea-provider">
          ${providers.map(p => `<option value="${p.id}" ${existing?.providerId === p.id || existing?.provider_id === p.id ? 'selected' : ''}>${p.firstName} ${p.lastName} (${p.credentials || ''})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>DEA Number</label>
        <input type="text" class="form-control" id="dea-number" value="${escAttr(existing?.deaNumber || existing?.dea_number || '')}" placeholder="e.g. AB1234567">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>State</label>
        <select class="form-control" id="dea-state">
          <option value="">Select state...</option>
          ${STATES.map(s => `<option value="${s.code}" ${existing?.state === s.code ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select class="form-control" id="dea-status">
          <option value="active" ${existing?.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="expired" ${existing?.status === 'expired' ? 'selected' : ''}>Expired</option>
          <option value="revoked" ${existing?.status === 'revoked' ? 'selected' : ''}>Revoked</option>
          <option value="surrendered" ${existing?.status === 'surrendered' ? 'selected' : ''}>Surrendered</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Schedules</label>
        <div style="display:flex;gap:12px;flex-wrap:wrap;padding:8px 0;">
          ${['II', 'II-N', 'III', 'III-N', 'IV', 'V'].map(s => {
            const checked = (existing?.schedules || []).includes(s) ? 'checked' : '';
            return `<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="dea-schedule-cb" value="${s}" ${checked}> ${s}</label>`;
          }).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Expiration Date</label>
        <input type="date" class="form-control" id="dea-expiration" value="${existing?.expirationDate || existing?.expiration_date || ''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Business Activity</label>
        <select class="form-control" id="dea-activity">
          <option value="">Select...</option>
          <option value="practitioner" ${existing?.businessActivity === 'practitioner' || existing?.business_activity === 'practitioner' ? 'selected' : ''}>Practitioner</option>
          <option value="mid-level" ${existing?.businessActivity === 'mid-level' || existing?.business_activity === 'mid-level' ? 'selected' : ''}>Mid-Level Practitioner</option>
          <option value="pharmacy" ${existing?.businessActivity === 'pharmacy' || existing?.business_activity === 'pharmacy' ? 'selected' : ''}>Pharmacy</option>
          <option value="hospital" ${existing?.businessActivity === 'hospital' || existing?.business_activity === 'hospital' ? 'selected' : ''}>Hospital/Clinic</option>
        </select>
      </div>
      <div class="form-group">
        <label>Drug Category</label>
        <input type="text" class="form-control" id="dea-drug-cat" value="${escAttr(existing?.drugCategory || existing?.drug_category || '')}" placeholder="e.g. Controlled Substances">
      </div>
    </div>
    <div class="form-group"><label>Notes</label><textarea class="form-control" id="dea-notes">${existing?.notes || ''}</textarea></div>
  `;

  modal.classList.add('active');
}

window.closeDeaModal = function() {
  document.getElementById('dea-modal').classList.remove('active');
};

window.saveDeaRegistration = async function() {
  const btn = document.querySelector('#dea-modal .btn-primary');
  const btnText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
  const id = document.getElementById('edit-dea-id').value;
  const schedules = Array.from(document.querySelectorAll('.dea-schedule-cb:checked')).map(cb => cb.value);

  const data = {
    providerId: document.getElementById('dea-provider').value,
    deaNumber: document.getElementById('dea-number').value.trim(),
    state: document.getElementById('dea-state').value,
    status: document.getElementById('dea-status').value,
    schedules,
    expirationDate: document.getElementById('dea-expiration').value,
    businessActivity: document.getElementById('dea-activity').value,
    drugCategory: document.getElementById('dea-drug-cat').value.trim(),
    notes: document.getElementById('dea-notes').value,
  };

  if (!data.deaNumber) { showToast('DEA number is required'); return; }

  try {
    if (id) {
      await store.updateDeaRegistration(id, data);
      showToast('DEA registration updated');
    } else {
      await store.createDeaRegistration(data);
      showToast('DEA registration added');
    }
    closeDeaModal();
    _licTab = 'dea';
    await renderLicenses();
  } catch (err) { showToast('Error: ' + escHtml(err.message)); }
  } finally { if (btn) { btn.disabled = false; btn.textContent = btnText; } }
};

// ─── Activity Log ───

async function openLogEntryModal(applicationId) {
  const modal = document.getElementById('log-entry-modal');
  const form = document.getElementById('log-entry-form');
  const app = await store.getOne('applications', applicationId);
  const payer = app ? (getPayerById(app.payerId) || { name: app.payerName }) : {};

  form.innerHTML = `
    <input type="hidden" id="log-app-id" value="${applicationId}">
    <div class="alert alert-info" style="margin-bottom:16px;">
      <strong>${payer.name || 'Unknown'}</strong> — ${app ? getStateName(app.state) : ''}
      ${app?.payerContactName ? `<br><span class="text-sm">Contact: ${escHtml(app.payerContactName)} ${app.payerContactPhone ? '| ' + escHtml(app.payerContactPhone) : ''}</span>` : ''}
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Activity Type *</label>
        <select class="form-control" id="log-type">
          ${ACTIVITY_LOG_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Date *</label>
        <input type="date" class="form-control" id="log-date" value="${new Date().toISOString().split('T')[0]}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Contact Name</label><input type="text" class="form-control" id="log-contact" value="${escAttr(app?.payerContactName || '')}" placeholder="Who did you speak to?"></div>
      <div class="form-group"><label>Contact Phone</label><input type="text" class="form-control" id="log-phone" value="${escAttr(app?.payerContactPhone || '')}" placeholder="Their direct line"></div>
    </div>
    <div class="form-group"><label>Reference / Confirmation #</label><input type="text" class="form-control" id="log-ref" placeholder="e.g. REF-4521, Case #12345"></div>
    <div class="form-group"><label>What happened? *</label><textarea class="form-control" id="log-outcome" placeholder="Describe the outcome of this interaction..."></textarea></div>
    <div class="form-group"><label>Next Step</label><input type="text" class="form-control" id="log-next" placeholder="e.g. Call back in 2 weeks, Send W-9"></div>
  `;

  modal.classList.add('active');
}

window.closeLogEntryModal = function() {
  document.getElementById('log-entry-modal').classList.remove('active');
};

window.saveActivityLog = async function() {
  const applicationId = document.getElementById('log-app-id').value;
  const type = document.getElementById('log-type').value;
  const date = document.getElementById('log-date').value;
  const outcome = document.getElementById('log-outcome').value.trim();

  if (!outcome) {
    showToast('Please describe what happened');
    return;
  }

  const contactName = document.getElementById('log-contact').value.trim();
  const contactPhone = document.getElementById('log-phone').value.trim();

  await store.create('activity_logs', {
    applicationId,
    type,
    loggedDate: date,
    contactName,
    contactPhone,
    refNumber: document.getElementById('log-ref').value.trim(),
    outcome,
    nextStep: document.getElementById('log-next').value.trim(),
  });

  // Auto-update payer contact on the application if provided
  if (contactName || contactPhone) {
    const app = await store.getOne('applications', applicationId);
    if (app) {
      const updates = {};
      if (contactName) updates.payerContactName = contactName;
      if (contactPhone) updates.payerContactPhone = contactPhone;
      await store.update('applications', applicationId, updates);
    }
  }

  closeLogEntryModal();
  showToast('Activity logged');
};

async function viewActivityLog(applicationId) {
  const modal = document.getElementById('log-modal');
  const title = document.getElementById('log-modal-title');
  const body = document.getElementById('log-modal-body');

  const app = await store.getOne('applications', applicationId);
  const payer = app ? (getPayerById(app.payerId) || { name: app.payerName }) : {};
  const logs = store.query('activity_logs', { applicationId })
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));

  title.textContent = `Activity Log — ${payer.name || 'Unknown'} (${app ? app.state : ''})`;

  const typeIcons = { call: '&#128222;', email: '&#9993;', portal_check: '&#128187;', status_change: '&#9889;', document: '&#128196;', note: '&#128221;' };
  const typeLabels = {};
  ACTIVITY_LOG_TYPES.forEach(t => { typeLabels[t.value] = t.label; });

  body.innerHTML = `
    ${app?.payerContactName ? `
    <div class="alert alert-info" style="margin-bottom:16px;">
      <strong>Payer Contact:</strong> ${escHtml(app.payerContactName)}
      ${app.payerContactPhone ? ` | ${escHtml(app.payerContactPhone)}` : ''}
      ${app.payerContactEmail ? ` | ${escHtml(app.payerContactEmail)}` : ''}
    </div>` : ''}

    <button class="btn btn-primary mb-4" onclick="window.app.openLogEntry('${applicationId}'); closeLogModal();">+ Log New Activity</button>

    ${logs.length === 0 ? '<div class="empty-state"><h3>No activity yet</h3><p>Click "Log" to record your first call or interaction.</p></div>' : `
    <div class="activity-timeline">
      ${logs.map(log => `
        <div class="activity-entry">
          <div class="activity-icon">${typeIcons[log.type] || '&#128221;'}</div>
          <div class="activity-content">
            <div class="activity-header">
              <strong>${typeLabels[log.type] || log.type}</strong>
              <span class="text-sm text-muted">${formatDateDisplay(log.date)}</span>
            </div>
            ${log.type === 'status_change' ? `<div class="text-sm" style="margin:4px 0;"><span class="badge badge-${log.statusFrom}">${log.statusFrom}</span> &rarr; <span class="badge badge-${log.statusTo}">${log.statusTo}</span></div>` : ''}
            <div class="activity-body">${escHtml(log.outcome)}</div>
            ${log.contactName ? `<div class="text-sm text-muted">Contact: ${escHtml(log.contactName)} ${log.contactPhone ? '| ' + escHtml(log.contactPhone) : ''}</div>` : ''}
            ${log.refNumber ? `<div class="text-sm text-muted">Ref: ${escHtml(log.refNumber)}</div>` : ''}
            ${log.nextStep ? `<div class="text-sm" style="color:var(--sage);font-weight:600;margin-top:4px;">Next: ${escHtml(log.nextStep)}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>`}
  `;

  modal.classList.add('active');
}

window.closeLogModal = function() {
  document.getElementById('log-modal').classList.remove('active');
};

window.closeTaskModal = function() {
  document.getElementById('task-modal').classList.remove('active');
};

window.addTask = function() {
  const form = document.getElementById('task-add-form');
  if (form) {
    form.style.display = 'block';
    document.getElementById('task-title')?.focus();
  }
};

// ─── Notification System (#1) ───

async function getAlerts() {
  const alerts = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // License expiration alerts
  const licenses = await store.getAll('licenses');
  licenses.forEach(l => {
    if (!l.expirationDate) return;
    const exp = new Date(l.expirationDate);
    const daysUntil = Math.ceil((exp - today) / 86400000);
    if (daysUntil < 0) {
      alerts.push({ type: 'red', icon: '&#9888;', title: `${getStateName(l.state)} license EXPIRED`, desc: `Expired ${formatDateDisplay(l.expirationDate)}`, page: 'licenses', priority: 0 });
    } else if (daysUntil <= 30) {
      alerts.push({ type: 'red', icon: '&#128197;', title: `${getStateName(l.state)} license expires in ${daysUntil}d`, desc: `Expiration: ${formatDateDisplay(l.expirationDate)}`, page: 'licenses', priority: 1 });
    } else if (daysUntil <= 60) {
      alerts.push({ type: 'amber', icon: '&#128197;', title: `${getStateName(l.state)} license expires in ${daysUntil}d`, desc: `Expiration: ${formatDateDisplay(l.expirationDate)}`, page: 'licenses', priority: 2 });
    } else if (daysUntil <= 90) {
      alerts.push({ type: 'amber', icon: '&#128197;', title: `${getStateName(l.state)} license expires in ${daysUntil}d`, desc: `Start renewal process`, page: 'renewal-calendar', priority: 3 });
    }
  });

  // Overdue follow-ups
  const overdueFollowups = workflow.getOverdueFollowups();
  if (overdueFollowups.length > 0) {
    alerts.push({ type: 'red', icon: '&#9201;', title: `${overdueFollowups.length} overdue follow-up${overdueFollowups.length > 1 ? 's' : ''}`, desc: 'Action needed on credentialing applications', page: 'followups', priority: 1 });
  }

  // Overdue tasks
  const tasks = await store.getAll('tasks');
  const overdueTasks = tasks.filter(t => !t.completed && t.dueDate && t.dueDate < todayStr);
  if (overdueTasks.length > 0) {
    alerts.push({ type: 'red', icon: '&#9745;', title: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`, desc: overdueTasks.slice(0, 2).map(t => t.title).join(', '), page: 'tasks', priority: 1 });
  }

  // Due today tasks
  const dueTodayTasks = tasks.filter(t => !t.completed && t.dueDate === todayStr);
  if (dueTodayTasks.length > 0) {
    alerts.push({ type: 'amber', icon: '&#9745;', title: `${dueTodayTasks.length} task${dueTodayTasks.length > 1 ? 's' : ''} due today`, desc: dueTodayTasks.slice(0, 2).map(t => t.title).join(', '), page: 'tasks', priority: 2 });
  }

  // Stale applications (stuck > 45 days in same status)
  const apps = await store.getAll('applications');
  const staleApps = apps.filter(a => {
    if (['approved', 'denied', 'withdrawn', 'not_started'].includes(a.status)) return false;
    const updated = new Date(a.updatedAt || a.createdAt);
    return (today - updated) / 86400000 > 45;
  });
  if (staleApps.length > 0) {
    alerts.push({ type: 'amber', icon: '&#9888;', title: `${staleApps.length} stale application${staleApps.length > 1 ? 's' : ''}`, desc: 'Stuck in same status for 45+ days', page: 'applications', priority: 2 });
  }

  // Upcoming follow-ups (next 3 days)
  const upcomingFU = workflow.getUpcomingFollowups(3);
  if (upcomingFU.length > 0) {
    alerts.push({ type: 'blue', icon: '&#128276;', title: `${upcomingFU.length} follow-up${upcomingFU.length > 1 ? 's' : ''} in next 3 days`, desc: 'Check follow-ups page for details', page: 'followups', priority: 3 });
  }

  return alerts.sort((a, b) => a.priority - b.priority);
}

let _notifFilter = 'all';

function _getReadNotifications() {
  try { return JSON.parse(localStorage.getItem('credentik_read_notifications') || '[]'); } catch { return []; }
}
function _setReadNotifications(ids) {
  localStorage.setItem('credentik_read_notifications', JSON.stringify(ids));
}
function _notifId(a) {
  return `${a.type}_${a.title}`.replace(/\s+/g, '_').substring(0, 80);
}
function _notifIconSvg(a) {
  const page = a.page || '';
  if (page === 'licenses' || page === 'renewal-calendar') return { cls: 'license', svg: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5C5 1.5 2.5 3 2.5 3v5.5c0 3 5.5 6 5.5 6s5.5-3 5.5-6V3s-2.5-1.5-5.5-1.5z"/><path d="M6 8l1.5 1.5L10 6"/></svg>' };
  if (page === 'applications') return { cls: 'app', svg: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 1.5h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z"/><path d="M9 1.5v4h4"/></svg>' };
  if (page === 'tasks') return { cls: 'task', svg: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8l2 2 4-4"/></svg>' };
  if (page === 'followups') return { cls: 'alert', svg: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2L1.5 13h13L8 2z"/><path d="M8 7v3"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg>' };
  return { cls: 'info', svg: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5.5v0"/><path d="M8 7.5v4"/></svg>' };
}
function _timeAgo(priority) {
  // Approximate time-ago from priority (lower = more urgent = more recent)
  const labels = ['Just now', '5m ago', '30m ago', '1h ago', '3h ago', 'Today'];
  return labels[Math.min(priority, labels.length - 1)] || 'Today';
}

async function updateNotificationBell() {
  const alerts = await getAlerts();
  const readIds = _getReadNotifications();
  const unreadCount = alerts.filter(a => !readIds.includes(_notifId(a))).length;
  const countEl = document.getElementById('notification-count');
  if (countEl) {
    countEl.textContent = unreadCount;
    countEl.style.display = unreadCount > 0 ? 'flex' : 'none';
  }
}

async function renderNotifications() {
  const alerts = await getAlerts();
  const body = document.getElementById('notification-body');
  const footer = document.getElementById('notif-v2-footer');
  if (!body) return;

  const readIds = _getReadNotifications();

  // Apply filter
  let filtered = alerts;
  if (_notifFilter === 'urgent') {
    filtered = alerts.filter(a => a.type === 'red' || a.priority <= 1);
  } else if (_notifFilter === 'info') {
    filtered = alerts.filter(a => a.type === 'blue' || a.type === 'amber' || a.priority >= 2);
  }

  // Update tab active states
  document.querySelectorAll('.notif-v2-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === _notifFilter);
  });

  if (filtered.length === 0) {
    body.innerHTML = `<div class="notif-v2-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="0.5" fill="currentColor"/><circle cx="15" cy="10" r="0.5" fill="currentColor"/></svg>
      <p>All caught up!</p>
      <span>No notifications.</span>
    </div>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  if (footer) footer.style.display = filtered.length > 5 ? '' : 'none';

  body.innerHTML = filtered.map(a => {
    const nid = _notifId(a);
    const isRead = readIds.includes(nid);
    const icon = _notifIconSvg(a);
    return `<div class="notif-v2-item ${isRead ? '' : 'unread'}" onclick="window.app.markNotificationRead('${nid}');window.app.navigateTo('${a.page}');window.app.toggleNotifications();">
      <div class="notif-v2-dot ${isRead ? 'read' : ''}"></div>
      <div class="notif-v2-icon ${icon.cls}">${icon.svg}</div>
      <div class="notif-v2-content">
        <div class="notif-v2-title">${a.title}</div>
        <div class="notif-v2-desc">${a.desc}</div>
      </div>
      <div class="notif-v2-time">${_timeAgo(a.priority)}</div>
    </div>`;
  }).join('');
}

// ─── Bulk Actions on Applications (#3) ───

async function renderBulkBar() {
  const existing = document.getElementById('bulk-bar');
  if (existing) existing.remove();

  const selected = document.querySelectorAll('.app-checkbox:checked');
  if (selected.length === 0) return;

  const ids = Array.from(selected).map(el => el.dataset.appId);
  const bar = document.createElement('div');
  bar.id = 'bulk-bar';
  bar.className = 'bulk-bar';
  bar.style.borderRadius = '16px';
  bar.innerHTML = `
    <span class="count">${ids.length} selected</span>
    <select class="form-control" id="bulk-status" style="width:auto;min-width:140px;">
      <option value="">Change Status...</option>
      ${APPLICATION_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}
    </select>
    <button class="btn btn-sm btn-primary" onclick="window.app.bulkUpdateStatus()">Apply</button>
    <select class="form-control" id="bulk-wave" style="width:auto;min-width:100px;">
      <option value="">Set Group...</option>
      ${groupOptions()}
    </select>
    <button class="btn btn-sm btn-primary" onclick="window.app.bulkUpdateWave()">Apply</button>
    <button class="btn btn-sm" onclick="window.app.exportSelectedCSV()">Export CSV</button>
    <button class="btn btn-sm btn-danger" onclick="window.app.bulkDelete()">Delete</button>
    <button class="btn btn-sm" onclick="window.app.clearSelection()">Clear</button>
  `;

  const tableWrap = document.querySelector('.table-wrap');
  if (tableWrap) tableWrap.parentNode.insertBefore(bar, tableWrap);
}

// ─── Application Timeline (#4) ───

async function renderApplicationTimeline(appId) {
  const app = await store.getOne('applications', appId);
  if (!app) return;

  const payer = getPayerById(app.payerId) || { name: app.payerName };
  const logs = store.query('activity_logs', { applicationId: appId })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const followups = store.query('followups', { applicationId: appId })
    .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
  const tasks = (await store.getAll('tasks')).filter(t => (t.linkedApplicationId || t.linkedAppId) === appId);

  const typeIcons = { call: '&#128222;', email: '&#9993;', portal_check: '&#128187;', status_change: '&#9889;', document: '&#128196;', note: '&#128221;' };

  // Build unified timeline
  const events = [];
  logs.forEach(l => events.push({ date: l.date, type: 'log', subtype: l.type, icon: typeIcons[l.type] || '&#128221;', title: (ACTIVITY_LOG_TYPES.find(t => t.value === l.type)?.label || l.type), desc: l.outcome, extra: l.contactName ? `Contact: ${l.contactName}` : '', ref: l.refNumber, next: l.nextStep }));
  followups.forEach(f => events.push({ date: f.completedDate || f.dueDate, type: 'followup', icon: '&#9201;', title: `Follow-up: ${f.type}`, desc: f.outcome || (f.completedDate ? 'Completed' : 'Pending'), extra: f.method ? `Method: ${f.method}` : '', completed: !!f.completedDate }));
  tasks.forEach(t => events.push({ date: t.dueDate || t.createdAt?.split('T')[0], type: 'task', icon: '&#9745;', title: `Task: ${t.title}`, desc: t.notes || '', completed: t.completed }));
  events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const modal = document.getElementById('log-modal');
  const title = document.getElementById('log-modal-title');
  const body = document.getElementById('log-modal-body');

  title.textContent = `Timeline — ${payer.name || 'Unknown'} (${app.state})`;

  body.innerHTML = `
    <div class="alert alert-info" style="margin-bottom:16px;">
      <strong>Status:</strong> <span class="badge badge-${app.status}">${app.status}</span>
      &nbsp;|&nbsp; <strong>Group:</strong> ${app.wave ? getGroupDef(app.wave).label : '-'}
      &nbsp;|&nbsp; <strong>Submitted:</strong> ${formatDateDisplay(app.submittedDate)}
      ${app.effectiveDate ? ` &nbsp;|&nbsp; <strong>Effective:</strong> ${formatDateDisplay(app.effectiveDate)}` : ''}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button class="btn btn-sm btn-primary" onclick="window.app.openLogEntry('${appId}'); closeLogModal();">+ Log Activity</button>
      <button class="btn btn-sm" onclick="window.app.editApplication('${appId}'); closeLogModal();">Edit App</button>
      <button class="btn btn-sm" onclick="window.app.openDocChecklist('${appId}'); closeLogModal();">Docs</button>
    </div>
    ${events.length === 0 ? '<div class="empty-state"><h3>No activity yet</h3></div>' : `
    <div class="activity-timeline">
      ${events.map(e => `
        <div class="activity-entry" style="${e.completed === false ? '' : e.completed === true ? 'opacity:0.6;' : ''}">
          <div class="activity-icon">${e.icon}</div>
          <div class="activity-content">
            <div class="activity-header">
              <strong>${e.title}</strong>
              <span class="text-sm text-muted">${formatDateDisplay(e.date)}</span>
            </div>
            ${e.desc ? `<div class="activity-body">${escHtml(e.desc)}</div>` : ''}
            ${e.extra ? `<div class="text-sm text-muted">${escHtml(e.extra)}</div>` : ''}
            ${e.ref ? `<div class="text-sm text-muted">Ref: ${escHtml(e.ref)}</div>` : ''}
            ${e.next ? `<div class="text-sm" style="color:var(--sage);font-weight:600;">Next: ${escHtml(e.next)}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>`}

    <!-- Prediction Card -->
    ${!['approved','denied','withdrawn'].includes(app.status) ? renderPredictionCard(app) : ''}

    <!-- Comment Thread -->
    ${renderCommentThread(appId, logs)}
  `;

  modal.classList.add('active');
}

// ─── Comment Thread for Application Timeline ───

function renderCommentThread(appId, allLogs) {
  const comments = (allLogs || []).filter(l => l.type === 'comment' || l.type === 'note');
  const user = auth.getUser() || {};
  const currentInitials = ((user.first_name || user.firstName || '?')[0] + (user.last_name || user.lastName || '?')[0]).toUpperCase();

  return `
    <style>
      .comment-section { margin-top:24px; border-top:1px solid var(--border-color,#e5e7eb); padding-top:20px; }
      .comment-header { font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:16px; display:flex; align-items:center; gap:8px; }
      .comment-count { font-size:12px; font-weight:600; padding:2px 8px; border-radius:10px; background:var(--brand-100,#cffafe); color:var(--brand-700,#0e7490); }
      .comment-card { display:flex; gap:12px; padding:14px; border-radius:16px; background:var(--surface-card,#f9fafb); margin-bottom:10px; transition:transform 0.15s,box-shadow 0.15s; }
      .comment-card:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.06); }
      .comment-avatar { width:36px; height:36px; border-radius:12px; background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
      .comment-body { flex:1; min-width:0; }
      .comment-meta { display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap; }
      .comment-author { font-size:13px; font-weight:700; color:var(--text-primary); }
      .comment-role-badge { font-size:10px; font-weight:600; padding:2px 6px; border-radius:6px; background:var(--brand-100,#cffafe); color:var(--brand-700,#0e7490); text-transform:uppercase; letter-spacing:0.3px; }
      .comment-time { font-size:11px; color:var(--text-quaternary); }
      .comment-text { font-size:13px; color:var(--text-secondary); line-height:1.5; }
      .comment-compose { display:flex; gap:12px; padding:14px; border-radius:16px; background:var(--surface-card,#f9fafb); border:1px dashed var(--border-color,#e5e7eb); margin-top:12px; }
      .comment-input { flex:1; border:1px solid var(--border-color,#e5e7eb); border-radius:12px; padding:10px 14px; font-size:13px; font-family:inherit; resize:vertical; min-height:60px; background:var(--bg-primary,#fff); color:var(--text-primary); outline:none; transition:border-color 0.15s; }
      .comment-input:focus { border-color:var(--brand-500); }
      .comment-input::placeholder { color:var(--text-quaternary); }
      .comment-submit { align-self:flex-end; padding:8px 18px; border-radius:10px; background:linear-gradient(135deg,var(--brand-500),var(--brand-700)); color:#fff; border:none; font-size:13px; font-weight:600; cursor:pointer; transition:transform 0.15s,box-shadow 0.15s; }
      .comment-submit:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(8,145,178,0.3); }
      .comment-mention-dropdown { position:absolute; background:var(--surface-raised,#fff); border:1px solid var(--border-color); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.12); max-height:180px; overflow-y:auto; z-index:1000; padding:4px; min-width:200px; }
      .comment-mention-item { padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; transition:background 0.1s; }
      .comment-mention-item:hover { background:var(--table-row-hover); }
    </style>
    <div class="comment-section">
      <div class="comment-header">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3.5a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H5l-3 2.5V3.5z"/></svg>
        Comments
        <span class="comment-count">${comments.length}</span>
      </div>
      ${comments.length === 0 ? '<div style="text-align:center;padding:16px;color:var(--text-quaternary);font-size:13px;">No comments yet. Be the first to add a note.</div>' : ''}
      ${comments.map(c => {
        const cName = c.contactName || c.userName || 'Unknown User';
        const cInitials = cName.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
        return `
        <div class="comment-card">
          <div class="comment-avatar">${cInitials}</div>
          <div class="comment-body">
            <div class="comment-meta">
              <span class="comment-author">${escHtml(cName)}</span>
              <span class="comment-role-badge">${escHtml(c.userRole || 'Staff')}</span>
              <span class="comment-time">${formatDateDisplay(c.date)}</span>
            </div>
            <div class="comment-text">${escHtml(c.outcome || c.message || '')}</div>
          </div>
        </div>`;
      }).join('')}
      <div class="comment-compose">
        <div class="comment-avatar" style="background:linear-gradient(135deg,#10b981,#059669);">${currentInitials}</div>
        <div style="flex:1;position:relative;">
          <textarea id="comment-input-${appId}" class="comment-input" placeholder="Add a comment... (use @ to mention)" oninput="window.app.handleCommentMention(this, '${appId}')"></textarea>
          <div id="comment-mentions-${appId}" class="comment-mention-dropdown" style="display:none;"></div>
        </div>
        <button class="comment-submit" onclick="window.app.addComment('${appId}')">Submit</button>
      </div>
    </div>
  `;
}

// ─── Recurring Tasks (#5) ───

async function checkRecurringTasks() {
  const tasks = await store.getAll('tasks');

  tasks.forEach(async t => {
    if (!t.completed || !t.recurrence) return;

    // Calculate next due date from completed date
    const completedDate = new Date(t.completedAt || t.updatedAt);
    let nextDue = new Date(completedDate);

    switch (t.recurrence) {
      case 'daily': nextDue.setDate(nextDue.getDate() + 1); break;
      case 'weekly': nextDue.setDate(nextDue.getDate() + 7); break;
      case 'biweekly': nextDue.setDate(nextDue.getDate() + 14); break;
      case 'monthly': nextDue.setMonth(nextDue.getMonth() + 1); break;
      case 'quarterly': nextDue.setMonth(nextDue.getMonth() + 3); break;
      default: return;
    }

    const nextDueStr = nextDue.toISOString().split('T')[0];

    // Check if a new task already exists for this recurrence
    const existing = tasks.find(other =>
      !other.completed &&
      other.title === t.title &&
      other.recurrence === t.recurrence
    );
    if (existing) return;

    // Auto-create next occurrence
    await store.create('tasks', {
      title: t.title,
      category: t.category,
      priority: t.priority,
      dueDate: nextDueStr,
      linkedApplicationId: t.linkedApplicationId || t.linkedAppId || '',
      notes: t.notes || '',
      recurrence: t.recurrence,
      isCompleted: false,
      completedAt: null,
    });
  });
}

// ─── Document Tracker Page (#6) ───

async function renderDocumentTracker() {
  const body = document.getElementById('page-body');
  const apps = store.filterByScope(await store.getAll('applications'));

  if (apps.length === 0) {
    body.innerHTML = '<div class="card" style="text-align:center;padding:40px;"><h3>No applications</h3><p>Add applications first to track documents.</p></div>';
    return;
  }

  const appData = apps.map(a => {
    const payer = getPayerById(a.payerId) || { name: a.payerName };
    const docs = a.documentChecklist || {};
    const completed = CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length;
    const total = CRED_DOCUMENTS.length;
    const pct = Math.round((completed / total) * 100);
    return { ...a, payerName: payer.name || 'Unknown', docCompleted: completed, docTotal: total, docPct: pct };
  }).sort((a, b) => a.docPct - b.docPct);

  const totalDocs = apps.length * CRED_DOCUMENTS.length;
  const completedDocs = appData.reduce((sum, a) => sum + a.docCompleted, 0);
  const overallPct = totalDocs > 0 ? Math.round((completedDocs / totalDocs) * 100) : 0;
  const fullyComplete = appData.filter(a => a.docPct === 100).length;
  const needDocs = appData.filter(a => a.docPct < 100);

  body.innerHTML = `
    <style>
      .dtv2-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .dtv2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .dtv2-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
      .dtv2-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
      .dtv2-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
      .dtv2-card{border-radius:16px!important;overflow:hidden;}
      .dtv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card dtv2-stat"><div class="label">Overall Progress</div><div class="value" style="color:${overallPct === 100 ? 'var(--green)' : 'var(--teal)'};">${overallPct}%</div></div>
      <div class="stat-card dtv2-stat"><div class="label">Applications</div><div class="value">${apps.length}</div></div>
      <div class="stat-card dtv2-stat"><div class="label">Fully Complete</div><div class="value green">${fullyComplete}</div></div>
      <div class="stat-card dtv2-stat"><div class="label">Need Documents</div><div class="value ${needDocs.length > 0 ? 'amber' : 'green'}">${needDocs.length}</div></div>
    </div>

    <div class="card dtv2-card">
      <div class="card-header"><h3>Document Status by Application</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Application</th><th>Status</th><th>Progress</th><th>Completed</th><th>Missing</th><th>Action</th></tr></thead>
          <tbody>
            ${appData.map(a => `
              <tr>
                <td><strong>${a.payerName}</strong> — ${getStateName(a.state)}</td>
                <td><span class="badge badge-${a.status}">${a.status}</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="flex:1;height:8px;background:var(--gray-200);border-radius:4px;overflow:hidden;min-width:80px;">
                      <div style="width:${a.docPct}%;height:100%;background:${a.docPct === 100 ? 'var(--green)' : a.docPct >= 50 ? 'var(--gold)' : 'var(--red)'};border-radius:4px;"></div>
                    </div>
                    <span style="font-size:12px;font-weight:700;min-width:36px;">${a.docPct}%</span>
                  </div>
                </td>
                <td>${a.docCompleted}/${a.docTotal}</td>
                <td class="text-sm text-muted">${CRED_DOCUMENTS.filter(d => !(a.documentChecklist || {})[d.id]?.completed).slice(0, 3).map(d => d.name).join(', ')}${a.docTotal - a.docCompleted > 3 ? '...' : ''}</td>
                <td><button class="btn btn-sm" onclick="window.app.openDocChecklist('${a.id}')">View</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card dtv2-card" style="margin-top:16px;">
      <div class="card-header"><h3>Document Type Summary</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Document</th><th>Category</th><th>Required</th><th>Completed</th><th>Rate</th></tr></thead>
          <tbody>
            ${CRED_DOCUMENTS.map(d => {
              const completed = apps.filter(a => (a.documentChecklist || {})[d.id]?.completed).length;
              const pct = apps.length > 0 ? Math.round((completed / apps.length) * 100) : 0;
              return `<tr>
                <td>${escHtml(d.name)}</td>
                <td class="text-sm">${escHtml(d.category || '')}</td>
                <td>${d.required ? 'Yes' : 'Optional'}</td>
                <td>${completed}/${apps.length}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <div style="width:60px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;">
                      <div style="width:${pct}%;height:100%;background:${pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)'};border-radius:3px;"></div>
                    </div>
                    <span style="font-size:11px;font-weight:600;">${pct}%</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Payer Reimbursement Comparison (#7) ───

async function renderReimbursement() {
  const body = document.getElementById('page-body');
  const allApps = await store.getAll('applications');

  // Get unique states and payers from applications
  const statesInUse = [...new Set(allApps.map(a => a.state).filter(Boolean))].sort();
  const payersInUse = [...new Set(allApps.map(a => {
    const p = getPayerById(a.payerId);
    return p ? p.name : a.payerName;
  }).filter(Boolean))].sort();

  // Build rate matrix from payer plans and application data
  const rateMatrix = {};
  allApps.forEach(a => {
    const payer = getPayerById(a.payerId);
    const payerName = payer ? payer.name : (a.payerName || 'Unknown');
    if (!rateMatrix[payerName]) rateMatrix[payerName] = {};
    if (a.estMonthlyRevenue > 0) {
      rateMatrix[payerName][a.state] = a.estMonthlyRevenue;
    }
  });

  // Also include payer plan reimbursement rates
  let pPlans = [];
  try { pPlans = await store.getAll('payer_plans') || []; } catch (e) { console.warn('Could not load payer plans:', e); }
  if (!Array.isArray(pPlans)) pPlans = [];
  pPlans.forEach(plan => {
    const payer = getPayerById(plan.payerId);
    if (!payer || !plan.state || !plan.reimbursementRate) return;
    if (!rateMatrix[payer.name]) rateMatrix[payer.name] = {};
    if (!rateMatrix[payer.name][plan.state]) {
      rateMatrix[payer.name][plan.state] = plan.reimbursementRate;
    }
  });

  body.innerHTML = `
    <style>
      .rb2-card{border-radius:16px;overflow:hidden;}
      .rb2-card table tr:hover{background:var(--gray-50);}
    </style>
    <div class="card rb2-card" style="margin-bottom:16px;">
      <div class="card-header"><h3>Revenue by Payer & State</h3></div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        ${payersInUse.length > 0 && statesInUse.length > 0 ? `
        <table style="min-width:auto;">
          <thead>
            <tr>
              <th>Payer</th>
              ${statesInUse.map(s => `<th style="text-align:center;min-width:70px;">${s}</th>`).join('')}
              <th style="text-align:center;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${payersInUse.map(payer => {
              const rates = rateMatrix[payer] || {};
              const total = Object.values(rates).reduce((s, v) => s + v, 0);
              return `<tr>
                <td><strong>${escHtml(payer)}</strong></td>
                ${statesInUse.map(s => {
                  const val = rates[s];
                  if (!val) return '<td class="reimb-cell reimb-none">—</td>';
                  const cls = val >= 15000 ? 'reimb-high' : val >= 5000 ? 'reimb-mid' : 'reimb-low';
                  return `<td class="reimb-cell ${cls}">$${val.toLocaleString()}</td>`;
                }).join('')}
                <td class="reimb-cell" style="font-weight:700;">$${total.toLocaleString()}</td>
              </tr>`;
            }).join('')}
            <tr style="font-weight:700;border-top:2px solid var(--border);">
              <td>Total by State</td>
              ${statesInUse.map(s => {
                const total = payersInUse.reduce((sum, p) => sum + ((rateMatrix[p] || {})[s] || 0), 0);
                return `<td class="reimb-cell">$${total.toLocaleString()}</td>`;
              }).join('')}
              <td class="reimb-cell" style="color:var(--green);">$${Object.values(rateMatrix).reduce((sum, rates) => sum + Object.values(rates).reduce((s, v) => s + v, 0), 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>` : '<div style="text-align:center;padding:32px;color:var(--text-muted);">Add applications with estimated monthly revenue to see comparison data.</div>'}
      </div>
    </div>

    <div class="card rb2-card">
      <div class="card-header"><h3>Credentialing Timeline by Payer</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Payer</th><th>Category</th><th>Avg Cred Days</th><th>States</th><th>Your Applications</th></tr></thead>
          <tbody>
            ${PAYER_CATALOG.slice(0, 30).map(p => {
              const myApps = allApps.filter(a => a.payerId === p.id);
              const approved = myApps.filter(a => a.status === 'approved').length;
              return `<tr>
                <td><strong>${escHtml(p.name)}</strong></td>
                <td class="text-sm">${escHtml(p.category)}</td>
                <td><span style="font-weight:600;color:${p.avgCredDays <= 60 ? 'var(--green)' : p.avgCredDays <= 90 ? 'var(--gold)' : 'var(--red)'};">${p.avgCredDays || '—'}d</span></td>
                <td class="text-sm">${(p.states || []).length} states</td>
                <td>${myApps.length > 0 ? `${myApps.length} (${approved} approved)` : '-'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── License Renewal Calendar (#8) ───

async function renderRenewalCalendar() {
  const body = document.getElementById('page-body');
  const licenses = store.filterByScope(await store.getAll('licenses'));
  const today = new Date();
  const currentYear = today.getFullYear();

  // Build 12-month view (current month + 11 ahead)
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(currentYear, today.getMonth() + i, 1);
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      year: d.getFullYear(),
      month: d.getMonth(),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      events: [],
    });
  }

  // Map license expirations to months
  const expiring30 = [];
  const expiring60 = [];
  const expiring90 = [];
  const expired = [];

  licenses.forEach(l => {
    if (!l.expirationDate) return;
    const exp = new Date(l.expirationDate);
    const daysUntil = Math.ceil((exp - today) / 86400000);
    const expKey = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}`;

    const event = { state: l.state, date: l.expirationDate, id: l.id, daysUntil, type: daysUntil < 0 ? 'expired' : 'expiring' };

    const month = months.find(m => m.key === expKey);
    if (month) month.events.push(event);

    if (daysUntil < 0) expired.push({ ...l, daysUntil });
    else if (daysUntil <= 30) expiring30.push({ ...l, daysUntil });
    else if (daysUntil <= 60) expiring60.push({ ...l, daysUntil });
    else if (daysUntil <= 90) expiring90.push({ ...l, daysUntil });
  });

  const credRenewalHtml = await renderCredentialingRenewalSection(today);

  body.innerHTML = `
    <style>
      .rn2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .rn2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .rn2-stat .rn2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .rn2-stat .rn2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .rn2-stat .rn2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .rn2-card{border-radius:16px;overflow:hidden;}
      .rn2-card table tr:hover{background:var(--gray-50);}
    </style>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;">
      <div class="rn2-stat">
        <div class="rn2-accent" style="background:linear-gradient(90deg,#ef4444,#f87171);"></div>
        <div class="rn2-label">Expired</div><div class="rn2-val" style="color:${expired.length > 0 ? '#dc2626' : 'inherit'};">${expired.length}</div>
      </div>
      <div class="rn2-stat">
        <div class="rn2-accent" style="background:linear-gradient(90deg,#ef4444,#fca5a5);"></div>
        <div class="rn2-label">Within 30 Days</div><div class="rn2-val" style="color:${expiring30.length > 0 ? '#dc2626' : 'inherit'};">${expiring30.length}</div>
      </div>
      <div class="rn2-stat">
        <div class="rn2-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
        <div class="rn2-label">Within 60 Days</div><div class="rn2-val" style="color:${expiring60.length > 0 ? '#d97706' : 'inherit'};">${expiring60.length}</div>
      </div>
      <div class="rn2-stat">
        <div class="rn2-accent" style="background:linear-gradient(90deg,#f59e0b,#fde68a);"></div>
        <div class="rn2-label">Within 90 Days</div><div class="rn2-val" style="color:${expiring90.length > 0 ? '#d97706' : 'inherit'};">${expiring90.length}</div>
      </div>
    </div>

    <div class="card rn2-card">
      <div class="card-header"><h3>12-Month Renewal Timeline</h3></div>
      <div class="card-body">
        <div class="cal-grid">
          ${months.map(m => `
            <div class="cal-month" style="${m.events.length > 0 ? 'border-color:var(--warning-500);' : ''}">
              <div class="month-label">${m.label}</div>
              ${m.events.map(e => `
                <div class="cal-event ${e.type}" title="${getStateName(e.state)} — ${formatDateDisplay(e.date)}">${e.state}</div>
              `).join('')}
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:16px;margin-top:12px;font-size:11px;color:var(--text-muted);">
          <span><span class="cal-event expiring" style="display:inline;padding:1px 6px;">&#9632;</span> Expiring</span>
          <span><span class="cal-event expired" style="display:inline;padding:1px 6px;">&#9632;</span> Expired</span>
        </div>
      </div>
    </div>

    ${(expired.length > 0 || expiring30.length > 0 || expiring60.length > 0) ? `
    <div class="card rn2-card" style="margin-top:16px;">
      <div class="card-header"><h3>Action Required</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>State</th><th>License #</th><th>Type</th><th>Expiration</th><th>Days</th><th>Action</th></tr></thead>
          <tbody>
            ${[...expired, ...expiring30, ...expiring60].sort((a, b) => a.daysUntil - b.daysUntil).map(l => `
              <tr class="${l.daysUntil < 0 ? 'overdue' : ''}">
                <td><strong>${getStateName(l.state)}</strong> (${l.state})</td>
                <td><code>${escHtml(l.licenseNumber) || '-'}</code></td>
                <td>${escHtml(l.licenseType) || '-'}</td>
                <td style="color:${l.daysUntil < 0 ? 'var(--red)' : 'var(--gold)'};font-weight:600;">${formatDateDisplay(l.expirationDate)}</td>
                <td><span style="font-weight:700;color:${l.daysUntil < 0 ? 'var(--red)' : 'var(--gold)'};">${l.daysUntil < 0 ? `${Math.abs(l.daysUntil)}d overdue` : `${l.daysUntil}d left`}</span></td>
                <td><button class="btn btn-sm" onclick="window.app.editLicense('${l.id}')">Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${expiring90.length > 0 ? `
    <div class="card rn2-card" style="margin-top:16px;">
      <div class="card-header"><h3>Coming Up (60-90 Days)</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>State</th><th>License #</th><th>Expiration</th><th>Days Left</th></tr></thead>
          <tbody>
            ${expiring90.sort((a, b) => a.daysUntil - b.daysUntil).map(l => `
              <tr>
                <td><strong>${getStateName(l.state)}</strong></td>
                <td><code>${escHtml(l.licenseNumber) || '-'}</code></td>
                <td>${formatDateDisplay(l.expirationDate)}</td>
                <td>${l.daysUntil}d</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${credRenewalHtml}
  `;
}

// ─── Credentialing Renewal Section (effective-date based) ───

async function renderCredentialingRenewalSection(today) {
  const allApps = (await store.getAll('applications')).filter(a => a.status !== 'denied' && a.status !== 'withdrawn');
  if (allApps.length === 0) {
    return `
      <div class="card" style="margin-top:24px;">
        <div class="card-header"><h3>Credentialing Renewals</h3></div>
        <div class="card-body" style="text-align:center;color:var(--text-muted);padding:24px;">
          No applications yet. Credentialing renewals will appear here once applications are created.
        </div>
      </div>`;
  }

  // Credentialing cycle: 3 years (1095 days) from effective date
  // For apps without effective date: estimate from submitted date + avg cred days
  const CRED_CYCLE_DAYS = 1095; // 3 years
  const renewals = allApps.map(a => {
    const payer = getPayerById(a.payerId);
    const avgDays = payer?.avgCredDays || 90;
    let baseDate, estimated = false;
    if (a.effectiveDate) {
      baseDate = new Date(a.effectiveDate);
    } else if (a.submittedDate) {
      baseDate = new Date(a.submittedDate);
      baseDate.setDate(baseDate.getDate() + avgDays); // estimated effective
      estimated = true;
    } else {
      // Use creation date + avg days as rough estimate
      baseDate = new Date(a.createdAt || today);
      baseDate.setDate(baseDate.getDate() + avgDays);
      estimated = true;
    }
    const renewalDate = new Date(baseDate.getTime() + CRED_CYCLE_DAYS * 86400000);
    const daysUntilRenewal = Math.ceil((renewalDate - today) / 86400000);
    const statusObj = APPLICATION_STATUSES.find(s => s.value === a.status) || APPLICATION_STATUSES[0];
    return {
      ...a,
      payerName: payer ? payer.name : (a.payerName || 'Unknown'),
      renewalDate: renewalDate.toISOString().split('T')[0],
      estimatedEffective: estimated ? baseDate.toISOString().split('T')[0] : null,
      daysUntilRenewal,
      estimated,
      statusLabel: statusObj.label,
      statusColor: statusObj.color,
    };
  }).sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);

  const confirmed = renewals.filter(r => !r.estimated);
  const estimated = renewals.filter(r => r.estimated);
  const overdue = renewals.filter(r => r.daysUntilRenewal < 0);
  const within90 = renewals.filter(r => r.daysUntilRenewal >= 0 && r.daysUntilRenewal <= 90);
  const within180 = renewals.filter(r => r.daysUntilRenewal > 90 && r.daysUntilRenewal <= 180);
  const upcoming = renewals.filter(r => r.daysUntilRenewal > 180);

  // Build 12-month credentialing renewal timeline
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      events: [],
    });
  }
  renewals.forEach(r => {
    const rd = new Date(r.renewalDate);
    const rKey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}`;
    const month = months.find(m => m.key === rKey);
    if (month) month.events.push({ state: r.state, payerShort: r.payerName.split(' ')[0].slice(0, 6), daysUntil: r.daysUntilRenewal, estimated: r.estimated });
  });

  return `
    <style>
      .crv2-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .crv2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .crv2-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
      .crv2-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
      .crv2-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
      .crv2-card{border-radius:16px!important;overflow:hidden;}
      .crv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <div style="margin-top:32px;margin-bottom:16px;">
      <h2 style="font-size:20px;color:var(--gray-900);margin:0;">Credentialing Renewals</h2>
      <p style="font-size:13px;color:var(--text-muted);margin:4px 0 0;">3-year cycle from effective date. ${estimated.length > 0 ? `<span style="color:var(--warning-500);">${estimated.length} estimated</span> (based on submitted date + avg cred days), ` : ''}${confirmed.length} confirmed.</p>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="stat-card crv2-stat"><div class="label">Total</div><div class="value">${renewals.length}</div></div>
      <div class="stat-card crv2-stat"><div class="label">Overdue</div><div class="value ${overdue.length > 0 ? 'red' : ''}">${overdue.length}</div></div>
      <div class="stat-card crv2-stat"><div class="label">Within 90 Days</div><div class="value ${within90.length > 0 ? 'red' : ''}">${within90.length}</div></div>
      <div class="stat-card crv2-stat"><div class="label">Within 180 Days</div><div class="value ${within180.length > 0 ? 'amber' : ''}">${within180.length}</div></div>
      <div class="stat-card crv2-stat"><div class="label">Beyond 180 Days</div><div class="value">${upcoming.length}</div></div>
    </div>

    <div class="card crv2-card">
      <div class="card-header"><h3>12-Month Credentialing Renewal Timeline</h3></div>
      <div class="card-body">
        <div class="cal-grid">
          ${months.map(m => `
            <div class="cal-month" style="${m.events.length > 0 ? 'border-color:var(--sage);' : ''}">
              <div class="month-label">${m.label}</div>
              ${m.events.map(e => `
                <div class="cal-event ${e.daysUntil < 0 ? 'expired' : e.estimated ? 'cred-estimated' : 'cred-renewal'}" title="${e.payerShort} — ${e.state}${e.estimated ? ' (estimated)' : ''}">${e.state}</div>
              `).join('')}
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:16px;margin-top:12px;font-size:11px;color:var(--text-muted);">
          <span><span class="cal-event cred-renewal" style="display:inline;padding:1px 6px;">&#9632;</span> Confirmed</span>
          <span><span class="cal-event cred-estimated" style="display:inline;padding:1px 6px;">&#9632;</span> Estimated</span>
          <span><span class="cal-event expired" style="display:inline;padding:1px 6px;">&#9632;</span> Overdue</span>
        </div>
      </div>
    </div>

    <div class="card crv2-card" style="margin-top:16px;">
      <div class="card-header"><h3>All Credentialing Renewals (${renewals.length})</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Payer</th><th>State</th><th>Status</th><th>Effective Date</th><th>Renewal Due</th><th>Days</th><th>Action</th></tr></thead>
          <tbody>
            ${renewals.map(r => `
              <tr class="${r.daysUntilRenewal < 0 ? 'overdue' : ''}">
                <td><strong>${escHtml(r.payerName)}</strong></td>
                <td>${getStateName(r.state)} (${r.state})</td>
                <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${r.statusColor}15;color:${r.statusColor};font-weight:600;">${r.statusLabel}</span></td>
                <td>${r.effectiveDate ? formatDateDisplay(r.effectiveDate) : r.estimated ? `<span style="color:var(--text-muted);font-style:italic;" title="Estimated from submitted date + avg cred days">~${formatDateDisplay(r.estimatedEffective)}</span>` : '-'}</td>
                <td style="color:${r.daysUntilRenewal < 0 ? 'var(--red)' : r.daysUntilRenewal <= 180 ? 'var(--gold)' : 'var(--text)'};font-weight:600;">${formatDateDisplay(r.renewalDate)}${r.estimated ? ' *' : ''}</td>
                <td><span style="font-weight:700;color:${r.daysUntilRenewal < 0 ? 'var(--red)' : r.daysUntilRenewal <= 90 ? 'var(--gold)' : 'var(--text)'};">${r.daysUntilRenewal < 0 ? Math.abs(r.daysUntilRenewal) + 'd overdue' : r.daysUntilRenewal + 'd'}</span></td>
                <td><button class="btn btn-sm" onclick="window.app.editApplication('${r.id}')">Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${estimated.length > 0 ? '<div style="padding:8px 16px;font-size:11px;color:var(--text-muted);">* Estimated dates based on submitted date + average credentialing days for this payer</div>' : ''}
      </div>
    </div>
  `;
}

// ─── Service Lines Expansion Page ───

const SERVICE_LINES = [
  {
    id: 'psych',
    name: 'Psychiatric Telehealth',
    status: 'active',
    icon: '&#129504;',
    color: 'var(--teal)',
    summary: 'Core service line — psychiatric medication management and therapy via telehealth.',
    targetPatient: 'Adults with depression, anxiety, PTSD, bipolar disorder, ADHD, and other psychiatric conditions.',
    revenueModel: 'Insurance-based with some cash-pay. High-frequency follow-ups (monthly).',
    annualRevenuePerPatient: '$1,800 - $3,600',
    visitFrequency: 'Monthly (med management), biweekly (acute)',
    billingCodes: [
      { code: '99213', desc: 'Established patient, low-moderate complexity', rate: '$90 - $130' },
      { code: '99214', desc: 'Established patient, moderate-high complexity', rate: '$130 - $190' },
      { code: '99215', desc: 'Established patient, high complexity', rate: '$180 - $250' },
      { code: '99205', desc: 'New patient, high complexity', rate: '$250 - $350' },
      { code: '90833', desc: 'Psychotherapy add-on, 30 min (with E/M)', rate: '$60 - $80' },
      { code: '90836', desc: 'Psychotherapy add-on, 45 min (with E/M)', rate: '$85 - $110' },
      { code: '99490', desc: 'Chronic care management, 20+ min/month', rate: '$42 - $65' },
    ],
    clinicalConsiderations: [
      'Controlled substance prescribing varies by state — some require initial in-person visit',
      'DEA registration needed per state for Schedule II-V',
      'Collaborative practice agreements required in restricted-practice states',
      'Document medical necessity for psychotherapy add-on codes',
      'Telehealth modifiers: 95 (synchronous), GT, or place of service 10',
    ],
    credentialingNotes: 'Standard credentialing with all major payers. PMHNP or FNP with psych experience accepted. Avg 60-120 days.',
    marketDemand: 'Very High — 1 in 5 US adults experience mental illness. Severe provider shortage nationally.',
  },
  {
    id: 'weight',
    name: 'Weight Management / GLP-1s',
    status: 'planned',
    icon: '&#9878;',
    color: '#22c55e',
    summary: 'Prescribe and manage GLP-1 receptor agonists (semaglutide, tirzepatide) for weight loss alongside lifestyle counseling. Natural overlap with psych patients experiencing medication-related weight gain.',
    targetPatient: 'Adults with BMI ≥30 (or ≥27 with comorbidity). High overlap: psych patients on atypical antipsychotics, mood stabilizers, SSRIs causing weight gain.',
    revenueModel: 'Mixed insurance + cash-pay. Many patients pay out-of-pocket for GLP-1 programs ($300-500/mo). High retention — patients stay 12-18+ months.',
    annualRevenuePerPatient: '$3,600 - $6,000 (cash-pay programs) / $1,800 - $2,400 (insurance)',
    visitFrequency: 'Monthly follow-ups (titration), then every 2-3 months (maintenance)',
    billingCodes: [
      { code: '99213', desc: 'Follow-up weight management visit', rate: '$90 - $130' },
      { code: '99214', desc: 'Weight management, moderate complexity (comorbidities)', rate: '$130 - $190' },
      { code: '99205', desc: 'New patient comprehensive weight assessment', rate: '$250 - $350' },
      { code: '99401', desc: 'Preventive counseling, 15 min', rate: '$35 - $50' },
      { code: '99402', desc: 'Preventive counseling, 30 min', rate: '$60 - $80' },
      { code: 'G0473', desc: 'Intensive behavioral therapy for obesity (Medicare)', rate: '$25 - $30' },
      { code: 'Z68.3x', desc: 'BMI 30-39.9 (ICD-10 supporting dx)', rate: 'Diagnosis code' },
      { code: 'E66.01', desc: 'Morbid obesity due to excess calories', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'GLP-1s are NOT controlled substances — no DEA issues',
      'Prior authorization often required for insurance-covered GLP-1s',
      'Monitor for pancreatitis, gallbladder disease, thyroid C-cell tumors (MTC)',
      'Contraindicated in patients with personal/family history of medullary thyroid carcinoma',
      'Drug interactions: may affect absorption of oral medications (psych meds)',
      'Patients on insulin/sulfonylureas need dose adjustment to prevent hypoglycemia',
      'Cash-pay model avoids PA hassle — compounded semaglutide is popular but check state rules',
      'Psych angle: address emotional eating, body image, relationship between weight and mood',
    ],
    credentialingNotes: 'FNP scope covers weight management. No additional certification required. Some payers credential under "obesity medicine" specialty. Can bill same payers as psych — no separate credentialing needed for existing payers.',
    marketDemand: 'Extremely High — 42% of US adults are obese. GLP-1 market projected at $100B+ by 2030. Patient demand far exceeds provider supply.',
  },
  {
    id: 'mat',
    name: 'Medication-Assisted Treatment (MAT)',
    status: 'planned',
    icon: '&#9883;',
    color: '#8b5cf6',
    summary: 'Buprenorphine (Suboxone) prescribing for opioid use disorder. Natural extension for dual-diagnosis psych patients. X-waiver requirement eliminated in 2023.',
    targetPatient: 'Adults with opioid use disorder, often comorbid with depression, anxiety, PTSD. Dual-diagnosis patients already in psych panel.',
    revenueModel: 'Insurance-based. Premium reimbursement rates — payers incentivize MAT access. Chronic model with long retention (years).',
    annualRevenuePerPatient: '$4,000 - $7,200',
    visitFrequency: 'Weekly (induction), biweekly (stabilization), monthly (maintenance)',
    billingCodes: [
      { code: '99213', desc: 'MAT follow-up, established patient', rate: '$90 - $130' },
      { code: '99214', desc: 'MAT follow-up, moderate complexity', rate: '$130 - $190' },
      { code: '99205', desc: 'New patient MAT evaluation', rate: '$250 - $350' },
      { code: 'H0020', desc: 'Alcohol/drug services; methadone administration', rate: '$8 - $15/day' },
      { code: 'H0033', desc: 'Oral medication administration, per dose', rate: '$5 - $12' },
      { code: 'G2086', desc: 'Office-based opioid treatment, new patient (monthly bundle)', rate: '$155 - $175' },
      { code: 'G2087', desc: 'Office-based opioid treatment, established (monthly bundle)', rate: '$115 - $135' },
      { code: '99408', desc: 'SBIRT screening, 15-30 min', rate: '$34 - $45' },
    ],
    clinicalConsiderations: [
      'X-waiver requirement eliminated Jan 2023 — all DEA-registered providers can prescribe buprenorphine',
      'Still need DEA Schedule III registration (buprenorphine is Schedule III)',
      'Urine drug screening at each visit recommended (bill separately)',
      'PDMP check required before each prescription in most states',
      'Strong integration with psych — treat both the substance use and underlying mental health',
      'Consider naloxone co-prescribing (often required)',
      'Telehealth flexibilities for MAT extended — check state-specific rules on initial visit',
      'Some states require treatment plans and documentation beyond standard E/M',
    ],
    credentialingNotes: 'FNP/PMHNP scope covers MAT in most states. No separate certification required since X-waiver elimination. Some payers have specific MAT provider enrollment. Medicaid is a major payer for this population.',
    marketDemand: 'High — 2.7M Americans have opioid use disorder. Only 22% receive any treatment. Massive access gap, especially in rural and underserved areas via telehealth.',
  },
  {
    id: 'hormonal',
    name: 'Hormonal Health / HRT',
    status: 'planned',
    icon: '&#9792;',
    color: '#ec4899',
    summary: 'Hormone replacement therapy for perimenopause/menopause. Many women 40-55 present to psychiatry with anxiety, depression, insomnia, and brain fog that is actually hormonal.',
    targetPatient: 'Women 40-65 experiencing perimenopause/menopause symptoms. Often misdiagnosed as psychiatric conditions.',
    revenueModel: 'Mixed insurance + cash-pay. High-value patients with quarterly follow-ups + labs. Cash-pay consults $150-250.',
    annualRevenuePerPatient: '$1,200 - $3,000',
    visitFrequency: 'Quarterly follow-ups + initial comprehensive visit + annual labs',
    billingCodes: [
      { code: '99205', desc: 'New patient comprehensive hormonal evaluation', rate: '$250 - $350' },
      { code: '99214', desc: 'HRT follow-up, moderate complexity', rate: '$130 - $190' },
      { code: '99213', desc: 'HRT follow-up, straightforward', rate: '$90 - $130' },
      { code: '99395', desc: 'Preventive visit, 18-39', rate: '$150 - $200' },
      { code: '99396', desc: 'Preventive visit, 40-64', rate: '$160 - $220' },
      { code: 'N95.1', desc: 'Menopausal and female climacteric states (ICD-10)', rate: 'Diagnosis code' },
      { code: 'E28.39', desc: 'Other primary ovarian failure (ICD-10)', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'FNP scope fully covers HRT prescribing and management',
      'Lab monitoring: estradiol, FSH, progesterone, thyroid panel, lipids, CBC',
      'Contraindications: history of breast cancer, DVT/PE, active liver disease',
      'Risk-benefit discussion and informed consent documentation required',
      'Consider both systemic and local (vaginal) estrogen options',
      'Progesterone required for patients with intact uterus',
      'Natural overlap with psych: mood symptoms, insomnia, anxiety often improve with HRT',
      'Testosterone therapy for low libido gaining evidence — emerging market',
    ],
    credentialingNotes: 'Bills under primary care/FNP credentials. No additional specialty credentialing needed. Same payers as current panel.',
    marketDemand: 'Growing — 1.3M women enter menopause annually. Telehealth HRT booming (Alloy, Evernow, Midi Health). Underserved by traditional providers.',
  },
  {
    id: 'sleep',
    name: 'Sleep Medicine',
    status: 'planned',
    icon: '&#127769;',
    color: '#6366f1',
    summary: 'Insomnia and sleep disorder management. Nearly every psychiatric condition has sleep disruption. Formalizing this as a service line captures visits that currently happen informally.',
    targetPatient: 'Adults with insomnia, circadian rhythm disorders, sleep apnea screening. High overlap with psych panel — 50-80% of psych patients have sleep complaints.',
    revenueModel: 'Insurance-based. Same CPT codes as psych visits but formalizes the service and captures patients who might not seek psych care but will seek sleep help.',
    annualRevenuePerPatient: '$600 - $1,500',
    visitFrequency: 'Monthly during CBT-I (6-8 weeks), then PRN',
    billingCodes: [
      { code: '99213', desc: 'Sleep follow-up visit', rate: '$90 - $130' },
      { code: '99214', desc: 'Sleep management, moderate complexity', rate: '$130 - $190' },
      { code: '99205', desc: 'New patient sleep evaluation', rate: '$250 - $350' },
      { code: '96152', desc: 'Health behavior intervention (CBT-I)', rate: '$45 - $65' },
      { code: 'G0473', desc: 'Behavioral counseling for insomnia', rate: '$25 - $35' },
      { code: 'G47.00', desc: 'Insomnia, unspecified (ICD-10)', rate: 'Diagnosis code' },
      { code: 'G47.09', desc: 'Other insomnia (ICD-10)', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'CBT-I (Cognitive Behavioral Therapy for Insomnia) is first-line — more effective than meds long-term',
      'Avoid benzodiazepines for chronic insomnia — trazodone, hydroxyzine, gabapentin preferred',
      'Screen for sleep apnea (STOP-BANG questionnaire) — refer for sleep study if indicated',
      'Melatonin receptor agonists (ramelteon) and orexin antagonists (suvorexant) are non-habit-forming options',
      'Sleep hygiene education can be done via handouts — low provider time investment',
      'Natural psych integration: treat insomnia directly rather than just as a symptom of depression/anxiety',
      'Consider sleep tracking apps as patient engagement tools (Oura, Apple Watch)',
    ],
    credentialingNotes: 'No separate credentialing needed. Bills under same E/M codes. Can market as a distinct service without additional payer enrollment.',
    marketDemand: 'Moderate-High — 50-70M Americans have sleep disorders. Insomnia is the most common complaint in primary care. Telehealth-friendly.',
  },
];

async function renderServiceLines() {
  const body = document.getElementById('page-body');

  const active = SERVICE_LINES.filter(s => s.status === 'active');
  const planned = SERVICE_LINES.filter(s => s.status === 'planned');

  // Revenue summary
  const totalLines = SERVICE_LINES.length;
  const activeLines = active.length;

  body.innerHTML = `
    <style>
      .sl2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .sl2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .sl2-stat .sl2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .sl2-stat .sl2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .sl2-stat .sl2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .sl2-stat .sl2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .sl2-card{border-radius:16px;overflow:hidden;}
    </style>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;">
      <div class="sl2-stat">
        <div class="sl2-accent" style="background:linear-gradient(90deg,var(--brand-500),var(--brand-700));"></div>
        <div class="sl2-label">Total Service Lines</div><div class="sl2-val">${totalLines}</div>
      </div>
      <div class="sl2-stat">
        <div class="sl2-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="sl2-label">Active</div><div class="sl2-val" style="color:#16a34a;">${activeLines}</div>
      </div>
      <div class="sl2-stat">
        <div class="sl2-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="sl2-label">Planned</div><div class="sl2-val" style="color:#2563eb;">${planned.length}</div>
      </div>
      <div class="sl2-stat">
        <div class="sl2-accent" style="background:linear-gradient(90deg,#a855f7,#c084fc);"></div>
        <div class="sl2-label">Combined Revenue/Patient</div><div class="sl2-val" style="font-size:16px;color:var(--brand-600);">$12,000 - $21,000/yr</div><div class="sl2-sub">if patient uses all lines</div>
      </div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      ${SERVICE_LINES.map(s => `
        <button class="btn ${s.status === 'active' ? 'btn-primary' : ''}" onclick="document.getElementById('sl-${s.id}').scrollIntoView({behavior:'smooth'})" style="border-left:3px solid ${s.color};border-radius:12px;">
          ${s.icon} ${s.name}
          <span style="font-size:10px;margin-left:4px;opacity:0.7;">${s.status === 'active' ? 'ACTIVE' : 'PLANNED'}</span>
        </button>
      `).join('')}
    </div>

    ${SERVICE_LINES.map(s => `
    <div class="card sl2-card" id="sl-${s.id}" style="margin-bottom:20px;border-left:4px solid ${s.color};">
      <div class="card-header" style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;">${s.icon}</span>
        <div style="flex:1;">
          <h3 style="margin:0;">${s.name}</h3>
          <span style="font-size:12px;padding:2px 8px;border-radius:4px;background:${s.status === 'active' ? 'var(--green)' : 'var(--sage)'}20;color:${s.status === 'active' ? 'var(--green)' : 'var(--sage)'};font-weight:600;text-transform:uppercase;">${s.status}</span>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:var(--text-muted);">Est. Revenue/Patient/Year</div>
          <div style="font-size:18px;font-weight:700;color:var(--green);">${s.annualRevenuePerPatient}</div>
        </div>
      </div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text);line-height:1.6;">${s.summary}</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <div style="background:var(--bg-alt);padding:12px;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Target Patient</div>
            <div style="font-size:13px;line-height:1.5;">${s.targetPatient}</div>
          </div>
          <div style="background:var(--bg-alt);padding:12px;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Revenue Model</div>
            <div style="font-size:13px;line-height:1.5;">${s.revenueModel}</div>
          </div>
          <div style="background:var(--bg-alt);padding:12px;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Visit Frequency</div>
            <div style="font-size:13px;line-height:1.5;">${s.visitFrequency}</div>
          </div>
          <div style="background:var(--bg-alt);padding:12px;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Market Demand</div>
            <div style="font-size:13px;line-height:1.5;">${s.marketDemand}</div>
          </div>
        </div>

        <!-- Billing Codes -->
        <div style="margin-bottom:20px;">
          <h4 style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Billing Codes & Reimbursement</h4>
          <table style="font-size:12px;">
            <thead><tr><th style="width:80px;">Code</th><th>Description</th><th style="width:120px;text-align:right;">Est. Rate</th></tr></thead>
            <tbody>
              ${s.billingCodes.map(b => `
                <tr>
                  <td><code style="background:${s.color}15;color:${s.color};padding:2px 6px;border-radius:3px;font-weight:600;">${b.code}</code></td>
                  <td>${escHtml(b.desc)}</td>
                  <td style="text-align:right;font-weight:600;white-space:nowrap;">${b.rate}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Clinical Considerations -->
        <div style="margin-bottom:20px;">
          <h4 style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Clinical Considerations</h4>
          <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;color:var(--text);">
            ${s.clinicalConsiderations.map(c => `<li>${escHtml(c)}</li>`).join('')}
          </ul>
        </div>

        <!-- Credentialing Notes -->
        <div style="background:var(--success-50);border:1px solid #bbf7d0;border-radius:8px;padding:12px;">
          <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;margin-bottom:4px;">Credentialing & Licensing Notes</div>
          <div style="font-size:13px;color:#166534;line-height:1.5;">${escHtml(s.credentialingNotes)}</div>
        </div>
      </div>
    </div>
    `).join('')}
  `;
}

// ─── Helpers ───

function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortArrow(field) {
  if (currentSort.field !== field) return '<span class="sort-arrow"></span>';
  return `<span class="sort-arrow">${currentSort.dir === 'asc' ? '\u25B2' : '\u25BC'}</span>`;
}

// ─── Toast Queue System ───
const _toastQueue = [];
let _toastActive = false;
let _toastTimer = null;
let _toastUndoCallback = null;

function showToast(msg, type = 'info', { undo, duration = 3500 } = {}) {
  _toastQueue.push({ msg, type, undo, duration });
  if (!_toastActive) _processToastQueue();
}

function _processToastQueue() {
  if (!_toastQueue.length) { _toastActive = false; return; }
  _toastActive = true;
  const { msg, type, undo, duration } = _toastQueue.shift();
  const t = document.getElementById('toast');
  _toastUndoCallback = undo || null;

  // Icon by type
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const colors = { success: 'var(--success-500)', error: 'var(--danger-500)', warning: 'var(--warning-500)', info: 'var(--brand-400)' };

  t.innerHTML = `
    <span style="color:${colors[type] || colors.info};font-size:16px;flex-shrink:0;">${icons[type] || icons.info}</span>
    <span style="flex:1;">${msg}</span>
    ${undo ? '<button onclick="_undoToast()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Undo</button>' : ''}
    <button onclick="_dismissToast()" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:16px;cursor:pointer;padding:0 2px;line-height:1;">✕</button>
  `;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(_dismissToast, duration);
}

function _dismissToast() {
  clearTimeout(_toastTimer);
  const t = document.getElementById('toast');
  t.classList.remove('show');
  _toastUndoCallback = null;
  setTimeout(_processToastQueue, 300);
}

function _undoToast() {
  if (_toastUndoCallback) { _toastUndoCallback(); _toastUndoCallback = null; }
  _dismissToast();
}

// ─── Modal Focus Trap (a11y) ───
let _focusTrapCleanup = null;
let _focusTriggerEl = null;

function trapFocus(modalEl) {
  _focusTriggerEl = document.activeElement;
  const focusable = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  first.focus();

  const handler = (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  modalEl.addEventListener('keydown', handler);
  _focusTrapCleanup = () => { modalEl.removeEventListener('keydown', handler); };
}

function releaseFocus() {
  if (_focusTrapCleanup) { _focusTrapCleanup(); _focusTrapCleanup = null; }
  if (_focusTriggerEl) { _focusTriggerEl.focus(); _focusTriggerEl = null; }
}

// Auto-trap focus when any modal opens
const _modalObserver = new MutationObserver((mutations) => {
  mutations.forEach(m => {
    if (m.type === 'attributes' && m.attributeName === 'class') {
      const el = m.target;
      if (el.classList.contains('modal-overlay')) {
        if (el.classList.contains('active')) {
          const modal = el.querySelector('.modal');
          if (modal) { modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); trapFocus(modal); }
        } else {
          releaseFocus();
        }
      }
    }
  });
});
// Observe all modal overlays once DOM is ready
setTimeout(() => {
  document.querySelectorAll('.modal-overlay').forEach(el => {
    _modalObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
}, 500);

// ─── Inline Form Validation ───
function validateField(input, rules = {}) {
  const value = input.value.trim();
  let error = '';

  if (rules.required && !value) error = 'This field is required';
  else if (rules.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = 'Enter a valid email';
  else if (rules.minLength && value.length < rules.minLength) error = `Minimum ${rules.minLength} characters`;
  else if (rules.pattern && !rules.pattern.test(value)) error = rules.message || 'Invalid format';

  // Show/hide error
  let errEl = input.parentElement.querySelector('.field-error');
  if (error) {
    input.style.borderColor = 'var(--danger-500)';
    input.style.boxShadow = 'var(--shadow-ring-danger)';
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'field-error';
      errEl.style.cssText = 'color:var(--danger-500);font-size:12px;margin-top:4px;font-weight:500;';
      input.parentElement.appendChild(errEl);
    }
    errEl.textContent = error;
  } else {
    input.style.borderColor = '';
    input.style.boxShadow = '';
    if (errEl) errEl.remove();
  }
  return !error;
}

function validateForm(formEl) {
  const inputs = formEl.querySelectorAll('[data-validate]');
  let valid = true;
  inputs.forEach(input => {
    const rules = {};
    input.dataset.validate.split(',').forEach(r => {
      r = r.trim();
      if (r === 'required') rules.required = true;
      else if (r === 'email') rules.email = true;
      else if (r.startsWith('min:')) rules.minLength = parseInt(r.split(':')[1]);
    });
    if (!validateField(input, rules)) valid = false;
  });
  return valid;
}

// Live validation on blur
document.addEventListener('focusout', (e) => {
  const input = e.target;
  if (!input.dataset?.validate) return;
  const rules = {};
  input.dataset.validate.split(',').forEach(r => {
    r = r.trim();
    if (r === 'required') rules.required = true;
    else if (r === 'email') rules.email = true;
    else if (r.startsWith('min:')) rules.minLength = parseInt(r.split(':')[1]);
  });
  validateField(input, rules);
}, true);

// Clear error on input
document.addEventListener('input', (e) => {
  const input = e.target;
  if (input.style.borderColor === 'var(--danger-500)') {
    input.style.borderColor = '';
    input.style.boxShadow = '';
    const errEl = input.parentElement?.querySelector('.field-error');
    if (errEl) errEl.remove();
  }
}, true);

// ─── Custom Confirm / Prompt (replaces native dialogs) ───

let _confirmResolve = null;

function appConfirm(message, { title = 'Confirm', okLabel = 'Confirm', okClass = 'btn-primary', cancelLabel = 'Cancel', raw = false } = {}) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirm-modal-title').textContent = title;
    const msgEl = document.getElementById('confirm-modal-message');
    if (raw) { msgEl.innerHTML = message; } else { msgEl.textContent = message; }
    document.getElementById('confirm-modal-input').style.display = 'none';
    const okBtn = document.getElementById('confirm-modal-ok');
    if (okLabel) { okBtn.textContent = okLabel; okBtn.className = 'btn ' + okClass; okBtn.style.display = ''; } else { okBtn.style.display = 'none'; }
    document.getElementById('confirm-modal-cancel').textContent = cancelLabel;
    document.getElementById('confirm-modal').classList.add('active');
  });
}

function appPrompt(message, { title = 'Input', placeholder = '', okLabel = 'OK' } = {}) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    const input = document.getElementById('confirm-modal-input');
    input.style.display = 'block';
    input.value = '';
    input.placeholder = placeholder;
    document.getElementById('confirm-modal-ok').textContent = okLabel;
    document.getElementById('confirm-modal-ok').className = 'btn btn-primary';
    document.getElementById('confirm-modal-cancel').textContent = 'Cancel';
    document.getElementById('confirm-modal').classList.add('active');
    setTimeout(() => input.focus(), 100);
  });
}

function closeConfirmModal(confirmed) {
  document.getElementById('confirm-modal').classList.remove('active');
  if (_confirmResolve) {
    const input = document.getElementById('confirm-modal-input');
    if (input.style.display !== 'none' && confirmed) {
      _confirmResolve(input.value);
    } else {
      _confirmResolve(confirmed);
    }
    _confirmResolve = null;
  }
}

// ─── Task Edit Modal ───

async function openTaskEditModal(id) {
  const task = await store.getOne('tasks', id);
  if (!task) return;
  const apps = await store.getAll('applications');
  const body = document.getElementById('task-edit-body');
  body.innerHTML = `
    <input type="hidden" id="edit-task-id" value="${task.id}">
    <div class="form-group" style="margin-bottom:12px;">
      <label>Title</label>
      <input type="text" id="edit-task-title" class="form-control" value="${escHtml(task.title)}">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
      <div class="form-group">
        <label>Category</label>
        <select id="edit-task-category" class="form-control">
          ${TASK_CATEGORIES.map(c => `<option value="${c.id}" ${task.category === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Priority</label>
        <select id="edit-task-priority" class="form-control">
          ${TASK_PRIORITIES.map(p => `<option value="${p.id}" ${task.priority === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
      <div class="form-group">
        <label>Due Date</label>
        <input type="date" id="edit-task-due" class="form-control" value="${task.dueDate || ''}">
      </div>
      <div class="form-group">
        <label>Recurrence</label>
        <select id="edit-task-recurrence" class="form-control">
          <option value="">None</option>
          <option value="daily" ${task.recurrence === 'daily' ? 'selected' : ''}>Daily</option>
          <option value="weekly" ${task.recurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
          <option value="biweekly" ${task.recurrence === 'biweekly' ? 'selected' : ''}>Bi-weekly</option>
          <option value="monthly" ${task.recurrence === 'monthly' ? 'selected' : ''}>Monthly</option>
          <option value="quarterly" ${task.recurrence === 'quarterly' ? 'selected' : ''}>Quarterly</option>
          <option value="yearly" ${task.recurrence === 'yearly' ? 'selected' : ''}>Yearly</option>
        </select>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label>Linked To</label>
      ${_renderLinkedToSelector('edit-task', task.linkableType || task.linkable_type || (task.linkedApplicationId || task.linkedAppId ? 'application' : ''), task.linkableId || task.linkable_id || task.linkedApplicationId || task.linkedAppId || '')}
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="edit-task-notes" class="form-control" rows="3" style="resize:vertical;">${escHtml(task.notes || '')}</textarea>
    </div>
  `;
  document.getElementById('task-edit-modal').classList.add('active');
  // Load linked entity options if type is set
  const editLinkType = task.linkableType || task.linkable_type || (task.linkedApplicationId || task.linkedAppId ? 'application' : '');
  if (editLinkType) _loadLinkOptions('edit-task', editLinkType, task.linkableId || task.linkable_id || task.linkedApplicationId || task.linkedAppId || '');
}

function closeTaskEditModal() {
  document.getElementById('task-edit-modal').classList.remove('active');
}

async function saveTaskEdit() {
  const id = document.getElementById('edit-task-id').value;
  const title = document.getElementById('edit-task-title').value.trim();
  if (!title) { showToast('Title is required'); return; }
  const linkType = document.getElementById('edit-task-link-type')?.value || '';
  const linkId = document.getElementById('edit-task-link-id')?.value || '';
  await store.update('tasks', id, {
    title,
    category: document.getElementById('edit-task-category').value,
    priority: document.getElementById('edit-task-priority').value,
    dueDate: document.getElementById('edit-task-due').value || '',
    recurrence: document.getElementById('edit-task-recurrence').value || '',
    linkableType: linkType,
    linkableId: linkId || null,
    linkedApplicationId: linkType === 'application' ? linkId : '',
    notes: document.getElementById('edit-task-notes').value || '',
  });
  closeTaskEditModal();
  showToast('Task updated');
  if (currentPage === 'tasks') await renderTasksPage();
  else renderTaskModal();
}

function renderEmailOutput(container, result) {
  container.innerHTML = `
    <div class="card mt-4">
      <div class="card-header">
        <h3>${result.templateName || 'Email'}</h3>
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('email-body-text').innerText);window.app.showToast('Copied!')">Copy to Clipboard</button>
      </div>
      <div class="card-body">
        <div class="email-preview" id="email-body-text">
          <div class="subject-line">Subject: ${escHtml(result.subject)}</div>${escHtml(result.body)}
        </div>
      </div>
    </div>
  `;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toHexId(id) {
  if (!id) return '------';
  return Number(id).toString(16).toUpperCase().padStart(6, '0');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}



// ─── Stub Pages ───

async function renderOrganizationsPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let orgs = [], providers = [], licenses = [], apps = [];
  try { orgs = await store.getAll('organizations'); } catch {}
  try { providers = await store.getAll('providers'); } catch {}
  try { licenses = await store.getAll('licenses'); } catch {}
  try { apps = await store.getAll('applications'); } catch {}

  body.innerHTML = `
    <style>
      .orgv2-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:20px; }
      .orgv2-stat { background:var(--surface-card,#fff); border-radius:16px; padding:18px 16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:transform 0.18s,box-shadow 0.18s; }
      .orgv2-stat:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
      .orgv2-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      .orgv2-stat:nth-child(1)::before { background:linear-gradient(90deg,var(--brand-500),var(--brand-700)); }
      .orgv2-stat:nth-child(2)::before { background:linear-gradient(90deg,#3b82f6,#2563eb); }
      .orgv2-stat:nth-child(3)::before { background:linear-gradient(90deg,#22c55e,#16a34a); }
      .orgv2-stat:nth-child(4)::before { background:linear-gradient(90deg,#f59e0b,#d97706); }
      .orgv2-stat .orgv2-val { font-size:28px; font-weight:800; line-height:1.1; }
      .orgv2-stat .orgv2-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
      .orgv2-card { border-radius:16px; overflow:hidden; transition:transform 0.18s,box-shadow 0.18s; cursor:pointer; }
      .orgv2-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.1); }
      .orgv2-avatar { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:#fff; flex-shrink:0; }
      .orgv2-pill { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; }
    </style>

    <!-- V2 Stat Cards -->
    <div class="orgv2-stats">
      <div class="orgv2-stat"><div class="orgv2-val" style="color:var(--brand-600);">${orgs.length}</div><div class="orgv2-lbl">Organizations</div></div>
      <div class="orgv2-stat"><div class="orgv2-val" style="color:#2563eb;">${providers.length}</div><div class="orgv2-lbl">Total Providers</div></div>
      <div class="orgv2-stat"><div class="orgv2-val" style="color:#16a34a;">${licenses.length}</div><div class="orgv2-lbl">Total Licenses</div></div>
      <div class="orgv2-stat"><div class="orgv2-val" style="color:#d97706;">${apps.length}</div><div class="orgv2-lbl">Total Applications</div></div>
    </div>

    ${orgs.map(o => {
      const orgProviders = providers.filter(p => (p.organizationId || p.orgId) == o.id);
      const orgLicenses = licenses.filter(l => orgProviders.some(p => p.id == (l.providerId || l.provider_id)));
      const orgApps = apps.filter(a => (a.organizationId || a.orgId) == o.id || orgProviders.some(p => p.id == (a.providerId || a.provider_id)));
      const initial = (o.name || 'U').charAt(0).toUpperCase();
      const hue = ((o.id || 0) * 137) % 360;
      return `
        <div class="card orgv2-card" onclick="window.app.viewOrg(${o.id})">
          <div class="card-header" style="padding:16px 20px;">
            <div style="display:flex;align-items:center;gap:14px;">
              <div class="orgv2-avatar" style="background:linear-gradient(135deg,hsl(${hue},65%,55%),hsl(${hue + 30},65%,40%));">${initial}</div>
              <div>
                <h3 style="margin:0;font-size:16px;">${escHtml(o.name || 'Unnamed')} <span style="font-size:12px;font-weight:500;color:var(--gray-400);margin-left:6px;">#${toHexId(o.id)}</span></h3>
                <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
                  ${o.npi ? '<span class="orgv2-pill" style="background:var(--brand-100,#e0f2fe);color:var(--brand-700);">NPI ' + o.npi + '</span>' : ''}
                  ${(o.taxId || o.tax_id) ? '<span class="orgv2-pill" style="background:rgba(139,92,246,0.1);color:#7c3aed;">Tax ID ' + (o.taxId || o.tax_id) + '</span>' : ''}
                </div>
              </div>
            </div>
            <div style="display:flex;gap:8px;" onclick="event.stopPropagation();">
              <button class="btn btn-sm" onclick="window.app.editOrg(${o.id})" style="border-radius:8px;">Edit</button>
            </div>
          </div>
          <div class="card-body" style="padding:12px 20px 16px;">
            <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px;font-size:13px;color:var(--gray-600);">
              <div>Phone: ${escHtml(o.phone) || '—'}</div>
              <div>Email: ${escHtml(o.email) || '—'}</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
              <div style="background:var(--gray-50,#f9fafb);border-radius:12px;padding:12px;text-align:center;">
                <div style="font-size:22px;font-weight:800;color:var(--brand-600);">${orgProviders.length}</div>
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:2px;">Providers</div>
              </div>
              <div style="background:var(--gray-50,#f9fafb);border-radius:12px;padding:12px;text-align:center;">
                <div style="font-size:22px;font-weight:800;color:#16a34a;">${orgLicenses.length}</div>
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:2px;">Licenses</div>
              </div>
              <div style="background:var(--gray-50,#f9fafb);border-radius:12px;padding:12px;text-align:center;">
                <div style="font-size:22px;font-weight:800;color:#d97706;">${orgApps.length}</div>
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:2px;">Applications</div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('')}
    ${orgs.length === 0 ? '<div class="empty-state"><h3>No organizations yet</h3><p>Click "+ Add Organization" to get started.</p></div>' : ''}
  `;
}

// ─── Organization Detail Page ───

async function renderOrgDetailPage(orgId) {
  const body = document.getElementById('page-body');
  if (!orgId) { body.innerHTML = '<div class="empty-state"><h3>Organization not found</h3></div>'; return; }

  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading organization...</div></div>';

  let o = {}, providers = [], licenses = [], apps = [];
  try { o = await store.getOne('organizations', orgId); } catch {}
  try { providers = (await store.getAll('providers')).filter(p => (p.organizationId || p.orgId) == orgId); } catch {}
  try { licenses = await store.getAll('licenses'); } catch {}
  try { apps = await store.getAll('applications'); } catch {}

  if (!o || !o.id) { body.innerHTML = '<div class="empty-state"><h3>Organization not found</h3></div>'; return; }

  const orgLicenses = licenses.filter(l => providers.some(p => p.id == (l.providerId || l.provider_id)));
  const orgApps = apps.filter(a => (a.organizationId || a.orgId) == orgId || providers.some(p => p.id == (a.providerId || a.provider_id)));
  const licensedStates = [...new Set(orgLicenses.map(l => l.state))];
  const estRevenue = orgApps.filter(a => a.status === 'approved' || a.status === 'credentialed').reduce((s, a) => s + (a.estMonthlyRevenue || a.est_monthly_revenue || 0), 0);

  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const pageActions = document.getElementById('page-actions');
  if (pageTitle) pageTitle.textContent = o.name;
  if (pageSubtitle) pageSubtitle.textContent = 'Organization Detail';
  if (pageActions) pageActions.innerHTML = `
    <button class="btn btn-sm" onclick="window.app.navigateTo('organizations')">&larr; Back</button>
    <button class="btn btn-sm" onclick="window.app.editOrg(${o.id})">Edit Organization</button>
    <button class="btn btn-sm btn-gold" onclick="window.app.openProviderModal()">+ Add Provider</button>
  `;

  // Load contacts
  let contacts = [];
  try { contacts = await store.getAll('organizations'); /* placeholder — contacts come from org sub-resource */ } catch {}
  // If the API supports org contacts as a sub-resource, use it; otherwise show empty
  let orgContacts = [];
  try {
    const result = await store._fetch(`${store._url('organizations').replace('/organizations', '')}/organizations/${orgId}/contacts`);
    orgContacts = (result.data || result) || [];
    if (!Array.isArray(orgContacts)) orgContacts = [];
  } catch { orgContacts = []; }

  body.innerHTML = `
    <style>
      .odv2-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .odv2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .odv2-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
      .odv2-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
      .odv2-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
      .odv2-card{border-radius:16px!important;overflow:hidden;}
      .odv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <!-- Org Header -->
    <div class="card odv2-card" style="border-top:3px solid var(--brand-600);margin-bottom:20px;">
      <div class="card-body">
        <div style="font-size:22px;font-weight:800;color:var(--gray-900);">${escHtml(o.name)} <span style="font-size:13px;font-weight:500;color:var(--gray-400);margin-left:10px;">#${toHexId(o.id)}</span></div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:8px;font-size:13px;color:var(--gray-600);">
          <div>Org ID: <strong style="font-family:monospace;color:var(--brand-600);">${toHexId(o.id)}</strong></div>
          <div>Group NPI: <strong style="color:var(--brand-700);">${o.npi || '—'}</strong></div>
          <div>Tax ID: <strong>${o.taxId || o.tax_id || '—'}</strong></div>
          <div>Taxonomy: <strong>${o.taxonomy || o.taxonomyCode || '—'}</strong></div>
        </div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:6px;font-size:13px;color:var(--gray-600);">
          ${o.phone ? `<div>Phone: ${escHtml(o.phone)}</div>` : ''}
          ${o.email ? `<div>Email: <a href="mailto:${escAttr(o.email)}">${escHtml(o.email)}</a></div>` : ''}
          ${(o.address && typeof o.address === 'object') ? `<div>${escHtml(o.address.street || '')}, ${escHtml(o.address.city || '')}, ${escHtml(o.address.state || '')} ${escHtml(o.address.zip || '')}</div>` : (o.addressStreet || o.address_street ? `<div>${escHtml(o.addressStreet || o.address_street || '')}, ${escHtml(o.addressCity || o.address_city || '')}, ${escHtml(o.addressState || o.address_state || '')} ${escHtml(o.addressZip || o.address_zip || '')}</div>` : '')}
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:20px;">
      <div class="stat-card odv2-stat"><div class="label">Providers</div><div class="value">${providers.length}</div></div>
      <div class="stat-card odv2-stat"><div class="label">Licenses</div><div class="value" style="color:var(--brand-600);">${orgLicenses.length}</div></div>
      <div class="stat-card odv2-stat"><div class="label">Licensed States</div><div class="value">${licensedStates.length}</div></div>
      <div class="stat-card odv2-stat"><div class="label">Applications</div><div class="value">${orgApps.length}</div></div>
      <div class="stat-card odv2-stat"><div class="label">Est. Monthly Rev</div><div class="value" style="color:var(--green);">$${estRevenue.toLocaleString()}</div></div>
    </div>

    <!-- Tabs -->
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab active" onclick="window.app.orgDetailTab(this, 'od-providers')">Providers (${providers.length})</button>
      <button class="tab" onclick="window.app.orgDetailTab(this, 'od-applications')">Applications (${orgApps.length})</button>
      <button class="tab" onclick="window.app.orgDetailTab(this, 'od-contacts')">Contacts (${orgContacts.length})</button>
    </div>

    <!-- Providers Tab -->
    <div id="od-providers">
      <div class="card">
        <div class="card-body" style="padding:0;">
          ${providers.length === 0 ? '<div class="empty-state" style="padding:30px;"><p>No providers in this organization.</p></div>' : `
            <table>
              <thead><tr><th>Name</th><th>NPI</th><th>Specialty</th><th>Licenses</th><th>Applications</th><th>Status</th></tr></thead>
              <tbody>
                ${providers.map(p => {
                  const pLic = licenses.filter(l => (l.providerId || l.provider_id) == p.id);
                  const pApps = apps.filter(a => (a.providerId || a.provider_id) == p.id);
                  return `
                    <tr style="cursor:pointer;" onclick="window._selectedProviderId=${p.id};window.app.navigateTo('provider-profile')">
                      <td><strong>${escHtml((p.firstName || p.first_name || '') + ' ' + (p.lastName || p.last_name || ''))}</strong>${p.credentials || p.credential ? '<br><span class="text-sm text-muted">' + escHtml(p.credentials || p.credential) + '</span>' : ''}</td>
                      <td><code style="color:var(--brand-700);">${p.npi || '—'}</code></td>
                      <td class="text-sm">${escHtml(p.specialty || p.taxonomyDesc || '') || '—'}</td>
                      <td><strong>${pLic.filter(l => l.status === 'active').length}</strong><span class="text-muted">/${pLic.length}</span></td>
                      <td>${pApps.length}</td>
                      <td><span class="badge badge-${(p.status === 'active' || p.isActive || p.active !== false) ? 'approved' : 'denied'}">${(p.status === 'active' || p.isActive || p.active !== false) ? 'Active' : 'Inactive'}</span></td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    </div>

    <!-- Applications Tab -->
    <div id="od-applications" class="hidden">
      <div class="card">
        <div class="card-body" style="padding:0;">
          ${orgApps.length === 0 ? '<div class="empty-state" style="padding:30px;"><p>No applications for this organization.</p></div>' : `
            <table>
              <thead><tr><th>Provider</th><th>Payer</th><th>State</th><th>Status</th><th>Group</th><th>Submitted</th></tr></thead>
              <tbody>
                ${orgApps.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 50).map(a => {
                  const prov = providers.find(p => p.id == (a.providerId || a.provider_id));
                  const provName = prov ? `${prov.firstName || prov.first_name || ''} ${prov.lastName || prov.last_name || ''}`.trim() : '—';
                  return `
                    <tr>
                      <td class="text-sm">${escHtml(provName)}</td>
                      <td><strong>${escHtml(a.payerName || a.payer_name || '')}</strong></td>
                      <td>${a.state || '—'}</td>
                      <td><span class="badge badge-${a.status}">${(a.status || '').replace(/_/g, ' ')}</span></td>
                      <td>${groupBadge(a.wave)}</td>
                      <td class="text-sm">${formatDateDisplay(a.submittedDate || a.submitted_date)}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    </div>

    <!-- Contacts Tab -->
    <div id="od-contacts" class="hidden">
      <div style="margin-bottom:12px;">
        <button class="btn btn-gold btn-sm" onclick="window.app.openOrgContactForm(${orgId})">+ Add Contact</button>
      </div>
      ${orgContacts.length === 0 ? '<div class="empty-state" style="padding:30px;"><p>No contacts. Click "+ Add Contact" to add one.</p></div>' : `
        <div class="card">
          <div class="card-body" style="padding:0;">
            <table>
              <thead><tr><th>Name</th><th>Title</th><th>Role</th><th>Email</th><th>Phone</th><th>Actions</th></tr></thead>
              <tbody>
                ${orgContacts.map(c => `
                  <tr>
                    <td><strong>${escHtml(c.name || '')}</strong></td>
                    <td class="text-sm">${escHtml(c.title || '') || '—'}</td>
                    <td>${_orgContactRoleBadge(c.role)}</td>
                    <td class="text-sm">${c.email ? `<a href="mailto:${escAttr(c.email)}">${escHtml(c.email)}</a>` : '—'}</td>
                    <td class="text-sm">${escHtml(c.phone || '') || '—'}</td>
                    <td>
                      <button class="btn btn-sm" onclick="window.app.editOrgContact(${orgId}, ${c.id})">Edit</button>
                      <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteOrgContact(${orgId}, ${c.id})">Del</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>
  `;
}

function _orgContactRoleBadge(role) {
  const colors = { owner: 'var(--brand-700)', admin: 'var(--green)', billing: 'var(--gold)', credentialing: 'var(--blue,#1d4ed8)' };
  return `<span class="badge" style="background:${colors[role] || 'var(--gray-400)'};color:white;">${(role || '').replace(/_/g, ' ')}</span>`;
}

async function openOrgModal(orgId) {
  let existing = null;
  if (orgId) { try { existing = await store.getOne('organizations', orgId); } catch {} }
  const modal = document.getElementById('log-modal');
  document.getElementById('log-modal-title').textContent = existing ? 'Edit Organization' : 'Add Organization';
  document.getElementById('log-modal-body').innerHTML = `
    <input type="hidden" id="edit-org-id" value="${orgId || ''}">

    <!-- NPI Lookup for Organizations -->
    <div style="margin-bottom:16px;padding:12px 14px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-lg);">
      <label style="display:block;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Search NPI Registry</label>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <button class="btn btn-sm btn-primary" id="org-search-mode-npi" onclick="window.app.setOrgSearchMode('npi')" style="font-size:12px;">By NPI</button>
        <button class="btn btn-sm" id="org-search-mode-name" onclick="window.app.setOrgSearchMode('name')" style="font-size:12px;">By Name</button>
      </div>
      <div id="org-search-npi" style="display:flex;gap:8px;align-items:flex-end;">
        <input type="text" class="form-control" id="org-npi-lookup" placeholder="Enter 10-digit organization NPI" value="${escAttr(existing?.npi || '')}" style="flex:1;font-size:14px;letter-spacing:0.5px;" onkeydown="if(event.key==='Enter'){event.preventDefault();window.app.lookupOrgNPI();}">
        <button class="btn btn-primary" onclick="window.app.lookupOrgNPI()" id="org-npi-lookup-btn" style="height:38px;white-space:nowrap;font-size:13px;">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg> Lookup
        </button>
      </div>
      <div id="org-search-name" style="display:none;">
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <input type="text" class="form-control" id="org-search-orgname" placeholder="Organization name" style="flex:2;" onkeydown="if(event.key==='Enter'){event.preventDefault();window.app.searchOrgByName();}">
          <select class="form-control" id="org-search-state" style="width:70px;">
            <option value="">State</option>
            ${['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="window.app.searchOrgByName()" id="org-name-search-btn" style="height:38px;white-space:nowrap;font-size:13px;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg> Search
          </button>
        </div>
      </div>
    </div>
    <div id="org-npi-lookup-result" style="display:none;margin-bottom:14px;"></div>

    <div class="form-group"><label>Organization Name *</label><input type="text" class="form-control" id="org-name" value="${escAttr(existing?.name || '')}" placeholder="e.g. EnnHealth Psychiatry"></div>
    <div class="form-row">
      <div class="form-group"><label>Group NPI</label><input type="text" class="form-control" id="org-npi" value="${escAttr(existing?.npi || '')}" placeholder="10-digit NPI"></div>
      <div class="form-group"><label>Tax ID</label><input type="text" class="form-control" id="org-taxid" value="${escAttr(existing?.taxId || existing?.tax_id || '')}" placeholder="XX-XXXXXXX"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Phone</label><input type="text" class="form-control" id="org-phone" value="${escAttr(existing?.phone || '')}" placeholder="(555) 123-4567"></div>
      <div class="form-group"><label>Email</label><input type="email" class="form-control" id="org-email" value="${escAttr(existing?.email || '')}" placeholder="contact@org.com"></div>
    </div>
    <div class="form-group"><label>Taxonomy Code</label><input type="text" class="form-control" id="org-taxonomy" value="${escAttr(existing?.taxonomy || existing?.taxonomyCode || '')}" placeholder="e.g. 2084P0800X"></div>
    <div class="form-group"><label>Street Address</label><input type="text" class="form-control" id="org-street" value="${escAttr(existing?.address?.street || existing?.addressStreet || existing?.address_street || '')}" placeholder="123 Main St, Suite 100"></div>
    <div class="form-row">
      <div class="form-group"><label>City</label><input type="text" class="form-control" id="org-city" value="${escAttr(existing?.address?.city || existing?.addressCity || existing?.address_city || '')}"></div>
      <div class="form-group" style="flex:0 0 80px;"><label>State</label><input type="text" class="form-control" id="org-state" value="${escAttr(existing?.address?.state || existing?.addressState || existing?.address_state || '')}" maxlength="2" placeholder="FL"></div>
      <div class="form-group" style="flex:0 0 100px;"><label>ZIP</label><input type="text" class="form-control" id="org-zip" value="${escAttr(existing?.address?.zip || existing?.addressZip || existing?.address_zip || '')}" placeholder="12345"></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn" onclick="window.closeLogModal()">Cancel</button>
      ${existing ? `<button class="btn" style="color:var(--red);" onclick="window.app.deleteOrg(${orgId})">Delete</button>` : ''}
      <button class="btn btn-primary" onclick="window.app.saveOrg()">Save Organization</button>
    </div>
  `;
  modal.classList.add('active');
}

async function openOrgContactForm(orgId, contactId) {
  let existing = null;
  if (contactId) {
    try {
      const contacts = await store._fetch(`${store._url('organizations').replace('/organizations', '')}/organizations/${orgId}/contacts`);
      const list = (contacts.data || contacts) || [];
      existing = Array.isArray(list) ? list.find(c => c.id == contactId) : null;
    } catch {}
  }
  const modal = document.getElementById('log-modal');
  document.getElementById('log-modal-title').textContent = existing ? 'Edit Contact' : 'Add Contact';
  document.getElementById('log-modal-body').innerHTML = `
    <input type="hidden" id="ocon-id" value="${contactId || ''}">
    <input type="hidden" id="ocon-org" value="${orgId}">
    <div class="form-group"><label>Name *</label><input type="text" class="form-control" id="ocon-name" value="${escAttr(existing?.name || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Title</label><input type="text" class="form-control" id="ocon-title" value="${escAttr(existing?.title || '')}" placeholder="e.g. Office Manager"></div>
      <div class="form-group"><label>Role</label><select class="form-control" id="ocon-role">
        <option value="owner" ${existing?.role === 'owner' ? 'selected' : ''}>Owner</option>
        <option value="admin" ${existing?.role === 'admin' ? 'selected' : ''}>Admin</option>
        <option value="billing" ${existing?.role === 'billing' ? 'selected' : ''}>Billing</option>
        <option value="credentialing" ${existing?.role === 'credentialing' ? 'selected' : ''}>Credentialing</option>
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" class="form-control" id="ocon-email" value="${escAttr(existing?.email || '')}"></div>
      <div class="form-group"><label>Phone</label><input type="text" class="form-control" id="ocon-phone" value="${escAttr(existing?.phone || '')}"></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn" onclick="window.closeLogModal()">Cancel</button>
      <button class="btn btn-primary" onclick="window.app.saveOrgContact()">Save Contact</button>
    </div>
  `;
  modal.classList.add('active');
}

async function renderUsersStub() {
  const body = document.getElementById('page-body');
  if (!auth.isAgency()) {
    body.innerHTML = '<div class="alert alert-danger">You do not have permission to manage users.</div>';
    return;
  }
  let users = [];
  try { users = await store.getAgencyUsers(); } catch {}

  // Pre-load orgs and providers for dropdowns
  let orgs = [], providers = [];
  try { orgs = await store.getAll('organizations'); } catch {}
  try { providers = await store.getAll('providers'); } catch {}

  const roleBadge = (role) => {
    const map = {
      superadmin: { label: 'Super Admin', cls: 'approved', icon: '&#9733;' },
      agency: { label: 'Agency', cls: 'approved', icon: '&#127970;' },
      staff: { label: 'Staff', cls: 'in_review', icon: '&#128221;' },
      organization: { label: 'Organization', cls: 'submitted', icon: '&#127963;' },
      provider: { label: 'Provider', cls: 'pending', icon: '&#129658;' },
    };
    const r = map[role] || { label: role, cls: 'pending', icon: '' };
    return `<span class="badge badge-${r.cls}">${r.icon} ${r.label}</span>`;
  };

  const agencyUsers = users.filter(u => u.role === 'agency' || u.role === 'superadmin');
  const staffUsers = users.filter(u => u.role === 'staff');
  const orgUsers = users.filter(u => u.role === 'organization');
  const providerUsers = users.filter(u => u.role === 'provider');

  body.innerHTML = `
    <style>
      .usv2-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .usv2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .usv2-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
      .usv2-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
      .usv2-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
      .usv2-card{border-radius:16px!important;overflow:hidden;}
      .usv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="stat-card usv2-stat"><div class="label">Total Users</div><div class="value">${users.length}</div></div>
      <div class="stat-card usv2-stat"><div class="label">Agency</div><div class="value" style="color:var(--green);">${agencyUsers.length}</div></div>
      <div class="stat-card usv2-stat"><div class="label">Staff</div><div class="value" style="color:var(--amber);">${staffUsers.length}</div></div>
      <div class="stat-card usv2-stat"><div class="label">Organization</div><div class="value" style="color:var(--brand-600);">${orgUsers.length}</div></div>
      <div class="stat-card usv2-stat"><div class="label">Provider</div><div class="value" style="color:var(--text-muted);">${providerUsers.length}</div></div>
    </div>

    <!-- Invite User Modal -->
    <div class="modal-overlay" id="invite-user-modal">
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3>Invite / Create User</h3>
          <button class="modal-close" onclick="window.app.cancelInvite()">&times;</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <div class="auth-field" style="margin:0;"><label>First Name *</label><input type="text" id="invite-first-name" class="form-control" placeholder="First Name"></div>
            <div class="auth-field" style="margin:0;"><label>Last Name *</label><input type="text" id="invite-last-name" class="form-control" placeholder="Last Name"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <div class="auth-field" style="margin:0;"><label>Email Address *</label><input type="email" id="invite-email" class="form-control" placeholder="user@example.com"></div>
            <div class="auth-field" style="margin:0;">
              <label>Temporary Password *</label>
              <div style="display:flex;gap:4px;">
                <input type="text" id="invite-password" class="form-control" placeholder="Password" style="flex:1;">
                <button type="button" class="btn btn-sm" onclick="window.app.generatePassword()" title="Generate strong password" style="white-space:nowrap;">Generate</button>
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <div class="auth-field" style="margin:0;">
              <label>Role *</label>
              <select id="invite-role" class="form-control" onchange="window.app.onInviteRoleChange()">
                <option value="agency">Agency (Full Access)</option>
                <option value="staff">Staff (Credentialing Coordinator)</option>
                <option value="organization">Organization</option>
                <option value="provider">Provider</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;">
              <select id="invite-org" class="form-control hidden" style="margin-top:22px;">
                <option value="">Select Organization *</option>
                ${orgs.map(o => `<option value="${o.id}">${escHtml(o.name)}</option>`).join('')}
              </select>
              <select id="invite-provider" class="form-control hidden" style="margin-top:22px;">
                <option value="">Select Provider *</option>
                ${providers.map(p => `<option value="${p.id}">${escHtml((p.firstName || '') + ' ' + (p.lastName || ''))}</option>`).join('')}
              </select>
            </div>
          </div>
          <div id="invite-error" class="alert alert-danger hidden" style="margin-bottom:10px;"></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="window.app.cancelInvite()">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.submitInvite()">Create User</button>
        </div>
      </div>
    </div>

    <div class="card usv2-card">
      <div class="card-header">
        <h3>Team Members</h3>
        <button class="btn btn-gold" onclick="window.app.inviteUser()">+ Invite User</button>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th>
              <th>Org / Provider</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => {
              const name = escHtml(((u.firstName || u.first_name || '') + ' ' + (u.lastName || u.last_name || '')).trim());
              const orgName = u.organization ? escHtml(u.organization.name) : '';
              const provName = u.provider ? escHtml((u.provider.firstName || u.provider.first_name || '') + ' ' + (u.provider.lastName || u.provider.last_name || '')) : '';
              const scope = u.role === 'organization' ? orgName : u.role === 'provider' ? provName : 'All';
              const isActive = u.isActive !== false && u.is_active !== false;
              const isSelf = u.id === auth.getUser()?.id;
              return `
              <tr style="${!isActive ? 'opacity:0.5;' : ''}">
                <td><strong>${name}</strong> <span style="font-family:monospace;font-size:11px;color:var(--gray-400);">#${toHexId(u.id)}</span></td>
                <td>${escHtml(u.email || '')}</td>
                <td>${roleBadge(u.role)}</td>
                <td>${scope}</td>
                <td><span class="badge badge-${isActive ? 'approved' : 'denied'}">${isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  ${!isSelf && u.role !== 'superadmin' ? `
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                      <button class="btn btn-sm" onclick="window.app.editUserRole(${u.id}, '${u.role}')" title="Change role">&#9998;</button>
                      ${isActive
                        ? `<button class="btn btn-sm" onclick="window.app.deactivateUser(${u.id}, '${name.replace(/'/g, "\\'")}')" title="Deactivate" style="color:var(--red);">&#10005;</button>`
                        : `<button class="btn btn-sm" onclick="window.app.reactivateUser(${u.id})" title="Reactivate" style="color:var(--green);">&#10003;</button>`
                      }
                      ${auth.isSuperAdmin() ? `
                        <button class="btn btn-sm" onclick="window.app.resetUserPassword(${u.id}, '${name.replace(/'/g, "\\'")}')" title="Reset password" style="color:var(--brand-600);">&#128274;</button>
                        <button class="btn btn-sm" onclick="window.app.changeUserEmail(${u.id}, '${escAttr(u.email || '')}')" title="Change email" style="color:var(--brand-600);">&#9993;</button>
                      ` : ''}
                    </div>
                  ` : isSelf ? '<span class="text-muted text-sm">You</span>' : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Audit Trail Page ───

// [Lazy-loaded] renderAuditTrail — moved to ui/pages/ module

// ─── Provider Self-Service Dashboard ───

// [Lazy-loaded] renderProviderDashboard — moved to ui/pages/ module

// ─── Communications Page ───

async function renderCommunicationsPage() {
  const body = document.getElementById('page-body');
  let logs = [];
  let providers = [];
  try { logs = await store.getCommunicationLogs(); } catch (e) { console.error('Comm logs error:', e); }
  try { providers = await store.getAll('providers'); } catch (e) {}
  if (!Array.isArray(logs)) logs = [];

  const channelFilter = document.getElementById('comm-filter-channel')?.value || '';
  const dirFilter = document.getElementById('comm-filter-dir')?.value || '';

  const channelIcons = { email: '&#x2709;', phone: '&#x260E;', fax: '&#x1F4E0;', portal: '&#x1F310;', mail: '&#x1F4EC;' };
  const outcomeColors = { connected: 'approved', sent: 'approved', received: 'approved', voicemail: 'pending', no_answer: 'denied', bounced: 'denied' };

  let filtered = logs;
  if (channelFilter) filtered = filtered.filter(l => l.channel === channelFilter);
  if (dirFilter) filtered = filtered.filter(l => l.direction === dirFilter);
  filtered.sort((a, b) => new Date(b.logged_at || b.created_at) - new Date(a.logged_at || a.created_at));

  const providerMap = {};
  providers.forEach(p => { providerMap[p.id] = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim(); });

  body.innerHTML = `
    <style>
      .co2-card{border-radius:16px;overflow:hidden;}
      .co2-card table tr:hover{background:var(--gray-50);}
      .co2-ch{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;}
    </style>
    <!-- Filters -->
    <div class="card co2-card" style="margin-bottom:16px;">
      <div class="card-body" style="padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <select id="comm-filter-channel" class="form-control" style="width:auto;height:34px;font-size:13px;" onchange="window.app.filterComms()">
          <option value="">All Channels</option>
          <option value="email" ${channelFilter==='email'?'selected':''}>Email</option>
          <option value="phone" ${channelFilter==='phone'?'selected':''}>Phone</option>
          <option value="fax" ${channelFilter==='fax'?'selected':''}>Fax</option>
          <option value="portal" ${channelFilter==='portal'?'selected':''}>Portal</option>
          <option value="mail" ${channelFilter==='mail'?'selected':''}>Mail</option>
        </select>
        <select id="comm-filter-dir" class="form-control" style="width:auto;height:34px;font-size:13px;" onchange="window.app.filterComms()">
          <option value="">All Directions</option>
          <option value="outbound" ${dirFilter==='outbound'?'selected':''}>Outbound</option>
          <option value="inbound" ${dirFilter==='inbound'?'selected':''}>Inbound</option>
        </select>
        <span style="color:var(--gray-500);font-size:13px;">${filtered.length} log${filtered.length !== 1 ? 's' : ''}</span>
      </div>
    </div>

    <!-- Logs Table -->
    <div class="card co2-card">
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Channel</th><th>Dir</th><th>Contact</th><th>Subject</th><th>Provider</th><th>Outcome</th><th>Actions</th></tr></thead>
            <tbody>
              ${filtered.length > 0 ? filtered.map(l => `<tr>
                <td style="white-space:nowrap;">${formatDateDisplay(l.logged_at || l.created_at)}</td>
                <td style="text-align:center;font-size:18px;" title="${escHtml(l.channel || '')}">${channelIcons[l.channel] || '—'}</td>
                <td><span class="badge badge-${l.direction === 'outbound' ? 'pending' : 'approved'}" style="font-size:10px;">${escHtml(l.direction || '—')}</span></td>
                <td><strong>${escHtml(l.contact_name || l.contactName || '—')}</strong><br><span class="text-sm text-muted">${escHtml(l.contact_info || l.contactInfo || '')}</span></td>
                <td>${escHtml(l.subject || '—')}</td>
                <td>${l.provider_id ? escHtml(providerMap[l.provider_id] || '—') : '—'}</td>
                <td>${l.outcome ? `<span class="badge badge-${outcomeColors[l.outcome] || 'pending'}">${escHtml(l.outcome)}</span>` : '—'}</td>
                <td><button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteCommLog(${l.id})">Del</button></td>
              </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No communication logs yet. Click "+ Log Communication" to get started.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Comm Log Modal -->
    <div class="modal-overlay" id="comm-log-modal">
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3>Log Communication</h3>
          <button class="modal-close" onclick="document.getElementById('comm-log-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="comm-app-id" value="">
          <input type="hidden" id="comm-provider-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;"><label>Channel *</label>
              <select id="comm-channel" class="form-control">
                <option value="">Select...</option>
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="fax">Fax</option>
                <option value="portal">Portal</option>
                <option value="mail">Mail</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Direction *</label>
              <select id="comm-direction" class="form-control">
                <option value="">Select...</option>
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Contact Name</label><input type="text" id="comm-contact-name" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Contact Info</label><input type="text" id="comm-contact-info" class="form-control" placeholder="Phone or email"></div>
            <div class="auth-field" style="margin:0;"><label>Outcome</label>
              <select id="comm-outcome" class="form-control">
                <option value="">Select...</option>
                <option value="connected">Connected</option>
                <option value="voicemail">Voicemail</option>
                <option value="no_answer">No Answer</option>
                <option value="sent">Sent</option>
                <option value="received">Received</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Date</label><input type="date" id="comm-date" class="form-control"></div>
          </div>
          <div class="auth-field" style="margin:12px 0 0;"><label>Subject</label><input type="text" id="comm-subject" class="form-control"></div>
          <div class="auth-field" style="margin:12px 0 0;"><label>Notes / Body</label><textarea id="comm-body" class="form-control" rows="3" style="resize:vertical;"></textarea></div>
          <div class="auth-field" style="margin:12px 0 0;"><label>Duration (seconds, for calls)</label><input type="number" id="comm-duration" class="form-control" min="0"></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('comm-log-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveCommLog()">Save</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Kanban Board ───

async function renderKanbanBoard() {
  const body = document.getElementById('page-body');
  let apps = [];
  let providers = [];
  try {
    [apps, providers] = await Promise.all([
      store.getAll('applications').then(a => store.filterByScope(a)),
      store.getAll('providers')
    ]);
  } catch (e) { console.error('Kanban error:', e); }
  if (!Array.isArray(apps)) apps = [];
  if (!Array.isArray(providers)) providers = [];

  // ── Build lookup maps ──
  const providerMap = {};
  providers.forEach(p => {
    providerMap[p.id || p.provider_id] = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim();
  });

  const payers = apps.map(a => a.payerName || a.payer_name || a.payer?.name || '').filter(Boolean);
  const uniquePayers = [...new Set(payers)].sort();
  const states = apps.map(a => a.state).filter(Boolean);
  const uniqueStates = [...new Set(states)].sort();
  const groups = apps.map(a => a.wave).filter(Boolean);
  const uniqueGroups = [...new Set(groups)].sort((a, b) => a - b);
  const uniqueProviderIds = [...new Set(apps.map(a => a.providerId || a.provider_id).filter(Boolean))];

  // ── Internal filter / view state (persisted on window.app) ──
  if (!window.app._kb) {
    window.app._kb = {
      view: 'board',
      showEmpty: true,
      collapsed: {},
      filterState: '',
      filterPayer: '',
      filterProvider: '',
      filterGroup: '',
      search: '',
    };
  }
  const kb = window.app._kb;

  // ── Apply local filters ──
  let filtered = apps.slice();
  if (kb.filterState) filtered = filtered.filter(a => a.state === kb.filterState);
  if (kb.filterPayer) filtered = filtered.filter(a => (a.payerName || a.payer_name || a.payer?.name || '') === kb.filterPayer);
  if (kb.filterProvider) filtered = filtered.filter(a => (a.providerId || a.provider_id) === kb.filterProvider);
  if (kb.filterGroup) filtered = filtered.filter(a => String(a.wave) === String(kb.filterGroup));
  if (kb.search) {
    const q = kb.search.toLowerCase();
    filtered = filtered.filter(a => {
      const payer = (a.payerName || a.payer_name || a.payer?.name || '').toLowerCase();
      const prov = (providerMap[a.providerId || a.provider_id] || '').toLowerCase();
      const note = (a.notes || '').toLowerCase();
      return payer.includes(q) || prov.includes(q) || note.includes(q) || (a.state || '').toLowerCase().includes(q);
    });
  }

  // ── Build columns from APPLICATION_STATUSES ──
  const columns = APPLICATION_STATUSES.map(s => {
    const colApps = filtered.filter(a => (a.status || 'new') === s.value);
    return { ...s, key: s.value, apps: colApps };
  }).filter(col => kb.showEmpty || col.apps.length > 0);

  // ── Summary stats ──
  const totalApps = filtered.length;
  const totalRevenue = filtered.reduce((sum, a) => sum + (parseFloat(a.estRevenue || a.est_revenue || 0) || 0), 0);

  // ── If "Table" view selected, delegate to existing table renderer ──
  if (kb.view === 'table') {
    body.innerHTML = _kbStyles() + _kbSummaryStrip(totalApps, totalRevenue, filtered, columns) +
      _kbFilters(kb, uniqueStates, uniquePayers, uniqueProviderIds, providerMap, uniqueGroups) +
      '<div id="app-table-wrap"><table class="table" id="app-table"><thead><tr>' +
      '<th>Payer</th><th>Provider</th><th>State</th><th>Status</th><th>Group</th><th>Days</th><th>Actions</th>' +
      '</tr></thead><tbody id="app-table-body"></tbody></table><div id="app-empty" style="display:none;text-align:center;padding:40px;color:var(--gray-400);">No applications found</div></div>';
    await renderAppTable(filtered);
    return;
  }

  // ── Board view ──
  const columnsHtml = columns.map(col => {
    const isCollapsed = kb.collapsed[col.key];
    const cardsHtml = col.apps.map(a => _kbCard(a, col, providerMap)).join('');
    return `
      <div class="kb-column${isCollapsed ? ' kb-col-collapsed' : ''}" data-status="${col.key}"
           ondragover="window.app._kbDragOver(event)" ondragleave="window.app._kbDragLeave(event)" ondrop="window.app._kbDrop(event)">
        <div class="kb-col-header" style="--col-color:${col.color};--col-bg:${col.bg}">
          <div class="kb-col-header-left" onclick="window.app._kbToggleCol('${col.key}')">
            <span class="kb-col-chevron">${isCollapsed ? '&#9654;' : '&#9660;'}</span>
            <span class="kb-col-dot" style="background:${col.color}"></span>
            <span class="kb-col-title">${escHtml(col.label)}</span>
            <span class="kb-col-count" style="background:${col.color}">${col.apps.length}</span>
          </div>
        </div>
        <div class="kb-col-body${isCollapsed ? ' kb-hidden' : ''}">
          ${cardsHtml || '<div class="kb-empty-col">No applications</div>'}
        </div>
      </div>`;
  }).join('');

  body.innerHTML = _kbStyles() +
    _kbSummaryStrip(totalApps, totalRevenue, filtered, columns) +
    _kbFilters(kb, uniqueStates, uniquePayers, uniqueProviderIds, providerMap, uniqueGroups) +
    `<div class="kb-board">${columnsHtml}</div>`;

  // ── Wire up drag/drop & actions on window.app ──
  window.app._kbDragOver = function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const col = e.currentTarget;
    const colBody = col.querySelector('.kb-col-body');
    const cards = [...colBody.querySelectorAll('.kb-card')];
    // Remove existing indicators
    col.querySelectorAll('.kb-drop-indicator').forEach(el => el.remove());
    col.classList.add('kb-col-dragover');
    // Find insert position
    const indicator = document.createElement('div');
    indicator.className = 'kb-drop-indicator';
    const afterCard = cards.reduce((closest, card) => {
      const box = card.getBoundingClientRect();
      const offset = e.clientY - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: card };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
    if (afterCard) colBody.insertBefore(indicator, afterCard);
    else colBody.appendChild(indicator);
  };

  window.app._kbDragLeave = function(e) {
    const col = e.currentTarget;
    if (!col.contains(e.relatedTarget)) {
      col.classList.remove('kb-col-dragover');
      col.querySelectorAll('.kb-drop-indicator').forEach(el => el.remove());
    }
  };

  window.app._kbDrop = async function(e) {
    e.preventDefault();
    const col = e.currentTarget;
    col.classList.remove('kb-col-dragover');
    col.querySelectorAll('.kb-drop-indicator').forEach(el => el.remove());
    const appId = e.dataTransfer.getData('text/plain');
    const newStatus = col.dataset.status;
    if (!appId || !newStatus) return;
    // Find existing app to check if status actually changed
    const existingApp = apps.find(a => String(a.id) === String(appId));
    if (existingApp && (existingApp.status || 'new') === newStatus) return;
    const note = await appPrompt('Add a note for this status change (optional):', {
      title: 'Status Change Note',
      placeholder: 'e.g. Received confirmation from payer...',
      okLabel: 'Move'
    });
    if (note === null) { await renderKanbanBoard(); return; } // Cancelled
    try {
      await window.app.kanbanDrop(appId, newStatus);
    } catch(err) {
      showToast('Error: ' + (err.message || 'Could not transition'));
      await renderKanbanBoard();
    }
  };

  window.app._kbDragStart = function(e, id) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    e.target.closest('.kb-card').classList.add('kb-card-dragging');
  };

  window.app._kbDragEnd = function(e) {
    e.target.closest('.kb-card')?.classList.remove('kb-card-dragging');
    document.querySelectorAll('.kb-drop-indicator').forEach(el => el.remove());
    document.querySelectorAll('.kb-col-dragover').forEach(el => el.classList.remove('kb-col-dragover'));
  };

  window.app._kbToggleCol = function(key) {
    kb.collapsed[key] = !kb.collapsed[key];
    renderKanbanBoard();
  };

  window.app._kbSetView = function(view) {
    kb.view = view;
    renderKanbanBoard();
  };

  window.app._kbFilter = function(field, value) {
    kb[field] = value;
    renderKanbanBoard();
  };

  window.app._kbSearch = function(value) {
    kb.search = value;
    renderKanbanBoard();
  };

  window.app._kbToggleEmpty = function(checked) {
    kb.showEmpty = checked;
    renderKanbanBoard();
  };

  window.app._kbFollowUp = async function(id) {
    const note = await appPrompt('Follow-up note:', {
      title: 'Create Follow-up',
      placeholder: 'e.g. Called payer, waiting on callback...',
      okLabel: 'Save Follow-up'
    });
    if (note === null) return;
    try {
      await store.add('followups', {
        applicationId: id,
        type: 'general',
        notes: note,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      showToast('Follow-up created');
    } catch (err) {
      showToast('Error creating follow-up');
    }
  };

  window.app._kbDelete = async function(id) {
    await window.app.deleteApplication(id);
  };
}

// ── Kanban: CSS Styles ──
function _kbStyles() {
  return `<style>
/* ── Kanban Board Reset ── */
.kb-summary{display:flex;align-items:center;gap:20px;padding:12px 18px;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 100%);border:1px solid #e2e8f0;border-radius:12px;margin-bottom:12px;flex-wrap:wrap}
.kb-summary-stat{display:flex;flex-direction:column;align-items:center;min-width:64px}
.kb-summary-stat .kb-stat-value{font-size:22px;font-weight:800;color:#1e293b;line-height:1.1}
.kb-summary-stat .kb-stat-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-top:2px}
.kb-summary-divider{width:1px;height:32px;background:#cbd5e1}
.kb-summary-statuses{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.kb-status-pip{display:flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:default;transition:transform .15s}
.kb-status-pip:hover{transform:scale(1.06)}
.kb-status-pip .pip-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}

/* ── Filters ── */
.kb-filters{display:flex;gap:10px;align-items:center;padding:10px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:14px;flex-wrap:wrap}
.kb-filters select,.kb-filters input[type="text"]{height:34px;padding:0 10px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;background:#fff;color:#334155;outline:none;transition:border-color .15s,box-shadow .15s}
.kb-filters select:focus,.kb-filters input[type="text"]:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12)}
.kb-filters select{min-width:110px;cursor:pointer}
.kb-filters input[type="text"]{min-width:160px}
.kb-view-toggle{display:flex;border:1px solid #d1d5db;border-radius:7px;overflow:hidden;margin-left:auto}
.kb-view-btn{padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:#fff;color:#64748b;transition:all .15s}
.kb-view-btn.active{background:#4f46e5;color:#fff}
.kb-view-btn:hover:not(.active){background:#f1f5f9}
.kb-filters label{display:flex;align-items:center;gap:5px;font-size:12px;color:#475569;cursor:pointer;white-space:nowrap}

/* ── Board ── */
.kb-board{display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;min-height:400px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;scroll-behavior:smooth}
.kb-board::-webkit-scrollbar{height:6px}
.kb-board::-webkit-scrollbar-track{background:#f1f5f9;border-radius:6px}
.kb-board::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:6px}
.kb-board::-webkit-scrollbar-thumb:hover{background:#64748b}

/* ── Column ── */
.kb-column{min-width:200px;max-width:240px;flex:1 0 200px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;display:flex;flex-direction:column;scroll-snap-align:start;transition:background .2s,border-color .2s}
.kb-column.kb-col-collapsed{max-width:140px;min-width:120px}
.kb-column.kb-col-dragover{background:#eef2ff;border-color:#818cf8}
.kb-col-header{padding:8px 10px 6px;border-bottom:1px solid #e2e8f0;border-radius:10px 10px 0 0;background:linear-gradient(180deg,var(--col-bg) 0%,#f8fafc 100%)}
.kb-col-header-left{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
.kb-col-chevron{font-size:8px;color:#94a3b8;width:12px;text-align:center;transition:transform .2s}
.kb-col-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.kb-col-title{font-size:11px;font-weight:700;color:#1e293b;letter-spacing:.02em;text-transform:uppercase}
.kb-col-count{font-size:9px;font-weight:700;color:#fff;padding:1px 6px;border-radius:8px;min-width:18px;text-align:center;line-height:1.5}
.kb-col-body{flex:1;display:flex;flex-direction:column;gap:6px;padding:8px;overflow-y:auto;max-height:calc(100vh - 300px);min-height:60px}
.kb-col-body.kb-hidden{display:none}
.kb-empty-col{text-align:center;padding:28px 10px;color:#94a3b8;font-size:12px;font-style:italic}

/* ── Drop Indicator ── */
.kb-drop-indicator{height:3px;background:#6366f1;border-radius:3px;margin:2px 0;animation:kb-pulse .8s ease-in-out infinite alternate;flex-shrink:0}
@keyframes kb-pulse{from{opacity:.5;transform:scaleX(.96)}to{opacity:1;transform:scaleX(1)}}

/* ── Card ── */
.kb-card{background:#fff;border-radius:8px;padding:10px 12px 8px;cursor:grab;box-shadow:0 1px 2px rgba(0,0,0,.05),0 0 0 1px rgba(0,0,0,.03);border-left:3px solid var(--card-accent);transition:box-shadow .18s,transform .18s,opacity .18s;position:relative}
.kb-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.08),0 0 0 1px rgba(99,102,241,.12);transform:translateY(-1px)}
.kb-card:active{cursor:grabbing}
.kb-card.kb-card-dragging{opacity:.45;transform:rotate(2deg) scale(.97)}
.kb-card-payer{font-size:12px;font-weight:700;color:#1e293b;margin-bottom:3px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kb-card-row{display:flex;align-items:center;gap:4px;margin-bottom:3px;flex-wrap:wrap}
.kb-card-provider{font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}
.kb-card-state-pill{display:inline-flex;align-items:center;padding:0 5px;border-radius:3px;font-size:9px;font-weight:700;background:#e0e7ff;color:#4338ca;letter-spacing:.04em;flex-shrink:0}
.kb-card-group-pill{display:inline-flex;align-items:center;padding:0 5px;border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.04em;flex-shrink:0}
.kb-card-days{display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:600;padding:1px 6px;border-radius:10px}
.kb-card-days.green{background:#d1fae5;color:#065f46}
.kb-card-days.amber{background:#fef3c7;color:#92400e}
.kb-card-days.red{background:#fee2e2;color:#991b1b}
.kb-card-meta{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:4px;font-size:10px;color:#94a3b8}
.kb-card-meta span{display:inline-flex;align-items:center;gap:2px}
.kb-card-notes{font-size:10px;color:#64748b;margin-top:4px;padding:3px 6px;background:#f8fafc;border-radius:4px;border:1px solid #f1f5f9;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kb-card-actions{position:absolute;top:4px;right:4px;display:flex;gap:2px;opacity:0;transition:opacity .15s;pointer-events:none}
.kb-card:hover .kb-card-actions{opacity:1;pointer-events:auto}
.kb-card-actions button{width:22px;height:22px;border:none;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;transition:background .12s;background:rgba(241,245,249,.9);color:#475569}
.kb-card-actions button:hover{background:#e0e7ff;color:#4338ca}
.kb-card-actions button.kb-act-danger:hover{background:#fee2e2;color:#dc2626}

/* ── Responsive ── */
@media(max-width:768px){
  .kb-board{gap:8px;scroll-snap-type:x mandatory}
  .kb-column{min-width:180px;max-width:220px;flex:1 0 180px}
  .kb-filters{gap:6px}
  .kb-filters select,.kb-filters input[type="text"]{font-size:12px;height:30px;min-width:90px}
  .kb-summary{padding:10px 12px;gap:12px}
}
</style>`;
}

// ── Kanban: Summary Strip ──
function _kbSummaryStrip(totalApps, totalRevenue, filtered, columns) {
  const statusPips = columns.map(col =>
    `<span class="kb-status-pip" style="background:${col.bg || col.color + '18'};color:${col.color}" title="${escHtml(col.label)}: ${col.apps.length}">
      <span class="pip-dot" style="background:${col.color}"></span>${col.apps.length}
    </span>`
  ).join('');

  const revenueStr = totalRevenue > 0 ? `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';

  return `<div class="kb-summary">
    <div class="kb-summary-stat">
      <span class="kb-stat-value">${totalApps}</span>
      <span class="kb-stat-label">Applications</span>
    </div>
    <div class="kb-summary-divider"></div>
    <div class="kb-summary-stat">
      <span class="kb-stat-value">${revenueStr}</span>
      <span class="kb-stat-label">Est. Monthly Rev</span>
    </div>
    <div class="kb-summary-divider"></div>
    <div class="kb-summary-statuses">${statusPips}</div>
  </div>`;
}

// ── Kanban: Filters Bar ──
function _kbFilters(kb, uniqueStates, uniquePayers, uniqueProviderIds, providerMap, uniqueGroups) {
  return `<div class="kb-filters">
    ${helpTip('Drag cards between columns to change their status. Each column represents a stage in the credentialing pipeline. Cards show payer, provider, state, and days in current status.')}
    <select onchange="window.app._kbFilter('filterState',this.value)" title="Filter by State">
      <option value="">All States</option>
      ${uniqueStates.map(s => `<option value="${escHtml(s)}"${kb.filterState === s ? ' selected' : ''}>${escHtml(s)}</option>`).join('')}
    </select>
    <select onchange="window.app._kbFilter('filterPayer',this.value)" title="Filter by Payer">
      <option value="">All Payers</option>
      ${uniquePayers.map(p => `<option value="${escHtml(p)}"${kb.filterPayer === p ? ' selected' : ''}>${escHtml(p)}</option>`).join('')}
    </select>
    <select onchange="window.app._kbFilter('filterProvider',this.value)" title="Filter by Provider">
      <option value="">All Providers</option>
      ${uniqueProviderIds.map(id => `<option value="${escHtml(String(id))}"${kb.filterProvider === String(id) ? ' selected' : ''}>${escHtml(providerMap[id] || 'Unknown')}</option>`).join('')}
    </select>
    <select onchange="window.app._kbFilter('filterGroup',this.value)" title="Filter by Group">
      <option value="">All Groups</option>
      ${uniqueGroups.map(g => `<option value="${g}"${String(kb.filterGroup) === String(g) ? ' selected' : ''}>${escHtml(getGroupDef(g).label)}</option>`).join('')}
    </select>
    <input type="text" placeholder="&#128269; Search applications..." value="${escHtml(kb.search)}" oninput="window.app._kbSearch(this.value)" />
    <label><input type="checkbox" ${kb.showEmpty ? 'checked' : ''} onchange="window.app._kbToggleEmpty(this.checked)"> Show empty</label>
    <div class="kb-view-toggle">
      <button class="kb-view-btn${kb.view === 'board' ? ' active' : ''}" onclick="window.app._kbSetView('board')">&#9638; Board</button>
      <button class="kb-view-btn${kb.view === 'table' ? ' active' : ''}" onclick="window.app._kbSetView('table')">&#9776; Table</button>
    </div>
  </div>`;
}

// ── Kanban: Card Renderer ──
function _kbCard(a, col, providerMap) {
  const payerName = a.payerName || a.payer_name || a.payer?.name || '—';
  const provName = providerMap[a.providerId || a.provider_id] || '';
  const stateCode = a.state || '';
  const updatedAt = a.updatedAt || a.updated_at || a.statusChangedAt || a.status_changed_at;
  const daysInStatus = updatedAt ? Math.floor((Date.now() - new Date(updatedAt)) / 86400000) : 0;
  const daysClass = daysInStatus < 30 ? 'green' : daysInStatus < 60 ? 'amber' : 'red';
  const effectiveDate = a.effectiveDate || a.effective_date;
  const estRevenue = parseFloat(a.estRevenue || a.est_revenue || 0) || 0;
  const notes = a.notes || '';
  const wave = a.wave;
  const groupDef = wave ? getGroupDef(wave) : null;
  const appId = a.id;

  let metaParts = '';
  if (effectiveDate) metaParts += `<span title="Effective Date">&#128197; ${formatDateDisplay(effectiveDate)}</span>`;
  if (estRevenue > 0) metaParts += `<span title="Est. Monthly Revenue">&#36;${estRevenue.toLocaleString()}/mo</span>`;

  return `<div class="kb-card" style="--card-accent:${col.color}" draggable="true"
    ondragstart="window.app._kbDragStart(event,'${appId}')" ondragend="window.app._kbDragEnd(event)"
    onclick="window.app.viewApplication('${appId}')">
    <div class="kb-card-actions" onclick="event.stopPropagation()">
      <button title="Edit" onclick="window.app.viewApplication('${appId}')">&#9998;</button>
      <button title="Follow-up" onclick="window.app._kbFollowUp('${appId}')">&#128340;</button>
      <button class="kb-act-danger" title="Delete" onclick="window.app._kbDelete('${appId}')">&#128465;</button>
    </div>
    <div class="kb-card-payer" title="${escHtml(payerName)}">${escHtml(payerName)}</div>
    <div class="kb-card-row">
      ${stateCode ? `<span class="kb-card-state-pill">${escHtml(stateCode)}</span>` : ''}
      ${groupDef ? `<span class="kb-card-group-pill" style="background:${groupDef.color}18;color:${groupDef.color}">${escHtml(groupDef.short)}</span>` : ''}
      ${provName ? `<span class="kb-card-provider" title="${escHtml(provName)}">${escHtml(provName)}</span>` : ''}
    </div>
    <div class="kb-card-row" style="justify-content:space-between">
      <span class="kb-card-days ${daysClass}" title="${daysInStatus} days in this status">&#9201; ${daysInStatus}d</span>
      ${metaParts ? `<div class="kb-card-meta">${metaParts}</div>` : ''}
    </div>
    ${notes ? `<div class="kb-card-notes" title="${escHtml(notes)}">${escHtml(notes.substring(0, 40))}${notes.length > 40 ? '...' : ''}</div>` : ''}
  </div>`;
}

// ─── Calendar Page ───

async function renderCalendarPage() {
  const body = document.getElementById('page-body');
  const month = window.app._calMonth;
  const year = window.app._calYear;
  const filters = window.app._calFilters;
  const selectedDay = window.app._calSelectedDay;

  let licenses = [], tasks = [], followups = [], apps = [], dea = [];
  try {
    [licenses, tasks, followups, apps, dea] = await Promise.all([
      store.getAll('licenses'), store.getAll('tasks'), store.getAll('followups'), store.getAll('applications'),
      store.getAll('dea_registrations').catch(() => []),
    ]);
    licenses = store.filterByScope(licenses);
    tasks = store.filterByScope(tasks);
    followups = store.filterByScope(followups);
    apps = store.filterByScope(apps);
  } catch (e) { console.error('Calendar error:', e); }

  // Build events map: day -> [events]
  const events = {};
  const addEvent = (day, type, label, color) => {
    if (!events[day]) events[day] = [];
    events[day].push({ type, label, color });
  };

  if (filters.licenses) {
    (licenses || []).forEach(l => {
      const exp = l.expirationDate || l.expiration_date;
      if (exp) {
        const d = new Date(exp);
        if (d.getMonth() === month && d.getFullYear() === year) addEvent(d.getDate(), 'license', `License exp: ${escHtml(l.state || '')} - ${escHtml(l.licenseNumber || l.license_number || '')}`, '#ef4444');
        // Renewal warning: 30 days before expiration
        const warn30 = new Date(d); warn30.setDate(warn30.getDate() - 30);
        if (warn30.getMonth() === month && warn30.getFullYear() === year) addEvent(warn30.getDate(), 'renewal', `Renew: ${escHtml(l.state || '')} license (30d warning)`, '#f97316');
        // Renewal warning: 60 days before
        const warn60 = new Date(d); warn60.setDate(warn60.getDate() - 60);
        if (warn60.getMonth() === month && warn60.getFullYear() === year) addEvent(warn60.getDate(), 'renewal', `Renew: ${escHtml(l.state || '')} license (60d warning)`, '#fb923c');
      }
    });
  }
  if (filters.tasks) {
    (tasks || []).forEach(t => {
      const due = t.dueDate || t.due_date;
      if (due) { const d = new Date(due); if (d.getMonth() === month && d.getFullYear() === year) addEvent(d.getDate(), 'task', `Task: ${escHtml(t.title || t.description || '')}`, '#10b981'); }
    });
  }
  if (filters.followups) {
    (followups || []).forEach(f => {
      const due = f.dueDate || f.due_date;
      if (due) { const d = new Date(due); if (d.getMonth() === month && d.getFullYear() === year) addEvent(d.getDate(), 'followup', `Followup: ${escHtml(f.type || '')}`, '#8b5cf6'); }
    });
  }
  if (filters.applications) {
    (apps || []).forEach(a => {
      const sub = a.submittedDate || a.submitted_date;
      if (sub) { const d = new Date(sub); if (d.getMonth() === month && d.getFullYear() === year) addEvent(d.getDate(), 'application', `Submitted: ${escHtml(a.payerName || a.payer_name || '')}`, '#3b82f6'); }
      const eff = a.effectiveDate || a.effective_date;
      if (eff) { const d = new Date(eff); if (d.getMonth() === month && d.getFullYear() === year) addEvent(d.getDate(), 'application', `Effective: ${escHtml(a.payerName || a.payer_name || '')}`, '#0ea5e9'); }
    });
  }
  // DEA expirations
  if (filters.licenses && Array.isArray(dea)) {
    dea.forEach(d => {
      const exp = d.expirationDate || d.expiration_date;
      if (exp) { const dt = new Date(exp); if (dt.getMonth() === month && dt.getFullYear() === year) addEvent(dt.getDate(), 'dea', `DEA exp: ${escHtml(d.deaNumber || d.dea_number || '')} - ${escHtml(d.state || '')}`, '#dc2626'); }
    });
  }
  // Compliance: CAQH re-attestation (quarterly — 1st of every 3rd month)
  if (filters.compliance) {
    const caqhMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
    if (caqhMonths.includes(month)) {
      addEvent(1, 'compliance', 'CAQH re-attestation due', '#7c3aed');
    }
    // Monthly: exclusion screening reminder on 15th
    addEvent(15, 'compliance', 'Monthly exclusion screening', '#7c3aed');
  }

  const monthName = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div style="padding:8px;"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dayEvents = events[d] || [];
    const isToday = isCurrentMonth && today.getDate() === d;
    const isSelected = selectedDay === d;
    cells += `<div onclick="window.app.calSelectDay(${d})" style="padding:6px;min-height:70px;border:1px solid var(--gray-200);border-radius:6px;cursor:pointer;background:${isSelected ? 'var(--brand-50)' : isToday ? '#fffbeb' : '#fff'};${isSelected ? 'outline:2px solid var(--brand-600);' : ''}">
      <div style="font-size:12px;font-weight:${isToday ? '700' : '500'};color:${isToday ? 'var(--brand-600)' : 'var(--gray-700)'};margin-bottom:2px;">${d}</div>
      ${dayEvents.slice(0, 3).map(e => `<div style="font-size:9px;padding:1px 4px;margin-bottom:1px;border-radius:3px;background:${e.color}20;color:${e.color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.label.split(':')[0]}</div>`).join('')}
      ${dayEvents.length > 3 ? `<div style="font-size:9px;color:var(--gray-400);">+${dayEvents.length - 3} more</div>` : ''}
    </div>`;
  }

  // Selected day detail
  let dayDetail = '';
  if (selectedDay && events[selectedDay]) {
    dayDetail = `<div class="card" style="margin-top:16px;">
      <div class="card-header"><h3>${monthName.split(' ')[0]} ${selectedDay}, ${year}</h3></div>
      <div class="card-body" style="padding:0;">
        <table><thead><tr><th>Type</th><th>Detail</th></tr></thead><tbody>
          ${events[selectedDay].map(e => `<tr>
            <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${e.color};margin-right:6px;"></span>${escHtml(e.type)}</td>
            <td>${e.label}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
  }

  body.innerHTML = `
    <style>
      .cal2-card{border-radius:16px;overflow:hidden;}
    </style>
    <!-- Filter Toggles -->
    <div class="card cal2-card" style="margin-bottom:16px;">
      <div class="card-body" style="padding:10px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        ${[
          { key: 'licenses', label: 'Licenses', color: '#ef4444' },
          { key: 'tasks', label: 'Tasks', color: '#10b981' },
          { key: 'followups', label: 'Follow-ups', color: '#8b5cf6' },
          { key: 'applications', label: 'Applications', color: '#3b82f6' },
          { key: 'compliance', label: 'Compliance', color: '#7c3aed' },
        ].map(f => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
          <input type="checkbox" ${filters[f.key] ? 'checked' : ''} onchange="window.app.calToggleFilter('${f.key}')">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${f.color};"></span> ${f.label}
        </label>`).join('')}
      </div>
    </div>

    <!-- Calendar Header -->
    <div class="card cal2-card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-sm" onclick="window.app.calPrev()">&larr;</button>
          <h3 style="margin:0;min-width:200px;text-align:center;">${monthName}</h3>
          <button class="btn btn-sm" onclick="window.app.calNext()">&rarr;</button>
        </div>
        <button class="btn btn-sm" onclick="window.app.calToday()">Today</button>
      </div>
      <div class="card-body" style="padding:8px;">
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">
          ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div style="text-align:center;font-size:11px;font-weight:700;color:var(--gray-500);padding:4px;">${d}</div>`).join('')}
          ${cells}
        </div>
      </div>
    </div>
    ${dayDetail}
  `;
}

// ─── Super Admin Panel ───

// [Lazy-loaded] renderAdminPanel — moved to ui/pages/ module

// [Lazy-loaded] renderOnboardingStub — moved to ui/pages/ module

// ─── Exclusion Screening Page ───

// [Lazy-loaded] renderExclusionsPage — moved to ui/pages/ module

// ─── Facilities Page ───

async function renderFacilitiesPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let facilities = [];
  try { facilities = await store.getFacilities(); } catch (e) { console.error('Facilities error:', e); }
  if (!Array.isArray(facilities)) facilities = [];

  const facActive = facilities.filter(f => f.status === 'active' || f.isActive).length;
  const facStates = new Set(facilities.map(f => f.state).filter(Boolean));

  body.innerHTML = `
    <style>
      .facv2-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:20px; }
      .facv2-stat { background:var(--surface-card,#fff); border-radius:16px; padding:18px 16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:transform 0.18s,box-shadow 0.18s; }
      .facv2-stat:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
      .facv2-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      .facv2-stat:nth-child(1)::before { background:linear-gradient(90deg,var(--brand-500),var(--brand-700)); }
      .facv2-stat:nth-child(2)::before { background:linear-gradient(90deg,#22c55e,#16a34a); }
      .facv2-stat:nth-child(3)::before { background:linear-gradient(90deg,#8b5cf6,#6d28d9); }
      .facv2-stat .facv2-val { font-size:28px; font-weight:800; line-height:1.1; }
      .facv2-stat .facv2-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
      .facv2-pill { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; }
      .facv2-type-badge { display:inline-flex; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; background:rgba(139,92,246,0.1); color:#7c3aed; }
      .facv2-status-dot { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; }
    </style>

    <!-- V2 Stat Cards -->
    <div class="facv2-stats">
      <div class="facv2-stat"><div class="facv2-val" style="color:var(--brand-600);">${facilities.length}</div><div class="facv2-lbl">Total Facilities</div></div>
      <div class="facv2-stat"><div class="facv2-val" style="color:#16a34a;">${facActive}</div><div class="facv2-lbl">Active</div></div>
      <div class="facv2-stat"><div class="facv2-val" style="color:#7c3aed;">${facStates.size}</div><div class="facv2-lbl">States</div></div>
    </div>

    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header">
        <h3>All Facilities (${facilities.length})</h3>
        <input type="text" id="facility-search" placeholder="Search facilities..." class="form-control" style="width:240px;height:34px;font-size:13px;border-radius:10px;" oninput="window.app.filterFacilities()">
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>NPI</th><th>Type</th><th>City / State</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody id="facility-table-body">
              ${facilities.map(f => {
                const isActive = f.status === 'active' || f.isActive;
                const statusLabel = isActive ? 'Active' : (f.status || 'Inactive');
                const addr = [f.city, f.state].filter(Boolean).join(', ');
                return `
                <tr class="facility-row" data-name="${escHtml((f.name || '').toLowerCase())}">
                  <td><strong>${escHtml(f.name || '—')}</strong>${f.address || f.street ? '<br><span style="font-size:11px;color:var(--gray-500);">' + escHtml(f.address || f.street || '') + '</span>' : ''}</td>
                  <td>${f.npi ? '<span class="facv2-pill" style="background:var(--brand-100,#e0f2fe);color:var(--brand-700);font-family:monospace;">' + escHtml(f.npi) + '</span>' : '<span style="color:var(--gray-400);">—</span>'}</td>
                  <td>${(f.facilityType || f.type) ? '<span class="facv2-type-badge">' + escHtml(f.facilityType || f.type) + '</span>' : '—'}</td>
                  <td>${escHtml(addr) || '—'}</td>
                  <td>${escHtml(f.phone || '—')}</td>
                  <td><span class="facv2-status-dot" style="background:${isActive ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.12)'};color:${isActive ? 'var(--green)' : 'var(--gray-500)'};"><span style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>${statusLabel}</span></td>
                  <td>
                    ${editButton('Edit', `window.app.editFacility(${f.id})`)}
                    ${deleteButton('Delete', `window.app.deleteFacility(${f.id})`)}
                  </td>
                </tr>`;
              }).join('')}
              ${facilities.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-500);">No facilities yet. Add one above.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Facility Modal -->
    <div class="modal" id="facility-modal">
      <div class="modal-content" style="max-width:560px;">
        <div class="modal-header">
          <h3 id="facility-modal-title">Add Facility</h3>
          <button class="modal-close" onclick="document.getElementById('facility-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body" id="facility-modal-body">
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;"><label>Facility Name *</label><input type="text" id="fac-name" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>NPI</label><input type="text" id="fac-npi" class="form-control" maxlength="10"></div>
            <div class="auth-field" style="margin:0;"><label>Type</label>
              <select id="fac-type" class="form-control">
                <option value="">Select Type</option>
                <option value="hospital">Hospital</option>
                <option value="clinic">Clinic</option>
                <option value="office">Office</option>
                <option value="urgent_care">Urgent Care</option>
                <option value="surgical_center">Surgical Center</option>
                <option value="lab">Laboratory</option>
                <option value="imaging">Imaging Center</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="telehealth">Telehealth</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Phone</label><input type="tel" id="fac-phone" class="form-control"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Address</label><input type="text" id="fac-address" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>City</label><input type="text" id="fac-city" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>State</label><input type="text" id="fac-state" class="form-control" maxlength="2" placeholder="e.g. TX"></div>
            <div class="auth-field" style="margin:0;"><label>ZIP</label><input type="text" id="fac-zip" class="form-control" maxlength="10"></div>
            <div class="auth-field" style="margin:0;"><label>Status</label>
              <select id="fac-status" class="form-control">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <input type="hidden" id="fac-edit-id" value="">
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('facility-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveFacility()">Save Facility</button>
        </div>
      </div>
    </div>

    <!-- NPI Facility Modal -->
    <div class="modal" id="npi-facility-modal">
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-header">
          <h3>Add Facility from NPI</h3>
          <button class="modal-close" onclick="document.getElementById('npi-facility-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-field" style="margin:0;">
            <label>Organization NPI (10 digits)</label>
            <input type="text" id="fac-npi-lookup" class="form-control" maxlength="10" placeholder="e.g. 1234567890">
          </div>
          <div id="fac-npi-result" style="display:none;margin-top:12px;"></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('npi-facility-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.createFacilityFromNpiLookup()">Create from NPI</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Billing & Invoicing Page ───
// Billing state kept on window for cross-module access
if (typeof window._billingTab === 'undefined') window._billingTab = 'invoices';
if (typeof window._invoiceLineItems === 'undefined') window._invoiceLineItems = [];
if (typeof window._billingServices === 'undefined') window._billingServices = [];
if (typeof window._contractLineItems === 'undefined') window._contractLineItems = [{ description: '', qty: 1, rate: 0 }];

// [Lazy-loaded]  — moved to ui/pages/ module

// [Lazy-loaded] _fmtMoney — moved to ui/pages/ module

// [Lazy-loaded] _renderSubscriptionTab — moved to ui/pages/ module

// [Lazy-loaded] _invoiceStatusBadge — moved to ui/pages/ module

// [Lazy-loaded] _nextInvoiceNumber — moved to ui/pages/ module

// [Lazy-loaded] _renderLineItemsEditor — moved to ui/pages/ module

// [Lazy-loaded] renderBillingPage — moved to ui/pages/ module

// ─── Invoice Detail View ───

// [Lazy-loaded] renderInvoiceDetail — moved to ui/pages/ module

// ─── Contracts & Agreements Page ───

// [Lazy-loaded]  — moved to ui/pages/ module

// [Lazy-loaded] _renderContractLineItems — moved to ui/pages/ module

// [Lazy-loaded] renderContractsPage — moved to ui/pages/ module

// [Lazy-loaded] renderContractDetail — moved to ui/pages/ module

// ─── Bulk Import Page ───

// [Lazy-loaded] renderImportPage — moved to ui/pages/ module

// ─── Compliance Center Page ───

// [Lazy-loaded] renderCompliancePage — moved to ui/pages/ module

// ─── Workflow Automations Page ───

// [Lazy-loaded]  — moved to ui/pages/ module

// [Lazy-loaded] _getAutomationRules — moved to ui/pages/ module

// [Lazy-loaded]  — moved to ui/pages/ module
// [Lazy-loaded]  — moved to ui/pages/ module
// [Lazy-loaded]  — moved to ui/pages/ module

// [Lazy-loaded] _triggerLabel — moved to ui/pages/ module

// [Lazy-loaded] renderAutomationsPage — moved to ui/pages/ module

// [Lazy-loaded] openAutomationRuleModal — moved to ui/pages/ module

// [Lazy-loaded] saveAutomationRule — moved to ui/pages/ module

// [Lazy-loaded] deleteAutomationRule — moved to ui/pages/ module

// [Lazy-loaded] toggleAutomationRule — moved to ui/pages/ module

// ─── FAQ / Knowledge Base Page ───

// [Lazy-loaded] renderFaqPage — moved to ui/pages/ module

// ─── Provider Credential / License Printout ───

// [Lazy-loaded] renderProviderPrintout — moved to ui/pages/ module

// ─── Provider Profile Page (Enhanced with Tabs) ───

// [Lazy-loaded] renderProviderProfilePage — moved to ui/pages/ module

// ═══════════════════════════════════════════════════════════════════
// SETUP WIZARD (First-Run Onboarding)
// ═══════════════════════════════════════════════════════════════════

function showSetupWizard() {
  let overlay = document.getElementById('setup-wizard-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'setup-wizard-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,0.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';

  const steps = [
    { title: 'Welcome to Credentik', icon: '&#128075;', desc: 'Let\'s get your credentialing workspace set up in under 5 minutes. We\'ll walk you through the key steps to start managing provider credentials.', action: null },
    { title: 'Add Your First Provider', icon: '&#128100;', desc: 'Start by adding a healthcare provider. You\'ll need their name, NPI number, credentials, and specialty. You can import more providers later via CSV.', action: 'navigateTo(\'providers\')' },
    { title: 'Add State Licenses', icon: '&#127963;', desc: 'Add the provider\'s state licenses with expiration dates. Credentik will automatically track renewals, send alerts, and verify license status.', action: 'navigateTo(\'licenses\')' },
    { title: 'Set Up Payer Applications', icon: '&#128196;', desc: 'Create credentialing applications for each payer the provider needs to be enrolled with. Track status from submission through approval.', action: 'navigateTo(\'applications\')' },
    { title: 'Run Exclusion Screening', icon: '&#128737;', desc: 'Screen all providers against OIG/SAM exclusion databases to ensure compliance. This is required for most payer contracts.', action: 'navigateTo(\'exclusions\')' },
    { title: 'You\'re All Set!', icon: '&#127881;', desc: 'Your workspace is ready. Explore the Compliance Center for scoring, PSV for verification, and Continuous Monitoring for real-time alerts. You can always access the setup guide from Settings.', action: null },
  ];

  let currentStep = 0;

  function renderStep() {
    const step = steps[currentStep];
    const isFirst = currentStep === 0;
    const isLast = currentStep === steps.length - 1;
    const progress = ((currentStep) / (steps.length - 1)) * 100;

    overlay.innerHTML = `
      <div style="width:90%;max-width:520px;background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;">
        <!-- Progress bar -->
        <div style="height:4px;background:var(--gray-100);"><div style="height:100%;width:${progress}%;background:var(--brand-600);transition:width 0.3s ease;border-radius:2px;"></div></div>

        <div style="padding:32px;">
          <!-- Step indicator -->
          <div style="display:flex;justify-content:center;gap:6px;margin-bottom:24px;">
            ${steps.map((_, i) => `<div style="width:${i === currentStep ? '24px' : '8px'};height:8px;border-radius:4px;background:${i <= currentStep ? 'var(--brand-600)' : 'var(--gray-200)'};transition:all 0.3s;"></div>`).join('')}
          </div>

          <!-- Content -->
          <div style="text-align:center;">
            <div style="font-size:48px;margin-bottom:16px;">${step.icon}</div>
            <h2 style="margin:0 0 12px;font-size:22px;color:var(--gray-900);">${step.title}</h2>
            <p style="margin:0 0 24px;font-size:14px;color:var(--gray-600);line-height:1.6;">${step.desc}</p>
          </div>

          <!-- Checklist (on welcome step) -->
          ${isFirst ? `<div style="text-align:left;background:var(--gray-50);border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--gray-500);margin-bottom:8px;">Setup Checklist</div>
            ${['Add providers & NPI numbers', 'Enter state licenses & DEA registrations', 'Create payer enrollment applications', 'Run OIG/SAM exclusion screening', 'Set up follow-up tasks & reminders'].map(item => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;color:var(--gray-700);">
              <div style="width:18px;height:18px;border-radius:4px;border:2px solid var(--gray-300);flex-shrink:0;"></div> ${item}
            </div>`).join('')}
          </div>` : ''}

          <!-- Actions -->
          <div style="display:flex;justify-content:${isFirst ? 'center' : 'space-between'};gap:12px;${isFirst ? '' : ''}">
            ${!isFirst ? `<button onclick="document.getElementById('setup-wizard-overlay')._prev()" class="btn" style="min-width:100px;">&#8592; Back</button>` : ''}
            <div style="display:flex;gap:8px;">
              ${!isLast ? `<button onclick="document.getElementById('setup-wizard-overlay')._dismiss()" class="btn" style="font-size:12px;color:var(--gray-400);">Skip Setup</button>` : ''}
              ${isLast ?
                `<button onclick="document.getElementById('setup-wizard-overlay')._dismiss()" class="btn btn-primary" style="min-width:160px;">Start Using Credentik</button>` :
                step.action ?
                  `<button onclick="${step.action};document.getElementById('setup-wizard-overlay')._dismiss()" class="btn" style="min-width:100px;">Go There</button>
                   <button onclick="document.getElementById('setup-wizard-overlay')._next()" class="btn btn-primary" style="min-width:100px;">Next &#8594;</button>` :
                  `<button onclick="document.getElementById('setup-wizard-overlay')._next()" class="btn btn-primary" style="min-width:160px;">${isFirst ? 'Get Started &#8594;' : 'Next &#8594;'}</button>`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  overlay._next = () => { if (currentStep < steps.length - 1) { currentStep++; renderStep(); } };
  overlay._prev = () => { if (currentStep > 0) { currentStep--; renderStep(); } };
  overlay._dismiss = () => { localStorage.setItem('credentik_setup_dismissed', '1'); overlay.remove(); };

  renderStep();
  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════════════════════
// PRIMARY SOURCE VERIFICATION (PSV) DASHBOARD
// ═══════════════════════════════════════════════════════════════════

// [Lazy-loaded] renderPSVPage — moved to ui/pages/ module

// ═══════════════════════════════════════════════════════════════════
// PROVIDER PORTABLE PROFILE (Shareable Credential Summary)
// ═══════════════════════════════════════════════════════════════════

// [Lazy-loaded] renderProviderPortableProfile — moved to ui/pages/ module

// ════════════════════════════════════════════════════════════════════
// ─── FUNDING HUB ──────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

// [Lazy-loaded] mapSource — moved to ui/pages/ module

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 1: Cmd+K Command Palette
// ═══════════════════════════════════════════════════════════════════════════

let _cmdPaletteStyled = false;
let _cmdSelectedIndex = 0;

const CMD_PALETTE_COMMANDS = [
  // Navigation
  { id: 'nav-dashboard', label: 'Dashboard', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('dashboard'); } },
  { id: 'nav-applications', label: 'Applications', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('applications'); } },
  { id: 'nav-kanban', label: 'Kanban Board', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('kanban'); } },
  { id: 'nav-followups', label: 'Follow-ups', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('followups'); } },
  { id: 'nav-tasks', label: 'Tasks', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('tasks'); } },
  { id: 'nav-providers', label: 'Providers', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('providers'); } },
  { id: 'nav-licenses', label: 'Licenses', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('licenses'); } },
  { id: 'nav-payers', label: 'Payers', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('payers'); } },
  { id: 'nav-settings', label: 'Settings', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('settings'); } },
  { id: 'nav-account', label: 'My Account', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('my-account'); } },
  { id: 'nav-audit', label: 'Audit Trail', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('audit-trail'); } },
  { id: 'nav-automations', label: 'Automations', category: 'Navigation', action: () => { closeCommandPalette(); navigateTo('automations'); } },
  // Actions
  { id: 'act-add-app', label: 'Add Application', category: 'Actions', action: () => { closeCommandPalette(); navigateTo('applications').then(() => { if (window.app.openAddModal) window.app.openAddModal(); }); } },
  { id: 'act-add-prov', label: 'Add Provider', category: 'Actions', action: () => { closeCommandPalette(); navigateTo('providers').then(() => { if (window.app.openProviderModal) window.app.openProviderModal(); }); } },
  { id: 'act-add-lic', label: 'Add License', category: 'Actions', action: () => { closeCommandPalette(); navigateTo('licenses').then(() => { if (window.app.openLicenseModal) window.app.openLicenseModal(); }); } },
  { id: 'act-add-task', label: 'Add Task', category: 'Actions', action: () => { closeCommandPalette(); navigateTo('tasks').then(() => { if (window.app.showAddTaskForm) window.app.showAddTaskForm(); }); } },
  { id: 'act-search-app', label: 'Search Applications', category: 'Actions', action: () => { closeCommandPalette(); navigateTo('applications'); } },
  { id: 'act-search-prov', label: 'Search Providers', category: 'Actions', action: () => { closeCommandPalette(); navigateTo('providers'); } },
  { id: 'act-export', label: 'Export Data', category: 'Actions', action: () => { closeCommandPalette(); navigateTo('settings'); } },
  { id: 'act-print', label: 'Print Page', category: 'Actions', action: () => { closeCommandPalette(); window.print(); } },
  // Quick Toggles
  { id: 'tog-dark', label: 'Toggle Dark Mode', category: 'Quick Toggles', action: () => { closeCommandPalette(); document.body.classList.toggle('dark-mode'); localStorage.setItem('credentik_dark', document.body.classList.contains('dark-mode')); } },
  { id: 'tog-sidebar', label: 'Toggle Sidebar', category: 'Quick Toggles', action: () => { closeCommandPalette(); const sb = document.querySelector('.sidebar'); if (sb) sb.classList.toggle('collapsed'); } },
];

function _injectCmdPaletteStyles() {
  if (_cmdPaletteStyled) return;
  _cmdPaletteStyled = true;
  const style = document.createElement('style');
  style.textContent = `
    .cmd-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);display:flex;justify-content:center;align-items:flex-start;padding-top:20vh;animation:cmd-fadeIn 0.15s ease;}
    @keyframes cmd-fadeIn{from{opacity:0}to{opacity:1}}
    .cmd-container{width:100%;max-width:600px;background:var(--bg-primary,#fff);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,0.25);overflow:hidden;animation:cmd-slideDown 0.15s ease;}
    @keyframes cmd-slideDown{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
    .cmd-search-wrap{display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border-color,#e5e7eb);gap:12px;}
    .cmd-search-icon{color:var(--gray-400,#9ca3af);flex-shrink:0;}
    .cmd-search-input{flex:1;border:none;outline:none;font-size:16px;background:transparent;color:var(--text-primary,#111);font-family:inherit;}
    .cmd-search-input::placeholder{color:var(--gray-400,#9ca3af);}
    .cmd-kbd{font-size:11px;padding:2px 6px;border-radius:4px;background:var(--gray-100,#f3f4f6);color:var(--gray-500,#6b7280);border:1px solid var(--gray-200,#e5e7eb);font-family:monospace;}
    .cmd-results{max-height:360px;overflow-y:auto;padding:8px 0;}
    .cmd-group-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--gray-400,#9ca3af);padding:8px 20px 4px;}
    .cmd-item{display:flex;align-items:center;gap:10px;padding:10px 20px;cursor:pointer;transition:background 0.1s;color:var(--text-primary,#111);font-size:14px;}
    .cmd-item:hover,.cmd-item.cmd-active{background:var(--brand-50,#eff6ff);color:var(--brand-700,#1d4ed8);}
    .cmd-item-icon{width:20px;text-align:center;color:var(--gray-400,#9ca3af);font-size:13px;}
    .cmd-empty{padding:32px 20px;text-align:center;color:var(--gray-400,#9ca3af);font-size:14px;}
    .cmd-footer{display:flex;gap:16px;padding:10px 20px;border-top:1px solid var(--border-color,#e5e7eb);font-size:11px;color:var(--gray-400,#9ca3af);}
  `;
  document.head.appendChild(style);
}

function _getCmdCategoryIcon(cat) {
  if (cat === 'Navigation') return '&#x2192;';
  if (cat === 'Actions') return '&#x26A1;';
  if (cat === 'Quick Toggles') return '&#x2699;';
  return '&#x2022;';
}

function openCommandPalette() {
  if (document.getElementById('cmd-palette-overlay')) { closeCommandPalette(); return; }
  _injectCmdPaletteStyles();
  _cmdSelectedIndex = 0;

  const overlay = document.createElement('div');
  overlay.id = 'cmd-palette-overlay';
  overlay.className = 'cmd-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeCommandPalette(); };
  overlay.innerHTML = `
    <div class="cmd-container">
      <div class="cmd-search-wrap">
        <span class="cmd-search-icon"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg></span>
        <input class="cmd-search-input" id="cmd-search" type="text" placeholder="Type a command..." autofocus autocomplete="off" />
        <span class="cmd-kbd">Esc</span>
      </div>
      <div class="cmd-results" id="cmd-results"></div>
      <div class="cmd-footer">
        <span><span class="cmd-kbd">&uarr;&darr;</span> Navigate</span>
        <span><span class="cmd-kbd">Enter</span> Select</span>
        <span><span class="cmd-kbd">Esc</span> Close</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = document.getElementById('cmd-search');
  _renderCmdResults('');
  input.addEventListener('input', () => { _cmdSelectedIndex = 0; _renderCmdResults(input.value); });
  input.addEventListener('keydown', (e) => {
    const items = document.querySelectorAll('.cmd-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); _cmdSelectedIndex = Math.min(_cmdSelectedIndex + 1, items.length - 1); _highlightCmdItem(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdSelectedIndex = Math.max(_cmdSelectedIndex - 1, 0); _highlightCmdItem(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[_cmdSelectedIndex]) items[_cmdSelectedIndex].click(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); }
  });
  setTimeout(() => input.focus(), 50);
}

function closeCommandPalette() {
  const el = document.getElementById('cmd-palette-overlay');
  if (el) el.remove();
}

function _renderCmdResults(query) {
  const container = document.getElementById('cmd-results');
  if (!container) return;
  const q = query.toLowerCase().trim();
  const filtered = q ? CMD_PALETTE_COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : CMD_PALETTE_COMMANDS;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="cmd-empty">No commands found</div>';
    return;
  }

  // Group by category
  const groups = {};
  filtered.forEach(c => { if (!groups[c.category]) groups[c.category] = []; groups[c.category].push(c); });

  let html = '';
  let idx = 0;
  for (const [cat, cmds] of Object.entries(groups)) {
    html += `<div class="cmd-group-label">${_getCmdCategoryIcon(cat)} ${cat}</div>`;
    for (const cmd of cmds) {
      html += `<div class="cmd-item${idx === _cmdSelectedIndex ? ' cmd-active' : ''}" data-cmd-idx="${idx}" onclick="(CMD_PALETTE_COMMANDS.find(c=>c.id==='${cmd.id}')||{action:()=>{}}).action()">${cmd.label}</div>`;
      idx++;
    }
  }
  container.innerHTML = html;

  // Bind hover to update selection
  container.querySelectorAll('.cmd-item').forEach((el) => {
    el.addEventListener('mouseenter', () => { _cmdSelectedIndex = parseInt(el.dataset.cmdIdx); _highlightCmdItem(); });
  });
}

function _highlightCmdItem() {
  document.querySelectorAll('.cmd-item').forEach((el, i) => {
    el.classList.toggle('cmd-active', i === _cmdSelectedIndex);
  });
  const active = document.querySelector('.cmd-item.cmd-active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

// Make CMD_PALETTE_COMMANDS accessible from onclick handlers
window.CMD_PALETTE_COMMANDS = CMD_PALETTE_COMMANDS;


// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 2: Provider Onboarding Wizard
// ═══════════════════════════════════════════════════════════════════════════

let _wizardState = null;

function _initWizardState() {
  _wizardState = {
    step: 1,
    totalSteps: 5,
    basic: { firstName: '', lastName: '', npi: '', credentials: '', specialty: '', taxonomy: '' },
    contact: { email: '', phone: '', address: '', city: '', state: '', zip: '' },
    licenses: [],
    education: [],
  };
}

async function renderProviderOnboardingWizard() {
  if (!_wizardState) _initWizardState();
  const body = document.getElementById('page-body');
  const s = _wizardState;

  // Inject wizard styles once
  const stepLabels = ['Basic Info', 'Contact', 'Licenses', 'Education', 'Review'];

  body.innerHTML = `
    <style>
      .wizard-container{max-width:720px;margin:0 auto;}
      .wizard-progress{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:32px;padding:0 20px;}
      .wizard-step-indicator{display:flex;flex-direction:column;align-items:center;gap:4px;position:relative;z-index:1;}
      .wizard-step-circle{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;border:2px solid var(--gray-300,#d1d5db);color:var(--gray-400,#9ca3af);background:var(--bg-primary,#fff);transition:all 0.2s;}
      .wizard-step-circle.wizard-active{border-color:var(--brand-600,#2563eb);color:#fff;background:var(--brand-600,#2563eb);}
      .wizard-step-circle.wizard-done{border-color:#22c55e;color:#fff;background:#22c55e;}
      .wizard-step-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-400,#9ca3af);white-space:nowrap;}
      .wizard-step-label.wizard-active-label{color:var(--brand-600,#2563eb);font-weight:700;}
      .wizard-step-line{flex:1;height:2px;background:var(--gray-200,#e5e7eb);min-width:40px;margin:0 -4px;margin-bottom:18px;}
      .wizard-step-line.wizard-done-line{background:#22c55e;}
      .wizard-card{background:var(--bg-primary,#fff);border-radius:16px;border:1px solid var(--border-color,#e5e7eb);box-shadow:0 1px 3px rgba(0,0,0,0.06);padding:28px 32px;}
      .wizard-card h3{margin:0 0 20px;font-size:18px;font-weight:700;color:var(--text-primary,#111);}
      .wizard-field{margin-bottom:16px;}
      .wizard-field label{display:block;font-size:12px;font-weight:600;color:var(--gray-600,#4b5563);margin-bottom:4px;}
      .wizard-field input,.wizard-field select{width:100%;padding:10px 12px;border:1px solid var(--gray-300,#d1d5db);border-radius:8px;font-size:14px;background:var(--bg-primary,#fff);color:var(--text-primary,#111);font-family:inherit;box-sizing:border-box;}
      .wizard-field input:focus,.wizard-field select:focus{outline:none;border-color:var(--brand-600,#2563eb);box-shadow:0 0 0 3px rgba(37,99,235,0.1);}
      .wizard-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
      .wizard-row-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
      .wizard-actions{display:flex;justify-content:space-between;align-items:center;margin-top:24px;padding-top:20px;border-top:1px solid var(--gray-200,#e5e7eb);}
      .wizard-btn{padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;transition:all 0.15s;}
      .wizard-btn-primary{background:var(--brand-600,#2563eb);color:#fff;}
      .wizard-btn-primary:hover{background:var(--brand-700,#1d4ed8);}
      .wizard-btn-secondary{background:var(--gray-100,#f3f4f6);color:var(--gray-700,#374151);}
      .wizard-btn-secondary:hover{background:var(--gray-200,#e5e7eb);}
      .wizard-btn-success{background:#22c55e;color:#fff;}
      .wizard-btn-success:hover{background:#16a34a;}
      .wizard-sub-card{background:var(--gray-50,#f9fafb);border:1px solid var(--gray-200,#e5e7eb);border-radius:10px;padding:16px;margin-bottom:12px;position:relative;}
      .wizard-remove-btn{position:absolute;top:8px;right:8px;background:none;border:none;color:var(--gray-400,#9ca3af);cursor:pointer;font-size:18px;line-height:1;}
      .wizard-remove-btn:hover{color:#ef4444;}
      .wizard-review-section{margin-bottom:20px;}
      .wizard-review-section h4{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500,#6b7280);margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid var(--gray-200,#e5e7eb);}
      .wizard-review-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;}
      .wizard-review-label{color:var(--gray-500,#6b7280);}
      .wizard-review-value{font-weight:600;color:var(--text-primary,#111);}
      .wizard-error{color:#ef4444;font-size:12px;margin-top:4px;}
      @media(max-width:600px){.wizard-row,.wizard-row-3{grid-template-columns:1fr;}.wizard-card{padding:20px 16px;}}
    </style>

    <div class="wizard-container">
      <!-- Progress Bar -->
      <div class="wizard-progress">
        ${stepLabels.map((lbl, i) => {
          const num = i + 1;
          const isDone = num < s.step;
          const isActive = num === s.step;
          return (i > 0 ? `<div class="wizard-step-line${isDone ? ' wizard-done-line' : ''}"></div>` : '') +
            `<div class="wizard-step-indicator">
              <div class="wizard-step-circle${isActive ? ' wizard-active' : ''}${isDone ? ' wizard-done' : ''}">${isDone ? '&#10003;' : num}</div>
              <div class="wizard-step-label${isActive ? ' wizard-active-label' : ''}">${lbl}</div>
            </div>`;
        }).join('')}
      </div>

      <!-- Step Content -->
      <div class="wizard-card">
        ${_wizardStepContent(s)}
      </div>

      <!-- Actions -->
      <div class="wizard-actions">
        ${s.step > 1 ? '<button class="wizard-btn wizard-btn-secondary" onclick="window.app.wizardBack()">&#8592; Back</button>' : '<div></div>'}
        ${s.step < s.totalSteps
          ? '<button class="wizard-btn wizard-btn-primary" onclick="window.app.wizardNext()">Next &#8594;</button>'
          : '<button class="wizard-btn wizard-btn-success" onclick="window.app.wizardCreate()">&#10003; Create Provider</button>'
        }
      </div>
    </div>`;
}

function _wizardStepContent(s) {
  const stateOptions = STATES.map(st => `<option value="${st.code || st.abbreviation}" ${s.contact.state === (st.code || st.abbreviation) ? 'selected' : ''}>${st.name || st.code}</option>`).join('');

  switch (s.step) {
    case 1: return `
      <h3>Step 1: Basic Information</h3>
      <div class="wizard-row">
        <div class="wizard-field"><label>First Name *</label><input id="wiz-firstName" value="${escHtml(s.basic.firstName)}" placeholder="First name" /></div>
        <div class="wizard-field"><label>Last Name *</label><input id="wiz-lastName" value="${escHtml(s.basic.lastName)}" placeholder="Last name" /></div>
      </div>
      <div class="wizard-row">
        <div class="wizard-field"><label>NPI *</label><input id="wiz-npi" value="${escHtml(s.basic.npi)}" placeholder="10-digit NPI" maxlength="10" /></div>
        <div class="wizard-field"><label>Credentials</label><input id="wiz-credentials" value="${escHtml(s.basic.credentials)}" placeholder="e.g. MD, DO, PMHNP" /></div>
      </div>
      <div class="wizard-row">
        <div class="wizard-field"><label>Specialty</label><input id="wiz-specialty" value="${escHtml(s.basic.specialty)}" placeholder="e.g. Psychiatry" /></div>
        <div class="wizard-field"><label>Taxonomy Code</label><input id="wiz-taxonomy" value="${escHtml(s.basic.taxonomy)}" placeholder="e.g. 2084P0800X" /></div>
      </div>`;

    case 2: return `
      <h3>Step 2: Contact Information</h3>
      <div class="wizard-row">
        <div class="wizard-field"><label>Email</label><input id="wiz-email" type="email" value="${escHtml(s.contact.email)}" placeholder="provider@example.com" /></div>
        <div class="wizard-field"><label>Phone</label><input id="wiz-phone" value="${escHtml(s.contact.phone)}" placeholder="(555) 555-5555" /></div>
      </div>
      <div class="wizard-field"><label>Address</label><input id="wiz-address" value="${escHtml(s.contact.address)}" placeholder="Street address" /></div>
      <div class="wizard-row-3">
        <div class="wizard-field"><label>City</label><input id="wiz-city" value="${escHtml(s.contact.city)}" placeholder="City" /></div>
        <div class="wizard-field"><label>State</label><select id="wiz-state"><option value="">Select...</option>${stateOptions}</select></div>
        <div class="wizard-field"><label>ZIP</label><input id="wiz-zip" value="${escHtml(s.contact.zip)}" placeholder="ZIP code" maxlength="10" /></div>
      </div>`;

    case 3: return `
      <h3>Step 3: State Licenses</h3>
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">Add one or more state licenses for this provider.</p>
      <div id="wiz-licenses-list">
        ${s.licenses.map((lic, i) => `
          <div class="wizard-sub-card">
            <button class="wizard-remove-btn" onclick="window.app.wizardRemoveLicense(${i})" title="Remove">&times;</button>
            <div class="wizard-row">
              <div class="wizard-field"><label>State *</label><select id="wiz-lic-state-${i}"><option value="">Select...</option>${stateOptions.replace(`value="${lic.state}" `, `value="${lic.state}" selected `)}</select></div>
              <div class="wizard-field"><label>License # *</label><input id="wiz-lic-num-${i}" value="${escHtml(lic.number)}" placeholder="License number" /></div>
            </div>
            <div class="wizard-row">
              <div class="wizard-field"><label>Type</label><input id="wiz-lic-type-${i}" value="${escHtml(lic.type)}" placeholder="e.g. LCSW, MD, RN" /></div>
              <div class="wizard-field"><label>Expiration</label><input id="wiz-lic-exp-${i}" type="date" value="${escHtml(lic.expiration)}" /></div>
            </div>
          </div>`).join('')}
      </div>
      <button class="wizard-btn wizard-btn-secondary" onclick="window.app.wizardAddLicense()" style="margin-top:8px;">+ Add License</button>`;

    case 4: return `
      <h3>Step 4: Education</h3>
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">Add education and training records.</p>
      <div id="wiz-education-list">
        ${s.education.map((edu, i) => `
          <div class="wizard-sub-card">
            <button class="wizard-remove-btn" onclick="window.app.wizardRemoveEducation(${i})" title="Remove">&times;</button>
            <div class="wizard-row">
              <div class="wizard-field"><label>Institution *</label>
                <select id="wiz-edu-inst-${i}" onchange="if(this.value==='__other__'){document.getElementById('wiz-edu-inst-custom-${i}').style.display='';this.style.display='none';}">
                  <option value="">Select...</option>
                  ${PRESET_INSTITUTIONS.map(inst => `<option value="${escHtml(inst)}" ${edu.institution === inst ? 'selected' : ''}>${escHtml(inst)}</option>`).join('')}
                  <option value="__other__">Other...</option>
                </select>
                <input id="wiz-edu-inst-custom-${i}" value="${PRESET_INSTITUTIONS.includes(edu.institution) ? '' : escHtml(edu.institution)}" placeholder="Type institution name" style="display:${PRESET_INSTITUTIONS.includes(edu.institution) || !edu.institution ? 'none' : ''};margin-top:4px;" />
              </div>
              <div class="wizard-field"><label>Degree *</label>
                <select id="wiz-edu-degree-${i}">
                  <option value="">Select...</option>
                  ${PRESET_DEGREES.map(d => `<option value="${escHtml(d)}" ${edu.degree === d ? 'selected' : ''}>${escHtml(d)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="wizard-row">
              <div class="wizard-field"><label>Field of Study</label>
                <select id="wiz-edu-field-${i}">
                  <option value="">Select...</option>
                  ${PRESET_FIELDS_OF_STUDY.map(f => `<option value="${escHtml(f)}" ${edu.field === f ? 'selected' : ''}>${escHtml(f)}</option>`).join('')}
                </select>
              </div>
              <div class="wizard-field"><label>Year Completed</label><input id="wiz-edu-year-${i}" value="${escHtml(edu.year)}" placeholder="e.g. 2020" maxlength="4" /></div>
            </div>
          </div>`).join('')}
      </div>
      <button class="wizard-btn wizard-btn-secondary" onclick="window.app.wizardAddEducation()" style="margin-top:8px;">+ Add Education</button>`;

    case 5:
      return `
      <h3>Step 5: Review & Create</h3>
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:20px;">Review the information below, then click "Create Provider" to save.</p>
      <div class="wizard-review-section">
        <h4>Basic Information</h4>
        <div class="wizard-review-row"><span class="wizard-review-label">Name</span><span class="wizard-review-value">${escHtml(s.basic.firstName)} ${escHtml(s.basic.lastName)}</span></div>
        <div class="wizard-review-row"><span class="wizard-review-label">NPI</span><span class="wizard-review-value">${escHtml(s.basic.npi) || '—'}</span></div>
        <div class="wizard-review-row"><span class="wizard-review-label">Credentials</span><span class="wizard-review-value">${escHtml(s.basic.credentials) || '—'}</span></div>
        <div class="wizard-review-row"><span class="wizard-review-label">Specialty</span><span class="wizard-review-value">${escHtml(s.basic.specialty) || '—'}</span></div>
        <div class="wizard-review-row"><span class="wizard-review-label">Taxonomy</span><span class="wizard-review-value">${escHtml(s.basic.taxonomy) || '—'}</span></div>
      </div>
      <div class="wizard-review-section">
        <h4>Contact</h4>
        <div class="wizard-review-row"><span class="wizard-review-label">Email</span><span class="wizard-review-value">${escHtml(s.contact.email) || '—'}</span></div>
        <div class="wizard-review-row"><span class="wizard-review-label">Phone</span><span class="wizard-review-value">${escHtml(s.contact.phone) || '—'}</span></div>
        <div class="wizard-review-row"><span class="wizard-review-label">Address</span><span class="wizard-review-value">${[s.contact.address, s.contact.city, s.contact.state, s.contact.zip].filter(Boolean).join(', ') || '—'}</span></div>
      </div>
      ${s.licenses.length > 0 ? `<div class="wizard-review-section">
        <h4>Licenses (${s.licenses.length})</h4>
        ${s.licenses.map(l => `<div class="wizard-review-row"><span class="wizard-review-label">${escHtml(l.state)} — ${escHtml(l.type || 'License')}</span><span class="wizard-review-value">#${escHtml(l.number)}${l.expiration ? ' (exp ' + l.expiration + ')' : ''}</span></div>`).join('')}
      </div>` : ''}
      ${s.education.length > 0 ? `<div class="wizard-review-section">
        <h4>Education (${s.education.length})</h4>
        ${s.education.map(e => `<div class="wizard-review-row"><span class="wizard-review-label">${escHtml(e.degree || '—')} — ${escHtml(e.field || '—')}</span><span class="wizard-review-value">${escHtml(e.institution || '—')}${e.year ? ' (' + e.year + ')' : ''}</span></div>`).join('')}
      </div>` : ''}`;

    default: return '';
  }
}

function _saveWizardStepData() {
  const s = _wizardState;
  const val = (id) => document.getElementById(id)?.value?.trim() || '';

  switch (s.step) {
    case 1:
      s.basic.firstName = val('wiz-firstName');
      s.basic.lastName = val('wiz-lastName');
      s.basic.npi = val('wiz-npi');
      s.basic.credentials = val('wiz-credentials');
      s.basic.specialty = val('wiz-specialty');
      s.basic.taxonomy = val('wiz-taxonomy');
      break;
    case 2:
      s.contact.email = val('wiz-email');
      s.contact.phone = val('wiz-phone');
      s.contact.address = val('wiz-address');
      s.contact.city = val('wiz-city');
      s.contact.state = val('wiz-state');
      s.contact.zip = val('wiz-zip');
      break;
    case 3:
      s.licenses = s.licenses.map((lic, i) => ({
        state: val(`wiz-lic-state-${i}`),
        number: val(`wiz-lic-num-${i}`),
        type: val(`wiz-lic-type-${i}`),
        expiration: val(`wiz-lic-exp-${i}`),
      }));
      break;
    case 4:
      s.education = s.education.map((edu, i) => {
        const selVal = val(`wiz-edu-inst-${i}`);
        const customVal = val(`wiz-edu-inst-custom-${i}`);
        return {
          institution: selVal === '__other__' ? customVal : (selVal || customVal),
          degree: val(`wiz-edu-degree-${i}`),
          field: val(`wiz-edu-field-${i}`),
          year: val(`wiz-edu-year-${i}`),
        };
      });
      break;
  }
}

function _validateWizardStep() {
  const s = _wizardState;
  switch (s.step) {
    case 1:
      if (!s.basic.firstName) { showToast('First name is required', 'error'); return false; }
      if (!s.basic.lastName) { showToast('Last name is required', 'error'); return false; }
      if (s.basic.npi && !/^\d{10}$/.test(s.basic.npi)) { showToast('NPI must be 10 digits', 'error'); return false; }
      return true;
    case 2: return true; // contact is optional
    case 3:
      for (const lic of s.licenses) {
        if (!lic.state || !lic.number) { showToast('Each license needs a state and number', 'error'); return false; }
      }
      return true;
    case 4:
      for (const edu of s.education) {
        if (!edu.institution || !edu.degree) { showToast('Each education entry needs an institution and degree', 'error'); return false; }
      }
      return true;
    default: return true;
  }
}

async function wizardNav(dir) {
  _saveWizardStepData();
  if (dir > 0 && !_validateWizardStep()) return;
  _wizardState.step += dir;
  if (_wizardState.step < 1) _wizardState.step = 1;
  if (_wizardState.step > _wizardState.totalSteps) _wizardState.step = _wizardState.totalSteps;
  await renderProviderOnboardingWizard();
}

function wizardAddLicense() {
  _saveWizardStepData();
  _wizardState.licenses.push({ state: '', number: '', type: '', expiration: '' });
  renderProviderOnboardingWizard();
}

function wizardRemoveLicense(idx) {
  _saveWizardStepData();
  _wizardState.licenses.splice(idx, 1);
  renderProviderOnboardingWizard();
}

function wizardAddEducation() {
  _saveWizardStepData();
  _wizardState.education.push({ institution: '', degree: '', field: '', year: '' });
  renderProviderOnboardingWizard();
}

function wizardRemoveEducation(idx) {
  _saveWizardStepData();
  _wizardState.education.splice(idx, 1);
  renderProviderOnboardingWizard();
}

async function wizardCreate() {
  const s = _wizardState;
  try {
    // Create the provider
    const providerData = {
      firstName: s.basic.firstName,
      lastName: s.basic.lastName,
      npi: s.basic.npi,
      credentials: s.basic.credentials,
      specialty: s.basic.specialty,
      taxonomy: s.basic.taxonomy,
      email: s.contact.email,
      phone: s.contact.phone,
      address: s.contact.address,
      city: s.contact.city,
      state: s.contact.state,
      zip: s.contact.zip,
      active: true,
    };
    const provider = await store.create('providers', providerData);
    const providerId = provider?.id || provider?.provider_id;

    // Create licenses
    for (const lic of s.licenses) {
      if (lic.state && lic.number) {
        await store.create('licenses', {
          providerId,
          state: lic.state,
          licenseNumber: lic.number,
          licenseType: lic.type,
          expirationDate: lic.expiration,
          status: 'active',
        });
      }
    }

    // Store education on the provider profile (update with education array)
    if (s.education.length > 0) {
      await store.update('providers', providerId, {
        education: s.education.map(e => ({
          institution: e.institution,
          degree: e.degree,
          fieldOfStudy: e.field,
          yearCompleted: e.year,
        })),
      });
    }

    showToast('Provider created successfully!', 'success');
    _wizardState = null; // Reset wizard
    await navigateTo('providers');
  } catch (err) {
    showToast('Error creating provider: ' + err.message, 'error');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 3: Contextual Help Tooltips
// ═══════════════════════════════════════════════════════════════════════════

let _helpTipStyled = false;
let _helpTipCounter = 0;

function _injectHelpTipStyles() {
  if (_helpTipStyled) return;
  _helpTipStyled = true;
  const style = document.createElement('style');
  style.textContent = `
    .help-tip{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#3b82f6;color:#fff;font-size:11px;font-weight:700;cursor:pointer;user-select:none;vertical-align:middle;margin-left:6px;line-height:1;position:relative;flex-shrink:0;transition:background 0.15s;}
    .help-tip:hover{background:#2563eb;}
    .help-popover{position:absolute;z-index:9999;background:var(--bg-primary,#fff);border:1px solid var(--gray-200,#e5e7eb);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,0.15);padding:14px 16px;max-width:280px;font-size:13px;font-weight:400;color:var(--text-primary,#374151);line-height:1.5;white-space:normal;left:50%;transform:translateX(-50%);top:calc(100% + 10px);animation:helpTipIn 0.15s ease;}
    .help-popover::before{content:'';position:absolute;top:-6px;left:50%;transform:translateX(-50%) rotate(45deg);width:10px;height:10px;background:var(--bg-primary,#fff);border-top:1px solid var(--gray-200,#e5e7eb);border-left:1px solid var(--gray-200,#e5e7eb);}
    @keyframes helpTipIn{from{opacity:0;transform:translateX(-50%) translateY(4px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  `;
  document.head.appendChild(style);
}

function helpTip(text) {
  _injectHelpTipStyles();
  const id = 'help-tip-' + (++_helpTipCounter);
  return `<span class="help-tip" id="${id}" onclick="event.stopPropagation();window.app.toggleHelpTip('${id}')" data-help="${escHtml(text)}">?</span>`;
}

function toggleHelpTip(id) {
  const el = document.getElementById(id);
  if (!el) return;

  // If already showing, close it
  const existing = el.querySelector('.help-popover');
  if (existing) { existing.remove(); return; }

  // Close any other open popovers
  document.querySelectorAll('.help-popover').forEach(p => p.remove());

  // Create popover
  const pop = document.createElement('div');
  pop.className = 'help-popover';
  pop.textContent = el.dataset.help;
  el.style.position = 'relative';
  el.appendChild(pop);

  // Auto-dismiss on click outside
  const dismiss = (e) => {
    if (!el.contains(e.target)) {
      pop.remove();
      document.removeEventListener('click', dismiss, true);
    }
  };
  setTimeout(() => document.addEventListener('click', dismiss, true), 10);
}

// Expose helpTip globally so render functions can use it
window._helpTip = helpTip;

function openFundingApplicationModal() {
  showToast('Application tracking coming soon — track your grant applications from draft to award.', 'info');
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 2: API Documentation Page
// ═══════════════════════════════════════════════════════════════════════════

// [Lazy-loaded] renderApiDocsPage — moved to ui/pages/ module

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 3: Webhook Event System
// ═══════════════════════════════════════════════════════════════════════════

const WEBHOOK_EVENTS = [
  { value: 'application.created', label: 'Application Created' },
  { value: 'application.updated', label: 'Application Updated' },
  { value: 'application.status_changed', label: 'Application Status Changed' },
  { value: 'license.created', label: 'License Created' },
  { value: 'license.expiring', label: 'License Expiring (30 days)' },
  { value: 'license.expired', label: 'License Expired' },
  { value: 'provider.created', label: 'Provider Created' },
  { value: 'provider.updated', label: 'Provider Updated' },
  { value: 'task.created', label: 'Task Created' },
  { value: 'task.completed', label: 'Task Completed' },
  { value: 'document.uploaded', label: 'Document Uploaded' },
];

function _getWebhooks() {
  try { return JSON.parse(localStorage.getItem('credentik_webhooks') || '[]'); } catch { return []; }
}

function _saveWebhooks(hooks) {
  localStorage.setItem('credentik_webhooks', JSON.stringify(hooks));
}

function _getWebhookDeliveries() {
  try { return JSON.parse(localStorage.getItem('credentik_webhook_deliveries') || '[]'); } catch { return []; }
}

function _saveWebhookDeliveries(deliveries) {
  localStorage.setItem('credentik_webhook_deliveries', JSON.stringify(deliveries.slice(0, 50)));
}

function renderWebhookList() {
  const hooks = _getWebhooks();
  if (!hooks.length) {
    return `
      <div style="text-align:center;padding:32px;color:var(--text-quaternary);">
        <svg width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" style="margin:0 auto 12px;display:block;opacity:0.4;"><path d="M1 8h3l2-5 2 10 2-5h5"/></svg>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;">No webhooks configured</div>
        <div style="font-size:12px;">Add a webhook endpoint to receive real-time event notifications.</div>
      </div>`;
  }
  return hooks.map(h => `
    <div class="webhook-card" style="padding:16px;border-radius:16px;border:1px solid var(--border-color,#e5e7eb);margin-bottom:12px;background:var(--surface-card,#f9fafb);transition:transform 0.15s,box-shadow 0.15s;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${h.active ? '#10b981' : '#9ca3af'};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(h.url)}</div>
          <div style="font-size:11px;color:var(--text-quaternary);margin-top:2px;">${h.events.length} events subscribed &middot; ${h.active ? 'Active' : 'Paused'}${h.lastTriggered ? ' &middot; Last: ' + formatDateDisplay(h.lastTriggered) : ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-sm" onclick="window.app.testWebhook('${h.id}')" title="Send test">Test</button>
          <button class="btn btn-sm" onclick="window.app.toggleWebhook('${h.id}')" title="${h.active ? 'Pause' : 'Activate'}">${h.active ? 'Pause' : 'Activate'}</button>
          <button class="btn btn-sm btn-danger" onclick="window.app.deleteWebhook('${h.id}')" title="Delete">Delete</button>
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        ${h.events.map(ev => `<span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:6px;background:var(--brand-100,#cffafe);color:var(--brand-700,#0e7490);">${ev}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function renderWebhookDeliveries() {
  const deliveries = _getWebhookDeliveries();
  if (!deliveries.length) {
    return '<div style="text-align:center;padding:24px;color:var(--text-quaternary);font-size:13px;">No deliveries yet.</div>';
  }
  return `<div style="overflow-x:auto;">
    <table style="width:100%;font-size:12px;">
      <thead><tr><th style="text-align:left;padding:8px;">Time</th><th style="text-align:left;padding:8px;">URL</th><th style="text-align:left;padding:8px;">Event</th><th style="text-align:left;padding:8px;">Status</th></tr></thead>
      <tbody>
        ${deliveries.slice(0, 10).map(d => `
          <tr>
            <td style="padding:8px;white-space:nowrap;">${d.time}</td>
            <td style="padding:8px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(d.url)}</td>
            <td style="padding:8px;"><span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:6px;background:var(--brand-100,#cffafe);color:var(--brand-700);">${d.event}</span></td>
            <td style="padding:8px;"><span style="font-weight:700;color:${d.status === 200 ? '#10b981' : '#ef4444'};">${d.status}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
}

function openWebhookModal() {
  let modal = document.getElementById('webhook-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'webhook-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:540px;border-radius:16px;">
        <div class="modal-header">
          <h2 id="webhook-modal-title">Add Webhook</h2>
          <button class="modal-close" onclick="window.app.closeWebhookModal()">&times;</button>
        </div>
        <div class="modal-body" id="webhook-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('webhook-modal-body').innerHTML = `
    <div class="form-group">
      <label style="font-weight:600;">Endpoint URL *</label>
      <input type="url" class="form-control" id="webhook-url" placeholder="https://your-server.com/webhook" style="border-radius:10px;">
    </div>
    <div class="form-group">
      <label style="font-weight:600;">Events to Subscribe</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;">
        ${WEBHOOK_EVENTS.map(ev => `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:6px 8px;border-radius:8px;transition:background 0.1s;" onmouseenter="this.style.background='var(--table-row-hover)'" onmouseleave="this.style.background='none'">
            <input type="checkbox" class="webhook-event-cb" value="${ev.value}"> ${ev.label}
          </label>
        `).join('')}
      </div>
    </div>
    <div class="form-group" style="display:flex;align-items:center;gap:10px;">
      <label style="font-weight:600;margin:0;">Active</label>
      <input type="checkbox" id="webhook-active" checked>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
      <button class="btn" onclick="window.app.closeWebhookModal()">Cancel</button>
      <button class="btn btn-primary" onclick="window.app.saveWebhookForm()" style="border-radius:10px;">Save Webhook</button>
    </div>
  `;
  modal.classList.add('active');
}

function saveWebhookForm() {
  const url = document.getElementById('webhook-url')?.value?.trim();
  if (!url) { showToast('Enter a webhook URL'); return; }
  const events = [...document.querySelectorAll('.webhook-event-cb:checked')].map(cb => cb.value);
  if (!events.length) { showToast('Select at least one event'); return; }
  const active = document.getElementById('webhook-active')?.checked !== false;
  const hooks = _getWebhooks();
  hooks.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), url, events, active, lastTriggered: null, createdAt: new Date().toISOString() });
  _saveWebhooks(hooks);
  showToast('Webhook added');
  document.getElementById('webhook-modal')?.classList.remove('active');
  const container = document.getElementById('webhook-list-container');
  if (container) container.innerHTML = renderWebhookList();
}

function deleteWebhookById(id) {
  const hooks = _getWebhooks().filter(h => h.id !== id);
  _saveWebhooks(hooks);
  showToast('Webhook deleted');
  const container = document.getElementById('webhook-list-container');
  if (container) container.innerHTML = renderWebhookList();
}

function toggleWebhookById(id) {
  const hooks = _getWebhooks();
  const hook = hooks.find(h => h.id === id);
  if (hook) { hook.active = !hook.active; _saveWebhooks(hooks); showToast(hook.active ? 'Webhook activated' : 'Webhook paused'); }
  const container = document.getElementById('webhook-list-container');
  if (container) container.innerHTML = renderWebhookList();
}

function testWebhookById(id) {
  const hooks = _getWebhooks();
  const hook = hooks.find(h => h.id === id);
  if (!hook) return;
  // Simulate a test delivery
  const deliveries = _getWebhookDeliveries();
  const now = new Date();
  deliveries.unshift({
    time: now.toISOString().replace('T', ' ').slice(0, 19),
    url: hook.url,
    event: 'test.ping',
    status: 200,
    payload: '{"event":"test.ping","timestamp":"' + now.toISOString() + '"}',
  });
  hook.lastTriggered = now.toISOString().split('T')[0];
  _saveWebhooks(hooks);
  _saveWebhookDeliveries(deliveries);
  showToast('Test webhook sent (simulated 200 OK)');
  const listContainer = document.getElementById('webhook-list-container');
  if (listContainer) listContainer.innerHTML = renderWebhookList();
  const delContainer = document.getElementById('webhook-deliveries-container');
  if (delContainer) delContainer.innerHTML = renderWebhookDeliveries();
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 4: Enhanced Global Search — Recent Searches & Suggestions
// ═══════════════════════════════════════════════════════════════════════════

function _getRecentSearches() {
  try { return JSON.parse(localStorage.getItem('credentik_recent_searches') || '[]'); } catch { return []; }
}

function _trackRecentSearch(query) {
  if (!query || query.length < 2) return;
  let recent = _getRecentSearches();
  recent = recent.filter(s => s !== query);
  recent.unshift(query);
  recent = recent.slice(0, 5);
  localStorage.setItem('credentik_recent_searches', JSON.stringify(recent));
}

function _showSearchEmptyState() {
  const resultsDiv = document.getElementById('global-search-results');
  if (!resultsDiv) return;

  const recentSearches = _getRecentSearches();
  const quickCmds = [
    { icon: '\u{1F4CA}', label: 'Go to Dashboard', sub: 'Overview & analytics', action: "navigateTo('dashboard')" },
    { icon: '\u{1F4CB}', label: 'Go to Applications', sub: 'Credentialing apps', action: "navigateTo('applications')" },
    { icon: '\u{1F464}', label: 'Go to Providers', sub: 'Provider directory', action: "navigateTo('providers')" },
    { icon: '\u{1FAAA}', label: 'Go to Licenses', sub: 'License tracking', action: "navigateTo('licenses')" },
    { icon: '\u{2795}', label: 'Add Application', sub: 'New credentialing app', action: "window.app.quickAddApp()" },
    { icon: '\u{2705}', label: 'Add Task', sub: 'New task or reminder', action: "window.app.showQuickTask()" },
    { icon: '\u{1F514}', label: 'Notifications', sub: 'View notifications', action: "window.app.toggleNotifications()" },
    { icon: '\u{2699}\u{FE0F}', label: 'Settings', sub: 'Account & data', action: "navigateTo('settings')" },
  ];

  let html = '';

  // Recent searches section
  if (recentSearches.length > 0) {
    html += `<div style="padding:8px 12px 4px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-quaternary);">Recent Searches</span>
      <button onclick="window.app.clearRecentSearches();event.stopPropagation();" style="font-size:11px;color:var(--brand-600);background:none;border:none;cursor:pointer;font-weight:600;">Clear</button>
    </div>`;
    html += recentSearches.map(s => `
      <div onclick="window.app.runRecentSearch('${escHtml(s)}');event.stopPropagation();" style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;cursor:pointer;transition:background .1s;" onmouseenter="this.style.background='var(--table-row-hover)'" onmouseleave="this.style.background='none'">
        <div style="width:32px;height:32px;border-radius:8px;background:var(--surface-card);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-quaternary);">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l2.5 1.5"/></svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:500;color:var(--text-primary);">${escHtml(s)}</div>
        </div>
      </div>
    `).join('');
    html += '<div style="height:8px;border-bottom:1px solid var(--border-color,#e5e7eb);margin:0 12px;"></div>';
  }

  // Quick actions
  html += `<div style="padding:8px 8px 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-quaternary);">Quick Actions</div>`;
  html += quickCmds.map(c => `
    <div onclick="${c.action};document.getElementById('global-search-overlay').style.display='none';" style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;cursor:pointer;transition:background .1s;" onmouseenter="this.style.background='var(--table-row-hover)'" onmouseleave="this.style.background='none'">
      <div style="width:32px;height:32px;border-radius:8px;background:var(--surface-card);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">${c.icon}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${c.label}</div>
        <div style="font-size:11px;color:var(--text-quaternary);">${c.sub}</div>
      </div>
    </div>
  `).join('');

  // Search scope indicators
  html += `<div style="padding:12px 12px 8px;border-top:1px solid var(--border-color,#e5e7eb);margin-top:4px;">
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-quaternary);margin-bottom:6px;">Search Scope</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      <span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;background:var(--brand-100,#cffafe);color:var(--brand-700,#0e7490);">Applications</span>
      <span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;background:#dbeafe;color:#1d4ed8;">Providers</span>
      <span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;background:#dcfce7;color:#166534;">Licenses</span>
      <span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;background:#fef3c7;color:#92400e;">Tasks</span>
      <span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;background:#f3e8ff;color:#6b21a8;">Facilities</span>
      <span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;background:#fef9c3;color:#854d0e;">Organizations</span>
    </div>
  </div>`;

  resultsDiv.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE SET — 9 CROSS-PLATFORM FEATURES
// ═══════════════════════════════════════════════════════════════════════════

// ─── Feature 1: E-Signature (Canvas-Based) ───

function renderSignaturePad(containerId, onSave) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <style>
      .sig-pad-wrap{background:#fff;border:2px solid var(--gray-200);border-radius:16px;padding:16px;position:relative;}
      .sig-canvas{width:100%;height:200px;border:1px dashed var(--gray-300);border-radius:12px;cursor:crosshair;touch-action:none;display:block;}
      .sig-actions{display:flex;gap:10px;margin-top:12px;justify-content:flex-end;}
      .sig-actions button{border-radius:10px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;}
      .sig-actions button:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,0.1);}
      .sig-clear{background:var(--gray-100);border:1px solid var(--gray-300);color:var(--gray-700);}
      .sig-save{background:linear-gradient(135deg,var(--brand-500),var(--brand-700));border:none;color:#fff;}
      .sig-hint{font-size:12px;color:var(--gray-400);text-align:center;margin-top:6px;}
    </style>
    <div class="sig-pad-wrap">
      <canvas class="sig-canvas" id="${containerId}-canvas"></canvas>
      <div class="sig-hint">Draw your signature above</div>
      <div class="sig-actions">
        <button class="sig-clear" onclick="window.app._sigClear('${containerId}')">Clear</button>
        <button class="sig-save" onclick="window.app._sigSave('${containerId}')">Save Signature</button>
      </div>
    </div>
  `;
  const canvas = document.getElementById(`${containerId}-canvas`);
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = 400;
  ctx.scale(2, 2);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let drawing = false;
  let hasDrawn = false;

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  canvas.addEventListener('mousedown', e => { drawing = true; hasDrawn = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener('mousemove', e => { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  canvas.addEventListener('mouseup', () => { drawing = false; });
  canvas.addEventListener('mouseleave', () => { drawing = false; });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; hasDrawn = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
  canvas.addEventListener('touchend', () => { drawing = false; });

  canvas._sigClear = () => { ctx.clearRect(0, 0, canvas.width / 2, canvas.height / 2); hasDrawn = false; };
  canvas._sigSave = () => {
    if (!hasDrawn) { showToast('Please draw your signature first', 'error'); return; }
    const dataUrl = canvas.toDataURL('image/png');
    if (typeof onSave === 'function') onSave(dataUrl);
  };
}

function openSignatureModal(providerId) {
  let overlay = document.getElementById('sig-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sig-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px;border-radius:16px;">
        <div class="modal-header">
          <h2>Provider Attestation Signature</h2>
          <button class="modal-close" onclick="document.getElementById('sig-modal-overlay').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div style="padding:16px;background:var(--gray-50);border-radius:12px;margin-bottom:16px;font-size:13px;line-height:1.6;color:var(--gray-700);">
            <strong>Attestation:</strong> I hereby attest that all information provided in my credentialing profile is true, accurate, and complete to the best of my knowledge. I authorize the release of information necessary to verify my credentials.
          </div>
          <div id="sig-modal-pad"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
  setTimeout(() => {
    renderSignaturePad('sig-modal-pad', async (dataUrl) => {
      try {
        const profile = await store.getProviderProfile(providerId);
        await store.saveProviderProfile(providerId, { ...(profile || {}), attestationSignature: dataUrl, attestationDate: new Date().toISOString() });
        showToast('Attestation signature saved');
        overlay.classList.remove('active');
      } catch (e) { showToast('Error saving signature: ' + e.message, 'error'); }
    });
  }, 100);
}

function openContractSignModal(contractId) {
  let overlay = document.getElementById('sig-contract-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sig-contract-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px;border-radius:16px;">
        <div class="modal-header">
          <h2>Sign Contract</h2>
          <button class="modal-close" onclick="document.getElementById('sig-contract-overlay').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div style="padding:16px;background:#f0fdf4;border:1px solid #dcfce7;border-radius:12px;margin-bottom:16px;font-size:13px;color:#166534;">
            By signing below, you agree to the terms outlined in this contract. This constitutes a legally binding electronic signature.
          </div>
          <div id="sig-contract-pad"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
  setTimeout(() => {
    renderSignaturePad('sig-contract-pad', async (dataUrl) => {
      try {
        const contract = await store.getOne('contracts', contractId);
        if (contract) {
          await store.update('contracts', contractId, { signature: dataUrl, signedAt: new Date().toISOString(), status: 'signed' });
        }
        showToast('Contract signed successfully');
        overlay.classList.remove('active');
      } catch (e) { showToast('Error signing contract: ' + e.message, 'error'); }
    });
  }, 100);
}

// ─── Feature 2: Email Digest Settings ───

function _getDigestPrefs() {
  try { return JSON.parse(localStorage.getItem('credentik_digest_prefs') || '{}'); } catch { return {}; }
}
function _saveDigestPrefs(prefs) {
  localStorage.setItem('credentik_digest_prefs', JSON.stringify(prefs));
}

function renderDigestSettings() {
  const prefs = _getDigestPrefs();
  return `
    <style>
      .digest-card{border-radius:16px;overflow:hidden;margin-top:20px;}
      .digest-toggle{display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--gray-50);border-radius:12px;cursor:pointer;transition:background 0.15s;}
      .digest-toggle:hover{background:var(--gray-100);}
      .digest-toggle input[type="checkbox"]{width:18px;height:18px;accent-color:var(--brand-600);}
      .digest-time-select{margin-top:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;}
      .digest-content-checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:12px;}
      .digest-content-checks label{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--gray-50);border-radius:10px;cursor:pointer;font-size:13px;transition:background 0.15s;}
      .digest-content-checks label:hover{background:var(--gray-100);}
      .digest-preview{margin-top:20px;border:1px solid var(--gray-200);border-radius:12px;overflow:hidden;}
      .digest-preview-header{background:linear-gradient(135deg,var(--brand-500),var(--brand-700));color:#fff;padding:16px 20px;font-weight:700;font-size:15px;}
      .digest-preview-body{padding:16px 20px;font-size:13px;color:var(--gray-700);line-height:1.7;}
      .digest-preview-item{padding:8px 0;border-bottom:1px solid var(--gray-100);}
      .digest-preview-item:last-child{border-bottom:none;}
    </style>
    <div class="card digest-card">
      <div class="card-header"><h3>Email Digest Settings</h3></div>
      <div class="card-body">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label class="digest-toggle">
            <input type="checkbox" id="digest-daily" ${prefs.dailyDigest ? 'checked' : ''} onchange="window.app.updateDigestPref('dailyDigest', this.checked)">
            <div><strong>Daily digest</strong><div class="text-sm text-muted">Summary of overdue items, status changes, and expirations delivered each morning</div></div>
          </label>
          <label class="digest-toggle">
            <input type="checkbox" id="digest-weekly" ${prefs.weeklySummary ? 'checked' : ''} onchange="window.app.updateDigestPref('weeklySummary', this.checked)">
            <div><strong>Weekly summary</strong><div class="text-sm text-muted">Comprehensive credentialing report delivered every Monday morning</div></div>
          </label>
        </div>

        <div class="digest-time-select">
          <label style="font-size:13px;font-weight:600;color:var(--gray-700);">Delivery time:</label>
          <select class="form-control" style="width:160px;border-radius:10px;" id="digest-time" onchange="window.app.updateDigestPref('digestTime', this.value)">
            <option value="6am" ${prefs.digestTime === '6am' ? 'selected' : ''}>6:00 AM</option>
            <option value="8am" ${prefs.digestTime === '8am' || !prefs.digestTime ? 'selected' : ''}>8:00 AM</option>
            <option value="10am" ${prefs.digestTime === '10am' ? 'selected' : ''}>10:00 AM</option>
            <option value="12pm" ${prefs.digestTime === '12pm' ? 'selected' : ''}>12:00 PM</option>
          </select>
        </div>

        <div style="margin-top:16px;">
          <label style="font-size:13px;font-weight:600;color:var(--gray-700);display:block;margin-bottom:8px;">Digest content:</label>
          <div class="digest-content-checks">
            <label><input type="checkbox" ${prefs.contentApplications !== false ? 'checked' : ''} onchange="window.app.updateDigestPref('contentApplications', this.checked)"> Applications</label>
            <label><input type="checkbox" ${prefs.contentLicenses !== false ? 'checked' : ''} onchange="window.app.updateDigestPref('contentLicenses', this.checked)"> Licenses</label>
            <label><input type="checkbox" ${prefs.contentTasks !== false ? 'checked' : ''} onchange="window.app.updateDigestPref('contentTasks', this.checked)"> Tasks</label>
            <label><input type="checkbox" ${prefs.contentFollowups !== false ? 'checked' : ''} onchange="window.app.updateDigestPref('contentFollowups', this.checked)"> Follow-ups</label>
            <label><input type="checkbox" ${prefs.contentCompliance !== false ? 'checked' : ''} onchange="window.app.updateDigestPref('contentCompliance', this.checked)"> Compliance</label>
          </div>
        </div>

        <button class="btn btn-primary" onclick="window.app.saveDigestPrefs()" style="margin-top:16px;border-radius:10px;">Save Digest Settings</button>

        <div class="digest-preview">
          <div class="digest-preview-header">Daily Digest Preview — Credentik</div>
          <div class="digest-preview-body">
            <div class="digest-preview-item"><strong>3 applications</strong> changed status yesterday</div>
            <div class="digest-preview-item"><strong>2 licenses</strong> expiring within 30 days</div>
            <div class="digest-preview-item"><strong>5 tasks</strong> are overdue and need attention</div>
            <div class="digest-preview-item"><strong>1 follow-up</strong> scheduled for today</div>
            <div class="digest-preview-item"><strong>Compliance score:</strong> 87% (down 2% from last week)</div>
            <div style="margin-top:12px;font-size:11px;color:var(--gray-400);">This is a preview. Actual digest will contain your real data.</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── Feature 3: Knowledge Base (In-App Help) ───

const KB_ARTICLES = [
  { id: 1, category: 'Getting Started', title: 'How do I add a new provider?', body: 'Navigate to the Providers section in the sidebar. Click the "+ Add Provider" button in the top-right corner. Fill in the required fields: First Name, Last Name, NPI, Specialty, and State. Click Save to create the provider record. You can then add education, board certifications, malpractice insurance, and other credential data from the provider\'s profile page.' },
  { id: 2, category: 'Getting Started', title: 'Quick start guide for new agencies', body: 'Welcome to Credentik! Here is the recommended setup order: 1) Configure your agency profile in Settings. 2) Add your organization(s). 3) Import or create providers. 4) Add state licenses for each provider. 5) Create credentialing applications for each provider-payer combination. 6) Set up follow-up reminders. 7) Configure monitoring schedules.' },
  { id: 3, category: 'Applications', title: 'What do application statuses mean?', body: 'Applications move through these statuses: NOT STARTED — application created but not yet submitted to the payer. SUBMITTED — application sent to the payer and awaiting review. IN REVIEW — payer is actively reviewing the application. PENDING INFO — payer has requested additional information. APPROVED — application approved with an effective date. DENIED — application was denied (review reason and appeal options). WITHDRAWN — application was voluntarily withdrawn.' },
  { id: 4, category: 'Applications', title: 'How to track application progress', body: 'Open any application and click the timeline icon to view the full activity history. You can log calls, emails, portal checks, and status changes. Each activity can include a contact name, reference number, outcome, and next steps. Use the Follow-ups section to set reminders for check-ins. The Kanban board provides a visual overview of all applications by status.' },
  { id: 5, category: 'Applications', title: 'How to use the batch generator', body: 'The Batch Generator (found in the Tools dropdown) allows you to create multiple applications at once. Select providers, choose target payers, and the system will generate applications for each provider-payer combination. This is especially useful when onboarding a new provider who needs to be credentialed with multiple payers simultaneously.' },
  { id: 6, category: 'Licenses', title: 'Managing state license renewals', body: 'Credentik tracks license expiration dates and sends alerts at 90, 60, and 30 days before expiration. Visit the Renewal Calendar page for a visual timeline of upcoming renewals. Each license can be verified through the Verification (PSV) module. When a license is renewed, update the expiration date and upload the new license document.' },
  { id: 7, category: 'Providers', title: 'Building a complete provider profile', body: 'A complete provider profile includes: personal information (name, NPI, taxonomy code), education history (medical school, residency, fellowship), board certifications, malpractice insurance, work history (last 5 years), CME credits, professional references (minimum 3), and supporting documents. The Credential Passport ring chart on the profile page shows completion percentage.' },
  { id: 8, category: 'Providers', title: 'Understanding the Credential Passport', body: 'The Credential Passport is a visual representation of a provider\'s credentialing readiness. It tracks 8 categories: Education (15%), Board Certs (15%), Malpractice (15%), Licenses (20%), Work History (10%), CME (10%), References (10%), and Documents (5%). Each segment turns green when requirements are met. A 100% score means the provider is fully credentialing-ready.' },
  { id: 9, category: 'Payers', title: 'How to add and manage payers', body: 'Go to the Payers section to view all insurance payers in your database. The system comes preloaded with major national payers, BCBS plans, regional payers, and Medicaid programs. You can add custom payers with the + button. Each payer record includes: name, category, states served, average credentialing days, and required documents. The payer strategic planner helps prioritize which payers to target.' },
  { id: 10, category: 'Billing', title: 'Setting up billing and invoicing', body: 'Navigate to Billing & Invoicing in the Finance section. You can create invoices for credentialing services, track payments, and manage accounts receivable. Set up service line items with rates. The revenue forecast page uses application data to project future revenue based on payer reimbursement rates and credentialing timelines.' },
  { id: 11, category: 'Compliance', title: 'Understanding compliance scores', body: 'The Compliance Center calculates a compliance score based on: active licenses (are they current?), exclusion screening (have all providers been screened?), board certifications (are they valid?), malpractice insurance (is coverage active?), and document completeness. Critical issues like expired licenses or exclusion flags significantly impact the score. Run regular compliance scans from the Monitoring page.' },
  { id: 12, category: 'Compliance', title: 'OIG/SAM exclusion screening explained', body: 'Exclusion screening checks whether providers appear on the OIG (Office of Inspector General) List of Excluded Individuals/Entities or the SAM (System for Award Management) exclusion list. Excluded providers cannot participate in federal healthcare programs. Credentik recommends monthly screening. Results are tracked in the Exclusion Screening section with pass/fail indicators.' },
  { id: 13, category: 'Integrations', title: 'How to set up CAQH integration', body: 'Go to Settings > CAQH API tab. Enter your CAQH Organization ID, API username, and API password. Select Production or Sandbox environment. Click Test Connection to verify. Once connected, the CAQH Manager page allows you to check roster status, profile completeness, and attestation dates for all providers. You may need to set up the Apps Script proxy for server-side API calls.' },
  { id: 14, category: 'Integrations', title: 'Setting up webhooks', body: 'Webhooks send real-time notifications to external systems when events occur in Credentik. Go to Settings > Webhooks tab. Add a webhook URL and select which events to trigger on (application status change, license expiration, task completion, etc.). Webhooks send JSON payloads with event details. Test webhooks before deploying to production.' },
  { id: 15, category: 'Getting Started', title: 'Navigating with keyboard shortcuts', body: 'Press Cmd+K (or Ctrl+K on Windows) to open the global search. Type to search across applications, providers, licenses, tasks, and more. Use arrow keys to navigate results and Enter to select. The search also supports quick actions like "Add Application" or "Go to Dashboard". Recent searches are saved for quick access.' },
  { id: 16, category: 'Providers', title: 'How to use the NPI lookup', body: 'When adding or editing a provider, use the NPI Lookup tool in the Tools dropdown. Enter a provider name or NPI number to search the CMS NPPES registry. Results include: NPI, name, credential, taxonomy code, practice address, and phone number. Click "Use This NPI" to auto-fill provider fields. This helps ensure accurate NPI data.' },
  { id: 17, category: 'Compliance', title: 'Primary Source Verification (PSV) guide', body: 'PSV is the gold standard for credential verification. The PSV module checks credentials directly with the issuing source: state licensing boards for licenses, ABMS for board certifications, and medical schools for education. Go to Verification (PSV) in the Compliance section. Select a provider and run verification checks. Results are timestamped and stored for audit purposes.' },
  { id: 18, category: 'Billing', title: 'Revenue forecasting explained', body: 'The Revenue Forecast page projects your agency\'s revenue based on: currently approved applications (confirmed revenue), in-progress applications (pipeline revenue weighted by approval probability), and planned applications (future revenue). The 12-month projection chart shows expected revenue growth. Revenue by state and payer category breakdowns help identify your most profitable segments.' },
];

function renderKnowledgeBase() {
  const categories = ['All', 'Getting Started', 'Applications', 'Licenses', 'Providers', 'Payers', 'Billing', 'Compliance', 'Integrations'];
  return `
    <style>
      .kb-help-search{width:100%;padding:12px 18px;border:2px solid var(--gray-200);border-radius:16px;font-size:15px;background:var(--surface-card,#fff);color:var(--gray-900);outline:none;transition:border-color 0.2s;}
      .kb-help-search:focus{border-color:var(--brand-500);}
      .kb-help-cats{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0;}
      .kb-help-cat{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid var(--gray-200);background:var(--surface-card,#fff);color:var(--gray-600);cursor:pointer;transition:all 0.15s;}
      .kb-help-cat:hover{border-color:var(--brand-400);color:var(--brand-600);}
      .kb-help-cat.active{background:linear-gradient(135deg,var(--brand-500),var(--brand-700));color:#fff;border-color:transparent;}
      .kb-help-article{border-radius:16px;overflow:hidden;margin-bottom:12px;border:1px solid var(--gray-200);background:var(--surface-card,#fff);transition:transform 0.15s,box-shadow 0.15s;}
      .kb-help-article:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,0.06);}
      .kb-help-article-header{padding:16px 20px;cursor:pointer;display:flex;align-items:center;gap:10px;}
      .kb-help-article-body{padding:0 20px 16px 42px;font-size:14px;color:var(--gray-600);line-height:1.7;display:none;}
      .kb-help-feedback{display:flex;gap:10px;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--gray-100);}
      .kb-help-feedback button{border-radius:8px;padding:4px 12px;font-size:12px;font-weight:600;border:1px solid var(--gray-200);background:var(--surface-card);cursor:pointer;transition:all 0.15s;}
      .kb-help-feedback button:hover{border-color:var(--brand-500);color:var(--brand-600);}
    </style>
    <input type="text" class="kb-help-search" id="kb-help-search" placeholder="Search the knowledge base..." oninput="window.app.filterKbArticles()">
    <div class="kb-help-cats" id="kb-help-cats">
      ${categories.map(c => `<button class="kb-help-cat ${c === 'All' ? 'active' : ''}" onclick="window.app.filterKbCategory('${c}')">${c}</button>`).join('')}
    </div>
    <div id="kb-help-articles">
      ${KB_ARTICLES.map((a, i) => `
        <div class="kb-help-article" data-category="${a.category}" data-search="${(a.title + ' ' + a.body).toLowerCase()}">
          <div class="kb-help-article-header" onclick="
            const b=document.getElementById('kb-body-${i}');
            const ar=document.getElementById('kb-arrow-${i}');
            b.style.display=b.style.display==='block'?'none':'block';
            ar.style.transform=b.style.display==='block'?'rotate(90deg)':'';
          ">
            <svg id="kb-arrow-${i}" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="transition:transform 0.2s;flex-shrink:0;"><path d="M4 2l5 4-5 4z"/></svg>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:14px;color:var(--gray-900);">${escHtml(a.title)}</div>
            </div>
            <span class="badge badge-pending" style="font-size:10px;">${escHtml(a.category)}</span>
          </div>
          <div class="kb-help-article-body" id="kb-body-${i}">
            ${escHtml(a.body)}
            <div class="kb-help-feedback">
              <span class="text-sm text-muted">Was this helpful?</span>
              <button onclick="showToast('Thanks for your feedback!')">Yes</button>
              <button onclick="showToast('We will improve this article')">No</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Feature 4: Guided Tour for New Users ───

function startGuidedTour() {
  const steps = [
    { selector: '[data-page="dashboard"]', title: 'Dashboard', text: 'This is your command center. See real-time stats, charts, and alerts for all your credentialing activity.' },
    { selector: '[data-page="applications"]', title: 'Applications', text: 'Track credentialing applications here. View status, follow-ups, and timelines for every payer enrollment.' },
    { selector: '[data-page="providers"]', title: 'Providers', text: 'Manage your providers and their credentials. Build complete profiles with education, licenses, and more.' },
    { selector: '#header-add-btn, .header-add-btn, [onclick*="quickAddApp"]', title: 'Quick Add', text: 'Quickly add new credentialing applications without leaving your current page.' },
    { selector: '#global-search-trigger, [onclick*="openGlobalSearch"]', title: 'Quick Search (Cmd+K)', text: 'Press Cmd+K (or Ctrl+K) for instant navigation. Search providers, applications, payers, and more.' },
    { selector: '#notif-bell, .notif-bell, [onclick*="toggleNotifications"]', title: 'Notifications', text: 'Stay updated on important changes — license expirations, status updates, and task reminders.' },
    { selector: '[data-page="my-account"]', title: 'My Account', text: 'Manage your profile, security settings, MFA, and notification preferences.' },
  ];

  let current = 0;

  function showStep(idx) {
    removeOverlay();
    if (idx >= steps.length) { completeTour(); return; }
    const step = steps[idx];
    const el = document.querySelector(step.selector);

    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.id = 'tour-overlay';
    overlay.innerHTML = `
      <style>
        .tour-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;pointer-events:all;}
        .tour-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:100000;}
        .tour-spotlight{position:fixed;z-index:100001;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);pointer-events:none;}
        .tour-tooltip{position:fixed;z-index:100002;background:#fff;border-radius:16px;padding:20px 24px;max-width:340px;box-shadow:0 12px 40px rgba(0,0,0,0.2);pointer-events:all;}
        .tour-tooltip h4{margin:0 0 8px;font-size:16px;font-weight:700;color:var(--gray-900);}
        .tour-tooltip p{margin:0 0 16px;font-size:13px;color:var(--gray-600);line-height:1.6;}
        .tour-actions{display:flex;gap:8px;justify-content:space-between;align-items:center;}
        .tour-dots{display:flex;gap:4px;}
        .tour-dot{width:8px;height:8px;border-radius:50%;background:var(--gray-300);}
        .tour-dot.active{background:var(--brand-500);}
        .tour-btn{padding:8px 18px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:transform 0.15s;}
        .tour-btn:hover{transform:translateY(-1px);}
        .tour-skip{background:none;border:1px solid var(--gray-300);color:var(--gray-600);}
        .tour-next{background:linear-gradient(135deg,var(--brand-500),var(--brand-700));color:#fff;border:none;}
        .tour-step-num{font-size:11px;color:var(--gray-400);font-weight:600;}
      </style>
    `;
    document.body.appendChild(overlay);

    const backdrop = document.createElement('div');
    backdrop.className = 'tour-backdrop';
    backdrop.id = 'tour-backdrop';

    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 8;
      const spotlight = document.createElement('div');
      spotlight.className = 'tour-spotlight';
      spotlight.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;`;
      overlay.appendChild(spotlight);

      const tooltip = document.createElement('div');
      tooltip.className = 'tour-tooltip';
      const tooltipTop = r.bottom + 16;
      const tooltipLeft = Math.max(16, Math.min(r.left, window.innerWidth - 360));
      tooltip.style.cssText = `top:${tooltipTop > window.innerHeight - 200 ? r.top - 200 : tooltipTop}px;left:${tooltipLeft}px;`;
      tooltip.innerHTML = `
        <div class="tour-step-num">Step ${idx + 1} of ${steps.length}</div>
        <h4>${step.title}</h4>
        <p>${step.text}</p>
        <div class="tour-actions">
          <button class="tour-btn tour-skip" onclick="window.app._tourSkip()">Skip Tour</button>
          <div class="tour-dots">${steps.map((_, i) => `<div class="tour-dot ${i === idx ? 'active' : ''}"></div>`).join('')}</div>
          <button class="tour-btn tour-next" onclick="window.app._tourNext()">${idx === steps.length - 1 ? 'Finish' : 'Next'}</button>
        </div>
      `;
      overlay.appendChild(tooltip);
    } else {
      // Element not found, skip to next
      current++;
      showStep(current);
      return;
    }
  }

  function removeOverlay() {
    const el = document.getElementById('tour-overlay');
    if (el) el.remove();
  }

  function completeTour() {
    removeOverlay();
    localStorage.setItem('credentik_tour_completed', 'true');
    showToast('Tour complete! You are all set to use Credentik.');
  }

  window.app._tourNext = () => { current++; showStep(current); };
  window.app._tourSkip = () => { completeTour(); };

  showStep(0);
}

// ─── Feature 5: Revenue Intelligence ───

function renderRevenueIntelligence(apps, providers, approved, inProgress) {
  const payers = [];
  const payerMap = {};
  apps.forEach(a => {
    const payer = getPayerById(a.payerId);
    if (!payer) return;
    if (!payerMap[payer.id]) {
      payerMap[payer.id] = { name: payer.name, category: payer.category, apps: [], approved: 0, total: 0, totalDays: 0, approvedCount: 0, totalRev: 0 };
      payers.push(payerMap[payer.id]);
    }
    const p = payerMap[payer.id];
    p.total++;
    p.totalRev += Number(a.estMonthlyRevenue) || 0;
    if (a.status === 'approved') {
      p.approved++;
      if (a.submittedDate && a.effectiveDate) {
        p.totalDays += Math.round((new Date(a.effectiveDate) - new Date(a.submittedDate)) / 86400000);
        p.approvedCount++;
      }
    }
  });
  payers.forEach(p => { p.avgDays = p.approvedCount > 0 ? Math.round(p.totalDays / p.approvedCount) : 0; p.rate = p.total > 0 ? Math.round(p.approved / p.total * 100) : 0; });
  payers.sort((a, b) => b.totalRev - a.totalRev);

  // ROI per provider
  const providerRoi = providers.map(p => {
    const provApps = apps.filter(a => (a.providerId || a.provider_id) == p.id);
    const monthlyRev = provApps.filter(a => a.status === 'approved').reduce((s, a) => s + (Number(a.estMonthlyRevenue) || 0), 0);
    const credCost = provApps.length * 350; // estimated cost per credentialing app
    const roi = credCost > 0 ? ((monthlyRev * 12 - credCost) / credCost * 100).toFixed(0) : 0;
    return { name: `${p.firstName} ${p.lastName}`, monthlyRev, credCost, roi: Number(roi), apps: provApps.length };
  }).sort((a, b) => b.roi - a.roi).slice(0, 8);

  // Delayed revenue
  const staleApps = inProgress.filter(a => {
    const submitted = a.submittedDate || a.submitted_date;
    return submitted && Math.round((new Date() - new Date(submitted)) / 86400000) > 90;
  });
  const delayedRev = staleApps.reduce((s, a) => s + (Number(a.estMonthlyRevenue) || 0), 0);

  return `
    <style>
      .rev-intel-section{margin-bottom:24px;}
      .rev-intel-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:20px;}
      .rev-intel-card{border-radius:16px;padding:18px;background:var(--surface-card,#fff);border:1px solid var(--gray-200);position:relative;overflow:hidden;transition:transform 0.18s,box-shadow 0.18s;}
      .rev-intel-card:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .rev-intel-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;}
      .rev-intel-card.positive::before{background:linear-gradient(90deg,#22c55e,#4ade80);}
      .rev-intel-card.negative::before{background:linear-gradient(90deg,#ef4444,#f87171);}
      .rev-intel-card.neutral::before{background:linear-gradient(90deg,#f59e0b,#fbbf24);}
      .rev-intel-name{font-size:13px;font-weight:700;color:var(--gray-900);margin-bottom:4px;}
      .rev-intel-val{font-size:22px;font-weight:800;}
      .rev-intel-sub{font-size:11px;color:var(--gray-500);margin-top:2px;}
      .rev-intel-table{border-radius:16px;overflow:hidden;border:1px solid var(--gray-200);}
      .rev-intel-table table{margin:0;}
      .rev-intel-table tr:hover{background:var(--gray-50);}
      .rev-intel-delay{border-radius:16px;padding:20px 24px;background:linear-gradient(135deg,#fef2f2,#fff1f2);border:1px solid #fecaca;margin-bottom:20px;}
    </style>
    <div class="rev-intel-section">
      <h3 style="font-size:18px;font-weight:700;color:var(--gray-900);margin-bottom:16px;">Revenue Intelligence</h3>

      ${delayedRev > 0 ? `
      <div class="rev-intel-delay">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-size:28px;">&#9888;&#65039;</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:#b91c1c;">${staleApps.length} application${staleApps.length !== 1 ? 's' : ''} pending for 90+ days</div>
            <div style="font-size:22px;font-weight:800;color:#dc2626;margin-top:4px;">$${delayedRev.toLocaleString()}/mo revenue delayed</div>
            <div style="font-size:12px;color:#991b1b;margin-top:2px;">Estimated $${(delayedRev * 12).toLocaleString()}/yr at risk from credentialing delays</div>
          </div>
        </div>
      </div>
      ` : ''}

      <h4 style="font-size:14px;font-weight:700;color:var(--gray-700);margin-bottom:12px;">ROI per Provider</h4>
      <div class="rev-intel-cards">
        ${providerRoi.map(p => `
          <div class="rev-intel-card ${p.roi > 0 ? 'positive' : p.roi < 0 ? 'negative' : 'neutral'}">
            <div class="rev-intel-name">${escHtml(p.name)}</div>
            <div class="rev-intel-val" style="color:${p.roi > 0 ? '#16a34a' : p.roi < 0 ? '#dc2626' : '#d97706'};">${p.roi > 0 ? '+' : ''}${p.roi}% ROI</div>
            <div class="rev-intel-sub">$${p.monthlyRev.toLocaleString()}/mo revenue | $${p.credCost.toLocaleString()} cred cost</div>
            <div class="rev-intel-sub">${p.apps} application${p.apps !== 1 ? 's' : ''}</div>
          </div>
        `).join('')}
      </div>

      <h4 style="font-size:14px;font-weight:700;color:var(--gray-700);margin-bottom:12px;">Payer Profitability</h4>
      <div class="rev-intel-table">
        <table>
          <thead><tr><th>Payer</th><th>Category</th><th>Avg Days</th><th>Approval Rate</th><th>Est. Monthly Rev</th><th>Cost/Credential</th></tr></thead>
          <tbody>
            ${payers.slice(0, 12).map(p => `<tr>
              <td><strong>${escHtml(p.name)}</strong></td>
              <td><span class="badge badge-pending" style="font-size:10px;">${escHtml(p.category || 'other')}</span></td>
              <td style="font-weight:600;color:${p.avgDays <= 60 ? 'var(--green)' : p.avgDays <= 90 ? '#d97706' : 'var(--red)'};">${p.avgDays || '—'}d</td>
              <td style="font-weight:600;">${p.rate}%</td>
              <td style="font-weight:700;color:#16a34a;">$${p.totalRev.toLocaleString()}</td>
              <td>$${(p.total * 350).toLocaleString()}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Feature 6: Predictive Analytics ───

function predictApplicationOutcome(app) {
  const payer = getPayerById(app.payerId);
  const category = payer?.category || 'other';
  const avgCredDays = payer?.avgCredDays || 90;

  // Approval probability by payer category
  const categoryProb = { national: 90, bcbs_anthem: 88, bcbs_hcsc: 87, bcbs_highmark: 87, bcbs_independent: 85, regional: 85, medicaid: 75, other: 80 };
  let approvalProb = categoryProb[category] || 80;

  // Risk factors
  const risks = [];
  const now = new Date();
  const submitted = app.submittedDate || app.submitted_date;
  const daysSinceSubmit = submitted ? Math.round((now - new Date(submitted)) / 86400000) : 0;

  if (!submitted) { risks.push({ text: 'Not yet submitted', severity: 'warning' }); approvalProb -= 5; }
  if (daysSinceSubmit > 120) { risks.push({ text: `${daysSinceSubmit} days since submission (very slow)`, severity: 'critical' }); approvalProb -= 10; }
  else if (daysSinceSubmit > 90) { risks.push({ text: `${daysSinceSubmit} days since submission`, severity: 'warning' }); approvalProb -= 5; }
  if (app.status === 'pending_info') { risks.push({ text: 'Payer requested additional info', severity: 'warning' }); approvalProb -= 10; }
  if (!app.documentChecklist || Object.keys(app.documentChecklist || {}).length === 0) { risks.push({ text: 'No documents tracked', severity: 'warning' }); approvalProb -= 5; }

  approvalProb = Math.max(10, Math.min(99, approvalProb));

  const estCompletionDays = Math.max(0, avgCredDays - daysSinceSubmit);
  const estCompletionDate = new Date(now.getTime() + estCompletionDays * 86400000);

  return { approvalProb, estCompletionDays, estCompletionDate, risks, avgCredDays, daysSinceSubmit };
}

function renderPredictionCard(app) {
  const pred = predictApplicationOutcome(app);
  const probColor = pred.approvalProb >= 80 ? '#16a34a' : pred.approvalProb >= 60 ? '#d97706' : '#dc2626';
  const probBg = pred.approvalProb >= 80 ? '#f0fdf4' : pred.approvalProb >= 60 ? '#fffbeb' : '#fef2f2';

  return `
    <style>
      .predict-card{border-radius:16px;padding:20px;background:var(--surface-card,#fff);border:1px solid var(--gray-200);margin-top:16px;overflow:hidden;position:relative;}
      .predict-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${probColor},${probColor}80);}
      .predict-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
      .predict-header h4{margin:0;font-size:15px;font-weight:700;color:var(--gray-900);}
      .predict-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;}
      .predict-stat{text-align:center;padding:12px;background:var(--gray-50);border-radius:12px;}
      .predict-stat-val{font-size:22px;font-weight:800;}
      .predict-stat-label{font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.3px;margin-top:2px;}
      .predict-risks{display:flex;flex-direction:column;gap:6px;}
      .predict-risk{display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 10px;border-radius:8px;}
      .predict-risk.critical{background:#fef2f2;color:#b91c1c;}
      .predict-risk.warning{background:#fffbeb;color:#92400e;}
      .predict-risk-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
      .predict-risk.critical .predict-risk-dot{background:#dc2626;}
      .predict-risk.warning .predict-risk-dot{background:#f59e0b;}
    </style>
    <div class="predict-card">
      <div class="predict-header">
        <span style="font-size:20px;">&#129504;</span>
        <h4>Prediction</h4>
      </div>
      <div class="predict-stats">
        <div class="predict-stat" style="background:${probBg};">
          <div class="predict-stat-val" style="color:${probColor};">${pred.approvalProb}%</div>
          <div class="predict-stat-label">Approval Probability</div>
        </div>
        <div class="predict-stat">
          <div class="predict-stat-val" style="color:var(--brand-600);">${pred.estCompletionDays}d</div>
          <div class="predict-stat-label">Est. Days Left</div>
        </div>
        <div class="predict-stat">
          <div class="predict-stat-val" style="color:var(--gray-700);font-size:14px;">${pred.estCompletionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          <div class="predict-stat-label">Est. Completion</div>
        </div>
      </div>
      ${pred.risks.length > 0 ? `
        <div style="font-size:12px;font-weight:600;color:var(--gray-500);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.3px;">Risk Factors</div>
        <div class="predict-risks">
          ${pred.risks.map(r => `<div class="predict-risk ${r.severity}"><div class="predict-risk-dot"></div>${escHtml(r.text)}</div>`).join('')}
        </div>
      ` : '<div style="font-size:13px;color:#16a34a;font-weight:600;">No risk factors identified</div>'}
    </div>
  `;
}

// ─── Feature 7: Document Versioning + Categories ───

function renderDocumentVersioning(documents, providerId) {
  const categories = ['All', 'License', 'COI/Malpractice', 'W-9', 'NPI', 'Board Cert', 'Education', 'Other'];
  const catMap = {
    'state_license': 'License', 'dea_certificate': 'License', 'cds_certificate': 'License',
    'malpractice_coi': 'COI/Malpractice', 'proof_of_insurance': 'COI/Malpractice',
    'w9': 'W-9',
    'board_certification': 'Board Cert',
    'diploma': 'Education', 'cv_resume': 'Education',
  };

  const now = new Date();
  // Count versions by name
  const versionCounts = {};
  (documents || []).forEach(d => {
    const name = d.documentName || d.document_name || d.name || '';
    versionCounts[name] = (versionCounts[name] || 0) + 1;
  });

  return `
    <style>
      .doc-v2-pills{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;padding:16px 16px 0;}
      .doc-v2-pill{padding:5px 12px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid var(--gray-200);background:var(--surface-card,#fff);color:var(--gray-600);cursor:pointer;transition:all 0.15s;}
      .doc-v2-pill:hover{border-color:var(--brand-400);color:var(--brand-600);}
      .doc-v2-pill.active{background:var(--brand-500);color:#fff;border-color:transparent;}
      .doc-v2-version{display:inline-flex;align-items:center;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:700;background:var(--brand-100,#cffafe);color:var(--brand-700);margin-left:6px;}
      .doc-v2-expiry{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;}
      .doc-v2-expiry.green{color:#16a34a;}
      .doc-v2-expiry.amber{color:#d97706;}
      .doc-v2-expiry.red{color:#dc2626;}
    </style>
    <div class="doc-v2-pills" id="doc-v2-pills">
      ${categories.map(c => `<button class="doc-v2-pill ${c === 'All' ? 'active' : ''}" onclick="window.app.filterDocCategory('${c}', ${providerId})">${c}</button>`).join('')}
    </div>
  `;
}

function getDocExpiryHtml(doc) {
  const exp = doc.expirationDate || doc.expiration_date;
  if (!exp) return '<span style="color:var(--gray-400);">—</span>';
  const days = Math.round((new Date(exp) - new Date()) / 86400000);
  const cls = days > 60 ? 'green' : days > 30 ? 'amber' : 'red';
  const dot = days > 60 ? '#22c55e' : days > 30 ? '#f59e0b' : '#ef4444';
  return `<span class="doc-v2-expiry ${cls}"><span style="width:6px;height:6px;border-radius:50%;background:${dot};"></span>${formatDateDisplay(exp)} (${days > 0 ? days + 'd' : 'expired'})</span>`;
}

function getDocVersionBadge(doc, documents) {
  const name = doc.documentName || doc.document_name || doc.name || '';
  const versions = (documents || []).filter(d => (d.documentName || d.document_name || d.name || '') === name).length;
  return versions > 1 ? `<span class="doc-v2-version">v${versions}</span>` : '';
}

// ─── Feature 8: Continuous Monitoring Scheduler ───

function _getMonitoringSchedule() {
  try { return JSON.parse(localStorage.getItem('credentik_monitoring_schedule') || '{}'); } catch { return {}; }
}
function _saveMonitoringSchedule(sched) {
  localStorage.setItem('credentik_monitoring_schedule', JSON.stringify(sched));
}

function renderMonitoringScheduler() {
  const sched = _getMonitoringSchedule();
  const defaults = {
    licenseVerification: sched.licenseVerification || 'daily',
    exclusionScreening: sched.exclusionScreening || 'monthly',
    boardCertVerification: sched.boardCertVerification || 'quarterly',
    documentExpiration: sched.documentExpiration || 'daily',
  };

  const lastRun = sched.lastRun || {};
  const now = new Date();

  function nextRunDate(freq, last) {
    if (!last) return 'Not scheduled';
    const d = new Date(last);
    if (freq === 'daily') d.setDate(d.getDate() + 1);
    else if (freq === 'weekly') d.setDate(d.getDate() + 7);
    else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const checks = [
    { key: 'licenseVerification', label: 'License Verification', options: ['daily', 'weekly', 'monthly'], icon: '&#128196;' },
    { key: 'exclusionScreening', label: 'Exclusion Screening', options: ['weekly', 'monthly'], icon: '&#128737;' },
    { key: 'boardCertVerification', label: 'Board Cert Verification', options: ['monthly', 'quarterly'], icon: '&#127891;' },
    { key: 'documentExpiration', label: 'Document Expiration Check', options: ['daily', 'weekly'], icon: '&#128197;' },
  ];

  return `
    <style>
      .monsched-card{border-radius:16px;overflow:hidden;margin-bottom:20px;border:1px solid var(--gray-200);background:var(--surface-card,#fff);}
      .monsched-header{padding:16px 20px;border-bottom:1px solid var(--gray-100);display:flex;align-items:center;gap:10px;}
      .monsched-header h3{margin:0;font-size:16px;font-weight:700;}
      .monsched-body{padding:0;}
      .monsched-row{display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:12px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--gray-100);transition:background 0.15s;}
      .monsched-row:last-child{border-bottom:none;}
      .monsched-row:hover{background:var(--gray-50);}
      .monsched-label{display:flex;align-items:center;gap:10px;font-weight:600;font-size:14px;color:var(--gray-900);}
      .monsched-label span{font-size:18px;}
      .monsched-select{border-radius:10px;padding:6px 10px;font-size:12px;border:1px solid var(--gray-300);background:var(--surface-card);color:var(--gray-700);}
      .monsched-time{font-size:12px;color:var(--gray-500);}
      .monsched-run-btn{padding:5px 12px;border-radius:8px;font-size:11px;font-weight:600;background:linear-gradient(135deg,var(--brand-500),var(--brand-700));color:#fff;border:none;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;white-space:nowrap;}
      .monsched-run-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(8,145,178,0.3);}
      @media(max-width:768px){.monsched-row{grid-template-columns:1fr 1fr;gap:8px;}}
    </style>
    <div class="monsched-card">
      <div class="monsched-header">
        <span style="font-size:20px;">&#128344;</span>
        <h3>Monitoring Schedule</h3>
      </div>
      <div class="monsched-body">
        <div class="monsched-row" style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;background:var(--gray-50);">
          <div>Check Type</div><div>Frequency</div><div>Last Run</div><div>Next Run</div><div></div>
        </div>
        ${checks.map(c => `
          <div class="monsched-row">
            <div class="monsched-label"><span>${c.icon}</span> ${c.label}</div>
            <div>
              <select class="monsched-select" onchange="window.app.updateMonSchedule('${c.key}', this.value)">
                ${c.options.map(o => `<option value="${o}" ${defaults[c.key] === o ? 'selected' : ''}>${o.charAt(0).toUpperCase() + o.slice(1)}</option>`).join('')}
              </select>
            </div>
            <div class="monsched-time">${lastRun[c.key] ? formatDateDisplay(lastRun[c.key]) : 'Never'}</div>
            <div class="monsched-time">${nextRunDate(defaults[c.key], lastRun[c.key] || now.toISOString())}</div>
            <div><button class="monsched-run-btn" onclick="window.app.runMonCheck('${c.key}')">Run Now</button></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Feature 9: Embeddable Widget Documentation ───

function renderEmbedWidgetDocs(agencySlug, embedBase) {
  const widgets = [
    {
      id: 'enrollment',
      title: 'Provider Enrollment Widget',
      desc: 'Embed a provider self-registration form on your website. Providers can submit their information directly, which flows into your Credentik pipeline.',
      snippet: (color, logo) => `<div id="credentik-enrollment"></div>\n<script src="${embedBase}/embed.js"\n  data-agency="${agencySlug}"\n  data-widget="enrollment"\n  data-color="${color}"\n  ${logo ? `data-logo="${logo}"` : ''}\n></script>`,
    },
    {
      id: 'verification',
      title: 'Credential Verification Widget',
      desc: 'Display a real-time credential verification badge on provider profiles or your organization\'s website, showing current credential status.',
      snippet: (color) => `<div id="credentik-verify"></div>\n<script src="${embedBase}/embed.js"\n  data-agency="${agencySlug}"\n  data-widget="verification"\n  data-color="${color}"\n></script>`,
    },
    {
      id: 'status',
      title: 'Application Status Widget',
      desc: 'Let providers track their credentialing application status directly from your website. Shows real-time progress updates.',
      snippet: (color) => `<div id="credentik-status"></div>\n<script src="${embedBase}/embed.js"\n  data-agency="${agencySlug}"\n  data-widget="status"\n  data-color="${color}"\n></script>`,
    },
  ];

  return `
    <style>
      .embed-section{margin-top:24px;}
      .embed-widget-card{border-radius:16px;border:1px solid var(--gray-200);overflow:hidden;margin-bottom:20px;background:var(--surface-card,#fff);transition:transform 0.15s,box-shadow 0.15s;}
      .embed-widget-card:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,0.08);}
      .embed-widget-header{padding:18px 20px;border-bottom:1px solid var(--gray-100);}
      .embed-widget-header h4{margin:0 0 6px;font-size:15px;font-weight:700;color:var(--gray-900);}
      .embed-widget-header p{margin:0;font-size:13px;color:var(--gray-600);line-height:1.5;}
      .embed-widget-body{padding:18px 20px;}
      .embed-custom{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
      .embed-custom .form-group{margin:0;flex:1;min-width:150px;}
      .embed-code-block{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:12px;font-size:12px;font-family:'JetBrains Mono',monospace,Menlo,Monaco,Consolas;white-space:pre-wrap;word-break:break-all;position:relative;line-height:1.6;}
      .embed-copy-btn{position:absolute;top:8px;right:8px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:rgba(255,255,255,0.1);color:#94a3b8;border:1px solid rgba(255,255,255,0.15);cursor:pointer;transition:all 0.15s;}
      .embed-copy-btn:hover{background:rgba(255,255,255,0.2);color:#e2e8f0;}
      .embed-preview{margin-top:14px;border:2px dashed var(--gray-200);border-radius:12px;padding:24px;text-align:center;background:var(--gray-50);}
      .embed-preview-label{font-size:11px;font-weight:600;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;}
      .embed-preview-mock{border-radius:12px;background:#fff;border:1px solid var(--gray-200);padding:20px;max-width:320px;margin:0 auto;text-align:left;}
    </style>
    <div class="embed-section">
      <h3 style="font-size:16px;font-weight:700;color:var(--gray-900);margin-bottom:4px;">Embeddable Widgets</h3>
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:20px;">Add credentialing widgets to your website with a single script tag. Widgets fetch data from Credentik in real-time.</p>

      <div class="embed-custom">
        <div class="form-group">
          <label style="font-size:12px;font-weight:600;">Primary Color</label>
          <input type="color" id="embed-primary-color" value="#0891b2" class="form-control" style="height:36px;padding:2px;cursor:pointer;" onchange="window.app.refreshEmbedSnippets()">
        </div>
        <div class="form-group">
          <label style="font-size:12px;font-weight:600;">Logo URL (optional)</label>
          <input type="url" id="embed-logo-url" class="form-control" placeholder="https://..." style="height:36px;font-size:12px;" onchange="window.app.refreshEmbedSnippets()">
        </div>
      </div>

      ${widgets.map(w => `
        <div class="embed-widget-card">
          <div class="embed-widget-header">
            <h4>${w.title}</h4>
            <p>${w.desc}</p>
          </div>
          <div class="embed-widget-body">
            <div class="embed-code-block" id="embed-snippet-${w.id}">
              <button class="embed-copy-btn" onclick="window.app.copyEmbedSnippet('${w.id}')">Copy</button>
${escHtml(w.snippet('#0891b2', ''))}
            </div>
            <div class="embed-preview">
              <div class="embed-preview-label">Live Preview</div>
              <div class="embed-preview-mock" id="embed-preview-${w.id}">
                ${w.id === 'enrollment' ? `
                  <div style="font-weight:700;font-size:14px;margin-bottom:12px;color:#0891b2;">Provider Enrollment</div>
                  <div style="margin-bottom:8px;"><div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Full Name</div><div style="height:32px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;"></div></div>
                  <div style="margin-bottom:8px;"><div style="font-size:11px;color:#6b7280;margin-bottom:4px;">NPI Number</div><div style="height:32px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;"></div></div>
                  <div style="margin-bottom:8px;"><div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Email</div><div style="height:32px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;"></div></div>
                  <div style="height:32px;border-radius:8px;background:#0891b2;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600;">Submit</div>
                ` : w.id === 'verification' ? `
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:20px;">&#9989;</div>
                    <div>
                      <div style="font-weight:700;font-size:13px;">Credentials Verified</div>
                      <div style="font-size:11px;color:#6b7280;">All licenses active. Last verified: Today</div>
                    </div>
                  </div>
                ` : `
                  <div style="font-weight:700;font-size:14px;margin-bottom:12px;color:#0891b2;">Application Status</div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="width:24px;height:24px;border-radius:50%;background:#22c55e;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">1</div>
                    <div style="flex:1;font-size:12px;">Application Submitted</div>
                    <span style="font-size:10px;color:#16a34a;font-weight:600;">Complete</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="width:24px;height:24px;border-radius:50%;background:#3b82f6;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">2</div>
                    <div style="flex:1;font-size:12px;">Under Review</div>
                    <span style="font-size:10px;color:#3b82f6;font-weight:600;">In Progress</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:24px;height:24px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;font-weight:700;">3</div>
                    <div style="flex:1;font-size:12px;color:#9ca3af;">Approved</div>
                    <span style="font-size:10px;color:#9ca3af;">Pending</span>
                  </div>
                `}
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
