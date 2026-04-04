// ui/pages/tools.js — Lazy-loaded tool render functions
// Auto-extracted from app.js for code splitting

/* Shared helpers & data are exposed on window._credentik by app.js before any
   page module is loaded. Destructure once — all values are stable by nav time. */
const { store, auth, CONFIG, caqhApi, taxonomyApi,
        escHtml, escAttr, formatDateDisplay, toHexId, showToast, getPayerById,
        getStateName, navigateTo, appConfirm, editButton, deleteButton,
        renderPayerTags, getPresetValue, presetSelectHtml, helpTip,
        sortArrow, timeAgo, APPLICATION_STATUSES, PAYER_TAG_DEFS, CRED_DOCUMENTS,
        PAYER_CATALOG, STATES, TELEHEALTH_POLICIES } = window._credentik;

async function renderDocChecklistTool() {
  const payers = PAYER_CATALOG;
  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Document Checklist Generator</h3></div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">
          Select a payer and state to generate the required document checklist for credentialing.
        </p>
        <div class="form-row" style="margin-bottom:20px;">
          <div class="form-group">
            <label>Payer</label>
            <select class="form-control" id="dct-payer">
              <option value="">Select payer...</option>
              ${payers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>State</label>
            <select class="form-control" id="dct-state">
              <option value="">Select state...</option>
              ${STATES.map(s => `<option value="${s.code}">${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn btn-primary" onclick="window.app.generateDocChecklist()">Generate Checklist</button>
        <div id="dct-result" style="margin-top:20px;"></div>
      </div>
    </div>
  `;
}

async function renderFeeScheduleTool() {
  const CPT_CODES = [
    { code: '90791', desc: 'Psychiatric Diagnostic Evaluation', avgRate: 250 },
    { code: '90792', desc: 'Psychiatric Diagnostic Eval w/ Medical', avgRate: 290 },
    { code: '90832', desc: 'Psychotherapy, 30 min', avgRate: 85 },
    { code: '90834', desc: 'Psychotherapy, 45 min', avgRate: 120 },
    { code: '90837', desc: 'Psychotherapy, 60 min', avgRate: 165 },
    { code: '90839', desc: 'Crisis Psychotherapy, first 60 min', avgRate: 200 },
    { code: '90840', desc: 'Crisis Psychotherapy, add-on 30 min', avgRate: 100 },
    { code: '90846', desc: 'Family Therapy w/o Patient', avgRate: 130 },
    { code: '90847', desc: 'Family Therapy w/ Patient', avgRate: 140 },
    { code: '90853', desc: 'Group Psychotherapy', avgRate: 55 },
    { code: '99213', desc: 'E/M Office Visit, Level 3', avgRate: 110 },
    { code: '99214', desc: 'E/M Office Visit, Level 4', avgRate: 155 },
    { code: '99215', desc: 'E/M Office Visit, Level 5', avgRate: 210 },
    { code: '99232', desc: 'Subsequent Hospital Care, Level 2', avgRate: 95 },
    { code: '99243', desc: 'Consultation, Level 3', avgRate: 175 },
  ];

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <style>
      .fs2-card{border-radius:16px;overflow:hidden;}
      .fs2-table{border-radius:16px;overflow:hidden;}
      .fs2-table table tr:hover{background:var(--gray-50);}
    </style>
    <div class="card fs2-card">
      <div class="card-header"><h3>Fee Schedule Calculator</h3></div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">
          Estimate reimbursement rates by CPT code. Rates are approximate national averages.
          Adjust the multiplier to model payer-specific discounts or geographic adjustments.
        </p>
        <div class="form-row" style="margin-bottom:16px;">
          <div class="form-group">
            <label>Payer Multiplier</label>
            <input type="number" class="form-control" id="fee-multiplier" value="1.0" step="0.05" min="0.5" max="2.0"
              onchange="window.app.recalcFees()">
          </div>
          <div class="form-group">
            <label>Sessions / Month</label>
            <input type="number" class="form-control" id="fee-sessions" value="40" min="1" max="200"
              onchange="window.app.recalcFees()">
          </div>
        </div>
      </div>
    </div>
    <div class="table-wrap fs2-table">
      <table>
        <thead>
          <tr><th>CPT Code</th><th>Description</th><th>Base Rate</th><th>Adjusted Rate</th><th>Monthly Est.</th></tr>
        </thead>
        <tbody id="fee-table-body">
          ${CPT_CODES.map(c => {
            const adj = c.avgRate.toFixed(2);
            return `<tr>
              <td><strong>${c.code}</strong></td>
              <td>${c.desc}</td>
              <td>$${c.avgRate.toFixed(2)}</td>
              <td class="fee-adj">$${adj}</td>
              <td class="fee-monthly">$${(c.avgRate * 40).toLocaleString()}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div id="fee-summary" style="margin-top:16px;padding:16px;background:var(--green-bg);border-radius:16px;font-size:14px;font-weight:600;color:#166534;">
      Total Monthly Estimate (all codes at avg mix): $${CPT_CODES.reduce((s, c) => s + c.avgRate, 0).toLocaleString()} per session &times; 40 sessions
    </div>
  `;
  // Store CPT_CODES for recalc
  window._feeScheduleCPT = CPT_CODES;
}

async function renderPayerPortalTool() {
  const payers = PAYER_CATALOG.filter(p => p.credentialingUrl);
  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Payer Portal Directory</h3>
        <input type="text" class="form-control" style="width:240px;" placeholder="Search payers..." id="portal-search"
          oninput="window.app.filterPortals()">
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead>
            <tr><th>Payer</th><th>Category</th><th>Avg Cred Days</th><th>Phone</th><th>Portal</th></tr>
          </thead>
          <tbody id="portal-table-body">
            ${payers.map(p => `<tr data-payer-name="${p.name.toLowerCase()}">
              <td><strong>${p.name}</strong>${p.parentOrg ? `<br><span style="font-size:11px;color:var(--text-muted);">${p.parentOrg}</span>` : ''}</td>
              <td><span class="badge badge-${p.category === 'national' ? 'active' : p.category === 'behavioral' ? 'submitted' : 'pending'}">${p.category}</span></td>
              <td>${p.avgCredDays || '—'} days</td>
              <td style="font-size:12px;">${p.credPhone || '—'}</td>
              <td>${p.credentialingUrl && /^https?:\/\//i.test(p.credentialingUrl) ? `<a href="${escAttr(p.credentialingUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">Open Portal</a>` : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderExpirationAlertsTool() {
  const licenses = store.filterByScope(await store.getAll('licenses'));
  const apps = store.filterByScope(await store.getAll('applications'));
  const now = new Date();
  const alerts = [];

  // License expirations
  licenses.forEach(l => {
    if (!l.expirationDate) return;
    const exp = new Date(l.expirationDate);
    const daysLeft = Math.ceil((exp - now) / 86400000);
    if (daysLeft <= 180) {
      alerts.push({
        type: 'License',
        item: `${l.licenseType || 'License'} — ${getStateName(l.state)}`,
        expires: l.expirationDate,
        daysLeft,
        severity: daysLeft <= 0 ? 'expired' : daysLeft <= 30 ? 'critical' : daysLeft <= 90 ? 'warning' : 'info',
      });
    }
  });

  // Credentialing renewal estimates (apps approved > 10 months ago)
  apps.forEach(a => {
    if (a.status !== 'approved' || !a.submittedDate) return;
    const submitted = new Date(a.submittedDate);
    const estRenewal = new Date(submitted);
    estRenewal.setFullYear(estRenewal.getFullYear() + 1);
    const daysLeft = Math.ceil((estRenewal - now) / 86400000);
    if (daysLeft <= 180) {
      alerts.push({
        type: 'Credential',
        item: `${a.payerName} — ${getStateName(a.state)}`,
        expires: estRenewal.toISOString().split('T')[0],
        daysLeft,
        severity: daysLeft <= 0 ? 'expired' : daysLeft <= 30 ? 'critical' : daysLeft <= 90 ? 'warning' : 'info',
      });
    }
  });

  alerts.sort((a, b) => a.daysLeft - b.daysLeft);

  const sevColor = { expired: 'red', critical: 'red', warning: 'amber', info: 'blue' };
  const sevLabel = { expired: 'EXPIRED', critical: 'Critical', warning: 'Expiring Soon', info: 'Upcoming' };

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <style>
      .ea2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .ea2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .ea2-stat .ea2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .ea2-stat .ea2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .ea2-stat .ea2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .ea2-table{border-radius:16px;overflow:hidden;}
      .ea2-table table tr:hover{background:var(--gray-50);}
      .ea2-sev{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;}
    </style>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;">
      <div class="ea2-stat">
        <div class="ea2-accent" style="background:linear-gradient(90deg,var(--brand-500),var(--brand-700));"></div>
        <div class="ea2-label">Total Alerts</div><div class="ea2-val">${alerts.length}</div>
      </div>
      <div class="ea2-stat">
        <div class="ea2-accent" style="background:linear-gradient(90deg,#ef4444,#f87171);"></div>
        <div class="ea2-label">Expired</div><div class="ea2-val" style="color:#dc2626;">${alerts.filter(a => a.severity === 'expired').length}</div>
      </div>
      <div class="ea2-stat">
        <div class="ea2-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
        <div class="ea2-label">Critical (30d)</div><div class="ea2-val" style="color:#d97706;">${alerts.filter(a => a.severity === 'critical').length}</div>
      </div>
      <div class="ea2-stat">
        <div class="ea2-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="ea2-label">Warning (90d)</div><div class="ea2-val" style="color:#2563eb;">${alerts.filter(a => a.severity === 'warning').length}</div>
      </div>
    </div>
    ${alerts.length === 0 ? '<div class="empty-state" style="border-radius:16px;"><h3>No Upcoming Expirations</h3><p>All licenses and credentials are current for the next 6 months.</p></div>' : `
    <div class="table-wrap ea2-table">
      <table>
        <thead><tr><th>Severity</th><th>Type</th><th>Item</th><th>Expires</th><th>Days Left</th></tr></thead>
        <tbody>
          ${alerts.map(a => {
            const sevColors = { expired: { bg: 'rgba(239,68,68,0.12)', color: '#dc2626' }, critical: { bg: 'rgba(239,68,68,0.12)', color: '#dc2626' }, warning: { bg: 'rgba(245,158,11,0.12)', color: '#d97706' }, info: { bg: 'rgba(59,130,246,0.12)', color: '#2563eb' } };
            const sc = sevColors[a.severity] || sevColors.info;
            return `<tr class="${a.severity === 'expired' ? 'overdue' : ''}">
            <td><span class="ea2-sev" style="background:${sc.bg};color:${sc.color};"><span style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>${sevLabel[a.severity]}</span></td>
            <td>${a.type}</td>
            <td>${a.item}</td>
            <td>${a.expires}</td>
            <td style="font-weight:700;color:var(--${sevColor[a.severity]});">${a.daysLeft <= 0 ? a.daysLeft + 'd overdue' : a.daysLeft + 'd'}</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

async function renderStatusExportTool() {
  const body = document.getElementById('page-body');
  body.innerHTML = `
    <style>.sev2-card{border-radius:16px!important;overflow:hidden;}</style>
    <div class="card sev2-card">
      <div class="card-header"><h3>Status Report Export</h3></div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">
          Generate a formatted status report for stakeholders. Choose the report type and date range.
        </p>
        <div class="form-row" style="margin-bottom:16px;">
          <div class="form-group">
            <label>Report Type</label>
            <select class="form-control" id="export-type">
              <option value="executive">Executive Summary</option>
              <option value="detailed">Detailed Application Status</option>
              <option value="license">License Status Report</option>
              <option value="financial">Revenue Pipeline Report</option>
            </select>
          </div>
          <div class="form-group">
            <label>Format</label>
            <select class="form-control" id="export-format">
              <option value="text">Plain Text</option>
              <option value="csv">CSV</option>
              <option value="html">HTML (printable)</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" onclick="window.app.generateStatusReport()">Generate Report</button>
        <div id="export-result" style="margin-top:20px;"></div>
      </div>
    </div>
  `;
}

async function renderStateLookupTool() {
  const policies = (await store.getAll('telehealth_policies')).length > 0
    ? await store.getAll('telehealth_policies')
    : TELEHEALTH_POLICIES;
  const body = document.getElementById('page-body');
  body.innerHTML = `
    <style>.slv2-card{border-radius:16px!important;overflow:hidden;}.slv2-card table tr:hover{background:var(--gray-50,#f9fafb);}</style>
    <div class="card slv2-card">
      <div class="card-header"><h3>State Licensing Lookup</h3>
        <input type="text" class="form-control" style="width:240px;" placeholder="Search state..." id="state-lookup-search"
          oninput="window.app.filterStateLookup()">
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead>
            <tr><th>State</th><th>Telehealth Parity</th><th>Prescribing</th><th>Compact</th><th>Board Link</th></tr>
          </thead>
          <tbody id="state-lookup-body">
            ${STATES.map(s => {
              const pol = policies.find(p => (p.state || p.stateCode) === s.code);
              return `<tr data-state-name="${s.name.toLowerCase()}" data-state-code="${s.code.toLowerCase()}">
                <td><strong>${s.name}</strong> (${s.code})</td>
                <td>${pol ? (pol.telehealthParity === 'full' ? '<span class="badge badge-active">Full Parity</span>' : pol.telehealthParity === 'partial' ? '<span class="badge badge-pending">Partial</span>' : '<span class="badge badge-inactive">None</span>') : '<span class="badge badge-inactive">Unknown</span>'}</td>
                <td>${pol?.prescribingAllowed !== false ? '<span style="color:var(--green);">&#10003;</span>' : '<span style="color:var(--red);">&#10007;</span>'}</td>
                <td>${pol?.compactState ? '<span class="badge badge-submitted">PSYPACT</span>' : '—'}</td>
                <td><button class="btn btn-sm" onclick="window.app.searchStateBoard('${s.code}', '${s.name}')">Lookup Board</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderDeadlineTimelineTool() {
  const apps = store.filterByScope(await store.getAll('applications'));
  const licenses = store.filterByScope(await store.getAll('licenses'));
  const tasks = store.filterByScope(await store.getAll('tasks')).filter(t => !t.completed && t.dueDate);
  const now = new Date();
  const items = [];

  // Application follow-ups
  apps.forEach(a => {
    if (a.nextFollowup) {
      items.push({ date: a.nextFollowup, label: `Follow-up: ${a.payerName} — ${getStateName(a.state)}`, type: 'followup' });
    }
  });

  // License expirations
  licenses.forEach(l => {
    if (l.expirationDate) {
      items.push({ date: l.expirationDate, label: `License expires: ${l.licenseType} — ${getStateName(l.state)}`, type: 'expiration' });
    }
  });

  // Tasks
  tasks.forEach(t => {
    items.push({ date: t.dueDate, label: `Task: ${t.title}`, type: 'task' });
  });

  items.sort((a, b) => a.date.localeCompare(b.date));

  // Group by month
  const months = {};
  items.forEach(item => {
    const key = item.date.substring(0, 7);
    if (!months[key]) months[key] = [];
    months[key].push(item);
  });

  const typeColor = { followup: 'blue', expiration: 'red', task: 'amber' };
  const typeIcon = { followup: '&#9201;', expiration: '&#9888;', task: '&#9745;' };

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Total Deadlines</div><div class="value">${items.length}</div></div>
      <div class="stat-card"><div class="label">Follow-ups</div><div class="value blue">${items.filter(i => i.type === 'followup').length}</div></div>
      <div class="stat-card"><div class="label">Expirations</div><div class="value red">${items.filter(i => i.type === 'expiration').length}</div></div>
      <div class="stat-card"><div class="label">Tasks</div><div class="value amber">${items.filter(i => i.type === 'task').length}</div></div>
    </div>
    ${items.length === 0 ? '<div class="empty-state"><h3>No Deadlines</h3><p>No upcoming deadlines found.</p></div>' :
    Object.keys(months).sort().map(month => {
      const monthLabel = new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      return `
        <div class="card" style="margin-bottom:12px;">
          <div class="card-header"><h3>${monthLabel}</h3><span class="badge">${months[month].length}</span></div>
          <div class="card-body" style="padding:0;">
            <div class="activity-timeline" style="padding:12px 20px;">
              ${months[month].map(item => {
                const isPast = item.date < now.toISOString().split('T')[0];
                return `<div class="activity-entry" ${isPast ? 'style="opacity:0.5;"' : ''}>
                  <div class="activity-icon" style="background:var(--${typeColor[item.type]}-bg);color:var(--${typeColor[item.type]});">${typeIcon[item.type]}</div>
                  <div class="activity-content">
                    <div class="activity-header">
                      <strong style="font-size:13px;">${item.label}</strong>
                      <span style="font-size:12px;color:var(--text-muted);">${item.date}</span>
                    </div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>`;
    }).join('')}
  `;
}

async function renderLetterGeneratorTool() {

  const LETTER_TYPES = [
    { id: 'cover', label: 'Cover Letter — New Credentialing Application' },
    { id: 'followup', label: 'Follow-up Letter — Application Status Inquiry' },
    { id: 'attestation', label: 'Attestation Statement' },
    { id: 'resignation', label: 'Panel Resignation / Withdrawal Letter' },
    { id: 'address_change', label: 'Address / Practice Change Notification' },
    { id: 'recredentialing', label: 'Re-credentialing Cover Letter' },
    { id: 'appeal', label: 'Appeal Letter — Denial of Credentialing' },
    { id: 'introduction', label: 'Practice Introduction Letter' },
  ];

  const body = document.getElementById('page-body');
  body.innerHTML = `
    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Letter & Form Generator</h3></div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:13px;">
          Generate professional letters and forms pre-filled with your organization and provider details.
        </p>
        <div class="form-row" style="margin-bottom:16px;">
          <div class="form-group">
            <label>Letter Type</label>
            <select class="form-control" id="letter-type">
              ${LETTER_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Payer (recipient)</label>
            <select class="form-control" id="letter-payer">
              <option value="">Select payer...</option>
              ${PAYER_CATALOG.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row" style="margin-bottom:16px;">
          <div class="form-group">
            <label>State</label>
            <select class="form-control" id="letter-state">
              <option value="">Select state...</option>
              ${STATES.map(s => `<option value="${s.code}">${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Additional Notes</label>
            <input type="text" class="form-control" id="letter-notes" placeholder="Optional custom notes...">
          </div>
        </div>
        <button class="btn btn-primary" onclick="window.app.generateLetter()">Generate Letter</button>
        <div id="letter-result" style="margin-top:20px;"></div>
      </div>
    </div>
  `;
}

function renderNPIResultCard(prov) {
  return `
    <div class="card">
      <div class="card-header">
        <h3>${escHtml(prov.prefix ? prov.prefix + ' ' : '')}${escHtml(prov.firstName)} ${escHtml(prov.middleName ? prov.middleName + ' ' : '')}${escHtml(prov.lastName)}${escHtml(prov.suffix ? ', ' + prov.suffix : '')}${escHtml(prov.credential ? ', ' + prov.credential : '')}</h3>
        <span class="badge badge-${prov.status === 'Active' ? 'active' : 'inactive'}">${escHtml(prov.status)}</span>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;">NPI</div>
            <div style="font-size:16px;font-weight:700;color:var(--brand-700);letter-spacing:0.5px;">${escHtml(prov.npi)}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;">Entity Type</div>
            <div style="font-size:14px;font-weight:600;">${prov.entityType === 'individual' ? 'Individual (NPI-1)' : 'Organization (NPI-2)'}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;">Gender</div>
            <div style="font-size:14px;">${escHtml(prov.gender === 'M' ? 'Male' : prov.gender === 'F' ? 'Female' : prov.gender || 'N/A')}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;">Enumeration Date</div>
            <div style="font-size:14px;">${escHtml(prov.enumerationDate || 'N/A')}</div>
          </div>
        </div>

        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-100);">
          <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Taxonomy Code(s)</div>
          ${prov.allTaxonomies.map(t => `
            <div style="display:flex;gap:10px;align-items:center;padding:8px 12px;background:var(--gray-50);border-radius:var(--radius);margin-bottom:4px;">
              <code style="font-weight:700;color:var(--brand-700);font-size:13px;">${escHtml(t.code)}</code>
              <span style="font-size:13px;">${escHtml(t.desc)}</span>
              ${t.primary ? '<span class="badge badge-active" style="font-size:10px;">Primary</span>' : ''}
              ${t.state ? '<span class="text-sm text-muted">' + escHtml(t.state) + '</span>' : ''}
              ${t.license ? '<span class="text-sm text-muted">Lic: ' + escHtml(t.license) + '</span>' : ''}
            </div>
          `).join('')}
        </div>

        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-100);">
          <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Practice Location</div>
          <div style="font-size:14px;">${escHtml(prov.address1)}${prov.address2 ? ', ' + escHtml(prov.address2) : ''}</div>
          <div style="font-size:14px;">${escHtml(prov.city)}, ${escHtml(prov.state)} ${escHtml(prov.zip)}</div>
          ${prov.phone ? `<div style="font-size:13px;color:var(--gray-600);margin-top:4px;">Phone: ${escHtml(prov.phone)}${prov.fax ? ' &middot; Fax: ' + escHtml(prov.fax) : ''}</div>` : ''}
        </div>
      </div>
    </div>`;
}

async function renderTaxonomySearch() {
  const body = document.getElementById('page-body');
  const stateOpts = STATES.map(s => `<option value="${s.code}">${s.name}</option>`).join('');

  body.innerHTML = `
    <style>
      .tx2-card{border-radius:16px;overflow:hidden;}
      .tx2-card table tr:hover{background:var(--gray-50);}
    </style>
    <div class="card tx2-card" style="margin-bottom:20px;">
      <div class="card-body">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
          <div style="flex:2;min-width:200px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Search</label>
            <input type="text" class="form-control" id="tax-search-input" placeholder="NPI number, provider name, taxonomy code, or specialty keyword..." style="font-size:14px;" onkeydown="if(event.key==='Enter')window.app.runTaxonomySearch()">
          </div>
          <div style="min-width:160px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Search Type</label>
            <select class="form-control" id="tax-search-type">
              <option value="codes">Taxonomy Codes</option>
              <option value="npi">NPI Lookup</option>
              <option value="provider">Provider Name</option>
              <option value="specialty">By Specialty (NPPES)</option>
            </select>
          </div>
          <div style="min-width:140px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">State (optional)</label>
            <select class="form-control" id="tax-search-state">
              <option value="">All States</option>
              ${stateOpts}
            </select>
          </div>
          <button class="btn btn-primary" onclick="window.app.runTaxonomySearch()" style="height:40px;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>
            Search
          </button>
        </div>
      </div>
    </div>

    <div id="tax-search-results">
      <div class="alert alert-info" style="margin-bottom:20px;">
        <strong>Search the NPPES NPI Registry and NUCC Taxonomy Codes.</strong><br>
        Use <strong>Taxonomy Codes</strong> to browse behavioral health taxonomy codes locally. Use <strong>NPI Lookup</strong> to look up any provider by their 10-digit NPI. Use <strong>Provider Name</strong> or <strong>By Specialty</strong> to search the live CMS NPPES database.
      </div>

      <div class="card tx2-card">
        <div class="card-header"><h3>Common Behavioral Health Taxonomy Codes</h3></div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap" style="box-shadow:none;border:none;">
            <table>
              <thead><tr><th>Code</th><th>Type</th><th>Specialty</th><th>Classification</th></tr></thead>
              <tbody>
                ${taxonomyApi.TAXONOMY_CODES.slice(0, 20).map(t => `
                  <tr style="cursor:pointer;" onclick="navigator.clipboard.writeText('${escAttr(t.code)}');document.getElementById('toast').textContent='Copied ${escAttr(t.code)}';document.getElementById('toast').classList.add('show');setTimeout(()=>document.getElementById('toast').classList.remove('show'),2000);">
                    <td><code style="font-weight:700;color:var(--brand-700);">${escHtml(t.code)}</code></td>
                    <td>${escHtml(t.type)}</td>
                    <td><strong>${escHtml(t.specialty)}</strong></td>
                    <td class="text-sm text-muted">${escHtml(t.classification)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function renderCaqhManager() {
  const body = document.getElementById('page-body');
  const providers = store.filterByScope(await store.getAll('providers'));
  const configured = caqhApi.isCaqhConfigured();
  const tracking = caqhApi.getCaqhTracking();

  // Build provider rows with local tracking data
  const providerRows = providers.map(p => {
    const t = tracking[p.caqhId] || tracking[p.id] || {};
    const statusColor = {
      'Initial Profile Complete': 'green', 'Re-Attestation': 'amber',
      'Active': 'green', 'Inactive': 'red',
    };
    const attDaysLeft = t.attestationExpires
      ? Math.ceil((new Date(t.attestationExpires) - new Date()) / 86400000)
      : null;
    const attSeverity = attDaysLeft === null ? '' : attDaysLeft <= 0 ? 'red' : attDaysLeft <= 30 ? 'amber' : attDaysLeft <= 90 ? 'blue' : 'green';

    return `<tr>
      <td>
        <strong>${escHtml(p.firstName)} ${escHtml(p.lastName)}</strong>
        <div style="font-size:11px;color:var(--text-muted);">${p.credentials || ''}</div>
      </td>
      <td style="font-family:monospace;font-size:12px;">${p.npi || '<span class="text-muted">—</span>'}</td>
      <td>
        ${p.caqhId
          ? `<span style="font-family:monospace;font-size:12px;">${p.caqhId}</span>`
          : `<button class="btn btn-sm" onclick="window.app.setCaqhId('${p.id}')">Set ID</button>`}
      </td>
      <td>
        ${t.profileStatus
          ? `<span class="badge badge-${statusColor[t.profileStatus] ? 'active' : 'pending'}">${t.profileStatus}</span>`
          : '<span class="text-muted text-sm">Not checked</span>'}
      </td>
      <td>
        ${t.rosterStatus
          ? `<span class="badge badge-${t.rosterStatus === 'Active' ? 'active' : 'pending'}">${t.rosterStatus}</span>`
          : '<span class="text-muted text-sm">—</span>'}
      </td>
      <td>
        ${t.attestationExpires
          ? `<div style="font-size:12px;${attSeverity === 'red' ? 'color:var(--red);font-weight:700;' : ''}">${t.attestationExpires}</div>
             <div style="font-size:10px;color:var(--${attSeverity});">${attDaysLeft <= 0 ? Math.abs(attDaysLeft) + 'd overdue' : attDaysLeft + 'd left'}</div>`
          : '<span class="text-muted text-sm">—</span>'}
      </td>
      <td style="font-size:11px;color:var(--text-muted);">
        ${t.lastChecked ? new Date(t.lastChecked).toLocaleDateString() : 'Never'}
      </td>
      <td>
        <div style="display:flex;gap:4px;">
          ${p.caqhId ? `
            <button class="btn btn-sm" onclick="window.app.checkCaqhStatus('${p.id}')" title="Check status">&#8635;</button>
            <button class="btn btn-sm" onclick="window.app.viewCaqhProfile('${p.id}')" title="View profile">&#128065;</button>
          ` : ''}
        </div>
      </td>
    </tr>`;
  });

  const attestationTabHtml = await renderCaqhAttestationTab(providers, tracking);
  const payerMapHtml = await renderCaqhPayerMap();

  body.innerHTML = `
    ${!configured ? `
      <div class="alert alert-warning">
        <strong>CAQH API not configured.</strong>
        Go to <a href="#" onclick="window.app.navigateTo('settings');return false;" style="font-weight:700;">Settings</a> &gt; CAQH tab to enter your organization ID and API credentials.
        You can still track CAQH data manually below.
      </div>
    ` : ''}

    <div class="tabs">
      <button class="tab active" onclick="window.app.caqhTab(this, 'caqh-roster')">Provider Roster</button>
      <button class="tab" onclick="window.app.caqhTab(this, 'caqh-attestation')">Attestation Tracker</button>
      <button class="tab" onclick="window.app.caqhTab(this, 'caqh-payer-map')">Payer → CAQH Map</button>
    </div>

    <!-- Provider Roster Tab -->
    <div id="caqh-roster">
      <style>
        .cq2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
        .cq2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
        .cq2-stat .cq2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
        .cq2-stat .cq2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
        .cq2-stat .cq2-val{font-size:28px;font-weight:800;line-height:1.1;}
        .cq2-card{border-radius:16px;overflow:hidden;}
        .cq2-card table tr:hover{background:var(--gray-50);}
      </style>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;">
        <div class="cq2-stat">
          <div class="cq2-accent" style="background:linear-gradient(90deg,var(--brand-500),var(--brand-700));"></div>
          <div class="cq2-label">Total Providers</div>
          <div class="cq2-val">${providers.length}</div>
        </div>
        <div class="cq2-stat">
          <div class="cq2-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
          <div class="cq2-label">CAQH ID Assigned</div>
          <div class="cq2-val" style="color:#2563eb;">${providers.filter(p => p.caqhId).length}</div>
        </div>
        <div class="cq2-stat">
          <div class="cq2-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
          <div class="cq2-label">Profile Complete</div>
          <div class="cq2-val" style="color:#16a34a;">${Object.values(tracking).filter(t => t.profileStatus === 'Initial Profile Complete' || t.profileStatus === 'Active').length}</div>
        </div>
        <div class="cq2-stat">
          <div class="cq2-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
          <div class="cq2-label">Attestation Due</div>
          <div class="cq2-val" style="color:#d97706;">${Object.values(tracking).filter(t => {
            if (!t.attestationExpires) return false;
            return Math.ceil((new Date(t.attestationExpires) - new Date()) / 86400000) <= 30;
          }).length}</div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px;">
        ${configured ? `<button class="btn btn-primary" onclick="window.app.runBatchCaqhCheck()">&#8635; Check All Providers</button>` : ''}
        <button class="btn" onclick="window.app.manualCaqhEntry()">+ Manual Entry</button>
      </div>

      <div class="table-wrap cq2-card">
        <table>
          <thead>
            <tr>
              <th>Provider</th><th>NPI</th><th>CAQH ID</th><th>Profile Status</th>
              <th>Roster</th><th>Attestation Exp</th><th>Last Check</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="caqh-roster-body">
            ${providerRows.join('')}
          </tbody>
        </table>
      </div>
      <div id="caqh-status-log" style="margin-top:16px;"></div>
    </div>

    <!-- Attestation Tracker Tab -->
    <div id="caqh-attestation" class="hidden">
      ${attestationTabHtml}
    </div>

    <!-- Payer → CAQH Map Tab -->
    <div id="caqh-payer-map" class="hidden">
      ${payerMapHtml}
    </div>
  `;
}

async function renderCaqhAttestationTab(providers, tracking) {
  const now = new Date();
  const entries = providers
    .filter(p => p.caqhId)
    .map(p => {
      const t = tracking[p.caqhId] || tracking[p.id] || {};
      return { ...p, ...t };
    })
    .sort((a, b) => {
      if (!a.attestationExpires) return 1;
      if (!b.attestationExpires) return -1;
      return a.attestationExpires.localeCompare(b.attestationExpires);
    });

  if (entries.length === 0) {
    return `<div class="empty-state"><h3>No CAQH Profiles Tracked</h3>
      <p>Assign CAQH IDs to providers in the Roster tab, then check their status.</p></div>`;
  }

  return `
    <style>.caqhv2-card{border-radius:16px!important;overflow:hidden;}.caqhv2-card table tr:hover{background:var(--gray-50,#f9fafb);}</style>
    <div class="alert alert-info" style="margin-bottom:16px;">
      CAQH requires attestation every <strong>120 days</strong>. Providers with expired attestations
      will be deactivated and payers cannot pull their data for credentialing.
    </div>
    <div class="table-wrap caqhv2-card">
      <table>
        <thead><tr><th>Provider</th><th>CAQH ID</th><th>Last Attested</th><th>Expires</th><th>Days Left</th><th>Status</th></tr></thead>
        <tbody>
          ${entries.map(e => {
            const daysLeft = e.attestationExpires
              ? Math.ceil((new Date(e.attestationExpires) - now) / 86400000) : null;
            const severity = daysLeft === null ? 'inactive' :
              daysLeft <= 0 ? 'denied' : daysLeft <= 30 ? 'pending' : daysLeft <= 60 ? 'submitted' : 'active';
            return `<tr class="${daysLeft !== null && daysLeft <= 0 ? 'overdue' : ''}">
              <td><strong>${escHtml(e.firstName)} ${escHtml(e.lastName)}</strong></td>
              <td style="font-family:monospace;">${e.caqhId || '—'}</td>
              <td>${formatDateDisplay(e.attestationDate)}</td>
              <td>${e.attestationExpires || '—'}</td>
              <td style="font-weight:700;">${daysLeft !== null ? (daysLeft <= 0 ? daysLeft + 'd' : daysLeft + 'd') : '—'}</td>
              <td><span class="badge badge-${severity}">${
                daysLeft === null ? 'Unknown' :
                daysLeft <= 0 ? 'EXPIRED' :
                daysLeft <= 30 ? 'Due Soon' :
                daysLeft <= 60 ? 'Upcoming' : 'Current'
              }</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px;">
      <h4 style="font-size:14px;color:var(--gray-900);margin-bottom:8px;">Attestation Checklist</h4>
      <div style="font-size:13px;color:var(--text);line-height:1.8;">
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Review all practice locations are current</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Verify all state licenses are up to date</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Confirm malpractice insurance is current</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Update any new hospital affiliations</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Review disclosure questions (malpractice, sanctions, etc.)</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox"> Electronically sign and submit attestation</label>
      </div>
    </div>
  `;
}

async function renderCaqhPayerMap() {
  const caqhPayers = PAYER_CATALOG.filter(p => p.notes && p.notes.toLowerCase().includes('caqh'));
  const nonCaqhPayers = PAYER_CATALOG.filter(p => !p.notes || !p.notes.toLowerCase().includes('caqh'));

  return `
    <div class="alert alert-info" style="margin-bottom:16px;">
      <strong>${caqhPayers.length} of ${PAYER_CATALOG.length} payers</strong> use CAQH ProView for credentialing.
      Keeping your CAQH profile current automatically satisfies credentialing data requirements for these payers.
    </div>
    <style>.cpm-card{border-radius:16px!important;overflow:hidden;}</style>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card cpm-card">
        <div class="card-header">
          <h3 style="color:var(--green);">&#10003; Uses CAQH ProView (${caqhPayers.length})</h3>
        </div>
        <div class="card-body" style="padding:0;max-height:400px;overflow-y:auto;">
          ${caqhPayers.map(p => `
            <div style="padding:8px 16px;border-bottom:1px solid var(--border);font-size:13px;">
              <strong>${p.name}</strong>
              <div style="font-size:11px;color:var(--text-muted);">${p.notes || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card cpm-card">
        <div class="card-header">
          <h3 style="color:var(--text-muted);">Direct Application Required (${nonCaqhPayers.length})</h3>
        </div>
        <div class="card-body" style="padding:0;max-height:400px;overflow-y:auto;">
          ${nonCaqhPayers.map(p => `
            <div style="padding:8px 16px;border-bottom:1px solid var(--border);font-size:13px;">
              <strong>${p.name}</strong>
              <div style="font-size:11px;color:var(--text-muted);">${p.notes || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

export {
  renderDocChecklistTool,
  renderFeeScheduleTool,
  renderPayerPortalTool,
  renderExpirationAlertsTool,
  renderStatusExportTool,
  renderStateLookupTool,
  renderDeadlineTimelineTool,
  renderLetterGeneratorTool,
  renderNPIResultCard,
  renderTaxonomySearch,
  renderCaqhManager,
  renderCaqhAttestationTab,
  renderCaqhPayerMap,
};
