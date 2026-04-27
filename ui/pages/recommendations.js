// ui/pages/recommendations.js — Recommendations Inbox
// Shows everything the recommendations engine has produced, grouped by severity
// and type. Reactive to data changes.

import store from '../../core/store.js';
import recommendations, {
  computeRecommendations,
  dismissRecommendation,
  undismissRecommendation,
  REC_TYPE_LABELS,
  REC_SEVERITY_COLORS,
} from '../../core/recommendations.js';

if (typeof window._recFilter === 'undefined') window._recFilter = { severity: 'all', type: 'all', showDismissed: false };

const REACTIVE_COLLECTIONS = new Set([
  'applications', 'licenses', 'providers', 'payers', 'rcm_claims', 'activity_logs',
]);

let _listenersAttached = false;
let _renderInFlight = false;
let _pendingRefresh = false;

function _onMutation(evt) {
  if (!evt || !REACTIVE_COLLECTIONS.has(evt.collection)) return;
  if (document.body.dataset.currentPage !== 'recommendations') return;
  if (_renderInFlight) { _pendingRefresh = true; return; }
  clearTimeout(_onMutation._t);
  _onMutation._t = setTimeout(() => renderRecommendationsPage(), 250);
}

function _attachListeners() {
  if (_listenersAttached) return;
  store.on('created', _onMutation);
  store.on('updated', _onMutation);
  store.on('deleted', _onMutation);
  _listenersAttached = true;
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Update the sidebar badge with the count of open critical+high recommendations.
export async function updateRecommendationsBadge() {
  try {
    const { items } = await computeRecommendations();
    const count = items.filter(r => r.severity === 'critical' || r.severity === 'high').length;
    const badge = document.getElementById('rec-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

export async function renderRecommendationsPage() {
  const body = document.getElementById('page-body');
  if (!body) return;

  _attachListeners();
  _renderInFlight = true;
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Computing recommendations...</div></div>';

  let result;
  try {
    result = await computeRecommendations({ includeDismissed: window._recFilter.showDismissed });
  } catch (e) {
    body.innerHTML = `<div class="alert alert-warning" style="margin:24px;"><strong>Failed to compute recommendations.</strong> ${escHtml(e.message || '')}</div>`;
    _renderInFlight = false;
    return;
  } finally {
    _renderInFlight = false;
    if (_pendingRefresh) { _pendingRefresh = false; setTimeout(() => renderRecommendationsPage(), 0); return; }
  }

  const { items, dismissedCount, totalCount, bySeverity, byType } = result;

  // Apply UI filters
  let filtered = items.slice();
  if (window._recFilter.severity !== 'all') filtered = filtered.filter(r => r.severity === window._recFilter.severity);
  if (window._recFilter.type !== 'all')     filtered = filtered.filter(r => r.type === window._recFilter.type);

  const severityChip = (label, value, count, color) => {
    const active = window._recFilter.severity === value;
    return `<button class="rec-chip ${active ? 'rec-chip-active' : ''}" style="${active ? `background:${color};color:#fff;border-color:${color};` : `color:${color};border-color:${color};`}" onclick="window.app.recFilterSeverity('${value}')">${label} <strong>${count}</strong></button>`;
  };

  const typeChips = Object.keys(REC_TYPE_LABELS).map(t => {
    const c = byType[t] || 0;
    if (c === 0) return '';
    const active = window._recFilter.type === t;
    return `<button class="rec-chip ${active ? 'rec-chip-active' : ''}" style="${active ? 'background:var(--brand-600);color:#fff;border-color:var(--brand-600);' : ''}" onclick="window.app.recFilterType('${t}')">${REC_TYPE_LABELS[t]} <strong>${c}</strong></button>`;
  }).join('');

  body.innerHTML = `
    <style>
      .rec-hero { background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 50%,#f5f3ff 100%); border:1px solid var(--gray-200); border-radius:16px; padding:20px 24px; margin-bottom:18px; }
      .rec-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-top:14px; }
      .rec-stat { background:#fff; border-radius:12px; padding:14px 16px; box-shadow:0 1px 3px rgba(0,0,0,0.06); }
      .rec-stat-val { font-size:24px; font-weight:800; line-height:1; }
      .rec-stat-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
      .rec-filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px; }
      .rec-chip { padding:5px 12px; border-radius:20px; border:1px solid var(--gray-300); background:#fff; cursor:pointer; font-size:12px; font-weight:600; transition:all 0.15s; }
      .rec-chip:hover { transform:translateY(-1px); box-shadow:0 2px 6px rgba(0,0,0,0.08); }
      .rec-chip-active { box-shadow:0 2px 6px rgba(0,0,0,0.12); }
      .rec-card { background:#fff; border-radius:12px; padding:16px 18px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.06); border-left:4px solid var(--gray-300); transition:transform 0.15s, box-shadow 0.15s; }
      .rec-card:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.08); }
      .rec-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:6px; }
      .rec-title { font-size:14px; font-weight:700; color:var(--gray-900); }
      .rec-meta { display:flex; gap:6px; align-items:center; }
      .rec-sev-pill { padding:2px 8px; border-radius:6px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
      .rec-type-pill { padding:2px 8px; border-radius:6px; font-size:10px; font-weight:600; background:var(--gray-100); color:var(--gray-600); }
      .rec-body { font-size:12px; color:var(--gray-600); line-height:1.55; margin-bottom:8px; }
      .rec-actions { display:flex; gap:6px; flex-wrap:wrap; }
      .rec-actions .btn { font-size:11px; padding:5px 10px; }
      .rec-empty { background:#fff; border-radius:12px; padding:48px 24px; text-align:center; }
    </style>

    <div class="rec-hero">
      <div style="display:flex;align-items:center;gap:10px;">
        <h2 style="font-size:22px;font-weight:800;margin:0;">Recommendations</h2>
        <span style="padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;background:var(--brand-50,#eef2ff);color:var(--brand-600);">${totalCount} total</span>
        ${dismissedCount > 0 ? `<span style="padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;background:var(--gray-100);color:var(--gray-600);">${dismissedCount} dismissed</span>` : ''}
        <span style="margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--gray-500);">
          <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px #22c55e22;"></span>Live
        </span>
      </div>
      <div style="font-size:13px;color:var(--gray-600);margin-top:6px;">Actionable next steps from your data, ranked by severity. Acting on the underlying records (apps, licenses, payers) auto-updates this list.</div>
      <div class="rec-stats">
        <div class="rec-stat" style="border-top:3px solid #ef4444;"><div class="rec-stat-val" style="color:#dc2626;">${bySeverity.critical || 0}</div><div class="rec-stat-lbl">Critical</div></div>
        <div class="rec-stat" style="border-top:3px solid #f59e0b;"><div class="rec-stat-val" style="color:#b45309;">${bySeverity.high || 0}</div><div class="rec-stat-lbl">High</div></div>
        <div class="rec-stat" style="border-top:3px solid #3b82f6;"><div class="rec-stat-val" style="color:#2563eb;">${bySeverity.medium || 0}</div><div class="rec-stat-lbl">Medium</div></div>
        <div class="rec-stat" style="border-top:3px solid #6366f1;"><div class="rec-stat-val" style="color:#4f46e5;">${bySeverity.low || 0}</div><div class="rec-stat-lbl">Low</div></div>
        <div class="rec-stat" style="border-top:3px solid #9ca3af;"><div class="rec-stat-val" style="color:#6b7280;">${bySeverity.info || 0}</div><div class="rec-stat-lbl">Info</div></div>
      </div>
    </div>

    <div class="rec-filters">
      <span style="font-size:11px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-right:4px;">Severity:</span>
      ${severityChip('All', 'all', items.length, '#6b7280')}
      ${severityChip('Critical', 'critical', bySeverity.critical || 0, '#dc2626')}
      ${severityChip('High', 'high', bySeverity.high || 0, '#b45309')}
      ${severityChip('Medium', 'medium', bySeverity.medium || 0, '#2563eb')}
      ${severityChip('Low', 'low', bySeverity.low || 0, '#4f46e5')}
    </div>

    ${typeChips ? `
    <div class="rec-filters">
      <span style="font-size:11px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-right:4px;">Type:</span>
      <button class="rec-chip ${window._recFilter.type === 'all' ? 'rec-chip-active' : ''}" style="${window._recFilter.type === 'all' ? 'background:var(--brand-600);color:#fff;border-color:var(--brand-600);' : ''}" onclick="window.app.recFilterType('all')">All <strong>${items.length}</strong></button>
      ${typeChips}
    </div>` : ''}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div style="font-size:12px;color:var(--gray-500);">${filtered.length} shown</div>
      <label style="font-size:11px;color:var(--gray-600);display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" ${window._recFilter.showDismissed ? 'checked' : ''} onchange="window.app.recToggleDismissed(this.checked)"> Show dismissed
      </label>
    </div>

    ${filtered.length === 0 ? `
      <div class="rec-empty">
        <div style="font-size:48px;color:#22c55e;margin-bottom:10px;">&#10003;</div>
        <div style="font-size:16px;font-weight:700;color:var(--gray-700);margin-bottom:4px;">All clear in this view</div>
        <div style="font-size:12px;color:var(--gray-500);">${items.length > 0 ? 'Adjust filters to see other recommendations.' : 'No recommendations right now. The engine watches your data and will surface opportunities as they appear.'}</div>
      </div>
    ` : filtered.map(r => {
      const c = REC_SEVERITY_COLORS[r.severity] || REC_SEVERITY_COLORS.info;
      const actionBtns = _renderActionButtons(r);
      return `
        <div class="rec-card" style="border-left-color:${c.border};">
          <div class="rec-card-head">
            <div style="flex:1;">
              <div class="rec-title">${escHtml(r.title)}</div>
              <div class="rec-body">${escHtml(r.body)}</div>
            </div>
            <div class="rec-meta">
              <span class="rec-sev-pill" style="background:${c.bg};color:${c.text};">${r.severity}</span>
              <span class="rec-type-pill">${REC_TYPE_LABELS[r.type] || r.type}</span>
            </div>
          </div>
          <div class="rec-actions">
            ${actionBtns}
            <button class="btn" onclick="window.app.recDismiss('${r.id}')" style="margin-left:auto;color:var(--gray-500);">Dismiss</button>
          </div>
        </div>`;
    }).join('')}
  `;

  // Refresh sidebar badge after render
  updateRecommendationsBadge().catch(() => {});
}

function _renderActionButtons(r) {
  const a = r.action || {};
  switch (a.kind) {
    case 'open_app':
      return `<button class="btn btn-primary" onclick="window._selectedApplicationId='${a.appId}';window.app.navigateTo('application-detail');">Open Application</button>`;
    case 'open_license':
      return `<button class="btn btn-primary" onclick="window.app.navigateTo('licenses');">Open Licenses</button>`;
    case 'open_payer':
      return `<button class="btn btn-primary" onclick="window.app.viewPayerDetail('${escHtml(a.payerId || a.payerName)}');">Open Payer</button>`;
    case 'create_app':
      return `<button class="btn btn-primary" onclick="window.app.openAddModal();">Create Application</button>`;
    case 'create_apps':
      return `<button class="btn btn-primary" onclick="window.app.navigateTo('coverage');">View in Coverage Matrix</button>`;
    case 'add_locations':
      return `<button class="btn btn-primary" onclick="window.app.viewPayerDetail('${escHtml(a.payerId || a.payerName)}');">Open ${escHtml(a.payerName)} Portal Setup</button>`;
    default:
      return '';
  }
}
