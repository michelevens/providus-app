// ui/pages/payer-detail.js — Payer Detail Page
// Lazy-loaded module showing comprehensive payer intelligence

const { store, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, getPayerById, getStateName, navigateTo,
        editButton, helpTip, PAYER_CATALOG, STATES } = window._credentik;

export async function renderPayerDetailPage(payerId) {
  const body = document.getElementById('page-body');

  if (!payerId) {
    body.innerHTML = '<div class="alert alert-warning">No payer selected.</div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading payer details...</div></div>';

  // ── Load all data in parallel ──
  let payer = getPayerById(payerId) || PAYER_CATALOG.find(p => String(p.id) === String(payerId));
  if (!payer) {
    // Try from API payers
    const allPayers = await store.getPayers();
    payer = allPayers.find(p => String(p.id) === String(payerId));
  }
  if (!payer) {
    body.innerHTML = '<div class="alert alert-warning">Payer not found.</div>';
    return;
  }

  const [apps, claims, denials, payments, licenses] = await Promise.all([
    store.getAll('applications').catch(() => []),
    store.getRcmClaims().catch(() => []),
    store.getRcmDenials().catch(() => []),
    store.getRcmPayments().catch(() => []),
    store.getAll('licenses').catch(() => []),
  ]);

  // ── Filter data for this payer ──
  const payerApps = (apps || []).filter(a => String(a.payerId) === String(payerId) ||
    (a.payerName || '').toLowerCase() === (payer.name || '').toLowerCase());
  const payerClaims = (claims || []).filter(c =>
    String(c.payerId) === String(payerId) ||
    (c.payerName || '').toLowerCase().includes((payer.name || '').toLowerCase()));
  const payerDenials = (denials || []).filter(d =>
    String(d.payerId) === String(payerId) ||
    (d.payerName || '').toLowerCase().includes((payer.name || '').toLowerCase()));
  const payerPayments = (payments || []).filter(p =>
    String(p.payerId) === String(payerId) ||
    (p.payerName || '').toLowerCase().includes((payer.name || '').toLowerCase()));

  // ── Computed stats ──
  const tags = payer.tags || [];
  const sla = window._credentik.getPayerSLA ? window._credentik.getPayerSLA(payer.name) : { avgDays: 60, minDays: 30, maxDays: 120 };
  const isFederal = tags.includes('federal_program');

  // App status breakdown
  const statusCounts = {};
  payerApps.forEach(a => { statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });
  const credentialedStates = payerApps.filter(a => a.status === 'credentialed' || a.status === 'approved').map(a => a.state);
  const inProgressStates = payerApps.filter(a => ['submitted', 'in_review', 'pending_info', 'gathering_docs'].includes(a.status)).map(a => a.state);
  const licensedStates = [...new Set((licenses || []).map(l => l.state))].sort();
  const gapStates = licensedStates.filter(s => !payerApps.some(a => a.state === s));

  // Claims stats
  const totalBilled = payerClaims.reduce((s, c) => s + (Number(c.totalCharges) || 0), 0);
  const totalPaid = payerClaims.reduce((s, c) => s + (Number(c.totalPaid || c.paidAmount) || 0), 0);
  const claimsPaid = payerClaims.filter(c => c.status === 'paid' || c.status === 'PAID').length;
  const claimsDenied = payerClaims.filter(c => c.status === 'denied' || c.status === 'DENIED').length;
  const claimsPending = payerClaims.filter(c => !['paid','PAID','denied','DENIED'].includes(c.status)).length;
  const denialRate = payerClaims.length > 0 ? Math.round((claimsDenied / payerClaims.length) * 100) : 0;
  const collectionRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;

  // Avg days to payment
  const paidWithDates = payerClaims.filter(c => (c.status === 'paid' || c.status === 'PAID') && c.submittedDate && c.paidDate);
  const avgDaysToPay = paidWithDates.length > 0
    ? Math.round(paidWithDates.reduce((s, c) => s + Math.max(0, (new Date(c.paidDate) - new Date(c.submittedDate)) / 86400000), 0) / paidWithDates.length)
    : null;

  // Top denial reasons
  const denialReasons = {};
  payerDenials.forEach(d => {
    const reason = d.denialReason || d.denial_reason || d.reasonCode || 'Unknown';
    denialReasons[reason] = (denialReasons[reason] || 0) + 1;
  });
  const topDenialReasons = Object.entries(denialReasons).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Category labels
  const catLabels = { national: 'National', behavioral: 'Behavioral Health', bcbs_anthem: 'BCBS Anthem', bcbs_hcsc: 'BCBS HCSC', bcbs_highmark: 'BCBS Highmark', bcbs_independent: 'BCBS Independent', regional: 'Regional', medicaid: 'Medicaid', medicare: 'Medicare', other: 'Other' };

  // ── Render ──
  body.innerHTML = `
    <style>
      .pd-hero{display:grid;grid-template-columns:1fr auto;gap:24px;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 50%,#f5f3ff 100%);border:1px solid var(--gray-200);border-radius:16px;padding:28px 32px;margin-bottom:20px;align-items:start;}
      .pd-stat{position:relative;overflow:hidden;border-radius:14px;padding:18px 20px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .pd-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .pd-stat .pd-val{font-size:26px;font-weight:800;line-height:1.1;}
      .pd-stat .pd-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
      .pd-stat .pd-sub{font-size:12px;color:var(--gray-400);margin-top:2px;}
      .pd-section{margin-bottom:20px;}
    </style>

    <!-- Hero -->
    <div class="pd-hero">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <h2 style="font-size:24px;font-weight:800;margin:0;color:var(--gray-900);">${escHtml(payer.name)}</h2>
          <span style="padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;background:var(--brand-50,#eef2ff);color:var(--brand-600);">${catLabels[payer.category] || payer.category || ''}</span>
          ${isFederal ? '<span style="padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;background:#f0fdf4;color:#16a34a;">Federal Program</span>' : ''}
        </div>
        ${payer.parentOrg ? `<div style="font-size:14px;color:var(--gray-500);margin-bottom:8px;">Parent: ${escHtml(payer.parentOrg)}</div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">
          ${tags.map(t => `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:var(--gray-100);color:var(--gray-600);">${t.replace(/_/g, ' ')}</span>`).join('')}
        </div>
        ${payer.notes ? `<div style="font-size:13px;color:var(--gray-600);line-height:1.5;">${escHtml(payer.notes)}</div>` : ''}
        <div style="display:flex;gap:16px;margin-top:12px;font-size:13px;color:var(--gray-500);">
          ${payer.marketShare ? `<span>Market share: <strong>${payer.marketShare}%</strong></span>` : ''}
          <span>Avg credential: <strong>${sla.avgDays} days</strong> (${sla.minDays}–${sla.maxDays})</span>
          ${payer.states ? `<span>Operates in: <strong>${payer.states.includes('ALL') ? 'All states' : payer.states.length + ' states'}</strong></span>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
        <div style="text-align:center;">
          <div style="font-size:36px;font-weight:800;color:${credentialedStates.length > 0 ? '#16a34a' : 'var(--gray-400)'};">${credentialedStates.length}</div>
          <div style="font-size:11px;font-weight:600;color:var(--gray-500);">STATES CREDENTIALED</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#2563eb;">${inProgressStates.length}</div>
          <div style="font-size:10px;font-weight:600;color:var(--gray-400);">In Progress</div>
        </div>
      </div>
    </div>

    <!-- Stats Row -->
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:20px;">
      <div class="pd-stat"><div class="pd-val" style="color:var(--brand-600);">${payerApps.length}</div><div class="pd-lbl">Applications</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:#16a34a;">${payerClaims.length}</div><div class="pd-lbl">Claims Filed</div><div class="pd-sub">$${totalBilled.toLocaleString()} billed</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:#2563eb;">${collectionRate}%</div><div class="pd-lbl">Collection Rate</div><div class="pd-sub">$${totalPaid.toLocaleString()} collected</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:${denialRate > 15 ? '#dc2626' : denialRate > 8 ? '#d97706' : '#16a34a'};">${denialRate}%</div><div class="pd-lbl">Denial Rate</div><div class="pd-sub">${claimsDenied} of ${payerClaims.length}</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:#7c3aed;">${avgDaysToPay !== null ? avgDaysToPay + 'd' : '—'}</div><div class="pd-lbl">Avg Days to Pay</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:#0891b2;">${gapStates.length}</div><div class="pd-lbl">Expansion Gaps</div><div class="pd-sub">of ${licensedStates.length} licensed</div></div>
    </div>

    <!-- Credentialing Status -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Credentialing Status</h3></div>
      <div class="card-body">
        ${payerApps.length > 0 ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          ${Object.entries(statusCounts).map(([st, ct]) => `<span style="padding:4px 12px;border-radius:10px;font-size:12px;font-weight:600;background:var(--gray-100);color:var(--gray-700);">${st.replace(/_/g, ' ')} <strong>${ct}</strong></span>`).join('')}
        </div>
        <div class="table-wrap"><table style="font-size:12px;">
          <thead><tr><th>State</th><th>Status</th><th>Source</th><th>Submitted</th><th>Effective</th><th>Notes</th></tr></thead>
          <tbody>
            ${payerApps.map(a => `<tr>
              <td style="font-weight:600;">${getStateName(a.state)}</td>
              <td><span class="badge badge-${a.status}" style="font-size:10px;">${(a.status || '').replace(/_/g, ' ')}</span></td>
              <td>${a.source ? `<span style="font-size:9px;padding:1px 5px;border-radius:6px;font-weight:600;${a.source==='vendor'?'background:#fef3c7;color:#b45309;':a.source==='batch'?'background:#e0e7ff;color:#4f46e5;':'background:#f0fdf4;color:#16a34a;'}">${a.source}</span>` : '—'}</td>
              <td class="text-sm">${formatDateDisplay(a.submittedDate) || '—'}</td>
              <td class="text-sm" style="color:var(--green);">${formatDateDisplay(a.effectiveDate) || '—'}</td>
              <td class="text-sm text-muted" style="max-width:200px;">${escHtml((a.notes || '').substring(0, 80))}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : '<div style="padding:24px;text-align:center;color:var(--gray-400);">No applications with this payer yet.</div>'}
      </div>
    </div>

    <!-- Coverage Map -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Coverage Map</h3></div>
      <div class="card-body">
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);margin-bottom:6px;">Credentialed</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${credentialedStates.length > 0 ? credentialedStates.map(s => `<span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#dcfce7;color:#16a34a;">${s}</span>`).join('') : '<span style="color:var(--gray-400);font-size:12px;">None</span>'}
            </div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);margin-bottom:6px;">In Progress</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${inProgressStates.length > 0 ? inProgressStates.map(s => `<span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#dbeafe;color:#2563eb;">${s}</span>`).join('') : '<span style="color:var(--gray-400);font-size:12px;">None</span>'}
            </div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);margin-bottom:6px;">Gaps ${isFederal && credentialedStates.length > 0 ? '(add location only)' : ''}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${gapStates.length > 0 ? gapStates.map(s => `<span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#fee2e2;color:#dc2626;cursor:pointer;" onclick="window.app.createAppFromGap('${s}','${payerId}','${escAttr(payer.name)}')" title="Click to create application">${s}</span>`).join('') : '<span style="color:var(--gray-400);font-size:12px;">Full coverage</span>'}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Claims Performance -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Claims Performance</h3></div>
      <div class="card-body">
        ${payerClaims.length > 0 ? `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px;">
          <div class="pd-stat"><div class="pd-val" style="color:#16a34a;">${claimsPaid}</div><div class="pd-lbl">Paid</div></div>
          <div class="pd-stat"><div class="pd-val" style="color:#dc2626;">${claimsDenied}</div><div class="pd-lbl">Denied</div></div>
          <div class="pd-stat"><div class="pd-val" style="color:#d97706;">${claimsPending}</div><div class="pd-lbl">Pending</div></div>
          <div class="pd-stat"><div class="pd-val" style="color:#7c3aed;">${avgDaysToPay !== null ? avgDaysToPay : '—'}</div><div class="pd-lbl">Avg Days to Pay</div></div>
        </div>
        ${topDenialReasons.length > 0 ? `
        <div style="margin-top:12px;">
          <div style="font-size:12px;font-weight:700;color:var(--gray-700);margin-bottom:8px;">Top Denial Reasons</div>
          ${topDenialReasons.map(([reason, count]) => {
            const pct = Math.round((count / Math.max(claimsDenied, 1)) * 100);
            return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <div style="width:200px;font-size:12px;font-weight:500;color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escAttr(reason)}">${escHtml(reason)}</div>
              <div style="flex:1;height:6px;background:var(--gray-200);border-radius:3px;"><div style="width:${pct}%;height:100%;background:#ef4444;border-radius:3px;"></div></div>
              <div style="font-size:11px;font-weight:600;color:var(--gray-500);min-width:40px;">${count} (${pct}%)</div>
            </div>`;
          }).join('')}
        </div>` : ''}

        <!-- Recent Claims -->
        <div style="margin-top:16px;">
          <div style="font-size:12px;font-weight:700;color:var(--gray-700);margin-bottom:8px;">Recent Claims</div>
          <div class="table-wrap"><table style="font-size:11px;">
            <thead><tr><th>Claim #</th><th>Patient</th><th>DOS</th><th>Billed</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>
              ${payerClaims.slice(0, 10).map(c => `<tr>
                <td style="font-family:monospace;font-size:10px;">${escHtml(c.claimNumber || c.claim_number || '')}</td>
                <td>${escHtml(c.patientName || c.patient_name || '')}</td>
                <td>${formatDateDisplay(c.dateOfService || c.date_of_service) || '—'}</td>
                <td>$${(Number(c.totalCharges || c.total_charges) || 0).toLocaleString()}</td>
                <td style="color:var(--green);">$${(Number(c.totalPaid || c.paid_amount) || 0).toLocaleString()}</td>
                <td><span class="badge badge-${(c.status || '').toLowerCase() === 'paid' ? 'approved' : (c.status || '').toLowerCase() === 'denied' ? 'denied' : 'pending'}" style="font-size:9px;">${c.status || '—'}</span></td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>` : '<div style="padding:24px;text-align:center;color:var(--gray-400);">No claims data for this payer yet.</div>'}
      </div>
    </div>

    <!-- Credentialing Timeline -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Credentialing Timeline</h3></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
          <div class="pd-stat" style="border-left:3px solid #22c55e;"><div class="pd-val" style="color:#16a34a;">${sla.minDays}d</div><div class="pd-lbl">Best Case</div></div>
          <div class="pd-stat" style="border-left:3px solid var(--brand-600);"><div class="pd-val" style="color:var(--brand-600);">${sla.avgDays}d</div><div class="pd-lbl">Average</div></div>
          <div class="pd-stat" style="border-left:3px solid #ef4444;"><div class="pd-val" style="color:#dc2626;">${sla.maxDays}d</div><div class="pd-lbl">Worst Case</div></div>
        </div>
        ${isFederal ? '<div style="margin-top:12px;padding:10px 14px;background:#f0fdf4;border-radius:10px;font-size:12px;color:#16a34a;font-weight:500;">Federal program — one enrollment covers all licensed states. Add practice locations via PECOS or the payer portal for new states.</div>' : ''}
      </div>
    </div>

    <!-- Contact / Resources -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Resources</h3></div>
      <div class="card-body">
        <div style="font-size:13px;color:var(--gray-600);line-height:1.8;">
          ${payer.portalUrl ? `<div><strong>Portal:</strong> <a href="${escAttr(payer.portalUrl)}" target="_blank" style="color:var(--brand-600);">${escHtml(payer.portalUrl)}</a></div>` : ''}
          ${payer.phone ? `<div><strong>Provider Relations:</strong> ${escHtml(payer.phone)}</div>` : ''}
          ${payer.email ? `<div><strong>Email:</strong> ${escHtml(payer.email)}</div>` : ''}
          ${!payer.portalUrl && !payer.phone && !payer.email ? '<div style="color:var(--gray-400);">No contact information on file. Add portal URL, phone, and email via the payer catalog.</div>' : ''}
        </div>
      </div>
    </div>
  `;
}
