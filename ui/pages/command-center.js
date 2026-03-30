// ui/pages/command-center.js — Agency Command Center
// Bird's-eye view across all modules: credentialing, RCM, compliance, workspace

const { store, escHtml, formatDateDisplay, showToast } = window._credentik;

if (typeof window._ccTab === 'undefined') window._ccTab = 'overview';

const CC_TABS = [
  { key: 'overview',  label: 'Overview' },
  { key: 'activity',  label: 'Activity Feed' },
  { key: 'reports',   label: 'Reports' },
  { key: 'audit',     label: 'Audit Trail' },
  { key: 'client-profitability', label: 'Client Profitability' },
  { key: 'payer-performance',    label: 'Payer Performance' },
  { key: 'provider-productivity', label: 'Provider Productivity' },
  { key: 'rate-analysis',         label: 'Rate Analysis' },
  { key: 'sla-tracking',          label: 'SLA Tracking' },
];

function _ccMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export async function renderCommandCenterPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading Command Center...</div></div>';

  const tab = window._ccTab || 'overview';

  if (tab === 'audit') {
    // Delegate to existing audit trail renderer
    await window._appRender.renderAuditTrail();
    _injectTabBar(body, tab);
    return;
  }

  if (tab === 'overview') {
    await _renderOverview(body);
  } else if (tab === 'activity') {
    await _renderActivityFeed(body);
  } else if (tab === 'reports') {
    await _renderReports(body);
  } else if (tab === 'client-profitability') {
    await _renderClientProfitability(body);
  } else if (tab === 'payer-performance') {
    await _renderPayerPerformance(body);
  } else if (tab === 'provider-productivity') {
    await _renderProviderProductivity(body);
  } else if (tab === 'rate-analysis') {
    await _renderRateAnalysis(body);
  } else if (tab === 'sla-tracking') {
    await _renderSlaTracking(body);
  }

  _injectTabBar(body, tab);
}

function _injectTabBar(body, tab) {
  // Prepend hub tab bar, preserving sub-page internal tabs
  const tabBar = `
    <style>
      .cc-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;}
      .cc-tab{padding:8px 14px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .cc-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .cc-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>
    <div class="cc-tabs">
      ${CC_TABS.map(t => `<button class="cc-tab ${tab === t.key ? 'active' : ''}" onclick="window.app.ccSwitchTab('${t.key}')">${t.label}</button>`).join('')}
    </div>
  `;
  body.innerHTML = tabBar + body.innerHTML;
}

async function _renderOverview(body) {
  // Fetch data from all modules in parallel
  let providers = [], orgs = [], apps = [], licenses = [], tasks = [], followups = [];
  let bsStats = {}, bsClients = [], claims = [], denials = [], payments = [];

  const [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10] = await Promise.allSettled([
    store.getAll('providers'),
    store.getAll('organizations'),
    store.getAll('applications'),
    store.getAll('licenses'),
    store.getAll('tasks'),
    store.getAll('followups'),
    store.getBillingClientStats().catch(() => ({})),
    store.getBillingClients().catch(() => []),
    store.getRcmClaims().catch(() => []),
    store.getRcmDenials().catch(() => []),
    store.getRcmPayments().catch(() => []),
  ]);

  if (r0.status === 'fulfilled') providers = r0.value || [];
  if (r1.status === 'fulfilled') orgs = r1.value || [];
  if (r2.status === 'fulfilled') apps = r2.value || [];
  if (r3.status === 'fulfilled') licenses = r3.value || [];
  if (r4.status === 'fulfilled') tasks = r4.value || [];
  if (r5.status === 'fulfilled') followups = r5.value || [];
  if (r6.status === 'fulfilled') bsStats = r6.value || {};
  if (r7.status === 'fulfilled') bsClients = r7.value || [];
  if (r8.status === 'fulfilled') claims = Array.isArray(r8.value) ? r8.value : [];
  if (r9.status === 'fulfilled') denials = Array.isArray(r9.value) ? r9.value : [];
  if (r10.status === 'fulfilled') payments = Array.isArray(r10.value) ? r10.value : [];

  const today = new Date();
  const pendingTasks = (Array.isArray(tasks) ? tasks : []).filter(t => !t.completed && !t.isCompleted);
  const overdueTasks = pendingTasks.filter(t => t.dueDate && new Date(t.dueDate) < today);
  const overdueFollowups = (Array.isArray(followups) ? followups : []).filter(f => f.dueDate && new Date(f.dueDate) < today && f.status !== 'completed');
  const activeApps = apps.filter(a => a.status === 'in_progress' || a.status === 'submitted');
  const approvedApps = apps.filter(a => a.status === 'approved' || a.status === 'completed');
  const expiringLicenses = licenses.filter(l => {
    if (!l.expirationDate) return false;
    const exp = new Date(l.expirationDate);
    return exp > today && exp < new Date(Date.now() + 90 * 86400000);
  });

  const totalCharged = claims.reduce((s, c) => s + Number(c.chargedAmount || c.charged_amount || 0), 0);
  const totalCollected = claims.reduce((s, c) => s + Number(c.paidAmount || c.paid_amount || 0), 0);
  const totalBalance = totalCharged - totalCollected;
  const openDenials = denials.filter(d => d.status !== 'resolved' && d.status !== 'closed');
  const denialAmt = openDenials.reduce((s, d) => s + Number(d.deniedAmount || d.denied_amount || d.amount || 0), 0);

  // Compliance score
  const activeLicenses = licenses.filter(l => l.status === 'active' || !l.status);
  const totalProviders = providers.length;

  body.innerHTML = `
    <style>
      .cc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:24px;}
      .cc-card{background:white;border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);position:relative;overflow:hidden;transition:transform 0.2s;}
      .cc-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.1);}
      .cc-card-label{font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;}
      .cc-card-value{font-size:28px;font-weight:700;color:var(--gray-900);}
      .cc-card-sub{font-size:12px;color:var(--gray-500);margin-top:4px;}
      .cc-card-accent{position:absolute;top:0;left:0;width:4px;height:100%;border-radius:4px 0 0 4px;}
      .cc-section{margin-bottom:28px;}
      .cc-section-title{font-size:14px;font-weight:700;color:var(--gray-800);margin-bottom:12px;display:flex;align-items:center;gap:8px;}
      .cc-alert{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--red-50,#fef2f2);border:1px solid var(--red-200,#fecaca);border-radius:10px;margin-bottom:8px;font-size:13px;color:var(--red-700,#b91c1c);}
      .cc-alert-warn{background:var(--amber-50,#fffbeb);border-color:var(--amber-200,#fde68a);color:var(--amber-700,#b45309);}
      .cc-module-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-bottom:16px;}
      .cc-module{background:white;border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);cursor:pointer;transition:all 0.2s;}
      .cc-module:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.1);}
      .cc-module-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
      .cc-module-title{font-size:14px;font-weight:700;color:var(--gray-800);}
      .cc-module-stats{display:flex;gap:16px;flex-wrap:wrap;}
      .cc-module-stat{text-align:center;}
      .cc-module-stat-val{font-size:20px;font-weight:700;color:var(--gray-900);}
      .cc-module-stat-lbl{font-size:10px;color:var(--gray-500);text-transform:uppercase;}
    </style>

    <!-- Alerts -->
    ${overdueTasks.length > 0 ? `<div class="cc-alert"><strong>${overdueTasks.length}</strong> overdue task${overdueTasks.length > 1 ? 's' : ''} need attention <a href="#" onclick="window.app.wsSwitchTab('tasks');window.app.navigateTo('workspace');return false;" style="margin-left:auto;font-weight:600;">View</a></div>` : ''}
    ${overdueFollowups.length > 0 ? `<div class="cc-alert"><strong>${overdueFollowups.length}</strong> overdue follow-up${overdueFollowups.length > 1 ? 's' : ''} <a href="#" onclick="window._credTab='followups';window.app.navigateTo('credentialing');return false;" style="margin-left:auto;font-weight:600;">View</a></div>` : ''}
    ${expiringLicenses.length > 0 ? `<div class="cc-alert cc-alert-warn"><strong>${expiringLicenses.length}</strong> license${expiringLicenses.length > 1 ? 's' : ''} expiring within 90 days <a href="#" onclick="window._credTab='licenses';window.app.navigateTo('credentialing');return false;" style="margin-left:auto;font-weight:600;">View</a></div>` : ''}
    ${openDenials.length > 0 ? `<div class="cc-alert cc-alert-warn"><strong>${openDenials.length}</strong> open denial${openDenials.length > 1 ? 's' : ''} (${_ccMoney(denialAmt)}) <a href="#" onclick="window._rcTab='denials';window.app.navigateTo('revenue-cycle');return false;" style="margin-left:auto;font-weight:600;">View</a></div>` : ''}

    <!-- KPI Cards -->
    <div class="cc-section">
      <div class="cc-section-title">Agency at a Glance</div>
      <div class="cc-grid">
        <div class="cc-card"><div class="cc-card-accent" style="background:#0891b2;"></div><div class="cc-card-label">Providers</div><div class="cc-card-value">${providers.length}</div><div class="cc-card-sub">${orgs.length} organization${orgs.length !== 1 ? 's' : ''}</div></div>
        <div class="cc-card"><div class="cc-card-accent" style="background:#8b5cf6;"></div><div class="cc-card-label">Applications</div><div class="cc-card-value">${apps.length}</div><div class="cc-card-sub">${activeApps.length} active &middot; ${approvedApps.length} approved</div></div>
        <div class="cc-card"><div class="cc-card-accent" style="background:#f59e0b;"></div><div class="cc-card-label">Licenses</div><div class="cc-card-value">${licenses.length}</div><div class="cc-card-sub">${expiringLicenses.length} expiring soon</div></div>
        <div class="cc-card"><div class="cc-card-accent" style="background:#22c55e;"></div><div class="cc-card-label">Collected</div><div class="cc-card-value">${_ccMoney(totalCollected)}</div><div class="cc-card-sub">${_ccMoney(totalCharged)} charged</div></div>
        <div class="cc-card"><div class="cc-card-accent" style="background:#ef4444;"></div><div class="cc-card-label">Outstanding</div><div class="cc-card-value">${_ccMoney(totalBalance)}</div><div class="cc-card-sub">${claims.length} total claims</div></div>
        <div class="cc-card"><div class="cc-card-accent" style="background:#3b82f6;"></div><div class="cc-card-label">Open Tasks</div><div class="cc-card-value">${pendingTasks.length}</div><div class="cc-card-sub">${overdueTasks.length} overdue</div></div>
      </div>
    </div>

    <!-- Module Quick Access -->
    <div class="cc-section">
      <div class="cc-section-title">Modules</div>
      <div class="cc-module-row">
        <div class="cc-module" onclick="window.app.navigateTo('credentialing')">
          <div class="cc-module-header">
            <div class="cc-module-title">Credentialing</div>
            <svg width="16" height="16" fill="none" stroke="var(--gray-400)" stroke-width="1.5"><path d="M6 3l5 5-5 5"/></svg>
          </div>
          <div class="cc-module-stats">
            <div class="cc-module-stat"><div class="cc-module-stat-val">${providers.length}</div><div class="cc-module-stat-lbl">Providers</div></div>
            <div class="cc-module-stat"><div class="cc-module-stat-val">${activeApps.length}</div><div class="cc-module-stat-lbl">Active Apps</div></div>
            <div class="cc-module-stat"><div class="cc-module-stat-val">${overdueFollowups.length}</div><div class="cc-module-stat-lbl">Overdue F/U</div></div>
            <div class="cc-module-stat"><div class="cc-module-stat-val">${expiringLicenses.length}</div><div class="cc-module-stat-lbl">Expiring Lic</div></div>
          </div>
        </div>

        <div class="cc-module" onclick="window.app.navigateTo('revenue-cycle')">
          <div class="cc-module-header">
            <div class="cc-module-title">Revenue Cycle</div>
            <svg width="16" height="16" fill="none" stroke="var(--gray-400)" stroke-width="1.5"><path d="M6 3l5 5-5 5"/></svg>
          </div>
          <div class="cc-module-stats">
            <div class="cc-module-stat"><div class="cc-module-stat-val">${claims.length}</div><div class="cc-module-stat-lbl">Claims</div></div>
            <div class="cc-module-stat"><div class="cc-module-stat-val">${_ccMoney(totalCollected)}</div><div class="cc-module-stat-lbl">Collected</div></div>
            <div class="cc-module-stat"><div class="cc-module-stat-val">${openDenials.length}</div><div class="cc-module-stat-lbl">Open Denials</div></div>
            <div class="cc-module-stat"><div class="cc-module-stat-val">${payments.length}</div><div class="cc-module-stat-lbl">Payments</div></div>
          </div>
        </div>

        <div class="cc-module" onclick="window.app.navigateTo('compliance-hub')">
          <div class="cc-module-header">
            <div class="cc-module-title">Compliance</div>
            <svg width="16" height="16" fill="none" stroke="var(--gray-400)" stroke-width="1.5"><path d="M6 3l5 5-5 5"/></svg>
          </div>
          <div class="cc-module-stats">
            <div class="cc-module-stat"><div class="cc-module-stat-val">${activeLicenses.length}</div><div class="cc-module-stat-lbl">Active Lic</div></div>
            <div class="cc-module-stat"><div class="cc-module-stat-val">${expiringLicenses.length}</div><div class="cc-module-stat-lbl">Expiring</div></div>
            <div class="cc-module-stat"><div class="cc-module-stat-val">${totalProviders}</div><div class="cc-module-stat-lbl">Providers</div></div>
          </div>
        </div>

        <div class="cc-module" onclick="window.app.navigateTo('workspace')">
          <div class="cc-module-header">
            <div class="cc-module-title">Workspace</div>
            <svg width="16" height="16" fill="none" stroke="var(--gray-400)" stroke-width="1.5"><path d="M6 3l5 5-5 5"/></svg>
          </div>
          <div class="cc-module-stats">
            <div class="cc-module-stat"><div class="cc-module-stat-val">${pendingTasks.length}</div><div class="cc-module-stat-lbl">Open Tasks</div></div>
            <div class="cc-module-stat"><div class="cc-module-stat-val">${overdueTasks.length}</div><div class="cc-module-stat-lbl">Overdue</div></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function _renderActivityFeed(body) {
  // Combine activity from billing services + credentialing tasks + followups
  let activities = [], tasks = [], followups = [];
  const [r0, r1, r2] = await Promise.allSettled([
    store.getBillingActivities({ limit: 200 }).catch(() => []),
    store.getAll('tasks'),
    store.getAll('followups'),
  ]);
  if (r0.status === 'fulfilled') activities = Array.isArray(r0.value) ? r0.value : [];
  if (r1.status === 'fulfilled') tasks = r1.value || [];
  if (r2.status === 'fulfilled') followups = r2.value || [];

  // Convert tasks/followups into activity-like entries
  const allEvents = [];

  activities.forEach(a => {
    allEvents.push({
      date: a.activityDate || a.activity_date || a.createdAt || a.created_at || '',
      type: a.activityType || a.activity_type || 'note',
      module: 'RCM',
      title: a.description || a.title || 'Activity',
      detail: a.notes || '',
    });
  });

  tasks.forEach(t => {
    if (t.completedAt || t.completed_at) {
      allEvents.push({
        date: t.completedAt || t.completed_at,
        type: 'task_completed',
        module: 'Tasks',
        title: `Completed: ${t.title || ''}`,
        detail: '',
      });
    }
  });

  followups.forEach(f => {
    if (f.status === 'completed') {
      allEvents.push({
        date: f.completedDate || f.updatedAt || f.updated_at || f.dueDate || '',
        type: 'followup_done',
        module: 'Credentialing',
        title: `Follow-up completed: ${f.notes || f.type || ''}`,
        detail: '',
      });
    }
  });

  // Sort by date descending
  allEvents.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const recent = allEvents.slice(0, 100);

  const moduleColor = { RCM: '#22c55e', Tasks: '#3b82f6', Credentialing: '#8b5cf6' };

  body.innerHTML = `
    <div style="max-width:800px;">
      ${recent.length === 0 ? '<div style="text-align:center;padding:48px;color:var(--gray-400);">No activity recorded yet.</div>' : ''}
      ${recent.map(e => `
        <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--gray-100);">
          <div style="min-width:6px;border-radius:3px;background:${moduleColor[e.module] || '#9ca3af'};"></div>
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:13px;font-weight:600;color:var(--gray-800);">${escHtml(e.title)}</span>
              <span style="font-size:11px;color:var(--gray-400);white-space:nowrap;">${e.date ? formatDateDisplay(e.date) : ''}</span>
            </div>
            <div style="font-size:11px;color:var(--gray-500);margin-top:2px;">
              <span style="font-weight:600;color:${moduleColor[e.module] || '#9ca3af'};">${escHtml(e.module)}</span>
              ${e.detail ? ` &middot; ${escHtml(e.detail.substring(0, 100))}` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function _renderReports(body) {
  body.innerHTML = `
    <div style="max-width:700px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
        <div class="cc-module" onclick="window.app.exportAuditPacket()" style="cursor:pointer;">
          <div class="cc-module-title" style="margin-bottom:8px;">Compliance Audit Packet</div>
          <div style="font-size:12px;color:var(--gray-500);">Export a full compliance audit package including provider credentials, licenses, exclusion screenings, and PSV results.</div>
        </div>
        <div class="cc-module" onclick="window.app.generateComplianceReportPDF()" style="cursor:pointer;">
          <div class="cc-module-title" style="margin-bottom:8px;">Compliance Report (PDF)</div>
          <div style="font-size:12px;color:var(--gray-500);">Generate a printable compliance scoring report with risk matrix and recommendations.</div>
        </div>
        <div class="cc-module" onclick="window.app.navigateTo('status-export')" style="cursor:pointer;">
          <div class="cc-module-title" style="margin-bottom:8px;">Status Report Export</div>
          <div style="font-size:12px;color:var(--gray-500);">Generate formatted status reports for stakeholders showing application progress and timelines.</div>
        </div>
        <div class="cc-module" onclick="window.app.navigateTo('expiration-alerts')" style="cursor:pointer;">
          <div class="cc-module-title" style="margin-bottom:8px;">Expiration Alert Dashboard</div>
          <div style="font-size:12px;color:var(--gray-500);">View all upcoming license, credential, and document expirations across providers.</div>
        </div>
        <div class="cc-module" onclick="window.app.generateAllClientMonthlyReports()" style="cursor:pointer;">
          <div class="cc-module-title" style="margin-bottom:8px;">Generate All Client Reports</div>
          <div style="font-size:12px;color:var(--gray-500);">Generate monthly billing reports for all active billing clients at once. Each report opens in a new window for PDF export.</div>
        </div>
      </div>
    </div>
  `;
}

/* ── helpers shared by analytics tabs ── */
function _ccPct(num, denom) {
  if (!denom) return '0.0';
  return (num / denom * 100).toFixed(1);
}

function _ccDaysBetween(a, b) {
  if (!a || !b) return null;
  const d1 = new Date(a), d2 = new Date(b);
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

function _denialColor(rate) {
  if (rate < 5) return '#16a34a';
  if (rate <= 15) return '#d97706';
  return '#dc2626';
}

function _analyticsTableStyles() {
  return `
    .cc-analytics-table{width:100%;border-collapse:collapse;font-size:12px;}
    .cc-analytics-table th{text-align:left;padding:8px 10px;background:var(--gray-50);border-bottom:2px solid var(--gray-200);font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-500);white-space:nowrap;}
    .cc-analytics-table th.num{text-align:right;}
    .cc-analytics-table td{padding:8px 10px;border-bottom:1px solid var(--gray-100);}
    .cc-analytics-table td.num{text-align:right;font-family:monospace;font-weight:600;}
    .cc-analytics-table tr:hover{background:var(--gray-50);}
    .cc-analytics-table .totals-row td{font-weight:800;border-top:2px solid var(--gray-300);background:var(--gray-50);}
  `;
}

/* ═══════════════════════════════════════════════════
   CLIENT PROFITABILITY TAB
   ═══════════════════════════════════════════════════ */
async function _renderClientProfitability(body) {
  let claims = [], bsClients = [], feeSchedules = [];
  const [r0, r1, r2] = await Promise.allSettled([
    store.getRcmClaims().catch(() => []),
    store.getBillingClients().catch(() => []),
    store.getFeeSchedules().catch(() => []),
  ]);
  if (r0.status === 'fulfilled') claims = Array.isArray(r0.value) ? r0.value : [];
  if (r1.status === 'fulfilled') bsClients = Array.isArray(r1.value) ? r1.value : [];
  if (r2.status === 'fulfilled') feeSchedules = Array.isArray(r2.value) ? r2.value : [];

  const today = new Date();
  // Build client lookup
  const clientMap = {};
  bsClients.forEach(c => {
    clientMap[c.id] = {
      name: c.organizationName || c.organization_name || c.name || 'Unknown',
      feePercent: Number(c.agencyFeePercent || c.agency_fee_percent || 0),
    };
  });

  // Group claims by billing_client_id
  const byClient = {};
  claims.forEach(c => {
    const cid = c.billingClientId || c.billing_client_id || '_unassigned';
    if (!byClient[cid]) byClient[cid] = [];
    byClient[cid].push(c);
  });

  // Build rows
  const rows = [];
  Object.keys(byClient).forEach(cid => {
    const claimList = byClient[cid];
    const clientInfo = clientMap[cid] || { name: cid === '_unassigned' ? 'Unassigned' : ('Client #' + cid), feePercent: 0 };
    const totalClaims = claimList.length;
    const totalCharged = claimList.reduce((s, c) => s + Number(c.totalCharges || c.total_charges || c.chargedAmount || c.charged_amount || 0), 0);
    const totalCollected = claimList.reduce((s, c) => s + Number(c.totalPaid || c.total_paid || c.paidAmount || c.paid_amount || 0), 0);
    const deniedClaims = claimList.filter(c => c.status === 'denied');
    const deniedCount = deniedClaims.length;
    const deniedAmt = deniedClaims.reduce((s, c) => s + Number(c.totalCharges || c.total_charges || c.chargedAmount || c.charged_amount || 0), 0);
    const outstanding = totalCharged - totalCollected;

    // Avg days in A/R
    let totalDays = 0, dayCount = 0;
    claimList.forEach(c => {
      const dos = c.dateOfService || c.date_of_service;
      if (!dos) return;
      const paidDate = c.paidDate || c.paid_date;
      const endDate = (c.status === 'paid' && paidDate) ? paidDate : today.toISOString();
      const days = _ccDaysBetween(dos, endDate);
      if (days !== null) { totalDays += days; dayCount++; }
    });
    const avgDaysAR = dayCount > 0 ? Math.round(totalDays / dayCount) : 0;

    const feePercent = clientInfo.feePercent;
    const agencyRevenue = totalCollected * feePercent / 100;

    rows.push({
      name: clientInfo.name, totalClaims, totalCharged, totalCollected,
      collectionRate: totalCharged > 0 ? (totalCollected / totalCharged * 100) : 0,
      deniedCount, deniedAmt,
      denialRate: totalClaims > 0 ? (deniedCount / totalClaims * 100) : 0,
      outstanding, avgDaysAR, feePercent, agencyRevenue,
    });
  });

  rows.sort((a, b) => b.totalCollected - a.totalCollected);

  // Totals
  const totals = rows.reduce((t, r) => ({
    totalClaims: t.totalClaims + r.totalClaims,
    totalCharged: t.totalCharged + r.totalCharged,
    totalCollected: t.totalCollected + r.totalCollected,
    deniedCount: t.deniedCount + r.deniedCount,
    deniedAmt: t.deniedAmt + r.deniedAmt,
    outstanding: t.outstanding + r.outstanding,
    agencyRevenue: t.agencyRevenue + r.agencyRevenue,
  }), { totalClaims: 0, totalCharged: 0, totalCollected: 0, deniedCount: 0, deniedAmt: 0, outstanding: 0, agencyRevenue: 0 });

  // Bar chart data
  const maxCollected = Math.max(...rows.map(r => r.totalCollected), 1);

  body.innerHTML = `
    <style>${_analyticsTableStyles()}</style>

    <!-- Collections by Client bar chart -->
    <div class="cc-section">
      <div class="cc-section-title">Collections by Client</div>
      <div class="cc-card" style="padding:20px;">
        ${rows.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--gray-400);font-size:13px;">No claim data available.</div>' : `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${rows.slice(0, 15).map(r => `
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="min-width:140px;max-width:180px;font-size:12px;font-weight:600;color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.name)}">${escHtml(r.name)}</div>
              <div style="flex:1;background:var(--gray-100);border-radius:4px;height:22px;position:relative;overflow:hidden;">
                <div style="height:100%;width:${Math.max(r.totalCollected / maxCollected * 100, 1)}%;background:var(--brand-600);border-radius:4px;transition:width 0.3s;"></div>
              </div>
              <div style="min-width:80px;text-align:right;font-size:12px;font-weight:700;color:var(--gray-800);">${_ccMoney(r.totalCollected)}</div>
            </div>
          `).join('')}
        </div>
        `}
      </div>
    </div>

    <!-- Profitability Table -->
    <div class="cc-section">
      <div class="cc-section-title">Client Profitability Breakdown</div>
      <div class="cc-card" style="padding:0;overflow-x:auto;">
        ${rows.length === 0 ? '<div style="text-align:center;padding:48px;color:var(--gray-400);font-size:13px;">No billing clients or claims found.</div>' : `
        <table class="cc-analytics-table">
          <thead><tr>
            <th>Client</th><th class="num">Claims</th><th class="num">Charged</th><th class="num">Collected</th>
            <th class="num">Collect %</th><th class="num">Denied</th><th class="num">Denial %</th>
            <th class="num">Outstanding</th><th class="num">Avg Days A/R</th><th class="num">Fee %</th><th class="num">Agency Rev</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td style="font-weight:600;">${escHtml(r.name)}</td>
              <td class="num">${r.totalClaims}</td>
              <td class="num">${_ccMoney(r.totalCharged)}</td>
              <td class="num" style="color:#16a34a;">${_ccMoney(r.totalCollected)}</td>
              <td class="num">${_ccPct(r.totalCollected, r.totalCharged)}%</td>
              <td class="num" style="color:#dc2626;">${_ccMoney(r.deniedAmt)} <span style="font-size:10px;color:var(--gray-400);">(${r.deniedCount})</span></td>
              <td class="num" style="color:${_denialColor(r.denialRate)};">${r.denialRate.toFixed(1)}%</td>
              <td class="num" style="color:#ea580c;">${_ccMoney(r.outstanding)}</td>
              <td class="num">${r.avgDaysAR}</td>
              <td class="num">${r.feePercent > 0 ? r.feePercent + '%' : '—'}</td>
              <td class="num" style="color:#7c3aed;font-weight:700;">${r.agencyRevenue > 0 ? _ccMoney(r.agencyRevenue) : '—'}</td>
            </tr>`).join('')}
            <tr class="totals-row">
              <td>TOTAL</td>
              <td class="num">${totals.totalClaims}</td>
              <td class="num">${_ccMoney(totals.totalCharged)}</td>
              <td class="num" style="color:#16a34a;">${_ccMoney(totals.totalCollected)}</td>
              <td class="num">${_ccPct(totals.totalCollected, totals.totalCharged)}%</td>
              <td class="num" style="color:#dc2626;">${_ccMoney(totals.deniedAmt)} <span style="font-size:10px;color:var(--gray-400);">(${totals.deniedCount})</span></td>
              <td class="num">${totals.totalClaims > 0 ? (totals.deniedCount / totals.totalClaims * 100).toFixed(1) : '0.0'}%</td>
              <td class="num" style="color:#ea580c;">${_ccMoney(totals.outstanding)}</td>
              <td class="num">—</td>
              <td class="num">—</td>
              <td class="num" style="color:#7c3aed;font-weight:700;">${_ccMoney(totals.agencyRevenue)}</td>
            </tr>
          </tbody>
        </table>
        `}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════
   PAYER PERFORMANCE TAB
   ═══════════════════════════════════════════════════ */
async function _renderPayerPerformance(body) {
  let claims = [], feeSchedules = [];
  const [r0, r1] = await Promise.allSettled([
    store.getRcmClaims().catch(() => []),
    store.getFeeSchedules().catch(() => []),
  ]);
  if (r0.status === 'fulfilled') claims = Array.isArray(r0.value) ? r0.value : [];
  if (r1.status === 'fulfilled') feeSchedules = Array.isArray(r1.value) ? r1.value : [];

  // Build fee schedule lookup: cpt_code -> expected rate
  const fsLookup = {};
  feeSchedules.forEach(s => {
    const cpt = s.cpt_code || s.cptCode || '';
    const rate = Number(s.expected_payment || s.expectedPayment || s.rate || 0);
    if (cpt && rate > 0) fsLookup[cpt] = rate;
  });

  // Group claims by payer
  const byPayer = {};
  claims.forEach(c => {
    const payer = c.payerName || c.payer_name || 'Unknown';
    if (!byPayer[payer]) byPayer[payer] = [];
    byPayer[payer].push(c);
  });

  const rows = [];
  Object.keys(byPayer).forEach(payer => {
    const claimList = byPayer[payer];
    const totalClaims = claimList.length;
    const totalCharged = claimList.reduce((s, c) => s + Number(c.totalCharges || c.total_charges || c.chargedAmount || c.charged_amount || 0), 0);
    const totalPaid = claimList.reduce((s, c) => s + Number(c.totalPaid || c.total_paid || c.paidAmount || c.paid_amount || 0), 0);
    const deniedClaims = claimList.filter(c => c.status === 'denied');
    const denialCount = deniedClaims.length;
    const denialRate = totalClaims > 0 ? (denialCount / totalClaims * 100) : 0;
    const collectionRate = totalCharged > 0 ? (totalPaid / totalCharged * 100) : 0;
    const avgPayPerClaim = totalClaims > 0 ? (totalPaid / totalClaims) : 0;

    // Avg days to payment (for paid claims)
    let totalDays = 0, dayCount = 0;
    claimList.forEach(c => {
      if (c.status !== 'paid') return;
      const dos = c.dateOfService || c.date_of_service;
      const pd = c.paidDate || c.paid_date;
      const days = _ccDaysBetween(dos, pd);
      if (days !== null) { totalDays += days; dayCount++; }
    });
    const avgDaysToPay = dayCount > 0 ? Math.round(totalDays / dayCount) : 0;

    // Underpayment check: compare paid vs fee schedule expected
    let totalExpected = 0, expectedCount = 0;
    claimList.forEach(c => {
      if (c.status !== 'paid') return;
      const sls = c.serviceLines || c.service_lines || [];
      let claimExpected = 0;
      sls.forEach(sl => {
        const cpt = sl.cptCode || sl.cpt_code || '';
        const units = Number(sl.units || 1);
        const rate = fsLookup[cpt];
        if (rate) claimExpected += rate * units;
      });
      if (claimExpected > 0) { totalExpected += claimExpected; expectedCount++; }
    });
    const underpaid = (expectedCount > 0 && totalPaid < totalExpected * 0.95);

    rows.push({
      payer, totalClaims, totalCharged, totalPaid, collectionRate,
      denialCount, denialRate, avgDaysToPay, avgPayPerClaim, underpaid,
    });
  });

  rows.sort((a, b) => b.totalPaid - a.totalPaid);

  body.innerHTML = `
    <style>${_analyticsTableStyles()}</style>

    <div class="cc-section">
      <div class="cc-section-title">Payer Performance Comparison</div>
      <div class="cc-card" style="padding:0;overflow-x:auto;">
        ${rows.length === 0 ? '<div style="text-align:center;padding:48px;color:var(--gray-400);font-size:13px;">No claims data available.</div>' : `
        <table class="cc-analytics-table">
          <thead><tr>
            <th>Payer</th><th class="num">Claims</th><th class="num">Charged</th><th class="num">Paid</th>
            <th class="num">Collect %</th><th class="num">Denials</th><th class="num">Denial %</th>
            <th class="num">Avg Days to Pay</th><th class="num">Avg $/Claim</th><th class="num">Flag</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td style="font-weight:600;">${escHtml(r.payer)}</td>
              <td class="num">${r.totalClaims}</td>
              <td class="num">${_ccMoney(r.totalCharged)}</td>
              <td class="num" style="color:#16a34a;">${_ccMoney(r.totalPaid)}</td>
              <td class="num">${r.collectionRate.toFixed(1)}%</td>
              <td class="num">${r.denialCount}</td>
              <td class="num"><span style="color:${_denialColor(r.denialRate)};font-weight:700;">${r.denialRate.toFixed(1)}%</span></td>
              <td class="num">${r.avgDaysToPay > 0 ? r.avgDaysToPay + 'd' : '—'}</td>
              <td class="num">${_ccMoney(r.avgPayPerClaim)}</td>
              <td class="num">${r.underpaid ? '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;">UNDERPAID</span>' : '<span style="color:var(--gray-300);font-size:10px;">OK</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        `}
      </div>
    </div>

    <!-- Visual: denial rate comparison -->
    <div class="cc-section">
      <div class="cc-section-title">Denial Rate by Payer</div>
      <div class="cc-card" style="padding:20px;">
        ${rows.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--gray-400);font-size:13px;">No data.</div>' : `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${rows.map(r => `
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="min-width:160px;max-width:200px;font-size:12px;font-weight:600;color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.payer)}">${escHtml(r.payer)}</div>
              <div style="flex:1;background:var(--gray-100);border-radius:4px;height:20px;position:relative;overflow:hidden;">
                <div style="height:100%;width:${Math.min(r.denialRate, 100)}%;background:${_denialColor(r.denialRate)};border-radius:4px;transition:width 0.3s;"></div>
              </div>
              <div style="min-width:50px;text-align:right;font-size:12px;font-weight:700;color:${_denialColor(r.denialRate)};">${r.denialRate.toFixed(1)}%</div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:16px;margin-top:14px;justify-content:center;font-size:11px;color:var(--gray-500);">
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#16a34a;"></span> &lt;5%</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#d97706;"></span> 5-15%</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#dc2626;"></span> &gt;15%</span>
        </div>
        `}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════
   PROVIDER PRODUCTIVITY TAB
   ═══════════════════════════════════════════════════ */
async function _renderProviderProductivity(body) {
  let claims = [];
  const [r0] = await Promise.allSettled([
    store.getRcmClaims().catch(() => []),
  ]);
  if (r0.status === 'fulfilled') claims = Array.isArray(r0.value) ? r0.value : [];

  // Group by provider
  const byProvider = {};
  claims.forEach(c => {
    const prov = c.providerName || c.provider_name || 'Unknown';
    if (!byProvider[prov]) byProvider[prov] = [];
    byProvider[prov].push(c);
  });

  const rows = [];
  Object.keys(byProvider).forEach(prov => {
    const claimList = byProvider[prov];
    const totalClaims = claimList.length;
    const totalCharged = claimList.reduce((s, c) => s + Number(c.totalCharges || c.total_charges || c.chargedAmount || c.charged_amount || 0), 0);
    const totalCollected = claimList.reduce((s, c) => s + Number(c.totalPaid || c.total_paid || c.paidAmount || c.paid_amount || 0), 0);
    const deniedCount = claimList.filter(c => c.status === 'denied').length;
    const denialRate = totalClaims > 0 ? (deniedCount / totalClaims * 100) : 0;
    const collectionRate = totalCharged > 0 ? (totalCollected / totalCharged * 100) : 0;
    const avgClaimValue = totalClaims > 0 ? (totalCharged / totalClaims) : 0;

    // Unique patients
    const patientSet = new Set();
    claimList.forEach(c => {
      const pt = (c.patientName || c.patient_name || '').trim().toLowerCase();
      if (pt) patientSet.add(pt);
    });
    const uniquePatients = patientSet.size;

    // Claims per month: find earliest and latest DOS
    let minDate = null, maxDate = null;
    claimList.forEach(c => {
      const dos = c.dateOfService || c.date_of_service;
      if (!dos) return;
      const d = new Date(dos);
      if (isNaN(d)) return;
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    });
    let monthsActive = 1;
    if (minDate && maxDate) {
      monthsActive = Math.max(1, Math.round((maxDate - minDate) / (30 * 86400000)) + 1);
    }
    const claimsPerMonth = Math.round(totalClaims / monthsActive * 10) / 10;

    rows.push({
      provider: prov, totalClaims, totalCharged, totalCollected,
      collectionRate, denialRate, avgClaimValue, uniquePatients, claimsPerMonth,
    });
  });

  rows.sort((a, b) => b.totalCollected - a.totalCollected);

  body.innerHTML = `
    <style>${_analyticsTableStyles()}</style>

    <div class="cc-section">
      <div class="cc-section-title">Provider Productivity</div>
      <div class="cc-card" style="padding:0;overflow-x:auto;">
        ${rows.length === 0 ? '<div style="text-align:center;padding:48px;color:var(--gray-400);font-size:13px;">No claims data available.</div>' : `
        <table class="cc-analytics-table">
          <thead><tr>
            <th>Provider</th><th class="num">Claims</th><th class="num">Charged</th><th class="num">Collected</th>
            <th class="num">Collect %</th><th class="num">Denial %</th><th class="num">Avg Claim</th>
            <th class="num">Patients</th><th class="num">Claims/Mo</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td style="font-weight:600;">${escHtml(r.provider)}</td>
              <td class="num">${r.totalClaims}</td>
              <td class="num">${_ccMoney(r.totalCharged)}</td>
              <td class="num" style="color:#16a34a;">${_ccMoney(r.totalCollected)}</td>
              <td class="num">${r.collectionRate.toFixed(1)}%</td>
              <td class="num"><span style="color:${_denialColor(r.denialRate)};font-weight:700;">${r.denialRate.toFixed(1)}%</span></td>
              <td class="num">${_ccMoney(r.avgClaimValue)}</td>
              <td class="num">${r.uniquePatients}</td>
              <td class="num">${r.claimsPerMonth}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        `}
      </div>
    </div>

    <!-- Visual: collected by provider -->
    <div class="cc-section">
      <div class="cc-section-title">Collections by Provider</div>
      <div class="cc-card" style="padding:20px;">
        ${rows.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--gray-400);font-size:13px;">No data.</div>' : `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${rows.slice(0, 15).map(r => {
            const maxC = Math.max(...rows.map(x => x.totalCollected), 1);
            return `
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="min-width:160px;max-width:200px;font-size:12px;font-weight:600;color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.provider)}">${escHtml(r.provider)}</div>
              <div style="flex:1;background:var(--gray-100);border-radius:4px;height:22px;position:relative;overflow:hidden;">
                <div style="height:100%;width:${Math.max(r.totalCollected / maxC * 100, 1)}%;background:#22c55e;border-radius:4px;transition:width 0.3s;"></div>
              </div>
              <div style="min-width:80px;text-align:right;font-size:12px;font-weight:700;color:var(--gray-800);">${_ccMoney(r.totalCollected)}</div>
            </div>`;
          }).join('')}
        </div>
        `}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════
   SLA TRACKING TAB
   ═══════════════════════════════════════════════════ */
async function _renderSlaTracking(body) {
  let claims = [], denials = [], tasks = [], bsClients = [], billingTasks = [];
  const [r0, r1, r2, r3, r4] = await Promise.allSettled([
    store.getRcmClaims().catch(() => []),
    store.getRcmDenials().catch(() => []),
    store.getAll('tasks'),
    store.getBillingClients().catch(() => []),
    store.getBillingTasks().catch(() => []),
  ]);
  if (r0.status === 'fulfilled') claims = Array.isArray(r0.value) ? r0.value : [];
  if (r1.status === 'fulfilled') denials = Array.isArray(r1.value) ? r1.value : [];
  if (r2.status === 'fulfilled') tasks = r2.value || [];
  if (r3.status === 'fulfilled') bsClients = Array.isArray(r3.value) ? r3.value : [];
  if (r4.status === 'fulfilled') billingTasks = Array.isArray(r4.value) ? r4.value : [];

  const allTasks = [
    ...(Array.isArray(tasks) ? tasks : []),
    ...(Array.isArray(billingTasks) ? billingTasks : []),
  ];

  const today = new Date();

  // ── Helper: get client name ──
  const clientMap = {};
  bsClients.forEach(c => {
    clientMap[c.id] = c.organizationName || c.organization_name || c.name || 'Unknown';
  });

  // ── SLA 1: DOS to Claim Submission ──
  const dosToSubmit = [];
  claims.forEach(c => {
    const dos = c.dateOfService || c.date_of_service;
    const subDate = c.submittedDate || c.submitted_date || c.createdAt || c.created_at;
    if (!dos || !subDate) return;
    const days = _ccDaysBetween(dos, subDate);
    if (days !== null && days >= 0) {
      dosToSubmit.push({ days, clientId: c.billingClientId || c.billing_client_id || '_unassigned', dos });
    }
  });
  const avgDosToSubmit = dosToSubmit.length > 0 ? (dosToSubmit.reduce((s, x) => s + x.days, 0) / dosToSubmit.length) : null;

  // ── SLA 2: Denial to Appeal Filed ──
  const denialToAppeal = [];
  denials.forEach(d => {
    const appealStatus = d.appealStatus || d.appeal_status || '';
    if (!appealStatus || appealStatus === 'not_appealed') return;
    const denialDate = d.denialDate || d.denial_date || d.createdAt || d.created_at;
    const appealDate = d.appealFiledDate || d.appeal_filed_date;
    if (!denialDate || !appealDate) return;
    const days = _ccDaysBetween(denialDate, appealDate);
    if (days !== null && days >= 0) {
      denialToAppeal.push({ days, clientId: d.billingClientId || d.billing_client_id || '_unassigned' });
    }
  });
  const avgDenialToAppeal = denialToAppeal.length > 0 ? (denialToAppeal.reduce((s, x) => s + x.days, 0) / denialToAppeal.length) : null;

  // ── SLA 3: Days in A/R (DOS to Payment) ──
  const daysInAR = [];
  claims.forEach(c => {
    if (c.status !== 'paid') return;
    const dos = c.dateOfService || c.date_of_service;
    const pd = c.paidDate || c.paid_date;
    if (!dos || !pd) return;
    const days = _ccDaysBetween(dos, pd);
    if (days !== null && days >= 0) {
      daysInAR.push({ days, clientId: c.billingClientId || c.billing_client_id || '_unassigned', payer: c.payerName || c.payer_name || 'Unknown' });
    }
  });
  const avgDaysInAR = daysInAR.length > 0 ? (daysInAR.reduce((s, x) => s + x.days, 0) / daysInAR.length) : null;

  // ── SLA 4: Claim to First Payment (all claims with paid date) ──
  const claimToPayment = [];
  claims.forEach(c => {
    const subDate = c.submittedDate || c.submitted_date || c.createdAt || c.created_at;
    const pd = c.paidDate || c.paid_date;
    if (!subDate || !pd) return;
    const days = _ccDaysBetween(subDate, pd);
    if (days !== null && days >= 0) {
      claimToPayment.push({ days, clientId: c.billingClientId || c.billing_client_id || '_unassigned', payer: c.payerName || c.payer_name || 'Unknown' });
    }
  });
  const avgClaimToPayment = claimToPayment.length > 0 ? (claimToPayment.reduce((s, x) => s + x.days, 0) / claimToPayment.length) : null;

  // ── SLA 5: Task overdue metrics ──
  const openTasks = allTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && !t.completed && !t.isCompleted);
  const overdueTasks = openTasks.filter(t => {
    const dd = t.dueDate || t.due_date;
    return dd && new Date(dd) < today;
  });
  const overdueCount = overdueTasks.length;
  const overduePct = openTasks.length > 0 ? (overdueCount / openTasks.length * 100) : 0;

  // Avg days overdue
  let totalOverdueDays = 0;
  overdueTasks.forEach(t => {
    const dd = t.dueDate || t.due_date;
    const days = _ccDaysBetween(dd, today.toISOString());
    if (days !== null) totalOverdueDays += days;
  });
  const avgOverdueDays = overdueCount > 0 ? Math.round(totalOverdueDays / overdueCount) : 0;

  // ── SLA Scorecard grading ──
  let slaWarnings = 0;
  let slaCritical = 0;
  if (avgDosToSubmit !== null) { if (avgDosToSubmit > 5) slaCritical++; else if (avgDosToSubmit > 3) slaWarnings++; }
  if (avgDenialToAppeal !== null) { if (avgDenialToAppeal > 10) slaCritical++; else if (avgDenialToAppeal > 5) slaWarnings++; }
  if (avgDaysInAR !== null) { if (avgDaysInAR > 60) slaCritical++; else if (avgDaysInAR > 35) slaWarnings++; }
  if (overduePct > 30) slaCritical++; else if (overduePct > 15) slaWarnings++;
  if (avgClaimToPayment !== null) { if (avgClaimToPayment > 45) slaCritical++; else if (avgClaimToPayment > 30) slaWarnings++; }

  let grade = 'A', gradeColor = '#16a34a', gradeBg = '#f0fdf4', gradeLabel = 'All SLAs Met';
  if (slaCritical >= 2) { grade = 'D'; gradeColor = '#dc2626'; gradeBg = '#fef2f2'; gradeLabel = 'Critical SLA Failures'; }
  else if (slaCritical >= 1) { grade = 'C'; gradeColor = '#ea580c'; gradeBg = '#fff7ed'; gradeLabel = 'Multiple SLAs Missed'; }
  else if (slaWarnings >= 1) { grade = 'B'; gradeColor = '#d97706'; gradeBg = '#fffbeb'; gradeLabel = 'Most SLAs Met, Minor Warnings'; }

  // ── Helper for SLA card status ──
  function _slaStatus(value, warnThreshold, critThreshold, unit) {
    if (value === null) return '<span style="font-size:11px;color:var(--gray-400);">No data</span>';
    const v = Math.round(value * 10) / 10;
    let color = '#16a34a', label = 'ON TARGET';
    if (value > critThreshold) { color = '#dc2626'; label = 'CRITICAL'; }
    else if (value > warnThreshold) { color = '#d97706'; label = 'WARNING'; }
    return `<span style="font-size:24px;font-weight:800;color:${color};">${v}</span><span style="font-size:12px;color:var(--gray-500);margin-left:4px;">${escHtml(unit)}</span>
            <div style="margin-top:4px;"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:${color}20;color:${color};">${label}</span></div>`;
  }

  // ── Monthly SLA Trend ──
  const monthlyData = {};
  claims.forEach(c => {
    const dos = c.dateOfService || c.date_of_service;
    if (!dos) return;
    const m = dos.toString().slice(0, 7); // YYYY-MM
    if (!monthlyData[m]) monthlyData[m] = { claims: 0, submitDays: [], paidClaims: 0, arDays: [] };
    monthlyData[m].claims++;
    const subDate = c.submittedDate || c.submitted_date || c.createdAt || c.created_at;
    if (subDate) {
      const d = _ccDaysBetween(dos, subDate);
      if (d !== null && d >= 0) monthlyData[m].submitDays.push(d);
    }
    if (c.status === 'paid') {
      monthlyData[m].paidClaims++;
      const pd = c.paidDate || c.paid_date;
      if (pd) { const d = _ccDaysBetween(dos, pd); if (d !== null && d >= 0) monthlyData[m].arDays.push(d); }
    }
  });

  // Denials worked per month
  const monthlyDenials = {};
  denials.forEach(d => {
    const dt = d.denialDate || d.denial_date || d.createdAt || d.created_at;
    if (!dt) return;
    const m = dt.toString().slice(0, 7);
    if (!monthlyDenials[m]) monthlyDenials[m] = { total: 0, worked: 0, workDays: [] };
    monthlyDenials[m].total++;
    const appealStatus = d.appealStatus || d.appeal_status || '';
    const resolved = d.status === 'resolved' || d.status === 'closed';
    if (appealStatus && appealStatus !== 'not_appealed' || resolved) {
      monthlyDenials[m].worked++;
      const denialDate = d.denialDate || d.denial_date || d.createdAt || d.created_at;
      const resolveDate = d.resolvedDate || d.resolved_date || d.updatedAt || d.updated_at;
      if (denialDate && resolveDate) {
        const days = _ccDaysBetween(denialDate, resolveDate);
        if (days !== null && days >= 0) monthlyDenials[m].workDays.push(days);
      }
    }
  });

  // Tasks per month
  const monthlyTasks = {};
  allTasks.forEach(t => {
    const completedAt = t.completedAt || t.completed_at || (t.status === 'completed' ? (t.updatedAt || t.updated_at || '') : '');
    if (!completedAt) return;
    const m = completedAt.toString().slice(0, 7);
    if (!monthlyTasks[m]) monthlyTasks[m] = { completed: 0, overdue: 0 };
    monthlyTasks[m].completed++;
    const dd = t.dueDate || t.due_date;
    if (dd && new Date(completedAt) > new Date(dd)) monthlyTasks[m].overdue++;
  });
  // Also count currently overdue tasks by their due month
  overdueTasks.forEach(t => {
    const dd = t.dueDate || t.due_date;
    if (!dd) return;
    const m = dd.toString().slice(0, 7);
    if (!monthlyTasks[m]) monthlyTasks[m] = { completed: 0, overdue: 0 };
    monthlyTasks[m].overdue++;
  });

  const allMonths = [...new Set([...Object.keys(monthlyData), ...Object.keys(monthlyDenials), ...Object.keys(monthlyTasks)])].sort();
  const recentMonths = allMonths.slice(-12);

  // ── Task Performance by Category ──
  const taskByCat = {};
  allTasks.forEach(t => {
    const cat = t.category || t.taskCategory || t.task_category || 'other';
    if (!taskByCat[cat]) taskByCat[cat] = { total: 0, completed: 0, overdue: 0, completionDays: [] };
    taskByCat[cat].total++;
    const isCompleted = t.status === 'completed' || t.completed || t.isCompleted;
    if (isCompleted) {
      taskByCat[cat].completed++;
      const created = t.createdAt || t.created_at || '';
      const completedAt = t.completedAt || t.completed_at || t.updatedAt || t.updated_at || '';
      if (created && completedAt) {
        const d = _ccDaysBetween(created, completedAt);
        if (d !== null) taskByCat[cat].completionDays.push(d);
      }
    } else {
      const dd = t.dueDate || t.due_date;
      if (dd && new Date(dd) < today) taskByCat[cat].overdue++;
    }
  });

  const catLabels = {
    charge_entry: 'Charge Entry', claim_submission: 'Claim Submission', claim_followup: 'Claim Follow-up',
    denial_management: 'Denial Management', payment_posting: 'Payment Posting', eligibility: 'Eligibility',
    authorization: 'Authorization', credentialing: 'Credentialing', other: 'Other',
  };

  // ── Per-Client SLA data ──
  function _computeClientSLA(clientId) {
    const cDos = dosToSubmit.filter(x => String(x.clientId) === String(clientId));
    const cDenial = denialToAppeal.filter(x => String(x.clientId) === String(clientId));
    const cAR = daysInAR.filter(x => String(x.clientId) === String(clientId));
    const cPay = claimToPayment.filter(x => String(x.clientId) === String(clientId));
    const cTasks = allTasks.filter(t => String(t.billingClientId || t.billing_client_id) === String(clientId));
    const cOpen = cTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && !t.completed && !t.isCompleted);
    const cOverdue = cOpen.filter(t => { const dd = t.dueDate || t.due_date; return dd && new Date(dd) < today; });

    return {
      avgDosToSubmit: cDos.length > 0 ? (cDos.reduce((s, x) => s + x.days, 0) / cDos.length) : null,
      avgDenialToAppeal: cDenial.length > 0 ? (cDenial.reduce((s, x) => s + x.days, 0) / cDenial.length) : null,
      avgDaysInAR: cAR.length > 0 ? (cAR.reduce((s, x) => s + x.days, 0) / cAR.length) : null,
      avgClaimToPayment: cPay.length > 0 ? (cPay.reduce((s, x) => s + x.days, 0) / cPay.length) : null,
      openTasks: cOpen.length,
      overdueTasks: cOverdue.length,
      overduePct: cOpen.length > 0 ? (cOverdue.length / cOpen.length * 100) : 0,
      claimCount: cDos.length,
      denialCount: cDenial.length,
    };
  }

  body.innerHTML = `
    <style>
      ${_analyticsTableStyles()}
      .sla-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:24px;}
      .sla-card{background:white;border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.06);text-align:center;position:relative;}
      .sla-card-label{font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;}
      .sla-card-target{font-size:10px;color:var(--gray-400);margin-top:6px;}
      .sla-grade-box{display:flex;align-items:center;gap:20px;background:${gradeBg};border:2px solid ${gradeColor}30;border-radius:16px;padding:24px 32px;margin-bottom:24px;}
      .sla-grade-letter{font-size:64px;font-weight:900;color:${gradeColor};line-height:1;}
      .sla-grade-details{flex:1;}
      .sla-grade-label{font-size:18px;font-weight:700;color:${gradeColor};}
      .sla-grade-sub{font-size:12px;color:var(--gray-500);margin-top:4px;}
      .sla-filter-bar{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;}
      .sla-filter-bar select{padding:6px 12px;border-radius:8px;border:1px solid var(--gray-200);font-size:12px;background:white;}
      .sla-compare-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;}
      .sla-compare-cell{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:var(--gray-50);border-radius:8px;font-size:12px;}
      .sla-compare-label{color:var(--gray-600);font-weight:600;}
      .sla-compare-val{font-weight:800;font-size:14px;}
    </style>

    <!-- SLA Scorecard -->
    <div class="cc-section">
      <div class="cc-section-title">SLA Scorecard</div>
      <div class="sla-grade-box">
        <div class="sla-grade-letter">${grade}</div>
        <div class="sla-grade-details">
          <div class="sla-grade-label">${escHtml(gradeLabel)}</div>
          <div class="sla-grade-sub">${slaCritical > 0 ? escHtml(slaCritical + ' critical') : ''}${slaCritical > 0 && slaWarnings > 0 ? ' &middot; ' : ''}${slaWarnings > 0 ? escHtml(slaWarnings + ' warning(s)') : ''}${slaCritical === 0 && slaWarnings === 0 ? 'All operational metrics within target ranges' : ''}</div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <span style="font-size:10px;padding:3px 8px;border-radius:6px;background:#f0fdf4;color:#16a34a;font-weight:600;">A = All SLAs Met</span>
            <span style="font-size:10px;padding:3px 8px;border-radius:6px;background:#fffbeb;color:#d97706;font-weight:600;">B = Minor Warnings</span>
            <span style="font-size:10px;padding:3px 8px;border-radius:6px;background:#fff7ed;color:#ea580c;font-weight:600;">C = Multiple Missed</span>
            <span style="font-size:10px;padding:3px 8px;border-radius:6px;background:#fef2f2;color:#dc2626;font-weight:600;">D = Critical Failures</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Key SLA Cards -->
    <div class="cc-section">
      <div class="cc-section-title">Key SLA Metrics</div>
      <div class="sla-cards">
        <div class="sla-card">
          <div class="sla-card-label">Avg Days: DOS to Submission</div>
          ${_slaStatus(avgDosToSubmit, 3, 5, 'days')}
          <div class="sla-card-target">Target: &lt;3 days &middot; ${dosToSubmit.length} claims measured</div>
        </div>
        <div class="sla-card">
          <div class="sla-card-label">Avg Days: Denial to Appeal</div>
          ${_slaStatus(avgDenialToAppeal, 5, 10, 'days')}
          <div class="sla-card-target">Target: &lt;5 days &middot; ${denialToAppeal.length} appeals measured</div>
        </div>
        <div class="sla-card">
          <div class="sla-card-label">Avg Days in A/R (DOS to Pay)</div>
          ${_slaStatus(avgDaysInAR, 35, 60, 'days')}
          <div class="sla-card-target">Target: &lt;35 days &middot; ${daysInAR.length} paid claims</div>
        </div>
        <div class="sla-card">
          <div class="sla-card-label">Avg Days: Submit to Payment</div>
          ${_slaStatus(avgClaimToPayment, 30, 45, 'days')}
          <div class="sla-card-target">Target: &lt;30 days &middot; ${claimToPayment.length} claims</div>
        </div>
        <div class="sla-card">
          <div class="sla-card-label">Open Tasks Overdue</div>
          <span style="font-size:24px;font-weight:800;color:${overdueCount > 0 ? (overduePct > 30 ? '#dc2626' : overduePct > 15 ? '#d97706' : '#16a34a') : '#16a34a'};">${overdueCount}</span>
          <span style="font-size:12px;color:var(--gray-500);margin-left:4px;">of ${openTasks.length}</span>
          <div style="margin-top:4px;">
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:${overduePct > 30 ? '#dc262620' : overduePct > 15 ? '#d9770620' : '#16a34a20'};color:${overduePct > 30 ? '#dc2626' : overduePct > 15 ? '#d97706' : '#16a34a'};">${overduePct.toFixed(0)}% overdue</span>
          </div>
          <div class="sla-card-target">Avg ${avgOverdueDays} days overdue</div>
        </div>
      </div>
    </div>

    <!-- Monthly SLA Trend -->
    <div class="cc-section">
      <div class="cc-section-title">Monthly SLA Trend</div>
      <div class="cc-card" style="padding:0;overflow-x:auto;">
        ${recentMonths.length === 0 ? '<div style="text-align:center;padding:48px;color:var(--gray-400);font-size:13px;">No monthly data available.</div>' : `
        <table class="cc-analytics-table">
          <thead><tr>
            <th>Month</th><th class="num">Claims Submitted</th><th class="num">Avg Days to Submit</th>
            <th class="num">Denials Worked</th><th class="num">Avg Days to Work</th>
            <th class="num">Tasks Completed</th><th class="num">Tasks Overdue</th>
          </tr></thead>
          <tbody>
            ${recentMonths.map(m => {
              const cd = monthlyData[m] || { claims: 0, submitDays: [] };
              const dd = monthlyDenials[m] || { total: 0, worked: 0, workDays: [] };
              const td = monthlyTasks[m] || { completed: 0, overdue: 0 };
              const avgSub = cd.submitDays.length > 0 ? (cd.submitDays.reduce((s, x) => s + x, 0) / cd.submitDays.length).toFixed(1) : '—';
              const avgWork = dd.workDays.length > 0 ? (dd.workDays.reduce((s, x) => s + x, 0) / dd.workDays.length).toFixed(1) : '—';
              const subColor = avgSub !== '—' ? (Number(avgSub) > 5 ? '#dc2626' : Number(avgSub) > 3 ? '#d97706' : '#16a34a') : 'var(--gray-400)';
              const workColor = avgWork !== '—' ? (Number(avgWork) > 10 ? '#dc2626' : Number(avgWork) > 5 ? '#d97706' : '#16a34a') : 'var(--gray-400)';
              return `<tr>
                <td style="font-weight:600;">${escHtml(m)}</td>
                <td class="num">${cd.claims}</td>
                <td class="num" style="color:${subColor};font-weight:700;">${avgSub}${avgSub !== '—' ? 'd' : ''}</td>
                <td class="num">${dd.worked} <span style="font-size:10px;color:var(--gray-400);">/ ${dd.total}</span></td>
                <td class="num" style="color:${workColor};font-weight:700;">${avgWork}${avgWork !== '—' ? 'd' : ''}</td>
                <td class="num">${td.completed}</td>
                <td class="num" style="color:${td.overdue > 0 ? '#dc2626' : 'var(--gray-400)'};">${td.overdue > 0 ? td.overdue : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        `}
      </div>
    </div>

    <!-- Task Performance by Category -->
    <div class="cc-section">
      <div class="cc-section-title">Task Performance by Category</div>
      <div class="cc-card" style="padding:0;overflow-x:auto;">
        ${Object.keys(taskByCat).length === 0 ? '<div style="text-align:center;padding:48px;color:var(--gray-400);font-size:13px;">No task data available.</div>' : `
        <table class="cc-analytics-table">
          <thead><tr>
            <th>Category</th><th class="num">Total</th><th class="num">Completed</th><th class="num">On Time</th>
            <th class="num">Overdue</th><th class="num">Avg Completion (days)</th>
          </tr></thead>
          <tbody>
            ${Object.keys(taskByCat).sort().map(cat => {
              const d = taskByCat[cat];
              const onTime = d.completed - d.overdue; // completed minus those currently overdue is approximate
              const avgComp = d.completionDays.length > 0 ? (d.completionDays.reduce((s, x) => s + x, 0) / d.completionDays.length).toFixed(1) : '—';
              return `<tr>
                <td style="font-weight:600;">${escHtml(catLabels[cat] || cat)}</td>
                <td class="num">${d.total}</td>
                <td class="num" style="color:#16a34a;">${d.completed}</td>
                <td class="num">${d.completed > 0 ? d.completed : '—'}</td>
                <td class="num" style="color:${d.overdue > 0 ? '#dc2626' : 'var(--gray-400)'};">${d.overdue > 0 ? d.overdue : '—'}</td>
                <td class="num">${avgComp}${avgComp !== '—' ? 'd' : ''}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        `}
      </div>
    </div>

    <!-- Per-Client SLA View -->
    <div class="cc-section">
      <div class="cc-section-title">Per-Client SLA Performance</div>
      <div class="sla-filter-bar">
        <label style="font-size:12px;font-weight:600;color:var(--gray-600);">Filter by Client:</label>
        <select id="sla-client-filter" onchange="window._slaFilterClient()">
          <option value="">All Clients (Agency Average)</option>
          ${bsClients.map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || c.name || 'Unknown')}</option>`).join('')}
        </select>
      </div>
      <div id="sla-client-detail"></div>
    </div>
  `;

  // Render default (all clients) view
  _renderClientSlaDetail('', clientMap);

  // Wire up filter
  window._slaFilterClient = function() {
    const sel = document.getElementById('sla-client-filter');
    if (sel) _renderClientSlaDetail(sel.value, clientMap);
  };

  function _renderClientSlaDetail(clientId, cMap) {
    const container = document.getElementById('sla-client-detail');
    if (!container) return;

    if (!clientId) {
      // Agency average
      container.innerHTML = `
        <div class="cc-card" style="padding:20px;">
          <div style="font-size:13px;font-weight:700;color:var(--gray-800);margin-bottom:16px;">Agency-Wide SLA Summary</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
            <div class="sla-compare-cell"><span class="sla-compare-label">DOS to Submit</span><span class="sla-compare-val" style="color:${avgDosToSubmit !== null ? (avgDosToSubmit > 3 ? '#d97706' : '#16a34a') : 'var(--gray-400)'};">${avgDosToSubmit !== null ? avgDosToSubmit.toFixed(1) + 'd' : 'N/A'}</span></div>
            <div class="sla-compare-cell"><span class="sla-compare-label">Denial to Appeal</span><span class="sla-compare-val" style="color:${avgDenialToAppeal !== null ? (avgDenialToAppeal > 5 ? '#d97706' : '#16a34a') : 'var(--gray-400)'};">${avgDenialToAppeal !== null ? avgDenialToAppeal.toFixed(1) + 'd' : 'N/A'}</span></div>
            <div class="sla-compare-cell"><span class="sla-compare-label">Days in A/R</span><span class="sla-compare-val" style="color:${avgDaysInAR !== null ? (avgDaysInAR > 35 ? '#d97706' : '#16a34a') : 'var(--gray-400)'};">${avgDaysInAR !== null ? avgDaysInAR.toFixed(1) + 'd' : 'N/A'}</span></div>
            <div class="sla-compare-cell"><span class="sla-compare-label">Submit to Payment</span><span class="sla-compare-val" style="color:${avgClaimToPayment !== null ? (avgClaimToPayment > 30 ? '#d97706' : '#16a34a') : 'var(--gray-400)'};">${avgClaimToPayment !== null ? avgClaimToPayment.toFixed(1) + 'd' : 'N/A'}</span></div>
            <div class="sla-compare-cell"><span class="sla-compare-label">Tasks Overdue</span><span class="sla-compare-val" style="color:${overdueCount > 0 ? '#dc2626' : '#16a34a'};">${overdueCount} (${overduePct.toFixed(0)}%)</span></div>
          </div>
        </div>
      `;
      return;
    }

    const clientName = cMap[clientId] || ('Client #' + clientId);
    const cs = _computeClientSLA(clientId);

    function _compareVal(clientVal, agencyVal, unit) {
      if (clientVal === null) return '<span style="color:var(--gray-400);">N/A</span>';
      const cv = clientVal.toFixed(1);
      let arrow = '', compColor = '#16a34a';
      if (agencyVal !== null) {
        if (clientVal > agencyVal * 1.1) { arrow = ' &#9650;'; compColor = '#dc2626'; }
        else if (clientVal < agencyVal * 0.9) { arrow = ' &#9660;'; compColor = '#16a34a'; }
        else { arrow = ' &#9644;'; compColor = '#d97706'; }
      }
      return '<span style="font-weight:800;color:' + compColor + ';">' + cv + unit + arrow + '</span>';
    }

    container.innerHTML = `
      <div class="cc-card" style="padding:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--gray-800);margin-bottom:4px;">${escHtml(clientName)}</div>
        <div style="font-size:11px;color:var(--gray-500);margin-bottom:16px;">${cs.claimCount} claims measured &middot; ${cs.denialCount} appeals measured &middot; ${cs.openTasks} open tasks</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--gray-200);border-radius:10px;overflow:hidden;">
          <div style="background:white;padding:14px;">
            <div style="font-size:11px;color:var(--gray-500);margin-bottom:6px;font-weight:600;">DOS to Submit</div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>${_compareVal(cs.avgDosToSubmit, avgDosToSubmit, 'd')}</div>
              <div style="font-size:10px;color:var(--gray-400);">Avg: ${avgDosToSubmit !== null ? avgDosToSubmit.toFixed(1) + 'd' : 'N/A'}</div>
            </div>
          </div>
          <div style="background:white;padding:14px;">
            <div style="font-size:11px;color:var(--gray-500);margin-bottom:6px;font-weight:600;">Denial to Appeal</div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>${_compareVal(cs.avgDenialToAppeal, avgDenialToAppeal, 'd')}</div>
              <div style="font-size:10px;color:var(--gray-400);">Avg: ${avgDenialToAppeal !== null ? avgDenialToAppeal.toFixed(1) + 'd' : 'N/A'}</div>
            </div>
          </div>
          <div style="background:white;padding:14px;">
            <div style="font-size:11px;color:var(--gray-500);margin-bottom:6px;font-weight:600;">Days in A/R</div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>${_compareVal(cs.avgDaysInAR, avgDaysInAR, 'd')}</div>
              <div style="font-size:10px;color:var(--gray-400);">Avg: ${avgDaysInAR !== null ? avgDaysInAR.toFixed(1) + 'd' : 'N/A'}</div>
            </div>
          </div>
          <div style="background:white;padding:14px;">
            <div style="font-size:11px;color:var(--gray-500);margin-bottom:6px;font-weight:600;">Submit to Payment</div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>${_compareVal(cs.avgClaimToPayment, avgClaimToPayment, 'd')}</div>
              <div style="font-size:10px;color:var(--gray-400);">Avg: ${avgClaimToPayment !== null ? avgClaimToPayment.toFixed(1) + 'd' : 'N/A'}</div>
            </div>
          </div>
          <div style="background:white;padding:14px;grid-column:span 2;">
            <div style="font-size:11px;color:var(--gray-500);margin-bottom:6px;font-weight:600;">Tasks Overdue</div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:800;color:${cs.overdueTasks > 0 ? '#dc2626' : '#16a34a'};">${cs.overdueTasks} of ${cs.openTasks} (${cs.overduePct.toFixed(0)}%)</span>
              <div style="font-size:10px;color:var(--gray-400);">Agency: ${overdueCount} of ${openTasks.length} (${overduePct.toFixed(0)}%)</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
