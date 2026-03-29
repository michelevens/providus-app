// ui/pages/command-center.js — Agency Command Center
// Bird's-eye view across all modules: credentialing, RCM, compliance, workspace

const { store, escHtml, formatDateDisplay, showToast } = window._credentik;

if (typeof window._ccTab === 'undefined') window._ccTab = 'overview';

const CC_TABS = [
  { key: 'overview',  label: 'Overview' },
  { key: 'activity',  label: 'Activity Feed' },
  { key: 'reports',   label: 'Reports' },
  { key: 'audit',     label: 'Audit Trail' },
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
  }

  _injectTabBar(body, tab);
}

function _injectTabBar(body, tab) {
  const existingContent = body.innerHTML;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = existingContent;
  const subTabs = tempDiv.querySelector('.tabs');
  if (subTabs) subTabs.remove();

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
  body.innerHTML = tabBar + tempDiv.innerHTML;
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
      </div>
    </div>
  `;
}
