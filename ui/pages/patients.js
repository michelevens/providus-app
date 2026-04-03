// ui/pages/patients.js — Patient Module
// Patients are auto-extracted from claims/837 imports — not manually created.
// This page provides the billing view: demographics, insurance, account balance, claim history.

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, navigateTo, appConfirm, timeAgo } = window._credentik;

function _fm(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _fk(n) { n = Number(n || 0); return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : _fm(n); }

if (typeof window._patientTab === 'undefined') window._patientTab = 'list';
if (typeof window._selectedPatientId === 'undefined') window._selectedPatientId = null;

// ─── Main Render ───
export async function renderPatientsPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  if (window._selectedPatientId && window._patientTab === 'detail') {
    await _renderPatientDetail(body, window._selectedPatientId);
    return;
  }

  // Load claims + payments + denials + statements to extract patient data
  const [claims, payments, denials, statements, charges] = await Promise.all([
    store.getRcmClaims().catch(() => []),
    store.getRcmPayments().catch(() => []),
    store.getRcmDenials().catch(() => []),
    store.getPatientStatements().catch(() => []),
    store.getRcmCharges().catch(() => []),
  ]);

  const claimArr = Array.isArray(claims) ? claims : [];
  const payArr = Array.isArray(payments) ? payments : [];
  const denArr = Array.isArray(denials) ? denials : [];
  const stmtArr = Array.isArray(statements) ? statements : [];
  const chargeArr = Array.isArray(charges) ? charges : [];

  // Extract unique patients from claims
  const patientMap = {};
  claimArr.forEach(c => {
    const name = (c.patientName || c.patient_name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!patientMap[key]) {
      patientMap[key] = {
        name,
        memberId: c.patientMemberId || c.patient_member_id || '',
        dob: c.patientDob || c.patient_dob || '',
        phone: c.patientPhone || c.patient_phone || '',
        email: c.patientEmail || c.patient_email || '',
        payers: new Set(),
        providers: new Set(),
        claims: [],
        totalCharged: 0,
        totalPaid: 0,
        totalAdjusted: 0,
        patientBalance: 0,
        insuranceBalance: 0,
        denialCount: 0,
        lastDos: '',
        firstDos: '9999-99-99',
      };
    }
    const p = patientMap[key];
    p.claims.push(c);
    const payer = c.payerName || c.payer_name || '';
    if (payer) p.payers.add(payer);
    const provider = c.providerName || c.provider_name || '';
    if (provider) p.providers.add(provider);
    const charged = Number(c.totalCharges || c.total_charges || 0);
    const paid = Number(c.totalPaid || c.total_paid || 0);
    const adjusted = Number(c.adjustments || c.total_adjustments || 0);
    p.totalCharged += charged;
    p.totalPaid += paid;
    p.totalAdjusted += adjusted;
    p.insuranceBalance += charged - paid - adjusted;
    const dos = (c.dateOfService || c.date_of_service || '').toString().slice(0, 10);
    if (dos > p.lastDos) p.lastDos = dos;
    if (dos < p.firstDos) p.firstDos = dos;
    // Update demographics if available
    if (!p.memberId && (c.patientMemberId || c.patient_member_id)) p.memberId = c.patientMemberId || c.patient_member_id;
    if (!p.dob && (c.patientDob || c.patient_dob)) p.dob = c.patientDob || c.patient_dob;
  });

  // Enrich with denial counts
  denArr.forEach(d => {
    const name = (d.patientName || d.patient_name || '').trim().toLowerCase();
    if (patientMap[name]) patientMap[name].denialCount++;
  });

  // Enrich with statement balances
  stmtArr.forEach(s => {
    const name = (s.patient_name || s.patientName || '').trim().toLowerCase();
    if (patientMap[name]) {
      patientMap[name].patientBalance += Number(s.patient_balance || s.patientBalance || 0);
    }
  });

  // Convert to array and sort
  const patients = Object.values(patientMap).map(p => ({
    ...p,
    payers: [...p.payers],
    providers: [...p.providers],
    totalBalance: p.insuranceBalance + p.patientBalance,
    claimCount: p.claims.length,
  })).sort((a, b) => a.name.localeCompare(b.name));

  // Stats
  const totalPatients = patients.length;
  const activePatients = patients.filter(p => {
    const lastDos = new Date(p.lastDos);
    return (Date.now() - lastDos) < 90 * 86400000; // seen in last 90 days
  }).length;
  const totalOwed = patients.reduce((s, p) => s + Math.max(0, p.totalBalance), 0);
  const totalCollected = patients.reduce((s, p) => s + p.totalPaid, 0);
  const withDenials = patients.filter(p => p.denialCount > 0).length;

  // Search
  const search = (window._patientSearch || '').toLowerCase();
  let displayPatients = patients;
  if (search) {
    displayPatients = patients.filter(p =>
      p.name.toLowerCase().includes(search) ||
      (p.memberId || '').toLowerCase().includes(search) ||
      p.payers.some(py => py.toLowerCase().includes(search))
    );
  }

  body.innerHTML = `
    <div class="pt-stats">
      <div class="pt-stat"><div class="pt-val" style="color:var(--brand-600);">${totalPatients}</div><div class="pt-lbl">Total Patients</div></div>
      <div class="pt-stat"><div class="pt-val" style="color:#16a34a;">${activePatients}</div><div class="pt-lbl">Active (90 days)</div></div>
      <div class="pt-stat"><div class="pt-val" style="color:#d97706;">${_fk(totalOwed)}</div><div class="pt-lbl">Total Balance</div></div>
      <div class="pt-stat"><div class="pt-val" style="color:#7c3aed;">${_fk(totalCollected)}</div><div class="pt-lbl">Collected</div></div>
      <div class="pt-stat"><div class="pt-val" style="color:#dc2626;">${withDenials}</div><div class="pt-lbl">With Denials</div></div>
    </div>

    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header" style="flex-wrap:wrap;gap:8px;">
        <h3>Patients (${displayPatients.length})</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="patient-search" class="form-control" placeholder="Search patients, member ID, payer..." value="${escAttr(search)}" style="width:280px;height:34px;font-size:13px;border-radius:10px;" oninput="window._patientSearch=this.value;clearTimeout(window._ptSearchTimer);window._ptSearchTimer=setTimeout(()=>window.app.renderPatientsTab(),300);">
        </div>
      </div>
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        <thead><tr>
          <th>Patient</th>
          <th>Member ID</th>
          <th>Primary Payer</th>
          <th>Provider</th>
          <th>Claims</th>
          <th>Last DOS</th>
          <th style="text-align:right;">Charged</th>
          <th style="text-align:right;">Paid</th>
          <th style="text-align:right;">Balance</th>
          <th>Denials</th>
        </tr></thead>
        <tbody>
          ${displayPatients.map(p => {
            const balColor = p.totalBalance > 0 ? 'var(--red)' : p.totalBalance < 0 ? '#d97706' : 'var(--green)';
            const isActive = p.lastDos && (Date.now() - new Date(p.lastDos)) < 90 * 86400000;
            return `<tr class="pt-row" onclick="window.app.viewPatient('${escAttr(p.name.toLowerCase())}')">
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--brand-50);color:var(--brand-600);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${escHtml((p.name[0] || '?').toUpperCase() + (p.name.split(' ')[1] || '')[0]?.toUpperCase() || '')}</div>
                  <div>
                    <div style="font-weight:600;color:var(--text-primary);">${escHtml(p.name)}</div>
                    ${p.dob ? `<div style="font-size:10px;color:var(--gray-400);">DOB: ${escHtml(p.dob)}</div>` : ''}
                  </div>
                </div>
              </td>
              <td class="text-sm" style="font-family:monospace;">${escHtml(p.memberId || '—')}</td>
              <td class="text-sm">${p.payers.length > 0 ? escHtml(p.payers[0]) + (p.payers.length > 1 ? ` <span style="font-size:10px;color:var(--gray-400);">+${p.payers.length - 1}</span>` : '') : '—'}</td>
              <td class="text-sm">${p.providers.length > 0 ? escHtml(p.providers[0]) : '—'}</td>
              <td><span style="font-size:12px;font-weight:600;color:var(--brand-600);">${p.claimCount}</span></td>
              <td class="text-sm">${p.lastDos !== '' ? formatDateDisplay(p.lastDos) : '—'} ${isActive ? '<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;margin-left:4px;" title="Active"></span>' : ''}</td>
              <td style="text-align:right;">${_fm(p.totalCharged)}</td>
              <td style="text-align:right;color:var(--green);">${_fm(p.totalPaid)}</td>
              <td style="text-align:right;font-weight:700;color:${balColor};">${_fm(p.totalBalance)}</td>
              <td>${p.denialCount > 0 ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:#fee2e2;color:#dc2626;">${p.denialCount}</span>` : '<span style="color:var(--gray-400);">0</span>'}</td>
            </tr>`;
          }).join('')}
          ${displayPatients.length === 0 ? `<tr><td colspan="10" style="text-align:center;padding:3rem;">
            <div style="color:var(--gray-400);font-size:32px;margin-bottom:8px;">&#128100;</div>
            <div style="font-size:14px;font-weight:600;color:var(--gray-600);margin-bottom:4px;">${search ? 'No patients match your search' : 'No patients yet'}</div>
            <div style="font-size:12px;color:var(--gray-400);">Patients are automatically extracted from imported claims and 837 files. Import claims to see your patient roster.</div>
          </td></tr>` : ''}
        </tbody>
      </table></div></div>
    </div>
  `;
}

// ─── Patient Detail ───
async function _renderPatientDetail(body, patientKey) {
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  const [claims, payments, denials, statements] = await Promise.all([
    store.getRcmClaims().catch(() => []),
    store.getRcmPayments().catch(() => []),
    store.getRcmDenials().catch(() => []),
    store.getPatientStatements().catch(() => []),
  ]);

  const claimArr = (Array.isArray(claims) ? claims : []).filter(c =>
    (c.patientName || c.patient_name || '').trim().toLowerCase() === patientKey
  );

  if (claimArr.length === 0) {
    body.innerHTML = '<div style="padding:3rem;text-align:center;color:var(--gray-500);">Patient not found. <a href="#" onclick="window.app.navigateTo(\'patients\');return false;">Back to patients</a></div>';
    return;
  }

  const first = claimArr[0];
  const name = (first.patientName || first.patient_name || '').trim();
  const memberId = first.patientMemberId || first.patient_member_id || '';
  const dob = first.patientDob || first.patient_dob || '';

  // Aggregate stats
  const payers = [...new Set(claimArr.map(c => c.payerName || c.payer_name || '').filter(Boolean))];
  const providers = [...new Set(claimArr.map(c => c.providerName || c.provider_name || '').filter(Boolean))];
  const totalCharged = claimArr.reduce((s, c) => s + Number(c.totalCharges || c.total_charges || 0), 0);
  const totalPaid = claimArr.reduce((s, c) => s + Number(c.totalPaid || c.total_paid || 0), 0);
  const totalAdjusted = claimArr.reduce((s, c) => s + Number(c.adjustments || c.total_adjustments || 0), 0);
  const insuranceBalance = totalCharged - totalPaid - totalAdjusted;

  const patientDenials = (Array.isArray(denials) ? denials : []).filter(d =>
    (d.patientName || d.patient_name || '').trim().toLowerCase() === patientKey
  );
  const patientStatements = (Array.isArray(statements) ? statements : []).filter(s =>
    (s.patient_name || s.patientName || '').trim().toLowerCase() === patientKey
  );
  const patientBalance = patientStatements.reduce((s, st) => s + Number(st.patient_balance || st.patientBalance || 0), 0);

  // Sort claims by DOS descending
  claimArr.sort((a, b) => (b.dateOfService || b.date_of_service || '').localeCompare(a.dateOfService || a.date_of_service || ''));

  const initials = (name[0] || '?').toUpperCase() + ((name.split(' ')[1] || '')[0] || '').toUpperCase();

  // Tab state
  const detailTab = window._patientDetailTab || 'claims';

  body.innerHTML = `
    <div style="margin-bottom:16px;">
      <button class="btn btn-sm" onclick="window._selectedPatientId=null;window._patientTab='list';window.app.navigateTo('patients');" style="font-size:12px;">&larr; Back to Patients</button>
    </div>

    <!-- Patient Header -->
    <div class="card" style="border-radius:16px;margin-bottom:16px;">
      <div class="card-body" style="padding:20px;">
        <div style="display:flex;gap:16px;align-items:flex-start;">
          <div style="width:56px;height:56px;border-radius:50%;background:var(--brand-50);color:var(--brand-600);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex-shrink:0;">${initials}</div>
          <div style="flex:1;">
            <h2 style="margin:0 0 4px;font-size:20px;">${escHtml(name)}</h2>
            <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--gray-500);">
              ${dob ? `<span>DOB: <strong>${escHtml(dob)}</strong></span>` : ''}
              ${memberId ? `<span>Member ID: <strong style="font-family:monospace;">${escHtml(memberId)}</strong></span>` : ''}
              <span>Claims: <strong>${claimArr.length}</strong></span>
              ${payers.map(py => `<span style="padding:2px 8px;border-radius:10px;background:var(--brand-50);color:var(--brand-600);font-weight:600;">${escHtml(py)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Account Summary -->
    <div class="pt-stats" style="margin-bottom:16px;">
      <div class="pt-stat"><div class="pt-val" style="color:var(--brand-600);">${_fm(totalCharged)}</div><div class="pt-lbl">Total Charged</div></div>
      <div class="pt-stat"><div class="pt-val" style="color:#16a34a;">${_fm(totalPaid)}</div><div class="pt-lbl">Insurance Paid</div></div>
      <div class="pt-stat"><div class="pt-val" style="color:#d97706;">${_fm(totalAdjusted)}</div><div class="pt-lbl">Adjustments</div></div>
      <div class="pt-stat"><div class="pt-val" style="color:${insuranceBalance > 0 ? '#dc2626' : '#16a34a'};">${_fm(insuranceBalance)}</div><div class="pt-lbl">Insurance Balance</div></div>
      <div class="pt-stat"><div class="pt-val" style="color:${patientBalance > 0 ? '#dc2626' : '#16a34a'};">${_fm(patientBalance)}</div><div class="pt-lbl">Patient Balance</div></div>
    </div>

    <!-- Detail Tabs -->
    <div style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:16px;">
      ${['claims', 'encounters', 'denials', 'statements'].map(t => `<button style="padding:8px 16px;font-size:12px;font-weight:600;color:${detailTab === t ? 'var(--brand-600)' : 'var(--gray-500)'};border:none;background:none;border-bottom:3px solid ${detailTab === t ? 'var(--brand-600)' : 'transparent'};margin-bottom:-2px;cursor:pointer;" onclick="window._patientDetailTab='${t}';window.app.renderPatientsTab();">${t.charAt(0).toUpperCase() + t.slice(1)} (${t === 'claims' ? claimArr.length : t === 'denials' ? patientDenials.length : t === 'statements' ? patientStatements.length : claimArr.length})</button>`).join('')}
    </div>

    <!-- Tab Content -->
    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
        ${detailTab === 'claims' ? `
          <thead><tr><th>DOS</th><th>Claim #</th><th>CPT</th><th>Payer</th><th>Provider</th><th style="text-align:right;">Charged</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th><th>Status</th></tr></thead>
          <tbody>
            ${claimArr.map(c => {
              const charged = Number(c.totalCharges || c.total_charges || 0);
              const paid = Number(c.totalPaid || c.total_paid || 0);
              const bal = charged - paid - Number(c.adjustments || c.total_adjustments || 0);
              return `<tr style="cursor:pointer;" onclick="window.app.openClaimDetail(${c.id})">
                <td class="text-sm">${formatDateDisplay(c.dateOfService || c.date_of_service) || '—'}</td>
                <td class="text-sm" style="font-family:monospace;font-weight:600;color:var(--brand-600);">${escHtml(c.claimNumber || c.claim_number || '—')}</td>
                <td class="text-sm"><code>${escHtml(c.cptCode || c.cpt_code || c.serviceLines?.[0]?.cptCode || '—')}</code></td>
                <td class="text-sm">${escHtml(c.payerName || c.payer_name || '—')}</td>
                <td class="text-sm">${escHtml(c.providerName || c.provider_name || '—')}</td>
                <td style="text-align:right;">${_fm(charged)}</td>
                <td style="text-align:right;color:var(--green);">${_fm(paid)}</td>
                <td style="text-align:right;font-weight:600;color:${bal > 0 ? 'var(--red)' : 'var(--green)'};">${_fm(bal)}</td>
                <td><span class="badge badge-${c.status}" style="font-size:10px;">${(c.status || '').replace(/_/g, ' ')}</span></td>
              </tr>`;
            }).join('')}
            ${claimArr.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No claims for this patient.</td></tr>' : ''}
          </tbody>
        ` : detailTab === 'encounters' ? `
          <thead><tr><th>DOS</th><th>CPT</th><th>ICD-10</th><th>Payer</th><th>Provider</th><th>Units</th><th style="text-align:right;">Charges</th><th>Status</th></tr></thead>
          <tbody>
            ${claimArr.map(c => {
              const sls = c.serviceLines || c.service_lines || [];
              if (sls.length === 0) {
                return `<tr>
                  <td class="text-sm">${formatDateDisplay(c.dateOfService || c.date_of_service) || '—'}</td>
                  <td class="text-sm"><code>${escHtml(c.cptCode || c.cpt_code || '—')}</code></td>
                  <td class="text-sm"><code>${escHtml(c.icdCodes || c.icd_codes || '—')}</code></td>
                  <td class="text-sm">${escHtml(c.payerName || c.payer_name || '—')}</td>
                  <td class="text-sm">${escHtml(c.providerName || c.provider_name || '—')}</td>
                  <td class="text-sm">1</td>
                  <td style="text-align:right;">${_fm(c.totalCharges || c.total_charges)}</td>
                  <td><span class="badge badge-${c.status}" style="font-size:10px;">${(c.status || '').replace(/_/g, ' ')}</span></td>
                </tr>`;
              }
              return sls.map(sl => `<tr>
                <td class="text-sm">${formatDateDisplay(c.dateOfService || c.date_of_service) || '—'}</td>
                <td class="text-sm"><code style="font-weight:600;color:var(--brand-700);">${escHtml(sl.cptCode || sl.cpt_code || '—')}</code></td>
                <td class="text-sm"><code>${escHtml(sl.icdCodes || sl.icd_codes || c.icdCodes || c.icd_codes || '—')}</code></td>
                <td class="text-sm">${escHtml(c.payerName || c.payer_name || '—')}</td>
                <td class="text-sm">${escHtml(c.providerName || c.provider_name || '—')}</td>
                <td class="text-sm">${sl.units || 1}</td>
                <td style="text-align:right;">${_fm(sl.charges || sl.charge_amount || 0)}</td>
                <td><span class="badge badge-${c.status}" style="font-size:10px;">${(c.status || '').replace(/_/g, ' ')}</span></td>
              </tr>`).join('');
            }).join('')}
          </tbody>
        ` : detailTab === 'denials' ? `
          <thead><tr><th>Date</th><th>Claim #</th><th>Code</th><th>Reason</th><th style="text-align:right;">Amount</th><th>Appeal Status</th><th>Priority</th></tr></thead>
          <tbody>
            ${patientDenials.map(d => `<tr>
              <td class="text-sm">${formatDateDisplay(d.createdAt || d.created_at || d.denial_date) || '—'}</td>
              <td class="text-sm" style="font-family:monospace;">${escHtml(d.claimNumber || d.claim_number || '—')}</td>
              <td class="text-sm"><code>${escHtml(d.denialCode || d.denial_code || '—')}</code></td>
              <td class="text-sm" style="max-width:200px;">${escHtml(d.denialReason || d.denial_reason || '—')}</td>
              <td style="text-align:right;color:var(--red);font-weight:600;">${_fm(d.deniedAmount || d.denied_amount)}</td>
              <td><span style="font-size:11px;font-weight:600;">${escHtml((d.appealStatus || d.appeal_status || 'not_appealed').replace(/_/g, ' '))}</span></td>
              <td class="text-sm">${escHtml(d.priority || '—')}</td>
            </tr>`).join('')}
            ${patientDenials.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-500);">No denials for this patient.</td></tr>' : ''}
          </tbody>
        ` : `
          <thead><tr><th>Due Date</th><th style="text-align:right;">Charges</th><th style="text-align:right;">Insurance Paid</th><th style="text-align:right;">Patient Balance</th><th style="text-align:right;">Paid</th><th>Status</th><th>Sent</th></tr></thead>
          <tbody>
            ${patientStatements.map(s => {
              const statusColors = { draft: 'var(--gray-500)', sent: '#f59e0b', partial_paid: '#3b82f6', paid: 'var(--green)', collections: 'var(--red)', written_off: 'var(--gray-400)' };
              return `<tr>
                <td class="text-sm">${formatDateDisplay(s.due_date || s.dueDate) || '—'}</td>
                <td style="text-align:right;">${_fm(s.total_charges || s.totalCharges)}</td>
                <td style="text-align:right;color:var(--green);">${_fm(s.insurance_paid || s.insurancePaid)}</td>
                <td style="text-align:right;color:var(--red);font-weight:700;">${_fm(s.patient_balance || s.patientBalance)}</td>
                <td style="text-align:right;color:var(--green);">${_fm(s.amount_paid || s.amountPaid)}</td>
                <td><span style="font-size:11px;font-weight:600;color:${statusColors[s.status] || 'var(--gray-500)'};">${(s.status || 'draft').replace('_', ' ').toUpperCase()}</span></td>
                <td class="text-sm">${s.times_sent || s.timesSent || 0}x</td>
              </tr>`;
            }).join('')}
            ${patientStatements.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-500);">No statements for this patient.</td></tr>' : ''}
          </tbody>
        `}
      </table></div></div>
    </div>
  `;
}
