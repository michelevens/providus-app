// ui/pages/healthcare-credentialing.js — Unified Healthcare Credentialing page
// One page, tab bar at top, delegates to existing renderers in app.js

if (typeof window._credTab === 'undefined') window._credTab = 'dashboard';

const CRED_TABS = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'providers',    label: 'Providers' },
  { key: 'applications', label: 'Applications' },
  { key: 'followups',    label: 'Follow-ups' },
  { key: 'licenses',     label: 'Licenses' },
  { key: 'locations',    label: 'Locations' },
];

export async function renderCredentialingPage() {
  const body = document.getElementById('page-body');
  const tab = window._credTab || 'dashboard';

  // Build tab bar first
  const tabBar = `
    <style>
      .cred-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;}
      .cred-tab{padding:8px 14px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .cred-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .cred-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>
    <div class="cred-tabs" id="cred-hub-tabs">
      ${CRED_TABS.map(t => `<button class="cred-tab ${tab === t.key ? 'active' : ''}" onclick="window.app.credSwitchTab('${t.key}')">${t.label}</button>`).join('')}
    </div>
  `;

  // Set tab bar + spinner, then render content below
  body.innerHTML = tabBar + '<div id="cred-hub-content"><div style="text-align:center;padding:48px;"><div class="spinner"></div></div></div>';

  const R = window._appRender;

  // Render the active sub-tab
  switch (tab) {
    case 'dashboard':    await R.renderDashboard(); break;
    case 'providers':    await R.renderProviders(); break;
    case 'applications': await R.renderApplications(); break;
    case 'followups':    await R.renderFollowups(); break;
    case 'licenses':     await R.renderLicenses(); break;
    case 'locations':    await R.renderFacilitiesPage(); break;
    default:             await R.renderDashboard(); break;
  }

  // If the sub-renderer overwrote body.innerHTML (removing our tabs), re-inject
  if (!document.getElementById('cred-hub-tabs')) {
    body.innerHTML = tabBar + body.innerHTML;
  }
}
