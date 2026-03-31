// ui/pages/provider-profile.js — Lazy-loaded provider profile render functions
// Auto-extracted from app.js for code splitting

const { store, auth, CONFIG, workflow, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, getPayerById, getStateName, navigateTo, appConfirm, appPrompt,
        editButton, deleteButton, helpTip, presetSelectHtml, getPresetValue,
        renderPayerTags, payerLink, sortArrow, timeAgo,
        renderDocumentVersioning, getDocVersionBadge, getDocExpiryHtml, openSignatureModal,
        PAYER_CATALOG, STATES, APPLICATION_STATUSES, PAYER_TAG_DEFS,
        PAYER_SLA_DEFAULTS, getPayerSLA, analyzeHistoricalTimelines,
        CRED_DOCUMENTS,
        PRESET_INSTITUTIONS, PRESET_DEGREES, PRESET_FIELDS_OF_STUDY,
        PRESET_BOARDS, PRESET_MALPRACTICE_CARRIERS, PRESET_COVERAGE_AMOUNTS,
        PRESET_EMPLOYERS, PRESET_POSITIONS, PRESET_CME_PROVIDERS,
        PRESET_CME_COURSES } = window._credentik;

// ─── Predictive Timeline Analytics ───

/**
 * predictApplicationTimeline — estimates how long an application will take
 * based on historical data for the same payer and SLA fallbacks.
 * @param {Object} app - The application to predict
 * @param {Array} allApps - All applications (for historical analysis)
 * @param {Object} payerSLA - Result of getPayerSLA() for this payer
 * @returns {{ predictedDays, confidence, basedOn, estimatedApprovalDate, riskLevel }}
 */
function predictApplicationTimeline(app, allApps, payerSLA) {
  const payerName = app.payerName || app.payer_name || (typeof app.payer === 'object' && app.payer ? app.payer.name : '') || '';
  const appState = app.state || '';
  const appSpecialty = app.specialty || app.providerSpecialty || '';

  // Find completed apps for the same payer
  const completed = allApps.filter(a => {
    if (a.status !== 'approved' && a.status !== 'credentialed') return false;
    const aPayer = a.payerName || a.payer_name || (typeof a.payer === 'object' && a.payer ? a.payer.name : '') || '';
    return aPayer === payerName;
  });

  // Calculate actual days for completed apps
  const historicalDays = [];
  const stateMatchDays = [];
  const specMatchDays = [];
  completed.forEach(a => {
    const submitted = a.submittedDate || a.submitted_date || a.created_at || a.createdAt;
    const approved = a.effectiveDate || a.effective_date || a.approvedDate || a.approved_date || a.updatedAt || a.updated_at;
    if (!submitted || !approved) return;
    const days = Math.floor((new Date(approved) - new Date(submitted)) / 86400000);
    if (days <= 0 || days > 730) return;
    historicalDays.push(days);
    if (appState && a.state === appState) stateMatchDays.push(days);
    const aSpec = a.specialty || a.providerSpecialty || '';
    if (appSpecialty && aSpec === appSpecialty) specMatchDays.push(days);
  });

  let predictedDays, confidence, basedOn;

  if (historicalDays.length >= 5) {
    // High confidence — use state/specialty refinement if available
    const pool = stateMatchDays.length >= 3 ? stateMatchDays : specMatchDays.length >= 3 ? specMatchDays : historicalDays;
    predictedDays = Math.round(pool.reduce((s, d) => s + d, 0) / pool.length);
    confidence = 'high';
    basedOn = pool.length + ' completed ' + payerName + ' applications' + (pool === stateMatchDays ? ' (state match)' : pool === specMatchDays ? ' (specialty match)' : '');
  } else if (historicalDays.length >= 2) {
    predictedDays = Math.round(historicalDays.reduce((s, d) => s + d, 0) / historicalDays.length);
    confidence = 'medium';
    basedOn = historicalDays.length + ' completed ' + payerName + ' applications';
  } else {
    predictedDays = payerSLA.avgDays;
    confidence = 'low';
    basedOn = 'Payer SLA defaults (' + payerSLA.avgDays + 'd avg)';
  }

  // Calculate estimated approval date
  const submitted = app.submittedDate || app.submitted_date || app.created_at || app.createdAt;
  let estimatedApprovalDate = null;
  let riskLevel = 'on-track';
  if (submitted) {
    const submittedDate = new Date(submitted);
    estimatedApprovalDate = new Date(submittedDate.getTime() + predictedDays * 86400000);
    const elapsed = Math.floor((new Date() - submittedDate) / 86400000);
    if (elapsed > predictedDays * 1.2) riskLevel = 'delayed';
    else if (elapsed > predictedDays * 0.75) riskLevel = 'at-risk';
  }

  return { predictedDays, confidence, basedOn, estimatedApprovalDate, riskLevel };
}

async function renderProviderDashboard(user) {
  const body = document.getElementById('page-body');
  const providerId = user.provider_id || user.providerId;

  let provider = null, licenses = [], apps = [], documents = [], tasks = [], exclusions = [];
  try {
    if (providerId) {
      [provider, licenses, apps, documents, tasks, exclusions] = await Promise.all([
        store.getOne('providers', providerId).catch(() => null),
        store.getAll('licenses').then(l => l.filter(x => (x.providerId || x.provider_id) == providerId)).catch(() => []),
        store.getAll('applications').then(a => a.filter(x => (x.providerId || x.provider_id) == providerId)).catch(() => []),
        store.getProviderDocuments(providerId).catch(() => []),
        store.getAll('tasks').catch(() => []),
        store.getAll('exclusions').then(e => e.filter(x => (x.providerId || x.provider_id) == providerId)).catch(() => []),
      ]);
      // Also fetch application attachments and merge into documents
      if (apps && apps.length > 0) {
        const appAttachments = await Promise.all(
          apps.map(a => store.getApplicationAttachments(a.id).catch(() => []))
        );
        appAttachments.forEach((attachments, i) => {
          if (Array.isArray(attachments)) {
            attachments.forEach(att => {
              documents.push({
                id: 'app-att-' + (att.id || ''),
                documentType: 'application_attachment',
                document_type: 'application_attachment',
                documentName: att.label || att.originalName || att.original_name || 'Attachment',
                document_name: att.label || att.originalName || att.original_name || 'Attachment',
                status: 'received',
                receivedDate: att.createdAt || att.created_at,
                received_date: att.createdAt || att.created_at,
                filePath: att.filePath || att.file_path,
                file_path: att.filePath || att.file_path,
                fileSize: att.fileSize || att.file_size,
                file_size: att.fileSize || att.file_size,
                mimeType: att.mimeType || att.mime_type,
                notes: (apps[i]?.payerName || 'Application') + ' — ' + (att.label || att.originalName || att.original_name || ''),
                _isAppAttachment: true,
                _applicationId: apps[i]?.id,
                _attachmentId: att.id,
                _payerName: apps[i]?.payerName || apps[i]?.payer_name || '',
                _state: apps[i]?.state || '',
              });
            });
          }
        });
      }
    }
  } catch (e) { console.error('Provider dashboard error:', e); }

  if (!Array.isArray(licenses)) licenses = [];
  if (!Array.isArray(apps)) apps = [];
  if (!Array.isArray(documents)) documents = [];
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(exclusions)) exclusions = [];

  const activeLicenses = licenses.filter(l => l.status === 'active');
  const today = new Date();
  const in30 = new Date(Date.now() + 30 * 86400000);
  const in90 = new Date(Date.now() + 90 * 86400000);
  const expiring30 = licenses.filter(l => { const exp = new Date(l.expirationDate || l.expiration_date); return exp > today && exp <= in30; });
  const expiring90 = licenses.filter(l => { const exp = new Date(l.expirationDate || l.expiration_date); return exp > today && exp <= in90; });
  const expiredLic = licenses.filter(l => { const exp = l.expirationDate || l.expiration_date; return exp && new Date(exp) < today; });
  const approvedApps = apps.filter(a => a.status === 'approved');
  const pendingApps = apps.filter(a => !['approved','denied','withdrawn'].includes(a.status));
  const verifiedDocs = documents.filter(d => d.status === 'verified' || d.status === 'received');
  const myTasks = tasks.filter(t => !t.completed && !t.isCompleted);
  const overdueTasks = myTasks.filter(t => t.dueDate && t.dueDate < today.toISOString().split('T')[0]);
  const provName = provider ? `${provider.firstName || provider.first_name || ''} ${provider.lastName || provider.last_name || ''}`.trim() : user.name || 'Provider';
  const credential = provider?.credentials || '';

  // Compliance score calculation
  let compScore = 100;
  const compIssues = [];
  if (expiredLic.length > 0) { compScore -= expiredLic.length * 20; compIssues.push({ sev: 'critical', text: `${expiredLic.length} expired license(s)` }); }
  if (exclusions.some(e => e.status === 'excluded' || e.result === 'excluded')) { compScore -= 30; compIssues.push({ sev: 'critical', text: 'Exclusion flag on record' }); }
  if (expiring30.length > 0) { compScore -= expiring30.length * 10; compIssues.push({ sev: 'warning', text: `${expiring30.length} license(s) expiring in 30 days` }); }
  if (expiring90.length > 0) { compScore -= expiring90.length * 5; compIssues.push({ sev: 'info', text: `${expiring90.length} license(s) expiring in 90 days` }); }
  if (licenses.length === 0) { compScore -= 15; compIssues.push({ sev: 'warning', text: 'No licenses on file' }); }
  const incompleteAppDocs = apps.filter(a => { const docs = a.documentChecklist || {}; return !CRED_DOCUMENTS.every(d => docs[d.id]?.completed); });
  if (incompleteAppDocs.length > 0) { compScore -= incompleteAppDocs.length * 3; compIssues.push({ sev: 'info', text: `${incompleteAppDocs.length} app(s) with incomplete documents` }); }
  compScore = Math.max(0, Math.min(100, compScore));
  const sColor = compScore >= 85 ? 'var(--green)' : compScore >= 60 ? 'var(--warning-500)' : 'var(--red)';
  const sLabel = compScore >= 85 ? 'Healthy' : compScore >= 60 ? 'At Risk' : 'Critical';

  // Credential tracker — progress through credentialing lifecycle
  const totalDocSlots = apps.length * CRED_DOCUMENTS.length;
  const completedDocSlots = apps.reduce((sum, a) => { const docs = a.documentChecklist || {}; return sum + CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length; }, 0);
  const docPct = totalDocSlots > 0 ? Math.round((completedDocSlots / totalDocSlots) * 100) : 0;

  // Action items — prioritized list
  const actions = [];
  expiredLic.forEach(l => actions.push({ priority: 1, icon: '&#10007;', color: 'var(--red)', text: `Renew expired ${l.state} license (expired ${formatDateDisplay(l.expirationDate || l.expiration_date)})` }));
  expiring30.forEach(l => { const d = Math.ceil((new Date(l.expirationDate || l.expiration_date) - today) / 86400000); actions.push({ priority: 2, icon: '&#9888;', color: 'var(--red)', text: `${l.state} license expires in ${d} days` }); });
  overdueTasks.forEach(t => actions.push({ priority: 3, icon: '&#128337;', color: 'var(--warning-500)', text: `Overdue task: ${t.title || t.description}` }));
  incompleteAppDocs.forEach(a => { const docs = a.documentChecklist || {}; const done = CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length; const pct = Math.round(done / CRED_DOCUMENTS.length * 100); actions.push({ priority: 4, icon: '&#128196;', color: 'var(--brand-600)', text: `${a.payerName || 'Application'} — ${pct}% documents complete` }); });
  expiring90.filter(l => !expiring30.includes(l)).forEach(l => { const d = Math.ceil((new Date(l.expirationDate || l.expiration_date) - today) / 86400000); actions.push({ priority: 5, icon: '&#128197;', color: 'var(--brand-500)', text: `${l.state} license expires in ${d} days` }); });
  actions.sort((a, b) => a.priority - b.priority);

  body.innerHTML = `
    <style>
      .pdv2-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .pdv2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .pdv2-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
      .pdv2-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
      .pdv2-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
      .pdv2-card{border-radius:16px!important;overflow:hidden;}
      .pdv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <!-- Welcome Header with Compliance Score -->
    <div style="display:grid;grid-template-columns:1fr 180px;gap:20px;margin-bottom:20px;align-items:center;">
      <div>
        <h2 style="margin:0;">${escHtml(provName)}${credential ? ', ' + escHtml(credential) : ''}</h2>
        <p style="color:var(--gray-500);margin:4px 0 0;">NPI: ${provider?.npi || '—'} &middot; ${escHtml(provider?.specialty || '—')}</p>
      </div>
      <div style="text-align:center;">
        <div style="position:relative;width:100px;height:100px;margin:0 auto;">
          <svg viewBox="0 0 120 120" style="transform:rotate(-90deg);">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--gray-200)" stroke-width="8"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="${sColor}" stroke-width="8"
              stroke-dasharray="${Math.round(compScore * 3.267)} 326.7" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div style="font-size:28px;font-weight:800;color:${sColor};line-height:1;">${compScore}</div>
          </div>
        </div>
        <div style="font-size:12px;font-weight:600;color:${sColor};margin-top:4px;">${sLabel}</div>
        <div style="font-size:10px;color:var(--gray-400);">Compliance Score</div>
      </div>
    </div>

    <!-- Onboarding Checklist (shown if provider is newly onboarded) -->
    ${provider?.onboardingStatus !== 'completed' || (apps.length === 0 && documents.length === 0) ? `
    <div class="card pdv2-card" style="margin-bottom:16px;border-left:3px solid var(--brand-600);">
      <div class="card-header"><h3>Onboarding Checklist</h3><span style="font-size:12px;color:var(--gray-400);">Complete these steps to get fully credentialed</span></div>
      <div class="card-body" style="padding:8px 16px;">
        ${[
          { done: !!provider?.npi, label: 'NPI verified', desc: 'National Provider Identifier on file' },
          { done: activeLicenses.length > 0, label: 'State license(s) added', desc: `${activeLicenses.length} active license(s)` },
          { done: documents.length > 0, label: 'Documents uploaded', desc: `${documents.length} document(s) on file` },
          { done: apps.length > 0, label: 'Applications created', desc: `${apps.length} application(s) in pipeline` },
          { done: approvedApps.length > 0, label: 'First payer approved', desc: approvedApps.length > 0 ? `${approvedApps.length} approved` : 'Pending payer approval' },
        ].map((item, i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i > 0 ? 'border-top:1px solid var(--gray-100);' : ''}">
            <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;${item.done ? 'background:#dcfce7;color:#16a34a;' : 'background:var(--gray-100);color:var(--gray-400);'}">${item.done ? '&#10003;' : (i + 1)}</div>
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;${item.done ? 'color:var(--gray-700);' : 'color:var(--text-primary);'}">${item.label}</div>
              <div style="font-size:11px;color:var(--gray-500);">${item.desc}</div>
            </div>
            ${item.done ? '<span style="font-size:11px;font-weight:600;color:#16a34a;padding:2px 8px;border-radius:10px;background:#dcfce7;">Done</span>' : '<span style="font-size:11px;font-weight:600;color:var(--gray-400);padding:2px 8px;border-radius:10px;background:var(--gray-100);">Pending</span>'}
          </div>
        `).join('')}
        <div style="margin-top:12px;padding:10px;background:var(--brand-50,#eff6ff);border-radius:8px;font-size:12px;color:var(--brand-600);">
          <strong>${[!!provider?.npi, activeLicenses.length > 0, documents.length > 0, apps.length > 0, approvedApps.length > 0].filter(Boolean).length}/5 steps complete</strong> — ${approvedApps.length > 0 ? 'You\'re fully onboarded!' : 'Your credentialing team is working on it.'}
        </div>
      </div>
    </div>` : ''}

    <!-- Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:16px;">
      <div class="stat-card pdv2-stat"><div class="label">Active Licenses</div><div class="value" style="color:var(--green);">${activeLicenses.length}</div></div>
      <div class="stat-card pdv2-stat"><div class="label">Pending Apps</div><div class="value" style="color:var(--brand-600);">${pendingApps.length}</div></div>
      <div class="stat-card pdv2-stat"><div class="label">Credentialed</div><div class="value" style="color:var(--green);">${approvedApps.length}</div></div>
      <div class="stat-card pdv2-stat"><div class="label">Expiring</div><div class="value" style="color:${expiring90.length > 0 ? 'var(--red)' : 'var(--gray-400)'};">${expiring90.length}</div></div>
      <div class="stat-card pdv2-stat"><div class="label">Documents</div><div class="value">${verifiedDocs.length}/${documents.length}</div></div>
      <div class="stat-card pdv2-stat"><div class="label">Open Tasks</div><div class="value" style="color:${overdueTasks.length > 0 ? 'var(--red)' : ''}">${myTasks.length}</div></div>
    </div>

    <!-- Action Items -->
    ${actions.length > 0 ? `
    <div class="card pdv2-card" style="margin-bottom:16px;border-left:3px solid ${actions[0].color};">
      <div class="card-header"><h3>Action Items (${actions.length})</h3></div>
      <div class="card-body" style="padding:8px 16px;">
        ${actions.slice(0, 8).map(a => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-100);">
            <div style="width:24px;height:24px;border-radius:6px;background:${a.color}12;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;color:${a.color};">${a.icon}</div>
            <div style="font-size:13px;color:var(--gray-700);flex:1;">${a.text}</div>
          </div>
        `).join('')}
      </div>
    </div>` : `
    <div class="card pdv2-card" style="margin-bottom:16px;border-left:3px solid var(--green);">
      <div class="card-body" style="padding:16px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;color:var(--green);">&#10003;</span>
        <div><strong style="color:var(--green);">All clear!</strong><div class="text-sm text-muted">No urgent action items. Your credentialing is in good standing.</div></div>
      </div>
    </div>`}

    <!-- Credential Progress Tracker -->
    ${apps.length > 0 ? `
    <div class="card pdv2-card" style="margin-bottom:16px;">
      <div class="card-header"><h3>Credentialing Progress</h3></div>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="flex:1;height:10px;background:var(--gray-200);border-radius:5px;overflow:hidden;">
            <div style="width:${docPct}%;height:100%;background:${docPct === 100 ? 'var(--green)' : 'var(--brand-500)'};border-radius:5px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:14px;font-weight:700;color:${docPct === 100 ? 'var(--green)' : 'var(--brand-600)'};">${docPct}%</span>
        </div>
        ${apps.map(a => {
          const docs = a.documentChecklist || {};
          const done = CRED_DOCUMENTS.filter(d => docs[d.id]?.completed).length;
          const aPct = Math.round(done / CRED_DOCUMENTS.length * 100);
          const statusSteps = ['gathering_docs','submitted','in_review','approved','credentialed'];
          const currentStep = statusSteps.indexOf(a.status);
          return `<div style="padding:10px 0;border-bottom:1px solid var(--gray-100);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div><strong style="font-size:13px;">${payerLink(a.payerName || 'Application', a.payerId)}</strong> <span class="text-sm text-muted">${escHtml(a.state || '')}</span></div>
              <span class="badge badge-${a.status === 'approved' || a.status === 'credentialed' ? 'approved' : a.status === 'denied' ? 'denied' : 'pending'}">${a.status?.replace(/_/g, ' ')}</span>
            </div>
            <div style="display:flex;gap:2px;margin-bottom:6px;">
              ${statusSteps.map((s, i) => `<div style="flex:1;height:4px;border-radius:2px;background:${i <= currentStep ? (a.status === 'denied' ? 'var(--red)' : 'var(--green)') : 'var(--gray-200)'};"></div>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-400);">
              <span>Docs: ${done}/${CRED_DOCUMENTS.length} (${aPct}%)</span>
              ${a.submittedDate ? `<span>Submitted: ${formatDateDisplay(a.submittedDate)}</span>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <!-- My Licenses -->
      <div class="card pdv2-card">
        <div class="card-header"><h3>My Licenses (${licenses.length})</h3></div>
        <div class="card-body" style="padding:0;">
          ${licenses.length > 0 ? `<table><thead><tr><th>State</th><th>Number</th><th>Status</th><th>Expires</th></tr></thead><tbody>
            ${licenses.map(l => {
              const exp = l.expirationDate || l.expiration_date;
              const isExpired = exp && new Date(exp) < today;
              const daysLeft = exp ? Math.ceil((new Date(exp) - today) / 86400000) : null;
              const verStatus = l.verificationStatus || l.verification_status;
              return `<tr>
                <td><strong>${escHtml(l.state || '—')}</strong></td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>
                  <span class="badge badge-${l.status === 'active' ? 'approved' : l.status === 'expired' ? 'denied' : 'pending'}">${escHtml(l.status || '—')}</span>
                  ${verStatus === 'verified' ? ' <span style="font-size:10px;color:var(--green);">&#10003;</span>' : ''}
                </td>
                <td style="${isExpired ? 'color:var(--red);font-weight:600;' : daysLeft !== null && daysLeft <= 30 ? 'color:var(--warning-500);font-weight:600;' : ''}">
                  ${formatDateDisplay(exp)}
                  ${daysLeft !== null ? (isExpired ? `<div style="font-size:10px;color:var(--red);">EXPIRED</div>` : daysLeft <= 90 ? `<div style="font-size:10px;">${daysLeft}d left</div>` : '') : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody></table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No licenses on file.</div>'}
        </div>
      </div>

      <!-- My Applications -->
      <div class="card pdv2-card">
        <div class="card-header"><h3>My Applications (${apps.length})</h3></div>
        <div class="card-body" style="padding:0;">
          ${apps.length > 0 ? `<table><thead><tr><th>Payer</th><th>State</th><th>Status</th><th>Submitted</th></tr></thead><tbody>
            ${apps.map(a => `<tr>
              <td><strong>${payerLink(a.payerName || a.payer_name || a.payer?.name || '—', a.payerId)}</strong></td>
              <td>${escHtml(a.state || '—')}</td>
              <td><span class="badge badge-${a.status === 'approved' ? 'approved' : a.status === 'denied' ? 'denied' : 'pending'}">${escHtml(a.status?.replace(/_/g, ' ') || '—')}</span></td>
              <td>${formatDateDisplay(a.submittedDate || a.submitted_date)}</td>
            </tr>`).join('')}
          </tbody></table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No applications yet.</div>'}
        </div>
      </div>

      <!-- Practice Locations -->
      ${await (async () => {
        const allFacilities = await store.getFacilities().catch(() => []);
        const facMap = {};
        (Array.isArray(allFacilities) ? allFacilities : []).forEach(f => { facMap[f.id] = f; });
        const locApps = apps.filter(a => a.facilityId && facMap[a.facilityId]);
        // Deduplicate by facilityId to get unique locations
        const seenFac = new Set();
        const provLocations = [];
        locApps.forEach(a => {
          if (!seenFac.has(a.facilityId)) {
            seenFac.add(a.facilityId);
            const f = facMap[a.facilityId];
            const facApps = locApps.filter(x => x.facilityId === a.facilityId);
            provLocations.push({ facility: f, apps: facApps });
          }
        });
        return `<div class="card pdv2-card">
          <div class="card-header"><h3>Practice Locations (${provLocations.length})</h3></div>
          <div class="card-body" style="padding:0;">
            ${provLocations.length > 0 ? `<table><thead><tr><th>Location</th><th>City / State</th><th>Type</th><th>Applications</th></tr></thead><tbody>
              ${provLocations.map(pl => `<tr>
                <td><strong style="color:var(--brand-600);cursor:pointer;" onclick="window.app.viewFacility('${pl.facility.id}')">${escHtml(pl.facility.name || '—')}</strong></td>
                <td>${escHtml([pl.facility.city, pl.facility.state].filter(Boolean).join(', ') || '—')}</td>
                <td>${escHtml((pl.facility.facilityType || pl.facility.type || '—').replace(/_/g, ' '))}</td>
                <td><span class="badge badge-approved" style="font-size:10px;">${pl.apps.length} app${pl.apps.length !== 1 ? 's' : ''}</span></td>
              </tr>`).join('')}
            </tbody></table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No practice locations linked via applications.</div>'}
          </div>
        </div>`;
      })()}

      <!-- My Documents — Self-Service Upload -->
      <div class="card pdv2-card" style="grid-column:1/-1;">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3>My Documents</h3>
          <span style="font-size:12px;color:var(--gray-500);">${documents.length} uploaded &middot; ${CRED_DOCUMENTS.length} required</span>
        </div>
        <div class="card-body" style="padding:8px 16px;">
          ${(() => {
            const categories = [...new Set(CRED_DOCUMENTS.map(d => d.category))];
            const docsByType = {};
            documents.forEach(d => {
              const t = d.documentType || d.document_type || d.type || '';
              if (!docsByType[t]) docsByType[t] = [];
              docsByType[t].push(d);
            });
            const catIcons = { Provider: '&#128100;', License: '&#128196;', Education: '&#127891;', Insurance: '&#128737;', Billing: '&#128176;', Compliance: '&#9989;', Payer: '&#127970;' };
            return categories.map(cat => {
              const catDocs = CRED_DOCUMENTS.filter(d => d.category === cat);
              const catUploaded = catDocs.filter(d => docsByType[d.id]?.length > 0).length;
              return `
              <div style="margin-bottom:14px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                  <span style="font-size:14px;">${catIcons[cat] || '&#128196;'}</span>
                  <strong style="font-size:13px;">${cat}</strong>
                  <span style="font-size:11px;color:var(--gray-400);">${catUploaded}/${catDocs.length}</span>
                  <div style="flex:1;height:3px;background:var(--gray-200);border-radius:2px;overflow:hidden;">
                    <div style="width:${catDocs.length > 0 ? Math.round(catUploaded / catDocs.length * 100) : 0}%;height:100%;background:${catUploaded === catDocs.length ? 'var(--green)' : 'var(--brand-500)'};border-radius:2px;"></div>
                  </div>
                </div>
                ${catDocs.map(cd => {
                  const uploaded = docsByType[cd.id] || [];
                  const latest = uploaded.length > 0 ? uploaded[uploaded.length - 1] : null;
                  const isExpired = latest && (latest.expirationDate || latest.expiration_date) && new Date(latest.expirationDate || latest.expiration_date) < today;
                  const statusLabel = latest ? (isExpired ? 'expired' : (latest.status || 'pending')) : 'missing';
                  const statusClass = (statusLabel === 'verified' || statusLabel === 'received') ? 'approved' : (statusLabel === 'missing' || statusLabel === 'expired') ? 'denied' : 'pending';
                  const hasFile = latest && (latest.filePath || latest.file_path);
                  return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-50);">
                    <div style="width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;${latest ? (isExpired ? 'background:#fef2f2;color:var(--red);' : 'background:#dcfce7;color:#16a34a;') : 'background:var(--gray-100);color:var(--gray-400);'}">${latest ? (isExpired ? '&#9888;' : '&#10003;') : '&#8943;'}</div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:13px;font-weight:${latest ? '500' : '600'};color:${latest ? 'var(--gray-700)' : 'var(--text-primary)'};">${cd.label}</div>
                      ${latest ? `<div style="font-size:11px;color:var(--gray-500);">Uploaded ${formatDateDisplay(latest.receivedDate || latest.received_date || latest.createdAt || latest.created_at)}${isExpired ? ' — <span style="color:var(--red);font-weight:600;">EXPIRED</span>' : (latest.expirationDate || latest.expiration_date) ? ' — Exp: ' + formatDateDisplay(latest.expirationDate || latest.expiration_date) : ''}</div>` : '<div style="font-size:11px;color:var(--gray-400);">Not yet uploaded</div>'}
                    </div>
                    <span class="badge badge-${statusClass}" style="font-size:10px;">${statusLabel}</span>
                    ${hasFile ? `<button class="btn btn-sm" onclick="window.app.downloadDocument('${providerId}', ${latest.id})" style="padding:2px 8px;font-size:11px;">View</button>` : ''}
                    <button class="btn btn-sm ${latest ? '' : 'btn-primary'}" onclick="window._credentik._providerUploadDoc('${providerId}', '${cd.id}', '${escAttr(cd.label)}')" style="padding:2px 8px;font-size:11px;">${latest ? (isExpired ? 'Replace' : 'Replace') : 'Upload'}</button>
                  </div>`;
                }).join('')}
              </div>`;
            }).join('');
          })()}
          ${(() => {
            const knownTypes = new Set(CRED_DOCUMENTS.map(d => d.id));
            const extraDocs = documents.filter(d => !knownTypes.has(d.documentType || d.document_type || d.type) && !d._isAppAttachment);
            const appAttDocs = documents.filter(d => d._isAppAttachment);
            let html = '';
            if (appAttDocs.length > 0) {
              html += `<div style="margin-top:14px;border-top:2px solid var(--brand-100);padding-top:10px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                  <span style="font-size:14px;">&#128206;</span>
                  <strong style="font-size:13px;color:var(--brand-600);">Application Attachments</strong>
                  <span style="font-size:11px;color:var(--gray-400);">${appAttDocs.length} file(s)</span>
                </div>
                ${appAttDocs.map(d => {
                  const hasFile = d.filePath || d.file_path;
                  return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-50);">
                    <div style="width:24px;height:24px;border-radius:6px;background:#ede9fe;color:#7c3aed;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;">&#128206;</div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:13px;font-weight:500;">${escHtml(d.documentName || d.document_name || '—')}</div>
                      <div style="font-size:11px;color:var(--gray-500);">${escHtml(d._payerName || '')}${d._state ? ' (' + d._state + ')' : ''} — ${formatDateDisplay(d.receivedDate || d.received_date)}</div>
                    </div>
                    <span class="badge badge-approved" style="font-size:10px;">received</span>
                    ${hasFile ? `<button class="btn btn-sm" onclick="window.app.downloadAppAttachment('${d._applicationId}', '${d._attachmentId}')" style="padding:2px 8px;font-size:11px;">Download</button>` : ''}
                  </div>`;
                }).join('')}
              </div>`;
            }
            if (extraDocs.length > 0) {
              html += `<div style="margin-top:14px;border-top:1px solid var(--gray-200);padding-top:10px;">
                <strong style="font-size:13px;color:var(--gray-600);">Other Documents</strong>
                ${extraDocs.map(d => {
                  const hasFile = d.filePath || d.file_path;
                  return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-50);">
                    <div style="width:24px;height:24px;border-radius:6px;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;">&#10003;</div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:13px;">${escHtml(d.documentName || d.document_name || d.name || '—')}</div>
                      <div style="font-size:11px;color:var(--gray-500);">${escHtml((d.documentType || d.document_type || d.type || '').replace(/_/g, ' '))}</div>
                    </div>
                    <span class="badge badge-${d.status === 'verified' || d.status === 'received' ? 'approved' : d.status === 'expired' ? 'denied' : 'pending'}" style="font-size:10px;">${escHtml(d.status || 'pending')}</span>
                    ${hasFile ? `<button class="btn btn-sm" onclick="window.app.downloadDocument('${providerId}', ${d.id})" style="padding:2px 8px;font-size:11px;">View</button>` : ''}
                  </div>`;
                }).join('')}
              </div>`;
            }
            return html;
          })()}
          <div style="margin-top:14px;display:flex;gap:8px;">
            <button class="btn btn-primary" onclick="window._credentik._providerUploadDoc('${providerId}', '', '')">
              &#43; Upload New Document
            </button>
          </div>
        </div>
      </div>

      <!-- Provider Document Upload Modal -->
      <div class="modal-overlay" id="provider-doc-upload-modal">
        <div class="modal" style="max-width:500px;">
          <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;">
            <h3 id="provider-doc-upload-title">Upload Document</h3>
            <button class="btn btn-sm" onclick="document.getElementById('provider-doc-upload-modal').classList.remove('active')">&times;</button>
          </div>
          <div class="modal-body" style="padding:1rem;">
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Document Type *</label>
              <select id="provider-doc-upload-type" class="form-control">
                <option value="">Select type...</option>
                ${CRED_DOCUMENTS.map(d => `<option value="${d.id}">${escHtml(d.label)}</option>`).join('')}
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Document Name *</label>
              <input type="text" id="provider-doc-upload-name" class="form-control" placeholder="e.g. NY Medical License 2026">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">File * <span style="color:var(--gray-400);font-size:11px;">(PDF, JPG, PNG — max 20MB)</span></label>
              <input type="file" id="provider-doc-upload-file" class="form-control" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.tif,.tiff">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Expiration Date</label>
              <input type="date" id="provider-doc-upload-expiry" class="form-control">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Link to Application</label>
              <select id="provider-doc-upload-app" class="form-control">
                <option value="">None — general provider document</option>
                ${apps.map(a => {
                  const payer = a.payerName || a.payer_name || 'Unknown Payer';
                  const state = a.state || '';
                  const status = (a.status || '').replace(/_/g, ' ');
                  return `<option value="${a.id}">${escHtml(payer)} (${state}) — ${status}</option>`;
                }).join('')}
              </select>
              <div style="font-size:11px;color:var(--gray-400);margin-top:3px;">If linked, this file will also appear under the application's attachments.</div>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Notes</label>
              <textarea id="provider-doc-upload-notes" class="form-control" rows="2" placeholder="Optional notes..."></textarea>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem;">
            <button class="btn" onclick="document.getElementById('provider-doc-upload-modal').classList.remove('active')">Cancel</button>
            <button class="btn btn-primary" id="provider-doc-upload-save-btn">Upload</button>
          </div>
        </div>
      </div>

      <!-- Messages from Credentialing Team -->
      ${await (async () => {
        let msgs = [];
        try { msgs = await store.getCommunicationLogs({ channel: 'internal' }).catch(() => []); } catch {}
        if (!Array.isArray(msgs)) msgs = [];
        const myMsgs = msgs.filter(m => String(m.recipientId || m.recipient_id) === String(providerId) || String(m.providerId || m.provider_id) === String(providerId));
        const unreadMsgs = myMsgs.filter(m => !m.isRead && !m.is_read);
        return myMsgs.length > 0 ? `
        <div class="card pdv2-card" ${unreadMsgs.length > 0 ? 'style="border-left:3px solid var(--brand-600);"' : ''}>
          <div class="card-header"><h3>Messages ${unreadMsgs.length > 0 ? `<span style="background:var(--brand-600);color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;margin-left:6px;">${unreadMsgs.length} new</span>` : ''}</h3></div>
          <div class="card-body" style="padding:0;">
            <table><thead><tr><th>From</th><th>Subject</th><th>Type</th><th>Date</th></tr></thead><tbody>
              ${myMsgs.slice(0, 10).map(m => {
                const isUnread = !m.isRead && !m.is_read;
                const typeLabels = { document_request: 'Doc Request', info_request: 'Info Request', urgent: 'Urgent', status_update: 'Status', follow_up: 'Follow-up', message: 'Message' };
                const msgType = m.messageType || m.message_type || m.type || 'message';
                return `<tr style="${isUnread ? 'font-weight:700;background:var(--brand-50);' : ''}">
                  <td>${escHtml(m.senderName || m.sender_name || 'Credentialing Team')}</td>
                  <td>${escHtml(m.subject || m.body?.substring(0, 50) || '—')}</td>
                  <td><span style="font-size:10px;font-weight:600;text-transform:uppercase;">${typeLabels[msgType] || msgType}</span></td>
                  <td>${formatDateDisplay(m.createdAt || m.created_at)}</td>
                </tr>`;
              }).join('')}
            </tbody></table>
          </div>
        </div>` : '';
      })()}

      <!-- Compliance Issues -->
      <div class="card pdv2-card">
        <div class="card-header"><h3>Compliance Status</h3></div>
        <div class="card-body">
          ${compIssues.length > 0 ? compIssues.map(i => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100);">
              <span style="width:8px;height:8px;border-radius:50%;background:${i.sev === 'critical' ? 'var(--red)' : i.sev === 'warning' ? 'var(--warning-500)' : 'var(--gray-400)'};flex-shrink:0;"></span>
              <span style="font-size:13px;color:var(--gray-700);">${i.text}</span>
            </div>
          `).join('') : `
            <div style="text-align:center;padding:16px;color:var(--green);">
              <div style="font-size:20px;margin-bottom:4px;">&#10003;</div>
              <div style="font-weight:600;">Fully Compliant</div>
              <div class="text-sm text-muted">All credentials are current and verified.</div>
            </div>`}
        </div>
      </div>
    </div>

    ${providerId ? `<div style="margin-top:16px;text-align:center;">
      <button class="btn btn-primary" onclick="window.app.openProviderProfile('${providerId}')">View Full Profile</button>
      <button class="btn" onclick="window.app.openProviderPrintout('${providerId}')" style="margin-left:8px;">Credential Sheet</button>
    </div>` : ''}
  `;

  // ── Provider self-service upload handler ──
  window._credentik._providerUploadDoc = function(provId, docTypeId, docLabel) {
    const modal = document.getElementById('provider-doc-upload-modal');
    if (!modal) return;
    // Reset fields
    ['provider-doc-upload-type','provider-doc-upload-name','provider-doc-upload-file','provider-doc-upload-expiry','provider-doc-upload-notes','provider-doc-upload-app'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
    // Pre-fill if a specific doc type was clicked
    const typeSelect = document.getElementById('provider-doc-upload-type');
    if (docTypeId && typeSelect) {
      typeSelect.value = docTypeId;
    }
    const nameInput = document.getElementById('provider-doc-upload-name');
    if (docLabel && nameInput) {
      nameInput.value = docLabel;
    }
    const titleEl = document.getElementById('provider-doc-upload-title');
    if (titleEl) titleEl.textContent = docLabel ? 'Upload ' + docLabel : 'Upload Document';
    modal.classList.add('active');

    // Wire save button
    const saveBtn = document.getElementById('provider-doc-upload-save-btn');
    if (saveBtn) {
      const newBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newBtn, saveBtn);
      newBtn.addEventListener('click', async function() {
        const docType = document.getElementById('provider-doc-upload-type')?.value;
        const docName = document.getElementById('provider-doc-upload-name')?.value?.trim();
        const fileInput = document.getElementById('provider-doc-upload-file');
        const file = fileInput?.files?.[0];
        if (!docType) { showToast('Please select a document type'); return; }
        if (!docName) { showToast('Please enter a document name'); return; }
        if (!file) { showToast('Please select a file to upload'); return; }
        if (file.size > 20 * 1024 * 1024) { showToast('File must be under 20MB'); return; }

        newBtn.disabled = true; newBtn.textContent = 'Uploading...';
        try {
          const linkedAppId = document.getElementById('provider-doc-upload-app')?.value;
          // Upload to provider documents
          await store.uploadProviderDocument(
            provId, file, docType, docName,
            document.getElementById('provider-doc-upload-expiry')?.value || null,
            document.getElementById('provider-doc-upload-notes')?.value?.trim() || null
          );
          // Also upload as application attachment if linked
          if (linkedAppId) {
            try {
              await store.uploadApplicationAttachment(linkedAppId, file, docName || file.name, 'Uploaded from provider documents');
            } catch (e) { console.warn('App attachment upload failed (API may not be deployed yet):', e.message); }
          }
          showToast('Document uploaded successfully');
          modal.classList.remove('active');
          // Refresh the provider dashboard
          await renderProviderDashboard(user);
        } catch (e) {
          showToast('Upload failed: ' + e.message);
        } finally {
          newBtn.disabled = false; newBtn.textContent = 'Upload';
        }
      });
    }
  };
}

async function renderProviderPrintout(providerId) {
  const body = document.getElementById('page-body');

  if (!providerId) {
    body.innerHTML = '<div class="alert alert-warning">No provider selected. Go to Providers and click the print icon to generate a credential sheet.</div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Generating credential sheet...</div></div>';

  let provider = {};
  let providerLicenses = [];
  let apps = [];
  let education = [];
  let boards = [];
  let agency = null;

  try { provider = await store.getOne('providers', providerId); } catch (e) {}
  try {
    const allLic = await store.getAll('licenses');
    providerLicenses = allLic.filter(l => (l.providerId || l.provider_id) == providerId);
  } catch (e) {}
  try {
    const allApps = await store.getAll('applications');
    apps = allApps.filter(a => (a.providerId || a.provider_id) == providerId);
  } catch (e) {}
  try { education = await store.getProviderEducation(providerId); } catch (e) {}
  try { boards = await store.getProviderBoards(providerId); } catch (e) {}
  try { agency = auth.getAgency(); } catch (e) {}

  if (!Array.isArray(education)) education = [];
  if (!Array.isArray(boards)) boards = [];

  const provName = `${provider.firstName || provider.first_name || ''} ${provider.lastName || provider.last_name || ''}`.trim() || 'Unknown Provider';
  const credential = provider.credentials || provider.credential || '';
  const npi = provider.npi || '';
  const taxonomy = provider.taxonomy || provider.taxonomy_code || provider.taxonomyCode || '';
  const specialty = provider.specialty || provider.taxonomy_desc || provider.taxonomyDesc || '';
  const email = provider.email || '';
  const phone = provider.phone || '';
  const caqhId = provider.caqhId || provider.caqh_id || '';
  const orgName = provider.organization?.name || provider.organizationName || provider.organization_name || '';
  const agencyName = agency?.name || agency?.agencyName || agency?.agency_name || '';
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Active licenses sorted by state
  const activeLicenses = providerLicenses
    .filter(l => l.status === 'active')
    .sort((a, b) => (a.state || '').localeCompare(b.state || ''));
  const otherLicenses = providerLicenses
    .filter(l => l.status !== 'active')
    .sort((a, b) => (a.state || '').localeCompare(b.state || ''));

  // Credentialed insurance (approved applications)
  const credentialedApps = apps
    .filter(a => a.status === 'approved' || a.status === 'credentialed')
    .sort((a, b) => {
      const pa = getPayerById(a.payerId);
      const pb = getPayerById(b.payerId);
      return (pa?.name || a.payerName || '').localeCompare(pb?.name || b.payerName || '');
    });

  // In-progress applications
  const pendingApps = apps
    .filter(a => ['submitted', 'in_review', 'pending_info', 'gathering_docs'].includes(a.status))
    .sort((a, b) => (a.payerName || '').localeCompare(b.payerName || ''));

  const esc = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  const pageSubtitle = document.getElementById('page-subtitle');
  if (pageSubtitle) pageSubtitle.textContent = `${provName}${credential ? ', ' + credential : ''} | Generated ${today}`;

  body.innerHTML = `
    <style>
      @media print {
        .no-print { display: none !important; }
        .printout-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 24px !important; }
        body { background: #fff !important; }
      }
      .printout-page { max-width: 800px; margin: 0 auto; background: #fff; border: 1px solid var(--gray-200); border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,.06); padding: 40px; }
      .printout-header { text-align: center; border-bottom: 2px solid var(--brand-600, #1e40af); padding-bottom: 20px; margin-bottom: 24px; }
      .printout-header h1 { font-size: 22px; font-weight: 700; color: var(--gray-900); margin: 0 0 4px; }
      .printout-header .subtitle { font-size: 14px; color: var(--gray-500); }
      .printout-section { margin-bottom: 24px; }
      .printout-section h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .8px; color: var(--brand-600, #1e40af); border-bottom: 1px solid var(--gray-200); padding-bottom: 6px; margin: 0 0 12px; font-weight: 700; }
      .printout-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
      .printout-grid dt { color: var(--gray-500); font-weight: 500; }
      .printout-grid dd { color: var(--gray-900); font-weight: 600; margin: 0; }
      .printout-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .printout-table th { text-align: left; padding: 6px 10px; background: var(--gray-50); border: 1px solid var(--gray-200); font-weight: 600; color: var(--gray-700); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
      .printout-table td { padding: 6px 10px; border: 1px solid var(--gray-200); color: var(--gray-800); }
      .printout-table tr:nth-child(even) { background: var(--gray-50); }
      .printout-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
      .badge-active { background: #d1fae5; color: #065f46; }
      .badge-pending { background: #fef3c7; color: #92400e; }
      .badge-expired { background: #fee2e2; color: #991b1b; }
      .printout-footer { text-align: center; border-top: 1px solid var(--gray-200); padding-top: 16px; margin-top: 32px; font-size: 11px; color: var(--gray-400); }
    </style>

    <div class="no-print" style="text-align:center;margin-bottom:16px;">
      <button class="btn btn-gold" onclick="window.print()">Print / Save as PDF</button>
      <button class="btn" onclick="window.app.navigateTo('providers')" style="margin-left:8px;">Back to Providers</button>
    </div>

    <div class="printout-page">
      <div class="printout-header">
        ${agencyName ? `<div style="font-size:11px;color:var(--gray-400);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">${esc(agencyName)}</div>` : ''}
        <h1>Provider Credential Verification Sheet</h1>
        <div class="subtitle">Generated ${today}</div>
      </div>

      <!-- Provider Information -->
      <div class="printout-section">
        <h3>Provider Information</h3>
        <dl class="printout-grid">
          <dt>Full Name</dt><dd>${esc(provName)}${credential ? ', ' + esc(credential) : ''}</dd>
          <dt>NPI</dt><dd>${esc(npi) || '—'}</dd>
          <dt>Specialty</dt><dd>${esc(specialty) || '—'}</dd>
          <dt>Taxonomy</dt><dd>${esc(taxonomy) || '—'}</dd>
          ${orgName ? `<dt>Organization</dt><dd>${esc(orgName)}</dd>` : ''}
          ${caqhId ? `<dt>CAQH ID</dt><dd>${esc(caqhId)}</dd>` : ''}
          ${email ? `<dt>Email</dt><dd>${esc(email)}</dd>` : ''}
          ${phone ? `<dt>Phone</dt><dd>${esc(phone)}</dd>` : ''}
        </dl>
      </div>

      <!-- Education -->
      ${education.length > 0 ? `
      <div class="printout-section">
        <h3>Education</h3>
        <table class="printout-table">
          <thead><tr><th>Institution</th><th>Degree</th><th>Year</th></tr></thead>
          <tbody>
            ${education.map(e => `<tr>
              <td>${esc(e.institutionName || e.institution || e.school || '')}</td>
              <td>${esc(e.degree || '')}</td>
              <td>${e.graduationYear || e.graduation_year || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Board Certifications -->
      ${boards.length > 0 ? `
      <div class="printout-section">
        <h3>Board Certifications</h3>
        <table class="printout-table">
          <thead><tr><th>Board</th><th>Specialty</th><th>Status</th><th>Expiration</th></tr></thead>
          <tbody>
            ${boards.map(b => `<tr>
              <td>${esc(b.boardName || b.board_name || b.certifyingBoard || '')}</td>
              <td>${esc(b.specialty || '')}</td>
              <td><span class="printout-badge ${b.status === 'active' ? 'badge-active' : 'badge-pending'}">${esc(b.status || 'Active')}</span></td>
              <td>${fmtDate(b.expirationDate || b.expiration_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Active Licenses -->
      <div class="printout-section">
        <h3>State Licenses (${activeLicenses.length} Active${otherLicenses.length > 0 ? `, ${otherLicenses.length} Other` : ''})</h3>
        ${activeLicenses.length > 0 ? `
        <table class="printout-table">
          <thead><tr><th>State</th><th>License #</th><th>Type</th><th>Status</th><th>Issued</th><th>Expires</th></tr></thead>
          <tbody>
            ${activeLicenses.map(l => `<tr>
              <td><strong>${esc(l.state)}</strong> — ${esc(getStateName(l.state))}</td>
              <td>${esc(l.licenseNumber || l.license_number || '')}</td>
              <td>${esc(l.licenseType || l.license_type || '')}</td>
              <td><span class="printout-badge badge-active">Active</span></td>
              <td>${fmtDate(l.issueDate || l.issue_date)}</td>
              <td>${fmtDate(l.expirationDate || l.expiration_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<p style="color:var(--gray-500);font-size:13px;">No active licenses on file.</p>'}

        ${otherLicenses.length > 0 ? `
        <div style="margin-top:12px;">
          <div style="font-size:12px;color:var(--gray-500);font-weight:600;margin-bottom:6px;">Other Licenses</div>
          <table class="printout-table">
            <thead><tr><th>State</th><th>License #</th><th>Status</th><th>Expires</th></tr></thead>
            <tbody>
              ${otherLicenses.map(l => `<tr>
                <td>${esc(l.state)} — ${esc(getStateName(l.state))}</td>
                <td>${esc(l.licenseNumber || l.license_number || '')}</td>
                <td><span class="printout-badge ${l.status === 'pending' ? 'badge-pending' : 'badge-expired'}">${esc(l.status || '')}</span></td>
                <td>${fmtDate(l.expirationDate || l.expiration_date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </div>

      <!-- Credentialed Insurance -->
      <div class="printout-section">
        <h3>Credentialed Insurance (${credentialedApps.length})</h3>
        ${credentialedApps.length > 0 ? `
        <table class="printout-table">
          <thead><tr><th>Payer</th><th>State</th><th>Effective Date</th><th>Enrollment ID</th></tr></thead>
          <tbody>
            ${credentialedApps.map(a => {
              const payer = getPayerById(a.payerId);
              return `<tr>
                <td><strong>${esc(payer?.name || a.payerName || '')}</strong></td>
                <td>${esc(a.state || '')}</td>
                <td>${fmtDate(a.effectiveDate || a.effective_date)}</td>
                <td>${esc(a.enrollmentId || a.enrollment_id || a.applicationRef || '—')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<p style="color:var(--gray-500);font-size:13px;">No credentialed insurance on file.</p>'}
      </div>

      <!-- In-Progress Applications -->
      ${pendingApps.length > 0 ? `
      <div class="printout-section">
        <h3>Pending Applications (${pendingApps.length})</h3>
        <table class="printout-table">
          <thead><tr><th>Payer</th><th>State</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            ${pendingApps.map(a => {
              const payer = getPayerById(a.payerId);
              const statusInfo = APPLICATION_STATUSES.find(s => s.value === a.status) || {};
              return `<tr>
                <td>${esc(payer?.name || a.payerName || '')}</td>
                <td>${esc(a.state || '')}</td>
                <td><span class="printout-badge" style="background:${statusInfo.bg || '#f3f4f6'};color:${statusInfo.color || '#6b7280'};">${statusInfo.label || a.status}</span></td>
                <td>${fmtDate(a.submittedDate || a.submitted_date)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <div class="printout-footer">
        <p>This document was generated by ${esc(agencyName || 'Credentik')} on ${today}.</p>
        <p>This is an informational summary and does not constitute primary source verification.</p>
      </div>
    </div>
  `;
}

async function renderProviderProfilePage(providerId) {
  const body = document.getElementById('page-body');

  if (!providerId) {
    body.innerHTML = '<div class="alert alert-warning">No provider selected. Go to Providers and click a provider to view their profile.</div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading provider profile...</div></div>';

  let provider = {};
  let profile = {};
  let education = [];
  let boards = [];
  let malpractice = [];
  let providerLicenses = [];
  let workHistory = [];
  let cme = [];
  let references = [];

  try {
    [provider, profile, education, boards, malpractice, workHistory, cme, references, providerLicenses] = await Promise.all([
      store.getOne('providers', providerId).catch(e => { console.error('Provider error:', e); return {}; }),
      store.getProviderProfile(providerId).catch(e => { console.error('Profile error:', e); return {}; }),
      store.getProviderEducation(providerId).catch(() => []),
      store.getProviderBoards(providerId).catch(() => []),
      store.getProviderMalpractice(providerId).catch(() => []),
      store.getProviderWorkHistory(providerId).catch(() => []),
      store.getProviderCme(providerId).catch(() => []),
      store.getProviderReferences(providerId).catch(() => []),
      store.getProviderLicenses(providerId).catch(() =>
        store.getAll('licenses').then(all => (all || []).filter(l => String(l.providerId || l.provider_id) === String(providerId))).catch(() => [])
      ),
    ]);
  } catch (e) { console.error('Provider profile load error:', e); }

  if (!Array.isArray(education)) education = [];
  if (!Array.isArray(boards)) boards = [];
  if (!Array.isArray(malpractice)) malpractice = [];
  if (!Array.isArray(workHistory)) workHistory = profile.workHistory || profile.work_history || [];
  if (!Array.isArray(cme)) cme = profile.cme || profile.continuingEducation || [];
  if (!Array.isArray(references)) references = profile.references || [];
  if (!Array.isArray(providerLicenses)) providerLicenses = [];

  const provName = `${provider.firstName || provider.first_name || ''} ${provider.lastName || provider.last_name || ''}`.trim() || 'Unknown Provider';
  const credential = provider.credential || provider.credentials || '';
  const documents = profile.documents || [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'education', label: 'Education' },
    { id: 'boards', label: 'Board Certs' },
    { id: 'licenses', label: 'Licenses' },
    { id: 'malpractice', label: 'Malpractice' },
    { id: 'work-history', label: 'Work History' },
    { id: 'cme', label: 'CME' },
    { id: 'references', label: 'References' },
    { id: 'locations', label: 'Locations' },
    { id: 'payers', label: 'Payers' },
    { id: 'documents', label: 'Documents' },
  ];

  // Load facilities for the Locations tab
  const allFacilities = await store.getFacilities().catch(() => []);
  const facilityArr = Array.isArray(allFacilities) ? allFacilities : [];
  // Get apps to find which locations this provider is linked to
  const provApps = (await store.getAll('applications').catch(() => [])).filter(a => String(a.providerId || a.provider_id) === String(providerId));
  const provFacIds = new Set(provApps.map(a => a.facilityId).filter(Boolean));
  // Also match by state
  const provStates = new Set(providerLicenses.map(l => l.state).filter(Boolean));
  const provLocations = facilityArr.filter(f => provFacIds.has(f.id) || provFacIds.has(String(f.id)) || provStates.has(f.state));

  const pageSubtitle = document.getElementById('page-subtitle');
  if (pageSubtitle) pageSubtitle.textContent = provName + (credential ? ', ' + credential : '') + ` | ID: ${toHexId(providerId)}`;

  // --- Credential Passport computations ---
  const cpNow = new Date();
  const cpActiveLicenses = providerLicenses.filter(l => {
    const exp = l.expirationDate || l.expiration_date;
    const isExpired = exp && new Date(exp) < cpNow;
    return !isExpired;
  });
  const cpActiveBoards = boards.filter(b => {
    const exp = b.expirationDate || b.expiration_date;
    return exp ? new Date(exp) > cpNow : true;
  });
  const cpActiveMalpractice = malpractice.filter(m => {
    const exp = m.expirationDate || m.expiration_date;
    return exp ? new Date(exp) > cpNow : true;
  });
  const cpHasEducation = education.length > 0;
  const cpHasBoards = cpActiveBoards.length > 0;
  const cpHasMalpractice = cpActiveMalpractice.length > 0;
  const cpHasLicenses = cpActiveLicenses.length > 0;
  const cpHasWorkHistory = workHistory.length > 0;
  const cpHasCme = cme.length > 0;
  const cpHasReferences = references.length >= 3;
  const cpHasDocuments = documents.length > 0;

  const cpSegments = [
    { label: 'Education',   met: cpHasEducation,   weight: 15, color: '#6366f1' },
    { label: 'Board Certs', met: cpHasBoards,      weight: 15, color: '#8b5cf6' },
    { label: 'Malpractice', met: cpHasMalpractice,  weight: 15, color: '#ec4899' },
    { label: 'Licenses',    met: cpHasLicenses,     weight: 20, color: '#14b8a6' },
    { label: 'Work History', met: cpHasWorkHistory, weight: 10, color: '#f59e0b' },
    { label: 'CME',         met: cpHasCme,          weight: 10, color: '#3b82f6' },
    { label: 'References',  met: cpHasReferences,   weight: 10, color: '#10b981' },
    { label: 'Documents',   met: cpHasDocuments,     weight: 5,  color: '#64748b' },
  ];
  const cpTotal = cpSegments.reduce((s, seg) => s + (seg.met ? seg.weight : 0), 0);

  // Build SVG ring arcs — each segment spans proportional arc of the full 360
  const cpRadius = 70;
  const cpCircumference = 2 * Math.PI * cpRadius;
  let cpRingArcs = '';
  let cpOffset = 0;
  for (const seg of cpSegments) {
    const segLength = (seg.weight / 100) * cpCircumference;
    const filledLength = seg.met ? segLength : 0;
    const gapLength = cpCircumference - filledLength;
    cpRingArcs += `<circle cx="80" cy="80" r="${cpRadius}" fill="none" stroke="${seg.met ? seg.color : '#e2e8f0'}" stroke-width="12" stroke-dasharray="${filledLength} ${gapLength}" stroke-dashoffset="${-cpOffset}" stroke-linecap="round" transform="rotate(-90 80 80)"/>`;
    cpOffset += segLength;
  }

  const cpMalpracticeStatus = malpractice.length === 0 ? 'None' : (cpActiveMalpractice.length > 0 ? 'Active' : 'Expired');
  const cpMalpracticeColor = cpMalpracticeStatus === 'Active' ? 'var(--green-600, #16a34a)' : (cpMalpracticeStatus === 'Expired' ? 'var(--red-600, #dc2626)' : 'var(--gray-500, #6b7280)');
  const cpProviderInitials = ((provider.firstName || provider.first_name || '').charAt(0) + (provider.lastName || provider.last_name || '').charAt(0)).toUpperCase() || '?';
  const cpProviderStatus = provider.status || 'unknown';
  const cpStatusBadgeClass = cpProviderStatus === 'active' ? 'approved' : 'inactive';

  // Missing items
  const cpMissing = [];
  if (!cpHasEducation) cpMissing.push('Education records');
  if (!cpHasBoards) cpMissing.push('Board Certification');
  if (!cpHasMalpractice) cpMissing.push(malpractice.length > 0 ? 'Malpractice policy expired' : 'Malpractice policy');
  if (!cpHasLicenses) cpMissing.push('Active license');
  if (!cpHasWorkHistory) cpMissing.push('Work history');
  if (!cpHasCme) cpMissing.push('CME records');
  if (!cpHasReferences) cpMissing.push(references.length > 0 ? `${3 - references.length} more reference(s) needed` : '3 References needed');
  if (!cpHasDocuments) cpMissing.push('Documents');

  const cpLastUpdated = provider.updatedAt || provider.updated_at || provider.createdAt || provider.created_at || '';

  body.innerHTML = `
    <style>
      .cp-hero{display:grid;grid-template-columns:1fr auto 220px;gap:24px;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 50%,#f5f3ff 100%);border:1px solid var(--gray-200,#e2e8f0);border-radius:16px;padding:28px 32px;margin-bottom:24px;align-items:start;}
      .cp-identity{display:flex;flex-direction:column;gap:10px;}
      .cp-avatar{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;letter-spacing:1px;box-shadow:0 4px 12px rgba(99,102,241,.3);flex-shrink:0;}
      .cp-identity-top{display:flex;align-items:center;gap:16px;}
      .cp-identity h2{font-size:24px;font-weight:700;margin:0;color:var(--gray-900,#111827);line-height:1.2;}
      .cp-identity .cp-cred{color:var(--gray-500,#6b7280);font-size:16px;font-weight:400;}
      .cp-meta-row{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:13px;color:var(--gray-600,#4b5563);}
      .cp-meta-row code{background:var(--gray-100,#f3f4f6);padding:1px 6px;border-radius:4px;font-size:12px;}
      .cp-edit-link{font-size:12px;color:var(--brand-600,#4f46e5);text-decoration:none;cursor:pointer;margin-top:4px;}
      .cp-edit-link:hover{text-decoration:underline;}
      .cp-ring-container{display:flex;flex-direction:column;align-items:center;gap:12px;}
      .cp-ring-svg{filter:drop-shadow(0 2px 8px rgba(0,0,0,.08));}
      .cp-ring-pct{font-size:36px;font-weight:800;fill:var(--gray-900,#111827);}
      .cp-ring-label{font-size:11px;fill:var(--gray-500,#6b7280);text-transform:uppercase;letter-spacing:.5px;}
      .cp-legend{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px;color:var(--gray-600,#4b5563);}
      .cp-legend-item{display:flex;align-items:center;gap:6px;}
      .cp-legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
      .cp-legend-check{font-size:11px;margin-left:auto;}
      .cp-stats{display:flex;flex-direction:column;gap:12px;}
      .cp-stat{background:#fff;border:1px solid var(--gray-200,#e2e8f0);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;}
      .cp-stat-label{font-size:11px;color:var(--gray-500,#6b7280);text-transform:uppercase;letter-spacing:.5px;font-weight:600;}
      .cp-stat-value{font-size:20px;font-weight:700;color:var(--gray-900,#111827);}
      .cp-stat-value.sm{font-size:14px;font-weight:600;}
      .cp-missing{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 18px;margin-bottom:24px;display:flex;align-items:flex-start;gap:10px;font-size:13px;color:#92400e;line-height:1.5;}
      .cp-missing-icon{flex-shrink:0;font-size:18px;margin-top:1px;}
      .cp-missing strong{font-weight:700;}
      @media(max-width:900px){.cp-hero{grid-template-columns:1fr;text-align:center;}.cp-identity-top{justify-content:center;}.cp-meta-row{justify-content:center;}.cp-legend{justify-content:center;}}
      @media(max-width:600px){.cp-hero{padding:20px 16px;gap:20px;}}
    </style>

    <!-- Credential Passport Hero -->
    <div class="cp-hero">
      <!-- Left: Identity Card -->
      <div class="cp-identity">
        <div class="cp-identity-top">
          <div class="cp-avatar">${escHtml(cpProviderInitials)}</div>
          <div>
            <h2>${escHtml(provName)}${credential ? '<span class="cp-cred">, ' + escHtml(credential) + '</span>' : ''}</h2>
            <span class="badge badge-${cpStatusBadgeClass}" style="margin-top:4px;display:inline-block;">${escHtml(cpProviderStatus)}</span>
          </div>
        </div>
        <div class="cp-meta-row">
          <span>NPI: <code>${escHtml(provider.npi || '---')}</code></span>
          <span>${escHtml(provider.specialty || provider.taxonomyDesc || provider.taxonomy_desc || provider.taxonomy_description || '---')}</span>
        </div>
        <div class="cp-meta-row">
          <span>Taxonomy: <code>${escHtml(provider.taxonomyCode || provider.taxonomy_code || provider.taxonomy || '---')}</code></span>
        </div>
        <div style="display:flex;gap:12px;align-items:center;margin-top:4px;">
          <a class="cp-edit-link" onclick="window.app.switchProfileTab('overview')">Edit Profile</a>
          <a class="cp-edit-link" onclick="window.app.generatePublicShareLink(${providerId})" style="color:var(--brand-500,#0891b2);">&#128279; Share Progress</a>
        </div>
      </div>

      <!-- Center: Completion Ring -->
      <div class="cp-ring-container">
        <svg class="cp-ring-svg" width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="${cpRadius}" fill="none" stroke="#f1f5f9" stroke-width="12"/>
          ${cpRingArcs}
          <text x="80" y="74" text-anchor="middle" class="cp-ring-pct">${cpTotal}%</text>
          <text x="80" y="92" text-anchor="middle" class="cp-ring-label">Ready</text>
        </svg>
        <div class="cp-legend">
          ${cpSegments.map(seg => `
            <div class="cp-legend-item">
              <span class="cp-legend-dot" style="background:${seg.met ? seg.color : '#cbd5e1'}"></span>
              <span>${seg.label}</span>
              <span class="cp-legend-check" style="color:${seg.met ? '#16a34a' : '#dc2626'}">${seg.met ? '\u2713' : '\u2717'}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Right: Quick Stats -->
      <div class="cp-stats">
        <div class="cp-stat">
          <span class="cp-stat-label">Active Licenses</span>
          <span class="cp-stat-value">${cpActiveLicenses.length}</span>
        </div>
        <div class="cp-stat">
          <span class="cp-stat-label">Board Certs</span>
          <span class="cp-stat-value">${cpActiveBoards.length}</span>
        </div>
        <div class="cp-stat">
          <span class="cp-stat-label">Malpractice</span>
          <span class="cp-stat-value sm" style="color:${cpMalpracticeColor}">${cpMalpracticeStatus}</span>
        </div>
        <div class="cp-stat">
          <span class="cp-stat-label">Last Updated</span>
          <span class="cp-stat-value sm">${cpLastUpdated ? formatDateDisplay(cpLastUpdated) : '---'}</span>
        </div>
      </div>
    </div>

    ${cpMissing.length > 0 ? `
    <div class="cp-missing">
      <span class="cp-missing-icon">\u26A0\uFE0F</span>
      <div><strong>Missing:</strong> ${cpMissing.map(m => escHtml(m)).join(', ')}</div>
    </div>` : ''}

    <!-- Tab Navigation -->
    <div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;border-bottom:1px solid var(--gray-200);padding-bottom:0;">
      ${tabs.map((t, i) => `
        <button class="btn btn-sm profile-tab ${i === 0 ? 'btn-primary' : ''}" data-tab="${t.id}" onclick="window.app.switchProfileTab('${t.id}')" style="border-radius:8px 8px 0 0;border-bottom:none;margin-bottom:-1px;${i === 0 ? 'border-bottom:2px solid var(--brand-600);' : ''}">${t.label}</button>
      `).join('')}
    </div>

    <!-- Overview Tab -->
    <div class="profile-tab-content" id="tab-overview">
      <div style="margin-bottom:12px;text-align:right;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <button class="btn btn-sm" onclick="window.app.openSignatureModal(${providerId})" style="border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;">Sign Attestation</button>
        <button class="btn btn-sm btn-gold" onclick="window.app.aiComplianceScan(${providerId})" id="ai-scan-btn">AI Compliance Scan</button>
      </div>
      <div id="ai-scan-result" style="display:none;margin-bottom:16px;"></div>
      <div class="card">
        <div class="card-header"><h3>Provider Information</h3></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div><span class="text-sm text-muted">Full Name</span><div style="font-weight:600;margin-top:2px;">${escHtml(provName)}${credential ? ', ' + escHtml(credential) : ''}</div></div>
            <div><span class="text-sm text-muted">NPI</span><div style="font-weight:600;margin-top:2px;"><code>${escHtml(provider.npi || '—')}</code></div></div>
            <div><span class="text-sm text-muted">Specialty</span><div style="margin-top:2px;">${escHtml(provider.specialty || provider.taxonomyDesc || provider.taxonomy_desc || provider.taxonomy_description || '—')}</div></div>
            <div><span class="text-sm text-muted">Taxonomy Code</span><div style="margin-top:2px;"><code>${escHtml(provider.taxonomyCode || provider.taxonomy_code || provider.taxonomy || '—')}</code></div></div>
            <div><span class="text-sm text-muted">Phone</span><div style="margin-top:2px;">${escHtml(provider.phone || '—')}</div></div>
            <div><span class="text-sm text-muted">Email</span><div style="margin-top:2px;">${escHtml(provider.email || '—')}</div></div>
            <div><span class="text-sm text-muted">State</span><div style="margin-top:2px;">${escHtml(provider.state || '—')}</div></div>
            <div><span class="text-sm text-muted">Status</span><div style="margin-top:2px;"><span class="badge badge-${provider.status === 'active' ? 'approved' : 'inactive'}">${escHtml(provider.status || 'unknown')}</span></div></div>
            ${profile.ssn ? `<div><span class="text-sm text-muted">SSN (last 4)</span><div style="margin-top:2px;">***-**-${escHtml(String(profile.ssn).slice(-4))}</div></div>` : ''}
            ${profile.dob || profile.dateOfBirth ? `<div><span class="text-sm text-muted">Date of Birth</span><div style="margin-top:2px;">${formatDateDisplay(profile.dob || profile.dateOfBirth)}</div></div>` : ''}
          </div>
        </div>
      </div>

      <!-- Active Licenses -->
      <div class="card" style="margin-top:16px;">
        <div class="card-header"><h3>Licenses (${providerLicenses.length})</h3></div>
        <div class="card-body" style="padding:0;">
          ${providerLicenses.length > 0 ? `<table>
            <thead><tr><th>State</th><th>License #</th><th>Type</th><th>Status</th><th>Expires</th></tr></thead>
            <tbody>
              ${providerLicenses.map(l => `<tr>
                <td>${escHtml(l.state || '—')}</td>
                <td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td>
                <td>${escHtml(l.licenseType || l.license_type || '—')}</td>
                <td><span class="badge badge-${l.status === 'active' ? 'approved' : l.status === 'pending' ? 'pending' : 'denied'}">${escHtml(l.status || '—')}</span></td>
                <td>${formatDateDisplay(l.expirationDate || l.expiration_date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No licenses on file.</div>'}
        </div>
      </div>

      <!-- Timeline Predictions -->
      ${(() => {
        const pendApps = provApps.filter(a => ['submitted','in_review','pending_info','gathering_docs','pending','new'].includes(a.status));
        if (pendApps.length === 0) return '';
        const predictions = pendApps.map(a => {
          const payer = getPayerById(a.payerId) || {};
          const payerName = payer.name || a.payerName || a.payer_name || '';
          const sla = getPayerSLA(payerName);
          return { app: a, payerName: payerName || 'Unknown', ...predictApplicationTimeline(a, provApps, sla) };
        }).sort((a, b) => (a.estimatedApprovalDate || new Date(9999,0)) - (b.estimatedApprovalDate || new Date(9999,0)));
        const nextApproval = predictions[0];
        const onTrack = predictions.filter(p => p.riskLevel === 'on-track').length;
        const atRisk = predictions.filter(p => p.riskLevel === 'at-risk').length;
        const delayed = predictions.filter(p => p.riskLevel === 'delayed').length;
        const totalHistorical = provApps.filter(a => a.status === 'approved' || a.status === 'credentialed').length;
        const confDot = (c) => c === 'high' ? '#10B981' : c === 'medium' ? '#F59E0B' : '#9CA3AF';
        const rClr = (r) => r === 'delayed' ? '#EF4444' : r === 'at-risk' ? '#F59E0B' : '#10B981';
        const rBg = (r) => r === 'delayed' ? '#FEE2E2' : r === 'at-risk' ? '#FEF3C7' : '#D1FAE5';
        const rLbl = (r) => r === 'delayed' ? 'Delayed' : r === 'at-risk' ? 'At Risk' : 'On Track';
        return '<div class="card" style="margin-top:16px;border-radius:16px;overflow:hidden;border-left:3px solid #6366f1;">' +
          '<div class="card-header"><h3 style="color:#6366f1;">&#128338; Timeline Predictions</h3></div>' +
          '<div class="card-body">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">' +
              '<div style="padding:14px;border-radius:12px;background:linear-gradient(135deg,rgba(99,102,241,0.06),rgba(139,92,246,0.06));border:1px solid rgba(99,102,241,0.15);">' +
                '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--gray-500);margin-bottom:6px;">Next Expected Approval</div>' +
                '<div style="font-size:16px;font-weight:700;color:#6366f1;">' + escHtml(nextApproval.payerName) + '</div>' +
                (nextApproval.estimatedApprovalDate ? '<div style="font-size:13px;color:var(--gray-700);margin-top:2px;">' + nextApproval.estimatedApprovalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '</div>' : '') +
                '<div style="display:flex;align-items:center;gap:4px;margin-top:6px;"><span style="width:7px;height:7px;border-radius:50%;background:' + confDot(nextApproval.confidence) + ';display:inline-block;"></span><span style="font-size:10px;color:var(--gray-500);text-transform:capitalize;">' + nextApproval.confidence + ' confidence</span></div>' +
              '</div>' +
              '<div style="padding:14px;border-radius:12px;background:var(--gray-50);border:1px solid var(--gray-200);">' +
                '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--gray-500);margin-bottom:6px;">Timeline Health</div>' +
                '<div style="display:flex;gap:12px;margin-top:8px;">' +
                  (onTrack > 0 ? '<div style="text-align:center;"><div style="font-size:20px;font-weight:800;color:#10B981;">' + onTrack + '</div><div style="font-size:10px;color:var(--gray-500);">On Track</div></div>' : '') +
                  (atRisk > 0 ? '<div style="text-align:center;"><div style="font-size:20px;font-weight:800;color:#F59E0B;">' + atRisk + '</div><div style="font-size:10px;color:var(--gray-500);">At Risk</div></div>' : '') +
                  (delayed > 0 ? '<div style="text-align:center;"><div style="font-size:20px;font-weight:800;color:#EF4444;">' + delayed + '</div><div style="font-size:10px;color:var(--gray-500);">Delayed</div></div>' : '') +
                '</div>' +
              '</div>' +
            '</div>' +
            predictions.map(function(p) {
              var dateStr = p.estimatedApprovalDate ? p.estimatedApprovalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
              return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--gray-100);">' +
                '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;color:var(--gray-800);">' + escHtml(p.payerName) + '</div><div style="font-size:10px;color:var(--gray-500);">' + escHtml(p.app.state || '') + ' &middot; ~' + p.predictedDays + ' days</div></div>' +
                '<div style="font-size:12px;font-weight:600;color:' + rClr(p.riskLevel) + ';">' + dateStr + '</div>' +
                '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;background:' + rBg(p.riskLevel) + ';color:' + rClr(p.riskLevel) + ';">' + rLbl(p.riskLevel) + '</span>' +
                '<span style="display:inline-flex;align-items:center;gap:3px;" title="' + escAttr(p.basedOn) + '"><span style="width:6px;height:6px;border-radius:50%;background:' + confDot(p.confidence) + ';display:inline-block;"></span></span>' +
              '</div>';
            }).join('') +
            '<div style="margin-top:12px;font-size:10px;color:var(--gray-400);font-style:italic;">Based on ' + totalHistorical + ' historical application' + (totalHistorical !== 1 ? 's' : '') + ' and payer SLA data. Predictions are estimates, not guarantees.</div>' +
          '</div></div>';
      })()}
    </div>

    <!-- Education Tab -->
    <div class="profile-tab-content" id="tab-education" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Education History</h3>
          ${editButton('+ Add Education', `window.app.openEducationModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${education.length > 0 ? `<table>
            <thead><tr><th>Institution</th><th>Degree</th><th>Field</th><th>Start</th><th>End</th><th></th></tr></thead>
            <tbody>
              ${education.map(e => `<tr>
                <td><strong>${escHtml(e.institutionName || e.institution_name || e.institution || e.schoolName || e.school_name || '—')}</strong></td>
                <td>${escHtml(e.degree || e.degreeType || e.degree_type || '—')}</td>
                <td>${escHtml(e.fieldOfStudy || e.field_of_study || e.field || e.specialty || '—')}</td>
                <td>${formatDateDisplay(e.startDate || e.start_date)}</td>
                <td>${formatDateDisplay(e.endDate || e.end_date || e.graduationDate || e.graduation_date)}</td>
                <td>${deleteButton('Delete', `window.app.deleteEducation(${providerId}, ${e.id})`)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No education records. Add medical school, residency, or fellowship records.</div>'}
        </div>
      </div>

    </div>

    <!-- Education Modal -->
    <div class="modal-overlay" id="education-modal">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Add Education</h3>
          <button class="modal-close" onclick="document.getElementById('education-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          ${presetSelectHtml('edu-institution', PRESET_INSTITUTIONS, 'Institution', 'Type institution name...', true)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
            ${presetSelectHtml('edu-degree', PRESET_DEGREES, 'Degree')}
            ${presetSelectHtml('edu-field', PRESET_FIELDS_OF_STUDY, 'Field / Specialty', 'e.g. Psychiatric Mental Health')}
            <div class="auth-field" style="margin:0;"><label>Start Date</label><input type="date" id="edu-start" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>End Date</label><input type="date" id="edu-end" class="form-control"></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('education-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveEducation(${providerId})">Save</button>
        </div>
      </div>
    </div>

    <!-- Board Certifications Tab -->
    <div class="profile-tab-content" id="tab-boards" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Board Certifications</h3>
          ${editButton('+ Add Certification', `window.app.openBoardModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${boards.length > 0 ? `<table>
            <thead><tr><th>Board</th><th>Specialty</th><th>Certificate #</th><th>Issued</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              ${boards.map(b => {
                const isExpired = (b.expirationDate || b.expiration_date) && new Date(b.expirationDate || b.expiration_date) < new Date();
                return `<tr>
                  <td><strong>${escHtml(b.boardName || b.board_name || b.board || b.certifying_board || '—')}</strong></td>
                  <td>${escHtml(b.specialty || b.board_specialty || '—')}</td>
                  <td><code>${escHtml(b.certificateNumber || b.certificate_number || b.certNumber || b.cert_number || '—')}</code></td>
                  <td>${formatDateDisplay(b.issueDate || b.issue_date)}</td>
                  <td style="${isExpired ? 'color:var(--red);' : ''}">${formatDateDisplay(b.expirationDate || b.expiration_date)}</td>
                  <td><span class="badge badge-${isExpired ? 'denied' : 'approved'}">${isExpired ? 'Expired' : 'Active'}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No board certifications on file.</div>'}
        </div>
      </div>

    </div>

    <!-- Board Modal -->
    <div class="modal-overlay" id="board-modal">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Add Board Certification</h3>
          <button class="modal-close" onclick="document.getElementById('board-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          ${presetSelectHtml('board-name', PRESET_BOARDS, 'Board Name', 'Type board name...', true)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
            <div class="auth-field" style="margin:0;"><label>Specialty</label>
              <select id="board-specialty" class="form-control" onchange="if(this.value==='__other__'){this.nextElementSibling.style.display='';this.nextElementSibling.focus();}else{this.nextElementSibling.style.display='none';this.nextElementSibling.value='';}">
                <option value="">Select board first...</option>
                <option value="__other__">Other (type custom)...</option>
              </select>
              <input type="text" id="board-specialty-custom" class="form-control" placeholder="Type custom specialty..." style="display:none;margin-top:4px;">
            </div>
            <div class="auth-field" style="margin:0;"><label>Certificate #</label><input type="text" id="board-cert-num" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Issue Date</label><input type="date" id="board-issue" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Expiration Date</label><input type="date" id="board-exp" class="form-control"></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('board-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveBoard(${providerId})">Save</button>
        </div>
      </div>
    </div>

    <!-- Licenses Tab -->
    <div class="profile-tab-content" id="tab-licenses" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Licenses (${providerLicenses.length})</h3>
          ${editButton('+ Add License', `window.app.openLicenseModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${providerLicenses.length > 0 ? `<table>
            <thead><tr><th>State</th><th>License #</th><th>Type</th><th>Issued</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${providerLicenses.map(l => {
                const exp = l.expirationDate || l.expiration_date || '';
                const isExpired = exp && new Date(exp) < new Date();
                const isExpiring = exp && !isExpired && new Date(exp) < new Date(Date.now() + 90 * 86400000);
                const statusColor = isExpired ? 'var(--red)' : isExpiring ? 'var(--orange,#f97316)' : 'var(--green)';
                const statusLabel = isExpired ? 'Expired' : isExpiring ? 'Expiring Soon' : (l.status || 'Active');
                return `<tr>
                  <td style="font-weight:600;">${escHtml(l.state || '')}</td>
                  <td style="font-family:monospace;">${escHtml(l.licenseNumber || l.license_number || '')}</td>
                  <td class="text-sm">${escHtml(l.licenseType || l.license_type || l.type || '')}</td>
                  <td class="text-sm">${formatDateDisplay(l.issueDate || l.issue_date) || '—'}</td>
                  <td class="text-sm" style="color:${statusColor};font-weight:${isExpired || isExpiring ? '600' : '400'};">${formatDateDisplay(exp) || '—'}</td>
                  <td><span class="badge badge-${isExpired ? 'denied' : isExpiring ? 'pending' : 'approved'}">${escHtml(statusLabel)}</span></td>
                  <td>
                    <button class="btn btn-sm" onclick="window.app.editLicense(${l.id})">Edit</button>
                    <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteLicense(${l.id})">Del</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<div style="padding:24px;text-align:center;color:var(--gray-400);">No licenses on file. Click + Add License to add one.</div>'}
        </div>
      </div>
      ${providerLicenses.some(l => { const e = l.expirationDate || l.expiration_date; return e && new Date(e) < new Date(Date.now() + 90 * 86400000); }) ? `
      <div style="margin-top:12px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#b45309;">
        <strong>Attention:</strong> ${providerLicenses.filter(l => { const e = l.expirationDate || l.expiration_date; return e && new Date(e) < new Date(); }).length} expired, ${providerLicenses.filter(l => { const e = l.expirationDate || l.expiration_date; return e && !((new Date(e)) < new Date()) && new Date(e) < new Date(Date.now() + 90 * 86400000); }).length} expiring within 90 days
      </div>` : ''}
    </div>

    <!-- Malpractice Tab -->
    <div class="profile-tab-content" id="tab-malpractice" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Malpractice Insurance</h3>
          ${editButton('+ Add Policy', `window.app.openMalpracticeModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${malpractice.length > 0 ? `<table>
            <thead><tr><th>Carrier</th><th>Policy #</th><th>Coverage</th><th>Effective</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              ${malpractice.map(m => {
                const isExpired = (m.expirationDate || m.expiration_date) && new Date(m.expirationDate || m.expiration_date) < new Date();
                return `<tr>
                  <td><strong>${escHtml(m.carrierName || m.carrier_name || m.carrier || m.insuranceCarrier || m.insurance_carrier || '—')}</strong></td>
                  <td><code>${escHtml(m.policyNumber || m.policy_number || '—')}</code></td>
                  <td>${escHtml(m.coverageType || m.coverage_type || m.coverageAmount || m.coverage_amount || m.coverage || '—')}</td>
                  <td>${formatDateDisplay(m.effectiveDate || m.effective_date)}</td>
                  <td style="${isExpired ? 'color:var(--red);' : ''}">${formatDateDisplay(m.expirationDate || m.expiration_date)}</td>
                  <td><span class="badge badge-${isExpired ? 'denied' : 'approved'}">${isExpired ? 'Expired' : 'Active'}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No malpractice insurance on file.</div>'}
        </div>
      </div>

    </div>

    <!-- Malpractice Modal -->
    <div class="modal-overlay" id="malpractice-modal">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Add Malpractice Insurance</h3>
          <button class="modal-close" onclick="document.getElementById('malpractice-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          ${presetSelectHtml('mal-carrier', PRESET_MALPRACTICE_CARRIERS, 'Insurance Carrier', 'Type carrier name...', true)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
            <div class="auth-field" style="margin:0;"><label>Policy Number</label><input type="text" id="mal-policy" class="form-control"></div>
            ${presetSelectHtml('mal-coverage', PRESET_COVERAGE_AMOUNTS, 'Coverage Amount', 'e.g. $1M/$3M')}
            <div class="auth-field" style="margin:0;"><label>Effective Date</label><input type="date" id="mal-effective" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Expiration Date</label><input type="date" id="mal-expiration" class="form-control"></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('malpractice-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveMalpractice(${providerId})">Save</button>
        </div>
      </div>
    </div>

    <!-- Work History Tab -->
    <div class="profile-tab-content" id="tab-work-history" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Work History</h3>
          ${editButton('+ Add Work History', `window.app.openWorkHistoryModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${Array.isArray(workHistory) && workHistory.length > 0 ? `<table>
            <thead><tr><th>Employer</th><th>Position</th><th>Start</th><th>End</th><th>Reason for Leaving</th></tr></thead>
            <tbody>
              ${workHistory.map(w => `<tr>
                <td><strong>${escHtml(w.employerName || w.employer_name || w.employer || w.organization || '—')}</strong></td>
                <td>${escHtml(w.positionTitle || w.position_title || w.position || w.title || w.job_title || '—')}</td>
                <td>${formatDateDisplay(w.startDate || w.start_date)}</td>
                <td>${w.endDate || w.end_date ? formatDateDisplay(w.endDate || w.end_date) : '<span class="badge badge-approved">Current</span>'}</td>
                <td class="text-sm text-muted">${escHtml(w.reasonForLeaving || w.reason_for_leaving || '—')}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No work history on file.</div>'}
        </div>
      </div>

    </div>

    <!-- Work History Modal -->
    <div class="modal-overlay" id="work-history-modal">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Add Work History</h3>
          <button class="modal-close" onclick="document.getElementById('work-history-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          ${presetSelectHtml('wh-employer', PRESET_EMPLOYERS, 'Employer / Organization', 'Type employer name...', true)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
            ${presetSelectHtml('wh-position', PRESET_POSITIONS, 'Position / Title', 'e.g. Attending Psychiatrist')}
            <div class="auth-field" style="margin:0;"><label>Department</label><input type="text" id="wh-department" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Start Date</label><input type="date" id="wh-start" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>End Date</label><input type="date" id="wh-end" class="form-control"><div style="font-size:11px;color:var(--gray-400);margin-top:2px;">Leave blank if current</div></div>
          </div>
          <div class="auth-field" style="margin:12px 0 0;"><label>Reason for Leaving</label><input type="text" id="wh-reason" class="form-control"></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('work-history-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveWorkHistory(${providerId})">Save</button>
        </div>
      </div>
    </div>

    <!-- CME Tab -->
    <div class="profile-tab-content" id="tab-cme" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Continuing Medical Education (CME)</h3>
          ${editButton('+ Add CME', `window.app.openCmeModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${Array.isArray(cme) && cme.length > 0 ? `<table>
            <thead><tr><th>Course / Activity</th><th>Provider</th><th>Credits</th><th>Date Completed</th></tr></thead>
            <tbody>
              ${cme.map(c => `<tr>
                <td><strong>${escHtml(c.courseName || c.course_name || c.title || '—')}</strong></td>
                <td>${escHtml(c.providerOrg || c.provider_org || c.provider || c.accreditingBody || c.accrediting_body || '—')}</td>
                <td>${c.creditHours || c.credit_hours || c.credits || c.hours || '—'}</td>
                <td>${formatDateDisplay(c.completionDate || c.completion_date || c.date || c.completed_at)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No CME records on file.</div>'}
        </div>
      </div>

    </div>

    <!-- CME Modal -->
    <div class="modal-overlay" id="cme-modal">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Add CME Record</h3>
          <button class="modal-close" onclick="document.getElementById('cme-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          ${presetSelectHtml('cme-title', PRESET_CME_COURSES, 'Course / Activity Title', 'Type course title...', true)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
            ${presetSelectHtml('cme-provider', PRESET_CME_PROVIDERS, 'Accrediting Body / Provider', 'e.g. APA, ACCME')}
            <div class="auth-field" style="margin:0;"><label>Credits / Hours</label><input type="number" id="cme-credits" class="form-control" step="0.5" min="0" placeholder="e.g. 20"></div>
            <div class="auth-field" style="margin:0;"><label>Category</label>
              <select id="cme-category" class="form-control">
                <option value="">Select...</option>
                <option value="Category 1">Category 1 (AMA PRA)</option>
                <option value="Category 2">Category 2</option>
                <option value="CME">CME</option>
                <option value="CE">CE (Continuing Education)</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Date Completed</label><input type="date" id="cme-date" class="form-control"></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('cme-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveCme(${providerId})">Save</button>
        </div>
      </div>
    </div>

    <!-- References Tab -->
    <div class="profile-tab-content" id="tab-references" style="display:none;">
      <div class="card">
        <div class="card-header">
          <h3>Professional References</h3>
          ${editButton('+ Add Reference', `window.app.openReferenceModal(${providerId})`)}
        </div>
        <div class="card-body" style="padding:0;">
          ${Array.isArray(references) && references.length > 0 ? `<table>
            <thead><tr><th>Name</th><th>Title / Position</th><th>Organization</th><th>Phone</th><th>Email</th><th>Relationship</th></tr></thead>
            <tbody>
              ${references.map(r => {
                const refPhone = (r.phone || r.phoneNumber || r.phone_number || '').replace(/\D/g, '');
                const fmtPhone = refPhone.length === 10 ? `(${refPhone.slice(0,3)}) ${refPhone.slice(3,6)}-${refPhone.slice(6)}` : (r.phone || r.phoneNumber || r.phone_number || '—');
                return `<tr>
                <td><strong>${escHtml(r.referenceName || r.reference_name || r.name || ((r.firstName || r.first_name || '') + ' ' + (r.lastName || r.last_name || '')).trim() || '—')}</strong></td>
                <td>${escHtml(r.referenceTitle || r.reference_title || r.title || r.position || '—')}</td>
                <td>${escHtml(r.referenceOrganization || r.reference_organization || r.organization || r.company || '—')}</td>
                <td>${escHtml(fmtPhone)}</td>
                <td>${escHtml(r.email || r.emailAddress || r.email_address || '—')}</td>
                <td class="text-sm text-muted">${escHtml(r.relationship || r.referenceType || r.reference_type || '—')}</td>
              </tr>`; }).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No references on file.</div>'}
        </div>
      </div>

    </div>

    <!-- Reference Modal -->
    <div class="modal-overlay" id="reference-modal">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Add Professional Reference</h3>
          <button class="modal-close" onclick="document.getElementById('reference-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="auth-field" style="margin:0;"><label>First Name *</label><input type="text" id="ref-first" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Last Name *</label><input type="text" id="ref-last" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Title / Position</label><input type="text" id="ref-title" class="form-control" placeholder="e.g. Medical Director"></div>
            <div class="auth-field" style="margin:0;"><label>Organization</label><input type="text" id="ref-org" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Phone</label><input type="tel" id="ref-phone" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Email</label><input type="email" id="ref-email" class="form-control"></div>
          </div>
          <div class="auth-field" style="margin:12px 0 0;"><label>Relationship</label>
            <select id="ref-relationship" class="form-control">
              <option value="">Select...</option>
              <option value="Supervisor">Supervisor</option>
              <option value="Colleague">Colleague</option>
              <option value="Department Head">Department Head</option>
              <option value="Program Director">Program Director</option>
              <option value="Attending Physician">Attending Physician</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('reference-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveReference(${providerId})">Save</button>
        </div>
      </div>
    </div>

    <!-- Locations Tab -->
    <div class="profile-tab-content" id="tab-locations" style="display:none;">
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3>Practice Locations (${provLocations.length})</h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-primary" onclick="window.app.linkLocationToProvider(${providerId})">+ Link Location</button>
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          ${provLocations.length > 0 ? `<table>
            <thead><tr><th>Location</th><th>Type</th><th>Address</th><th>City / State</th><th>Phone</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${provLocations.map(f => {
                const isActive = f.status === 'active' || f.isActive;
                return `<tr>
                  <td><strong style="color:var(--brand-600);cursor:pointer;" onclick="window.app.viewFacility('${f.id}')">${escHtml(f.name || '—')}</strong>${f.npi ? '<br><span style="font-size:10px;color:var(--gray-400);font-family:monospace;">NPI: ' + escHtml(f.npi) + '</span>' : ''}</td>
                  <td>${(f.facilityType || f.type || f.facility_type) ? '<span style="display:inline-flex;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:rgba(139,92,246,0.1);color:#7c3aed;">' + escHtml((f.facilityType || f.type || f.facility_type || '').replace(/_/g, ' ')) + '</span>' : '—'}</td>
                  <td style="font-size:12px;">${escHtml(f.street || f.address || '—')}</td>
                  <td>${escHtml([f.city, f.state].filter(Boolean).join(', ') || '—')} ${f.zip ? '<span style="color:var(--gray-400);font-size:11px;">' + escHtml(f.zip) + '</span>' : ''}</td>
                  <td>${escHtml(f.phone || '—')}</td>
                  <td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${isActive ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.12)'};color:${isActive ? 'var(--green)' : 'var(--gray-500)'};"><span style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>${isActive ? 'Active' : (f.status || 'Inactive')}</span></td>
                  <td><button class="btn btn-sm" onclick="window.app.unlinkLocationFromProvider(${providerId}, ${f.id})" title="Unlink" style="color:var(--gray-400);">&times;</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : `<div style="padding:2rem;text-align:center;color:var(--gray-500);">
            <p>No practice locations linked to this provider.</p>
            <p style="font-size:12px;">Click "+ Link Location" to associate existing locations, or go to Practice Locations to create new ones.</p>
          </div>`}
        </div>
      </div>

      <!-- Link Location Modal -->
      <div class="modal-overlay" id="link-location-modal">
        <div class="modal" style="max-width:520px;">
          <div class="modal-header">
            <h3>Link Practice Location</h3>
            <button class="modal-close" onclick="document.getElementById('link-location-modal').classList.remove('active')">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">Select a practice location to associate with this provider.</p>
            <div class="form-group">
              <label>Location</label>
              <select class="form-control" id="link-loc-select">
                <option value="">Select location...</option>
                ${facilityArr.filter(f => !provLocations.some(pl => pl.id === f.id)).map(f => `<option value="${f.id}">${escHtml(f.name || '')} — ${escHtml([f.city, f.state].filter(Boolean).join(', '))}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
            <button class="btn" onclick="document.getElementById('link-location-modal').classList.remove('active')">Cancel</button>
            <button class="btn btn-primary" onclick="window.app.saveLinkLocation(${providerId})">Link Location</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Payers Tab -->
    <div class="profile-tab-content" id="tab-payers" style="display:none;">
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button class="btn btn-sm" onclick="window.app.generatePayerReport('${provider.id}')" style="border-radius:8px;">Export Payer Report</button>
      </div>
      ${(() => {
        const allPayers = typeof PAYER_CATALOG !== 'undefined' ? PAYER_CATALOG : [];
        // Group apps by status
        const approvedApps = provApps.filter(a => a.status === 'approved' || a.status === 'credentialed');
        const pendingApps = provApps.filter(a => ['submitted','in_review','pending_info','gathering_docs','pending'].includes(a.status));
        const deniedApps = provApps.filter(a => a.status === 'denied' || a.status === 'rejected');
        // Unique states this provider is licensed in
        const licStates = [...new Set(providerLicenses.filter(l => l.status === 'active').map(l => l.state).filter(Boolean))];
        // Find payers the provider is NOT yet credentialed with (opportunities)
        const credPayerIds = new Set(approvedApps.map(a => String(a.payerId)).filter(Boolean));
        const pendPayerIds = new Set(pendingApps.map(a => String(a.payerId)).filter(Boolean));
        const opportunities = allPayers.filter(p => {
          if (credPayerIds.has(String(p.id)) || pendPayerIds.has(String(p.id))) return false;
          if (!p.tags || !Array.isArray(p.tags)) return false;
          // Only show payers tagged must_have or high_volume or that operate in provider's states
          const isStrategic = p.tags.includes('must_have') || p.tags.includes('high_volume') || p.tags.includes('growing_market');
          const inState = !p.states || p.states.includes('ALL') || licStates.some(s => (p.states || []).includes(s));
          return isStrategic && inState;
        }).slice(0, 10);

        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

        return `
      <!-- Summary Stats -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:20px;">
        <div class="card" style="padding:16px;text-align:center;border-radius:14px;">
          <div style="font-size:28px;font-weight:800;color:#16a34a;">${approvedApps.length}</div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:2px;">Credentialed</div>
        </div>
        <div class="card" style="padding:16px;text-align:center;border-radius:14px;">
          <div style="font-size:28px;font-weight:800;color:#f59e0b;">${pendingApps.length}</div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:2px;">In Progress</div>
        </div>
        <div class="card" style="padding:16px;text-align:center;border-radius:14px;">
          <div style="font-size:28px;font-weight:800;color:#ef4444;">${deniedApps.length}</div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:2px;">Denied</div>
        </div>
        <div class="card" style="padding:16px;text-align:center;border-radius:14px;">
          <div style="font-size:28px;font-weight:800;color:var(--brand-600);">${licStates.length}</div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:2px;">Licensed States</div>
        </div>
      </div>

      <!-- Credentialed Payers -->
      <div class="card" style="border-radius:16px;overflow:hidden;margin-bottom:20px;">
        <div class="card-header"><h3 style="color:#16a34a;">&#10003; Credentialed Payers (${approvedApps.length})</h3></div>
        <div class="card-body" style="padding:0;">
          ${approvedApps.length > 0 ? '<table><thead><tr><th>Payer</th><th>State</th><th>Effective Date</th><th>Enrollment ID</th><th>Tags</th></tr></thead><tbody>' +
            approvedApps.map(a => {
              const payer = getPayerById(a.payerId) || {};
              const payerName = payer.name || a.payerName || a.payer_name || (typeof a.payer === 'object' && a.payer ? a.payer.name : a.payer) || '—';
              return '<tr>' +
                '<td><strong>' + payerLink(payerName, a.payerId || payer.id) + '</strong>' + (payer.parentOrg ? '<br><span style="font-size:10px;color:var(--gray-400);">' + escHtml(payer.parentOrg) + '</span>' : '') + '</td>' +
                '<td>' + escHtml(a.state || '—') + '</td>' +
                '<td>' + fmtDate(a.effectiveDate || a.effective_date) + '</td>' +
                '<td><code style="font-size:11px;">' + escHtml(a.enrollmentId || a.enrollment_id || a.applicationRef || a.application_ref || '—') + '</code></td>' +
                '<td>' + renderPayerTags(payer.tags || []) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table>' : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No credentialed payers yet.</div>'}
        </div>
      </div>

      <!-- In-Progress Applications with SLA Tracking & Predictions -->
      ${pendingApps.length > 0 ? '<div class="card" style="border-radius:16px;overflow:hidden;margin-bottom:20px;">' +
        '<div class="card-header"><h3 style="color:#f59e0b;">&#9203; In Progress ('+pendingApps.length+')</h3></div>' +
        '<div class="card-body" style="padding:0;"><table><thead><tr><th>Payer</th><th>State</th><th>Status</th><th>Submitted</th><th>SLA Progress</th><th>Predicted Approval</th><th>Timeline</th></tr></thead><tbody>' +
        pendingApps.map(a => {
          const payer = getPayerById(a.payerId) || {};
          const payerName = payer.name || a.payerName || a.payer_name || (typeof a.payer === 'object' && a.payer ? a.payer.name : a.payer) || '—';
          const submitted = a.submittedDate || a.submitted_date || a.created_at || a.createdAt;
          const daysPending = submitted ? Math.floor((new Date() - new Date(submitted)) / 86400000) : null;
          const statusLabel = a.status === 'in_review' ? 'In Review' : a.status === 'pending_info' ? 'Info Needed' : a.status === 'gathering_docs' ? 'Gathering Docs' : (a.status || 'Pending');
          const statusColor = a.status === 'pending_info' ? '#f59e0b' : '#3b82f6';
          const sla = getPayerSLA(payerName);
          const elapsed = daysPending || 0;
          const slaPct = sla.avgDays > 0 ? elapsed / sla.avgDays : 0;
          const barPct = Math.min(100, Math.round((elapsed / sla.maxDays) * 100));
          const isOverdue = elapsed > sla.maxDays;
          const isAtRisk = !isOverdue && slaPct > 0.75;
          const barColor = isOverdue ? '#EF4444' : isAtRisk ? '#F59E0B' : '#10B981';
          const slaLabel = isOverdue ? 'OVERDUE' : isAtRisk ? 'AT RISK' : 'On Track';
          const slaBadgeBg = isOverdue ? '#FEE2E2' : isAtRisk ? '#FEF3C7' : '#D1FAE5';
          const slaBadgeColor = isOverdue ? '#EF4444' : isAtRisk ? '#F59E0B' : '#065f46';
          const pred = predictApplicationTimeline(a, provApps, sla);
          const predDateStr = pred.estimatedApprovalDate ? pred.estimatedApprovalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
          const confDotColor = pred.confidence === 'high' ? '#10B981' : pred.confidence === 'medium' ? '#F59E0B' : '#9CA3AF';
          const riskClr = pred.riskLevel === 'delayed' ? '#EF4444' : pred.riskLevel === 'at-risk' ? '#F59E0B' : '#10B981';
          const riskBg = pred.riskLevel === 'delayed' ? '#FEE2E2' : pred.riskLevel === 'at-risk' ? '#FEF3C7' : '#D1FAE5';
          const riskLbl = pred.riskLevel === 'delayed' ? 'Delayed' : pred.riskLevel === 'at-risk' ? 'At Risk' : 'On Track';
          return '<tr>' +
            '<td><strong>' + payerLink(payerName, a.payerId || payer.id) + '</strong></td>' +
            '<td>' + escHtml(a.state || '—') + '</td>' +
            '<td><span class="badge" style="background:' + statusColor + '22;color:' + statusColor + ';font-size:10px;font-weight:600;padding:3px 8px;border-radius:12px;">' + escHtml(statusLabel) + '</span></td>' +
            '<td>' + fmtDate(submitted) + '</td>' +
            '<td style="min-width:180px;">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<div style="flex:1;height:8px;border-radius:4px;background:#f3f4f6;overflow:hidden;">' +
                  '<div style="height:100%;width:' + barPct + '%;background:' + barColor + ';border-radius:4px;transition:width 0.3s;"></div>' +
                '</div>' +
                '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:' + slaBadgeBg + ';color:' + slaBadgeColor + ';white-space:nowrap;">' + slaLabel + '</span>' +
              '</div>' +
              '<div style="font-size:10px;color:var(--gray-500);margin-top:3px;">Elapsed: <strong>' + (daysPending !== null ? daysPending + 'd' : '—') + '</strong> &middot; Expected: ~' + sla.avgDays + 'd</div>' +
            '</td>' +
            '<td style="min-width:150px;">' +
              '<div style="font-weight:600;font-size:12px;color:' + riskClr + ';">' + predDateStr + '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;margin-top:3px;">' +
                '<span style="width:7px;height:7px;border-radius:50%;background:' + confDotColor + ';display:inline-block;" title="' + escAttr(pred.basedOn) + '"></span>' +
                '<span style="font-size:10px;color:var(--gray-500);text-transform:capitalize;">' + pred.confidence + '</span>' +
                '<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:6px;background:' + riskBg + ';color:' + riskClr + ';margin-left:4px;">' + riskLbl + '</span>' +
              '</div>' +
              '<div style="font-size:9px;color:var(--gray-400);margin-top:2px;" title="' + escAttr(pred.basedOn) + '">~' + pred.predictedDays + 'd est.</div>' +
            '</td>' +
            '<td style="font-size:11px;color:var(--gray-500);white-space:nowrap;">' +
              '<div>Min: ' + sla.minDays + 'd</div>' +
              '<div>Avg: ' + sla.avgDays + 'd</div>' +
              '<div>Max: ' + sla.maxDays + 'd</div>' +
            '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div></div>' : ''}

      <!-- Denied Applications -->
      ${deniedApps.length > 0 ? '<div class="card" style="border-radius:16px;overflow:hidden;margin-bottom:20px;">' +
        '<div class="card-header"><h3 style="color:#ef4444;">&#10007; Denied ('+deniedApps.length+')</h3></div>' +
        '<div class="card-body" style="padding:0;"><table><thead><tr><th>Payer</th><th>State</th><th>Reason</th><th>Date</th></tr></thead><tbody>' +
        deniedApps.map(a => {
          const payer = getPayerById(a.payerId) || {};
          const payerName = payer.name || a.payerName || a.payer_name || (typeof a.payer === 'object' && a.payer ? a.payer.name : a.payer) || '—';
          return '<tr>' +
            '<td><strong>' + payerLink(payerName, a.payerId || payer.id) + '</strong></td>' +
            '<td>' + escHtml(a.state || '—') + '</td>' +
            '<td style="font-size:12px;color:var(--gray-500);">' + escHtml(a.denialReason || a.denial_reason || a.notes || '—') + '</td>' +
            '<td>' + fmtDate(a.deniedDate || a.denied_date || a.updatedAt || a.updated_at) + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div></div>' : ''}

      <!-- Strategic Opportunities -->
      ${opportunities.length > 0 ? '<div class="card" style="border-radius:16px;overflow:hidden;margin-bottom:20px;border:2px dashed var(--brand-200);">' +
        '<div class="card-header" style="background:linear-gradient(135deg,rgba(99,102,241,0.05),rgba(139,92,246,0.05));"><h3 style="color:var(--brand-600);">&#128161; Strategic Opportunities</h3><div style="font-size:12px;color:var(--gray-500);margin-top:2px;">High-value payers this provider is not yet credentialed with</div></div>' +
        '<div class="card-body" style="padding:0;"><table><thead><tr><th>Payer</th><th>Category</th><th>Why</th><th>Notes</th><th>Tags</th></tr></thead><tbody>' +
        opportunities.map(p => {
          const why = [];
          if (p.tags?.includes('must_have')) why.push('Must Have');
          if (p.tags?.includes('high_volume')) why.push('High Volume');
          if (p.tags?.includes('growing_market')) why.push('Growing Market');
          if (p.tags?.includes('high_reimbursement')) why.push('High Reimb.');
          return '<tr>' +
            '<td><strong>' + escHtml(p.name) + '</strong>' + (p.parentOrg ? '<br><span style="font-size:10px;color:var(--gray-400);">' + escHtml(p.parentOrg) + '</span>' : '') + '</td>' +
            '<td style="font-size:11px;">' + escHtml((p.category || '').replace(/_/g, ' ')) + '</td>' +
            '<td>' + why.map(w => '<span style="display:inline-block;padding:2px 6px;border-radius:8px;font-size:10px;font-weight:600;background:#d1fae5;color:#065f46;margin:1px;">' + w + '</span>').join(' ') + '</td>' +
            '<td style="font-size:11px;color:var(--gray-600);max-width:250px;">' + escHtml(p.notes || '—') + '</td>' +
            '<td>' + renderPayerTags(p.tags || []) + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div></div>' : ''}
      `;
      })()}
    </div>

    <!-- Documents Tab -->
    <div class="profile-tab-content" id="tab-documents" style="display:none;">
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3>Documents</h3>
          <div style="display:flex;gap:8px;">
            ${editButton('Upload Document', `window.app.openDocUploadModal(${providerId})`, 'btn-primary')}
            <button class="btn btn-sm" onclick="window.app.downloadProviderPacket(${providerId})" title="Download full credentialing packet as PDF">PDF Packet</button>
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          ${renderDocumentVersioning(documents, providerId)}
          ${Array.isArray(documents) && documents.length > 0 ? `<table>
            <thead><tr><th>Document</th><th>Type</th><th>Status</th><th>Received</th><th>Expires</th><th>File</th><th></th></tr></thead>
            <tbody>
              ${documents.map(d => {
                const hasFile = d.filePath || d.file_path;
                const statusClass = (d.status === 'verified' || d.status === 'received') ? 'approved' : d.status === 'expired' ? 'denied' : d.status === 'missing' ? 'denied' : 'pending';
                const fileSize = d.fileSize || d.file_size;
                const fileSizeStr = fileSize ? (fileSize > 1048576 ? (fileSize / 1048576).toFixed(1) + ' MB' : (fileSize / 1024).toFixed(0) + ' KB') : '';
                return `<tr>
                <td><strong>${escHtml(d.documentName || d.document_name || d.name || '—')}</strong>${getDocVersionBadge(d, documents)}</td>
                <td>${escHtml(d.documentType || d.document_type || d.type || '—')}</td>
                <td><span class="badge badge-${statusClass}">${escHtml(d.status || 'pending')}</span></td>
                <td>${formatDateDisplay(d.receivedDate || d.received_date || d.createdAt || d.created_at)}</td>
                <td>${getDocExpiryHtml(d)}</td>
                <td>${hasFile ? `<span style="color:var(--green-600);cursor:pointer;" onclick="window.app.downloadDocument(${providerId}, ${d.id})" title="${escHtml(d.originalFilename || d.original_filename || '')} ${fileSizeStr}">Download</span>` : '<span style="color:var(--gray-400);">No file</span>'}</td>
                <td style="white-space:nowrap;">
                  ${!auth.isReadonly() ? `<button class="btn btn-sm" onclick="window.app.replaceDocument(${providerId}, ${d.id})" style="padding:2px 8px;font-size:11px;" title="Replace with new version">Replace</button>` : ''}
                  ${hasFile ? `<button class="btn btn-sm" onclick="window.app.aiExtractDoc(${providerId}, ${d.id})" style="padding:2px 8px;font-size:11px;" title="AI Extract Data">AI Extract</button>` : ''}
                  ${!auth.isReadonly() ? `<button class="btn btn-sm btn-danger" onclick="window.app.deleteDocument(${providerId}, ${d.id})" style="padding:2px 8px;font-size:11px;">Delete</button>` : ''}
                </td>
              </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No documents on file. Upload your first document above.</div>'}
        </div>
      </div>

      <!-- Upload Document Modal -->
      <div class="modal-overlay" id="doc-upload-modal">
        <div class="modal" style="max-width:500px;">
          <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;">
            <h3>Upload Document</h3>
            <button class="btn btn-sm" onclick="document.getElementById('doc-upload-modal').classList.remove('active')">&times;</button>
          </div>
          <div class="modal-body" style="padding:1rem;">
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Document Type *</label>
              <select id="doc-upload-type" class="form-control">
                <option value="">Select type...</option>
                <option value="cv_resume">CV / Resume</option>
                <option value="state_license">State License</option>
                <option value="dea_certificate">DEA Certificate</option>
                <option value="board_certification">Board Certification</option>
                <option value="malpractice_coi">Malpractice COI</option>
                <option value="diploma">Diploma / Degree</option>
                <option value="cds_certificate">CDS Certificate</option>
                <option value="w9">W-9</option>
                <option value="government_id">Government ID</option>
                <option value="proof_of_insurance">Proof of Insurance</option>
                <option value="clia_certificate">CLIA Certificate</option>
                <option value="collaborative_agreement">Collaborative Agreement</option>
                <option value="supervision_agreement">Supervision Agreement</option>
                <option value="immunization_record">Immunization Record</option>
                <option value="background_check">Background Check</option>
                <option value="reference_letter">Reference Letter</option>
                <option value="attestation">Attestation</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Document Name *</label>
              <input type="text" id="doc-upload-name" class="form-control" placeholder="e.g. NY Medical License">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">File * <span style="color:var(--gray-400);font-size:11px;">(PDF, JPG, PNG — max 20MB)</span></label>
              <input type="file" id="doc-upload-file" class="form-control" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.tif,.tiff">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Link to Application</label>
              <select id="doc-upload-app" class="form-control">
                <option value="">None — general provider document</option>
                ${apps.map(a => {
                  const payer = a.payerName || a.payer_name || 'Unknown Payer';
                  const st = a.state || '';
                  const stat = (a.status || '').replace(/_/g, ' ');
                  return `<option value="${a.id}">${escHtml(payer)} (${st}) — ${stat}</option>`;
                }).join('')}
              </select>
              <div style="font-size:11px;color:var(--gray-400);margin-top:3px;">If linked, file also appears under the application's attachments.</div>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Expiration Date</label>
              <input type="date" id="doc-upload-expiry" class="form-control">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label">Notes</label>
              <textarea id="doc-upload-notes" class="form-control" rows="2" placeholder="Optional notes..."></textarea>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem;">
            <button class="btn" onclick="document.getElementById('doc-upload-modal').classList.remove('active')">Cancel</button>
            <button class="btn btn-primary" id="doc-upload-save-btn" onclick="window.app.saveDocUpload(${providerId})">Upload</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function renderProviderPortableProfile(providerId) {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  if (!providerId) { body.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:var(--gray-500);">No provider selected.</div></div>'; return; }

  let provider = null, licenses = [], deaReg = [], exclusions = [], apps = [];
  try {
    [provider, licenses, deaReg, exclusions, apps] = await Promise.all([
      store.getOne('providers', providerId), store.getAll('licenses'),
      store.getAll('dea_registrations').catch(() => []), store.getAll('exclusions').catch(() => []),
      store.getAll('applications'),
    ]);
    licenses = (licenses || []).filter(l => (l.providerId || l.provider_id) == providerId);
    deaReg = (deaReg || []).filter(d => (d.providerId || d.provider_id) == providerId);
    exclusions = (exclusions || []).filter(ex => (ex.providerId || ex.provider_id) == providerId);
    apps = (apps || []).filter(a => (a.providerId || a.provider_id) == providerId);
  } catch (e) { console.error('Profile load error:', e); }

  if (!provider) { body.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:var(--gray-500);">Provider not found.</div></div>'; return; }

  const now = new Date();
  const genDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const name = `${provider.firstName || ''} ${provider.lastName || ''}`.trim();
  const activeLicenses = licenses.filter(l => { const exp = l.expirationDate || l.expiration_date; return !exp || new Date(exp) >= now; });
  const activeDea = deaReg.filter(d => { const exp = d.expirationDate || d.expiration_date; return !exp || new Date(exp) >= now; });
  const approvedApps = apps.filter(a => a.status === 'approved');
  const hasExclusion = exclusions.some(ex => ['excluded','flagged'].includes((ex.status || '').toLowerCase()));
  const wasScreened = exclusions.length > 0;
  const stateSet = new Set();
  licenses.forEach(l => { if (l.state) stateSet.add(l.state); });
  approvedApps.forEach(a => { if (a.state) stateSet.add(a.state); });

  body.innerHTML = `
    <style>
      .ppv2-card{border-radius:16px!important;overflow:hidden;}
      .ppv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <div style="max-width:800px;margin:0 auto;">
      <div style="display:flex;gap:8px;margin-bottom:16px;justify-content:flex-end;" class="no-print">
        <button class="btn" onclick="window.app.copyProviderProfileLink(${providerId})">&#128279; Copy Link</button>
        <button class="btn" onclick="window.print()">&#128424; Print / PDF</button>
        <button class="btn" onclick="navigateTo('psv')">&#8592; Back to PSV</button>
      </div>

      <div class="card ppv2-card" style="margin-bottom:20px;border-top:4px solid var(--brand-600);">
        <div class="card-body" style="padding:24px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--brand-600);font-weight:700;margin-bottom:4px;">Credentik Verified Provider Profile</div>
              <h2 style="margin:0 0 4px;font-size:24px;">${escHtml(name)}</h2>
              <div style="font-size:14px;color:var(--gray-600);">${escHtml(provider.credentials || '')} ${provider.specialty ? '— ' + escHtml(provider.specialty) : ''}</div>
              <div style="font-size:13px;color:var(--gray-500);margin-top:4px;">NPI: <code>${escHtml(provider.npi || 'Not provided')}</code>${provider.hexId || provider.hex_id ? ' | ID: <code>' + (provider.hexId || provider.hex_id).toUpperCase() + '</code>' : ''}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;color:var(--gray-400);">Generated: ${genDate}</div>
              <div style="margin-top:8px;padding:6px 12px;border-radius:8px;background:${hasExclusion ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'};color:${hasExclusion ? 'var(--red)' : 'var(--green)'};font-weight:700;font-size:13px;">
                ${hasExclusion ? '&#9888; EXCLUSION FLAG' : wasScreened ? '&#10003; No Exclusions Found' : '&#9675; Not Yet Screened'}
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:20px;padding-top:16px;border-top:1px solid var(--gray-200);">
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--brand-600);">${activeLicenses.length}</div><div style="font-size:11px;color:var(--gray-500);">Active Licenses</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--green);">${stateSet.size}</div><div style="font-size:11px;color:var(--gray-500);">States</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--brand-600);">${activeDea.length}</div><div style="font-size:11px;color:var(--gray-500);">Active DEA</div></div>
            <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--green);">${approvedApps.length}</div><div style="font-size:11px;color:var(--gray-500);">Approved Payers</div></div>
          </div>
        </div>
      </div>

      <div class="card ppv2-card" style="margin-bottom:16px;">
        <div class="card-header"><h3>State Licenses (${licenses.length})</h3></div>
        <div class="card-body" style="padding:0;"><table><thead><tr><th>State</th><th>License #</th><th>Type</th><th>Issued</th><th>Expiration</th><th>Status</th></tr></thead><tbody>
          ${licenses.map(l => { const exp = l.expirationDate || l.expiration_date; const isExp = exp && new Date(exp) < now; const days = exp ? Math.round((new Date(exp) - now) / 86400000) : null;
            return `<tr><td><strong>${escHtml(l.state || '—')}</strong></td><td><code>${escHtml(l.licenseNumber || l.license_number || '—')}</code></td><td>${escHtml(l.licenseType || l.license_type || '—')}</td><td style="font-size:12px;">${l.issueDate || l.issue_date ? formatDateDisplay(l.issueDate || l.issue_date) : '—'}</td><td style="font-size:12px;">${exp ? formatDateDisplay(exp) : '—'} ${days !== null && days >= 0 && days <= 90 ? '<span style="font-size:10px;color:var(--gold);">(' + days + 'd)</span>' : ''}</td><td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${isExp ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)'};color:${isExp ? 'var(--red)' : 'var(--green)'};">${isExp ? 'Expired' : 'Active'}</span></td></tr>`; }).join('')}
          ${!licenses.length ? '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--gray-400);">No licenses on file</td></tr>' : ''}
        </tbody></table></div>
      </div>

      <div class="card ppv2-card" style="margin-bottom:16px;">
        <div class="card-header"><h3>DEA Registrations (${deaReg.length})</h3></div>
        <div class="card-body" style="padding:0;"><table><thead><tr><th>DEA Number</th><th>State</th><th>Schedules</th><th>Expiration</th><th>Status</th></tr></thead><tbody>
          ${deaReg.map(d => { const exp = d.expirationDate || d.expiration_date; const isExp = exp && new Date(exp) < now;
            return `<tr><td><code>${escHtml(d.deaNumber || d.dea_number || '—')}</code></td><td>${escHtml(d.state || '—')}</td><td style="font-size:12px;">${escHtml(d.schedules || '—')}</td><td style="font-size:12px;">${exp ? formatDateDisplay(exp) : '—'}</td><td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${isExp ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)'};color:${isExp ? 'var(--red)' : 'var(--green)'};">${isExp ? 'Expired' : 'Active'}</span></td></tr>`; }).join('')}
          ${!deaReg.length ? '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--gray-400);">No DEA registrations on file</td></tr>' : ''}
        </tbody></table></div>
      </div>

      <div class="card ppv2-card" style="margin-bottom:16px;">
        <div class="card-header"><h3>Payer Enrollments (${apps.length})</h3></div>
        <div class="card-body" style="padding:0;"><table><thead><tr><th>Payer</th><th>State</th><th>Status</th><th>Submitted</th><th>Effective</th></tr></thead><tbody>
          ${apps.map(a => { const sc = { approved: 'var(--green)', denied: 'var(--red)', in_review: 'var(--brand-600)', submitted: 'var(--blue)', pending_info: 'var(--gold)' }; const c = sc[a.status] || 'var(--gray-500)';
            return `<tr><td><strong>${escHtml(a.payerName || a.payer_name || '—')}</strong></td><td>${escHtml(a.state || '—')}</td><td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${c}18;color:${c};">${(a.status || '').replace(/_/g, ' ')}</span></td><td style="font-size:12px;">${a.submittedDate || a.submitted_date ? formatDateDisplay(a.submittedDate || a.submitted_date) : '—'}</td><td style="font-size:12px;">${a.effectiveDate || a.effective_date ? formatDateDisplay(a.effectiveDate || a.effective_date) : '—'}</td></tr>`; }).join('')}
          ${!apps.length ? '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--gray-400);">No payer enrollments on file</td></tr>' : ''}
        </tbody></table></div>
      </div>

      <div class="card ppv2-card" style="margin-bottom:16px;">
        <div class="card-header"><h3>Exclusion Screening</h3></div>
        <div class="card-body" style="padding:${exclusions.length ? '0' : '24px'};${!exclusions.length ? 'text-align:center;color:var(--gray-400);' : ''}">
          ${exclusions.length ? `<table><thead><tr><th>Source</th><th>Status</th><th>Screened</th><th>Details</th></tr></thead><tbody>
            ${exclusions.map(ex => `<tr><td>${escHtml(ex.source || 'OIG/SAM')}</td><td><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${(ex.status || '').toLowerCase() === 'clear' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'};color:${(ex.status || '').toLowerCase() === 'clear' ? 'var(--green)' : 'var(--red)'};">${escHtml(ex.status || 'Unknown')}</span></td><td style="font-size:12px;">${ex.screenedAt || ex.screened_at ? formatDateDisplay(ex.screenedAt || ex.screened_at) : '—'}</td><td style="font-size:12px;">${escHtml(ex.details || ex.reason || '—')}</td></tr>`).join('')}
          </tbody></table>` : 'No exclusion screenings performed yet.'}
        </div>
      </div>

      <div style="text-align:center;padding:16px;font-size:11px;color:var(--gray-400);">
        Generated by Credentik &mdash; ${genDate} &mdash; Point-in-time snapshot. Verify current status at app.credentik.com.
      </div>
    </div>
  `;
}

export {
  renderProviderDashboard,
  renderProviderPrintout,
  renderProviderProfilePage,
  renderProviderPortableProfile,
};
