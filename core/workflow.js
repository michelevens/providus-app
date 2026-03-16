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
};

export default workflow;
