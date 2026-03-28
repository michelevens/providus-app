// ui/pages/rcm.js — Revenue Cycle Management
// Claims, Denials, Payments, Charge Capture, AR Aging

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, navigateTo, appConfirm, appPrompt,
        editButton, deleteButton, helpTip } = window._credentik;

if (typeof window._rcmTab === 'undefined') window._rcmTab = 'claims';

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
  let claimStats = {}, denialStats = {}, arData = {};

  // Fire all API calls in parallel for speed
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.allSettled([
    store.getRcmClaimStats(),
    store.getRcmClaims(),
    store.getRcmDenialStats(),
    store.getRcmDenials(),
    store.getRcmPayments(),
    store.getRcmCharges(),
    store.getBillingClients(),
    store.getRcmArAging(),
    store.getAll('providers'),
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
  try { payers = window.PAYER_CATALOG || []; } catch (e) {}

  if (!Array.isArray(claims)) claims = [];
  if (!Array.isArray(denials)) denials = [];
  if (!Array.isArray(payments)) payments = [];
  if (!Array.isArray(charges)) charges = [];
  if (!Array.isArray(clients)) clients = [];
  if (!Array.isArray(providers)) providers = [];
  if (!Array.isArray(payers)) payers = [];
  window._rcmClaims = claims;
  window._rcmDenials = denials;
  window._rcmPayments = payments;
  window._rcmCharges = charges;
  window._rcmClients = clients;
  window._rcmProviders = providers;
  window._rcmPayers = payers;

  const buckets = arData.buckets || {};
  const totalAR = arData.total_ar || arData.totalAr || 0;

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
      <div class="rcm-stat"><div class="rcm-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div><div class="rcm-label">Total Claims</div><div class="rcm-val" style="color:#2563eb;">${claimStats.totalClaims || claimStats.total_claims || claims.length}</div></div>
      <div class="rcm-stat"><div class="rcm-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div><div class="rcm-label">Collected</div><div class="rcm-val" style="color:#16a34a;">${_fk(claimStats.totalPaid || claimStats.total_paid)}</div><div class="rcm-sub">${claimStats.collectionRate || claimStats.collection_rate || 0}% rate</div></div>
      <div class="rcm-stat"><div class="rcm-accent" style="background:linear-gradient(90deg,#8b5cf6,#a78bfa);"></div><div class="rcm-label">Charged</div><div class="rcm-val" style="color:#7c3aed;">${_fk(claimStats.totalCharged || claimStats.total_charged)}</div></div>
      <div class="rcm-stat"><div class="rcm-accent" style="background:linear-gradient(90deg,#ef4444,#f87171);"></div><div class="rcm-label">Denials</div><div class="rcm-val" style="color:#dc2626;">${denialStats.open || 0}</div><div class="rcm-sub">${denialStats.total || 0} total</div></div>
      <div class="rcm-stat"><div class="rcm-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div><div class="rcm-label">Total A/R</div><div class="rcm-val" style="color:#d97706;">${_fk(totalAR)}</div><div class="rcm-sub">${arData.avg_days_in_ar || arData.avgDaysInAr || 0}d avg</div></div>
      <div class="rcm-stat"><div class="rcm-accent" style="background:linear-gradient(90deg,#06b6d4,#22d3ee);"></div><div class="rcm-label">Clean Claim</div><div class="rcm-val" style="color:#0891b2;">${claimStats.cleanClaimRate || claimStats.clean_claim_rate || 0}%</div></div>
      <div class="rcm-stat"><div class="rcm-accent" style="background:linear-gradient(90deg,#10b981,#34d399);"></div><div class="rcm-label">Appeal Rate</div><div class="rcm-val" style="color:#059669;">${denialStats.appeal_success_rate || denialStats.appealSuccessRate || 0}%</div><div class="rcm-sub">won</div></div>
      <div class="rcm-stat"><div class="rcm-accent" style="background:linear-gradient(90deg,#6366f1,#818cf8);"></div><div class="rcm-label">Charges</div><div class="rcm-val" style="color:#4f46e5;">${charges.filter(c => c.status === 'pending').length}</div><div class="rcm-sub">pending</div></div>
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

    <!-- Tabs -->
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab ${window._rcmTab === 'claims' ? 'active' : ''}" onclick="window.app.rcmTab(this,'claims')">Claims (${claims.length})</button>
      <button class="tab ${window._rcmTab === 'charges' ? 'active' : ''}" onclick="window.app.rcmTab(this,'charges')">Charges (${charges.length})</button>
      <button class="tab ${window._rcmTab === 'denials' ? 'active' : ''}" onclick="window.app.rcmTab(this,'denials')">Denials (${denials.length})</button>
      <button class="tab ${window._rcmTab === 'payments' ? 'active' : ''}" onclick="window.app.rcmTab(this,'payments')">Payments (${payments.length})</button>
      <button class="tab ${window._rcmTab === 'ar' ? 'active' : ''}" onclick="window.app.rcmTab(this,'ar')">A/R Aging</button>
    </div>

    <!-- ═══ CLAIMS TAB ═══ -->
    <div id="rcm-claims" class="${window._rcmTab !== 'claims' ? 'hidden' : ''}">
      <div class="card rcm-card rcm-table">
        <div class="card-header"><h3>Claims</h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm" onclick="window.app.openClaimImportModal()" style="font-size:12px;">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><path d="M7 10V2M3.5 5.5L7 2l3.5 3.5"/><path d="M1.5 10v2a1 1 0 001 1h9a1 1 0 001-1v-2"/></svg>Import CSV
            </button>
            <button class="btn btn-sm" onclick="window.app.exportClaimsCSV()" style="font-size:12px;">Export CSV</button>
            <select id="rcm-claim-status" class="form-control" style="width:130px;height:34px;font-size:13px;" onchange="window.app.filterRcmClaims()"><option value="">All</option>${CLAIM_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}</select>
            <select id="rcm-claim-client" class="form-control" style="width:170px;height:34px;font-size:13px;" onchange="window.app.filterRcmClaims()"><option value="">All Clients</option>${clients.map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || '')}</option>`).join('')}</select>
          </div>
        </div>
        <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
          <thead><tr><th>Claim #</th><th>Patient</th><th>Payer</th><th>DOS</th><th style="text-align:right;">Charges</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Pt Resp</th><th style="text-align:right;">Balance</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="rcm-claims-tbody">
            ${claims.map(c => `<tr class="rcm-claim-row" data-status="${c.status}" data-client="${c.billingClientId || c.billing_client_id || ''}" style="cursor:pointer;" onclick="window.app.viewClaimDetail(${c.id})">
              <td><strong style="font-family:monospace;font-size:12px;color:var(--brand-600);">${escHtml(c.claimNumber || c.claim_number || '')}</strong></td>
              <td class="text-sm">${escHtml(c.patientName || c.patient_name || '—')}</td>
              <td class="text-sm">${escHtml(c.payerName || c.payer_name || '—')}</td>
              <td class="text-sm">${formatDateDisplay(c.dateOfService || c.date_of_service)}</td>
              <td style="text-align:right;">${_fm(c.totalCharges || c.total_charges)}</td>
              <td style="text-align:right;color:var(--green);font-weight:600;">${_fm(c.totalPaid || c.total_paid)}</td>
              <td style="text-align:right;color:#7c3aed;">${_fm(c.patientResponsibility || c.patient_responsibility)}</td>
              <td style="text-align:right;${(c.balance || 0) > 0 ? 'color:var(--red);font-weight:600;' : ''}">${_fm(c.balance)}</td>
              <td>${_claimBadge(c.status)}</td>
              <td><button class="btn btn-sm" onclick="event.stopPropagation();window.app.editRcmClaim(${c.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="event.stopPropagation();window.app.deleteRcmClaim(${c.id})">Del</button></td>
            </tr>`).join('')}
            ${claims.length === 0 ? '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--gray-500);">No claims yet. Click "+ New Claim" to create one.</td></tr>' : ''}
          </tbody>
        </table></div></div>
      </div>
    </div>

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
          <button class="btn btn-sm" onclick="window.app.openChargeImportModal()" style="font-size:12px;">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><path d="M7 10V2M3.5 5.5L7 2l3.5 3.5"/><path d="M1.5 10v2a1 1 0 001 1h9a1 1 0 001-1v-2"/></svg>Import CSV
          </button>
        </div>
        <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
          <thead><tr><th>DOS</th><th>Patient</th><th>CPT</th><th>ICD</th><th>Payer</th><th style="text-align:center;">Units</th><th style="text-align:right;">Amount</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${charges.map(ch => `<tr>
              <td class="text-sm">${formatDateDisplay(ch.dateOfService || ch.date_of_service)}</td>
              <td class="text-sm">${escHtml(ch.patientName || ch.patient_name || '—')}</td>
              <td><code style="font-size:12px;color:var(--brand-700);">${escHtml(ch.cptCode || ch.cpt_code || '')}</code> <span class="text-sm text-muted">${escHtml(ch.cptDescription || ch.cpt_description || '')}</span></td>
              <td><code style="font-size:12px;">${escHtml(ch.icdCodes || ch.icd_codes || '')}</code></td>
              <td class="text-sm">${escHtml(ch.payerName || ch.payer_name || '—')}</td>
              <td style="text-align:center;">${ch.units || 1}</td>
              <td style="text-align:right;font-weight:600;">${_fm(ch.chargeAmount || ch.charge_amount)}</td>
              <td><span class="badge badge-${ch.status === 'submitted' || ch.status === 'billed' ? 'approved' : 'pending'}">${ch.status || 'pending'}</span></td>
              <td><button class="btn btn-sm" onclick="window.app.editRcmCharge(${ch.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteRcmCharge(${ch.id})">Del</button></td>
            </tr>`).join('')}
            ${charges.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No charge entries. Use the quick entry form above.</td></tr>' : ''}
          </tbody>
        </table></div></div>
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
              const isOverdue = deadline && new Date(deadline) < new Date() && !['resolved_won', 'resolved_lost', 'resolved_partial', 'written_off'].includes(d.status);
              const cat = DENIAL_CATEGORIES.find(x => x.value === (d.denialCategory || d.denial_category));
              return `<tr class="rcm-denial-row" data-status="${d.status}" data-category="${d.denialCategory || d.denial_category || ''}" style="${isOverdue ? 'background:#fef2f2;' : ''}">
                <td><strong style="font-family:monospace;font-size:12px;">${escHtml(claim.claimNumber || claim.claim_number || '')}</strong><br><span class="text-sm text-muted">${escHtml(claim.patientName || claim.patient_name || '')}</span></td>
                <td class="text-sm">${escHtml(claim.payerName || claim.payer_name || d.payerName || '')}</td>
                <td><span style="font-size:11px;padding:2px 8px;background:var(--gray-100);border-radius:4px;">${escHtml(cat ? cat.label : '')}</span></td>
                <td style="text-align:right;color:var(--red);font-weight:600;">${_fm(d.deniedAmount || d.denied_amount)}</td>
                <td style="font-size:12px;${isOverdue ? 'color:var(--red);font-weight:700;' : ''}">${deadline ? formatDateDisplay(deadline) : '—'}${isOverdue ? ' OVERDUE' : ''}</td>
                <td><span style="font-size:11px;font-weight:600;color:${d.priority === 'urgent' ? 'var(--red)' : d.priority === 'high' ? '#f97316' : 'var(--gray-500)'};">${d.priority || 'normal'}</span></td>
                <td>${_denialBadge(d.status)}</td>
                <td><button class="btn btn-sm" onclick="window.app.editRcmDenial(${d.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteRcmDenial(${d.id})">Del</button></td>
              </tr>`;
            }).join('')}
            ${denials.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No denials tracked yet.</td></tr>' : ''}
          </tbody>
        </table></div></div>
      </div>
    </div>

    <!-- ═══ PAYMENTS TAB ═══ -->
    <div id="rcm-payments" class="${window._rcmTab !== 'payments' ? 'hidden' : ''}">
      <div class="card rcm-card rcm-table">
        <div class="card-header"><h3>Payments</h3>
          <button class="btn btn-sm" onclick="window.app.openEraImportModal()" style="font-size:12px;">Import ERA/835</button>
        </div>
        <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Payer</th><th>Type</th><th>Check/Trace #</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Posted</th><th style="text-align:right;">Remaining</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${payments.map(p => `<tr>
              <td class="text-sm">${formatDateDisplay(p.paymentDate || p.payment_date)}</td>
              <td class="text-sm">${escHtml(p.payerName || p.payer_name || '—')}</td>
              <td><span style="font-size:11px;padding:2px 8px;background:var(--gray-100);border-radius:4px;">${escHtml((p.paymentType || p.payment_type || 'check').replace(/_/g, ' '))}</span></td>
              <td class="text-sm" style="font-family:monospace;">${escHtml(p.checkNumber || p.check_number || p.traceNumber || p.trace_number || '—')}</td>
              <td style="text-align:right;font-weight:700;">${_fm(p.totalAmount || p.total_amount)}</td>
              <td style="text-align:right;color:var(--green);font-weight:600;">${_fm(p.postedAmount || p.posted_amount)}</td>
              <td style="text-align:right;${(p.remainingAmount || p.remaining_amount || 0) > 0 ? 'color:var(--gold);' : ''}">${_fm(p.remainingAmount || p.remaining_amount)}</td>
              <td><span class="badge badge-${p.status === 'posted' || p.status === 'reconciled' ? 'approved' : 'pending'}">${p.status || 'unposted'}</span></td>
              <td><button class="btn btn-sm" onclick="window.app.editRcmPayment(${p.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteRcmPayment(${p.id})">Del</button></td>
            </tr>`).join('')}
            ${payments.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No payments posted yet. Click "+ Post Payment" to record one.</td></tr>' : ''}
          </tbody>
        </table></div></div>
      </div>
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
                <td class="text-sm">${escHtml(c.payerName || c.payer_name || '—')}</td>
                <td class="text-sm">${formatDateDisplay(c.dateOfService || c.date_of_service)}</td>
                <td style="text-align:right;">${_fm(c.totalCharges || c.total_charges)}</td>
                <td style="text-align:right;color:var(--red);font-weight:600;">${_fm(c.balance)}</td>
                <td style="font-weight:700;color:${days > 90 ? 'var(--red)' : days > 60 ? '#f97316' : days > 30 ? 'var(--gold)' : 'var(--green)'};">${days}d</td>
                <td>${_claimBadge(c.status)}</td>
              </tr>`;
            }).join('')}
            ${(arData.claims || []).length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No open A/R</td></tr>' : ''}
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
              <select id="rcm-claim-payer" class="form-control">
                <option value="">Select payer...</option>
                ${[...payers].sort((a,b) => (a.name||'').localeCompare(b.name||'')).map(p => `<option value="${escAttr(p.name)}">${escHtml(p.name)}</option>`).join('')}
                <option value="__other__">Other (type manually)</option>
              </select>
              <input type="text" id="rcm-claim-payer-other" class="form-control" style="display:none;margin-top:4px;" placeholder="Enter payer name">
            </div>
            <div class="auth-field" style="margin:0;"><label>Provider</label>
              <select id="rcm-claim-provider" class="form-control">
                <option value="">Select provider...</option>
                ${providers.map(p => `<option value="${p.id}" data-name="${escAttr((p.firstName||p.first_name||'')+' '+(p.lastName||p.last_name||''))}">${escHtml((p.firstName||p.first_name||'')+' '+(p.lastName||p.last_name||''))} ${p.credentials ? '('+escHtml(p.credentials)+')' : ''}</option>`).join('')}
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
      <div class="modal" style="max-width:560px;">
        <div class="modal-header"><h3 id="rcm-denial-modal-title">Track Denial</h3><button class="modal-close" onclick="document.getElementById('rcm-denial-modal').classList.remove('active')">&times;</button></div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="rcm-denial-edit-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Claim *</label><select id="rcm-denial-claim" class="form-control"><option value="">Select claim...</option>${claims.map(c => `<option value="${c.id}">${escHtml(c.claimNumber || c.claim_number || '')} — ${escHtml(c.patientName || c.patient_name || '')} (${escHtml(c.payerName || c.payer_name || '')})</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Category *</label><select id="rcm-denial-category" class="form-control">${DENIAL_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Priority</label><select id="rcm-denial-priority" class="form-control"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
            <div class="auth-field" style="margin:0;"><label>Denied Amount</label><input type="number" id="rcm-denial-amount" class="form-control" step="0.01" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Appeal Deadline</label><input type="date" id="rcm-denial-deadline" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Denial Code</label><input type="text" id="rcm-denial-code" class="form-control" placeholder="e.g. CO-45"></div>
            <div class="auth-field" style="margin:0;"><label>Status</label><select id="rcm-denial-status-sel" class="form-control">${DENIAL_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Denial Reason *</label><textarea id="rcm-denial-reason" class="form-control" rows="2" style="resize:vertical;" placeholder="Describe why the claim was denied..."></textarea></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Appeal Notes</label><textarea id="rcm-denial-appeal-notes" class="form-control" rows="2" style="resize:vertical;"></textarea></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);"><button class="btn" onclick="document.getElementById('rcm-denial-modal').classList.remove('active')">Cancel</button><button class="btn btn-primary" onclick="window.app.saveRcmDenial()">Save Denial</button></div>
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
          <span>${escHtml(claim.payerName || claim.payer_name || '')}</span>
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
        <thead><tr><th>#</th><th>CPT</th><th>Description</th><th>Modifiers</th><th>ICD</th><th>Units</th><th style="text-align:right;">Charges</th><th style="text-align:right;">Paid</th><th>Status</th></tr></thead>
        <tbody>
          ${serviceLines.map(sl => `<tr>
            <td>${sl.lineNumber || sl.line_number || ''}</td>
            <td><strong style="font-family:monospace;">${escHtml(sl.cptCode || sl.cpt_code || '')}</strong></td>
            <td class="text-sm">${escHtml(sl.cptDescription || sl.cpt_description || '')}</td>
            <td class="text-sm">${escHtml(sl.modifiers || '')}</td>
            <td class="text-sm">${escHtml(sl.icdCodes || sl.icd_codes || '')}</td>
            <td>${sl.units || 1}</td>
            <td style="text-align:right;">${_fm(sl.charges)}</td>
            <td style="text-align:right;color:var(--green);">${_fm(sl.paidAmount || sl.paid_amount)}</td>
            <td>${sl.status ? _claimBadge(sl.status) : '—'}</td>
          </tr>`).join('')}
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
              <td><span style="font-size:11px;padding:2px 6px;background:var(--gray-100);border-radius:4px;">${f.contact_method || f.contactMethod || 'phone'}</span></td>
              <td class="text-sm">${escHtml(f.payer_rep || f.payerRep || '—')}</td>
              <td style="font-family:monospace;font-size:11px;">${escHtml(f.reference_number || f.referenceNumber || '—')}</td>
              <td><span style="font-size:11px;font-weight:600;color:${outcomeColors[f.outcome] || 'var(--gray-500)'};">${f.outcome || 'pending'}</span></td>
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
}

export { renderRcmPage, renderClaimDetail, CLAIM_STATUSES, DENIAL_CATEGORIES, DENIAL_STATUSES, CPT_CODES, ICD_CODES, IMPORT_FIELDS };
