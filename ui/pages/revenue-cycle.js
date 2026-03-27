// ui/pages/revenue-cycle.js — Unified Revenue Cycle page
// Merges Billing Services + Claims & RCM into one page

const { store, showToast } = window._credentik;

if (typeof window._rcTab === 'undefined') window._rcTab = 'dashboard';

async function renderRevenueCyclePage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  // Load ALL data from both modules
  let bsLoaded = false, rcmLoaded = false;

  // Load billing services data
  try { await (await import('./billing-services.js')).renderBillingServicesPage.__proto__; } catch {}
  // Load RCM data
  try { await (await import('./rcm.js')).renderRcmPage.__proto__; } catch {}

  // Now render the unified page with tabs that lazy-load each section
  const bsMod = await import('./billing-services.js');
  const rcmMod = await import('./rcm.js');

  // Determine which tab to show
  const tab = window._rcTab || 'dashboard';

  body.innerHTML = `
    <style>
      .rc-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;}
      .rc-tab{padding:10px 18px;font-size:13px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .rc-tab:hover{color:var(--brand-600);}
      .rc-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>

    <div class="rc-tabs">
      <button class="rc-tab ${tab === 'dashboard' ? 'active' : ''}" onclick="window.app.rcSwitchTab('dashboard')">Dashboard</button>
      <button class="rc-tab ${tab === 'clients' ? 'active' : ''}" onclick="window.app.rcSwitchTab('clients')">Clients</button>
      <button class="rc-tab ${tab === 'claims' ? 'active' : ''}" onclick="window.app.rcSwitchTab('claims')">Claims</button>
      <button class="rc-tab ${tab === 'charges' ? 'active' : ''}" onclick="window.app.rcSwitchTab('charges')">Charges</button>
      <button class="rc-tab ${tab === 'denials' ? 'active' : ''}" onclick="window.app.rcSwitchTab('denials')">Denials</button>
      <button class="rc-tab ${tab === 'payments' ? 'active' : ''}" onclick="window.app.rcSwitchTab('payments')">Payments</button>
      <button class="rc-tab ${tab === 'ar' ? 'active' : ''}" onclick="window.app.rcSwitchTab('ar')">A/R Aging</button>
      <button class="rc-tab ${tab === 'tasks' ? 'active' : ''}" onclick="window.app.rcSwitchTab('tasks')">Tasks</button>
      <button class="rc-tab ${tab === 'activity' ? 'active' : ''}" onclick="window.app.rcSwitchTab('activity')">Activity</button>
      <button class="rc-tab ${tab === 'financials' ? 'active' : ''}" onclick="window.app.rcSwitchTab('financials')">Financials</button>
    </div>

    <div id="rc-content"></div>
  `;

  // Render the active tab
  await _renderRcTabContent(tab);
}

async function _renderRcTabContent(tab) {
  const container = document.getElementById('rc-content');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:32px;"><div class="spinner"></div></div>';

  if (tab === 'dashboard' || tab === 'clients' || tab === 'tasks' || tab === 'activity' || tab === 'financials') {
    // Use billing-services module — set its tab and render
    window._bsTab = tab;
    const mod = await import('./billing-services.js');
    // We need to render into the rc-content div, so temporarily swap page-body
    const realBody = document.getElementById('page-body');
    const tempDiv = document.createElement('div');
    tempDiv.id = 'page-body';
    realBody.parentNode.insertBefore(tempDiv, realBody);
    realBody.style.display = 'none';

    await mod.renderBillingServicesPage();

    // Move the rendered content into our container
    container.innerHTML = tempDiv.querySelector('#page-body')?.innerHTML || tempDiv.innerHTML;

    // Restore
    tempDiv.remove();
    realBody.style.display = '';

    // The billing services page creates its own tabs — hide them since we have ours
    const bsTabs = container.querySelector('.tabs');
    if (bsTabs) bsTabs.style.display = 'none';

    // Show only the relevant tab content
    const tabMap = { dashboard: 'bs-dashboard', clients: 'bs-clients', tasks: 'bs-tasks', activity: 'bs-activity', financials: 'bs-financials' };
    const targetId = tabMap[tab];
    if (targetId) {
      container.querySelectorAll('[id^="bs-"]').forEach(el => {
        el.classList.toggle('hidden', el.id !== targetId);
      });
      const target = container.querySelector('#' + targetId);
      if (target) target.classList.remove('hidden');
    }
  } else {
    // Use RCM module — set its tab and render
    window._rcmTab = tab;
    const mod = await import('./rcm.js');

    const realBody = document.getElementById('page-body');
    const tempDiv = document.createElement('div');
    tempDiv.id = 'page-body';
    realBody.parentNode.insertBefore(tempDiv, realBody);
    realBody.style.display = 'none';

    await mod.renderRcmPage();

    container.innerHTML = tempDiv.querySelector('#page-body')?.innerHTML || tempDiv.innerHTML;

    tempDiv.remove();
    realBody.style.display = '';

    // Hide the RCM tabs and stats row since we have our own
    const rcmTabs = container.querySelector('.tabs');
    if (rcmTabs) rcmTabs.style.display = 'none';

    // Show only the relevant tab content
    const tabMap = { claims: 'rcm-claims', charges: 'rcm-charges', denials: 'rcm-denials', payments: 'rcm-payments', ar: 'rcm-ar' };
    const targetId = tabMap[tab];
    if (targetId) {
      container.querySelectorAll('[id^="rcm-"]').forEach(el => {
        if (el.id.startsWith('rcm-') && !el.id.includes('modal') && !el.id.includes('tbody') && !el.id.includes('stat') && !el.id.includes('claim-') && !el.id.includes('denial-') && !el.id.includes('pay-') && !el.id.includes('qc-')) {
          el.classList.toggle('hidden', el.id !== targetId);
        }
      });
      const target = container.querySelector('#' + targetId);
      if (target) target.classList.remove('hidden');
    }
  }
}

export { renderRevenueCyclePage, _renderRcTabContent };
