// ui/pages/compliance.js — Lazy-loaded compliance render functions
// Auto-extracted from app.js for code splitting

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, getPayerById, getStateName, navigateTo, appConfirm,
        editButton, deleteButton, helpTip, sortArrow, timeAgo,
        PAYER_CATALOG, STATES, APPLICATION_STATUSES, CRED_DOCUMENTS } = window._credentik;

async function renderExclusionsPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading exclusion data...</div></div>';

  let summary = { totalProviders: 0, screened: 0, clear: 0, excluded: 0, needsRecheck: 0, neverScreened: 0, errors: 0 };
  let exclusions = [];
  let providers = [];

  try { summary = await store.getExclusionSummary(); } catch (e) { console.error('Exclusion summary error:', e); }
  try { exclusions = store.filterByScope(await store.getExclusions()); } catch (e) { console.error('Exclusions error:', e); }
  try { providers = store.filterByScope(await store.getAll('providers')); } catch (e) { console.error('Providers error:', e); }

  // Build a map of provider id -> latest exclusion result
  const exclusionMap = {};
  (Array.isArray(exclusions) ? exclusions : []).forEach(ex => {
    const pid = ex.providerId || ex.provider_id;
    if (pid) exclusionMap[pid] = ex;
  });

  const statusBadge = (status) => {
    const colors = { clear: 'approved', excluded: 'denied', pending: 'pending', error: 'inactive', unknown: 'inactive' };
    return `<span class="badge badge-${colors[status] || 'inactive'}">${escHtml(status || 'Not Screened')}</span>`;
  };

  const exclStatusDot = (status) => {
    const m = { clear: { bg: 'rgba(34,197,94,0.12)', color: '#16a34a', text: 'Clear' }, excluded: { bg: 'rgba(239,68,68,0.12)', color: '#dc2626', text: 'Excluded' }, pending: { bg: 'rgba(245,158,11,0.12)', color: '#d97706', text: 'Pending' }, not_screened: { bg: 'rgba(156,163,175,0.12)', color: '#6b7280', text: 'Not Screened' } };
    const s = m[status] || m.not_screened;
    return '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:' + s.bg + ';color:' + s.color + ';"><span style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>' + s.text + '</span>';
  };

  body.innerHTML = `
    <style>
      .exclv2-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:20px; }
      .exclv2-stat { background:var(--surface-card,#fff); border-radius:16px; padding:18px 16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:transform 0.18s,box-shadow 0.18s; }
      .exclv2-stat:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
      .exclv2-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      .exclv2-stat:nth-child(1)::before { background:linear-gradient(90deg,var(--brand-500),var(--brand-700)); }
      .exclv2-stat:nth-child(2)::before { background:linear-gradient(90deg,#3b82f6,#2563eb); }
      .exclv2-stat:nth-child(3)::before { background:linear-gradient(90deg,#22c55e,#16a34a); }
      .exclv2-stat:nth-child(4)::before { background:linear-gradient(90deg,#ef4444,#dc2626); }
      .exclv2-stat:nth-child(5)::before { background:linear-gradient(90deg,#f59e0b,#d97706); }
      .exclv2-stat:nth-child(6)::before { background:linear-gradient(90deg,#6b7280,#4b5563); }
      .exclv2-stat .exclv2-val { font-size:28px; font-weight:800; line-height:1.1; }
      .exclv2-stat .exclv2-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
    </style>

    <!-- V2 Stat Cards -->
    <div class="exclv2-stats">
      <div class="exclv2-stat"><div class="exclv2-val" style="color:var(--brand-600);">${summary.totalProviders || providers.length}</div><div class="exclv2-lbl">Total Screened</div></div>
      <div class="exclv2-stat"><div class="exclv2-val" style="color:#2563eb;">${summary.screened || 0}</div><div class="exclv2-lbl">Screened</div></div>
      <div class="exclv2-stat"><div class="exclv2-val" style="color:#16a34a;">${summary.clear || 0}</div><div class="exclv2-lbl">Clear</div></div>
      <div class="exclv2-stat"><div class="exclv2-val" style="color:#dc2626;">${summary.excluded || 0}</div><div class="exclv2-lbl">Flagged</div></div>
      <div class="exclv2-stat"><div class="exclv2-val" style="color:#d97706;">${summary.needsRecheck || 0}</div><div class="exclv2-lbl">Needs Recheck</div></div>
      <div class="exclv2-stat"><div class="exclv2-val" style="color:#6b7280;">${summary.neverScreened || 0}</div><div class="exclv2-lbl">Never Screened</div></div>
    </div>

    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header">
        <h3>Provider Screening Status</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="excl-search" placeholder="Search providers..." class="form-control" style="width:220px;height:34px;font-size:13px;border-radius:10px;" oninput="window.app.filterExclusions()">
          <select id="excl-status-filter" class="form-control" style="width:140px;height:34px;font-size:13px;border-radius:10px;" onchange="window.app.filterExclusions()">
            <option value="">All Statuses</option>
            <option value="clear">Clear</option>
            <option value="excluded">Excluded</option>
            <option value="pending">Pending</option>
            <option value="not_screened">Not Screened</option>
          </select>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>NPI</th>
                <th>Status</th>
                <th>Last Screened</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="excl-table-body">
              ${providers.map(p => {
                const ex = exclusionMap[p.id];
                const status = ex ? (ex.status || ex.result || 'pending') : 'not_screened';
                const lastScreened = ex ? (ex.screenedAt || ex.screened_at || ex.createdAt || ex.created_at || '') : '';
                const source = ex ? (ex.source || 'OIG/SAM') : '—';
                const name = `${escHtml(p.firstName || p.first_name || '')} ${escHtml(p.lastName || p.last_name || '')}`.trim();
                return `
                <tr class="excl-row" data-name="${name.toLowerCase()}" data-status="${status}">
                  <td><strong>${name}</strong>${p.specialty ? '<br><span class="text-sm text-muted">' + escHtml(p.specialty) + '</span>' : ''}</td>
                  <td><code>${escHtml(p.npi || '—')}</code></td>
                  <td>${exclStatusDot(status)}</td>
                  <td>${lastScreened ? formatDateDisplay(lastScreened) : '<span class="text-muted">Never</span>'}</td>
                  <td class="text-sm text-muted">${escHtml(source)}</td>
                  <td>
                    ${editButton('Screen', `window.app.screenSingleProvider(${p.id})`, 'btn-primary')}
                    ${status === 'excluded' ? '<button class="btn btn-sm btn-danger" onclick="window.app.viewExclusionDetail(' + p.id + ')" style="margin-left:4px;">Details</button>' : ''}
                  </td>
                </tr>`;
              }).join('')}
              ${providers.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-500);">No providers found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function renderCompliancePage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Generating compliance report...</div></div>';

  let report = {};
  let licenses = [];
  let providers = [];
  let exclusionSummary = {};
  let apps = [];
  let exclusions = [];

  try { report = await store.getComplianceReport(); } catch (e) { console.error('Compliance report error:', e); }
  try { licenses = store.filterByScope(await store.getAll('licenses')); } catch (e) {}
  try { providers = store.filterByScope(await store.getAll('providers')); } catch (e) {}
  try { exclusionSummary = await store.getExclusionSummary(); } catch (e) {}
  try { apps = store.filterByScope(await store.getAll('applications')); } catch (e) {}
  try { exclusions = await store.getAll('exclusions'); } catch (e) {}

  const today = new Date();
  const in30 = new Date(Date.now() + 30 * 86400000);
  const in90 = new Date(Date.now() + 90 * 86400000);

  // Compute locally if API report is sparse
  const expiringLicenses30 = licenses.filter(l => {
    if (!l.expirationDate && !l.expiration_date) return false;
    const exp = new Date(l.expirationDate || l.expiration_date);
    return exp > today && exp <= in30;
  });
  const expiringLicenses90 = licenses.filter(l => {
    if (!l.expirationDate && !l.expiration_date) return false;
    const exp = new Date(l.expirationDate || l.expiration_date);
    return exp > today && exp <= in90;
  });
  const expiredLicenses = licenses.filter(l => {
    if (!l.expirationDate && !l.expiration_date) return false;
    return new Date(l.expirationDate || l.expiration_date) < today;
  });

  const expiringMalpractice = report.expiringMalpractice || [];
  const expiringBoards = report.expiringBoards || [];
  const neverScreened = report.neverScreened || [];

  // ─── Compliance Scoring Engine ───
  function computeProviderScore(prov) {
    const provId = prov.id;
    const provLicenses = licenses.filter(l => (l.providerId || l.provider_id) === provId);
    const provApps = apps.filter(a => a.providerId === provId);
    const provExclusions = Array.isArray(exclusions) ? exclusions.filter(e => (e.providerId || e.provider_id) === provId) : [];
    const hasExclusion = provExclusions.some(e => e.status === 'excluded' || e.result === 'excluded');

    let score = 100;
    let issues = [];
    let criticalCount = 0;
    let warningCount = 0;

    // Critical: Expired licenses (-20 each)
    const expLic = provLicenses.filter(l => {
      const exp = l.expirationDate || l.expiration_date;
      return exp && new Date(exp) < today;
    });
    if (expLic.length > 0) {
      score -= expLic.length * 20;
      criticalCount += expLic.length;
      issues.push({ severity: 'critical', text: `${expLic.length} expired license(s)` });
    }

    // Critical: Exclusion flag (-30)
    if (hasExclusion) {
      score -= 30;
      criticalCount++;
      issues.push({ severity: 'critical', text: 'OIG/SAM exclusion flag' });
    }

    // Warning: Licenses expiring within 30 days (-10 each)
    const exp30 = provLicenses.filter(l => {
      const exp = l.expirationDate || l.expiration_date;
      if (!exp) return false;
      const d = new Date(exp);
      return d > today && d <= in30;
    });
    if (exp30.length > 0) {
      score -= exp30.length * 10;
      warningCount += exp30.length;
      issues.push({ severity: 'warning', text: `${exp30.length} license(s) expiring in 30 days` });
    }

    // Warning: Licenses expiring within 90 days (-5 each)
    const exp90 = provLicenses.filter(l => {
      const exp = l.expirationDate || l.expiration_date;
      if (!exp) return false;
      const d = new Date(exp);
      return d > in30 && d <= in90;
    });
    if (exp90.length > 0) {
      score -= exp90.length * 5;
      warningCount += exp90.length;
      issues.push({ severity: 'warning', text: `${exp90.length} license(s) expiring in 90 days` });
    }

    // Warning: No licenses at all (-15)
    if (provLicenses.length === 0) {
      score -= 15;
      warningCount++;
      issues.push({ severity: 'warning', text: 'No licenses on file' });
    }

    // Info: Never screened for exclusions (-5)
    const wasScreened = provExclusions.length > 0 || (exclusionSummary.screened > 0);
    const isNeverScreened = neverScreened.some(ns => ns.id === provId);
    if (isNeverScreened) {
      score -= 5;
      issues.push({ severity: 'info', text: 'Never screened for exclusions' });
    }

    // Warning: Missing document completion on applications (-5 per incomplete)
    const incompleteApps = provApps.filter(a => {
      const docs = a.documentChecklist || {};
      return !CRED_DOCUMENTS.every(d => docs[d.id]?.completed);
    });
    if (incompleteApps.length > 0) {
      score -= incompleteApps.length * 3;
      issues.push({ severity: 'info', text: `${incompleteApps.length} app(s) with incomplete documents` });
    }

    score = Math.max(0, Math.min(100, score));
    return { provider: prov, score, issues, criticalCount, warningCount, licenseCount: provLicenses.length };
  }

  const providerScores = providers.map(p => computeProviderScore(p)).sort((a, b) => a.score - b.score);
  const avgScore = providerScores.length > 0 ? Math.round(providerScores.reduce((s, p) => s + p.score, 0) / providerScores.length) : 0;
  const criticalProviders = providerScores.filter(p => p.score < 60);
  const warningProviders = providerScores.filter(p => p.score >= 60 && p.score < 85);
  const healthyProviders = providerScores.filter(p => p.score >= 85);

  // ─── Risk Matrix Data ───
  const credTypes = ['License', 'Malpractice', 'Board Cert', 'DEA', 'Exclusion', 'Documents'];
  const riskMatrix = providers.map(prov => {
    const provId = prov.id;
    const provLicenses = licenses.filter(l => (l.providerId || l.provider_id) === provId);
    const provApps = apps.filter(a => a.providerId === provId);
    const provExclusions = Array.isArray(exclusions) ? exclusions.filter(e => (e.providerId || e.provider_id) === provId) : [];
    const provName = `${prov.firstName || prov.first_name || ''} ${prov.lastName || prov.last_name || ''}`.trim();

    // License status
    const hasExpiredLic = provLicenses.some(l => (l.expirationDate || l.expiration_date) && new Date(l.expirationDate || l.expiration_date) < today);
    const hasExpiring30 = provLicenses.some(l => { const exp = l.expirationDate || l.expiration_date; return exp && new Date(exp) > today && new Date(exp) <= in30; });
    const licStatus = provLicenses.length === 0 ? 'none' : hasExpiredLic ? 'critical' : hasExpiring30 ? 'warning' : 'good';

    // Malpractice
    const provMal = (report.expiringMalpractice || []).filter(m => m.providerId === provId || m.provider_id === provId);
    const malStatus = provMal.length > 0 ? 'warning' : 'good';

    // Board certs
    const provBoards = (report.expiringBoards || []).filter(b => b.providerId === provId || b.provider_id === provId);
    const boardStatus = provBoards.length > 0 ? 'warning' : 'good';

    // DEA — check if provider has any (simple presence check)
    const deaStatus = 'good'; // Would need DEA data per provider

    // Exclusion
    const hasExcl = provExclusions.some(e => e.status === 'excluded' || e.result === 'excluded');
    const neverScr = neverScreened.some(ns => ns.id === provId);
    const exclStatus = hasExcl ? 'critical' : neverScr ? 'none' : 'good';

    // Documents
    const totalDocs = provApps.length * CRED_DOCUMENTS.length;
    const doneDocs = provApps.reduce((sum, a) => {
      const docs = a.documentChecklist || {};
      return sum + CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length;
    }, 0);
    const docPct = totalDocs > 0 ? Math.round((doneDocs / totalDocs) * 100) : -1;
    const docStatus = docPct < 0 ? 'none' : docPct < 50 ? 'critical' : docPct < 80 ? 'warning' : 'good';

    return { provName, provId, cells: [licStatus, malStatus, boardStatus, deaStatus, exclStatus, docStatus] };
  });

  const renderCollapsible = (id, title, count, badgeClass, content) => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header" style="cursor:pointer;" onclick="
        const b = document.getElementById('${id}-body');
        const a = document.getElementById('${id}-arrow');
        b.style.display = b.style.display === 'none' ? '' : 'none';
        a.style.transform = b.style.display === 'none' ? '' : 'rotate(90deg)';
      ">
        <div style="display:flex;align-items:center;gap:8px;">
          <svg id="${id}-arrow" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="transition:transform 0.2s;flex-shrink:0;"><path d="M4 2l5 4-5 4z"/></svg>
          <h3 style="margin:0;">${title}</h3>
          <span class="badge badge-${badgeClass}">${count}</span>
        </div>
      </div>
      <div class="card-body" id="${id}-body" style="display:none;padding:0;">
        ${content}
      </div>
    </div>`;

  const scoreColor = s => s >= 85 ? 'var(--green)' : s >= 60 ? 'var(--warning-500)' : 'var(--red)';
  const scoreLabel = s => s >= 85 ? 'Healthy' : s >= 60 ? 'At Risk' : 'Critical';
  const cellColor = s => s === 'good' ? 'rgba(34,197,94,0.2)' : s === 'warning' ? 'rgba(245,158,11,0.25)' : s === 'critical' ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.15)';
  const cellIcon = s => s === 'good' ? '<span style="color:var(--green);">&#10003;</span>' : s === 'warning' ? '<span style="color:var(--warning-500);">&#9888;</span>' : s === 'critical' ? '<span style="color:var(--red);">&#10007;</span>' : '<span style="color:var(--gray-400);">—</span>';

  const compPct = providers.length > 0 ? Math.round((healthyProviders.length / providers.length) * 100) : 0;

  // ─── Compliance Command Center — Weighted Score Engine ───
  function computeWeightedOrgScore() {
    // Weights: Licenses 30%, Malpractice 20%, Board Certs 15%, Background 15%, Docs 10%, Training 10%
    let licScore = 100, malScore = 100, boardScore = 100, bgScore = 100, docScore = 100, trainScore = 100;
    const totalLic = licenses.length;
    if (totalLic > 0) {
      const expCount = expiredLicenses.length;
      const exp30Count = expiringLicenses30.length;
      const exp90Count = expiringLicenses90.length;
      const goodLic = totalLic - expCount - exp30Count - exp90Count;
      licScore = Math.max(0, Math.round((goodLic / totalLic) * 100 - (expCount * 15) - (exp30Count * 8) - (exp90Count * 3)));
    } else { licScore = 0; }

    if (expiringMalpractice.length > 0) { malScore = Math.max(0, 100 - expiringMalpractice.length * 25); }
    if (expiringBoards.length > 0) { boardScore = Math.max(0, 100 - expiringBoards.length * 20); }

    const exclFlags = exclusionSummary.excluded || 0;
    const neverScr = neverScreened.length || 0;
    if (exclFlags > 0) bgScore = Math.max(0, 100 - exclFlags * 40);
    else if (neverScr > 0 && providers.length > 0) bgScore = Math.max(0, 100 - Math.round((neverScr / providers.length) * 50));

    // Docs: average doc completion across apps
    let totalDocs = 0, completedDocs = 0;
    apps.forEach(a => {
      const docs = a.documentChecklist || {};
      const CRED_DOCS_LEN = typeof CRED_DOCUMENTS !== 'undefined' ? CRED_DOCUMENTS.length : 0;
      totalDocs += CRED_DOCS_LEN;
      if (CRED_DOCS_LEN > 0) completedDocs += (typeof CRED_DOCUMENTS !== 'undefined' ? CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length : 0);
    });
    if (totalDocs > 0) docScore = Math.round((completedDocs / totalDocs) * 100);
    else docScore = providers.length > 0 ? 50 : 0;

    // Training/CME placeholder — 100 if no issues flagged
    trainScore = 100;

    const weighted = Math.round(
      licScore * 0.30 + malScore * 0.20 + boardScore * 0.15 + bgScore * 0.15 + docScore * 0.10 + trainScore * 0.10
    );
    return {
      overall: Math.max(0, Math.min(100, weighted)),
      breakdown: [
        { label: 'Licenses Current', weight: '30%', score: Math.max(0, licScore) },
        { label: 'Malpractice Current', weight: '20%', score: Math.max(0, malScore) },
        { label: 'Board Certifications', weight: '15%', score: Math.max(0, boardScore) },
        { label: 'Background Checks', weight: '15%', score: Math.max(0, bgScore) },
        { label: 'Documents Complete', weight: '10%', score: Math.max(0, docScore) },
        { label: 'Training / CME', weight: '10%', score: Math.max(0, trainScore) },
      ]
    };
  }

  const cmdScore = computeWeightedOrgScore();

  // Store score history for trending
  const historyKey = 'credentik_compliance_history';
  let scoreHistory = [];
  try { scoreHistory = JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch {}
  const todayKey = new Date().toISOString().split('T')[0];
  if (!scoreHistory.find(h => h.date === todayKey)) {
    scoreHistory.push({ date: todayKey, score: cmdScore.overall });
    if (scoreHistory.length > 90) scoreHistory = scoreHistory.slice(-90);
    localStorage.setItem(historyKey, JSON.stringify(scoreHistory));
  }
  const prevMonth = scoreHistory.filter(h => {
    const d = new Date(h.date);
    const ago = new Date(); ago.setDate(ago.getDate() - 30);
    return d <= ago;
  });
  const trendDelta = prevMonth.length > 0 ? cmdScore.overall - prevMonth[prevMonth.length - 1].score : 0;
  const trendStr = trendDelta > 0 ? `&#8593; ${trendDelta}% from last month` : trendDelta < 0 ? `&#8595; ${Math.abs(trendDelta)}% from last month` : 'No change from last month';
  const trendColor = trendDelta > 0 ? '#10b981' : trendDelta < 0 ? '#ef4444' : 'var(--gray-500)';

  // Risk items sorted by impact
  const riskItems = [];
  if (expiredLicenses.length > 0) riskItems.push({ text: `${expiredLicenses.length} expired license(s)`, impact: expiredLicenses.length * 8, color: '#ef4444' });
  if (expiringLicenses30.length > 0) riskItems.push({ text: `${expiringLicenses30.length} license(s) expiring in < 30 days`, impact: expiringLicenses30.length * 5, color: '#f59e0b' });
  if (expiringMalpractice.length > 0) riskItems.push({ text: `${expiringMalpractice.length} provider(s) with expiring malpractice`, impact: expiringMalpractice.length * 5, color: '#f59e0b' });
  if (expiringBoards.length > 0) riskItems.push({ text: `${expiringBoards.length} provider(s) with expiring board cert`, impact: expiringBoards.length * 4, color: '#f59e0b' });
  if ((exclusionSummary.excluded || 0) > 0) riskItems.push({ text: `${exclusionSummary.excluded} exclusion flag(s)`, impact: exclusionSummary.excluded * 10, color: '#ef4444' });
  if (neverScreened.length > 0) riskItems.push({ text: `${neverScreened.length} provider(s) never screened`, impact: neverScreened.length * 3, color: '#9ca3af' });
  riskItems.sort((a, b) => b.impact - a.impact);

  const cmdScoreColor = cmdScore.overall >= 85 ? '#22c55e' : cmdScore.overall >= 60 ? '#f59e0b' : '#ef4444';

  body.innerHTML = `
    <style>
      .comp-cmd-hero{background:var(--surface-card,#fff);border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:24px;position:relative;}
      .comp-cmd-hero::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,${cmdScoreColor},${cmdScore.overall>=85?'#16a34a':cmdScore.overall>=60?'#d97706':'#dc2626'});}
      .comp-cmd-grid{display:grid;grid-template-columns:220px 1fr 280px;gap:0;min-height:260px;}
      @media(max-width:900px){.comp-cmd-grid{grid-template-columns:1fr;}}
      .comp-cmd-ring{text-align:center;padding:28px 20px;border-right:1px solid var(--gray-200,#e5e7eb);display:flex;flex-direction:column;align-items:center;justify-content:center;}
      .comp-cmd-center{padding:24px;border-right:1px solid var(--gray-200,#e5e7eb);}
      .comp-cmd-right{padding:24px;overflow-y:auto;max-height:320px;}
      .comp-cmd-breakdown{margin-top:8px;}
      .comp-cmd-bar-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
      .comp-cmd-bar-label{font-size:11px;font-weight:600;color:var(--gray-600);width:130px;flex-shrink:0;}
      .comp-cmd-bar-track{flex:1;height:8px;background:var(--gray-200,#e5e7eb);border-radius:4px;overflow:hidden;}
      .comp-cmd-bar-fill{height:100%;border-radius:4px;transition:width 0.5s;}
      .comp-cmd-bar-val{font-size:11px;font-weight:700;width:36px;text-align:right;flex-shrink:0;}
      .comp-cmd-risk{list-style:none;padding:0;margin:0;}
      .comp-cmd-risk li{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--gray-100,#f3f4f6);font-size:12px;color:var(--gray-700);}
      .comp-cmd-risk li:last-child{border-bottom:none;}
      .comp-cmd-risk-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
      .comp-cmd-risk-impact{font-size:10px;font-weight:700;flex-shrink:0;padding:2px 6px;border-radius:6px;background:rgba(239,68,68,0.1);color:#ef4444;}
      .comp-cmd-providers{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-top:16px;}
      .comp-cmd-prov-card{background:var(--gray-50,#f9fafb);border-radius:12px;padding:12px;text-align:center;transition:transform 0.15s,box-shadow 0.15s;cursor:pointer;}
      .comp-cmd-prov-card:hover{transform:translateY(-2px);box-shadow:0 4px 10px rgba(0,0,0,0.08);}
      .comp-cmd-prov-score{font-size:22px;font-weight:800;line-height:1;}
      .comp-cmd-prov-name{font-size:10px;font-weight:600;color:var(--gray-500);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .comp-cmd-section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-bottom:12px;}
      .compv2-hero { background:var(--surface-card,#fff); border-radius:16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); margin-bottom:20px; }
      .compv2-hero::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,${scoreColor(avgScore)},${avgScore >= 85 ? '#16a34a' : avgScore >= 60 ? '#d97706' : '#dc2626'}); }
      .compv2-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:14px; }
      .compv2-stat { background:var(--surface-card,#fff); border-radius:16px; padding:16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:transform 0.18s,box-shadow 0.18s; }
      .compv2-stat:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
      .compv2-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      .compv2-stat .compv2-val { font-size:28px; font-weight:800; line-height:1.1; }
      .compv2-stat .compv2-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
      .compv2-stat .compv2-sub { font-size:10px; color:var(--gray-400); margin-top:2px; }
      .compv2-dot { display:inline-flex; align-items:center; gap:5px; }
      .compv2-dot::before { content:''; width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .compv2-dot.green::before { background:#22c55e; }
      .compv2-dot.red::before { background:#ef4444; }
      .compv2-dot.amber::before { background:#f59e0b; }
      .compv2-dot.gray::before { background:#9ca3af; }
    </style>

    <!-- Compliance Command Center -->
    <div class="comp-cmd-hero">
      <div class="comp-cmd-grid">
        <div class="comp-cmd-ring">
          <div style="position:relative;width:160px;height:160px;margin:0 auto 12px;">
            <svg viewBox="0 0 120 120" style="transform:rotate(-90deg);">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--gray-200)" stroke-width="10"/>
              <circle cx="60" cy="60" r="52" fill="none" stroke="${cmdScoreColor}" stroke-width="10"
                stroke-dasharray="${Math.round(cmdScore.overall * 3.267)} 326.7"
                stroke-linecap="round" style="transition:stroke-dasharray 0.8s;"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
              <div style="font-size:44px;font-weight:800;color:${cmdScoreColor};line-height:1;">${cmdScore.overall}</div>
              <div style="font-size:11px;color:var(--gray-500);font-weight:500;">/ 100</div>
            </div>
          </div>
          <div style="font-size:15px;font-weight:700;color:${cmdScoreColor};">${cmdScore.overall >= 85 ? 'Excellent' : cmdScore.overall >= 70 ? 'Good' : cmdScore.overall >= 60 ? 'Needs Attention' : 'Critical'}</div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:2px;">Weighted Compliance Score</div>
          <div style="margin-top:8px;font-size:12px;font-weight:600;color:${trendColor};">${trendStr}</div>
        </div>
        <div class="comp-cmd-center">
          <div class="comp-cmd-section-title">Score Breakdown</div>
          <div class="comp-cmd-breakdown">
            ${cmdScore.breakdown.map(b => {
              const bColor = b.score >= 85 ? '#22c55e' : b.score >= 60 ? '#f59e0b' : '#ef4444';
              return `<div class="comp-cmd-bar-row">
                <div class="comp-cmd-bar-label">${b.label} <span style="color:var(--gray-400);font-size:9px;">(${b.weight})</span></div>
                <div class="comp-cmd-bar-track"><div class="comp-cmd-bar-fill" style="width:${b.score}%;background:${bColor};"></div></div>
                <div class="comp-cmd-bar-val" style="color:${bColor};">${b.score}%</div>
              </div>`;
            }).join('')}
          </div>
          ${providerScores.length > 0 ? `
          <div class="comp-cmd-section-title" style="margin-top:20px;">Score by Provider</div>
          <div class="comp-cmd-providers">
            ${providerScores.slice(0, 8).map(ps => {
              const p = ps.provider;
              const provName = ((p.firstName || p.first_name || '') + ' ' + (p.lastName || p.last_name || '')).trim();
              const pColor = ps.score >= 85 ? '#22c55e' : ps.score >= 60 ? '#f59e0b' : '#ef4444';
              return `<div class="comp-cmd-prov-card" onclick="window.app.openProviderProfile('${p.id}')">
                <div class="comp-cmd-prov-score" style="color:${pColor};">${ps.score}</div>
                <div class="comp-cmd-prov-name">${escHtml(provName)}</div>
              </div>`;
            }).join('')}
          </div>` : ''}
        </div>
        <div class="comp-cmd-right">
          <div class="comp-cmd-section-title">Risk Items</div>
          ${riskItems.length > 0 ? `<ul class="comp-cmd-risk">
            ${riskItems.map(r => `<li>
              <div class="comp-cmd-risk-dot" style="background:${r.color};"></div>
              <span style="flex:1;">${r.text}</span>
              <span class="comp-cmd-risk-impact">-${r.impact}%</span>
            </li>`).join('')}
          </ul>` : '<div style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px;">No risk items detected. Great job!</div>'}
        </div>
      </div>
    </div>

    <!-- V2 Compliance Hero Card -->
    <div class="compv2-hero">
      <div style="display:grid;grid-template-columns:280px 1fr;gap:0;">
        <div style="text-align:center;padding:28px 24px;border-right:1px solid var(--gray-200,#e5e7eb);">
          <div style="position:relative;width:140px;height:140px;margin:0 auto 12px;">
            <svg viewBox="0 0 120 120" style="transform:rotate(-90deg);">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--gray-200)" stroke-width="10"/>
              <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor(avgScore)}" stroke-width="10"
                stroke-dasharray="${Math.round(avgScore * 3.267)} 326.7"
                stroke-linecap="round" style="transition:stroke-dasharray 0.6s;"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
              <div style="font-size:40px;font-weight:800;color:${scoreColor(avgScore)};line-height:1;">${avgScore}</div>
              <div style="font-size:11px;color:var(--gray-500);font-weight:500;">/ 100</div>
            </div>
          </div>
          <div style="font-size:15px;font-weight:700;color:${scoreColor(avgScore)};">${scoreLabel(avgScore)}</div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:2px;">Organization Compliance</div>
          <!-- Progress bar -->
          <div style="margin-top:16px;padding:0 16px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;color:var(--gray-500);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">
              <span>Completion</span><span>${compPct}%</span>
            </div>
            <div style="background:var(--gray-200);border-radius:6px;height:8px;overflow:hidden;">
              <div style="background:${scoreColor(avgScore)};height:100%;width:${compPct}%;border-radius:6px;transition:width 0.6s;"></div>
            </div>
          </div>
        </div>
        <div style="padding:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;align-content:start;">
          <div class="compv2-stat" style="border-left:3px solid #ef4444;"><div class="compv2-val" style="color:#ef4444;">${criticalProviders.length}</div><div class="compv2-lbl">Critical</div><div class="compv2-sub">Score &lt; 60</div></div>
          <div class="compv2-stat" style="border-left:3px solid #f59e0b;"><div class="compv2-val" style="color:#f59e0b;">${warningProviders.length}</div><div class="compv2-lbl">At Risk</div><div class="compv2-sub">Score 60-84</div></div>
          <div class="compv2-stat" style="border-left:3px solid #22c55e;"><div class="compv2-val" style="color:#22c55e;">${healthyProviders.length}</div><div class="compv2-lbl">Healthy</div><div class="compv2-sub">Score 85+</div></div>
          <div class="compv2-stat" style="border-left:3px solid #ef4444;"><div class="compv2-val" style="color:#ef4444;">${expiredLicenses.length}</div><div class="compv2-lbl">Expired Licenses</div></div>
          <div class="compv2-stat" style="border-left:3px solid #f59e0b;"><div class="compv2-val" style="color:#f59e0b;">${expiringLicenses30.length}</div><div class="compv2-lbl">Expiring (30d)</div></div>
          <div class="compv2-stat" style="border-left:3px solid var(--brand-600);"><div class="compv2-val" style="color:var(--brand-600);">${expiringLicenses90.length}</div><div class="compv2-lbl">Expiring (90d)</div></div>
          <div class="compv2-stat" style="border-left:3px solid #ef4444;"><div class="compv2-val" style="color:#ef4444;">${exclusionSummary.excluded || 0}</div><div class="compv2-lbl">Exclusion Flags</div></div>
          <div class="compv2-stat" style="border-left:3px solid #9ca3af;"><div class="compv2-val" style="color:var(--gray-500);">${exclusionSummary.neverScreened || neverScreened.length || 0}</div><div class="compv2-lbl">Never Screened</div></div>
        </div>
      </div>
    </div>

    <!-- Provider Compliance Scores -->
    ${providerScores.length > 0 ? `
    <div class="card" style="margin-bottom:16px;border-radius:16px;overflow:hidden;">
      <div class="card-header">
        <h3>Provider Compliance Scores</h3>
        <span class="text-sm text-muted">${providers.length} provider(s)</span>
      </div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead><tr><th>Provider</th><th>Score</th><th>Status</th><th>Issues</th><th>Action</th></tr></thead>
          <tbody>
            ${providerScores.map(ps => {
              const p = ps.provider;
              const provName = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim();
              return `<tr>
                <td><a href="#" onclick="event.preventDefault();window.app.openProviderProfile('${p.id}')" style="font-weight:600;color:var(--gray-800);text-decoration:none;">${escHtml(provName)}</a> <span style="color:var(--gray-400);font-size:11px;">#${toHexId(p.id)}</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:60px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;">
                      <div style="width:${ps.score}%;height:100%;background:${scoreColor(ps.score)};border-radius:3px;"></div>
                    </div>
                    <span style="font-weight:700;color:${scoreColor(ps.score)};font-size:14px;">${ps.score}</span>
                  </div>
                </td>
                <td><span class="badge" style="background:${scoreColor(ps.score)}20;color:${scoreColor(ps.score)};font-weight:600;">${scoreLabel(ps.score)}</span></td>
                <td style="font-size:12px;">${ps.issues.length > 0
                  ? ps.issues.slice(0, 3).map(i => `<span style="display:inline-block;margin:1px 4px 1px 0;padding:1px 6px;border-radius:3px;font-size:10px;background:${i.severity === 'critical' ? 'var(--red)' : i.severity === 'warning' ? 'var(--warning-500)' : 'var(--gray-400)'}15;color:${i.severity === 'critical' ? 'var(--red)' : i.severity === 'warning' ? 'var(--warning-500)' : 'var(--gray-500)'};">${escHtml(i.text)}</span>`).join('')
                  : '<span style="color:var(--green);font-size:11px;">No issues</span>'
                }</td>
                <td><button class="btn btn-sm" onclick="window.app.openProviderProfile('${p.id}')">View</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Risk Matrix Heatmap -->
    ${riskMatrix.length > 0 ? `
    <div class="card" style="margin-bottom:16px;border-radius:16px;overflow:hidden;">
      <div class="card-header">
        <h3>Credential Risk Matrix</h3>
        <div style="display:flex;gap:12px;font-size:11px;align-items:center;">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(34,197,94,0.3);vertical-align:middle;"></span> Good</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(245,158,11,0.35);vertical-align:middle;"></span> Warning</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(239,68,68,0.35);vertical-align:middle;"></span> Critical</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(148,163,184,0.2);vertical-align:middle;"></span> N/A</span>
        </div>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table style="border-collapse:separate;border-spacing:0;">
          <thead><tr><th style="text-align:left;min-width:160px;">Provider</th>${credTypes.map(c => `<th style="text-align:center;font-size:11px;min-width:90px;">${c}</th>`).join('')}</tr></thead>
          <tbody>
            ${riskMatrix.map(rm => `<tr>
              <td style="font-weight:600;font-size:13px;"><a href="#" onclick="event.preventDefault();window.app.openProviderProfile('${rm.provId}')" style="color:var(--gray-800);text-decoration:none;">${escHtml(rm.provName)}</a></td>
              ${rm.cells.map(c => `<td style="text-align:center;background:${cellColor(c)};font-size:14px;">${cellIcon(c)}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${renderCollapsible('expired-lic', 'Expired Licenses', expiredLicenses.length, 'denied',
      expiredLicenses.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>License #</th><th>State</th><th>Expired On</th></tr></thead>
          <tbody>
            ${expiredLicenses.map(l => {
              const prov = providers.find(p => p.id === (l.providerId || l.provider_id));
              const provName = prov ? `${prov.firstName || prov.first_name || ''} ${prov.lastName || prov.last_name || ''}`.trim() : '—';
              return `<tr>
                <td>${escHtml(provName)}</td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>${escHtml(l.state || '—')}</td>
                <td style="color:var(--red);">${formatDateDisplay(l.expirationDate || l.expiration_date)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No expired licenses.</div>'
    )}

    ${renderCollapsible('expiring-30', 'Expiring Within 30 Days', expiringLicenses30.length, 'pending',
      expiringLicenses30.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>License #</th><th>State</th><th>Expires</th></tr></thead>
          <tbody>
            ${expiringLicenses30.map(l => {
              const prov = providers.find(p => p.id === (l.providerId || l.provider_id));
              const provName = prov ? `${prov.firstName || prov.first_name || ''} ${prov.lastName || prov.last_name || ''}`.trim() : '—';
              return `<tr>
                <td>${escHtml(provName)}</td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>${escHtml(l.state || '—')}</td>
                <td style="color:var(--amber);">${formatDateDisplay(l.expirationDate || l.expiration_date)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No licenses expiring within 30 days.</div>'
    )}

    ${renderCollapsible('expiring-90', 'Expiring Within 90 Days', expiringLicenses90.length, 'pending',
      expiringLicenses90.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>License #</th><th>State</th><th>Expires</th></tr></thead>
          <tbody>
            ${expiringLicenses90.map(l => {
              const prov = providers.find(p => p.id === (l.providerId || l.provider_id));
              const provName = prov ? `${prov.firstName || prov.first_name || ''} ${prov.lastName || prov.last_name || ''}`.trim() : '—';
              return `<tr>
                <td>${escHtml(provName)}</td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>${escHtml(l.state || '—')}</td>
                <td>${formatDateDisplay(l.expirationDate || l.expiration_date)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No licenses expiring within 90 days.</div>'
    )}

    ${renderCollapsible('malpractice', 'Expiring Malpractice Insurance', expiringMalpractice.length, 'pending',
      expiringMalpractice.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>Carrier</th><th>Policy #</th><th>Expires</th></tr></thead>
          <tbody>
            ${expiringMalpractice.map(m => `<tr>
              <td>${escHtml(m.providerName || '—')}</td>
              <td>${escHtml(m.carrier || m.insuranceCarrier || '—')}</td>
              <td><code>${escHtml(m.policyNumber || m.policy_number || '—')}</code></td>
              <td style="color:var(--amber);">${formatDateDisplay(m.expirationDate || m.expiration_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No expiring malpractice policies.</div>'
    )}

    ${renderCollapsible('boards', 'Expiring Board Certifications', expiringBoards.length, 'pending',
      expiringBoards.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>Board</th><th>Specialty</th><th>Expires</th></tr></thead>
          <tbody>
            ${expiringBoards.map(b => `<tr>
              <td>${escHtml(b.providerName || '—')}</td>
              <td>${escHtml(b.boardName || b.board_name || '—')}</td>
              <td>${escHtml(b.specialty || '—')}</td>
              <td style="color:var(--amber);">${formatDateDisplay(b.expirationDate || b.expiration_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">No expiring board certifications.</div>'
    )}

    ${renderCollapsible('excl-flags', 'Exclusion Flags', exclusionSummary.excluded || 0, 'denied',
      `<div style="padding:1rem;">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px;">
          <div><span class="text-sm text-muted">Total Screened:</span> <strong>${exclusionSummary.screened || 0}</strong></div>
          <div><span class="text-sm text-muted">Clear:</span> <strong style="color:var(--green);">${exclusionSummary.clear || 0}</strong></div>
          <div><span class="text-sm text-muted">Excluded:</span> <strong style="color:var(--red);">${exclusionSummary.excluded || 0}</strong></div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="window.app.navigateTo('exclusions')">View Full Screening Report</button>
      </div>`
    )}

    ${renderCollapsible('never-screened', 'Never-Screened Providers', exclusionSummary.neverScreened || neverScreened.length || 0, 'inactive',
      neverScreened.length > 0 ? `
        <table>
          <thead><tr><th>Provider</th><th>NPI</th><th>Action</th></tr></thead>
          <tbody>
            ${neverScreened.map(p => `<tr>
              <td>${escHtml(p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || '—')}</td>
              <td><code>${escHtml(p.npi || '—')}</code></td>
              <td><button class="btn btn-sm btn-primary" onclick="window.app.screenSingleProvider(${p.id})">Screen Now</button></td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div style="padding:1rem;text-align:center;color:var(--gray-500);">All providers have been screened, or navigate to Exclusion Screening for details.</div>'
    )}
  `;
}

async function renderPSVPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let providers = [], licenses = [], exclusions = [], dea = [];
  try {
    [providers, licenses, exclusions, dea] = await Promise.all([
      store.getAll('providers'),
      store.getAll('licenses'),
      store.getAll('exclusions').catch(() => []),
      store.getAll('dea_registrations').catch(() => []),
    ]);
    providers = store.filterByScope(providers);
    licenses = store.filterByScope(licenses);
  } catch (e) { console.error('PSV load error:', e); }

  const now = new Date();

  // Build PSV status per provider
  const psvData = (providers || []).map(p => {
    const provLicenses = (licenses || []).filter(l => (l.providerId || l.provider_id) == p.id);
    const provExcl = (exclusions || []).filter(ex => (ex.providerId || ex.provider_id) == p.id);
    const provDea = (dea || []).filter(d => (d.providerId || d.provider_id) == p.id);

    const hasExpired = provLicenses.some(l => { const exp = l.expirationDate || l.expiration_date; return exp && new Date(exp) < now; });
    const allVerified = provLicenses.length > 0 && provLicenses.every(l => (l.verificationStatus || l.verification_status) === 'verified');
    const hasVerified = provLicenses.some(l => (l.verificationStatus || l.verification_status) === 'verified');
    const licStatus = provLicenses.length === 0 ? 'none' : hasExpired ? 'expired' : allVerified ? 'verified' : hasVerified ? 'partial' : 'unverified';

    const npiStatus = p.npi ? 'verified' : 'missing';
    const hasDeaExpired = provDea.some(d => { const exp = d.expirationDate || d.expiration_date; return exp && new Date(exp) < now; });
    const deaStatus = provDea.length === 0 ? 'none' : hasDeaExpired ? 'expired' : 'active';
    const hasExclusion = provExcl.some(ex => ['excluded','flagged'].includes((ex.status || '').toLowerCase()));
    const exclStatus = hasExclusion ? 'flagged' : provExcl.length > 0 ? 'clear' : 'not_screened';
    const certStatus = (p.boardCertification || p.board_certification) ? 'verified' : 'unverified';

    const allDates = [
      ...provLicenses.map(l => l.verifiedAt || l.verified_at || l.lastVerifiedAt || l.last_verified_at),
      ...provExcl.map(ex => ex.screenedAt || ex.screened_at || ex.createdAt || ex.created_at),
    ].filter(Boolean).sort().reverse();
    const lastVerified = allDates[0] || null;

    const scores = { verified: 1, active: 1, clear: 1, partial: 0.5, none: 0, missing: 0, unverified: 0, expired: 0, flagged: 0, not_screened: 0 };
    const overall = ((scores[licStatus]||0) + (scores[npiStatus]||0) + (scores[deaStatus]||0) + (scores[exclStatus]||0) + (scores[certStatus]||0)) / 5;
    const overallLabel = overall >= 0.8 ? 'Verified' : overall >= 0.5 ? 'Partial' : 'Action Needed';
    const overallColor = overall >= 0.8 ? 'var(--green)' : overall >= 0.5 ? 'var(--gold)' : 'var(--red)';

    return { ...p, provLicenses, provDea, provExcl, licStatus, npiStatus, deaStatus, exclStatus, certStatus, lastVerified, overall, overallLabel, overallColor };
  });

  const totalProviders = psvData.length;
  const fullyVerified = psvData.filter(p => p.overall >= 0.8).length;
  const needsAction = psvData.filter(p => p.overall < 0.5).length;
  const partiallyVerified = totalProviders - fullyVerified - needsAction;
  const lastScanDate = psvData.map(p => p.lastVerified).filter(Boolean).sort().reverse()[0];

  const statusBadge = (status) => {
    const map = {
      verified: { bg: 'rgba(34,197,94,0.12)', color: 'var(--green)', icon: '&#10003;', text: 'Verified' },
      active: { bg: 'rgba(34,197,94,0.12)', color: 'var(--green)', icon: '&#10003;', text: 'Active' },
      clear: { bg: 'rgba(34,197,94,0.12)', color: 'var(--green)', icon: '&#10003;', text: 'Clear' },
      partial: { bg: 'rgba(245,158,11,0.12)', color: 'var(--gold)', icon: '&#9679;', text: 'Partial' },
      expired: { bg: 'rgba(239,68,68,0.12)', color: 'var(--red)', icon: '&#10007;', text: 'Expired' },
      flagged: { bg: 'rgba(239,68,68,0.12)', color: 'var(--red)', icon: '&#9888;', text: 'Flagged' },
      missing: { bg: 'rgba(156,163,175,0.12)', color: 'var(--gray-500)', icon: '&#8212;', text: 'Missing' },
      none: { bg: 'rgba(156,163,175,0.12)', color: 'var(--gray-500)', icon: '&#8212;', text: 'None' },
      unverified: { bg: 'rgba(156,163,175,0.12)', color: 'var(--gray-500)', icon: '&#9675;', text: 'Unverified' },
      not_screened: { bg: 'rgba(245,158,11,0.12)', color: 'var(--gold)', icon: '&#9675;', text: 'Not Screened' },
    };
    const s = map[status] || map.unverified;
    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${s.bg};color:${s.color};">${s.icon} ${s.text}</span>`;
  };

  body.innerHTML = `
    <style>
      .psvv2-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:20px; }
      .psvv2-stat { background:var(--surface-card,#fff); border-radius:16px; padding:18px 16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); text-align:center; transition:transform 0.18s,box-shadow 0.18s; }
      .psvv2-stat:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
      .psvv2-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      .psvv2-stat:nth-child(1)::before { background:linear-gradient(90deg,var(--brand-500),var(--brand-700)); }
      .psvv2-stat:nth-child(2)::before { background:linear-gradient(90deg,#22c55e,#16a34a); }
      .psvv2-stat:nth-child(3)::before { background:linear-gradient(90deg,#f59e0b,#d97706); }
      .psvv2-stat:nth-child(4)::before { background:linear-gradient(90deg,#ef4444,#dc2626); }
      .psvv2-stat:nth-child(5)::before { background:linear-gradient(90deg,#6b7280,#4b5563); }
      .psvv2-stat .psvv2-val { font-size:28px; font-weight:800; line-height:1.1; }
      .psvv2-stat .psvv2-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
    </style>

    <!-- V2 PSV Stats -->
    <div class="psvv2-stats">
      <div class="psvv2-stat"><div class="psvv2-val" style="color:var(--brand-600);">${totalProviders}</div><div class="psvv2-lbl">Total Providers</div></div>
      <div class="psvv2-stat"><div class="psvv2-val" style="color:#16a34a;">${fullyVerified}</div><div class="psvv2-lbl">Fully Verified</div></div>
      <div class="psvv2-stat"><div class="psvv2-val" style="color:#d97706;">${partiallyVerified}</div><div class="psvv2-lbl">Pending Verification</div></div>
      <div class="psvv2-stat"><div class="psvv2-val" style="color:#dc2626;">${needsAction}</div><div class="psvv2-lbl">Issues Found</div></div>
      <div class="psvv2-stat"><div class="psvv2-val" style="font-size:14px;font-weight:700;color:var(--gray-700);padding-top:6px;">${lastScanDate ? formatDateDisplay(lastScanDate) : 'Never'}</div><div class="psvv2-lbl">Last PSV Scan</div></div>
    </div>

    <!-- Verification Sources -->
    <div class="card" style="margin-bottom:20px;border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Verification Sources</h3></div>
      <div class="card-body" style="padding:12px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          ${[
            { name: 'State Licensing Boards', icon: '&#127963;', desc: 'License validity, expiration, disciplinary actions', status: 'Active' },
            { name: 'NPPES / NPI Registry', icon: '&#128196;', desc: 'NPI number verification, taxonomy, practice info', status: 'Active' },
            { name: 'DEA Registration', icon: '&#128138;', desc: 'Controlled substance registration status', status: 'Active' },
            { name: 'OIG / SAM Exclusions', icon: '&#128737;', desc: 'Federal exclusion and debarment screening', status: 'Active' },
            { name: 'NPDB (Planned)', icon: '&#128218;', desc: 'National Practitioner Data Bank queries', status: 'Planned' },
            { name: 'Board Certifications', icon: '&#127891;', desc: 'ABMS / specialty board certification status', status: 'Planned' },
            { name: 'Education Verification', icon: '&#127979;', desc: 'Medical school and residency verification', status: 'Planned' },
            { name: 'Malpractice History', icon: '&#9878;', desc: 'Claims history and coverage verification', status: 'Planned' },
          ].map(s => `<div style="display:flex;gap:10px;padding:10px;border:1px solid var(--gray-200);border-radius:8px;">
            <div style="font-size:20px;">${s.icon}</div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">${s.name}</div>
              <div style="font-size:11px;color:var(--gray-500);">${s.desc}</div>
            </div>
            <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;height:fit-content;background:${s.status === 'Active' ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.12)'};color:${s.status === 'Active' ? 'var(--green)' : 'var(--gray-500)'};">${s.status}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Provider Verification Table -->
    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header">
        <h3>Provider Verification Status</h3>
        <input type="text" class="form-control" placeholder="Search providers..." style="width:220px;height:34px;font-size:13px;" oninput="document.querySelectorAll('#psv-table-body tr').forEach(r=>{r.style.display=r.dataset.name.includes(this.value.toLowerCase())?'':'none'})">
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Provider</th><th>NPI</th><th>Licenses</th><th>DEA</th><th>Exclusions</th><th>Board Cert</th><th>Last Verified</th><th>Overall</th><th>Actions</th></tr></thead>
            <tbody id="psv-table-body">
              ${psvData.map(p => `<tr data-name="${escHtml((p.firstName + ' ' + p.lastName).toLowerCase())}">
                <td><strong>${escHtml(p.firstName || '')} ${escHtml(p.lastName || '')}</strong><br><span style="font-size:11px;color:var(--gray-500);">${escHtml(p.credentials || '')}</span></td>
                <td><code style="font-size:12px;">${escHtml(p.npi || '—')}</code></td>
                <td>${statusBadge(p.licStatus)} <span style="font-size:10px;color:var(--gray-400);">(${p.provLicenses.length})</span></td>
                <td>${statusBadge(p.deaStatus)} <span style="font-size:10px;color:var(--gray-400);">(${p.provDea.length})</span></td>
                <td>${statusBadge(p.exclStatus)}</td>
                <td>${statusBadge(p.certStatus)}</td>
                <td style="font-size:11px;">${p.lastVerified ? formatDateDisplay(p.lastVerified) : '<span style="color:var(--gray-400);">Never</span>'}</td>
                <td><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;background:${p.overallColor}18;color:${p.overallColor};">${p.overallLabel}</span></td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-sm" onclick="window.app.runProviderPSV(${p.id})" title="Verify">&#8635; Verify</button>
                  <button class="btn btn-sm" onclick="window.app.shareProviderProfile(${p.id})" title="Share Profile">&#128279;</button>
                </td>
              </tr>`).join('')}
              ${!psvData.length ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--gray-500);">No providers found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function renderMonitoringPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let providers = [], licenses = [], exclusions = [], dea = [], tasks = [], apps = [];
  try {
    [providers, licenses, exclusions, dea, tasks, apps] = await Promise.all([
      store.getAll('providers'), store.getAll('licenses'),
      store.getAll('exclusions').catch(() => []), store.getAll('dea_registrations').catch(() => []),
      store.getAll('tasks'), store.getAll('applications'),
    ]);
    providers = store.filterByScope(providers); licenses = store.filterByScope(licenses);
    tasks = store.filterByScope(tasks); apps = store.filterByScope(apps);
  } catch (e) { console.error('Monitoring load error:', e); }

  const now = new Date();
  const alerts = [];
  const getProvName = (id) => { const p = (providers || []).find(pr => pr.id == id); return p ? `${p.firstName} ${p.lastName}` : `Provider #${id}`; };

  // License alerts
  (licenses || []).forEach(l => {
    const exp = l.expirationDate || l.expiration_date; if (!exp) return;
    const days = Math.round((new Date(exp) - now) / 86400000);
    const provName = getProvName(l.providerId || l.provider_id);
    const licDesc = `${l.state || ''} ${l.licenseType || l.license_type || 'License'} #${l.licenseNumber || l.license_number || ''}`;
    if (days < 0) alerts.push({ severity: 'critical', provider: provName, alert: 'License Expired', detail: `${licDesc} expired ${Math.abs(days)} days ago`, date: exp, category: 'license' });
    else if (days <= 30) alerts.push({ severity: 'urgent', provider: provName, alert: 'License Expiring Soon', detail: `${licDesc} expires in ${days} days`, date: exp, category: 'license' });
    else if (days <= 90) alerts.push({ severity: 'warning', provider: provName, alert: 'License Renewal Window', detail: `${licDesc} expires in ${days} days — begin renewal`, date: exp, category: 'license' });

    const verDate = l.verifiedAt || l.verified_at || l.lastVerifiedAt || l.last_verified_at;
    if (verDate && Math.round((now - new Date(verDate)) / 86400000) > 180) {
      alerts.push({ severity: 'warning', provider: provName, alert: 'Stale Verification', detail: `${licDesc} last verified ${Math.round((now - new Date(verDate)) / 86400000)} days ago`, date: verDate, category: 'verification' });
    }
  });

  // DEA alerts
  (dea || []).forEach(d => {
    const exp = d.expirationDate || d.expiration_date; if (!exp) return;
    const days = Math.round((new Date(exp) - now) / 86400000);
    const provName = getProvName(d.providerId || d.provider_id);
    if (days < 0) alerts.push({ severity: 'critical', provider: provName, alert: 'DEA Expired', detail: `DEA #${d.deaNumber || d.dea_number || ''} expired ${Math.abs(days)} days ago`, date: exp, category: 'dea' });
    else if (days <= 60) alerts.push({ severity: 'urgent', provider: provName, alert: 'DEA Expiring', detail: `DEA #${d.deaNumber || d.dea_number || ''} expires in ${days} days`, date: exp, category: 'dea' });
  });

  // Exclusion alerts
  (exclusions || []).forEach(ex => {
    if (['excluded','flagged'].includes((ex.status || '').toLowerCase())) {
      alerts.push({ severity: 'critical', provider: getProvName(ex.providerId || ex.provider_id), alert: 'Exclusion Flag', detail: `Provider flagged in ${ex.source || 'OIG/SAM'} screening`, date: ex.screenedAt || ex.screened_at || '', category: 'exclusion' });
    }
  });

  // Unscreened providers
  (providers || []).forEach(p => {
    if (!(exclusions || []).some(ex => (ex.providerId || ex.provider_id) == p.id)) {
      alerts.push({ severity: 'info', provider: `${p.firstName} ${p.lastName}`, alert: 'Never Screened', detail: 'No OIG/SAM exclusion screening on record', date: '', category: 'exclusion' });
    }
  });

  // Overdue tasks
  (tasks || []).filter(t => !t.isCompleted && !t.completed).forEach(t => {
    const due = t.dueDate || t.due_date; if (!due) return;
    const days = Math.round((new Date(due) - now) / 86400000);
    if (days < 0) alerts.push({ severity: 'warning', provider: '—', alert: 'Overdue Task', detail: `"${t.title || t.description}" is ${Math.abs(days)} days overdue`, date: due, category: 'task' });
  });

  // Stale applications
  (apps || []).filter(a => !['approved','denied','withdrawn'].includes(a.status)).forEach(a => {
    const updated = a.updatedAt || a.updated_at || a.submittedDate || a.submitted_date;
    if (updated && Math.round((now - new Date(updated)) / 86400000) > 90) {
      alerts.push({ severity: 'warning', provider: getProvName(a.providerId || a.provider_id), alert: 'Stale Application', detail: `${a.payerName || a.payer_name || 'Payer'} stalled ${Math.round((now - new Date(updated)) / 86400000)} days (${a.status})`, date: updated, category: 'application' });
    }
  });

  alerts.sort((a, b) => ({ critical: 0, urgent: 1, warning: 2, info: 3 }[a.severity] ?? 9) - ({ critical: 0, urgent: 1, warning: 2, info: 3 }[b.severity] ?? 9));

  const critical = alerts.filter(a => a.severity === 'critical').length;
  const urgent = alerts.filter(a => a.severity === 'urgent').length;
  const warnings = alerts.filter(a => a.severity === 'warning').length;
  const info = alerts.filter(a => a.severity === 'info').length;

  const sevBadge = (sev) => {
    const m = { critical: { bg: '#dc2626', t: 'CRITICAL' }, urgent: { bg: '#f97316', t: 'URGENT' }, warning: { bg: '#eab308', t: 'WARNING' }, info: { bg: '#6b7280', t: 'INFO' } };
    const s = m[sev] || m.info;
    return `<span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${s.bg};color:#fff;letter-spacing:0.5px;">${s.t}</span>`;
  };

  function lastScanStr(arr) {
    if (!Array.isArray(arr) || !arr.length) return '—';
    const dates = arr.map(x => x.updatedAt || x.updated_at || x.screenedAt || x.screened_at || x.createdAt || x.created_at).filter(Boolean);
    return dates.length ? formatDateDisplay(dates.sort().reverse()[0]) : '—';
  }

  const sevBorderColor = { critical: '#dc2626', urgent: '#f97316', warning: '#eab308', info: '#6b7280' };

  body.innerHTML = `
    <style>
      .monv2-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:14px; margin-bottom:20px; }
      .monv2-stat { background:var(--surface-card,#fff); border-radius:16px; padding:18px 16px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); text-align:center; transition:transform 0.18s,box-shadow 0.18s; }
      .monv2-stat:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
      .monv2-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      .monv2-stat .monv2-val { font-size:28px; font-weight:800; line-height:1.1; }
      .monv2-stat .monv2-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--gray-500); margin-top:4px; }
      .monv2-alert-row { transition:background 0.15s; }
      .monv2-alert-row:hover { background:var(--gray-50,#f9fafb); }
    </style>

    <!-- Monitoring Scheduler (Feature 8) -->
    ${renderMonitoringScheduler()}

    <!-- V2 Stat Cards -->
    <div class="monv2-stats">
      <div class="monv2-stat" style="border-left:4px solid #dc2626;"><div class="monv2-stat" style="padding:0;box-shadow:none;"><div class="monv2-val" style="color:#dc2626;">${critical}</div><div class="monv2-lbl">Critical</div></div></div>
      <div class="monv2-stat" style="border-left:4px solid #f97316;"><div class="monv2-stat" style="padding:0;box-shadow:none;"><div class="monv2-val" style="color:#f97316;">${urgent}</div><div class="monv2-lbl">Urgent</div></div></div>
      <div class="monv2-stat" style="border-left:4px solid #eab308;"><div class="monv2-stat" style="padding:0;box-shadow:none;"><div class="monv2-val" style="color:#eab308;">${warnings}</div><div class="monv2-lbl">Warnings</div></div></div>
      <div class="monv2-stat" style="border-left:4px solid #6b7280;"><div class="monv2-stat" style="padding:0;box-shadow:none;"><div class="monv2-val" style="color:#6b7280;">${info}</div><div class="monv2-lbl">Info</div></div></div>
      <div class="monv2-stat" style="border-left:4px solid var(--brand-600);"><div class="monv2-stat" style="padding:0;box-shadow:none;"><div class="monv2-val" style="color:var(--brand-600);">${providers.length}</div><div class="monv2-lbl">Monitored</div></div></div>
    </div>

    <div class="card" style="margin-bottom:20px;border-radius:16px;overflow:hidden;">
      <div class="card-header"><h3>Monitoring Schedule</h3></div>
      <div class="card-body" style="padding:0;">
        <table><thead><tr><th>Check</th><th>Frequency</th><th>Source</th><th>Last Run</th><th>Status</th></tr></thead><tbody>
          ${[
            { check: 'License Expiration', freq: 'Daily', source: 'State Licensing Boards', last: lastScanStr(licenses), st: 'active' },
            { check: 'DEA Registration', freq: 'Weekly', source: 'DEA Registration Database', last: lastScanStr(dea), st: 'active' },
            { check: 'OIG/SAM Exclusion', freq: 'Monthly', source: 'OIG LEIE + SAM.gov', last: lastScanStr(exclusions), st: 'active' },
            { check: 'NPI Validation', freq: 'Monthly', source: 'CMS NPPES Registry', last: '—', st: 'active' },
            { check: 'NPDB Query', freq: 'Quarterly', source: 'Nat. Practitioner Data Bank', last: '—', st: 'planned' },
            { check: 'Board Certification', freq: 'Quarterly', source: 'ABMS / Specialty Boards', last: '—', st: 'planned' },
            { check: 'Malpractice Coverage', freq: 'Annually', source: 'Insurance Carriers', last: '—', st: 'planned' },
          ].map(s => `<tr><td><strong>${s.check}</strong></td><td>${s.freq}</td><td style="font-size:12px;color:var(--gray-600);">${s.source}</td><td style="font-size:12px;">${s.last}</td><td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;background:${s.st === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.12)'};color:${s.st === 'active' ? 'var(--green)' : 'var(--gray-500)'};"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>${s.st === 'active' ? 'Active' : 'Planned'}</span></td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>

    <div class="card" style="border-radius:16px;overflow:hidden;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3>Alert Feed (${alerts.length})</h3>
        <div style="display:flex;gap:8px;">
          <select class="form-control" style="width:140px;height:32px;font-size:12px;border-radius:10px;" onchange="document.querySelectorAll('#monitoring-alerts-body tr').forEach(r=>{r.style.display=!this.value||r.dataset.severity===this.value?'':'none'})">
            <option value="">All Severities</option><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="warning">Warning</option><option value="info">Info</option>
          </select>
          <select class="form-control" style="width:140px;height:32px;font-size:12px;border-radius:10px;" onchange="document.querySelectorAll('#monitoring-alerts-body tr').forEach(r=>{r.style.display=!this.value||r.dataset.category===this.value?'':'none'})">
            <option value="">All Categories</option><option value="license">License</option><option value="dea">DEA</option><option value="exclusion">Exclusion</option><option value="verification">Verification</option><option value="task">Task</option><option value="application">Application</option>
          </select>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap"><table><thead><tr><th>Severity</th><th>Provider</th><th>Alert</th><th>Details</th><th>Date</th></tr></thead>
          <tbody id="monitoring-alerts-body">
            ${alerts.map(a => `<tr class="monv2-alert-row" data-severity="${a.severity}" data-category="${a.category}" style="border-left:4px solid ${sevBorderColor[a.severity] || '#6b7280'};">
              <td>${sevBadge(a.severity)}</td><td><strong>${escHtml(a.provider)}</strong></td><td style="font-weight:600;">${escHtml(a.alert)}</td>
              <td style="font-size:12px;color:var(--gray-600);max-width:300px;">${escHtml(a.detail)}</td><td style="font-size:12px;">${a.date ? formatDateDisplay(a.date) : '—'}</td>
            </tr>`).join('')}
            ${!alerts.length ? '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--gray-500);">No alerts — all credentials in good standing.</td></tr>' : ''}
          </tbody>
        </table></div>
      </div>
    </div>
  `;
}

export {
  renderExclusionsPage,
  renderCompliancePage,
  renderPSVPage,
  renderMonitoringPage,
};
