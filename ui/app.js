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

// ─── Reference Data (loaded at init from API) ───

let PAYER_CATALOG = [];
let STATES = [];
let TELEHEALTH_POLICIES = [];
let DEFAULT_STRATEGIES = [];

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

  bindNavigation();
  await checkRecurringTasks();
  await navigateTo('dashboard');
  await updateNotificationBell();

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

async function navigateTo(page) {
  currentPage = page;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update follow-up badge
  let overdueCount = 0;
  try { const _od = await workflow.getOverdueFollowups(); overdueCount = _od.length; } catch {}
  const badge = document.getElementById('followup-badge');
  if (badge) {
    badge.textContent = overdueCount;
    badge.style.display = overdueCount > 0 ? 'inline' : 'none';
  }

  // Update task badge
  const today = new Date().toISOString().split('T')[0];
  let pendingTaskCount = 0;
  try {
    const _allTasks = await store.getAll('tasks');
    pendingTaskCount = _allTasks.filter(t => !t.isCompleted && !t.completed && t.dueDate && t.dueDate <= today).length;
  } catch {}
  const taskBadge = document.getElementById('task-badge');
  if (taskBadge) {
    taskBadge.textContent = pendingTaskCount;
    taskBadge.style.display = pendingTaskCount > 0 ? 'inline' : 'none';
  }

  // Render page
  const pageBody = document.getElementById('page-body');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const pageActions = document.getElementById('page-actions');

  // Print button for all pages
  const printBtn = '<button class="btn btn-sm no-print" onclick="window.app.printPage()" title="Print this page"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11H2.5A1 1 0 011.5 10V6.5A1 1 0 012.5 5.5h11a1 1 0 011 1V10a1 1 0 01-1 1H12"/><path d="M4 5.5V1.5h8v4"/><rect x="4" y="9" width="8" height="5.5" rx="0.5"/></svg> Print</button>';

  switch (page) {
    case 'dashboard':
      pageTitle.textContent = 'Dashboard';
      pageSubtitle.textContent = 'Licensing & credentialing overview';
      pageActions.innerHTML = printBtn;
      await renderDashboard();
      break;
    case 'applications':
      pageTitle.textContent = 'Applications';
      pageSubtitle.textContent = 'All credentialing applications';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openAddModal()">+ Add Application</button>' + printBtn;
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
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.showAddTaskForm()">+ Add Task</button>' + printBtn;
      await renderTasksPage();
      break;
    case 'providers':
      pageTitle.textContent = 'Providers';
      pageSubtitle.textContent = 'Manage provider profiles';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openProviderModal()">+ Add Provider</button>' + printBtn;
      await renderProviders();
      break;
    case 'licenses':
      pageTitle.textContent = 'Licenses';
      pageSubtitle.textContent = 'State licenses and certifications';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openLicenseModal()">+ Add License</button>' + printBtn;
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
      renderFeeScheduleTool();
      break;
    case 'payer-portal':
      pageTitle.textContent = 'Payer Portal Directory';
      pageSubtitle.textContent = 'Quick links to payer credentialing portals & contacts';
      pageActions.innerHTML = printBtn;
      renderPayerPortalTool();
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
      renderStateLookupTool();
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
      renderLetterGeneratorTool();
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
      pageActions.innerHTML = printBtn;
      await renderOrganizationsStub();
      break;
    case 'users':
      pageTitle.textContent = 'User Management';
      pageSubtitle.textContent = 'Manage team members and permissions';
      pageActions.innerHTML = printBtn;
      await renderUsersStub();
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
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openInvoiceModal()">+ Create Invoice</button>' + printBtn;
      await renderBillingPage();
      break;
    case 'import':
      pageTitle.textContent = 'Bulk Import';
      pageSubtitle.textContent = 'Import providers, organizations, licenses, and facilities from CSV';
      pageActions.innerHTML = printBtn;
      await renderImportPage();
      break;
    case 'compliance':
      pageTitle.textContent = 'Compliance Center';
      pageSubtitle.textContent = 'Compliance dashboard, reports, and exports';
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.generateComplianceReport()">Generate Report</button> <button class="btn" onclick="window.app.exportComplianceData()">Export</button>' + printBtn;
      await renderCompliancePage();
      break;
    case 'faq':
      pageTitle.textContent = 'Knowledge Base';
      pageSubtitle.textContent = 'FAQs and help articles';
      pageActions.innerHTML = editButton('+ Add FAQ', 'window.app.openFaqModal()') + printBtn;
      await renderFaqPage();
      break;
    case 'provider-profile':
      pageTitle.textContent = 'Provider Profile';
      pageSubtitle.textContent = 'Comprehensive provider credentialing profile';
      pageActions.innerHTML = printBtn;
      await renderProviderProfilePage(window._selectedProviderId);
      break;
    case 'admin':
      pageTitle.textContent = 'Super Admin';
      pageSubtitle.textContent = 'Manage all agencies and system settings';
      pageActions.innerHTML = '';
      await renderAdminPanel();
      break;
    default:
      pageBody.innerHTML = '<div class="empty-state"><h3>Page not found</h3></div>';
  }
}

// ─── Dashboard ───

async function renderDashboard() {
  const stats = await store.getApplicationStats();
  const overdue = await workflow.getOverdueFollowups();
  const upcoming = await workflow.getUpcomingFollowups();
  const escalations = await workflow.getEscalationCandidates();
  const licenses = await store.getAll('licenses');
  const providers = await store.getAll('providers');
  const orgs = await store.getAll('organizations');
  const org = orgs[0] || {};

  const apps = await store.getAll('applications');
  const tasks = await store.getAll('tasks');
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

  // Pre-resolve overdue followup application details
  const overdueRows = [];
  for (const fu of overdue.slice(0, 5)) {
    const app = await store.getOne('applications', fu.applicationId).catch(() => null);
    const payer = app ? (getPayerById(app.payerId) || { name: app.payerName }) : {};
    overdueRows.push({ fu, app, payer });
  }

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

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <!-- Organization & Provider Summary -->
    <div class="card" style="margin-bottom:20px;border-left:3px solid var(--brand-500);">
      <div class="card-body" style="display:flex;gap:32px;flex-wrap:wrap;align-items:center;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,var(--brand-500),var(--brand-600));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;flex-shrink:0;">${(org.name || 'E').charAt(0)}</div>
          <div>
            <div style="font-size:17px;font-weight:700;color:var(--gray-900);letter-spacing:-0.01em;">${escHtml(org.name) || 'Not Set'}</div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:1px;">NPI: ${org.npi || '—'} &nbsp;&middot;&nbsp; EIN: ${org.taxId || '—'}</div>
          </div>
        </div>
        ${providers.map(p => `
          <div style="border-left:1px solid var(--gray-200);padding-left:24px;display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--gray-100);display:flex;align-items:center;justify-content:center;color:var(--gray-600);font-weight:700;font-size:13px;flex-shrink:0;">${(p.firstName || '?').charAt(0)}${(p.lastName || '?').charAt(0)}</div>
            <div>
              <div style="font-size:15px;font-weight:600;color:var(--gray-800);">${escHtml(p.firstName)} ${escHtml(p.lastName)}, ${escHtml(p.credentials)}</div>
              <div style="font-size:12px;color:var(--gray-500);margin-top:1px;">NPI: ${p.npi || '—'} &nbsp;&middot;&nbsp; ${escHtml(p.specialty)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- License Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="stat-card">
        <div class="label">Licensed States</div>
        <div class="value">${licenses.length}</div>
      </div>
      <div class="stat-card">
        <div class="label">Active</div>
        <div class="value green">${activeLic.length}</div>
      </div>
      <div class="stat-card">
        <div class="label">Pending</div>
        <div class="value" style="color:var(--warning-500);">${pendingLic.length}</div>
      </div>
      <div class="stat-card">
        <div class="label">Expiring (&lt;90d)</div>
        <div class="value ${expiringLic.length > 0 ? 'red' : ''}">${expiringLic.length}</div>
      </div>
      <div class="stat-card">
        <div class="label">Expired</div>
        <div class="value ${expiredLic.length > 0 ? 'red' : ''}">${expiredLic.length}</div>
      </div>
    </div>

    <!-- Telehealth Readiness -->
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="stat-card">
        <div class="label">Avg Readiness</div>
        <div class="value" style="color:${avgReadiness >= 7 ? 'var(--green)' : avgReadiness >= 5 ? 'var(--gold)' : 'var(--red)'};">${avgReadiness}/10</div>
        <div class="sub">${licensedStates.length} licensed states</div>
      </div>
      <div class="stat-card">
        <div class="label">Full Practice Auth</div>
        <div class="value green">${licensedPolicies.filter(p => p.practiceAuthority === 'full').length}</div>
        <div class="sub">of ${licensedPolicies.length} states</div>
      </div>
      <div class="stat-card">
        <div class="label">Restricted States</div>
        <div class="value ${restrictedLicensed.length > 0 ? 'red' : ''}">${restrictedLicensed.length}</div>
        <div class="sub">need CPA/supervision</div>
      </div>
      <div class="stat-card">
        <div class="label">CS Limitations</div>
        <div class="value ${csLimited.length > 0 ? 'red' : ''}">${csLimited.length}</div>
        <div class="sub">Sched II restricted</div>
      </div>
      <div class="stat-card">
        <div class="label">No Audio-Only</div>
        <div class="value ${noAudioOnly.length > 0 ? 'red' : ''}">${noAudioOnly.length}</div>
        <div class="sub">video required</div>
      </div>
    </div>

    <!-- Policy Alerts -->
    ${(restrictedLicensed.length > 0 || csLimited.length > 0) ? `
    <div class="card">
      <div class="card-header">
        <h3>Policy Alerts</h3>
        <button class="btn btn-sm" onclick="window.app.navigateTo('policies')">View All Policies</button>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>State</th><th>Issue</th><th>Details</th><th>Score</th></tr></thead>
          <tbody>
            ${restrictedLicensed.map(p => `<tr>
              <td><strong>${getStateName(p.state)}</strong></td>
              <td><span class="badge badge-denied">Restricted Practice</span></td>
              <td class="text-sm">${escHtml(p.cpaNotes)}</td>
              <td><span style="font-weight:700;color:var(--red);">${p.readinessScore}/10</span></td>
            </tr>`).join('')}
            ${csLimited.map(p => `<tr>
              <td><strong>${getStateName(p.state)}</strong></td>
              <td><span class="badge badge-pending">CS Limited</span></td>
              <td class="text-sm">${escHtml(p.csNotes) || 'Controlled substance restrictions apply'}</td>
              <td><span style="font-weight:700;color:${p.readinessScore >= 5 ? 'var(--gold)' : 'var(--red)'};">${p.readinessScore}/10</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Expansion Opportunities -->
    ${topExpansion.length > 0 ? `
    <div class="card">
      <div class="card-header">
        <h3>Top Expansion Opportunities</h3>
        <button class="btn btn-sm" onclick="window.app.navigateTo('policies')">View All</button>
      </div>
      <div class="card-body">
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${topExpansion.map(p => {
            const appCount = apps.filter(a => a.state === p.state).length;
            return `<div class="stat-card" style="min-width:140px;flex:1;max-width:200px;cursor:pointer;border-top:3px solid var(--success-500);" onclick="window.app.navigateTo('policies')">
              <div class="label">${getStateName(p.state)}</div>
              <div class="value" style="font-size:22px;color:var(--success-600);">${p.readinessScore}/10</div>
              <div class="sub">${p.practiceAuthority} practice</div>
              <div class="sub">${p.controlledSubstances === 'allowed' ? 'CS allowed' : 'CS limited'} &middot; ${p.audioOnly ? 'Audio OK' : 'Video only'}</div>
              ${appCount > 0 ? `<div class="sub" style="color:var(--brand-600);font-weight:500;">${appCount} app(s) started</div>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="text-sm text-muted" style="margin-top:12px;">States with readiness score 8+ where you're not yet licensed. Full practice authority, telehealth-friendly.</div>
      </div>
    </div>` : ''}

    <!-- Application Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="stat-card">
        <div class="label">Applications</div>
        <div class="value">${stats.total}</div>
      </div>
      <div class="stat-card">
        <div class="label">Approved</div>
        <div class="value green">${stats.approved}</div>
      </div>
      <div class="stat-card">
        <div class="label">In Progress</div>
        <div class="value blue">${stats.inProgress}</div>
      </div>
      <div class="stat-card">
        <div class="label">Est. Monthly Rev</div>
        <div class="value green">$${stats.estMonthlyRevenue.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="label">Follow-ups Due</div>
        <div class="value ${overdue.length > 0 ? 'red' : ''}">${overdue.length}</div>
        <div class="sub">${upcoming.length} upcoming</div>
      </div>
    </div>

    <!-- Expiring / Expired Licenses Alert -->
    ${(expiringLic.length > 0 || expiredLic.length > 0) ? `
    <div class="card">
      <div class="card-header">
        <h3>License Alerts</h3>
        <button class="btn btn-sm" onclick="window.app.navigateTo('licenses')">View All Licenses</button>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>State</th><th>License #</th><th>Expiration</th><th>Status</th></tr></thead>
          <tbody>
            ${[...expiredLic, ...expiringLic].sort((a, b) => (a.expirationDate || '').localeCompare(b.expirationDate || '')).map(l => {
              const isExp = new Date(l.expirationDate) < today;
              return `<tr>
                <td><strong>${getStateName(l.state)}</strong> (${l.state})</td>
                <td><code>${escHtml(l.licenseNumber) || '-'}</code></td>
                <td style="color:${isExp ? 'var(--red)' : 'var(--gold)'};font-weight:600;">${formatDateDisplay(l.expirationDate)} ${isExp ? '(EXPIRED)' : '(expiring soon)'}</td>
                <td><span class="badge badge-${l.status}">${l.status}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Overdue Follow-ups -->
    ${overdue.length > 0 ? `
    <div class="card">
      <div class="card-header">
        <h3>Overdue Follow-ups (${overdue.length})</h3>
        <button class="btn btn-sm" onclick="window.app.navigateTo('followups')">View All</button>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Application</th><th>Due Date</th><th>Type</th><th>Action</th></tr></thead>
          <tbody>
            ${overdueRows.map(({ fu, app, payer }) => `<tr class="overdue">
                <td><strong>${payer.name || 'Unknown'}</strong> — ${app ? getStateName(app.state) : ''}</td>
                <td>${formatDateDisplay(fu.dueDate)}</td>
                <td>${fu.type || 'status_check'}</td>
                <td><button class="btn btn-sm btn-primary" onclick="window.app.completeFollowupPrompt('${fu.id}')">Complete</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Escalation Candidates -->
    ${escalations.length > 0 ? `
    <div class="card">
      <div class="card-header">
        <h3>Escalation Candidates (${escalations.length})</h3>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Application</th><th>Age (days)</th><th>Follow-ups</th><th>Reason</th></tr></thead>
          <tbody>
            ${escalations.slice(0, 5).map(esc => {
              const payer = getPayerById(esc.application.payerId) || { name: esc.application.payerName };
              return `<tr>
                <td><strong>${payer.name || 'Unknown'}</strong> — ${getStateName(esc.application.state)}</td>
                <td>${esc.ageDays}</td>
                <td>${esc.followupCount}</td>
                <td class="text-sm text-muted">${esc.reason}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Tasks & Document Progress -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="card">
            <div class="card-header">
              <h3>Tasks Overview</h3>
              <button class="btn btn-sm" onclick="window.app.showQuickTask()">View All</button>
            </div>
            <div class="card-body">
              <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px;">
                <div class="stat-card" style="padding:8px 10px;"><div class="label">Pending</div><div class="value" style="font-size:20px;">${pendingTasks.length}</div></div>
                <div class="stat-card" style="padding:8px 10px;"><div class="label">Overdue</div><div class="value" style="font-size:20px;color:var(--red);">${overdueTasks.length}</div></div>
                <div class="stat-card" style="padding:8px 10px;"><div class="label">Due Today</div><div class="value" style="font-size:20px;color:var(--warning-600);">${dueTodayTasks.length}</div></div>
                <div class="stat-card" style="padding:8px 10px;"><div class="label">Urgent/High</div><div class="value" style="font-size:20px;color:var(--brand-600);">${urgentTasks.length}</div></div>
              </div>
              ${overdueTasks.length > 0 || dueTodayTasks.length > 0 ? `
                <div style="font-size:12px;">
                  ${[...overdueTasks, ...dueTodayTasks].slice(0, 4).map(t => `
                    <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--gray-100);">
                      <span style="font-size:10px;padding:1px 4px;border-radius:3px;background:${t.dueDate < taskToday ? 'var(--red)' : 'var(--warning-600)'}15;color:${t.dueDate < taskToday ? 'var(--red)' : 'var(--warning-600)'};font-weight:600;">${t.dueDate < taskToday ? 'OVERDUE' : 'TODAY'}</span>
                      <span style="font-size:12px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(t.title)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : '<div class="text-sm text-muted" style="text-align:center;padding:8px;">No urgent tasks right now.</div>'}
            </div>
          </div>
      <div class="card">
            <div class="card-header">
              <h3>Document Completion</h3>
              <button class="btn btn-sm" onclick="window.app.navigateTo('applications')">View Apps</button>
            </div>
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <div style="flex:1;height:10px;background:var(--gray-200);border-radius:5px;overflow:hidden;">
                  <div style="width:${overallDocPct}%;height:100%;background:${overallDocPct === 100 ? 'var(--green)' : 'var(--teal)'};border-radius:5px;transition:width 0.3s;"></div>
                </div>
                <span style="font-size:14px;font-weight:700;color:${overallDocPct === 100 ? 'var(--green)' : 'var(--teal)'};">${overallDocPct}%</span>
              </div>
              <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px;">
                <div class="stat-card" style="padding:8px 10px;"><div class="label">Applications</div><div class="value" style="font-size:20px;">${apps.length}</div></div>
                <div class="stat-card" style="padding:8px 10px;"><div class="label">Docs Complete</div><div class="value" style="font-size:20px;color:var(--green);">${fullyComplete}</div></div>
                <div class="stat-card" style="padding:8px 10px;"><div class="label">Need Docs</div><div class="value" style="font-size:20px;color:${apps.length - fullyComplete > 0 ? 'var(--warning-600)' : 'var(--green)'};">${apps.length - fullyComplete}</div></div>
              </div>
              ${lowApps.length > 0 ? `
                <div style="font-size:12px;">
                  ${lowApps.slice(0, 4).map(a => `
                    <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--gray-100);">
                      <div style="width:40px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;"><div style="width:${a.docPct}%;height:100%;background:${a.docPct < 30 ? 'var(--red)' : a.docPct < 70 ? 'var(--warning-600)' : 'var(--green)'};border-radius:3px;"></div></div>
                      <span style="font-size:11px;font-weight:600;min-width:32px;">${a.docPct}%</span>
                      <span style="font-size:12px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${getStateName(a.state)} — ${a.payerName}</span>
                    </div>
                  `).join('')}
                </div>
              ` : '<div class="text-sm text-muted" style="text-align:center;padding:8px;">No applications yet.</div>'}
            </div>
          </div>
    </div>

    <!-- Charts Row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:0;">
      <div class="card">
        <div class="card-header"><h3>Application Pipeline</h3></div>
        <div class="card-body" style="position:relative;height:260px;">
          ${stats.total > 0
            ? '<canvas id="chart-pipeline"></canvas>'
            : '<div class="text-sm text-muted" style="padding-top:80px;text-align:center;">No applications yet.</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Revenue by State</h3></div>
        <div class="card-body" style="position:relative;height:260px;">
          ${apps.filter(a => a.status === 'approved' && a.estMonthlyRevenue > 0).length > 0
            ? '<canvas id="chart-revenue"></canvas>'
            : '<div class="text-sm text-muted" style="padding-top:80px;text-align:center;">No approved revenue data yet.</div>'}
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card">
        <div class="card-header"><h3>License Expiration Timeline</h3></div>
        <div class="card-body" style="position:relative;height:260px;">
          ${licenses.length > 0
            ? '<canvas id="chart-license-timeline"></canvas>'
            : '<div class="text-sm text-muted" style="padding-top:80px;text-align:center;">No licenses yet.</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>Payer Catalog</h3>
          <button class="btn btn-sm" onclick="window.app.navigateTo('payers')">View All ${PAYER_CATALOG.length} Payers</button>
        </div>
        <div class="card-body" style="position:relative;height:260px;">
          <canvas id="chart-payers"></canvas>
        </div>
      </div>
    </div>
  `;

  // ─── Render Charts (after DOM is ready) ───
  requestAnimationFrame(() => renderDashboardCharts(stats, apps, licenses));
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
  const apps = await store.getAll('applications');

  // Build filter options
  const states = [...new Set(apps.map(a => a.state).filter(Boolean))].sort();
  const payers = [...new Set(apps.map(a => {
    const p = getPayerById(a.payerId);
    return p ? p.name : (a.payerName || '');
  }).filter(Boolean))].sort();

  body.innerHTML = `
    <div class="filters-bar">
      <select class="form-control" id="filter-state" onchange="window.app.applyFilters()">
        <option value="">All States</option>
        ${states.map(s => `<option value="${s}" ${filters.state === s ? 'selected' : ''}>${getStateName(s)}</option>`).join('')}
      </select>
      <select class="form-control" id="filter-payer" onchange="window.app.applyFilters()">
        <option value="">All Payers</option>
        ${payers.map(p => `<option value="${p}" ${filters.payer === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <select class="form-control" id="filter-status" onchange="window.app.applyFilters()">
        <option value="">All Statuses</option>
        ${APPLICATION_STATUSES.map(s => `<option value="${s.value}" ${filters.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
      <select class="form-control" id="filter-wave" onchange="window.app.applyFilters()">
        <option value="">All Waves</option>
        <option value="1" ${filters.wave === '1' ? 'selected' : ''}>Wave 1</option>
        <option value="2" ${filters.wave === '2' ? 'selected' : ''}>Wave 2</option>
        <option value="3" ${filters.wave === '3' ? 'selected' : ''}>Wave 3</option>
      </select>
      <input type="text" class="form-control search-input" placeholder="Search..." value="${filters.search}" oninput="window.app.filters.search=this.value;window.app.renderAppTable()">
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:30px;"><input type="checkbox" onchange="document.querySelectorAll('.app-checkbox').forEach(c=>c.checked=this.checked);window.app.onBulkCheckChange();"></th>
            <th onclick="window.app.sortBy('wave')">Wave ${sortArrow('wave')}</th>
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
      <div class="empty-state hidden" id="app-empty">
        <h3>No applications</h3>
        <p>Add applications manually or use the Batch Generator to create application sets from strategy profiles.</p>
        <button class="btn btn-gold" onclick="window.app.openAddModal()">+ Add Application</button>
      </div>
    </div>
  `;

  await renderAppTable();
}

async function renderAppTable() {
  const apps = await store.getAll('applications');
  const tbody = document.getElementById('app-table-body');
  const empty = document.getElementById('app-empty');
  if (!tbody) return;

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

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  tbody.innerHTML = filtered.map(a => {
    const payer = getPayerById(a.payerId);
    const payerName = payer ? payer.name : (a.payerName || '-');
    const statusObj = APPLICATION_STATUSES.find(s => s.value === a.status) || APPLICATION_STATUSES[0];
    const typeLabel = a.type === 'group' ? 'Group' : a.type === 'both' ? 'Both' : 'Indiv';

    return `<tr>
      <td><input type="checkbox" class="app-checkbox" data-app-id="${a.id}" onchange="window.app.onBulkCheckChange()"></td>
      <td><span class="wave-badge wave-${a.wave || 1}">W${a.wave || '-'}</span></td>
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
          <button class="btn btn-sm" onclick="window.app.editApplication('${a.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="window.app.deleteApplication('${a.id}')">Del</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── Follow-ups Page ───

async function renderFollowups() {
  const body = document.getElementById('page-body');
  const overdue = await workflow.getOverdueFollowups();
  const upcoming = await workflow.getUpcomingFollowups();
  const allOpen = (await store.getAll('followups')).filter(f => !f.completedDate);
  const completed = (await store.getAll('followups')).filter(f => f.completedDate)
    .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));

  const overdueHtml = overdue.length > 0 ? await renderFollowupTable('Overdue', overdue, true) : '';
  const upcomingHtml = upcoming.length > 0 ? await renderFollowupTable('Upcoming (Next 14 Days)', upcoming, true) : '';
  const completedHtml = completed.length > 0 ? await renderFollowupTable('Recently Completed', completed.slice(0, 10), false) : '';

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat-card"><div class="label">Overdue</div><div class="value red">${overdue.length}</div></div>
      <div class="stat-card"><div class="label">Upcoming (14 days)</div><div class="value amber">${upcoming.length}</div></div>
      <div class="stat-card"><div class="label">Completed</div><div class="value green">${completed.length}</div></div>
    </div>

    ${overdueHtml}
    ${upcomingHtml}
    ${overdue.length === 0 && upcoming.length === 0 ? '<div class="alert alert-success">No pending follow-ups. All caught up.</div>' : ''}
    ${completedHtml}
  `;
}

async function renderFollowupTable(title, followups, showAction) {
  // Pre-resolve all async app lookups
  const rows = [];
  for (const fu of followups) {
    const app = await store.getOne('applications', fu.applicationId).catch(() => null);
    const payer = app ? (getPayerById(app.payerId) || { name: app.payerName }) : {};
    rows.push({ fu, app, payer });
  }
  return `
    <div class="card">
      <div class="card-header"><h3>${title} (${followups.length})</h3></div>
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
              const isOverdue = fu.dueDate && fu.dueDate <= new Date().toISOString().split('T')[0] && !fu.completedDate;
              return `<tr class="${isOverdue ? 'overdue' : ''}">
                <td><strong>${payer.name || 'Unknown'}</strong> — ${app ? getStateName(app.state) : ''}</td>
                <td>${formatDateDisplay(fu.dueDate)}</td>
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

    <!-- Summary Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="stat-card"><div class="label">Full Practice Authority</div><div class="value green">${fullPractice.length}</div><div class="sub">states</div></div>
      <div class="stat-card"><div class="label">Reduced Practice</div><div class="value" style="color:var(--warning-500);">${reduced.length}</div><div class="sub">states</div></div>
      <div class="stat-card"><div class="label">Restricted Practice</div><div class="value red">${restricted.length}</div><div class="sub">states</div></div>
      <div class="stat-card"><div class="label">CS Telehealth OK</div><div class="value blue">${csAllowed.length}</div><div class="sub">states allow Sched II-V</div></div>
      <div class="stat-card"><div class="label">Top Readiness (7+)</div><div class="value purple">${topStates.length}</div><div class="sub">states</div></div>
    </div>

    <!-- Expansion Readiness -->
    <div class="card">
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
            return `<div class="stat-card" style="min-width:140px;flex:1;max-width:200px;border-left:4px solid ${authColor};">
              <div class="label">${getStateName(sc)}</div>
              <div class="value" style="font-size:24px;color:${scoreColor};">${pol.readinessScore}/10</div>
              <div class="sub">${pol.practiceAuthority} practice</div>
              <div class="sub">${appCount} application${appCount !== 1 ? 's' : ''}</div>
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
    <div class="card">
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
    <div class="card">
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
  const apps = await store.getAll('applications');
  const licenses = await store.getAll('licenses');

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
    <!-- Revenue Summary -->
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="stat-card">
        <div class="label">Current Monthly</div>
        <div class="value green">$${currentMonthly.toLocaleString()}</div>
        <div class="sub">${approved.length} approved apps</div>
      </div>
      <div class="stat-card">
        <div class="label">Pipeline Monthly</div>
        <div class="value blue">$${pipelineMonthly.toLocaleString()}</div>
        <div class="sub">${inProgress.length} in progress</div>
      </div>
      <div class="stat-card">
        <div class="label">Planned Monthly</div>
        <div class="value" style="color:var(--warning-500);">$${plannedMonthly.toLocaleString()}</div>
        <div class="sub">${notStarted.length} not started</div>
      </div>
      <div class="stat-card">
        <div class="label">Current Annual</div>
        <div class="value green">$${currentAnnual.toLocaleString()}</div>
        <div class="sub">at current run rate</div>
      </div>
      <div class="stat-card">
        <div class="label">Total Potential</div>
        <div class="value purple">$${totalPotential.toLocaleString()}</div>
        <div class="sub">/month if all approved</div>
      </div>
    </div>

    <!-- Projection Assumptions -->
    <div style="display:flex;gap:16px;margin-bottom:0;flex-wrap:wrap;">
      <div class="stat-card" style="flex:1;min-width:140px;background:var(--gray-50);border:1px solid var(--border);">
        <div class="label">Avg Cred Time</div>
        <div class="value" style="font-size:20px;">${avgCredDays} days</div>
        <div class="sub">based on ${approvedWithDates.length} approved</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:140px;background:var(--gray-50);border:1px solid var(--border);">
        <div class="label">Approval Rate</div>
        <div class="value" style="font-size:20px;">${Math.round(approvalRate * 100)}%</div>
        <div class="sub">historical</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:140px;background:var(--gray-50);border:1px solid var(--border);">
        <div class="label">Projected Pipeline</div>
        <div class="value" style="font-size:20px;">$${Math.round(projectedPipelineRev).toLocaleString()}</div>
        <div class="sub">/month after approval</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:140px;background:var(--gray-50);border:1px solid var(--border);">
        <div class="label">12-Mo Target</div>
        <div class="value" style="font-size:20px;">$${projectedMonths[11] ? projectedMonths[11].revenue.toLocaleString() : '0'}</div>
        <div class="sub">/month by ${projectedMonths[11] ? projectedMonths[11].label : ''}</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card">
        <div class="card-header"><h3>12-Month Revenue Projection</h3></div>
        <div class="card-body" style="position:relative;height:280px;">
          <canvas id="chart-forecast"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Revenue by Payer Category</h3></div>
        <div class="card-body" style="position:relative;height:280px;">
          ${Object.keys(revenueByPayer).length > 0
            ? '<canvas id="chart-payer-rev"></canvas>'
            : '<div class="text-sm text-muted" style="padding-top:100px;text-align:center;">No revenue data yet.</div>'}
        </div>
      </div>
    </div>

    <!-- Revenue by State Table -->
    <div class="card">
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
  const apps = await store.getAll('applications');
  const licenses = await store.getAll('licenses');
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
    <!-- Population Coverage -->
    <div class="card" style="margin-bottom:16px;border-left:4px solid var(--teal);">
      <div class="card-header"><h3>Population Coverage Estimate</h3></div>
      <div class="card-body">
        <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
          <div class="stat-card">
            <div class="label">Licensed Reach</div>
            <div class="value" style="color:var(--brand-600);">${licensedPct.toFixed(1)}%</div>
            <div class="sub">${(licensedPop * 1000).toLocaleString()} people in ${licensedStates.length} states</div>
          </div>
          <div class="stat-card">
            <div class="label">Credentialed Lives</div>
            <div class="value green">${credentialedPct.toFixed(1)}%</div>
            <div class="sub">~${Math.round(credentialedLives * 1000).toLocaleString()} reachable via approved payers</div>
          </div>
          <div class="stat-card">
            <div class="label">Projected (incl. in-progress)</div>
            <div class="value blue">${projectedPct.toFixed(1)}%</div>
            <div class="sub">~${Math.round((credentialedLives + projectedLives) * 1000).toLocaleString()} once in-progress apps are approved</div>
          </div>
          <div class="stat-card">
            <div class="label">US Population</div>
            <div class="value">${(US_TOTAL_POP * 1000).toLocaleString()}</div>
            <div class="sub">2025 Census estimate</div>
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
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="stat-card"><div class="label">Licensed States</div><div class="value">${licensedStates.length}</div></div>
      <div class="stat-card"><div class="label">Payers Tracked</div><div class="value">${allMatrixPayers.length}</div></div>
      <div class="stat-card"><div class="label">Credentialed</div><div class="value green">${approvedCells}</div><div class="sub">payer-state combos</div></div>
      <div class="stat-card"><div class="label">In Progress</div><div class="value blue">${filledCells - approvedCells}</div></div>
      <div class="stat-card"><div class="label">Gaps</div><div class="value ${gapCells > 0 ? 'red' : ''}">${gapCells}</div><div class="sub">of ${totalCells} possible</div></div>
    </div>

    ${licensedStates.length === 0 ? `
    <div class="card"><div class="card-body text-sm text-muted" style="text-align:center;padding:3rem;">
      Add licenses first to see your coverage matrix. The matrix shows payer credentialing status across your licensed states.
    </div></div>
    ` : `

    <!-- Coverage Heatmap -->
    <div class="card">
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
    <div class="card">
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
    <div class="card">
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
    <div class="card">
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
    <div class="form-row">
      <div class="card">
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
          <button class="btn btn-primary" onclick="window.app.generateAppEmail()">Generate Email</button>
        </div>
      </div>
      <div class="card">
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
  const providers = await store.getAll('providers');
  const licenses = await store.getAll('licenses');
  const apps = await store.getAll('applications');

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat-card"><div class="label">Total Providers</div><div class="value">${providers.length}</div></div>
      <div class="stat-card"><div class="label">Active</div><div class="value green">${providers.filter(p => p.active !== false).length}</div></div>
      <div class="stat-card"><div class="label">Total Licenses</div><div class="value blue">${licenses.length}</div></div>
    </div>

    ${providers.map(p => {
      const provLicenses = licenses.filter(l => l.providerId === p.id);
      const provApps = apps.filter(a => a.providerId === p.id);
      const activeLic = provLicenses.filter(l => l.status === 'active').length;
      const pendingLic = provLicenses.filter(l => l.status === 'pending').length;
      return `
        <div class="card">
          <div class="card-header">
            <h3>${escHtml(p.firstName)} ${escHtml(p.lastName)}, ${escHtml(p.credentials)}</h3>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm" onclick="window.app.editProvider('${p.id}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="window.app.deleteProvider('${p.id}')">Delete</button>
            </div>
          </div>
          <div class="card-body">
            <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:16px;">
              <div><span class="text-sm text-muted">NPI:</span> <strong>${p.npi || '—'}</strong></div>
              <div><span class="text-sm text-muted">Specialty:</span> <strong>${escHtml(p.specialty) || '—'}</strong></div>
              <div><span class="text-sm text-muted">Taxonomy:</span> <strong>${p.taxonomy || '—'}</strong></div>
              <div><span class="text-sm text-muted">Email:</span> ${escHtml(p.email) || '—'}</div>
              <div><span class="text-sm text-muted">Phone:</span> ${escHtml(p.phone) || '—'}</div>
              <div><span class="text-sm text-muted">Status:</span> <span class="badge badge-${p.active !== false ? 'active' : 'inactive'}">${p.active !== false ? 'Active' : 'Inactive'}</span></div>
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
              <div class="stat-card" style="flex:1;min-width:120px;"><div class="label">Licenses</div><div class="value">${provLicenses.length}</div><div class="sub">${activeLic} active, ${pendingLic} pending</div></div>
              <div class="stat-card" style="flex:1;min-width:120px;"><div class="label">Applications</div><div class="value">${provApps.length}</div></div>
              <div class="stat-card" style="flex:1;min-width:120px;"><div class="label">Licensed States</div><div class="value blue">${provLicenses.map(l => l.state).filter((v, i, a) => a.indexOf(v) === i).length}</div></div>
            </div>
          </div>
        </div>
      `;
    }).join('')}

    ${providers.length === 0 ? '<div class="empty-state"><h3>No providers yet</h3><p>Click "+ Add Provider" to add your first provider.</p></div>' : ''}
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

    <!-- NPI Lookup Bar -->
    <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:20px;padding:14px 16px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-lg);">
      <div style="flex:1;">
        <label style="display:block;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">NPI Lookup</label>
        <input type="text" class="form-control" id="prov-npi-lookup" placeholder="Enter 10-digit NPI to auto-fill" value="${escAttr(existing?.npi || '')}" style="font-size:15px;letter-spacing:0.5px;">
      </div>
      <button class="btn btn-primary" onclick="window.app.lookupProviderNPI()" id="npi-lookup-btn" style="height:40px;white-space:nowrap;">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>
        Lookup
      </button>
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
};

// ─── Licenses Page ───

async function renderLicenses() {
  const body = document.getElementById('page-body');
  const providers = await store.getAll('providers');
  const allLicenses = await store.getAll('licenses');
  const selectedProvider = filters._licProvider || '';
  const licenses = selectedProvider ? allLicenses.filter(l => l.providerId === selectedProvider) : allLicenses;
  const active = licenses.filter(l => l.status === 'active');
  const pending = licenses.filter(l => l.status === 'pending');
  const expired = licenses.filter(l => {
    if (!l.expirationDate) return false;
    return new Date(l.expirationDate) < new Date();
  });

  body.innerHTML = `
    ${providers.length > 1 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body" style="padding:12px 16px;">
        <div class="form-group" style="margin:0;max-width:300px;">
          <label style="font-size:12px;margin-bottom:4px;">Filter by Provider</label>
          <select class="form-control" onchange="window.app.filterLicByProvider(this.value)">
            <option value="">All Providers</option>
            ${providers.map(p => `<option value="${p.id}" ${selectedProvider === p.id ? 'selected' : ''}>${p.firstName} ${p.lastName}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>` : ''}

    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Total Licenses</div><div class="value">${licenses.length}</div></div>
      <div class="stat-card"><div class="label">Active</div><div class="value green">${active.length}</div></div>
      <div class="stat-card"><div class="label">Pending</div><div class="value" style="color:var(--warning-500);">${pending.length}</div></div>
      <div class="stat-card"><div class="label">Expiring/Expired</div><div class="value red">${expired.length}</div></div>
    </div>

    <div class="card">
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
              <th>Notes</th>
              <th style="width:100px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${licenses.sort((a, b) => a.state.localeCompare(b.state)).map(l => {
              const isExpired = l.expirationDate && new Date(l.expirationDate) < new Date();
              const isExpiringSoon = l.expirationDate && !isExpired &&
                new Date(l.expirationDate) < new Date(Date.now() + 90 * 86400000);
              const expClass = isExpired ? 'color:var(--red);font-weight:600;' :
                isExpiringSoon ? 'color:var(--warning-500);font-weight:600;' : '';
              return `
                <tr>
                  <td><strong>${getStateName(l.state)}</strong> (${l.state})</td>
                  <td><code>${escHtml(l.licenseNumber) || '-'}</code></td>
                  <td>${escHtml(l.licenseType) || '-'}</td>
                  <td><span class="badge badge-${l.status}">${l.status}</span></td>
                  <td>${formatDateDisplay(l.issueDate)}</td>
                  <td style="${expClass}">${formatDateDisplay(l.expirationDate)}</td>
                  <td>${l.compactState ? 'Yes' : '-'}</td>
                  <td class="text-sm text-muted">${escHtml(l.notes) || ''}</td>
                  <td>
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
  `;
}

// ─── Payers Page ───

async function renderPayers() {
  const body = document.getElementById('page-body');
  const categories = {};
  PAYER_CATALOG.forEach(p => {
    const cat = p.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  });

  const categoryLabels = {
    national: 'National (Big 5)',
    bcbs_anthem: 'BCBS — Anthem / Elevance',
    bcbs_hcsc: 'BCBS — HCSC',
    bcbs_highmark: 'BCBS — Highmark',
    bcbs_independent: 'BCBS — Independent',
    regional: 'Regional',
    medicaid: 'Medicaid',
    medicare: 'Medicare',
    other: 'Other',
  };

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Total Payers</div><div class="value">${PAYER_CATALOG.length}</div></div>
      <div class="stat-card"><div class="label">National</div><div class="value blue">${(categories.national || []).length}</div></div>
      <div class="stat-card"><div class="label">BCBS Plans</div><div class="value" style="color:var(--brand-600);">${
        (categories.bcbs_anthem || []).length +
        (categories.bcbs_hcsc || []).length +
        (categories.bcbs_highmark || []).length +
        (categories.bcbs_independent || []).length
      }</div></div>
      <div class="stat-card"><div class="label">Regional</div><div class="value">${(categories.regional || []).length}</div></div>
    </div>

    ${Object.entries(categories).map(([cat, payers]) => `
      <div class="card">
        <div class="card-header">
          <h3>${categoryLabels[cat] || cat} (${payers.length})</h3>
        </div>
        <div class="card-body" style="padding:0;">
          <table>
            <thead>
              <tr>
                <th>Payer</th>
                <th>Parent Org</th>
                <th>Stedi ID</th>
                <th>Avg Cred Days</th>
                <th>States</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${payers.map(p => `
                <tr>
                  <td><strong>${escHtml(p.name)}</strong></td>
                  <td>${escHtml(p.parentOrg) || '-'}</td>
                  <td><code>${escHtml(p.stediId) || '-'}</code></td>
                  <td>${p.avgCredDays || '-'} days</td>
                  <td class="text-sm">${Array.isArray(p.states) ? p.states.join(', ') : '-'}</td>
                  <td class="text-sm text-muted">${escHtml(p.notes) || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('')}
  `;
}

// ─── Settings Page ───

async function renderSettings() {
  const body = document.getElementById('page-body');
  const orgs = await store.getAll('organizations');
  const providers = await store.getAll('providers');
  const licenses = await store.getAll('licenses');
  const apps = await store.getAll('applications');

  body.innerHTML = `
    <div class="tabs">
      <button class="tab active" onclick="window.app.settingsTab(this, 'settings-import')">Import / Export</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-org')">Organization</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-licenses')">Licenses (${licenses.length})</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-caqh')">CAQH API</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-danger')">Danger Zone</button>
    </div>

    <div id="settings-import">
      <div class="card">
        <div class="card-header"><h3>Export Data</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">Export all your data as JSON for backup purposes.</p>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" onclick="window.app.exportData()">Download JSON Backup</button>
            <span class="text-sm text-muted" style="align-self:center;">${apps.length} applications, ${licenses.length} licenses</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Import Data</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">Import data from a JSON backup file. Feature coming soon.</p>
          <div id="import-results" class="mt-4"></div>
        </div>
      </div>
    </div>

    <div id="settings-org" class="hidden">
      <div class="card">
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
      <div class="card">
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

    <div id="settings-licenses" class="hidden">
      <div class="card">
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
                  <td><span class="badge badge-${l.status}">${l.status}</span></td>
                  <td>${formatDateDisplay(l.expirationDate)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="settings-caqh" class="hidden">
      <div class="card">
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
      <div class="card">
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

    <div id="settings-danger" class="hidden">
      <div class="alert alert-danger">These actions are destructive and cannot be undone.</div>
      <div class="card">
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

// ─── Tasks Page (full page, under Operations) ───

async function renderTasksPage() {
  const body = document.getElementById('page-body');
  const tasks = await store.getAll('tasks');
  const allApps = await store.getAll('applications');
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

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Overdue</div><div class="value red">${overdue.length}</div></div>
      <div class="stat-card"><div class="label">Due Today</div><div class="value amber">${dueToday.length}</div></div>
      <div class="stat-card"><div class="label">Upcoming</div><div class="value blue">${upcoming.length}</div></div>
      <div class="stat-card"><div class="label">Completed</div><div class="value green">${completed.length}</div></div>
    </div>

    <div id="task-page-add-form" style="display:none;margin-bottom:16px;padding:16px;border:1px solid var(--border);border-radius:8px;background:white;box-shadow:var(--shadow);">
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
        <select id="task-page-link-app" class="form-control">
          <option value="">Link to application (optional)</option>
          ${(await store.getAll('applications')).map(a => `<option value="${a.id}">${getStateName(a.state)} — ${a.payerName || getPayerById(a.payerId)?.name || 'Unknown'}</option>`).join('')}
        </select>
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
    <div class="card" style="margin-bottom:12px;">
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
  const linkedApp = task.linkedApplicationId || task.linkedAppId ? (appsMap || {})[task.linkedApplicationId || task.linkedAppId] : null;
  const linkedPayer = linkedApp ? (getPayerById(linkedApp.payerId) || { name: linkedApp.payerName }) : null;

  const isDone = task.isCompleted || task.completed;
  return `<tr class="${isOverdue ? 'overdue' : ''}" style="${isDone ? 'opacity:0.6;' : ''}">
    <td><input type="checkbox" ${isDone ? 'checked' : ''} onchange="window.app.toggleTaskPage('${task.id}')" style="cursor:pointer;accent-color:var(--brand-600);transform:scale(1.2);"></td>
    <td>
      <div style="font-weight:${isDone ? '400' : '600'};${isDone ? 'text-decoration:line-through;' : ''}">${escHtml(task.title)}${task.recurrence ? ` <span style="font-size:10px;padding:1px 5px;background:var(--teal);color:white;border-radius:3px;">&#8635; ${task.recurrence}</span>` : ''}</div>
      ${task.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escHtml(task.notes)}</div>` : ''}
    </td>
    <td><span style="font-size:12px;">${cat.icon} ${cat.label}</span></td>
    <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${pri.color}15;color:${pri.color};font-weight:600;">${pri.label}</span></td>
    <td style="white-space:nowrap;${isOverdue ? 'color:var(--red);font-weight:600;' : ''}">${task.dueDate ? formatDateDisplay(task.dueDate) : '-'}</td>
    <td>${linkedApp ? `<span style="font-size:12px;color:var(--brand-600);">${linkedPayer?.name || 'Unknown'} — ${getStateName(linkedApp.state)}</span>` : '-'}</td>
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
    <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
      <div class="stat-card" style="flex:1;min-width:80px;padding:8px 12px;">
        <div class="label">Overdue</div>
        <div class="value" style="font-size:20px;color:var(--red);">${overdue.length}</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:80px;padding:8px 12px;">
        <div class="label">Due Today</div>
        <div class="value" style="font-size:20px;color:var(--warning-600);">${dueToday.length}</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:80px;padding:8px 12px;">
        <div class="label">Upcoming</div>
        <div class="value" style="font-size:20px;color:var(--brand-600);">${upcoming.length}</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:80px;padding:8px 12px;">
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
        <select id="task-link-app" class="form-control">
          <option value="">Link to application (optional)</option>
          ${(await store.getAll('applications')).map(a => `<option value="${a.id}">${getStateName(a.state)} — ${a.payerName}</option>`).join('')}
        </select>
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
  const linkedApp = task.linkedApplicationId || task.linkedAppId ? (appsMap || {})[task.linkedApplicationId || task.linkedAppId] : null;

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
        <div style="font-size:13px;font-weight:${isDone ? '400' : '600'};${isDone ? 'text-decoration:line-through;' : ''}">${escHtml(task.title)}</div>
        ${task.notes ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${escHtml(task.notes)}</div>` : ''}
        ${linkedApp ? `<div style="font-size:10px;color:var(--brand-600);margin-top:2px;">Linked: ${getStateName(linkedApp.state)} — ${linkedApp.payerName}</div>` : ''}
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

async function renderDocChecklistTool() {
  const payers = PAYER_CATALOG;
  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Document Checklist Generator</h3></div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">
          Select a payer and state to generate the required document checklist for credentialing.
        </p>
        <div class="form-row" style="margin-bottom:20px;">
          <div class="form-group">
            <label>Payer</label>
            <select class="form-control" id="dct-payer">
              <option value="">Select payer...</option>
              ${payers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>State</label>
            <select class="form-control" id="dct-state">
              <option value="">Select state...</option>
              ${STATES.map(s => `<option value="${s.code}">${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn btn-primary" onclick="window.app.generateDocChecklist()">Generate Checklist</button>
        <div id="dct-result" style="margin-top:20px;"></div>
      </div>
    </div>
  `;
}

async function renderFeeScheduleTool() {
  const CPT_CODES = [
    { code: '90791', desc: 'Psychiatric Diagnostic Evaluation', avgRate: 250 },
    { code: '90792', desc: 'Psychiatric Diagnostic Eval w/ Medical', avgRate: 290 },
    { code: '90832', desc: 'Psychotherapy, 30 min', avgRate: 85 },
    { code: '90834', desc: 'Psychotherapy, 45 min', avgRate: 120 },
    { code: '90837', desc: 'Psychotherapy, 60 min', avgRate: 165 },
    { code: '90839', desc: 'Crisis Psychotherapy, first 60 min', avgRate: 200 },
    { code: '90840', desc: 'Crisis Psychotherapy, add-on 30 min', avgRate: 100 },
    { code: '90846', desc: 'Family Therapy w/o Patient', avgRate: 130 },
    { code: '90847', desc: 'Family Therapy w/ Patient', avgRate: 140 },
    { code: '90853', desc: 'Group Psychotherapy', avgRate: 55 },
    { code: '99213', desc: 'E/M Office Visit, Level 3', avgRate: 110 },
    { code: '99214', desc: 'E/M Office Visit, Level 4', avgRate: 155 },
    { code: '99215', desc: 'E/M Office Visit, Level 5', avgRate: 210 },
    { code: '99232', desc: 'Subsequent Hospital Care, Level 2', avgRate: 95 },
    { code: '99243', desc: 'Consultation, Level 3', avgRate: 175 },
  ];

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Fee Schedule Calculator</h3></div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">
          Estimate reimbursement rates by CPT code. Rates are approximate national averages.
          Adjust the multiplier to model payer-specific discounts or geographic adjustments.
        </p>
        <div class="form-row" style="margin-bottom:16px;">
          <div class="form-group">
            <label>Payer Multiplier</label>
            <input type="number" class="form-control" id="fee-multiplier" value="1.0" step="0.05" min="0.5" max="2.0"
              onchange="window.app.recalcFees()">
          </div>
          <div class="form-group">
            <label>Sessions / Month</label>
            <input type="number" class="form-control" id="fee-sessions" value="40" min="1" max="200"
              onchange="window.app.recalcFees()">
          </div>
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>CPT Code</th><th>Description</th><th>Base Rate</th><th>Adjusted Rate</th><th>Monthly Est.</th></tr>
        </thead>
        <tbody id="fee-table-body">
          ${CPT_CODES.map(c => {
            const adj = c.avgRate.toFixed(2);
            return `<tr>
              <td><strong>${c.code}</strong></td>
              <td>${c.desc}</td>
              <td>$${c.avgRate.toFixed(2)}</td>
              <td class="fee-adj">$${adj}</td>
              <td class="fee-monthly">$${(c.avgRate * 40).toLocaleString()}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div id="fee-summary" style="margin-top:16px;padding:16px;background:var(--green-bg);border-radius:8px;font-size:14px;font-weight:600;color:#166534;">
      Total Monthly Estimate (all codes at avg mix): $${CPT_CODES.reduce((s, c) => s + c.avgRate, 0).toLocaleString()} per session &times; 40 sessions
    </div>
  `;
  // Store CPT_CODES for recalc
  window._feeScheduleCPT = CPT_CODES;
}

async function renderPayerPortalTool() {
  const payers = PAYER_CATALOG.filter(p => p.credentialingUrl);
  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Payer Portal Directory</h3>
        <input type="text" class="form-control" style="width:240px;" placeholder="Search payers..." id="portal-search"
          oninput="window.app.filterPortals()">
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead>
            <tr><th>Payer</th><th>Category</th><th>Avg Cred Days</th><th>Phone</th><th>Portal</th></tr>
          </thead>
          <tbody id="portal-table-body">
            ${payers.map(p => `<tr data-payer-name="${p.name.toLowerCase()}">
              <td><strong>${p.name}</strong>${p.parentOrg ? `<br><span style="font-size:11px;color:var(--text-muted);">${p.parentOrg}</span>` : ''}</td>
              <td><span class="badge badge-${p.category === 'national' ? 'active' : p.category === 'behavioral' ? 'submitted' : 'pending'}">${p.category}</span></td>
              <td>${p.avgCredDays || '—'} days</td>
              <td style="font-size:12px;">${p.credPhone || '—'}</td>
              <td>${p.credentialingUrl ? `<a href="${p.credentialingUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">Open Portal</a>` : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderExpirationAlertsTool() {
  const licenses = await store.getAll('licenses');
  const apps = await store.getAll('applications');
  const now = new Date();
  const alerts = [];

  // License expirations
  licenses.forEach(l => {
    if (!l.expirationDate) return;
    const exp = new Date(l.expirationDate);
    const daysLeft = Math.ceil((exp - now) / 86400000);
    if (daysLeft <= 180) {
      alerts.push({
        type: 'License',
        item: `${l.licenseType || 'License'} — ${getStateName(l.state)}`,
        expires: l.expirationDate,
        daysLeft,
        severity: daysLeft <= 0 ? 'expired' : daysLeft <= 30 ? 'critical' : daysLeft <= 90 ? 'warning' : 'info',
      });
    }
  });

  // Credentialing renewal estimates (apps approved > 10 months ago)
  apps.forEach(a => {
    if (a.status !== 'approved' || !a.submittedDate) return;
    const submitted = new Date(a.submittedDate);
    const estRenewal = new Date(submitted);
    estRenewal.setFullYear(estRenewal.getFullYear() + 1);
    const daysLeft = Math.ceil((estRenewal - now) / 86400000);
    if (daysLeft <= 180) {
      alerts.push({
        type: 'Credential',
        item: `${a.payerName} — ${getStateName(a.state)}`,
        expires: estRenewal.toISOString().split('T')[0],
        daysLeft,
        severity: daysLeft <= 0 ? 'expired' : daysLeft <= 30 ? 'critical' : daysLeft <= 90 ? 'warning' : 'info',
      });
    }
  });

  alerts.sort((a, b) => a.daysLeft - b.daysLeft);

  const sevColor = { expired: 'red', critical: 'red', warning: 'amber', info: 'blue' };
  const sevLabel = { expired: 'EXPIRED', critical: 'Critical', warning: 'Expiring Soon', info: 'Upcoming' };

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Total Alerts</div><div class="value">${alerts.length}</div></div>
      <div class="stat-card"><div class="label">Expired</div><div class="value red">${alerts.filter(a => a.severity === 'expired').length}</div></div>
      <div class="stat-card"><div class="label">Critical (30d)</div><div class="value amber">${alerts.filter(a => a.severity === 'critical').length}</div></div>
      <div class="stat-card"><div class="label">Warning (90d)</div><div class="value blue">${alerts.filter(a => a.severity === 'warning').length}</div></div>
    </div>
    ${alerts.length === 0 ? '<div class="empty-state"><h3>No Upcoming Expirations</h3><p>All licenses and credentials are current for the next 6 months.</p></div>' : `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Severity</th><th>Type</th><th>Item</th><th>Expires</th><th>Days Left</th></tr></thead>
        <tbody>
          ${alerts.map(a => `<tr class="${a.severity === 'expired' ? 'overdue' : ''}">
            <td><span class="badge badge-${a.severity === 'expired' || a.severity === 'critical' ? 'denied' : a.severity === 'warning' ? 'pending' : 'submitted'}">${sevLabel[a.severity]}</span></td>
            <td>${a.type}</td>
            <td>${a.item}</td>
            <td>${a.expires}</td>
            <td style="font-weight:700;color:var(--${sevColor[a.severity]});">${a.daysLeft <= 0 ? a.daysLeft + 'd overdue' : a.daysLeft + 'd'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

async function renderStatusExportTool() {
  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Status Report Export</h3></div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">
          Generate a formatted status report for stakeholders. Choose the report type and date range.
        </p>
        <div class="form-row" style="margin-bottom:16px;">
          <div class="form-group">
            <label>Report Type</label>
            <select class="form-control" id="export-type">
              <option value="executive">Executive Summary</option>
              <option value="detailed">Detailed Application Status</option>
              <option value="license">License Status Report</option>
              <option value="financial">Revenue Pipeline Report</option>
            </select>
          </div>
          <div class="form-group">
            <label>Format</label>
            <select class="form-control" id="export-format">
              <option value="text">Plain Text</option>
              <option value="csv">CSV</option>
              <option value="html">HTML (printable)</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" onclick="window.app.generateStatusReport()">Generate Report</button>
        <div id="export-result" style="margin-top:20px;"></div>
      </div>
    </div>
  `;
}

async function renderStateLookupTool() {
  const policies = (await store.getAll('telehealth_policies')).length > 0
    ? await store.getAll('telehealth_policies')
    : TELEHEALTH_POLICIES;
  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>State Licensing Lookup</h3>
        <input type="text" class="form-control" style="width:240px;" placeholder="Search state..." id="state-lookup-search"
          oninput="window.app.filterStateLookup()">
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead>
            <tr><th>State</th><th>Telehealth Parity</th><th>Prescribing</th><th>Compact</th><th>Board Link</th></tr>
          </thead>
          <tbody id="state-lookup-body">
            ${STATES.map(s => {
              const pol = policies.find(p => (p.state || p.stateCode) === s.code);
              return `<tr data-state-name="${s.name.toLowerCase()}" data-state-code="${s.code.toLowerCase()}">
                <td><strong>${s.name}</strong> (${s.code})</td>
                <td>${pol ? (pol.telehealthParity === 'full' ? '<span class="badge badge-active">Full Parity</span>' : pol.telehealthParity === 'partial' ? '<span class="badge badge-pending">Partial</span>' : '<span class="badge badge-inactive">None</span>') : '<span class="badge badge-inactive">Unknown</span>'}</td>
                <td>${pol?.prescribingAllowed !== false ? '<span style="color:var(--green);">&#10003;</span>' : '<span style="color:var(--red);">&#10007;</span>'}</td>
                <td>${pol?.compactState ? '<span class="badge badge-submitted">PSYPACT</span>' : '—'}</td>
                <td><button class="btn btn-sm" onclick="window.app.searchStateBoard('${s.code}', '${s.name}')">Lookup Board</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderDeadlineTimelineTool() {
  const apps = await store.getAll('applications');
  const licenses = await store.getAll('licenses');
  const tasks = (await store.getAll('tasks')).filter(t => !t.completed && t.dueDate);
  const now = new Date();
  const items = [];

  // Application follow-ups
  apps.forEach(a => {
    if (a.nextFollowup) {
      items.push({ date: a.nextFollowup, label: `Follow-up: ${a.payerName} — ${getStateName(a.state)}`, type: 'followup' });
    }
  });

  // License expirations
  licenses.forEach(l => {
    if (l.expirationDate) {
      items.push({ date: l.expirationDate, label: `License expires: ${l.licenseType} — ${getStateName(l.state)}`, type: 'expiration' });
    }
  });

  // Tasks
  tasks.forEach(t => {
    items.push({ date: t.dueDate, label: `Task: ${t.title}`, type: 'task' });
  });

  items.sort((a, b) => a.date.localeCompare(b.date));

  // Group by month
  const months = {};
  items.forEach(item => {
    const key = item.date.substring(0, 7);
    if (!months[key]) months[key] = [];
    months[key].push(item);
  });

  const typeColor = { followup: 'blue', expiration: 'red', task: 'amber' };
  const typeIcon = { followup: '&#9201;', expiration: '&#9888;', task: '&#9745;' };

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Total Deadlines</div><div class="value">${items.length}</div></div>
      <div class="stat-card"><div class="label">Follow-ups</div><div class="value blue">${items.filter(i => i.type === 'followup').length}</div></div>
      <div class="stat-card"><div class="label">Expirations</div><div class="value red">${items.filter(i => i.type === 'expiration').length}</div></div>
      <div class="stat-card"><div class="label">Tasks</div><div class="value amber">${items.filter(i => i.type === 'task').length}</div></div>
    </div>
    ${items.length === 0 ? '<div class="empty-state"><h3>No Deadlines</h3><p>No upcoming deadlines found.</p></div>' :
    Object.keys(months).sort().map(month => {
      const monthLabel = new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      return `
        <div class="card" style="margin-bottom:12px;">
          <div class="card-header"><h3>${monthLabel}</h3><span class="badge">${months[month].length}</span></div>
          <div class="card-body" style="padding:0;">
            <div class="activity-timeline" style="padding:12px 20px;">
              ${months[month].map(item => {
                const isPast = item.date < now.toISOString().split('T')[0];
                return `<div class="activity-entry" ${isPast ? 'style="opacity:0.5;"' : ''}>
                  <div class="activity-icon" style="background:var(--${typeColor[item.type]}-bg);color:var(--${typeColor[item.type]});">${typeIcon[item.type]}</div>
                  <div class="activity-content">
                    <div class="activity-header">
                      <strong style="font-size:13px;">${item.label}</strong>
                      <span style="font-size:12px;color:var(--text-muted);">${item.date}</span>
                    </div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>`;
    }).join('')}
  `;
}

async function renderLetterGeneratorTool() {

  const LETTER_TYPES = [
    { id: 'cover', label: 'Cover Letter — New Credentialing Application' },
    { id: 'followup', label: 'Follow-up Letter — Application Status Inquiry' },
    { id: 'attestation', label: 'Attestation Statement' },
    { id: 'resignation', label: 'Panel Resignation / Withdrawal Letter' },
    { id: 'address_change', label: 'Address / Practice Change Notification' },
    { id: 'recredentialing', label: 'Re-credentialing Cover Letter' },
    { id: 'appeal', label: 'Appeal Letter — Denial of Credentialing' },
    { id: 'introduction', label: 'Practice Introduction Letter' },
  ];

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Letter & Form Generator</h3></div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">
          Generate professional letters and forms pre-filled with your organization and provider details.
        </p>
        <div class="form-row" style="margin-bottom:16px;">
          <div class="form-group">
            <label>Letter Type</label>
            <select class="form-control" id="letter-type">
              ${LETTER_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Payer (recipient)</label>
            <select class="form-control" id="letter-payer">
              <option value="">Select payer...</option>
              ${PAYER_CATALOG.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row" style="margin-bottom:16px;">
          <div class="form-group">
            <label>State</label>
            <select class="form-control" id="letter-state">
              <option value="">Select state...</option>
              ${STATES.map(s => `<option value="${s.code}">${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Additional Notes</label>
            <input type="text" class="form-control" id="letter-notes" placeholder="Optional custom notes...">
          </div>
        </div>
        <button class="btn btn-primary" onclick="window.app.generateLetter()">Generate Letter</button>
        <div id="letter-result" style="margin-top:20px;"></div>
      </div>
    </div>
  `;
}

// ─── Taxonomy & NPI Search ───

function renderNPIResultCard(prov) {
  return `
    <div class="card">
      <div class="card-header">
        <h3>${escHtml(prov.prefix ? prov.prefix + ' ' : '')}${escHtml(prov.firstName)} ${escHtml(prov.middleName ? prov.middleName + ' ' : '')}${escHtml(prov.lastName)}${escHtml(prov.suffix ? ', ' + prov.suffix : '')}${escHtml(prov.credential ? ', ' + prov.credential : '')}</h3>
        <span class="badge badge-${prov.status === 'Active' ? 'active' : 'inactive'}">${escHtml(prov.status)}</span>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;">NPI</div>
            <div style="font-size:16px;font-weight:700;color:var(--brand-700);letter-spacing:0.5px;">${escHtml(prov.npi)}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;">Entity Type</div>
            <div style="font-size:14px;font-weight:600;">${prov.entityType === 'individual' ? 'Individual (NPI-1)' : 'Organization (NPI-2)'}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;">Gender</div>
            <div style="font-size:14px;">${escHtml(prov.gender === 'M' ? 'Male' : prov.gender === 'F' ? 'Female' : prov.gender || 'N/A')}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;">Enumeration Date</div>
            <div style="font-size:14px;">${escHtml(prov.enumerationDate || 'N/A')}</div>
          </div>
        </div>

        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-100);">
          <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Taxonomy Code(s)</div>
          ${prov.allTaxonomies.map(t => `
            <div style="display:flex;gap:10px;align-items:center;padding:8px 12px;background:var(--gray-50);border-radius:var(--radius);margin-bottom:4px;">
              <code style="font-weight:700;color:var(--brand-700);font-size:13px;">${escHtml(t.code)}</code>
              <span style="font-size:13px;">${escHtml(t.desc)}</span>
              ${t.primary ? '<span class="badge badge-active" style="font-size:10px;">Primary</span>' : ''}
              ${t.state ? '<span class="text-sm text-muted">' + escHtml(t.state) + '</span>' : ''}
              ${t.license ? '<span class="text-sm text-muted">Lic: ' + escHtml(t.license) + '</span>' : ''}
            </div>
          `).join('')}
        </div>

        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-100);">
          <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Practice Location</div>
          <div style="font-size:14px;">${escHtml(prov.address1)}${prov.address2 ? ', ' + escHtml(prov.address2) : ''}</div>
          <div style="font-size:14px;">${escHtml(prov.city)}, ${escHtml(prov.state)} ${escHtml(prov.zip)}</div>
          ${prov.phone ? `<div style="font-size:13px;color:var(--gray-600);margin-top:4px;">Phone: ${escHtml(prov.phone)}${prov.fax ? ' &middot; Fax: ' + escHtml(prov.fax) : ''}</div>` : ''}
        </div>
      </div>
    </div>`;
}

async function renderTaxonomySearch() {
  const body = document.getElementById('page-body');
  const stateOpts = STATES.map(s => `<option value="${s.code}">${s.name}</option>`).join('');

  body.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-body">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
          <div style="flex:2;min-width:200px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Search</label>
            <input type="text" class="form-control" id="tax-search-input" placeholder="NPI number, provider name, taxonomy code, or specialty keyword..." style="font-size:14px;" onkeydown="if(event.key==='Enter')window.app.runTaxonomySearch()">
          </div>
          <div style="min-width:160px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Search Type</label>
            <select class="form-control" id="tax-search-type">
              <option value="codes">Taxonomy Codes</option>
              <option value="npi">NPI Lookup</option>
              <option value="provider">Provider Name</option>
              <option value="specialty">By Specialty (NPPES)</option>
            </select>
          </div>
          <div style="min-width:140px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">State (optional)</label>
            <select class="form-control" id="tax-search-state">
              <option value="">All States</option>
              ${stateOpts}
            </select>
          </div>
          <button class="btn btn-primary" onclick="window.app.runTaxonomySearch()" style="height:40px;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>
            Search
          </button>
        </div>
      </div>
    </div>

    <div id="tax-search-results">
      <div class="alert alert-info" style="margin-bottom:20px;">
        <strong>Search the NPPES NPI Registry and NUCC Taxonomy Codes.</strong><br>
        Use <strong>Taxonomy Codes</strong> to browse behavioral health taxonomy codes locally. Use <strong>NPI Lookup</strong> to look up any provider by their 10-digit NPI. Use <strong>Provider Name</strong> or <strong>By Specialty</strong> to search the live CMS NPPES database.
      </div>

      <div class="card">
        <div class="card-header"><h3>Common Behavioral Health Taxonomy Codes</h3></div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap" style="box-shadow:none;border:none;">
            <table>
              <thead><tr><th>Code</th><th>Type</th><th>Specialty</th><th>Classification</th></tr></thead>
              <tbody>
                ${taxonomyApi.TAXONOMY_CODES.slice(0, 20).map(t => `
                  <tr style="cursor:pointer;" onclick="navigator.clipboard.writeText('${t.code}');document.getElementById('toast').textContent='Copied ${t.code}';document.getElementById('toast').classList.add('show');setTimeout(()=>document.getElementById('toast').classList.remove('show'),2000);">
                    <td><code style="font-weight:700;color:var(--brand-700);">${escHtml(t.code)}</code></td>
                    <td>${escHtml(t.type)}</td>
                    <td><strong>${escHtml(t.specialty)}</strong></td>
                    <td class="text-sm text-muted">${escHtml(t.classification)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── CAQH ProView Manager ───

async function renderCaqhManager() {
  const body = document.getElementById('page-body');
  const providers = await store.getAll('providers');
  const configured = caqhApi.isCaqhConfigured();
  const tracking = caqhApi.getCaqhTracking();

  // Build provider rows with local tracking data
  const providerRows = providers.map(p => {
    const t = tracking[p.caqhId] || tracking[p.id] || {};
    const statusColor = {
      'Initial Profile Complete': 'green', 'Re-Attestation': 'amber',
      'Active': 'green', 'Inactive': 'red',
    };
    const attDaysLeft = t.attestationExpires
      ? Math.ceil((new Date(t.attestationExpires) - new Date()) / 86400000)
      : null;
    const attSeverity = attDaysLeft === null ? '' : attDaysLeft <= 0 ? 'red' : attDaysLeft <= 30 ? 'amber' : attDaysLeft <= 90 ? 'blue' : 'green';

    return `<tr>
      <td>
        <strong>${escHtml(p.firstName)} ${escHtml(p.lastName)}</strong>
        <div style="font-size:11px;color:var(--text-muted);">${p.credentials || ''}</div>
      </td>
      <td style="font-family:monospace;font-size:12px;">${p.npi || '<span class="text-muted">—</span>'}</td>
      <td>
        ${p.caqhId
          ? `<span style="font-family:monospace;font-size:12px;">${p.caqhId}</span>`
          : `<button class="btn btn-sm" onclick="window.app.setCaqhId('${p.id}')">Set ID</button>`}
      </td>
      <td>
        ${t.profileStatus
          ? `<span class="badge badge-${statusColor[t.profileStatus] ? 'active' : 'pending'}">${t.profileStatus}</span>`
          : '<span class="text-muted text-sm">Not checked</span>'}
      </td>
      <td>
        ${t.rosterStatus
          ? `<span class="badge badge-${t.rosterStatus === 'Active' ? 'active' : 'pending'}">${t.rosterStatus}</span>`
          : '<span class="text-muted text-sm">—</span>'}
      </td>
      <td>
        ${t.attestationExpires
          ? `<div style="font-size:12px;${attSeverity === 'red' ? 'color:var(--red);font-weight:700;' : ''}">${t.attestationExpires}</div>
             <div style="font-size:10px;color:var(--${attSeverity});">${attDaysLeft <= 0 ? Math.abs(attDaysLeft) + 'd overdue' : attDaysLeft + 'd left'}</div>`
          : '<span class="text-muted text-sm">—</span>'}
      </td>
      <td style="font-size:11px;color:var(--text-muted);">
        ${t.lastChecked ? new Date(t.lastChecked).toLocaleDateString() : 'Never'}
      </td>
      <td>
        <div style="display:flex;gap:4px;">
          ${p.caqhId ? `
            <button class="btn btn-sm" onclick="window.app.checkCaqhStatus('${p.id}')" title="Check status">&#8635;</button>
            <button class="btn btn-sm" onclick="window.app.viewCaqhProfile('${p.id}')" title="View profile">&#128065;</button>
          ` : ''}
        </div>
      </td>
    </tr>`;
  });

  const attestationTabHtml = await renderCaqhAttestationTab(providers, tracking);
  const payerMapHtml = await renderCaqhPayerMap();

  body.innerHTML = `
    ${!configured ? `
      <div class="alert alert-warning">
        <strong>CAQH API not configured.</strong>
        Go to <a href="#" onclick="window.app.navigateTo('settings');return false;" style="font-weight:700;">Settings</a> &gt; CAQH tab to enter your organization ID and API credentials.
        You can still track CAQH data manually below.
      </div>
    ` : ''}

    <div class="tabs">
      <button class="tab active" onclick="window.app.caqhTab(this, 'caqh-roster')">Provider Roster</button>
      <button class="tab" onclick="window.app.caqhTab(this, 'caqh-attestation')">Attestation Tracker</button>
      <button class="tab" onclick="window.app.caqhTab(this, 'caqh-payer-map')">Payer → CAQH Map</button>
    </div>

    <!-- Provider Roster Tab -->
    <div id="caqh-roster">
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card">
          <div class="label">Total Providers</div>
          <div class="value">${providers.length}</div>
        </div>
        <div class="stat-card">
          <div class="label">CAQH ID Assigned</div>
          <div class="value blue">${providers.filter(p => p.caqhId).length}</div>
        </div>
        <div class="stat-card">
          <div class="label">Profile Complete</div>
          <div class="value green">${Object.values(tracking).filter(t => t.profileStatus === 'Initial Profile Complete' || t.profileStatus === 'Active').length}</div>
        </div>
        <div class="stat-card">
          <div class="label">Attestation Due</div>
          <div class="value amber">${Object.values(tracking).filter(t => {
            if (!t.attestationExpires) return false;
            return Math.ceil((new Date(t.attestationExpires) - new Date()) / 86400000) <= 30;
          }).length}</div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px;">
        ${configured ? `<button class="btn btn-primary" onclick="window.app.runBatchCaqhCheck()">&#8635; Check All Providers</button>` : ''}
        <button class="btn" onclick="window.app.manualCaqhEntry()">+ Manual Entry</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Provider</th><th>NPI</th><th>CAQH ID</th><th>Profile Status</th>
              <th>Roster</th><th>Attestation Exp</th><th>Last Check</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="caqh-roster-body">
            ${providerRows.join('')}
          </tbody>
        </table>
      </div>
      <div id="caqh-status-log" style="margin-top:16px;"></div>
    </div>

    <!-- Attestation Tracker Tab -->
    <div id="caqh-attestation" class="hidden">
      ${attestationTabHtml}
    </div>

    <!-- Payer → CAQH Map Tab -->
    <div id="caqh-payer-map" class="hidden">
      ${payerMapHtml}
    </div>
  `;
}

async function renderCaqhAttestationTab(providers, tracking) {
  const now = new Date();
  const entries = providers
    .filter(p => p.caqhId)
    .map(p => {
      const t = tracking[p.caqhId] || tracking[p.id] || {};
      return { ...p, ...t };
    })
    .sort((a, b) => {
      if (!a.attestationExpires) return 1;
      if (!b.attestationExpires) return -1;
      return a.attestationExpires.localeCompare(b.attestationExpires);
    });

  if (entries.length === 0) {
    return `<div class="empty-state"><h3>No CAQH Profiles Tracked</h3>
      <p>Assign CAQH IDs to providers in the Roster tab, then check their status.</p></div>`;
  }

  return `
    <div class="alert alert-info" style="margin-bottom:16px;">
      CAQH requires attestation every <strong>120 days</strong>. Providers with expired attestations
      will be deactivated and payers cannot pull their data for credentialing.
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Provider</th><th>CAQH ID</th><th>Last Attested</th><th>Expires</th><th>Days Left</th><th>Status</th></tr></thead>
        <tbody>
          ${entries.map(e => {
            const daysLeft = e.attestationExpires
              ? Math.ceil((new Date(e.attestationExpires) - now) / 86400000) : null;
            const severity = daysLeft === null ? 'inactive' :
              daysLeft <= 0 ? 'denied' : daysLeft <= 30 ? 'pending' : daysLeft <= 60 ? 'submitted' : 'active';
            return `<tr class="${daysLeft !== null && daysLeft <= 0 ? 'overdue' : ''}">
              <td><strong>${escHtml(e.firstName)} ${escHtml(e.lastName)}</strong></td>
              <td style="font-family:monospace;">${e.caqhId || '—'}</td>
              <td>${e.attestationDate || '—'}</td>
              <td>${e.attestationExpires || '—'}</td>
              <td style="font-weight:700;">${daysLeft !== null ? (daysLeft <= 0 ? daysLeft + 'd' : daysLeft + 'd') : '—'}</td>
              <td><span class="badge badge-${severity}">${
                daysLeft === null ? 'Unknown' :
                daysLeft <= 0 ? 'EXPIRED' :
                daysLeft <= 30 ? 'Due Soon' :
                daysLeft <= 60 ? 'Upcoming' : 'Current'
              }</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px;">
      <h4 style="font-size:14px;color:var(--gray-900);margin-bottom:8px;">Attestation Checklist</h4>
      <div style="font-size:13px;color:var(--text);line-height:1.8;">
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Review all practice locations are current</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Verify all state licenses are up to date</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Confirm malpractice insurance is current</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Update any new hospital affiliations</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Review disclosure questions (malpractice, sanctions, etc.)</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Electronically sign and submit attestation</label>
      </div>
    </div>
  `;
}

async function renderCaqhPayerMap() {
  const caqhPayers = PAYER_CATALOG.filter(p => p.notes && p.notes.toLowerCase().includes('caqh'));
  const nonCaqhPayers = PAYER_CATALOG.filter(p => !p.notes || !p.notes.toLowerCase().includes('caqh'));

  return `
    <div class="alert alert-info" style="margin-bottom:16px;">
      <strong>${caqhPayers.length} of ${PAYER_CATALOG.length} payers</strong> use CAQH ProView for credentialing.
      Keeping your CAQH profile current automatically satisfies credentialing data requirements for these payers.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card">
        <div class="card-header">
          <h3 style="color:var(--green);">&#10003; Uses CAQH ProView (${caqhPayers.length})</h3>
        </div>
        <div class="card-body" style="padding:0;max-height:400px;overflow-y:auto;">
          ${caqhPayers.map(p => `
            <div style="padding:8px 16px;border-bottom:1px solid var(--border);font-size:13px;">
              <strong>${p.name}</strong>
              <div style="font-size:11px;color:var(--text-muted);">${p.notes || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 style="color:var(--text-muted);">Direct Application Required (${nonCaqhPayers.length})</h3>
        </div>
        <div class="card-body" style="padding:0;max-height:400px;overflow-y:auto;">
          ${nonCaqhPayers.map(p => `
            <div style="padding:8px 16px;border-bottom:1px solid var(--border);font-size:13px;">
              <strong>${p.name}</strong>
              <div style="font-size:11px;color:var(--text-muted);">${p.notes || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// ─── Public API (exposed to window for onclick handlers) ───

window.app = {
  navigateTo,
  filters,
  showToast,
  closeConfirmModal,
  openTaskEditModal,
  closeTaskEditModal,
  saveTaskEdit,

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
      await store.create('tasks', {
        title,
        category: document.getElementById('task-page-category')?.value || 'other',
        priority: document.getElementById('task-page-priority')?.value || 'normal',
        dueDate: document.getElementById('task-page-due')?.value || '',
        linkedApplicationId: document.getElementById('task-page-link-app')?.value || '',
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
      await store.create('tasks', {
        title,
        category: document.getElementById('task-category')?.value || 'other',
        priority: document.getElementById('task-priority')?.value || 'normal',
        dueDate: document.getElementById('task-due')?.value || '',
        linkedApplicationId: document.getElementById('task-link-app')?.value || '',
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
    await renderAppTable();
  },
  async sortBy(field) {
    if (currentSort.field === field) {
      currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      currentSort.field = field;
      currentSort.dir = 'asc';
    }
    await renderApplications();
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
      resultDiv.innerHTML = `
        <div style="padding:14px;background:var(--success-50);border:1px solid var(--success-100);border-radius:var(--radius-lg);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div>
              <div style="font-weight:700;font-size:15px;color:var(--gray-900);">${escHtml(prov.prefix ? prov.prefix + ' ' : '')}${escHtml(prov.firstName)} ${escHtml(prov.middleName ? prov.middleName + ' ' : '')}${escHtml(prov.lastName)}${escHtml(prov.suffix ? ', ' + prov.suffix : '')}${escHtml(prov.credential ? ', ' + prov.credential : '')}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:3px;">NPI: ${escHtml(prov.npi)} &middot; Status: <strong>${escHtml(prov.status)}</strong> &middot; Enumerated: ${escHtml(prov.enumerationDate)}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:2px;">Taxonomy: <strong>${escHtml(prov.taxonomyCode)}</strong> &mdash; ${escHtml(prov.taxonomyDesc)}</div>
              <div style="font-size:12px;color:var(--gray-600);margin-top:2px;">${escHtml(prov.city)}, ${escHtml(prov.state)} ${escHtml(prov.zip)} &middot; ${escHtml(prov.phone)}</div>
              ${prov.allTaxonomies.length > 1 ? `<div style="font-size:11px;color:var(--gray-500);margin-top:4px;">+ ${prov.allTaxonomies.length - 1} additional taxonomy code(s)</div>` : ''}
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

  _fillProviderFromNPI() {
    const prov = window._npiLookupResult;
    if (!prov) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set('prov-first', prov.firstName);
    set('prov-last', prov.lastName);
    set('prov-creds', prov.credential);
    set('prov-npi', prov.npi);
    set('prov-specialty', prov.taxonomyDesc);
    set('prov-taxonomy', prov.taxonomyCode);
    set('prov-phone', prov.phone);
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
            <tr style="cursor:pointer;" onclick="navigator.clipboard.writeText('${t.code}');document.getElementById('toast').textContent='Copied ${t.code}';document.getElementById('toast').classList.add('show');setTimeout(()=>document.getElementById('toast').classList.remove('show'),2000);">
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
    workflow.completeFollowup(fuId, outcome, nextAction || '');
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
      preview.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
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
            <thead><tr><th>Wave</th><th>State</th><th>Payer</th><th>Est $/mo</th><th>Notes</th></tr></thead>
            <tbody>
              ${result.batch.map(a => `
                <tr>
                  <td><span class="wave-badge wave-${a.wave}">W${a.wave}</span></td>
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
      output.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
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
      output.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
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
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    ['settings-import', 'settings-org', 'settings-licenses', 'settings-caqh', 'settings-danger'].forEach(id => {
      const section = document.getElementById(id);
      if (section) section.classList.toggle('hidden', id !== tabId);
    });
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
  async openLicenseModal(id) { await openLicenseModal(id); },
  async editLicense(id) { await openLicenseModal(id); },
  async deleteLicense(id) {
    if (!await appConfirm('Delete this license?', { title: 'Delete License', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    await store.remove('licenses', id);
    await renderLicenses();
    showToast('License deleted');
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
    showToast(`Updated ${selected.length} applications to Wave ${wave}`);
    await renderAppTable();
  },
  async exportSelectedCSV() {
    const selected = Array.from(document.querySelectorAll('.app-checkbox:checked')).map(el => el.dataset.appId);
    const apps = [];
    for (const id of selected) { const a = await store.getOne('applications', id); if (a) apps.push(a); }
    const headers = ['State', 'Payer', 'Status', 'Wave', 'Submitted', 'Effective Date', 'Est Revenue', 'Notes'];
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
        report += `  Status: ${a.status} | Wave: ${a.wave || '—'} | Submitted: ${a.submittedDate || 'N/A'}\n\n`;
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
        ? 'Payer,State,Status,Wave,Submitted\n' + apps.map(a => `"${a.payerName}","${getStateName(a.state)}","${a.status}","${a.wave || ''}","${a.submittedDate || ''}"`).join('\n')
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
          <div><strong>Last Attested:</strong> ${t.attestationDate || '—'}</div>
          <div><strong>Attestation Expires:</strong> ${t.attestationExpires || '—'}</div>
          <div><strong>Last API Check:</strong> ${t.lastChecked ? new Date(t.lastChecked).toLocaleString() : 'Never'}</div>
          ${t.error ? `<div style="grid-column:span 2;" class="alert alert-danger">Last error: ${t.error}</div>` : ''}
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
    const form = document.getElementById('invite-user-form');
    if (form) { form.classList.remove('hidden'); form.scrollIntoView({ behavior: 'smooth' }); }
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
    if (!confirm('Revoke this onboarding token?')) return;
    try {
      await store._fetch(`${CONFIG.API_URL}/onboard/tokens/${id}`, { method: 'DELETE' });
      showToast('Token revoked');
      await renderOnboardingStub();
    } catch (e) { showToast('Error revoking token: ' + e.message); }
  },

  cancelInvite() {
    const form = document.getElementById('invite-user-form');
    if (form) form.classList.add('hidden');
    document.getElementById('invite-error')?.classList.add('hidden');
  },
  onInviteRoleChange() {
    const role = document.getElementById('invite-role')?.value;
    const orgSel = document.getElementById('invite-org');
    const provSel = document.getElementById('invite-provider');
    if (orgSel) orgSel.classList.toggle('hidden', role === 'agency');
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

    try {
      await store.inviteUser({
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        role,
        organization_id: organizationId ? parseInt(organizationId) : null,
        provider_id: providerId ? parseInt(providerId) : null,
      });
      showToast('User created successfully');
      await renderUsersStub();
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Failed to create user'; errEl.classList.remove('hidden'); }
    }
  },
  async editUserRole(userId, currentRole) {
    const roles = ['agency', 'organization', 'provider'].filter(r => r !== currentRole);
    const newRole = prompt(`Change role from "${currentRole}" to:\n\nOptions: ${roles.join(', ')}`);
    if (!newRole || !['agency', 'organization', 'provider'].includes(newRole)) return;

    try {
      const data = { role: newRole };
      if (newRole === 'organization') {
        const orgs = await store.getAll('organizations');
        const orgId = prompt('Enter organization ID:\n\n' + orgs.map(o => `${o.id}: ${o.name}`).join('\n'));
        if (!orgId) return;
        data.organization_id = parseInt(orgId);
      }
      if (newRole === 'provider') {
        const provs = await store.getAll('providers');
        const provId = prompt('Enter provider ID:\n\n' + provs.map(p => `${p.id}: ${(p.firstName || '') + ' ' + (p.lastName || '')}`).join('\n'));
        if (!provId) return;
        data.provider_id = parseInt(provId);
      }
      await store.updateUser(userId, data);
      showToast('Role updated');
      await renderUsersStub();
    } catch (e) {
      showToast('Error: ' + (e.message || 'Failed to update role'));
    }
  },
  async deactivateUser(userId, name) {
    if (!confirm(`Deactivate user "${name}"? They will no longer be able to log in.`)) return;
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
  openInvoiceModal() {
    document.getElementById('invoice-modal-title').textContent = 'Create Invoice';
    ['inv-client','inv-amount','inv-due','inv-desc'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('inv-status').value = 'draft';
    document.getElementById('inv-edit-id').value = '';
    document.getElementById('invoice-modal').classList.add('active');
  },
  async saveInvoice() {
    const client = document.getElementById('inv-client')?.value?.trim();
    const amount = parseFloat(document.getElementById('inv-amount')?.value);
    const due = document.getElementById('inv-due')?.value;
    if (!client) { showToast('Client name is required'); return; }
    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
    if (!due) { showToast('Due date is required'); return; }
    const data = {
      clientName: client,
      totalAmount: amount,
      dueDate: due,
      description: document.getElementById('inv-desc')?.value?.trim() || '',
      status: document.getElementById('inv-status')?.value || 'draft',
    };
    const editId = document.getElementById('inv-edit-id')?.value;
    try {
      if (editId) {
        await store.updateInvoice(editId, data);
        showToast('Invoice updated');
      } else {
        await store.createInvoice(data);
        showToast('Invoice created');
      }
      document.getElementById('invoice-modal').classList.remove('active');
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async viewInvoice(id) {
    try {
      const invoices = await store.getInvoices();
      const inv = (Array.isArray(invoices) ? invoices : []).find(x => x.id === id);
      if (!inv) { showToast('Invoice not found'); return; }
      document.getElementById('inv-edit-id').value = id;
      document.getElementById('invoice-modal-title').textContent = 'Edit Invoice #' + (inv.invoiceNumber || inv.invoice_number || inv.id);
      const set = (el, val) => { const e = document.getElementById(el); if (e) e.value = val || ''; };
      set('inv-client', inv.clientName || inv.client_name);
      set('inv-amount', inv.totalAmount || inv.total_amount || inv.amount);
      set('inv-due', inv.dueDate || inv.due_date);
      set('inv-desc', inv.description);
      set('inv-status', inv.status);
      document.getElementById('invoice-modal').classList.add('active');
    } catch (e) { showToast('Error: ' + e.message); }
  },
  async deleteInvoice(id) {
    if (!await appConfirm('Delete this invoice?', { title: 'Delete Invoice', okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try {
      await store.deleteInvoice(id);
      showToast('Invoice deleted');
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
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
      await renderBillingPage();
    } catch (e) { showToast('Error: ' + e.message); }
  },
  openServiceModal() {
    ['svc-name','svc-code','svc-rate','svc-desc'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('service-modal').classList.add('active');
  },
  async saveService() {
    const name = document.getElementById('svc-name')?.value?.trim();
    if (!name) { showToast('Service name is required'); return; }
    const data = {
      name,
      code: document.getElementById('svc-code')?.value?.trim() || '',
      defaultRate: parseFloat(document.getElementById('svc-rate')?.value) || 0,
      description: document.getElementById('svc-desc')?.value?.trim() || '',
    };
    try {
      await store.createService(data);
      showToast('Service created');
      document.getElementById('service-modal').classList.remove('active');
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
    ['edu-institution','edu-degree','edu-field','edu-start','edu-end'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('education-modal').classList.add('active');
  },
  async saveEducation(providerId) {
    const institution = document.getElementById('edu-institution')?.value?.trim();
    if (!institution) { showToast('Institution is required'); return; }
    try {
      await store.createProviderEducation(providerId, {
        institution,
        degree: document.getElementById('edu-degree')?.value || '',
        fieldOfStudy: document.getElementById('edu-field')?.value?.trim() || '',
        startDate: document.getElementById('edu-start')?.value || '',
        endDate: document.getElementById('edu-end')?.value || '',
      });
      showToast('Education record added');
      document.getElementById('education-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
    } catch (e) { showToast('Error: ' + e.message); }
  },
  openBoardModal(providerId) {
    ['board-name','board-specialty','board-cert-num','board-issue','board-exp'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('board-modal').classList.add('active');
  },
  async saveBoard(providerId) {
    const boardName = document.getElementById('board-name')?.value?.trim();
    if (!boardName) { showToast('Board name is required'); return; }
    try {
      await store.createProviderBoard(providerId, {
        boardName,
        specialty: document.getElementById('board-specialty')?.value?.trim() || '',
        certificateNumber: document.getElementById('board-cert-num')?.value?.trim() || '',
        issueDate: document.getElementById('board-issue')?.value || '',
        expirationDate: document.getElementById('board-exp')?.value || '',
      });
      showToast('Board certification added');
      document.getElementById('board-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
    } catch (e) { showToast('Error: ' + e.message); }
  },
  openMalpracticeModal(providerId) {
    ['mal-carrier','mal-policy','mal-coverage','mal-effective','mal-expiration'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('malpractice-modal').classList.add('active');
  },
  async saveMalpractice(providerId) {
    const carrier = document.getElementById('mal-carrier')?.value?.trim();
    if (!carrier) { showToast('Insurance carrier is required'); return; }
    try {
      await store.createProviderMalpractice(providerId, {
        carrier,
        policyNumber: document.getElementById('mal-policy')?.value?.trim() || '',
        coverageAmount: document.getElementById('mal-coverage')?.value?.trim() || '',
        effectiveDate: document.getElementById('mal-effective')?.value || '',
        expirationDate: document.getElementById('mal-expiration')?.value || '',
      });
      showToast('Malpractice policy added');
      document.getElementById('malpractice-modal').classList.remove('active');
      await renderProviderProfilePage(providerId);
    } catch (e) { showToast('Error: ' + e.message); }
  },
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
        <label>Wave</label>
        <select class="form-control" id="field-wave">
          <option value="1" ${existing?.wave === 1 ? 'selected' : ''}>Wave 1</option>
          <option value="2" ${existing?.wave === 2 ? 'selected' : ''}>Wave 2</option>
          <option value="3" ${existing?.wave === 3 ? 'selected' : ''}>Wave 3</option>
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

async function updateNotificationBell() {
  const alerts = getAlerts();
  const count = alerts.filter(a => a.type === 'red').length;
  const countEl = document.getElementById('notification-count');
  if (countEl) {
    countEl.textContent = count;
    countEl.style.display = count > 0 ? 'flex' : 'none';
  }
}

async function renderNotifications() {
  const alerts = getAlerts();
  const body = document.getElementById('notification-body');
  if (!body) return;

  if (alerts.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);">All clear — no alerts right now.</div>';
    return;
  }

  body.innerHTML = alerts.map(a => `
    <div class="notif-item" onclick="window.app.navigateTo('${a.page}');window.app.toggleNotifications();">
      <div class="notif-icon ${a.type}">${a.icon}</div>
      <div class="notif-text">
        <div class="title">${a.title}</div>
        <div class="desc">${a.desc}</div>
      </div>
    </div>
  `).join('');
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
  bar.innerHTML = `
    <span class="count">${ids.length} selected</span>
    <select class="form-control" id="bulk-status" style="width:auto;min-width:140px;">
      <option value="">Change Status...</option>
      ${APPLICATION_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}
    </select>
    <button class="btn btn-sm btn-primary" onclick="window.app.bulkUpdateStatus()">Apply</button>
    <select class="form-control" id="bulk-wave" style="width:auto;min-width:100px;">
      <option value="">Set Wave...</option>
      <option value="1">Wave 1</option>
      <option value="2">Wave 2</option>
      <option value="3">Wave 3</option>
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
      &nbsp;|&nbsp; <strong>Wave:</strong> ${app.wave || '-'}
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
  `;

  modal.classList.add('active');
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
  const apps = await store.getAll('applications');

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
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Overall Progress</div><div class="value" style="color:${overallPct === 100 ? 'var(--green)' : 'var(--teal)'};">${overallPct}%</div></div>
      <div class="stat-card"><div class="label">Applications</div><div class="value">${apps.length}</div></div>
      <div class="stat-card"><div class="label">Fully Complete</div><div class="value green">${fullyComplete}</div></div>
      <div class="stat-card"><div class="label">Need Documents</div><div class="value ${needDocs.length > 0 ? 'amber' : 'green'}">${needDocs.length}</div></div>
    </div>

    <div class="card">
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

    <div class="card" style="margin-top:16px;">
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
  const pPlans = await store.getAll('payer_plans') || [];
  pPlans.forEach(plan => {
    const payer = getPayerById(plan.payerId);
    if (!payer || !plan.state || !plan.reimbursementRate) return;
    if (!rateMatrix[payer.name]) rateMatrix[payer.name] = {};
    if (!rateMatrix[payer.name][plan.state]) {
      rateMatrix[payer.name][plan.state] = plan.reimbursementRate;
    }
  });

  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
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

    <div class="card">
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
  const licenses = await store.getAll('licenses');
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
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Expired</div><div class="value ${expired.length > 0 ? 'red' : ''}">${expired.length}</div></div>
      <div class="stat-card"><div class="label">Within 30 Days</div><div class="value ${expiring30.length > 0 ? 'red' : ''}">${expiring30.length}</div></div>
      <div class="stat-card"><div class="label">Within 60 Days</div><div class="value ${expiring60.length > 0 ? 'amber' : ''}">${expiring60.length}</div></div>
      <div class="stat-card"><div class="label">Within 90 Days</div><div class="value ${expiring90.length > 0 ? 'amber' : ''}">${expiring90.length}</div></div>
    </div>

    <div class="card">
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
    <div class="card" style="margin-top:16px;">
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
    <div class="card" style="margin-top:16px;">
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
    <div style="margin-top:32px;margin-bottom:16px;">
      <h2 style="font-size:20px;color:var(--gray-900);margin:0;">Credentialing Renewals</h2>
      <p style="font-size:13px;color:var(--text-muted);margin:4px 0 0;">3-year cycle from effective date. ${estimated.length > 0 ? `<span style="color:var(--warning-500);">${estimated.length} estimated</span> (based on submitted date + avg cred days), ` : ''}${confirmed.length} confirmed.</p>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="stat-card"><div class="label">Total</div><div class="value">${renewals.length}</div></div>
      <div class="stat-card"><div class="label">Overdue</div><div class="value ${overdue.length > 0 ? 'red' : ''}">${overdue.length}</div></div>
      <div class="stat-card"><div class="label">Within 90 Days</div><div class="value ${within90.length > 0 ? 'red' : ''}">${within90.length}</div></div>
      <div class="stat-card"><div class="label">Within 180 Days</div><div class="value ${within180.length > 0 ? 'amber' : ''}">${within180.length}</div></div>
      <div class="stat-card"><div class="label">Beyond 180 Days</div><div class="value">${upcoming.length}</div></div>
    </div>

    <div class="card">
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

    <div class="card" style="margin-top:16px;">
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
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Total Service Lines</div><div class="value">${totalLines}</div></div>
      <div class="stat-card"><div class="label">Active</div><div class="value green">${activeLines}</div></div>
      <div class="stat-card"><div class="label">Planned</div><div class="value blue">${planned.length}</div></div>
      <div class="stat-card"><div class="label">Combined Revenue/Patient</div><div class="value" style="font-size:16px;color:var(--brand-600);">$12,000 - $21,000/yr</div><div class="sub">if patient uses all lines</div></div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      ${SERVICE_LINES.map(s => `
        <button class="btn ${s.status === 'active' ? 'btn-primary' : ''}" onclick="document.getElementById('sl-${s.id}').scrollIntoView({behavior:'smooth'})" style="border-left:3px solid ${s.color};">
          ${s.icon} ${s.name}
          <span style="font-size:10px;margin-left:4px;opacity:0.7;">${s.status === 'active' ? 'ACTIVE' : 'PLANNED'}</span>
        </button>
      `).join('')}
    </div>

    ${SERVICE_LINES.map(s => `
    <div class="card" id="sl-${s.id}" style="margin-bottom:20px;border-left:4px solid ${s.color};">
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
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return (d.getMonth() + 1).toString().padStart(2, '0') + '/' +
    d.getDate().toString().padStart(2, '0') + '/' + d.getFullYear();
}

function sortArrow(field) {
  if (currentSort.field !== field) return '<span class="sort-arrow"></span>';
  return `<span class="sort-arrow">${currentSort.dir === 'asc' ? '\u25B2' : '\u25BC'}</span>`;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── Custom Confirm / Prompt (replaces native dialogs) ───

let _confirmResolve = null;

function appConfirm(message, { title = 'Confirm', okLabel = 'Confirm', okClass = 'btn-primary', cancelLabel = 'Cancel' } = {}) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    document.getElementById('confirm-modal-input').style.display = 'none';
    document.getElementById('confirm-modal-ok').textContent = okLabel;
    document.getElementById('confirm-modal-ok').className = 'btn ' + okClass;
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
      <label>Linked Application</label>
      <select id="edit-task-link-app" class="form-control">
        <option value="">None</option>
        ${apps.map(a => {
          const payer = getPayerById(a.payerId);
          return `<option value="${a.id}" ${(task.linkedApplicationId || task.linkedAppId) === a.id ? 'selected' : ''}>${payer?.name || 'Unknown'} — ${getStateName(a.state)} (${a.status})</option>`;
        }).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="edit-task-notes" class="form-control" rows="3" style="resize:vertical;">${escHtml(task.notes || '')}</textarea>
    </div>
  `;
  document.getElementById('task-edit-modal').classList.add('active');
}

function closeTaskEditModal() {
  document.getElementById('task-edit-modal').classList.remove('active');
}

async function saveTaskEdit() {
  const id = document.getElementById('edit-task-id').value;
  const title = document.getElementById('edit-task-title').value.trim();
  if (!title) { showToast('Title is required'); return; }
  await store.update('tasks', id, {
    title,
    category: document.getElementById('edit-task-category').value,
    priority: document.getElementById('edit-task-priority').value,
    dueDate: document.getElementById('edit-task-due').value || '',
    recurrence: document.getElementById('edit-task-recurrence').value || '',
    linkedApplicationId: document.getElementById('edit-task-link-app').value || '',
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
  return escHtml(str);
}



// ─── Stub Pages ───

async function renderOrganizationsStub() {
  const body = document.getElementById('page-body');
  let orgs = [];
  try { orgs = await store.getAll('organizations'); } catch {}

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat-card"><div class="label">Total Organizations</div><div class="value">${orgs.length}</div></div>
    </div>
    ${orgs.map(o => `
      <div class="card">
        <div class="card-header"><h3>${escHtml(o.name || 'Unnamed')}</h3></div>
        <div class="card-body">
          <div style="display:flex;gap:24px;flex-wrap:wrap;">
            <div><span class="text-sm text-muted">NPI:</span> <strong>${o.npi || '—'}</strong></div>
            <div><span class="text-sm text-muted">Phone:</span> ${o.phone || '—'}</div>
            <div><span class="text-sm text-muted">Email:</span> ${o.email || '—'}</div>
            <div><span class="text-sm text-muted">EIN:</span> ${o.taxId || o.ein || '—'}</div>
          </div>
        </div>
      </div>
    `).join('')}
    ${orgs.length === 0 ? '<div class="empty-state"><h3>No organizations yet</h3></div>' : ''}
  `;
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
      organization: { label: 'Organization', cls: 'submitted', icon: '&#127963;' },
      provider: { label: 'Provider', cls: 'pending', icon: '&#129658;' },
    };
    const r = map[role] || { label: role, cls: 'pending', icon: '' };
    return `<span class="badge badge-${r.cls}">${r.icon} ${r.label}</span>`;
  };

  const agencyUsers = users.filter(u => u.role === 'agency' || u.role === 'superadmin');
  const orgUsers = users.filter(u => u.role === 'organization');
  const providerUsers = users.filter(u => u.role === 'provider');

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Total Users</div><div class="value">${users.length}</div></div>
      <div class="stat-card"><div class="label">Agency</div><div class="value" style="color:var(--green);">${agencyUsers.length}</div></div>
      <div class="stat-card"><div class="label">Organization</div><div class="value" style="color:var(--brand-600);">${orgUsers.length}</div></div>
      <div class="stat-card"><div class="label">Provider</div><div class="value" style="color:var(--amber);">${providerUsers.length}</div></div>
    </div>

    <!-- Invite User Form (hidden by default) -->
    <div id="invite-user-form" class="card hidden" style="margin-bottom:16px;border-left:4px solid var(--brand-600);">
      <div class="card-header"><h3>Invite / Create User</h3></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <input type="text" id="invite-first-name" class="form-control" placeholder="First Name *">
          <input type="text" id="invite-last-name" class="form-control" placeholder="Last Name *">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <input type="email" id="invite-email" class="form-control" placeholder="Email Address *">
          <div style="display:flex;gap:4px;">
            <input type="text" id="invite-password" class="form-control" placeholder="Temporary Password *" style="flex:1;">
            <button type="button" class="btn btn-sm" onclick="window.app.generatePassword()" title="Generate strong password" style="white-space:nowrap;">Generate</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
          <select id="invite-role" class="form-control" onchange="window.app.onInviteRoleChange()">
            <option value="agency">Agency (Full Access)</option>
            <option value="organization">Organization</option>
            <option value="provider">Provider</option>
          </select>
          <select id="invite-org" class="form-control hidden">
            <option value="">Select Organization *</option>
            ${orgs.map(o => `<option value="${o.id}">${escHtml(o.name)}</option>`).join('')}
          </select>
          <select id="invite-provider" class="form-control hidden">
            <option value="">Select Provider *</option>
            ${providers.map(p => `<option value="${p.id}">${escHtml((p.firstName || '') + ' ' + (p.lastName || ''))}</option>`).join('')}
          </select>
        </div>
        <div id="invite-error" class="alert alert-danger hidden" style="margin-bottom:10px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" onclick="window.app.cancelInvite()">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.submitInvite()">Create User</button>
        </div>
      </div>
    </div>

    <div class="card">
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
                <td><strong>${name}</strong></td>
                <td>${escHtml(u.email || '')}</td>
                <td>${roleBadge(u.role)}</td>
                <td>${scope}</td>
                <td><span class="badge badge-${isActive ? 'approved' : 'denied'}">${isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  ${!isSelf && u.role !== 'superadmin' ? `
                    <div style="display:flex;gap:4px;">
                      <button class="btn btn-sm" onclick="window.app.editUserRole(${u.id}, '${u.role}')" title="Change role">&#9998;</button>
                      ${isActive
                        ? `<button class="btn btn-sm" onclick="window.app.deactivateUser(${u.id}, '${name}')" title="Deactivate" style="color:var(--red);">&#10005;</button>`
                        : `<button class="btn btn-sm" onclick="window.app.reactivateUser(${u.id})" title="Reactivate" style="color:var(--green);">&#10003;</button>`
                      }
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

// ─── Super Admin Panel ───

async function renderAdminPanel() {
  const body = document.getElementById('page-body');
  if (!auth.isSuperAdmin()) {
    body.innerHTML = '<div class="alert alert-danger">SuperAdmin access required.</div>';
    return;
  }

  let agencies = [];
  try { agencies = await store.getAdminAgencies(); } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">Failed to load agencies: ${e.message}</div>`;
    return;
  }

  const totalUsers = agencies.reduce((s, a) => s + (a.usersCount || 0), 0);
  const totalProviders = agencies.reduce((s, a) => s + (a.providersCount || 0), 0);
  const totalApps = agencies.reduce((s, a) => s + (a.applicationsCount || 0), 0);
  const activeAgencyId = store.activeAgencyId;

  body.innerHTML = `
    ${activeAgencyId ? `
      <div class="alert" style="background:var(--brand-50);border-left:4px solid var(--brand-600);margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
        <span>Viewing as: <strong>${agencies.find(a => a.id === activeAgencyId)?.name || 'Agency #' + activeAgencyId}</strong></span>
        <button class="btn btn-sm" onclick="window.app.clearAgencyOverride()">Exit Agency View</button>
      </div>
    ` : ''}

    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Agencies</div><div class="value">${agencies.length}</div></div>
      <div class="stat-card"><div class="label">Total Users</div><div class="value" style="color:var(--brand-600);">${totalUsers}</div></div>
      <div class="stat-card"><div class="label">Total Providers</div><div class="value" style="color:var(--green);">${totalProviders}</div></div>
      <div class="stat-card"><div class="label">Total Applications</div><div class="value" style="color:var(--amber);">${totalApps}</div></div>
    </div>

    <div class="card">
      <div class="card-header"><h3>All Agencies</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead>
            <tr>
              <th>Agency</th><th>Slug</th><th>Users</th><th>Orgs</th>
              <th>Providers</th><th>Applications</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${agencies.map(a => `
              <tr style="${activeAgencyId === a.id ? 'background:var(--brand-50);' : ''}">
                <td><strong>${escHtml(a.name)}</strong></td>
                <td><code>${escHtml(a.slug || '')}</code></td>
                <td>${a.usersCount || 0}</td>
                <td>${a.organizationsCount || 0}</td>
                <td>${a.providersCount || 0}</td>
                <td>${a.applicationsCount || 0}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn btn-sm btn-primary" onclick="window.app.switchToAgency(${a.id}, '${escHtml(a.name)}')" title="View as this agency">
                      ${activeAgencyId === a.id ? 'Viewing' : 'Switch'}
                    </button>
                    <button class="btn btn-sm" onclick="window.app.viewAgencyDetail(${a.id})" title="Agency details">Details</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderOnboardingStub() {
  const body = document.getElementById('page-body');
  if (!auth.isAdmin()) {
    body.innerHTML = '<div class="alert alert-danger">You do not have permission to manage onboarding.</div>';
    return;
  }
  let tokens = [];
  try { tokens = await store.getOnboardTokens(); } catch {}

  const baseUrl = location.origin + location.pathname;

  body.innerHTML = `
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header">
        <h3>Create Onboarding Invite</h3>
      </div>
      <div class="card-body">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
          <div class="auth-field" style="flex:1;min-width:200px;margin:0;">
            <label for="onboard-invite-email">Provider Email</label>
            <input type="email" id="onboard-invite-email" placeholder="provider@email.com" style="margin:0;">
          </div>
          <div class="auth-field" style="width:120px;margin:0;">
            <label for="onboard-invite-hours">Expires In</label>
            <select id="onboard-invite-hours" class="form-control" style="margin:0;">
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
              <option value="72" selected>72 hours</option>
              <option value="168">1 week</option>
              <option value="720">30 days</option>
            </select>
          </div>
          <button class="btn btn-gold" onclick="window.app.createOnboardToken()" style="height:38px;">Create & Copy Link</button>
        </div>
        <div id="onboard-invite-result" style="display:none;margin-top:12px;padding:12px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;">
          <div style="font-size:12px;color:#10b981;margin-bottom:4px;">Invite link created — copied to clipboard!</div>
          <code id="onboard-invite-link" style="font-size:12px;word-break:break-all;color:#f1f5f9;"></code>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3>Onboarding Tokens</h3>
      </div>
      <div class="card-body">
        ${tokens.length > 0 ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Provider Email</th><th>Invite Link</th><th>Status</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              ${tokens.map(t => {
                const isUsed = !!t.used_at;
                const isExpired = t.expires_at && new Date(t.expires_at) < new Date();
                const status = isUsed ? 'Used' : isExpired ? 'Expired' : 'Pending';
                const badgeClass = isUsed ? 'approved' : isExpired ? 'denied' : 'pending';
                const link = `${baseUrl}#onboard/${t.token}`;
                return `
                <tr>
                  <td>${escHtml(t.provider_email || '—')}</td>
                  <td style="max-width:200px;"><code style="font-size:11px;cursor:pointer;" onclick="navigator.clipboard.writeText('${link}');window.app.showToast('Link copied!')" title="Click to copy">${t.token ? t.token.substring(0, 12) + '...' : t.id}</code></td>
                  <td><span class="badge badge-${badgeClass}">${status}</span></td>
                  <td>${formatDateDisplay(t.expires_at)}</td>
                  <td>${!isUsed ? `<button class="btn btn-sm" style="color:#ef4444;" onclick="window.app.revokeOnboardToken(${t.id})">Revoke</button>` : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>
        ` : '<div class="text-sm text-muted" style="text-align:center;padding:2rem;">No onboarding tokens yet. Create one above to invite a provider.</div>'}
      </div>
    </div>
  `;
}

// ─── Exclusion Screening Page ───

async function renderExclusionsPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading exclusion data...</div></div>';

  let summary = { totalProviders: 0, screened: 0, clear: 0, excluded: 0, needsRecheck: 0, neverScreened: 0, errors: 0 };
  let exclusions = [];
  let providers = [];

  try { summary = await store.getExclusionSummary(); } catch (e) { console.error('Exclusion summary error:', e); }
  try { exclusions = await store.getExclusions(); } catch (e) { console.error('Exclusions error:', e); }
  try { providers = await store.getAll('providers'); } catch (e) { console.error('Providers error:', e); }

  // Build a map of provider id -> latest exclusion result
  const exclusionMap = {};
  (Array.isArray(exclusions) ? exclusions : []).forEach(ex => {
    const pid = ex.providerId || ex.provider_id;
    if (pid) exclusionMap[pid] = ex;
  });

  const statusBadge = (status) => {
    const colors = { clear: 'approved', excluded: 'denied', pending: 'pending', error: 'inactive', unknown: 'inactive' };
    return `<span class="badge badge-${colors[status] || 'inactive'}">${escHtml(status || 'Not Screened')}</span>`;
  };

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));">
      <div class="stat-card"><div class="label">Total Providers</div><div class="value">${summary.totalProviders || providers.length}</div></div>
      <div class="stat-card"><div class="label">Screened</div><div class="value" style="color:var(--brand-600);">${summary.screened || 0}</div></div>
      <div class="stat-card"><div class="label">Clear</div><div class="value" style="color:var(--green);">${summary.clear || 0}</div></div>
      <div class="stat-card"><div class="label">Excluded</div><div class="value" style="color:var(--red);">${summary.excluded || 0}</div></div>
      <div class="stat-card"><div class="label">Needs Recheck</div><div class="value" style="color:var(--amber);">${summary.needsRecheck || 0}</div></div>
      <div class="stat-card"><div class="label">Never Screened</div><div class="value" style="color:var(--gray-500);">${summary.neverScreened || 0}</div></div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Provider Screening Status</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="excl-search" placeholder="Search providers..." class="form-control" style="width:220px;height:34px;font-size:13px;" oninput="window.app.filterExclusions()">
          <select id="excl-status-filter" class="form-control" style="width:140px;height:34px;font-size:13px;" onchange="window.app.filterExclusions()">
            <option value="">All Statuses</option>
            <option value="clear">Clear</option>
            <option value="excluded">Excluded</option>
            <option value="pending">Pending</option>
            <option value="not_screened">Not Screened</option>
          </select>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>NPI</th>
                <th>Status</th>
                <th>Last Screened</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="excl-table-body">
              ${providers.map(p => {
                const ex = exclusionMap[p.id];
                const status = ex ? (ex.status || ex.result || 'pending') : 'not_screened';
                const lastScreened = ex ? (ex.screenedAt || ex.screened_at || ex.createdAt || ex.created_at || '') : '';
                const source = ex ? (ex.source || 'OIG/SAM') : '—';
                const name = `${escHtml(p.firstName || p.first_name || '')} ${escHtml(p.lastName || p.last_name || '')}`.trim();
                return `
                <tr class="excl-row" data-name="${name.toLowerCase()}" data-status="${status}">
                  <td><strong>${name}</strong>${p.specialty ? '<br><span class="text-sm text-muted">' + escHtml(p.specialty) + '</span>' : ''}</td>
                  <td><code>${escHtml(p.npi || '—')}</code></td>
                  <td>${statusBadge(status)}</td>
                  <td>${lastScreened ? formatDateDisplay(lastScreened) : '<span class="text-muted">Never</span>'}</td>
                  <td class="text-sm text-muted">${escHtml(source)}</td>
                  <td>
                    ${editButton('Screen', `window.app.screenSingleProvider(${p.id})`, 'btn-primary')}
                    ${status === 'excluded' ? '<button class="btn btn-sm btn-danger" onclick="window.app.viewExclusionDetail(' + p.id + ')" style="margin-left:4px;">Details</button>' : ''}
                  </td>
                </tr>`;
              }).join('')}
              ${providers.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-500);">No providers found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ─── Facilities Page ───

async function renderFacilitiesPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let facilities = [];
  try { facilities = await store.getFacilities(); } catch (e) { console.error('Facilities error:', e); }
  if (!Array.isArray(facilities)) facilities = [];

  body.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>All Facilities (${facilities.length})</h3>
        <input type="text" id="facility-search" placeholder="Search facilities..." class="form-control" style="width:240px;height:34px;font-size:13px;" oninput="window.app.filterFacilities()">
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>NPI</th><th>Type</th><th>City / State</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody id="facility-table-body">
              ${facilities.map(f => {
                const statusClass = (f.status === 'active' || f.isActive) ? 'approved' : 'inactive';
                const statusLabel = (f.status === 'active' || f.isActive) ? 'Active' : (f.status || 'Inactive');
                return `
                <tr class="facility-row" data-name="${escHtml((f.name || '').toLowerCase())}">
                  <td><strong>${escHtml(f.name || '—')}</strong></td>
                  <td><code>${escHtml(f.npi || '—')}</code></td>
                  <td>${escHtml(f.facilityType || f.type || '—')}</td>
                  <td>${escHtml(f.city || '')}${f.state ? ', ' + escHtml(f.state) : ''}</td>
                  <td>${escHtml(f.phone || '—')}</td>
                  <td><span class="badge badge-${statusClass}">${statusLabel}</span></td>
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

async function renderBillingPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let stats = { totalRevenue: 0, outstanding: 0, overdue: 0, drafts: 0 };
  let invoices = [];
  let services = [];

  try { stats = await store.getBillingStats(); } catch (e) { console.error('Billing stats error:', e); }
  try { invoices = await store.getInvoices(); } catch (e) { console.error('Invoices error:', e); }
  try { services = await store.getServices(); } catch (e) { console.error('Services error:', e); }
  if (!Array.isArray(invoices)) invoices = [];
  if (!Array.isArray(services)) services = [];

  const fmt = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const invoiceStatusBadge = (status) => {
    const map = { draft: 'inactive', sent: 'pending', partial: 'pending', paid: 'approved', overdue: 'denied', cancelled: 'inactive', void: 'inactive' };
    return `<span class="badge badge-${map[status] || 'inactive'}">${escHtml(status || 'draft')}</span>`;
  };

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
      <div class="stat-card"><div class="label">Total Revenue</div><div class="value" style="color:var(--green);">${fmt(stats.totalRevenue)}</div></div>
      <div class="stat-card"><div class="label">Outstanding</div><div class="value" style="color:var(--brand-600);">${fmt(stats.outstanding)}</div></div>
      <div class="stat-card"><div class="label">Overdue</div><div class="value" style="color:var(--red);">${fmt(stats.overdue)}</div></div>
      <div class="stat-card"><div class="label">Drafts</div><div class="value" style="color:var(--gray-500);">${stats.drafts || 0}</div></div>
    </div>

    <!-- Services Section -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header" style="cursor:pointer;" onclick="this.parentElement.querySelector('.card-body').classList.toggle('collapsed');">
        <h3>Services (${services.length})</h3>
        ${editButton('+ Add Service', 'window.app.openServiceModal()')}
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Service</th><th>Code</th><th>Rate</th><th>Description</th></tr></thead>
            <tbody>
              ${services.map(s => `
                <tr>
                  <td><strong>${escHtml(s.name || s.serviceName || '—')}</strong></td>
                  <td><code>${escHtml(s.code || s.serviceCode || '—')}</code></td>
                  <td>${fmt(s.rate || s.defaultRate)}</td>
                  <td class="text-sm text-muted">${escHtml(s.description || '—')}</td>
                </tr>`).join('')}
              ${services.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--gray-500);">No services defined yet.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Invoices Table -->
    <div class="card">
      <div class="card-header">
        <h3>Invoices (${invoices.length})</h3>
        <div style="display:flex;gap:8px;">
          <select id="invoice-status-filter" class="form-control" style="width:140px;height:34px;font-size:13px;" onchange="window.app.filterInvoices()">
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          <input type="text" id="invoice-search" placeholder="Search invoices..." class="form-control" style="width:200px;height:34px;font-size:13px;" oninput="window.app.filterInvoices()">
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Invoice #</th><th>Client</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due Date</th><th>Actions</th></tr>
            </thead>
            <tbody id="invoice-table-body">
              ${invoices.map(inv => {
                const invStatus = inv.status || 'draft';
                const client = inv.clientName || inv.client_name || inv.organizationName || '—';
                return `
                <tr class="invoice-row" data-status="${invStatus}" data-search="${(inv.invoiceNumber || '').toLowerCase()} ${client.toLowerCase()}">
                  <td><strong>${escHtml(inv.invoiceNumber || inv.invoice_number || '#' + inv.id)}</strong></td>
                  <td>${escHtml(client)}</td>
                  <td>${fmt(inv.totalAmount || inv.total_amount || inv.amount)}</td>
                  <td>${fmt(inv.paidAmount || inv.paid_amount || 0)}</td>
                  <td>${invoiceStatusBadge(invStatus)}</td>
                  <td>${inv.dueDate || inv.due_date ? formatDateDisplay(inv.dueDate || inv.due_date) : '—'}</td>
                  <td>
                    ${editButton('View', `window.app.viewInvoice(${inv.id})`)}
                    ${invStatus !== 'paid' ? editButton('Payment', `window.app.openPaymentModal(${inv.id})`, 'btn-primary') : ''}
                    ${invStatus === 'draft' ? deleteButton('Delete', `window.app.deleteInvoice(${inv.id})`) : ''}
                  </td>
                </tr>`;
              }).join('')}
              ${invoices.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-500);">No invoices yet.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Invoice Modal -->
    <div class="modal" id="invoice-modal">
      <div class="modal-content" style="max-width:600px;">
        <div class="modal-header">
          <h3 id="invoice-modal-title">Create Invoice</h3>
          <button class="modal-close" onclick="document.getElementById('invoice-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Client Name *</label><input type="text" id="inv-client" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Amount *</label><input type="number" id="inv-amount" class="form-control" step="0.01" min="0"></div>
            <div class="auth-field" style="margin:0;"><label>Due Date *</label><input type="date" id="inv-due" class="form-control"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Description</label><textarea id="inv-desc" class="form-control" rows="3" style="resize:vertical;"></textarea></div>
            <div class="auth-field" style="margin:0;"><label>Status</label>
              <select id="inv-status" class="form-control">
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
              </select>
            </div>
          </div>
          <input type="hidden" id="inv-edit-id" value="">
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('invoice-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveInvoice()">Save Invoice</button>
        </div>
      </div>
    </div>

    <!-- Payment Modal -->
    <div class="modal" id="payment-modal">
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-header">
          <h3>Record Payment</h3>
          <button class="modal-close" onclick="document.getElementById('payment-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-field" style="margin:0 0 12px;"><label>Payment Amount *</label><input type="number" id="pay-amount" class="form-control" step="0.01" min="0"></div>
          <div class="auth-field" style="margin:0 0 12px;"><label>Payment Date *</label><input type="date" id="pay-date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="auth-field" style="margin:0 0 12px;"><label>Payment Method</label>
            <select id="pay-method" class="form-control">
              <option value="check">Check</option>
              <option value="ach">ACH</option>
              <option value="wire">Wire Transfer</option>
              <option value="credit_card">Credit Card</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="auth-field" style="margin:0;"><label>Reference / Notes</label><input type="text" id="pay-ref" class="form-control" placeholder="Check #, transaction ID, etc."></div>
          <input type="hidden" id="pay-invoice-id" value="">
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('payment-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.savePayment()">Record Payment</button>
        </div>
      </div>
    </div>

    <!-- Service Modal -->
    <div class="modal" id="service-modal">
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-header">
          <h3>Add Service</h3>
          <button class="modal-close" onclick="document.getElementById('service-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-field" style="margin:0 0 12px;"><label>Service Name *</label><input type="text" id="svc-name" class="form-control"></div>
          <div class="auth-field" style="margin:0 0 12px;"><label>Code</label><input type="text" id="svc-code" class="form-control" placeholder="e.g. CPT code"></div>
          <div class="auth-field" style="margin:0 0 12px;"><label>Default Rate</label><input type="number" id="svc-rate" class="form-control" step="0.01" min="0"></div>
          <div class="auth-field" style="margin:0;"><label>Description</label><textarea id="svc-desc" class="form-control" rows="2"></textarea></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('service-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveService()">Save Service</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Bulk Import Page ───

async function renderImportPage() {
  const body = document.getElementById('page-body');

  let importHistory = [];
  try { importHistory = await store.getImports(); } catch (e) { console.error('Imports error:', e); }
  if (!Array.isArray(importHistory)) importHistory = [];

  body.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><h3>Import Data from CSV</h3></div>
      <div class="card-body">
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
          <div class="auth-field" style="margin:0;flex:1;min-width:180px;">
            <label>Import Type *</label>
            <select id="import-type" class="form-control">
              <option value="">Select type...</option>
              <option value="providers">Providers</option>
              <option value="organizations">Organizations</option>
              <option value="licenses">Licenses</option>
              <option value="facilities">Facilities</option>
            </select>
          </div>
          <div class="auth-field" style="margin:0;flex:2;min-width:250px;">
            <label>CSV File *</label>
            <input type="file" id="import-file" class="form-control" accept=".csv,.xlsx,.xls" onchange="window.app.previewImportFile()">
          </div>
        </div>

        <!-- Preview Area -->
        <div id="import-preview" style="display:none;margin-top:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="margin:0;" id="import-preview-title">Preview</h4>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-primary" onclick="window.app.executeImportAction()">Import Data</button>
              <button class="btn" onclick="document.getElementById('import-preview').style.display='none';">Cancel</button>
            </div>
          </div>

          <!-- Column Mapping -->
          <div id="import-mapping" style="margin-bottom:16px;"></div>

          <!-- Data Preview Table -->
          <div id="import-preview-table" class="table-wrap" style="max-height:400px;overflow-y:auto;"></div>
        </div>

        <!-- Import Result -->
        <div id="import-result" style="display:none;margin-top:20px;"></div>
      </div>
    </div>

    <!-- Import History -->
    <div class="card">
      <div class="card-header"><h3>Import History</h3></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>File</th><th>Records</th><th>Success</th><th>Errors</th><th>Status</th></tr></thead>
            <tbody>
              ${importHistory.map(h => {
                const st = h.status || 'completed';
                const badge = st === 'completed' ? 'approved' : st === 'failed' ? 'denied' : 'pending';
                return `
                <tr>
                  <td>${formatDateDisplay(h.createdAt || h.created_at || h.date)}</td>
                  <td>${escHtml(h.importType || h.import_type || h.type || '—')}</td>
                  <td class="text-sm">${escHtml(h.fileName || h.file_name || '—')}</td>
                  <td>${h.totalRecords || h.total_records || h.total || 0}</td>
                  <td style="color:var(--green);">${h.successCount || h.success_count || h.success || 0}</td>
                  <td style="color:var(--red);">${h.errorCount || h.error_count || h.errors || 0}</td>
                  <td><span class="badge badge-${badge}">${st}</span></td>
                </tr>`;
              }).join('')}
              ${importHistory.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-500);">No imports yet.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ─── Compliance Center Page ───

async function renderCompliancePage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Generating compliance report...</div></div>';

  let report = {};
  let licenses = [];
  let providers = [];
  let exclusionSummary = {};

  try { report = await store.getComplianceReport(); } catch (e) { console.error('Compliance report error:', e); }
  try { licenses = await store.getAll('licenses'); } catch (e) {}
  try { providers = await store.getAll('providers'); } catch (e) {}
  try { exclusionSummary = await store.getExclusionSummary(); } catch (e) {}

  const today = new Date();
  const in30 = new Date(Date.now() + 30 * 86400000);
  const in90 = new Date(Date.now() + 90 * 86400000);

  // Compute locally if API report is sparse
  const expiringLicenses30 = licenses.filter(l => {
    if (!l.expirationDate && !l.expiration_date) return false;
    const exp = new Date(l.expirationDate || l.expiration_date);
    return exp > today && exp <= in30;
  });
  const expiringLicenses90 = licenses.filter(l => {
    if (!l.expirationDate && !l.expiration_date) return false;
    const exp = new Date(l.expirationDate || l.expiration_date);
    return exp > today && exp <= in90;
  });
  const expiredLicenses = licenses.filter(l => {
    if (!l.expirationDate && !l.expiration_date) return false;
    return new Date(l.expirationDate || l.expiration_date) < today;
  });

  const expiringMalpractice = report.expiringMalpractice || [];
  const expiringBoards = report.expiringBoards || [];
  const neverScreened = report.neverScreened || [];

  const renderCollapsible = (id, title, count, badgeClass, content) => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header" style="cursor:pointer;" onclick="
        const b = document.getElementById('${id}-body');
        const a = document.getElementById('${id}-arrow');
        b.style.display = b.style.display === 'none' ? '' : 'none';
        a.style.transform = b.style.display === 'none' ? '' : 'rotate(90deg)';
      ">
        <div style="display:flex;align-items:center;gap:8px;">
          <svg id="${id}-arrow" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="transition:transform 0.2s;flex-shrink:0;"><path d="M4 2l5 4-5 4z"/></svg>
          <h3 style="margin:0;">${title}</h3>
          <span class="badge badge-${badgeClass}">${count}</span>
        </div>
      </div>
      <div class="card-body" id="${id}-body" style="display:none;padding:0;">
        ${content}
      </div>
    </div>`;

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
      <div class="stat-card"><div class="label">Expired Licenses</div><div class="value" style="color:var(--red);">${expiredLicenses.length}</div></div>
      <div class="stat-card"><div class="label">Expiring (30 days)</div><div class="value" style="color:var(--amber);">${expiringLicenses30.length}</div></div>
      <div class="stat-card"><div class="label">Expiring (90 days)</div><div class="value" style="color:var(--brand-600);">${expiringLicenses90.length}</div></div>
      <div class="stat-card"><div class="label">Exclusion Flags</div><div class="value" style="color:var(--red);">${exclusionSummary.excluded || 0}</div></div>
      <div class="stat-card"><div class="label">Never Screened</div><div class="value" style="color:var(--gray-500);">${exclusionSummary.neverScreened || neverScreened.length || 0}</div></div>
    </div>

    ${renderCollapsible('expired-lic', 'Expired Licenses', expiredLicenses.length, 'denied',
      expiredLicenses.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>License #</th><th>State</th><th>Expired On</th></tr></thead>
          <tbody>
            ${expiredLicenses.map(l => {
              const prov = providers.find(p => p.id === (l.providerId || l.provider_id));
              const provName = prov ? `${prov.firstName || prov.first_name || ''} ${prov.lastName || prov.last_name || ''}`.trim() : '—';
              return `<tr>
                <td>${escHtml(provName)}</td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>${escHtml(l.state || '—')}</td>
                <td style="color:var(--red);">${formatDateDisplay(l.expirationDate || l.expiration_date)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No expired licenses.</div>'
    )}

    ${renderCollapsible('expiring-30', 'Expiring Within 30 Days', expiringLicenses30.length, 'pending',
      expiringLicenses30.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>License #</th><th>State</th><th>Expires</th></tr></thead>
          <tbody>
            ${expiringLicenses30.map(l => {
              const prov = providers.find(p => p.id === (l.providerId || l.provider_id));
              const provName = prov ? `${prov.firstName || prov.first_name || ''} ${prov.lastName || prov.last_name || ''}`.trim() : '—';
              return `<tr>
                <td>${escHtml(provName)}</td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>${escHtml(l.state || '—')}</td>
                <td style="color:var(--amber);">${formatDateDisplay(l.expirationDate || l.expiration_date)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No licenses expiring within 30 days.</div>'
    )}

    ${renderCollapsible('expiring-90', 'Expiring Within 90 Days', expiringLicenses90.length, 'pending',
      expiringLicenses90.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>License #</th><th>State</th><th>Expires</th></tr></thead>
          <tbody>
            ${expiringLicenses90.map(l => {
              const prov = providers.find(p => p.id === (l.providerId || l.provider_id));
              const provName = prov ? `${prov.firstName || prov.first_name || ''} ${prov.lastName || prov.last_name || ''}`.trim() : '—';
              return `<tr>
                <td>${escHtml(provName)}</td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>${escHtml(l.state || '—')}</td>
                <td>${formatDateDisplay(l.expirationDate || l.expiration_date)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No licenses expiring within 90 days.</div>'
    )}

    ${renderCollapsible('malpractice', 'Expiring Malpractice Insurance', expiringMalpractice.length, 'pending',
      expiringMalpractice.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>Carrier</th><th>Policy #</th><th>Expires</th></tr></thead>
          <tbody>
            ${expiringMalpractice.map(m => `<tr>
              <td>${escHtml(m.providerName || '—')}</td>
              <td>${escHtml(m.carrier || m.insuranceCarrier || '—')}</td>
              <td><code>${escHtml(m.policyNumber || m.policy_number || '—')}</code></td>
              <td style="color:var(--amber);">${formatDateDisplay(m.expirationDate || m.expiration_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No expiring malpractice policies.</div>'
    )}

    ${renderCollapsible('boards', 'Expiring Board Certifications', expiringBoards.length, 'pending',
      expiringBoards.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>Board</th><th>Specialty</th><th>Expires</th></tr></thead>
          <tbody>
            ${expiringBoards.map(b => `<tr>
              <td>${escHtml(b.providerName || '—')}</td>
              <td>${escHtml(b.boardName || b.board_name || '—')}</td>
              <td>${escHtml(b.specialty || '—')}</td>
              <td style="color:var(--amber);">${formatDateDisplay(b.expirationDate || b.expiration_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No expiring board certifications.</div>'
    )}

    ${renderCollapsible('excl-flags', 'Exclusion Flags', exclusionSummary.excluded || 0, 'denied',
      `<div style="padding:1rem;">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px;">
          <div><span class="text-sm text-muted">Total Screened:</span> <strong>${exclusionSummary.screened || 0}</strong></div>
          <div><span class="text-sm text-muted">Clear:</span> <strong style="color:var(--green);">${exclusionSummary.clear || 0}</strong></div>
          <div><span class="text-sm text-muted">Excluded:</span> <strong style="color:var(--red);">${exclusionSummary.excluded || 0}</strong></div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="window.app.navigateTo('exclusions')">View Full Screening Report</button>
      </div>`
    )}

    ${renderCollapsible('never-screened', 'Never-Screened Providers', exclusionSummary.neverScreened || neverScreened.length || 0, 'inactive',
      neverScreened.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>NPI</th><th>Action</th></tr></thead>
          <tbody>
            ${neverScreened.map(p => `<tr>
              <td>${escHtml(p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || '—')}</td>
              <td><code>${escHtml(p.npi || '—')}</code></td>
              <td><button class="btn btn-sm btn-primary" onclick="window.app.screenSingleProvider(${p.id})">Screen Now</button></td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">All providers have been screened, or navigate to Exclusion Screening for details.</div>'
    )}
  `;
}

// ─── FAQ / Knowledge Base Page ───

async function renderFaqPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let faqs = [];
  try { faqs = await store.getFaqs(); } catch (e) { console.error('FAQs error:', e); }
  if (!Array.isArray(faqs)) faqs = [];

  const categories = ['all', 'general', 'credentialing', 'billing', 'compliance'];

  body.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      <input type="text" id="faq-search" placeholder="Search knowledge base..." class="form-control" style="flex:1;min-width:250px;height:40px;font-size:14px;" oninput="window.app.filterFaqs()">
      <div style="display:flex;gap:4px;" id="faq-category-tabs">
        ${categories.map(c => `
          <button class="btn btn-sm ${c === 'all' ? 'btn-primary' : ''}" data-cat="${c}" onclick="window.app.filterFaqCategory('${c}')" style="text-transform:capitalize;">${c}</button>
        `).join('')}
      </div>
    </div>

    <div id="faq-list">
      ${faqs.length > 0 ? faqs.map((faq, idx) => `
        <div class="card faq-item" data-category="${(faq.category || 'general').toLowerCase()}" data-search="${escHtml((faq.question || '').toLowerCase() + ' ' + (faq.answer || '').toLowerCase())}" style="margin-bottom:12px;">
          <div class="card-header" style="cursor:pointer;padding:16px 20px;" onclick="
            const b = document.getElementById('faq-body-${idx}');
            const a = document.getElementById('faq-arrow-${idx}');
            b.style.display = b.style.display === 'none' ? '' : 'none';
            a.style.transform = b.style.display === 'none' ? '' : 'rotate(90deg)';
          ">
            <div style="display:flex;align-items:center;gap:10px;flex:1;">
              <svg id="faq-arrow-${idx}" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="transition:transform 0.2s;flex-shrink:0;"><path d="M4 2l5 4-5 4z"/></svg>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:14px;color:var(--gray-900);">${escHtml(faq.question || 'Untitled')}</div>
              </div>
              <span class="badge badge-${faq.category === 'credentialing' ? 'pending' : faq.category === 'billing' ? 'approved' : faq.category === 'compliance' ? 'denied' : 'inactive'}" style="font-size:11px;">${escHtml(faq.category || 'general')}</span>
            </div>
            <div style="display:flex;gap:4px;margin-left:8px;">
              ${editButton('Edit', `window.app.editFaq(${faq.id})`, 'btn-sm')}
              ${deleteButton('Delete', `window.app.deleteFaqItem(${faq.id})`)}
            </div>
          </div>
          <div id="faq-body-${idx}" style="display:none;padding:0 20px 16px 42px;font-size:14px;color:var(--gray-600);line-height:1.7;">
            ${escHtml(faq.answer || 'No answer provided.')}
            <div style="margin-top:12px;display:flex;gap:12px;align-items:center;">
              <span class="text-sm text-muted">Was this helpful?</span>
              <button class="btn btn-sm" onclick="window.app.rateFaq(${faq.id}, 'yes')" style="font-size:12px;">Yes (${faq.helpfulYes || faq.helpful_yes || 0})</button>
              <button class="btn btn-sm" onclick="window.app.rateFaq(${faq.id}, 'no')" style="font-size:12px;">No (${faq.helpfulNo || faq.helpful_no || 0})</button>
            </div>
          </div>
        </div>
      `).join('') : '<div class="card"><div class="card-body" style="text-align:center;padding:3rem;color:var(--gray-500);">No FAQs yet. Add one to get started.</div></div>'}
    </div>

    <!-- FAQ Modal -->
    <div class="modal" id="faq-modal">
      <div class="modal-content" style="max-width:560px;">
        <div class="modal-header">
          <h3 id="faq-modal-title">Add FAQ</h3>
          <button class="modal-close" onclick="document.getElementById('faq-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-field" style="margin:0 0 12px;"><label>Question *</label><input type="text" id="faq-question" class="form-control"></div>
          <div class="auth-field" style="margin:0 0 12px;"><label>Answer *</label><textarea id="faq-answer" class="form-control" rows="5" style="resize:vertical;"></textarea></div>
          <div class="auth-field" style="margin:0;"><label>Category</label>
            <select id="faq-category" class="form-control">
              <option value="general">General</option>
              <option value="credentialing">Credentialing</option>
              <option value="billing">Billing</option>
              <option value="compliance">Compliance</option>
            </select>
          </div>
          <input type="hidden" id="faq-edit-id" value="">
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('faq-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveFaq()">Save FAQ</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Provider Profile Page (Enhanced with Tabs) ───

async function renderProviderProfilePage(providerId) {
  const body = document.getElementById('page-body');

  if (!providerId) {
    body.innerHTML = '<div class="alert alert-warning">No provider selected. Go to Providers and click a provider to view their profile.</div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading provider profile...</div></div>';

  let provider = {};
  let profile = {};
  let education = [];
  let boards = [];
  let malpractice = [];
  let providerLicenses = [];

  try { provider = await store.getOne('providers', providerId); } catch (e) { console.error('Provider error:', e); }
  try { profile = await store.getProviderProfile(providerId); } catch (e) { console.error('Profile error:', e); }
  try { education = await store.getProviderEducation(providerId); } catch (e) {}
  try { boards = await store.getProviderBoards(providerId); } catch (e) {}
  try { malpractice = await store.getProviderMalpractice(providerId); } catch (e) {}
  try {
    const allLic = await store.getAll('licenses');
    providerLicenses = allLic.filter(l => (l.providerId || l.provider_id) === providerId);
  } catch (e) {}

  if (!Array.isArray(education)) education = [];
  if (!Array.isArray(boards)) boards = [];
  if (!Array.isArray(malpractice)) malpractice = [];

  const provName = `${provider.firstName || provider.first_name || ''} ${provider.lastName || provider.last_name || ''}`.trim() || 'Unknown Provider';
  const credential = provider.credential || provider.credentials || '';
  const workHistory = profile.workHistory || profile.work_history || [];
  const cme = profile.cme || profile.continuingEducation || [];
  const references = profile.references || [];
  const documents = profile.documents || [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'education', label: 'Education' },
    { id: 'boards', label: 'Board Certs' },
    { id: 'malpractice', label: 'Malpractice' },
    { id: 'work-history', label: 'Work History' },
    { id: 'cme', label: 'CME' },
    { id: 'references', label: 'References' },
    { id: 'documents', label: 'Documents' },
  ];

  const pageSubtitle = document.getElementById('page-subtitle');
  if (pageSubtitle) pageSubtitle.textContent = provName + (credential ? ', ' + credential : '');

  body.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;border-bottom:1px solid var(--gray-200);padding-bottom:0;">
      ${tabs.map((t, i) => `
        <button class="btn btn-sm profile-tab ${i === 0 ? 'btn-primary' : ''}" data-tab="${t.id}" onclick="window.app.switchProfileTab('${t.id}')" style="border-radius:8px 8px 0 0;border-bottom:none;margin-bottom:-1px;${i === 0 ? 'border-bottom:2px solid var(--brand-600);' : ''}">${t.label}</button>
      `).join('')}
    </div>

    <!-- Overview Tab -->
    <div class="profile-tab-content" id="tab-overview">
      <div class="card">
        <div class="card-header"><h3>Provider Information</h3></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div><span class="text-sm text-muted">Full Name</span><div style="font-weight:600;margin-top:2px;">${escHtml(provName)}${credential ? ', ' + escHtml(credential) : ''}</div></div>
            <div><span class="text-sm text-muted">NPI</span><div style="font-weight:600;margin-top:2px;"><code>${escHtml(provider.npi || '—')}</code></div></div>
            <div><span class="text-sm text-muted">Specialty</span><div style="margin-top:2px;">${escHtml(provider.specialty || provider.taxonomyDesc || '—')}</div></div>
            <div><span class="text-sm text-muted">Taxonomy Code</span><div style="margin-top:2px;"><code>${escHtml(provider.taxonomyCode || provider.taxonomy_code || '—')}</code></div></div>
            <div><span class="text-sm text-muted">Phone</span><div style="margin-top:2px;">${escHtml(provider.phone || '—')}</div></div>
            <div><span class="text-sm text-muted">Email</span><div style="margin-top:2px;">${escHtml(provider.email || '—')}</div></div>
            <div><span class="text-sm text-muted">State</span><div style="margin-top:2px;">${escHtml(provider.state || '—')}</div></div>
            <div><span class="text-sm text-muted">Status</span><div style="margin-top:2px;"><span class="badge badge-${provider.status === 'active' ? 'approved' : 'inactive'}">${escHtml(provider.status || 'unknown')}</span></div></div>
            ${profile.ssn ? `<div><span class="text-sm text-muted">SSN (last 4)</span><div style="margin-top:2px;">***-**-${escHtml(String(profile.ssn).slice(-4))}</div></div>` : ''}
            ${profile.dob || profile.dateOfBirth ? `<div><span class="text-sm text-muted">Date of Birth</span><div style="margin-top:2px;">${formatDateDisplay(profile.dob || profile.dateOfBirth)}</div></div>` : ''}
          </div>
        </div>
      </div>

      <!-- Active Licenses -->
      <div class="card" style="margin-top:16px;">
        <div class="card-header"><h3>Licenses (${providerLicenses.length})</h3></div>
        <div class="card-body" style="padding:0;">
          ${providerLicenses.length > 0 ? `<table>
            <thead><tr><th>State</th><th>License #</th><th>Type</th><th>Status</th><th>Expires</th></tr></thead>
            <tbody>
              ${providerLicenses.map(l => `<tr>
                <td>${escHtml(l.state || '—')}</td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>${escHtml(l.licenseType || l.license_type || '—')}</td>
                <td><span class="badge badge-${l.status === 'active' ? 'approved' : l.status === 'pending' ? 'pending' : 'denied'}">${escHtml(l.status || '—')}</span></td>
                <td>${formatDateDisplay(l.expirationDate || l.expiration_date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No licenses on file.</div>'}
        </div>
      </div>
    </div>

    <!-- Education Tab -->
    <div class="profile-tab-content" id="tab-education" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Education History</h3>
          ${editButton('+ Add Education', `window.app.openEducationModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${education.length > 0 ? `<table>
            <thead><tr><th>Institution</th><th>Degree</th><th>Field</th><th>Start</th><th>End</th></tr></thead>
            <tbody>
              ${education.map(e => `<tr>
                <td><strong>${escHtml(e.institution || e.schoolName || '—')}</strong></td>
                <td>${escHtml(e.degree || e.degreeType || '—')}</td>
                <td>${escHtml(e.fieldOfStudy || e.field || e.specialty || '—')}</td>
                <td>${formatDateDisplay(e.startDate || e.start_date)}</td>
                <td>${formatDateDisplay(e.endDate || e.end_date || e.graduationDate)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No education records. Add medical school, residency, or fellowship records.</div>'}
        </div>
      </div>

      <!-- Education Modal -->
      <div class="modal" id="education-modal">
        <div class="modal-content" style="max-width:520px;">
          <div class="modal-header">
            <h3>Add Education</h3>
            <button class="modal-close" onclick="document.getElementById('education-modal').classList.remove('active')">&times;</button>
          </div>
          <div class="modal-body">
            <div class="auth-field" style="margin:0 0 12px;"><label>Institution *</label><input type="text" id="edu-institution" class="form-control" placeholder="e.g. Johns Hopkins University"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="auth-field" style="margin:0;"><label>Degree</label>
                <select id="edu-degree" class="form-control">
                  <option value="">Select...</option>
                  <option value="MD">MD</option>
                  <option value="DO">DO</option>
                  <option value="PhD">PhD</option>
                  <option value="MSN">MSN</option>
                  <option value="DNP">DNP</option>
                  <option value="PA">PA</option>
                  <option value="Residency">Residency</option>
                  <option value="Fellowship">Fellowship</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div class="auth-field" style="margin:0;"><label>Field / Specialty</label><input type="text" id="edu-field" class="form-control"></div>
              <div class="auth-field" style="margin:0;"><label>Start Date</label><input type="date" id="edu-start" class="form-control"></div>
              <div class="auth-field" style="margin:0;"><label>End Date</label><input type="date" id="edu-end" class="form-control"></div>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
            <button class="btn" onclick="document.getElementById('education-modal').classList.remove('active')">Cancel</button>
            <button class="btn btn-primary" onclick="window.app.saveEducation(${providerId})">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Board Certifications Tab -->
    <div class="profile-tab-content" id="tab-boards" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Board Certifications</h3>
          ${editButton('+ Add Certification', `window.app.openBoardModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${boards.length > 0 ? `<table>
            <thead><tr><th>Board</th><th>Specialty</th><th>Certificate #</th><th>Issued</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              ${boards.map(b => {
                const isExpired = b.expirationDate && new Date(b.expirationDate) < new Date();
                return `<tr>
                  <td><strong>${escHtml(b.boardName || b.board_name || '—')}</strong></td>
                  <td>${escHtml(b.specialty || '—')}</td>
                  <td><code>${escHtml(b.certificateNumber || b.certificate_number || '—')}</code></td>
                  <td>${formatDateDisplay(b.issueDate || b.issue_date)}</td>
                  <td style="${isExpired ? 'color:var(--red);' : ''}">${formatDateDisplay(b.expirationDate || b.expiration_date)}</td>
                  <td><span class="badge badge-${isExpired ? 'denied' : 'approved'}">${isExpired ? 'Expired' : 'Active'}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No board certifications on file.</div>'}
        </div>
      </div>

      <!-- Board Modal -->
      <div class="modal" id="board-modal">
        <div class="modal-content" style="max-width:520px;">
          <div class="modal-header">
            <h3>Add Board Certification</h3>
            <button class="modal-close" onclick="document.getElementById('board-modal').classList.remove('active')">&times;</button>
          </div>
          <div class="modal-body">
            <div class="auth-field" style="margin:0 0 12px;"><label>Board Name *</label><input type="text" id="board-name" class="form-control" placeholder="e.g. American Board of Psychiatry"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="auth-field" style="margin:0;"><label>Specialty</label><input type="text" id="board-specialty" class="form-control"></div>
              <div class="auth-field" style="margin:0;"><label>Certificate #</label><input type="text" id="board-cert-num" class="form-control"></div>
              <div class="auth-field" style="margin:0;"><label>Issue Date</label><input type="date" id="board-issue" class="form-control"></div>
              <div class="auth-field" style="margin:0;"><label>Expiration Date</label><input type="date" id="board-exp" class="form-control"></div>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
            <button class="btn" onclick="document.getElementById('board-modal').classList.remove('active')">Cancel</button>
            <button class="btn btn-primary" onclick="window.app.saveBoard(${providerId})">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Malpractice Tab -->
    <div class="profile-tab-content" id="tab-malpractice" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Malpractice Insurance</h3>
          ${editButton('+ Add Policy', `window.app.openMalpracticeModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${malpractice.length > 0 ? `<table>
            <thead><tr><th>Carrier</th><th>Policy #</th><th>Coverage</th><th>Effective</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              ${malpractice.map(m => {
                const isExpired = (m.expirationDate || m.expiration_date) && new Date(m.expirationDate || m.expiration_date) < new Date();
                return `<tr>
                  <td><strong>${escHtml(m.carrier || m.insuranceCarrier || m.insurance_carrier || '—')}</strong></td>
                  <td><code>${escHtml(m.policyNumber || m.policy_number || '—')}</code></td>
                  <td>${escHtml(m.coverageAmount || m.coverage_amount || m.coverage || '—')}</td>
                  <td>${formatDateDisplay(m.effectiveDate || m.effective_date)}</td>
                  <td style="${isExpired ? 'color:var(--red);' : ''}">${formatDateDisplay(m.expirationDate || m.expiration_date)}</td>
                  <td><span class="badge badge-${isExpired ? 'denied' : 'approved'}">${isExpired ? 'Expired' : 'Active'}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No malpractice insurance on file.</div>'}
        </div>
      </div>

      <!-- Malpractice Modal -->
      <div class="modal" id="malpractice-modal">
        <div class="modal-content" style="max-width:520px;">
          <div class="modal-header">
            <h3>Add Malpractice Insurance</h3>
            <button class="modal-close" onclick="document.getElementById('malpractice-modal').classList.remove('active')">&times;</button>
          </div>
          <div class="modal-body">
            <div class="auth-field" style="margin:0 0 12px;"><label>Insurance Carrier *</label><input type="text" id="mal-carrier" class="form-control"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="auth-field" style="margin:0;"><label>Policy Number</label><input type="text" id="mal-policy" class="form-control"></div>
              <div class="auth-field" style="margin:0;"><label>Coverage Amount</label><input type="text" id="mal-coverage" class="form-control" placeholder="e.g. $1M/$3M"></div>
              <div class="auth-field" style="margin:0;"><label>Effective Date</label><input type="date" id="mal-effective" class="form-control"></div>
              <div class="auth-field" style="margin:0;"><label>Expiration Date</label><input type="date" id="mal-expiration" class="form-control"></div>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
            <button class="btn" onclick="document.getElementById('malpractice-modal').classList.remove('active')">Cancel</button>
            <button class="btn btn-primary" onclick="window.app.saveMalpractice(${providerId})">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Work History Tab -->
    <div class="profile-tab-content" id="tab-work-history" style="display:none;">
      <div class="card">
        <div class="card-header"><h3>Work History</h3></div>
        <div class="card-body" style="padding:0;">
          ${Array.isArray(workHistory) && workHistory.length > 0 ? `<table>
            <thead><tr><th>Employer</th><th>Position</th><th>Start</th><th>End</th><th>Reason for Leaving</th></tr></thead>
            <tbody>
              ${workHistory.map(w => `<tr>
                <td><strong>${escHtml(w.employer || w.organization || '—')}</strong></td>
                <td>${escHtml(w.position || w.title || '—')}</td>
                <td>${formatDateDisplay(w.startDate || w.start_date)}</td>
                <td>${w.endDate || w.end_date ? formatDateDisplay(w.endDate || w.end_date) : '<span class="badge badge-approved">Current</span>'}</td>
                <td class="text-sm text-muted">${escHtml(w.reasonForLeaving || w.reason_for_leaving || '—')}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No work history on file.</div>'}
        </div>
      </div>
    </div>

    <!-- CME Tab -->
    <div class="profile-tab-content" id="tab-cme" style="display:none;">
      <div class="card">
        <div class="card-header"><h3>Continuing Medical Education (CME)</h3></div>
        <div class="card-body" style="padding:0;">
          ${Array.isArray(cme) && cme.length > 0 ? `<table>
            <thead><tr><th>Course / Activity</th><th>Provider</th><th>Credits</th><th>Date Completed</th></tr></thead>
            <tbody>
              ${cme.map(c => `<tr>
                <td><strong>${escHtml(c.title || c.courseName || c.course_name || '—')}</strong></td>
                <td>${escHtml(c.provider || c.accreditingBody || '—')}</td>
                <td>${c.credits || c.hours || '—'}</td>
                <td>${formatDateDisplay(c.completionDate || c.completion_date || c.date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No CME records on file.</div>'}
        </div>
      </div>
    </div>

    <!-- References Tab -->
    <div class="profile-tab-content" id="tab-references" style="display:none;">
      <div class="card">
        <div class="card-header"><h3>Professional References</h3></div>
        <div class="card-body" style="padding:0;">
          ${Array.isArray(references) && references.length > 0 ? `<table>
            <thead><tr><th>Name</th><th>Title / Position</th><th>Organization</th><th>Phone</th><th>Email</th><th>Relationship</th></tr></thead>
            <tbody>
              ${references.map(r => `<tr>
                <td><strong>${escHtml(r.name || ((r.firstName || '') + ' ' + (r.lastName || '')).trim() || '—')}</strong></td>
                <td>${escHtml(r.title || r.position || '—')}</td>
                <td>${escHtml(r.organization || '—')}</td>
                <td>${escHtml(r.phone || '—')}</td>
                <td>${escHtml(r.email || '—')}</td>
                <td class="text-sm text-muted">${escHtml(r.relationship || '—')}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No references on file.</div>'}
        </div>
      </div>
    </div>

    <!-- Documents Tab -->
    <div class="profile-tab-content" id="tab-documents" style="display:none;">
      <div class="card">
        <div class="card-header"><h3>Documents</h3></div>
        <div class="card-body" style="padding:0;">
          ${Array.isArray(documents) && documents.length > 0 ? `<table>
            <thead><tr><th>Document</th><th>Type</th><th>Uploaded</th><th>Status</th></tr></thead>
            <tbody>
              ${documents.map(d => `<tr>
                <td><strong>${escHtml(d.name || d.fileName || d.file_name || '—')}</strong></td>
                <td>${escHtml(d.type || d.documentType || d.document_type || '—')}</td>
                <td>${formatDateDisplay(d.uploadedAt || d.uploaded_at || d.createdAt || d.created_at)}</td>
                <td><span class="badge badge-${d.verified ? 'approved' : 'pending'}">${d.verified ? 'Verified' : 'Pending'}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No documents on file.</div>'}
        </div>
      </div>
    </div>
  `;
}
