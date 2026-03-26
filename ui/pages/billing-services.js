// ui/pages/billing-services.js — Billing Services Management
// Agency manages medical billing tasks for client orgs/providers

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, navigateTo, appConfirm, appPrompt,
        editButton, deleteButton, helpTip, sortArrow } = window._credentik;

// Module state
if (typeof window._bsTab === 'undefined') window._bsTab = 'clients';
if (typeof window._bsClients === 'undefined') window._bsClients = [];
if (typeof window._bsTasks === 'undefined') window._bsTasks = [];
if (typeof window._bsActivities === 'undefined') window._bsActivities = [];

function _fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${colors[priority] || colors.normal};">
    <span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>${escHtml(priority || 'normal')}
  </span>`;
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

// ─── Main Page ───

async function renderBillingServicesPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let clients = [];
  let tasks = [];
  let activities = [];
  let stats = { total_clients: 0, active_clients: 0, total_tasks: 0, pending_tasks: 0, completed_tasks: 0, total_claims: 0, total_collected: 0, total_denied: 0 };
  let orgs = [];

  try { stats = await store.getBillingClientStats(); } catch (e) { console.error('Billing client stats error:', e); }
  try { clients = await store.getBillingClients(); } catch (e) { console.error('Billing clients error:', e); }
  try { tasks = await store.getBillingTasks(); } catch (e) { console.error('Billing tasks error:', e); }
  try { activities = await store.getBillingActivities({ limit: 50 }); } catch (e) { console.error('Billing activities error:', e); }
  try { orgs = await store.getOrganizations(); } catch (e) {}

  if (!Array.isArray(clients)) clients = [];
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(activities)) activities = [];
  if (!Array.isArray(orgs)) orgs = [];
  window._bsClients = clients;
  window._bsTasks = tasks;
  window._bsActivities = activities;
  window._bsOrgs = orgs;

  const activeClients = clients.filter(c => c.status === 'active').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayActivities = activities.filter(a => (a.activityDate || a.activity_date || a.createdAt || a.created_at || '').startsWith(todayStr)).length;

  body.innerHTML = `
    <style>
      .bs-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .bs-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .bs-stat .bs-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .bs-stat .bs-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .bs-stat .bs-val{font-size:28px;font-weight:800;line-height:1.1;}
      .bs-card{border-radius:16px;overflow:hidden;}
      .bs-table table tr:hover{background:var(--gray-50);}
    </style>

    <!-- Stats Row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:20px;">
      <div class="bs-stat">
        <div class="bs-accent" style="background:linear-gradient(90deg,var(--brand-500),var(--brand-700));"></div>
        <div class="bs-label">Billing Clients</div>
        <div class="bs-val" style="color:var(--brand-600);">${stats.total_clients || clients.length}</div>
        <div style="font-size:11px;color:var(--gray-500);margin-top:4px;">${stats.active_clients || activeClients} active</div>
      </div>
      <div class="bs-stat">
        <div class="bs-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
        <div class="bs-label">Pending Tasks</div>
        <div class="bs-val" style="color:#d97706;">${stats.pending_tasks || pendingTasks}</div>
        <div style="font-size:11px;color:var(--gray-500);margin-top:4px;">${stats.completed_tasks || completedTasks} completed</div>
      </div>
      <div class="bs-stat">
        <div class="bs-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="bs-label">Total Collected</div>
        <div class="bs-val" style="color:#16a34a;">${_fmtMoney(stats.total_collected)}</div>
      </div>
      <div class="bs-stat">
        <div class="bs-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="bs-label">Claims Submitted</div>
        <div class="bs-val" style="color:#2563eb;">${stats.total_claims || 0}</div>
      </div>
      <div class="bs-stat">
        <div class="bs-accent" style="background:linear-gradient(90deg,#ef4444,#f87171);"></div>
        <div class="bs-label">Denials</div>
        <div class="bs-val" style="color:#dc2626;">${stats.total_denied || 0}</div>
      </div>
      <div class="bs-stat">
        <div class="bs-accent" style="background:linear-gradient(90deg,#8b5cf6,#a78bfa);"></div>
        <div class="bs-label">Today's Activity</div>
        <div class="bs-val" style="color:#7c3aed;">${todayActivities}</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab ${window._bsTab === 'clients' ? 'active' : ''}" onclick="window.app.bsTab(this,'clients')">Clients (${clients.length})</button>
      <button class="tab ${window._bsTab === 'tasks' ? 'active' : ''}" onclick="window.app.bsTab(this,'tasks')">Tasks (${pendingTasks})</button>
      <button class="tab ${window._bsTab === 'activity' ? 'active' : ''}" onclick="window.app.bsTab(this,'activity')">Activity Log (${activities.length})</button>
      <button class="tab ${window._bsTab === 'financials' ? 'active' : ''}" onclick="window.app.bsTab(this,'financials')">Financials</button>
    </div>

    <!-- Clients Tab -->
    <div id="bs-clients" class="${window._bsTab !== 'clients' ? 'hidden' : ''}">
      <div class="card bs-card bs-table">
        <div class="card-header">
          <h3>Billing Clients</h3>
          <div style="display:flex;gap:8px;">
            <input type="text" id="bs-client-search" placeholder="Search clients..." class="form-control" style="width:200px;height:34px;font-size:13px;" oninput="window.app.filterBsClients()">
            <select id="bs-client-status-filter" class="form-control" style="width:130px;height:34px;font-size:13px;" onchange="window.app.filterBsClients()">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="onboarding">Onboarding</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Contact</th>
                  <th>Billing Platform</th>
                  <th>Providers</th>
                  <th>Open Tasks</th>
                  <th>Monthly Fee</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="bs-clients-tbody">
                ${clients.map(c => {
                  const orgName = c.organizationName || c.organization_name || c.orgName || '—';
                  const contact = c.contactName || c.contact_name || '';
                  const platform = c.billingPlatform || c.billing_platform || '—';
                  const providerCount = c.providerCount || c.provider_count || 0;
                  const openTasks = tasks.filter(t => t.billingClientId == c.id && t.status !== 'completed' && t.status !== 'cancelled').length;
                  const fee = c.monthlyFee || c.monthly_fee || 0;
                  return `
                  <tr class="bs-client-row" data-status="${c.status || 'pending'}" data-search="${orgName.toLowerCase()} ${contact.toLowerCase()} ${platform.toLowerCase()}" style="cursor:pointer;" onclick="window.app.viewBillingClient(${c.id})">
                    <td><strong>${escHtml(orgName)}</strong></td>
                    <td class="text-sm">${escHtml(contact)}</td>
                    <td><code style="font-size:12px;">${escHtml(platform)}</code></td>
                    <td style="text-align:center;">${providerCount}</td>
                    <td style="text-align:center;">${openTasks > 0 ? `<span style="background:var(--gold);color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${openTasks}</span>` : '<span style="color:var(--gray-400);">0</span>'}</td>
                    <td>${_fmtMoney(fee)}</td>
                    <td>${_bsStatusBadge(c.status)}</td>
                    <td onclick="event.stopPropagation();">
                      <button class="btn btn-sm" onclick="window.app.editBillingClient(${c.id})">Edit</button>
                      <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteBillingClient(${c.id})">Del</button>
                    </td>
                  </tr>`;
                }).join('')}
                ${clients.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No billing clients yet. Click "+ Add Client" to onboard your first billing client.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Tasks Tab -->
    <div id="bs-tasks" class="${window._bsTab !== 'tasks' ? 'hidden' : ''}">
      <div class="card bs-card bs-table">
        <div class="card-header">
          <h3>Billing Tasks</h3>
          <div style="display:flex;gap:8px;">
            <select id="bs-task-client-filter" class="form-control" style="width:180px;height:34px;font-size:13px;" onchange="window.app.filterBsTasks()">
              <option value="">All Clients</option>
              ${clients.map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || c.orgName || 'Client #' + c.id)}</option>`).join('')}
            </select>
            <select id="bs-task-status-filter" class="form-control" style="width:130px;height:34px;font-size:13px;" onchange="window.app.filterBsTasks()">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
            </select>
            <select id="bs-task-cat-filter" class="form-control" style="width:160px;height:34px;font-size:13px;" onchange="window.app.filterBsTasks()">
              <option value="">All Categories</option>
              ${TASK_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Client</th>
                  <th>Provider</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="bs-tasks-tbody">
                ${tasks.map(t => {
                  const client = clients.find(c => c.id == (t.billingClientId || t.billing_client_id));
                  const clientName = client ? (client.organizationName || client.organization_name || client.orgName || '') : (t.clientName || t.client_name || '—');
                  const provider = t.providerName || t.provider_name || '—';
                  const cat = TASK_CATEGORIES.find(c => c.value === (t.category || t.taskCategory || t.task_category));
                  const dueDate = t.dueDate || t.due_date || '';
                  const isOverdue = dueDate && new Date(dueDate) < new Date() && t.status !== 'completed' && t.status !== 'cancelled';
                  return `
                  <tr class="bs-task-row" data-client="${t.billingClientId || t.billing_client_id || ''}" data-status="${t.status || 'pending'}" data-category="${t.category || t.taskCategory || t.task_category || ''}">
                    <td><strong>${escHtml(t.title || t.description || '—')}</strong></td>
                    <td class="text-sm">${escHtml(clientName)}</td>
                    <td class="text-sm">${escHtml(provider)}</td>
                    <td><span style="font-size:12px;padding:2px 8px;background:var(--gray-100);border-radius:4px;">${escHtml(cat ? cat.label : (t.category || '—'))}</span></td>
                    <td>${_taskPriorityBadge(t.priority)}</td>
                    <td style="${isOverdue ? 'color:var(--red);font-weight:600;' : ''}">${dueDate ? formatDateDisplay(dueDate) : '—'}${isOverdue ? ' <span style="font-size:10px;">OVERDUE</span>' : ''}</td>
                    <td>${_taskStatusBadge(t.status)}</td>
                    <td>
                      ${t.status !== 'completed' ? `<button class="btn btn-sm btn-primary" onclick="window.app.completeBsTask(${t.id})" title="Complete">&#10003;</button>` : ''}
                      <button class="btn btn-sm" onclick="window.app.editBsTask(${t.id})">Edit</button>
                      <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteBsTask(${t.id})">Del</button>
                    </td>
                  </tr>`;
                }).join('')}
                ${tasks.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No billing tasks. Click "+ Add Task" to create one.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Activity Log Tab -->
    <div id="bs-activity" class="${window._bsTab !== 'activity' ? 'hidden' : ''}">
      <div class="card bs-card">
        <div class="card-header">
          <h3>Activity Log</h3>
          <div style="display:flex;gap:8px;">
            <select id="bs-activity-client-filter" class="form-control" style="width:180px;height:34px;font-size:13px;" onchange="window.app.filterBsActivities()">
              <option value="">All Clients</option>
              ${clients.map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || c.orgName || 'Client #' + c.id)}</option>`).join('')}
            </select>
            <select id="bs-activity-type-filter" class="form-control" style="width:160px;height:34px;font-size:13px;" onchange="window.app.filterBsActivities()">
              <option value="">All Types</option>
              ${ACTIVITY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card-body" style="padding:16px;">
          <div id="bs-activity-list">
            ${_renderActivityList(activities, clients)}
          </div>
        </div>
      </div>
    </div>

    <!-- Financials Tab -->
    <div id="bs-financials" class="${window._bsTab !== 'financials' ? 'hidden' : ''}">
      ${_renderFinancialsTab(clients, stats)}
    </div>

    <!-- Add/Edit Billing Client Modal -->
    <div class="modal-overlay" id="bs-client-modal">
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <h3 id="bs-client-modal-title">Add Billing Client</h3>
          <button class="modal-close" onclick="document.getElementById('bs-client-modal').classList.remove('active')">&times;</button>
        </div>
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
            <div class="auth-field" style="margin:0;">
              <label>Billing Platform</label>
              <select id="bs-client-platform" class="form-control">
                <option value="">Select platform...</option>
                <option value="Office Ally">Office Ally</option>
                <option value="Availity">Availity</option>
                <option value="Trizetto">Trizetto</option>
                <option value="Kareo">Kareo</option>
                <option value="AdvancedMD">AdvancedMD</option>
                <option value="Athenahealth">Athenahealth</option>
                <option value="DrChrono">DrChrono</option>
                <option value="SimplePractice">SimplePractice</option>
                <option value="TherapyNotes">TherapyNotes</option>
                <option value="CollaborateMD">CollaborateMD</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Monthly Fee</label><input type="number" id="bs-client-fee" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;">
              <label>Fee Structure</label>
              <select id="bs-client-fee-structure" class="form-control">
                <option value="flat">Flat Monthly Fee</option>
                <option value="per_provider">Per Provider / Month</option>
                <option value="percentage">% of Collections</option>
                <option value="per_claim">Per Claim</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;">
              <label>Status</label>
              <select id="bs-client-status" class="form-control">
                <option value="onboarding">Onboarding</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Start Date</label><input type="date" id="bs-client-start" class="form-control"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Notes</label><textarea id="bs-client-notes" class="form-control" rows="2" style="resize:vertical;" placeholder="Billing platform login info, special instructions, etc."></textarea></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('bs-client-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveBillingClient()">Save</button>
        </div>
      </div>
    </div>

    <!-- Add/Edit Task Modal -->
    <div class="modal-overlay" id="bs-task-modal">
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <h3 id="bs-task-modal-title">Add Billing Task</h3>
          <button class="modal-close" onclick="document.getElementById('bs-task-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="bs-task-edit-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Task Title *</label><input type="text" id="bs-task-title" class="form-control" placeholder="e.g. Follow up on denied claims for March"></div>
            <div class="auth-field" style="margin:0;">
              <label>Client *</label>
              <select id="bs-task-client" class="form-control">
                <option value="">Select client...</option>
                ${clients.map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || c.orgName || 'Client #' + c.id)}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Provider (optional)</label><input type="text" id="bs-task-provider" class="form-control" placeholder="Provider name"></div>
            <div class="auth-field" style="margin:0;">
              <label>Category</label>
              <select id="bs-task-category" class="form-control">
                ${TASK_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;">
              <label>Priority</label>
              <select id="bs-task-priority" class="form-control">
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Due Date</label><input type="date" id="bs-task-due" class="form-control"></div>
            <div class="auth-field" style="margin:0;">
              <label>Status</label>
              <select id="bs-task-status" class="form-control">
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Description</label><textarea id="bs-task-desc" class="form-control" rows="3" style="resize:vertical;" placeholder="Details about this task..."></textarea></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('bs-task-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveBsTask()">Save</button>
        </div>
      </div>
    </div>

    <!-- Log Activity Modal -->
    <div class="modal-overlay" id="bs-activity-modal">
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3>Log Activity</h3>
          <button class="modal-close" onclick="document.getElementById('bs-activity-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;">
              <label>Client *</label>
              <select id="bs-act-client" class="form-control">
                <option value="">Select client...</option>
                ${clients.map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || c.orgName || 'Client #' + c.id)}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;">
              <label>Activity Type *</label>
              <select id="bs-act-type" class="form-control">
                ${ACTIVITY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Provider (optional)</label><input type="text" id="bs-act-provider" class="form-control" placeholder="Provider name"></div>
            <div class="auth-field" style="margin:0;"><label>Payer (optional)</label><input type="text" id="bs-act-payer" class="form-control" placeholder="Payer name"></div>
            <div class="auth-field" style="margin:0;"><label>Date</label><input type="date" id="bs-act-date" class="form-control" value="${todayStr}"></div>
            <div class="auth-field" style="margin:0;"><label>Amount ($)</label><input type="number" id="bs-act-amount" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label>Quantity</label><input type="number" id="bs-act-qty" class="form-control" min="1" value="1" placeholder="# claims, etc."></div>
            <div class="auth-field" style="margin:0;"><label>Reference</label><input type="text" id="bs-act-ref" class="form-control" placeholder="Claim #, check #, etc."></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Notes *</label><textarea id="bs-act-notes" class="form-control" rows="3" style="resize:vertical;" placeholder="Describe the work done..."></textarea></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('bs-activity-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveBsActivity()">Log Activity</button>
        </div>
      </div>
    </div>
  `;
}

function _renderActivityList(activities, clients) {
  if (!activities.length) return '<div style="text-align:center;padding:2rem;color:var(--gray-500);">No activities logged yet. Click "+ Log Activity" to record billing work.</div>';

  let lastDate = '';
  return activities.map(a => {
    const date = (a.activityDate || a.activity_date || a.createdAt || a.created_at || '').split('T')[0];
    const client = clients.find(c => c.id == (a.billingClientId || a.billing_client_id));
    const clientName = client ? (client.organizationName || client.organization_name || client.orgName || '') : (a.clientName || a.client_name || '—');
    const type = a.activityType || a.activity_type || a.type || 'note';
    const typeLabel = ACTIVITY_TYPES.find(t => t.value === type);
    const amount = a.amount || 0;
    const qty = a.quantity || a.qty || 0;
    const user = a.userName || a.user_name || a.createdBy || a.created_by || '';

    let dateHeader = '';
    if (date !== lastDate) {
      lastDate = date;
      const d = new Date(date + 'T00:00:00');
      const today = new Date();
      const isToday = d.toDateString() === today.toDateString();
      const isYesterday = d.toDateString() === new Date(today - 86400000).toDateString();
      const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      dateHeader = `<div style="font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--gray-200);">${label}</div>`;
    }

    return `${dateHeader}
      <div class="bs-activity-item" data-client="${a.billingClientId || a.billing_client_id || ''}" data-type="${type}" style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
        <div style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;">
          ${_activityTypeIcon(type)}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div>
              <span style="font-weight:600;font-size:13px;">${escHtml(typeLabel ? typeLabel.label : type)}</span>
              <span style="font-size:12px;color:var(--gray-500);"> — ${escHtml(clientName)}</span>
              ${a.providerName || a.provider_name ? `<span style="font-size:12px;color:var(--gray-400);"> / ${escHtml(a.providerName || a.provider_name)}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
              ${amount ? `<span style="font-weight:700;color:var(--green);font-size:13px;">${_fmtMoney(amount)}</span>` : ''}
              ${qty > 1 ? `<span style="font-size:11px;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${qty} items</span>` : ''}
            </div>
          </div>
          <div style="font-size:13px;color:var(--gray-700);margin-top:2px;">${escHtml(a.notes || a.description || '')}</div>
          <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">
            ${user ? escHtml(user) + ' · ' : ''}${date ? formatDateDisplay(date) : ''}
            ${a.reference || a.ref ? ` · Ref: ${escHtml(a.reference || a.ref)}` : ''}
            ${a.payerName || a.payer_name ? ` · ${escHtml(a.payerName || a.payer_name)}` : ''}
          </div>
        </div>
        <div style="flex-shrink:0;">
          <button class="btn btn-sm" style="color:var(--red);padding:2px 6px;" onclick="window.app.deleteBsActivity(${a.id})" title="Delete">&times;</button>
        </div>
      </div>`;
  }).join('');
}

function _renderFinancialsTab(clients, stats) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="card bs-card">
        <div class="card-header"><h3>Summary by Client</h3></div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th style="text-align:right;">Claims</th>
                  <th style="text-align:right;">Billed</th>
                  <th style="text-align:right;">Collected</th>
                  <th style="text-align:right;">Denied</th>
                  <th style="text-align:right;">Collection Rate</th>
                </tr>
              </thead>
              <tbody>
                ${clients.filter(c => c.status === 'active').map(c => {
                  const fin = c.financials || {};
                  const claims = fin.totalClaims || fin.total_claims || 0;
                  const billed = fin.totalBilled || fin.total_billed || 0;
                  const collected = fin.totalCollected || fin.total_collected || 0;
                  const denied = fin.totalDenied || fin.total_denied || 0;
                  const rate = billed > 0 ? ((collected / billed) * 100).toFixed(1) : '0.0';
                  return `<tr>
                    <td><strong>${escHtml(c.organizationName || c.organization_name || c.orgName || '—')}</strong></td>
                    <td style="text-align:right;">${claims}</td>
                    <td style="text-align:right;">${_fmtMoney(billed)}</td>
                    <td style="text-align:right;color:var(--green);font-weight:600;">${_fmtMoney(collected)}</td>
                    <td style="text-align:right;color:var(--red);">${_fmtMoney(denied)}</td>
                    <td style="text-align:right;font-weight:600;">${rate}%</td>
                  </tr>`;
                }).join('')}
                ${clients.filter(c => c.status === 'active').length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--gray-500);">No active clients</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card bs-card">
        <div class="card-header"><h3>Quick Entry — Financial Summary</h3></div>
        <div class="card-body" style="padding:20px;">
          <p style="font-size:13px;color:var(--gray-600);margin-bottom:16px;">Enter monthly financial summary for a client. These numbers come from your billing platform reports.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;">
              <label>Client</label>
              <select id="bs-fin-client" class="form-control">
                <option value="">Select client...</option>
                ${clients.filter(c => c.status === 'active').map(c => `<option value="${c.id}">${escHtml(c.organizationName || c.organization_name || c.orgName || '')}</option>`).join('')}
              </select>
            </div>
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
}

// ─── Client Detail Page ───

async function renderBillingClientDetail(clientId) {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let client = {};
  let tasks = [];
  let activities = [];
  let financials = [];

  try { client = await store.getBillingClient(clientId); } catch (e) {
    try {
      const all = await store.getBillingClients();
      client = (Array.isArray(all) ? all : []).find(x => x.id == clientId) || {};
    } catch {}
  }
  try { tasks = await store.getBillingTasks({ billing_client_id: clientId }); } catch {}
  try { activities = await store.getBillingActivities({ billing_client_id: clientId, limit: 30 }); } catch {}
  try { financials = await store.getBillingFinancials({ billing_client_id: clientId }); } catch {}

  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(activities)) activities = [];
  if (!Array.isArray(financials)) financials = [];

  if (!client || !client.id) { body.innerHTML = '<div class="empty-state"><h3>Billing client not found</h3></div>'; return; }

  const orgName = client.organizationName || client.organization_name || client.orgName || '—';
  const platform = client.billingPlatform || client.billing_platform || '—';
  const fee = client.monthlyFee || client.monthly_fee || 0;
  const feeStruct = client.feeStructure || client.fee_structure || 'flat';
  const feeLabels = { flat: 'Flat Monthly', per_provider: 'Per Provider/Mo', percentage: '% of Collections', per_claim: 'Per Claim' };
  const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;

  // Aggregate financials
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
    <button class="btn btn-sm" onclick="window.app.navigateTo('billing-services')">&larr; All Clients</button>
    <button class="btn btn-sm btn-primary" onclick="window.app.openBsTaskModal(${client.id})">+ Add Task</button>
    <button class="btn btn-sm btn-gold" onclick="window.app.openBsActivityModal(${client.id})">+ Log Activity</button>
    <button class="btn btn-sm" onclick="window.app.editBillingClient(${client.id})">Edit Client</button>
  `;

  body.innerHTML = `
    <style>
      .bsd-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .bsd-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .bsd-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
      .bsd-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
      .bsd-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
    </style>

    <!-- Client Header Card -->
    <div class="card" style="border-top:3px solid var(--brand-600);margin-bottom:20px;border-radius:16px;">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <div style="font-size:24px;font-weight:800;color:var(--gray-900);">${escHtml(orgName)}</div>
            <div style="font-size:14px;color:var(--gray-600);margin-top:4px;">Platform: <strong>${escHtml(platform)}</strong> &nbsp;|&nbsp; Fee: <strong>${_fmtMoney(fee)}</strong> <span style="font-size:12px;color:var(--gray-400);">(${feeLabels[feeStruct] || feeStruct})</span></div>
            ${client.contactName || client.contact_name ? `<div style="font-size:13px;color:var(--gray-500);margin-top:2px;">Contact: ${escHtml(client.contactName || client.contact_name)}${client.contactEmail || client.contact_email ? ' — ' + escHtml(client.contactEmail || client.contact_email) : ''}</div>` : ''}
            ${client.startDate || client.start_date ? `<div style="font-size:13px;color:var(--gray-500);margin-top:2px;">Since: ${formatDateDisplay(client.startDate || client.start_date)}</div>` : ''}
          </div>
          <div style="text-align:right;">${_bsStatusBadge(client.status)}</div>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:20px;">
      <div class="stat-card bsd-stat"><div class="label">Open Tasks</div><div class="value" style="color:var(--gold);">${openTasks}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Completed Tasks</div><div class="value" style="color:var(--green);">${completedTasks}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Total Billed</div><div class="value">${_fmtMoney(totals.billed)}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Collected</div><div class="value" style="color:var(--green);">${_fmtMoney(totals.collected)}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Denied</div><div class="value" style="color:var(--red);">${_fmtMoney(totals.denied)}</div></div>
      <div class="stat-card bsd-stat"><div class="label">Collection Rate</div><div class="value" style="color:var(--brand-600);">${collectionRate}%</div></div>
    </div>

    <!-- Two columns: Tasks + Activity -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <!-- Open Tasks -->
      <div class="card" style="border-radius:16px;">
        <div class="card-header">
          <h3>Open Tasks (${openTasks})</h3>
          <button class="btn btn-sm btn-primary" onclick="window.app.openBsTaskModal(${client.id})">+ Add</button>
        </div>
        <div class="card-body" style="padding:0;">
          ${tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length > 0 ? `
            <table>
              <thead><tr><th>Task</th><th>Category</th><th>Priority</th><th>Due</th><th></th></tr></thead>
              <tbody>
                ${tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').map(t => {
                  const cat = TASK_CATEGORIES.find(c => c.value === (t.category || t.taskCategory || t.task_category));
                  const dueDate = t.dueDate || t.due_date || '';
                  const isOverdue = dueDate && new Date(dueDate) < new Date();
                  return `<tr>
                    <td><strong style="font-size:13px;">${escHtml(t.title || t.description || '—')}</strong></td>
                    <td style="font-size:12px;">${escHtml(cat ? cat.label : '')}</td>
                    <td>${_taskPriorityBadge(t.priority)}</td>
                    <td style="font-size:12px;${isOverdue ? 'color:var(--red);font-weight:600;' : ''}">${dueDate ? formatDateDisplay(dueDate) : '—'}</td>
                    <td><button class="btn btn-sm btn-primary" onclick="window.app.completeBsTask(${t.id})" style="padding:2px 8px;font-size:11px;">&#10003;</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          ` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No open tasks</div>'}
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="card" style="border-radius:16px;">
        <div class="card-header">
          <h3>Recent Activity</h3>
          <button class="btn btn-sm btn-gold" onclick="window.app.openBsActivityModal(${client.id})">+ Log</button>
        </div>
        <div class="card-body" style="padding:12px 16px;">
          ${activities.length > 0 ? activities.slice(0, 15).map(a => {
            const type = a.activityType || a.activity_type || a.type || 'note';
            const typeLabel = ACTIVITY_TYPES.find(t => t.value === type);
            const amount = a.amount || 0;
            return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:13px;">
              <div style="flex-shrink:0;margin-top:2px;">${_activityTypeIcon(type)}</div>
              <div style="flex:1;min-width:0;">
                <strong>${escHtml(typeLabel ? typeLabel.label : type)}</strong>
                ${amount ? ` — <span style="color:var(--green);font-weight:600;">${_fmtMoney(amount)}</span>` : ''}
                <div style="font-size:12px;color:var(--gray-600);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(a.notes || a.description || '')}</div>
                <div style="font-size:11px;color:var(--gray-400);">${formatDateDisplay(a.activityDate || a.activity_date || a.createdAt || a.created_at)}</div>
              </div>
            </div>`;
          }).join('') : '<div style="text-align:center;padding:1rem;color:var(--gray-500);">No activity logged yet</div>'}
        </div>
      </div>
    </div>

    <!-- Financial History -->
    ${financials.length > 0 ? `
    <div class="card" style="border-radius:16px;margin-top:16px;">
      <div class="card-header"><h3>Financial History</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Period</th><th style="text-align:right;">Claims</th><th style="text-align:right;">Billed</th><th style="text-align:right;">Collected</th><th style="text-align:right;">Denied</th><th style="text-align:right;">Adjustments</th><th style="text-align:right;">Collection %</th></tr></thead>
          <tbody>
            ${financials.map(f => {
              const billed = f.amountBilled || f.amount_billed || 0;
              const collected = f.amountCollected || f.amount_collected || 0;
              const rate = billed > 0 ? ((collected / billed) * 100).toFixed(1) : '—';
              return `<tr>
                <td><strong>${escHtml(f.period || '—')}</strong></td>
                <td style="text-align:right;">${f.claimsSubmitted || f.claims_submitted || 0}</td>
                <td style="text-align:right;">${_fmtMoney(billed)}</td>
                <td style="text-align:right;color:var(--green);font-weight:600;">${_fmtMoney(collected)}</td>
                <td style="text-align:right;color:var(--red);">${_fmtMoney(f.deniedAmount || f.denied_amount || 0)}</td>
                <td style="text-align:right;">${_fmtMoney(f.adjustments || 0)}</td>
                <td style="text-align:right;font-weight:600;">${rate}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

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
