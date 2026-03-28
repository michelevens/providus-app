// ui/pages/billing-services.js — Billing Services Management (Production)
// Agency manages medical billing tasks for client orgs/providers

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, navigateTo, appConfirm, appPrompt,
        editButton, deleteButton, helpTip, sortArrow } = window._credentik;

// Module state
if (typeof window._bsTab === 'undefined') window._bsTab = 'dashboard';
if (typeof window._bsClients === 'undefined') window._bsClients = [];
if (typeof window._bsTasks === 'undefined') window._bsTasks = [];
if (typeof window._bsActivities === 'undefined') window._bsActivities = [];

function _fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _fmtK(n) {
  n = Number(n || 0);
  return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : _fmtMoney(n);
}

function _bsStatusBadge(status) {
  const map = { active: 'approved', paused: 'pending', cancelled: 'denied', pending: 'pending', onboarding: 'pending' };
  return `<span class="badge badge-${map[status] || 'inactive'}">${escHtml(status || 'pending')}</span>`;
}
function _taskStatusBadge(status) {
  const map = { pending: 'pending', in_progress: 'pending', completed: 'approved', on_hold: 'inactive', cancelled: 'denied' };
  const labels = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', on_hold: 'On Hold', cancelled: 'Cancelled' };
  return `<span class="badge badge-${map[status] || 'inactive'}">${escHtml(labels[status] || status || 'pending')}</span>`;
}
function _taskPriorityBadge(priority) {
  const colors = { urgent: 'var(--red)', high: 'var(--orange,#f97316)', normal: 'var(--brand-600)', low: 'var(--gray-400)' };
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${colors[priority] || colors.normal};"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>${escHtml(priority || 'normal')}</span>`;
}
function _activityTypeIcon(type) {
  const icons = {
    claim_submitted: '<svg width="14" height="14" fill="none" stroke="#22c55e" stroke-width="2"><path d="M2 7l4 4 6-8"/></svg>',
    claim_followup: '<svg width="14" height="14" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M7 2v5l3 3"/><circle cx="7" cy="7" r="5.5"/></svg>',
    denial_worked: '<svg width="14" height="14" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M7 4v4M7 10v.5"/><circle cx="7" cy="7" r="5.5"/></svg>',
    payment_posted: '<svg width="14" height="14" fill="none" stroke="#22c55e" stroke-width="2"><circle cx="7" cy="7" r="5.5"/><path d="M7 4v6M5 7h4"/></svg>',
    eligibility_check: '<svg width="14" height="14" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M5 7l2 2 4-4"/><rect x="1.5" y="1.5" width="11" height="11" rx="2"/></svg>',
    report_generated: '<svg width="14" height="14" fill="none" stroke="#6b7280" stroke-width="2"><path d="M4 2h6l2 2v8H2V2h2z"/><path d="M4 6h6M4 8h4"/></svg>',
    note: '<svg width="14" height="14" fill="none" stroke="#6b7280" stroke-width="2"><path d="M2 2h10v10H2z"/><path d="M4 5h6M4 7h6M4 9h3"/></svg>',
  };
  return icons[type] || icons.note;
}

const ACTIVITY_TYPES = [
  { value: 'claim_submitted', label: 'Claims Submitted' },
  { value: 'claim_followup', label: 'Claim Follow-up' },
  { value: 'denial_worked', label: 'Denial Worked' },
  { value: 'payment_posted', label: 'Payment Posted' },
  { value: 'eligibility_check', label: 'Eligibility Check' },
  { value: 'report_generated', label: 'Report Generated' },
  { value: 'note', label: 'General Note' },
];
const TASK_CATEGORIES = [
  { value: 'charge_entry', label: 'Charge Entry' },
  { value: 'claim_submission', label: 'Claim Submission' },
  { value: 'claim_followup', label: 'Claim Follow-up' },
  { value: 'denial_management', label: 'Denial Management' },
  { value: 'payment_posting', label: 'Payment Posting' },
  { value: 'eligibility_verification', label: 'Eligibility Verification' },
  { value: 'patient_billing', label: 'Patient Billing' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'other', label: 'Other' },
];

// ─── Helpers ───
function _getField(obj, ...keys) {
  for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null) return obj[k]; }
  return '';
}
function _clientName(c) { return _getField(c, 'organizationName', 'organization_name', 'orgName') || '—'; }

// ─── Main Page ───
async function renderBillingServicesPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let clients = [], tasks = [], activities = [], financials = [], orgs = [];
  let stats = { total_clients: 0, active_clients: 0, total_tasks: 0, pending_tasks: 0, completed_tasks: 0, total_claims: 0, total_collected: 0, total_denied: 0 };

  let claimStats = {}, workQueues = {}, denialRisk = {}, reconciliation = {};
  const chartRange = window._bsChartRange || 6;
  window._bsRefreshDashboard = () => renderBillingServicesPage();
  // Fire all API calls in parallel for speed
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9] = await Promise.allSettled([
    store.getBillingClientStats(),
    store.getBillingClients(),
    store.getBillingTasks(),
    store.getBillingActivities({ limit: 100 }),
    store.getBillingFinancials({}),
    store.getRcmClaimStats({ months: chartRange }),
    store.getWorkQueues(),
    store.getDenialRiskAnalysis(),
    store.getAll('organizations'),
    store.getReconciliationReport(),
  ]);
  if (r0.status === 'fulfilled') stats = r0.value;
  if (r1.status === 'fulfilled') clients = r1.value;
  if (r2.status === 'fulfilled') tasks = r2.value;
  if (r3.status === 'fulfilled') activities = r3.value;
  if (r4.status === 'fulfilled') financials = r4.value;
  if (r5.status === 'fulfilled') claimStats = r5.value;
  if (r6.status === 'fulfilled') workQueues = r6.value;
  if (r7.status === 'fulfilled') denialRisk = r7.value;
  if (r8.status === 'fulfilled') orgs = r8.value;
  if (r9.status === 'fulfilled') reconciliation = r9.value;

  if (!Array.isArray(clients)) clients = [];
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(activities)) activities = [];
  if (!Array.isArray(financials)) financials = [];
  if (!Array.isArray(orgs)) orgs = [];
  window._bsClients = clients;
  window._bsTasks = tasks;
  window._bsActivities = activities;
  window._bsOrgs = orgs;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const activeClients = clients.filter(c => c.status === 'active').length;
  const overdueTasks = tasks.filter(t => {
    const d = t.dueDate || t.due_date;
    return d && new Date(d) < today && t.status !== 'completed' && t.status !== 'cancelled';
  });
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const urgentTasks = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed' && t.status !== 'cancelled');
  const todayActivities = activities.filter(a => (a.activityDate || a.activity_date || a.createdAt || a.created_at || '').startsWith(todayStr));
  const thisWeekActivities = activities.filter(a => {
    const d = new Date(a.activityDate || a.activity_date || a.createdAt || a.created_at || '');
    return (today - d) < 7 * 86400000;
  });

  // Compute monthly data for chart — prefer live claim stats, fall back to financials
  const claimMonthly = claimStats.monthly || [];
  const monthlyData = {};
  for (let m = chartRange - 1; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthlyData[key] = { label, billed: 0, collected: 0, denied: 0, claims: 0 };
  }
  // Use live claim data if available
  if (claimMonthly.length > 0) {
    claimMonthly.forEach(m => {
      const p = m.period || '';
      if (monthlyData[p]) {
        monthlyData[p].billed = m.amount_billed || m.amountBilled || 0;
        monthlyData[p].collected = m.amount_collected || m.amountCollected || 0;
        monthlyData[p].denied = m.denied_amount || m.deniedAmount || 0;
        monthlyData[p].claims = m.claims_submitted || m.claimsSubmitted || 0;
      }
    });
  } else {
    financials.forEach(f => {
      const p = f.period || '';
      if (monthlyData[p]) {
        monthlyData[p].billed += f.amountBilled || f.amount_billed || 0;
        monthlyData[p].collected += f.amountCollected || f.amount_collected || 0;
        monthlyData[p].denied += f.deniedAmount || f.denied_amount || 0;
        monthlyData[p].claims += f.claimsSubmitted || f.claims_submitted || 0;
      }
    });
  }
  const months = Object.values(monthlyData);
  const maxCollected = Math.max(...months.map(m => m.collected), 1);

  // Client health — clients with no activity in last 7 days
  const inactiveClients = clients.filter(c => {
    if (c.status !== 'active') return false;
    const lastAct = activities.find(a => (a.billingClientId || a.billing_client_id) == c.id);
    if (!lastAct) return true;
    const d = new Date(lastAct.activityDate || lastAct.activity_date || lastAct.createdAt || lastAct.created_at || '');
    return (today - d) > 7 * 86400000;
  });

  // Total revenue numbers — sum from chart months so totals match the visible range
  const totalBilled = months.reduce((s, m) => s + m.billed, 0);
  const totalCollected = months.reduce((s, m) => s + m.collected, 0);
  const totalDenied = months.reduce((s, m) => s + m.denied, 0);
  const collectionRate = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : '0.0';
  const denialRate = totalBilled > 0 ? ((totalDenied / totalBilled) * 100).toFixed(1) : '0.0';

  body.innerHTML = `
    <style>
      .bs-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .bs-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .bs-stat .bs-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .bs-stat .bs-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .bs-stat .bs-val{font-size:28px;font-weight:800;line-height:1.1;}
      .bs-stat .bs-sub{font-size:11px;color:var(--gray-500);margin-top:4px;}
      .bs-card{border-radius:16px;overflow:hidden;}
      .bs-table table tr:hover{background:var(--gray-50);}
      .bs-alert{padding:12px 16px;border-radius:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;font-size:13px;}
      .bs-alert-red{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;}
      .bs-alert-gold{background:#fffbeb;border:1px solid #fde68a;color:#92400e;}
      .bs-alert-blue{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;}
      .bs-quick-btn{padding:8px 14px;border-radius:8px;border:1px solid var(--gray-200);background:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.15s;display:flex;align-items:center;gap:6px;}
      .bs-quick-btn:hover{border-color:var(--brand-400);background:var(--brand-50,#eff6ff);color:var(--brand-700);}
    </style>

    <!-- Tabs -->
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab ${window._bsTab === 'dashboard' ? 'active' : ''}" onclick="window.app.bsTab(this,'dashboard')">Dashboard</button>
      <button class="tab ${window._bsTab === 'clients' ? 'active' : ''}" onclick="window.app.bsTab(this,'clients')">Clients (${clients.length})</button>
      <button class="tab ${window._bsTab === 'tasks' ? 'active' : ''}" onclick="window.app.bsTab(this,'tasks')">Tasks (${pendingTasks.length})</button>
      <button class="tab ${window._bsTab === 'activity' ? 'active' : ''}" onclick="window.app.bsTab(this,'activity')">Activity Log</button>
      <button class="tab ${window._bsTab === 'financials' ? 'active' : ''}" onclick="window.app.bsTab(this,'financials')">Financials</button>
    </div>

    <!-- ═══ DASHBOARD TAB ═══ -->
    <div id="bs-dashboard" class="${window._bsTab !== 'dashboard' ? 'hidden' : ''}">

      <!-- Alerts -->
      ${overdueTasks.length > 0 ? `<div class="bs-alert bs-alert-red">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="9" r="7.5"/><path d="M9 5.5v4M9 12v.5"/></svg>
        <strong>${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}</strong> — ${overdueTasks.slice(0, 3).map(t => escHtml(t.title || '')).join(', ')}${overdueTasks.length > 3 ? '...' : ''}
        <button class="btn btn-sm" style="margin-left:auto;font-size:11px;color:var(--red);" onclick="window.app.bsTab(document.querySelector('.tab'),\'tasks\');document.getElementById('bs-task-status-filter').value='pending';">View All</button>
      </div>` : ''}
      ${urgentTasks.length > 0 ? `<div class="bs-alert bs-alert-gold">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2l7.5 13H1.5z"/><path d="M9 7v3M9 12.5v.5"/></svg>
        <strong>${urgentTasks.length} urgent task${urgentTasks.length > 1 ? 's' : ''}</strong> require immediate attention
      </div>` : ''}
      ${inactiveClients.length > 0 ? `<div class="bs-alert bs-alert-blue">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="9" r="7.5"/><path d="M9 5v4l2.5 1.5"/></svg>
        <strong>${inactiveClients.length} client${inactiveClients.length > 1 ? 's' : ''}</strong> with no billing activity in 7+ days: ${inactiveClients.slice(0, 3).map(c => escHtml(_clientName(c))).join(', ')}
      </div>` : ''}

      <!-- Stats Row -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:20px;">
        <div class="bs-stat"><div class="bs-accent" style="background:linear-gradient(90deg,var(--brand-500),var(--brand-700));"></div><div class="bs-label">Active Clients</div><div class="bs-val" style="color:var(--brand-600);">${activeClients}</div><div class="bs-sub">${clients.length} total</div></div>
        <div class="bs-stat"><div class="bs-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div><div class="bs-label">Collected</div><div class="bs-val" style="color:#16a34a;">${_fmtK(totalCollected)}</div><div class="bs-sub">${collectionRate}% rate</div></div>
        <div class="bs-stat"><div class="bs-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div><div class="bs-label">Billed</div><div class="bs-val" style="color:#2563eb;">${_fmtK(totalBilled)}</div></div>
        <div class="bs-stat"><div class="bs-accent" style="background:linear-gradient(90deg,#ef4444,#f87171);"></div><div class="bs-label">Denied</div><div class="bs-val" style="color:#dc2626;">${_fmtK(totalDenied)}</div><div class="bs-sub">${denialRate}% rate</div></div>
        <div class="bs-stat"><div class="bs-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div><div class="bs-label">Open Tasks</div><div class="bs-val" style="color:#d97706;">${pendingTasks.length}</div><div class="bs-sub">${overdueTasks.length} overdue</div></div>
        <div class="bs-stat"><div class="bs-accent" style="background:linear-gradient(90deg,#8b5cf6,#a78bfa);"></div><div class="bs-label">This Week</div><div class="bs-val" style="color:#7c3aed;">${thisWeekActivities.length}</div><div class="bs-sub">${todayActivities.length} today</div></div>
      </div>

      <!-- Two-column: Chart + Quick Actions + Today's Queue -->
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px;">
        <!-- Collections Chart -->
        <div class="card bs-card">
          <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
            <h3>Collections Trend</h3>
            <div style="display:flex;gap:4px;align-items:center;">
              ${[3,6,12].map(n => `<button class="btn btn-sm${chartRange === n ? ' btn-primary' : ''}" style="font-size:11px;padding:3px 10px;min-width:0;" onclick="window._bsChartRange=${n};window._bsRefreshDashboard();">${n}mo</button>`).join('')}
              <input type="number" id="bs-chart-custom" min="1" max="24" placeholder="Custom" value="${![3,6,12].includes(chartRange) ? chartRange : ''}" style="width:60px;height:26px;font-size:11px;padding:2px 6px;border:1px solid var(--gray-300);border-radius:6px;" onchange="const v=parseInt(this.value);if(v>=1&&v<=24){window._bsChartRange=v;window._bsRefreshDashboard();}">
            </div>
          </div>
          <div class="card-body" style="padding:16px;">
            <div style="display:flex;align-items:flex-end;gap:6px;height:160px;">
              ${months.map(m => `
                <div style="flex:1;text-align:center;display:flex;flex-direction:column;justify-content:flex-end;height:100%;">
                  <div style="display:flex;flex-direction:column;gap:2px;align-items:center;">
                    ${m.denied > 0 ? `<div style="background:#fca5a5;border-radius:3px 3px 0 0;width:80%;height:${Math.max(m.denied / maxCollected * 100, 3)}px;" title="Denied: ${_fmtMoney(m.denied)}"></div>` : ''}
                    <div style="background:var(--brand-600);border-radius:3px;width:80%;height:${Math.max(m.collected / maxCollected * 100, 3)}px;min-height:3px;" title="Collected: ${_fmtMoney(m.collected)}"></div>
                  </div>
                  <div style="font-size:10px;font-weight:600;color:var(--gray-500);margin-top:6px;">${m.label}</div>
                  <div style="font-size:10px;color:var(--gray-400);">${_fmtK(m.collected)}</div>
                </div>
              `).join('')}
            </div>
            <div style="display:flex;gap:16px;margin-top:12px;justify-content:center;font-size:11px;">
              <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:var(--brand-600);"></span> Collected</span>
              <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#fca5a5;"></span> Denied</span>
            </div>
          </div>
        </div>

        <!-- Quick Actions + Client Health -->
        <div>
          <!-- Quick Actions -->
          <div class="card bs-card" style="margin-bottom:16px;">
            <div class="card-header"><h3>Quick Actions</h3></div>
            <div class="card-body" style="padding:12px;display:flex;flex-direction:column;gap:8px;">
              <button class="bs-quick-btn" onclick="window.app.openBsActivityModal()">
                <svg width="16" height="16" fill="none" stroke="var(--brand-600)" stroke-width="2"><path d="M8 3v10M3 8h10"/></svg> Log Daily Activity
              </button>
              <button class="bs-quick-btn" onclick="window.app.openBsTaskModal()">
                <svg width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M3 8l3 3 7-7"/></svg> Create Task
              </button>
              <button class="bs-quick-btn" onclick="window.app.openBsClientModal()">
                <svg width="16" height="16" fill="none" stroke="#22c55e" stroke-width="2"><circle cx="8" cy="5" r="3"/><path d="M3 14c0-3 2.5-4.5 5-4.5s5 1.5 5 4.5"/></svg> Onboard New Client
              </button>
              <button class="bs-quick-btn" onclick="window.app.bsTab(document.querySelector('.tab'),'financials')">
                <svg width="16" height="16" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M2 13l4-5 3 2 5-7"/></svg> Enter Monthly Financials
              </button>
              <button class="bs-quick-btn" onclick="window.app.generateBillingInvoice()">
                <svg width="16" height="16" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M8 5v6M6 7h4"/></svg> Generate Invoice
              </button>
            </div>
          </div>

          <!-- Client Health -->
          <div class="card bs-card">
            <div class="card-header"><h3>Client Health</h3></div>
            <div class="card-body" style="padding:12px;">
              ${clients.filter(c => c.status === 'active').map(c => {
                const clientTasks = tasks.filter(t => (t.billingClientId || t.billing_client_id) == c.id && t.status !== 'completed' && t.status !== 'cancelled');
                const clientActs = activities.filter(a => (a.billingClientId || a.billing_client_id) == c.id);
                const lastAct = clientActs[0];
                const daysSince = lastAct ? Math.floor((today - new Date(lastAct.activityDate || lastAct.activity_date || lastAct.createdAt || '')) / 86400000) : 999;
                const health = daysSince <= 2 ? 'green' : daysSince <= 7 ? 'gold' : 'red';
                const healthColors = { green: '#22c55e', gold: '#f59e0b', red: '#ef4444' };
                return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100);cursor:pointer;" onclick="window.app.viewBillingClient(${c.id})">
                  <span style="width:8px;height:8px;border-radius:50%;background:${healthColors[health]};flex-shrink:0;"></span>
                  <span style="flex:1;font-size:13px;font-weight:500;">${escHtml(_clientName(c))}</span>
                  <span style="font-size:11px;color:var(--gray-400);">${clientTasks.length > 0 ? clientTasks.length + ' tasks' : ''}</span>
                  <span style="font-size:10px;color:${healthColors[health]};">${daysSince === 999 ? 'No activity' : daysSince === 0 ? 'Today' : daysSince + 'd ago'}</span>
                </div>`;
              }).join('')}
              ${clients.filter(c => c.status === 'active').length === 0 ? '<div style="text-align:center;padding:12px;color:var(--gray-400);font-size:13px;">No active clients</div>' : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Today's Work Queue -->
      <div class="card bs-card">
        <div class="card-header"><h3>Work Queue — ${overdueTasks.length + pendingTasks.length} items</h3></div>
        <div class="card-body" style="padding:0;">
          ${(overdueTasks.length + pendingTasks.length) > 0 ? `
            <table>
              <thead><tr><th></th><th>Task</th><th>Client</th><th>Category</th><th>Due</th><th></th></tr></thead>
              <tbody>
                ${[...overdueTasks, ...pendingTasks.filter(t => !overdueTasks.includes(t))].slice(0, 15).map(t => {
                  const client = clients.find(c => c.id == (t.billingClientId || t.billing_client_id));
                  const dueDate = t.dueDate || t.due_date || '';
                  const isOverdue = dueDate && new Date(dueDate) < today;
                  const cat = TASK_CATEGORIES.find(c => c.value === (t.category || t.taskCategory || t.task_category));
                  return `<tr style="${isOverdue ? 'background:#fef2f2;' : ''}">
                    <td style="width:30px;text-align:center;">${_taskPriorityBadge(t.priority)}</td>
                    <td><strong style="font-size:13px;">${escHtml(t.title || '—')}</strong>${t.providerName || t.provider_name ? `<br><span class="text-sm text-muted">${escHtml(t.providerName || t.provider_name)}</span>` : ''}</td>
                    <td class="text-sm">${escHtml(client ? _clientName(client) : '—')}</td>
                    <td><span style="font-size:11px;padding:2px 8px;background:var(--gray-100);border-radius:4px;">${escHtml(cat ? cat.label : '')}</span></td>
                    <td style="font-size:12px;${isOverdue ? 'color:var(--red);font-weight:700;' : ''}">${dueDate ? formatDateDisplay(dueDate) : '—'}${isOverdue ? ' OVERDUE' : ''}</td>
                    <td><button class="btn btn-sm btn-primary" onclick="window.app.completeBsTask(${t.id})" style="padding:2px 10px;font-size:11px;">Done</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          ` : '<div style="padding:2rem;text-align:center;color:var(--gray-400);">All clear — no pending tasks</div>'}
        </div>
      </div>

      <!-- Recent Activity Feed (compact) -->
      <div class="card bs-card" style="margin-top:16px;">
        <div class="card-header"><h3>Recent Activity</h3><button class="btn btn-sm" onclick="window.app.bsTab(document.querySelector('.tab'),'activity')">View All</button></div>
        <div class="card-body" style="padding:8px 16px;">
          ${activities.slice(0, 8).map(a => {
            const type = a.activityType || a.activity_type || a.type || 'note';
            const typeLabel = ACTIVITY_TYPES.find(t => t.value === type);
            const client = clients.find(c => c.id == (a.billingClientId || a.billing_client_id));
            const amount = a.amount || 0;
            return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:13px;align-items:center;">
              <div style="flex-shrink:0;">${_activityTypeIcon(type)}</div>
              <span style="font-weight:600;">${escHtml(typeLabel ? typeLabel.label : type)}</span>
              <span style="color:var(--gray-400);">—</span>
              <span class="text-sm">${escHtml(client ? _clientName(client) : '')}</span>
              ${amount ? `<span style="margin-left:auto;font-weight:700;color:var(--green);">${_fmtMoney(amount)}</span>` : ''}
              <span style="font-size:11px;color:var(--gray-400);margin-left:${amount ? '8px' : 'auto'};">${formatDateDisplay(a.activityDate || a.activity_date || '')}</span>
            </div>`;
          }).join('')}
          ${activities.length === 0 ? '<div style="text-align:center;padding:1rem;color:var(--gray-400);">No activity yet</div>' : ''}
        </div>
      </div>

      <!-- Smart Work Queues -->
      ${(workQueues.counts || {}).ar_followup || (workQueues.counts || {}).denials || (workQueues.counts || {}).followups_due ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
        <!-- AR Follow-Up Queue -->
        ${(workQueues.ar_followup || []).length > 0 ? `
        <div class="card bs-card">
          <div class="card-header"><h3 style="color:#f59e0b;">AR Follow-Up Queue (${workQueues.counts.ar_followup})</h3></div>
          <div class="card-body" style="padding:0;"><table style="font-size:13px;">
            <thead><tr><th>Claim</th><th>Patient</th><th>Payer</th><th style="text-align:right;">Balance</th><th>Days</th></tr></thead>
            <tbody>${(workQueues.ar_followup || []).slice(0, 10).map(c => {
              const days = Math.floor((new Date() - new Date(c.date_of_service || c.dateOfService)) / 86400000);
              return `<tr style="cursor:pointer;" onclick="window.app.viewClaimDetail(${c.id})">
                <td><strong style="font-family:monospace;font-size:11px;color:var(--brand-600);">${escHtml(c.claim_number || c.claimNumber || '')}</strong></td>
                <td class="text-sm">${escHtml(c.patient_name || c.patientName || '')}</td>
                <td class="text-sm">${escHtml(c.payer_name || c.payerName || '')}</td>
                <td style="text-align:right;color:var(--red);font-weight:600;">${_fmtMoney(c.balance)}</td>
                <td style="font-weight:700;color:${days > 90 ? 'var(--red)' : days > 60 ? '#f97316' : '#f59e0b'};">${days}d</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
        </div>` : ''}

        <!-- Denial Queue -->
        ${(workQueues.denial_queue || []).length > 0 ? `
        <div class="card bs-card">
          <div class="card-header"><h3 style="color:#ef4444;">Denial Queue (${workQueues.counts.denials})</h3></div>
          <div class="card-body" style="padding:0;"><table style="font-size:13px;">
            <thead><tr><th>Claim</th><th>Category</th><th style="text-align:right;">Amount</th><th>Deadline</th><th>Priority</th></tr></thead>
            <tbody>${(workQueues.denial_queue || []).slice(0, 10).map(d => {
              const claim = d.claim || {};
              const deadline = d.appeal_deadline || d.appealDeadline || '';
              const isOverdue = deadline && new Date(deadline) < new Date();
              return `<tr style="${isOverdue ? 'background:#fef2f2;' : ''}cursor:pointer;" onclick="window.app.viewClaimDetail(${claim.id})">
                <td><strong style="font-family:monospace;font-size:11px;">${escHtml(claim.claim_number || claim.claimNumber || '')}</strong></td>
                <td class="text-sm">${escHtml(d.denial_category || d.denialCategory || '')}</td>
                <td style="text-align:right;color:var(--red);font-weight:600;">${_fmtMoney(d.denied_amount || d.deniedAmount)}</td>
                <td style="font-size:11px;${isOverdue ? 'color:var(--red);font-weight:700;' : ''}">${deadline ? formatDateDisplay(deadline) : '—'}${isOverdue ? ' !' : ''}</td>
                <td><span style="font-size:11px;font-weight:600;color:${d.priority === 'urgent' ? 'var(--red)' : d.priority === 'high' ? '#f97316' : 'var(--gray-500)'};">${d.priority || 'normal'}</span></td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
        </div>` : ''}
      </div>` : ''}

      <!-- AI Denial Risk Analysis -->
      ${(denialRisk.risk_factors || []).length > 0 ? `
      <div class="card bs-card" style="margin-top:16px;">
        <div class="card-header"><h3 style="color:#8b5cf6;">AI Denial Risk Analysis</h3><span style="font-size:11px;color:var(--gray-400);">Overall: ${denialRisk.overall_denial_rate || 0}% denial rate</span></div>
        <div class="card-body" style="padding:14px;">
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
            ${(denialRisk.payer_denial_rates || []).slice(0, 6).map(p => `
              <div style="padding:8px 14px;background:${p.denial_rate > 20 ? '#fef2f2' : p.denial_rate > 10 ? '#fffbeb' : '#f0fdf4'};border-radius:10px;text-align:center;min-width:100px;">
                <div style="font-size:18px;font-weight:800;color:${p.denial_rate > 20 ? 'var(--red)' : p.denial_rate > 10 ? '#f59e0b' : 'var(--green)'};">${p.denial_rate}%</div>
                <div style="font-size:11px;color:var(--gray-600);font-weight:500;">${escHtml(p.payer || '')}</div>
                <div style="font-size:10px;color:var(--gray-400);">${p.denied}/${p.total_claims} denied</div>
              </div>
            `).join('')}
          </div>
          <div style="border-top:1px solid var(--gray-100);padding-top:10px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-500);margin-bottom:6px;">Recommendations</div>
            ${(denialRisk.recommendations || []).map(r => `<div style="font-size:13px;padding:4px 0;color:var(--gray-600);">&#8226; ${escHtml(r)}</div>`).join('')}
          </div>
        </div>
      </div>` : ''}

      <!-- Revenue Pipeline -->
      ${reconciliation.pipeline ? `
      <div class="card bs-card" style="margin-top:16px;">
        <div class="card-header"><h3>Revenue Pipeline</h3>
          <button class="btn btn-sm" onclick="window.app.runReconciliation()" style="font-size:11px;">Auto-Match Charges</button>
        </div>
        <div class="card-body" style="padding:14px;">
          <div style="display:flex;gap:4px;align-items:center;margin-bottom:12px;">
            ${[
              { label: 'Charges', val: reconciliation.pipeline.charges_entered, color: '#8b5cf6' },
              { label: 'Submitted', val: reconciliation.pipeline.claims_submitted, color: '#3b82f6' },
              { label: 'Paid', val: reconciliation.pipeline.claims_paid, color: '#22c55e' },
              { label: 'Denied', val: reconciliation.pipeline.claims_denied, color: '#ef4444' },
              { label: 'Pending', val: reconciliation.pipeline.claims_pending, color: '#f59e0b' },
            ].map(s => `<div style="flex:1;text-align:center;padding:10px 6px;background:${s.color}10;border-radius:8px;border-left:3px solid ${s.color};">
              <div style="font-size:18px;font-weight:800;color:${s.color};">${s.val?.count || 0}</div>
              <div style="font-size:10px;color:var(--gray-500);font-weight:600;">${s.label}</div>
              <div style="font-size:10px;color:var(--gray-400);">${_fmtK(s.val?.amount || 0)}</div>
            </div>`).join('<div style="color:var(--gray-300);font-size:16px;">→</div>')}
          </div>
          <div style="font-size:12px;color:var(--gray-500);">Collection Rate: <strong style="color:${(reconciliation.pipeline.collection_rate || 0) > 90 ? 'var(--green)' : '#f59e0b'};">${reconciliation.pipeline.collection_rate || 0}%</strong></div>
          ${(reconciliation.unbilled_charges || []).length > 0 ? `<div style="margin-top:8px;padding:8px 12px;background:#fef2f2;border-radius:6px;font-size:12px;color:var(--red);font-weight:600;">${reconciliation.unbilled_charges.length} unbilled charge(s) — ${_fmtK((reconciliation.unbilled_charges || []).reduce((s,c) => s + Number(c.charge_amount || 0), 0))} in charges with no matching claim</div>` : ''}
          ${(reconciliation.unpaid_claims || []).length > 0 ? `<div style="margin-top:4px;padding:8px 12px;background:#fffbeb;border-radius:6px;font-size:12px;color:#f59e0b;font-weight:600;">${reconciliation.unpaid_claims.length} claim(s) pending 30+ days with no payment</div>` : ''}
        </div>
      </div>` : ''}
    </div>

    <!-- ═══ CLIENTS TAB ═══ -->
    <div id="bs-clients" class="${window._bsTab !== 'clients' ? 'hidden' : ''}">
      <div class="card bs-card bs-table">
        <div class="card-header">
          <h3>Billing Clients</h3>
          <div style="display:flex;gap:8px;">
            <input type="text" id="bs-client-search" placeholder="Search clients..." class="form-control" style="width:200px;height:34px;font-size:13px;" oninput="window.app.filterBsClients()">
            <select id="bs-client-status-filter" class="form-control" style="width:130px;height:34px;font-size:13px;" onchange="window.app.filterBsClients()">
              <option value="">All Statuses</option><option value="active">Active</option><option value="onboarding">Onboarding</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap"><table>
            <thead><tr><th>Organization</th><th>Contact</th><th>Platform</th><th>Open Tasks</th><th>Last Activity</th><th>Monthly Fee</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="bs-clients-tbody">
              ${clients.map(c => {
                const openTasks = tasks.filter(t => (t.billingClientId || t.billing_client_id) == c.id && t.status !== 'completed' && t.status !== 'cancelled').length;
                const lastAct = activities.find(a => (a.billingClientId || a.billing_client_id) == c.id);
                const lastActDate = lastAct ? (lastAct.activityDate || lastAct.activity_date || '') : '';
                return `<tr class="bs-client-row" data-status="${c.status || 'pending'}" data-search="${_clientName(c).toLowerCase()} ${_getField(c, 'contactName', 'contact_name').toLowerCase()}" style="cursor:pointer;" onclick="window.app.viewBillingClient(${c.id})">
                  <td><strong>${escHtml(_clientName(c))}</strong></td>
                  <td class="text-sm">${escHtml(_getField(c, 'contactName', 'contact_name'))}</td>
                  <td><code style="font-size:12px;">${escHtml(_getField(c, 'billingPlatform', 'billing_platform') || '—')}</code></td>
                  <td style="text-align:center;">${openTasks > 0 ? `<span style="background:var(--gold);color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${openTasks}</span>` : '<span style="color:var(--gray-400);">0</span>'}</td>
                  <td class="text-sm">${lastActDate ? formatDateDisplay(lastActDate) : '<span style="color:var(--gray-400);">Never</span>'}</td>
                  <td>${_fmtMoney(_getField(c, 'monthlyFee', 'monthly_fee'))}</td>
                  <td>${_bsStatusBadge(c.status)}</td>
                  <td onclick="event.stopPropagation();"><button class="btn btn-sm" onclick="window.app.editBillingClient(${c.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteBillingClient(${c.id})">Del</button></td>
                </tr>`;
              }).join('')}
              ${clients.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No billing clients yet. Click "+ Add Client" to onboard your first billing client.</td></tr>' : ''}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>

    <!-- ═══ TASKS TAB ═══ -->
    <div id="bs-tasks" class="${window._bsTab !== 'tasks' ? 'hidden' : ''}">
      <div class="card bs-card bs-table">
        <div class="card-header">
          <h3>Billing Tasks</h3>
          <div style="display:flex;gap:8px;">
            <select id="bs-task-client-filter" class="form-control" style="width:180px;height:34px;font-size:13px;" onchange="window.app.filterBsTasks()">
              <option value="">All Clients</option>
              ${clients.map(c => `<option value="${c.id}">${escHtml(_clientName(c))}</option>`).join('')}
            </select>
            <select id="bs-task-status-filter" class="form-control" style="width:130px;height:34px;font-size:13px;" onchange="window.app.filterBsTasks()">
              <option value="">All Statuses</option><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="on_hold">On Hold</option>
            </select>
            <select id="bs-task-cat-filter" class="form-control" style="width:160px;height:34px;font-size:13px;" onchange="window.app.filterBsTasks()">
              <option value="">All Categories</option>
              ${TASK_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap"><table>
            <thead><tr><th>Task</th><th>Client</th><th>Provider</th><th>Category</th><th>Priority</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="bs-tasks-tbody">
              ${tasks.map(t => {
                const client = clients.find(c => c.id == (t.billingClientId || t.billing_client_id));
                const dueDate = t.dueDate || t.due_date || '';
                const isOverdue = dueDate && new Date(dueDate) < today && t.status !== 'completed' && t.status !== 'cancelled';
                const cat = TASK_CATEGORIES.find(c => c.value === (t.category || t.taskCategory || t.task_category));
                return `<tr class="bs-task-row" data-client="${t.billingClientId || t.billing_client_id || ''}" data-status="${t.status || 'pending'}" data-category="${t.category || t.taskCategory || t.task_category || ''}" style="${isOverdue ? 'background:#fef2f2;' : ''}">
                  <td><strong>${escHtml(t.title || '—')}</strong></td>
                  <td class="text-sm">${escHtml(client ? _clientName(client) : '—')}</td>
                  <td class="text-sm">${escHtml(t.providerName || t.provider_name || '—')}</td>
                  <td><span style="font-size:12px;padding:2px 8px;background:var(--gray-100);border-radius:4px;">${escHtml(cat ? cat.label : '')}</span></td>
                  <td>${_taskPriorityBadge(t.priority)}</td>
                  <td style="${isOverdue ? 'color:var(--red);font-weight:600;' : ''}">${dueDate ? formatDateDisplay(dueDate) : '—'}${isOverdue ? ' <span style="font-size:10px;">OVERDUE</span>' : ''}</td>
                  <td>${_taskStatusBadge(t.status)}</td>
                  <td>${t.status !== 'completed' ? `<button class="btn btn-sm btn-primary" onclick="window.app.completeBsTask(${t.id})" title="Complete">&#10003;</button>` : ''} <button class="btn btn-sm" onclick="window.app.editBsTask(${t.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteBsTask(${t.id})">Del</button></td>
                </tr>`;
              }).join('')}
              ${tasks.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No billing tasks yet.</td></tr>' : ''}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>

    <!-- ═══ ACTIVITY LOG TAB ═══ -->
    <div id="bs-activity" class="${window._bsTab !== 'activity' ? 'hidden' : ''}">
      <!-- Quick Daily Log -->
      <div class="card bs-card" style="margin-bottom:16px;">
        <div class="card-header"><h3>Quick Daily Log</h3></div>
        <div class="card-body" style="padding:16px;">
          <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 0.7fr 0.7fr 2fr auto;gap:8px;align-items:end;">
            <div class="auth-field" style="margin:0;">
              <label style="font-size:11px;">Client</label>
              <select id="bs-quick-client" class="form-control" style="height:34px;font-size:13px;">
                <option value="">Select...</option>
                ${clients.filter(c => c.status === 'active').map(c => `<option value="${c.id}">${escHtml(_clientName(c))}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;">
              <label style="font-size:11px;">Type</label>
              <select id="bs-quick-type" class="form-control" style="height:34px;font-size:13px;">
                ${ACTIVITY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Payer</label><input type="text" id="bs-quick-payer" class="form-control" style="height:34px;font-size:13px;" placeholder="Optional"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Qty</label><input type="number" id="bs-quick-qty" class="form-control" style="height:34px;font-size:13px;" value="1" min="1"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Amount</label><input type="number" id="bs-quick-amount" class="form-control" style="height:34px;font-size:13px;" step="0.01" placeholder="$"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Notes</label><input type="text" id="bs-quick-notes" class="form-control" style="height:34px;font-size:13px;" placeholder="What was done..." onkeydown="if(event.key==='Enter')window.app.saveQuickActivity()"></div>
            <button class="btn btn-primary" style="height:34px;white-space:nowrap;font-size:13px;" onclick="window.app.saveQuickActivity()">Log</button>
          </div>
        </div>
      </div>

      <!-- Activity List -->
      <div class="card bs-card">
        <div class="card-header">
          <h3>Activity Log</h3>
          <div style="display:flex;gap:8px;">
            <select id="bs-activity-client-filter" class="form-control" style="width:180px;height:34px;font-size:13px;" onchange="window.app.filterBsActivities()">
              <option value="">All Clients</option>
              ${clients.map(c => `<option value="${c.id}">${escHtml(_clientName(c))}</option>`).join('')}
            </select>
            <select id="bs-activity-type-filter" class="form-control" style="width:160px;height:34px;font-size:13px;" onchange="window.app.filterBsActivities()">
              <option value="">All Types</option>
              ${ACTIVITY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card-body" style="padding:16px;">
          <div id="bs-activity-list">${_renderActivityList(activities, clients)}</div>
        </div>
      </div>
    </div>

    <!-- ═══ FINANCIALS TAB ═══ -->
    <div id="bs-financials" class="${window._bsTab !== 'financials' ? 'hidden' : ''}">
      ${_renderFinancialsTab(clients, financials, months)}
      <div id="bs-client-reports-container"></div>
    </div>

    <!-- ═══ MODALS ═══ -->

    <!-- Add/Edit Billing Client Modal -->
    <div class="modal-overlay" id="bs-client-modal">
      <div class="modal" style="max-width:640px;">
        <div class="modal-header"><h3 id="bs-client-modal-title">Add Billing Client</h3><button class="modal-close" onclick="document.getElementById('bs-client-modal').classList.remove('active')">&times;</button></div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="bs-client-edit-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;position:relative;">
              <label>Organization *</label>
              <input type="text" id="bs-client-org" class="form-control" autocomplete="off" oninput="window.app.filterBsOrgDropdown(this.value)" onfocus="window.app.filterBsOrgDropdown(this.value)">
              <input type="hidden" id="bs-client-org-id" value="">
              <div id="bs-client-org-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid var(--gray-200);border-radius:0 0 8px 8px;max-height:180px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
            </div>
            <div class="auth-field" style="margin:0;"><label>Contact Name</label><input type="text" id="bs-client-contact" class="form-control" placeholder="Primary billing contact"></div>
            <div class="auth-field" style="margin:0;"><label>Contact Email</label><input type="email" id="bs-client-email" class="form-control" placeholder="billing@org.com"></div>
            <div class="auth-field" style="margin:0;"><label>Contact Phone</label><input type="tel" id="bs-client-phone" class="form-control" placeholder="(555) 123-4567"></div>
            <div class="auth-field" style="margin:0;"><label>Billing Platform</label>
              <select id="bs-client-platform" class="form-control"><option value="">Select platform...</option><option value="Office Ally">Office Ally</option><option value="Availity">Availity</option><option value="Trizetto">Trizetto</option><option value="Kareo">Kareo</option><option value="AdvancedMD">AdvancedMD</option><option value="Athenahealth">Athenahealth</option><option value="DrChrono">DrChrono</option><option value="SimplePractice">SimplePractice</option><option value="TherapyNotes">TherapyNotes</option><option value="CollaborateMD">CollaborateMD</option><option value="Other">Other</option></select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Monthly Fee</label><input type="number" id="bs-client-fee" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Fee Structure</label>
              <select id="bs-client-fee-structure" class="form-control"><option value="flat">Flat Monthly Fee</option><option value="per_provider">Per Provider / Month</option><option value="percentage">% of Collections</option><option value="per_claim">Per Claim</option></select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Status</label>
              <select id="bs-client-status" class="form-control"><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select>
            </div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Start Date</label><input type="date" id="bs-client-start" class="form-control"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Notes</label><textarea id="bs-client-notes" class="form-control" rows="2" style="resize:vertical;" placeholder="Billing platform login info, special instructions, etc."></textarea></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);"><button class="btn" onclick="document.getElementById('bs-client-modal').classList.remove('active')">Cancel</button><button class="btn btn-primary" onclick="window.app.saveBillingClient()">Save</button></div>
      </div>
    </div>

    <!-- Add/Edit Task Modal -->
    <div class="modal-overlay" id="bs-task-modal">
      <div class="modal" style="max-width:600px;">
        <div class="modal-header"><h3 id="bs-task-modal-title">Add Billing Task</h3><button class="modal-close" onclick="document.getElementById('bs-task-modal').classList.remove('active')">&times;</button></div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="bs-task-edit-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Task Title *</label><input type="text" id="bs-task-title" class="form-control" placeholder="e.g. Follow up on denied claims for March"></div>
            <div class="auth-field" style="margin:0;"><label>Client *</label><select id="bs-task-client" class="form-control"><option value="">Select client...</option>${clients.map(c => `<option value="${c.id}">${escHtml(_clientName(c))}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Provider (optional)</label><input type="text" id="bs-task-provider" class="form-control" placeholder="Provider name"></div>
            <div class="auth-field" style="margin:0;"><label>Category</label><select id="bs-task-category" class="form-control">${TASK_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Priority</label><select id="bs-task-priority" class="form-control"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
            <div class="auth-field" style="margin:0;"><label>Due Date</label><input type="date" id="bs-task-due" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Status</label><select id="bs-task-status" class="form-control"><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="on_hold">On Hold</option></select></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Description</label><textarea id="bs-task-desc" class="form-control" rows="3" style="resize:vertical;" placeholder="Details about this task..."></textarea></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);"><button class="btn" onclick="document.getElementById('bs-task-modal').classList.remove('active')">Cancel</button><button class="btn btn-primary" onclick="window.app.saveBsTask()">Save</button></div>
      </div>
    </div>

    <!-- Log Activity Modal -->
    <div class="modal-overlay" id="bs-activity-modal">
      <div class="modal" style="max-width:560px;">
        <div class="modal-header"><h3>Log Activity</h3><button class="modal-close" onclick="document.getElementById('bs-activity-modal').classList.remove('active')">&times;</button></div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;"><label>Client *</label><select id="bs-act-client" class="form-control"><option value="">Select client...</option>${clients.map(c => `<option value="${c.id}">${escHtml(_clientName(c))}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Activity Type *</label><select id="bs-act-type" class="form-control">${ACTIVITY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Provider</label><input type="text" id="bs-act-provider" class="form-control" placeholder="Provider name"></div>
            <div class="auth-field" style="margin:0;"><label>Payer</label><input type="text" id="bs-act-payer" class="form-control" placeholder="Payer name"></div>
            <div class="auth-field" style="margin:0;"><label>Date</label><input type="date" id="bs-act-date" class="form-control" value="${todayStr}"></div>
            <div class="auth-field" style="margin:0;"><label>Amount ($)</label><input type="number" id="bs-act-amount" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Quantity</label><input type="number" id="bs-act-qty" class="form-control" min="1" value="1"></div>
            <div class="auth-field" style="margin:0;"><label>Reference</label><input type="text" id="bs-act-ref" class="form-control" placeholder="Claim #, check #"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Notes *</label><textarea id="bs-act-notes" class="form-control" rows="3" style="resize:vertical;" placeholder="Describe the work done..."></textarea></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);"><button class="btn" onclick="document.getElementById('bs-activity-modal').classList.remove('active')">Cancel</button><button class="btn btn-primary" onclick="window.app.saveBsActivity()">Log Activity</button></div>
      </div>
    </div>
  `;
}

// ─── Activity List Renderer ───
function _renderActivityList(activities, clients) {
  if (!activities.length) return '<div style="text-align:center;padding:2rem;color:var(--gray-500);">No activities logged yet.</div>';
  let lastDate = '';
  return activities.map(a => {
    const date = (a.activityDate || a.activity_date || a.createdAt || a.created_at || '').split('T')[0];
    const client = clients.find(c => c.id == (a.billingClientId || a.billing_client_id));
    const type = a.activityType || a.activity_type || a.type || 'note';
    const typeLabel = ACTIVITY_TYPES.find(t => t.value === type);
    const amount = a.amount || 0;
    const qty = a.quantity || a.qty || 0;
    const user = a.userName || a.user_name || '';

    let dateHeader = '';
    if (date !== lastDate) {
      lastDate = date;
      const d = new Date(date + 'T00:00:00');
      const tod = new Date();
      const isToday = d.toDateString() === tod.toDateString();
      const isYesterday = d.toDateString() === new Date(tod - 86400000).toDateString();
      const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      dateHeader = `<div style="font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--gray-200);">${label}</div>`;
    }
    return `${dateHeader}<div class="bs-activity-item" data-client="${a.billingClientId || a.billing_client_id || ''}" data-type="${type}" style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
      <div style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;">${_activityTypeIcon(type)}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div><span style="font-weight:600;font-size:13px;">${escHtml(typeLabel ? typeLabel.label : type)}</span><span style="font-size:12px;color:var(--gray-500);"> — ${escHtml(client ? _clientName(client) : '—')}</span>${a.providerName || a.provider_name ? `<span style="font-size:12px;color:var(--gray-400);"> / ${escHtml(a.providerName || a.provider_name)}</span>` : ''}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">${amount ? `<span style="font-weight:700;color:var(--green);font-size:13px;">${_fmtMoney(amount)}</span>` : ''}${qty > 1 ? `<span style="font-size:11px;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${qty} items</span>` : ''}</div>
        </div>
        <div style="font-size:13px;color:var(--gray-700);margin-top:2px;">${escHtml(a.notes || a.description || '')}</div>
        <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">${user ? escHtml(user) + ' · ' : ''}${date ? formatDateDisplay(date) : ''}${a.reference || a.ref ? ` · Ref: ${escHtml(a.reference || a.ref)}` : ''}${a.payerName || a.payer_name ? ` · ${escHtml(a.payerName || a.payer_name)}` : ''}</div>
      </div>
      <div style="flex-shrink:0;"><button class="btn btn-sm" style="color:var(--red);padding:2px 6px;" onclick="window.app.deleteBsActivity(${a.id})" title="Delete">&times;</button></div>
    </div>`;
  }).join('');
}

// ─── Financials Tab ───
function _renderFinancialsTab(clients, financials, months) {
  const maxBilled = Math.max(...months.map(m => m.billed), 1);
  return `
    <!-- Monthly Breakdown Chart -->
    <div class="card bs-card" style="margin-bottom:16px;">
      <div class="card-header"><h3>Monthly Breakdown</h3></div>
      <div class="card-body" style="padding:16px;">
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;">
          ${months.map(m => {
            const rate = m.billed > 0 ? ((m.collected / m.billed) * 100).toFixed(0) : '—';
            return `<div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:12px;">
              <div style="font-size:12px;font-weight:700;color:var(--gray-500);margin-bottom:8px;">${m.label}</div>
              <div style="font-size:11px;color:var(--gray-400);">Claims</div><div style="font-size:18px;font-weight:800;color:var(--brand-600);">${m.claims}</div>
              <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Billed</div><div style="font-size:14px;font-weight:700;">${_fmtK(m.billed)}</div>
              <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Collected</div><div style="font-size:14px;font-weight:700;color:var(--green);">${_fmtK(m.collected)}</div>
              <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Denied</div><div style="font-size:14px;font-weight:700;color:var(--red);">${_fmtK(m.denied)}</div>
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--gray-200);font-size:12px;font-weight:700;color:${rate !== '—' && parseFloat(rate) >= 90 ? 'var(--green)' : rate !== '—' && parseFloat(rate) >= 70 ? 'var(--gold)' : 'var(--red)'};">${rate}%</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <!-- Summary by Client -->
      <div class="card bs-card">
        <div class="card-header"><h3>Summary by Client</h3></div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap"><table>
            <thead><tr><th>Client</th><th style="text-align:right;">Claims</th><th style="text-align:right;">Billed</th><th style="text-align:right;">Collected</th><th style="text-align:right;">Denied</th><th style="text-align:right;">Rate</th></tr></thead>
            <tbody>
              ${clients.filter(c => c.status === 'active').map(c => {
                const cf = financials.filter(f => (f.billingClientId || f.billing_client_id) == c.id);
                const claims = cf.reduce((s, f) => s + (f.claimsSubmitted || f.claims_submitted || 0), 0);
                const billed = cf.reduce((s, f) => s + (f.amountBilled || f.amount_billed || 0), 0);
                const collected = cf.reduce((s, f) => s + (f.amountCollected || f.amount_collected || 0), 0);
                const denied = cf.reduce((s, f) => s + (f.deniedAmount || f.denied_amount || 0), 0);
                const rate = billed > 0 ? ((collected / billed) * 100).toFixed(1) : '0.0';
                return `<tr style="cursor:pointer;" onclick="window.app.viewBillingClient(${c.id})">
                  <td><strong>${escHtml(_clientName(c))}</strong></td>
                  <td style="text-align:right;">${claims}</td>
                  <td style="text-align:right;">${_fmtMoney(billed)}</td>
                  <td style="text-align:right;color:var(--green);font-weight:600;">${_fmtMoney(collected)}</td>
                  <td style="text-align:right;color:var(--red);">${_fmtMoney(denied)}</td>
                  <td style="text-align:right;font-weight:600;">${rate}%</td>
                </tr>`;
              }).join('')}
              ${clients.filter(c => c.status === 'active').length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--gray-500);">No active clients</td></tr>' : ''}
            </tbody>
          </table></div>
        </div>
      </div>

      <!-- Quick Entry -->
      <div class="card bs-card">
        <div class="card-header"><h3>Enter Monthly Financials</h3></div>
        <div class="card-body" style="padding:20px;">
          <p style="font-size:13px;color:var(--gray-600);margin-bottom:16px;">Enter monthly financial summary from your billing platform reports.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Client</label><select id="bs-fin-client" class="form-control"><option value="">Select client...</option>${clients.filter(c => c.status === 'active').map(c => `<option value="${c.id}">${escHtml(_clientName(c))}</option>`).join('')}</select></div>
            <div class="auth-field" style="margin:0;"><label>Period</label><input type="month" id="bs-fin-period" class="form-control" value="${new Date().toISOString().slice(0, 7)}"></div>
            <div class="auth-field" style="margin:0;"><label>Claims Submitted</label><input type="number" id="bs-fin-claims" class="form-control" min="0" placeholder="0"></div>
            <div class="auth-field" style="margin:0;"><label>Amount Billed</label><input type="number" id="bs-fin-billed" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Amount Collected</label><input type="number" id="bs-fin-collected" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Denials (count)</label><input type="number" id="bs-fin-denials" class="form-control" min="0" placeholder="0"></div>
            <div class="auth-field" style="margin:0;"><label>Denied Amount</label><input type="number" id="bs-fin-denied-amt" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Adjustments</label><input type="number" id="bs-fin-adjustments" class="form-control" step="0.01" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Patient Responsibility</label><input type="number" id="bs-fin-patient" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
          </div>
          <button class="btn btn-primary" style="margin-top:16px;width:100%;" onclick="window.app.saveBsFinancial()">Save Financial Summary</button>
        </div>
      </div>
    </div>
  `;

  // Async-load client reports into financials tab
  (async () => {
    const container = document.getElementById('bs-client-reports-container');
    if (container) {
      try {
        const { renderClientReportsSection } = await import('./rcm-phase2.js');
        container.innerHTML = await renderClientReportsSection();
      } catch (e) { /* phase2 not loaded yet */ }
    }
  })();
}

// ─── Client Detail Page ───
async function renderBillingClientDetail(clientId) {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let client = {}, tasks = [], activities = [], financials = [];
  try { client = await store.getBillingClient(clientId); } catch (e) {
    try { const all = await store.getBillingClients(); client = (Array.isArray(all) ? all : []).find(x => x.id == clientId) || {}; } catch {}
  }
  try { tasks = await store.getBillingTasks({ billing_client_id: clientId }); } catch {}
  try { activities = await store.getBillingActivities({ billing_client_id: clientId, limit: 50 }); } catch {}
  try { financials = await store.getBillingFinancials({ billing_client_id: clientId }); } catch {}
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(activities)) activities = [];
  if (!Array.isArray(financials)) financials = [];
  if (!client || !client.id) { body.innerHTML = '<div class="empty-state"><h3>Billing client not found</h3></div>'; return; }

  const orgName = _clientName(client);
  const platform = _getField(client, 'billingPlatform', 'billing_platform') || '—';
  const fee = _getField(client, 'monthlyFee', 'monthly_fee') || 0;
  const feeStruct = _getField(client, 'feeStructure', 'fee_structure') || 'flat';
  const feeLabels = { flat: 'Flat Monthly', per_provider: 'Per Provider/Mo', percentage: '% of Collections', per_claim: 'Per Claim' };
  const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  const totals = { claims: 0, billed: 0, collected: 0, denied: 0 };
  financials.forEach(f => {
    totals.claims += f.claimsSubmitted || f.claims_submitted || 0;
    totals.billed += f.amountBilled || f.amount_billed || 0;
    totals.collected += f.amountCollected || f.amount_collected || 0;
    totals.denied += f.deniedAmount || f.denied_amount || 0;
  });
  const collectionRate = totals.billed > 0 ? ((totals.collected / totals.billed) * 100).toFixed(1) : '0.0';

  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const pageActions = document.getElementById('page-actions');
  if (pageTitle) pageTitle.textContent = orgName;
  if (pageSubtitle) pageSubtitle.textContent = 'Billing Services — ' + platform;
  if (pageActions) pageActions.innerHTML = `
    <button class="btn btn-sm" onclick="window.app.navigateTo('revenue-cycle')">&larr; All Clients</button>
    <button class="btn btn-sm btn-primary" onclick="window.app.openBsTaskModal(${client.id})">+ Task</button>
    <button class="btn btn-sm btn-gold" onclick="window.app.openBsActivityModal(${client.id})">+ Log Activity</button>
    <button class="btn btn-sm" onclick="window.app.generateBillingInvoice(${client.id})">Generate Invoice</button>
    <button class="btn btn-sm" onclick="window.app.editBillingClient(${client.id})">Edit</button>
  `;

  body.innerHTML = `
    <style>.bsd-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}.bsd-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}.bsd-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}.bsd-stat .value{font-size:28px;font-weight:800;line-height:1.1;}.bsd-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}</style>

    <!-- Header -->
    <div class="card" style="border-top:3px solid var(--brand-600);margin-bottom:20px;border-radius:16px;">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <div style="font-size:24px;font-weight:800;color:var(--gray-900);">${escHtml(orgName)}</div>
            <div style="font-size:14px;color:var(--gray-600);margin-top:4px;">Platform: <strong>${escHtml(platform)}</strong> | Fee: <strong>${_fmtMoney(fee)}</strong> <span style="font-size:12px;color:var(--gray-400);">(${feeLabels[feeStruct] || feeStruct})</span></div>
            ${_getField(client, 'contactName', 'contact_name') ? `<div style="font-size:13px;color:var(--gray-500);margin-top:2px;">Contact: ${escHtml(_getField(client, 'contactName', 'contact_name'))}${_getField(client, 'contactEmail', 'contact_email') ? ' — ' + escHtml(_getField(client, 'contactEmail', 'contact_email')) : ''}</div>` : ''}
            ${_getField(client, 'startDate', 'start_date') ? `<div style="font-size:13px;color:var(--gray-500);margin-top:2px;">Since: ${formatDateDisplay(_getField(client, 'startDate', 'start_date'))}</div>` : ''}
          </div>
          <div>${_bsStatusBadge(client.status)}</div>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:20px;">
      <div class="stat-card bsd-stat"><div class="label">Open Tasks</div><div class="value" style="color:var(--gold);">${openTasks.length}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Completed</div><div class="value" style="color:var(--green);">${completedCount}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Billed</div><div class="value">${_fmtK(totals.billed)}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Collected</div><div class="value" style="color:var(--green);">${_fmtK(totals.collected)}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Denied</div><div class="value" style="color:var(--red);">${_fmtK(totals.denied)}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Collection Rate</div><div class="value" style="color:var(--brand-600);">${collectionRate}%</div></div>
    </div>

    <!-- Two columns -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Open Tasks (${openTasks.length})</h3><button class="btn btn-sm btn-primary" onclick="window.app.openBsTaskModal(${client.id})">+ Add</button></div>
        <div class="card-body" style="padding:0;">
          ${openTasks.length > 0 ? `<table><thead><tr><th>Task</th><th>Category</th><th>Priority</th><th>Due</th><th></th></tr></thead><tbody>
            ${openTasks.map(t => {
              const cat = TASK_CATEGORIES.find(c => c.value === (t.category || t.taskCategory || t.task_category));
              const dueDate = t.dueDate || t.due_date || '';
              const isOverdue = dueDate && new Date(dueDate) < new Date();
              return `<tr style="${isOverdue ? 'background:#fef2f2;' : ''}"><td><strong style="font-size:13px;">${escHtml(t.title || '—')}</strong></td><td style="font-size:12px;">${escHtml(cat ? cat.label : '')}</td><td>${_taskPriorityBadge(t.priority)}</td><td style="font-size:12px;${isOverdue ? 'color:var(--red);font-weight:600;' : ''}">${dueDate ? formatDateDisplay(dueDate) : '—'}</td><td><button class="btn btn-sm btn-primary" onclick="window.app.completeBsTask(${t.id})" style="padding:2px 8px;font-size:11px;">Done</button></td></tr>`;
            }).join('')}
          </tbody></table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No open tasks</div>'}
        </div>
      </div>

      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Recent Activity</h3><button class="btn btn-sm btn-gold" onclick="window.app.openBsActivityModal(${client.id})">+ Log</button></div>
        <div class="card-body" style="padding:12px 16px;">
          ${activities.length > 0 ? activities.slice(0, 15).map(a => {
            const type = a.activityType || a.activity_type || a.type || 'note';
            const typeLabel = ACTIVITY_TYPES.find(t => t.value === type);
            const amount = a.amount || 0;
            return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:13px;">
              <div style="flex-shrink:0;margin-top:2px;">${_activityTypeIcon(type)}</div>
              <div style="flex:1;min-width:0;"><strong>${escHtml(typeLabel ? typeLabel.label : type)}</strong>${amount ? ` — <span style="color:var(--green);font-weight:600;">${_fmtMoney(amount)}</span>` : ''}<div style="font-size:12px;color:var(--gray-600);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(a.notes || a.description || '')}</div><div style="font-size:11px;color:var(--gray-400);">${formatDateDisplay(a.activityDate || a.activity_date || a.createdAt || a.created_at)}</div></div>
            </div>`;
          }).join('') : '<div style="text-align:center;padding:1rem;color:var(--gray-500);">No activity logged yet</div>'}
        </div>
      </div>
    </div>

    ${financials.length > 0 ? `<div class="card" style="border-radius:16px;margin-top:16px;"><div class="card-header"><h3>Financial History</h3></div><div class="card-body" style="padding:0;"><table><thead><tr><th>Period</th><th style="text-align:right;">Claims</th><th style="text-align:right;">Billed</th><th style="text-align:right;">Collected</th><th style="text-align:right;">Denied</th><th style="text-align:right;">Adjustments</th><th style="text-align:right;">Rate</th></tr></thead><tbody>
      ${financials.map(f => {
        const b = f.amountBilled || f.amount_billed || 0;
        const c = f.amountCollected || f.amount_collected || 0;
        const r = b > 0 ? ((c / b) * 100).toFixed(1) : '—';
        return `<tr><td><strong>${escHtml(f.period || '—')}</strong></td><td style="text-align:right;">${f.claimsSubmitted || f.claims_submitted || 0}</td><td style="text-align:right;">${_fmtMoney(b)}</td><td style="text-align:right;color:var(--green);font-weight:600;">${_fmtMoney(c)}</td><td style="text-align:right;color:var(--red);">${_fmtMoney(f.deniedAmount || f.denied_amount || 0)}</td><td style="text-align:right;">${_fmtMoney(f.adjustments || 0)}</td><td style="text-align:right;font-weight:600;">${r}%</td></tr>`;
      }).join('')}
    </tbody></table></div></div>` : ''}
    ${client.notes ? `<div class="card" style="border-radius:16px;margin-top:16px;"><div class="card-header"><h3>Notes</h3></div><div class="card-body"><p style="white-space:pre-wrap;font-size:13px;color:var(--gray-600);margin:0;">${escHtml(client.notes)}</p></div></div>` : ''}
  `;
}

export {
  renderBillingServicesPage,
  renderBillingClientDetail,
  ACTIVITY_TYPES,
  TASK_CATEGORIES,
  _fmtMoney as fmtMoney,
};
