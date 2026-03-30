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

  // Get field values (handle both snake_case and camelCase)
  const _payer = s => s.payer_name || s.payerName || '';
  const _cpt = s => s.cpt_code || s.cptCode || '';
  const _desc = s => s.cpt_description || s.cptDescription || '';
  const _planType = s => s.plan_type || s.planType || '';

  // Build filter options
  const payers = [...new Set(schedules.map(_payer).filter(Boolean))].sort();
  const planTypes = [...new Set(schedules.map(_planType).filter(Boolean))].sort();

  // Apply current filters
  const fPayer = window._fsFilterPayer || '';
  const fPlan = window._fsFilterPlan || '';
  const fSearch = (window._fsFilterSearch || '').toLowerCase();
  const filtered = schedules.filter(s => {
    if (fPayer && _payer(s) !== fPayer) return false;
    if (fPlan && _planType(s) !== fPlan) return false;
    if (fSearch && !_cpt(s).toLowerCase().includes(fSearch) && !_desc(s).toLowerCase().includes(fSearch) && !_payer(s).toLowerCase().includes(fSearch)) return false;
    return true;
  });

  const byPayer = {};
  filtered.forEach(s => { const p = _payer(s) || 'Unknown'; byPayer[p] = (byPayer[p] || 0) + 1; });

  body.innerHTML = `
    <div class="card rcm-card rcm-table">
      <div class="card-header"><h3>Fee Schedules (${filtered.length}${filtered.length !== schedules.length ? ' of ' + schedules.length : ''})</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-primary" onclick="window.app.openFeeScheduleModal()">+ Add Rate</button>
          <button class="btn btn-sm" onclick="window.app.importFeeScheduleCSV()">Import CSV</button>
        </div>
      </div>
      <!-- Filters -->
      <div style="padding:12px 18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--gray-100);">
        <select class="form-control" style="height:32px;font-size:12px;width:200px;" onchange="window._fsFilterPayer=this.value;window.app.rcSwitchTab('fee-schedules');">
          <option value="">All Payers</option>
          ${payers.map(p => `<option value="${escAttr(p)}" ${fPayer === p ? 'selected' : ''}>${escHtml(p)}</option>`).join('')}
        </select>
        <select class="form-control" style="height:32px;font-size:12px;width:140px;" onchange="window._fsFilterPlan=this.value;window.app.rcSwitchTab('fee-schedules');">
          <option value="">All Plan Types</option>
          ${planTypes.map(p => `<option value="${escAttr(p)}" ${fPlan === p ? 'selected' : ''}>${escHtml(p)}</option>`).join('')}
        </select>
        <input type="text" class="form-control" placeholder="Search CPT or description..." value="${escAttr(fSearch)}" style="height:32px;font-size:12px;width:220px;" onkeyup="window._fsFilterSearch=this.value;clearTimeout(window._fsSearchTimer);window._fsSearchTimer=setTimeout(()=>window.app.rcSwitchTab('fee-schedules'),300);">
        ${fPayer || fPlan || fSearch ? `<button class="btn btn-sm" onclick="window._fsFilterPayer='';window._fsFilterPlan='';window._fsFilterSearch='';window.app.rcSwitchTab('fee-schedules');" style="font-size:11px;color:var(--red);">Clear Filters</button>` : ''}
      </div>
      <!-- Payer badges -->
      ${Object.keys(byPayer).length > 0 ? `<div style="padding:10px 18px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--gray-100);">
        ${Object.entries(byPayer).sort((a,b) => b[1] - a[1]).map(([p, c]) => `<span style="padding:3px 8px;background:${fPayer === p ? 'var(--brand-600)' : 'var(--gray-100)'};color:${fPayer === p ? 'white' : 'inherit'};border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;" onclick="window._fsFilterPayer=window._fsFilterPayer==='${escAttr(p)}'?'':'${escAttr(p)}';window.app.rcSwitchTab('fee-schedules');">${escHtml(p)} <strong>(${c})</strong></span>`).join('')}
      </div>` : ''}
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr><th>Payer</th><th>CPT</th><th>Description</th><th>Modifier</th><th style="text-align:right;">Contracted Rate</th><th style="text-align:right;">Expected Allowed</th><th>Plan Type</th><th>Effective</th><th>Actions</th></tr></thead>
        <tbody>
          ${filtered.map(s => `<tr>
            <td class="text-sm" style="font-weight:600;">${escHtml(_payer(s))}</td>
            <td style="font-family:monospace;font-weight:600;">${escHtml(_cpt(s))}</td>
            <td class="text-sm">${escHtml(_desc(s))}</td>
            <td class="text-sm">${escHtml(s.modifier || '—')}</td>
            <td style="text-align:right;font-weight:700;color:var(--green);">${_fm(s.contracted_rate || s.contractedRate)}</td>
            <td style="text-align:right;">${_fm(s.expected_allowed || s.expectedAllowed)}</td>
            <td><span style="font-size:11px;padding:2px 6px;background:var(--gray-100);border-radius:4px;">${escHtml(_planType(s) || '—')}</span></td>
            <td class="text-sm">${formatDateDisplay(s.effective_date || s.effectiveDate) || '—'}</td>
            <td>
              <button class="btn btn-sm" onclick="window.app.editFeeSchedule(${s.id})">Edit</button>
              <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteFeeSchedule(${s.id})">Del</button>
            </td>
          </tr>`).join('')}
          ${filtered.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No fee schedules match the current filters.</td></tr>' : ''}
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
          <input type="text" id="stmt-filter-name" class="form-control" style="width:180px;height:34px;font-size:13px;" placeholder="Filter by patient..." oninput="window.app.filterStatements()">
          <select id="stmt-filter-status" class="form-control" style="width:130px;height:34px;font-size:13px;" onchange="window.app.filterStatements()">
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partial_paid">Partial</option>
            <option value="paid">Paid</option>
            <option value="collections">Collections</option>
            <option value="written_off">Written Off</option>
          </select>
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
            return `<tr class="stmt-row" data-patient="${escAttr((s.patient_name || s.patientName || '').toLowerCase())}" data-status="${s.status || 'draft'}" style="${isOverdue ? 'background:#fef2f2;' : ''}">
              <td style="font-weight:600;">${escHtml(s.patient_name || s.patientName || '')}</td>
              <td style="text-align:right;">${_fm(s.total_charges || s.totalCharges)}</td>
              <td style="text-align:right;color:var(--green);">${_fm(s.insurance_paid || s.insurancePaid)}</td>
              <td style="text-align:right;">${_fm(s.adjustments)}</td>
              <td style="text-align:right;color:var(--red);font-weight:700;">${_fm(s.patient_balance || s.patientBalance)}</td>
              <td style="text-align:right;color:var(--green);">${_fm(s.amount_paid || s.amountPaid)}</td>
              <td><span style="font-size:11px;font-weight:600;color:${statusColors[s.status] || 'var(--gray-500)'};">${(s.status || 'draft').replace('_', ' ').toUpperCase()}</span></td>
              <td class="text-sm" style="${isOverdue ? 'color:var(--red);font-weight:700;' : ''}">${dueDate ? formatDateDisplay(dueDate) : '—'}${isOverdue ? ' !' : ''}</td>
              <td class="text-sm">${s.times_sent || s.timesSent || 0}x</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-sm" onclick="window.app.printStatement(${s.id})" style="font-size:11px;">Print</button>
                ${s.status === 'draft' ? `<button class="btn btn-sm" onclick="window.app.markStatementSent(${s.id})" style="font-size:11px;">Send</button>` : ''}
                ${['sent','partial_paid'].includes(s.status) ? `<button class="btn btn-sm" onclick="window.app.markStatementPaid(${s.id})" style="font-size:11px;color:var(--green);">Paid</button>` : ''}
                <button class="btn btn-sm" onclick="window.app.editStatement(${s.id})" style="font-size:11px;">Edit</button>
                <button class="btn btn-sm" onclick="window.app.deleteStatement(${s.id})" style="font-size:11px;color:var(--red);">Del</button>
              </td>
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

// ═══════════════════════════════════════════════════
// PAYER INTELLIGENCE TAB
// ═══════════════════════════════════════════════════
async function renderPayerIntelligenceTab(body) {
  let rules = [], denialRisk = {};
  try { rules = await store.getPayerRules(); } catch (e) {}
  try { denialRisk = await store.getDenialRiskAnalysis(); } catch (e) {}
  if (!Array.isArray(rules)) rules = [];
  const payerRates = denialRisk.payer_denial_rates || denialRisk.payerDenialRates || [];

  body.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:16px;justify-content:flex-end;">
      <button class="btn btn-sm btn-primary" onclick="window.app.openPayerRuleModal()">+ Add Payer</button>
      <button class="btn btn-sm" onclick="window.app.openPolicyExtractModal()" style="color:#8b5cf6;">AI Extract Policy</button>
      <button class="btn btn-sm" onclick="window.app.runDuplicateDetection()">Check Duplicates</button>
      <button class="btn btn-sm" onclick="window.app.runProviderFeedback()">Generate Provider Feedback</button>
    </div>

    <!-- Payer Performance Overview -->
    ${payerRates.length > 0 ? `
    <div class="card rcm-card" style="margin-bottom:16px;">
      <div class="card-header"><h3>Payer Performance</h3></div>
      <div class="card-body" style="padding:14px;">
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${payerRates.map(p => `
            <div style="padding:12px 16px;background:${p.denial_rate > 20 ? '#fef2f2' : p.denial_rate > 10 ? '#fffbeb' : '#f0fdf4'};border-radius:12px;min-width:140px;cursor:pointer;" onclick="window.app.viewPayerDetail('${escAttr(p.payer || '')}')">
              <div style="font-size:11px;color:var(--gray-500);font-weight:600;">${escHtml(p.payer || '')}</div>
              <div style="font-size:22px;font-weight:800;color:${p.denial_rate > 20 ? 'var(--red)' : p.denial_rate > 10 ? '#f59e0b' : 'var(--green)'};">${p.denial_rate || 0}%</div>
              <div style="font-size:10px;color:var(--gray-400);">${p.denied || 0}/${p.total_claims || 0} denied | ${_fk(p.avg_denied_amount || 0)} avg</div>
              ${p.top_denial_category ? `<div style="font-size:10px;margin-top:2px;color:var(--gray-500);">Top: ${escHtml(p.top_denial_category)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>` : ''}

    <!-- Payer Rules -->
    <div class="card rcm-card rcm-table">
      <div class="card-header"><h3>Payer Rules & Intelligence (${rules.length})</h3></div>
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr><th>Payer</th><th>Timely Filing</th><th>Appeal Limit</th><th>Portal</th><th>Phone</th><th>Auth Required CPTs</th><th>Policy Docs</th><th>Actions</th></tr></thead>
        <tbody>
          ${rules.map(r => `<tr>
            <td style="font-weight:700;">${escHtml(r.payer_name || r.payerName || '')}</td>
            <td style="font-weight:600;color:${r.timely_filing_days ? (r.timely_filing_days <= 90 ? '#f59e0b' : 'var(--green)') : 'var(--gray-400)'};">${r.timely_filing_days || r.timelyFilingDays ? (r.timely_filing_days || r.timelyFilingDays) + ' days' : '—'}</td>
            <td>${r.appeal_filing_days || r.appealFilingDays ? (r.appeal_filing_days || r.appealFilingDays) + ' days' : '—'}</td>
            <td>${r.portal_url || r.portalUrl ? `<a href="${escAttr(r.portal_url || r.portalUrl)}" target="_blank" style="color:var(--brand-600);font-size:12px;">Portal</a>` : '—'}</td>
            <td class="text-sm">${escHtml(r.provider_phone || r.providerPhone || '—')}</td>
            <td class="text-sm">${(r.auth_required_cpts || r.authRequiredCpts || []).join(', ') || '—'}</td>
            <td>${(r.policy_documents || r.policyDocuments || []).length > 0 ? `<span style="color:var(--brand-600);font-size:12px;">${(r.policy_documents || r.policyDocuments).length} docs</span>` : '—'}</td>
            <td>
              <button class="btn btn-sm" onclick="window.app.editPayerRule(${r.id})">Edit</button>
              <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deletePayerRule(${r.id})">Del</button>
            </td>
          </tr>`).join('')}
          ${rules.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No payer rules configured. Add payer-specific rules like timely filing limits, auth requirements, and portal URLs.</td></tr>' : ''}
        </tbody>
      </table></div></div>
    </div>

    <!-- Recommendations -->
    ${(denialRisk.recommendations || []).length > 0 ? `
    <div class="card rcm-card" style="margin-top:16px;">
      <div class="card-header"><h3>AI Recommendations</h3></div>
      <div class="card-body" style="padding:14px;">
        ${(denialRisk.recommendations || []).map(r => `<div style="padding:6px 0;font-size:13px;color:var(--gray-600);border-bottom:1px solid var(--gray-100);">&#8226; ${escHtml(r)}</div>`).join('')}
      </div>
    </div>` : ''}
  `;
}

// ═══════════════════════════════════════════════════
// PROVIDER FEEDBACK TAB
// ═══════════════════════════════════════════════════
async function renderProviderFeedbackTab(body) {
  let feedback = [];
  try { feedback = await store.getProviderFeedback(); } catch (e) {}
  if (!Array.isArray(feedback)) feedback = [];

  const typeLabels = { coding_error: 'Coding', documentation: 'Documentation', authorization: 'Authorization', modifier: 'Modifier', medical_necessity: 'Medical Necessity' };
  const statusColors = { pending: '#f59e0b', sent: '#3b82f6', acknowledged: 'var(--green)', resolved: 'var(--gray-400)' };

  body.innerHTML = `
    <div class="card rcm-card rcm-table">
      <div class="card-header"><h3>Provider Feedback (${feedback.length})</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-primary" onclick="window.app.runProviderFeedback()">Auto-Generate from Denials</button>
          <button class="btn btn-sm" onclick="window.app.openProviderFeedbackModal()">+ Manual Feedback</button>
        </div>
      </div>
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr><th>Provider</th><th>Type</th><th>Payer</th><th>Issue</th><th>Recommendation</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${feedback.map(f => `<tr>
            <td style="font-weight:600;">${escHtml(f.provider_name || f.providerName || '')}</td>
            <td><span style="font-size:11px;padding:2px 8px;background:var(--gray-100);border-radius:4px;">${typeLabels[f.feedback_type || f.feedbackType] || f.feedback_type || ''}</span></td>
            <td class="text-sm">${escHtml(f.payer_name || f.payerName || '—')}</td>
            <td class="text-sm" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${escHtml(f.issue || '')}</td>
            <td class="text-sm" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${escHtml(f.recommendation || '')}</td>
            <td><span style="font-size:11px;font-weight:600;color:${statusColors[f.status] || 'var(--gray-500)'};">${(f.status || 'pending').toUpperCase()}</span></td>
            <td><button class="btn btn-sm" onclick="window.app.markFeedbackSent(${f.id})">Mark Sent</button></td>
          </tr>`).join('')}
          ${feedback.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-500);">No provider feedback yet. Click "Auto-Generate" to create feedback from coding/documentation denials.</td></tr>' : ''}
        </tbody>
      </table></div></div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════
// AUTHORIZATIONS TAB
// ═══════════════════════════════════════════════════
const AUTH_SERVICE_TYPES = ['Outpatient Psychotherapy','Psychiatric Evaluation','Psychological Testing','Family Therapy','Group Therapy','Crisis Intervention','Other'];

async function renderAuthorizationsTab(body) {
  let auths = [];
  try { auths = await store.getAuthorizations(); } catch (e) {}
  if (!Array.isArray(auths)) auths = [];
  window._authAuthorizations = auths;

  const _val = (a, snake, camel) => a[snake] || a[camel] || '';
  const _num = (a, snake, camel) => Number(a[snake] || a[camel] || 0);
  const _patient = a => _val(a, 'patient_name', 'patientName');
  const _payer = a => _val(a, 'payer_name', 'payerName') || _val(a, 'payer', 'payer');
  const _authNum = a => _val(a, 'auth_number', 'authNumber');
  const _serviceType = a => _val(a, 'service_type', 'serviceType');
  const _approved = a => _num(a, 'approved_units', 'approvedUnits');
  const _used = a => _num(a, 'used_units', 'usedUnits');
  const _startDate = a => _val(a, 'start_date', 'startDate');
  const _endDate = a => _val(a, 'end_date', 'endDate');
  const _notes = a => _val(a, 'notes', 'notes');

  const now = new Date();
  const msDay = 86400000;

  function authStatus(a) {
    const end = new Date(_endDate(a));
    const remaining = _approved(a) - _used(a);
    const daysLeft = Math.ceil((end - now) / msDay);
    if (end < now) return 'expired';
    if (remaining <= 0) return 'exhausted';
    if (daysLeft <= 30 || remaining < 3) return 'expiring';
    return 'active';
  }

  function statusColor(status) {
    switch (status) {
      case 'active': return 'var(--green, #22c55e)';
      case 'expiring': return '#eab308';
      case 'exhausted': return 'var(--red, #ef4444)';
      case 'expired': return 'var(--gray-500, #6b7280)';
      default: return 'var(--gray-500)';
    }
  }

  function rowColor(a) {
    const end = new Date(_endDate(a));
    const remaining = _approved(a) - _used(a);
    const daysLeft = Math.ceil((end - now) / msDay);
    const pctRemaining = _approved(a) > 0 ? remaining / _approved(a) : 0;
    if (end < now || daysLeft < 7 || remaining < 3) return 'var(--red, #ef4444)';
    if (pctRemaining < 0.5 || daysLeft < 30) return '#eab308';
    return 'var(--green, #22c55e)';
  }

  // Summary counts
  const activeCount = auths.filter(a => authStatus(a) === 'active').length;
  const expiringCount = auths.filter(a => {
    const end = new Date(_endDate(a));
    const daysLeft = Math.ceil((end - now) / msDay);
    return end >= now && daysLeft <= 30;
  }).length;
  const exhaustedCount = auths.filter(a => _used(a) >= _approved(a) && new Date(_endDate(a)) >= now).length;
  const expiredCount = auths.filter(a => new Date(_endDate(a)) < now).length;

  // Alerts
  const alertExpiring7 = auths.filter(a => {
    const end = new Date(_endDate(a));
    const daysLeft = Math.ceil((end - now) / msDay);
    return daysLeft >= 0 && daysLeft <= 7;
  });
  const alertLowUnits = auths.filter(a => {
    const remaining = _approved(a) - _used(a);
    return remaining > 0 && remaining < 3 && new Date(_endDate(a)) >= now;
  });
  const alertMissedRenewal = auths.filter(a => {
    return new Date(_endDate(a)) < now && _used(a) < _approved(a);
  });
  const hasAlerts = alertExpiring7.length || alertLowUnits.length || alertMissedRenewal.length;

  // Filters
  const fSearch = (window._authFilterSearch || '').toLowerCase();
  const fStatus = window._authFilterStatus || '';
  const filtered = auths.filter(a => {
    if (fStatus && authStatus(a) !== fStatus) return false;
    if (fSearch && !_patient(a).toLowerCase().includes(fSearch) && !_payer(a).toLowerCase().includes(fSearch) && !_authNum(a).toLowerCase().includes(fSearch) && !_serviceType(a).toLowerCase().includes(fSearch)) return false;
    return true;
  });

  body.innerHTML = `
    ${hasAlerts ? `<div class="card rcm-card" style="margin-bottom:16px;border-left:4px solid var(--red, #ef4444);">
      <div class="card-header"><h3 style="color:var(--red, #ef4444);">Alerts</h3></div>
      <div class="card-body" style="padding:12px 18px;">
        ${alertExpiring7.length ? `<div style="margin-bottom:8px;"><strong style="color:var(--red);">Expiring within 7 days (${alertExpiring7.length}):</strong>
          ${alertExpiring7.map(a => `<div style="margin:4px 0 4px 12px;font-size:13px;">${escHtml(_patient(a))} — ${escHtml(_authNum(a))} — expires ${formatDateDisplay(_endDate(a))}</div>`).join('')}
        </div>` : ''}
        ${alertLowUnits.length ? `<div style="margin-bottom:8px;"><strong style="color:#eab308;">Less than 3 units remaining (${alertLowUnits.length}):</strong>
          ${alertLowUnits.map(a => `<div style="margin:4px 0 4px 12px;font-size:13px;">${escHtml(_patient(a))} — ${escHtml(_authNum(a))} — ${_approved(a) - _used(a)} units left</div>`).join('')}
        </div>` : ''}
        ${alertMissedRenewal.length ? `<div><strong style="color:var(--gray-500);">Expired with unused units — missed renewal (${alertMissedRenewal.length}):</strong>
          ${alertMissedRenewal.map(a => `<div style="margin:4px 0 4px 12px;font-size:13px;">${escHtml(_patient(a))} — ${escHtml(_authNum(a))} — ${_approved(a) - _used(a)} unused units, expired ${formatDateDisplay(_endDate(a))}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>` : ''}

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
      <div class="card rcm-card" style="padding:16px;text-align:center;cursor:pointer;${fStatus === 'active' ? 'border-color:var(--green);' : ''}" onclick="window._authFilterStatus=window._authFilterStatus==='active'?'':'active';window.app.rcSwitchTab('authorizations');">
        <div style="font-size:24px;font-weight:700;color:var(--green, #22c55e);">${activeCount}</div>
        <div style="font-size:12px;color:var(--gray-500);">Active Auths</div>
      </div>
      <div class="card rcm-card" style="padding:16px;text-align:center;cursor:pointer;${fStatus === 'expiring' ? 'border-color:#eab308;' : ''}" onclick="window._authFilterStatus=window._authFilterStatus==='expiring'?'':'expiring';window.app.rcSwitchTab('authorizations');">
        <div style="font-size:24px;font-weight:700;color:#eab308;">${expiringCount}</div>
        <div style="font-size:12px;color:var(--gray-500);">Expiring Soon</div>
      </div>
      <div class="card rcm-card" style="padding:16px;text-align:center;cursor:pointer;${fStatus === 'exhausted' ? 'border-color:var(--red);' : ''}" onclick="window._authFilterStatus=window._authFilterStatus==='exhausted'?'':'exhausted';window.app.rcSwitchTab('authorizations');">
        <div style="font-size:24px;font-weight:700;color:var(--red, #ef4444);">${exhaustedCount}</div>
        <div style="font-size:12px;color:var(--gray-500);">Units Exhausted</div>
      </div>
      <div class="card rcm-card" style="padding:16px;text-align:center;cursor:pointer;${fStatus === 'expired' ? 'border-color:var(--gray-500);' : ''}" onclick="window._authFilterStatus=window._authFilterStatus==='expired'?'':'expired';window.app.rcSwitchTab('authorizations');">
        <div style="font-size:24px;font-weight:700;color:var(--gray-500);">${expiredCount}</div>
        <div style="font-size:12px;color:var(--gray-500);">Expired</div>
      </div>
    </div>

    <div class="card rcm-card rcm-table">
      <div class="card-header"><h3>Authorizations (${filtered.length}${filtered.length !== auths.length ? ' of ' + auths.length : ''})</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-primary" onclick="window.app.openAuthModal()">+ Add Authorization</button>
        </div>
      </div>
      <div style="padding:12px 18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--gray-100);">
        <input type="text" class="form-control" placeholder="Search patient, payer, auth #..." value="${escAttr(fSearch)}" style="height:32px;font-size:12px;width:260px;" onkeyup="window._authFilterSearch=this.value;clearTimeout(window._authSearchTimer);window._authSearchTimer=setTimeout(()=>window.app.rcSwitchTab('authorizations'),300);">
        <select class="form-control" style="height:32px;font-size:12px;width:140px;" onchange="window._authFilterStatus=this.value;window.app.rcSwitchTab('authorizations');">
          <option value="">All Statuses</option>
          <option value="active" ${fStatus === 'active' ? 'selected' : ''}>Active</option>
          <option value="expiring" ${fStatus === 'expiring' ? 'selected' : ''}>Expiring</option>
          <option value="exhausted" ${fStatus === 'exhausted' ? 'selected' : ''}>Exhausted</option>
          <option value="expired" ${fStatus === 'expired' ? 'selected' : ''}>Expired</option>
        </select>
        ${fSearch || fStatus ? `<button class="btn btn-sm" onclick="window._authFilterSearch='';window._authFilterStatus='';window.app.rcSwitchTab('authorizations');" style="font-size:11px;color:var(--red);">Clear Filters</button>` : ''}
      </div>
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr><th>Patient</th><th>Payer</th><th>Auth #</th><th>Service Type</th><th>Units (Approved / Used / Remaining)</th><th>Date Range</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${filtered.map(a => {
            const approved = _approved(a);
            const used = _used(a);
            const remaining = Math.max(0, approved - used);
            const pct = approved > 0 ? Math.min(100, Math.round((used / approved) * 100)) : 0;
            const st = authStatus(a);
            const clr = rowColor(a);
            return `<tr>
              <td style="font-weight:600;">${escHtml(_patient(a))}</td>
              <td class="text-sm">${escHtml(_payer(a))}</td>
              <td style="font-family:monospace;font-weight:600;">${escHtml(_authNum(a))}</td>
              <td class="text-sm">${escHtml(_serviceType(a) || '—')}</td>
              <td style="min-width:180px;">
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
                  <span>${approved}</span> / <span>${used}</span> / <strong style="color:${clr};">${remaining}</strong>
                </div>
                <div style="height:6px;background:var(--gray-100);border-radius:3px;margin-top:4px;overflow:hidden;">
                  <div style="height:100%;width:${pct}%;background:${clr};border-radius:3px;transition:width 0.3s;"></div>
                </div>
              </td>
              <td class="text-sm">${formatDateDisplay(_startDate(a)) || '—'} — ${formatDateDisplay(_endDate(a)) || '—'}</td>
              <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${statusColor(st)}22;color:${statusColor(st)};">${st.toUpperCase()}</span></td>
              <td>
                <button class="btn btn-sm" onclick="window.app.openAuthModal(${a.id})">Edit</button>
                <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteAuth(${a.id})">Del</button>
              </td>
            </tr>`;
          }).join('')}
          ${filtered.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No authorizations found.</td></tr>' : ''}
        </tbody>
      </table></div></div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════
// MODIFIER GUIDE TAB — Behavioral Health Modifier Intelligence
// ═══════════════════════════════════════════════════
async function renderModifierGuideTab(body) {
  let payerRules = [];
  try { payerRules = await store.getPayerRules(); } catch (e) {}
  if (!Array.isArray(payerRules)) payerRules = [];

  const modifiers = [
    { code: 'GT', name: 'Telehealth (via video)', when: 'Telehealth sessions via interactive video', providers: 'All', example: '90837-GT' },
    { code: '95', name: 'Synchronous Telehealth', when: 'Alternative to GT for telehealth', providers: 'All', example: '90837-95' },
    { code: 'HO', name: "Master's Level", when: "Services by master's-level clinician", providers: 'LCSW, LPC, LMFT, LMHC', example: '90834-HO' },
    { code: 'HN', name: "Bachelor's Level", when: "Services by bachelor's-level clinician", providers: 'QBHP, BHT', example: '90834-HN' },
    { code: 'HQ', name: 'Group Setting', when: 'Services in a group setting', providers: 'All', example: '90853-HQ' },
    { code: 'XE', name: 'Separate Encounter', when: 'Distinct encounter on same day', providers: 'All', example: '90837-XE' },
    { code: 'XS', name: 'Separate Structure', when: 'Different anatomical structure/organ', providers: 'All', example: '—' },
    { code: '25', name: 'Significant E/M', when: 'Separate E/M service same day as procedure', providers: 'MD, DO, NP, PA', example: '99213-25' },
    { code: '76', name: 'Repeat Procedure', when: 'Same procedure, same provider, same day', providers: 'All', example: '—' },
    { code: '59', name: 'Distinct Procedure', when: 'Different procedure/service', providers: 'All', example: '—' },
    { code: 'HF', name: 'Substance Abuse', when: 'Substance use disorder program', providers: 'All', example: '99213-HF' },
    { code: 'SA', name: 'Nurse Practitioner', when: 'Services by NP (some payers require)', providers: 'NP, ARNP, APRN', example: '90837-SA' },
  ];

  // Build payer-specific rules from payer intel data if available, otherwise show defaults
  const defaultPayerModRules = [
    { payer: 'FL Blue / Florida Blue', rules: 'Requires GT or 95 for telehealth. HF required for MAT services. Accepts HO for LCSW/LPC.' },
    { payer: 'Medicare', rules: 'Does not accept HO/HN modifiers. Uses SA for Nurse Practitioner services. 95 preferred over GT for telehealth.' },
    { payer: 'Medicaid', rules: 'Requires HO for LCSW/LPC providers. HN required for supervised bachelor\'s-level clinicians.' },
  ];

  // Merge with any known payer rules
  const knownPayers = {};
  payerRules.forEach(r => { const n = (r.payer_name || r.payerName || '').trim(); if (n) knownPayers[n] = r; });

  body.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:16px;justify-content:flex-end;">
      <button class="btn btn-sm btn-primary" onclick="window.app.scrubClaims()" title="Run claim scrubber with modifier checks">Run Claim Scrubber</button>
    </div>

    <!-- BH Modifier Reference Table -->
    <div class="card rcm-card rcm-table">
      <div class="card-header"><h3>Behavioral Health Modifier Reference</h3></div>
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr><th>Modifier</th><th>Name</th><th>When to Use</th><th>Provider Types</th><th>Example</th></tr></thead>
        <tbody>
          ${modifiers.map(m => `<tr>
            <td><code style="font-size:13px;font-weight:700;color:var(--brand-700);background:var(--brand-50,#eff6ff);padding:2px 8px;border-radius:4px;">${escHtml(m.code)}</code></td>
            <td style="font-weight:600;">${escHtml(m.name)}</td>
            <td class="text-sm">${escHtml(m.when)}</td>
            <td class="text-sm">${escHtml(m.providers)}</td>
            <td style="font-family:monospace;font-size:12px;color:var(--gray-600);">${escHtml(m.example)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div></div>
    </div>

    <!-- Payer-Specific Modifier Rules -->
    <div class="card rcm-card" style="margin-top:16px;">
      <div class="card-header"><h3>Payer-Specific Modifier Rules</h3></div>
      <div class="card-body" style="padding:14px;">
        ${defaultPayerModRules.map(r => `
          <div style="padding:10px 14px;margin-bottom:8px;background:var(--gray-50);border-radius:8px;border-left:3px solid var(--brand-600);">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--gray-800);">${escHtml(r.payer)}</div>
            <div style="font-size:12px;color:var(--gray-600);line-height:1.5;">${escHtml(r.rules)}</div>
          </div>
        `).join('')}
        ${Object.keys(knownPayers).length > 0 ? `
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-200);">
            <div style="font-weight:600;font-size:12px;color:var(--gray-500);margin-bottom:8px;text-transform:uppercase;">Additional Configured Payers</div>
            ${Object.entries(knownPayers).map(([name, r]) => `
              <div style="padding:8px 14px;margin-bottom:6px;background:var(--gray-50);border-radius:8px;border-left:3px solid var(--gray-400);">
                <div style="font-weight:700;font-size:13px;color:var(--gray-800);">${escHtml(name)}</div>
                <div style="font-size:12px;color:var(--gray-500);margin-top:2px;">
                  Timely filing: ${r.timely_filing_days || r.timelyFilingDays ? (r.timely_filing_days || r.timelyFilingDays) + ' days' : '—'}
                  ${(r.auth_required_cpts || r.authRequiredCpts || []).length > 0 ? ' | Auth required for: ' + escHtml((r.auth_required_cpts || r.authRequiredCpts).join(', ')) : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Quick Reference: Common Scenarios -->
    <div class="card rcm-card" style="margin-top:16px;">
      <div class="card-header"><h3>Common BH Billing Scenarios</h3></div>
      <div class="card-body" style="padding:14px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
          <div style="padding:12px;background:#eff6ff;border-radius:8px;">
            <div style="font-weight:700;font-size:12px;color:#1d4ed8;margin-bottom:6px;">Telehealth Session (LCSW)</div>
            <div style="font-size:12px;color:var(--gray-600);line-height:1.6;">
              CPT: 90837 | Modifiers: GT, HO<br>
              <code style="font-size:11px;">90837-GT-HO</code> for master's-level clinician via video
            </div>
          </div>
          <div style="padding:12px;background:#f0fdf4;border-radius:8px;">
            <div style="font-weight:700;font-size:12px;color:#15803d;margin-bottom:6px;">Group Therapy</div>
            <div style="font-size:12px;color:var(--gray-600);line-height:1.6;">
              CPT: 90853 | Modifier: HQ<br>
              <code style="font-size:11px;">90853-HQ</code> always required for group sessions
            </div>
          </div>
          <div style="padding:12px;background:#fefce8;border-radius:8px;">
            <div style="font-weight:700;font-size:12px;color:#a16207;margin-bottom:6px;">NP Visit + Therapy Same Day</div>
            <div style="font-size:12px;color:var(--gray-600);line-height:1.6;">
              E/M: 99213-25-SA | Therapy: 90837<br>
              <code style="font-size:11px;">25</code> for separate E/M, <code style="font-size:11px;">SA</code> for NP
            </div>
          </div>
          <div style="padding:12px;background:#fdf2f8;border-radius:8px;">
            <div style="font-weight:700;font-size:12px;color:#be185d;margin-bottom:6px;">MAT / Substance Abuse (FL Blue)</div>
            <div style="font-size:12px;color:var(--gray-600);line-height:1.6;">
              E/M: 99213-HF | Add HF modifier<br>
              <code style="font-size:11px;">99213-HF</code> required by FL Blue for MAT services
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-top:16px;padding:14px;background:var(--gray-50);border-radius:8px;font-size:12px;color:var(--gray-600);">
      <strong>Note:</strong> Modifier requirements vary by payer, state, and plan type. The claim scrubber automatically checks for missing modifiers when you run it. Suggested modifiers also appear when creating or editing claims. Always verify modifier requirements with the specific payer contract.
    </div>
  `;
}

export { renderFeeSchedulesTab, renderEligibilityTab, renderStatementsTab, renderClientReportsSection, renderPayerIntelligenceTab, renderProviderFeedbackTab, renderAuthorizationsTab, renderModifierGuideTab };
