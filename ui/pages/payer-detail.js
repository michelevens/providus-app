// ui/pages/payer-detail.js — Payer Detail Page
// Lazy-loaded module showing comprehensive payer intelligence

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, getPayerById, getStateName, navigateTo,
        editButton, helpTip, PAYER_CATALOG, STATES,
        PAYER_SLA_DEFAULTS, getPayerSLA } = window._credentik;

export async function renderPayerDetailPage(payerId) {
  const body = document.getElementById('page-body');

  if (!payerId) {
    body.innerHTML = '<div class="alert alert-warning">No payer selected.</div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading payer details...</div></div>';

  // ── Load payer ──
  let payer = getPayerById(payerId) || PAYER_CATALOG.find(p => String(p.id) === String(payerId));
  if (!payer) {
    const allPayers = await store.getPayers();
    payer = allPayers.find(p => String(p.id) === String(payerId));
  }
  if (!payer) { body.innerHTML = '<div class="alert alert-warning">Payer not found.</div>'; return; }

  // ── Load all data in parallel ──
  let [apps, claims, denials, payments, licenses, providers, orgs, facilities, followups, activityLogs, agencyUsers] = await Promise.all([
    store.getAll('applications').catch(() => []),
    store.getRcmClaims().catch(() => []),
    store.getRcmDenials().catch(() => []),
    store.getRcmPayments().catch(() => []),
    store.getAll('licenses').catch(() => []),
    store.getAll('providers').catch(() => []),
    store.getAll('organizations').catch(() => []),
    store.getFacilities().catch(() => []),
    store.getAll('followups').catch(() => []),
    store.getActivityLogs ? store.getActivityLogs({ collection: 'applications' }).catch(() => []) : Promise.resolve([]),
    store.getAgencyUsers ? store.getAgencyUsers().catch(() => []) : Promise.resolve([]),
  ]);

  // Apply scope filtering to prevent cross-org data leaks
  apps = store.filterByScope(Array.isArray(apps) ? apps : []);
  claims = store.filterByScope(Array.isArray(claims) ? claims : []);
  denials = store.filterByScope(Array.isArray(denials) ? denials : []);
  payments = store.filterByScope(Array.isArray(payments) ? payments : []);
  licenses = store.filterByScope(Array.isArray(licenses) ? licenses : []);
  providers = store.filterByScope(Array.isArray(providers) ? providers : []);
  facilities = store.filterByScope(Array.isArray(facilities) ? facilities : []);
  followups = store.filterByScope(Array.isArray(followups) ? followups : []);

  // Build staff ID → name lookup
  const staffMap = {};
  (Array.isArray(agencyUsers) ? agencyUsers : []).forEach(u => {
    staffMap[u.id] = ((u.firstName || u.first_name || '') + ' ' + (u.lastName || u.last_name || '')).trim();
  });

  // ── Filter for this payer ──
  const matchPayer = (item) => {
    if (!item) return false;
    return String(item.payerId || item.payer_id) === String(payerId) ||
      (item.payerName || item.payer_name || '').toLowerCase() === (payer.name || '').toLowerCase();
  };
  const payerApps = (apps || []).filter(matchPayer);
  const payerClaims = (claims || []).filter(matchPayer);
  const payerDenials = (denials || []).filter(matchPayer);
  const payerPayments = (payments || []).filter(matchPayer);
  const payerFollowups = (followups || []).filter(f => payerApps.some(a => String(a.id) === String(f.applicationId || f.application_id)));

  // ── Organization & Provider context ──
  const org = orgs.length > 0 ? orgs[0] : {};
  const providerMap = {};
  (providers || []).forEach(p => { providerMap[p.id] = p; });

  // Providers credentialed with this payer
  const providerIds = [...new Set(payerApps.map(a => a.providerId).filter(Boolean))];
  const payerProviders = providerIds.map(id => providerMap[id]).filter(Boolean);

  // Facilities linked to this payer's apps
  const facilityIds = [...new Set(payerApps.map(a => a.facilityId).filter(Boolean))];
  const payerFacilities = facilityIds.map(id => (facilities || []).find(f => String(f.id) === String(id))).filter(Boolean);

  // ── Computed stats ──
  const tags = payer.tags || [];
  const sla = getPayerSLA ? getPayerSLA(payer.name) : { avgDays: 60, minDays: 30, maxDays: 120 };
  const isFederal = tags.includes('federal_program');

  const statusCounts = {};
  payerApps.forEach(a => { statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });
  const credentialedStates = payerApps.filter(a => a.status === 'credentialed' || a.status === 'approved').map(a => a.state);
  const inProgressStates = payerApps.filter(a => ['submitted', 'in_review', 'pending_info', 'gathering_docs'].includes(a.status)).map(a => a.state);
  const deniedStates = payerApps.filter(a => a.status === 'denied' || a.status === 'withdrawn' || a.status === 'on_hold').map(a => a.state);
  const licensedStates = [...new Set((licenses || []).map(l => l.state))].sort();
  const gapStates = licensedStates.filter(s => !payerApps.some(a => a.state === s));

  // Claims stats
  const totalBilled = payerClaims.reduce((s, c) => s + (Number(c.totalCharges) || 0), 0);
  const totalPaid = payerClaims.reduce((s, c) => s + (Number(c.totalPaid || c.paidAmount) || 0), 0);
  const claimsPaid = payerClaims.filter(c => (c.status || '').toLowerCase() === 'paid').length;
  const claimsDenied = payerClaims.filter(c => (c.status || '').toLowerCase() === 'denied').length;
  const claimsPending = payerClaims.length - claimsPaid - claimsDenied;
  const denialRate = payerClaims.length > 0 ? Math.round((claimsDenied / payerClaims.length) * 100) : 0;
  const collectionRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
  const paidWithDates = payerClaims.filter(c => (c.status || '').toLowerCase() === 'paid' && c.submittedDate && c.paidDate);
  const avgDaysToPay = paidWithDates.length > 0
    ? Math.round(paidWithDates.reduce((s, c) => s + Math.max(0, (new Date(c.paidDate) - new Date(c.submittedDate)) / 86400000), 0) / paidWithDates.length) : null;

  // Top denial reasons
  const denialReasons = {};
  payerDenials.forEach(d => { const r = d.denialReason || d.denial_reason || d.reasonCode || 'Unknown'; denialReasons[r] = (denialReasons[r] || 0) + 1; });
  const topDenialReasons = Object.entries(denialReasons).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── Insights engine ──
  const insights = [];
  if (credentialedStates.length === 0 && payerApps.length > 0) insights.push({ type: 'warning', text: 'No active credentials with this payer yet. All applications are still in progress or closed.' });
  if (credentialedStates.length > 0 && gapStates.length > 0 && !isFederal) insights.push({ type: 'opportunity', text: `You're credentialed in ${credentialedStates.length} state(s) but have ${gapStates.length} licensed state(s) with no application. Consider expanding.` });
  if (isFederal && credentialedStates.length > 0 && gapStates.length > 0) insights.push({ type: 'info', text: `Federal program — add practice locations for ${gapStates.join(', ')} via PECOS or payer portal. No new application needed.` });
  if (denialRate > 15) insights.push({ type: 'alert', text: `Denial rate is ${denialRate}% — above industry average. Review top denial reasons and consider payer-specific billing rules.` });
  if (denialRate > 0 && denialRate <= 8) insights.push({ type: 'good', text: `Denial rate of ${denialRate}% is healthy — below industry average.` });
  if (avgDaysToPay !== null && avgDaysToPay > 45) insights.push({ type: 'warning', text: `Average ${avgDaysToPay} days to payment — slower than typical. Monitor for payment delays.` });
  if (avgDaysToPay !== null && avgDaysToPay <= 30) insights.push({ type: 'good', text: `Average ${avgDaysToPay} days to payment — fast payer.` });
  if (payerApps.some(a => a.status === 'on_hold')) insights.push({ type: 'warning', text: 'Panel is closed in some states. Monitor for reopening.' });
  if (payerApps.some(a => a.status === 'denied')) insights.push({ type: 'alert', text: 'Application denied in some states. Review denial reasons and reapplication requirements.' });
  if (collectionRate > 0 && collectionRate < 70) insights.push({ type: 'alert', text: `Collection rate is only ${collectionRate}%. Review underpayments and contract terms.` });
  if (tags.includes('must_have') && payerApps.length === 0) insights.push({ type: 'opportunity', text: 'This is a must-have payer but you have no applications. High priority to begin credentialing.' });
  const openFollowups = payerFollowups.filter(f => f.status !== 'completed' && f.status !== 'done');
  if (openFollowups.length > 0) insights.push({ type: 'action', text: `${openFollowups.length} open follow-up(s) pending for this payer.` });
  // EDI/ERA/EFT insights
  const ediStatus = payer.ediStatus || payer.edi_status;
  const eraStatus = payer.eraStatus || payer.era_status;
  const eftStatus = payer.eftStatus || payer.eft_status;
  if (!ediStatus && payerClaims.length > 0) insights.push({ type: 'alert', text: 'EDI not enrolled — claims may be submitted manually. Set up electronic claim submission for faster processing.' });
  if (!eraStatus && claimsPaid > 0) insights.push({ type: 'warning', text: 'ERA not enrolled — payment posting is likely manual. Set up electronic remittance for auto-posting.' });
  if (!eftStatus && claimsPaid > 0) insights.push({ type: 'warning', text: 'EFT not enrolled — payments may arrive by check. Set up direct deposit for faster funding.' });
  if (ediStatus === 'enrolled' && eraStatus === 'enrolled' && eftStatus === 'enrolled') insights.push({ type: 'good', text: 'Full electronic billing setup — EDI, ERA, and EFT all enrolled.' });

  const insightColors = { alert: '#dc2626', warning: '#d97706', opportunity: '#2563eb', info: '#0891b2', good: '#16a34a', action: '#7c3aed' };
  const insightIcons = { alert: '&#9888;', warning: '&#9888;', opportunity: '&#10024;', info: '&#8505;', good: '&#10003;', action: '&#9889;' };

  const catLabels = { national: 'National', behavioral: 'Behavioral Health', bcbs_anthem: 'BCBS Anthem', bcbs_hcsc: 'BCBS HCSC', bcbs_highmark: 'BCBS Highmark', bcbs_independent: 'BCBS Independent', regional: 'Regional', medicaid: 'Medicaid', medicare: 'Medicare', other: 'Other' };

  // Payer requirements based on tags
  const requirements = [];
  if (tags.includes('caqh_accepts')) requirements.push({ method: 'CAQH', desc: 'Accepts CAQH ProView — keep your CAQH profile up to date and re-attest quarterly.' });
  if (tags.includes('availity_enrolled')) requirements.push({ method: 'Availity', desc: 'Enrolled via Availity portal. Submit applications and check status through Availity.' });
  if (tags.includes('portal_required')) requirements.push({ method: 'Payer Portal', desc: 'Requires registration on payer-specific provider portal for enrollment and claims.' });
  if (tags.includes('paper_application')) requirements.push({ method: 'Paper Application', desc: 'Requires physical paper application — download, complete, and mail/fax.' });
  if (tags.includes('medicaid_prerequisite')) requirements.push({ method: 'Medicaid First', desc: 'Must be enrolled with state Medicaid before applying to this payer.' });
  if (requirements.length === 0) requirements.push({ method: 'Standard', desc: 'Standard credentialing process — check payer website for specific requirements.' });

  // ── Render ──
  body.innerHTML = `
    <style>
      .pd-hero{display:grid;grid-template-columns:1fr 260px;gap:24px;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 50%,#f5f3ff 100%);border:1px solid var(--gray-200);border-radius:16px;padding:28px 32px;margin-bottom:20px;align-items:start;}
      .pd-stat{position:relative;overflow:hidden;border-radius:14px;padding:16px 18px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .pd-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .pd-stat .pd-val{font-size:24px;font-weight:800;line-height:1.1;}
      .pd-stat .pd-lbl{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
      .pd-stat .pd-sub{font-size:11px;color:var(--gray-400);margin-top:2px;}
      .pd-section{margin-bottom:16px;}
      .pd-insight{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.5;margin-bottom:4px;}
      @media(max-width:768px){.pd-hero{grid-template-columns:1fr;}}
    </style>

    <!-- Hero -->
    <div class="pd-hero">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <h2 style="font-size:24px;font-weight:800;margin:0;color:var(--gray-900);">${escHtml(payer.name)}</h2>
          <span style="padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;background:var(--brand-50,#eef2ff);color:var(--brand-600);">${catLabels[payer.category] || payer.category || ''}</span>
          ${isFederal ? '<span style="padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;background:#f0fdf4;color:#16a34a;">Federal Program</span>' : ''}
        </div>
        ${payer.parentOrg ? `<div style="font-size:13px;color:var(--gray-500);margin-bottom:6px;">Parent: ${escHtml(payer.parentOrg)}</div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">
          ${tags.map(t => `<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:var(--gray-100);color:var(--gray-600);">${t.replace(/_/g, ' ')}</span>`).join('')}
        </div>
        ${payer.notes ? `<div style="font-size:12px;color:var(--gray-600);line-height:1.5;margin-bottom:8px;">${escHtml(payer.notes)}</div>` : ''}
        <div style="display:flex;gap:14px;font-size:12px;color:var(--gray-500);flex-wrap:wrap;">
          ${payer.marketShare ? `<span>Market share: <strong>${payer.marketShare}%</strong></span>` : ''}
          <span>Avg credential: <strong>${sla.avgDays}d</strong> (${sla.minDays}–${sla.maxDays})</span>
          ${payer.states ? `<span>Operates: <strong>${payer.states.includes('ALL') ? 'All states' : payer.states.length + ' states'}</strong></span>` : ''}
        </div>
        <!-- Org context -->
        <div style="margin-top:10px;padding:10px 14px;background:rgba(255,255,255,0.7);border-radius:10px;border:1px solid var(--gray-200);font-size:12px;">
          <div style="font-weight:700;color:var(--gray-700);margin-bottom:4px;">Organization</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;color:var(--gray-600);">
            <span>${escHtml(org.name || 'EnnHealth')}</span>
            ${org.npi ? `<span>NPI: <strong>${escHtml(org.npi)}</strong></span>` : ''}
            ${org.taxId || org.tax_id ? `<span>Tax ID: <strong>${escHtml(org.taxId || org.tax_id)}</strong></span>` : ''}
            <span>${payerProviders.length} provider(s)</span>
            <span>${payerFacilities.length} facility(ies)</span>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:center;">
        <div style="width:120px;height:120px;border-radius:50%;background:${credentialedStates.length > 0 ? 'linear-gradient(135deg,#22c55e,#16a34a)' : inProgressStates.length > 0 ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : 'linear-gradient(135deg,#94a3b8,#64748b)'};display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;">
          <div style="font-size:32px;font-weight:800;">${credentialedStates.length}</div>
          <div style="font-size:10px;font-weight:600;opacity:0.8;">CREDENTIALED</div>
        </div>
        <div style="text-align:center;font-size:11px;color:var(--gray-500);">${inProgressStates.length} in progress · ${gapStates.length} gaps</div>
      </div>
    </div>

    <!-- Insights -->
    ${insights.length > 0 ? `
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;border-left:4px solid var(--brand-600);">
      <div class="card-header"><h3>Insights & Recommendations</h3></div>
      <div class="card-body" style="padding:12px 16px;">
        ${insights.map(i => `<div class="pd-insight" style="background:${insightColors[i.type]}10;">
          <span style="color:${insightColors[i.type]};font-size:14px;flex-shrink:0;">${insightIcons[i.type]}</span>
          <span style="color:${insightColors[i.type]};font-weight:500;">${i.text}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Stats Row -->
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:16px;">
      <div class="pd-stat"><div class="pd-val" style="color:var(--brand-600);">${payerApps.length}</div><div class="pd-lbl">Applications</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:#16a34a;">${payerClaims.length}</div><div class="pd-lbl">Claims</div><div class="pd-sub">$${totalBilled.toLocaleString()} billed</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:#2563eb;">${collectionRate}%</div><div class="pd-lbl">Collection</div><div class="pd-sub">$${totalPaid.toLocaleString()}</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:${denialRate > 15 ? '#dc2626' : denialRate > 8 ? '#d97706' : '#16a34a'};">${denialRate}%</div><div class="pd-lbl">Denial Rate</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:#7c3aed;">${avgDaysToPay !== null ? avgDaysToPay + 'd' : '—'}</div><div class="pd-lbl">Days to Pay</div></div>
      <div class="pd-stat"><div class="pd-val" style="color:#0891b2;">${gapStates.length}</div><div class="pd-lbl">Gaps</div><div class="pd-sub">of ${licensedStates.length} licensed</div></div>
    </div>

    <!-- Providers -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Providers (${payerProviders.length})</h3></div>
      <div class="card-body">
        ${payerProviders.length > 0 ? `
        <div class="table-wrap"><table style="font-size:12px;">
          <thead><tr><th>Provider</th><th>NPI</th><th>Credential</th><th>States with this Payer</th><th>Status</th></tr></thead>
          <tbody>
            ${payerProviders.map(p => {
              const provApps = payerApps.filter(a => String(a.providerId) === String(p.id));
              const provStates = provApps.map(a => `<span style="padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:${(a.status==='credentialed'||a.status==='approved')?'#dcfce7;color:#16a34a':['in_review','submitted'].includes(a.status)?'#dbeafe;color:#2563eb':'#f3f4f6;color:#6b7280'};">${a.state}</span>`).join(' ');
              return `<tr style="cursor:pointer;" onclick="window._selectedProviderId=${p.id};window.app.navigateTo('provider-profile')">
                <td style="font-weight:600;">${escHtml(p.firstName || '')} ${escHtml(p.lastName || '')}</td>
                <td style="font-family:monospace;font-size:11px;">${escHtml(p.npi || '')}</td>
                <td class="text-sm">${escHtml(p.credential || p.credentials || '')}</td>
                <td>${provStates}</td>
                <td><span class="badge badge-${p.status || 'active'}" style="font-size:10px;">${p.status || 'active'}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>` : '<div style="padding:20px;text-align:center;color:var(--gray-400);font-size:13px;">No providers enrolled with this payer yet.</div>'}
      </div>
    </div>

    <!-- Credentialing Status by State -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Credentialing by State</h3></div>
      <div class="card-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          ${Object.entries(statusCounts).map(([st, ct]) => `<span style="padding:4px 12px;border-radius:10px;font-size:12px;font-weight:600;background:var(--gray-100);color:var(--gray-700);">${st.replace(/_/g, ' ')} <strong>${ct}</strong></span>`).join('')}
        </div>
        ${payerApps.length > 0 ? `
        <div class="table-wrap"><table style="font-size:12px;">
          <thead><tr><th>State</th><th>Provider</th><th>Status</th><th>Virtual</th><th>Mode</th><th>Submitted</th><th>Effective</th><th>Assigned</th><th>Notes</th></tr></thead>
          <tbody>
            ${payerApps.map(a => {
              const prov = providerMap[a.providerId];
              const provName = prov ? `${prov.firstName || ''} ${prov.lastName || ''}`.trim() : '—';
              const th = a.telehealthStatus || a.telehealth_status || '';
              const thBadge = th === 'enabled' ? '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#16a34a;font-weight:600;">📹 Enabled</span>'
                : th === 'pending' ? '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#fef3c7;color:#b45309;font-weight:600;">⏳ Pending</span>'
                : th === 'not_enrolled' ? '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#fee2e2;color:#dc2626;font-weight:600;">❌ Not Set Up</span>'
                : th === 'not_applicable' ? '<span style="font-size:10px;color:var(--gray-400);">N/A</span>'
                : '<span style="font-size:10px;color:var(--gray-400);">—</span>';
              const sm = a.serviceMode || a.service_mode || '';
              const smLabel = sm === 'telehealth_only' ? 'Telehealth' : sm === 'in_person_only' ? 'In-Person' : sm === 'both' ? 'Both' : '—';
              return `<tr>
                <td style="font-weight:600;">${getStateName(a.state)}</td>
                <td class="text-sm">${escHtml(provName)}</td>
                <td><span class="badge badge-${a.status}" style="font-size:10px;">${(a.status || '').replace(/_/g, ' ')}</span></td>
                <td>${thBadge}</td>
                <td class="text-sm">${smLabel}</td>
                <td class="text-sm">${formatDateDisplay(a.submittedDate) || '—'}</td>
                <td class="text-sm" style="color:var(--green);">${formatDateDisplay(a.effectiveDate) || '—'}</td>
                <td class="text-sm">${a.assignedTo ? `<span style="background:var(--brand-50);color:var(--brand-600);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${escHtml(staffMap[a.assignedTo] || 'Staff #' + a.assignedTo)}</span>` : '—'}</td>
                <td class="text-sm text-muted" style="max-width:180px;">${escHtml((a.notes || '').substring(0, 80))}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>` : '<div style="padding:20px;text-align:center;color:var(--gray-400);">No applications.</div>'}
      </div>
    </div>

    <!-- Coverage Map -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Coverage Map</h3></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
          <div>
            <div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:6px;">Credentialed (${credentialedStates.length})</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${credentialedStates.length > 0 ? credentialedStates.map(s => {
                const app = payerApps.find(a => a.state === s && (a.status === 'credentialed' || a.status === 'approved'));
                const th = app?.telehealthStatus || app?.telehealth_status || '';
                const thIcon = th === 'enabled' ? ' 📹' : th === 'pending' ? ' ⏳' : th === 'not_enrolled' ? ' ❌' : '';
                return `<span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#dcfce7;color:#16a34a;" title="${th === 'enabled' ? 'Virtual visits enabled' : th === 'pending' ? 'Virtual visit pending' : th === 'not_enrolled' ? 'Virtual visit NOT enrolled — add on payer portal' : 'Virtual visit status not set'}">${s}${thIcon}</span>`;
              }).join('') : '<span style="color:var(--gray-400);font-size:12px;">None</span>'}
            </div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:#2563eb;margin-bottom:6px;">In Progress (${inProgressStates.length})</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${inProgressStates.length > 0 ? inProgressStates.map(s => `<span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#dbeafe;color:#2563eb;">${s}</span>`).join('') : '<span style="color:var(--gray-400);font-size:12px;">None</span>'}
            </div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:6px;">Gaps (${gapStates.length}) ${isFederal && credentialedStates.length > 0 ? '<span style="font-weight:400;color:var(--gray-400);">— add location only</span>' : ''}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${gapStates.length > 0 ? gapStates.map(s => `<span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#fee2e2;color:#dc2626;cursor:pointer;" onclick="window.app.createAppFromGap('${s}','${payerId}','${escAttr(payer.name)}')" title="Click to create application">${s}</span>`).join('') : '<span style="color:var(--gray-400);font-size:12px;">Full coverage</span>'}
            </div>
          </div>
        </div>
        ${deniedStates.length > 0 ? `<div style="margin-top:12px;"><div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:6px;">Denied / On Hold / Withdrawn</div><div style="display:flex;gap:4px;flex-wrap:wrap;">${deniedStates.map(s => `<span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#fef3c7;color:#b45309;">${s}</span>`).join('')}</div></div>` : ''}
        ${(() => {
          const vEnabled = payerApps.filter(a => (a.telehealthStatus || a.telehealth_status) === 'enabled').map(a => a.state);
          const vNotEnrolled = payerApps.filter(a => (a.status === 'credentialed' || a.status === 'approved') && (a.telehealthStatus || a.telehealth_status) !== 'enabled' && (a.telehealthStatus || a.telehealth_status) !== 'not_applicable').map(a => a.state);
          if (vEnabled.length === 0 && vNotEnrolled.length === 0) return '';
          return '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-color);">' +
            '<div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:8px;">Virtual Visit Status</div>' +
            '<div style="display:flex;gap:16px;flex-wrap:wrap;">' +
              (vEnabled.length > 0 ? '<div><div style="font-size:10px;color:#16a34a;font-weight:600;margin-bottom:4px;">📹 Enabled (' + vEnabled.length + ')</div><div style="display:flex;gap:3px;flex-wrap:wrap;">' + vEnabled.map(s => '<span style="padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#dcfce7;color:#16a34a;">' + s + '</span>').join('') + '</div></div>' : '') +
              (vNotEnrolled.length > 0 ? '<div><div style="font-size:10px;color:#dc2626;font-weight:600;margin-bottom:4px;">❌ Need Virtual Visit Setup (' + vNotEnrolled.length + ')</div><div style="display:flex;gap:3px;flex-wrap:wrap;">' + vNotEnrolled.map(s => '<span style="padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#fee2e2;color:#dc2626;">' + s + '</span>').join('') + '</div></div>' : '') +
            '</div></div>';
        })()}
      </div>
    </div>

    <!-- Credentialing Requirements -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Credentialing Requirements</h3></div>
      <div class="card-body">
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${requirements.map(r => `
            <div style="flex:1;min-width:200px;max-width:320px;padding:14px 16px;border:1px solid var(--gray-200);border-radius:12px;background:var(--gray-50);">
              <div style="font-weight:700;font-size:13px;color:var(--gray-800);margin-bottom:4px;">${escHtml(r.method)}</div>
              <div style="font-size:12px;color:var(--gray-600);line-height:1.5;">${escHtml(r.desc)}</div>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--gray-500);">
          <strong>SLA:</strong> ${sla.minDays}–${sla.maxDays} days (avg ${sla.avgDays}d).
          ${isFederal ? 'Federal program — one enrollment covers all licensed states.' : ''}
        </div>
      </div>
    </div>

    <!-- Billing Standards -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;border-left:4px solid #0891b2;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h3>Billing Standards</h3>
        <button class="btn btn-sm" onclick="window.app.editPayerBillingStandards('${payerId}')">Edit</button>
      </div>
      <div class="card-body">
        ${(() => {
          const bs = payer.billingStandards || payer.billing_standards || {};
          const hasData = bs.telehealthModifier || bs.telehealth_modifier || bs.posCode || bs.pos_code || bs.audioOnlyPolicy || bs.audio_only_policy;
          if (!hasData) {
            return '<div style="text-align:center;padding:20px;"><div style="font-size:14px;color:var(--gray-400);margin-bottom:8px;">No billing standards configured for this payer.</div><div style="font-size:12px;color:var(--gray-400);">Click "Edit" to add telehealth modifiers, POS codes, NP billing rules, timely filing limits, and more.</div></div>';
          }
          const _pill = (label, value, color) => value ? '<div style="padding:10px 14px;border:1px solid ' + color + '30;border-radius:10px;background:' + color + '08;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:' + color + ';margin-bottom:4px;">' + label + '</div><div style="font-size:13px;font-weight:600;color:var(--gray-800);">' + escHtml(value) + '</div></div>' : '';
          return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:14px;">' +
            _pill('Telehealth Modifier', bs.telehealthModifier || bs.telehealth_modifier, '#0891b2') +
            _pill('Place of Service', bs.posCode || bs.pos_code, '#7c3aed') +
            _pill('Audio-Only Policy', bs.audioOnlyPolicy || bs.audio_only_policy, '#2563eb') +
            _pill('NP Billing Rule', bs.npBillingRule || bs.np_billing_rule, '#16a34a') +
            _pill('Timely Filing', bs.timelyFiling || bs.timely_filing, '#dc2626') +
            _pill('Claim Format', bs.claimFormat || bs.claim_format, '#b45309') +
            _pill('Prior Auth Required', bs.priorAuthRequired || bs.prior_auth_required, '#8b5cf6') +
            _pill('Reimbursement Rate', bs.reimbursementInfo || bs.reimbursement_info, '#16a34a') +
          '</div>' +
          (bs.notes ? '<div style="padding:10px 14px;border-radius:10px;background:var(--gray-50);border:1px solid var(--gray-200);font-size:12px;color:var(--gray-600);line-height:1.6;">' + escHtml(bs.notes) + '</div>' : '');
        })()}
      </div>
    </div>

    <!-- EDI / ERA / EFT Enrollment -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;border-left:4px solid #7c3aed;">
      <div class="card-header">
        <h3>EDI / ERA / EFT Enrollment</h3>
        <button class="btn btn-sm" onclick="window.app.editPayerEdi('${payerId}')">Edit</button>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px;">
          ${[
            { key: 'edi', label: 'EDI (Claims)', desc: 'Electronic claim submission (837)', field: payer.ediStatus || payer.edi_status },
            { key: 'era', label: 'ERA (Remittance)', desc: 'Electronic remittance advice (835)', field: payer.eraStatus || payer.era_status },
            { key: 'eft', label: 'EFT (Payment)', desc: 'Electronic funds transfer', field: payer.eftStatus || payer.eft_status },
          ].map(e => {
            const status = e.field || 'not_enrolled';
            const colors = { enrolled: { bg: '#dcfce7', border: '#22c55e', text: '#16a34a', label: 'Enrolled' }, pending: { bg: '#fef3c7', border: '#f59e0b', text: '#b45309', label: 'Pending' }, not_enrolled: { bg: '#fee2e2', border: '#ef4444', text: '#dc2626', label: 'Not Enrolled' } };
            const c = colors[status] || colors.not_enrolled;
            return `<div style="padding:16px;border:2px solid ${c.border};border-radius:14px;background:${c.bg};">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="font-weight:700;font-size:14px;color:var(--gray-800);">${e.label}</div>
                <span style="padding:3px 10px;border-radius:8px;font-size:11px;font-weight:700;background:${c.border};color:#fff;">${c.label}</span>
              </div>
              <div style="font-size:12px;color:var(--gray-500);margin-bottom:8px;">${e.desc}</div>
              ${status === 'enrolled' ? `<div style="font-size:11px;color:${c.text};">Effective: ${formatDateDisplay(payer[e.key + 'EffectiveDate'] || payer[e.key + '_effective_date']) || '—'}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
          <div style="padding:12px 16px;border:1px solid var(--gray-200);border-radius:10px;background:var(--gray-50);">
            <div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:4px;">CLEARINGHOUSE</div>
            <div style="font-size:14px;font-weight:600;color:var(--gray-800);">${escHtml(payer.clearinghouse || payer.clearingHouse || '—')}</div>
          </div>
          <div style="padding:12px 16px;border:1px solid var(--gray-200);border-radius:10px;background:var(--gray-50);">
            <div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:4px;">EDI PAYER ID</div>
            <div style="font-size:14px;font-weight:600;font-family:monospace;color:var(--gray-800);">${escHtml(payer.ediPayerId || payer.edi_payer_id || '—')}</div>
          </div>
        </div>
        ${!(payer.ediStatus || payer.edi_status) && !(payer.eraStatus || payer.era_status) && !(payer.eftStatus || payer.eft_status) ? `
        <div style="margin-top:14px;padding:10px 14px;background:#fef3c7;border-radius:10px;font-size:12px;color:#b45309;font-weight:500;">
          No EDI/ERA/EFT enrollment data on file. Click "Edit" to set up electronic billing enrollment for this payer.
        </div>` : ''}
      </div>
    </div>

    <!-- Claims Performance -->
    <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Claims Performance</h3></div>
      <div class="card-body">
        ${payerClaims.length > 0 ? `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
          <div class="pd-stat" style="border-left:3px solid #22c55e;"><div class="pd-val" style="color:#16a34a;">${claimsPaid}</div><div class="pd-lbl">Paid</div></div>
          <div class="pd-stat" style="border-left:3px solid #ef4444;"><div class="pd-val" style="color:#dc2626;">${claimsDenied}</div><div class="pd-lbl">Denied</div></div>
          <div class="pd-stat" style="border-left:3px solid #f59e0b;"><div class="pd-val" style="color:#d97706;">${claimsPending}</div><div class="pd-lbl">Pending</div></div>
          <div class="pd-stat" style="border-left:3px solid #7c3aed;"><div class="pd-val" style="color:#7c3aed;">${avgDaysToPay !== null ? avgDaysToPay + 'd' : '—'}</div><div class="pd-lbl">Avg Days to Pay</div></div>
        </div>
        ${topDenialReasons.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:var(--gray-700);margin-bottom:8px;">Top Denial Reasons</div>
          ${topDenialReasons.map(([reason, count]) => {
            const pct = Math.round((count / Math.max(claimsDenied, 1)) * 100);
            return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <div style="width:200px;font-size:11px;font-weight:500;color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escAttr(reason)}">${escHtml(reason)}</div>
              <div style="flex:1;height:6px;background:var(--gray-200);border-radius:3px;"><div style="width:${pct}%;height:100%;background:#ef4444;border-radius:3px;"></div></div>
              <div style="font-size:11px;font-weight:600;color:var(--gray-500);min-width:40px;">${count}</div>
            </div>`;
          }).join('')}
        </div>` : ''}
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
              <td><span class="badge badge-${(c.status||'').toLowerCase()==='paid'?'approved':(c.status||'').toLowerCase()==='denied'?'denied':'pending'}" style="font-size:9px;">${c.status||'—'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : '<div style="padding:20px;text-align:center;color:var(--gray-400);">No claims data for this payer yet.</div>'}
      </div>
    </div>

    <!-- Follow-ups & Activity -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
        <div class="card-header"><h3>Follow-ups (${payerFollowups.length})</h3></div>
        <div class="card-body">
          ${payerFollowups.length > 0 ? payerFollowups.slice(0, 8).map(f => `
            <div style="padding:8px 10px;border-bottom:1px solid var(--gray-100);font-size:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;color:var(--gray-800);">${escHtml(f.subject || f.type || 'Follow-up')}</span>
                <span class="badge badge-${f.status === 'completed' || f.status === 'done' ? 'approved' : 'pending'}" style="font-size:9px;">${f.status || 'open'}</span>
              </div>
              <div style="color:var(--gray-500);font-size:11px;margin-top:2px;">${formatDateDisplay(f.dueDate || f.due_date) || '—'} · ${escHtml((f.notes || '').substring(0, 60))}</div>
            </div>
          `).join('') : '<div style="padding:20px;text-align:center;color:var(--gray-400);font-size:12px;">No follow-ups.</div>'}
        </div>
      </div>

      <div class="card pd-section" style="border-radius:16px;overflow:hidden;">
        <div class="card-header"><h3>Resources</h3></div>
        <div class="card-body">
          <div style="font-size:13px;color:var(--gray-600);line-height:2;">
            ${payer.portalUrl ? `<div><strong>Portal:</strong> <a href="${escAttr(payer.portalUrl)}" target="_blank" style="color:var(--brand-600);">${escHtml(payer.portalUrl)}</a></div>` : ''}
            ${payer.phone ? `<div><strong>Provider Relations:</strong> ${escHtml(payer.phone)}</div>` : ''}
            ${payer.email ? `<div><strong>Email:</strong> ${escHtml(payer.email)}</div>` : ''}
            ${!payer.portalUrl && !payer.phone && !payer.email ? '<div style="color:var(--gray-400);">No contact information on file.</div>' : ''}
          </div>
          ${payerFacilities.length > 0 ? `
          <div style="margin-top:12px;border-top:1px solid var(--gray-200);padding-top:10px;">
            <div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:6px;">LINKED FACILITIES</div>
            ${payerFacilities.map(f => `<div style="font-size:12px;color:var(--gray-700);padding:3px 0;">${escHtml(f.name || '')} <span style="color:var(--gray-400);">— ${escHtml(f.city || '')} ${escHtml(f.state || '')}</span></div>`).join('')}
          </div>` : ''}
        </div>
      </div>
    </div>
  `;
}
