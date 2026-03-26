// ui/pages/admin.js — Lazy-loaded admin render functions
// Auto-extracted from app.js for code splitting

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, getPayerById, getStateName, navigateTo, appConfirm, appPrompt,
        editButton, deleteButton, helpTip, sortArrow, timeAgo,
        PAYER_CATALOG, STATES, APPLICATION_STATUSES, CRED_DOCUMENTS, workflow } = window._credentik;

async function renderAuditTrail() {
  const body = document.getElementById('page-body');
  if (!auth.isAgency()) {
    body.innerHTML = '<div class="alert alert-danger">Agency access required to view audit trail.</div>';
    return;
  }

  let entries = [];
  try { const result = await store.getAuditLog(); entries = Array.isArray(result) ? result : (result?.data || result?.entries || []); } catch {}
  if (!Array.isArray(entries)) entries = [];

  // Filters
  const collections = [...new Set(entries.map(e => e.collection).filter(Boolean))].sort();
  const actions = [...new Set(entries.map(e => e.action).filter(Boolean))].sort();
  const users = [...new Set(entries.map(e => e.user_name).filter(Boolean))].sort();

  const actionIcon = (action) => {
    const icons = { create: '➕', update: '✏️', delete: '🗑️' };
    return icons[action] || '📝';
  };

  const actionColor = (action) => {
    const colors = { create: '#059669', update: '#2563eb', delete: '#dc2626' };
    return colors[action] || '#6b7280';
  };

  const formatChanges = (changes) => {
    if (!changes) return '';
    return Object.entries(changes).map(([field, diff]) => {
      const from = diff.from === null || diff.from === '' ? '<em>empty</em>' : escHtml(String(diff.from));
      const to = diff.to === null || diff.to === '' ? '<em>empty</em>' : escHtml(String(diff.to));
      return `<div style="font-size:11px;margin:2px 0;"><strong>${escHtml(field)}</strong>: <span style="text-decoration:line-through;color:var(--red);opacity:.7;">${from}</span> → <span style="color:var(--green);">${to}</span></div>`;
    }).join('');
  };

  const timeAgoShort = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  body.innerHTML = `
    <style>
      .atv2-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .atv2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .atv2-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
      .atv2-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
      .atv2-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
      .atv2-card{border-radius:16px!important;overflow:hidden;}
      .atv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
      <div class="stat-card atv2-stat"><div class="label">Total Events</div><div class="value">${entries.length}</div></div>
      <div class="stat-card atv2-stat"><div class="label">Creates</div><div class="value green">${entries.filter(e => e.action === 'create').length}</div></div>
      <div class="stat-card atv2-stat"><div class="label">Updates</div><div class="value blue">${entries.filter(e => e.action === 'update').length}</div></div>
      <div class="stat-card atv2-stat"><div class="label">Deletes</div><div class="value red">${entries.filter(e => e.action === 'delete').length}</div></div>
    </div>

    <div class="filters-bar" style="margin-bottom:16px;">
      <select class="form-control" id="audit-filter-collection" onchange="window.app.filterAuditTrail()">
        <option value="">All Collections</option>
        ${collections.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <select class="form-control" id="audit-filter-action" onchange="window.app.filterAuditTrail()">
        <option value="">All Actions</option>
        ${actions.map(a => `<option value="${a}">${a}</option>`).join('')}
      </select>
      <select class="form-control" id="audit-filter-user" onchange="window.app.filterAuditTrail()">
        <option value="">All Users</option>
        ${users.map(u => `<option value="${u}">${u}</option>`).join('')}
      </select>
      <input type="text" class="form-control search-input" id="audit-search" placeholder="Search..." oninput="window.app.filterAuditTrail()">
    </div>

    <div class="card atv2-card">
      <div class="card-header">
        <h3>Activity Log</h3>
        <button class="btn btn-sm" onclick="window.app.exportAuditCSV()">Export CSV</button>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead>
            <tr>
              <th style="width:140px;">When</th>
              <th style="width:160px;">User</th>
              <th style="width:70px;">Action</th>
              <th style="width:130px;">Collection</th>
              <th style="width:80px;">Record</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody id="audit-table-body">
            ${entries.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No audit events yet. Changes will be tracked as users create, edit, and delete records.</td></tr>' : ''}
            ${entries.slice(0, 200).map(e => `
              <tr>
                <td>
                  <div style="font-size:12px;">${timeAgoShort(e.timestamp)}</div>
                  <div style="font-size:10px;color:var(--text-muted);">${e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}</div>
                </td>
                <td>
                  <strong style="font-size:12px;">${escHtml(e.user_name || 'System')}</strong>
                  <div style="font-size:10px;color:var(--text-muted);">${escHtml(e.user_role || '')}</div>
                </td>
                <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:${actionColor(e.action)};">${actionIcon(e.action)} ${e.action}</span></td>
                <td style="font-size:12px;">${escHtml(e.collection || '')}</td>
                <td><code style="font-size:11px;">${e.record_id ? ('#' + (typeof e.record_id === 'number' ? e.record_id : String(e.record_id).slice(-6))) : '-'}</code></td>
                <td>${e.changes ? formatChanges(e.changes) : (e.action === 'create' ? '<span style="font-size:11px;color:var(--green);">New record created</span>' : e.action === 'delete' ? '<span style="font-size:11px;color:var(--red);">Record deleted</span>' : '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${entries.length > 200 ? `<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-muted);">Showing first 200 of ${entries.length} events</div>` : ''}
      </div>
    </div>
  `;
}

async function renderAdminPanel() {
  const body = document.getElementById('page-body');
  if (!auth.isSuperAdmin()) {
    body.innerHTML = '<div class="alert alert-danger">SuperAdmin access required.</div>';
    return;
  }

  let agencies = [];
  try { agencies = await store.getAdminAgencies(); } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">Failed to load agencies: ${escHtml(e.message)}</div>`;
    return;
  }

  const totalUsers = agencies.reduce((s, a) => s + (a.usersCount || 0), 0);
  const totalProviders = agencies.reduce((s, a) => s + (a.providersCount || 0), 0);
  const totalApps = agencies.reduce((s, a) => s + (a.applicationsCount || 0), 0);
  const activeAgencyId = store.activeAgencyId;

  body.innerHTML = `
    ${activeAgencyId ? `
      <div class="alert" style="background:var(--brand-50);border-left:4px solid var(--brand-600);margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
        <span>Viewing as: <strong>${agencies.find(a => a.id === activeAgencyId)?.name || 'Agency #' + activeAgencyId}</strong></span>
        <button class="btn btn-sm" onclick="window.app.clearAgencyOverride()">Exit Agency View</button>
      </div>
    ` : ''}

    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="label">Agencies</div><div class="value">${agencies.length}</div></div>
      <div class="stat-card"><div class="label">Total Users</div><div class="value" style="color:var(--brand-600);">${totalUsers}</div></div>
      <div class="stat-card"><div class="label">Total Providers</div><div class="value" style="color:var(--green);">${totalProviders}</div></div>
      <div class="stat-card"><div class="label">Total Applications</div><div class="value" style="color:var(--amber);">${totalApps}</div></div>
    </div>

    <div class="card">
      <div class="card-header"><h3>All Agencies</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead>
            <tr>
              <th>Agency</th><th>Slug</th><th>Users</th><th>Orgs</th>
              <th>Providers</th><th>Applications</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${agencies.map(a => `
              <tr style="${activeAgencyId === a.id ? 'background:var(--brand-50);' : ''}">
                <td><strong>${escHtml(a.name)}</strong></td>
                <td><code>${escHtml(a.slug || '')}</code></td>
                <td>${a.usersCount || 0}</td>
                <td>${a.organizationsCount || 0}</td>
                <td>${a.providersCount || 0}</td>
                <td>${a.applicationsCount || 0}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn btn-sm btn-primary" onclick="window.app.switchToAgency(${a.id}, '${escHtml(a.name)}')" title="View as this agency">
                      ${activeAgencyId === a.id ? 'Viewing' : 'Switch'}
                    </button>
                    <button class="btn btn-sm" onclick="window.app.viewAgencyDetail(${a.id})" title="Agency details">Details</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderOnboardingStub() {
  const body = document.getElementById('page-body');
  if (!auth.isAdmin()) {
    body.innerHTML = '<div class="alert alert-danger">You do not have permission to manage onboarding.</div>';
    return;
  }
  let tokens = [];
  try { tokens = await store.getOnboardTokens(); } catch {}
  const allProviders = await store.getAll('providers').catch(() => []);
  const provMap = {};
  (Array.isArray(allProviders) ? allProviders : []).forEach(p => { provMap[p.id] = p; });

  const baseUrl = location.origin + location.pathname;

  body.innerHTML = `
    <style>
      .ob2-card{border-radius:16px;overflow:hidden;}
      .ob2-card table tr:hover{background:var(--gray-50);}
    </style>
    <div class="card ob2-card" style="margin-bottom:1.5rem;">
      <div class="card-header">
        <h3>Create Onboarding Invite</h3>
      </div>
      <div class="card-body">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
          <div class="auth-field" style="flex:1;min-width:200px;margin:0;">
            <label for="onboard-invite-email">Provider Email</label>
            <input type="email" id="onboard-invite-email" placeholder="provider@email.com" style="margin:0;">
          </div>
          <div class="auth-field" style="width:120px;margin:0;">
            <label for="onboard-invite-hours">Expires In</label>
            <select id="onboard-invite-hours" class="form-control" style="margin:0;">
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
              <option value="72" selected>72 hours</option>
              <option value="168">1 week</option>
              <option value="720">30 days</option>
            </select>
          </div>
          <button class="btn btn-gold" onclick="window.app.createOnboardToken()" style="height:38px;">Create & Copy Link</button>
        </div>
        <div id="onboard-invite-result" style="display:none;margin-top:12px;padding:12px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:16px;">
          <div style="font-size:12px;color:#10b981;margin-bottom:4px;">Invite link created -- copied to clipboard!</div>
          <code id="onboard-invite-link" style="font-size:12px;word-break:break-all;color:#f1f5f9;"></code>
        </div>
      </div>
    </div>
    <div class="card ob2-card">
      <div class="card-header">
        <h3>Onboarding Tokens</h3>
      </div>
      <div class="card-body">
        ${tokens.length > 0 ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Provider</th><th>Email</th><th>Invite Link</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead>
            <tbody>
              ${tokens.map(t => {
                const email = t.providerEmail || t.provider_email || '';
                const prov = provMap[t.providerId] || provMap[t.provider_id] || {};
                const name = t.providerName || t.provider_name || ((prov.firstName || prov.first_name || '') + ' ' + (prov.lastName || prov.last_name || '')).trim() || '';
                const usedAt = t.usedAt || t.used_at;
                const expiresAt = t.expiresAt || t.expires_at;
                const isUsed = !!usedAt;
                const isExpired = expiresAt && new Date(expiresAt) < new Date();
                const status = isUsed ? 'Completed' : isExpired ? 'Expired' : 'Pending';
                const badgeClass = isUsed ? 'approved' : isExpired ? 'denied' : 'pending';
                const link = `${baseUrl}#onboard/${t.token}`;
                return `
                <tr>
                  <td><strong>${escHtml(name || '—')}</strong></td>
                  <td>${escHtml(email || '—')}</td>
                  <td style="max-width:180px;"><code style="font-size:11px;cursor:pointer;color:var(--brand-600);" onclick="navigator.clipboard.writeText('${link}');showToast('Link copied!','success')" title="Click to copy full link">${t.token ? t.token.substring(0, 16) + '...' : t.id}</code></td>
                  <td><span class="badge badge-${badgeClass}">${status}</span></td>
                  <td>${formatDateDisplay(expiresAt)}</td>
                  <td>
                    <div class="flex gap-2">
                      ${!isUsed && !isExpired ? `<button class="btn btn-sm btn-primary" onclick="navigator.clipboard.writeText('${link}');showToast('Link copied — send to provider','success')">Copy Link</button>` : ''}
                      ${!isUsed ? `<button class="btn btn-sm" style="color:var(--danger-500);" onclick="window.app.revokeOnboardToken(${t.id})">Revoke</button>` : `<span class="text-sm text-muted">${formatDateDisplay(usedAt)}</span>`}
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>
        ` : '<div class="text-sm text-muted" style="text-align:center;padding:2rem;">No onboarding tokens yet. Create one above to invite a provider.</div>'}
      </div>
    </div>
  `;
}

async function renderImportPage() {
  const body = document.getElementById('page-body');

  let importHistory = [];
  try { importHistory = await store.getImports(); } catch (e) { console.error('Imports error:', e); }
  if (!Array.isArray(importHistory)) importHistory = [];

  body.innerHTML = `
    <style>
      .impv2-card{border-radius:16px!important;overflow:hidden;}
      .impv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <div class="card impv2-card" style="margin-bottom:20px;">
      <div class="card-header"><h3>Import Data from CSV</h3></div>
      <div class="card-body">
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
          <div class="auth-field" style="margin:0;flex:1;min-width:180px;">
            <label>Import Type *</label>
            <select id="import-type" class="form-control">
              <option value="">Select type...</option>
              <option value="providers">Providers</option>
              <option value="organizations">Organizations</option>
              <option value="licenses">Licenses</option>
              <option value="facilities">Practice Locations</option>
            </select>
          </div>
          <div class="auth-field" style="margin:0;flex:2;min-width:250px;">
            <label>CSV File *</label>
            <input type="file" id="import-file" class="form-control" accept=".csv,.xlsx,.xls" onchange="window.app.previewImportFile()">
          </div>
        </div>

        <!-- Preview Area -->
        <div id="import-preview" style="display:none;margin-top:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="margin:0;" id="import-preview-title">Preview</h4>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-primary" onclick="window.app.executeImportAction()">Import Data</button>
              <button class="btn" onclick="document.getElementById('import-preview').style.display='none';">Cancel</button>
            </div>
          </div>

          <!-- Column Mapping -->
          <div id="import-mapping" style="margin-bottom:16px;"></div>

          <!-- Data Preview Table -->
          <div id="import-preview-table" class="table-wrap" style="max-height:400px;overflow-y:auto;"></div>
        </div>

        <!-- Import Result -->
        <div id="import-result" style="display:none;margin-top:20px;"></div>
      </div>
    </div>

    <!-- Import History -->
    <div class="card impv2-card">
      <div class="card-header"><h3>Import History</h3></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>File</th><th>Records</th><th>Success</th><th>Errors</th><th>Status</th></tr></thead>
            <tbody>
              ${importHistory.map(h => {
                const st = h.status || 'completed';
                const badge = st === 'completed' ? 'approved' : st === 'failed' ? 'denied' : 'pending';
                return `
                <tr>
                  <td>${formatDateDisplay(h.createdAt || h.created_at || h.date)}</td>
                  <td>${escHtml(h.importType || h.import_type || h.type || '—')}</td>
                  <td class="text-sm">${escHtml(h.fileName || h.file_name || '—')}</td>
                  <td>${h.totalRecords || h.total_records || h.total || 0}</td>
                  <td style="color:var(--green);">${h.successCount || h.success_count || h.success || 0}</td>
                  <td style="color:var(--red);">${h.errorCount || h.error_count || h.errors || 0}</td>
                  <td><span class="badge badge-${badge}">${st}</span></td>
                </tr>`;
              }).join('')}
              ${importHistory.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-500);">No imports yet.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

const DEFAULT_AUTOMATION_RULES = [
  { id: 'default_1', name: 'License Expiring — Create Renewal Task', trigger: 'license_expiring', triggerValue: '90', condition: '', conditionValue: '', action: 'create_task', actionValue: 'Renew license before expiration', enabled: true, isDefault: true, triggeredCount: 0 },
  { id: 'default_2', name: 'Application Denied — Create Re-submission Task', trigger: 'app_status_change', triggerValue: 'denied', condition: '', conditionValue: '', action: 'create_task', actionValue: 'Re-submit denied application with corrections', enabled: true, isDefault: true, triggeredCount: 0 },
  { id: 'default_3', name: 'Follow-up Overdue 7 Days — Send Email Alert', trigger: 'followup_overdue', triggerValue: '7', condition: '', conditionValue: '', action: 'send_email', actionValue: 'Follow-up overdue alert', enabled: false, isDefault: true, triggeredCount: 0 },
  { id: 'default_4', name: 'All Documents Complete — Change to Ready for Review', trigger: 'document_uploaded', triggerValue: '', condition: '', conditionValue: '', action: 'change_status', actionValue: 'ready_for_review', enabled: false, isDefault: true, triggeredCount: 0 },
  { id: 'default_5', name: 'New Provider Added — Create Onboarding Checklist', trigger: 'new_provider', triggerValue: '', condition: '', conditionValue: '', action: 'create_task', actionValue: 'Complete provider onboarding checklist', enabled: true, isDefault: true, triggeredCount: 0 },
];

function _getAutomationRules() {
  try {
    const stored = JSON.parse(localStorage.getItem('credentik_automation_rules') || 'null');
    if (stored && Array.isArray(stored)) return stored;
  } catch {}
  // Initialize with defaults
  localStorage.setItem('credentik_automation_rules', JSON.stringify(DEFAULT_AUTOMATION_RULES));
  return [...DEFAULT_AUTOMATION_RULES];
}
function _saveAutomationRules(rules) {
  localStorage.setItem('credentik_automation_rules', JSON.stringify(rules));
}

const AUTO_TRIGGERS = [
  { value: 'license_expiring', label: 'License expires in X days', hasInput: true, inputLabel: 'Days before expiration' },
  { value: 'app_status_change', label: 'Application status changes to', hasInput: true, inputLabel: 'Status (e.g. denied, approved)' },
  { value: 'document_uploaded', label: 'Document uploaded / All docs complete', hasInput: false },
  { value: 'task_overdue', label: 'Task overdue by X days', hasInput: true, inputLabel: 'Days overdue' },
  { value: 'new_provider', label: 'New provider added', hasInput: false },
  { value: 'followup_overdue', label: 'Follow-up overdue by X days', hasInput: true, inputLabel: 'Days overdue' },
];
const AUTO_CONDITIONS = [
  { value: '', label: '(No condition)' },
  { value: 'state_is', label: 'State is' },
  { value: 'payer_is', label: 'Payer is' },
  { value: 'provider_is', label: 'Provider is' },
  { value: 'priority_is', label: 'Priority is' },
];
const AUTO_ACTIONS = [
  { value: 'create_task', label: 'Create task with title' },
  { value: 'send_email', label: 'Send email notification' },
  { value: 'change_status', label: 'Change status to' },
  { value: 'create_followup', label: 'Create follow-up' },
  { value: 'show_alert', label: 'Show alert notification' },
];

function _triggerLabel(v) { return (AUTO_TRIGGERS.find(t => t.value === v) || {}).label || v; }
function _actionLabel(v) { return (AUTO_ACTIONS.find(a => a.value === v) || {}).label || v; }

async function renderAutomationsPage() {
  const body = document.getElementById('page-body');
  const rules = _getAutomationRules();
  const activeRules = rules.filter(r => r.enabled);
  const triggeredThisWeek = rules.reduce((s, r) => s + (r.triggeredCount || 0), 0);

  body.innerHTML = `
    <style>
      .auto-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px;}
      .auto-stat{background:var(--surface-card,#fff);border-radius:16px;padding:20px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .auto-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .auto-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;}
      .auto-stat-val{font-size:32px;font-weight:800;line-height:1;}
      .auto-stat-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:6px;}
      .auto-card{background:var(--surface-card,#fff);border-radius:16px;padding:20px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;display:flex;align-items:center;gap:16px;}
      .auto-card:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,0.08);}
      .auto-card-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;}
      .auto-card-body{flex:1;min-width:0;}
      .auto-card-name{font-size:14px;font-weight:700;color:var(--gray-800);margin-bottom:4px;}
      .auto-card-desc{font-size:12px;color:var(--gray-500);line-height:1.4;}
      .auto-card-desc span{font-weight:600;color:var(--gray-700);}
      .auto-card-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}
      .auto-toggle{position:relative;width:40px;height:22px;cursor:pointer;}
      .auto-toggle input{opacity:0;width:0;height:0;}
      .auto-toggle .slider{position:absolute;inset:0;background:var(--gray-300);border-radius:11px;transition:0.2s;}
      .auto-toggle .slider::before{content:'';position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;left:3px;top:3px;transition:0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.15);}
      .auto-toggle input:checked+.slider{background:var(--brand-600,#0891b2);}
      .auto-toggle input:checked+.slider::before{transform:translateX(18px);}
      .auto-badge{display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;}
      .auto-badge.on{background:rgba(16,185,129,0.12);color:#10b981;}
      .auto-badge.off{background:rgba(148,163,184,0.15);color:var(--gray-500);}
      .auto-empty{text-align:center;padding:48px;color:var(--gray-400);}
    </style>

    <div class="auto-stats">
      <div class="auto-stat" style="--top-color:var(--brand-600);"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0891b2,#06b6d4);"></div><div class="auto-stat-val" style="color:var(--brand-600);">${rules.length}</div><div class="auto-stat-lbl">Total Rules</div></div>
      <div class="auto-stat"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#10b981,#34d399);"></div><div class="auto-stat-val" style="color:#10b981;">${activeRules.length}</div><div class="auto-stat-lbl">Active</div></div>
      <div class="auto-stat"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#8b5cf6,#a78bfa);"></div><div class="auto-stat-val" style="color:#8b5cf6;">${triggeredThisWeek}</div><div class="auto-stat-lbl">Triggered (this week)</div></div>
    </div>

    <div id="auto-rules-list">
      ${rules.length === 0 ? '<div class="auto-empty"><p>No automation rules yet. Click <strong>+ Create Rule</strong> to get started.</p></div>' : rules.map(r => {
        const triggerInfo = _triggerLabel(r.trigger);
        const actionInfo = _actionLabel(r.action);
        const iconBg = r.enabled ? 'rgba(8,145,178,0.1)' : 'rgba(148,163,184,0.1)';
        const iconColor = r.enabled ? '#0891b2' : '#9ca3af';
        return `<div class="auto-card">
          <div class="auto-card-icon" style="background:${iconBg};color:${iconColor};">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9.5 1.5L4 9h4l-1.5 5.5L13 7H9l.5-5.5z"/></svg>
          </div>
          <div class="auto-card-body">
            <div class="auto-card-name">${escHtml(r.name)} <span class="auto-badge ${r.enabled ? 'on' : 'off'}">${r.enabled ? 'Active' : 'Inactive'}</span></div>
            <div class="auto-card-desc">
              <span>When</span> ${escHtml(triggerInfo)}${r.triggerValue ? ' (' + escHtml(r.triggerValue) + ')' : ''}
              ${r.condition ? ' <span>and</span> ' + escHtml(r.condition.replace(/_/g, ' ')) + ' = ' + escHtml(r.conditionValue || '...') : ''}
              &rarr; <span>Then</span> ${escHtml(actionInfo)}${r.actionValue ? ': ' + escHtml(r.actionValue) : ''}
            </div>
          </div>
          <div class="auto-card-actions">
            <label class="auto-toggle" title="${r.enabled ? 'Disable' : 'Enable'}">
              <input type="checkbox" ${r.enabled ? 'checked' : ''} onchange="window.app.toggleAutomationRule('${escAttr(r.id)}')">
              <span class="slider"></span>
            </label>
            <button class="btn btn-sm" onclick="window.app.openAutomationRuleModal('${escAttr(r.id)}')" title="Edit">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>
            </button>
            <button class="btn btn-sm" onclick="window.app.deleteAutomationRule('${escAttr(r.id)}')" title="Delete" style="color:var(--red);">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M6 4V2.5h4V4M5 4v8.5a1 1 0 001 1h4a1 1 0 001-1V4"/></svg>
            </button>
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- Built-in Workflow Automation Rules (read-only) -->
    <div style="margin-top:32px;">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="var(--brand-600)" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l2.5 1.5"/></svg>
        Built-in Workflow Rules
        <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:8px;background:rgba(8,145,178,0.1);color:var(--brand-600);">SYSTEM</span>
      </h3>
      <p style="font-size:12px;color:var(--gray-500);margin-bottom:12px;">These rules run automatically on every matching event. They cannot be edited or disabled.</p>
      ${(workflow && workflow.getDefaultAutomationRules ? workflow.getDefaultAutomationRules() : []).map(r => {
        const actionColors = { create_task: '#f59e0b', create_followup: '#8b5cf6', send_notification: '#10b981', update_status: '#0891b2' };
        const actionIcons = { create_task: '&#9745;', create_followup: '&#128337;', send_notification: '&#128232;', update_status: '&#9889;' };
        return `<div class="auto-card" style="border-left:3px solid ${actionColors[r.action] || '#9ca3af'};">
          <div class="auto-card-icon" style="background:rgba(8,145,178,0.08);color:var(--brand-600);font-size:18px;">${actionIcons[r.action] || '&#9881;'}</div>
          <div class="auto-card-body">
            <div class="auto-card-name">${escHtml(r.description)} <span class="auto-badge on">Always On</span></div>
            <div class="auto-card-desc"><span>Event:</span> ${escHtml(r.event.replace(/\./g, ' '))} &rarr; <span>Action:</span> ${escHtml(r.action.replace(/_/g, ' '))}</div>
          </div>
          <div class="auto-card-actions">
            <span style="font-size:11px;color:var(--gray-400);font-weight:600;">BUILT-IN</span>
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- Recent Automation Log -->
    <div style="margin-top:32px;">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="var(--gray-600)" stroke-width="1.5" stroke-linecap="round"><path d="M2 2v12h12M5 10l3-3 2 2 4-4"/></svg>
        Recent Automation Activity
      </h3>
      ${(() => {
        const log = workflow && workflow.getAutomationLog ? workflow.getAutomationLog() : [];
        if (log.length === 0) return '<div style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px;">No automations have triggered yet.</div>';
        return '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:12px;">' +
          '<table style="width:100%;font-size:12px;border-collapse:collapse;">' +
          '<thead><tr style="background:var(--gray-50);"><th style="padding:8px 12px;text-align:left;font-weight:600;">Time</th><th style="padding:8px 12px;text-align:left;font-weight:600;">Rule</th><th style="padding:8px 12px;text-align:left;font-weight:600;">Event</th></tr></thead>' +
          '<tbody>' + log.slice(0, 50).map(e => {
            const time = e.timestamp ? new Date(e.timestamp).toLocaleString() : '—';
            return '<tr style="border-top:1px solid var(--gray-100);"><td style="padding:6px 12px;white-space:nowrap;">' + escHtml(time) + '</td><td style="padding:6px 12px;">' + escHtml(e.ruleId || '') + '</td><td style="padding:6px 12px;"><span style="padding:2px 6px;background:var(--gray-100);border-radius:4px;font-size:11px;">' + escHtml(e.event || '') + '</span></td></tr>';
          }).join('') +
          '</tbody></table></div>';
      })()}
    </div>

    <!-- Automation Rule Modal -->
    <div class="modal-overlay" id="automation-rule-modal">
      <div class="modal" style="max-width:560px;border-radius:16px;">
        <div class="modal-header">
          <h2 id="auto-modal-title">Create Automation Rule</h2>
          <button class="modal-close" onclick="window.app.closeAutomationModal()">&times;</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="auto-edit-id" value="">
          <div class="form-group">
            <label class="form-label">Rule Name *</label>
            <input type="text" id="auto-rule-name" class="form-control" placeholder="e.g. License renewal reminder">
          </div>
          <div style="background:var(--gray-50,#f9fafb);border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Trigger — When this happens</div>
            <div class="form-group" style="margin-bottom:8px;">
              <select id="auto-trigger" class="form-control" onchange="document.getElementById('auto-trigger-val-row').style.display=this.selectedOptions[0]?.dataset.hasInput==='true'?'':'none';">
                ${AUTO_TRIGGERS.map(t => `<option value="${t.value}" data-has-input="${t.hasInput}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" id="auto-trigger-val-row">
              <input type="text" id="auto-trigger-value" class="form-control" placeholder="Value (e.g. 90 days)">
            </div>
          </div>
          <div style="background:var(--gray-50,#f9fafb);border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Condition (optional) — And this is true</div>
            <div class="form-group" style="margin-bottom:8px;">
              <select id="auto-condition" class="form-control" onchange="document.getElementById('auto-condition-val-row').style.display=this.value?'':'none';">
                ${AUTO_CONDITIONS.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" id="auto-condition-val-row" style="display:none;">
              <input type="text" id="auto-condition-value" class="form-control" placeholder="Value (e.g. FL, Aetna)">
            </div>
          </div>
          <div style="background:var(--gray-50,#f9fafb);border-radius:12px;padding:16px;">
            <div style="font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Action — Then do this</div>
            <div class="form-group" style="margin-bottom:8px;">
              <select id="auto-action" class="form-control">
                ${AUTO_ACTIONS.map(a => `<option value="${a.value}">${a.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <input type="text" id="auto-action-value" class="form-control" placeholder="Action detail (e.g. task title, status name)">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="window.app.closeAutomationModal()">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveAutomationRule()">Save Rule</button>
        </div>
      </div>
    </div>
  `;
}

function openAutomationRuleModal(editId) {
  const rules = _getAutomationRules();
  const modal = document.getElementById('automation-rule-modal');
  if (!modal) { renderAutomationsPage().then(() => openAutomationRuleModal(editId)); return; }

  const title = document.getElementById('auto-modal-title');
  const nameEl = document.getElementById('auto-rule-name');
  const triggerEl = document.getElementById('auto-trigger');
  const triggerValEl = document.getElementById('auto-trigger-value');
  const condEl = document.getElementById('auto-condition');
  const condValEl = document.getElementById('auto-condition-value');
  const actionEl = document.getElementById('auto-action');
  const actionValEl = document.getElementById('auto-action-value');
  const editIdEl = document.getElementById('auto-edit-id');

  if (editId) {
    const rule = rules.find(r => r.id === editId);
    if (rule) {
      title.textContent = 'Edit Automation Rule';
      editIdEl.value = editId;
      nameEl.value = rule.name || '';
      triggerEl.value = rule.trigger || '';
      triggerValEl.value = rule.triggerValue || '';
      condEl.value = rule.condition || '';
      condValEl.value = rule.conditionValue || '';
      actionEl.value = rule.action || '';
      actionValEl.value = rule.actionValue || '';
      // Show/hide conditional fields
      const trigOpt = triggerEl.selectedOptions[0];
      document.getElementById('auto-trigger-val-row').style.display = trigOpt?.dataset.hasInput === 'true' ? '' : 'none';
      document.getElementById('auto-condition-val-row').style.display = rule.condition ? '' : 'none';
    }
  } else {
    title.textContent = 'Create Automation Rule';
    editIdEl.value = '';
    nameEl.value = '';
    triggerEl.selectedIndex = 0;
    triggerValEl.value = '';
    condEl.selectedIndex = 0;
    condValEl.value = '';
    actionEl.selectedIndex = 0;
    actionValEl.value = '';
    document.getElementById('auto-trigger-val-row').style.display = '';
    document.getElementById('auto-condition-val-row').style.display = 'none';
  }
  modal.classList.add('active');
}

function saveAutomationRule() {
  const name = document.getElementById('auto-rule-name')?.value?.trim();
  if (!name) { showToast('Rule name is required'); return; }

  const editId = document.getElementById('auto-edit-id')?.value;
  const rules = _getAutomationRules();
  const ruleData = {
    id: editId || 'rule_' + Date.now(),
    name,
    trigger: document.getElementById('auto-trigger')?.value || '',
    triggerValue: document.getElementById('auto-trigger-value')?.value?.trim() || '',
    condition: document.getElementById('auto-condition')?.value || '',
    conditionValue: document.getElementById('auto-condition-value')?.value?.trim() || '',
    action: document.getElementById('auto-action')?.value || '',
    actionValue: document.getElementById('auto-action-value')?.value?.trim() || '',
    enabled: true,
    triggeredCount: 0,
  };

  if (editId) {
    const idx = rules.findIndex(r => r.id === editId);
    if (idx >= 0) {
      ruleData.enabled = rules[idx].enabled;
      ruleData.triggeredCount = rules[idx].triggeredCount || 0;
      rules[idx] = ruleData;
    }
  } else {
    rules.push(ruleData);
  }

  _saveAutomationRules(rules);
  document.getElementById('automation-rule-modal')?.classList.remove('active');
  showToast(editId ? 'Rule updated' : 'Rule created');
  renderAutomationsPage();
}

async function deleteAutomationRule(id) {
  if (!await appConfirm('Delete this automation rule?', { title: 'Delete Rule', okLabel: 'Delete', okClass: 'btn-danger' })) return;
  const rules = _getAutomationRules().filter(r => r.id !== id);
  _saveAutomationRules(rules);
  showToast('Rule deleted');
  renderAutomationsPage();
}

function toggleAutomationRule(id) {
  const rules = _getAutomationRules();
  const rule = rules.find(r => r.id === id);
  if (rule) {
    rule.enabled = !rule.enabled;
    _saveAutomationRules(rules);
    showToast(rule.enabled ? 'Rule enabled' : 'Rule disabled');
    renderAutomationsPage();
  }
}

// ─── FAQ / Knowledge Base Page ───

async function renderFaqPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let faqs = [];
  try { faqs = await store.getFaqs(); } catch (e) { console.error('FAQs error:', e); }
  if (!Array.isArray(faqs)) faqs = [];

  const categories = ['all', 'general', 'credentialing', 'billing', 'compliance'];

  body.innerHTML = `
    <style>
      .fq2-card{border-radius:16px;overflow:hidden;}
    </style>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      <input type="text" id="faq-search" placeholder="Search knowledge base..." class="form-control" style="flex:1;min-width:250px;height:40px;font-size:14px;border-radius:12px;" oninput="window.app.filterFaqs()">
      <div style="display:flex;gap:4px;" id="faq-category-tabs">
        ${categories.map(c => `
          <button class="btn btn-sm ${c === 'all' ? 'btn-primary' : ''}" data-cat="${escAttr(c)}" onclick="window.app.filterFaqCategory('${escAttr(c)}')" style="text-transform:capitalize;border-radius:12px;">${escHtml(c)}</button>
        `).join('')}
      </div>
    </div>

    <!-- Knowledge Base (In-App Help) -->
    <div class="card fq2-card" style="margin-bottom:24px;">
      <div class="card-header"><h3>Knowledge Base</h3></div>
      <div class="card-body">
        ${renderKnowledgeBase()}
      </div>
    </div>

    <h3 style="font-size:16px;font-weight:700;color:var(--gray-900);margin-bottom:12px;">Custom FAQs</h3>
    <div id="faq-list">
      ${faqs.length > 0 ? faqs.map((faq, idx) => `
        <div class="card faq-item fq2-card" data-category="${(faq.category || 'general').toLowerCase()}" data-search="${escHtml((faq.question || '').toLowerCase() + ' ' + (faq.answer || '').toLowerCase())}" style="margin-bottom:12px;">
          <div class="card-header" style="cursor:pointer;padding:16px 20px;" onclick="
            const b = document.getElementById('faq-body-${idx}');
            const a = document.getElementById('faq-arrow-${idx}');
            b.style.display = b.style.display === 'none' ? '' : 'none';
            a.style.transform = b.style.display === 'none' ? '' : 'rotate(90deg)';
          ">
            <div style="display:flex;align-items:center;gap:10px;flex:1;">
              <svg id="faq-arrow-${idx}" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="transition:transform 0.2s;flex-shrink:0;"><path d="M4 2l5 4-5 4z"/></svg>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:14px;color:var(--gray-900);">${escHtml(faq.question || 'Untitled')}</div>
              </div>
              <span class="badge badge-${faq.category === 'credentialing' ? 'pending' : faq.category === 'billing' ? 'approved' : faq.category === 'compliance' ? 'denied' : 'inactive'}" style="font-size:11px;">${escHtml(faq.category || 'general')}</span>
            </div>
            <div style="display:flex;gap:4px;margin-left:8px;">
              ${editButton('Edit', `window.app.editFaq(${faq.id})`, 'btn-sm')}
              ${deleteButton('Delete', `window.app.deleteFaqItem(${faq.id})`)}
            </div>
          </div>
          <div id="faq-body-${idx}" style="display:none;padding:0 20px 16px 42px;font-size:14px;color:var(--gray-600);line-height:1.7;">
            ${escHtml(faq.answer || 'No answer provided.')}
            <div style="margin-top:12px;display:flex;gap:12px;align-items:center;">
              <span class="text-sm text-muted">Was this helpful?</span>
              <button class="btn btn-sm" onclick="window.app.rateFaq(${faq.id}, 'yes')" style="font-size:12px;">Yes (${faq.helpfulYes || faq.helpful_yes || 0})</button>
              <button class="btn btn-sm" onclick="window.app.rateFaq(${faq.id}, 'no')" style="font-size:12px;">No (${faq.helpfulNo || faq.helpful_no || 0})</button>
            </div>
          </div>
        </div>
      `).join('') : '<div class="card"><div class="card-body" style="text-align:center;padding:3rem;color:var(--gray-500);">No FAQs yet. Add one to get started.</div></div>'}
    </div>

    <!-- FAQ Modal -->
    <div class="modal-overlay" id="faq-modal">
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h2 id="faq-modal-title">Add FAQ</h2>
          <button class="modal-close" onclick="document.getElementById('faq-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group"><label>Question *</label><input type="text" id="faq-question" class="form-control" data-validate="required"></div>
          <div class="form-group"><label>Answer *</label><textarea id="faq-answer" class="form-control" rows="5" style="resize:vertical;" data-validate="required"></textarea></div>
          <div class="form-group"><label>Category</label>
            <select id="faq-category" class="form-control">
              <option value="general">General</option>
              <option value="credentialing">Credentialing</option>
              <option value="billing">Billing</option>
              <option value="compliance">Compliance</option>
            </select>
          </div>
          <input type="hidden" id="faq-edit-id" value="">
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('faq-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveFaq()">Save FAQ</button>
        </div>
      </div>
    </div>
  `;
}

function renderApiDocsPage() {
  const body = document.getElementById('page-body');
  const baseUrl = CONFIG.API_URL;

  const endpointGroups = [
    {
      name: 'Authentication',
      icon: '&#128274;',
      endpoints: [
        { method: 'POST', path: '/auth/login', desc: 'Authenticate user and obtain JWT token', body: '{ "email": "string", "password": "string" }', response: '{ "token": "string", "user": { ... } }' },
        { method: 'POST', path: '/auth/register', desc: 'Register a new agency account', body: '{ "email": "string", "password": "string", "first_name": "string", "last_name": "string", "agency_name": "string" }', response: '{ "token": "string", "user": { ... } }' },
        { method: 'POST', path: '/auth/logout', desc: 'Invalidate the current session token', body: 'None', response: '{ "message": "Logged out" }' },
        { method: 'GET', path: '/auth/me', desc: 'Get currently authenticated user profile', body: 'N/A', response: '{ "id": "number", "email": "string", "role": "string", ... }' },
      ],
    },
    {
      name: 'Providers',
      icon: '&#128100;',
      endpoints: [
        { method: 'GET', path: '/providers', desc: 'List all providers for the agency', body: 'N/A', response: '{ "data": [{ "id", "firstName", "lastName", "npi", ... }] }' },
        { method: 'POST', path: '/providers', desc: 'Create a new provider', body: '{ "firstName": "string", "lastName": "string", "npi": "string", "credentials": "string", ... }', response: '{ "data": { "id", ... } }' },
        { method: 'GET', path: '/providers/:id', desc: 'Get a single provider by ID', body: 'N/A', response: '{ "data": { ... } }' },
        { method: 'PUT', path: '/providers/:id', desc: 'Update a provider', body: '{ "firstName": "string", ... }', response: '{ "data": { ... } }' },
        { method: 'DELETE', path: '/providers/:id', desc: 'Delete a provider', body: 'N/A', response: '{ "message": "Deleted" }' },
        { method: 'GET', path: '/providers/:id/education', desc: 'Get provider education records', body: 'N/A', response: '{ "data": [{ ... }] }' },
        { method: 'GET', path: '/providers/:id/boards', desc: 'Get provider board certifications', body: 'N/A', response: '{ "data": [{ ... }] }' },
        { method: 'GET', path: '/providers/:id/malpractice', desc: 'Get provider malpractice history', body: 'N/A', response: '{ "data": [{ ... }] }' },
        { method: 'GET', path: '/providers/:id/work-history', desc: 'Get provider work history', body: 'N/A', response: '{ "data": [{ ... }] }' },
        { method: 'GET', path: '/providers/:id/cme', desc: 'Get provider CME credits', body: 'N/A', response: '{ "data": [{ ... }] }' },
        { method: 'GET', path: '/providers/:id/references', desc: 'Get provider professional references', body: 'N/A', response: '{ "data": [{ ... }] }' },
      ],
    },
    {
      name: 'Organizations',
      icon: '&#127963;',
      endpoints: [
        { method: 'GET', path: '/organizations', desc: 'List all organizations', body: 'N/A', response: '{ "data": [{ "id", "name", ... }] }' },
        { method: 'POST', path: '/organizations', desc: 'Create a new organization', body: '{ "name": "string", "npi": "string", ... }', response: '{ "data": { ... } }' },
        { method: 'GET', path: '/organizations/:id', desc: 'Get organization by ID', body: 'N/A', response: '{ "data": { ... } }' },
        { method: 'PUT', path: '/organizations/:id', desc: 'Update an organization', body: '{ "name": "string", ... }', response: '{ "data": { ... } }' },
        { method: 'DELETE', path: '/organizations/:id', desc: 'Delete an organization', body: 'N/A', response: '{ "message": "Deleted" }' },
      ],
    },
    {
      name: 'Applications',
      icon: '&#128203;',
      endpoints: [
        { method: 'GET', path: '/applications', desc: 'List all credentialing applications', body: 'N/A', response: '{ "data": [{ "id", "providerId", "payerId", "status", ... }] }' },
        { method: 'POST', path: '/applications', desc: 'Create a new application', body: '{ "providerId": "number", "payerId": "number", "state": "string", "status": "string", ... }', response: '{ "data": { ... } }' },
        { method: 'GET', path: '/applications/:id', desc: 'Get application by ID', body: 'N/A', response: '{ "data": { ... } }' },
        { method: 'PUT', path: '/applications/:id', desc: 'Update an application', body: '{ "status": "string", ... }', response: '{ "data": { ... } }' },
        { method: 'DELETE', path: '/applications/:id', desc: 'Delete an application', body: 'N/A', response: '{ "message": "Deleted" }' },
        { method: 'POST', path: '/applications/:id/transition', desc: 'Transition application status via workflow', body: '{ "to_status": "string", "notes": "string" }', response: '{ "data": { ... } }' },
        { method: 'GET', path: '/applications/stats', desc: 'Get aggregated application statistics', body: 'N/A', response: '{ "total": "number", "by_status": { ... }, "by_state": { ... } }' },
      ],
    },
    {
      name: 'Licenses',
      icon: '&#128196;',
      endpoints: [
        { method: 'GET', path: '/licenses', desc: 'List all licenses', body: 'N/A', response: '{ "data": [{ "id", "state", "licenseNumber", ... }] }' },
        { method: 'POST', path: '/licenses', desc: 'Create a new license', body: '{ "providerId": "number", "state": "string", "licenseNumber": "string", "expirationDate": "string", ... }', response: '{ "data": { ... } }' },
        { method: 'GET', path: '/licenses/:id', desc: 'Get license by ID', body: 'N/A', response: '{ "data": { ... } }' },
        { method: 'PUT', path: '/licenses/:id', desc: 'Update a license', body: '{ ... }', response: '{ "data": { ... } }' },
        { method: 'DELETE', path: '/licenses/:id', desc: 'Delete a license', body: 'N/A', response: '{ "message": "Deleted" }' },
        { method: 'POST', path: '/licenses/:id/verify', desc: 'Run primary source verification on a license', body: 'N/A', response: '{ "verified": "boolean", "source": "string", "date": "string" }' },
      ],
    },
    {
      name: 'Payers & Plans',
      icon: '&#128179;',
      endpoints: [
        { method: 'GET', path: '/reference/payers', desc: 'Get reference list of all payers', body: 'N/A', response: '{ "data": [{ "id", "name", "states", ... }] }' },
        { method: 'GET', path: '/payer-plans', desc: 'Get payer plans for the agency', body: 'N/A', response: '{ "data": [{ ... }] }' },
      ],
    },
    {
      name: 'Follow-ups',
      icon: '&#9201;',
      endpoints: [
        { method: 'GET', path: '/followups', desc: 'List all follow-ups', body: 'N/A', response: '{ "data": [{ ... }] }' },
        { method: 'POST', path: '/followups', desc: 'Create a follow-up', body: '{ "applicationId": "number", "type": "string", "dueDate": "string", ... }', response: '{ "data": { ... } }' },
        { method: 'PUT', path: '/followups/:id', desc: 'Update a follow-up', body: '{ ... }', response: '{ "data": { ... } }' },
        { method: 'DELETE', path: '/followups/:id', desc: 'Delete a follow-up', body: 'N/A', response: '{ "message": "Deleted" }' },
      ],
    },
    {
      name: 'Tasks',
      icon: '&#9745;',
      endpoints: [
        { method: 'GET', path: '/tasks', desc: 'List all tasks', body: 'N/A', response: '{ "data": [{ ... }] }' },
        { method: 'POST', path: '/tasks', desc: 'Create a task', body: '{ "title": "string", "category": "string", "priority": "string", "dueDate": "string", ... }', response: '{ "data": { ... } }' },
        { method: 'PUT', path: '/tasks/:id', desc: 'Update a task', body: '{ ... }', response: '{ "data": { ... } }' },
        { method: 'DELETE', path: '/tasks/:id', desc: 'Delete a task', body: 'N/A', response: '{ "message": "Deleted" }' },
      ],
    },
    {
      name: 'Activity Logs',
      icon: '&#128221;',
      endpoints: [
        { method: 'GET', path: '/activity-logs', desc: 'List activity logs (optionally filter by application_id)', body: 'N/A', response: '{ "data": [{ ... }] }' },
        { method: 'POST', path: '/activity-logs', desc: 'Create an activity log entry', body: '{ "application_id": "number", "type": "string", "outcome": "string", ... }', response: '{ "data": { ... } }' },
      ],
    },
    {
      name: 'Reference Data',
      icon: '&#128218;',
      endpoints: [
        { method: 'GET', path: '/reference/states', desc: 'List all US states with codes', body: 'N/A', response: '[{ "code": "string", "name": "string" }]' },
        { method: 'GET', path: '/reference/payers', desc: 'List all known payer catalog entries', body: 'N/A', response: '[{ "id", "name", "caqh": "boolean", ... }]' },
        { method: 'GET', path: '/reference/telehealth-policies', desc: 'Telehealth policies by state', body: 'N/A', response: '[{ "state", "policy", ... }]' },
        { method: 'GET', path: '/reference/taxonomy-codes', desc: 'Healthcare taxonomy codes lookup', body: 'N/A', response: '[{ "code", "classification", "specialization" }]' },
      ],
    },
    {
      name: 'Proxy Services',
      icon: '&#128279;',
      endpoints: [
        { method: 'GET', path: '/proxy/nppes/lookup?npi=...', desc: 'Look up a provider by NPI via NPPES', body: 'N/A', response: '{ "results": [{ ... }] }' },
        { method: 'GET', path: '/proxy/nppes/search?name=...', desc: 'Search NPPES by name', body: 'N/A', response: '{ "results": [{ ... }] }' },
        { method: 'POST', path: '/proxy/stedi/eligibility', desc: 'Run insurance eligibility check via Stedi', body: '{ "memberId": "string", "payerId": "string", ... }', response: '{ "eligible": "boolean", ... }' },
        { method: 'POST', path: '/proxy/caqh', desc: 'CAQH ProView API proxy', body: '{ "action": "string", ... }', response: '{ ... }' },
      ],
    },
  ];

  const methodColors = { GET: '#10b981', POST: '#3b82f6', PUT: '#f59e0b', DELETE: '#ef4444', PATCH: '#8b5cf6' };

  body.innerHTML = `
    <style>
      .apidoc-container { max-width:960px; }
      .apidoc-group { margin-bottom:20px; border-radius:16px; overflow:hidden; border:1px solid var(--border-color,#e5e7eb); background:var(--surface-card,#fff); transition:box-shadow 0.18s; }
      .apidoc-group:hover { box-shadow:0 4px 16px rgba(0,0,0,0.06); }
      .apidoc-group-header { display:flex; align-items:center; gap:12px; padding:16px 20px; cursor:pointer; user-select:none; background:var(--surface-card,#fff); transition:background 0.15s; }
      .apidoc-group-header:hover { background:var(--table-row-hover); }
      .apidoc-group-icon { font-size:20px; }
      .apidoc-group-name { font-size:16px; font-weight:700; color:var(--text-primary); flex:1; }
      .apidoc-group-count { font-size:11px; font-weight:600; padding:2px 8px; border-radius:8px; background:var(--brand-100,#cffafe); color:var(--brand-700,#0e7490); }
      .apidoc-group-chevron { transition:transform 0.2s; color:var(--text-quaternary); }
      .apidoc-group.collapsed .apidoc-group-chevron { transform:rotate(-90deg); }
      .apidoc-group.collapsed .apidoc-endpoints { display:none; }
      .apidoc-endpoints { border-top:1px solid var(--border-color,#e5e7eb); }
      .apidoc-endpoint { padding:14px 20px; border-bottom:1px solid var(--border-color-light,#f3f4f6); transition:background 0.1s; }
      .apidoc-endpoint:last-child { border-bottom:none; }
      .apidoc-endpoint:hover { background:var(--table-row-hover); }
      .apidoc-endpoint-header { display:flex; align-items:center; gap:10px; cursor:pointer; }
      .apidoc-method { font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px; color:#fff; min-width:52px; text-align:center; letter-spacing:0.3px; }
      .apidoc-path { font-size:13px; font-weight:600; font-family:'Courier New',monospace; color:var(--text-primary); flex:1; }
      .apidoc-desc { font-size:12px; color:var(--text-tertiary); }
      .apidoc-details { margin-top:12px; padding:12px 14px; background:var(--surface-card,#f9fafb); border-radius:12px; border:1px solid var(--border-color-light,#f3f4f6); display:none; }
      .apidoc-details.open { display:block; }
      .apidoc-detail-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-quaternary); margin-bottom:4px; margin-top:10px; }
      .apidoc-detail-label:first-child { margin-top:0; }
      .apidoc-detail-code { font-size:12px; font-family:'Courier New',monospace; background:#1f2937; color:#e5e7eb; padding:10px 12px; border-radius:8px; overflow-x:auto; white-space:pre-wrap; word-break:break-all; }
      .apidoc-try-btn { font-size:11px; font-weight:600; padding:4px 12px; border-radius:8px; background:var(--surface-card); border:1px solid var(--border-color); color:var(--text-secondary); cursor:pointer; transition:all 0.15s; }
      .apidoc-try-btn:hover { background:var(--brand-100,#cffafe); color:var(--brand-700); border-color:var(--brand-300); }
      .apidoc-base-url { font-size:13px; font-family:'Courier New',monospace; background:#1f2937; color:#e5e7eb; padding:12px 16px; border-radius:12px; margin-bottom:20px; display:flex; align-items:center; gap:10px; }
    </style>
    <div class="apidoc-container">
      <div class="apidoc-base-url">
        <span style="font-size:11px;font-weight:600;color:#9ca3af;">BASE URL</span>
        <span style="color:#67e8f9;">${escHtml(baseUrl)}</span>
      </div>
      ${endpointGroups.map((g, gi) => `
        <div class="apidoc-group" id="apidoc-group-${gi}">
          <div class="apidoc-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="apidoc-group-icon">${g.icon}</span>
            <span class="apidoc-group-name">${escHtml(g.name)}</span>
            <span class="apidoc-group-count">${g.endpoints.length} endpoints</span>
            <svg class="apidoc-group-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
          </div>
          <div class="apidoc-endpoints">
            ${g.endpoints.map((ep, ei) => {
              const detailId = `apidoc-detail-${gi}-${ei}`;
              const curlCmd = `curl -X ${ep.method} '${baseUrl}${ep.path.split('?')[0]}' -H 'Authorization: Bearer YOUR_TOKEN' -H 'Content-Type: application/json'${ep.method !== 'GET' && ep.body !== 'N/A' && ep.body !== 'None' ? " -d '" + ep.body + "'" : ''}`;
              return `
              <div class="apidoc-endpoint">
                <div class="apidoc-endpoint-header" onclick="document.getElementById('${detailId}').classList.toggle('open')">
                  <span class="apidoc-method" style="background:${methodColors[ep.method] || '#6b7280'}">${ep.method}</span>
                  <span class="apidoc-path">${escHtml(ep.path)}</span>
                  <span class="apidoc-desc">${escHtml(ep.desc)}</span>
                </div>
                <div class="apidoc-details" id="${detailId}">
                  <div class="apidoc-detail-label">Request Body</div>
                  <div class="apidoc-detail-code">${escHtml(ep.body)}</div>
                  <div class="apidoc-detail-label">Response</div>
                  <div class="apidoc-detail-code">${escHtml(ep.response)}</div>
                  <div style="margin-top:10px;display:flex;gap:8px;">
                    <button class="apidoc-try-btn" onclick="navigator.clipboard.writeText(this.dataset.curl);showToast('curl command copied to clipboard');" data-curl="${escAttr(curlCmd)}">Copy curl</button>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Notification Settings & Log ───

const NOTIFICATION_TYPES = {
  status_change: { label: 'Status Change', icon: '🔄', color: '#2563eb' },
  expiration_warning: { label: 'Expiration Warning', icon: '⏰', color: '#d97706' },
  document_needed: { label: 'Document Request', icon: '📄', color: '#7c3aed' },
  welcome: { label: 'Welcome', icon: '👋', color: '#059669' },
  milestone: { label: 'Milestone', icon: '🏆', color: '#0891b2' },
  followup_created: { label: 'Follow-up Created', icon: '📅', color: '#dc2626' },
  weekly_summary: { label: 'Weekly Summary', icon: '📊', color: '#6366f1' },
};

async function renderNotificationSettingsPage() {
  const body = document.getElementById('page-body');

  let prefs = {};
  try { prefs = await store.getNotificationPreferences(); } catch { prefs = store._getDefaultNotificationPreferences(); }

  let logs = [];
  try {
    const result = await store.getNotificationLog();
    logs = Array.isArray(result) ? result : (result?.data || []);
  } catch {}

  const sent = logs.filter(l => l.status === 'sent' || l.status === 'delivered').length;
  const failed = logs.filter(l => l.status === 'failed' || l.status === 'bounced').length;

  body.innerHTML = `
    <style>
      .notif-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px;}
      .notif-stat{background:var(--surface-card,#fff);border-radius:16px;padding:18px 16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .notif-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .notif-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;}
      .notif-stat-val{font-size:28px;font-weight:800;line-height:1;}
      .notif-stat-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:6px;}
      .notif-tabs{display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:20px;}
      .notif-tabs .notif-tab{background:none;border:none;padding:10px 18px;font-size:13px;font-weight:600;color:var(--gray-500);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color 0.15s,border-color 0.15s;}
      .notif-tabs .notif-tab:hover{color:var(--gray-700);}
      .notif-tabs .notif-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
      .notif-toggle{position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;}
      .notif-toggle input{opacity:0;width:0;height:0;position:absolute;}
      .notif-toggle .slider{position:absolute;inset:0;background:var(--gray-300);border-radius:12px;transition:0.2s;}
      .notif-toggle .slider::before{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;left:3px;top:3px;transition:0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.15);}
      .notif-toggle input:checked+.slider{background:var(--brand-600,#0891b2);}
      .notif-toggle input:checked+.slider::before{transform:translateX(20px);}
      .notif-pref-row{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--gray-100);}
      .notif-pref-row:last-child{border-bottom:none;}
      .notif-pref-info{flex:1;}
      .notif-pref-title{font-size:14px;font-weight:600;color:var(--gray-800);}
      .notif-pref-desc{font-size:12px;color:var(--gray-500);margin-top:2px;}
      .notif-log-badge{display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;}
    </style>

    <div class="notif-stats">
      <div class="notif-stat"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0891b2,#06b6d4);"></div><div class="notif-stat-val" style="color:var(--brand-600);">${logs.length}</div><div class="notif-stat-lbl">Total Sent</div></div>
      <div class="notif-stat"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#10b981,#34d399);"></div><div class="notif-stat-val" style="color:#10b981;">${sent}</div><div class="notif-stat-lbl">Delivered</div></div>
      <div class="notif-stat"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#ef4444,#f87171);"></div><div class="notif-stat-val" style="color:#ef4444;">${failed}</div><div class="notif-stat-lbl">Failed</div></div>
      <div class="notif-stat"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#8b5cf6,#a78bfa);"></div><div class="notif-stat-val" style="color:#8b5cf6;">${Object.keys(NOTIFICATION_TYPES).length}</div><div class="notif-stat-lbl">Notification Types</div></div>
    </div>

    <div class="notif-tabs">
      <button class="notif-tab active" onclick="window.app.notifTab(this, 'notif-settings')">Settings</button>
      <button class="notif-tab" onclick="window.app.notifTab(this, 'notif-log')">Notification Log</button>
    </div>

    <!-- Settings Tab -->
    <div id="notif-settings">
      <div class="card" style="border-radius:16px;">
        <div class="card-header"><h3>Email Notification Preferences</h3></div>
        <div class="card-body">
          <div style="margin-bottom:20px;">
            <label style="font-size:13px;font-weight:600;color:var(--gray-700);display:block;margin-bottom:6px;">Default Recipient Email</label>
            <input type="email" class="form-control" id="notif-recipient-email" value="${escHtml(prefs.recipientEmail || '')}" placeholder="notifications@yourpractice.com" style="max-width:400px;">
            <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Emails are sent via Resend. Leave blank to use the agency admin email.</div>
          </div>

          <div class="notif-pref-row">
            <div class="notif-pref-info">
              <div class="notif-pref-title">Application Status Changes</div>
              <div class="notif-pref-desc">Send email when an application status changes (submitted, approved, denied, etc.)</div>
            </div>
            <label class="notif-toggle"><input type="checkbox" id="notif-pref-status" ${prefs.statusChanges ? 'checked' : ''}><span class="slider"></span></label>
          </div>

          <div class="notif-pref-row">
            <div class="notif-pref-info">
              <div class="notif-pref-title">License Expiration Warnings</div>
              <div class="notif-pref-desc">Send email before license expiration</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <select class="form-control" id="notif-pref-exp-days" style="width:auto;">
                <option value="0" ${!prefs.licenseExpirationDays ? 'selected' : ''}>Off</option>
                <option value="30" ${prefs.licenseExpirationDays === 30 ? 'selected' : ''}>30 days</option>
                <option value="60" ${prefs.licenseExpirationDays === 60 ? 'selected' : ''}>60 days</option>
                <option value="90" ${prefs.licenseExpirationDays === 90 ? 'selected' : ''}>90 days</option>
              </select>
            </div>
          </div>

          <div class="notif-pref-row">
            <div class="notif-pref-info">
              <div class="notif-pref-title">Document Requests</div>
              <div class="notif-pref-desc">Notify provider when additional documents are needed for their application</div>
            </div>
            <label class="notif-toggle"><input type="checkbox" id="notif-pref-docs" ${prefs.documentRequests ? 'checked' : ''}><span class="slider"></span></label>
          </div>

          <div class="notif-pref-row">
            <div class="notif-pref-info">
              <div class="notif-pref-title">Weekly Summary Digest</div>
              <div class="notif-pref-desc">Send a weekly summary of credentialing activity every Monday morning</div>
            </div>
            <label class="notif-toggle"><input type="checkbox" id="notif-pref-weekly" ${prefs.weeklySummary ? 'checked' : ''}><span class="slider"></span></label>
          </div>

          <div style="margin-top:20px;display:flex;gap:10px;">
            <button class="btn btn-primary" onclick="window.app.saveNotificationPreferences()">Save Preferences</button>
            <button class="btn" onclick="window.app.sendTestNotification()">Send Test Email</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Notification Log Tab -->
    <div id="notif-log" class="hidden">
      <div class="card" style="border-radius:16px;overflow:hidden;">
        <div class="card-header">
          <h3>Notification History</h3>
          <button class="btn btn-sm" onclick="window.app.refreshNotificationLog()">Refresh</button>
        </div>
        <div class="card-body" style="padding:0;">
          <table>
            <thead>
              <tr>
                <th style="width:160px;">Date</th>
                <th style="width:120px;">Type</th>
                <th>Recipient</th>
                <th>Subject</th>
                <th style="width:90px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">No notifications sent yet. Notifications will appear here as they are triggered.</td></tr>' : ''}
              ${logs.slice(0, 100).map(n => {
                const typeInfo = NOTIFICATION_TYPES[n.type] || { label: n.type || 'Unknown', icon: '📧', color: '#6b7280' };
                const statusColor = n.status === 'sent' || n.status === 'delivered' ? '#10b981' : n.status === 'failed' || n.status === 'bounced' ? '#ef4444' : '#6b7280';
                const statusBg = n.status === 'sent' || n.status === 'delivered' ? 'rgba(16,185,129,0.1)' : n.status === 'failed' || n.status === 'bounced' ? 'rgba(239,68,68,0.1)' : 'rgba(107,114,128,0.1)';
                return `<tr>
                  <td>
                    <div style="font-size:12px;">${n.createdAt || n.sentAt ? new Date(n.createdAt || n.sentAt).toLocaleString() : '-'}</div>
                  </td>
                  <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:${typeInfo.color};">${typeInfo.icon} ${escHtml(typeInfo.label)}</span></td>
                  <td style="font-size:12px;">${escHtml(n.recipientEmail || n.recipientName || '-')}</td>
                  <td style="font-size:12px;">${escHtml(n.subject || '-')}</td>
                  <td><span class="notif-log-badge" style="background:${statusBg};color:${statusColor};">${escHtml(n.status || 'pending')}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          ${logs.length > 100 ? `<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-muted);">Showing first 100 of ${logs.length} notifications</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

export {
  renderAuditTrail,
  renderAdminPanel,
  renderOnboardingStub,
  renderImportPage,
  renderAutomationsPage,
  openAutomationRuleModal,
  saveAutomationRule,
  deleteAutomationRule,
  toggleAutomationRule,
  renderFaqPage,
  renderApiDocsPage,
  renderNotificationSettingsPage,
};
