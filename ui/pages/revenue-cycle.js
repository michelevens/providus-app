// ui/pages/revenue-cycle.js — Unified Revenue Cycle page
// Single page, all data loaded once, tabs switch via CSS only

import { renderBillingServicesPage, renderBillingClientDetail, ACTIVITY_TYPES, TASK_CATEGORIES } from './billing-services.js';
import { renderRcmPage, CLAIM_STATUSES, DENIAL_CATEGORIES, DENIAL_STATUSES, CPT_CODES, ICD_CODES } from './rcm.js';

const { store, escHtml, escAttr, formatDateDisplay, showToast, navigateTo } = window._credentik;

if (typeof window._rcTab === 'undefined') window._rcTab = 'dashboard';

async function renderRevenueCyclePage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading Revenue Cycle...</div></div>';

  // ── Load ALL data in parallel ──
  const [
    bsStats, clients, tasks, activities, bsFinancials, orgs,
    claimStats, claims, denialStats, denials, payments, charges, arData, providers
  ] = await Promise.all([
    store.getBillingClientStats().catch(() => ({})),
    store.getBillingClients().catch(() => []),
    store.getBillingTasks().catch(() => []),
    store.getBillingActivities({ limit: 100 }).catch(() => []),
    store.getBillingFinancials({}).catch(() => []),
    store.getAll('organizations').catch(() => []),
    store.getRcmClaimStats().catch(() => ({})),
    store.getRcmClaims().catch(() => []),
    store.getRcmDenialStats().catch(() => ({})),
    store.getRcmDenials().catch(() => []),
    store.getRcmPayments().catch(() => []),
    store.getRcmCharges().catch(() => []),
    store.getRcmArAging().catch(() => ({})),
    store.getAll('providers').catch(() => []),
  ]);

  const payers = window.PAYER_CATALOG || [];

  // Normalize arrays
  const c = (a) => Array.isArray(a) ? a : [];
  const cl = c(clients), tk = c(tasks), ac = c(activities), fi = c(bsFinancials);
  const cm = c(claims), dn = c(denials), pm = c(payments), ch = c(charges);
  const pr = c(providers), og = c(orgs);

  // Store for handlers
  window._bsClients = cl; window._bsTasks = tk; window._bsActivities = ac; window._bsOrgs = og;
  window._rcmClaims = cm; window._rcmDenials = dn; window._rcmPayments = pm; window._rcmCharges = ch;
  window._rcmProviders = pr; window._rcmPayers = payers; window._rcmClients = cl;

  const tab = window._rcTab || 'dashboard';

  // Now render individual tab pages into their own containers
  // We do this by temporarily setting up the billing-services and rcm pages
  // and capturing their output

  // Set billing services tab to dashboard and render
  window._bsTab = 'dashboard';
  window._rcmTab = 'claims';

  body.innerHTML = `
    <style>
      .rc-tabs{display:flex;gap:0;margin-bottom:0;border-bottom:2px solid var(--gray-200);overflow-x:auto;background:var(--surface-card,#fff);margin:-20px -24px 20px;padding:0 24px;}
      .rc-tab{padding:12px 16px;font-size:13px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .rc-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .rc-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
      .rc-tab-content{display:none;}
      .rc-tab-content.active{display:block;}
    </style>

    <div class="rc-tabs">
      <button class="rc-tab ${tab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" onclick="window.app.rcSwitchTab('dashboard')">Dashboard</button>
      <button class="rc-tab ${tab === 'clients' ? 'active' : ''}" data-tab="clients" onclick="window.app.rcSwitchTab('clients')">Clients (${cl.length})</button>
      <button class="rc-tab ${tab === 'claims' ? 'active' : ''}" data-tab="claims" onclick="window.app.rcSwitchTab('claims')">Claims (${cm.length})</button>
      <button class="rc-tab ${tab === 'charges' ? 'active' : ''}" data-tab="charges" onclick="window.app.rcSwitchTab('charges')">Charges (${ch.length})</button>
      <button class="rc-tab ${tab === 'denials' ? 'active' : ''}" data-tab="denials" onclick="window.app.rcSwitchTab('denials')">Denials (${dn.length})</button>
      <button class="rc-tab ${tab === 'payments' ? 'active' : ''}" data-tab="payments" onclick="window.app.rcSwitchTab('payments')">Payments (${pm.length})</button>
      <button class="rc-tab ${tab === 'ar' ? 'active' : ''}" data-tab="ar" onclick="window.app.rcSwitchTab('ar')">A/R Aging</button>
      <button class="rc-tab ${tab === 'tasks' ? 'active' : ''}" data-tab="tasks" onclick="window.app.rcSwitchTab('tasks')">Tasks (${tk.filter(t => t.status !== 'completed').length})</button>
      <button class="rc-tab ${tab === 'activity' ? 'active' : ''}" data-tab="activity" onclick="window.app.rcSwitchTab('activity')">Activity</button>
      <button class="rc-tab ${tab === 'financials' ? 'active' : ''}" data-tab="financials" onclick="window.app.rcSwitchTab('financials')">Financials</button>
    </div>

    <div id="rc-tab-dashboard" class="rc-tab-content ${tab === 'dashboard' ? 'active' : ''}"><div id="rc-bs-render"></div></div>
    <div id="rc-tab-clients" class="rc-tab-content ${tab === 'clients' ? 'active' : ''}"><div id="rc-bs-clients-render"></div></div>
    <div id="rc-tab-claims" class="rc-tab-content ${tab === 'claims' ? 'active' : ''}"><div id="rc-rcm-claims-render"></div></div>
    <div id="rc-tab-charges" class="rc-tab-content ${tab === 'charges' ? 'active' : ''}"><div id="rc-rcm-charges-render"></div></div>
    <div id="rc-tab-denials" class="rc-tab-content ${tab === 'denials' ? 'active' : ''}"><div id="rc-rcm-denials-render"></div></div>
    <div id="rc-tab-payments" class="rc-tab-content ${tab === 'payments' ? 'active' : ''}"><div id="rc-rcm-payments-render"></div></div>
    <div id="rc-tab-ar" class="rc-tab-content ${tab === 'ar' ? 'active' : ''}"><div id="rc-rcm-ar-render"></div></div>
    <div id="rc-tab-tasks" class="rc-tab-content ${tab === 'tasks' ? 'active' : ''}"><div id="rc-bs-tasks-render"></div></div>
    <div id="rc-tab-activity" class="rc-tab-content ${tab === 'activity' ? 'active' : ''}"><div id="rc-bs-activity-render"></div></div>
    <div id="rc-tab-financials" class="rc-tab-content ${tab === 'financials' ? 'active' : ''}"><div id="rc-bs-financials-render"></div></div>
  `;

  // Now render billing-services page into a hidden div, extract tab contents
  const bsTempDiv = document.createElement('div');
  bsTempDiv.id = 'page-body';
  bsTempDiv.style.display = 'none';
  document.body.appendChild(bsTempDiv);
  await renderBillingServicesPage();

  // Extract each billing services tab content
  const bsDashboard = bsTempDiv.querySelector('#bs-dashboard');
  const bsClients = bsTempDiv.querySelector('#bs-clients');
  const bsTasks = bsTempDiv.querySelector('#bs-tasks');
  const bsActivity = bsTempDiv.querySelector('#bs-activity');
  const bsFinancialsEl = bsTempDiv.querySelector('#bs-financials');

  if (bsDashboard) document.getElementById('rc-bs-render').innerHTML = bsDashboard.innerHTML;
  if (bsClients) document.getElementById('rc-bs-clients-render').innerHTML = bsClients.innerHTML;
  if (bsTasks) document.getElementById('rc-bs-tasks-render').innerHTML = bsTasks.innerHTML;
  if (bsActivity) document.getElementById('rc-bs-activity-render').innerHTML = bsActivity.innerHTML;
  if (bsFinancialsEl) document.getElementById('rc-bs-financials-render').innerHTML = bsFinancialsEl.innerHTML;

  // Also grab any modals that were rendered
  const bsModals = bsTempDiv.querySelectorAll('.modal-overlay');
  bsModals.forEach(m => { if (!document.getElementById(m.id)) body.appendChild(m.cloneNode(true)); });

  bsTempDiv.remove();

  // Now render RCM page into a hidden div, extract tab contents
  const rcmTempDiv = document.createElement('div');
  rcmTempDiv.id = 'page-body';
  rcmTempDiv.style.display = 'none';
  document.body.appendChild(rcmTempDiv);
  await renderRcmPage();

  const rcmClaims = rcmTempDiv.querySelector('#rcm-claims');
  const rcmCharges = rcmTempDiv.querySelector('#rcm-charges');
  const rcmDenials = rcmTempDiv.querySelector('#rcm-denials');
  const rcmPayments = rcmTempDiv.querySelector('#rcm-payments');
  const rcmAr = rcmTempDiv.querySelector('#rcm-ar');

  if (rcmClaims) document.getElementById('rc-rcm-claims-render').innerHTML = rcmClaims.innerHTML;
  if (rcmCharges) document.getElementById('rc-rcm-charges-render').innerHTML = rcmCharges.innerHTML;
  if (rcmDenials) document.getElementById('rc-rcm-denials-render').innerHTML = rcmDenials.innerHTML;
  if (rcmPayments) document.getElementById('rc-rcm-payments-render').innerHTML = rcmPayments.innerHTML;
  if (rcmAr) document.getElementById('rc-rcm-ar-render').innerHTML = rcmAr.innerHTML;

  // Grab RCM modals
  const rcmModals = rcmTempDiv.querySelectorAll('.modal-overlay');
  rcmModals.forEach(m => { if (!document.getElementById(m.id)) body.appendChild(m.cloneNode(true)); });

  rcmTempDiv.remove();

  // Restore the real page-body id
  body.id = 'page-body';
}

function rcSwitchTab(tab) {
  window._rcTab = tab;
  // CSS-only switch — instant, no re-render
  document.querySelectorAll('.rc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.rc-tab-content').forEach(el => el.classList.toggle('active', el.id === 'rc-tab-' + tab));
}

export { renderRevenueCyclePage, rcSwitchTab };
