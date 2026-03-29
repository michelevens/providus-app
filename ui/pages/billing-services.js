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
  // Use the parent revenue-cycle renderer if available so the unified tab bar is preserved
  window._bsRefreshDashboard = () => {
    if (window.app?.rcSwitchTab) window.app.rcSwitchTab('dashboard');
    else renderBillingServicesPage();
  };
  // Fire all API calls in parallel for speed
  let allClaims = [];
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, rClaims] = await Promise.allSettled([
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
    store.getRcmClaims(),
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
  if (rClaims.status === 'fulfilled') allClaims = Array.isArray(rClaims.value) ? rClaims.value : [];

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

  // Compute monthly data for chart — aggregate from raw claims (most reliable)
  const monthlyData = {};
  for (let m = chartRange - 1; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthlyData[key] = { label, billed: 0, collected: 0, denied: 0, claims: 0 };
  }
  // Aggregate from raw claims by date_of_service (most accurate)
  if (allClaims.length > 0) {
    allClaims.forEach(c => {
      const dos = c.dateOfService || c.date_of_service || c.submittedDate || c.submitted_date || c.createdAt || c.created_at || '';
      const p = dos ? dos.slice(0, 7) : '';
      if (monthlyData[p]) {
        monthlyData[p].billed += Number(c.totalCharges || c.total_charges || c.chargedAmount || c.charged_amount || 0);
        monthlyData[p].collected += Number(c.totalPaid || c.total_paid || c.paidAmount || c.paid_amount || 0);
        const isDenied = c.status === 'denied' || c.status === 'partial_denial';
        if (isDenied) monthlyData[p].denied += Number(c.totalCharges || c.total_charges || c.chargedAmount || c.charged_amount || 0) - Number(c.totalPaid || c.total_paid || c.paidAmount || c.paid_amount || 0);
        monthlyData[p].claims++;
      }
    });
  } else {
    // Fall back to API claim stats or financials
    const claimMonthly = claimStats.monthly || [];
    if (claimMonthly.length > 0) {
      claimMonthly.forEach(m => {
        const p = m.period || '';
        if (monthlyData[p]) {
          monthlyData[p].billed = m.amountBilled || m.amount_billed || 0;
          monthlyData[p].collected = m.amountCollected || m.amount_collected || 0;
          monthlyData[p].denied = m.deniedAmount || m.denied_amount || 0;
          monthlyData[p].claims = m.claimsSubmitted || m.claims_submitted || 0;
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

  // Total revenue numbers — use API all-time totals for stat cards (not scoped to chart range)
  const totalBilled = claimStats.totalCharged || claimStats.total_charged || 0;
  const totalCollected = claimStats.totalPaid || claimStats.total_paid || 0;
  const totalDenied = claimStats.totalDeniedAmount || claimStats.total_denied_amount || 0;
  const collectionRate = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : '0.0';
  const denialRate = totalBilled > 0 ? ((totalDenied / totalBilled) * 100).toFixed(1) : '0.0';

  // ── Pre-compute analytics HTML for dashboard sections ──

  // Payer Performance Summary
  let _payerPerfHtml = '';
  if (allClaims.length > 0) {
    const payerMap = {};
    allClaims.forEach(c => {
      const payer = c.payer_name || c.payerName || 'Unknown';
      if (!payerMap[payer]) payerMap[payer] = { claims: 0, charged: 0, paid: 0, denied: 0, deniedAmt: 0, daysToPay: [], name: payer };
      const p = payerMap[payer];
      p.claims++;
      const charged = Number(c.totalCharges || c.total_charges || c.chargedAmount || c.charged_amount || 0);
      const paid = Number(c.totalPaid || c.total_paid || c.paidAmount || c.paid_amount || 0);
      p.charged += charged;
      p.paid += paid;
      const isDenied = c.status === 'denied' || c.status === 'partial_denial';
      if (isDenied) { p.denied++; p.deniedAmt += charged - paid; }
      const dos = c.dateOfService || c.date_of_service || c.submittedDate || c.submitted_date || '';
      const paidDate = c.paidDate || c.paid_date || c.paymentDate || c.payment_date || '';
      if (dos && paidDate && paid > 0) {
        const diff = Math.floor((new Date(paidDate) - new Date(dos)) / 86400000);
        if (diff > 0 && diff < 365) p.daysToPay.push(diff);
      }
    });
    const payers = Object.values(payerMap).sort((a, b) => b.charged - a.charged).slice(0, 10);
    const payerRows = payers.map(p => {
      const colRate = p.charged > 0 ? (p.paid / p.charged * 100) : 0;
      const denRate = p.claims > 0 ? (p.denied / p.claims * 100) : 0;
      const avgDays = p.daysToPay.length > 0 ? Math.round(p.daysToPay.reduce((s, v) => s + v, 0) / p.daysToPay.length) : null;
      const colColor = colRate >= 90 ? '#16a34a' : colRate >= 70 ? '#f59e0b' : '#ef4444';
      return '<tr>'
        + '<td style="font-weight:600;">' + escHtml(p.name) + '</td>'
        + '<td style="text-align:right;">' + p.claims + '</td>'
        + '<td style="text-align:right;">' + _fmtMoney(p.charged) + '</td>'
        + '<td style="text-align:right;">' + _fmtMoney(p.paid) + '</td>'
        + '<td style="text-align:right;font-weight:700;color:' + colColor + ';">' + colRate.toFixed(1) + '%</td>'
        + '<td style="text-align:right;' + (p.denied > 0 ? 'color:var(--red);font-weight:600;' : '') + '">' + p.denied + '</td>'
        + '<td style="text-align:right;">' + denRate.toFixed(1) + '%</td>'
        + '<td style="text-align:right;">' + (avgDays !== null ? avgDays + 'd' : '—') + '</td>'
        + '</tr>';
    }).join('');
    _payerPerfHtml = '<div class="card bs-card" style="margin-top:16px;">'
      + '<div class="card-header"><h3>Payer Performance Summary</h3><span style="font-size:11px;color:var(--gray-400);">' + payers.length + ' payer' + (payers.length !== 1 ? 's' : '') + ' from ' + allClaims.length + ' claims</span></div>'
      + '<div class="card-body" style="padding:0;overflow-x:auto;"><table style="font-size:13px;width:100%;">'
      + '<thead><tr><th>Payer</th><th style="text-align:right;">Claims</th><th style="text-align:right;">Charged</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Collection %</th><th style="text-align:right;">Denials</th><th style="text-align:right;">Denial %</th><th style="text-align:right;">Avg Days to Pay</th></tr></thead>'
      + '<tbody>' + payerRows + '</tbody>'
      + '</table></div></div>';
  }

  // Monthly Collection Detail
  const _monthDetailRows = months.map(m => {
    const colPct = m.billed > 0 ? (m.collected / m.billed * 100) : 0;
    const denPct = m.billed > 0 ? (m.denied / m.billed * 100) : 0;
    const colColor = colPct >= 90 ? '#16a34a' : colPct >= 70 ? '#f59e0b' : m.billed > 0 ? '#ef4444' : 'var(--gray-400)';
    return '<tr>'
      + '<td style="font-weight:600;">' + m.label + '</td>'
      + '<td style="text-align:right;">' + m.claims + '</td>'
      + '<td style="text-align:right;">' + _fmtMoney(m.billed) + '</td>'
      + '<td style="text-align:right;">' + _fmtMoney(m.collected) + '</td>'
      + '<td style="text-align:right;font-weight:700;color:' + colColor + ';">' + colPct.toFixed(1) + '%</td>'
      + '<td style="text-align:right;' + (m.denied > 0 ? 'color:var(--red);font-weight:600;' : '') + '">' + _fmtMoney(m.denied) + '</td>'
      + '<td style="text-align:right;">' + denPct.toFixed(1) + '%</td>'
      + '</tr>';
  }).join('');

  // Top Denial Reasons
  let _denialReasonsHtml = '';
  if (allClaims.length > 0) {
    const reasonMap = {};
    allClaims.forEach(c => {
      const isDenied = c.status === 'denied' || c.status === 'partial_denial';
      if (!isDenied) return;
      const reason = c.denial_reason || c.denialReason || c.denial_codes || c.denialCodes || 'Unspecified';
      const reasons = typeof reason === 'string' ? reason.split(/[,;|]/).map(r => r.trim()).filter(Boolean) : [String(reason)];
      const amt = Number(c.totalCharges || c.total_charges || c.chargedAmount || c.charged_amount || 0) - Number(c.totalPaid || c.total_paid || c.paidAmount || c.paid_amount || 0);
      reasons.forEach(r => {
        const key = r || 'Unspecified';
        if (!reasonMap[key]) reasonMap[key] = { reason: key, count: 0, amount: 0 };
        reasonMap[key].count++;
        reasonMap[key].amount += amt;
      });
    });
    const topReasons = Object.values(reasonMap).sort((a, b) => b.count - a.count).slice(0, 5);
    if (topReasons.length > 0) {
      const reasonRows = topReasons.map((r, i) => {
        return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;' + (i < topReasons.length - 1 ? 'border-bottom:1px solid var(--gray-100);' : '') + '">'
          + '<span style="width:22px;height:22px;border-radius:50%;background:#fef2f2;color:var(--red);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;">' + (i + 1) + '</span>'
          + '<span style="flex:1;font-size:13px;font-weight:500;">' + escHtml(r.reason) + '</span>'
          + '<span style="font-size:12px;color:var(--gray-500);">' + r.count + ' claim' + (r.count !== 1 ? 's' : '') + '</span>'
          + '<span style="font-size:13px;font-weight:700;color:var(--red);">' + _fmtMoney(r.amount) + '</span>'
          + '</div>';
      }).join('');
      _denialReasonsHtml = '<div class="card bs-card" style="margin-top:16px;">'
        + '<div class="card-header"><h3 style="color:#ef4444;">Top Denial Reasons</h3></div>'
        + '<div class="card-body" style="padding:12px;">' + reasonRows + '</div></div>';
    }
  }

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
              ${[3,6,12,24].map(n => `<button class="btn btn-sm${chartRange === n ? ' btn-primary' : ''}" style="font-size:11px;padding:3px 10px;min-width:0;" onclick="window._bsChartRange=${n};window._bsRefreshDashboard();">${n}mo</button>`).join('')}
            </div>
          </div>
          <div class="card-body" style="padding:16px;">
            <div style="display:flex;align-items:flex-end;gap:${chartRange > 12 ? 3 : 6}px;height:${chartRange > 12 ? 200 : 160}px;">
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

      <!-- Payer Performance Summary -->
      ${_payerPerfHtml}

      <!-- Monthly Collection Detail -->
      <div class="card bs-card" style="margin-top:16px;">
        <div class="card-header"><h3>Monthly Collection Detail</h3></div>
        <div class="card-body" style="padding:0;overflow-x:auto;">
          ${months.length > 0 ? '<table style="font-size:13px;width:100%;"><thead><tr><th>Month</th><th style="text-align:right;">Claims</th><th style="text-align:right;">Billed</th><th style="text-align:right;">Collected</th><th style="text-align:right;">Collection %</th><th style="text-align:right;">Denied</th><th style="text-align:right;">Denial %</th></tr></thead><tbody>' + _monthDetailRows + '</tbody></table>' : '<div style="padding:2rem;text-align:center;color:var(--gray-400);">No monthly data available</div>'}
        </div>
      </div>

      <!-- Top Denial Reasons -->
      ${_denialReasonsHtml}
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
                  <td onclick="event.stopPropagation();"><button class="btn btn-sm" style="color:var(--brand-600);" onclick="window.app.viewClientLedger(${c.id})">Ledger</button> <button class="btn btn-sm" onclick="window.app.editBillingClient(${c.id})">Edit</button> <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteBillingClient(${c.id})">Del</button></td>
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
        <div class="card-header" style="flex-wrap:wrap;gap:8px;">
          <h3>Billing Tasks</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-sm btn-primary" onclick="window.app.autoGenerateTasks()" style="font-size:12px;" title="Scan claims data and generate follow-up, denial, and collection tasks">Generate Tasks</button>
            <select id="bs-task-source-filter" class="form-control" style="width:110px;height:34px;font-size:12px;" onchange="window.app.filterBsTasks()">
              <option value="">All Sources</option><option value="manual">Manual</option><option value="system">System</option>
            </select>
            <select id="bs-task-client-filter" class="form-control" style="width:160px;height:34px;font-size:12px;" onchange="window.app.filterBsTasks()">
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
                const isSystem = (t.source || '') === 'system';
                return `<tr class="bs-task-row" data-client="${t.billingClientId || t.billing_client_id || ''}" data-status="${t.status || 'pending'}" data-category="${t.category || t.taskCategory || t.task_category || ''}" data-source="${t.source || 'manual'}" style="${isOverdue ? 'background:#fef2f2;' : ''}">
                  <td><strong>${escHtml(t.title || '—')}</strong>${isSystem ? ' <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#dbeafe;color:#1e40af;font-weight:600;vertical-align:middle;">AUTO</span>' : ''}</td>
                  <td class="text-sm">${escHtml(client ? _clientName(client) : '—')}</td>
                  <td class="text-sm">${escHtml(t.providerName || t.provider_name || '—')}</td>
                  <td><span style="font-size:12px;padding:2px 8px;background:var(--gray-100);border-radius:4px;">${escHtml(cat ? cat.label : '')}</span></td>
                  <td>${_taskPriorityBadge(t.priority)}</td>
                  <td style="${isOverdue ? 'color:var(--red);font-weight:600;' : ''}">${dueDate ? formatDateDisplay(dueDate) : '—'}${isOverdue ? ' <span style="font-size:10px;">OVERDUE</span>' : ''}</td>
                  <td>${_taskStatusBadge(t.status)}</td>
                  <td style="white-space:nowrap;">${t.status !== 'completed' ? `<button class="btn btn-sm btn-primary" onclick="window.app.completeBsTask(${t.id})" title="Complete">&#10003;</button>` : ''} <button class="btn btn-sm" onclick="window.app.editBsTask(${t.id})">Edit</button>${isSystem ? ` <button class="btn btn-sm" style="color:var(--gray-400);font-size:10px;" onclick="window.app.dismissBsTask(${t.id})" title="Dismiss — won't be regenerated">Dismiss</button>` : ` <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteBsTask(${t.id})">Del</button>`}</td>
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
            <div class="auth-field" style="margin:0;"><label>Payment Mode</label>
              <select id="bs-client-payment-mode" class="form-control" title="Agency Managed: agency receives payments, takes fee, remits to org. Self Managed: org handles own payments."><option value="self_managed">Self Managed</option><option value="agency_managed">Agency Managed</option></select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Agency Fee %</label><input type="number" id="bs-client-agency-fee" class="form-control" step="0.5" min="0" max="100" placeholder="e.g. 7" title="Percentage of collections the agency keeps as fee"></div>
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
                // Use claims data if client has linked claims, otherwise fall back to financials
                const clientClaims = (window._rcmClaims || []).filter(cl => (cl.billingClientId || cl.billing_client_id) == c.id);
                const cf = financials.filter(f => (f.billingClientId || f.billing_client_id) == c.id);
                const claims = clientClaims.length || cf.reduce((s, f) => s + Number(f.claimsSubmitted || f.claims_submitted || 0), 0);
                const billed = clientClaims.length ? clientClaims.reduce((s, cl) => s + Number(cl.totalCharges || cl.total_charges || 0), 0) : cf.reduce((s, f) => s + Number(f.amountBilled || f.amount_billed || 0), 0);
                const collected = clientClaims.length ? clientClaims.reduce((s, cl) => s + Number(cl.totalPaid || cl.total_paid || 0), 0) : cf.reduce((s, f) => s + Number(f.amountCollected || f.amount_collected || 0), 0);
                const denied = clientClaims.length ? clientClaims.filter(cl => cl.status === 'denied').reduce((s, cl) => s + Number(cl.totalCharges || cl.total_charges || 0), 0) : cf.reduce((s, f) => s + Number(f.deniedAmount || f.denied_amount || 0), 0);
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

  let client = {}, tasks = [], activities = [], financials = [], claims = [], denials = [];
  const [rc, rt, ra, rf, rcl, rd] = await Promise.allSettled([
    store.getBillingClient(clientId),
    store.getBillingTasks({ billing_client_id: clientId }),
    store.getBillingActivities({ billing_client_id: clientId, limit: 50 }),
    store.getBillingFinancials({ billing_client_id: clientId }),
    store.getRcmClaims({ billing_client_id: clientId }),
    store.getRcmDenials({ billing_client_id: clientId }),
  ]);
  if (rc.status === 'fulfilled') client = rc.value;
  if (rt.status === 'fulfilled') tasks = rt.value;
  if (ra.status === 'fulfilled') activities = ra.value;
  if (rf.status === 'fulfilled') financials = rf.value;
  if (rcl.status === 'fulfilled') claims = rcl.value;
  if (rd.status === 'fulfilled') denials = rd.value;
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(activities)) activities = [];
  if (!Array.isArray(financials)) financials = [];
  if (!Array.isArray(claims)) claims = [];
  if (!Array.isArray(denials)) denials = [];
  if (!client || !client.id) { body.innerHTML = '<div class="empty-state"><h3>Billing client not found</h3></div>'; return; }

  const orgName = _clientName(client);
  const platform = _getField(client, 'billingPlatform', 'billing_platform') || '—';
  const fee = _getField(client, 'monthlyFee', 'monthly_fee') || 0;
  const feeStruct = _getField(client, 'feeStructure', 'fee_structure') || 'flat';
  const feeLabels = { flat: 'Flat Monthly', per_provider: 'Per Provider/Mo', percentage: '% of Collections', per_claim: 'Per Claim' };
  const paymentMode = _getField(client, 'paymentMode', 'payment_mode') || 'self_managed';
  const agencyFee = _getField(client, 'agencyFeePercent', 'agency_fee_percent') || 0;
  const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  // Compute totals from actual claims data (preferred) or financials (fallback)
  const totals = { claims: 0, billed: 0, collected: 0, denied: 0, ptResp: 0, balance: 0 };
  if (claims.length > 0) {
    totals.claims = claims.length;
    claims.forEach(c => {
      totals.billed += Number(c.totalCharges || c.total_charges || 0);
      totals.collected += Number(c.totalPaid || c.total_paid || 0);
      totals.balance += Number(c.balance || 0);
      totals.ptResp += Number(c.patientResponsibility || c.patient_responsibility || 0);
      if (c.status === 'denied') totals.denied += Number(c.totalCharges || c.total_charges || 0);
    });
  } else {
    financials.forEach(f => {
      totals.claims += Number(f.claimsSubmitted || f.claims_submitted || 0);
      totals.billed += Number(f.amountBilled || f.amount_billed || 0);
      totals.collected += Number(f.amountCollected || f.amount_collected || 0);
      totals.denied += Number(f.deniedAmount || f.denied_amount || 0);
    });
  }
  const collectionRate = totals.billed > 0 ? ((totals.collected / totals.billed) * 100).toFixed(1) : '0.0';
  const denialRate = totals.billed > 0 ? ((totals.denied / totals.billed) * 100).toFixed(1) : '0.0';

  // Claims by status
  const claimsByStatus = {};
  claims.forEach(c => { claimsByStatus[c.status] = (claimsByStatus[c.status] || 0) + 1; });

  // Monthly trend from claims
  const monthlyTrend = {};
  claims.forEach(c => {
    const m = (c.dateOfService || c.date_of_service || '').toString().slice(0, 7);
    if (!m) return;
    if (!monthlyTrend[m]) monthlyTrend[m] = { billed: 0, collected: 0, denied: 0 };
    monthlyTrend[m].billed += Number(c.totalCharges || c.total_charges || 0);
    monthlyTrend[m].collected += Number(c.totalPaid || c.total_paid || 0);
    if (c.status === 'denied') monthlyTrend[m].denied += Number(c.totalCharges || c.total_charges || 0);
  });

  // Tab state
  const cdTab = window._cdTab || 'overview';

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
    <style>
      .bsd-stat{background:var(--surface-card,#fff);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s;}.bsd-stat:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.1);}.bsd-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}.bsd-stat .value{font-size:24px;font-weight:800;line-height:1.1;}.bsd-stat .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:3px;}
      .cd-tab{padding:8px 14px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .cd-tab:hover{color:var(--brand-600);background:var(--gray-50);}.cd-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>

    <!-- Header -->
    <div class="card" style="border-top:3px solid var(--brand-600);margin-bottom:16px;border-radius:16px;">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--gray-900);">${escHtml(orgName)}</div>
            <div style="font-size:13px;color:var(--gray-600);margin-top:4px;">
              Platform: <strong>${escHtml(platform)}</strong> | Fee: <strong>${_fmtMoney(fee)}</strong> <span style="font-size:11px;color:var(--gray-400);">(${feeLabels[feeStruct] || feeStruct})</span>
              | Mode: <strong>${paymentMode === 'agency_managed' ? 'Agency Managed' : 'Self Managed'}</strong>${agencyFee > 0 ? ` (${agencyFee}% fee)` : ''}
            </div>
            ${_getField(client, 'contactName', 'contact_name') ? `<div style="font-size:12px;color:var(--gray-500);margin-top:2px;">Contact: ${escHtml(_getField(client, 'contactName', 'contact_name'))}${_getField(client, 'contactEmail', 'contact_email') ? ' — ' + escHtml(_getField(client, 'contactEmail', 'contact_email')) : ''}${_getField(client, 'contactPhone', 'contact_phone') ? ' — ' + escHtml(_getField(client, 'contactPhone', 'contact_phone')) : ''}</div>` : ''}
          </div>
          <div>${_bsStatusBadge(client.status)}</div>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px;">
      <div class="bsd-stat"><div class="label">Claims</div><div class="value" style="color:var(--brand-600);">${totals.claims}</div></div>
      <div class="bsd-stat"><div class="label">Billed</div><div class="value" style="color:#7c3aed;">${_fmtK(totals.billed)}</div></div>
      <div class="bsd-stat"><div class="label">Collected</div><div class="value" style="color:#16a34a;">${_fmtK(totals.collected)}</div><div style="font-size:10px;color:var(--gray-400);">${collectionRate}% rate</div></div>
      <div class="bsd-stat"><div class="label">Denied</div><div class="value" style="color:#ef4444;">${_fmtK(totals.denied)}</div><div style="font-size:10px;color:var(--gray-400);">${denialRate}%</div></div>
      <div class="bsd-stat"><div class="label">Balance</div><div class="value" style="color:#ea580c;">${_fmtK(totals.balance)}</div></div>
      <div class="bsd-stat"><div class="label">Open Tasks</div><div class="value" style="color:#d97706;">${openTasks.length}</div></div>
      <div class="bsd-stat"><div class="label">Denials</div><div class="value" style="color:#dc2626;">${denials.length}</div></div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;">
      ${['overview','billing','financial','tasks','denials','activity'].map(t => `<button class="cd-tab ${cdTab === t ? 'active' : ''}" onclick="window._cdTab='${t}';window.app.viewBillingClient(${client.id})">${t === 'overview' ? 'Overview' : t === 'billing' ? 'Claims & Charges' : t === 'financial' ? 'Financial' : t === 'tasks' ? 'Tasks (' + openTasks.length + ')' : t === 'denials' ? 'Denials (' + denials.length + ')' : 'Activity'}</button>`).join('')}
    </div>

    <!-- TAB: Overview -->
    ${cdTab === 'overview' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <!-- Monthly Trend -->
      <div class="card" style="border-radius:14px;">
        <div class="card-header"><h3>Monthly Collections</h3></div>
        <div class="card-body" style="padding:12px;">
          ${Object.keys(monthlyTrend).length > 0 ? `<table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead><tr style="background:var(--gray-50);"><th style="padding:6px 8px;">Month</th><th style="text-align:right;">Billed</th><th style="text-align:right;">Collected</th><th style="text-align:right;">Denied</th><th style="text-align:right;">Rate</th></tr></thead>
            <tbody>${Object.entries(monthlyTrend).sort((a,b) => b[0].localeCompare(a[0])).map(([m, d]) => {
              const r = d.billed > 0 ? ((d.collected / d.billed) * 100).toFixed(0) : '—';
              return `<tr style="border-bottom:1px solid var(--gray-100);"><td style="padding:4px 8px;font-weight:600;">${m}</td><td style="text-align:right;">${_fmtMoney(d.billed)}</td><td style="text-align:right;color:#16a34a;font-weight:600;">${_fmtMoney(d.collected)}</td><td style="text-align:right;color:#ef4444;">${_fmtMoney(d.denied)}</td><td style="text-align:right;font-weight:600;">${r}%</td></tr>`;
            }).join('')}</tbody>
          </table>` : '<div style="color:var(--gray-400);text-align:center;padding:1rem;">No claims data</div>'}
        </div>
      </div>
      <!-- Claims by Status -->
      <div class="card" style="border-radius:14px;">
        <div class="card-header"><h3>Claims by Status</h3></div>
        <div class="card-body" style="padding:14px;">
          ${Object.keys(claimsByStatus).length > 0 ? Object.entries(claimsByStatus).sort((a,b) => b[1] - a[1]).map(([s, cnt]) => {
            const pct = totals.claims > 0 ? (cnt / totals.claims * 100) : 0;
            const colors = { paid: '#16a34a', partial_paid: '#0891b2', denied: '#ef4444', submitted: '#8b5cf6', pending: '#f59e0b' };
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <div style="flex:1;font-size:12px;font-weight:600;color:${colors[s] || '#666'};">${s.replace('_',' ').toUpperCase()}</div>
              <div style="width:100px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${colors[s] || '#999'};width:${pct}%;border-radius:3px;"></div></div>
              <div style="font-size:12px;font-weight:700;min-width:30px;text-align:right;">${cnt}</div>
            </div>`;
          }).join('') : '<div style="color:var(--gray-400);text-align:center;padding:1rem;">No claims</div>'}
        </div>
      </div>
    </div>
    <!-- Recent Activity -->
    <div class="card" style="border-radius:14px;margin-top:16px;">
      <div class="card-header"><h3>Recent Activity</h3><button class="btn btn-sm btn-gold" onclick="window.app.openBsActivityModal(${client.id})">+ Log</button></div>
      <div class="card-body" style="padding:12px 16px;">
        ${activities.length > 0 ? activities.slice(0, 10).map(a => {
          const type = a.activityType || a.activity_type || a.type || 'note';
          const typeLabel = ACTIVITY_TYPES.find(t => t.value === type);
          const amount = a.amount || 0;
          return `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:12px;">
            <div style="flex-shrink:0;margin-top:2px;">${_activityTypeIcon(type)}</div>
            <div style="flex:1;min-width:0;"><strong>${escHtml(typeLabel ? typeLabel.label : type)}</strong>${amount ? ` — <span style="color:var(--green);font-weight:600;">${_fmtMoney(amount)}</span>` : ''}<div style="font-size:11px;color:var(--gray-600);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(a.notes || a.description || '')}</div></div>
            <div style="font-size:10px;color:var(--gray-400);white-space:nowrap;">${formatDateDisplay(a.activityDate || a.activity_date || a.createdAt || a.created_at)}</div>
          </div>`;
        }).join('') : '<div style="text-align:center;padding:1rem;color:var(--gray-500);">No activity logged</div>'}
      </div>
    </div>
    ` : ''}

    <!-- TAB: Claims & Charges -->
    ${cdTab === 'billing' ? `
    <div class="card" style="border-radius:14px;">
      <div class="card-header"><h3>Claims (${claims.length})</h3></div>
      <div class="card-body" style="padding:0;"><div class="table-wrap" style="max-height:500px;overflow-y:auto;"><table style="font-size:12px;">
        <thead><tr><th>Claim #</th><th>Patient</th><th>Payer</th><th>DOS</th><th style="text-align:right;">Charges</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th><th>Check #</th><th>Status</th></tr></thead>
        <tbody>
          ${claims.map(c => `<tr style="cursor:pointer;" onclick="window.app.viewClaimDetail(${c.id})">
            <td style="font-family:monospace;color:var(--brand-600);">${escHtml(c.claimNumber || c.claim_number || '')}</td>
            <td>${escHtml(c.patientName || c.patient_name || '')}</td>
            <td>${escHtml(c.payerName || c.payer_name || '')}</td>
            <td>${formatDateDisplay(c.dateOfService || c.date_of_service)}</td>
            <td style="text-align:right;">${_fmtMoney(c.totalCharges || c.total_charges)}</td>
            <td style="text-align:right;color:#16a34a;font-weight:600;">${_fmtMoney(c.totalPaid || c.total_paid)}</td>
            <td style="text-align:right;${Number(c.balance || 0) > 0 ? 'color:#ef4444;font-weight:600;' : ''}">${_fmtMoney(c.balance)}</td>
            <td style="font-family:monospace;font-size:11px;">${escHtml(c.checkNumber || c.check_number || '—')}</td>
            <td>${_bsStatusBadge(c.status)}</td>
          </tr>`).join('')}
          ${claims.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No claims for this client</td></tr>' : ''}
        </tbody>
      </table></div></div>
    </div>
    ` : ''}

    <!-- TAB: Financial -->
    ${cdTab === 'financial' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="card" style="border-radius:14px;">
        <div class="card-header"><h3>Payment Ledger</h3><button class="btn btn-sm" onclick="window.app.viewClientLedger(${client.id})" style="font-size:11px;">Full Ledger</button></div>
        <div class="card-body" style="padding:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <div style="background:#dcfce7;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;font-weight:700;color:#166534;">COLLECTED</div><div style="font-size:20px;font-weight:800;color:#16a34a;">${_fmtK(totals.collected)}</div></div>
            <div style="background:#fff7ed;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;font-weight:700;color:#9a3412;">OUTSTANDING</div><div style="font-size:20px;font-weight:800;color:#ea580c;">${_fmtK(totals.balance)}</div></div>
          </div>
          ${paymentMode === 'agency_managed' && agencyFee > 0 ? `<div style="background:#ede9fe;border-radius:8px;padding:10px;text-align:center;margin-bottom:8px;"><div style="font-size:10px;font-weight:700;color:#5b21b6;">AGENCY FEE (${agencyFee}%)</div><div style="font-size:18px;font-weight:800;color:#7c3aed;">${_fmtMoney(totals.collected * agencyFee / 100)}</div></div>` : ''}
        </div>
      </div>
      <div class="card" style="border-radius:14px;">
        <div class="card-header"><h3>Monthly Trend</h3></div>
        <div class="card-body" style="padding:0;max-height:300px;overflow-y:auto;"><table style="font-size:12px;">
          <thead><tr style="background:var(--gray-50);"><th style="padding:6px 8px;">Month</th><th style="text-align:right;">Billed</th><th style="text-align:right;">Collected</th><th style="text-align:right;">Rate</th></tr></thead>
          <tbody>${Object.entries(monthlyTrend).sort((a,b) => b[0].localeCompare(a[0])).map(([m, d]) => {
            const r = d.billed > 0 ? ((d.collected / d.billed) * 100).toFixed(0) : '—';
            return `<tr style="border-bottom:1px solid var(--gray-100);"><td style="padding:4px 8px;font-weight:600;">${m}</td><td style="text-align:right;">${_fmtMoney(d.billed)}</td><td style="text-align:right;color:#16a34a;">${_fmtMoney(d.collected)}</td><td style="text-align:right;font-weight:600;">${r}%</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
    </div>
    ` : ''}

    <!-- TAB: Tasks -->
    ${cdTab === 'tasks' ? `
    <div class="card" style="border-radius:14px;">
      <div class="card-header"><h3>Tasks (${openTasks.length} open)</h3>
        <div style="display:flex;gap:6px;"><button class="btn btn-sm btn-primary" onclick="window.app.openBsTaskModal(${client.id})" style="font-size:11px;">+ New Task</button><button class="btn btn-sm" onclick="window.app.autoGenerateTasks()" style="font-size:11px;">Generate</button></div>
      </div>
      <div class="card-body" style="padding:0;max-height:500px;overflow-y:auto;"><table style="font-size:12px;">
        <thead><tr><th>Task</th><th>Category</th><th>Priority</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${tasks.map(t => {
            const cat = TASK_CATEGORIES.find(c => c.value === (t.category || t.taskCategory || t.task_category));
            const dueDate = t.dueDate || t.due_date || '';
            const isOverdue = dueDate && new Date(dueDate) < new Date() && t.status !== 'completed' && t.status !== 'cancelled';
            const isSystem = (t.source || '') === 'system';
            return `<tr style="${isOverdue ? 'background:#fef2f2;' : t.status === 'completed' ? 'opacity:0.5;' : ''}">
              <td><strong>${escHtml(t.title || '—')}</strong>${isSystem ? ' <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#dbeafe;color:#1e40af;font-weight:600;">AUTO</span>' : ''}${t.description ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(t.description)}</div>` : ''}</td>
              <td style="font-size:11px;">${escHtml(cat ? cat.label : '')}</td>
              <td>${_taskPriorityBadge(t.priority)}</td>
              <td style="${isOverdue ? 'color:var(--red);font-weight:600;' : ''}font-size:11px;">${dueDate ? formatDateDisplay(dueDate) : '—'}${isOverdue ? ' !' : ''}</td>
              <td>${_taskStatusBadge(t.status)}</td>
              <td style="white-space:nowrap;">${t.status !== 'completed' ? `<button class="btn btn-sm btn-primary" onclick="window.app.completeBsTask(${t.id})" style="font-size:10px;padding:2px 6px;">Done</button>` : ''} <button class="btn btn-sm" onclick="window.app.editBsTask(${t.id})" style="font-size:10px;">Edit</button></td>
            </tr>`;
          }).join('')}
          ${tasks.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-500);">No tasks</td></tr>' : ''}
        </tbody>
      </table></div>
    </div>
    ` : ''}

    <!-- TAB: Denials -->
    ${cdTab === 'denials' ? `
    <div class="card" style="border-radius:14px;">
      <div class="card-header"><h3>Denials (${denials.length})</h3></div>
      <div class="card-body" style="padding:0;max-height:500px;overflow-y:auto;"><table style="font-size:12px;">
        <thead><tr><th>Claim</th><th>Patient</th><th>Payer</th><th>Code</th><th>Reason</th><th style="text-align:right;">Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${denials.map(d => {
            const claim = d.claim || {};
            return `<tr>
              <td style="font-family:monospace;color:var(--brand-600);">${escHtml(claim.claimNumber || claim.claim_number || '')}</td>
              <td>${escHtml(claim.patientName || claim.patient_name || '')}</td>
              <td style="font-size:11px;">${escHtml(claim.payerName || claim.payer_name || '')}</td>
              <td style="font-family:monospace;font-size:11px;color:#7c3aed;">${escHtml(d.denialCode || d.denial_code || '—')}</td>
              <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(d.denialReason || d.denial_reason || '')}">${escHtml(d.denialReason || d.denial_reason || '—')}</td>
              <td style="text-align:right;color:#ef4444;font-weight:600;">${_fmtMoney(d.deniedAmount || d.denied_amount)}</td>
              <td>${_bsStatusBadge(d.status)}</td>
              <td><button class="btn btn-sm" onclick="window.app.editRcmDenial(${d.id})" style="font-size:10px;">Edit</button></td>
            </tr>`;
          }).join('')}
          ${denials.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No denials for this client</td></tr>' : ''}
        </tbody>
      </table></div>
    </div>
    ` : ''}

    <!-- TAB: Activity -->
    ${cdTab === 'activity' ? `
    <div class="card" style="border-radius:14px;">
      <div class="card-header"><h3>Activity Log</h3><button class="btn btn-sm btn-gold" onclick="window.app.openBsActivityModal(${client.id})">+ Log Activity</button></div>
      <div class="card-body" style="padding:12px 16px;max-height:500px;overflow-y:auto;">
        ${activities.length > 0 ? activities.map(a => {
          const type = a.activityType || a.activity_type || a.type || 'note';
          const typeLabel = ACTIVITY_TYPES.find(t => t.value === type);
          const amount = a.amount || 0;
          return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:12px;">
            <div style="flex-shrink:0;margin-top:2px;">${_activityTypeIcon(type)}</div>
            <div style="flex:1;"><strong>${escHtml(typeLabel ? typeLabel.label : type)}</strong>${amount ? ` — <span style="color:var(--green);font-weight:600;">${_fmtMoney(amount)}</span>` : ''}<div style="font-size:11px;color:var(--gray-600);">${escHtml(a.notes || a.description || '')}</div></div>
            <div style="font-size:10px;color:var(--gray-400);white-space:nowrap;">${formatDateDisplay(a.activityDate || a.activity_date || a.createdAt || a.created_at)}</div>
          </div>`;
        }).join('') : '<div style="text-align:center;padding:2rem;color:var(--gray-500);">No activity logged</div>'}
      </div>
    </div>
    ` : ''}

    ${client.notes ? `<div class="card" style="border-radius:14px;margin-top:16px;"><div class="card-header"><h3>Notes</h3></div><div class="card-body"><p style="white-space:pre-wrap;font-size:13px;color:var(--gray-600);margin:0;">${escHtml(client.notes)}</p></div></div>` : ''}
  `;
}

export {
  renderBillingServicesPage,
  renderBillingClientDetail,
  ACTIVITY_TYPES,
  TASK_CATEGORIES,
  _fmtMoney as fmtMoney,
};
