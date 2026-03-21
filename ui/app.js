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
      pageActions.innerHTML = '<button class="btn btn-gold" onclick="window.app.openProviderModal()">+ Add Provider</button>' + printBtn;
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
        if (hp.get('session_id')) { _billingTab = 'subscription'; showToast('Subscription activated! Welcome aboard.'); window.location.hash = '#billing'; }
        if (hp.get('canceled')) { _billingTab = 'subscription'; showToast('Checkout canceled'); window.location.hash = '#billing'; }
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
      pageActions.innerHTML = editButton('+ Add FAQ', 'window.app.openFaqModal()') + printBtn;
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
    default:
      pageBody.innerHTML = '<div class="empty-state"><h3>Page not found</h3></div>';
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

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <!-- Organization & Provider Summary -->
    <div class="card" style="margin-bottom:20px;border-left:3px solid var(--brand-500);">
      <div class="card-body" style="display:flex;gap:32px;flex-wrap:wrap;align-items:center;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,var(--brand-500),var(--brand-600));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;flex-shrink:0;">${(org.name || 'E').charAt(0)}</div>
          <div>
            <div style="font-size:17px;font-weight:700;color:var(--gray-900);letter-spacing:-0.01em;"><a href="#" onclick="event.preventDefault();window._selectedOrgId=${org.id};window.app.navigateTo('org-detail')" style="color:inherit;text-decoration:none;border-bottom:1px dashed var(--gray-300);" onmouseover="this.style.color='var(--brand-600)'" onmouseout="this.style.color='inherit'">${escHtml(org.name) || 'Not Set'}</a> <span style="font-size:11px;font-weight:400;color:var(--gray-400);">#${toHexId(org.id)}</span></div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:1px;">Org ID: <strong style="font-family:monospace;">${toHexId(org.id)}</strong> &nbsp;&middot;&nbsp; NPI: ${org.npi || '—'} &nbsp;&middot;&nbsp; EIN: ${org.taxId || '—'}</div>
          </div>
        </div>
        ${providers.map(p => `
          <div style="border-left:1px solid var(--gray-200);padding-left:24px;display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--gray-100);display:flex;align-items:center;justify-content:center;color:var(--gray-600);font-weight:700;font-size:13px;flex-shrink:0;">${(p.firstName || '?').charAt(0)}${(p.lastName || '?').charAt(0)}</div>
            <div>
              <div style="font-size:15px;font-weight:600;color:var(--gray-800);"><a href="#" onclick="event.preventDefault();window.app.openProviderProfile('${p.id}')" style="color:inherit;text-decoration:none;border-bottom:1px dashed var(--gray-300);" onmouseover="this.style.color='var(--brand-600)'" onmouseout="this.style.color='inherit'">${escHtml(p.firstName)} ${escHtml(p.lastName)}, ${escHtml(p.credentials)}</a> <span style="font-size:11px;font-weight:400;color:var(--gray-400);">#${toHexId(p.id)}</span></div>
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

    <!-- Smart Recommendations -->
    ${(() => {
      const recs = [];
      // Expiring licenses
      const urgentLic = licenses.filter(l => {
        if (!l.expirationDate) return false;
        const d = new Date(l.expirationDate);
        return d > today && d <= new Date(Date.now() + 30 * 86400000);
      });
      if (urgentLic.length > 0) {
        recs.push({ icon: '&#9888;', color: 'var(--red)', title: `${urgentLic.length} license(s) expiring within 30 days`, desc: urgentLic.map(l => `${getStateName(l.state)} — expires ${formatDateDisplay(l.expirationDate)}`).join(', '), action: 'licenses', actionLabel: 'View Licenses' });
      }
      // Expired licenses
      if (expiredLic.length > 0) {
        recs.push({ icon: '&#10007;', color: 'var(--red)', title: `${expiredLic.length} expired license(s) need renewal`, desc: 'Expired licenses prevent billing and may trigger compliance violations.', action: 'licenses', actionLabel: 'Renew Now' });
      }
      // Overdue follow-ups
      if (overdue.length > 0) {
        recs.push({ icon: '&#128337;', color: 'var(--warning-500)', title: `${overdue.length} overdue follow-up(s)`, desc: 'Delayed follow-ups slow credentialing. Average delay compounds over time.', action: 'followups', actionLabel: 'View Follow-ups' });
      }
      // Escalations
      if (escalations.length > 0) {
        recs.push({ icon: '&#9650;', color: 'var(--warning-500)', title: `${escalations.length} application(s) need escalation`, desc: 'Applications stuck longer than expected. Consider contacting payer directly.', action: 'applications', actionLabel: 'View Applications' });
      }
      // Document gaps
      const incompleteApps = apps.filter(a => {
        if (['approved','denied','withdrawn'].includes(a.status)) return false;
        const docs = a.documentChecklist || {};
        return !CRED_DOCUMENTS.every(d => docs[d.id]?.completed);
      });
      if (incompleteApps.length > 0) {
        recs.push({ icon: '&#128196;', color: 'var(--brand-600)', title: `${incompleteApps.length} application(s) missing documents`, desc: 'Incomplete document checklists delay credentialing submissions.', action: 'applications', actionLabel: 'Complete Docs' });
      }
      // High-value expansion
      if (topExpansion.length > 0) {
        const topState = topExpansion[0];
        recs.push({ icon: '&#127919;', color: 'var(--green)', title: `Expansion opportunity: ${getStateName(topState.state)}`, desc: `Readiness score ${topState.readinessScore}/10 — ${topState.practiceAuthority} practice authority, ${topState.controlledSubstances === 'allowed' ? 'CS allowed' : 'CS limited'}.`, action: 'policies', actionLabel: 'View Policies' });
      }
      // Overdue tasks
      if (overdueTasks.length > 0) {
        recs.push({ icon: '&#9745;', color: 'var(--warning-500)', title: `${overdueTasks.length} overdue task(s)`, desc: 'Overdue tasks may indicate process bottlenecks.', action: 'tasks', actionLabel: 'View Tasks' });
      }
      // All good!
      if (recs.length === 0) {
        recs.push({ icon: '&#10003;', color: 'var(--green)', title: 'All clear!', desc: 'No urgent actions needed. All credentials and tasks are in good standing.', action: null, actionLabel: null });
      }

      return recs.length > 0 ? `
    <div class="card">
      <div class="card-header">
        <h3>Smart Recommendations</h3>
        <span class="text-sm text-muted">${recs.length} action${recs.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="card-body" style="padding:8px 16px;">
        ${recs.slice(0, 6).map(r => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
            <div style="width:28px;height:28px;border-radius:6px;background:${r.color}12;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;color:${r.color};">${r.icon}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;color:var(--gray-800);">${r.title}</div>
              <div style="font-size:11px;color:var(--gray-500);margin-top:1px;">${r.desc}</div>
            </div>
            ${r.action ? `<button class="btn btn-sm" onclick="window.app.navigateTo('${r.action}')" style="flex-shrink:0;font-size:11px;">${r.actionLabel}</button>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : '';
    })()}
  `;

  // ─── Render Charts (after DOM is ready) ───
  requestAnimationFrame(() => renderDashboardCharts(stats, apps, licenses));
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

  // Build filter options
  const states = [...new Set(apps.map(a => a.state).filter(Boolean))].sort();
  const payers = [...new Set(apps.map(a => {
    const p = getPayerById(a.payerId);
    return p ? p.name : (a.payerName || '');
  }).filter(Boolean))].sort();

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div></div>
      <button class="btn btn-gold" onclick="window.app.openAddModal()">+ Add Application</button>
    </div>
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
        ${groupOptions(filters.wave, true)}
      </select>
      <input type="text" class="form-control search-input" placeholder="Search..." value="${filters.search}" oninput="window.app.filters.search=this.value;window.app.renderAppTable()">
    </div>
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
      <div class="empty-state hidden" id="app-empty">
        <h3>No applications</h3>
        <p>Add applications manually or use the Batch Generator to create application sets from strategy profiles.</p>
        <button class="btn btn-gold" onclick="window.app.openAddModal()">+ Add Application</button>
      </div>
    </div>
  `;

  await renderAppTable(apps);
}

async function renderAppTable(prefetchedApps = null) {
  const apps = prefetchedApps || await store.getAll('applications');
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

// ─── Follow-ups Page ───

async function renderFollowups() {
  const body = document.getElementById('page-body');
  const overdue = store.filterByScope(await workflow.getOverdueFollowups());
  const upcoming = store.filterByScope(await workflow.getUpcomingFollowups());
  const allOpen = store.filterByScope((await store.getAll('followups')).filter(f => !f.completedDate));
  const completed = store.filterByScope((await store.getAll('followups')).filter(f => f.completedDate))
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

    <!-- Provider Revenue Attribution -->
    ${providers.length > 0 ? `
    <div class="card">
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
    <div class="card">
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
  const providers = store.filterByScope(await store.getAll('providers'));
  const licenses = store.filterByScope(await store.getAll('licenses'));
  const apps = store.filterByScope(await store.getAll('applications'));

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
            <h3><a href="#" onclick="event.preventDefault();window.app.openProviderProfile('${p.id}')" style="color:inherit;text-decoration:none;border-bottom:1px dashed var(--gray-300);" onmouseover="this.style.color='var(--brand-600)'" onmouseout="this.style.color='inherit'">${escHtml(p.firstName)} ${escHtml(p.lastName)}, ${escHtml(p.credentials)}</a> <span style="font-size:12px;font-weight:500;color:var(--gray-400);margin-left:8px;">#${toHexId(p.id)}</span></h3>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm" onclick="window.app.openProviderProfile('${p.id}')" title="View Profile">Profile</button>
              <button class="btn btn-sm" onclick="window.app.openProviderPrintout('${p.id}')" title="Print Credential Sheet" style="display:inline-flex;align-items:center;gap:4px;">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11H2.5A1 1 0 011.5 10V6.5A1 1 0 012.5 5.5h11a1 1 0 011 1V10a1 1 0 01-1 1H12"/><path d="M4 5.5V1.5h8v4"/><rect x="4" y="9" width="8" height="5.5" rx="0.5"/></svg> Credential Sheet
              </button>
              <button class="btn btn-sm" onclick="window.app.editProvider('${p.id}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="window.app.deleteProvider('${p.id}')">Delete</button>
            </div>
          </div>
          <div class="card-body">
            <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:16px;">
              <div><span class="text-sm text-muted">System ID:</span> <strong style="font-family:monospace;color:var(--brand-600);">${toHexId(p.id)}</strong></div>
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

  body.innerHTML = `
    <!-- Tab bar -->
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid var(--gray-200);padding-bottom:0;">
      <button class="btn btn-sm ${tab === 'licenses' ? 'btn-primary' : ''}" onclick="window.app.switchLicTab('licenses')" style="border-radius:8px 8px 0 0;border-bottom:none;">Licenses</button>
      <button class="btn btn-sm ${tab === 'monitoring' ? 'btn-primary' : ''}" onclick="window.app.switchLicTab('monitoring')" style="border-radius:8px 8px 0 0;border-bottom:none;">Monitoring</button>
      <button class="btn btn-sm ${tab === 'dea' ? 'btn-primary' : ''}" onclick="window.app.switchLicTab('dea')" style="border-radius:8px 8px 0 0;border-bottom:none;">DEA Registrations</button>
    </div>

    <!-- Licenses tab -->
    <div id="lic-tab-licenses" style="display:${tab === 'licenses' ? 'block' : 'none'};">
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
                    <td><strong>${getStateName(l.state)}</strong> (${l.state})</td>
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
      <!-- Summary cards -->
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
        <div class="stat-card"><div class="label">Total Licenses</div><div class="value">${lic.total || 0}</div></div>
        <div class="stat-card"><div class="label">Verified via NPPES</div><div class="value green">${ver.verified || 0}</div></div>
        <div class="stat-card"><div class="label">Mismatches Found</div><div class="value" style="color:var(--warning-500);">${ver.mismatch || 0}</div></div>
        <div class="stat-card"><div class="label">Never Verified</div><div class="value red">${ver.neverVerified || 0}</div></div>
      </div>

      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
        <div class="stat-card"><div class="label">Expired</div><div class="value red">${lic.expired || 0}</div></div>
        <div class="stat-card"><div class="label">Expiring ≤30 days</div><div class="value" style="color:var(--red);">${lic.expiring30 || lic.expiring_30 || 0}</div></div>
        <div class="stat-card"><div class="label">Expiring 31-60 days</div><div class="value" style="color:var(--warning-500);">${lic.expiring60 || lic.expiring_60 || 0}</div></div>
        <div class="stat-card"><div class="label">Expiring 61-90 days</div><div class="value" style="color:var(--blue);">${lic.expiring90 || lic.expiring_90 || 0}</div></div>
      </div>

      <!-- Bulk verify button -->
      <div class="card" style="margin-bottom:16px;">
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
      <div class="card">
        <div class="card-header"><h3>Expiring Licenses & DEA (Next 90 Days)</h3></div>
        <div class="card-body" style="padding:0;">
          ${renderExpiringTable(expiring)}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="color:var(--red);">Error loading monitoring data: ${escHtml(err.message)}</div></div>`;
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);flex:1;margin-right:16px;">
          <div class="stat-card"><div class="label">Total DEA</div><div class="value">${deas.length}</div></div>
          <div class="stat-card"><div class="label">Active</div><div class="value green">${deas.filter(d => d.status === 'active').length}</div></div>
          <div class="stat-card"><div class="label">Expired</div><div class="value red">${deas.filter(d => d.status === 'expired' || (d.expirationDate && new Date(d.expirationDate) < new Date())).length}</div></div>
        </div>
        <button class="btn btn-gold" onclick="window.app.openDeaModal()">+ Add DEA</button>
      </div>

      <div class="card">
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
  let agency = {};
  try { agency = await store.getAgency(); } catch (e) { /* ignore */ }
  const embedBase = CONFIG.API_URL.replace('/api', '');
  const agencySlug = agency.slug || 'your-slug';

  body.innerHTML = `
    <div class="tabs">
      <button class="tab active" onclick="window.app.settingsTab(this, 'settings-import')">Import / Export</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-org')">Organization</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-licenses')">Licenses (${licenses.length})</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-groups')">Groups</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-caqh')">CAQH API</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-integrations')">Integrations</button>
      <button class="tab" onclick="window.app.settingsTab(this, 'settings-security')">Security</button>
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

    <div id="settings-groups" class="hidden">
      <div class="card">
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
      <div class="card">
        <div class="card-header"><h3>Preview</h3></div>
        <div class="card-body">
          <div style="display:flex;gap:12px;flex-wrap:wrap;" id="groups-preview">
            ${APP_GROUPS.map(g => `<span style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:600;background:${g.color}20;color:${g.color};">${g.short || g.label}</span>`).join('')}
          </div>
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

    <div id="settings-integrations" class="hidden">
      <div class="card">
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

      <div class="card">
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

      <div class="card">
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
    </div>

    <div id="settings-security" class="hidden">
      <div class="card">
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

      <div class="card">
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

      <div class="card">
        <div class="card-header"><h3>Active Sessions</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted">You are currently logged in. Sign out to end your session.</p>
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
  const linkedLabel = _getLinkedLabel(task, appsMap);

  const isDone = task.isCompleted || task.completed;
  return `<tr class="${isOverdue ? 'overdue' : ''}" style="${isDone ? 'opacity:0.6;' : ''}">
    <td><input type="checkbox" ${isDone ? 'checked' : ''} onchange="window.app.toggleTaskPage('${task.id}')" style="cursor:pointer;accent-color:var(--brand-600);transform:scale(1.2);"></td>
    <td>
      <div style="font-weight:${isDone ? '400' : '600'};${isDone ? 'text-decoration:line-through;' : ''}cursor:${task.notes ? 'help' : 'default'};" ${task.notes ? `title="${escAttr(task.notes)}"` : ''}>${escHtml(task.title)}${task.recurrence ? ` <span style="font-size:10px;padding:1px 5px;background:var(--teal);color:white;border-radius:3px;">&#8635; ${task.recurrence}</span>` : ''}${task.notes ? ' <span style="font-size:10px;color:var(--text-muted);">&#x1f4dd;</span>' : ''}</div>
    </td>
    <td><span style="font-size:12px;">${cat.icon} ${cat.label}</span></td>
    <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${pri.color}15;color:${pri.color};font-weight:600;">${pri.label}</span></td>
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
              <td>${p.credentialingUrl && /^https?:\/\//i.test(p.credentialingUrl) ? `<a href="${escAttr(p.credentialingUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">Open Portal</a>` : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderExpirationAlertsTool() {
  const licenses = store.filterByScope(await store.getAll('licenses'));
  const apps = store.filterByScope(await store.getAll('applications'));
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
                  <tr style="cursor:pointer;" onclick="navigator.clipboard.writeText('${escAttr(t.code)}');document.getElementById('toast').textContent='Copied ${escAttr(t.code)}';document.getElementById('toast').classList.add('show');setTimeout(()=>document.getElementById('toast').classList.remove('show'),2000);">
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
              <td>${formatDateDisplay(e.attestationDate)}</td>
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
            <input type="text" id="global-search-input" placeholder="Search or type a command..." style="flex:1;border:none;outline:none;font-size:16px;background:none;color:var(--text-primary);" autocomplete="off" aria-label="Search or command">
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
      document.getElementById('global-search-input').addEventListener('input', async (e) => {
        const q = e.target.value.trim().toLowerCase();
        const resultsDiv = document.getElementById('global-search-results');
        if (q.length < 2) { resultsDiv.innerHTML = '<p style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px;">Type at least 2 characters to search...</p>'; return; }

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

            if (!results.length) {
              resultsDiv.innerHTML = '<p style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px;">No results found</p>';
              return;
            }

            resultsDiv.innerHTML = results.slice(0, 20).map(r => `
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
    // Show quick commands when empty
    const quickCmds = [
      { icon: '📊', label: 'Go to Dashboard', sub: 'Overview & analytics', action: "navigateTo('dashboard')" },
      { icon: '📋', label: 'Go to Applications', sub: 'Credentialing apps', action: "navigateTo('applications')" },
      { icon: '👤', label: 'Go to Providers', sub: 'Provider directory', action: "navigateTo('providers')" },
      { icon: '🪪', label: 'Go to Licenses', sub: 'License tracking', action: "navigateTo('licenses')" },
      { icon: '➕', label: 'Add Application', sub: 'New credentialing app', action: "window.app.quickAddApp()" },
      { icon: '✅', label: 'Add Task', sub: 'New task or reminder', action: "window.app.showQuickTask()" },
      { icon: '🔔', label: 'Notifications', sub: 'View notifications', action: "window.app.toggleNotifications()" },
      { icon: '⚙️', label: 'Settings', sub: 'Account & data', action: "navigateTo('settings')" },
    ];
    document.getElementById('global-search-results').innerHTML =
      `<div style="padding:4px 8px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-quaternary);">Quick Actions</div>` +
      quickCmds.map(c => `
        <div onclick="${c.action};document.getElementById('global-search-overlay').style.display='none';" style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;cursor:pointer;transition:background .1s;" onmouseenter="this.style.background='var(--table-row-hover)'" onmouseleave="this.style.background='none'">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--surface-card);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">${c.icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${c.label}</div>
            <div style="font-size:11px;color:var(--text-quaternary);">${c.sub}</div>
          </div>
        </div>
      `).join('');
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
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    ['settings-import', 'settings-org', 'settings-licenses', 'settings-groups', 'settings-caqh', 'settings-integrations', 'settings-security', 'settings-danger'].forEach(id => {
      const section = document.getElementById(id);
      if (section) section.classList.toggle('hidden', id !== tabId);
    });
    // Load 2FA status when security tab is opened
    if (tabId === 'settings-security') this.load2FAStatus();
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
    const password = prompt('Enter your password to disable 2FA:');
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
  async resetUserPassword(userId, userName) {
    if (!confirm(`Send a password reset email to ${userName}? They will receive a link to set a new password.`)) return;
    try {
      await store.resetUserPassword(userId);
      showToast('Password reset email sent to ' + userName);
    } catch (e) {
      showToast('Error: ' + (e.message || 'Failed to send reset email'));
    }
  },
  async changeUserEmail(userId, currentEmail) {
    const newEmail = prompt(`Change email for this user.\n\nCurrent: ${currentEmail}\n\nEnter new email address:`);
    if (!newEmail || !newEmail.trim()) return;
    if (newEmail.trim() === currentEmail) { showToast('Email is the same'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { showToast('Invalid email format'); return; }
    if (!confirm(`Change email from:\n${currentEmail}\n\nTo:\n${newEmail.trim()}\n\nThe user will need to use the new email to log in.`)) return;
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
    _billingTab = tabId;
    btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['billing-invoices', 'billing-estimates', 'billing-services', 'billing-subscription'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== 'billing-' + tabId);
    });
  },
  openInvoiceModal() {
    _invoiceLineItems = [{ description: '', qty: 1, rate: 0 }];
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
    _invoiceLineItems = [{ description: '', qty: 1, rate: 0 }];
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
    _invoiceLineItems.push({ description: '', qty: 1, rate: 0 });
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
  },
  removeLineItem(idx) {
    _invoiceLineItems.splice(idx, 1);
    if (_invoiceLineItems.length === 0) _invoiceLineItems.push({ description: '', qty: 1, rate: 0 });
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
  },
  updateLineItem(idx, field, value) {
    if (!_invoiceLineItems[idx]) return;
    if (field === 'qty') _invoiceLineItems[idx].qty = parseInt(value) || 1;
    else if (field === 'rate') _invoiceLineItems[idx].rate = parseFloat(value) || 0;
    else _invoiceLineItems[idx][field] = value;
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
    if (!dd || !_billingServices.length) return;
    const q = (val || '').toLowerCase();
    const matches = q.length > 0
      ? _billingServices.filter(s => (s.name || s.serviceName || '').toLowerCase().includes(q) || (s.code || s.serviceCode || '').toLowerCase().includes(q)).slice(0, 6)
      : _billingServices.slice(0, 6);
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
    const svc = _billingServices.find(s => s.id === serviceId);
    if (!svc || !_invoiceLineItems[idx]) return;
    _invoiceLineItems[idx].description = svc.name || svc.serviceName || '';
    _invoiceLineItems[idx].rate = svc.rate || svc.defaultRate || svc.defaultPrice || svc.default_price || 0;
    const editor = document.getElementById('line-items-editor');
    if (editor) editor.innerHTML = _renderLineItemsEditor();
  },

  addServiceLineItem(serviceId) {
    const svc = _billingServices.find(s => s.id === serviceId);
    if (!svc) return;
    _invoiceLineItems.push({ description: svc.name || svc.serviceName, qty: 1, rate: svc.rate || svc.defaultRate || svc.defaultPrice || svc.default_price || 0 });
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

    const validItems = _invoiceLineItems.filter(i => i.description && i.rate > 0);
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
      _invoiceLineItems = Array.isArray(items) && items.length > 0
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
    const svc = _billingServices.find(s => s.id === id);
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
    _contractLineItems = [{ description: '', qty: 1, rate: 0 }];
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
    if (!dd || !_billingServices.length) { if (!_billingServices.length) store.getServices().then(s => { _billingServices = s || []; }).catch(() => {}); return; }
    const q = (val || '').toLowerCase();
    const matches = q.length > 0 ? _billingServices.filter(s => (s.name||s.serviceName||'').toLowerCase().includes(q)||(s.code||s.serviceCode||'').toLowerCase().includes(q)).slice(0,6) : _billingServices.slice(0,6);
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
    const svc = _billingServices.find(s => s.id === serviceId);
    if (!svc || !_contractLineItems[idx]) return;
    _contractLineItems[idx].description = svc.name || svc.serviceName || '';
    _contractLineItems[idx].rate = svc.rate || svc.defaultRate || svc.defaultPrice || svc.default_price || 0;
    _contractLineItems[idx].svcId = svc.id;
    const editor = document.getElementById('contract-line-items-editor');
    if (editor) editor.innerHTML = _renderContractLineItems();
  },
  addContractLine() {
    _contractLineItems.push({ description: '', qty: 1, rate: 0 });
    const editor = document.getElementById('contract-line-items-editor');
    if (editor) editor.innerHTML = _renderContractLineItems();
  },
  removeContractLine(idx) {
    _contractLineItems.splice(idx, 1);
    if (!_contractLineItems.length) _contractLineItems.push({ description: '', qty: 1, rate: 0 });
    const editor = document.getElementById('contract-line-items-editor');
    if (editor) editor.innerHTML = _renderContractLineItems();
  },
  updateContractLine(idx, field, value) {
    if (!_contractLineItems[idx]) return;
    if (field === 'qty') _contractLineItems[idx].qty = parseInt(value) || 1;
    else if (field === 'rate') _contractLineItems[idx].rate = parseFloat(value) || 0;
    else _contractLineItems[idx][field] = value;
    const editor = document.getElementById('contract-line-items-editor');
    if (editor) editor.innerHTML = _renderContractLineItems();
  },
  async saveContract() {
    const title = document.getElementById('ctr-title')?.value?.trim();
    const effective = document.getElementById('ctr-effective')?.value;
    if (!title) { showToast('Contract title is required'); return; }
    if (!effective) { showToast('Effective date is required'); return; }
    const validItems = _contractLineItems.filter(i => i.description.trim());
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
      _invoiceLineItems = Array.isArray(items) && items.length > 0
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

  // ─── Work History ───
  openWorkHistoryModal(providerId) {
    ['wh-employer','wh-position','wh-department','wh-start','wh-end','wh-reason'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('work-history-modal').classList.add('active');
  },
  async saveWorkHistory(providerId) {
    const employer = document.getElementById('wh-employer')?.value?.trim();
    if (!employer) { showToast('Employer is required'); return; }
    try {
      await store.createProviderWorkHistory(providerId, {
        employer,
        position: document.getElementById('wh-position')?.value?.trim() || '',
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
    ['cme-title','cme-provider','cme-credits','cme-category','cme-date'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('cme-modal').classList.add('active');
  },
  async saveCme(providerId) {
    const title = document.getElementById('cme-title')?.value?.trim();
    if (!title) { showToast('Course title is required'); return; }
    try {
      await store.createProviderCme(providerId, {
        title,
        provider: document.getElementById('cme-provider')?.value?.trim() || '',
        credits: parseFloat(document.getElementById('cme-credits')?.value) || 0,
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

async function updateNotificationBell() {
  const alerts = await getAlerts();
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
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Organizations</div><div class="value">${orgs.length}</div></div>
      <div class="stat-card"><div class="label">Total Providers</div><div class="value" style="color:var(--brand-600);">${providers.length}</div></div>
      <div class="stat-card"><div class="label">Total Licenses</div><div class="value">${licenses.length}</div></div>
      <div class="stat-card"><div class="label">Total Applications</div><div class="value">${apps.length}</div></div>
    </div>
    ${orgs.map(o => {
      const orgProviders = providers.filter(p => (p.organizationId || p.orgId) == o.id);
      const orgLicenses = licenses.filter(l => orgProviders.some(p => p.id == (l.providerId || l.provider_id)));
      const orgApps = apps.filter(a => (a.organizationId || a.orgId) == o.id || orgProviders.some(p => p.id == (a.providerId || a.provider_id)));
      return `
        <div class="card" style="cursor:pointer;" onclick="window.app.viewOrg(${o.id})">
          <div class="card-header">
            <h3>${escHtml(o.name || 'Unnamed')} <span style="font-size:12px;font-weight:500;color:var(--gray-400);margin-left:8px;">#${toHexId(o.id)}</span></h3>
            <div style="display:flex;gap:8px;" onclick="event.stopPropagation();">
              <button class="btn btn-sm" onclick="window.app.editOrg(${o.id})">Edit</button>
            </div>
          </div>
          <div class="card-body">
            <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:12px;font-size:13px;color:var(--gray-600);">
              <div>Org ID: <strong style="font-family:monospace;color:var(--brand-600);">${toHexId(o.id)}</strong></div>
              <div>NPI: <strong>${o.npi || '—'}</strong></div>
              <div>Tax ID: <strong>${o.taxId || o.tax_id || '—'}</strong></div>
              <div>Phone: ${escHtml(o.phone) || '—'}</div>
              <div>Email: ${escHtml(o.email) || '—'}</div>
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
              <div class="stat-card" style="flex:1;min-width:100px;"><div class="label">Providers</div><div class="value">${orgProviders.length}</div></div>
              <div class="stat-card" style="flex:1;min-width:100px;"><div class="label">Licenses</div><div class="value" style="color:var(--brand-600);">${orgLicenses.length}</div></div>
              <div class="stat-card" style="flex:1;min-width:100px;"><div class="label">Applications</div><div class="value">${orgApps.length}</div></div>
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
    <!-- Org Header -->
    <div class="card" style="border-top:3px solid var(--brand-600);margin-bottom:20px;">
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
      <div class="stat-card"><div class="label">Providers</div><div class="value">${providers.length}</div></div>
      <div class="stat-card"><div class="label">Licenses</div><div class="value" style="color:var(--brand-600);">${orgLicenses.length}</div></div>
      <div class="stat-card"><div class="label">Licensed States</div><div class="value">${licensedStates.length}</div></div>
      <div class="stat-card"><div class="label">Applications</div><div class="value">${orgApps.length}</div></div>
      <div class="stat-card"><div class="label">Est. Monthly Rev</div><div class="value" style="color:var(--green);">$${estRevenue.toLocaleString()}</div></div>
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

// ─── Provider Self-Service Dashboard ───

async function renderProviderDashboard(user) {
  const body = document.getElementById('page-body');
  const providerId = user.provider_id || user.providerId;

  let provider = null, licenses = [], apps = [], documents = [], tasks = [], exclusions = [];
  try {
    if (providerId) {
      [provider, licenses, apps, documents, tasks, exclusions] = await Promise.all([
        store.getOne('providers', providerId).catch(() => null),
        store.getAll('licenses').then(l => l.filter(x => (x.providerId || x.provider_id) == providerId)).catch(() => []),
        store.getAll('applications').then(a => a.filter(x => (x.providerId || x.provider_id) == providerId)).catch(() => []),
        store.getProviderDocuments(providerId).catch(() => []),
        store.getAll('tasks').catch(() => []),
        store.getAll('exclusions').then(e => e.filter(x => (x.providerId || x.provider_id) == providerId)).catch(() => []),
      ]);
    }
  } catch (e) { console.error('Provider dashboard error:', e); }

  if (!Array.isArray(licenses)) licenses = [];
  if (!Array.isArray(apps)) apps = [];
  if (!Array.isArray(documents)) documents = [];
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(exclusions)) exclusions = [];

  const activeLicenses = licenses.filter(l => l.status === 'active');
  const today = new Date();
  const in30 = new Date(Date.now() + 30 * 86400000);
  const in90 = new Date(Date.now() + 90 * 86400000);
  const expiring30 = licenses.filter(l => { const exp = new Date(l.expirationDate || l.expiration_date); return exp > today && exp <= in30; });
  const expiring90 = licenses.filter(l => { const exp = new Date(l.expirationDate || l.expiration_date); return exp > today && exp <= in90; });
  const expiredLic = licenses.filter(l => { const exp = l.expirationDate || l.expiration_date; return exp && new Date(exp) < today; });
  const approvedApps = apps.filter(a => a.status === 'approved');
  const pendingApps = apps.filter(a => !['approved','denied','withdrawn'].includes(a.status));
  const verifiedDocs = documents.filter(d => d.status === 'verified' || d.status === 'received');
  const myTasks = tasks.filter(t => !t.completed && !t.isCompleted);
  const overdueTasks = myTasks.filter(t => t.dueDate && t.dueDate < today.toISOString().split('T')[0]);
  const provName = provider ? `${provider.firstName || provider.first_name || ''} ${provider.lastName || provider.last_name || ''}`.trim() : user.name || 'Provider';
  const credential = provider?.credentials || '';

  // Compliance score calculation
  let compScore = 100;
  const compIssues = [];
  if (expiredLic.length > 0) { compScore -= expiredLic.length * 20; compIssues.push({ sev: 'critical', text: `${expiredLic.length} expired license(s)` }); }
  if (exclusions.some(e => e.status === 'excluded' || e.result === 'excluded')) { compScore -= 30; compIssues.push({ sev: 'critical', text: 'Exclusion flag on record' }); }
  if (expiring30.length > 0) { compScore -= expiring30.length * 10; compIssues.push({ sev: 'warning', text: `${expiring30.length} license(s) expiring in 30 days` }); }
  if (expiring90.length > 0) { compScore -= expiring90.length * 5; compIssues.push({ sev: 'info', text: `${expiring90.length} license(s) expiring in 90 days` }); }
  if (licenses.length === 0) { compScore -= 15; compIssues.push({ sev: 'warning', text: 'No licenses on file' }); }
  const incompleteAppDocs = apps.filter(a => { const docs = a.documentChecklist || {}; return !CRED_DOCUMENTS.every(d => docs[d.id]?.completed); });
  if (incompleteAppDocs.length > 0) { compScore -= incompleteAppDocs.length * 3; compIssues.push({ sev: 'info', text: `${incompleteAppDocs.length} app(s) with incomplete documents` }); }
  compScore = Math.max(0, Math.min(100, compScore));
  const sColor = compScore >= 85 ? 'var(--green)' : compScore >= 60 ? 'var(--warning-500)' : 'var(--red)';
  const sLabel = compScore >= 85 ? 'Healthy' : compScore >= 60 ? 'At Risk' : 'Critical';

  // Credential tracker — progress through credentialing lifecycle
  const totalDocSlots = apps.length * CRED_DOCUMENTS.length;
  const completedDocSlots = apps.reduce((sum, a) => { const docs = a.documentChecklist || {}; return sum + CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length; }, 0);
  const docPct = totalDocSlots > 0 ? Math.round((completedDocSlots / totalDocSlots) * 100) : 0;

  // Action items — prioritized list
  const actions = [];
  expiredLic.forEach(l => actions.push({ priority: 1, icon: '&#10007;', color: 'var(--red)', text: `Renew expired ${l.state} license (expired ${formatDateDisplay(l.expirationDate || l.expiration_date)})` }));
  expiring30.forEach(l => { const d = Math.ceil((new Date(l.expirationDate || l.expiration_date) - today) / 86400000); actions.push({ priority: 2, icon: '&#9888;', color: 'var(--red)', text: `${l.state} license expires in ${d} days` }); });
  overdueTasks.forEach(t => actions.push({ priority: 3, icon: '&#128337;', color: 'var(--warning-500)', text: `Overdue task: ${t.title || t.description}` }));
  incompleteAppDocs.forEach(a => { const docs = a.documentChecklist || {}; const done = CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length; const pct = Math.round(done / CRED_DOCUMENTS.length * 100); actions.push({ priority: 4, icon: '&#128196;', color: 'var(--brand-600)', text: `${a.payerName || 'Application'} — ${pct}% documents complete` }); });
  expiring90.filter(l => !expiring30.includes(l)).forEach(l => { const d = Math.ceil((new Date(l.expirationDate || l.expiration_date) - today) / 86400000); actions.push({ priority: 5, icon: '&#128197;', color: 'var(--brand-500)', text: `${l.state} license expires in ${d} days` }); });
  actions.sort((a, b) => a.priority - b.priority);

  body.innerHTML = `
    <!-- Welcome Header with Compliance Score -->
    <div style="display:grid;grid-template-columns:1fr 180px;gap:20px;margin-bottom:20px;align-items:center;">
      <div>
        <h2 style="margin:0;">${escHtml(provName)}${credential ? ', ' + escHtml(credential) : ''}</h2>
        <p style="color:var(--gray-500);margin:4px 0 0;">NPI: ${provider?.npi || '—'} &middot; ${escHtml(provider?.specialty || '—')}</p>
      </div>
      <div style="text-align:center;">
        <div style="position:relative;width:100px;height:100px;margin:0 auto;">
          <svg viewBox="0 0 120 120" style="transform:rotate(-90deg);">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--gray-200)" stroke-width="8"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="${sColor}" stroke-width="8"
              stroke-dasharray="${Math.round(compScore * 3.267)} 326.7" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div style="font-size:28px;font-weight:800;color:${sColor};line-height:1;">${compScore}</div>
          </div>
        </div>
        <div style="font-size:12px;font-weight:600;color:${sColor};margin-top:4px;">${sLabel}</div>
        <div style="font-size:10px;color:var(--gray-400);">Compliance Score</div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:16px;">
      <div class="stat-card"><div class="label">Active Licenses</div><div class="value" style="color:var(--green);">${activeLicenses.length}</div></div>
      <div class="stat-card"><div class="label">Pending Apps</div><div class="value" style="color:var(--brand-600);">${pendingApps.length}</div></div>
      <div class="stat-card"><div class="label">Credentialed</div><div class="value" style="color:var(--green);">${approvedApps.length}</div></div>
      <div class="stat-card"><div class="label">Expiring</div><div class="value" style="color:${expiring90.length > 0 ? 'var(--red)' : 'var(--gray-400)'};">${expiring90.length}</div></div>
      <div class="stat-card"><div class="label">Documents</div><div class="value">${verifiedDocs.length}/${documents.length}</div></div>
      <div class="stat-card"><div class="label">Open Tasks</div><div class="value" style="color:${overdueTasks.length > 0 ? 'var(--red)' : ''}">${myTasks.length}</div></div>
    </div>

    <!-- Action Items -->
    ${actions.length > 0 ? `
    <div class="card" style="margin-bottom:16px;border-left:3px solid ${actions[0].color};">
      <div class="card-header"><h3>Action Items (${actions.length})</h3></div>
      <div class="card-body" style="padding:8px 16px;">
        ${actions.slice(0, 8).map(a => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-100);">
            <div style="width:24px;height:24px;border-radius:6px;background:${a.color}12;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;color:${a.color};">${a.icon}</div>
            <div style="font-size:13px;color:var(--gray-700);flex:1;">${a.text}</div>
          </div>
        `).join('')}
      </div>
    </div>` : `
    <div class="card" style="margin-bottom:16px;border-left:3px solid var(--green);">
      <div class="card-body" style="padding:16px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;color:var(--green);">&#10003;</span>
        <div><strong style="color:var(--green);">All clear!</strong><div class="text-sm text-muted">No urgent action items. Your credentialing is in good standing.</div></div>
      </div>
    </div>`}

    <!-- Credential Progress Tracker -->
    ${apps.length > 0 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><h3>Credentialing Progress</h3></div>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="flex:1;height:10px;background:var(--gray-200);border-radius:5px;overflow:hidden;">
            <div style="width:${docPct}%;height:100%;background:${docPct === 100 ? 'var(--green)' : 'var(--brand-500)'};border-radius:5px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:14px;font-weight:700;color:${docPct === 100 ? 'var(--green)' : 'var(--brand-600)'};">${docPct}%</span>
        </div>
        ${apps.map(a => {
          const docs = a.documentChecklist || {};
          const done = CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length;
          const aPct = Math.round(done / CRED_DOCUMENTS.length * 100);
          const statusSteps = ['gathering_docs','submitted','in_review','approved','credentialed'];
          const currentStep = statusSteps.indexOf(a.status);
          return `<div style="padding:10px 0;border-bottom:1px solid var(--gray-100);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div><strong style="font-size:13px;">${escHtml(a.payerName || 'Application')}</strong> <span class="text-sm text-muted">${escHtml(a.state || '')}</span></div>
              <span class="badge badge-${a.status === 'approved' || a.status === 'credentialed' ? 'approved' : a.status === 'denied' ? 'denied' : 'pending'}">${a.status?.replace(/_/g, ' ')}</span>
            </div>
            <div style="display:flex;gap:2px;margin-bottom:6px;">
              ${statusSteps.map((s, i) => `<div style="flex:1;height:4px;border-radius:2px;background:${i <= currentStep ? (a.status === 'denied' ? 'var(--red)' : 'var(--green)') : 'var(--gray-200)'};"></div>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-400);">
              <span>Docs: ${done}/${CRED_DOCUMENTS.length} (${aPct}%)</span>
              ${a.submittedDate ? `<span>Submitted: ${formatDateDisplay(a.submittedDate)}</span>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <!-- My Licenses -->
      <div class="card">
        <div class="card-header"><h3>My Licenses (${licenses.length})</h3></div>
        <div class="card-body" style="padding:0;">
          ${licenses.length > 0 ? `<table><thead><tr><th>State</th><th>Number</th><th>Status</th><th>Expires</th></tr></thead><tbody>
            ${licenses.map(l => {
              const exp = l.expirationDate || l.expiration_date;
              const isExpired = exp && new Date(exp) < today;
              const daysLeft = exp ? Math.ceil((new Date(exp) - today) / 86400000) : null;
              const verStatus = l.verificationStatus || l.verification_status;
              return `<tr>
                <td><strong>${escHtml(l.state || '—')}</strong></td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>
                  <span class="badge badge-${l.status === 'active' ? 'approved' : l.status === 'expired' ? 'denied' : 'pending'}">${escHtml(l.status || '—')}</span>
                  ${verStatus === 'verified' ? ' <span style="font-size:10px;color:var(--green);">&#10003;</span>' : ''}
                </td>
                <td style="${isExpired ? 'color:var(--red);font-weight:600;' : daysLeft !== null && daysLeft <= 30 ? 'color:var(--warning-500);font-weight:600;' : ''}">
                  ${formatDateDisplay(exp)}
                  ${daysLeft !== null ? (isExpired ? `<div style="font-size:10px;color:var(--red);">EXPIRED</div>` : daysLeft <= 90 ? `<div style="font-size:10px;">${daysLeft}d left</div>` : '') : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody></table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No licenses on file.</div>'}
        </div>
      </div>

      <!-- My Applications -->
      <div class="card">
        <div class="card-header"><h3>My Applications (${apps.length})</h3></div>
        <div class="card-body" style="padding:0;">
          ${apps.length > 0 ? `<table><thead><tr><th>Payer</th><th>State</th><th>Status</th><th>Submitted</th></tr></thead><tbody>
            ${apps.map(a => `<tr>
              <td><strong>${escHtml(a.payerName || a.payer_name || a.payer?.name || '—')}</strong></td>
              <td>${escHtml(a.state || '—')}</td>
              <td><span class="badge badge-${a.status === 'approved' ? 'approved' : a.status === 'denied' ? 'denied' : 'pending'}">${escHtml(a.status?.replace(/_/g, ' ') || '—')}</span></td>
              <td>${formatDateDisplay(a.submittedDate || a.submitted_date)}</td>
            </tr>`).join('')}
          </tbody></table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No applications yet.</div>'}
        </div>
      </div>

      <!-- My Documents -->
      <div class="card">
        <div class="card-header"><h3>My Documents (${documents.length})</h3></div>
        <div class="card-body" style="padding:0;">
          ${documents.length > 0 ? `<table><thead><tr><th>Document</th><th>Type</th><th>Status</th></tr></thead><tbody>
            ${documents.map(d => `<tr>
              <td>${escHtml(d.documentName || d.document_name || d.name || '—')}</td>
              <td>${escHtml((d.documentType || d.document_type || d.type || '—').replace(/_/g, ' '))}</td>
              <td><span class="badge badge-${d.status === 'verified' || d.status === 'received' ? 'approved' : d.status === 'missing' ? 'denied' : 'pending'}">${escHtml(d.status || 'pending')}</span></td>
            </tr>`).join('')}
          </tbody></table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No documents uploaded.</div>'}
        </div>
      </div>

      <!-- Compliance Issues -->
      <div class="card">
        <div class="card-header"><h3>Compliance Status</h3></div>
        <div class="card-body">
          ${compIssues.length > 0 ? compIssues.map(i => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100);">
              <span style="width:8px;height:8px;border-radius:50%;background:${i.sev === 'critical' ? 'var(--red)' : i.sev === 'warning' ? 'var(--warning-500)' : 'var(--gray-400)'};flex-shrink:0;"></span>
              <span style="font-size:13px;color:var(--gray-700);">${i.text}</span>
            </div>
          `).join('') : `
            <div style="text-align:center;padding:16px;color:var(--green);">
              <div style="font-size:20px;margin-bottom:4px;">&#10003;</div>
              <div style="font-weight:600;">Fully Compliant</div>
              <div class="text-sm text-muted">All credentials are current and verified.</div>
            </div>`}
        </div>
      </div>
    </div>

    ${providerId ? `<div style="margin-top:16px;text-align:center;">
      <button class="btn btn-primary" onclick="window.app.openProviderProfile('${providerId}')">View Full Profile</button>
      <button class="btn" onclick="window.app.openProviderPrintout('${providerId}')" style="margin-left:8px;">Credential Sheet</button>
    </div>` : ''}
  `;
}

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
    <!-- Filters -->
    <div class="card" style="margin-bottom:16px;">
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
    <div class="card">
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
    apps = store.filterByScope(await store.getAll('applications'));
    providers = await store.getAll('providers');
  } catch (e) { console.error('Kanban error:', e); }
  if (!Array.isArray(apps)) apps = [];

  const providerMap = {};
  providers.forEach(p => { providerMap[p.id || p.provider_id] = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim(); });

  const statuses = [
    { key: 'not_started', label: 'Not Started', color: '#6b7280' },
    { key: 'submitted', label: 'Submitted', color: '#3b82f6' },
    { key: 'in_review', label: 'In Review', color: '#f59e0b' },
    { key: 'pending_info', label: 'Pending Info', color: '#ef4444' },
    { key: 'approved', label: 'Approved', color: '#10b981' },
    { key: 'denied', label: 'Denied', color: '#dc2626' },
  ];

  const columns = statuses.map(s => {
    const colApps = apps.filter(a => (a.status || 'not_started') === s.key);
    return { ...s, apps: colApps };
  });

  body.innerHTML = `
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:16px;min-height:500px;">
      ${columns.map(col => `
        <div style="min-width:240px;max-width:280px;flex:1;background:var(--gray-50);border-radius:10px;padding:10px;display:flex;flex-direction:column;"
             ondragover="event.preventDefault();this.style.outline='2px solid var(--brand-600)'"
             ondragleave="this.style.outline='none'"
             ondrop="this.style.outline='none';window.app.kanbanDrop(event.dataTransfer.getData('text/plain'),'${col.key}')">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:4px 6px;">
            <span style="font-weight:700;font-size:13px;color:${col.color};">${col.label}</span>
            <span style="background:${col.color};color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:600;">${col.apps.length}</span>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px;overflow-y:auto;max-height:600px;">
            ${col.apps.length > 0 ? col.apps.map(a => {
              const provName = providerMap[a.providerId || a.provider_id] || 'Unknown';
              const payerName = a.payerName || a.payer_name || a.payer?.name || '—';
              const daysInStatus = a.updatedAt || a.updated_at ? Math.floor((Date.now() - new Date(a.updatedAt || a.updated_at)) / 86400000) : 0;
              return `<div draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${a.id}')"
                style="background:#fff;border-radius:8px;padding:10px 12px;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.08);border-left:3px solid ${col.color};transition:box-shadow .15s;"
                onmouseenter="this.style.boxShadow='0 4px 12px rgba(0,0,0,.12)'" onmouseleave="this.style.boxShadow='0 1px 3px rgba(0,0,0,.08)'"
                onclick="window.app.viewApplication('${a.id}')">
                <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${escHtml(provName)}</div>
                <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px;">${escHtml(payerName)}</div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-400);">
                  <span>${escHtml(a.state || '—')}</span>
                  ${a.wave ? `<span>${getGroupDef(a.wave).short}</span>` : ''}
                  <span>${daysInStatus}d</span>
                </div>
              </div>`;
            }).join('') : '<div style="text-align:center;padding:20px;color:var(--gray-400);font-size:12px;">No applications</div>'}
          </div>
        </div>
      `).join('')}
    </div>
  `;
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
    <!-- Filter Toggles -->
    <div class="card" style="margin-bottom:16px;">
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
    <div class="card">
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

async function renderAdminPanel() {
  const body = document.getElementById('page-body');
  if (!auth.isSuperAdmin()) {
    body.innerHTML = '<div class="alert alert-danger">SuperAdmin access required.</div>';
    return;
  }

  let agencies = [];
  try { agencies = await store.getAdminAgencies(); } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">Failed to load agencies: ${escHtml(e.message)}</div>`;
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
            <thead><tr><th>Provider</th><th>Email</th><th>Invite Link</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead>
            <tbody>
              ${tokens.map(t => {
                const email = t.providerEmail || t.provider_email || '';
                const name = t.providerName || t.provider_name || '';
                const usedAt = t.usedAt || t.used_at;
                const expiresAt = t.expiresAt || t.expires_at;
                const isUsed = !!usedAt;
                const isExpired = expiresAt && new Date(expiresAt) < new Date();
                const status = isUsed ? 'Completed' : isExpired ? 'Expired' : 'Pending';
                const badgeClass = isUsed ? 'approved' : isExpired ? 'denied' : 'pending';
                const link = `${baseUrl}#onboard/${t.token}`;
                return `
                <tr>
                  <td><strong>${escHtml(name || '—')}</strong></td>
                  <td>${escHtml(email || '—')}</td>
                  <td style="max-width:180px;"><code style="font-size:11px;cursor:pointer;color:var(--brand-600);" onclick="navigator.clipboard.writeText('${link}');showToast('Link copied!','success')" title="Click to copy full link">${t.token ? t.token.substring(0, 16) + '...' : t.id}</code></td>
                  <td><span class="badge badge-${badgeClass}">${status}</span></td>
                  <td>${formatDateDisplay(expiresAt)}</td>
                  <td>
                    <div class="flex gap-2">
                      ${!isUsed && !isExpired ? `<button class="btn btn-sm btn-primary" onclick="navigator.clipboard.writeText('${link}');showToast('Link copied — send to provider','success')">Copy Link</button>` : ''}
                      ${!isUsed ? `<button class="btn btn-sm" style="color:var(--danger-500);" onclick="window.app.revokeOnboardToken(${t.id})">Revoke</button>` : `<span class="text-sm text-muted">${formatDateDisplay(usedAt)}</span>`}
                    </div>
                  </td>
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
  try { exclusions = store.filterByScope(await store.getExclusions()); } catch (e) { console.error('Exclusions error:', e); }
  try { providers = store.filterByScope(await store.getAll('providers')); } catch (e) { console.error('Providers error:', e); }

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

let _billingTab = 'invoices';
let _invoiceLineItems = [];
let _billingServices = [];

function _fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _renderSubscriptionTab(sub, plans) {
  if (!Array.isArray(plans)) plans = [];
  const currentTier = sub?.planTier || sub?.plan_tier || 'starter';
  const status = sub?.subscriptionStatus || sub?.subscription_status || 'trialing';
  const isSubscribed = sub?.isSubscribed || sub?.is_subscribed || false;
  const isOnTrial = sub?.isOnTrial || sub?.is_on_trial || false;
  const trialEnds = sub?.trialEndsAt || sub?.trial_ends_at || null;
  const subEnds = sub?.subscriptionEndsAt || sub?.subscription_ends_at || null;
  const usage = sub?.usage || {};
  const limits = sub?.limits || {};

  const statusColors = { active: 'var(--green)', trialing: 'var(--brand-600)', past_due: 'var(--orange,#f97316)', canceling: 'var(--gold)', canceled: 'var(--red)', unpaid: 'var(--red)' };
  const statusLabels = { active: 'Active', trialing: 'Trial', past_due: 'Past Due', canceling: 'Canceling', canceled: 'Canceled', unpaid: 'Unpaid' };

  const usageBar = (label, used, limit) => {
    const pct = limit === -1 ? 5 : Math.min((used / limit) * 100, 100);
    const limitLabel = limit === -1 ? 'Unlimited' : limit;
    const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--gold)' : 'var(--green)';
    return `<div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <span>${label}</span><span><strong>${used}</strong> / ${limitLabel}</span>
      </div>
      <div style="background:var(--gray-200);border-radius:4px;height:8px;overflow:hidden;">
        <div style="background:${color};height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s;"></div>
      </div>
    </div>`;
  };

  return `
    <!-- Current Plan Status -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="card">
        <div class="card-header"><h3>Current Plan</h3></div>
        <div class="card-body" style="padding:20px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <span style="font-size:24px;font-weight:700;text-transform:capitalize;">${currentTier}</span>
            <span class="badge" style="background:${statusColors[status] || 'var(--gray-500)'};color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;">${statusLabels[status] || status}</span>
          </div>
          ${isOnTrial && trialEnds ? `<p style="font-size:13px;color:var(--gray-600);margin-bottom:8px;">Trial ends: <strong>${new Date(trialEnds).toLocaleDateString()}</strong></p>` : ''}
          ${status === 'canceling' && subEnds ? `<p style="font-size:13px;color:var(--gold);margin-bottom:8px;">Access until: <strong>${new Date(subEnds).toLocaleDateString()}</strong></p>` : ''}
          <div style="display:flex;gap:8px;margin-top:16px;">
            ${isSubscribed && status !== 'canceling' ? `<button class="btn btn-sm" style="color:var(--red);" onclick="window.app.cancelSub()">Cancel Subscription</button>` : ''}
            ${status === 'canceling' ? `<button class="btn btn-primary btn-sm" onclick="window.app.resumeSub()">Resume Subscription</button>` : ''}
            ${isSubscribed ? `<button class="btn btn-sm" onclick="window.app.openPortal()">Manage Billing</button>` : ''}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Usage</h3></div>
        <div class="card-body" style="padding:20px;">
          ${usageBar('Providers', usage.providers || 0, limits.providers || 5)}
          ${usageBar('Team Members', usage.users || 0, limits.users || 3)}
          ${usageBar('Applications', usage.applications || 0, limits.applications || 50)}
        </div>
      </div>
    </div>

    <!-- Plan Cards -->
    <div class="card">
      <div class="card-header"><h3>Available Plans</h3></div>
      <div class="card-body" style="padding:20px;">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
          ${plans.map(plan => {
            const isCurrent = plan.tier === currentTier;
            const isPopular = plan.popular;
            return `<div style="border:2px solid ${isCurrent ? 'var(--brand-600)' : isPopular ? 'var(--brand-400)' : 'var(--gray-200)'};border-radius:12px;padding:24px;position:relative;${isPopular ? 'box-shadow:0 4px 12px rgba(0,0,0,0.1);' : ''}">
              ${isPopular ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--brand-600);color:#fff;padding:2px 12px;border-radius:10px;font-size:11px;font-weight:600;">Most Popular</div>' : ''}
              <h4 style="margin:0 0 4px 0;font-size:18px;">${escHtml(plan.name)}</h4>
              <div style="margin-bottom:16px;">
                <span style="font-size:32px;font-weight:800;">$${plan.price}</span>
                <span style="font-size:13px;color:var(--gray-500);">/${plan.interval}</span>
              </div>
              <ul style="list-style:none;padding:0;margin:0 0 20px 0;">
                ${(plan.features || []).map(f => `<li style="padding:4px 0;font-size:13px;color:var(--gray-700);display:flex;align-items:center;gap:6px;"><span style="color:var(--green);font-weight:bold;">&#10003;</span> ${escHtml(f)}</li>`).join('')}
              </ul>
              ${isCurrent
                ? `<button class="btn btn-sm" disabled style="width:100%;opacity:0.6;">Current Plan</button>`
                : `<button class="btn btn-primary btn-sm" style="width:100%;" onclick="window.app.selectPlan('${plan.tier}')">
                    ${isSubscribed ? 'Switch Plan' : 'Get Started'}
                  </button>`
              }
            </div>`;
          }).join('')}
          ${plans.length === 0 ? '<p style="grid-column:1/-1;text-align:center;color:var(--gray-500);">Plan information unavailable. Please check your connection.</p>' : ''}
        </div>
      </div>
    </div>`;
}

function _invoiceStatusBadge(status) {
  const map = { draft: 'inactive', sent: 'pending', partial: 'pending', paid: 'approved', overdue: 'denied', cancelled: 'inactive', void: 'inactive' };
  return `<span class="badge badge-${map[status] || 'inactive'}">${escHtml(status || 'draft')}</span>`;
}

function _nextInvoiceNumber(invoices) {
  const nums = invoices.map(i => {
    const n = (i.invoiceNumber || i.invoice_number || '').replace(/[^0-9]/g, '');
    return n ? parseInt(n, 10) : 0;
  });
  const max = nums.length ? Math.max(...nums) : 0;
  return 'INV-' + String(max + 1).padStart(4, '0');
}

function _renderLineItemsEditor() {
  return `
    <div id="line-items-container">
      <div style="display:flex;gap:8px;align-items:center;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;padding:0 0 6px;">
        <div style="flex:3;">Description</div>
        <div style="flex:1;text-align:center;">Qty</div>
        <div style="flex:1;text-align:center;">Rate</div>
        <div style="flex:1;text-align:right;">Subtotal</div>
        <div style="width:32px;"></div>
      </div>
      ${_invoiceLineItems.map((item, idx) => `
        <div class="line-item-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
          <div style="flex:3;position:relative;">
            <input type="text" class="form-control" style="height:34px;font-size:13px;width:100%;" value="${escAttr(item.description)}" onchange="window.app.updateLineItem(${idx},'description',this.value)" oninput="window.app.filterSvcDropdown(${idx},this.value)" onfocus="window.app.filterSvcDropdown(${idx},this.value)" placeholder="Type to search services...">
            <div id="svc-dd-${idx}" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid var(--gray-200);border-radius:0 0 8px 8px;max-height:150px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
          <input type="number" class="form-control" style="flex:1;height:34px;font-size:13px;text-align:center;" value="${item.qty}" min="1" step="1" onchange="window.app.updateLineItem(${idx},'qty',this.value)">
          <input type="number" class="form-control" style="flex:1;height:34px;font-size:13px;text-align:center;" value="${item.rate}" min="0" step="0.01" onchange="window.app.updateLineItem(${idx},'rate',this.value)">
          <div style="flex:1;text-align:right;font-weight:600;font-size:13px;">${_fmtMoney(item.qty * item.rate)}</div>
          <button class="btn btn-sm" style="width:32px;height:32px;padding:0;color:var(--red);flex-shrink:0;" onclick="window.app.removeLineItem(${idx})" title="Remove">&times;</button>
        </div>
      `).join('')}
      <button class="btn btn-sm" style="margin-top:4px;font-size:12px;" onclick="window.app.addLineItem()">+ Add Line Item</button>
    </div>
    <div style="margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px;display:flex;justify-content:flex-end;">
      <div style="text-align:right;">
        <div style="font-size:13px;color:var(--gray-600);margin-bottom:4px;">Subtotal: <strong>${_fmtMoney(_invoiceLineItems.reduce((s, i) => s + i.qty * i.rate, 0))}</strong></div>
        <div style="font-size:18px;font-weight:800;color:var(--gray-900);">Total: ${_fmtMoney(_invoiceLineItems.reduce((s, i) => s + i.qty * i.rate, 0))}</div>
      </div>
    </div>
  `;
}

async function renderBillingPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let stats = { totalRevenue: 0, outstanding: 0, overdue: 0, drafts: 0, collected: 0, estimatesPending: 0 };
  let invoices = [];
  let services = [];
  let estimates = [];
  let subStatus = null;
  let subPlans = [];

  try { stats = await store.getBillingStats(); } catch (e) { console.error('Billing stats error:', e); }
  try { invoices = store.filterByScope(await store.getInvoices()); } catch (e) { console.error('Invoices error:', e); }
  try { services = await store.getServices(); } catch (e) { console.error('Services error:', e); }
  try { estimates = store.filterByScope(await store.getEstimates()); } catch (e) { /* estimates endpoint may not exist yet */ }
  try { subStatus = await store.getSubscriptionStatus(); } catch (e) { console.error('Subscription status error:', e); }
  try { subPlans = await store.getSubscriptionPlans(); } catch (e) { console.error('Subscription plans error:', e); }
  if (!Array.isArray(invoices)) invoices = [];
  if (!Array.isArray(services)) services = [];
  if (!Array.isArray(estimates)) estimates = [];
  _billingServices = services;

  // Compute aging buckets from invoices
  const today = new Date();
  const aging = { current: 0, days30: 0, days60: 0, days90plus: 0 };
  invoices.filter(i => i.status !== 'paid' && i.status !== 'void' && i.status !== 'cancelled' && i.status !== 'draft').forEach(inv => {
    const due = new Date(inv.dueDate || inv.due_date || inv.createdAt || inv.created_at);
    const daysPast = Math.floor((today - due) / 86400000);
    const amt = (inv.totalAmount || inv.total_amount || inv.amount || 0) - (inv.paidAmount || inv.paid_amount || 0);
    if (daysPast <= 0) aging.current += amt;
    else if (daysPast <= 30) aging.days30 += amt;
    else if (daysPast <= 60) aging.days60 += amt;
    else aging.days90plus += amt;
  });

  // Monthly revenue breakdown (last 6 months)
  const monthlyRev = {};
  for (let m = 5; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthlyRev[key] = 0;
  }
  invoices.forEach(inv => {
    if (inv.status === 'paid' || (inv.paidAmount || inv.paid_amount || 0) > 0) {
      const d = new Date(inv.paidDate || inv.paid_date || inv.updatedAt || inv.updated_at || inv.createdAt || inv.created_at || '');
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (monthlyRev[key] !== undefined) monthlyRev[key] += (inv.paidAmount || inv.paid_amount || inv.totalAmount || inv.total_amount || 0);
    }
  });
  const maxMonthly = Math.max(...Object.values(monthlyRev), 1);

  body.innerHTML = `
    <!-- Stats Row -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));">
      <div class="stat-card"><div class="label">Total Revenue</div><div class="value" style="color:var(--green);">${_fmtMoney(stats.totalRevenue || stats.total_revenue)}</div></div>
      <div class="stat-card"><div class="label">Outstanding</div><div class="value" style="color:var(--brand-600);">${_fmtMoney(stats.outstanding)}</div></div>
      <div class="stat-card"><div class="label">Overdue</div><div class="value" style="color:var(--red);">${_fmtMoney(stats.overdue)}</div></div>
      <div class="stat-card"><div class="label">Collected</div><div class="value" style="color:var(--green);">${_fmtMoney(stats.collected || stats.totalPaid || stats.total_paid)}</div></div>
      <div class="stat-card"><div class="label">Drafts</div><div class="value" style="color:var(--gray-500);">${stats.drafts || 0}</div></div>
      <div class="stat-card"><div class="label">Estimates</div><div class="value" style="color:var(--brand-600);">${estimates.length}</div></div>
    </div>

    <!-- Revenue Chart & Aging -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="card">
        <div class="card-header"><h3>Monthly Revenue (Last 6 Months)</h3></div>
        <div class="card-body" style="padding:16px;">
          <div style="display:flex;align-items:flex-end;gap:8px;height:140px;">
            ${Object.entries(monthlyRev).map(([label, val]) => `
              <div style="flex:1;text-align:center;">
                <div style="background:var(--brand-600);border-radius:4px 4px 0 0;height:${Math.max(val / maxMonthly * 120, 4)}px;margin-bottom:6px;transition:height 0.3s;" title="${_fmtMoney(val)}"></div>
                <div style="font-size:10px;font-weight:600;color:var(--gray-500);">${label}</div>
                <div style="font-size:10px;color:var(--gray-600);">${_fmtMoney(val)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Aging Analysis</h3></div>
        <div class="card-body" style="padding:16px;">
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:var(--gray-600);">Current</span><strong style="color:var(--green);">${_fmtMoney(aging.current)}</strong></div>
            <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:var(--gray-600);">1-30 days</span><strong style="color:var(--gold);">${_fmtMoney(aging.days30)}</strong></div>
            <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:var(--gray-600);">31-60 days</span><strong style="color:var(--orange,#f97316);">${_fmtMoney(aging.days60)}</strong></div>
            <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:var(--gray-600);">60+ days</span><strong style="color:var(--red);">${_fmtMoney(aging.days90plus)}</strong></div>
            <div style="border-top:1px solid var(--gray-200);padding-top:8px;display:flex;justify-content:space-between;"><span style="font-size:12px;font-weight:700;">Total AR</span><strong>${_fmtMoney(aging.current + aging.days30 + aging.days60 + aging.days90plus)}</strong></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Billing Tabs -->
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab ${_billingTab === 'invoices' ? 'active' : ''}" onclick="window.app.billingTab(this,'invoices')">Invoices (${invoices.length})</button>
      <button class="tab ${_billingTab === 'estimates' ? 'active' : ''}" onclick="window.app.billingTab(this,'estimates')">Estimates (${estimates.length})</button>
      <button class="tab ${_billingTab === 'services' ? 'active' : ''}" onclick="window.app.billingTab(this,'services')">Services (${services.length})</button>
      <button class="tab ${_billingTab === 'subscription' ? 'active' : ''}" onclick="window.app.billingTab(this,'subscription')">Subscription</button>
    </div>

    <!-- Invoices Tab -->
    <div id="billing-invoices" class="${_billingTab !== 'invoices' ? 'hidden' : ''}">
      <div class="card">
        <div class="card-header">
          <h3>Invoices</h3>
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
                <tr><th>Invoice #</th><th>Client</th><th>Items</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due Date</th><th>Actions</th></tr>
              </thead>
              <tbody id="invoice-table-body">
                ${invoices.map(inv => {
                  const invStatus = inv.status || 'draft';
                  const client = inv.clientName || inv.client_name || inv.organizationName || '—';
                  const items = inv.items || inv.lineItems || inv.line_items || [];
                  const itemCount = Array.isArray(items) ? items.length : 0;
                  return `
                  <tr class="invoice-row" style="cursor:pointer;" data-status="${invStatus}" data-search="${(inv.invoiceNumber || '').toLowerCase()} ${client.toLowerCase()}" onclick="window.app.viewInvoiceDetail(${inv.id})">
                    <td><strong>${escHtml(inv.invoiceNumber || inv.invoice_number || '#' + inv.id)}</strong></td>
                    <td>${escHtml(client)}</td>
                    <td class="text-sm text-muted">${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
                    <td>${_fmtMoney(inv.totalAmount || inv.total_amount || inv.amount)}</td>
                    <td>${_fmtMoney(inv.paidAmount || inv.paid_amount || 0)}</td>
                    <td>${_invoiceStatusBadge(invStatus)}</td>
                    <td>${inv.dueDate || inv.due_date ? formatDateDisplay(inv.dueDate || inv.due_date) : '—'}</td>
                    <td onclick="event.stopPropagation();">
                      ${invStatus === 'draft' ? `<button class="btn btn-sm" onclick="window.app.sendInvoice(${inv.id})" title="Send">Send</button>` : ''}
                      ${invStatus !== 'paid' && invStatus !== 'void' ? `<button class="btn btn-sm btn-primary" onclick="window.app.openPaymentModal(${inv.id})" title="Payment">Pay</button>` : ''}
                      ${invStatus === 'draft' ? `<button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteInvoice(${inv.id})">Del</button>` : ''}
                    </td>
                  </tr>`;
                }).join('')}
                ${invoices.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No invoices yet. Click "+ Create Invoice" to get started.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Estimates Tab -->
    <div id="billing-estimates" class="${_billingTab !== 'estimates' ? 'hidden' : ''}">
      <div class="card">
        <div class="card-header">
          <h3>Estimates</h3>
          ${editButton('+ Create Estimate', 'window.app.openEstimateModal()')}
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Estimate #</th><th>Client</th><th>Items</th><th>Amount</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead>
              <tbody>
                ${estimates.map(est => {
                  const estStatus = est.status || 'draft';
                  const items = est.items || est.lineItems || est.line_items || [];
                  return `
                  <tr>
                    <td><strong>${escHtml(est.estimateNumber || est.estimate_number || 'EST-' + est.id)}</strong></td>
                    <td>${escHtml(est.clientName || est.client_name || '—')}</td>
                    <td class="text-sm text-muted">${Array.isArray(items) ? items.length : 0} items</td>
                    <td>${_fmtMoney(est.totalAmount || est.total_amount || est.amount)}</td>
                    <td>${_invoiceStatusBadge(estStatus)}</td>
                    <td>${est.expirationDate || est.expiration_date ? formatDateDisplay(est.expirationDate || est.expiration_date) : '—'}</td>
                    <td>
                      <button class="btn btn-sm" onclick="window.app.editEstimate(${est.id})">Edit</button>
                      ${estStatus !== 'converted' ? `<button class="btn btn-sm btn-primary" onclick="window.app.convertEstimate(${est.id})" title="Convert to Invoice">To Invoice</button>` : ''}
                      <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteEstimate(${est.id})">Del</button>
                    </td>
                  </tr>`;
                }).join('')}
                ${estimates.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-500);">No estimates yet.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Services Tab -->
    <div id="billing-services" class="${_billingTab !== 'services' ? 'hidden' : ''}">
      <div class="card">
        <div class="card-header">
          <h3>Service Catalog</h3>
          ${editButton('+ Add Service', 'window.app.toggleInlineServiceForm()')}
        </div>

        <!-- Inline Add/Edit Service Form -->
        <div id="inline-service-form" style="display:none;padding:16px 24px;border-bottom:1px solid var(--gray-200);background:var(--gray-50);">
          <input type="hidden" id="svc-edit-id" value="">
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr 2fr auto;gap:10px;align-items:end;">
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Service Name *</label><input type="text" id="svc-name" class="form-control" style="height:34px;font-size:13px;" placeholder="e.g. Initial Evaluation"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Service Code</label><input type="text" id="svc-code" class="form-control" style="height:34px;font-size:13px;" placeholder="e.g. CRED-INIT"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Default Rate</label><input type="number" id="svc-rate" class="form-control" style="height:34px;font-size:13px;" step="0.01" min="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Description</label><input type="text" id="svc-desc" class="form-control" style="height:34px;font-size:13px;" placeholder="Optional description"></div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-primary btn-sm" onclick="window.app.saveService()" style="height:34px;white-space:nowrap;">Save</button>
              <button class="btn btn-sm" onclick="window.app.toggleInlineServiceForm(false)" style="height:34px;">Cancel</button>
            </div>
          </div>
        </div>

        <div class="card-body" style="padding:0;">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Service</th><th>Code</th><th>Rate</th><th>Description</th><th>Actions</th></tr></thead>
              <tbody>
                ${services.map(s => `
                  <tr>
                    <td><strong>${escHtml(s.name || s.serviceName || '—')}</strong></td>
                    <td><code>${escHtml(s.code || s.serviceCode || '—')}</code></td>
                    <td>${_fmtMoney(s.rate || s.defaultRate || s.defaultPrice || s.default_price)}</td>
                    <td class="text-sm text-muted">${escHtml(s.description || '—')}</td>
                    <td>
                      <button class="btn btn-sm" onclick="window.app.editService(${s.id})">Edit</button>
                      <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteService(${s.id})">Del</button>
                    </td>
                  </tr>`).join('')}
                ${services.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--gray-500);">No services defined yet. Click "+ Add Service" to get started.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Subscription Tab -->
    <div id="billing-subscription" class="${_billingTab !== 'subscription' ? 'hidden' : ''}">
      ${_renderSubscriptionTab(subStatus, subPlans)}
    </div>

    <!-- Invoice/Estimate Modal (shared) -->
    <div class="modal-overlay" id="invoice-modal">
      <div class="modal" style="max-width:720px;">
        <div class="modal-header">
          <h3 id="invoice-modal-title">Create Invoice</h3>
          <button class="modal-close" onclick="document.getElementById('invoice-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="inv-edit-id" value="">
          <input type="hidden" id="inv-mode" value="invoice">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;position:relative;">
              <label>Client / Organization Name *</label>
              <input type="text" id="inv-client" class="form-control" autocomplete="off" oninput="window.app.filterOrgDropdown(this.value)" onfocus="window.app.filterOrgDropdown(this.value)">
              <div id="inv-client-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid var(--gray-200);border-radius:0 0 8px 8px;max-height:180px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
            </div>
            <div class="auth-field" style="margin:0;"><label>Client Email</label><input type="email" id="inv-client-email" class="form-control" placeholder="client@example.com"></div>
            <div class="auth-field" style="margin:0;"><label id="inv-date-label">Due Date *</label><input type="date" id="inv-due" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Invoice #</label><input type="text" id="inv-number" class="form-control" placeholder="Auto-generated"></div>
            <div class="auth-field" style="margin:0;"><label>Status</label>
              <select id="inv-status" class="form-control">
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
              </select>
            </div>
          </div>

          <!-- Service Catalog Picker -->
          ${services.length > 0 ? `
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Service Catalog</label>
            <div style="border:1px solid var(--gray-200);border-radius:8px;overflow:hidden;max-height:180px;overflow-y:auto;">
              <table style="width:100%;font-size:13px;margin:0;">
                <thead><tr style="background:var(--gray-50);">
                  <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--gray-500);">Service</th>
                  <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--gray-500);">Code</th>
                  <th style="padding:6px 10px;text-align:right;font-size:11px;font-weight:600;color:var(--gray-500);">Rate</th>
                  <th style="padding:6px 10px;width:60px;"></th>
                </tr></thead>
                <tbody>
                  ${services.map(s => `<tr style="border-top:1px solid var(--gray-100);">
                    <td style="padding:6px 10px;">${escHtml(s.name || s.serviceName || '—')}</td>
                    <td style="padding:6px 10px;"><code style="font-size:12px;">${escHtml(s.code || s.serviceCode || '—')}</code></td>
                    <td style="padding:6px 10px;text-align:right;">${_fmtMoney(s.rate || s.defaultRate || s.defaultPrice || s.default_price)}</td>
                    <td style="padding:4px 10px;text-align:center;"><button class="btn btn-sm btn-primary" style="font-size:11px;padding:2px 10px;" onclick="window.app.addServiceLineItem(${s.id})">+ Add</button></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          ` : ''}

          <!-- Line Items -->
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Line Items</label>
            <div id="line-items-editor">${_renderLineItemsEditor()}</div>
          </div>

          <div class="auth-field" style="margin:0 0 12px;"><label>Notes / Payment Terms</label><textarea id="inv-notes" class="form-control" rows="2" style="resize:vertical;" placeholder="e.g. Payment due within 30 days. Late fees may apply."></textarea></div>
          <div class="auth-field" style="margin:0;"><label>Description</label><textarea id="inv-desc" class="form-control" rows="2" style="resize:vertical;"></textarea></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('invoice-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveInvoice()">Save</button>
        </div>
      </div>
    </div>

    <!-- Payment Modal -->
    <div class="modal-overlay" id="payment-modal">
      <div class="modal" style="max-width:420px;">
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

  `;
}

// ─── Invoice Detail View ───

async function renderInvoiceDetail(invoiceId) {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let inv = {};
  let payments = [];
  try { inv = await store.getInvoice(invoiceId); } catch (e) {
    try {
      const all = await store.getInvoices();
      inv = (Array.isArray(all) ? all : []).find(x => x.id == invoiceId) || {};
    } catch {}
  }
  try { payments = await store.getInvoicePayments(invoiceId); } catch {}
  if (!Array.isArray(payments)) payments = [];

  if (!inv || !inv.id) { body.innerHTML = '<div class="empty-state"><h3>Invoice not found</h3></div>'; return; }

  const invNum = inv.invoiceNumber || inv.invoice_number || '#' + inv.id;
  const client = inv.clientName || inv.client_name || '—';
  const status = inv.status || 'draft';
  const items = inv.items || inv.lineItems || inv.line_items || [];
  const total = inv.totalAmount || inv.total_amount || inv.amount || 0;
  const paid = inv.paidAmount || inv.paid_amount || 0;
  const balance = total - paid;
  const notes = inv.notes || inv.paymentTerms || inv.payment_terms || '';
  const desc = inv.description || '';

  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const pageActions = document.getElementById('page-actions');
  if (pageTitle) pageTitle.textContent = 'Invoice ' + invNum;
  if (pageSubtitle) pageSubtitle.textContent = client;
  if (pageActions) pageActions.innerHTML = `
    <button class="btn btn-sm" onclick="window.app.navigateTo('billing')">&larr; Back</button>
    ${status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="window.app.sendInvoice(${inv.id})">Send Invoice</button>` : ''}
    ${status !== 'paid' && status !== 'void' ? `<button class="btn btn-sm btn-gold" onclick="window.app.openPaymentModal(${inv.id})">Record Payment</button>` : ''}
    <button class="btn btn-sm" onclick="window.app.editInvoice(${inv.id})">Edit</button>
    <button class="btn btn-sm no-print" onclick="window.app.printPage()">Print</button>
  `;

  body.innerHTML = `
    <!-- Invoice Header -->
    <div class="card" style="border-top:3px solid var(--brand-600);margin-bottom:20px;">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <div style="font-size:24px;font-weight:800;color:var(--gray-900);">Invoice ${escHtml(invNum)}</div>
            <div style="font-size:15px;color:var(--gray-600);margin-top:4px;">${escHtml(client)}</div>
            ${inv.clientEmail || inv.client_email ? `<div style="font-size:13px;color:var(--gray-500);margin-top:2px;">${escHtml(inv.clientEmail || inv.client_email)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div style="margin-bottom:8px;">${_invoiceStatusBadge(status)}</div>
            <div style="font-size:13px;color:var(--gray-600);">Invoice Date: <strong>${formatDateDisplay(inv.invoiceDate || inv.invoice_date || inv.createdAt || inv.created_at)}</strong></div>
            <div style="font-size:13px;color:var(--gray-600);">Due Date: <strong>${formatDateDisplay(inv.dueDate || inv.due_date)}</strong></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Amount Summary -->
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;">
      <div class="stat-card"><div class="label">Total Amount</div><div class="value">${_fmtMoney(total)}</div></div>
      <div class="stat-card"><div class="label">Paid</div><div class="value" style="color:var(--green);">${_fmtMoney(paid)}</div></div>
      <div class="stat-card"><div class="label">Balance Due</div><div class="value" style="color:${balance > 0 ? 'var(--red)' : 'var(--green)'};">${_fmtMoney(balance)}</div></div>
    </div>

    <!-- Line Items -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><h3>Line Items</h3></div>
      <div class="card-body" style="padding:0;">
        ${Array.isArray(items) && items.length > 0 ? `
          <table>
            <thead><tr><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Subtotal</th></tr></thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${escHtml(item.description || item.name || '—')}</td>
                  <td style="text-align:center;">${item.qty || item.quantity || 1}</td>
                  <td style="text-align:right;">${_fmtMoney(item.rate || item.unitPrice || item.unit_price)}</td>
                  <td style="text-align:right;font-weight:600;">${_fmtMoney((item.qty || item.quantity || 1) * (item.rate || item.unitPrice || item.unit_price || 0))}</td>
                </tr>
              `).join('')}
              <tr style="border-top:2px solid var(--gray-300);font-weight:700;">
                <td colspan="3" style="text-align:right;">Total</td>
                <td style="text-align:right;">${_fmtMoney(total)}</td>
              </tr>
            </tbody>
          </table>
        ` : `<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No line items. Amount: <strong>${_fmtMoney(total)}</strong></div>`}
      </div>
    </div>

    ${desc ? `<div class="card" style="margin-bottom:20px;"><div class="card-header"><h3>Description</h3></div><div class="card-body"><p style="white-space:pre-wrap;font-size:14px;color:var(--gray-700);margin:0;">${escHtml(desc)}</p></div></div>` : ''}
    ${notes ? `<div class="card" style="margin-bottom:20px;"><div class="card-header"><h3>Notes / Payment Terms</h3></div><div class="card-body"><p style="white-space:pre-wrap;font-size:14px;color:var(--gray-700);margin:0;">${escHtml(notes)}</p></div></div>` : ''}

    <!-- Payment History -->
    <div class="card">
      <div class="card-header">
        <h3>Payment History (${payments.length})</h3>
        ${status !== 'paid' && status !== 'void' ? `<button class="btn btn-sm btn-gold" onclick="window.app.openPaymentModal(${inv.id})">+ Record Payment</button>` : ''}
      </div>
      <div class="card-body" style="padding:0;">
        ${payments.length > 0 ? `
          <table>
            <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
            <tbody>
              ${payments.map(p => `
                <tr>
                  <td>${formatDateDisplay(p.paymentDate || p.payment_date || p.createdAt || p.created_at)}</td>
                  <td style="font-weight:600;color:var(--green);">${_fmtMoney(p.amount)}</td>
                  <td>${escHtml((p.paymentMethod || p.payment_method || 'check').replace(/_/g, ' '))}</td>
                  <td class="text-sm text-muted">${escHtml(p.reference || p.notes || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No payments recorded yet.</div>'}
      </div>
    </div>
  `;
}

// ─── Contracts & Agreements Page ───

let _contractLineItems = [{ description: '', qty: 1, rate: 0 }];

function _defaultContractTerms() {
  const a = window._currentUser?.agency?.name || 'Agency';
  return `<h2>SERVICE AGREEMENT TERMS</h2>
<h3>1. Agreement Term</h3>
<p>This Service Agreement Term is twelve (12) months and shall commence on the Effective Date. Upon expiration, if Client has opted into <strong>Automatic Renewal</strong>, the subscription services will automatically renew for a subsequent twelve (12) month period. If Client has opted out of automatic renewal, the services end upon expiration and a new Agreement would be required to continue services.</p>
<h3>2. Add-On Orders</h3>
<p>Client may place orders for additional services at any time during the term. Payment for add-on orders is processed using the payment method on file at the time of order.</p>
<h3>3. Reimbursable Expenses</h3>
<p>The cost of services purchased does not include any expenses incurred by ${a} that are directly related to providing these services. Reimbursable Expenses include, but are not limited to, costs incurred for postage, primary source verification, hospital or health plan credentialing fees, or licensing agency fees. Reimbursable expenses include the actual cost plus <strong>10%</strong>.</p>
<h3>4. Payment Terms</h3>
<p>Payment for services is due <strong>in advance</strong>. Client is required to keep a payment method on file with ${a} to settle all charges. ${a} will submit an invoice for all outstanding account charges. Payment is due upon receipt unless otherwise specified.</p>
<h3>5. Refund Policy</h3>
<p>There are no refunds or returns for services for any reason. Fees are based on professional service time and once staff applies time and effort to a service order, payment is expected for services rendered. If there is a dispute or issue about service, Client may contact ${a} to discuss the issue.</p>
<h3>6. Client Duties</h3>
<p>Client is responsible for supplying ${a} with complete and accurate practitioner and entity information, responding to requests for signature pages or additional documentation throughout the credentialing process. Client is solely responsible for:</p>
<ul>
<li>Ensuring the formation of legal business entities are within all local, state, and federal requirements</li>
<li>Accuracy of all data supplied to ${a}</li>
<li>Attesting that all information supplied for completion of the purchased services are in accordance with all local, state, and federal law and/or government healthcare program guidelines</li>
<li>Negotiating any special rates or contract terms with health plans</li>
</ul>
<h3>7. ${a} Responsibilities</h3>
<p>${a} is responsible for preparing and submitting credentialing applications and requests to participate with payer networks that Client identifies, and to follow up on applications/requests until each is Complete.</p>
<p>Responsibility for enrollment is considered <strong>"Complete"</strong> when the insurance network approves the application and provides an effective date of participation, or closes the application with a denial of participation; or after <strong>four (4) attempts</strong> to obtain required documents from Client with no response.</p>
<h3>8. Outcomes &amp; Disclaimers</h3>
<p>${a} makes <strong>no guarantee or warranty</strong> with respect to: network approval of practitioners, granting of privileges by a healthcare facility, approval of any type of enrollment or credentialing application, effective date set by payors, issuance of a participation contract, approval of any license application, turnaround time of health plan credentialing and/or contracting, reimbursement by a third party payer network for practitioner services, or profitability of Client.</p>
<h3>9. Confidentiality</h3>
<p>Both parties agree to maintain the confidentiality of all information exchanged in connection with this Agreement. Client authorizes ${a} to utilize confidential information about healthcare practitioners associated with Client for any reason necessary related to the services ordered.</p>
<h3>10. Termination</h3>
<p>Either party may terminate this Agreement with <strong>thirty (30) days</strong> written notice. Upon termination, Client remains responsible for payment of all services rendered and expenses incurred through the termination date.</p>
<p><br></p>
<p><em>By accepting this Agreement, Client acknowledges that they have read, understand, and agree to the terms and conditions stated herein.</em></p>`;
}

function _renderContractLineItems() {
  return `<div>
    <div style="display:flex;gap:8px;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;padding:0 0 6px;">
      <div style="flex:3;">Service</div><div style="flex:1;text-align:center;">Qty</div><div style="flex:1;text-align:center;">Rate</div><div style="flex:1;text-align:right;">Total</div><div style="width:32px;"></div>
    </div>
    ${_contractLineItems.map((item, idx) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
        <div style="flex:3;position:relative;">
          <input type="text" class="form-control" style="height:34px;font-size:13px;width:100%;" value="${escAttr(item.description)}" onchange="window.app.updateContractLine(${idx},'description',this.value)" oninput="window.app.filterContractSvc(${idx},this.value)" onfocus="window.app.filterContractSvc(${idx},this.value)" placeholder="Type to search services...">
          <div id="ctr-svc-dd-${idx}" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid var(--gray-200);border-radius:0 0 8px 8px;max-height:150px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
        </div>
        <input type="number" class="form-control" style="flex:1;height:34px;font-size:13px;text-align:center;" value="${item.qty}" min="1" step="1" onchange="window.app.updateContractLine(${idx},'qty',this.value)">
        <input type="number" class="form-control" style="flex:1;height:34px;font-size:13px;text-align:center;" value="${item.rate}" min="0" step="0.01" onchange="window.app.updateContractLine(${idx},'rate',this.value)">
        <div style="flex:1;text-align:right;font-weight:600;font-size:13px;">${_fmtMoney(item.qty * item.rate)}</div>
        <button class="btn btn-sm" style="width:32px;height:32px;padding:0;color:var(--red);" onclick="window.app.removeContractLine(${idx})">&times;</button>
      </div>
    `).join('')}
    <button class="btn btn-sm" style="margin-top:4px;font-size:12px;" onclick="window.app.addContractLine()">+ Add Service</button>
    <div style="margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px;text-align:right;">
      <div style="font-size:18px;font-weight:800;">Total: ${_fmtMoney(_contractLineItems.reduce((s, i) => s + i.qty * i.rate, 0))}</div>
    </div>
  </div>`;
}

async function renderContractsPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let stats = { active: 0, draft: 0, sent: 0, expiring_soon: 0, total_value: 0 };
  let contracts = [];
  try { stats = await store.getContractStats(); } catch(e) {}
  try {
    const res = await store.getContracts();
    contracts = Array.isArray(res) ? res : (res.data || []);
  } catch(e) {}

  const statusBadge = s => {
    const map = { draft:'inactive', sent:'pending', viewed:'pending', accepted:'approved', active:'approved', expired:'denied', terminated:'denied' };
    return `<span class="badge badge-${map[s]||'inactive'}">${s}</span>`;
  };

  body.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));">
      <div class="stat-card"><div class="label">Active</div><div class="value" style="color:var(--green);">${stats.active||0}</div></div>
      <div class="stat-card"><div class="label">Drafts</div><div class="value" style="color:var(--gray-500);">${stats.draft||0}</div></div>
      <div class="stat-card"><div class="label">Sent</div><div class="value" style="color:var(--brand-600);">${stats.sent||0}</div></div>
      <div class="stat-card"><div class="label">Expiring Soon</div><div class="value" style="color:var(--gold);">${stats.expiring_soon||stats.expiringSoon||0}</div></div>
      <div class="stat-card"><div class="label">Total Value</div><div class="value" style="color:var(--green);">${_fmtMoney(stats.total_value||stats.totalValue)}</div></div>
    </div>

    <div class="card">
      <div class="card-header"><h3>All Contracts</h3></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Contract #</th><th>Title</th><th>Client</th><th>Status</th><th>Effective</th><th>Expires</th><th>Total</th><th>Actions</th></tr></thead>
            <tbody>
              ${contracts.map(c => {
                const orgName = c.organization?.name || c.clientName || c.client_name || '—';
                const orgId = c.organizationId || c.organization_id;
                const prvId = c.providerId || c.provider_id;
                const hexTag = orgId ? ' <span style="font-family:monospace;font-size:11px;color:var(--brand-600);">#'+toHexId(orgId)+'</span>' : (prvId ? ' <span style="font-family:monospace;font-size:11px;color:var(--brand-600);">#'+toHexId(prvId)+'</span>' : '');
                return `<tr style="cursor:pointer;" onclick="window.app.openContractDetail(${c.id})">
                  <td><strong>${escHtml(c.contractNumber || c.contract_number || '')}</strong></td>
                  <td>${escHtml(c.title || '')}</td>
                  <td>${escHtml(orgName)}${hexTag}</td>
                  <td>${statusBadge(c.status)}</td>
                  <td>${formatDateDisplay(c.effectiveDate || c.effective_date)}</td>
                  <td>${c.expirationDate || c.expiration_date ? formatDateDisplay(c.expirationDate || c.expiration_date) : '—'}</td>
                  <td><strong>${_fmtMoney(c.total)}</strong></td>
                  <td><button class="btn btn-sm" onclick="event.stopPropagation();window.app.openContractDetail(${c.id})">View</button></td>
                </tr>`;
              }).join('')}
              ${contracts.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No contracts yet. Click "+ New Contract" to create one.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Contract Modal -->
    <div class="modal-overlay" id="contract-modal">
      <div class="modal" style="max-width:760px;">
        <div class="modal-header">
          <h3 id="contract-modal-title">New Contract</h3>
          <button class="modal-close" onclick="document.getElementById('contract-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="ctr-edit-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Contract Title *</label><input type="text" id="ctr-title" class="form-control" placeholder="e.g. Credentialing Services Agreement"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Description</label><textarea id="ctr-description" class="form-control" rows="2" placeholder="Brief summary of services being provided..."></textarea></div>
            <div class="auth-field" style="margin:0;position:relative;">
              <label>Organization</label>
              <input type="text" id="ctr-org" class="form-control" autocomplete="off" oninput="window.app.filterContractOrg(this.value)" onfocus="window.app.filterContractOrg(this.value)" placeholder="Search organizations...">
              <input type="hidden" id="ctr-org-id" value="">
              <div id="ctr-org-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid var(--gray-200);border-radius:0 0 8px 8px;max-height:150px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
            </div>
            <div class="auth-field" style="margin:0;"><label>Client Name</label><input type="text" id="ctr-client-name" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Client Email</label><input type="email" id="ctr-client-email" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Client Address</label><input type="text" id="ctr-client-address" class="form-control" placeholder="Street, City, State ZIP"></div>
            <div class="auth-field" style="margin:0;"><label>Effective Date *</label><input type="date" id="ctr-effective" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Expiration Date</label><input type="date" id="ctr-expiration" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Billing Frequency</label>
              <select id="ctr-frequency" class="form-control">
                <option value="one_time">One-Time</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Payment Terms</label><input type="text" id="ctr-payment-terms" class="form-control" placeholder="e.g. Due in advance, Net 30"></div>
            <div class="auth-field" style="margin:0;"><label>Tax Rate (%)</label><input type="number" id="ctr-tax-rate" class="form-control" min="0" max="100" step="0.01" value="0" placeholder="0"></div>
            <div class="auth-field" style="margin:0;"><label>Discount ($)</label><input type="number" id="ctr-discount" class="form-control" min="0" step="0.01" value="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" id="ctr-auto-renew"> Auto-renew upon expiration
              </label>
              <div id="ctr-renewal-terms-wrap" style="display:none;margin-top:8px;">
                <input type="text" id="ctr-renewal-terms" class="form-control" placeholder="e.g. Automatically renews for subsequent 12-month periods">
              </div>
            </div>
          </div>
          <div class="auth-field" style="margin:0 0 16px;">
            <label>Terms & Conditions <span style="font-weight:400;color:var(--gray-400);font-size:11px;">(pre-filled with template — customize as needed)</span></label>
            <div id="ctr-terms-editor" style="height:280px;background:#fff;border-radius:0 0 8px 8px;"></div>
            <input type="hidden" id="ctr-terms" value="">
          </div>
          <div class="auth-field" style="margin:0 0 16px;"><label>Notes (internal, not shown to client)</label><textarea id="ctr-notes" class="form-control" rows="2" placeholder="Internal notes about this contract..."></textarea></div>
          <label style="display:block;font-size:12px;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Services & Line Items</label>
          <div id="contract-line-items-editor">${_renderContractLineItems()}</div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('contract-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveContract()">Save Contract</button>
        </div>
      </div>
    </div>
  `;
}

async function renderContractDetail(id) {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let c;
  try { c = await store.getContract(id); } catch(e) { body.innerHTML = '<p>Contract not found.</p>'; return; }

  const items = c.items || [];
  const orgName = c.organization?.name || c.clientName || c.client_name || '—';
  const orgId = c.organizationId || c.organization_id;
  const prvId = c.providerId || c.provider_id;
  const hexTag = orgId ? '#'+toHexId(orgId) : (prvId ? '#'+toHexId(prvId) : '');
  const viewUrl = location.origin + location.pathname + '#contract/' + c.token;
  const statusBadge = s => {
    const map = { draft:'inactive', sent:'pending', viewed:'pending', accepted:'approved', active:'approved', expired:'denied', terminated:'denied' };
    return `<span class="badge badge-${map[s]||'inactive'}">${s}</span>`;
  };

  const freq = (c.billingFrequency || c.billing_frequency || 'one_time').replace(/_/g, ' ');
  const autoRenew = c.autoRenew || c.auto_renew;
  const renewalTerms = c.renewalTerms || c.renewal_terms || '';
  const description = c.description || '';
  const clientAddr = c.clientAddress || c.client_address || '';
  const notes = c.notes || '';
  const taxRate = parseFloat(c.taxRate || c.tax_rate || 0);
  const discountAmt = parseFloat(c.discountAmount || c.discount_amount || 0);
  const subtotalVal = items.reduce((s, i) => s + parseFloat(i.total || 0), 0);
  const taxAmt = parseFloat(c.taxAmount || c.tax_amount || (subtotalVal * taxRate / 100));

  body.innerHTML = `
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
      <button class="btn btn-sm" onclick="window.app.navigateTo('contracts')">&larr; Back to Contracts</button>
      <div style="display:flex;gap:8px;">
        ${c.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="window.app.sendContract(${c.id})">Send Contract</button>` : ''}
        ${['draft','sent','viewed'].includes(c.status) ? `<button class="btn btn-sm" style="background:var(--brand-50);color:var(--brand-700);border:1px solid var(--brand-200);" onclick="window.app.markContractSigned(${c.id})">Mark as Signed</button>` : ''}
        ${['sent','viewed','accepted'].includes(c.status) ? `<button class="btn btn-sm" onclick="window.app.activateContract(${c.id})">Mark Active</button>` : ''}
        ${['active','accepted'].includes(c.status) ? `<button class="btn btn-sm" onclick="window.app.genInvoice(${c.id})">Generate Invoice</button>` : ''}
        ${!['terminated','expired'].includes(c.status) ? `<button class="btn btn-sm" style="color:var(--red);" onclick="window.app.terminateContract(${c.id})">Terminate</button>` : ''}
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${viewUrl}');showToast('Link copied!')">Copy Link</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-body" style="padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
          <div>
            <h2 style="margin:0 0 4px;">${escHtml(c.title)} ${statusBadge(c.status)}</h2>
            <div style="font-size:14px;color:var(--gray-500);">${escHtml(c.contractNumber || c.contract_number)}${autoRenew ? ' <span style="font-size:11px;background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-weight:600;">Auto-Renew</span>' : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:24px;font-weight:800;">${_fmtMoney(c.total)}</div>
            ${freq !== 'one time' ? '<div style="font-size:12px;color:var(--gray-500);text-transform:capitalize;">Recurring '+freq+'</div>' : '<div style="font-size:12px;color:var(--gray-500);">One-time</div>'}
          </div>
        </div>

        ${description ? '<p style="color:var(--gray-600);margin:0 0 16px;font-size:14px;">'+escHtml(description)+'</p>' : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:13px;">
          <div><span class="text-muted">Client:</span> <strong>${escHtml(orgName)}</strong> ${hexTag ? '<span style="font-family:monospace;font-size:11px;color:var(--brand-600);">'+hexTag+'</span>' : ''}</div>
          <div><span class="text-muted">Email:</span> ${escHtml(c.clientEmail || c.client_email || '—')}</div>
          <div><span class="text-muted">Address:</span> ${clientAddr ? escHtml(clientAddr) : '—'}</div>
          <div><span class="text-muted">Effective:</span> <strong>${formatDateDisplay(c.effectiveDate || c.effective_date)}</strong></div>
          <div><span class="text-muted">Expires:</span> ${c.expirationDate || c.expiration_date ? formatDateDisplay(c.expirationDate || c.expiration_date) : 'No expiration'}</div>
          <div><span class="text-muted">Payment:</span> ${escHtml(c.paymentTerms || c.payment_terms || 'Due on receipt')}</div>
          ${autoRenew && renewalTerms ? '<div style="grid-column:1/-1;"><span class="text-muted">Renewal:</span> '+escHtml(renewalTerms)+'</div>' : ''}
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><h3>Services & Pricing</h3></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Total</th></tr></thead>
            <tbody>
              ${items.map(i => `<tr><td>${escHtml(i.description)}${i.frequency ? ' <span style="font-size:11px;color:var(--gray-500);">('+i.frequency+')</span>' : ''}</td><td style="text-align:center;">${parseFloat(i.quantity)}</td><td style="text-align:right;">${_fmtMoney(i.unitPrice || i.unit_price)}</td><td style="text-align:right;font-weight:600;">${_fmtMoney(i.total)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end;padding:16px 20px;">
          <div style="width:240px;">
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Subtotal</span><span>${_fmtMoney(c.subtotal || subtotalVal)}</span></div>
            ${taxRate > 0 ? '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Tax ('+taxRate+'%)</span><span>'+_fmtMoney(taxAmt)+'</span></div>' : ''}
            ${discountAmt > 0 ? '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:var(--green);"><span>Discount</span><span>-'+_fmtMoney(discountAmt)+'</span></div>' : ''}
            <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:2px solid var(--gray-800);font-size:16px;font-weight:800;"><span>Total</span><span>${_fmtMoney(c.total)}</span></div>
            ${freq !== 'one time' ? '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:var(--brand-600);"><span>Recurring '+freq+'</span><span>'+_fmtMoney(c.total)+'</span></div>' : ''}
          </div>
        </div>
      </div>
    </div>

    ${c.termsAndConditions || c.terms_and_conditions ? `<div class="card" style="margin-bottom:20px;"><div class="card-header"><h3>Terms & Conditions</h3></div><div class="card-body"><div class="contract-terms-content" style="font-size:13px;line-height:1.6;">${c.termsAndConditions || c.terms_and_conditions}</div></div></div>` : ''}

    ${notes ? `<div class="card" style="margin-bottom:20px;"><div class="card-header"><h3>Internal Notes</h3></div><div class="card-body"><div style="white-space:pre-wrap;font-size:13px;color:var(--gray-600);">${escHtml(notes)}</div></div></div>` : ''}

    <div class="card">
      <div class="card-header"><h3>Activity Timeline</h3></div>
      <div class="card-body" style="padding:20px;">
        <div style="font-size:13px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--gray-400);flex-shrink:0;"></span> Created: <strong>${formatDateDisplay(c.createdAt || c.created_at)}</strong>${c.creator ? ' by '+escHtml((c.creator.first_name||'')+' '+(c.creator.last_name||'')) : ''}</div>
          ${c.sentAt || c.sent_at ? `<div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#2563eb;flex-shrink:0;"></span> Sent to client: <strong>${formatDateDisplay(c.sentAt || c.sent_at)}</strong></div>` : ''}
          ${c.viewedAt || c.viewed_at ? `<div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0;"></span> Viewed by client: <strong>${formatDateDisplay(c.viewedAt || c.viewed_at)}</strong></div>` : ''}
          ${c.acceptedAt || c.accepted_at ? `<div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#16a34a;flex-shrink:0;"></span> Accepted by <strong>${escHtml(c.acceptedByName || c.accepted_by_name || '')}</strong> (${escHtml(c.acceptedByEmail || c.accepted_by_email || '')}) on <strong>${formatDateDisplay(c.acceptedAt || c.accepted_at)}</strong>${c.acceptedIp || c.accepted_ip ? ' <span style="font-size:11px;color:var(--gray-400);">IP: '+(c.acceptedIp || c.accepted_ip)+'</span>' : ''}</div>` : ''}
          ${c.terminatedAt || c.terminated_at ? `<div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--red);flex-shrink:0;"></span> <span style="color:var(--red);">Terminated: <strong>${formatDateDisplay(c.terminatedAt || c.terminated_at)}</strong> ${c.terminatedReason || c.terminated_reason ? '— '+escHtml(c.terminatedReason || c.terminated_reason) : ''}</span></div>` : ''}
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
  let apps = [];
  let exclusions = [];

  try { report = await store.getComplianceReport(); } catch (e) { console.error('Compliance report error:', e); }
  try { licenses = store.filterByScope(await store.getAll('licenses')); } catch (e) {}
  try { providers = store.filterByScope(await store.getAll('providers')); } catch (e) {}
  try { exclusionSummary = await store.getExclusionSummary(); } catch (e) {}
  try { apps = store.filterByScope(await store.getAll('applications')); } catch (e) {}
  try { exclusions = await store.getAll('exclusions'); } catch (e) {}

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

  // ─── Compliance Scoring Engine ───
  function computeProviderScore(prov) {
    const provId = prov.id;
    const provLicenses = licenses.filter(l => (l.providerId || l.provider_id) === provId);
    const provApps = apps.filter(a => a.providerId === provId);
    const provExclusions = Array.isArray(exclusions) ? exclusions.filter(e => (e.providerId || e.provider_id) === provId) : [];
    const hasExclusion = provExclusions.some(e => e.status === 'excluded' || e.result === 'excluded');

    let score = 100;
    let issues = [];
    let criticalCount = 0;
    let warningCount = 0;

    // Critical: Expired licenses (-20 each)
    const expLic = provLicenses.filter(l => {
      const exp = l.expirationDate || l.expiration_date;
      return exp && new Date(exp) < today;
    });
    if (expLic.length > 0) {
      score -= expLic.length * 20;
      criticalCount += expLic.length;
      issues.push({ severity: 'critical', text: `${expLic.length} expired license(s)` });
    }

    // Critical: Exclusion flag (-30)
    if (hasExclusion) {
      score -= 30;
      criticalCount++;
      issues.push({ severity: 'critical', text: 'OIG/SAM exclusion flag' });
    }

    // Warning: Licenses expiring within 30 days (-10 each)
    const exp30 = provLicenses.filter(l => {
      const exp = l.expirationDate || l.expiration_date;
      if (!exp) return false;
      const d = new Date(exp);
      return d > today && d <= in30;
    });
    if (exp30.length > 0) {
      score -= exp30.length * 10;
      warningCount += exp30.length;
      issues.push({ severity: 'warning', text: `${exp30.length} license(s) expiring in 30 days` });
    }

    // Warning: Licenses expiring within 90 days (-5 each)
    const exp90 = provLicenses.filter(l => {
      const exp = l.expirationDate || l.expiration_date;
      if (!exp) return false;
      const d = new Date(exp);
      return d > in30 && d <= in90;
    });
    if (exp90.length > 0) {
      score -= exp90.length * 5;
      warningCount += exp90.length;
      issues.push({ severity: 'warning', text: `${exp90.length} license(s) expiring in 90 days` });
    }

    // Warning: No licenses at all (-15)
    if (provLicenses.length === 0) {
      score -= 15;
      warningCount++;
      issues.push({ severity: 'warning', text: 'No licenses on file' });
    }

    // Info: Never screened for exclusions (-5)
    const wasScreened = provExclusions.length > 0 || (exclusionSummary.screened > 0);
    const isNeverScreened = neverScreened.some(ns => ns.id === provId);
    if (isNeverScreened) {
      score -= 5;
      issues.push({ severity: 'info', text: 'Never screened for exclusions' });
    }

    // Warning: Missing document completion on applications (-5 per incomplete)
    const incompleteApps = provApps.filter(a => {
      const docs = a.documentChecklist || {};
      return !CRED_DOCUMENTS.every(d => docs[d.id]?.completed);
    });
    if (incompleteApps.length > 0) {
      score -= incompleteApps.length * 3;
      issues.push({ severity: 'info', text: `${incompleteApps.length} app(s) with incomplete documents` });
    }

    score = Math.max(0, Math.min(100, score));
    return { provider: prov, score, issues, criticalCount, warningCount, licenseCount: provLicenses.length };
  }

  const providerScores = providers.map(p => computeProviderScore(p)).sort((a, b) => a.score - b.score);
  const avgScore = providerScores.length > 0 ? Math.round(providerScores.reduce((s, p) => s + p.score, 0) / providerScores.length) : 0;
  const criticalProviders = providerScores.filter(p => p.score < 60);
  const warningProviders = providerScores.filter(p => p.score >= 60 && p.score < 85);
  const healthyProviders = providerScores.filter(p => p.score >= 85);

  // ─── Risk Matrix Data ───
  const credTypes = ['License', 'Malpractice', 'Board Cert', 'DEA', 'Exclusion', 'Documents'];
  const riskMatrix = providers.map(prov => {
    const provId = prov.id;
    const provLicenses = licenses.filter(l => (l.providerId || l.provider_id) === provId);
    const provApps = apps.filter(a => a.providerId === provId);
    const provExclusions = Array.isArray(exclusions) ? exclusions.filter(e => (e.providerId || e.provider_id) === provId) : [];
    const provName = `${prov.firstName || prov.first_name || ''} ${prov.lastName || prov.last_name || ''}`.trim();

    // License status
    const hasExpiredLic = provLicenses.some(l => (l.expirationDate || l.expiration_date) && new Date(l.expirationDate || l.expiration_date) < today);
    const hasExpiring30 = provLicenses.some(l => { const exp = l.expirationDate || l.expiration_date; return exp && new Date(exp) > today && new Date(exp) <= in30; });
    const licStatus = provLicenses.length === 0 ? 'none' : hasExpiredLic ? 'critical' : hasExpiring30 ? 'warning' : 'good';

    // Malpractice
    const provMal = (report.expiringMalpractice || []).filter(m => m.providerId === provId || m.provider_id === provId);
    const malStatus = provMal.length > 0 ? 'warning' : 'good';

    // Board certs
    const provBoards = (report.expiringBoards || []).filter(b => b.providerId === provId || b.provider_id === provId);
    const boardStatus = provBoards.length > 0 ? 'warning' : 'good';

    // DEA — check if provider has any (simple presence check)
    const deaStatus = 'good'; // Would need DEA data per provider

    // Exclusion
    const hasExcl = provExclusions.some(e => e.status === 'excluded' || e.result === 'excluded');
    const neverScr = neverScreened.some(ns => ns.id === provId);
    const exclStatus = hasExcl ? 'critical' : neverScr ? 'none' : 'good';

    // Documents
    const totalDocs = provApps.length * CRED_DOCUMENTS.length;
    const doneDocs = provApps.reduce((sum, a) => {
      const docs = a.documentChecklist || {};
      return sum + CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length;
    }, 0);
    const docPct = totalDocs > 0 ? Math.round((doneDocs / totalDocs) * 100) : -1;
    const docStatus = docPct < 0 ? 'none' : docPct < 50 ? 'critical' : docPct < 80 ? 'warning' : 'good';

    return { provName, provId, cells: [licStatus, malStatus, boardStatus, deaStatus, exclStatus, docStatus] };
  });

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

  const scoreColor = s => s >= 85 ? 'var(--green)' : s >= 60 ? 'var(--warning-500)' : 'var(--red)';
  const scoreLabel = s => s >= 85 ? 'Healthy' : s >= 60 ? 'At Risk' : 'Critical';
  const cellColor = s => s === 'good' ? 'rgba(34,197,94,0.2)' : s === 'warning' ? 'rgba(245,158,11,0.25)' : s === 'critical' ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.15)';
  const cellIcon = s => s === 'good' ? '<span style="color:var(--green);">&#10003;</span>' : s === 'warning' ? '<span style="color:var(--warning-500);">&#9888;</span>' : s === 'critical' ? '<span style="color:var(--red);">&#10007;</span>' : '<span style="color:var(--gray-400);">—</span>';

  body.innerHTML = `
    <!-- Compliance Score Overview -->
    <div style="display:grid;grid-template-columns:280px 1fr;gap:16px;margin-bottom:16px;">
      <div class="card" style="text-align:center;">
        <div class="card-body" style="padding:24px;">
          <div style="position:relative;width:140px;height:140px;margin:0 auto 12px;">
            <svg viewBox="0 0 120 120" style="transform:rotate(-90deg);">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--gray-200)" stroke-width="10"/>
              <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor(avgScore)}" stroke-width="10"
                stroke-dasharray="${Math.round(avgScore * 3.267)} 326.7"
                stroke-linecap="round" style="transition:stroke-dasharray 0.6s;"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
              <div style="font-size:36px;font-weight:800;color:${scoreColor(avgScore)};line-height:1;">${avgScore}</div>
              <div style="font-size:11px;color:var(--gray-500);font-weight:500;">/ 100</div>
            </div>
          </div>
          <div style="font-size:14px;font-weight:700;color:${scoreColor(avgScore)};">${scoreLabel(avgScore)}</div>
          <div style="font-size:11px;color:var(--gray-500);margin-top:2px;">Organization Compliance Score</div>
        </div>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));align-content:start;">
        <div class="stat-card" style="border-left:3px solid var(--red);"><div class="label">Critical Providers</div><div class="value" style="color:var(--red);">${criticalProviders.length}</div><div class="sub">Score &lt; 60</div></div>
        <div class="stat-card" style="border-left:3px solid var(--warning-500);"><div class="label">At Risk</div><div class="value" style="color:var(--warning-500);">${warningProviders.length}</div><div class="sub">Score 60-84</div></div>
        <div class="stat-card" style="border-left:3px solid var(--green);"><div class="label">Healthy</div><div class="value" style="color:var(--green);">${healthyProviders.length}</div><div class="sub">Score 85+</div></div>
        <div class="stat-card"><div class="label">Expired Licenses</div><div class="value" style="color:var(--red);">${expiredLicenses.length}</div></div>
        <div class="stat-card"><div class="label">Expiring (30d)</div><div class="value" style="color:var(--amber);">${expiringLicenses30.length}</div></div>
        <div class="stat-card"><div class="label">Expiring (90d)</div><div class="value" style="color:var(--brand-600);">${expiringLicenses90.length}</div></div>
        <div class="stat-card"><div class="label">Exclusion Flags</div><div class="value" style="color:var(--red);">${exclusionSummary.excluded || 0}</div></div>
        <div class="stat-card"><div class="label">Never Screened</div><div class="value" style="color:var(--gray-500);">${exclusionSummary.neverScreened || neverScreened.length || 0}</div></div>
      </div>
    </div>

    <!-- Provider Compliance Scores -->
    ${providerScores.length > 0 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <h3>Provider Compliance Scores</h3>
        <span class="text-sm text-muted">${providers.length} provider(s)</span>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Provider</th><th>Score</th><th>Status</th><th>Issues</th><th>Action</th></tr></thead>
          <tbody>
            ${providerScores.map(ps => {
              const p = ps.provider;
              const provName = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim();
              return `<tr>
                <td><a href="#" onclick="event.preventDefault();window.app.openProviderProfile('${p.id}')" style="font-weight:600;color:var(--gray-800);text-decoration:none;">${escHtml(provName)}</a> <span style="color:var(--gray-400);font-size:11px;">#${toHexId(p.id)}</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:60px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;">
                      <div style="width:${ps.score}%;height:100%;background:${scoreColor(ps.score)};border-radius:3px;"></div>
                    </div>
                    <span style="font-weight:700;color:${scoreColor(ps.score)};font-size:14px;">${ps.score}</span>
                  </div>
                </td>
                <td><span class="badge" style="background:${scoreColor(ps.score)}20;color:${scoreColor(ps.score)};font-weight:600;">${scoreLabel(ps.score)}</span></td>
                <td style="font-size:12px;">${ps.issues.length > 0
                  ? ps.issues.slice(0, 3).map(i => `<span style="display:inline-block;margin:1px 4px 1px 0;padding:1px 6px;border-radius:3px;font-size:10px;background:${i.severity === 'critical' ? 'var(--red)' : i.severity === 'warning' ? 'var(--warning-500)' : 'var(--gray-400)'}15;color:${i.severity === 'critical' ? 'var(--red)' : i.severity === 'warning' ? 'var(--warning-500)' : 'var(--gray-500)'};">${escHtml(i.text)}</span>`).join('')
                  : '<span style="color:var(--green);font-size:11px;">No issues</span>'
                }</td>
                <td><button class="btn btn-sm" onclick="window.app.openProviderProfile('${p.id}')">View</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Risk Matrix Heatmap -->
    ${riskMatrix.length > 0 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <h3>Credential Risk Matrix</h3>
        <div style="display:flex;gap:12px;font-size:11px;align-items:center;">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(34,197,94,0.3);vertical-align:middle;"></span> Good</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(245,158,11,0.35);vertical-align:middle;"></span> Warning</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(239,68,68,0.35);vertical-align:middle;"></span> Critical</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(148,163,184,0.2);vertical-align:middle;"></span> N/A</span>
        </div>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table style="border-collapse:separate;border-spacing:0;">
          <thead><tr><th style="text-align:left;min-width:160px;">Provider</th>${credTypes.map(c => `<th style="text-align:center;font-size:11px;min-width:90px;">${c}</th>`).join('')}</tr></thead>
          <tbody>
            ${riskMatrix.map(rm => `<tr>
              <td style="font-weight:600;font-size:13px;"><a href="#" onclick="event.preventDefault();window.app.openProviderProfile('${rm.provId}')" style="color:var(--gray-800);text-decoration:none;">${escHtml(rm.provName)}</a></td>
              ${rm.cells.map(c => `<td style="text-align:center;background:${cellColor(c)};font-size:14px;">${cellIcon(c)}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

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
          <button class="btn btn-sm ${c === 'all' ? 'btn-primary' : ''}" data-cat="${escAttr(c)}" onclick="window.app.filterFaqCategory('${escAttr(c)}')" style="text-transform:capitalize;">${escHtml(c)}</button>
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
    <div class="modal-overlay" id="faq-modal">
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h2 id="faq-modal-title">Add FAQ</h2>
          <button class="modal-close" onclick="document.getElementById('faq-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group"><label>Question *</label><input type="text" id="faq-question" class="form-control" data-validate="required"></div>
          <div class="form-group"><label>Answer *</label><textarea id="faq-answer" class="form-control" rows="5" style="resize:vertical;" data-validate="required"></textarea></div>
          <div class="form-group"><label>Category</label>
            <select id="faq-category" class="form-control">
              <option value="general">General</option>
              <option value="credentialing">Credentialing</option>
              <option value="billing">Billing</option>
              <option value="compliance">Compliance</option>
            </select>
          </div>
          <input type="hidden" id="faq-edit-id" value="">
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('faq-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveFaq()">Save FAQ</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Provider Credential / License Printout ───

async function renderProviderPrintout(providerId) {
  const body = document.getElementById('page-body');

  if (!providerId) {
    body.innerHTML = '<div class="alert alert-warning">No provider selected. Go to Providers and click the print icon to generate a credential sheet.</div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Generating credential sheet...</div></div>';

  let provider = {};
  let providerLicenses = [];
  let apps = [];
  let education = [];
  let boards = [];
  let agency = null;

  try { provider = await store.getOne('providers', providerId); } catch (e) {}
  try {
    const allLic = await store.getAll('licenses');
    providerLicenses = allLic.filter(l => (l.providerId || l.provider_id) == providerId);
  } catch (e) {}
  try {
    const allApps = await store.getAll('applications');
    apps = allApps.filter(a => (a.providerId || a.provider_id) == providerId);
  } catch (e) {}
  try { education = await store.getProviderEducation(providerId); } catch (e) {}
  try { boards = await store.getProviderBoards(providerId); } catch (e) {}
  try { agency = auth.getAgency(); } catch (e) {}

  if (!Array.isArray(education)) education = [];
  if (!Array.isArray(boards)) boards = [];

  const provName = `${provider.firstName || ''} ${provider.lastName || ''}`.trim() || 'Unknown Provider';
  const credential = provider.credentials || provider.credential || '';
  const npi = provider.npi || '';
  const taxonomy = provider.taxonomy || '';
  const specialty = provider.specialty || '';
  const email = provider.email || '';
  const phone = provider.phone || '';
  const caqhId = provider.caqhId || '';
  const orgName = provider.organization?.name || provider.organizationName || '';
  const agencyName = agency?.name || agency?.agencyName || '';
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Active licenses sorted by state
  const activeLicenses = providerLicenses
    .filter(l => l.status === 'active')
    .sort((a, b) => (a.state || '').localeCompare(b.state || ''));
  const otherLicenses = providerLicenses
    .filter(l => l.status !== 'active')
    .sort((a, b) => (a.state || '').localeCompare(b.state || ''));

  // Credentialed insurance (approved applications)
  const credentialedApps = apps
    .filter(a => a.status === 'approved' || a.status === 'credentialed')
    .sort((a, b) => {
      const pa = getPayerById(a.payerId);
      const pb = getPayerById(b.payerId);
      return (pa?.name || a.payerName || '').localeCompare(pb?.name || b.payerName || '');
    });

  // In-progress applications
  const pendingApps = apps
    .filter(a => ['submitted', 'in_review', 'pending_info', 'gathering_docs'].includes(a.status))
    .sort((a, b) => (a.payerName || '').localeCompare(b.payerName || ''));

  const esc = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  const pageSubtitle = document.getElementById('page-subtitle');
  if (pageSubtitle) pageSubtitle.textContent = `${provName}${credential ? ', ' + credential : ''} | Generated ${today}`;

  body.innerHTML = `
    <style>
      @media print {
        .no-print { display: none !important; }
        .printout-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 24px !important; }
        body { background: #fff !important; }
      }
      .printout-page { max-width: 800px; margin: 0 auto; background: #fff; border: 1px solid var(--gray-200); border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.06); padding: 40px; }
      .printout-header { text-align: center; border-bottom: 2px solid var(--brand-600, #1e40af); padding-bottom: 20px; margin-bottom: 24px; }
      .printout-header h1 { font-size: 22px; font-weight: 700; color: var(--gray-900); margin: 0 0 4px; }
      .printout-header .subtitle { font-size: 14px; color: var(--gray-500); }
      .printout-section { margin-bottom: 24px; }
      .printout-section h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .8px; color: var(--brand-600, #1e40af); border-bottom: 1px solid var(--gray-200); padding-bottom: 6px; margin: 0 0 12px; font-weight: 700; }
      .printout-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
      .printout-grid dt { color: var(--gray-500); font-weight: 500; }
      .printout-grid dd { color: var(--gray-900); font-weight: 600; margin: 0; }
      .printout-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .printout-table th { text-align: left; padding: 6px 10px; background: var(--gray-50); border: 1px solid var(--gray-200); font-weight: 600; color: var(--gray-700); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
      .printout-table td { padding: 6px 10px; border: 1px solid var(--gray-200); color: var(--gray-800); }
      .printout-table tr:nth-child(even) { background: var(--gray-50); }
      .printout-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
      .badge-active { background: #d1fae5; color: #065f46; }
      .badge-pending { background: #fef3c7; color: #92400e; }
      .badge-expired { background: #fee2e2; color: #991b1b; }
      .printout-footer { text-align: center; border-top: 1px solid var(--gray-200); padding-top: 16px; margin-top: 32px; font-size: 11px; color: var(--gray-400); }
    </style>

    <div class="no-print" style="text-align:center;margin-bottom:16px;">
      <button class="btn btn-gold" onclick="window.print()">Print / Save as PDF</button>
      <button class="btn" onclick="window.app.navigateTo('providers')" style="margin-left:8px;">Back to Providers</button>
    </div>

    <div class="printout-page">
      <div class="printout-header">
        ${agencyName ? `<div style="font-size:11px;color:var(--gray-400);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">${esc(agencyName)}</div>` : ''}
        <h1>Provider Credential Verification Sheet</h1>
        <div class="subtitle">Generated ${today}</div>
      </div>

      <!-- Provider Information -->
      <div class="printout-section">
        <h3>Provider Information</h3>
        <dl class="printout-grid">
          <dt>Full Name</dt><dd>${esc(provName)}${credential ? ', ' + esc(credential) : ''}</dd>
          <dt>NPI</dt><dd>${esc(npi) || '—'}</dd>
          <dt>Specialty</dt><dd>${esc(specialty) || '—'}</dd>
          <dt>Taxonomy</dt><dd>${esc(taxonomy) || '—'}</dd>
          ${orgName ? `<dt>Organization</dt><dd>${esc(orgName)}</dd>` : ''}
          ${caqhId ? `<dt>CAQH ID</dt><dd>${esc(caqhId)}</dd>` : ''}
          ${email ? `<dt>Email</dt><dd>${esc(email)}</dd>` : ''}
          ${phone ? `<dt>Phone</dt><dd>${esc(phone)}</dd>` : ''}
        </dl>
      </div>

      <!-- Education -->
      ${education.length > 0 ? `
      <div class="printout-section">
        <h3>Education</h3>
        <table class="printout-table">
          <thead><tr><th>Institution</th><th>Degree</th><th>Year</th></tr></thead>
          <tbody>
            ${education.map(e => `<tr>
              <td>${esc(e.institution || e.school || '')}</td>
              <td>${esc(e.degree || '')}</td>
              <td>${e.graduationYear || e.graduation_year || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Board Certifications -->
      ${boards.length > 0 ? `
      <div class="printout-section">
        <h3>Board Certifications</h3>
        <table class="printout-table">
          <thead><tr><th>Board</th><th>Specialty</th><th>Status</th><th>Expiration</th></tr></thead>
          <tbody>
            ${boards.map(b => `<tr>
              <td>${esc(b.boardName || b.board_name || b.certifyingBoard || '')}</td>
              <td>${esc(b.specialty || '')}</td>
              <td><span class="printout-badge ${b.status === 'active' ? 'badge-active' : 'badge-pending'}">${esc(b.status || 'Active')}</span></td>
              <td>${fmtDate(b.expirationDate || b.expiration_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Active Licenses -->
      <div class="printout-section">
        <h3>State Licenses (${activeLicenses.length} Active${otherLicenses.length > 0 ? `, ${otherLicenses.length} Other` : ''})</h3>
        ${activeLicenses.length > 0 ? `
        <table class="printout-table">
          <thead><tr><th>State</th><th>License #</th><th>Type</th><th>Status</th><th>Issued</th><th>Expires</th></tr></thead>
          <tbody>
            ${activeLicenses.map(l => `<tr>
              <td><strong>${esc(l.state)}</strong> — ${esc(getStateName(l.state))}</td>
              <td>${esc(l.licenseNumber || l.license_number || '')}</td>
              <td>${esc(l.licenseType || l.license_type || '')}</td>
              <td><span class="printout-badge badge-active">Active</span></td>
              <td>${fmtDate(l.issueDate || l.issue_date)}</td>
              <td>${fmtDate(l.expirationDate || l.expiration_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<p style="color:var(--gray-500);font-size:13px;">No active licenses on file.</p>'}

        ${otherLicenses.length > 0 ? `
        <div style="margin-top:12px;">
          <div style="font-size:12px;color:var(--gray-500);font-weight:600;margin-bottom:6px;">Other Licenses</div>
          <table class="printout-table">
            <thead><tr><th>State</th><th>License #</th><th>Status</th><th>Expires</th></tr></thead>
            <tbody>
              ${otherLicenses.map(l => `<tr>
                <td>${esc(l.state)} — ${esc(getStateName(l.state))}</td>
                <td>${esc(l.licenseNumber || l.license_number || '')}</td>
                <td><span class="printout-badge ${l.status === 'pending' ? 'badge-pending' : 'badge-expired'}">${esc(l.status || '')}</span></td>
                <td>${fmtDate(l.expirationDate || l.expiration_date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </div>

      <!-- Credentialed Insurance -->
      <div class="printout-section">
        <h3>Credentialed Insurance (${credentialedApps.length})</h3>
        ${credentialedApps.length > 0 ? `
        <table class="printout-table">
          <thead><tr><th>Payer</th><th>State</th><th>Effective Date</th><th>Enrollment ID</th></tr></thead>
          <tbody>
            ${credentialedApps.map(a => {
              const payer = getPayerById(a.payerId);
              return `<tr>
                <td><strong>${esc(payer?.name || a.payerName || '')}</strong></td>
                <td>${esc(a.state || '')}</td>
                <td>${fmtDate(a.effectiveDate || a.effective_date)}</td>
                <td>${esc(a.enrollmentId || a.enrollment_id || a.applicationRef || '—')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<p style="color:var(--gray-500);font-size:13px;">No credentialed insurance on file.</p>'}
      </div>

      <!-- In-Progress Applications -->
      ${pendingApps.length > 0 ? `
      <div class="printout-section">
        <h3>Pending Applications (${pendingApps.length})</h3>
        <table class="printout-table">
          <thead><tr><th>Payer</th><th>State</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            ${pendingApps.map(a => {
              const payer = getPayerById(a.payerId);
              const statusInfo = APPLICATION_STATUSES.find(s => s.value === a.status) || {};
              return `<tr>
                <td>${esc(payer?.name || a.payerName || '')}</td>
                <td>${esc(a.state || '')}</td>
                <td><span class="printout-badge" style="background:${statusInfo.bg || '#f3f4f6'};color:${statusInfo.color || '#6b7280'};">${statusInfo.label || a.status}</span></td>
                <td>${fmtDate(a.submittedDate || a.submitted_date)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <div class="printout-footer">
        <p>This document was generated by ${esc(agencyName || 'Credentik')} on ${today}.</p>
        <p>This is an informational summary and does not constitute primary source verification.</p>
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
  let workHistory = [];
  let cme = [];
  let references = [];

  try { provider = await store.getOne('providers', providerId); } catch (e) { console.error('Provider error:', e); }
  try { profile = await store.getProviderProfile(providerId); } catch (e) { console.error('Profile error:', e); }
  try { education = await store.getProviderEducation(providerId); } catch (e) {}
  try { boards = await store.getProviderBoards(providerId); } catch (e) {}
  try { malpractice = await store.getProviderMalpractice(providerId); } catch (e) {}
  try { workHistory = await store.getProviderWorkHistory(providerId); } catch (e) {}
  try { cme = await store.getProviderCme(providerId); } catch (e) {}
  try { references = await store.getProviderReferences(providerId); } catch (e) {}
  try {
    const allLic = await store.getAll('licenses');
    providerLicenses = allLic.filter(l => (l.providerId || l.provider_id) === providerId);
  } catch (e) {}

  if (!Array.isArray(education)) education = [];
  if (!Array.isArray(boards)) boards = [];
  if (!Array.isArray(malpractice)) malpractice = [];
  if (!Array.isArray(workHistory)) workHistory = profile.workHistory || profile.work_history || [];
  if (!Array.isArray(cme)) cme = profile.cme || profile.continuingEducation || [];
  if (!Array.isArray(references)) references = profile.references || [];

  const provName = `${provider.firstName || provider.first_name || ''} ${provider.lastName || provider.last_name || ''}`.trim() || 'Unknown Provider';
  const credential = provider.credential || provider.credentials || '';
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
  if (pageSubtitle) pageSubtitle.textContent = provName + (credential ? ', ' + credential : '') + ` | ID: ${toHexId(providerId)}`;

  body.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;border-bottom:1px solid var(--gray-200);padding-bottom:0;">
      ${tabs.map((t, i) => `
        <button class="btn btn-sm profile-tab ${i === 0 ? 'btn-primary' : ''}" data-tab="${t.id}" onclick="window.app.switchProfileTab('${t.id}')" style="border-radius:8px 8px 0 0;border-bottom:none;margin-bottom:-1px;${i === 0 ? 'border-bottom:2px solid var(--brand-600);' : ''}">${t.label}</button>
      `).join('')}
    </div>

    <!-- Overview Tab -->
    <div class="profile-tab-content" id="tab-overview">
      <div style="margin-bottom:12px;text-align:right;">
        <button class="btn btn-sm btn-gold" onclick="window.app.aiComplianceScan(${providerId})" id="ai-scan-btn">AI Compliance Scan</button>
      </div>
      <div id="ai-scan-result" style="display:none;margin-bottom:16px;"></div>
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

    </div>

    <!-- Education Modal -->
    <div class="modal-overlay" id="education-modal">
      <div class="modal" style="max-width:520px;">
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

    </div>

    <!-- Board Modal -->
    <div class="modal-overlay" id="board-modal">
      <div class="modal" style="max-width:520px;">
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

    </div>

    <!-- Malpractice Modal -->
    <div class="modal-overlay" id="malpractice-modal">
      <div class="modal" style="max-width:520px;">
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

    <!-- Work History Tab -->
    <div class="profile-tab-content" id="tab-work-history" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Work History</h3>
          ${editButton('+ Add Work History', `window.app.openWorkHistoryModal(${providerId})`)}
        </div>
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

    <!-- Work History Modal -->
    <div class="modal-overlay" id="work-history-modal">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Add Work History</h3>
          <button class="modal-close" onclick="document.getElementById('work-history-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-field" style="margin:0 0 12px;"><label>Employer / Organization *</label><input type="text" id="wh-employer" class="form-control" placeholder="e.g. Johns Hopkins Hospital"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;"><label>Position / Title</label><input type="text" id="wh-position" class="form-control" placeholder="e.g. Attending Psychiatrist"></div>
            <div class="auth-field" style="margin:0;"><label>Department</label><input type="text" id="wh-department" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Start Date</label><input type="date" id="wh-start" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>End Date</label><input type="date" id="wh-end" class="form-control"><div style="font-size:11px;color:var(--gray-400);margin-top:2px;">Leave blank if current</div></div>
          </div>
          <div class="auth-field" style="margin:12px 0 0;"><label>Reason for Leaving</label><input type="text" id="wh-reason" class="form-control"></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('work-history-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveWorkHistory(${providerId})">Save</button>
        </div>
      </div>
    </div>

    <!-- CME Tab -->
    <div class="profile-tab-content" id="tab-cme" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Continuing Medical Education (CME)</h3>
          ${editButton('+ Add CME', `window.app.openCmeModal(${providerId})`)}
        </div>
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

    <!-- CME Modal -->
    <div class="modal-overlay" id="cme-modal">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Add CME Record</h3>
          <button class="modal-close" onclick="document.getElementById('cme-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-field" style="margin:0 0 12px;"><label>Course / Activity Title *</label><input type="text" id="cme-title" class="form-control" placeholder="e.g. Psychopharmacology Update 2026"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;"><label>Accrediting Body / Provider</label><input type="text" id="cme-provider" class="form-control" placeholder="e.g. APA, ACCME"></div>
            <div class="auth-field" style="margin:0;"><label>Credits / Hours</label><input type="number" id="cme-credits" class="form-control" step="0.5" min="0" placeholder="e.g. 20"></div>
            <div class="auth-field" style="margin:0;"><label>Category</label>
              <select id="cme-category" class="form-control">
                <option value="">Select...</option>
                <option value="Category 1">Category 1 (AMA PRA)</option>
                <option value="Category 2">Category 2</option>
                <option value="CME">CME</option>
                <option value="CE">CE (Continuing Education)</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Date Completed</label><input type="date" id="cme-date" class="form-control"></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('cme-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveCme(${providerId})">Save</button>
        </div>
      </div>
    </div>

    <!-- References Tab -->
    <div class="profile-tab-content" id="tab-references" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Professional References</h3>
          ${editButton('+ Add Reference', `window.app.openReferenceModal(${providerId})`)}
        </div>
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

    <!-- Reference Modal -->
    <div class="modal-overlay" id="reference-modal">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Add Professional Reference</h3>
          <button class="modal-close" onclick="document.getElementById('reference-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;"><label>First Name *</label><input type="text" id="ref-first" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Last Name *</label><input type="text" id="ref-last" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Title / Position</label><input type="text" id="ref-title" class="form-control" placeholder="e.g. Medical Director"></div>
            <div class="auth-field" style="margin:0;"><label>Organization</label><input type="text" id="ref-org" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Phone</label><input type="tel" id="ref-phone" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Email</label><input type="email" id="ref-email" class="form-control"></div>
          </div>
          <div class="auth-field" style="margin:12px 0 0;"><label>Relationship</label>
            <select id="ref-relationship" class="form-control">
              <option value="">Select...</option>
              <option value="Supervisor">Supervisor</option>
              <option value="Colleague">Colleague</option>
              <option value="Department Head">Department Head</option>
              <option value="Program Director">Program Director</option>
              <option value="Attending Physician">Attending Physician</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('reference-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveReference(${providerId})">Save</button>
        </div>
      </div>
    </div>

    <!-- Documents Tab -->
    <div class="profile-tab-content" id="tab-documents" style="display:none;">
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3>Documents</h3>
          <div style="display:flex;gap:8px;">
            ${editButton('Upload Document', `window.app.openDocUploadModal(${providerId})`, 'btn-primary')}
            <button class="btn btn-sm" onclick="window.app.downloadProviderPacket(${providerId})" title="Download full credentialing packet as PDF">PDF Packet</button>
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          ${Array.isArray(documents) && documents.length > 0 ? `<table>
            <thead><tr><th>Document</th><th>Type</th><th>Status</th><th>Received</th><th>Expires</th><th>File</th><th></th></tr></thead>
            <tbody>
              ${documents.map(d => {
                const hasFile = d.filePath || d.file_path;
                const statusClass = (d.status === 'verified' || d.status === 'received') ? 'approved' : d.status === 'expired' ? 'denied' : d.status === 'missing' ? 'denied' : 'pending';
                const fileSize = d.fileSize || d.file_size;
                const fileSizeStr = fileSize ? (fileSize > 1048576 ? (fileSize / 1048576).toFixed(1) + ' MB' : (fileSize / 1024).toFixed(0) + ' KB') : '';
                return `<tr>
                <td><strong>${escHtml(d.documentName || d.document_name || d.name || '—')}</strong></td>
                <td>${escHtml(d.documentType || d.document_type || d.type || '—')}</td>
                <td><span class="badge badge-${statusClass}">${escHtml(d.status || 'pending')}</span></td>
                <td>${formatDateDisplay(d.receivedDate || d.received_date || d.createdAt || d.created_at)}</td>
                <td>${d.expirationDate || d.expiration_date ? formatDateDisplay(d.expirationDate || d.expiration_date) : '—'}</td>
                <td>${hasFile ? `<span style="color:var(--green-600);cursor:pointer;" onclick="window.app.downloadDocument(${providerId}, ${d.id})" title="${escHtml(d.originalFilename || d.original_filename || '')} ${fileSizeStr}">Download</span>` : '<span style="color:var(--gray-400);">No file</span>'}</td>
                <td style="white-space:nowrap;">
                  ${hasFile ? `<button class="btn btn-sm" onclick="window.app.aiExtractDoc(${providerId}, ${d.id})" style="padding:2px 8px;font-size:11px;" title="AI Extract Data">AI Extract</button>` : ''}
                  ${!auth.isReadonly() ? `<button class="btn btn-sm btn-danger" onclick="window.app.deleteDocument(${providerId}, ${d.id})" style="padding:2px 8px;font-size:11px;">Delete</button>` : ''}
                </td>
              </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No documents on file. Upload your first document above.</div>'}
        </div>
      </div>

      <!-- Upload Document Modal -->
      <div class="modal-overlay" id="doc-upload-modal">
        <div class="modal" style="max-width:500px;">
          <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;">
            <h3>Upload Document</h3>
            <button class="btn btn-sm" onclick="document.getElementById('doc-upload-modal').classList.remove('active')">&times;</button>
          </div>
          <div class="modal-body" style="padding:1rem;">
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Document Type *</label>
              <select id="doc-upload-type" class="form-control">
                <option value="">Select type...</option>
                <option value="cv_resume">CV / Resume</option>
                <option value="state_license">State License</option>
                <option value="dea_certificate">DEA Certificate</option>
                <option value="board_certification">Board Certification</option>
                <option value="malpractice_coi">Malpractice COI</option>
                <option value="diploma">Diploma / Degree</option>
                <option value="cds_certificate">CDS Certificate</option>
                <option value="w9">W-9</option>
                <option value="government_id">Government ID</option>
                <option value="proof_of_insurance">Proof of Insurance</option>
                <option value="clia_certificate">CLIA Certificate</option>
                <option value="collaborative_agreement">Collaborative Agreement</option>
                <option value="supervision_agreement">Supervision Agreement</option>
                <option value="immunization_record">Immunization Record</option>
                <option value="background_check">Background Check</option>
                <option value="reference_letter">Reference Letter</option>
                <option value="attestation">Attestation</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Document Name *</label>
              <input type="text" id="doc-upload-name" class="form-control" placeholder="e.g. NY Medical License">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">File * <span style="color:var(--gray-400);font-size:11px;">(PDF, JPG, PNG — max 20MB)</span></label>
              <input type="file" id="doc-upload-file" class="form-control" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.tif,.tiff">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Expiration Date</label>
              <input type="date" id="doc-upload-expiry" class="form-control">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Notes</label>
              <textarea id="doc-upload-notes" class="form-control" rows="2" placeholder="Optional notes..."></textarea>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem;">
            <button class="btn" onclick="document.getElementById('doc-upload-modal').classList.remove('active')">Cancel</button>
            <button class="btn btn-primary" id="doc-upload-save-btn" onclick="window.app.saveDocUpload(${providerId})">Upload</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

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

async function renderPSVPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let providers = [], licenses = [], exclusions = [], dea = [];
  try {
    [providers, licenses, exclusions, dea] = await Promise.all([
      store.getAll('providers'),
      store.getAll('licenses'),
      store.getAll('exclusions').catch(() => []),
      store.getAll('dea_registrations').catch(() => []),
    ]);
    providers = store.filterByScope(providers);
    licenses = store.filterByScope(licenses);
  } catch (e) { console.error('PSV load error:', e); }

  const now = new Date();

  // Build PSV status per provider
  const psvData = (providers || []).map(p => {
    const provLicenses = (licenses || []).filter(l => (l.providerId || l.provider_id) == p.id);
    const provExcl = (exclusions || []).filter(ex => (ex.providerId || ex.provider_id) == p.id);
    const provDea = (dea || []).filter(d => (d.providerId || d.provider_id) == p.id);

    const hasExpired = provLicenses.some(l => { const exp = l.expirationDate || l.expiration_date; return exp && new Date(exp) < now; });
    const allVerified = provLicenses.length > 0 && provLicenses.every(l => (l.verificationStatus || l.verification_status) === 'verified');
    const hasVerified = provLicenses.some(l => (l.verificationStatus || l.verification_status) === 'verified');
    const licStatus = provLicenses.length === 0 ? 'none' : hasExpired ? 'expired' : allVerified ? 'verified' : hasVerified ? 'partial' : 'unverified';

    const npiStatus = p.npi ? 'verified' : 'missing';
    const hasDeaExpired = provDea.some(d => { const exp = d.expirationDate || d.expiration_date; return exp && new Date(exp) < now; });
    const deaStatus = provDea.length === 0 ? 'none' : hasDeaExpired ? 'expired' : 'active';
    const hasExclusion = provExcl.some(ex => ['excluded','flagged'].includes((ex.status || '').toLowerCase()));
    const exclStatus = hasExclusion ? 'flagged' : provExcl.length > 0 ? 'clear' : 'not_screened';
    const certStatus = (p.boardCertification || p.board_certification) ? 'verified' : 'unverified';

    const allDates = [
      ...provLicenses.map(l => l.verifiedAt || l.verified_at || l.lastVerifiedAt || l.last_verified_at),
      ...provExcl.map(ex => ex.screenedAt || ex.screened_at || ex.createdAt || ex.created_at),
    ].filter(Boolean).sort().reverse();
    const lastVerified = allDates[0] || null;

    const scores = { verified: 1, active: 1, clear: 1, partial: 0.5, none: 0, missing: 0, unverified: 0, expired: 0, flagged: 0, not_screened: 0 };
    const overall = ((scores[licStatus]||0) + (scores[npiStatus]||0) + (scores[deaStatus]||0) + (scores[exclStatus]||0) + (scores[certStatus]||0)) / 5;
    const overallLabel = overall >= 0.8 ? 'Verified' : overall >= 0.5 ? 'Partial' : 'Action Needed';
    const overallColor = overall >= 0.8 ? 'var(--green)' : overall >= 0.5 ? 'var(--gold)' : 'var(--red)';

    return { ...p, provLicenses, provDea, provExcl, licStatus, npiStatus, deaStatus, exclStatus, certStatus, lastVerified, overall, overallLabel, overallColor };
  });

  const totalProviders = psvData.length;
  const fullyVerified = psvData.filter(p => p.overall >= 0.8).length;
  const needsAction = psvData.filter(p => p.overall < 0.5).length;
  const partiallyVerified = totalProviders - fullyVerified - needsAction;
  const lastScanDate = psvData.map(p => p.lastVerified).filter(Boolean).sort().reverse()[0];

  const statusBadge = (status) => {
    const map = {
      verified: { bg: 'rgba(34,197,94,0.12)', color: 'var(--green)', icon: '&#10003;', text: 'Verified' },
      active: { bg: 'rgba(34,197,94,0.12)', color: 'var(--green)', icon: '&#10003;', text: 'Active' },
      clear: { bg: 'rgba(34,197,94,0.12)', color: 'var(--green)', icon: '&#10003;', text: 'Clear' },
      partial: { bg: 'rgba(245,158,11,0.12)', color: 'var(--gold)', icon: '&#9679;', text: 'Partial' },
      expired: { bg: 'rgba(239,68,68,0.12)', color: 'var(--red)', icon: '&#10007;', text: 'Expired' },
      flagged: { bg: 'rgba(239,68,68,0.12)', color: 'var(--red)', icon: '&#9888;', text: 'Flagged' },
      missing: { bg: 'rgba(156,163,175,0.12)', color: 'var(--gray-500)', icon: '&#8212;', text: 'Missing' },
      none: { bg: 'rgba(156,163,175,0.12)', color: 'var(--gray-500)', icon: '&#8212;', text: 'None' },
      unverified: { bg: 'rgba(156,163,175,0.12)', color: 'var(--gray-500)', icon: '&#9675;', text: 'Unverified' },
      not_screened: { bg: 'rgba(245,158,11,0.12)', color: 'var(--gold)', icon: '&#9675;', text: 'Not Screened' },
    };
    const s = map[status] || map.unverified;
    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${s.bg};color:${s.color};">${s.icon} ${s.text}</span>`;
  };

  body.innerHTML = `
    <!-- PSV Stats -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;">
      <div class="card"><div class="card-body" style="text-align:center;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:var(--brand-600);">${totalProviders}</div>
        <div style="font-size:12px;color:var(--gray-500);">Total Providers</div>
      </div></div>
      <div class="card"><div class="card-body" style="text-align:center;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:var(--green);">${fullyVerified}</div>
        <div style="font-size:12px;color:var(--gray-500);">Fully Verified</div>
      </div></div>
      <div class="card"><div class="card-body" style="text-align:center;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:var(--gold);">${partiallyVerified}</div>
        <div style="font-size:12px;color:var(--gray-500);">Partially Verified</div>
      </div></div>
      <div class="card"><div class="card-body" style="text-align:center;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:var(--red);">${needsAction}</div>
        <div style="font-size:12px;color:var(--gray-500);">Action Needed</div>
      </div></div>
      <div class="card"><div class="card-body" style="text-align:center;padding:16px;">
        <div style="font-size:14px;font-weight:700;color:var(--gray-700);">${lastScanDate ? formatDateDisplay(lastScanDate) : 'Never'}</div>
        <div style="font-size:12px;color:var(--gray-500);">Last PSV Scan</div>
      </div></div>
    </div>

    <!-- Verification Sources -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><h3>Verification Sources</h3></div>
      <div class="card-body" style="padding:12px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          ${[
            { name: 'State Licensing Boards', icon: '&#127963;', desc: 'License validity, expiration, disciplinary actions', status: 'Active' },
            { name: 'NPPES / NPI Registry', icon: '&#128196;', desc: 'NPI number verification, taxonomy, practice info', status: 'Active' },
            { name: 'DEA Registration', icon: '&#128138;', desc: 'Controlled substance registration status', status: 'Active' },
            { name: 'OIG / SAM Exclusions', icon: '&#128737;', desc: 'Federal exclusion and debarment screening', status: 'Active' },
            { name: 'NPDB (Planned)', icon: '&#128218;', desc: 'National Practitioner Data Bank queries', status: 'Planned' },
            { name: 'Board Certifications', icon: '&#127891;', desc: 'ABMS / specialty board certification status', status: 'Planned' },
            { name: 'Education Verification', icon: '&#127979;', desc: 'Medical school and residency verification', status: 'Planned' },
            { name: 'Malpractice History', icon: '&#9878;', desc: 'Claims history and coverage verification', status: 'Planned' },
          ].map(s => `<div style="display:flex;gap:10px;padding:10px;border:1px solid var(--gray-200);border-radius:8px;">
            <div style="font-size:20px;">${s.icon}</div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">${s.name}</div>
              <div style="font-size:11px;color:var(--gray-500);">${s.desc}</div>
            </div>
            <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;height:fit-content;background:${s.status === 'Active' ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.12)'};color:${s.status === 'Active' ? 'var(--green)' : 'var(--gray-500)'};">${s.status}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Provider Verification Table -->
    <div class="card">
      <div class="card-header">
        <h3>Provider Verification Status</h3>
        <input type="text" class="form-control" placeholder="Search providers..." style="width:220px;height:34px;font-size:13px;" oninput="document.querySelectorAll('#psv-table-body tr').forEach(r=>{r.style.display=r.dataset.name.includes(this.value.toLowerCase())?'':'none'})">
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Provider</th><th>NPI</th><th>Licenses</th><th>DEA</th><th>Exclusions</th><th>Board Cert</th><th>Last Verified</th><th>Overall</th><th>Actions</th></tr></thead>
            <tbody id="psv-table-body">
              ${psvData.map(p => `<tr data-name="${escHtml((p.firstName + ' ' + p.lastName).toLowerCase())}">
                <td><strong>${escHtml(p.firstName || '')} ${escHtml(p.lastName || '')}</strong><br><span style="font-size:11px;color:var(--gray-500);">${escHtml(p.credentials || '')}</span></td>
                <td><code style="font-size:12px;">${escHtml(p.npi || '—')}</code></td>
                <td>${statusBadge(p.licStatus)} <span style="font-size:10px;color:var(--gray-400);">(${p.provLicenses.length})</span></td>
                <td>${statusBadge(p.deaStatus)} <span style="font-size:10px;color:var(--gray-400);">(${p.provDea.length})</span></td>
                <td>${statusBadge(p.exclStatus)}</td>
                <td>${statusBadge(p.certStatus)}</td>
                <td style="font-size:11px;">${p.lastVerified ? formatDateDisplay(p.lastVerified) : '<span style="color:var(--gray-400);">Never</span>'}</td>
                <td><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;background:${p.overallColor}18;color:${p.overallColor};">${p.overallLabel}</span></td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-sm" onclick="window.app.runProviderPSV(${p.id})" title="Verify">&#8635; Verify</button>
                  <button class="btn btn-sm" onclick="window.app.shareProviderProfile(${p.id})" title="Share Profile">&#128279;</button>
                </td>
              </tr>`).join('')}
              ${!psvData.length ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No providers found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
// CONTINUOUS MONITORING CENTER
// ═══════════════════════════════════════════════════════════════════

async function renderMonitoringPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let providers = [], licenses = [], exclusions = [], dea = [], tasks = [], apps = [];
  try {
    [providers, licenses, exclusions, dea, tasks, apps] = await Promise.all([
      store.getAll('providers'), store.getAll('licenses'),
      store.getAll('exclusions').catch(() => []), store.getAll('dea_registrations').catch(() => []),
      store.getAll('tasks'), store.getAll('applications'),
    ]);
    providers = store.filterByScope(providers); licenses = store.filterByScope(licenses);
    tasks = store.filterByScope(tasks); apps = store.filterByScope(apps);
  } catch (e) { console.error('Monitoring load error:', e); }

  const now = new Date();
  const alerts = [];
  const getProvName = (id) => { const p = (providers || []).find(pr => pr.id == id); return p ? `${p.firstName} ${p.lastName}` : `Provider #${id}`; };

  // License alerts
  (licenses || []).forEach(l => {
    const exp = l.expirationDate || l.expiration_date; if (!exp) return;
    const days = Math.round((new Date(exp) - now) / 86400000);
    const provName = getProvName(l.providerId || l.provider_id);
    const licDesc = `${l.state || ''} ${l.licenseType || l.license_type || 'License'} #${l.licenseNumber || l.license_number || ''}`;
    if (days < 0) alerts.push({ severity: 'critical', provider: provName, alert: 'License Expired', detail: `${licDesc} expired ${Math.abs(days)} days ago`, date: exp, category: 'license' });
    else if (days <= 30) alerts.push({ severity: 'urgent', provider: provName, alert: 'License Expiring Soon', detail: `${licDesc} expires in ${days} days`, date: exp, category: 'license' });
    else if (days <= 90) alerts.push({ severity: 'warning', provider: provName, alert: 'License Renewal Window', detail: `${licDesc} expires in ${days} days — begin renewal`, date: exp, category: 'license' });

    const verDate = l.verifiedAt || l.verified_at || l.lastVerifiedAt || l.last_verified_at;
    if (verDate && Math.round((now - new Date(verDate)) / 86400000) > 180) {
      alerts.push({ severity: 'warning', provider: provName, alert: 'Stale Verification', detail: `${licDesc} last verified ${Math.round((now - new Date(verDate)) / 86400000)} days ago`, date: verDate, category: 'verification' });
    }
  });

  // DEA alerts
  (dea || []).forEach(d => {
    const exp = d.expirationDate || d.expiration_date; if (!exp) return;
    const days = Math.round((new Date(exp) - now) / 86400000);
    const provName = getProvName(d.providerId || d.provider_id);
    if (days < 0) alerts.push({ severity: 'critical', provider: provName, alert: 'DEA Expired', detail: `DEA #${d.deaNumber || d.dea_number || ''} expired ${Math.abs(days)} days ago`, date: exp, category: 'dea' });
    else if (days <= 60) alerts.push({ severity: 'urgent', provider: provName, alert: 'DEA Expiring', detail: `DEA #${d.deaNumber || d.dea_number || ''} expires in ${days} days`, date: exp, category: 'dea' });
  });

  // Exclusion alerts
  (exclusions || []).forEach(ex => {
    if (['excluded','flagged'].includes((ex.status || '').toLowerCase())) {
      alerts.push({ severity: 'critical', provider: getProvName(ex.providerId || ex.provider_id), alert: 'Exclusion Flag', detail: `Provider flagged in ${ex.source || 'OIG/SAM'} screening`, date: ex.screenedAt || ex.screened_at || '', category: 'exclusion' });
    }
  });

  // Unscreened providers
  (providers || []).forEach(p => {
    if (!(exclusions || []).some(ex => (ex.providerId || ex.provider_id) == p.id)) {
      alerts.push({ severity: 'info', provider: `${p.firstName} ${p.lastName}`, alert: 'Never Screened', detail: 'No OIG/SAM exclusion screening on record', date: '', category: 'exclusion' });
    }
  });

  // Overdue tasks
  (tasks || []).filter(t => !t.isCompleted && !t.completed).forEach(t => {
    const due = t.dueDate || t.due_date; if (!due) return;
    const days = Math.round((new Date(due) - now) / 86400000);
    if (days < 0) alerts.push({ severity: 'warning', provider: '—', alert: 'Overdue Task', detail: `"${t.title || t.description}" is ${Math.abs(days)} days overdue`, date: due, category: 'task' });
  });

  // Stale applications
  (apps || []).filter(a => !['approved','denied','withdrawn'].includes(a.status)).forEach(a => {
    const updated = a.updatedAt || a.updated_at || a.submittedDate || a.submitted_date;
    if (updated && Math.round((now - new Date(updated)) / 86400000) > 90) {
      alerts.push({ severity: 'warning', provider: getProvName(a.providerId || a.provider_id), alert: 'Stale Application', detail: `${a.payerName || a.payer_name || 'Payer'} stalled ${Math.round((now - new Date(updated)) / 86400000)} days (${a.status})`, date: updated, category: 'application' });
    }
  });

  alerts.sort((a, b) => ({ critical: 0, urgent: 1, warning: 2, info: 3 }[a.severity] ?? 9) - ({ critical: 0, urgent: 1, warning: 2, info: 3 }[b.severity] ?? 9));

  const critical = alerts.filter(a => a.severity === 'critical').length;
  const urgent = alerts.filter(a => a.severity === 'urgent').length;
  const warnings = alerts.filter(a => a.severity === 'warning').length;
  const info = alerts.filter(a => a.severity === 'info').length;

  const sevBadge = (sev) => {
    const m = { critical: { bg: '#dc2626', t: 'CRITICAL' }, urgent: { bg: '#f97316', t: 'URGENT' }, warning: { bg: '#eab308', t: 'WARNING' }, info: { bg: '#6b7280', t: 'INFO' } };
    const s = m[sev] || m.info;
    return `<span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${s.bg};color:#fff;letter-spacing:0.5px;">${s.t}</span>`;
  };

  function lastScanStr(arr) {
    if (!Array.isArray(arr) || !arr.length) return '—';
    const dates = arr.map(x => x.updatedAt || x.updated_at || x.screenedAt || x.screened_at || x.createdAt || x.created_at).filter(Boolean);
    return dates.length ? formatDateDisplay(dates.sort().reverse()[0]) : '—';
  }

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
      <div class="card" style="border-left:4px solid #dc2626;"><div class="card-body" style="text-align:center;padding:16px;"><div style="font-size:28px;font-weight:800;color:#dc2626;">${critical}</div><div style="font-size:12px;color:var(--gray-500);">Critical</div></div></div>
      <div class="card" style="border-left:4px solid #f97316;"><div class="card-body" style="text-align:center;padding:16px;"><div style="font-size:28px;font-weight:800;color:#f97316;">${urgent}</div><div style="font-size:12px;color:var(--gray-500);">Urgent</div></div></div>
      <div class="card" style="border-left:4px solid #eab308;"><div class="card-body" style="text-align:center;padding:16px;"><div style="font-size:28px;font-weight:800;color:#eab308;">${warnings}</div><div style="font-size:12px;color:var(--gray-500);">Warnings</div></div></div>
      <div class="card" style="border-left:4px solid #6b7280;"><div class="card-body" style="text-align:center;padding:16px;"><div style="font-size:28px;font-weight:800;color:#6b7280;">${info}</div><div style="font-size:12px;color:var(--gray-500);">Info</div></div></div>
      <div class="card" style="border-left:4px solid var(--brand-600);"><div class="card-body" style="text-align:center;padding:16px;"><div style="font-size:28px;font-weight:800;color:var(--brand-600);">${providers.length}</div><div style="font-size:12px;color:var(--gray-500);">Monitored</div></div></div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><h3>Monitoring Schedule</h3></div>
      <div class="card-body" style="padding:0;">
        <table><thead><tr><th>Check</th><th>Frequency</th><th>Source</th><th>Last Run</th><th>Status</th></tr></thead><tbody>
          ${[
            { check: 'License Expiration', freq: 'Daily', source: 'State Licensing Boards', last: lastScanStr(licenses), st: 'active' },
            { check: 'DEA Registration', freq: 'Weekly', source: 'DEA Registration Database', last: lastScanStr(dea), st: 'active' },
            { check: 'OIG/SAM Exclusion', freq: 'Monthly', source: 'OIG LEIE + SAM.gov', last: lastScanStr(exclusions), st: 'active' },
            { check: 'NPI Validation', freq: 'Monthly', source: 'CMS NPPES Registry', last: '—', st: 'active' },
            { check: 'NPDB Query', freq: 'Quarterly', source: 'Nat. Practitioner Data Bank', last: '—', st: 'planned' },
            { check: 'Board Certification', freq: 'Quarterly', source: 'ABMS / Specialty Boards', last: '—', st: 'planned' },
            { check: 'Malpractice Coverage', freq: 'Annually', source: 'Insurance Carriers', last: '—', st: 'planned' },
          ].map(s => `<tr><td><strong>${s.check}</strong></td><td>${s.freq}</td><td style="font-size:12px;color:var(--gray-600);">${s.source}</td><td style="font-size:12px;">${s.last}</td><td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${s.st === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.12)'};color:${s.st === 'active' ? 'var(--green)' : 'var(--gray-500)'};">${s.st === 'active' ? 'Active' : 'Planned'}</span></td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3>Alert Feed (${alerts.length})</h3>
        <div style="display:flex;gap:8px;">
          <select class="form-control" style="width:140px;height:32px;font-size:12px;" onchange="document.querySelectorAll('#monitoring-alerts-body tr').forEach(r=>{r.style.display=!this.value||r.dataset.severity===this.value?'':'none'})">
            <option value="">All Severities</option><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="warning">Warning</option><option value="info">Info</option>
          </select>
          <select class="form-control" style="width:140px;height:32px;font-size:12px;" onchange="document.querySelectorAll('#monitoring-alerts-body tr').forEach(r=>{r.style.display=!this.value||r.dataset.category===this.value?'':'none'})">
            <option value="">All Categories</option><option value="license">License</option><option value="dea">DEA</option><option value="exclusion">Exclusion</option><option value="verification">Verification</option><option value="task">Task</option><option value="application">Application</option>
          </select>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap"><table><thead><tr><th>Severity</th><th>Provider</th><th>Alert</th><th>Details</th><th>Date</th></tr></thead>
          <tbody id="monitoring-alerts-body">
            ${alerts.map(a => `<tr data-severity="${a.severity}" data-category="${a.category}">
              <td>${sevBadge(a.severity)}</td><td><strong>${escHtml(a.provider)}</strong></td><td style="font-weight:600;">${escHtml(a.alert)}</td>
              <td style="font-size:12px;color:var(--gray-600);max-width:300px;">${escHtml(a.detail)}</td><td style="font-size:12px;">${a.date ? formatDateDisplay(a.date) : '—'}</td>
            </tr>`).join('')}
            ${!alerts.length ? '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--gray-500);">No alerts — all credentials in good standing.</td></tr>' : ''}
          </tbody>
        </table></div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
// PROVIDER PORTABLE PROFILE (Shareable Credential Summary)
// ═══════════════════════════════════════════════════════════════════

async function renderProviderPortableProfile(providerId) {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  if (!providerId) { body.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:var(--gray-500);">No provider selected.</div></div>'; return; }

  let provider = null, licenses = [], deaReg = [], exclusions = [], apps = [];
  try {
    [provider, licenses, deaReg, exclusions, apps] = await Promise.all([
      store.getOne('providers', providerId), store.getAll('licenses'),
      store.getAll('dea_registrations').catch(() => []), store.getAll('exclusions').catch(() => []),
      store.getAll('applications'),
    ]);
    licenses = (licenses || []).filter(l => (l.providerId || l.provider_id) == providerId);
    deaReg = (deaReg || []).filter(d => (d.providerId || d.provider_id) == providerId);
    exclusions = (exclusions || []).filter(ex => (ex.providerId || ex.provider_id) == providerId);
    apps = (apps || []).filter(a => (a.providerId || a.provider_id) == providerId);
  } catch (e) { console.error('Profile load error:', e); }

  if (!provider) { body.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:var(--gray-500);">Provider not found.</div></div>'; return; }

  const now = new Date();
  const genDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const name = `${provider.firstName || ''} ${provider.lastName || ''}`.trim();
  const activeLicenses = licenses.filter(l => { const exp = l.expirationDate || l.expiration_date; return !exp || new Date(exp) >= now; });
  const activeDea = deaReg.filter(d => { const exp = d.expirationDate || d.expiration_date; return !exp || new Date(exp) >= now; });
  const approvedApps = apps.filter(a => a.status === 'approved');
  const hasExclusion = exclusions.some(ex => ['excluded','flagged'].includes((ex.status || '').toLowerCase()));
  const wasScreened = exclusions.length > 0;
  const stateSet = new Set();
  licenses.forEach(l => { if (l.state) stateSet.add(l.state); });
  approvedApps.forEach(a => { if (a.state) stateSet.add(a.state); });

  body.innerHTML = `
    <div style="max-width:800px;margin:0 auto;">
      <div style="display:flex;gap:8px;margin-bottom:16px;justify-content:flex-end;" class="no-print">
        <button class="btn" onclick="window.app.copyProviderProfileLink(${providerId})">&#128279; Copy Link</button>
        <button class="btn" onclick="window.print()">&#128424; Print / PDF</button>
        <button class="btn" onclick="navigateTo('psv')">&#8592; Back to PSV</button>
      </div>

      <div class="card" style="margin-bottom:20px;border-top:4px solid var(--brand-600);">
        <div class="card-body" style="padding:24px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--brand-600);font-weight:700;margin-bottom:4px;">Credentik Verified Provider Profile</div>
              <h2 style="margin:0 0 4px;font-size:24px;">${escHtml(name)}</h2>
              <div style="font-size:14px;color:var(--gray-600);">${escHtml(provider.credentials || '')} ${provider.specialty ? '— ' + escHtml(provider.specialty) : ''}</div>
              <div style="font-size:13px;color:var(--gray-500);margin-top:4px;">NPI: <code>${escHtml(provider.npi || 'Not provided')}</code>${provider.hexId || provider.hex_id ? ' | ID: <code>' + (provider.hexId || provider.hex_id).toUpperCase() + '</code>' : ''}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;color:var(--gray-400);">Generated: ${genDate}</div>
              <div style="margin-top:8px;padding:6px 12px;border-radius:8px;background:${hasExclusion ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'};color:${hasExclusion ? 'var(--red)' : 'var(--green)'};font-weight:700;font-size:13px;">
                ${hasExclusion ? '&#9888; EXCLUSION FLAG' : wasScreened ? '&#10003; No Exclusions Found' : '&#9675; Not Yet Screened'}
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:20px;padding-top:16px;border-top:1px solid var(--gray-200);">
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--brand-600);">${activeLicenses.length}</div><div style="font-size:11px;color:var(--gray-500);">Active Licenses</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--green);">${stateSet.size}</div><div style="font-size:11px;color:var(--gray-500);">States</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--brand-600);">${activeDea.length}</div><div style="font-size:11px;color:var(--gray-500);">Active DEA</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--green);">${approvedApps.length}</div><div style="font-size:11px;color:var(--gray-500);">Approved Payers</div></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="card-header"><h3>State Licenses (${licenses.length})</h3></div>
        <div class="card-body" style="padding:0;"><table><thead><tr><th>State</th><th>License #</th><th>Type</th><th>Issued</th><th>Expiration</th><th>Status</th></tr></thead><tbody>
          ${licenses.map(l => { const exp = l.expirationDate || l.expiration_date; const isExp = exp && new Date(exp) < now; const days = exp ? Math.round((new Date(exp) - now) / 86400000) : null;
            return `<tr><td><strong>${escHtml(l.state || '—')}</strong></td><td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td><td>${escHtml(l.licenseType || l.license_type || '—')}</td><td style="font-size:12px;">${l.issueDate || l.issue_date ? formatDateDisplay(l.issueDate || l.issue_date) : '—'}</td><td style="font-size:12px;">${exp ? formatDateDisplay(exp) : '—'} ${days !== null && days >= 0 && days <= 90 ? '<span style="font-size:10px;color:var(--gold);">(' + days + 'd)</span>' : ''}</td><td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${isExp ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)'};color:${isExp ? 'var(--red)' : 'var(--green)'};">${isExp ? 'Expired' : 'Active'}</span></td></tr>`; }).join('')}
          ${!licenses.length ? '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--gray-400);">No licenses on file</td></tr>' : ''}
        </tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="card-header"><h3>DEA Registrations (${deaReg.length})</h3></div>
        <div class="card-body" style="padding:0;"><table><thead><tr><th>DEA Number</th><th>State</th><th>Schedules</th><th>Expiration</th><th>Status</th></tr></thead><tbody>
          ${deaReg.map(d => { const exp = d.expirationDate || d.expiration_date; const isExp = exp && new Date(exp) < now;
            return `<tr><td><code>${escHtml(d.deaNumber || d.dea_number || '—')}</code></td><td>${escHtml(d.state || '—')}</td><td style="font-size:12px;">${escHtml(d.schedules || '—')}</td><td style="font-size:12px;">${exp ? formatDateDisplay(exp) : '—'}</td><td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${isExp ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)'};color:${isExp ? 'var(--red)' : 'var(--green)'};">${isExp ? 'Expired' : 'Active'}</span></td></tr>`; }).join('')}
          ${!deaReg.length ? '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--gray-400);">No DEA registrations on file</td></tr>' : ''}
        </tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="card-header"><h3>Payer Enrollments (${apps.length})</h3></div>
        <div class="card-body" style="padding:0;"><table><thead><tr><th>Payer</th><th>State</th><th>Status</th><th>Submitted</th><th>Effective</th></tr></thead><tbody>
          ${apps.map(a => { const sc = { approved: 'var(--green)', denied: 'var(--red)', in_review: 'var(--brand-600)', submitted: 'var(--blue)', pending_info: 'var(--gold)' }; const c = sc[a.status] || 'var(--gray-500)';
            return `<tr><td><strong>${escHtml(a.payerName || a.payer_name || '—')}</strong></td><td>${escHtml(a.state || '—')}</td><td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${c}18;color:${c};">${(a.status || '').replace(/_/g, ' ')}</span></td><td style="font-size:12px;">${a.submittedDate || a.submitted_date ? formatDateDisplay(a.submittedDate || a.submitted_date) : '—'}</td><td style="font-size:12px;">${a.effectiveDate || a.effective_date ? formatDateDisplay(a.effectiveDate || a.effective_date) : '—'}</td></tr>`; }).join('')}
          ${!apps.length ? '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--gray-400);">No payer enrollments on file</td></tr>' : ''}
        </tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="card-header"><h3>Exclusion Screening</h3></div>
        <div class="card-body" style="padding:${exclusions.length ? '0' : '24px'};${!exclusions.length ? 'text-align:center;color:var(--gray-400);' : ''}">
          ${exclusions.length ? `<table><thead><tr><th>Source</th><th>Status</th><th>Screened</th><th>Details</th></tr></thead><tbody>
            ${exclusions.map(ex => `<tr><td>${escHtml(ex.source || 'OIG/SAM')}</td><td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${(ex.status || '').toLowerCase() === 'clear' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'};color:${(ex.status || '').toLowerCase() === 'clear' ? 'var(--green)' : 'var(--red)'};">${escHtml(ex.status || 'Unknown')}</span></td><td style="font-size:12px;">${ex.screenedAt || ex.screened_at ? formatDateDisplay(ex.screenedAt || ex.screened_at) : '—'}</td><td style="font-size:12px;">${escHtml(ex.details || ex.reason || '—')}</td></tr>`).join('')}
          </tbody></table>` : 'No exclusion screenings performed yet.'}
        </div>
      </div>

      <div style="text-align:center;padding:16px;font-size:11px;color:var(--gray-400);">
        Generated by Credentik &mdash; ${genDate} &mdash; Point-in-time snapshot. Verify current status at app.credentik.com.
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════
// ─── FUNDING HUB ──────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

function mapSource(src) {
  const m = { grants_gov: 'federal', sam_gov: 'federal', nih: 'federal', usaspending: 'federal', samhsa: 'federal', hrsa: 'federal', foundation: 'foundation', state: 'state', va: 'va' };
  return m[src] || src || 'federal';
}

function fundingStatCard(label, value, icon, color = '#10b981') {
  return `<div class="funding-stat-card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <div style="width:32px;height:32px;border-radius:8px;background:${color}15;display:flex;align-items:center;justify-content:center;">
        ${icon}
      </div>
    </div>
    <div class="funding-stat-value">${value}</div>
    <div class="funding-stat-label">${label}</div>
  </div>`;
}

function fundingOppCard(opp) {
  const sourceColors = { federal: '#3b82f6', state: '#8b5cf6', foundation: '#f59e0b', pharma: '#ec4899', va: '#ef4444' };
  const color = sourceColors[opp.source] || '#6b7280';
  const daysLeft = opp.deadline ? Math.ceil((new Date(opp.deadline) - new Date()) / 86400000) : null;
  const urgency = daysLeft !== null && daysLeft <= 14 ? 'color:var(--red);font-weight:700;' : '';
  const clickAction = opp.id ? `window.app.viewFundingDetail(${opp.id})` : (opp.url ? `window.open('${opp.url}','_blank')` : '');
  return `<div class="funding-opp-card" onclick="${clickAction}" style="cursor:pointer;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
      <span class="funding-source-badge funding-source-${opp.source}">${(opp.source || '').toUpperCase()}</span>
      ${opp.amount ? `<span style="font-weight:700;color:#10b981;font-size:14px;">${opp.amount}</span>` : ''}
    </div>
    <h4 style="margin:0 0 6px;font-size:14px;font-weight:600;color:var(--text-primary);line-height:1.3;">${escHtml(opp.title)}</h4>
    <p style="margin:0 0 10px;font-size:12px;color:var(--gray-400);line-height:1.4;">${escHtml(opp.description || '')}</p>
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--gray-500);">
      <span>${escHtml(opp.agency || '')}</span>
      ${daysLeft !== null ? `<span style="${urgency}">${daysLeft > 0 ? daysLeft + ' days left' : 'EXPIRED'}</span>` : '<span>Open</span>'}
    </div>
  </div>`;
}

async function renderFundingDashboard() {
  const body = document.getElementById('page-body');
  // Update active funding nav
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding'));

  body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400);">Loading funding data…</div>';

  // Fetch real data from API
  let opportunities = [], summary = {};
  try {
    const [oppsRes, summaryRes] = await Promise.all([
      store._fetch(CONFIG.API_URL + '/funding/opportunities?per_page=20'),
      store._fetch(CONFIG.API_URL + '/funding/summary'),
    ]);
    opportunities = (oppsRes.data || []).map(o => ({
      id: o.id,
      title: o.title,
      source: mapSource(o.source),
      agency: o.agencySource || o.source,
      amount: o.amountDisplay || '',
      deadline: o.closeDate ? o.closeDate.substring(0, 10) : null,
      description: o.description || '',
      url: o.url,
    }));
    summary = summaryRes.data || {};
  } catch (e) {
    console.warn('Funding API not available, using sample data', e);
    // Fallback to sample data if API not yet deployed
    opportunities = [
      { title: 'Community Mental Health Centers Grant', source: 'federal', agency: 'SAMHSA', amount: '$500K–$1M', deadline: '2026-05-15', description: 'Funding for community-based mental health services expansion including telehealth and crisis intervention programs.' },
      { title: 'Certified Community Behavioral Health Clinic (CCBHC) Expansion', source: 'federal', agency: 'SAMHSA', amount: '$1M–$4M', deadline: '2026-06-01', description: 'Multi-year expansion grants for CCBHCs providing comprehensive behavioral health care.' },
      { title: 'Mental Health Block Grant', source: 'federal', agency: 'SAMHSA', amount: 'Varies', deadline: '2026-07-30', description: 'State formula grants for community mental health services for adults with SMI and children with SED.' },
      { title: 'State Opioid Response Grant (SOR)', source: 'federal', agency: 'SAMHSA', amount: '$2M–$10M', deadline: '2026-04-20', description: 'Address opioid and stimulant use disorders through prevention, treatment, and recovery services.' },
      { title: 'Behavioral Health Workforce Development', source: 'federal', agency: 'HRSA', amount: '$250K–$750K', deadline: '2026-05-30', description: 'Training and education programs to expand the behavioral health workforce.' },
      { title: 'State Mental Health Innovation Fund', source: 'state', agency: 'State BH Authority', amount: '$50K–$200K', deadline: '2026-04-15', description: 'Competitive grants for innovative approaches to behavioral health service delivery.' },
      { title: 'Community Foundation Mental Health Initiative', source: 'foundation', agency: 'Robert Wood Johnson', amount: '$100K–$500K', deadline: '2026-08-01', description: 'Supporting community organizations addressing mental health disparities.' },
      { title: 'VA Community Care Partnership', source: 'va', agency: 'Dept of Veterans Affairs', amount: 'Contract', deadline: '2026-06-15', description: 'Community provider contracts for veteran mental health and substance use services.' },
    ];
  }

  const pipeline = summary.pipeline || {};
  const stats = {
    open: summary.openOpportunities || opportunities.length,
    applied: (pipeline.submitted || 0) + (pipeline.under_review || 0),
    awarded: pipeline.awarded || 0,
    totalAvailable: summary.totalAwarded ? '$' + Number(summary.totalAwarded).toLocaleString() : '$0'
  };

  const urgentDeadlines = (summary.upcomingDeadlines || []).length ? summary.upcomingDeadlines.map(d => ({
    title: d.title, agency: d.agencySource || d.source, deadline: d.closeDate ? d.closeDate.substring(0, 10) : '', source: mapSource(d.source)
  })) : opportunities
    .filter(o => o.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 4);

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;">
      ${fundingStatCard('Open Opportunities', stats.open, '<svg width="18" height="18" fill="none" stroke="#10b981" stroke-width="1.5"><circle cx="9" cy="9" r="7"/><path d="M9 5v4l3 2"/></svg>')}
      ${fundingStatCard('Applied', stats.applied, '<svg width="18" height="18" fill="none" stroke="#3b82f6" stroke-width="1.5"><path d="M4 9l3 3 7-7"/></svg>', '#3b82f6')}
      ${fundingStatCard('Awarded', stats.awarded, '<svg width="18" height="18" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M9 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z"/></svg>', '#f59e0b')}
      ${fundingStatCard('Total Available', stats.totalAvailable, '<svg width="18" height="18" fill="none" stroke="#10b981" stroke-width="1.5"><path d="M9 2v14M5 5h8M4 9h10M5 13h8"/></svg>')}
    </div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;">
      <div>
        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;">Matching Opportunities</h3>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm" style="font-size:11px;padding:3px 10px;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.2);" onclick="window.app.navigateTo('funding-federal')">Federal</button>
              <button class="btn btn-sm" style="font-size:11px;padding:3px 10px;" onclick="window.app.navigateTo('funding-state')">State</button>
              <button class="btn btn-sm" style="font-size:11px;padding:3px 10px;" onclick="window.app.navigateTo('funding-foundations')">Foundations</button>
            </div>
          </div>
          <div class="card-body" style="padding:12px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
              ${opportunities.map(o => fundingOppCard(o)).join('')}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Upcoming Deadlines</h3></div>
          <div class="card-body" style="padding:0;">
            ${urgentDeadlines.map(o => {
              const daysLeft = Math.ceil((new Date(o.deadline) - new Date()) / 86400000);
              const urgent = daysLeft <= 30;
              return `<div style="padding:12px 16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:2px;">${escHtml(o.title.substring(0, 40))}${o.title.length > 40 ? '…' : ''}</div>
                  <div style="font-size:11px;color:var(--gray-500);">${escHtml(o.agency)}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:12px;font-weight:600;${urgent ? 'color:var(--red);' : 'color:#10b981;'}">${daysLeft}d</div>
                  <div style="font-size:10px;color:var(--gray-500);">${o.deadline}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3 style="margin:0;">By Source</h3></div>
          <div class="card-body" style="padding:16px;">
            ${['federal', 'state', 'foundation', 'va'].map(src => {
              const count = opportunities.filter(o => o.source === src).length;
              const colors = { federal: '#3b82f6', state: '#8b5cf6', foundation: '#f59e0b', va: '#ef4444' };
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
                <span class="funding-source-badge funding-source-${src}">${src.toUpperCase()}</span>
                <span style="font-weight:600;color:var(--text-primary);">${count}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function renderFundingFederal() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-federal'));

  body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400);">Loading federal grants…</div>';

  let grants = [];
  try {
    const res = await store._fetch(CONFIG.API_URL + '/funding/opportunities?per_page=50');
    grants = (res.data || []).map(o => {
      const daysLeft = o.closeDate ? Math.ceil((new Date(o.closeDate) - new Date()) / 86400000) : null;
      return {
        title: o.title, agency: o.agencySource || 'Federal', cfda: o.cfdaNumber || '—',
        amount: o.amountDisplay || '—', deadline: o.closeDate ? o.closeDate.substring(0, 10) : 'Rolling',
        status: daysLeft !== null && daysLeft <= 14 ? 'Closing Soon' : 'Open', description: o.description || '', url: o.url,
      };
    });
  } catch (e) {
    // Fallback sample data
    grants = [
      { title: 'Community Mental Health Centers Grant', agency: 'SAMHSA', cfda: '93.958', amount: '$500K–$1M', deadline: '2026-05-15', status: 'Open', description: 'Funding for community-based mental health services expansion.' },
      { title: 'CCBHC Expansion Grants', agency: 'SAMHSA', cfda: '93.829', amount: '$1M–$4M', deadline: '2026-06-01', status: 'Open', description: 'Multi-year expansion grants for Certified Community Behavioral Health Clinics.' },
      { title: 'Mental Health Block Grant (MHBG)', agency: 'SAMHSA', cfda: '93.958', amount: 'Formula', deadline: '2026-07-30', status: 'Open', description: 'State formula grants for adults with SMI and children with SED.' },
      { title: 'State Opioid Response (SOR)', agency: 'SAMHSA', cfda: '93.788', amount: '$2M–$10M', deadline: '2026-04-20', status: 'Closing Soon', description: 'Opioid and stimulant use disorder prevention and treatment.' },
      { title: 'Behavioral Health Workforce', agency: 'HRSA', cfda: '93.732', amount: '$250K–$750K', deadline: '2026-05-30', status: 'Open', description: 'Expand and diversify the behavioral health workforce.' },
      { title: 'NIMH Research Grants (R01)', agency: 'NIH', cfda: '93.242', amount: '$250K+/yr', deadline: 'Rolling', status: 'Open', description: 'Support mental health research projects of significance.' },
    ];
  }

  body.innerHTML = `
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">Federal Grant Opportunities</h3>
        <span style="font-size:12px;color:var(--gray-400);">Sources: SAMHSA, HRSA, NIH, DOJ, VA</span>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Opportunity</th><th>Agency</th><th>CFDA</th><th>Amount</th><th>Deadline</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${grants.map(g => {
              const statusColor = g.status === 'Closing Soon' ? 'var(--red)' : '#10b981';
              return `<tr>
                <td><strong style="font-size:13px;">${escHtml(g.title)}</strong><br><span style="font-size:11px;color:var(--gray-400);">${escHtml(g.description)}</span></td>
                <td style="white-space:nowrap;">${escHtml(g.agency)}</td>
                <td style="font-family:var(--font-mono);font-size:11px;">${escHtml(g.cfda)}</td>
                <td style="font-weight:600;color:#10b981;white-space:nowrap;">${escHtml(g.amount)}</td>
                <td style="white-space:nowrap;">${escHtml(g.deadline)}</td>
                <td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${statusColor}18;color:${statusColor};">${escHtml(g.status)}</span></td>
                <td><button class="btn btn-sm" style="font-size:10px;padding:3px 8px;background:rgba(16,185,129,0.12);color:#10b981;">Track</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div style="margin-top:16px;padding:16px;border-radius:8px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);font-size:12px;color:var(--gray-400);">
      <strong style="color:#10b981;">Data Sources:</strong> Grants.gov API, SAMHSA.gov, HRSA Data Warehouse, NIH RePORTER. Data refreshed on scan. Not all opportunities shown — use "Scan for Opportunities" to fetch latest.
    </div>
  `;
}

async function renderFundingState() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-state'));

  const statePrograms = [
    { state: 'TX', name: 'Texas HHSC Behavioral Health Services', type: 'Contract', amount: 'Varies', deadline: '2026-04-30', status: 'Open' },
    { state: 'CA', name: 'DHCS Community Mental Health Grant', type: 'Grant', amount: '$100K–$500K', deadline: '2026-05-15', status: 'Open' },
    { state: 'NY', name: 'OMH Community Reinvestment Program', type: 'Grant', amount: '$200K–$1M', deadline: '2026-06-01', status: 'Open' },
    { state: 'FL', name: 'DCF Behavioral Health Managing Entity', type: 'Contract', amount: '$1M+', deadline: 'Ongoing', status: 'Open' },
    { state: 'OH', name: 'OhioMHAS Prevention Grant', type: 'Grant', amount: '$50K–$200K', deadline: '2026-05-01', status: 'Open' },
    { state: 'PA', name: 'OMHSAS Community MH Services', type: 'Grant', amount: '$75K–$300K', deadline: '2026-07-15', status: 'Upcoming' },
  ];

  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3 style="margin:0;">State & Local Behavioral Health Funding</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>State</th><th>Program</th><th>Type</th><th>Amount</th><th>Deadline</th><th>Status</th></tr></thead>
          <tbody>
            ${statePrograms.map(p => `<tr>
              <td><span style="font-weight:700;color:var(--brand-400);">${escHtml(p.state)}</span></td>
              <td><strong>${escHtml(p.name)}</strong></td>
              <td><span class="funding-source-badge funding-source-state">${escHtml(p.type)}</span></td>
              <td style="font-weight:600;color:#10b981;">${escHtml(p.amount)}</td>
              <td>${escHtml(p.deadline)}</td>
              <td style="font-size:12px;color:${p.status === 'Upcoming' ? 'var(--gray-400)' : '#10b981'};">${escHtml(p.status)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div style="margin-top:16px;padding:16px;border-radius:8px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);font-size:12px;color:var(--gray-400);">
      <strong style="color:#8b5cf6;">Tip:</strong> State behavioral health authorities release RFPs throughout the year. Set up alerts to get notified when new opportunities match your service area.
    </div>
  `;
}

async function renderFundingFoundations() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-foundations'));

  const foundations = [
    { name: 'Robert Wood Johnson Foundation', focus: 'Health equity, community health', amount: '$100K–$500K', cycle: 'Annual', deadline: '2026-08-01' },
    { name: 'Hogg Foundation for Mental Health', focus: 'Mental health services (Texas)', amount: '$50K–$250K', cycle: 'Biannual', deadline: '2026-05-15' },
    { name: 'NAMI Local Affiliate Grants', focus: 'Mental health advocacy & support', amount: '$5K–$25K', cycle: 'Annual', deadline: '2026-06-30' },
    { name: 'Substance Abuse & MH Services Foundation', focus: 'SUD & MH treatment access', amount: '$25K–$100K', cycle: 'Quarterly', deadline: 'Rolling' },
    { name: 'Blue Cross Blue Shield Foundation', focus: 'Behavioral health integration', amount: '$50K–$200K', cycle: 'Annual', deadline: '2026-09-01' },
    { name: 'Wellcome Trust Mental Health', focus: 'Mental health research & innovation', amount: '$100K–$1M', cycle: 'Annual', deadline: '2026-07-01' },
  ];

  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3 style="margin:0;">Foundation & Private Funding</h3></div>
      <div class="card-body" style="padding:12px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">
          ${foundations.map(f => `<div class="funding-opp-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
              <span class="funding-source-badge funding-source-foundation">FOUNDATION</span>
              <span style="font-weight:700;color:#10b981;font-size:13px;">${escHtml(f.amount)}</span>
            </div>
            <h4 style="margin:0 0 4px;font-size:14px;font-weight:600;color:var(--text-primary);">${escHtml(f.name)}</h4>
            <p style="margin:0 0 8px;font-size:12px;color:var(--gray-400);">${escHtml(f.focus)}</p>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-500);">
              <span>Cycle: ${escHtml(f.cycle)}</span>
              <span>Deadline: ${escHtml(f.deadline)}</span>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

async function renderFundingPipeline() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-pipeline'));

  body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400);">Loading pipeline…</div>';

  const stageConfig = [
    { key: 'identified', name: 'Identified', color: '#6b7280' },
    { key: 'preparing', name: 'Preparing', color: '#3b82f6' },
    { key: 'submitted', name: 'Submitted', color: '#f59e0b' },
    { key: 'under_review', name: 'Under Review', color: '#8b5cf6' },
    { key: 'awarded', name: 'Awarded', color: '#10b981' },
  ];

  let stages;
  try {
    const res = await store._fetch(CONFIG.API_URL + '/funding/applications');
    const apps = res.data || [];
    stages = stageConfig.map(s => ({
      ...s,
      items: apps.filter(a => a.stage === s.key).map(a => ({
        title: a.title, source: a.opportunity?.agencySource || '—',
        amount: a.amountRequested ? '$' + Number(a.amountRequested).toLocaleString() : '—',
        deadline: a.deadline ? a.deadline.substring(0, 10) : '—',
      })),
    }));
  } catch (e) {
    stages = [
      { name: 'Identified', color: '#6b7280', items: [
        { title: 'CCBHC Expansion Grant', source: 'SAMHSA', amount: '$2M', deadline: '2026-06-01' },
        { title: 'State MH Innovation Fund', source: 'State BHA', amount: '$150K', deadline: '2026-04-15' },
      ]},
      { name: 'Preparing', color: '#3b82f6', items: [
        { title: 'Workforce Development', source: 'HRSA', amount: '$500K', deadline: '2026-05-30' },
      ]},
      { name: 'Submitted', color: '#f59e0b', items: [
        { title: 'Community MH Centers Grant', source: 'SAMHSA', amount: '$750K', deadline: '2026-05-15' },
      ]},
      { name: 'Under Review', color: '#8b5cf6', items: [
        { title: 'SOR Treatment Expansion', source: 'SAMHSA', amount: '$5M', deadline: '2026-04-20' },
      ]},
      { name: 'Awarded', color: '#10b981', items: [
        { title: 'MHBG Subrecipient', source: 'State', amount: '$200K', deadline: 'Active' },
      ]},
    ];
  }

  body.innerHTML = `
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:16px;">
      ${stages.map(stage => `<div style="min-width:240px;flex:1;">
        <div style="padding:8px 12px;background:${stage.color}18;border-radius:8px 8px 0 0;border-bottom:2px solid ${stage.color};display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;font-size:13px;color:${stage.color};">${stage.name}</span>
          <span style="background:${stage.color}25;color:${stage.color};padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;">${stage.items.length}</span>
        </div>
        <div style="background:var(--card-bg);border:1px solid var(--border-color);border-top:none;border-radius:0 0 8px 8px;padding:8px;">
          ${stage.items.map(item => `<div style="padding:10px;margin-bottom:6px;background:var(--bg-secondary);border-radius:6px;border:1px solid var(--border-color);">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">${escHtml(item.title)}</div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-500);">
              <span>${escHtml(item.source)}</span>
              <span style="font-weight:600;color:#10b981;">${escHtml(item.amount)}</span>
            </div>
            <div style="font-size:10px;color:var(--gray-500);margin-top:4px;">Due: ${escHtml(item.deadline)}</div>
          </div>`).join('')}
          ${stage.name === 'Identified' ? `<button class="btn btn-sm" style="width:100%;font-size:11px;padding:6px;border:1px dashed var(--border-color);background:transparent;color:var(--gray-400);" onclick="window.app.openFundingAppModal()">+ Add</button>` : ''}
        </div>
      </div>`).join('')}
    </div>
    <div style="margin-top:8px;font-size:11px;color:var(--gray-500);text-align:center;">Drag opportunities between stages to update status • Total pipeline value: <strong style="color:#10b981;">$8.9M</strong></div>
  `;
}

async function renderFundingCalendar() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-calendar'));

  const now = new Date();
  const months = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ month: d.toLocaleString('default', { month: 'long' }), year: d.getFullYear(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
  }

  const deadlines = [
    { date: '2026-04-15', title: 'State MH Innovation Fund', source: 'state' },
    { date: '2026-04-20', title: 'State Opioid Response (SOR)', source: 'federal' },
    { date: '2026-05-01', title: 'Justice & MH Collaboration', source: 'federal' },
    { date: '2026-05-15', title: 'Community MH Centers Grant', source: 'federal' },
    { date: '2026-05-15', title: 'Hogg Foundation Grant', source: 'foundation' },
    { date: '2026-05-30', title: 'BH Workforce Development', source: 'federal' },
    { date: '2026-06-01', title: 'CCBHC Expansion', source: 'federal' },
    { date: '2026-06-15', title: 'VA Community Care', source: 'va' },
    { date: '2026-06-30', title: 'NAMI Affiliate Grants', source: 'foundation' },
    { date: '2026-07-01', title: 'Wellcome Trust MH', source: 'foundation' },
    { date: '2026-07-30', title: 'Mental Health Block Grant', source: 'federal' },
  ];

  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3 style="margin:0;">Grant Deadline Calendar</h3></div>
      <div class="card-body" style="padding:16px;">
        ${months.map(m => {
          const monthDeadlines = deadlines.filter(d => d.date.startsWith(m.key)).sort((a, b) => a.date.localeCompare(b.date));
          if (!monthDeadlines.length) return '';
          return `<div style="margin-bottom:20px;">
            <h4 style="margin:0 0 10px;font-size:15px;font-weight:600;color:var(--text-primary);">${m.month} ${m.year}</h4>
            ${monthDeadlines.map(d => {
              const daysLeft = Math.ceil((new Date(d.date) - now) / 86400000);
              const urgent = daysLeft <= 14;
              return `<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;margin-bottom:4px;border-radius:6px;background:var(--bg-secondary);border:1px solid ${urgent ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'};">
                <span style="font-weight:700;font-size:14px;color:${urgent ? 'var(--red)' : 'var(--text-primary)'};min-width:60px;">${d.date.split('-')[2]}/${d.date.split('-')[1]}</span>
                <span class="funding-source-badge funding-source-${d.source}" style="min-width:80px;text-align:center;">${d.source.toUpperCase()}</span>
                <span style="font-size:13px;color:var(--text-primary);flex:1;">${escHtml(d.title)}</span>
                <span style="font-size:11px;font-weight:600;${urgent ? 'color:var(--red);' : 'color:var(--gray-500);'}">${daysLeft > 0 ? daysLeft + 'd' : 'PAST'}</span>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

async function renderFundingIntelligence() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-intelligence'));

  let intelligence = null;
  try {
    const res = await store._fetch(CONFIG.API_URL + '/funding/intelligence');
    intelligence = res.data;
  } catch (e) { /* fallback to static */ }

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="card">
        <div class="card-header"><h3 style="margin:0;">Federal Funding Trends</h3></div>
        <div class="card-body" style="padding:16px;">
          <div style="margin-bottom:12px;">
            ${[
              { label: 'SAMHSA Total MH Funding', value: '$7.5B', change: '+12%' },
              { label: 'HRSA BH Workforce', value: '$550M', change: '+8%' },
              { label: 'NIH Mental Health Research', value: '$2.3B', change: '+5%' },
              { label: 'DOJ MH Programs', value: '$180M', change: '+15%' },
            ].map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-color);">
              <span style="font-size:13px;color:var(--text-primary);">${t.label}</span>
              <div style="text-align:right;">
                <span style="font-weight:700;color:#10b981;margin-right:8px;">${t.value}</span>
                <span style="font-size:11px;color:#10b981;background:rgba(16,185,129,0.12);padding:1px 6px;border-radius:4px;">${t.change}</span>
              </div>
            </div>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--gray-500);margin-top:8px;">FY2026 appropriated amounts • Source: USAspending.gov</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 style="margin:0;">Top Funders in Your State</h3></div>
        <div class="card-body" style="padding:16px;">
          ${[
            { name: 'SAMHSA Block Grant (via State)', amount: '$45M', type: 'Federal Pass-through' },
            { name: 'State BH Authority', amount: '$12M', type: 'State Direct' },
            { name: 'County Mental Health Board', amount: '$3.5M', type: 'Local' },
            { name: 'BCBS Foundation', amount: '$2M', type: 'Foundation' },
            { name: 'United Way', amount: '$800K', type: 'Foundation' },
          ].map((f, i) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color);">
            <span style="font-size:18px;font-weight:700;color:var(--gray-600);min-width:24px;">${i + 1}</span>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:500;color:var(--text-primary);">${escHtml(f.name)}</div>
              <div style="font-size:11px;color:var(--gray-500);">${escHtml(f.type)}</div>
            </div>
            <span style="font-weight:700;color:#10b981;">${escHtml(f.amount)}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3 style="margin:0;">Key Insights</h3></div>
      <div class="card-body" style="padding:16px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">
          ${[
            { icon: '📈', title: 'CCBHC Expansion Surge', detail: 'SAMHSA expanded CCBHC to all 50 states. If your agency isn\'t a CCBHC, consider applying — enhanced reimbursement rates avg 30% higher.' },
            { icon: '🔄', title: '988 Funding Wave', detail: 'New 988 Suicide & Crisis Lifeline funding creating $1B+ in contracts for crisis services. Position for mobile crisis team RFPs.' },
            { icon: '💡', title: 'Telehealth MH Grants Growing', detail: 'Post-COVID telehealth grants up 200%. FCC, HRSA, and state BH authorities all funding virtual behavioral health expansion.' },
            { icon: '⚠️', title: 'Medicaid Unwinding Impact', detail: 'States reinvesting Medicaid savings into BH grants. Watch for new RFPs as states redirect funds from enrollment to services.' },
          ].map(insight => `<div style="padding:14px;border-radius:8px;background:var(--bg-secondary);border:1px solid var(--border-color);">
            <div style="font-size:20px;margin-bottom:6px;">${insight.icon}</div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">${escHtml(insight.title)}</div>
            <div style="font-size:12px;color:var(--gray-400);line-height:1.5;">${insight.detail}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

async function renderFundingDetail(id) {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.remove('active'));

  if (!id) {
    body.innerHTML = '<div class="empty-state"><h3>No opportunity selected</h3><p>Go back to the dashboard and click an opportunity.</p></div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400);">Loading opportunity details…</div>';

  let opp, related = [], pastAwards = [];
  try {
    const res = await store._fetch(CONFIG.API_URL + `/funding/opportunities/${id}`);
    opp = res.data;
    related = res.related || [];
    pastAwards = res.pastAwards || [];
  } catch (e) {
    body.innerHTML = '<div class="empty-state"><h3>Opportunity not found</h3><p>This opportunity may have been removed or the API is not available.</p><button class="btn" onclick="window.app.navigateTo(\'funding\')">← Back to Dashboard</button></div>';
    return;
  }

  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  if (pageTitle) pageTitle.textContent = opp.title;
  if (pageSubtitle) pageSubtitle.textContent = opp.agencySource || opp.source || '';

  const sourceLabel = mapSource(opp.source);
  const sourceColors = { federal: '#3b82f6', state: '#8b5cf6', foundation: '#f59e0b', va: '#ef4444' };
  const sColor = sourceColors[sourceLabel] || '#6b7280';
  const daysLeft = opp.closeDate ? Math.ceil((new Date(opp.closeDate) - new Date()) / 86400000) : null;
  const urgentStyle = daysLeft !== null && daysLeft <= 14 ? 'color:var(--red);' : 'color:#10b981;';
  const catLabels = { mental_health: 'Mental Health', substance_use: 'Substance Use', workforce: 'Workforce', crisis: 'Crisis Services', veterans: 'Veterans', youth: 'Youth', telehealth: 'Telehealth' };

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;">
      <!-- Main Content -->
      <div>
        <!-- Header Card -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-body" style="padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
              <div style="display:flex;gap:8px;align-items:center;">
                <span class="funding-source-badge funding-source-${sourceLabel}">${sourceLabel.toUpperCase()}</span>
                <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${opp.status === 'open' ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)'};color:${opp.status === 'open' ? '#10b981' : '#6b7280'};">${(opp.status || 'open').toUpperCase()}</span>
                ${opp.category ? `<span style="padding:2px 8px;border-radius:4px;font-size:10px;background:rgba(139,92,246,0.1);color:#8b5cf6;">${catLabels[opp.category] || opp.category}</span>` : ''}
              </div>
              ${opp.amountDisplay ? `<span style="font-size:20px;font-weight:700;color:#10b981;">${escHtml(opp.amountDisplay)}</span>` : ''}
            </div>

            <div style="display:flex;gap:12px;margin-top:16px;">
              <button class="btn" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:8px 20px;" onclick="window.app.trackFundingOpp(${opp.id}, '${escHtml(opp.title).replace(/'/g, "\\'")}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px;"><path d="M12 5l-7 7-3-3"/></svg>Track in Pipeline
              </button>
              ${opp.url ? `<a href="${escHtml(opp.url)}" target="_blank" class="btn" style="padding:8px 20px;text-decoration:none;">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px;"><path d="M7 2H2v12h12V9M14 1l-7 7M9 1h5v5"/></svg>View on ${opp.source === 'grants_gov' ? 'Grants.gov' : opp.source === 'sam_gov' ? 'SAM.gov' : opp.source === 'nih' ? 'NIH' : 'Source'}
              </a>` : ''}
              <button class="btn" style="padding:8px 20px;" onclick="window.print()">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px;"><path d="M4 4V1h8v3M4 11H2V7h12v4h-2M4 9h8v5H4z"/></svg>Print
              </button>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Description</h3></div>
          <div class="card-body" style="padding:20px;">
            <p style="margin:0;font-size:14px;line-height:1.7;color:var(--text-primary);">${escHtml(opp.description || 'No description available.')}</p>
          </div>
        </div>

        <!-- Grant Details -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Grant Details</h3></div>
          <div class="card-body" style="padding:0;">
            <table>
              <tbody>
                <tr><td style="font-weight:600;width:200px;color:var(--gray-400);">Source</td><td>${escHtml(opp.agencySource || opp.source || '—')}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">CFDA Number</td><td style="font-family:var(--font-mono);">${escHtml(opp.cfdaNumber || '—')}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Funding Type</td><td>${escHtml((opp.fundingType || '—').replace(/_/g, ' '))}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Award Floor</td><td>${opp.amountMin ? '$' + Number(opp.amountMin).toLocaleString() : '—'}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Award Ceiling</td><td>${opp.amountMax ? '$' + Number(opp.amountMax).toLocaleString() : '—'}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Category</td><td>${catLabels[opp.category] || opp.category || '—'}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Eligibility</td><td>${escHtml(opp.eligibility || 'See grant announcement for full eligibility requirements')}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Key Dates -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Key Dates</h3></div>
          <div class="card-body" style="padding:20px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;">
              <div style="text-align:center;padding:16px;border-radius:8px;background:var(--bg-secondary);border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Open Date</div>
                <div style="font-size:16px;font-weight:600;color:var(--text-primary);">${opp.openDate ? formatDateDisplay(opp.openDate) : '—'}</div>
              </div>
              <div style="text-align:center;padding:16px;border-radius:8px;background:${daysLeft !== null && daysLeft <= 14 ? 'rgba(239,68,68,0.08)' : 'var(--bg-secondary)'};border:1px solid ${daysLeft !== null && daysLeft <= 14 ? 'rgba(239,68,68,0.2)' : 'var(--border-color)'};">
                <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Close Date</div>
                <div style="font-size:16px;font-weight:600;${urgentStyle}">${opp.closeDate ? formatDateDisplay(opp.closeDate) : 'Rolling'}</div>
                ${daysLeft !== null ? `<div style="font-size:12px;margin-top:4px;${urgentStyle}">${daysLeft > 0 ? daysLeft + ' days remaining' : 'DEADLINE PASSED'}</div>` : ''}
              </div>
              <div style="text-align:center;padding:16px;border-radius:8px;background:var(--bg-secondary);border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Last Scraped</div>
                <div style="font-size:16px;font-weight:600;color:var(--text-primary);">${opp.scrapedAt ? formatDateDisplay(opp.scrapedAt) : '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Keywords -->
        ${(opp.keywords && opp.keywords.length) ? `
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Matched Keywords</h3></div>
          <div class="card-body" style="padding:16px;">
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${opp.keywords.map(k => `<span style="padding:3px 10px;border-radius:12px;font-size:11px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2);">${escHtml(k)}</span>`).join('')}
            </div>
          </div>
        </div>` : ''}

        <!-- Past Awards -->
        ${pastAwards.length ? `
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Past Awards (USASpending)</h3></div>
          <div class="card-body" style="padding:0;">
            <table>
              <thead><tr><th>Recipient</th><th>Agency</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                ${pastAwards.map(a => `<tr>
                  <td>${escHtml(a.title || '—')}</td>
                  <td>${escHtml(a.agencySource || '—')}</td>
                  <td style="font-weight:600;color:#10b981;">${escHtml(a.amountDisplay || (a.amountMax ? '$' + Number(a.amountMax).toLocaleString() : '—'))}</td>
                  <td style="font-size:12px;">${a.open_date ? formatDateDisplay(a.open_date) : '—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
      </div>

      <!-- Sidebar -->
      <div>
        <!-- Quick Actions -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Quick Actions</h3></div>
          <div class="card-body" style="padding:16px;">
            <button class="btn" style="width:100%;margin-bottom:8px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:10px;" onclick="window.app.trackFundingOpp(${opp.id}, '${escHtml(opp.title).replace(/'/g, "\\'")}')">
              Add to Pipeline
            </button>
            ${opp.url ? `<a href="${escHtml(opp.url)}" target="_blank" class="btn" style="width:100%;margin-bottom:8px;display:block;text-align:center;text-decoration:none;padding:10px;">
              Open Original Listing
            </a>` : ''}
            <button class="btn" style="width:100%;padding:10px;" onclick="window.app.navigateTo('funding-pipeline')">
              View Pipeline
            </button>
          </div>
        </div>

        <!-- Agency Match Score -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Agency Match</h3></div>
          <div class="card-body" style="padding:16px;text-align:center;">
            <div style="width:80px;height:80px;border-radius:50%;border:4px solid #10b981;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
              <span style="font-size:24px;font-weight:700;color:#10b981;">—</span>
            </div>
            <div style="font-size:12px;color:var(--gray-400);margin-bottom:12px;">Match scoring available after agency profile setup</div>
            <div style="text-align:left;font-size:12px;">
              <div style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="color:var(--gray-500);">☐</span> Service area matches</div>
              <div style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="color:var(--gray-500);">☐</span> Organization type eligible</div>
              <div style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="color:var(--gray-500);">☐</span> Revenue within range</div>
              <div style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="color:var(--gray-500);">☐</span> Required certifications</div>
            </div>
          </div>
        </div>

        <!-- Related Opportunities -->
        ${related.length ? `
        <div class="card">
          <div class="card-header"><h3 style="margin:0;">Related Opportunities</h3></div>
          <div class="card-body" style="padding:0;">
            ${related.map(r => `<div style="padding:10px 16px;border-bottom:1px solid var(--border-color);cursor:pointer;" onclick="window.app.viewFundingDetail(${r.id})">
              <div style="font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:2px;">${escHtml((r.title || '').substring(0, 50))}${(r.title || '').length > 50 ? '…' : ''}</div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-500);">
                <span>${escHtml(r.agencySource || r.source || '')}</span>
                <span style="color:#10b981;font-weight:600;">${escHtml(r.amountDisplay || '')}</span>
              </div>
            </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>
  `;
}

function openFundingApplicationModal() {
  showToast('Application tracking coming soon — track your grant applications from draft to award.', 'info');
}
