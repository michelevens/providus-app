// ui/pages/analytics-hub.js — Unified Analytics & Strategy page
// One page, tab bar at top, delegates to existing renderers

if (typeof window._analyticsTab === 'undefined') window._analyticsTab = 'bottleneck';

const ANALYTICS_TABS = [
  { key: 'bottleneck',       label: 'Pipeline Analytics' },
  { key: 'forecast',         label: 'Revenue Forecast' },
  { key: 'coverage',         label: 'Coverage Matrix' },
  { key: 'reimbursement',    label: 'Reimbursement' },
  { key: 'policies',         label: 'State Policies' },
  { key: 'renewal-calendar', label: 'Renewal Calendar' },
  { key: 'service-lines',    label: 'Service Lines' },
];

export async function renderAnalyticsHubPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading Analytics...</div></div>';

  const tab = window._analyticsTab || 'bottleneck';
  const R = window._appRender;

  switch (tab) {
    case 'bottleneck':       await R.renderBottleneckAnalysis(); break;
    case 'forecast':         await R.renderRevenueForecast(); break;
    case 'coverage':         await R.renderCoverageMatrix(); break;
    case 'reimbursement':    await R.renderReimbursement(); break;
    case 'policies':         await R.renderStatePolicies(); break;
    case 'renewal-calendar': await R.renderRenewalCalendar(); break;
    case 'service-lines':    await R.renderServiceLines(); break;
    default:                 await R.renderBottleneckAnalysis(); break;
  }

  // Inject unified tab bar
  const existingContent = body.innerHTML;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = existingContent;
  const subTabs = tempDiv.querySelector('.tabs');
  if (subTabs) subTabs.remove();

  const tabBar = `
    <style>
      .ana-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;}
      .ana-tab{padding:8px 14px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .ana-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .ana-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>
    <div class="ana-tabs">
      ${ANALYTICS_TABS.map(t => `<button class="ana-tab ${tab === t.key ? 'active' : ''}" onclick="window.app.analyticsSwitchTab('${t.key}')">${t.label}</button>`).join('')}
    </div>
  `;

  body.innerHTML = tabBar + tempDiv.innerHTML;
}
