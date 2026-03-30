// ui/pages/revenue-cycle.js — Unified Revenue Cycle page
// One page, one data fetch, all tabs rendered inline, CSS-only switching

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, navigateTo, appConfirm, editButton } = window._credentik;

// Re-export constants from sub-modules for handlers
export { ACTIVITY_TYPES, TASK_CATEGORIES } from './billing-services.js';
export { CLAIM_STATUSES, DENIAL_CATEGORIES, DENIAL_STATUSES, CPT_CODES, ICD_CODES } from './rcm.js';

// Import renderers from sub-modules
import { renderBillingServicesPage, renderBillingClientDetail, TASK_CATEGORIES, ACTIVITY_TYPES } from './billing-services.js';
import { renderRcmPage } from './rcm.js';
import { renderFeeSchedulesTab, renderEligibilityTab, renderStatementsTab, renderClientReportsSection, renderPayerIntelligenceTab, renderProviderFeedbackTab, renderAuthorizationsTab, renderModifierGuideTab } from './rcm-phase2.js';

if (typeof window._rcTab === 'undefined') window._rcTab = 'dashboard';

async function renderRevenueCyclePage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading Revenue Cycle...</div></div>';

  const tab = window._rcTab || 'dashboard';

  // Determine which sub-module to render based on tab
  const bsTabs = ['dashboard', 'clients', 'activity', 'financials'];
  const rcmTabs = ['claims', 'charges', 'denials', 'payments', 'ar'];
  const phase2Tabs = ['fee-schedules', 'eligibility', 'statements', 'payer-intel', 'provider-feedback', 'authorizations', 'modifier-guide'];

  // Set the sub-module tab state
  if (bsTabs.includes(tab)) {
    window._bsTab = tab;
  } else if (rcmTabs.includes(tab)) {
    window._rcmTab = tab;
  }

  // Render the active sub-module directly into page-body
  if (tab === 'tasks') {
    await renderTasksPage(body);
  } else if (phase2Tabs.includes(tab)) {
    if (tab === 'fee-schedules') await renderFeeSchedulesTab(body);
    else if (tab === 'eligibility') await renderEligibilityTab(body);
    else if (tab === 'statements') await renderStatementsTab(body);
    else if (tab === 'payer-intel') await renderPayerIntelligenceTab(body);
    else if (tab === 'provider-feedback') await renderProviderFeedbackTab(body);
    else if (tab === 'authorizations') await renderAuthorizationsTab(body);
    else if (tab === 'modifier-guide') await renderModifierGuideTab(body);
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

  const _t = (key, label) => `<button class="rc-tab ${tab === key ? 'active' : ''}" onclick="window.app.rcSwitchTab('${key}')">${label}</button>`;

  const tabBar = `
    <style>
      .rc-tab-group{margin-bottom:12px;}
      .rc-tab-row{display:flex;gap:0;flex-wrap:wrap;border-bottom:2px solid var(--gray-200);}
      .rc-tab-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-400);padding:0 10px 4px;margin-top:8px;}
      .rc-tab{padding:6px 10px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .rc-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .rc-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>
    <div class="rc-tab-group">
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div>
          <div class="rc-tab-label">Operations</div>
          <div class="rc-tab-row">
            ${_t('dashboard','Dashboard')}
            ${_t('clients',`Clients (${clientCount})`)}
            ${_t('claims',`Claims (${claimCount})`)}
            ${_t('charges',`Charges (${chargeCount})`)}
            ${_t('denials',`Denials (${denialCount})`)}
            ${_t('payments',`Payments (${paymentCount})`)}
            ${_t('ar','A/R Aging')}
            ${_t('tasks',`Tasks (${taskCount})`)}
            ${_t('activity','Activity')}
            ${_t('financials','Financials')}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:4px;">
        <div>
          <div class="rc-tab-label">Tools & Intelligence</div>
          <div class="rc-tab-row">
            ${_t('fee-schedules','Fee Schedules')}
            ${_t('authorizations','Authorizations')}
            ${_t('eligibility','Eligibility')}
            ${_t('statements','Statements')}
            ${_t('payer-intel','Payer Intel')}
            ${_t('modifier-guide','Modifiers')}
            ${_t('provider-feedback','Feedback')}
          </div>
        </div>
      </div>
    </div>
  `;

  body.innerHTML = tabBar + tempDiv.innerHTML;
}

async function renderTasksPage(body) {
  const { store, escHtml, escAttr, formatDateDisplay } = window._credentik;

  let tasks = [], clients = [], claims = [];
  const [r0, r1, r2] = await Promise.allSettled([
    store.getBillingTasks(),
    store.getBillingClients(),
    store.getRcmClaims(),
  ]);
  if (r0.status === 'fulfilled') tasks = r0.value;
  if (r1.status === 'fulfilled') clients = r1.value;
  if (r2.status === 'fulfilled') claims = r2.value;
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(clients)) clients = [];
  if (!Array.isArray(claims)) claims = [];
  window._bsTasks = tasks;
  window._rcmClaims = claims;

  const today = new Date();
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && !t.dismissed);
  const overdue = activeTasks.filter(t => { const d = t.dueDate || t.due_date; return d && new Date(d) < today; });
  const urgent = activeTasks.filter(t => t.priority === 'urgent');
  const highPriority = activeTasks.filter(t => t.priority === 'high');
  const systemTasks = activeTasks.filter(t => t.source === 'system');
  const manualTasks = activeTasks.filter(t => t.source !== 'system');
  const completedRecent = tasks.filter(t => t.status === 'completed' && t.completedAt && (today - new Date(t.completedAt || t.completed_at)) < 7 * 86400000);

  // By category
  const byCat = {};
  activeTasks.forEach(t => {
    const cat = t.category || t.taskCategory || t.task_category || 'other';
    if (!byCat[cat]) byCat[cat] = 0;
    byCat[cat]++;
  });

  // By priority
  const byPriority = { urgent: 0, high: 0, normal: 0, low: 0 };
  activeTasks.forEach(t => { byPriority[t.priority || 'normal'] = (byPriority[t.priority || 'normal'] || 0) + 1; });

  const _statusBadge = (status) => {
    const map = { pending: 'pending', in_progress: 'pending', completed: 'approved', on_hold: 'inactive', cancelled: 'denied' };
    const labels = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', on_hold: 'On Hold', cancelled: 'Cancelled' };
    return `<span class="badge badge-${map[status] || 'inactive'}">${escHtml(labels[status] || status || 'pending')}</span>`;
  };
  const _priorityBadge = (p) => {
    const colors = { urgent: '#ef4444', high: '#f97316', normal: '#3b82f6', low: '#9ca3af' };
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${colors[p] || colors.normal};"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>${escHtml(p || 'normal')}</span>`;
  };
  const _catLabel = (cat) => { const c = TASK_CATEGORIES.find(x => x.value === cat); return c ? c.label : cat || ''; };

  body.innerHTML = `
    <style>
      .task-stat{position:relative;overflow:hidden;border-radius:14px;padding:16px 20px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s;}
      .task-stat:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.1);}
      .task-stat .t-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:4px;}
      .task-stat .t-val{font-size:24px;font-weight:800;line-height:1.1;}
      .task-stat .t-sub{font-size:11px;color:var(--gray-500);margin-top:3px;}
      .task-detail-panel{background:var(--gray-50);border-left:3px solid var(--brand-600);padding:16px 20px;border-radius:0 12px 12px 0;margin:0 16px 12px;display:none;}
    </style>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:18px;">
      <div class="task-stat" style="cursor:pointer;" onclick="document.getElementById('task-filter-status').value='';document.getElementById('task-filter-priority').value='';window.app.filterTasksPage();" title="All active tasks">
        <div class="t-label">Active Tasks</div>
        <div class="t-val" style="color:var(--brand-600);">${activeTasks.length}</div>
        <div class="t-sub">${manualTasks.length} manual, ${systemTasks.length} auto</div>
      </div>
      <div class="task-stat" style="cursor:pointer;${overdue.length > 0 ? 'background:#fef2f2;' : ''}" onclick="document.getElementById('task-filter-status').value='overdue';window.app.filterTasksPage();" title="Click to filter overdue">
        <div class="t-label">Overdue</div>
        <div class="t-val" style="color:#ef4444;">${overdue.length}</div>
        <div class="t-sub">${overdue.length > 0 ? 'Needs attention' : 'All on track'}</div>
      </div>
      <div class="task-stat" style="cursor:pointer;" onclick="document.getElementById('task-filter-priority').value='urgent';window.app.filterTasksPage();" title="Click to filter urgent">
        <div class="t-label">Urgent</div>
        <div class="t-val" style="color:#ef4444;">${byPriority.urgent}</div>
      </div>
      <div class="task-stat" style="cursor:pointer;" onclick="document.getElementById('task-filter-priority').value='high';window.app.filterTasksPage();" title="Click to filter high priority">
        <div class="t-label">High Priority</div>
        <div class="t-val" style="color:#f97316;">${byPriority.high}</div>
      </div>
      <div class="task-stat">
        <div class="t-label">Completed (7d)</div>
        <div class="t-val" style="color:#16a34a;">${completedRecent.length}</div>
      </div>
    </div>

    <!-- By Category + By Priority -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
      <div style="background:white;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-500);margin-bottom:10px;">By Category</div>
        ${Object.entries(byCat).sort((a,b) => b[1] - a[1]).map(([cat, count]) => {
          const pct = activeTasks.length > 0 ? (count / activeTasks.length * 100) : 0;
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;" onclick="document.getElementById('task-filter-category').value='${cat}';window.app.filterTasksPage();">
            <div style="flex:1;font-size:12px;font-weight:600;color:var(--gray-700);">${escHtml(_catLabel(cat))}</div>
            <div style="width:80px;height:5px;background:var(--gray-200);border-radius:3px;overflow:hidden;"><div style="height:100%;background:var(--brand-500);width:${pct}%;border-radius:3px;"></div></div>
            <div style="font-size:12px;font-weight:700;color:var(--brand-600);min-width:24px;text-align:right;">${count}</div>
          </div>`;
        }).join('')}
        ${Object.keys(byCat).length === 0 ? '<div style="font-size:12px;color:var(--gray-400);">No active tasks</div>' : ''}
      </div>
      <div style="background:white;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-500);margin-bottom:10px;">By Priority</div>
        ${[
          { key: 'urgent', label: 'Urgent', color: '#ef4444' },
          { key: 'high', label: 'High', color: '#f97316' },
          { key: 'normal', label: 'Normal', color: '#3b82f6' },
          { key: 'low', label: 'Low', color: '#9ca3af' },
        ].map(p => {
          const pct = activeTasks.length > 0 ? ((byPriority[p.key] || 0) / activeTasks.length * 100) : 0;
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;" onclick="document.getElementById('task-filter-priority').value='${p.key}';window.app.filterTasksPage();">
            <div style="flex:1;font-size:12px;font-weight:600;color:${p.color};">${p.label}</div>
            <div style="width:80px;height:5px;background:var(--gray-200);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${p.color};width:${pct}%;border-radius:3px;"></div></div>
            <div style="font-size:12px;font-weight:700;color:${p.color};min-width:24px;text-align:right;">${byPriority[p.key] || 0}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Task List -->
    <div style="background:white;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden;">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--gray-200);">
        <h3 style="margin:0;font-size:16px;">All Tasks</h3>
        <div style="flex:1;"></div>
        <input type="text" id="task-filter-search" placeholder="Search tasks..." class="form-control" style="width:180px;height:32px;font-size:12px;" oninput="window.app.filterTasksPage()">
        <select id="task-filter-priority" class="form-control" style="width:100px;height:32px;font-size:12px;" onchange="window.app.filterTasksPage()">
          <option value="">Priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
        </select>
        <select id="task-filter-status" class="form-control" style="width:110px;height:32px;font-size:12px;" onchange="window.app.filterTasksPage()">
          <option value="">Status</option><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="on_hold">On Hold</option><option value="overdue">Overdue</option>
        </select>
        <select id="task-filter-category" class="form-control" style="width:130px;height:32px;font-size:12px;" onchange="window.app.filterTasksPage()">
          <option value="">Category</option>${TASK_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
        </select>
        <select id="task-filter-source" class="form-control" style="width:90px;height:32px;font-size:12px;" onchange="window.app.filterTasksPage()">
          <option value="">Source</option><option value="manual">Manual</option><option value="system">Auto</option>
        </select>
        <button class="btn btn-sm btn-primary" onclick="window.app.autoGenerateTasks()" style="font-size:11px;">Generate Tasks</button>
        <button class="btn btn-sm" onclick="window.app.openBsTaskModal()" style="font-size:11px;">+ New Task</button>
        <button class="btn btn-sm" onclick="window.app.bulkCompleteTasks()" style="font-size:11px;color:#16a34a;" title="Complete all selected tasks">Bulk Complete</button>
      </div>
      <div style="max-height:600px;overflow-y:auto;">
        ${tasks.map(t => {
          const client = clients.find(c => c.id == (t.billingClientId || t.billing_client_id));
          const dueDate = t.dueDate || t.due_date || '';
          const isOverdue = dueDate && new Date(dueDate) < today && t.status !== 'completed' && t.status !== 'cancelled';
          const isSystem = (t.source || '') === 'system';
          const cat = _catLabel(t.category || t.taskCategory || t.task_category);
          const claim = claims.find(c => c.id == (t.claimId || t.claim_id));
          const desc = t.description || '';
          return `<div class="task-page-row" data-id="${t.id}" data-priority="${t.priority || 'normal'}" data-status="${t.status || 'pending'}" data-category="${t.category || t.taskCategory || t.task_category || ''}" data-source="${t.source || 'manual'}" data-overdue="${isOverdue}" style="border-bottom:1px solid var(--gray-100);${isOverdue ? 'background:#fef2f2;' : t.status === 'completed' ? 'opacity:0.5;' : ''}">
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;" onclick="const p=this.nextElementSibling;p.style.display=p.style.display==='none'?'block':'none';">
              <input type="checkbox" class="task-bulk-cb" value="${t.id}" onclick="event.stopPropagation();" style="width:16px;height:16px;">
              ${_priorityBadge(t.priority)}
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:var(--gray-800);${t.status === 'completed' ? 'text-decoration:line-through;' : ''}">${escHtml(t.title || '—')}${isSystem ? ' <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#dbeafe;color:#1e40af;font-weight:600;">AUTO</span>' : ''}</div>
                <div style="font-size:11px;color:var(--gray-500);margin-top:1px;">${escHtml(cat)}${client ? ' — ' + escHtml(client.organizationName || client.organization_name || '') : ''}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="${isOverdue ? 'color:#ef4444;font-weight:600;' : 'color:var(--gray-500);'}font-size:11px;">${dueDate ? formatDateDisplay(dueDate) : '—'}${isOverdue ? ' OVERDUE' : ''}</div>
                <div style="margin-top:2px;">${_statusBadge(t.status)}</div>
              </div>
            </div>
            <div class="task-detail-panel" style="display:none;">
              ${desc ? `<div style="font-size:12px;color:var(--gray-700);margin-bottom:10px;white-space:pre-wrap;">${escHtml(desc)}</div>` : ''}
              ${claim ? `<div style="font-size:11px;color:var(--gray-500);margin-bottom:8px;">Linked Claim: <a href="#" onclick="event.preventDefault();window.app.viewClaimDetail(${claim.id})" style="color:var(--brand-600);font-weight:600;">#${escHtml(claim.claimNumber || claim.claim_number || '')}</a> — ${escHtml(claim.patientName || claim.patient_name || '')} — ${escHtml(claim.payerName || claim.payer_name || '')} — $${Number(claim.totalCharges || claim.total_charges || 0).toFixed(2)}</div>` : ''}
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${t.status !== 'completed' ? `<button class="btn btn-sm btn-primary" onclick="window.app.completeBsTask(${t.id})" style="font-size:11px;">Complete</button>` : ''}
                <button class="btn btn-sm" onclick="window.app.editBsTask(${t.id})" style="font-size:11px;">Edit</button>
                ${isSystem ? `<button class="btn btn-sm" onclick="window.app.dismissBsTask(${t.id})" style="font-size:11px;color:var(--gray-400);">Dismiss</button>` : `<button class="btn btn-sm" onclick="window.app.deleteBsTask(${t.id})" style="font-size:11px;color:var(--red);">Delete</button>`}
                ${claim ? `<button class="btn btn-sm" onclick="window.app.viewClaimDetail(${claim.id})" style="font-size:11px;color:var(--brand-600);">View Claim</button>` : ''}
              </div>
            </div>
          </div>`;
        }).join('')}
        ${tasks.length === 0 ? '<div style="text-align:center;padding:3rem;color:var(--gray-500);">No tasks. Click "Generate Tasks" to create tasks from claims data, or "+ New Task" to add one manually.</div>' : ''}
      </div>
    </div>
  `;
}

function rcSwitchTab(tab) {
  window._rcTab = tab;
  // Re-render the page with the new tab — data is cached so it's fast
  renderRevenueCyclePage();
}

export { renderRevenueCyclePage, rcSwitchTab, renderBillingClientDetail };
