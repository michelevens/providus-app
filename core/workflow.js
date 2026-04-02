/**
 * Credentik — Workflow Engine
 *
 * Manages application status transitions, follow-up scheduling,
 * and business rule enforcement.
 *
 * The backend handles actual transitions via store.transitionApplication(),
 * but we keep client-side validation for immediate UX feedback.
 */

import store from './store.js';
import CONFIG from './config.js';

// ── Valid Status Transitions (client-side validation mirror) ──

const VALID_TRANSITIONS = {
    new:            ['gathering_docs', 'withdrawn'],
    gathering_docs: ['submitted', 'on_hold', 'withdrawn'],
    submitted:      ['in_review', 'pending_info', 'on_hold', 'withdrawn'],
    in_review:      ['approved', 'credentialed', 'pending_info', 'denied', 'on_hold', 'withdrawn'],
    pending_info:   ['in_review', 'submitted', 'on_hold', 'withdrawn'],
    approved:       ['credentialed', 'withdrawn'],
    credentialed:   [],
    denied:         ['submitted', 'withdrawn'],
    on_hold:        ['gathering_docs', 'submitted', 'in_review', 'withdrawn'],
    withdrawn:      ['new'],
};

const FOLLOWUP_RULES = {
    autoSchedule: true,
    scheduleByStatus: {
        submitted:    { intervalDays: 14, maxFollowups: 5 },
        in_review:    { intervalDays: 14, maxFollowups: 4 },
        pending_info: { intervalDays: 7,  maxFollowups: 3 },
    },
    escalation: {
        daysWithoutResponse: 90,
        maxFollowupsBeforeEscalation: 4,
    },
};

// ── Status Transitions ──

function canTransition(fromStatus, toStatus) {
    const allowed = VALID_TRANSITIONS[fromStatus];
    return allowed ? allowed.includes(toStatus) : false;
}

function getAvailableTransitions(currentStatus) {
    return VALID_TRANSITIONS[currentStatus] || [];
}

async function transitionApplication(appId, newStatus, notes = '') {
    // Client-side validation first for fast UX feedback
    let app;
    try {
        app = await store.getOne('applications', appId);
    } catch {
        return { success: false, error: 'Application not found' };
    }

    if (!canTransition(app.status, newStatus)) {
        return {
            success: false,
            error: `Cannot transition from "${app.status}" to "${newStatus}". Allowed: ${getAvailableTransitions(app.status).join(', ')}`,
        };
    }

    // Server handles the actual transition, date stamping, and note appending
    try {
        const result = await store.transitionApplication(appId, newStatus, notes || null);
        return { success: true, record: result };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ── Follow-up Scheduling ──

async function autoScheduleFollowup(appId, status) {
    const schedule = FOLLOWUP_RULES.scheduleByStatus[status];
    if (!schedule) return null;

    // Check existing open follow-ups
    let existing;
    try {
        existing = await store.getAll('followups', { application_id: appId, completed: 0 });
    } catch {
        existing = [];
    }

    if (existing.length >= schedule.maxFollowups) return null;

    const dueDate = addDays(new Date(), schedule.intervalDays);

    try {
        const record = await store.create('followups', {
            application_id: appId,
            type: 'status_check',
            due_date: formatDate(dueDate),
            method: 'phone',
        });
        return { success: true, record };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function completeFollowup(followupId, outcome, nextAction = '') {
    try {
        const result = await store.completeFollowup(followupId);

        // Log the outcome via activity log
        if (outcome || nextAction) {
            await store.createActivityLog({
                entity_type: 'followup',
                entity_id: followupId,
                action: 'completed',
                details: JSON.stringify({ outcome, nextAction }),
            });
        }

        return { success: true, record: result };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function getOverdueFollowups() {
    try {
        return await store.getOverdueFollowups();
    } catch (err) {
        console.error('Failed to fetch overdue follow-ups:', err);
        return [];
    }
}

async function getUpcomingFollowups(days = 7) {
    try {
        return await store.getUpcomingFollowups();
    } catch (err) {
        console.error('Failed to fetch upcoming follow-ups:', err);
        return [];
    }
}

async function getFollowupsForApplication(appId) {
    try {
        const followups = await store.getAll('followups', { application_id: appId });
        return followups.sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''));
    } catch {
        return [];
    }
}

// ── Application Aging ──

function getApplicationAge(app) {
    if (!app.submitted_date && !app.submittedDate) return null;
    const submitted = new Date(app.submitted_date || app.submittedDate);
    const now = new Date();
    return Math.floor((now - submitted) / 86400000);
}

async function getAgedApplications(minDays = 90) {
    try {
        const apps = await store.getAll('applications');
        return apps
            .filter(a => ['submitted', 'in_review', 'pending_info'].includes(a.status))
            .filter(a => {
                const age = getApplicationAge(a);
                return age !== null && age >= minDays;
            })
            .sort((a, b) =>
                (a.submitted_date || a.submittedDate || '').localeCompare(b.submitted_date || b.submittedDate || '')
            );
    } catch {
        return [];
    }
}

// ── Escalation Detection ──

async function getEscalationCandidates() {
    try {
        // Fetch apps and all followups in parallel (avoids N+1)
        const [apps, allFollowups] = await Promise.all([
            store.getAll('applications'),
            store.getAll('followups'),
        ]);
        const active = apps.filter(a => ['submitted', 'in_review', 'pending_info'].includes(a.status));

        // Group followups by application ID in memory
        const followupsByApp = {};
        for (const f of allFollowups) {
            const appId = f.applicationId || f.application_id;
            if (!followupsByApp[appId]) followupsByApp[appId] = [];
            followupsByApp[appId].push(f);
        }

        const candidates = [];

        for (const app of active) {
            const followups = followupsByApp[app.id] || [];
            const completedFollowups = followups.filter(f => f.completed_date || f.completedDate);
            const age = getApplicationAge(app);

            const shouldEscalate =
                (age && age >= FOLLOWUP_RULES.escalation.daysWithoutResponse) ||
                (completedFollowups.length >= FOLLOWUP_RULES.escalation.maxFollowupsBeforeEscalation);

            if (shouldEscalate) {
                candidates.push({
                    application: app,
                    ageDays: age,
                    followupCount: completedFollowups.length,
                    reason: age >= FOLLOWUP_RULES.escalation.daysWithoutResponse
                        ? `${age} days since submission`
                        : `${completedFollowups.length} follow-ups without resolution`,
                });
            }
        }

        return candidates;
    } catch {
        return [];
    }
}

// ── Helpers ──

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDate(date) {
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

// ── Automation Rule Engine ──

/**
 * Event types the automation engine responds to:
 *   application.status_changed  — { appId, oldStatus, newStatus, application }
 *   application.created         — { appId, application }
 *   license.expiring            — { licenseId, license, daysUntilExpiry }
 *   document.uploaded           — { providerId, documentType, documentName }
 *   provider.created            — { providerId, provider }
 */

const AUTOMATION_EVENT_MAP = {
    'application.status_changed': 'app_status_change',
    'application.created':        'app_status_change',   // triggered as new-app variant
    'license.expiring':           'license_expiring',
    'document.uploaded':          'document_uploaded',
    'provider.created':           'new_provider',
};

// Default hardcoded rules — always evaluated regardless of localStorage rules
const DEFAULT_ENGINE_RULES = [
    {
        id: '_engine_submitted_followup',
        event: 'application.status_changed',
        match: (data) => data.newStatus === 'submitted',
        action: 'create_followup',
        describe: 'When app status → submitted: create follow-up in 14 days',
        execute: async (data) => {
            try {
                await store.create('followups', {
                    application_id: data.appId,
                    type: 'status_check',
                    due_date: formatDate(addDays(new Date(), 14)),
                    method: 'phone',
                });
                _logAutomation('_engine_submitted_followup', 'application.status_changed', data);
            } catch (err) { console.warn('[Automation] followup creation failed:', err); }
        },
    },
    {
        id: '_engine_approved_notify',
        event: 'application.status_changed',
        match: (data) => data.newStatus === 'approved',
        action: 'send_notification',
        describe: 'When app status → approved: send notification to provider',
        execute: async (data) => {
            try {
                const app = data.application || await store.getOne('applications', data.appId);
                const provName = app?.providerName || 'Provider';
                const payerName = app?.payerName || 'Payer';
                await store.sendNotification('status_change', {
                    recipientEmail: '',
                    recipientName: provName,
                    subject: `Application Approved — ${payerName}`,
                    body: `Great news! The credentialing application for ${provName} with ${payerName} (${app?.state || ''}) has been approved.\n\nLog in to Credentik to view details.`,
                    providerId: app?.providerId || null,
                    metadata: { appId: data.appId, newStatus: 'approved', payerName, state: app?.state },
                });
                _logAutomation('_engine_approved_notify', 'application.status_changed', data);
            } catch (err) { console.warn('[Automation] approved notification failed:', err); }
        },
    },
    {
        id: '_engine_denied_task',
        event: 'application.status_changed',
        match: (data) => data.newStatus === 'denied',
        action: 'create_task',
        describe: 'When app status → denied: create task "Review denial and resubmit" + send notification',
        execute: async (data) => {
            try {
                await store.create('tasks', {
                    title: 'Review denial and resubmit',
                    description: `Application ${data.appId} was denied. Review the denial reason and prepare a resubmission.`,
                    dueDate: formatDate(addDays(new Date(), 7)),
                    status: 'pending',
                    priority: 'high',
                    applicationId: data.appId,
                });
                // Also send email notification for denied status
                const app = data.application || await store.getOne('applications', data.appId).catch(() => null);
                const provName = app?.providerName || 'Provider';
                const payerName = app?.payerName || 'Payer';
                await store.sendNotification('status_change', {
                    recipientEmail: '',
                    recipientName: provName,
                    subject: `Application Denied — ${payerName}`,
                    body: `The credentialing application for ${provName} with ${payerName} (${app?.state || ''}) has been denied.\n\nA task has been created to review the denial and prepare a resubmission (due in 7 days).\n\nLog in to Credentik to view details and take action.`,
                    providerId: app?.providerId || null,
                    metadata: { appId: data.appId, newStatus: 'denied', payerName, state: app?.state },
                });
                _logAutomation('_engine_denied_task', 'application.status_changed', data);
            } catch (err) { console.warn('[Automation] denied-task creation failed:', err); }
        },
    },
    {
        id: '_engine_provider_onboard',
        event: 'provider.created',
        match: () => true,
        action: 'create_task',
        describe: 'When provider created: create task "Complete provider profile" due in 7 days',
        execute: async (data) => {
            try {
                const prov = data.provider || {};
                const name = [prov.firstName, prov.lastName].filter(Boolean).join(' ') || 'New Provider';
                await store.create('tasks', {
                    title: `Complete provider profile — ${name}`,
                    description: `A new provider (${name}) was added. Complete their profile, upload credentials, and verify information.`,
                    dueDate: formatDate(addDays(new Date(), 7)),
                    status: 'pending',
                    priority: 'medium',
                    providerId: data.providerId,
                });
                _logAutomation('_engine_provider_onboard', 'provider.created', data);
            } catch (err) { console.warn('[Automation] provider-onboard task failed:', err); }
        },
    },
    {
        id: '_engine_docs_complete',
        event: 'document.uploaded',
        match: () => true,  // always check on upload
        action: 'update_status',
        describe: 'When document uploaded: check if all required docs present → auto-advance to submitted',
        execute: async (data) => {
            try {
                const providerId = data.providerId;
                if (!providerId) return;

                // Look up open applications for this provider in gathering_docs status
                const apps = await store.getAll('applications');
                const gatheringApps = apps.filter(
                    a => String(a.providerId) === String(providerId) && a.status === 'gathering_docs'
                );
                if (gatheringApps.length === 0) return;

                // Fetch provider documents
                let docs = [];
                try { docs = await store.getAll('documents', { providerId }); } catch { return; }

                // Required doc types for auto-advance
                const REQUIRED_TYPES = ['license', 'coi', 'cv', 'board_cert'];
                const uploadedTypes = new Set((docs || []).map(d => (d.type || d.docType || '').toLowerCase()));
                const allPresent = REQUIRED_TYPES.every(t => uploadedTypes.has(t));

                if (allPresent) {
                    for (const app of gatheringApps) {
                        try {
                            await store._fetch(
                                `${CONFIG.API_URL}/applications/${app.id}/transition`,
                                { method: 'POST', body: JSON.stringify({ new_status: 'submitted' }) }
                            );
                            _logAutomation('_engine_docs_complete', 'document.uploaded', { ...data, appId: app.id });
                        } catch (err) { console.warn('[Automation] auto-advance failed for app', app.id, err); }
                    }
                }
            } catch (err) { console.warn('[Automation] docs-complete check failed:', err); }
        },
    },
];

/**
 * Process user-defined automation rules from localStorage.
 * These complement the hardcoded DEFAULT_ENGINE_RULES.
 */
async function _processUserRules(event, data) {
    let rules;
    try {
        rules = JSON.parse(localStorage.getItem('credentik_automation_rules') || '[]');
    } catch { rules = []; }
    if (!Array.isArray(rules)) return;

    const triggerKey = AUTOMATION_EVENT_MAP[event];
    if (!triggerKey) return;

    for (const rule of rules) {
        if (!rule.enabled) continue;
        if (rule.trigger !== triggerKey) continue;

        // Check trigger value for status-change rules
        if (triggerKey === 'app_status_change' && rule.triggerValue) {
            if (data.newStatus !== rule.triggerValue) continue;
        }
        // Check trigger value for license-expiring rules (days threshold)
        if (triggerKey === 'license_expiring' && rule.triggerValue) {
            if ((data.daysUntilExpiry || 0) > parseInt(rule.triggerValue)) continue;
        }

        // Check optional conditions
        if (rule.condition && rule.conditionValue) {
            const app = data.application || (data.appId ? await store.getOne('applications', data.appId).catch(() => null) : null);
            if (rule.condition === 'state_is' && app?.state !== rule.conditionValue) continue;
            if (rule.condition === 'payer_is' && app?.payerName !== rule.conditionValue && app?.payerId !== rule.conditionValue) continue;
            if (rule.condition === 'provider_is' && String(app?.providerId) !== String(rule.conditionValue)) continue;
        }

        // Execute action
        try {
            switch (rule.action) {
                case 'create_task':
                    await store.create('tasks', {
                        title: rule.actionValue || 'Auto-generated task',
                        dueDate: formatDate(addDays(new Date(), 7)),
                        status: 'pending',
                        priority: 'medium',
                        applicationId: data.appId || null,
                        providerId: data.providerId || null,
                    });
                    break;
                case 'create_followup':
                    if (data.appId) {
                        await store.create('followups', {
                            application_id: data.appId,
                            type: 'status_check',
                            due_date: formatDate(addDays(new Date(), parseInt(rule.actionValue) || 14)),
                            method: 'phone',
                        });
                    }
                    break;
                case 'send_email':
                    await store.sendNotification('automation', {
                        recipientEmail: '',
                        recipientName: '',
                        subject: rule.actionValue || 'Credentik Automation Alert',
                        body: `Automation rule "${rule.name}" triggered by ${event}.\n\nDetails: ${JSON.stringify(data, null, 2)}`,
                    });
                    break;
                case 'change_status':
                    if (data.appId && rule.actionValue) {
                        await store._fetch(
                            `${CONFIG.API_URL}/applications/${data.appId}/transition`,
                            { method: 'POST', body: JSON.stringify({ new_status: rule.actionValue }) }
                        );
                    }
                    break;
                case 'show_alert':
                    // In-app toast only (no backend call)
                    break;
            }
            // Increment triggered count
            rule.triggeredCount = (rule.triggeredCount || 0) + 1;
            _logAutomation(rule.id, event, data);
        } catch (err) {
            console.warn(`[Automation] user rule "${rule.name}" failed:`, err);
        }
    }
    // Persist updated triggered counts
    try { localStorage.setItem('credentik_automation_rules', JSON.stringify(rules)); } catch {}
}

function _logAutomation(ruleId, event, data) {
    try {
        const log = JSON.parse(localStorage.getItem('credentik_automation_log') || '[]');
        log.unshift({
            ruleId,
            event,
            timestamp: new Date().toISOString(),
            summary: `Rule ${ruleId} triggered by ${event}`,
        });
        // Keep last 200 entries
        if (log.length > 200) log.length = 200;
        localStorage.setItem('credentik_automation_log', JSON.stringify(log));
    } catch {}
}

/**
 * Main entry point: process all automation rules for a given event.
 * Call this from ui/app.js at each integration point.
 *
 * @param {string} event — one of the event types above
 * @param {object} data  — event-specific payload
 */
async function processAutomationRules(event, data) {
    // 1. Run hardcoded engine rules
    for (const rule of DEFAULT_ENGINE_RULES) {
        if (rule.event === event && rule.match(data)) {
            try { await rule.execute(data); }
            catch (err) { console.warn(`[Automation] engine rule ${rule.id} error:`, err); }
        }
    }

    // 2. Run user-configured rules from localStorage
    await _processUserRules(event, data);
}

/**
 * Get the list of hardcoded automation rules (for display in admin UI).
 */
function getDefaultAutomationRules() {
    return DEFAULT_ENGINE_RULES.map(r => ({
        id: r.id,
        event: r.event,
        action: r.action,
        description: r.describe,
    }));
}

/**
 * Get recent automation execution log.
 */
function getAutomationLog() {
    try { return JSON.parse(localStorage.getItem('credentik_automation_log') || '[]'); }
    catch { return []; }
}

// ── Public API ──

const workflow = {
    VALID_TRANSITIONS,
    FOLLOWUP_RULES,
    canTransition,
    getAvailableTransitions,
    transitionApplication,
    autoScheduleFollowup,
    completeFollowup,
    getOverdueFollowups,
    getUpcomingFollowups,
    getFollowupsForApplication,
    getApplicationAge,
    getAgedApplications,
    getEscalationCandidates,
    processAutomationRules,
    getDefaultAutomationRules,
    getAutomationLog,
    DEFAULT_ENGINE_RULES,
};

export default workflow;
