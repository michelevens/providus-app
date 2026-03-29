// ui/pages/admin-hub.js — Unified Admin page
// One page, tab bar at top, delegates to existing renderers

if (typeof window._adminTab === 'undefined') window._adminTab = 'settings';

const ADMIN_TABS = [
  { key: 'settings',    label: 'Settings' },
  { key: 'billing',     label: 'Billing & Invoicing' },
  { key: 'contracts',   label: 'Contracts' },
  { key: 'payers',      label: 'Payers' },
  { key: 'users',       label: 'Users' },
  { key: 'onboarding',  label: 'Onboarding' },
  { key: 'import',      label: 'Bulk Import' },
  { key: 'automations', label: 'Automations' },
  { key: 'faq',         label: 'Knowledge Base' },
  { key: 'api-docs',    label: 'API Docs' },
];

export async function renderAdminHubPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading Admin...</div></div>';

  const tab = window._adminTab || 'settings';
  const R = window._appRender;

  switch (tab) {
    case 'settings':    await R.renderSettings(); break;
    case 'billing':     await R.renderBillingPage(); break;
    case 'contracts':   await R.renderContractsPage(); break;
    case 'payers':      await R.renderPayers(); break;
    case 'users':       await R.renderUsersStub(); break;
    case 'onboarding':  await R.renderOnboardingStub(); break;
    case 'import':      await R.renderImportPage(); break;
    case 'automations': await R.renderAutomationsPage(); break;
    case 'faq':         await R.renderFaqPage(); break;
    case 'api-docs':    await R.renderApiDocsPage(); break;
    default:            await R.renderSettings(); break;
  }

  // Inject unified tab bar (preserve sub-page internal tabs)
  const tabBar = `
    <style>
      .adm-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;}
      .adm-tab{padding:8px 10px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .adm-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .adm-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>
    <div class="adm-tabs">
      ${ADMIN_TABS.map(t => `<button class="adm-tab ${tab === t.key ? 'active' : ''}" onclick="window.app.adminSwitchTab('${t.key}')">${t.label}</button>`).join('')}
    </div>
  `;

  body.innerHTML = tabBar + body.innerHTML;
}
