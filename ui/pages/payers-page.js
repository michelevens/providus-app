// ui/pages/payers-page.js — Dedicated Payers page (modeled after Locations/Facilities)
// Shows all payers with credentialing stats, state coverage, tags, EDI status

import store from '../../core/store.js';

function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

export async function renderPayersPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  const PAYER_CATALOG = window.PAYER_CATALOG || [];
  const PAYER_TAG_DEFS = window.PAYER_TAG_DEFS || {};

  // Fetch apps to compute per-payer credentialing stats
  const [appRes, licRes] = await Promise.allSettled([
    store.getAll('applications'),
    store.getAll('licenses'),
  ]);
  const apps = (appRes.status === 'fulfilled' ? appRes.value : []) || [];
  const licenses = (licRes.status === 'fulfilled' ? licRes.value : []) || [];

  // Build per-payer app stats
  const payerAppMap = {};
  apps.forEach(a => {
    const name = (a.payerName || a.payer_name || '').toLowerCase().trim();
    if (!name) return;
    if (!payerAppMap[name]) payerAppMap[name] = { total: 0, approved: 0, pending: 0, denied: 0 };
    payerAppMap[name].total++;
    if (a.status === 'approved') payerAppMap[name].approved++;
    else if (a.status === 'denied') payerAppMap[name].denied++;
    else payerAppMap[name].pending++;
  });

  // Enrich payer records
  const payers = PAYER_CATALOG.map(p => {
    const key = (p.name || '').toLowerCase().trim();
    const appStats = payerAppMap[key] || { total: 0, approved: 0, pending: 0, denied: 0 };
    const stateCount = Array.isArray(p.states) ? (p.states.includes('ALL') ? 50 : p.states.length) : 0;
    return { ...p, appStats, stateCount };
  });

  // Summary stats
  const totalPayers = payers.length;
  const credentialedPayers = payers.filter(p => p.appStats.approved > 0).length;
  const pendingPayers = payers.filter(p => p.appStats.pending > 0 && p.appStats.approved === 0).length;
  const bhCount = payers.filter(p => p.tags?.includes('behavioral_health')).length;
  const thCount = payers.filter(p => p.tags?.includes('telehealth_friendly')).length;

  // Category labels
  const categoryLabels = {
    national: 'National', behavioral: 'Behavioral Health / EAP',
    bcbs_anthem: 'BCBS — Anthem', bcbs_hcsc: 'BCBS — HCSC',
    bcbs_highmark: 'BCBS — Highmark', bcbs_independent: 'BCBS — Independent',
    regional: 'Regional', medicaid: 'Medicaid', medicare: 'Medicare', other: 'Other',
  };

  // Filter state
  const selectedCategory = window._payerCatFilter || '';
  const selectedStatus = window._payerStatusFilter || 'all';

  let displayPayers = payers;
  if (selectedCategory) displayPayers = displayPayers.filter(p => (p.category || 'other') === selectedCategory);
  if (selectedStatus === 'credentialed') displayPayers = displayPayers.filter(p => p.appStats.approved > 0);
  else if (selectedStatus === 'pending') displayPayers = displayPayers.filter(p => p.appStats.pending > 0 && p.appStats.approved === 0);
  else if (selectedStatus === 'not_started') displayPayers = displayPayers.filter(p => p.appStats.total === 0);

  displayPayers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const categories = [...new Set(payers.map(p => p.category || 'other'))].sort();

  // EDI indicator helper
  const ediDot = (status) => {
    if (status === 'available' || status === true) return '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;" title="Available"></span>';
    if (status === 'partial') return '<span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block;" title="Partial"></span>';
    return '<span style="width:8px;height:8px;border-radius:50%;background:#d1d5db;display:inline-block;" title="N/A"></span>';
  };

  body.innerHTML = `
    <style>
      .pypg-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:20px; }
      .pypg-stat { background:var(--surface-card,#fff); border-radius:16px; padding:18px 16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:transform 0.18s,box-shadow 0.18s; }
      .pypg-stat:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
      .pypg-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      .pypg-stat:nth-child(1)::before { background:linear-gradient(90deg,var(--brand-500),var(--brand-700)); }
      .pypg-stat:nth-child(2)::before { background:linear-gradient(90deg,#22c55e,#16a34a); }
      .pypg-stat:nth-child(3)::before { background:linear-gradient(90deg,#f59e0b,#d97706); }
      .pypg-stat:nth-child(4)::before { background:linear-gradient(90deg,#8b5cf6,#6d28d9); }
      .pypg-stat:nth-child(5)::before { background:linear-gradient(90deg,#0891b2,#06b6d4); }
      .pypg-stat .pypg-val { font-size:28px; font-weight:800; line-height:1.1; }
      .pypg-stat .pypg-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
      .pypg-pill { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; }
      .pypg-tag { display:inline-flex; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:600; margin:1px 2px; }
      .pypg-cat-badge { display:inline-flex; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; background:rgba(139,92,246,0.1); color:#7c3aed; }
      .pypg-row:hover { background:var(--gray-50); }
      .pypg-row td { vertical-align:middle; }
    </style>

    <div class="pypg-stats">
      <div class="pypg-stat"><div class="pypg-val" style="color:var(--brand-600);">${totalPayers}</div><div class="pypg-lbl">Total Payers</div></div>
      <div class="pypg-stat"><div class="pypg-val" style="color:#16a34a;">${credentialedPayers}</div><div class="pypg-lbl">Credentialed</div></div>
      <div class="pypg-stat"><div class="pypg-val" style="color:#d97706;">${pendingPayers}</div><div class="pypg-lbl">Pending</div></div>
      <div class="pypg-stat"><div class="pypg-val" style="color:#7c3aed;">${bhCount}</div><div class="pypg-lbl">Behavioral Health</div></div>
      <div class="pypg-stat"><div class="pypg-val" style="color:#0891b2;">${thCount}</div><div class="pypg-lbl">Telehealth-Friendly</div></div>
    </div>

    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header" style="flex-wrap:wrap;gap:8px;">
        <h3>All Payers (${displayPayers.length})</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select class="form-control" style="width:auto;height:34px;font-size:12px;border-radius:10px;" onchange="window._payerStatusFilter=this.value;window.app.renderPayersTab();">
            <option value="all" ${selectedStatus === 'all' ? 'selected' : ''}>All Payers</option>
            <option value="credentialed" ${selectedStatus === 'credentialed' ? 'selected' : ''}>Credentialed</option>
            <option value="pending" ${selectedStatus === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="not_started" ${selectedStatus === 'not_started' ? 'selected' : ''}>Not Started</option>
          </select>
          <select class="form-control" style="width:auto;height:34px;font-size:12px;border-radius:10px;" onchange="window._payerCatFilter=this.value;window.app.renderPayersTab();">
            <option value="">All Categories</option>
            ${categories.map(c => `<option value="${escHtml(c)}" ${selectedCategory === c ? 'selected' : ''}>${escHtml(categoryLabels[c] || c)}</option>`).join('')}
          </select>
          <input type="text" id="payer-search" placeholder="Search payers..." class="form-control" style="width:220px;height:34px;font-size:13px;border-radius:10px;" oninput="window.app.filterPayerRows()">
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Payer</th>
                <th>Category</th>
                <th>States</th>
                <th>Avg Cred Days</th>
                <th>EDI / ERA / EFT</th>
                <th>Applications</th>
                <th>Tags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="payers-table-body">
              ${displayPayers.map(p => {
                const tags = Array.isArray(p.tags) ? p.tags : [];
                const tagHtml = tags.slice(0, 4).map(t => {
                  const def = PAYER_TAG_DEFS[t];
                  if (!def) return '';
                  return `<span class="pypg-tag" style="background:${def.bg};color:${def.color};">${escHtml(def.label)}</span>`;
                }).join('') + (tags.length > 4 ? `<span class="pypg-tag" style="background:var(--gray-100);color:var(--gray-600);">+${tags.length - 4}</span>` : '');

                const appStat = p.appStats;
                const statesLabel = p.stateCount > 0 ? (p.stateCount >= 50 ? 'National' : `${p.stateCount} states`) : '—';

                // Credentialing status pill
                let credPill = '<span style="font-size:11px;color:var(--gray-400);">—</span>';
                if (appStat.approved > 0) credPill = `<span class="pypg-pill" style="background:rgba(34,197,94,0.1);color:#16a34a;">${appStat.approved} approved</span>`;
                if (appStat.pending > 0) credPill += `<span class="pypg-pill" style="background:rgba(59,130,246,0.1);color:#2563eb;margin-left:4px;">${appStat.pending} pending</span>`;
                if (appStat.denied > 0) credPill += `<span class="pypg-pill" style="background:rgba(239,68,68,0.1);color:#dc2626;margin-left:4px;">${appStat.denied} denied</span>`;

                return `
                <tr class="pypg-row" data-name="${escHtml((p.name || '').toLowerCase())}">
                  <td>
                    <strong style="color:var(--brand-600);cursor:pointer;" onclick="window.app.viewPayerDetail('${escHtml(p.id || p.name)}')">${escHtml(p.name || '—')}</strong>
                    ${p.parentOrg ? '<br><span style="font-size:10px;color:var(--gray-400);">' + escHtml(p.parentOrg) + '</span>' : ''}
                  </td>
                  <td><span class="pypg-cat-badge">${escHtml((categoryLabels[p.category] || p.category || 'other').replace(/BCBS — /, ''))}</span></td>
                  <td><span style="font-size:12px;color:var(--gray-600);">${escHtml(statesLabel)}</span></td>
                  <td>${p.avgCredDays ? `<span style="font-size:13px;font-weight:600;color:${p.avgCredDays > 90 ? '#dc2626' : p.avgCredDays > 60 ? '#d97706' : '#16a34a'};">${p.avgCredDays}d</span>` : '<span style="font-size:11px;color:var(--gray-400);">—</span>'}</td>
                  <td><div style="display:flex;gap:6px;align-items:center;">${ediDot(p.ediStatus)} ${ediDot(p.eraStatus)} ${ediDot(p.eftStatus)}</div></td>
                  <td>${credPill}</td>
                  <td><div style="display:flex;flex-wrap:wrap;max-width:200px;">${tagHtml || '<span style="font-size:11px;color:var(--gray-400);">—</span>'}</div></td>
                  <td>
                    <button class="btn btn-sm" style="font-size:11px;padding:4px 10px;border-radius:8px;" onclick="window.app.viewPayerDetail('${escHtml(p.id || p.name)}')">View</button>
                  </td>
                </tr>`;
              }).join('')}
              ${displayPayers.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No payers match the current filters.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function filterPayerRows() {
  const q = (document.getElementById('payer-search')?.value || '').toLowerCase();
  document.querySelectorAll('.pypg-row').forEach(row => {
    const name = row.dataset.name || '';
    row.style.display = name.includes(q) ? '' : 'none';
  });
}
