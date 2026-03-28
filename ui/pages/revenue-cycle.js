// ui/pages/revenue-cycle.js — Unified Revenue Cycle page
// One page, one data fetch, all tabs rendered inline, CSS-only switching

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, navigateTo, appConfirm, editButton } = window._credentik;

// Re-export constants from sub-modules for handlers
export { ACTIVITY_TYPES, TASK_CATEGORIES } from './billing-services.js';
export { CLAIM_STATUSES, DENIAL_CATEGORIES, DENIAL_STATUSES, CPT_CODES, ICD_CODES } from './rcm.js';

// Import renderers from sub-modules
import { renderBillingServicesPage, renderBillingClientDetail } from './billing-services.js';
import { renderRcmPage } from './rcm.js';
import { renderFeeSchedulesTab, renderEligibilityTab, renderStatementsTab, renderClientReportsSection, renderPayerIntelligenceTab, renderProviderFeedbackTab } from './rcm-phase2.js';

if (typeof window._rcTab === 'undefined') window._rcTab = 'dashboard';

async function renderRevenueCyclePage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading Revenue Cycle...</div></div>';

  const tab = window._rcTab || 'dashboard';

  // Determine which sub-module to render based on tab
  const bsTabs = ['dashboard', 'clients', 'tasks', 'activity', 'financials'];
  const rcmTabs = ['claims', 'charges', 'denials', 'payments', 'ar'];
  const phase2Tabs = ['fee-schedules', 'eligibility', 'statements', 'payer-intel', 'provider-feedback'];

  // Set the sub-module tab state
  if (bsTabs.includes(tab)) {
    window._bsTab = tab;
  } else if (rcmTabs.includes(tab)) {
    window._rcmTab = tab;
  }

  // Render the active sub-module directly into page-body
  if (phase2Tabs.includes(tab)) {
    // Phase 2 tabs render directly into body
    if (tab === 'fee-schedules') await renderFeeSchedulesTab(body);
    else if (tab === 'eligibility') await renderEligibilityTab(body);
    else if (tab === 'statements') await renderStatementsTab(body);
    else if (tab === 'payer-intel') await renderPayerIntelligenceTab(body);
    else if (tab === 'provider-feedback') await renderProviderFeedbackTab(body);
  } else if (bsTabs.includes(tab)) {
    await renderBillingServicesPage();
  } else {
    await renderRcmPage();
  }

  // Now inject our unified tab bar at the top of the rendered content
  const existingContent = body.innerHTML;

  // Remove the sub-module's own tab bar
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = existingContent;
  const subTabs = tempDiv.querySelector('.tabs');
  if (subTabs) subTabs.remove();

  // Get counts from the rendered page for tab labels
  const clientCount = (window._bsClients || []).length;
  const claimCount = (window._rcmClaims || []).length;
  const chargeCount = (window._rcmCharges || []).length;
  const denialCount = (window._rcmDenials || []).length;
  const paymentCount = (window._rcmPayments || []).length;
  const taskCount = (window._bsTasks || []).filter(t => t.status !== 'completed').length;

  const tabBar = `
    <style>
      .rc-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;}
      .rc-tab{padding:8px 10px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .rc-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .rc-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>
    <div class="rc-tabs">
      <button class="rc-tab ${tab === 'dashboard' ? 'active' : ''}" onclick="window.app.rcSwitchTab('dashboard')">Dashboard</button>
      <button class="rc-tab ${tab === 'clients' ? 'active' : ''}" onclick="window.app.rcSwitchTab('clients')">Clients (${clientCount})</button>
      <button class="rc-tab ${tab === 'claims' ? 'active' : ''}" onclick="window.app.rcSwitchTab('claims')">Claims (${claimCount})</button>
      <button class="rc-tab ${tab === 'charges' ? 'active' : ''}" onclick="window.app.rcSwitchTab('charges')">Charges (${chargeCount})</button>
      <button class="rc-tab ${tab === 'denials' ? 'active' : ''}" onclick="window.app.rcSwitchTab('denials')">Denials (${denialCount})</button>
      <button class="rc-tab ${tab === 'payments' ? 'active' : ''}" onclick="window.app.rcSwitchTab('payments')">Payments (${paymentCount})</button>
      <button class="rc-tab ${tab === 'ar' ? 'active' : ''}" onclick="window.app.rcSwitchTab('ar')">A/R Aging</button>
      <button class="rc-tab ${tab === 'fee-schedules' ? 'active' : ''}" onclick="window.app.rcSwitchTab('fee-schedules')">Fee Schedules</button>
      <button class="rc-tab ${tab === 'eligibility' ? 'active' : ''}" onclick="window.app.rcSwitchTab('eligibility')">Eligibility</button>
      <button class="rc-tab ${tab === 'statements' ? 'active' : ''}" onclick="window.app.rcSwitchTab('statements')">Statements</button>
      <button class="rc-tab ${tab === 'payer-intel' ? 'active' : ''}" onclick="window.app.rcSwitchTab('payer-intel')">Payer Intel</button>
      <button class="rc-tab ${tab === 'provider-feedback' ? 'active' : ''}" onclick="window.app.rcSwitchTab('provider-feedback')">Feedback</button>
      <button class="rc-tab ${tab === 'tasks' ? 'active' : ''}" onclick="window.app.rcSwitchTab('tasks')">Tasks (${taskCount})</button>
      <button class="rc-tab ${tab === 'activity' ? 'active' : ''}" onclick="window.app.rcSwitchTab('activity')">Activity</button>
      <button class="rc-tab ${tab === 'financials' ? 'active' : ''}" onclick="window.app.rcSwitchTab('financials')">Financials</button>
    </div>
  `;

  body.innerHTML = tabBar + tempDiv.innerHTML;
}

function rcSwitchTab(tab) {
  window._rcTab = tab;
  // Re-render the page with the new tab — data is cached so it's fast
  renderRevenueCyclePage();
}

export { renderRevenueCyclePage, rcSwitchTab, renderBillingClientDetail };
