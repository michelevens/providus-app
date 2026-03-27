// ui/pages/rcm-phase2.js — Phase 2 RCM tabs
// Fee Schedules, Eligibility, Patient Statements, ERA Import, Client Reports

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay,
        showToast, navigateTo, appConfirm } = window._credentik;

function _fm(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _fk(n) { n = Number(n || 0); return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : _fm(n); }

// ═══════════════════════════════════════════════════
// FEE SCHEDULES TAB
// ═══════════════════════════════════════════════════
async function renderFeeSchedulesTab(body) {
  let schedules = [];
  try { schedules = await store.getFeeSchedules(); } catch (e) {}
  if (!Array.isArray(schedules)) schedules = [];
  window._feeSchedules = schedules;

  const byPayer = {};
  schedules.forEach(s => { byPayer[s.payer_name] = (byPayer[s.payer_name] || 0) + 1; });

  body.innerHTML = `
    <div class="card rcm-card rcm-table">
      <div class="card-header"><h3>Fee Schedules (${schedules.length})</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-primary" onclick="window.app.openFeeScheduleModal()">+ Add Rate</button>
          <button class="btn btn-sm" onclick="window.app.importFeeScheduleCSV()">Import CSV</button>
        </div>
      </div>
      ${Object.keys(byPayer).length > 0 ? `<div style="padding:12px 18px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--gray-100);">
        ${Object.entries(byPayer).map(([p, c]) => `<span style="padding:4px 10px;background:var(--gray-100);border-radius:6px;font-size:12px;font-weight:500;">${escHtml(p)} <strong>(${c})</strong></span>`).join('')}
      </div>` : ''}
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr><th>Payer</th><th>CPT</th><th>Description</th><th>Modifier</th><th style="text-align:right;">Contracted Rate</th><th style="text-align:right;">Expected Allowed</th><th>Plan Type</th><th>Effective</th><th>Actions</th></tr></thead>
        <tbody>
          ${schedules.map(s => `<tr>
            <td class="text-sm" style="font-weight:600;">${escHtml(s.payer_name || s.payerName || '')}</td>
            <td style="font-family:monospace;font-weight:600;">${escHtml(s.cpt_code || s.cptCode || '')}</td>
            <td class="text-sm">${escHtml(s.cpt_description || s.cptDescription || '')}</td>
            <td class="text-sm">${escHtml(s.modifier || '—')}</td>
            <td style="text-align:right;font-weight:700;color:var(--green);">${_fm(s.contracted_rate || s.contractedRate)}</td>
            <td style="text-align:right;">${_fm(s.expected_allowed || s.expectedAllowed)}</td>
            <td><span style="font-size:11px;padding:2px 6px;background:var(--gray-100);border-radius:4px;">${escHtml(s.plan_type || s.planType || '—')}</span></td>
            <td class="text-sm">${formatDateDisplay(s.effective_date || s.effectiveDate) || '—'}</td>
            <td>
              <button class="btn btn-sm" onclick="window.app.editFeeSchedule(${s.id})">Edit</button>
              <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteFeeSchedule(${s.id})">Del</button>
            </td>
          </tr>`).join('')}
          ${schedules.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No fee schedules yet. Add contracted rates to enable underpayment detection.</td></tr>' : ''}
        </tbody>
      </table></div></div>
    </div>
    ${schedules.length > 0 ? `<div style="margin-top:12px;text-align:right;">
      <button class="btn btn-sm" onclick="window.app.runUnderpaymentDetection()" style="color:#8b5cf6;">Run Underpayment Detection</button>
    </div>` : ''}
  `;
}

// ═══════════════════════════════════════════════════
// ELIGIBILITY TAB
// ═══════════════════════════════════════════════════
async function renderEligibilityTab(body) {
  let checks = [];
  try { checks = await store.getEligibilityChecks(); } catch (e) {}
  if (!Array.isArray(checks)) checks = [];

  body.innerHTML = `
    <div class="card rcm-card">
      <div class="card-header"><h3>Eligibility Verification</h3>
        <button class="btn btn-sm btn-primary" onclick="window.app.openEligibilityModal()">+ Check Eligibility</button>
      </div>
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr><th>Patient</th><th>Payer</th><th>Member ID</th><th>Status</th><th>Plan</th><th>Copay</th><th>Deductible</th><th>Ded Met</th><th>Checked</th></tr></thead>
        <tbody>
          ${checks.map(c => {
            const statusColors = { active: 'var(--green)', inactive: 'var(--red)', pending: '#f59e0b', error: 'var(--red)' };
            return `<tr>
              <td style="font-weight:600;">${escHtml(c.patient_name || c.patientName || '')}</td>
              <td class="text-sm">${escHtml(c.payer_name || c.payerName || '')}</td>
              <td style="font-family:monospace;font-size:11px;">${escHtml(c.member_id || c.memberId || '—')}</td>
              <td><span style="font-size:11px;font-weight:700;color:${statusColors[c.status] || 'var(--gray-500)'};">${(c.status || 'pending').toUpperCase()}</span></td>
              <td class="text-sm">${escHtml(c.plan_name || c.planName || '—')}</td>
              <td>${c.copay ? _fm(c.copay) : '—'}</td>
              <td>${c.deductible ? _fm(c.deductible) : '—'}</td>
              <td>${c.deductible_met != null ? _fm(c.deductible_met || c.deductibleMet) : '—'}</td>
              <td class="text-sm">${formatDateDisplay(c.created_at || c.createdAt) || '—'}</td>
            </tr>`;
          }).join('')}
          ${checks.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No eligibility checks yet. Verify patient insurance before appointments.</td></tr>' : ''}
        </tbody>
      </table></div></div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════
// PATIENT STATEMENTS TAB
// ═══════════════════════════════════════════════════
async function renderStatementsTab(body) {
  let statements = [];
  try { statements = await store.getPatientStatements(); } catch (e) {}
  if (!Array.isArray(statements)) statements = [];

  const totalOwed = statements.filter(s => !['paid', 'written_off'].includes(s.status)).reduce((sum, s) => sum + Number(s.patient_balance || s.patientBalance || 0), 0);

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
      <div class="rcm-stat"><div class="rcm-label">Total Statements</div><div class="rcm-val" style="color:#3b82f6;">${statements.length}</div></div>
      <div class="rcm-stat"><div class="rcm-label">Outstanding</div><div class="rcm-val" style="color:var(--red);">${_fk(totalOwed)}</div></div>
      <div class="rcm-stat"><div class="rcm-label">Sent</div><div class="rcm-val" style="color:#f59e0b;">${statements.filter(s => s.status === 'sent').length}</div></div>
      <div class="rcm-stat"><div class="rcm-label">Paid</div><div class="rcm-val" style="color:var(--green);">${statements.filter(s => s.status === 'paid').length}</div></div>
    </div>
    <div class="card rcm-card rcm-table">
      <div class="card-header"><h3>Patient Statements</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-primary" onclick="window.app.autoGenerateStatements()">Auto-Generate</button>
          <button class="btn btn-sm" onclick="window.app.openStatementModal()">+ Manual Statement</button>
        </div>
      </div>
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr><th>Patient</th><th style="text-align:right;">Charges</th><th style="text-align:right;">Insurance Paid</th><th style="text-align:right;">Adjustments</th><th style="text-align:right;">Patient Balance</th><th style="text-align:right;">Paid</th><th>Status</th><th>Due Date</th><th>Sent</th><th>Actions</th></tr></thead>
        <tbody>
          ${statements.map(s => {
            const statusColors = { draft: 'var(--gray-500)', sent: '#f59e0b', partial_paid: '#3b82f6', paid: 'var(--green)', collections: 'var(--red)', written_off: 'var(--gray-400)' };
            const dueDate = s.due_date || s.dueDate || '';
            const isOverdue = dueDate && new Date(dueDate) < new Date() && !['paid', 'written_off'].includes(s.status);
            return `<tr style="${isOverdue ? 'background:#fef2f2;' : ''}">
              <td style="font-weight:600;">${escHtml(s.patient_name || s.patientName || '')}</td>
              <td style="text-align:right;">${_fm(s.total_charges || s.totalCharges)}</td>
              <td style="text-align:right;color:var(--green);">${_fm(s.insurance_paid || s.insurancePaid)}</td>
              <td style="text-align:right;">${_fm(s.adjustments)}</td>
              <td style="text-align:right;color:var(--red);font-weight:700;">${_fm(s.patient_balance || s.patientBalance)}</td>
              <td style="text-align:right;color:var(--green);">${_fm(s.amount_paid || s.amountPaid)}</td>
              <td><span style="font-size:11px;font-weight:600;color:${statusColors[s.status] || 'var(--gray-500)'};">${(s.status || 'draft').replace('_', ' ').toUpperCase()}</span></td>
              <td class="text-sm" style="${isOverdue ? 'color:var(--red);font-weight:700;' : ''}">${dueDate ? formatDateDisplay(dueDate) : '—'}${isOverdue ? ' !' : ''}</td>
              <td class="text-sm">${s.times_sent || s.timesSent || 0}x</td>
              <td><button class="btn btn-sm" onclick="window.app.editStatement(${s.id})">Edit</button></td>
            </tr>`;
          }).join('')}
          ${statements.length === 0 ? '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--gray-500);">No patient statements. Click "Auto-Generate" to create statements from claims with patient responsibility.</td></tr>' : ''}
        </tbody>
      </table></div></div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════
// CLIENT REPORTS (for Financials tab enhancement)
// ═══════════════════════════════════════════════════
async function renderClientReportsSection() {
  let reports = [];
  try { reports = await store.getClientReports(); } catch (e) {}
  if (!Array.isArray(reports)) reports = [];

  return `
    <div class="card rcm-card rcm-table" style="margin-top:16px;">
      <div class="card-header"><h3>Client Reports (${reports.length})</h3>
        <button class="btn btn-sm btn-primary" onclick="window.app.openGenerateReportModal()">Generate Report</button>
      </div>
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr><th>Client</th><th>Period</th><th>Claims</th><th style="text-align:right;">Charged</th><th style="text-align:right;">Collected</th><th>Collection Rate</th><th>Denial Rate</th><th>Avg Days to Pay</th><th>Status</th></tr></thead>
        <tbody>
          ${reports.map(r => {
            const client = r.billing_client || r.billingClient || {};
            return `<tr>
              <td style="font-weight:600;">${escHtml(client.organization_name || client.organizationName || '—')}</td>
              <td>${escHtml(r.period || '')}</td>
              <td>${r.total_claims || r.totalClaims || 0}</td>
              <td style="text-align:right;">${_fk(r.total_charged || r.totalCharged)}</td>
              <td style="text-align:right;color:var(--green);font-weight:600;">${_fk(r.total_collected || r.totalCollected)}</td>
              <td style="font-weight:600;color:${(r.collection_rate || r.collectionRate || 0) > 90 ? 'var(--green)' : '#f59e0b'};">${r.collection_rate || r.collectionRate || 0}%</td>
              <td style="color:${(r.denial_rate || r.denialRate || 0) > 10 ? 'var(--red)' : 'var(--green)'};">${r.denial_rate || r.denialRate || 0}%</td>
              <td>${r.avg_days_to_pay || r.avgDaysToPay || '—'}d</td>
              <td><span style="font-size:11px;font-weight:600;color:${r.status === 'sent' ? 'var(--green)' : 'var(--gray-500)'};">${(r.status || 'draft').toUpperCase()}</span></td>
            </tr>`;
          }).join('')}
          ${reports.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No reports generated yet.</td></tr>' : ''}
        </tbody>
      </table></div></div>
    </div>
  `;
}

export { renderFeeSchedulesTab, renderEligibilityTab, renderStatementsTab, renderClientReportsSection };
