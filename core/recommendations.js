// core/recommendations.js — Recommendations Engine
// Computes actionable recommendations from current data state.
// Stateless / in-memory (Phase 2). Persistence will arrive in Phase 2.5.
//
// Each recommendation has shape:
//   { id, type, severity, subject, title, body, evidence, action, generatedAt }
//
// `id` is deterministic (hash of type+subject) so dismissals can persist by id.

import store from './store.js';

// ── Dismissal persistence (localStorage; per-tenant via scope) ──

const DISMISS_KEY = 'credentik_rec_dismissals';

function _getDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')); }
  catch { return new Set(); }
}

function _saveDismissed(set) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set])); } catch {}
}

export function dismissRecommendation(id) {
  const set = _getDismissed();
  set.add(id);
  _saveDismissed(set);
}

export function undismissRecommendation(id) {
  const set = _getDismissed();
  set.delete(id);
  _saveDismissed(set);
}

export function clearAllDismissals() {
  _saveDismissed(new Set());
}

// ── Severity ordering ──

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

// ── Behavioral health arm relationships ──
// When a provider is credentialed with a BH arm in a state, the parent payer's
// BH line is considered covered for that state. This applies to behavioral
// health practice modes only — medical-line claims still need a direct contract.
//
// Format: lowercase BH-arm name → array of parent payer names it satisfies in
// that same state. Lucet manages BH for several Independent BCBS plans, so the
// satisfied set is state-conditional (handled in the lookup function below).
const BH_ARM_PARENTS = {
  // Wholly-owned national arms — apply universally wherever the arm is credentialed
  'optum':                       { parents: ['UnitedHealthcare'], scope: 'any' },
  'optum behavioral health':     { parents: ['UnitedHealthcare'], scope: 'any' },
  'evernorth':                   { parents: ['Cigna'], scope: 'any' },
  'evernorth behavioral health': { parents: ['Cigna'], scope: 'any' },
  'carelon':                     { parents: ['Anthem/Elevance', 'Anthem BCBS'], scope: 'any' },
  'carelon behavioral health':   { parents: ['Anthem/Elevance', 'Anthem BCBS'], scope: 'any' },
  // State-specific BH manager relationships
  'lucet': {
    scope: 'state-map',
    byState: {
      FL: ['Florida Blue'],
      KS: ['BCBS of Kansas', 'BCBS of Kansas City'],
      NC: ['BCBS of North Carolina'],
      SC: ['BCBS of South Carolina'],
    },
  },
  'new directions': {
    scope: 'state-map',
    byState: {
      FL: ['Florida Blue'],
      KS: ['BCBS of Kansas'],
      NC: ['BCBS of North Carolina'],
      SC: ['BCBS of South Carolina'],
    },
  },
  // Magellan and Quest are independent BH networks — they do NOT auto-satisfy
  // a parent payer in our map. Listed here for documentation only.
};

// Returns the set of parent payer names satisfied by this BH arm in this state.
function _satisfiedParents(armName, state) {
  const def = BH_ARM_PARENTS[(armName || '').toLowerCase()];
  if (!def) return [];
  if (def.scope === 'any') return def.parents || [];
  if (def.scope === 'state-map') return (def.byState && def.byState[state]) || [];
  return [];
}

// Build a Set of "PayerName|State" keys for parents that are BH-covered via an arm.
// Only applies for behavioral-health practice (default true for this app).
function _buildBhCoveredKeys(apps) {
  const covered = new Set();
  apps.forEach(a => {
    if (a.status !== 'approved' && a.status !== 'credentialed') return;
    const armName = (a.payerName || a.payer_name || '').trim();
    if (!armName) return;
    const parents = _satisfiedParents(armName, a.state);
    parents.forEach(pn => covered.add(`${pn.toLowerCase()}|${a.state}`));
  });
  return covered;
}

// ── Helpers ──

function _id(type, subject) {
  return `${type}:${String(subject).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function _daysBetween(a, b) {
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function _payerNameOf(app, payerCatalog) {
  const cat = payerCatalog.find(p => String(p.id) === String(app.payerId));
  return cat ? cat.name : (app.payerName || app.payer_name || 'Unknown');
}

// ── Generators ──
// Each generator returns an array of recommendations.

function _isFederalPayer(payerName, payerCatalog) {
  const cat = payerCatalog.find(p => (p.name || '').toLowerCase() === (payerName || '').toLowerCase());
  if (!cat) {
    // Fallback heuristic for payers in apps but not in catalog (VACCN, ChampVA, etc.)
    const n = (payerName || '').toLowerCase();
    return /\b(medicare|tricare|vaccn|va community|champva|federal)\b/.test(n);
  }
  const tags = Array.isArray(cat.tags) ? cat.tags : [];
  return tags.includes('federal_program');
}

function _expansionRecommendations(apps, licenses, payerCatalog) {
  const recs = [];
  const licensedStates = new Set(licenses.map(l => l.state).filter(Boolean));
  if (licensedStates.size === 0) return recs;

  // BH coverage via arms (Optum=UHC BH, Evernorth=Cigna BH, Carelon=Anthem BH,
  // Lucet=FL Blue/BCBS-KS/etc BH). Treats parent BH as covered in that state.
  const bhCovered = _buildBhCoveredKeys(apps);

  // For each (provider, payer) pair currently approved/credentialed somewhere,
  // find licensed states with no application for that (provider, payer).
  const approvedKey = new Set();
  apps.forEach(a => {
    if (a.status === 'approved' || a.status === 'credentialed') {
      approvedKey.add(`${a.providerId || a.provider_id}|${a.payerId || a.payerName}`);
    }
  });

  approvedKey.forEach(key => {
    const [providerId, payerKey] = key.split('|');
    const stateAppMap = {};
    apps.forEach(a => {
      const aKey = `${a.providerId || a.provider_id}|${a.payerId || a.payerName}`;
      if (aKey !== key) return;
      if (a.state) stateAppMap[a.state] = a;
    });
    const sample = apps.find(a => `${a.providerId || a.provider_id}|${a.payerId || a.payerName}` === key);
    const payerName = _payerNameOf(sample, payerCatalog);
    // Drop states where this payer's BH is already covered via an arm.
    const gaps = [...licensedStates].filter(s => !stateAppMap[s] && !bhCovered.has(`${payerName.toLowerCase()}|${s}`));
    if (gaps.length === 0) return;

    const isFederal = _isFederalPayer(payerName, payerCatalog);

    if (isFederal) {
      // Federal program — single enrollment covers all states. The action is to
      // ADD A PRACTICE LOCATION (PECOS for Medicare, payer portal for others),
      // not to file a new application.
      recs.push({
        id: _id('addloc', `${providerId}-${payerKey}`),
        type: 'addloc',
        severity: gaps.length >= 5 ? 'high' : 'medium',
        subject: payerName,
        title: `Add ${payerName} practice locations for ${gaps.length} state${gaps.length !== 1 ? 's' : ''}`,
        body: `${payerName} is a federal program — your existing enrollment covers all licensed states once you add the practice location. No new application needed for: ${gaps.join(', ')}.`,
        evidence: { providerId, payerName, gapStates: gaps, licensedStates: [...licensedStates], federal: true },
        action: { kind: 'add_locations', states: gaps, payerName, providerId, payerId: payerKey },
        generatedAt: new Date().toISOString(),
      });
    } else {
      recs.push({
        id: _id('expand', `${providerId}-${payerKey}`),
        type: 'expand',
        severity: gaps.length >= 5 ? 'high' : 'medium',
        subject: payerName,
        title: `Expand ${payerName} into ${gaps.length} licensed state${gaps.length !== 1 ? 's' : ''}`,
        body: `Provider is credentialed with ${payerName} elsewhere. Gap states: ${gaps.join(', ')}.`,
        evidence: { providerId, payerName, gapStates: gaps, licensedStates: [...licensedStates] },
        action: { kind: 'create_apps', states: gaps, payerName, providerId },
        generatedAt: new Date().toISOString(),
      });
    }
  });

  return recs;
}

function _mustHaveRecommendations(apps, payerCatalog) {
  const recs = [];
  const bhCovered = _buildBhCoveredKeys(apps);
  // Set of must-have parent names whose BH is covered somewhere via an arm.
  const bhCoveredParents = new Set();
  bhCovered.forEach(k => bhCoveredParents.add(k.split('|')[0]));

  const mustHave = payerCatalog.filter(p => Array.isArray(p.tags) && p.tags.includes('must_have'));
  mustHave.forEach(payer => {
    const hasAny = apps.some(a => String(a.payerId) === String(payer.id) ||
      (a.payerName || '').toLowerCase() === payer.name.toLowerCase());
    if (hasAny) return;
    // BH-arm coverage of this parent anywhere → not a "no applications" case.
    if (bhCoveredParents.has(payer.name.toLowerCase())) return;
    recs.push({
      id: _id('musthave', payer.name),
      type: 'musthave',
      severity: 'high',
      subject: payer.name,
      title: `Apply to must-have payer: ${payer.name}`,
      body: `${payer.name} is tagged as a must-have payer but you have no applications. High-priority to begin credentialing.`,
      evidence: { payerId: payer.id, payerName: payer.name, tags: payer.tags },
      action: { kind: 'create_app', payerId: payer.id, payerName: payer.name },
      generatedAt: new Date().toISOString(),
    });
  });
  return recs;
}

function _licenseRenewalRecommendations(licenses) {
  const recs = [];
  const today = new Date();
  licenses.forEach(l => {
    const exp = l.expirationDate || l.expiration_date || l.expiresAt || l.expires_at;
    if (!exp) return;
    const days = _daysBetween(exp, today);
    if (days < 0 || days > 60) return;
    const severity = days <= 14 ? 'critical' : days <= 30 ? 'high' : 'medium';
    recs.push({
      id: _id('renew', `${l.id || (l.state + '-' + l.licenseNumber)}`),
      type: 'renew',
      severity,
      subject: `${l.state} license`,
      title: `${l.state} license expires in ${days} day${days !== 1 ? 's' : ''}`,
      body: `License ${l.licenseNumber || l.license_number || ''} for ${l.state} (provider ${l.providerId || l.provider_id || ''}) expires ${exp}.`,
      evidence: { licenseId: l.id, state: l.state, expirationDate: exp, daysUntilExpiry: days },
      action: { kind: 'open_license', licenseId: l.id },
      generatedAt: new Date().toISOString(),
    });
  });
  return recs;
}

function _stalledApplicationRecommendations(apps, payerCatalog, slaFn) {
  const recs = [];
  const today = new Date();
  const STALL_STATUSES = new Set(['submitted', 'in_review', 'pending_info', 'gathering_docs']);
  apps.forEach(a => {
    if (!STALL_STATUSES.has(a.status)) return;
    const ref = a.statusChangedDate || a.submittedDate || a.submitted_date || a.createdAt || a.created_at;
    if (!ref) return;
    const days = _daysBetween(today, ref);
    const payerName = _payerNameOf(a, payerCatalog);
    const sla = slaFn ? slaFn(payerName) : { avgDays: 60, maxDays: 120 };
    const threshold = (a.slaDays || a.sla_days || sla.maxDays || 120);
    if (days <= threshold) return;
    const overBy = days - threshold;
    const severity = overBy >= 60 ? 'critical' : overBy >= 30 ? 'high' : 'medium';
    recs.push({
      id: _id('stalled', a.id),
      type: 'stalled',
      severity,
      subject: `${payerName} — ${a.state}`,
      title: `Stalled ${days}d: ${payerName} (${a.state})`,
      body: `Application has been in "${a.status}" for ${days} days — ${overBy} days over the ${threshold}d expected turnaround. Consider a follow-up.`,
      evidence: { appId: a.id, status: a.status, daysInStatus: days, slaDays: threshold },
      action: { kind: 'open_app', appId: a.id },
      generatedAt: new Date().toISOString(),
    });
  });
  return recs;
}

function _denialFollowupRecommendations(apps, activityLogs) {
  const recs = [];
  const today = new Date();
  const logsByApp = {};
  (activityLogs || []).forEach(l => {
    const aid = l.applicationId || l.application_id;
    if (!aid) return;
    (logsByApp[aid] = logsByApp[aid] || []).push(l);
  });

  apps.forEach(a => {
    if (a.status !== 'denied') return;
    const logs = logsByApp[a.id] || [];
    const lastTouch = logs
      .map(l => new Date(l.loggedDate || l.logged_date || l.createdAt || l.created_at).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => b - a)[0];
    const refTs = lastTouch || new Date(a.updatedAt || a.updated_at || a.statusChangedDate || a.submittedDate || Date.now()).getTime();
    const days = Math.floor((today.getTime() - refTs) / 86400000);
    if (days < 14) return;
    const severity = days >= 45 ? 'high' : 'medium';
    recs.push({
      id: _id('denial', a.id),
      type: 'denial',
      severity,
      subject: `${a.payerName || ''} — ${a.state}`,
      title: `Denial follow-up overdue (${days}d): ${a.payerName || 'Payer'} (${a.state})`,
      body: `This application was denied and has had no activity for ${days} days. Review the denial reason and prepare a resubmission or appeal.`,
      evidence: { appId: a.id, daysSinceTouch: days, denialReason: a.denialReason || a.denial_reason },
      action: { kind: 'open_app', appId: a.id },
      generatedAt: new Date().toISOString(),
    });
  });
  return recs;
}

function _virtualVisitGapRecommendations(apps, payerCatalog) {
  const recs = [];
  apps.forEach(a => {
    if (a.status !== 'approved' && a.status !== 'credentialed') return;
    const th = a.telehealthStatus || a.telehealth_status;
    if (th === 'enabled' || th === 'pending' || th === 'not_applicable') return;
    if (th !== 'not_enrolled') return; // only flag the explicit gap
    const payerName = _payerNameOf(a, payerCatalog);
    recs.push({
      id: _id('vvgap', a.id),
      type: 'vvgap',
      severity: 'medium',
      subject: `${payerName} — ${a.state}`,
      title: `Virtual visit gap: ${payerName} (${a.state})`,
      body: `Credentialed with ${payerName} in ${a.state}, but virtual-visit enrollment is marked Not Enrolled. Add virtual location on payer portal to unlock telehealth claims.`,
      evidence: { appId: a.id, payerName, state: a.state, telehealthStatus: th },
      action: { kind: 'open_app', appId: a.id },
      generatedAt: new Date().toISOString(),
    });
  });
  return recs;
}

function _unprofitablePayerRecommendations(claims, payerCatalog) {
  const recs = [];
  if (!Array.isArray(claims) || claims.length === 0) return recs;
  const byPayer = {};
  claims.forEach(c => {
    const pname = c.payerName || c.payer_name || 'Unknown';
    if (!byPayer[pname]) byPayer[pname] = { billed: 0, paid: 0, count: 0 };
    byPayer[pname].billed += Number(c.totalCharges || c.total_charges) || 0;
    byPayer[pname].paid += Number(c.totalPaid || c.total_paid || c.paidAmount || c.paid_amount) || 0;
    byPayer[pname].count++;
  });
  Object.entries(byPayer).forEach(([payerName, agg]) => {
    if (agg.count < 5) return; // need a meaningful sample
    if (agg.billed === 0) return;
    const rate = Math.round((agg.paid / agg.billed) * 100);
    if (rate >= 70) return;
    const severity = rate < 40 ? 'high' : 'medium';
    const catEntry = payerCatalog.find(p => (p.name || '').toLowerCase() === payerName.toLowerCase());
    recs.push({
      id: _id('unprofitable', payerName),
      type: 'unprofitable',
      severity,
      subject: payerName,
      title: `Unprofitable payer: ${payerName} (${rate}% collection)`,
      body: `Collection rate is ${rate}% across ${agg.count} claim${agg.count !== 1 ? 's' : ''} ($${agg.paid.toLocaleString()} of $${agg.billed.toLocaleString()} billed). Review contract terms, denial patterns, or consider termination.`,
      evidence: { payerName, billed: agg.billed, paid: agg.paid, claimCount: agg.count, collectionRate: rate },
      action: { kind: 'open_payer', payerId: catEntry ? catEntry.id : payerName, payerName },
      generatedAt: new Date().toISOString(),
    });
  });
  return recs;
}

// ── Main API ──

export async function computeRecommendations(opts = {}) {
  const PAYER_CATALOG = window.PAYER_CATALOG || [];
  const slaFn = window.getPayerSLA || (() => ({ avgDays: 60, maxDays: 120 }));

  const [apps, licenses, claims, activityLogs] = await Promise.all([
    store.getAll('applications').then(a => store.filterByScope(a)).catch(() => []),
    store.getAll('licenses').then(l => store.filterByScope(l)).catch(() => []),
    store.getRcmClaims ? store.getRcmClaims().then(c => store.filterByScope(c || [])).catch(() => []) : Promise.resolve([]),
    store.getActivityLogs ? store.getActivityLogs({ collection: 'applications' }).catch(() => []) : Promise.resolve([]),
  ]);

  const generators = [
    () => _expansionRecommendations(apps, licenses, PAYER_CATALOG),
    () => _mustHaveRecommendations(apps, PAYER_CATALOG),
    () => _licenseRenewalRecommendations(licenses),
    () => _stalledApplicationRecommendations(apps, PAYER_CATALOG, slaFn),
    () => _denialFollowupRecommendations(apps, activityLogs),
    () => _virtualVisitGapRecommendations(apps, PAYER_CATALOG),
    () => _unprofitablePayerRecommendations(claims, PAYER_CATALOG),
  ];

  let all = [];
  for (const gen of generators) {
    try { all = all.concat(gen() || []); }
    catch (e) { console.warn('[recommendations] generator failed:', e); }
  }

  const dismissed = _getDismissed();
  const visible = opts.includeDismissed ? all : all.filter(r => !dismissed.has(r.id));

  visible.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 99;
    const sb = SEVERITY_RANK[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.title || '').localeCompare(b.title || '');
  });

  return {
    items: visible,
    dismissedCount: all.length - visible.length,
    totalCount: all.length,
    bySeverity: visible.reduce((acc, r) => { acc[r.severity] = (acc[r.severity] || 0) + 1; return acc; }, {}),
    byType: visible.reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {}),
    generatedAt: new Date().toISOString(),
  };
}

export const REC_TYPE_LABELS = {
  expand: 'Expansion Opportunity',
  addloc: 'Add Practice Location (Federal)',
  musthave: 'Must-Have Payer',
  renew: 'License Renewal',
  stalled: 'Stalled Application',
  denial: 'Denial Follow-up',
  vvgap: 'Virtual Visit Gap',
  unprofitable: 'Unprofitable Payer',
};

export const REC_SEVERITY_COLORS = {
  critical: { bg: '#fee2e2', border: '#ef4444', text: '#dc2626' },
  high:     { bg: '#fef3c7', border: '#f59e0b', text: '#b45309' },
  medium:   { bg: '#dbeafe', border: '#3b82f6', text: '#2563eb' },
  low:      { bg: '#e0e7ff', border: '#6366f1', text: '#4f46e5' },
  info:     { bg: '#f3f4f6', border: '#9ca3af', text: '#6b7280' },
};

export default {
  computeRecommendations,
  dismissRecommendation,
  undismissRecommendation,
  clearAllDismissals,
  REC_TYPE_LABELS,
  REC_SEVERITY_COLORS,
};
