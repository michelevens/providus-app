// ui/pages/analytics-hub.js — Unified Analytics & Strategy page
// One page, tab bar at top, delegates to existing renderers

import store from '../../core/store.js';

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

// Collections that, when mutated, should trigger an Analytics re-render.
const REACTIVE_COLLECTIONS = new Set([
  'applications', 'licenses', 'providers', 'payers', 'organizations', 'facilities',
]);

let _activeListenerToken = null;
let _renderInFlight = false;
let _pendingRefresh = false;
let _lastDataChangeAt = 0;

function _onStoreMutation(evt) {
  if (!evt || !REACTIVE_COLLECTIONS.has(evt.collection)) return;
  _lastDataChangeAt = Date.now();
  // Coalesce bursts (e.g. bulk import firing many created events).
  if (_renderInFlight) { _pendingRefresh = true; return; }
  _scheduleRefresh();
}

const ANALYTICS_PAGE_KEYS = new Set([
  'analytics', 'bottleneck', 'forecast', 'coverage', 'reimbursement',
  'policies', 'renewal-calendar', 'service-lines',
]);

function _scheduleRefresh() {
  // Debounce 250ms so a flurry of mutations triggers one re-render.
  clearTimeout(_scheduleRefresh._t);
  _scheduleRefresh._t = setTimeout(async () => {
    if (!ANALYTICS_PAGE_KEYS.has(document.body.dataset.currentPage)) return;
    _renderInFlight = true;
    try { await renderAnalyticsHubPage({ silent: true }); }
    finally {
      _renderInFlight = false;
      if (_pendingRefresh) { _pendingRefresh = false; _scheduleRefresh(); }
    }
  }, 250);
}

function _attachListeners() {
  if (_activeListenerToken) return; // already attached
  store.on('created', _onStoreMutation);
  store.on('updated', _onStoreMutation);
  store.on('deleted', _onStoreMutation);
  _activeListenerToken = true;
}

export async function renderAnalyticsHubPage(opts = {}) {
  const body = document.getElementById('page-body');
  if (!opts.silent) {
    body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading Analytics...</div></div>';
  }

  _attachListeners();

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

  const freshnessLabel = _lastDataChangeAt
    ? `Updated ${_relTime(_lastDataChangeAt)}`
    : 'Live';

  // Inject unified tab bar (preserve sub-page internal tabs)
  const tabBar = `
    <style>
      .ana-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;align-items:center;}
      .ana-tab{padding:8px 14px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .ana-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .ana-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
      .ana-fresh{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--gray-500);padding:4px 10px;}
      .ana-fresh-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px #22c55e22;}
    </style>
    <div class="ana-tabs">
      ${ANALYTICS_TABS.map(t => `<button class="ana-tab ${tab === t.key ? 'active' : ''}" onclick="window.app.analyticsSwitchTab('${t.key}')">${t.label}</button>`).join('')}
      <span class="ana-fresh" title="Analytics auto-refresh on data changes in this tab"><span class="ana-fresh-dot"></span>${freshnessLabel}</span>
    </div>
  `;

  body.innerHTML = tabBar + body.innerHTML;
}

function _relTime(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
