// ui/pages/states.js — Dedicated States page (modeled after Locations/Facilities)
// Shows all US states with license counts, application counts, provider counts, payer coverage

import store from '../../core/store.js';

function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

export async function renderStatesPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  // Parallel fetch all data we need
  const STATES = window.STATES || [];
  const PAYER_CATALOG = window.PAYER_CATALOG || [];
  const TELEHEALTH_POLICIES = window.TELEHEALTH_POLICIES || [];

  const [licRes, appRes, provRes, facRes] = await Promise.allSettled([
    store.getAll('licenses'),
    store.getAll('applications'),
    store.getAll('providers'),
    store.getFacilities(),
  ]);

  const licenses = store.filterByScope((licRes.status === 'fulfilled' ? licRes.value : []) || []);
  const apps = store.filterByScope((appRes.status === 'fulfilled' ? appRes.value : []) || []);
  const providers = store.filterByScope((provRes.status === 'fulfilled' ? provRes.value : []) || []);
  const facilities = store.filterByScope((facRes.status === 'fulfilled' ? facRes.value : []) || []);

  // Build per-state stats
  const stateData = STATES.map(s => {
    const code = s.code || s.abbreviation;
    const stateLicenses = licenses.filter(l => l.state === code);
    const activeLicenses = stateLicenses.filter(l => l.status === 'active');
    const stateApps = apps.filter(a => a.state === code);
    const approvedApps = stateApps.filter(a => a.status === 'approved');
    const pendingApps = stateApps.filter(a => a.status !== 'approved' && a.status !== 'denied');
    const stateFacilities = facilities.filter(f => f.state === code);
    // Unique providers with licenses in this state
    const providerIds = new Set(stateLicenses.map(l => l.providerId || l.provider_id).filter(Boolean));
    // Payers that cover this state
    const statePayers = PAYER_CATALOG.filter(p => Array.isArray(p.states) && (p.states.includes(code) || p.states.includes('ALL')));
    // Telehealth policy
    const telePolicy = TELEHEALTH_POLICIES.find(t => t.state === code);

    return {
      ...s,
      code,
      licenseCount: stateLicenses.length,
      activeLicenseCount: activeLicenses.length,
      appCount: stateApps.length,
      approvedCount: approvedApps.length,
      pendingCount: pendingApps.length,
      facilityCount: stateFacilities.length,
      providerCount: providerIds.size,
      payerCount: statePayers.length,
      telePolicy,
      hasPresence: stateLicenses.length > 0 || stateApps.length > 0 || stateFacilities.length > 0,
    };
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Summary stats
  const activeStates = stateData.filter(s => s.hasPresence).length;
  const totalLicenses = licenses.length;
  const activeLicenses = licenses.filter(l => l.status === 'active').length;
  const totalProvInStates = new Set(licenses.map(l => l.providerId || l.provider_id).filter(Boolean)).size;

  // Region filter
  const regions = [...new Set(STATES.map(s => s.region).filter(Boolean))].sort();
  const selectedRegion = window._stateRegionFilter || '';
  const selectedView = window._stateViewFilter || 'active'; // 'all' or 'active'

  let displayStates = stateData;
  if (selectedView === 'active') displayStates = stateData.filter(s => s.hasPresence);
  if (selectedRegion) displayStates = displayStates.filter(s => s.region === selectedRegion);

  body.innerHTML = `
    <style>
      .stpg-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:20px; }
      .stpg-stat { background:var(--surface-card,#fff); border-radius:16px; padding:18px 16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:transform 0.18s,box-shadow 0.18s; }
      .stpg-stat:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
      .stpg-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      .stpg-stat:nth-child(1)::before { background:linear-gradient(90deg,var(--brand-500),var(--brand-700)); }
      .stpg-stat:nth-child(2)::before { background:linear-gradient(90deg,#22c55e,#16a34a); }
      .stpg-stat:nth-child(3)::before { background:linear-gradient(90deg,#8b5cf6,#6d28d9); }
      .stpg-stat:nth-child(4)::before { background:linear-gradient(90deg,#f59e0b,#d97706); }
      .stpg-stat .stpg-val { font-size:28px; font-weight:800; line-height:1.1; }
      .stpg-stat .stpg-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
      .stpg-pill { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; }
      .stpg-presence { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; }
      .stpg-row:hover { background:var(--gray-50); }
      .stpg-row td { vertical-align:middle; }
    </style>

    <div class="stpg-stats">
      <div class="stpg-stat"><div class="stpg-val" style="color:var(--brand-600);">${STATES.length}</div><div class="stpg-lbl">Total States</div></div>
      <div class="stpg-stat"><div class="stpg-val" style="color:#16a34a;">${activeStates}</div><div class="stpg-lbl">States with Presence</div></div>
      <div class="stpg-stat"><div class="stpg-val" style="color:#7c3aed;">${activeLicenses}<span style="font-size:14px;font-weight:600;color:var(--gray-400);">/${totalLicenses}</span></div><div class="stpg-lbl">Active / Total Licenses</div></div>
      <div class="stpg-stat"><div class="stpg-val" style="color:#d97706;">${totalProvInStates}</div><div class="stpg-lbl">Licensed Providers</div></div>
    </div>

    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header" style="flex-wrap:wrap;gap:8px;">
        <h3>States (${displayStates.length})</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select class="form-control" style="width:auto;height:34px;font-size:12px;border-radius:10px;" onchange="window._stateViewFilter=this.value;window.app.renderStatesTab();">
            <option value="active" ${selectedView === 'active' ? 'selected' : ''}>Active States Only</option>
            <option value="all" ${selectedView === 'all' ? 'selected' : ''}>All 50+ States</option>
          </select>
          <select class="form-control" style="width:auto;height:34px;font-size:12px;border-radius:10px;" onchange="window._stateRegionFilter=this.value;window.app.renderStatesTab();">
            <option value="">All Regions</option>
            ${regions.map(r => `<option value="${escHtml(r)}" ${selectedRegion === r ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}
          </select>
          <input type="text" id="state-search" placeholder="Search states..." class="form-control" style="width:200px;height:34px;font-size:13px;border-radius:10px;" oninput="window.app.filterStates()">
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>State</th>
                <th>Region</th>
                <th>Providers</th>
                <th>Licenses</th>
                <th>Applications</th>
                <th>Locations</th>
                <th>Payers</th>
                <th>Presence</th>
              </tr>
            </thead>
            <tbody id="states-table-body">
              ${displayStates.map(s => {
                const presenceColor = s.hasPresence ? '#16a34a' : '#9ca3af';
                const presenceBg = s.hasPresence ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.12)';
                const presenceLabel = s.hasPresence ? 'Active' : 'None';
                return `
                <tr class="stpg-row" data-name="${escHtml((s.name || '').toLowerCase())}" data-code="${escHtml(s.code)}">
                  <td>
                    <strong style="color:var(--brand-600);cursor:pointer;" onclick="window.app.viewStateDetail('${escHtml(s.code)}')">${escHtml(s.name)}</strong>
                    <br><span style="font-size:10px;color:var(--gray-400);font-family:monospace;">${escHtml(s.code)}</span>
                  </td>
                  <td><span style="font-size:12px;color:var(--gray-600);">${escHtml(s.region || '—')}</span></td>
                  <td>${s.providerCount > 0 ? `<span class="stpg-pill" style="background:rgba(139,92,246,0.1);color:#7c3aed;">${s.providerCount}</span>` : '<span style="font-size:11px;color:var(--gray-400);">0</span>'}</td>
                  <td>${s.activeLicenseCount > 0 ? `<span class="stpg-pill" style="background:rgba(34,197,94,0.1);color:#16a34a;">${s.activeLicenseCount} active</span>` : ''}${s.licenseCount - s.activeLicenseCount > 0 ? `<span class="stpg-pill" style="background:rgba(245,158,11,0.1);color:#d97706;margin-left:4px;">${s.licenseCount - s.activeLicenseCount} other</span>` : ''}${s.licenseCount === 0 ? '<span style="font-size:11px;color:var(--gray-400);">0</span>' : ''}</td>
                  <td>${s.approvedCount > 0 ? `<span class="stpg-pill" style="background:rgba(34,197,94,0.1);color:#16a34a;">${s.approvedCount} approved</span>` : ''}${s.pendingCount > 0 ? `<span class="stpg-pill" style="background:rgba(59,130,246,0.1);color:#2563eb;margin-left:4px;">${s.pendingCount} pending</span>` : ''}${s.appCount === 0 ? '<span style="font-size:11px;color:var(--gray-400);">0</span>' : ''}</td>
                  <td>${s.facilityCount > 0 ? `<span class="stpg-pill" style="background:rgba(139,92,246,0.1);color:#7c3aed;">${s.facilityCount}</span>` : '<span style="font-size:11px;color:var(--gray-400);">0</span>'}</td>
                  <td>${s.payerCount > 0 ? `<span class="stpg-pill" style="background:rgba(59,130,246,0.1);color:#2563eb;">${s.payerCount}</span>` : '<span style="font-size:11px;color:var(--gray-400);">0</span>'}</td>
                  <td><span class="stpg-presence" style="background:${presenceBg};color:${presenceColor};"><span style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>${presenceLabel}</span></td>
                </tr>`;
              }).join('')}
              ${displayStates.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No states match the current filters.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function filterStates() {
  const q = (document.getElementById('state-search')?.value || '').toLowerCase();
  document.querySelectorAll('.stpg-row').forEach(row => {
    const name = row.dataset.name || '';
    const code = (row.dataset.code || '').toLowerCase();
    row.style.display = (name.includes(q) || code.includes(q)) ? '' : 'none';
  });
}
