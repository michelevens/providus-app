// ui/pages/compliance-hub.js — Unified Compliance page
// One page, tab bar at top, delegates to existing renderers

if (typeof window._compTab === 'undefined') window._compTab = 'compliance';

const COMP_TABS = [
  { key: 'compliance',  label: 'Compliance Center' },
  { key: 'exclusions',  label: 'Exclusion Screening' },
  { key: 'psv',         label: 'Verification (PSV)' },
  { key: 'monitoring',  label: 'Continuous Monitoring' },
  { key: 'licenses',    label: 'Licenses' },
];

export async function renderComplianceHubPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading Compliance...</div></div>';

  const tab = window._compTab || 'compliance';
  const R = window._appRender;

  switch (tab) {
    case 'compliance':  await R.renderCompliancePage(); break;
    case 'exclusions':  await R.renderExclusionsPage(); break;
    case 'psv':         await R.renderPSVPage(); break;
    case 'monitoring':  await R.renderMonitoringPage(); break;
    case 'licenses':    await R.renderLicenses(); break;
    default:            await R.renderCompliancePage(); break;
  }

  // Inject unified tab bar
  const existingContent = body.innerHTML;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = existingContent;
  const subTabs = tempDiv.querySelector('.tabs');
  if (subTabs) subTabs.remove();

  const tabBar = `
    <style>
      .comp-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;}
      .comp-tab{padding:8px 14px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .comp-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .comp-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>
    <div class="comp-tabs">
      ${COMP_TABS.map(t => `<button class="comp-tab ${tab === t.key ? 'active' : ''}" onclick="window.app.compSwitchTab('${t.key}')">${t.label}</button>`).join('')}
    </div>
  `;

  body.innerHTML = tabBar + tempDiv.innerHTML;
}
