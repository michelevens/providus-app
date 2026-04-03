// ui/pages/rcm.js — Revenue Cycle Management
// Claims, Denials, Payments, Charge Capture, AR Aging

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, navigateTo, appConfirm, appPrompt,
        editButton, deleteButton, helpTip, payerLink } = window._credentik;

if (typeof window._rcmTab === 'undefined') window._rcmTab = 'claims';
if (typeof window._rcmClaimsPage === 'undefined') window._rcmClaimsPage = 1;
if (typeof window._rcmChargesPage === 'undefined') window._rcmChargesPage = 1;

function _fm(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _fk(n) { n = Number(n || 0); return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : _fm(n); }

// Common behavioral health CPT codes
const CPT_CODES = [
  { code: '90791', desc: 'Psychiatric diagnostic evaluation', rate: 250 },
  { code: '90792', desc: 'Psychiatric diagnostic eval with medical services', rate: 300 },
  { code: '90832', desc: 'Psychotherapy, 30 min', rate: 80 },
  { code: '90834', desc: 'Psychotherapy, 45 min', rate: 120 },
  { code: '90837', desc: 'Psychotherapy, 60 min', rate: 160 },
  { code: '90838', desc: 'Psychotherapy, crisis, first 60 min', rate: 180 },
  { code: '90839', desc: 'Psychotherapy, crisis, first 60 min', rate: 180 },
  { code: '90840', desc: 'Psychotherapy, crisis, each add 30 min', rate: 90 },
  { code: '90846', desc: 'Family psychotherapy w/o patient', rate: 130 },
  { code: '90847', desc: 'Family psychotherapy with patient', rate: 140 },
  { code: '90853', desc: 'Group psychotherapy', rate: 50 },
  { code: '90863', desc: 'Pharmacologic management with psychotherapy', rate: 70 },
  { code: '99202', desc: 'Office visit, new patient, 15-29 min', rate: 100 },
  { code: '99203', desc: 'Office visit, new patient, 30-44 min', rate: 150 },
  { code: '99204', desc: 'Office visit, new patient, 45-59 min', rate: 200 },
  { code: '99205', desc: 'Office visit, new patient, 60-74 min', rate: 260 },
  { code: '99211', desc: 'Office visit, established, 5 min', rate: 30 },
  { code: '99212', desc: 'Office visit, established, 10-19 min', rate: 60 },
  { code: '99213', desc: 'Office visit, established, 20-29 min', rate: 95 },
  { code: '99214', desc: 'Office visit, established, 30-39 min', rate: 135 },
  { code: '99215', desc: 'Office visit, established, 40-54 min', rate: 185 },
  { code: '99354', desc: 'Prolonged service, first 30-74 min', rate: 120 },
  { code: '99355', desc: 'Prolonged service, each add 30 min', rate: 60 },
  { code: '96130', desc: 'Psychological testing evaluation', rate: 170 },
  { code: '96131', desc: 'Psychological testing, each add hour', rate: 150 },
  { code: '96136', desc: 'Psychological test admin by physician', rate: 90 },
  { code: '96137', desc: 'Psychological test admin, each add 30 min', rate: 80 },
  { code: '96156', desc: 'Health behavior assessment', rate: 85 },
  { code: '96158', desc: 'Health behavior intervention, first 30 min', rate: 70 },
  { code: '96159', desc: 'Health behavior intervention, each add 15 min', rate: 35 },
  { code: 'H0031', desc: 'Mental health assessment', rate: 150 },
  { code: 'H0032', desc: 'Mental health service plan development', rate: 120 },
  { code: 'H0034', desc: 'Medication training/support', rate: 40 },
  { code: 'H0035', desc: 'Mental health partial hospitalization', rate: 200 },
  { code: 'H0036', desc: 'Community psychiatric supportive treatment', rate: 50 },
  { code: 'H2011', desc: 'Crisis intervention service, per 15 min', rate: 45 },
  { code: 'H2012', desc: 'Behavioral health day treatment, per hour', rate: 60 },
  { code: 'H2014', desc: 'Skills training, per 15 min', rate: 25 },
  { code: 'H2015', desc: 'Community support services, per 15 min', rate: 20 },
  { code: 'H2017', desc: 'Psychosocial rehab, per 15 min', rate: 30 },
  { code: 'H2019', desc: 'Therapeutic behavioral services, per 15 min', rate: 35 },
  { code: 'T1017', desc: 'Targeted case management, per 15 min', rate: 25 },
];

// Common ICD-10 codes for behavioral health
const ICD_CODES = [
  { code: 'F31.9', desc: 'Bipolar disorder, unspecified' },
  { code: 'F32.0', desc: 'Major depressive disorder, single, mild' },
  { code: 'F32.1', desc: 'Major depressive disorder, single, moderate' },
  { code: 'F32.2', desc: 'Major depressive disorder, single, severe' },
  { code: 'F33.0', desc: 'Major depressive disorder, recurrent, mild' },
  { code: 'F33.1', desc: 'Major depressive disorder, recurrent, moderate' },
  { code: 'F33.2', desc: 'Major depressive disorder, recurrent, severe' },
  { code: 'F41.0', desc: 'Panic disorder' },
  { code: 'F41.1', desc: 'Generalized anxiety disorder' },
  { code: 'F41.9', desc: 'Anxiety disorder, unspecified' },
  { code: 'F42.2', desc: 'Mixed obsessional thoughts and acts' },
  { code: 'F43.10', desc: 'Post-traumatic stress disorder, unspecified' },
  { code: 'F43.12', desc: 'Post-traumatic stress disorder, chronic' },
  { code: 'F43.20', desc: 'Adjustment disorder, unspecified' },
  { code: 'F43.23', desc: 'Adjustment disorder with mixed anxiety and depressed mood' },
  { code: 'F60.3', desc: 'Borderline personality disorder' },
  { code: 'F84.0', desc: 'Autistic disorder' },
  { code: 'F90.0', desc: 'ADHD, predominantly inattentive type' },
  { code: 'F90.1', desc: 'ADHD, predominantly hyperactive type' },
  { code: 'F90.2', desc: 'ADHD, combined type' },
  { code: 'F90.9', desc: 'ADHD, unspecified' },
  { code: 'F10.20', desc: 'Alcohol dependence, uncomplicated' },
  { code: 'F11.20', desc: 'Opioid dependence, uncomplicated' },
  { code: 'F12.20', desc: 'Cannabis dependence, uncomplicated' },
  { code: 'F13.20', desc: 'Sedative dependence, uncomplicated' },
  { code: 'F14.20', desc: 'Cocaine dependence, uncomplicated' },
  { code: 'F15.20', desc: 'Stimulant dependence, uncomplicated' },
  { code: 'F19.20', desc: 'Other psychoactive substance dependence' },
  { code: 'F50.00', desc: 'Anorexia nervosa, unspecified' },
  { code: 'F50.2', desc: 'Bulimia nervosa' },
  { code: 'F50.81', desc: 'Binge eating disorder' },
  { code: 'Z71.1', desc: 'Person with feared health complaint' },
  { code: 'Z63.0', desc: 'Problems in relationship with spouse' },
];

const CLAIM_STATUSES = [
  { value: 'draft', label: 'Draft', color: '#6b7280', bg: '#f3f4f6' },
  { value: 'submitted', label: 'Submitted', color: '#8b5cf6', bg: '#ede9fe' },
  { value: 'acknowledged', label: 'Acknowledged', color: '#3b82f6', bg: '#dbeafe' },
  { value: 'pending', label: 'Pending', color: '#f59e0b', bg: '#fef3c7' },
  { value: 'paid', label: 'Paid', color: '#22c55e', bg: '#dcfce7' },
  { value: 'partial_paid', label: 'Partial', color: '#06b6d4', bg: '#cffafe' },
  { value: 'denied', label: 'Denied', color: '#ef4444', bg: '#fee2e2' },
  { value: 'appealed', label: 'Appealed', color: '#f59e0b', bg: '#fef3c7' },
  { value: 'voided', label: 'Voided', color: '#9ca3af', bg: '#f3f4f6' },
  { value: 'written_off', label: 'Written Off', color: '#9ca3af', bg: '#f3f4f6' },
];

const DENIAL_CATEGORIES = [
  { value: 'eligibility', label: 'Eligibility' },
  { value: 'authorization', label: 'Authorization' },
  { value: 'coding', label: 'Coding' },
  { value: 'medical_necessity', label: 'Medical Necessity' },
  { value: 'timely_filing', label: 'Timely Filing' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'bundling', label: 'Bundling' },
  { value: 'coordination_of_benefits', label: 'Coordination of Benefits' },
  { value: 'credentialing', label: 'Credentialing' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'other', label: 'Other' },
];

const DENIAL_STATUSES = [
  { value: 'new', label: 'New' }, { value: 'in_review', label: 'In Review' },
  { value: 'appeal_in_progress', label: 'Appeal In Progress' }, { value: 'pending_response', label: 'Pending Response' },
  { value: 'resolved_won', label: 'Won' }, { value: 'resolved_lost', label: 'Lost' },
  { value: 'resolved_partial', label: 'Partial' }, { value: 'written_off', label: 'Written Off' },
];

// CARC (Claim Adjustment Reason Codes) + RARC (Remittance Advice Remark Codes) Library
const DENIAL_CODES = [
  // CARC — Contractual Obligation (CO)
  { code: 'CO-4', desc: 'Procedure code inconsistent with modifier or missing modifier', category: 'coding', action: 'Add correct modifier and resubmit', recovery: 'high' },
  { code: 'CO-11', desc: 'Diagnosis inconsistent with procedure', category: 'coding', action: 'Verify ICD-10 matches CPT and resubmit', recovery: 'high' },
  { code: 'CO-15', desc: 'Authorization/pre-certification required but not obtained', category: 'authorization', action: 'Obtain retro-auth if possible, or appeal with clinical justification', recovery: 'medium' },
  { code: 'CO-16', desc: 'Claim/service lacks information or has submission errors', category: 'coding', action: 'Review claim for missing fields, correct and resubmit', recovery: 'high' },
  { code: 'CO-18', desc: 'Duplicate claim/service', category: 'duplicate', action: 'Verify if duplicate — if not, appeal with documentation', recovery: 'medium' },
  { code: 'CO-22', desc: 'Coordination of benefits — payment adjusted for other insurance', category: 'coordination_of_benefits', action: 'Bill secondary payer or verify COB order', recovery: 'medium' },
  { code: 'CO-27', desc: 'Expenses incurred after coverage terminated', category: 'eligibility', action: 'Verify eligibility dates, bill patient or correct payer', recovery: 'low' },
  { code: 'CO-29', desc: 'Time limit for filing has expired', category: 'timely_filing', action: 'Appeal with proof of timely submission if applicable', recovery: 'low' },
  { code: 'CO-45', desc: 'Charges exceed fee schedule/maximum allowable', category: 'coding', action: 'Accept contractual adjustment — typically not appealable', recovery: 'low' },
  { code: 'CO-50', desc: 'Non-covered service — not deemed medically necessary', category: 'medical_necessity', action: 'Appeal with clinical documentation and medical records', recovery: 'medium' },
  { code: 'CO-97', desc: 'Payment adjusted — already adjudicated for this DOS', category: 'duplicate', action: 'Verify previous payment, may be duplicate submission', recovery: 'low' },
  { code: 'CO-109', desc: 'Claim not covered by this payer — forward to correct payer', category: 'eligibility', action: 'Verify payer and resubmit to correct insurance', recovery: 'high' },
  { code: 'CO-167', desc: 'Diagnosis not covered by this payer', category: 'medical_necessity', action: 'Appeal with supporting documentation or use alternate diagnosis', recovery: 'medium' },
  { code: 'CO-197', desc: 'Precertification/authorization/notification absent', category: 'authorization', action: 'Obtain retro-authorization or appeal', recovery: 'medium' },
  { code: 'CO-204', desc: 'Service/equipment not covered under patient benefit plan', category: 'eligibility', action: 'Verify benefits, bill patient, or appeal', recovery: 'low' },
  { code: 'CO-222', desc: 'Exceeds number of sessions/visits allowed', category: 'authorization', action: 'Request additional sessions authorization or appeal', recovery: 'medium' },
  { code: 'CO-236', desc: 'Not payable — bundled with another service', category: 'bundling', action: 'Add modifier 59/XE/XP/XS/XU to unbundle or accept', recovery: 'medium' },
  { code: 'CO-252', desc: 'Service not on payer fee schedule', category: 'coding', action: 'Verify CPT is covered, use alternate code, or appeal', recovery: 'medium' },
  // CARC — Patient Responsibility (PR)
  { code: 'PR-1', desc: 'Deductible amount', category: 'other', action: 'Bill patient for deductible', recovery: 'high' },
  { code: 'PR-2', desc: 'Coinsurance amount', category: 'other', action: 'Bill patient for coinsurance', recovery: 'high' },
  { code: 'PR-3', desc: 'Copay amount', category: 'other', action: 'Collect copay from patient', recovery: 'high' },
  { code: 'PR-96', desc: 'Non-covered charge(s)', category: 'eligibility', action: 'Bill patient or appeal medical necessity', recovery: 'low' },
  // CARC — Other Adjustment (OA)
  { code: 'OA-23', desc: 'Payment adjusted — impact of prior payer adjudication', category: 'coordination_of_benefits', action: 'Review primary EOB and bill secondary', recovery: 'medium' },
  // RARC (Remark Codes)
  { code: 'N30', desc: 'Missing or incomplete prior authorization number', category: 'authorization', action: 'Submit with valid auth number', recovery: 'high' },
  { code: 'N56', desc: 'Procedure code billed is not correct', category: 'coding', action: 'Verify CPT and resubmit with correct code', recovery: 'high' },
  { code: 'N386', desc: 'Non-network provider — out of network', category: 'credentialing', action: 'Verify network status or bill patient difference', recovery: 'low' },
  { code: 'N479', desc: 'Missing UB revenue code', category: 'coding', action: 'Add revenue code and resubmit', recovery: 'high' },
  { code: 'H36', desc: 'Procedure code inconsistent with modifier used or required modifier missing', category: 'coding', action: 'Add required modifier (e.g. 95 for telehealth, HE for behavioral health) and resubmit', recovery: 'high' },
  { code: 'M76', desc: 'Missing/incomplete/invalid diagnosis or condition', category: 'coding', action: 'Add required diagnosis code and resubmit', recovery: 'high' },
  { code: 'M79', desc: 'Service not covered — missing/invalid procedure code', category: 'coding', action: 'Verify CPT code and resubmit', recovery: 'high' },
  { code: 'MA130', desc: 'Claim submitted to wrong payer/contractor', category: 'eligibility', action: 'Resubmit to correct payer', recovery: 'high' },
  // Status codes
  { code: 'Status-70', desc: 'Claim denied', category: 'other', action: 'Review denial codes and determine next action', recovery: 'medium' },
  { code: 'Status-3', desc: 'Claim adjudicated — payment made', category: 'other', action: 'No action needed — payment processed', recovery: 'high' },
  { code: 'Status-19', desc: 'Claim returned — invalid information', category: 'coding', action: 'Correct claim data and resubmit', recovery: 'high' },
];
window.DENIAL_CODES = DENIAL_CODES;
window.CPT_CODES = CPT_CODES;

function _claimBadge(status) {
  const s = CLAIM_STATUSES.find(x => x.value === status) || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  return `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:8px;background:${s.bg};color:${s.color};">${s.label}</span>`;
}

function _denialBadge(status) {
  const colors = { new: '#ef4444', in_review: '#f59e0b', appeal_in_progress: '#3b82f6', pending_response: '#8b5cf6', resolved_won: '#22c55e', resolved_lost: '#9ca3af', resolved_partial: '#06b6d4', written_off: '#6b7280' };
  const s = DENIAL_STATUSES.find(x => x.value === status) || { label: status || 'New' };
  return `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:8px;background:${(colors[status] || '#6b7280')}20;color:${colors[status] || '#6b7280'};">${s.label}</span>`;
}

// ─── Main RCM Page ───
async function renderRcmPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let claims = [], denials = [], payments = [], charges = [], clients = [], providers = [], payers = [];
  let claimStats = {}, denialStats = {}, arData = {}, payerRules = [];

  // Fire all API calls in parallel for speed
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9] = await Promise.allSettled([
    store.getRcmClaimStats(),
    store.getRcmClaims(),
    store.getRcmDenialStats(),
    store.getRcmDenials(),
    store.getRcmPayments(),
    store.getRcmCharges(),
    store.getBillingClients(),
    store.getRcmArAging(),
    store.getAll('providers'),
    store.getPayerRules(),
  ]);
  if (r0.status === 'fulfilled') claimStats = r0.value;
  if (r1.status === 'fulfilled') claims = r1.value;
  if (r2.status === 'fulfilled') denialStats = r2.value;
  if (r3.status === 'fulfilled') denials = r3.value;
  if (r4.status === 'fulfilled') payments = r4.value;
  if (r5.status === 'fulfilled') charges = r5.value;
  if (r6.status === 'fulfilled') clients = r6.value;
  if (r7.status === 'fulfilled') arData = r7.value;
  if (r8.status === 'fulfilled') providers = r8.value;
  if (r9.status === 'fulfilled') payerRules = r9.value;
  try { payers = window.PAYER_CATALOG || []; } catch (e) {}
  if (!Array.isArray(payerRules)) payerRules = [];

  if (!Array.isArray(claims)) claims = [];
  if (!Array.isArray(denials)) denials = [];
  if (!Array.isArray(payments)) payments = [];
  if (!Array.isArray(charges)) charges = [];
  if (!Array.isArray(clients)) clients = [];
  if (!Array.isArray(providers)) providers = [];
  if (!Array.isArray(payers)) payers = [];
  // Apply organization/provider scope filtering
  claims = store.filterByScope(claims);
  denials = store.filterByScope(denials);
  payments = store.filterByScope(payments);
  charges = store.filterByScope(charges);
  clients = store.filterByScope(clients);
  providers = store.filterByScope(providers);
  window._rcmClaims = claims;
  window._rcmDenials = denials;
  window._rcmPayments = payments;
  window._rcmCharges = charges;
  window._rcmClients = clients;
  window._rcmProviders = providers;
  window._rcmPayers = payers;

  const buckets = arData.buckets || {};
  const totalAR = arData.total_ar || arData.totalAr || 0;

  // ─── Timely Filing Watchdog ───
  // Build payer name → filing limit lookup from Payer Intelligence rules
  const _payerFilingLimits = {};
  payerRules.forEach(r => {
    const name = (r.payer_name || r.payerName || '').toLowerCase().trim();
    const days = parseInt(r.timely_filing_days || r.timelyFilingDays) || 0;
    if (name && days > 0) _payerFilingLimits[name] = days;
  });

  // Default filing limits by payer type
  function _getFilingLimit(payerName) {
    const pn = (payerName || '').toLowerCase().trim();
    // Check exact match from payer rules first
    if (_payerFilingLimits[pn]) return _payerFilingLimits[pn];
    // Check partial match
    for (const [rName, days] of Object.entries(_payerFilingLimits)) {
      if (pn.includes(rName) || rName.includes(pn)) return days;
    }
    // Default by payer type keywords
    if (pn.includes('medicare')) return 365;
    if (pn.includes('medicaid')) return 365;
    if (pn.includes('florida blue') || pn.includes('fl blue')) return 365;
    if (pn.includes('bcbs') || pn.includes('blue cross')) return 365;
    return 90; // Commercial default
  }

  // Calculate filing status for unpaid claims
  const _unpaidStatuses = ['submitted', 'pending', 'acknowledged'];
  const _now = new Date();
  const _filingAlerts = []; // { claim, daysLeft, daysElapsed, limit, level }
  claims.forEach(c => {
    if (!_unpaidStatuses.includes(c.status)) return;
    const dos = c.dateOfService || c.date_of_service;
    if (!dos) return;
    const dosDate = new Date(dos);
    const daysElapsed = Math.floor((_now - dosDate) / 86400000);
    const payer = c.payerName || c.payer_name || '';
    const limit = _getFilingLimit(payer);
    const daysLeft = limit - daysElapsed;
    let level = null;
    if (daysLeft < 14) level = 'urgent';
    else if (daysLeft < 30) level = 'warning';
    else if (daysLeft < 60) level = 'watch';
    if (level) _filingAlerts.push({ claim: c, daysLeft, daysElapsed, limit, level });
  });
  _filingAlerts.sort((a, b) => a.daysLeft - b.daysLeft);
  const _urgentFiling = _filingAlerts.filter(a => a.level === 'urgent');
  const _warningFiling = _filingAlerts.filter(a => a.level === 'warning');
  const _watchFiling = _filingAlerts.filter(a => a.level === 'watch');
  // Build a quick lookup: claim.id → filing alert
  const _filingByClaimId = {};
  _filingAlerts.forEach(a => { _filingByClaimId[a.claim.id] = a; });
  window._filingAlerts = _filingAlerts;
  window._filingByClaimId = _filingByClaimId;

  function _filingBadge(claimId) {
    const a = _filingByClaimId[claimId];
    if (!a) return '';
    if (a.level === 'urgent') return ' <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;" title="' + a.daysLeft + ' days left to file (limit: ' + a.limit + 'd)">FILING URGENT</span>';
    if (a.level === 'warning') return ' <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:#fff7ed;color:#ea580c;border:1px solid #fed7aa;" title="' + a.daysLeft + ' days left to file (limit: ' + a.limit + 'd)">FILING WARNING</span>';
    if (a.level === 'watch') return ' <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:#fefce8;color:#a16207;border:1px solid #fde68a;" title="' + a.daysLeft + ' days left to file (limit: ' + a.limit + 'd)">FILING WATCH</span>';
    return '';
  }

  // Revenue Gap Analysis
  const _cv = (c, ...keys) => { for (const k of keys) { if (c[k] !== undefined && c[k] !== null) return parseFloat(c[k]) || 0; } return 0; };
  const gapPending = claims.filter(c => c.status === 'submitted' || c.status === 'pending');
  const gapDenied = claims.filter(c => c.status === 'denied');
  const gapPartial = claims.filter(c => c.status === 'partial_paid');
  const gapPendingAmt = gapPending.reduce((s, c) => s + _cv(c, 'totalCharges', 'total_charges'), 0);
  const gapDeniedAmt = gapDenied.reduce((s, c) => s + _cv(c, 'totalCharges', 'total_charges') - _cv(c, 'totalPaid', 'total_paid'), 0);
  const gapPartialBal = gapPartial.reduce((s, c) => s + _cv(c, 'balance'), 0);
  const gapPtResp = claims.reduce((s, c) => s + _cv(c, 'patientResponsibility', 'patient_responsibility'), 0);
  const totalCharged = _cv(claimStats, 'totalCharged', 'total_charged');
  const totalCollected = _cv(claimStats, 'totalPaid', 'total_paid');

  body.innerHTML = `
    <style>
      .rcm-stat{position:relative;overflow:hidden;border-radius:16px;padding:18px 22px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .rcm-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .rcm-stat .rcm-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .rcm-stat .rcm-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:4px;}
      .rcm-stat .rcm-val{font-size:24px;font-weight:800;line-height:1.1;}
      .rcm-stat .rcm-sub{font-size:11px;color:var(--gray-500);margin-top:3px;}
      .rcm-card{border-radius:16px;overflow:hidden;}
      .rcm-table table tr:hover{background:var(--gray-50);}
    </style>

    <!-- KPI Stats -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:18px;">
      <div class="rcm-stat" title="Total number of claims submitted to payers across all dates"><div class="rcm-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div><div class="rcm-label">Total Claims</div><div class="rcm-val" style="color:#2563eb;">${claimStats.totalClaims || claimStats.total_claims || claims.length}</div></div>
      <div class="rcm-stat" title="Total payments received from insurance — money in the bank"><div class="rcm-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div><div class="rcm-label">Collected</div><div class="rcm-val" style="color:#16a34a;">${_fk(claimStats.totalPaid || claimStats.total_paid)}</div><div class="rcm-sub">${claimStats.collectionRate || claimStats.collection_rate || 0}% rate</div></div>
      <div class="rcm-stat" title="Total amount billed to insurance for all claims"><div class="rcm-accent" style="background:linear-gradient(90deg,#8b5cf6,#a78bfa);"></div><div class="rcm-label">Charged</div><div class="rcm-val" style="color:#7c3aed;">${_fk(claimStats.totalCharged || claimStats.total_charged)}</div></div>
      <div class="rcm-stat" title="Claims rejected by insurance — review and appeal to recover"><div class="rcm-accent" style="background:linear-gradient(90deg,#ef4444,#f87171);"></div><div class="rcm-label">Denials</div><div class="rcm-val" style="color:#dc2626;">${denialStats.open || 0}</div><div class="rcm-sub">${denialStats.total || 0} total</div></div>
      <div class="rcm-stat" title="Accounts Receivable — total balance owed by payers and patients"><div class="rcm-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div><div class="rcm-label">Total A/R</div><div class="rcm-val" style="color:#d97706;">${_fk(totalAR)}</div><div class="rcm-sub">${arData.avg_days_in_ar || arData.avgDaysInAr || 0}d avg</div></div>
      <div class="rcm-stat" title="Percentage of claims accepted without rejections or edits"><div class="rcm-accent" style="background:linear-gradient(90deg,#06b6d4,#22d3ee);"></div><div class="rcm-label">Clean Claim</div><div class="rcm-val" style="color:#0891b2;">${claimStats.cleanClaimRate || claimStats.clean_claim_rate || 0}%</div></div>
      <div class="rcm-stat" title="Percentage of denied claims won on appeal"><div class="rcm-accent" style="background:linear-gradient(90deg,#10b981,#34d399);"></div><div class="rcm-label">Appeal Rate</div><div class="rcm-val" style="color:#059669;">${denialStats.appeal_success_rate || denialStats.appealSuccessRate || 0}%</div><div class="rcm-sub">won</div></div>
      <div class="rcm-stat" title="Charge entries awaiting claim submission"><div class="rcm-accent" style="background:linear-gradient(90deg,#6366f1,#818cf8);"></div><div class="rcm-label">Charges</div><div class="rcm-val" style="color:#4f46e5;">${charges.filter(c => c.status === 'pending').length}</div><div class="rcm-sub">pending</div></div>
    </div>

    <!-- AR Aging Bar -->
    <div class="card rcm-card" style="margin-bottom:18px;">
      <div class="card-body" style="padding:14px 20px;">
        <div style="display:flex;align-items:center;gap:4px;height:28px;border-radius:6px;overflow:hidden;">
          ${[
            { key: '0_30', label: '0-30d', color: '#22c55e' },
            { key: '31_60', label: '31-60d', color: '#f59e0b' },
            { key: '61_90', label: '61-90d', color: '#f97316' },
            { key: '91_plus', label: '90+d', color: '#ef4444' },
          ].map(b => {
            const t = buckets[b.key]?.total || 0;
            const pct = totalAR > 0 ? Math.max(t / totalAR * 100, 2) : 25;
            return `<div style="width:${pct}%;background:${b.color};height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;min-width:40px;" title="${b.label}: ${_fm(t)}">${b.label} ${_fk(t)}</div>`;
          }).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--gray-500);">
          <span>Current: ${_fk(buckets['0_30']?.total || 0)} (${buckets['0_30']?.count || 0})</span>
          <span>31-60: ${_fk(buckets['31_60']?.total || 0)} (${buckets['31_60']?.count || 0})</span>
          <span>61-90: ${_fk(buckets['61_90']?.total || 0)} (${buckets['61_90']?.count || 0})</span>
          <span>90+: ${_fk(buckets['91_plus']?.total || 0)} (${buckets['91_plus']?.count || 0})</span>
          <span><strong>Total: ${_fm(totalAR)}</strong></span>
        </div>
      </div>
    </div>

    <!-- Timely Filing Watchdog Alert (only on Claims tab) -->
    ${window._rcmTab !== 'claims' || _filingAlerts.length === 0 ? '' : (() => {
      const _tfUrgent = _urgentFiling.length, _tfWarn = _warningFiling.length, _tfWatch = _watchFiling.length;
      const _tfBorderColor = _tfUrgent > 0 ? '#fecaca' : _tfWarn > 0 ? '#fed7aa' : '#fde68a';
      const _tfBgColor = _tfUrgent > 0 ? '#fef2f2' : _tfWarn > 0 ? '#fff7ed' : '#fefce8';
      const _tfTextColor = _tfUrgent > 0 ? '#dc2626' : _tfWarn > 0 ? '#ea580c' : '#a16207';
      return '<div class="card rcm-card" style="margin-bottom:18px;border:1px solid ' + _tfBorderColor + ';">' +
        '<div class="card-header" style="background:' + _tfBgColor + ';">' +
          '<h3 style="color:' + _tfTextColor + ';">' +
            '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:text-bottom;margin-right:4px;"><path d="M9 2l7.5 13H1.5z"/><path d="M9 7v3M9 12.5v.5"/></svg>' +
            'Timely Filing Watchdog — ' + _filingAlerts.length + ' claim' + (_filingAlerts.length !== 1 ? 's' : '') + ' at risk' +
          '</h3>' +
          '<span style="font-size:12px;color:var(--gray-500);">' +
            (_tfUrgent > 0 ? '<span style="color:#dc2626;font-weight:700;">' + _tfUrgent + ' urgent</span>' : '') +
            (_tfUrgent > 0 && _tfWarn > 0 ? ' &middot; ' : '') +
            (_tfWarn > 0 ? '<span style="color:#ea580c;font-weight:700;">' + _tfWarn + ' warning</span>' : '') +
            ((_tfUrgent > 0 || _tfWarn > 0) && _tfWatch > 0 ? ' &middot; ' : '') +
            (_tfWatch > 0 ? '<span style="color:#a16207;font-weight:700;">' + _tfWatch + ' watch</span>' : '') +
          '</span>' +
        '</div>' +
        '<div class="card-body" style="padding:0;"><table style="font-size:13px;">' +
          '<thead><tr><th>Claim #</th><th>Patient</th><th>Payer</th><th>DOS</th><th style="text-align:right;">Charges</th><th style="text-align:center;">Filing Limit</th><th style="text-align:center;">Days Elapsed</th><th style="text-align:center;">Days Left</th><th>Priority</th></tr></thead>' +
          '<tbody>' +
          _filingAlerts.slice(0, 15).map(function(a) {
            var c = a.claim;
            var rowBg = a.level === 'urgent' ? 'background:#fef2f2;' : a.level === 'warning' ? 'background:#fff7ed;' : '';
            var priorityBadge = a.level === 'urgent'
              ? '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;">URGENT</span>'
              : a.level === 'warning'
              ? '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#fff7ed;color:#ea580c;border:1px solid #fed7aa;">WARNING</span>'
              : '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#fefce8;color:#a16207;border:1px solid #fde68a;">WATCH</span>';
            var daysLeftText = a.daysLeft < 0 ? 'EXPIRED' : a.daysLeft + 'd';
            var daysColor = a.level === 'urgent' ? '#dc2626' : a.level === 'warning' ? '#ea580c' : '#a16207';
            return '<tr style="' + rowBg + 'cursor:pointer;" onclick="window.app.viewClaimDetail(' + c.id + ')">' +
              '<td><strong style="font-family:monospace;font-size:11px;color:var(--brand-600);">' + escHtml(c.claimNumber || c.claim_number || '') + '</strong></td>' +
              '<td class="text-sm">' + escHtml(c.patientName || c.patient_name || '') + '</td>' +
              '<td class="text-sm">' + payerLink(c.payerName || c.payer_name || '', c.payerId || c.payer_id) + '</td>' +
              '<td class="text-sm">' + formatDateDisplay(c.dateOfService || c.date_of_service) + '</td>' +
              '<td style="text-align:right;">' + _fm(c.totalCharges || c.total_charges) + '</td>' +
              '<td style="text-align:center;font-size:12px;">' + a.limit + 'd</td>' +
              '<td style="text-align:center;font-size:12px;">' + a.daysElapsed + 'd</td>' +
              '<td style="text-align:center;font-weight:700;color:' + daysColor + ';">' + daysLeftText + '</td>' +
              '<td>' + priorityBadge + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>' +
          (_filingAlerts.length > 15 ? '<div style="padding:8px 16px;font-size:12px;color:var(--gray-500);border-top:1px solid var(--gray-100);">Showing 15 of ' + _filingAlerts.length + ' at-risk claims</div>' : '') +
        '</div></div>';
    })()}

    <!-- Revenue Gap Analysis (only on Claims tab) -->
    ${window._rcmTab !== 'claims' ? '' : (() => {
      // Pending by payer
      const pendingByPayer = {};
      gapPending.forEach(c => {
        const p = (c.payerName || c.payer_name || 'Unknown').replace(/BLUE CROSS BLUE SHIELD OF /g, 'BCBS ');
        if (!pendingByPayer[p]) pendingByPayer[p] = { count: 0, amount: 0 };
        pendingByPayer[p].count++;
        pendingByPayer[p].amount += _cv(c, 'totalCharges', 'total_charges');
      });
      const payerList = Object.entries(pendingByPayer).sort((a,b) => b[1].amount - a[1].amount);

      // Pending aging
      const now = new Date();
      const pendingAging = { current: { count: 0, amt: 0 }, aging30: { count: 0, amt: 0 }, aging60: { count: 0, amt: 0 }, aging90: { count: 0, amt: 0 } };
      gapPending.forEach(c => {
        const dos = new Date(c.dateOfService || c.date_of_service);
        const days = Math.floor((now - dos) / 86400000);
        const charges = _cv(c, 'totalCharges', 'total_charges');
        if (days <= 30) { pendingAging.current.count++; pendingAging.current.amt += charges; }
        else if (days <= 60) { pendingAging.aging30.count++; pendingAging.aging30.amt += charges; }
        else if (days <= 90) { pendingAging.aging60.count++; pendingAging.aging60.amt += charges; }
        else { pendingAging.aging90.count++; pendingAging.aging90.amt += charges; }
      });

      return `
    <div class="card rcm-card" style="margin-bottom:18px;">
      <div class="card-header"><h3>Revenue Gap Analysis</h3><span style="font-size:12px;color:var(--gray-500);">Billed ${_fk(totalCharged)} — Collected ${_fk(totalCollected)} — Gap ${_fk(totalCharged - totalCollected)}</span></div>
      <div class="card-body" style="padding:14px;">
        <!-- Summary cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:16px;">
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px;cursor:pointer;" title="Claims submitted but no payment received yet — may need payer follow-up or payment CSV import" onclick="window._rcmTab='claims';window.app.rcmTab(document.querySelector('.tab'),'claims');setTimeout(()=>{document.getElementById('rcm-claim-status').value='submitted';window.app.filterRcmClaims();},100);">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9a3412;letter-spacing:0.5px;">Pending (No Payment)</div>
            <div style="font-size:22px;font-weight:800;color:#ea580c;">${_fk(gapPendingAmt)}</div>
            <div style="font-size:11px;color:#c2410c;">${gapPending.length} claims — click to view</div>
          </div>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px;cursor:pointer;" title="Claims rejected by insurance — review denial reason and appeal if appropriate" onclick="window._rcmTab='claims';window.app.rcmTab(document.querySelector('.tab'),'claims');setTimeout(()=>{document.getElementById('rcm-claim-status').value='denied';window.app.filterRcmClaims();},100);">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#991b1b;letter-spacing:0.5px;">Denied</div>
            <div style="font-size:22px;font-weight:800;color:#dc2626;">${_fk(gapDeniedAmt)}</div>
            <div style="font-size:11px;color:#b91c1c;">${gapDenied.length} claims — click to view</div>
          </div>
          <div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:12px;padding:14px;cursor:pointer;" title="Insurance paid part of the claim — remaining balance still owed" onclick="window._rcmTab='claims';window.app.rcmTab(document.querySelector('.tab'),'claims');setTimeout(()=>{document.getElementById('rcm-claim-status').value='partial_paid';window.app.filterRcmClaims();},100);">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#155e75;letter-spacing:0.5px;">Partial Pay (Balance Due)</div>
            <div style="font-size:22px;font-weight:800;color:#0891b2;">${_fk(gapPartialBal)}</div>
            <div style="font-size:11px;color:#0e7490;">${gapPartial.length} claims — click to view</div>
          </div>
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px;" title="Copays, deductibles, and coinsurance owed by patients">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#5b21b6;letter-spacing:0.5px;">Patient Responsibility</div>
            <div style="font-size:22px;font-weight:800;color:#7c3aed;">${_fk(gapPtResp)}</div>
            <div style="font-size:11px;color:#6d28d9;">Copays / deductibles</div>
          </div>
        </div>

        <!-- Pending detail: by payer + aging -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <!-- By Payer -->
          <div style="background:var(--gray-50);border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-500);margin-bottom:8px;">Pending by Payer</div>
            ${payerList.map(([payer, d]) => {
              const pct = gapPendingAmt > 0 ? (d.amount / gapPendingAmt * 100) : 0;
              return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;" onclick="document.getElementById(\'rcm-claim-search\').value=\'' + escHtml(payer.replace('BCBS ', '')) + '\';window._rcmTab=\'claims\';window.app.rcmTab(document.querySelector(\'.tab\'),\'claims\');setTimeout(()=>{document.getElementById(\'rcm-claim-status\').value=\'submitted\';window.app.filterRcmClaims();},100);">' +
                '<div style="flex:1;font-size:12px;font-weight:600;color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(payer) + '">' + escHtml(payer) + '</div>' +
                '<div style="font-size:11px;color:var(--gray-500);">' + d.count + '</div>' +
                '<div style="width:60px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;"><div style="height:100%;background:#ea580c;width:' + pct + '%;border-radius:3px;"></div></div>' +
                '<div style="font-size:12px;font-weight:700;color:#ea580c;min-width:55px;text-align:right;">' + _fk(d.amount) + '</div>' +
              '</div>';
            }).join('')}
          </div>
          <!-- Aging -->
          <div style="background:var(--gray-50);border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-500);margin-bottom:8px;">Pending Aging</div>
            ${[
              { label: '0-30 days (Current)', ...pendingAging.current, color: '#22c55e' },
              { label: '31-60 days', ...pendingAging.aging30, color: '#f59e0b' },
              { label: '61-90 days', ...pendingAging.aging60, color: '#f97316' },
              { label: '90+ days (Action Needed)', ...pendingAging.aging90, color: '#ef4444' },
            ].map(b => {
              const pct = gapPendingAmt > 0 ? (b.amt / gapPendingAmt * 100) : 0;
              return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                '<div style="flex:1;font-size:12px;color:var(--gray-700);">' + b.label + ' <span style="color:var(--gray-400);">(' + b.count + ')</span></div>' +
                '<div style="width:80px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;"><div style="height:100%;background:' + b.color + ';width:' + pct + '%;border-radius:3px;"></div></div>' +
                '<div style="font-size:12px;font-weight:700;color:' + b.color + ';min-width:55px;text-align:right;">' + _fk(b.amt) + '</div>' +
              '</div>';
            }).join('')}
            ${pendingAging.aging90.count > 0 ? '<div style="margin-top:8px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:11px;color:#991b1b;"><strong>' + pendingAging.aging90.count + ' claims over 90 days</strong> — follow up with payers or check if payment CSV is missing</div>' : ''}
          </div>
        </div>
      </div>
    </div>`;
    })()}

    <!-- Tabs -->
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab ${window._rcmTab === 'claims' ? 'active' : ''}" onclick="window.app.rcmTab(this,'claims')">Claims (${claims.length})</button>
      <button class="tab ${window._rcmTab === 'charges' ? 'active' : ''}" onclick="window.app.rcmTab(this,'charges')">Charges (${charges.length})</button>
      <button class="tab ${window._rcmTab === 'denials' ? 'active' : ''}" onclick="window.app.rcmTab(this,'denials')">Denials (${denials.length})</button>
      <button class="tab ${window._rcmTab === 'payments' ? 'active' : ''}" onclick="window.app.rcmTab(this,'payments')">Payments (${payments.length})</button>
      <button class="tab ${window._rcmTab === 'ar' ? 'active' : ''}" onclick="window.app.rcmTab(this,'ar')">A/R Aging</button>
    </div>

    <!-- ═══ CLAIMS TAB ═══ -->
    ${(() => {
      // Apply saved filters to claims
      const _fStatus = window._rcmClaimFilterStatus || '';
      const _fClient = window._rcmClaimFilterClient || '';
      const _fPayer = window._rcmClaimFilterPayer || '';
      const _fSearch = (window._rcmClaimFilterSearch || '').toLowerCase();
      const _fDosFrom = window._rcmClaimFilterDosFrom || '';
      const _fDosTo = window._rcmClaimFilterDosTo || '';
      const filteredClaims = claims.filter(c => {
        const dos = (c.dateOfService || c.date_of_service || '').toString().slice(0, 10);
        const clientId = String(c.billingClientId || c.billing_client_id || '');
        const payer = c.payerName || c.payer_name || '';
        const searchText = ((c.claimNumber || c.claim_number || '') + ' ' + (c.patientName || c.patient_name || '') + ' ' + payer).toLowerCase();
        return (!_fStatus || c.status === _fStatus)
          && (!_fClient || clientId === _fClient)
          && (!_fPayer || payer === _fPayer)
          && (!_fSearch || searchText.includes(_fSearch))
          && (!_fDosFrom || dos >= _fDosFrom)
          && (!_fDosTo || dos <= _fDosTo);
      });
      const PAGE_SIZE = 50;
      const totalPages = Math.ceil(filteredClaims.length / PAGE_SIZE) || 1;
      if ((window._rcmClaimsPage || 1) > totalPages) window._rcmClaimsPage = 1;
      const page = Math.min(window._rcmClaimsPage || 1, totalPages);
      const pagedClaims = filteredClaims.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const hasFilters = _fStatus || _fClient || _fPayer || _fSearch || _fDosFrom || _fDosTo;
      return `
    <div id="rcm-claims" class="${window._rcmTab !== 'claims' ? 'hidden' : ''}">
      <div class="card rcm-card rcm-table">
        <div class="card-header" style="flex-wrap:wrap;gap:8px;"><h3>Claims${hasFilters ? ' <span style="font-size:12px;font-weight:400;color:var(--gray-500);">(' + filteredClaims.length + ' of ' + claims.length + ')</span>' : ''}</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <input type="text" id="rcm-claim-search" placeholder="Search patient, claim #..." class="form-control" style="width:170px;height:32px;font-size:12px;" value="${escAttr(_fSearch)}" oninput="window.app.filterRcmClaims()">
            <select id="rcm-claim-payer" class="form-control" style="width:140px;height:32px;font-size:12px;" onchange="window.app.filterRcmClaims()">
              <option value="">All Payers</option>
              ${[...new Set(claims.map(c => c.payerName || c.payer_name || '').filter(Boolean))].sort().map(p => `<option value="${escAttr(p)}" ${_fPayer === p ? 'selected' : ''}>${escHtml(p.length > 25 ? p.slice(0,25) + '...' : p)}</option>`).join('')}
            </select>
            <select id="rcm-claim-status" class="form-control" style="width:110px;height:32px;font-size:12px;" onchange="window.app.filterRcmClaims()"><option value="">All Status</option>${CLAIM_STATUSES.map(s => `<option value="${s.value}" ${_fStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
            <select id="rcm-claim-client" class="form-control" style="width:130px;height:32px;font-size:12px;" onchange="window.app.filterRcmClaims()"><option value="">All Clients</option>${clients.map(c => `<option value="${c.id}" ${_fClient === String(c.id) ? 'selected' : ''}>${escHtml(c.organizationName || c.organization_name || '')}</option>`).join('')}</select>
            <input type="date" id="rcm-claim-dos-from" class="form-control" style="width:125px;height:32px;font-size:11px;" value="${_fDosFrom}" onchange="window.app.filterRcmClaims()" title="DOS From">
            <input type="date" id="rcm-claim-dos-to" class="form-control" style="width:125px;height:32px;font-size:11px;" value="${_fDosTo}" onchange="window.app.filterRcmClaims()" title="DOS To">
            ${hasFilters ? `<button class="btn btn-sm" onclick="window.app.clearRcmClaimFilters()" style="font-size:11px;color:var(--red);">Clear</button>` : ''}
            <button class="btn btn-sm" onclick="window.app.openClaimImportModal()" style="font-size:11px;">Import</button>
            <button class="btn btn-sm" onclick="window.app.exportClaimsCSV()" style="font-size:11px;">Export</button>
            <button class="btn btn-sm" onclick="window.app.scrubClaims()" style="font-size:11px;color:#d97706;font-weight:600;" title="Validate unpaid claims for errors and warnings before submission">Scrub Claims</button>
          </div>
        </div>
        <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
          <thead><tr><th title="Unique claim identifier from 837 or payer">Claim #</th><th>Patient</th><th title="Insurance company or plan">Payer</th><th title="Date of Service">DOS</th><th style="text-align:right;" title="Amount billed to insurance">Charges</th><th style="text-align:right;" title="Amount paid by insurance — money received">Paid</th><th style="text-align:right;" title="Copay, deductible, or coinsurance owed by patient">Pt Resp</th><th style="text-align:right;" title="Remaining amount owed (Charges - Paid - Pt Resp)">Balance</th><th title="Check or EFT number from payer — click to see all claims on this payment">Check #</th><th title="Current claim status">Status</th><th>Actions</th></tr></thead>
          <tbody id="rcm-claims-tbody">
            ${pagedClaims.map(c => `<tr class="rcm-claim-row" style="cursor:pointer;" onclick="window.app.viewClaimDetail(${c.id})">
              <td><strong style="font-family:monospace;font-size:12px;color:var(--brand-600);">${escHtml(c.claimNumber || c.claim_number || '')}</strong></td>
              <td class="text-sm">${escHtml(c.patientName || c.patient_name || '—')}</td>
              <td class="text-sm">${payerLink(c.payerName || c.payer_name || '—', c.payerId || c.payer_id)}</td>
              <td class="text-sm">${formatDateDisplay(c.dateOfService || c.date_of_service)}</td>
              <td style="text-align:right;">${_fm(c.totalCharges || c.total_charges)}</td>
              <td style="text-align:right;color:var(--green);font-weight:600;">${_fm(c.totalPaid || c.total_paid)}</td>
              <td style="text-align:right;color:#7c3aed;">${_fm(c.patientResponsibility || c.patient_responsibility)}</td>
              <td style="text-align:right;${(c.balance || 0) > 0 ? 'color:var(--red);font-weight:600;' : ''}">${_fm(c.balance)}</td>
              <td class="text-sm">${c.checkNumber || c.check_number ? `<a href="#" onclick="event.stopPropagation();window.app.viewCheckDetail('${escHtml(c.checkNumber || c.check_number)}')" style="font-family:monospace;font-size:11px;color:var(--brand-600);text-decoration:underline;">${escHtml(c.checkNumber || c.check_number)}</a>` : '<span style="color:var(--gray-300);">—</span>'}</td>
              <td>${_claimBadge(c.status)}${_filingBadge(c.id)}</td>
              <td><button class="btn btn-sm" onclick="event.stopPropagation();window.app.editRcmClaim(${c.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="event.stopPropagation();window.app.deleteRcmClaim(${c.id})">Del</button></td>
            </tr>`).join('')}
            ${filteredClaims.length === 0 ? `<tr><td colspan="11" style="text-align:center;padding:3rem;">
              <div style="color:var(--gray-400);font-size:32px;margin-bottom:8px;">&#128203;</div>
              <div style="font-size:14px;font-weight:600;color:var(--gray-600);margin-bottom:4px;">${hasFilters ? 'No claims match the current filters' : 'No claims yet'}</div>
              <div style="font-size:12px;color:var(--gray-400);margin-bottom:12px;">${hasFilters ? 'Try adjusting your filters or search terms.' : 'Claims track bills sent to payers through their full lifecycle — submission, adjudication, payment, and denial.'}</div>
              ${!hasFilters ? '<button class="btn btn-sm btn-primary" onclick="window.app.openRcmClaimModal()" style="font-size:12px;">+ New Claim</button> <button class="btn btn-sm" onclick="window.app.openClaimImportModal()" style="font-size:12px;margin-left:6px;">Import Claims</button>' : ''}
            </td></tr>` : ''}
          </tbody>
        </table></div>
        ${filteredClaims.length <= PAGE_SIZE ? '' : `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid var(--gray-200);">
            <span style="font-size:12px;color:var(--gray-500);">Showing ${(page-1)*PAGE_SIZE+1}\u2013${Math.min(page*PAGE_SIZE, filteredClaims.length)} of ${filteredClaims.length} claims</span>
            <div style="display:flex;gap:4px;align-items:center;">
              <button class="btn btn-sm" onclick="window._rcmClaimsPage=1;window.app.rcSwitchTab('claims');" ${page===1?'disabled':''}>First</button>
              <button class="btn btn-sm" onclick="window._rcmClaimsPage=${page-1};window.app.rcSwitchTab('claims');" ${page===1?'disabled':''}>Prev</button>
              <span style="padding:4px 12px;font-size:12px;">Page ${page} of ${totalPages}</span>
              <button class="btn btn-sm" onclick="window._rcmClaimsPage=${page+1};window.app.rcSwitchTab('claims');" ${page>=totalPages?'disabled':''}>Next</button>
              <button class="btn btn-sm" onclick="window._rcmClaimsPage=${totalPages};window.app.rcSwitchTab('claims');" ${page>=totalPages?'disabled':''}>Last</button>
            </div>
          </div>`}
        </div>
      </div>
    </div>`;
    })()}

    <!-- ═══ CHARGES TAB ═══ -->
    <div id="rcm-charges" class="${window._rcmTab !== 'charges' ? 'hidden' : ''}">
      <!-- Quick Charge Entry -->
      <div class="card rcm-card" style="margin-bottom:16px;">
        <div class="card-header"><h3>Quick Charge Entry</h3></div>
        <div class="card-body" style="padding:14px;">
          <div style="display:grid;grid-template-columns:1fr 0.8fr 1fr 0.6fr 0.5fr 0.5fr 0.6fr 0.5fr auto;gap:8px;align-items:end;">
            <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Patient</label><input type="text" id="rcm-qc-patient" class="form-control" style="height:32px;font-size:12px;" placeholder="Patient name"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Payer</label>
              <select id="rcm-qc-payer" class="form-control" style="height:32px;font-size:12px;">
                <option value="">—</option>
                ${[...payers].sort((a,b) => (a.name||'').localeCompare(b.name||'')).slice(0,50).map(p => `<option value="${escAttr(p.name)}">${escHtml(p.name)}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label style="font-size:10px;">CPT Code</label>
              <select id="rcm-qc-cpt" class="form-control" style="height:32px;font-size:12px;" onchange="window.app.onCptSelect('rcm-qc-cpt','rcm-qc-amount')">
                <option value="">Select...</option>
                ${CPT_CODES.map(c => `<option value="${c.code}" data-rate="${c.rate}">${c.code} — ${c.desc}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label style="font-size:10px;">ICD-10</label>
              <select id="rcm-qc-icd" class="form-control" style="height:32px;font-size:12px;">
                <option value="">Select...</option>
                ${ICD_CODES.map(c => `<option value="${c.code}">${c.code} — ${c.desc}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Units</label><input type="number" id="rcm-qc-units" class="form-control" style="height:32px;font-size:12px;" value="1" min="1"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Amount</label><input type="number" id="rcm-qc-amount" class="form-control" style="height:32px;font-size:12px;" step="0.01" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:10px;">DOS</label><input type="date" id="rcm-qc-dos" class="form-control" style="height:32px;font-size:12px;" value="${new Date().toISOString().split('T')[0]}"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Client</label>
              <select id="rcm-qc-client" class="form-control" style="height:32px;font-size:12px;">
                <option value="">—</option>${clients.filter(c => c.status === 'active').map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || '')}</option>`).join('')}
              </select>
            </div>
            <button class="btn btn-primary" style="height:32px;font-size:12px;white-space:nowrap;" onclick="window.app.saveQuickCharge()">+ Add</button>
          </div>
        </div>
      </div>
      <!-- Charges Table -->
      <div class="card rcm-card rcm-table">
        <div class="card-header"><h3>Charge Entries</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="rcm-charge-patient" placeholder="Patient" class="form-control" style="width:140px;height:32px;font-size:12px;" oninput="window.app.filterRcmCharges()">
            <input type="text" id="rcm-charge-cpt" placeholder="CPT" class="form-control" style="width:80px;height:32px;font-size:12px;" oninput="window.app.filterRcmCharges()">
            <input type="text" id="rcm-charge-payer" placeholder="Payer" class="form-control" style="width:140px;height:32px;font-size:12px;" oninput="window.app.filterRcmCharges()">
            <select id="rcm-charge-status" class="form-control" style="width:110px;height:32px;font-size:12px;" onchange="window.app.filterRcmCharges()">
              <option value="">All Status</option>
              <option value="submitted">Submitted</option>
              <option value="billed">Billed</option>
              <option value="paid">Paid</option>
              <option value="denied">Denied</option>
              <option value="pending">Pending</option>
            </select>
            <button class="btn btn-sm btn-primary" onclick="window.app.syncChargeStatuses()" style="font-size:12px;" title="Update charge statuses to match their claim status (paid, denied, etc.)">Reconcile</button>
            <button class="btn btn-sm" onclick="window.app.openChargeImportModal()" style="font-size:12px;">Import CSV</button>
            <button class="btn btn-sm" onclick="window.app.exportChargesCSV()" style="font-size:12px;">Export CSV</button>
          </div>
        </div>
        <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
          <thead><tr><th>DOS</th><th>Patient</th><th>CPT</th><th>ICD</th><th>Payer</th><th style="text-align:center;">Units</th><th style="text-align:right;">Amount</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="rcm-charges-tbody">
            ${(() => {
              const PAGE_SIZE = 50;
              const page = window._rcmChargesPage || 1;
              const totalPages = Math.ceil(charges.length / PAGE_SIZE) || 1;
              if (page > totalPages) window._rcmChargesPage = 1;
              const curPage = Math.min(page, totalPages);
              const pagedCharges = charges.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
              return pagedCharges.map(ch => `<tr>
              <td class="text-sm">${formatDateDisplay(ch.dateOfService || ch.date_of_service)}</td>
              <td class="text-sm">${escHtml(ch.patientName || ch.patient_name || '—')}</td>
              <td><code style="font-size:12px;color:var(--brand-700);">${escHtml(ch.cptCode || ch.cpt_code || '')}</code> <span class="text-sm text-muted">${escHtml(ch.cptDescription || ch.cpt_description || '')}</span></td>
              <td><code style="font-size:12px;">${escHtml(ch.icdCodes || ch.icd_codes || '')}</code></td>
              <td class="text-sm">${payerLink(ch.payerName || ch.payer_name || '—', ch.payerId || ch.payer_id)}</td>
              <td style="text-align:center;">${ch.units || 1}</td>
              <td style="text-align:right;font-weight:600;">${_fm(ch.chargeAmount || ch.charge_amount)}</td>
              <td><span class="badge badge-${ch.status === 'submitted' || ch.status === 'billed' ? 'approved' : 'pending'}">${escHtml(ch.status || 'pending')}</span></td>
              <td><button class="btn btn-sm" onclick="window.app.editRcmCharge(${ch.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteRcmCharge(${ch.id})">Del</button></td>
            </tr>`).join('') + (charges.length === 0 ? `<tr><td colspan="9" style="text-align:center;padding:3rem;">
              <div style="color:var(--gray-400);font-size:32px;margin-bottom:8px;">&#129534;</div>
              <div style="font-size:14px;font-weight:600;color:var(--gray-600);margin-bottom:4px;">No charge entries</div>
              <div style="font-size:12px;color:var(--gray-400);">Charges capture individual CPT line items before they're grouped into claims. Use the quick entry form above to start.</div>
            </td></tr>` : '');
            })()}
          </tbody>
        </table></div>
        ${(() => {
          const PAGE_SIZE = 50;
          const page = Math.min(window._rcmChargesPage || 1, Math.ceil(charges.length / PAGE_SIZE) || 1);
          const totalPages = Math.ceil(charges.length / PAGE_SIZE) || 1;
          if (charges.length <= PAGE_SIZE) return '';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid var(--gray-200);">
            <span style="font-size:12px;color:var(--gray-500);">Showing ${(page-1)*PAGE_SIZE+1}\u2013${Math.min(page*PAGE_SIZE, charges.length)} of ${charges.length} charges</span>
            <div style="display:flex;gap:4px;align-items:center;">
              <button class="btn btn-sm" onclick="window._rcmChargesPage=1;window.app.rcSwitchTab('charges');" ${page===1?'disabled':''}>First</button>
              <button class="btn btn-sm" onclick="window._rcmChargesPage=${page-1};window.app.rcSwitchTab('charges');" ${page===1?'disabled':''}>Prev</button>
              <span style="padding:4px 12px;font-size:12px;">Page ${page} of ${totalPages}</span>
              <button class="btn btn-sm" onclick="window._rcmChargesPage=${page+1};window.app.rcSwitchTab('charges');" ${page>=totalPages?'disabled':''}>Next</button>
              <button class="btn btn-sm" onclick="window._rcmChargesPage=${totalPages};window.app.rcSwitchTab('charges');" ${page>=totalPages?'disabled':''}>Last</button>
            </div>
          </div>`;
        })()}
        </div>
      </div>
    </div>

    <!-- ═══ DENIALS TAB ═══ -->
    <div id="rcm-denials" class="${window._rcmTab !== 'denials' ? 'hidden' : ''}">
      <!-- Denial Stats -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
        <div class="rcm-stat"><div class="rcm-label">Open Denials</div><div class="rcm-val" style="color:#ef4444;">${denialStats.open || 0}</div></div>
        <div class="rcm-stat"><div class="rcm-label">Total Denied</div><div class="rcm-val" style="color:#dc2626;">${_fk(denialStats.total_denied || denialStats.totalDenied)}</div></div>
        <div class="rcm-stat"><div class="rcm-label">Recovered</div><div class="rcm-val" style="color:#22c55e;">${_fk(denialStats.total_recovered || denialStats.totalRecovered)}</div></div>
        <div class="rcm-stat"><div class="rcm-label">Appeal Success</div><div class="rcm-val" style="color:#3b82f6;">${denialStats.appeal_success_rate || denialStats.appealSuccessRate || 0}%</div></div>
        <div class="rcm-stat"><div class="rcm-label">Overdue Appeals</div><div class="rcm-val" style="color:#f59e0b;">${denialStats.overdue_appeals || denialStats.overdueAppeals || 0}</div></div>
      </div>
      <!-- Appeal Dashboard -->
      ${(() => {
        const _af = denials.filter(d => {const as = d.appealStatus || d.appeal_status; return as && as !== 'not_appealed';});
        const _aw = denials.filter(d => (d.appealStatus || d.appeal_status) === 'appeal_won');
        const _al = denials.filter(d => (d.appealStatus || d.appeal_status) === 'appeal_lost');
        const _ap = denials.filter(d => ['appeal_filed', 'appeal_in_review'].includes(d.appealStatus || d.appeal_status));
        const _ar = _aw.reduce((s, d) => s + (parseFloat(d.appealOutcomeAmount || d.appeal_outcome_amount) || 0), 0);
        const _dc = _aw.length + _al.length;
        const _sr = _dc > 0 ? Math.round((_aw.length / _dc) * 100) : 0;
        return _af.length > 0 ? `
      <div class="card rcm-card" style="margin-bottom:16px;border-left:4px solid #3b82f6;">
        <div class="card-header"><h3 style="color:#1e40af;">Appeal Dashboard</h3></div>
        <div class="card-body" style="padding:14px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#3b82f6;">${_af.length}</div><div style="font-size:11px;color:var(--gray-500);">Appeals Filed</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#f59e0b;">${_ap.length}</div><div style="font-size:11px;color:var(--gray-500);">Pending</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#22c55e;">${_aw.length}</div><div style="font-size:11px;color:var(--gray-500);">Won</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#ef4444;">${_al.length}</div><div style="font-size:11px;color:var(--gray-500);">Lost</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#059669;">${_fm(_ar)}</div><div style="font-size:11px;color:var(--gray-500);">Recovered</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#8b5cf6;">${_sr}%</div><div style="font-size:11px;color:var(--gray-500);">Success Rate</div></div>
          </div>
        </div>
      </div>` : '';
      })()}
      <!-- Denial by Category -->
      ${Array.isArray(denialStats.by_category || denialStats.byCategory) && (denialStats.by_category || denialStats.byCategory).length > 0 ? `
      <div class="card rcm-card" style="margin-bottom:16px;">
        <div class="card-header"><h3>Denials by Category</h3></div>
        <div class="card-body" style="padding:14px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${(denialStats.by_category || denialStats.byCategory || []).map(c => {
              const cat = DENIAL_CATEGORIES.find(x => x.value === (c.denialCategory || c.denial_category));
              return `<div style="padding:8px 14px;background:var(--gray-50);border-radius:10px;text-align:center;min-width:100px;">
                <div style="font-size:18px;font-weight:800;color:var(--red);">${c.count}</div>
                <div style="font-size:11px;color:var(--gray-500);">${escHtml(cat ? cat.label : (c.denialCategory || c.denial_category || ''))}</div>
                <div style="font-size:11px;color:var(--gray-400);">${_fk(c.total)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>` : ''}
      <!-- Denials Table -->
      <div class="card rcm-card rcm-table">
        <div class="card-header"><h3>Denial Queue</h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm" onclick="window.app.escalateDenials()" style="font-size:12px;color:#f59e0b;">Escalate Urgent</button>
            <button class="btn btn-sm" onclick="window.app.exportDenialsCSV()" style="font-size:12px;">Export CSV</button>
            <select id="rcm-denial-status" class="form-control" style="width:140px;height:34px;font-size:13px;" onchange="window.app.filterRcmDenials()"><option value="">All</option>${DENIAL_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}</select>
            <select id="rcm-denial-cat" class="form-control" style="width:160px;height:34px;font-size:13px;" onchange="window.app.filterRcmDenials()"><option value="">All Categories</option>${DENIAL_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}</select>
          </div>
        </div>
        <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
          <thead><tr><th>Claim</th><th>Payer</th><th>Category</th><th style="text-align:right;">Amount</th><th>Appeal Deadline</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="rcm-denials-tbody">
            ${denials.map(d => {
              const claim = d.claim || {};
              const deadline = d.appealDeadline || d.appeal_deadline || '';
              const resolvedSt = ['resolved_won', 'resolved_lost', 'resolved_partial', 'written_off'];
              const appealSt = d.appealStatus || d.appeal_status || 'not_appealed';
              const isOverdue = deadline && new Date(deadline) < new Date() && !resolvedSt.includes(d.status);
              const isAppealOverdue = deadline && new Date(deadline) < new Date() && appealSt === 'not_appealed' && !resolvedSt.includes(d.status);
              const isDueSoon = deadline && !isOverdue && !resolvedSt.includes(d.status) && (new Date(deadline) - new Date()) <= 14 * 86400000 && (new Date(deadline) - new Date()) > 0 && appealSt === 'not_appealed';
              const cat = DENIAL_CATEGORIES.find(x => x.value === (d.denialCategory || d.denial_category));
              const appealBadge = isAppealOverdue ? ' <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#fee2e2;color:#dc2626;">APPEAL OVERDUE</span>' : isDueSoon ? ' <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#fff7ed;color:#ea580c;">APPEAL DUE</span>' : '';
              const appealLvl = d.appealLevel || d.appeal_level || '';
              return `<tr class="rcm-denial-row" data-status="${d.status}" data-category="${d.denialCategory || d.denial_category || ''}" style="${isOverdue || isAppealOverdue ? 'background:#fef2f2;' : isDueSoon ? 'background:#fffbeb;' : ''}">
                <td><strong style="font-family:monospace;font-size:12px;">${escHtml(claim.claimNumber || claim.claim_number || '')}</strong><br><span class="text-sm text-muted">${escHtml(claim.patientName || claim.patient_name || '')}</span></td>
                <td class="text-sm">${escHtml(claim.payerName || claim.payer_name || d.payerName || '')}</td>
                <td><span style="font-size:11px;padding:2px 8px;background:var(--gray-100);border-radius:4px;">${escHtml(cat ? cat.label : '')}</span>${appealLvl ? ` <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#ede9fe;color:#7c3aed;">${escHtml(appealLvl)}</span>` : ''}</td>
                <td style="text-align:right;color:var(--red);font-weight:600;">${_fm(d.deniedAmount || d.denied_amount)}</td>
                <td style="font-size:12px;${isOverdue || isAppealOverdue ? 'color:var(--red);font-weight:700;' : ''}">${deadline ? formatDateDisplay(deadline) : '—'}${appealBadge}</td>
                <td><span style="font-size:11px;font-weight:600;color:${d.priority === 'urgent' ? 'var(--red)' : d.priority === 'high' ? '#f97316' : 'var(--gray-500)'};">${d.priority || 'normal'}</span></td>
                <td>${_denialBadge(d.status)}</td>
                <td><button class="btn btn-sm" onclick="window.app.editRcmDenial(${d.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteRcmDenial(${d.id})">Del</button></td>
              </tr>`;
            }).join('')}
            ${denials.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:3rem;">
              <div style="color:var(--gray-400);font-size:32px;margin-bottom:8px;">&#9888;&#65039;</div>
              <div style="font-size:14px;font-weight:600;color:var(--gray-600);margin-bottom:4px;">No denials tracked</div>
              <div style="font-size:12px;color:var(--gray-400);margin-bottom:12px;">Denial management tracks rejected claims, appeal deadlines, and recovery. No denials is great news!</div>
              <button class="btn btn-sm" onclick="window.app.openRcmDenialModal()" style="font-size:12px;">+ Track Denial</button>
            </td></tr>` : ''}
          </tbody>
        </table></div></div>
      </div>
    </div>

    <!-- ═══ PAYMENTS TAB ═══ -->
    <div id="rcm-payments" class="${window._rcmTab !== 'payments' ? 'hidden' : ''}">
      ${(() => {
        // Group claims by check number for EOB view
        const checkGroups = {};
        claims.forEach(c => {
          const ck = c.checkNumber || c.check_number;
          if (!ck) return;
          if (!checkGroups[ck]) checkGroups[ck] = { claims: [], totalPaid: 0, totalCharges: 0, payer: '', date: '', depositDate: null, paymentId: null };
          checkGroups[ck].claims.push(c);
          checkGroups[ck].totalPaid += Number(c.totalPaid || c.total_paid || 0);
          checkGroups[ck].totalCharges += Number(c.totalCharges || c.total_charges || 0);
          checkGroups[ck].payer = c.payerName || c.payer_name || checkGroups[ck].payer;
          checkGroups[ck].date = c.paidDate || c.paid_date || checkGroups[ck].date;
        });
        // Enrich with deposit info from ClaimPayment records
        payments.forEach(p => {
          const ck = p.checkNumber || p.check_number || p.traceNumber || p.trace_number;
          if (ck && checkGroups[ck]) {
            checkGroups[ck].depositDate = p.depositDate || p.deposit_date || null;
            checkGroups[ck].paymentId = p.id;
            checkGroups[ck].paymentStatus = p.status || 'posted';
          }
        });
        const checkList = Object.entries(checkGroups).sort((a,b) => (b[1].date || '').localeCompare(a[1].date || ''));
        const totalPayments = checkList.reduce((s, [,g]) => s + g.totalPaid, 0);
        const unlinkedClaims = claims.filter(c => (Number(c.totalPaid || c.total_paid || 0) > 0) && !(c.checkNumber || c.check_number));

        return `
      <!-- Payment Stats -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
        <div class="rcm-stat"><div class="rcm-label">Check/EFTs</div><div class="rcm-val" style="color:#3b82f6;">${checkList.length}</div></div>
        <div class="rcm-stat"><div class="rcm-label">Total Posted</div><div class="rcm-val" style="color:#16a34a;">${_fk(totalPayments)}</div></div>
        <div class="rcm-stat"><div class="rcm-label">Claims w/ Payment</div><div class="rcm-val" style="color:#7c3aed;">${claims.filter(c => Number(c.totalPaid || c.total_paid || 0) > 0).length}</div></div>
        <div class="rcm-stat"><div class="rcm-label">Unlinked Payments</div><div class="rcm-val" style="color:#f59e0b;">${unlinkedClaims.length}</div><div class="rcm-sub">No check # assigned</div></div>
      </div>

      <!-- EOB / Check Detail -->
      <div class="card rcm-card">
        <div class="card-header" style="flex-wrap:wrap;gap:8px;">
          <h3>Payments by Check / EFT</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="rcm-payment-search" placeholder="Search check #, payer..." class="form-control" style="width:180px;height:34px;font-size:12px;" oninput="window.app.filterPaymentGroups()">
            <label style="font-size:11px;color:var(--gray-500);margin:0;">DOS From</label>
            <input type="date" id="rcm-payment-dos-from" class="form-control" style="width:130px;height:34px;font-size:12px;" onchange="window.app.filterPaymentGroups()">
            <label style="font-size:11px;color:var(--gray-500);margin:0;">To</label>
            <input type="date" id="rcm-payment-dos-to" class="form-control" style="width:130px;height:34px;font-size:12px;" onchange="window.app.filterPaymentGroups()">
            <button class="btn btn-sm" onclick="window.app.openEraImportModal()" style="font-size:12px;">Import ERA/835</button>
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          ${checkList.length === 0 ? `<div style="text-align:center;padding:3rem;">
            <div style="color:var(--gray-400);font-size:32px;margin-bottom:8px;">&#128176;</div>
            <div style="font-size:14px;font-weight:600;color:var(--gray-600);margin-bottom:4px;">No payments posted</div>
            <div style="font-size:12px;color:var(--gray-400);margin-bottom:12px;">Payments track insurance and patient collections. Post payments manually or import an ERA/835 file.</div>
            <button class="btn btn-sm btn-primary" onclick="window.app.openRcmPaymentModal()" style="font-size:12px;">+ Post Payment</button>
            <button class="btn btn-sm" onclick="window.app.openEraImportModal()" style="font-size:12px;margin-left:6px;">Import ERA</button>
          </div>` : ''}
          ${checkList.map(([checkNum, group]) => `
          <div class="payment-group" data-check="${escAttr(checkNum)}" data-payer="${escAttr(group.payer.toLowerCase())}" data-dos-min="${group.claims.reduce((m, c) => { const d = (c.dateOfService || c.date_of_service || '').toString().slice(0,10); return d && d < m ? d : m; }, '9999-99-99')}" data-dos-max="${group.claims.reduce((m, c) => { const d = (c.dateOfService || c.date_of_service || '').toString().slice(0,10); return d && d > m ? d : m; }, '0000-00-00')}">
            <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--gray-200);cursor:pointer;gap:12px;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.chevron').style.transform=this.nextElementSibling.style.display==='none'?'':'rotate(90deg)'">
              <svg class="chevron" width="14" height="14" fill="none" stroke="var(--gray-400)" stroke-width="2.5" style="flex-shrink:0;transition:transform 0.15s;"><path d="M5 2l5 5-5 5"/></svg>
              <div style="flex:1;">
                <div style="font-family:monospace;font-size:14px;font-weight:700;color:var(--brand-600);">${escHtml(checkNum)}</div>
                <div style="font-size:11px;color:var(--gray-500);">${escHtml(group.payer)} — ${group.claims.length} claim${group.claims.length > 1 ? 's' : ''} — ${group.date ? formatDateDisplay(group.date) : ''}</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                ${group.depositDate ? `<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:#dcfce7;color:#166534;">DEPOSITED ${formatDateDisplay(group.depositDate)}</span>` : group.paymentId ? `<button class="btn btn-sm" style="font-size:10px;padding:3px 10px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;" onclick="event.stopPropagation();window.app.confirmDeposit(${group.paymentId},'${escHtml(checkNum)}',${group.totalPaid.toFixed(2)})">Confirm Deposit</button>` : `<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:#fef3c7;color:#92400e;">RECEIVED</span>`}
                <div style="text-align:right;">
                  <div style="font-size:16px;font-weight:800;color:#16a34a;">${_fm(group.totalPaid)}</div>
                  <div style="font-size:11px;color:var(--gray-400);">of ${_fm(group.totalCharges)} billed</div>
                </div>
              </div>
            </div>
            <div style="display:none;background:var(--gray-50);border-bottom:1px solid var(--gray-200);">
              <table style="width:100%;font-size:12px;border-collapse:collapse;">
                <thead><tr style="background:var(--gray-100);"><th style="padding:6px 12px;">Claim #</th><th>Patient</th><th>DOS</th><th style="text-align:right;">Charges</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Pt Resp</th><th style="text-align:right;">Balance</th><th>Status</th></tr></thead>
                <tbody>${group.claims.map(c => `<tr style="border-bottom:1px solid var(--gray-200);cursor:pointer;" onclick="window.app.viewClaimDetail(${c.id})">
                  <td style="padding:5px 12px;font-family:monospace;color:var(--brand-600);">${escHtml(c.claimNumber || c.claim_number || '')}</td>
                  <td>${escHtml(c.patientName || c.patient_name || '')}</td>
                  <td>${formatDateDisplay(c.dateOfService || c.date_of_service)}</td>
                  <td style="text-align:right;">${_fm(c.totalCharges || c.total_charges)}</td>
                  <td style="text-align:right;color:#16a34a;font-weight:600;">${_fm(c.totalPaid || c.total_paid)}</td>
                  <td style="text-align:right;color:#7c3aed;">${_fm(c.patientResponsibility || c.patient_responsibility)}</td>
                  <td style="text-align:right;${Number(c.balance || 0) > 0 ? 'color:var(--red);font-weight:600;' : ''}">${_fm(c.balance)}</td>
                  <td>${_claimBadge(c.status)}</td>
                </tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
          `).join('')}
        </div>
      </div>`;
      })()}
    </div>

    <!-- ═══ AR AGING TAB ═══ -->
    <div id="rcm-ar" class="${window._rcmTab !== 'ar' ? 'hidden' : ''}">
      <!-- AR Summary -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px;">
        ${[
          { label: '0-30 Days', key: '0_30', color: '#22c55e' },
          { label: '31-60 Days', key: '31_60', color: '#f59e0b' },
          { label: '61-90 Days', key: '61_90', color: '#f97316' },
          { label: '90+ Days', key: '91_plus', color: '#ef4444' },
        ].map(b => {
          const data = buckets[b.key] || {};
          return `<div class="rcm-stat" style="text-align:center;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${b.color};letter-spacing:0.5px;">${b.label}</div>
            <div style="font-size:28px;font-weight:800;color:${b.color};margin:6px 0;">${_fk(data.total || 0)}</div>
            <div style="font-size:12px;color:var(--gray-500);">${data.count || 0} claims</div>
          </div>`;
        }).join('')}
      </div>
      <!-- AR by Payer -->
      ${Array.isArray(arData.by_payer || arData.byPayer) && (arData.by_payer || arData.byPayer).length > 0 ? `
      <div class="card rcm-card" style="margin-bottom:16px;">
        <div class="card-header"><h3>A/R by Payer</h3></div>
        <div class="card-body" style="padding:0;"><table>
          <thead><tr><th>Payer</th><th style="text-align:right;">Balance</th><th style="text-align:center;">Claims</th><th style="text-align:center;">Avg Days</th></tr></thead>
          <tbody>
            ${(arData.by_payer || arData.byPayer || []).sort((a, b) => b.total - a.total).map(p => `<tr>
              <td><strong>${escHtml(p.payer)}</strong></td>
              <td style="text-align:right;font-weight:600;color:var(--red);">${_fm(p.total)}</td>
              <td style="text-align:center;">${p.count}</td>
              <td style="text-align:center;font-weight:600;color:${p.avg_days > 60 ? 'var(--red)' : p.avg_days > 30 ? 'var(--gold)' : 'var(--green)'};">${p.avg_days || p.avgDays || 0}d</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>` : ''}
      <!-- Open AR Claims -->
      <div class="card rcm-card rcm-table">
        <div class="card-header"><h3>Open A/R Claims (${arData.claim_count || arData.claimCount || 0})</h3></div>
        <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
          <thead><tr><th>Claim #</th><th>Patient</th><th>Payer</th><th>DOS</th><th style="text-align:right;">Charges</th><th style="text-align:right;">Balance</th><th>Days</th><th>Status</th></tr></thead>
          <tbody>
            ${(arData.claims || []).map(c => {
              const days = Math.floor((new Date() - new Date(c.dateOfService || c.date_of_service)) / 86400000);
              return `<tr>
                <td><strong style="font-family:monospace;font-size:12px;">${escHtml(c.claimNumber || c.claim_number || '')}</strong></td>
                <td class="text-sm">${escHtml(c.patientName || c.patient_name || '—')}</td>
                <td class="text-sm">${payerLink(c.payerName || c.payer_name || '—', c.payerId || c.payer_id)}</td>
                <td class="text-sm">${formatDateDisplay(c.dateOfService || c.date_of_service)}</td>
                <td style="text-align:right;">${_fm(c.totalCharges || c.total_charges)}</td>
                <td style="text-align:right;color:var(--red);font-weight:600;">${_fm(c.balance)}</td>
                <td style="font-weight:700;color:${days > 90 ? 'var(--red)' : days > 60 ? '#f97316' : days > 30 ? 'var(--gold)' : 'var(--green)'};">${days}d</td>
                <td>${_claimBadge(c.status)}</td>
              </tr>`;
            }).join('')}
            ${(arData.claims || []).length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:3rem;">
              <div style="color:var(--gray-400);font-size:32px;margin-bottom:8px;">&#9989;</div>
              <div style="font-size:14px;font-weight:600;color:var(--gray-600);margin-bottom:4px;">No open A/R</div>
              <div style="font-size:12px;color:var(--gray-400);">All claims are current. Outstanding balances will appear here as they age.</div>
            </td></tr>` : ''}
          </tbody>
        </table></div></div>
      </div>
    </div>

    <!-- ═══ MODALS ═══ -->

    <!-- Claim Modal -->
    <div class="modal-overlay" id="rcm-claim-modal">
      <div class="modal" style="max-width:700px;">
        <div class="modal-header"><h3 id="rcm-claim-modal-title">New Claim</h3><button class="modal-close" onclick="document.getElementById('rcm-claim-modal').classList.remove('active')">&times;</button></div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="rcm-claim-edit-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;"><label>Client</label><select id="rcm-claim-client" class="form-control"><option value="">Select...</option>${clients.map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || '')}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Claim Type</label><select id="rcm-claim-type" class="form-control"><option value="837P">Professional (837P)</option><option value="837I">Institutional (837I)</option><option value="837D">Dental (837D)</option></select></div>
            <div class="auth-field" style="margin:0;"><label>Patient Name *</label><input type="text" id="rcm-claim-patient" class="form-control" placeholder="Patient name"></div>
            <div class="auth-field" style="margin:0;"><label>Member ID</label><input type="text" id="rcm-claim-member" class="form-control" placeholder="Insurance member ID"></div>
            <div class="auth-field" style="margin:0;"><label>Payer *</label>
              <select id="rcm-claim-payer" class="form-control" onchange="window.app.updateClaimModifierHints&&window.app.updateClaimModifierHints()">
                <option value="">Select payer...</option>
                ${[...payers].sort((a,b) => (a.name||'').localeCompare(b.name||'')).map(p => `<option value="${escAttr(p.name)}">${escHtml(p.name)}</option>`).join('')}
                <option value="__other__">Other (type manually)</option>
              </select>
              <input type="text" id="rcm-claim-payer-other" class="form-control" style="display:none;margin-top:4px;" placeholder="Enter payer name">
            </div>
            <div class="auth-field" style="margin:0;"><label>Provider</label>
              <select id="rcm-claim-provider" class="form-control" onchange="window.app.updateClaimModifierHints&&window.app.updateClaimModifierHints()">
                <option value="">Select provider...</option>
                ${providers.map(p => `<option value="${p.id}" data-name="${escAttr((p.firstName||p.first_name||'')+' '+(p.lastName||p.last_name||''))}" data-creds="${escAttr(p.credentials||'')}">${escHtml((p.firstName||p.first_name||'')+' '+(p.lastName||p.last_name||''))} ${p.credentials ? '('+escHtml(p.credentials)+')' : ''}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Date of Service *</label><input type="date" id="rcm-claim-dos" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Total Charges</label><input type="number" id="rcm-claim-charges" class="form-control" step="0.01" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Status</label><select id="rcm-claim-status-sel" class="form-control">${CLAIM_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Submission Method</label><select id="rcm-claim-method" class="form-control"><option value="electronic">Electronic</option><option value="portal">Portal</option><option value="paper">Paper</option></select></div>
            <div class="auth-field" style="margin:0;"><label>Authorization #</label><input type="text" id="rcm-claim-auth" class="form-control" placeholder="Auth number"></div>
            <div class="auth-field" style="margin:0;"><label>Submitted Date</label><input type="date" id="rcm-claim-submitted" class="form-control"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Notes</label><textarea id="rcm-claim-notes" class="form-control" rows="2" style="resize:vertical;"></textarea></div>
          </div>
          <!-- Modifier Suggestions -->
          <div id="rcm-claim-modifier-hints" style="display:none;margin-top:12px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;margin-bottom:4px;">Suggested Modifiers</div>
            <div id="rcm-claim-modifier-hints-body" style="font-size:12px;color:var(--gray-700);line-height:1.6;"></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);"><button class="btn" onclick="document.getElementById('rcm-claim-modal').classList.remove('active')">Cancel</button><button class="btn btn-primary" onclick="window.app.saveRcmClaim()">Save Claim</button></div>
      </div>
    </div>

    <!-- Payment Modal -->
    <div class="modal-overlay" id="rcm-payment-modal">
      <div class="modal" style="max-width:700px;">
        <div class="modal-header"><h3 id="rcm-payment-modal-title">Post Payment</h3><button class="modal-close" onclick="document.getElementById('rcm-payment-modal').classList.remove('active')">&times;</button></div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="rcm-pay-edit-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;"><label>Client</label><select id="rcm-pay-client" class="form-control"><option value="">Select...</option>${clients.map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || '')}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Payer</label>
              <select id="rcm-pay-payer" class="form-control">
                <option value="">Select payer...</option>
                ${[...new Set(claims.map(c => c.payerName || c.payer_name).filter(Boolean))].sort().map(p => `<option value="${escAttr(p)}">${escHtml(p)}</option>`).join('')}
                ${(window.PAYER_CATALOG || []).filter(p => p.name).slice(0, 50).map(p => `<option value="${escAttr(p.name)}">${escHtml(p.name)}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Payment Type *</label><select id="rcm-pay-type" class="form-control"><option value="check">Check</option><option value="eft">EFT</option><option value="ach">ACH</option><option value="virtual_card">Virtual Card</option><option value="patient">Patient Payment</option></select></div>
            <div class="auth-field" style="margin:0;"><label>Check/Trace #</label><input type="text" id="rcm-pay-check" class="form-control" placeholder="Check or trace number"></div>
            <div class="auth-field" style="margin:0;"><label>Payment Date *</label><input type="date" id="rcm-pay-date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
            <div class="auth-field" style="margin:0;"><label>Deposit Date</label><input type="date" id="rcm-pay-deposit" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Total Amount *</label><input type="number" id="rcm-pay-amount" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
          </div>
          <!-- Claim Allocations -->
          <div style="margin-top:16px;border-top:1px solid var(--gray-200);padding-top:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <label style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);">Claim Allocations</label>
              <button class="btn btn-sm" onclick="window.app.addPaymentAllocation()" style="font-size:11px;">+ Add Claim</button>
            </div>
            <div id="rcm-pay-allocations">
              <div class="pay-alloc-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;">
                <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Claim</label>
                  <select class="form-control pay-alloc-claim" style="height:32px;font-size:12px;" onchange="window.app.onPayAllocClaimChange(this)">
                    <option value="">Select claim...</option>
                    ${claims.filter(c => c.status !== 'paid' && c.status !== 'voided').map(c => `<option value="${c.id}" data-balance="${c.balance || 0}" data-payer="${escAttr(c.payerName || c.payer_name || '')}" data-charges="${c.totalCharges || c.total_charges || 0}">${escHtml(c.claimNumber || c.claim_number || '')} — ${escHtml(c.patientName || c.patient_name || '')} (${_fm(c.balance)})</option>`).join('')}
                  </select>
                </div>
                <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Allowed</label><input type="number" class="form-control pay-alloc-allowed" style="height:32px;font-size:12px;" step="0.01" placeholder="0.00"></div>
                <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Paid</label><input type="number" class="form-control pay-alloc-paid" style="height:32px;font-size:12px;" step="0.01" placeholder="0.00"></div>
                <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Adjustment</label><input type="number" class="form-control pay-alloc-adj" style="height:32px;font-size:12px;" step="0.01" placeholder="0.00"></div>
                <div class="auth-field" style="margin:0;"><label style="font-size:10px;">Pt Resp</label><input type="number" class="form-control pay-alloc-ptresp" style="height:32px;font-size:12px;" step="0.01" placeholder="0.00"></div>
                <button class="btn btn-sm" onclick="this.closest('.pay-alloc-row').remove()" style="height:32px;color:var(--red);font-size:11px;">X</button>
              </div>
            </div>
          </div>
          <div class="auth-field" style="margin:12px 0 0;"><label>Notes</label><textarea id="rcm-pay-notes" class="form-control" rows="2" style="resize:vertical;"></textarea></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);"><button class="btn" onclick="document.getElementById('rcm-payment-modal').classList.remove('active')">Cancel</button><button class="btn btn-primary" onclick="window.app.saveRcmPayment()">Post Payment</button></div>
      </div>
    </div>

    <!-- Denial Modal -->
    <div class="modal-overlay" id="rcm-denial-modal">
      <div class="modal" style="max-width:680px;">
        <div class="modal-header"><h3 id="rcm-denial-modal-title">Track Denial</h3><button class="modal-close" onclick="document.getElementById('rcm-denial-modal').classList.remove('active')">&times;</button></div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="rcm-denial-edit-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Claim *</label><select id="rcm-denial-claim" class="form-control"><option value="">Select claim...</option>${claims.map(c => `<option value="${c.id}">${escHtml(c.claimNumber || c.claim_number || '')} — ${escHtml(c.patientName || c.patient_name || '')} (${payerLink(c.payerName || c.payer_name || '', c.payerId || c.payer_id)})</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Category *</label><select id="rcm-denial-category" class="form-control">${DENIAL_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Priority</label><select id="rcm-denial-priority" class="form-control"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
            <div class="auth-field" style="margin:0;"><label>Denied Amount</label><input type="number" id="rcm-denial-amount" class="form-control" step="0.01" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Appeal Deadline</label><input type="date" id="rcm-denial-deadline" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Denial Code</label>
              <input type="text" id="rcm-denial-code" class="form-control" placeholder="Type code (CO-45, H36...)" list="denial-code-list" oninput="window.app.onDenialCodeChange(this.value)" autocomplete="off">
              <datalist id="denial-code-list">${DENIAL_CODES.map(c => `<option value="${c.code}">${c.code} — ${c.desc.slice(0, 60)}</option>`).join('')}</datalist>
            </div>
            <div class="auth-field" style="margin:0;"><label>Status</label><select id="rcm-denial-status-sel" class="form-control">${DENIAL_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}</select></div>
            <div id="rcm-denial-code-info" style="grid-column:1/-1;display:none;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:4px;">
              <div style="font-size:12px;font-weight:700;color:#1e40af;" id="rcm-denial-code-desc"></div>
              <div style="font-size:11px;color:#3b82f6;margin-top:4px;" id="rcm-denial-code-action"></div>
              <div style="font-size:11px;margin-top:2px;"><span id="rcm-denial-code-recovery"></span></div>
            </div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Denial Reason *</label><textarea id="rcm-denial-reason" class="form-control" rows="2" style="resize:vertical;" placeholder="Describe why the claim was denied..."></textarea></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Appeal Notes / Suggested Action</label><textarea id="rcm-denial-appeal-notes" class="form-control" rows="2" style="resize:vertical;"></textarea></div>
            <!-- Appeal Tracking Section -->
            <div style="grid-column:1/-1;margin-top:8px;padding-top:12px;border-top:2px solid #dbeafe;">
              <div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:8px;">Appeal Tracking</div>
            </div>
            <div class="auth-field" style="margin:0;"><label>Appeal Status</label><select id="rcm-denial-appeal-status" class="form-control"><option value="not_appealed">Not Appealed</option><option value="appeal_filed">Appeal Filed</option><option value="appeal_in_review">Appeal In Review</option><option value="appeal_won">Appeal Won</option><option value="appeal_lost">Appeal Lost</option><option value="written_off">Written Off</option></select></div>
            <div class="auth-field" style="margin:0;"><label>Appeal Level</label><select id="rcm-denial-appeal-level" class="form-control"><option value="">—</option><option value="1st Level">1st Level</option><option value="2nd Level">2nd Level</option><option value="External Review">External Review</option></select></div>
            <div class="auth-field" style="margin:0;"><label>Appeal Filed Date</label><input type="date" id="rcm-denial-appeal-filed-date" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Appeal Outcome Amount</label><input type="number" id="rcm-denial-appeal-outcome-amount" class="form-control" step="0.01" placeholder="0.00"></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);"><button class="btn" onclick="document.getElementById('rcm-denial-modal').classList.remove('active')">Cancel</button><button class="btn" style="color:#1e40af;border-color:#bfdbfe;background:#eff6ff;" onclick="window.app.generateDenialAppealLetter()">Generate Appeal Letter</button><button class="btn btn-primary" onclick="window.app.saveRcmDenial()">Save Denial</button></div>
      </div>
    </div>
  `;
}

// ─── Claim Import Modal (added to page body) ───
// The modal HTML is appended by the openClaimImportModal handler in app.js
// since it needs to work outside the rcm page render cycle.

// Standard field names for column mapping
const IMPORT_FIELDS = [
  { key: 'patient_name', label: 'Patient Name', required: true },
  { key: 'payer_name', label: 'Payer / Insurance', required: true },
  { key: 'date_of_service', label: 'Date of Service', required: true },
  { key: 'total_charges', label: 'Charges / Billed Amount', required: false },
  { key: 'total_paid', label: 'Paid Amount', required: false },
  { key: 'cpt_code', label: 'CPT Code', required: false },
  { key: 'icd_codes', label: 'ICD / Diagnosis Code', required: false },
  { key: 'provider_name', label: 'Provider / Rendering', required: false },
  { key: 'patient_member_id', label: 'Member ID', required: false },
  { key: 'patient_dob', label: 'Patient DOB', required: false },
  { key: 'status', label: 'Claim Status', required: false },
  { key: 'submitted_date', label: 'Submitted Date', required: false },
  { key: 'paid_date', label: 'Paid Date', required: false },
  { key: 'denial_reason', label: 'Denial Reason', required: false },
  { key: 'authorization_number', label: 'Auth Number', required: false },
  { key: 'place_of_service', label: 'Place of Service', required: false },
  { key: 'facility_name', label: 'Facility', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: '', label: '— Skip this column —', required: false },
];

// ─── Claim Detail View ───
async function renderClaimDetail(claimId) {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let claim;
  try { claim = await store.getRcmClaim(claimId); } catch (e) { showToast('Claim not found'); return; }
  if (!claim) { showToast('Claim not found'); return; }

  const denials = claim.denials || [];
  const payments = (claim.paymentAllocations || claim.payment_allocations || []);
  const serviceLines = claim.serviceLines || claim.service_lines || [];

  // If service lines have $0 paid but claim has payments, pro-rate to lines
  const claimTotalPaid = Number(claim.totalPaid || claim.total_paid || claim.paidAmount || claim.paid_amount || 0);
  const claimAdjustments = Number(claim.adjustments || 0);
  const claimPtResp = Number(claim.patientResponsibility || claim.patient_responsibility || 0);
  const slTotalPaid = serviceLines.reduce((s, sl) => s + Number(sl.paidAmount || sl.paid_amount || 0), 0);
  const slTotalCharges = serviceLines.reduce((s, sl) => s + Number(sl.charges || 0), 0);
  if (claimTotalPaid > 0 && slTotalPaid === 0 && serviceLines.length > 0) {
    serviceLines.forEach(sl => {
      const charges = Number(sl.charges || 0);
      const ratio = slTotalCharges > 0 ? charges / slTotalCharges : 1 / serviceLines.length;
      sl._computedPaid = Math.round(claimTotalPaid * ratio * 100) / 100;
      sl._computedAdjustment = Math.round(claimAdjustments * ratio * 100) / 100;
      sl._computedPtResp = Math.round(claimPtResp * ratio * 100) / 100;
      sl._computedStatus = claim.status || 'pending';
    });
  }

  const followups = claim.followups || [];
  let claimFollowups = [];
  try { claimFollowups = await store.getFollowups({ claim_id: claimId }); } catch (e) {}
  if (!Array.isArray(claimFollowups)) claimFollowups = [];
  const isDenied = claim.status === 'denied' || claim.status === 'appealed';
  const daysInAR = claim.dateOfService || claim.date_of_service ? Math.floor((new Date() - new Date(claim.dateOfService || claim.date_of_service)) / 86400000) : 0;

  body.innerHTML = `
    <style>
      .cd-back{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--gray-500);cursor:pointer;margin-bottom:12px;font-weight:600;}
      .cd-back:hover{color:var(--brand-600);}
      .cd-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px;}
      .cd-title{font-size:22px;font-weight:800;color:var(--text-color);}
      .cd-meta{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--gray-500);margin-top:4px;}
      .cd-meta span{display:flex;align-items:center;gap:4px;}
      .cd-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px;}
      .cd-card{background:white;border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.06);}
      .cd-card h4{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin:0 0 10px;}
      .cd-field{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:13px;}
      .cd-field:last-child{border:none;}
      .cd-field .label{color:var(--gray-500);}
      .cd-field .value{font-weight:600;color:var(--text-color);}
      .cd-section{background:white;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:16px;overflow:hidden;}
      .cd-section .cd-sh{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--gray-100);}
      .cd-section .cd-sh h4{margin:0;font-size:14px;font-weight:700;}
      .cd-section table{width:100%;border-collapse:collapse;font-size:13px;}
      .cd-section table th{text-align:left;padding:8px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);background:var(--gray-50);}
      .cd-section table td{padding:8px 14px;border-top:1px solid var(--gray-100);}
      .cd-timeline{padding:18px;}
      .cd-tl-item{display:flex;gap:12px;padding-bottom:16px;position:relative;}
      .cd-tl-item:not(:last-child)::before{content:'';position:absolute;left:9px;top:22px;bottom:0;width:2px;background:var(--gray-200);}
      .cd-tl-dot{width:20px;height:20px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:700;}
      .cd-tl-content{flex:1;}
      .cd-tl-title{font-size:13px;font-weight:600;}
      .cd-tl-date{font-size:11px;color:var(--gray-400);margin-top:2px;}
      @media(max-width:768px){.cd-grid{grid-template-columns:1fr;}}
    </style>

    <div class="cd-back" onclick="window.app.rcSwitchTab('claims')">← Back to Claims</div>

    <div class="cd-header">
      <div>
        <div class="cd-title">${escHtml(claim.claimNumber || claim.claim_number || '')} ${_claimBadge(claim.status)}</div>
        <div class="cd-meta">
          <span><strong>${escHtml(claim.patientName || claim.patient_name || '')}</strong></span>
          <span>${payerLink(claim.payerName || claim.payer_name || '', claim.payerId || claim.payer_id)}</span>
          <span>DOS: ${formatDateDisplay(claim.dateOfService || claim.date_of_service)}</span>
          <span>${daysInAR}d in A/R</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm" onclick="window.app.editRcmClaim(${claim.id})">Edit Claim</button>
        ${isDenied ? `<button class="btn btn-sm btn-primary" onclick="window.app.openRcmDenialModal({claimId:${claim.id},claim_id:${claim.id}})">+ Track Denial</button>` : ''}
        <button class="btn btn-sm" onclick="window.app.openRcmPaymentModal({claimId:${claim.id}})">+ Post Payment</button>
      </div>
    </div>

    <!-- Financial Summary Cards -->
    <div class="cd-grid">
      <div class="cd-card">
        <h4>Financial Summary</h4>
        <div class="cd-field"><span class="label">Total Charges</span><span class="value">${_fm(claim.totalCharges || claim.total_charges)}</span></div>
        <div class="cd-field"><span class="label">Allowed Amount</span><span class="value">${_fm(claim.totalAllowed || claim.total_allowed)}</span></div>
        <div class="cd-field"><span class="label">Paid</span><span class="value" style="color:var(--green);">${_fm(claim.totalPaid || claim.total_paid)}</span></div>
        <div class="cd-field"><span class="label">Adjustments</span><span class="value">${_fm(claim.adjustments)}</span></div>
        <div class="cd-field"><span class="label">Patient Resp.</span><span class="value" style="color:#7c3aed;">${_fm(claim.patientResponsibility || claim.patient_responsibility)}</span></div>
        <div class="cd-field"><span class="label">Balance</span><span class="value" style="color:${(claim.balance || 0) > 0 ? 'var(--red)' : 'var(--green)'};">${_fm(claim.balance)}</span></div>
      </div>
      <div class="cd-card">
        <h4>Claim Details</h4>
        <div class="cd-field"><span class="label">Claim Type</span><span class="value">${claim.claimType || claim.claim_type || '837P'}</span></div>
        <div class="cd-field"><span class="label">Provider</span><span class="value">${escHtml(claim.providerName || claim.provider_name || '—')}</span></div>
        <div class="cd-field"><span class="label">Member ID</span><span class="value">${escHtml(claim.patientMemberId || claim.patient_member_id || '—')}</span></div>
        <div class="cd-field"><span class="label">Authorization #</span><span class="value">${escHtml(claim.authorizationNumber || claim.authorization_number || '—')}</span></div>
        <div class="cd-field"><span class="label">Submission</span><span class="value">${claim.submissionMethod || claim.submission_method || '—'}</span></div>
        <div class="cd-field"><span class="label">Payer ID</span><span class="value" style="font-family:monospace;font-size:11px;">${escHtml(claim.payerIdNumber || claim.payer_id_number || '—')}</span></div>
      </div>
      <div class="cd-card">
        <h4>Timeline</h4>
        <div class="cd-field"><span class="label">Submitted</span><span class="value">${formatDateDisplay(claim.submittedDate || claim.submitted_date) || '—'}</span></div>
        <div class="cd-field"><span class="label">Acknowledged</span><span class="value">${formatDateDisplay(claim.acknowledgedDate || claim.acknowledged_date) || '—'}</span></div>
        <div class="cd-field"><span class="label">Adjudicated</span><span class="value">${formatDateDisplay(claim.adjudicatedDate || claim.adjudicated_date) || '—'}</span></div>
        <div class="cd-field"><span class="label">Paid</span><span class="value">${formatDateDisplay(claim.paidDate || claim.paid_date) || '—'}</span></div>
        <div class="cd-field"><span class="label">Check #</span><span class="value">${escHtml(claim.checkNumber || claim.check_number || '—')}</span></div>
        <div class="cd-field"><span class="label">Days in A/R</span><span class="value" style="color:${daysInAR > 90 ? 'var(--red)' : daysInAR > 30 ? '#f59e0b' : 'var(--green)'};">${daysInAR}d</span></div>
      </div>
    </div>

    <!-- Service Lines -->
    ${serviceLines.length > 0 ? `
    <div class="cd-section">
      <div class="cd-sh"><h4>Service Lines (${serviceLines.length})</h4></div>
      <table>
        <thead><tr><th>#</th><th>CPT</th><th>Description</th><th>Modifiers</th><th>ICD</th><th>Units</th><th style="text-align:right;">Charges</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Adjust</th><th style="text-align:right;">Pt Resp</th><th>Status</th></tr></thead>
        <tbody>
          ${serviceLines.map(sl => {
            const paid = sl._computedPaid != null ? sl._computedPaid : Number(sl.paidAmount || sl.paid_amount || 0);
            const adj = sl._computedAdjustment != null ? sl._computedAdjustment : Number(sl.adjustment || sl.adjustments || 0);
            const ptResp = sl._computedPtResp != null ? sl._computedPtResp : Number(sl.patientResp || sl.patient_resp || sl.patientResponsibility || sl.patient_responsibility || 0);
            return `<tr>
            <td>${sl.lineNumber || sl.line_number || ''}</td>
            <td><strong style="font-family:monospace;">${escHtml(sl.cptCode || sl.cpt_code || '')}</strong></td>
            <td class="text-sm">${escHtml(sl.cptDescription || sl.cpt_description || '')}</td>
            <td class="text-sm">${escHtml(sl.modifiers || '')}</td>
            <td class="text-sm">${escHtml(sl.icdCodes || sl.icd_codes || '')}</td>
            <td>${sl.units || 1}</td>
            <td style="text-align:right;">${_fm(sl.charges)}</td>
            <td style="text-align:right;color:var(--green);">${_fm(paid)}</td>
            <td style="text-align:right;color:var(--gray-500);">${_fm(adj)}</td>
            <td style="text-align:right;${ptResp > 0 ? 'color:var(--orange,#f97316);font-weight:600;' : ''}">${_fm(ptResp)}</td>
            <td>${_claimBadge(sl._computedStatus || sl.status || 'pending')}</td>
          </tr>`;}).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Denials -->
    <div class="cd-section">
      <div class="cd-sh">
        <h4>Denials & Appeals (${denials.length})</h4>
        <button class="btn btn-sm btn-primary" onclick="window.app.openRcmDenialModal({claimId:${claim.id},claim_id:${claim.id}})">+ Track Denial</button>
      </div>
      ${denials.length > 0 ? `<table>
        <thead><tr><th>Category</th><th>Reason</th><th>Code</th><th style="text-align:right;">Amount</th><th>Appeal Deadline</th><th>Priority</th><th>Status</th><th style="text-align:right;">Recovered</th><th>Actions</th></tr></thead>
        <tbody>
          ${denials.map(d => {
            const cat = DENIAL_CATEGORIES.find(x => x.value === (d.denialCategory || d.denial_category));
            const deadline = d.appealDeadline || d.appeal_deadline || '';
            const isOverdue = deadline && new Date(deadline) < new Date() && !['resolved_won','resolved_lost','resolved_partial','written_off'].includes(d.status);
            return `<tr style="${isOverdue ? 'background:#fef2f2;' : ''}">
              <td><span style="font-size:11px;padding:2px 8px;background:var(--gray-100);border-radius:4px;">${escHtml(cat ? cat.label : (d.denialCategory || d.denial_category || ''))}</span></td>
              <td class="text-sm" style="max-width:200px;">${escHtml(d.denialReason || d.denial_reason || '')}</td>
              <td style="font-family:monospace;font-size:11px;">${escHtml(d.denialCode || d.denial_code || '—')}</td>
              <td style="text-align:right;color:var(--red);font-weight:600;">${_fm(d.deniedAmount || d.denied_amount)}</td>
              <td style="font-size:12px;${isOverdue ? 'color:var(--red);font-weight:700;' : ''}">${deadline ? formatDateDisplay(deadline) : '—'}${isOverdue ? ' ⚠' : ''}</td>
              <td><span style="font-size:11px;font-weight:600;color:${d.priority === 'urgent' ? 'var(--red)' : d.priority === 'high' ? '#f97316' : 'var(--gray-500)'};">${d.priority || 'normal'}</span></td>
              <td>${_denialBadge(d.status)}</td>
              <td style="text-align:right;color:var(--green);font-weight:600;">${_fm(d.recoveredAmount || d.recovered_amount)}</td>
              <td><button class="btn btn-sm" onclick="window.app.editRcmDenial(${d.id})">Edit</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : `<div style="padding:24px;text-align:center;color:var(--gray-400);">${isDenied ? 'No denial records tracked yet. Click "+ Track Denial" to start the appeal process.' : 'No denials on this claim.'}</div>`}
    </div>

    <!-- Payments -->
    <div class="cd-section">
      <div class="cd-sh">
        <h4>Payment History (${payments.length})</h4>
        <button class="btn btn-sm" onclick="window.app.openRcmPaymentModal({claimId:${claim.id}})">+ Post Payment</button>
      </div>
      ${payments.length > 0 ? `<table>
        <thead><tr><th>Date</th><th style="text-align:right;">Charged</th><th style="text-align:right;">Allowed</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Adjustment</th><th style="text-align:right;">Pt Resp</th></tr></thead>
        <tbody>
          ${payments.map(p => `<tr>
            <td class="text-sm">${formatDateDisplay(p.createdAt || p.created_at) || '—'}</td>
            <td style="text-align:right;">${_fm(p.chargedAmount || p.charged_amount)}</td>
            <td style="text-align:right;">${_fm(p.allowedAmount || p.allowed_amount)}</td>
            <td style="text-align:right;color:var(--green);font-weight:600;">${_fm(p.paidAmount || p.paid_amount)}</td>
            <td style="text-align:right;">${_fm(p.adjustmentAmount || p.adjustment_amount)}</td>
            <td style="text-align:right;color:#7c3aed;">${_fm(p.patientResponsibility || p.patient_responsibility)}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div style="padding:24px;text-align:center;color:var(--gray-400);">No payments posted yet.</div>'}
    </div>

    <!-- Transaction Log -->
    <div class="cd-section" id="cd-txn-log">
      <div class="cd-sh"><h4>Transaction Log</h4><span style="font-size:11px;color:var(--gray-400);">Loading...</span></div>
    </div>

    <!-- Payer Follow-Up Log -->
    <div class="cd-section">
      <div class="cd-sh">
        <h4>Payer Follow-Up Log (${claimFollowups.length})</h4>
        <button class="btn btn-sm" onclick="window.app.openFollowupModal(${claim.id})">+ Log Call</button>
      </div>
      ${claimFollowups.length > 0 ? `<table>
        <thead><tr><th>Date</th><th>Method</th><th>Payer Rep</th><th>Ref #</th><th>Outcome</th><th>Follow-Up</th><th>Notes</th></tr></thead>
        <tbody>
          ${claimFollowups.map(f => {
            const outcomeColors = { resolved: 'var(--green)', escalated: '#f97316', denied: 'var(--red)', resubmit: '#3b82f6', pending: 'var(--gray-500)', no_answer: 'var(--gray-400)' };
            return `<tr>
              <td class="text-sm">${formatDateDisplay(f.createdAt || f.created_at) || '—'}</td>
              <td><span style="font-size:11px;padding:2px 6px;background:var(--gray-100);border-radius:4px;">${escHtml(f.contact_method || f.contactMethod || 'phone')}</span></td>
              <td class="text-sm">${escHtml(f.payer_rep || f.payerRep || '—')}</td>
              <td style="font-family:monospace;font-size:11px;">${escHtml(f.reference_number || f.referenceNumber || '—')}</td>
              <td><span style="font-size:11px;font-weight:600;color:${outcomeColors[f.outcome] || 'var(--gray-500)'};">${escHtml(f.outcome || 'pending')}</span></td>
              <td class="text-sm">${f.followup_date || f.followupDate ? formatDateDisplay(f.followup_date || f.followupDate) : '—'}</td>
              <td class="text-sm" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${escHtml(f.notes || '')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<div style="padding:24px;text-align:center;color:var(--gray-400);">No follow-up calls logged yet. Click "+ Log Call" to record a payer contact.</div>'}
    </div>

    <!-- Notes -->
    ${claim.notes ? `
    <div class="cd-section">
      <div class="cd-sh"><h4>Notes</h4></div>
      <div style="padding:14px 18px;font-size:13px;color:var(--gray-600);white-space:pre-wrap;">${escHtml(claim.notes)}</div>
    </div>` : ''}
  `;

  // ── Load Transaction Log async ──
  _loadTransactionLog(claimId, claim, payments, denials);
}

async function _loadTransactionLog(claimId, claim, payments, denials) {
  const txnDiv = document.getElementById('cd-txn-log');
  if (!txnDiv) return;

  let events = [];
  try { events = await store.getClaimEvents(claimId); } catch {}

  // Build synthetic events from claim data if API returns empty
  if (!Array.isArray(events) || events.length === 0) {
    events = [];
    const charges = Number(claim.totalCharges || claim.total_charges || 0);
    const patientName = escHtml(claim.patientName || claim.patient_name || '');
    const payerName = escHtml(claim.payerName || claim.payer_name || 'payer');

    if (claim.createdAt || claim.created_at)
      events.push({ date: claim.createdAt || claim.created_at, type: 'Created', description: 'Claim created for patient ' + patientName, amount: charges });
    if (claim.submittedDate || claim.submitted_date)
      events.push({ date: claim.submittedDate || claim.submitted_date, type: 'Billed', description: 'Submitted electronic claim to ' + payerName });
    if (claim.acknowledgedDate || claim.acknowledged_date)
      events.push({ date: claim.acknowledgedDate || claim.acknowledged_date, type: 'Claim Processed', description: 'Acknowledged by ' + payerName });

    payments.forEach(p => {
      const paidAmt = Number(p.paidAmount || p.paid_amount || 0);
      const adjAmt = Number(p.adjustmentAmount || p.adjustment_amount || 0);
      const ptResp = Number(p.patientResponsibility || p.patient_responsibility || 0);
      if (paidAmt > 0) events.push({ date: p.createdAt || p.created_at || '', type: 'Payment', description: 'Insurance payment' + (p.checkNumber || p.check_number ? ' — Check #' + (p.checkNumber || p.check_number) : ''), amount: paidAmt, ptResp });
      if (adjAmt > 0) events.push({ date: p.createdAt || p.created_at || '', type: 'Adjustment', description: 'Contractual adjustment', amount: adjAmt });
    });

    denials.forEach(d => {
      events.push({ date: d.createdAt || d.created_at || '', type: 'Denied', description: (d.denialCode || d.denial_code || '') + ' — ' + (d.denialReason || d.denial_reason || 'Claim denied'), amount: Number(d.deniedAmount || d.denied_amount || 0) });
    });

    if (claim.paidDate || claim.paid_date)
      events.push({ date: claim.paidDate || claim.paid_date, type: 'Settled', description: 'Claim settled — ' + (claim.status === 'paid' ? 'fully paid' : (claim.status || 'closed')) });

    events.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    // Running balance
    let runBal = Number(claim.totalCharges || claim.total_charges || 0);
    events.forEach(e => {
      if (e.type === 'Payment' || e.type === 'Adjustment') runBal -= (e.amount || 0);
      e.balance = Math.max(0, runBal);
    });
  }

  const typeColors = { Created: '#3b82f6', Billed: '#8b5cf6', 'Claim Processed': '#0891b2', Payment: '#16a34a', Adjustment: '#f59e0b', Denied: '#dc2626', Settled: '#059669', 'Re-Billed': '#6366f1', Transfer: '#6b7280' };

  txnDiv.innerHTML = `
    <div class="cd-sh"><h4>Transaction Log (${events.length})</h4></div>
    ${events.length > 0 ? `<table>
      <thead><tr><th>Date</th><th>Transaction</th><th>Description</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Pt Resp</th><th style="text-align:right;">Balance</th></tr></thead>
      <tbody>
        ${events.map(e => {
          const color = typeColors[e.type] || '#6b7280';
          return `<tr>
            <td class="text-sm">${formatDateDisplay(e.date) || '—'}</td>
            <td><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:${color}15;color:${color};">${e.type || '—'}</span></td>
            <td class="text-sm" style="max-width:300px;">${e.description || ''}</td>
            <td style="text-align:right;font-weight:600;${e.type === 'Payment' ? 'color:var(--green);' : e.type === 'Denied' ? 'color:var(--red);' : ''}">${e.amount ? _fm(e.amount) : '$0.00'}</td>
            <td style="text-align:right;color:#7c3aed;">${e.ptResp ? _fm(e.ptResp) : '$0.00'}</td>
            <td style="text-align:right;font-weight:600;">${_fm(e.balance)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '<div style="padding:24px;text-align:center;color:var(--gray-400);">No transaction events recorded.</div>'}
  `;
}

export { renderRcmPage, renderClaimDetail, CLAIM_STATUSES, DENIAL_CATEGORIES, DENIAL_STATUSES, CPT_CODES, ICD_CODES, IMPORT_FIELDS };
