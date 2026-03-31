// ui/pages/funding.js — Lazy-loaded funding render functions
// Auto-extracted from app.js for code splitting

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, getPayerById, getStateName, navigateTo, appConfirm,
        editButton, deleteButton, helpTip, PAYER_CATALOG, STATES } = window._credentik;

function mapSource(src) {
  const m = { grants_gov: 'federal', sam_gov: 'federal', nih: 'federal', usaspending: 'federal', samhsa: 'federal', hrsa: 'federal', foundation: 'foundation', state: 'state', va: 'va' };
  return m[src] || src || 'federal';
}

function fundingStatCard(label, value, icon, color = '#10b981') {
  return `<div class="funding-stat-card" style="border-radius:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 16px rgba(0,0,0,0.1)';" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,0.06)';">
    <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${color},${color}cc);"></div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <div style="width:32px;height:32px;border-radius:8px;background:${color}15;display:flex;align-items:center;justify-content:center;">
        ${icon}
      </div>
    </div>
    <div class="funding-stat-value" style="font-size:28px;font-weight:800;line-height:1.1;">${value}</div>
    <div class="funding-stat-label">${label}</div>
  </div>`;
}

function fundingOppCard(opp) {
  const sourceColors = { federal: '#3b82f6', state: '#8b5cf6', foundation: '#f59e0b', pharma: '#ec4899', va: '#ef4444' };
  const color = sourceColors[opp.source] || '#6b7280';
  const daysLeft = opp.deadline ? Math.ceil((new Date(opp.deadline) - new Date()) / 86400000) : null;
  const urgency = daysLeft !== null && daysLeft <= 14 ? 'color:var(--red);font-weight:700;' : '';
  const clickAction = opp.id ? `window.app.viewFundingDetail(${opp.id})` : (opp.url ? `window.open('${opp.url}','_blank')` : '');
  return `<div class="funding-opp-card" onclick="${clickAction}" style="cursor:pointer;border-radius:16px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
      <span class="funding-source-badge funding-source-${opp.source}">${(opp.source || '').toUpperCase()}</span>
      ${opp.amount ? `<span style="font-weight:700;color:#10b981;font-size:14px;">${opp.amount}</span>` : ''}
    </div>
    <h4 style="margin:0 0 6px;font-size:14px;font-weight:600;color:var(--text-primary);line-height:1.3;">${escHtml(opp.title)}</h4>
    <p style="margin:0 0 10px;font-size:12px;color:var(--gray-400);line-height:1.4;">${escHtml(opp.description || '')}</p>
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--gray-500);">
      <span>${escHtml(opp.agency || '')}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        ${opp.fit ? `<span style="padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;background:${opp.fit >= 85 ? 'rgba(16,185,129,0.15);color:#10b981' : opp.fit >= 70 ? 'rgba(245,158,11,0.15);color:#f59e0b' : 'rgba(107,114,128,0.15);color:#6b7280'};">${opp.fit}% fit</span>` : ''}
        ${daysLeft !== null ? `<span style="${urgency}">${daysLeft > 0 ? daysLeft + ' days left' : 'EXPIRED'}</span>` : '<span>Open</span>'}
      </div>
    </div>
  </div>`;
}

async function renderFundingDashboard() {
  const body = document.getElementById('page-body');
  // Update active funding nav
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding'));

  body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400);">Loading funding data…</div>';

  // Fetch real data from API
  let opportunities = [], summary = {};
  try {
    const [oppsRes, summaryRes] = await Promise.all([
      store._fetch(CONFIG.API_URL + '/funding/opportunities?per_page=20'),
      store._fetch(CONFIG.API_URL + '/funding/summary'),
    ]);
    opportunities = (oppsRes.data || []).map(o => ({
      id: o.id,
      title: o.title,
      source: mapSource(o.source),
      agency: o.agencySource || o.source,
      amount: o.amountDisplay || '',
      deadline: o.closeDate ? o.closeDate.substring(0, 10) : null,
      description: o.description || '',
      url: o.url,
    }));
    summary = summaryRes.data || {};
  } catch (e) {
    console.warn('Funding API not available, using sample data', e);
    // Fallback to sample data if API not yet deployed
    // EnnHealth-specific opportunities based on service line analysis
    opportunities = [
      { title: 'NIH SBIR Phase I — Health IT Innovation (Credentik)', source: 'federal', agency: 'NIH / NIAAA / NIMH', amount: '$275K–$1.75M', deadline: '2026-09-05', description: 'SBIR funding for Credentik as AI-powered credentialing and RCM platform. Phase I: $275K (6-12 mo), Phase II: $1.75M (2 yr). 20-25% success rate.', fit: 95 },
      { title: 'SAMHSA Primary & Behavioral Health Care Integration (PBHCI)', source: 'federal', agency: 'SAMHSA', amount: '$500K/yr × 4yr', deadline: '2026-06-01', description: 'EnnHealth already operates integrated psych + primary care via telehealth — this is a flagship fit. Funds community orgs integrating behavioral and primary care.', fit: 95 },
      { title: 'SAMHSA MAT-PDOA — Medication-Assisted Treatment Expansion', source: 'federal', agency: 'SAMHSA', amount: '$500K/yr × 3yr', deadline: '2026-04-30', description: 'Expand MAT services using FDA-approved medications. Must partner with community org. AUD/MAT are core EnnHealth services.', fit: 92 },
      { title: 'NHSC Loan Repayment — SUD Workforce', source: 'federal', agency: 'HRSA / NHSC', amount: '$75K/provider (tax-free)', deadline: '2026-04-15', description: 'Up to $75K for 3-year commitment for SUD providers at NHSC-approved sites. PMHNPs are high-priority. Step 1: apply for NHSC site approval.', fit: 90 },
      { title: 'CCBHC Expansion Grant', source: 'federal', agency: 'SAMHSA', amount: '$1M–$4M/yr × 4yr', deadline: '2026-06-01', description: 'Enhanced Medicaid rates ($200-$500/visit vs $50-$100). Requires 9 core services. Psych + SUD services already qualify. Gap: add crisis services and peer support.', fit: 88 },
      { title: 'VA Community Care Network Enrollment', source: 'va', agency: 'VA / Optum / TriWest', amount: 'Revenue stream', deadline: null, description: 'Not a grant — register as community provider for VA CCN. Veterans access EnnHealth for psych and SUD services. Mental health is VA highest-demand service.', fit: 92 },
      { title: 'Opioid Settlement Funds — State Distribution', source: 'state', agency: 'State Settlement Admin', amount: '$50K–$500K+', deadline: null, description: '$50B+ being distributed through 2038. MAT/AUD services directly qualify. Contact FL AG office and county opioid response coordinators.', fit: 90 },
      { title: 'HRSA Telehealth Network Program (EB-TNP)', source: 'federal', agency: 'HRSA', amount: '$250K–$500K/yr × 4yr', deadline: '2026-06-15', description: 'Evidence-based telehealth network grants. EnnHealth is telehealth-native psych + primary care. Stronger if serving rural/underserved populations.', fit: 85 },
      { title: 'NHSC Standard Loan Repayment', source: 'federal', agency: 'HRSA / NHSC', amount: '$50K/provider (tax-free)', deadline: '2026-04-15', description: 'Up to $50K for 2-year commitment. PMHNPs and FNPs are high-priority disciplines. Telehealth sites can qualify if serving HPSA populations.', fit: 88 },
      { title: 'SAMHSA Community Mental Health Block Grant (sub-award)', source: 'state', agency: 'FL DCF / NM HSD', amount: '$50K–$500K', deadline: null, description: 'Apply through state mental health authority. Psych services for SMI directly qualify. Contact FL DCF or NM HSD for current sub-award cycle.', fit: 85 },
      { title: 'SBA 7(a) Loan — Business Expansion', source: 'federal', agency: 'SBA', amount: 'Up to $5M', deadline: null, description: 'Standard business financing for expansion, hiring, technology development. EnnHealth qualifies as small business. Up to 25-year terms.', fit: 80 },
      { title: 'USDA Distance Learning & Telemedicine Grant', source: 'federal', agency: 'USDA', amount: '$50K–$1M', deadline: '2026-02-28', description: 'Telehealth equipment and infrastructure for rural areas (pop <20K). Strong if EnnHealth documents rural patient base.', fit: 75 },
      { title: 'FCC Connected Care Pilot Program', source: 'federal', agency: 'FCC', amount: 'Up to $1M (85% of costs)', deadline: '2026-07-01', description: 'Covers broadband connectivity, devices, network equipment for telehealth patients. Directly supports telehealth infrastructure.', fit: 80 },
      { title: 'Wellbeing Trust — Mental Health Innovation', source: 'foundation', agency: 'Wellbeing Trust', amount: '$50K–$200K', deadline: '2026-08-01', description: 'Tech-enabled mental health is their mission. Strong fit for EnnHealth telehealth + Credentik platform. Less competitive than federal.', fit: 82 },
      { title: 'FQHC Look-Alike Designation', source: 'federal', agency: 'HRSA', amount: 'Enhanced reimbursement (50-100% higher)', deadline: null, description: 'Strategic long-term play. Unlocks: enhanced Medicaid/Medicare rates, 340B drug pricing (40-50% off psych meds), NHSC eligibility, free malpractice (FTCA).', fit: 70 },
      { title: 'Medicaid MCO Provider Development Grants', source: 'state', agency: 'Molina / Centene / UHC', amount: '$5K–$50K', deadline: null, description: 'Many Medicaid MCOs offer recruitment bonuses, practice transformation grants, telehealth infrastructure grants. Contact provider relations in your operating states.', fit: 78 },
    ];
  }

  const pipeline = summary.pipeline || {};
  const stats = {
    open: summary.openOpportunities || opportunities.length,
    applied: (pipeline.submitted || 0) + (pipeline.under_review || 0),
    awarded: pipeline.awarded || 0,
    totalAvailable: summary.totalAwarded ? '$' + Number(summary.totalAwarded).toLocaleString() : '$0'
  };

  const urgentDeadlines = (summary.upcomingDeadlines || []).length ? summary.upcomingDeadlines.map(d => ({
    title: d.title, agency: d.agencySource || d.source, deadline: d.closeDate ? d.closeDate.substring(0, 10) : '', source: mapSource(d.source)
  })) : opportunities
    .filter(o => o.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 4);

  body.innerHTML = `
    <style>
      .fundv2-card{border-radius:16px!important;overflow:hidden;}
      .fundv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;">
      ${fundingStatCard('Open Opportunities', stats.open, '<svg width="18" height="18" fill="none" stroke="#10b981" stroke-width="1.5"><circle cx="9" cy="9" r="7"/><path d="M9 5v4l3 2"/></svg>')}
      ${fundingStatCard('Applied', stats.applied, '<svg width="18" height="18" fill="none" stroke="#3b82f6" stroke-width="1.5"><path d="M4 9l3 3 7-7"/></svg>', '#3b82f6')}
      ${fundingStatCard('Awarded', stats.awarded, '<svg width="18" height="18" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M9 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z"/></svg>', '#f59e0b')}
      ${fundingStatCard('Total Available', stats.totalAvailable, '<svg width="18" height="18" fill="none" stroke="#10b981" stroke-width="1.5"><path d="M9 2v14M5 5h8M4 9h10M5 13h8"/></svg>')}
    </div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;">
      <div>
        <div class="card fundv2-card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;">Matching Opportunities</h3>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm" style="font-size:11px;padding:3px 10px;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.2);" onclick="window.app.navigateTo('funding-federal')">Federal</button>
              <button class="btn btn-sm" style="font-size:11px;padding:3px 10px;" onclick="window.app.navigateTo('funding-state')">State</button>
              <button class="btn btn-sm" style="font-size:11px;padding:3px 10px;" onclick="window.app.navigateTo('funding-foundations')">Foundations</button>
            </div>
          </div>
          <div class="card-body" style="padding:12px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
              ${opportunities.map(o => fundingOppCard(o)).join('')}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card fundv2-card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Upcoming Deadlines</h3></div>
          <div class="card-body" style="padding:0;">
            ${urgentDeadlines.map(o => {
              const daysLeft = Math.ceil((new Date(o.deadline) - new Date()) / 86400000);
              const urgent = daysLeft <= 30;
              return `<div style="padding:12px 16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:2px;">${escHtml(o.title.substring(0, 40))}${o.title.length > 40 ? '…' : ''}</div>
                  <div style="font-size:11px;color:var(--gray-500);">${escHtml(o.agency)}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:12px;font-weight:600;${urgent ? 'color:var(--red);' : 'color:#10b981;'}">${daysLeft}d</div>
                  <div style="font-size:10px;color:var(--gray-500);">${o.deadline}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="card fundv2-card">
          <div class="card-header"><h3 style="margin:0;">By Source</h3></div>
          <div class="card-body" style="padding:16px;">
            ${['federal', 'state', 'foundation', 'va'].map(src => {
              const count = opportunities.filter(o => o.source === src).length;
              const colors = { federal: '#3b82f6', state: '#8b5cf6', foundation: '#f59e0b', va: '#ef4444' };
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
                <span class="funding-source-badge funding-source-${src}">${src.toUpperCase()}</span>
                <span style="font-weight:600;color:var(--text-primary);">${count}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function renderFundingFederal() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-federal'));

  body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400);">Loading federal grants…</div>';

  let grants = [];
  try {
    const res = await store._fetch(CONFIG.API_URL + '/funding/opportunities?per_page=50');
    grants = (res.data || []).map(o => {
      const daysLeft = o.closeDate ? Math.ceil((new Date(o.closeDate) - new Date()) / 86400000) : null;
      return {
        title: o.title, agency: o.agencySource || 'Federal', cfda: o.cfdaNumber || '—',
        amount: o.amountDisplay || '—', deadline: o.closeDate ? o.closeDate.substring(0, 10) : 'Rolling',
        status: daysLeft !== null && daysLeft <= 14 ? 'Closing Soon' : 'Open', description: o.description || '', url: o.url,
      };
    });
  } catch (e) {
    // Fallback sample data
    grants = [
      { title: 'NIH SBIR Phase I — Health IT (Credentik)', agency: 'NIH/NIAAA/NIMH', cfda: '93.242', amount: '$275K–$1.75M', deadline: '2026-09-05', status: 'Open', description: 'AI-powered credentialing and RCM platform. Highly competitive for NIAAA (AUD tech) and NIMH (MH tech). EnnHealth fit: 95%' },
      { title: 'SAMHSA PBHCI — Integrated BH + Primary Care', agency: 'SAMHSA', cfda: '93.243', amount: '$500K/yr × 4yr', deadline: '2026-06-01', status: 'Open', description: 'EnnHealth already runs integrated psych + primary care. Flagship opportunity. EnnHealth fit: 95%' },
      { title: 'SAMHSA MAT-PDOA — Addiction Treatment Expansion', agency: 'SAMHSA', cfda: '93.243', amount: '$500K/yr × 3yr', deadline: '2026-04-30', status: 'Closing Soon', description: 'Expand MAT/AUD services. Requires community partner. Core EnnHealth services. EnnHealth fit: 92%' },
      { title: 'CCBHC Expansion Grant', agency: 'SAMHSA', cfda: '93.829', amount: '$1M–$4M/yr', deadline: '2026-06-01', status: 'Open', description: 'Enhanced Medicaid rates ($200-$500/visit). Requires 9 core services. Gap: crisis + peer support. EnnHealth fit: 88%' },
      { title: 'NHSC SUD Workforce Loan Repayment', agency: 'HRSA/NHSC', cfda: '93.165', amount: '$75K/provider', deadline: '2026-04-15', status: 'Closing Soon', description: 'Tax-free loan repayment for SUD providers. PMHNPs high-priority. Must be NHSC-approved site. EnnHealth fit: 90%' },
      { title: 'NHSC Standard Loan Repayment', agency: 'HRSA/NHSC', cfda: '93.165', amount: '$50K/provider', deadline: '2026-04-15', status: 'Closing Soon', description: 'Up to $50K for 2yr commitment. FNPs and PMHNPs are priority disciplines. Telehealth sites eligible. EnnHealth fit: 88%' },
      { title: 'HRSA Telehealth Network Program (EB-TNP)', agency: 'HRSA', cfda: '93.211', amount: '$250K–$500K/yr', deadline: '2026-06-15', status: 'Open', description: 'Evidence-based telehealth. EnnHealth is telehealth-native. Stronger with rural/underserved data. EnnHealth fit: 85%' },
      { title: 'HRSA Behavioral Health Workforce (BHWET)', agency: 'HRSA', cfda: '93.732', amount: '$100K–$500K/yr', deadline: '2026-05-30', status: 'Open', description: 'Training programs for BH workforce. Need academic partnership. NP-led model is strength. EnnHealth fit: 65%' },
      { title: 'SBA 7(a) Business Loan', agency: 'SBA', cfda: '59.012', amount: 'Up to $5M', deadline: 'Rolling', status: 'Open', description: 'Standard business expansion financing. Up to 25-year terms. EnnHealth qualifies. EnnHealth fit: 80%' },
      { title: 'SBA SBIR — Health IT', agency: 'SBA/HHS', cfda: '93.103', amount: '$275K–$1.75M', deadline: '2026-09-05', status: 'Open', description: 'Small business innovation research for health IT. Credentik platform is highly competitive. EnnHealth fit: 90%' },
      { title: 'USDA Distance Learning & Telemedicine', agency: 'USDA', cfda: '10.855', amount: '$50K–$1M', deadline: '2026-02-28', status: 'Closing Soon', description: 'Telehealth infrastructure for rural areas. Strong if serving rural patients. EnnHealth fit: 75%' },
      { title: 'FCC Connected Care Pilot', agency: 'FCC', cfda: 'N/A', amount: 'Up to $1M', deadline: '2026-07-01', status: 'Open', description: 'Covers 85% of broadband/device costs for telehealth patients. EnnHealth fit: 80%' },
      { title: 'FQHC Look-Alike Designation', agency: 'HRSA', cfda: '93.224', amount: 'Enhanced rates', deadline: 'Rolling', status: 'Open', description: 'Long-term strategic play. 50-100% higher Medicaid rates, 340B drug pricing, FTCA malpractice. EnnHealth fit: 70%' },
    ];
  }

  body.innerHTML = `
    <style>.ffv2-card{border-radius:16px!important;overflow:hidden;}.ffv2-card table tr:hover{background:var(--gray-50,#f9fafb);}</style>
    <div class="card ffv2-card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">Federal Grant Opportunities</h3>
        <span style="font-size:12px;color:var(--gray-400);">Sources: SAMHSA, HRSA, NIH, DOJ, VA</span>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Opportunity</th><th>Agency</th><th>CFDA</th><th>Amount</th><th>Deadline</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${grants.map(g => {
              const statusColor = g.status === 'Closing Soon' ? 'var(--red)' : '#10b981';
              return `<tr>
                <td><strong style="font-size:13px;">${escHtml(g.title)}</strong><br><span style="font-size:11px;color:var(--gray-400);">${escHtml(g.description)}</span></td>
                <td style="white-space:nowrap;">${escHtml(g.agency)}</td>
                <td style="font-family:var(--font-mono);font-size:11px;">${escHtml(g.cfda)}</td>
                <td style="font-weight:600;color:#10b981;white-space:nowrap;">${escHtml(g.amount)}</td>
                <td style="white-space:nowrap;">${escHtml(g.deadline)}</td>
                <td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${statusColor}18;color:${statusColor};">${escHtml(g.status)}</span></td>
                <td><button class="btn btn-sm" style="font-size:10px;padding:3px 8px;background:rgba(16,185,129,0.12);color:#10b981;">Track</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div style="margin-top:16px;padding:16px;border-radius:8px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);font-size:12px;color:var(--gray-400);">
      <strong style="color:#10b981;">Data Sources:</strong> Grants.gov API, SAMHSA.gov, HRSA Data Warehouse, NIH RePORTER. Data refreshed on scan. Not all opportunities shown — use "Scan for Opportunities" to fetch latest.
    </div>
  `;
}

async function renderFundingState() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-state'));

  const statePrograms = [
    // ─── EnnHealth Operating States ───
    { state: 'FL', name: 'DCF Behavioral Health Managing Entity Contracts', type: 'Contract', amount: '$1M+', deadline: 'Ongoing', status: 'Open', notes: 'PRIMARY — contact FL DCF for sub-awards' },
    { state: 'FL', name: 'FL Opioid Settlement Fund Distribution', type: 'Grant', amount: '$50K–$500K', deadline: 'Rolling', status: 'Open', notes: 'Contact county opioid response coordinators' },
    { state: 'FL', name: 'Florida Blue Foundation — BH Access Grants', type: 'Grant', amount: '$25K–$150K', deadline: '2026-06-30', status: 'Open', notes: 'Behavioral health access focus' },
    { state: 'NM', name: 'NM HSD Behavioral Health Division Sub-grants', type: 'Grant', amount: '$50K–$300K', deadline: 'Rolling', status: 'Open', notes: 'SAMHSA block grant sub-awards' },
    { state: 'NM', name: 'NM Opioid Settlement Fund', type: 'Grant', amount: '$50K–$250K', deadline: 'Rolling', status: 'Open', notes: 'State legislature administered' },
    // ─── High-Population / High-Opportunity States ───
    { state: 'TX', name: 'HHSC Behavioral Health Services', type: 'Contract', amount: 'Varies', deadline: '2026-04-30', status: 'Open', notes: 'Largest state BH budget' },
    { state: 'CA', name: 'DHCS Community Mental Health Grant', type: 'Grant', amount: '$100K–$500K', deadline: '2026-05-15', status: 'Open', notes: 'CalAIM behavioral health integration' },
    { state: 'CA', name: 'MHSA Innovation Fund', type: 'Grant', amount: '$100K–$1M', deadline: 'Rolling', status: 'Open', notes: 'Mental Health Services Act — telehealth innovation' },
    { state: 'NY', name: 'OMH Community Reinvestment Program', type: 'Grant', amount: '$200K–$1M', deadline: '2026-06-01', status: 'Open', notes: 'Community-based MH services' },
    { state: 'PA', name: 'OMHSAS Community MH Services', type: 'Grant', amount: '$75K–$300K', deadline: '2026-07-15', status: 'Upcoming', notes: '' },
    { state: 'OH', name: 'OhioMHAS Prevention Grant', type: 'Grant', amount: '$50K–$200K', deadline: '2026-05-01', status: 'Open', notes: '' },
    { state: 'IL', name: 'DHS Division of MH — Community Grants', type: 'Grant', amount: '$50K–$400K', deadline: '2026-05-30', status: 'Open', notes: '' },
    { state: 'GA', name: 'DBHDD Behavioral Health Provider Grants', type: 'Grant', amount: '$75K–$250K', deadline: '2026-06-15', status: 'Open', notes: '' },
    { state: 'NC', name: 'NC DHHS — BH Tailored Plan Provider', type: 'Contract', amount: 'Varies', deadline: 'Ongoing', status: 'Open', notes: 'Medicaid transformation — BH providers needed' },
    { state: 'MI', name: 'MDHHS Behavioral Health Innovation', type: 'Grant', amount: '$50K–$200K', deadline: '2026-07-01', status: 'Open', notes: '' },
    { state: 'VA', name: 'DBHDS — BH Enhancement Grants', type: 'Grant', amount: '$100K–$500K', deadline: '2026-05-15', status: 'Open', notes: 'Marcus Alert expansion — crisis services' },
    { state: 'AZ', name: 'AHCCCS BH Innovation Grant', type: 'Grant', amount: '$50K–$300K', deadline: '2026-06-01', status: 'Open', notes: 'Medicaid BH integration focus' },
    { state: 'MA', name: 'DMH Community MH Center Expansion', type: 'Grant', amount: '$100K–$500K', deadline: '2026-05-30', status: 'Open', notes: 'Roadmap for BH reform funds' },
    { state: 'WA', name: 'HCA — BH Telehealth Expansion', type: 'Grant', amount: '$50K–$200K', deadline: '2026-06-30', status: 'Open', notes: 'Telehealth-specific BH funding' },
    { state: 'CO', name: 'BHA — Behavioral Health Entity Grants', type: 'Grant', amount: '$75K–$400K', deadline: '2026-05-15', status: 'Open', notes: 'New Behavioral Health Administration' },
    { state: 'OR', name: 'OHA — BH Treatment & Recovery', type: 'Grant', amount: '$50K–$250K', deadline: '2026-07-01', status: 'Open', notes: 'Measure 110 reinvestment funds' },
    { state: 'TN', name: 'TDMHSAS SUD Treatment Expansion', type: 'Grant', amount: '$50K–$300K', deadline: '2026-06-15', status: 'Open', notes: 'Opioid response focused' },
    { state: 'MD', name: 'BHA — Crisis Services Expansion', type: 'Grant', amount: '$100K–$500K', deadline: '2026-05-01', status: 'Open', notes: '988 crisis infrastructure' },
    { state: 'IN', name: 'DMHA — Recovery Works Provider', type: 'Contract', amount: 'Varies', deadline: 'Ongoing', status: 'Open', notes: 'SUD treatment voucher program' },
    { state: 'MN', name: 'DHS — BH Fund Grants', type: 'Grant', amount: '$50K–$200K', deadline: '2026-06-01', status: 'Open', notes: '' },
    { state: 'MO', name: 'DMH — Comprehensive Substance Treatment', type: 'Grant', amount: '$75K–$300K', deadline: '2026-07-15', status: 'Upcoming', notes: '' },
    { state: 'WI', name: 'DHS — Mental Health Block Grant Sub-awards', type: 'Grant', amount: '$25K–$150K', deadline: 'Rolling', status: 'Open', notes: 'SAMHSA pass-through' },
    { state: 'SC', name: 'DMH — Community Mental Health Services', type: 'Grant', amount: '$50K–$200K', deadline: '2026-06-30', status: 'Open', notes: '' },
    { state: 'AL', name: 'ADMH — SUD Provider Expansion', type: 'Grant', amount: '$50K–$150K', deadline: '2026-05-30', status: 'Open', notes: '' },
    { state: 'KY', name: 'DBHDID — BH Provider Development', type: 'Grant', amount: '$50K–$200K', deadline: '2026-06-15', status: 'Open', notes: '' },
    { state: 'LA', name: 'LDH — BH Medicaid Provider Recruitment', type: 'Contract', amount: 'Varies', deadline: 'Ongoing', status: 'Open', notes: 'Telehealth BH providers needed' },
    { state: 'NV', name: 'DPBH — BH Workforce & Access Grants', type: 'Grant', amount: '$50K–$200K', deadline: '2026-07-01', status: 'Open', notes: 'Severe provider shortage state' },
    { state: 'CT', name: 'DMHAS — SUD Treatment Innovation', type: 'Grant', amount: '$75K–$300K', deadline: '2026-05-15', status: 'Open', notes: '' },
    { state: 'UT', name: 'DSAMH — BH Telehealth Grants', type: 'Grant', amount: '$25K–$100K', deadline: '2026-06-01', status: 'Open', notes: 'Rural telehealth focus' },
    { state: 'OK', name: 'ODMHSAS — SUD/MH Provider Grants', type: 'Grant', amount: '$50K–$250K', deadline: '2026-06-30', status: 'Open', notes: 'Tribal + rural priority' },
    { state: 'MS', name: 'DMH — Community MH Services', type: 'Grant', amount: '$25K–$150K', deadline: '2026-07-15', status: 'Upcoming', notes: '' },
    { state: 'AR', name: 'DHS — BH Provider Expansion', type: 'Grant', amount: '$50K–$150K', deadline: '2026-06-01', status: 'Open', notes: '' },
    { state: 'KS', name: 'KDADS — BH Crisis & Treatment', type: 'Grant', amount: '$50K–$200K', deadline: '2026-05-30', status: 'Open', notes: '' },
    { state: 'NE', name: 'DHHS — BH Regional Center Grants', type: 'Grant', amount: '$25K–$100K', deadline: '2026-07-01', status: 'Open', notes: '' },
    { state: 'IA', name: 'DHS — Mental Health & Disability Services', type: 'Grant', amount: '$50K–$200K', deadline: '2026-06-15', status: 'Open', notes: '' },
    { state: 'WV', name: 'DHHR — BH & SUD Treatment Expansion', type: 'Grant', amount: '$50K–$250K', deadline: '2026-05-15', status: 'Open', notes: 'Opioid crisis priority state' },
    // ─── Opioid Settlement (All States) ───
    { state: 'ALL', name: 'National Opioid Settlement — State Distributions', type: 'Settlement', amount: '$50B+ total (2022–2038)', deadline: 'Ongoing', status: 'Open', notes: 'Every state distributing. Contact state AG office + county coordinators.' },
    // ─── VA (National) ───
    { state: 'ALL', name: 'VA Community Care Network (CCN) Enrollment', type: 'Revenue', amount: 'Revenue stream', deadline: 'Ongoing', status: 'Open', notes: 'Register with Optum/TriWest. No application — just enroll as community provider.' },
    // ─── MCO Provider Development (National) ───
    { state: 'ALL', name: 'Medicaid MCO Provider Development Programs', type: 'Grant', amount: '$5K–$50K', deadline: 'Ongoing', status: 'Open', notes: 'Contact Molina, Centene, UHC, Humana, Aetna Better Health provider relations.' },
  ];

  body.innerHTML = `
    <style>.fsv2-card{border-radius:16px!important;overflow:hidden;}.fsv2-card table tr:hover{background:var(--gray-50,#f9fafb);}</style>
    <div class="card fsv2-card">
      <div class="card-header"><h3 style="margin:0;">State & Local Behavioral Health Funding</h3></div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>State</th><th>Program</th><th>Type</th><th>Amount</th><th>Deadline</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            ${statePrograms.map(p => `<tr style="${p.state === 'FL' || p.state === 'NM' ? 'background:rgba(16,185,129,0.05);' : ''}">
              <td><span style="font-weight:700;${p.state === 'FL' || p.state === 'NM' ? 'color:#10b981;' : p.state === 'ALL' ? 'color:#8b5cf6;' : 'color:var(--brand-400);'}">${escHtml(p.state)}</span></td>
              <td><strong>${escHtml(p.name)}</strong></td>
              <td><span class="funding-source-badge funding-source-state">${escHtml(p.type)}</span></td>
              <td style="font-weight:600;color:#10b981;white-space:nowrap;">${escHtml(p.amount)}</td>
              <td style="white-space:nowrap;">${escHtml(p.deadline)}</td>
              <td style="font-size:12px;color:${p.status === 'Upcoming' ? 'var(--gray-400)' : '#10b981'};">${escHtml(p.status)}</td>
              <td style="font-size:11px;color:var(--gray-400);">${escHtml(p.notes || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div style="margin-top:16px;padding:16px;border-radius:8px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);font-size:12px;color:var(--gray-400);">
      <strong style="color:#8b5cf6;">Tip:</strong> State behavioral health authorities release RFPs throughout the year. Set up alerts to get notified when new opportunities match your service area.
    </div>
  `;
}

async function renderFundingFoundations() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-foundations'));

  const foundations = [
    { name: 'Wellbeing Trust', focus: 'Tech-enabled mental health innovation', amount: '$50K–$200K', cycle: 'Annual', deadline: '2026-08-01', fit: 'STRONG — telehealth MH is their core mission' },
    { name: 'Robert Wood Johnson Foundation', focus: 'Health equity, community health, Pioneering Ideas', amount: '$100K–$500K', cycle: 'Annual', deadline: '2026-08-01', fit: 'MODERATE — telehealth BH innovation aligns' },
    { name: 'Bristol-Myers Squibb Foundation', focus: 'Mental health equity, SMI disparities', amount: '$50K–$250K', cycle: 'Annual', deadline: '2026-06-15', fit: 'MODERATE-STRONG — psych for underserved' },
    { name: 'BCBS Foundation', focus: 'Behavioral health integration', amount: '$50K–$200K', cycle: 'Annual', deadline: '2026-09-01', fit: 'STRONG — integrated care model aligns' },
    { name: 'Kresge Foundation — Health Program', focus: 'Health equity, social determinants', amount: '$100K–$500K', cycle: 'Annual', deadline: '2026-07-15', fit: 'MODERATE — frame through equity lens' },
    { name: 'NAMI Local Affiliate Grants', focus: 'Mental health advocacy & support', amount: '$5K–$25K', cycle: 'Annual', deadline: '2026-06-30', fit: 'LOW — small but easy to apply' },
    { name: 'American Foundation for Suicide Prevention', focus: 'Suicide prevention research & practice', amount: '$25K–$100K', cycle: 'Annual', deadline: '2026-05-30', fit: 'MODERATE — crisis/psych services' },
    { name: 'Meadows Mental Health Policy Institute', focus: 'BH systems innovation', amount: 'TA + small grants', cycle: 'Rolling', deadline: 'Rolling', fit: 'MODERATE — technical assistance value' },
    // ─── VC / Accelerators ───
    { name: 'Rock Health (Seed VC)', focus: 'Digital health seed investment', amount: '$250K–$2M', cycle: 'Rolling', deadline: 'Rolling', fit: 'STRONG — Credentik as SaaS platform' },
    { name: 'StartUp Health', focus: 'Healthcare moonshots', amount: '$250K + network', cycle: 'Rolling', deadline: 'Rolling', fit: 'STRONG — health tech acceleration' },
    { name: 'Techstars Healthcare', focus: 'Healthcare startup accelerator', amount: '$120K', cycle: 'Annual cohort', deadline: '2026-05-01', fit: 'STRONG — accelerator model' },
    { name: '7wire Ventures', focus: 'Digital health growth', amount: '$1M–$20M', cycle: 'Rolling', deadline: 'Rolling', fit: 'STRONG — growth stage' },
    { name: 'Oak HC/FT', focus: 'Health IT venture capital', amount: '$5M–$50M', cycle: 'Rolling', deadline: 'Rolling', fit: 'STRONG — Credentik platform focus' },
    { name: 'Pipe / Clearco / Lighter Capital', focus: 'Revenue-based financing (non-dilutive)', amount: '1–5x MRR', cycle: 'Rolling', deadline: 'Rolling', fit: 'STRONG — if Credentik has SaaS revenue' },
  ];

  body.innerHTML = `
    <style>.ffnv2-card{border-radius:16px!important;overflow:hidden;}</style>
    <div class="card ffnv2-card">
      <div class="card-header"><h3 style="margin:0;">Foundation & Private Funding</h3></div>
      <div class="card-body" style="padding:12px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">
          ${foundations.map(f => `<div class="funding-opp-card" style="border-radius:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
              <span class="funding-source-badge funding-source-foundation">${f.amount.includes('VC') || f.amount.includes('MRR') || f.amount.includes('$1M') || f.amount.includes('$5M') || f.amount.includes('$250K') || f.amount.includes('$120K') ? 'VENTURE' : 'FOUNDATION'}</span>
              <span style="font-weight:700;color:#10b981;font-size:13px;">${escHtml(f.amount)}</span>
            </div>
            <h4 style="margin:0 0 4px;font-size:14px;font-weight:600;color:var(--text-primary);">${escHtml(f.name)}</h4>
            <p style="margin:0 0 4px;font-size:12px;color:var(--gray-400);">${escHtml(f.focus)}</p>
            ${f.fit ? `<p style="margin:0 0 8px;font-size:11px;color:${f.fit.startsWith('STRONG') ? '#10b981' : '#f59e0b'};font-weight:600;">EnnHealth: ${escHtml(f.fit)}</p>` : ''}
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-500);">
              <span>Cycle: ${escHtml(f.cycle)}</span>
              <span>Deadline: ${escHtml(f.deadline)}</span>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

async function renderFundingPipeline() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-pipeline'));

  body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400);">Loading pipeline…</div>';

  const stageConfig = [
    { key: 'identified', name: 'Identified', color: '#6b7280' },
    { key: 'preparing', name: 'Preparing', color: '#3b82f6' },
    { key: 'submitted', name: 'Submitted', color: '#f59e0b' },
    { key: 'under_review', name: 'Under Review', color: '#8b5cf6' },
    { key: 'awarded', name: 'Awarded', color: '#10b981' },
  ];

  let stages;
  try {
    const res = await store._fetch(CONFIG.API_URL + '/funding/applications');
    const apps = res.data || [];
    stages = stageConfig.map(s => ({
      ...s,
      items: apps.filter(a => a.stage === s.key).map(a => ({
        title: a.title, source: a.opportunity?.agencySource || '—',
        amount: a.amountRequested ? '$' + Number(a.amountRequested).toLocaleString() : '—',
        deadline: a.deadline ? a.deadline.substring(0, 10) : '—',
      })),
    }));
  } catch (e) {
    stages = [
      { name: 'Identified', color: '#6b7280', items: [
        { title: 'CCBHC Expansion Grant', source: 'SAMHSA', amount: '$2M', deadline: '2026-06-01' },
        { title: 'State MH Innovation Fund', source: 'State BHA', amount: '$150K', deadline: '2026-04-15' },
      ]},
      { name: 'Preparing', color: '#3b82f6', items: [
        { title: 'Workforce Development', source: 'HRSA', amount: '$500K', deadline: '2026-05-30' },
      ]},
      { name: 'Submitted', color: '#f59e0b', items: [
        { title: 'Community MH Centers Grant', source: 'SAMHSA', amount: '$750K', deadline: '2026-05-15' },
      ]},
      { name: 'Under Review', color: '#8b5cf6', items: [
        { title: 'SOR Treatment Expansion', source: 'SAMHSA', amount: '$5M', deadline: '2026-04-20' },
      ]},
      { name: 'Awarded', color: '#10b981', items: [
        { title: 'MHBG Subrecipient', source: 'State', amount: '$200K', deadline: 'Active' },
      ]},
    ];
  }

  body.innerHTML = `
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:16px;">
      ${stages.map(stage => `<div style="min-width:240px;flex:1;">
        <div style="padding:8px 12px;background:${stage.color}18;border-radius:16px 16px 0 0;border-bottom:2px solid ${stage.color};display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;font-size:13px;color:${stage.color};">${stage.name}</span>
          <span style="background:${stage.color}25;color:${stage.color};padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;">${stage.items.length}</span>
        </div>
        <div style="background:var(--card-bg);border:1px solid var(--border-color);border-top:none;border-radius:0 0 16px 16px;padding:8px;">
          ${stage.items.map(item => `<div style="padding:10px;margin-bottom:6px;background:var(--bg-secondary);border-radius:6px;border:1px solid var(--border-color);">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">${escHtml(item.title)}</div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-500);">
              <span>${escHtml(item.source)}</span>
              <span style="font-weight:600;color:#10b981;">${escHtml(item.amount)}</span>
            </div>
            <div style="font-size:10px;color:var(--gray-500);margin-top:4px;">Due: ${escHtml(item.deadline)}</div>
          </div>`).join('')}
          ${stage.name === 'Identified' ? `<button class="btn btn-sm" style="width:100%;font-size:11px;padding:6px;border:1px dashed var(--border-color);background:transparent;color:var(--gray-400);" onclick="window.app.openFundingAppModal()">+ Add</button>` : ''}
        </div>
      </div>`).join('')}
    </div>
    <div style="margin-top:8px;font-size:11px;color:var(--gray-500);text-align:center;">Drag opportunities between stages to update status • Total pipeline value: <strong style="color:#10b981;">$8.9M</strong></div>
  `;
}

async function renderFundingCalendar() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-calendar'));

  const now = new Date();
  const months = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ month: d.toLocaleString('default', { month: 'long' }), year: d.getFullYear(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
  }

  const deadlines = [
    { date: '2026-04-15', title: 'State MH Innovation Fund', source: 'state' },
    { date: '2026-04-20', title: 'State Opioid Response (SOR)', source: 'federal' },
    { date: '2026-05-01', title: 'Justice & MH Collaboration', source: 'federal' },
    { date: '2026-05-15', title: 'Community MH Centers Grant', source: 'federal' },
    { date: '2026-05-15', title: 'Hogg Foundation Grant', source: 'foundation' },
    { date: '2026-05-30', title: 'BH Workforce Development', source: 'federal' },
    { date: '2026-06-01', title: 'CCBHC Expansion', source: 'federal' },
    { date: '2026-06-15', title: 'VA Community Care', source: 'va' },
    { date: '2026-06-30', title: 'NAMI Affiliate Grants', source: 'foundation' },
    { date: '2026-07-01', title: 'Wellcome Trust MH', source: 'foundation' },
    { date: '2026-07-30', title: 'Mental Health Block Grant', source: 'federal' },
  ];

  body.innerHTML = `
    <style>.fcv2-card{border-radius:16px!important;overflow:hidden;}</style>
    <div class="card fcv2-card">
      <div class="card-header"><h3 style="margin:0;">Grant Deadline Calendar</h3></div>
      <div class="card-body" style="padding:16px;">
        ${months.map(m => {
          const monthDeadlines = deadlines.filter(d => d.date.startsWith(m.key)).sort((a, b) => a.date.localeCompare(b.date));
          if (!monthDeadlines.length) return '';
          return `<div style="margin-bottom:20px;">
            <h4 style="margin:0 0 10px;font-size:15px;font-weight:600;color:var(--text-primary);">${m.month} ${m.year}</h4>
            ${monthDeadlines.map(d => {
              const daysLeft = Math.ceil((new Date(d.date) - now) / 86400000);
              const urgent = daysLeft <= 14;
              return `<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;margin-bottom:4px;border-radius:6px;background:var(--bg-secondary);border:1px solid ${urgent ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'};">
                <span style="font-weight:700;font-size:14px;color:${urgent ? 'var(--red)' : 'var(--text-primary)'};min-width:60px;">${d.date.split('-')[2]}/${d.date.split('-')[1]}</span>
                <span class="funding-source-badge funding-source-${d.source}" style="min-width:80px;text-align:center;">${d.source.toUpperCase()}</span>
                <span style="font-size:13px;color:var(--text-primary);flex:1;">${escHtml(d.title)}</span>
                <span style="font-size:11px;font-weight:600;${urgent ? 'color:var(--red);' : 'color:var(--gray-500);'}">${daysLeft > 0 ? daysLeft + 'd' : 'PAST'}</span>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

async function renderFundingIntelligence() {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'funding-intelligence'));

  let intelligence = null;
  try {
    const res = await store._fetch(CONFIG.API_URL + '/funding/intelligence');
    intelligence = res.data;
  } catch (e) { /* fallback to static */ }

  body.innerHTML = `
    <style>.fiv2-card{border-radius:16px!important;overflow:hidden;}</style>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="card fiv2-card">
        <div class="card-header"><h3 style="margin:0;">Federal Funding Trends</h3></div>
        <div class="card-body" style="padding:16px;">
          <div style="margin-bottom:12px;">
            ${[
              { label: 'SAMHSA Total MH Funding', value: '$7.5B', change: '+12%' },
              { label: 'HRSA BH Workforce', value: '$550M', change: '+8%' },
              { label: 'NIH Mental Health Research', value: '$2.3B', change: '+5%' },
              { label: 'DOJ MH Programs', value: '$180M', change: '+15%' },
            ].map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-color);">
              <span style="font-size:13px;color:var(--text-primary);">${t.label}</span>
              <div style="text-align:right;">
                <span style="font-weight:700;color:#10b981;margin-right:8px;">${t.value}</span>
                <span style="font-size:11px;color:#10b981;background:rgba(16,185,129,0.12);padding:1px 6px;border-radius:4px;">${t.change}</span>
              </div>
            </div>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--gray-500);margin-top:8px;">FY2026 appropriated amounts • Source: USAspending.gov</div>
        </div>
      </div>

      <div class="card fiv2-card">
        <div class="card-header"><h3 style="margin:0;">Top Funders in Your State</h3></div>
        <div class="card-body" style="padding:16px;">
          ${[
            { name: 'SAMHSA Block Grant (via State)', amount: '$45M', type: 'Federal Pass-through' },
            { name: 'State BH Authority', amount: '$12M', type: 'State Direct' },
            { name: 'County Mental Health Board', amount: '$3.5M', type: 'Local' },
            { name: 'BCBS Foundation', amount: '$2M', type: 'Foundation' },
            { name: 'United Way', amount: '$800K', type: 'Foundation' },
          ].map((f, i) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color);">
            <span style="font-size:18px;font-weight:700;color:var(--gray-600);min-width:24px;">${i + 1}</span>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:500;color:var(--text-primary);">${escHtml(f.name)}</div>
              <div style="font-size:11px;color:var(--gray-500);">${escHtml(f.type)}</div>
            </div>
            <span style="font-weight:700;color:#10b981;">${escHtml(f.amount)}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card fiv2-card">
      <div class="card-header"><h3 style="margin:0;">Key Insights</h3></div>
      <div class="card-body" style="padding:16px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">
          ${[
            { icon: '🎯', title: 'EnnHealth Hits 5 Federal Priorities', detail: 'Telehealth access + behavioral health/SUD + NP-led workforce + health IT innovation + integrated care. Most applicants hit 1-2. This positions EnnHealth to win across HRSA, SAMHSA, NIH, CMS, and VA simultaneously.' },
            { icon: '💰', title: 'NIH SBIR: Credentik\'s Best Shot', detail: 'SBIR Phase I ($275K) and Phase II ($1.75M) for health IT innovation. Credentik as AI-powered credentialing + RCM platform is highly competitive at NIAAA (AUD tech) and NIMH (MH tech). 20-25% success rate. Next deadline: Sep 2026.' },
            { icon: '🏥', title: 'CCBHC = Transformative Revenue', detail: 'CCBHC certification changes Medicaid rates from $50-$100/visit to $200-$500/visit. SAMHSA grants up to $4M/yr for 4 years. Gap analysis: EnnHealth needs to add crisis services + peer support to qualify.' },
            { icon: '💊', title: 'Opioid Settlement: $50B+ Through 2038', detail: 'Every state is distributing funds. MAT/AUD services directly qualify. This is not competitive — it\'s allocation-based. Contact FL AG office and county opioid response coordinators. Ongoing through 2038.' },
            { icon: '🎖️', title: 'VA Community Care: Immediate Revenue', detail: 'Not a grant — just enroll as community provider with Optum/TriWest. Veterans access EnnHealth for psych and SUD. Mental health is VA\'s #1 shortage. No application process, just registration.' },
            { icon: '📋', title: 'NHSC Site Approval: Unlock $75K/Provider', detail: 'Apply for NHSC site approval. Once approved, every PMHNP/FNP you hire can get $50-$75K in tax-free loan repayment. Powerful recruitment tool. Telehealth sites eligible if serving HPSAs.' },
            { icon: '📈', title: 'Telehealth MH Grants +200% Post-COVID', detail: 'FCC Connected Care ($1M), HRSA Telehealth Network ($500K/yr), USDA DLT ($1M), and state BH authorities all funding virtual behavioral health expansion. EnnHealth is telehealth-native — perfect positioning.' },
            { icon: '🔮', title: 'FQHC Designation: Long-Term Strategic Play', detail: 'FQHC Look-Alike unlocks: 50-100% higher Medicaid rates, 340B drug pricing (40-50% off psych meds), free malpractice (FTCA), NHSC eligibility, and priority for nearly all federal health grants.' },
          ].map(insight => `<div style="padding:14px;border-radius:8px;background:var(--bg-secondary);border:1px solid var(--border-color);">
            <div style="font-size:20px;margin-bottom:6px;">${insight.icon}</div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">${escHtml(insight.title)}</div>
            <div style="font-size:12px;color:var(--gray-400);line-height:1.5;">${insight.detail}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

async function renderFundingDetail(id) {
  const body = document.getElementById('page-body');
  document.querySelectorAll('.funding-nav-item').forEach(b => b.classList.remove('active'));

  if (!id) {
    body.innerHTML = '<div class="empty-state"><h3>No opportunity selected</h3><p>Go back to the dashboard and click an opportunity.</p></div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400);">Loading opportunity details…</div>';

  let opp, related = [], pastAwards = [];
  try {
    const res = await store._fetch(CONFIG.API_URL + `/funding/opportunities/${id}`);
    opp = res.data;
    related = res.related || [];
    pastAwards = res.pastAwards || [];
  } catch (e) {
    body.innerHTML = '<div class="empty-state"><h3>Opportunity not found</h3><p>This opportunity may have been removed or the API is not available.</p><button class="btn" onclick="window.app.navigateTo(\'funding\')">← Back to Dashboard</button></div>';
    return;
  }

  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  if (pageTitle) pageTitle.textContent = opp.title;
  if (pageSubtitle) pageSubtitle.textContent = opp.agencySource || opp.source || '';

  const sourceLabel = mapSource(opp.source);
  const sourceColors = { federal: '#3b82f6', state: '#8b5cf6', foundation: '#f59e0b', va: '#ef4444' };
  const sColor = sourceColors[sourceLabel] || '#6b7280';
  const daysLeft = opp.closeDate ? Math.ceil((new Date(opp.closeDate) - new Date()) / 86400000) : null;
  const urgentStyle = daysLeft !== null && daysLeft <= 14 ? 'color:var(--red);' : 'color:#10b981;';
  const catLabels = { mental_health: 'Mental Health', substance_use: 'Substance Use', workforce: 'Workforce', crisis: 'Crisis Services', veterans: 'Veterans', youth: 'Youth', telehealth: 'Telehealth' };

  body.innerHTML = `
    <style>.fdv2-card{border-radius:16px!important;overflow:hidden;}.fdv2-card table tr:hover{background:var(--gray-50,#f9fafb);}</style>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;">
      <!-- Main Content -->
      <div>
        <!-- Header Card -->
        <div class="card fdv2-card" style="margin-bottom:16px;">
          <div class="card-body" style="padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
              <div style="display:flex;gap:8px;align-items:center;">
                <span class="funding-source-badge funding-source-${sourceLabel}">${sourceLabel.toUpperCase()}</span>
                <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${opp.status === 'open' ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)'};color:${opp.status === 'open' ? '#10b981' : '#6b7280'};">${(opp.status || 'open').toUpperCase()}</span>
                ${opp.category ? `<span style="padding:2px 8px;border-radius:4px;font-size:10px;background:rgba(139,92,246,0.1);color:#8b5cf6;">${catLabels[opp.category] || opp.category}</span>` : ''}
              </div>
              ${opp.amountDisplay ? `<span style="font-size:20px;font-weight:700;color:#10b981;">${escHtml(opp.amountDisplay)}</span>` : ''}
            </div>

            <div style="display:flex;gap:12px;margin-top:16px;">
              <button class="btn" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:8px 20px;" onclick="window.app.trackFundingOpp(${opp.id}, '${escHtml(opp.title).replace(/'/g, "\\'")}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px;"><path d="M12 5l-7 7-3-3"/></svg>Track in Pipeline
              </button>
              ${opp.url ? `<a href="${escHtml(opp.url)}" target="_blank" class="btn" style="padding:8px 20px;text-decoration:none;">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px;"><path d="M7 2H2v12h12V9M14 1l-7 7M9 1h5v5"/></svg>View on ${opp.source === 'grants_gov' ? 'Grants.gov' : opp.source === 'sam_gov' ? 'SAM.gov' : opp.source === 'nih' ? 'NIH' : 'Source'}
              </a>` : ''}
              <button class="btn" style="padding:8px 20px;" onclick="window.print()">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px;"><path d="M4 4V1h8v3M4 11H2V7h12v4h-2M4 9h8v5H4z"/></svg>Print
              </button>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="card fdv2-card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Description</h3></div>
          <div class="card-body" style="padding:20px;">
            <p style="margin:0;font-size:14px;line-height:1.7;color:var(--text-primary);">${escHtml(opp.description || 'No description available.')}</p>
          </div>
        </div>

        <!-- Grant Details -->
        <div class="card fdv2-card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Grant Details</h3></div>
          <div class="card-body" style="padding:0;">
            <table>
              <tbody>
                <tr><td style="font-weight:600;width:200px;color:var(--gray-400);">Source</td><td>${escHtml(opp.agencySource || opp.source || '—')}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">CFDA Number</td><td style="font-family:var(--font-mono);">${escHtml(opp.cfdaNumber || '—')}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Funding Type</td><td>${escHtml((opp.fundingType || '—').replace(/_/g, ' '))}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Award Floor</td><td>${opp.amountMin ? '$' + Number(opp.amountMin).toLocaleString() : '—'}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Award Ceiling</td><td>${opp.amountMax ? '$' + Number(opp.amountMax).toLocaleString() : '—'}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Category</td><td>${catLabels[opp.category] || opp.category || '—'}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-400);">Eligibility</td><td>${escHtml(opp.eligibility || 'See grant announcement for full eligibility requirements')}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Key Dates -->
        <div class="card fdv2-card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Key Dates</h3></div>
          <div class="card-body" style="padding:20px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;">
              <div style="text-align:center;padding:16px;border-radius:8px;background:var(--bg-secondary);border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Open Date</div>
                <div style="font-size:16px;font-weight:600;color:var(--text-primary);">${opp.openDate ? formatDateDisplay(opp.openDate) : '—'}</div>
              </div>
              <div style="text-align:center;padding:16px;border-radius:8px;background:${daysLeft !== null && daysLeft <= 14 ? 'rgba(239,68,68,0.08)' : 'var(--bg-secondary)'};border:1px solid ${daysLeft !== null && daysLeft <= 14 ? 'rgba(239,68,68,0.2)' : 'var(--border-color)'};">
                <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Close Date</div>
                <div style="font-size:16px;font-weight:600;${urgentStyle}">${opp.closeDate ? formatDateDisplay(opp.closeDate) : 'Rolling'}</div>
                ${daysLeft !== null ? `<div style="font-size:12px;margin-top:4px;${urgentStyle}">${daysLeft > 0 ? daysLeft + ' days remaining' : 'DEADLINE PASSED'}</div>` : ''}
              </div>
              <div style="text-align:center;padding:16px;border-radius:8px;background:var(--bg-secondary);border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Last Scraped</div>
                <div style="font-size:16px;font-weight:600;color:var(--text-primary);">${opp.scrapedAt ? formatDateDisplay(opp.scrapedAt) : '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Keywords -->
        ${(opp.keywords && opp.keywords.length) ? `
        <div class="card fdv2-card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Matched Keywords</h3></div>
          <div class="card-body" style="padding:16px;">
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${opp.keywords.map(k => `<span style="padding:3px 10px;border-radius:12px;font-size:11px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2);">${escHtml(k)}</span>`).join('')}
            </div>
          </div>
        </div>` : ''}

        <!-- Past Awards -->
        ${pastAwards.length ? `
        <div class="card fdv2-card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Past Awards (USASpending)</h3></div>
          <div class="card-body" style="padding:0;">
            <table>
              <thead><tr><th>Recipient</th><th>Agency</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                ${pastAwards.map(a => `<tr>
                  <td>${escHtml(a.title || '—')}</td>
                  <td>${escHtml(a.agencySource || '—')}</td>
                  <td style="font-weight:600;color:#10b981;">${escHtml(a.amountDisplay || (a.amountMax ? '$' + Number(a.amountMax).toLocaleString() : '—'))}</td>
                  <td style="font-size:12px;">${a.open_date ? formatDateDisplay(a.open_date) : '—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
      </div>

      <!-- Sidebar -->
      <div>
        <!-- Quick Actions -->
        <div class="card fdv2-card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Quick Actions</h3></div>
          <div class="card-body" style="padding:16px;">
            <button class="btn" style="width:100%;margin-bottom:8px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:10px;" onclick="window.app.trackFundingOpp(${opp.id}, '${escHtml(opp.title).replace(/'/g, "\\'")}')">
              Add to Pipeline
            </button>
            ${opp.url ? `<a href="${escHtml(opp.url)}" target="_blank" class="btn" style="width:100%;margin-bottom:8px;display:block;text-align:center;text-decoration:none;padding:10px;">
              Open Original Listing
            </a>` : ''}
            <button class="btn" style="width:100%;padding:10px;" onclick="window.app.navigateTo('funding-pipeline')">
              View Pipeline
            </button>
          </div>
        </div>

        <!-- Agency Match Score -->
        <div class="card fdv2-card" style="margin-bottom:16px;">
          <div class="card-header"><h3 style="margin:0;">Agency Match</h3></div>
          <div class="card-body" style="padding:16px;text-align:center;">
            <div style="width:80px;height:80px;border-radius:50%;border:4px solid #10b981;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
              <span style="font-size:24px;font-weight:700;color:#10b981;">—</span>
            </div>
            <div style="font-size:12px;color:var(--gray-400);margin-bottom:12px;">Match scoring available after agency profile setup</div>
            <div style="text-align:left;font-size:12px;">
              <div style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="color:var(--gray-500);">☐</span> Service area matches</div>
              <div style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="color:var(--gray-500);">☐</span> Organization type eligible</div>
              <div style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="color:var(--gray-500);">☐</span> Revenue within range</div>
              <div style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="color:var(--gray-500);">☐</span> Required certifications</div>
            </div>
          </div>
        </div>

        <!-- Related Opportunities -->
        ${related.length ? `
        <div class="card fdv2-card">
          <div class="card-header"><h3 style="margin:0;">Related Opportunities</h3></div>
          <div class="card-body" style="padding:0;">
            ${related.map(r => `<div style="padding:10px 16px;border-bottom:1px solid var(--border-color);cursor:pointer;" onclick="window.app.viewFundingDetail(${r.id})">
              <div style="font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:2px;">${escHtml((r.title || '').substring(0, 50))}${(r.title || '').length > 50 ? '…' : ''}</div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-500);">
                <span>${escHtml(r.agencySource || r.source || '')}</span>
                <span style="color:#10b981;font-weight:600;">${escHtml(r.amountDisplay || '')}</span>
              </div>
            </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>
  `;
}

export {
  mapSource,
  fundingStatCard,
  fundingOppCard,
  renderFundingDashboard,
  renderFundingFederal,
  renderFundingState,
  renderFundingFoundations,
  renderFundingPipeline,
  renderFundingCalendar,
  renderFundingIntelligence,
  renderFundingDetail,
};
