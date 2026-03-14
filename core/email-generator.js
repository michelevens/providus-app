/**
 * Providus — Email Generator
 *
 * Generates email templates for credentialing workflows:
 * - Initial application inquiry
 * - Status follow-up
 * - Document submission
 * - Escalation
 * - Expansion outreach
 */

import store from './store.js';
import CONFIG from './config.js';

// ── Template Registry ──

const TEMPLATES = {
    initial_inquiry: {
        name: 'Initial Credentialing Inquiry',
        subject: 'Provider Credentialing Application — {{orgName}}',
        body: `Dear {{payerName}} Provider Relations,

I am writing to initiate the credentialing process for our practice with {{payerName}}.

Provider Information:
\u2022 Practice: {{orgName}}
\u2022 Provider: {{providerName}}, {{credentials}}
\u2022 NPI (Individual): {{providerNpi}}
\u2022 NPI (Group): {{orgNpi}}
\u2022 Taxonomy: {{taxonomy}}
\u2022 Specialty: {{specialty}}
\u2022 State(s): {{states}}
\u2022 Service Type: {{serviceType}}

We are seeking to credential as {{applicationType}} and would like to begin accepting {{payerName}} patients in {{states}}.

Please provide:
1. The credentialing application or portal link
2. Required documentation checklist
3. Estimated processing timeline
4. Contact information for our assigned credentialing specialist

Our practice information:
{{orgName}}
{{orgAddress}}
Phone: {{orgPhone}}
Email: {{orgEmail}}

Thank you for your time. We look forward to joining the {{payerName}} provider network.

Best regards,
{{providerName}}, {{credentials}}
{{orgName}}`,
    },

    status_followup: {
        name: 'Status Follow-up',
        subject: 'Credentialing Status Follow-up — {{providerName}} / {{applicationRef}}',
        body: `Dear {{payerName}} Provider Relations,

I am following up on our credentialing application submitted on {{submittedDate}}.

Application Details:
\u2022 Provider: {{providerName}}, {{credentials}}
\u2022 NPI: {{providerNpi}}
\u2022 Application/Reference #: {{applicationRef}}
\u2022 State: {{states}}
\u2022 Application Type: {{applicationType}}
\u2022 Date Submitted: {{submittedDate}}

This is follow-up #{{followupNumber}}. Our last contact was on {{lastContactDate}}.

Could you please provide an update on the status of our application? If any additional documentation is needed, please let us know and we will provide it promptly.

Thank you,
{{providerName}}, {{credentials}}
{{orgName}}
{{orgPhone}}`,
    },

    document_submission: {
        name: 'Document Submission',
        subject: 'Requested Documents — {{providerName}} Credentialing / {{applicationRef}}',
        body: `Dear {{payerName}} Provider Relations,

Per your request, please find the following documents attached for our credentialing application:

Application Reference: {{applicationRef}}
Provider: {{providerName}}, {{credentials}}
NPI: {{providerNpi}}

Documents Enclosed:
{{documentList}}

Please confirm receipt of these documents and advise if anything additional is needed.

Thank you,
{{providerName}}, {{credentials}}
{{orgName}}
{{orgPhone}}`,
    },

    escalation: {
        name: 'Escalation Request',
        subject: 'ESCALATION: Credentialing Application Delayed — {{providerName}} / {{applicationRef}}',
        body: `Dear {{payerName}} Provider Relations Supervisor,

I am writing to escalate our credentialing application, which has been pending for {{ageDays}} days without resolution.

Application Details:
\u2022 Provider: {{providerName}}, {{credentials}}
\u2022 NPI: {{providerNpi}}
\u2022 Application/Reference #: {{applicationRef}}
\u2022 State: {{states}}
\u2022 Date Submitted: {{submittedDate}}
\u2022 Days Pending: {{ageDays}}
\u2022 Follow-ups Made: {{followupCount}}

We have made {{followupCount}} follow-up attempts and have not received a definitive update on the status of our application. We are eager to begin serving {{payerName}} members and respectfully request expedited review.

Please advise on:
1. Current status of the application
2. Any outstanding items preventing approval
3. Expected timeline for completion

Thank you for your attention to this matter.

{{providerName}}, {{credentials}}
{{orgName}}
{{orgPhone}}
{{orgEmail}}`,
    },

    expansion_outreach: {
        name: 'Multi-State Expansion Outreach',
        subject: 'Provider Network Participation — {{orgName}} (Multi-State Telehealth)',
        body: `Dear {{payerName}} Provider Relations,

{{orgName}} is a telehealth practice currently licensed in {{totalStates}} states. We are interested in joining the {{payerName}} provider network to serve your members.

About Our Practice:
\u2022 Specialty: {{specialty}}
\u2022 Provider: {{providerName}}, {{credentials}}
\u2022 Service Model: {{serviceType}}
\u2022 Licensed States: {{stateList}}
\u2022 Currently credentialed with: {{existingPayers}}

Services Offered:
{{servicesList}}

We would like to initiate the credentialing process for the following states:
{{targetStates}}

Please provide the application portal or documentation requirements. We are ready to submit all necessary materials promptly.

Best regards,
{{providerName}}, {{credentials}}
{{orgName}}
{{orgAddress}}
Phone: {{orgPhone}}
Email: {{orgEmail}}
Website: {{orgWebsite}}`,
    },
};

// ── Generate Email from Template ──

function generateEmail(templateId, context = {}) {
    const template = TEMPLATES[templateId];
    if (!template) {
        return { success: false, error: `Unknown template: ${templateId}` };
    }

    const vars = buildTemplateVars(context);
    const subject = replaceVars(template.subject, vars);
    const body = replaceVars(template.body, vars);

    return {
        success: true,
        templateName: template.name,
        subject,
        body,
        to: context.recipientEmail || '',
    };
}

// ── Generate Email for Application ──

async function generateEmailForApplication(appId, templateId) {
    let app, provider, org, followups;

    try {
        app = await store.getOne('applications', appId);
    } catch {
        return { success: false, error: 'Application not found' };
    }

    try {
        provider = app.provider_id ? await store.getOne('providers', app.provider_id) : {};
    } catch {
        provider = {};
    }

    try {
        org = app.organization_id ? await store.getOne('organizations', app.organization_id) : {};
    } catch {
        org = {};
    }

    try {
        followups = await store.getAll('followups', { application_id: appId });
        followups = followups
            .filter(f => f.completed_date || f.completedDate)
            .sort((a, b) => (b.completed_date || b.completedDate || '').localeCompare(a.completed_date || a.completedDate || ''));
    } catch {
        followups = [];
    }

    const submittedDate = app.submitted_date || app.submittedDate;
    const age = submittedDate
        ? Math.floor((new Date() - new Date(submittedDate)) / 86400000)
        : 0;

    return generateEmail(templateId, {
        application: app,
        provider,
        organization: org,
        payer: { name: app.payer_name || app.payerName },
        followups,
        ageDays: age,
    });
}

// ── Generate Batch Emails for Expansion ──

async function generateExpansionEmails(targetStates, payerIds = []) {
    let orgs, providers;

    try {
        orgs = await store.getAll('organizations');
    } catch {
        orgs = [];
    }

    try {
        providers = await store.getAll('providers', { active: true });
    } catch {
        providers = [];
    }

    const org = orgs[0];
    const provider = providers[0];

    if (!org || !provider) {
        return { success: false, error: 'No organization or active provider configured' };
    }

    let approvedApps, licenses;
    try {
        approvedApps = await store.getAll('applications', { status: 'approved' });
    } catch {
        approvedApps = [];
    }
    try {
        licenses = await store.getAll('licenses', { status: 'active' });
    } catch {
        licenses = [];
    }

    const existingPayers = [...new Set(approvedApps.map(a => a.payer_name || a.payerName || a.payer_id))].join(', ');
    const licensedStates = licenses.map(l => l.state);

    const emails = [];

    if (payerIds.length > 0) {
        let payerCatalog;
        try {
            payerCatalog = await store.getPayers();
        } catch {
            payerCatalog = [];
        }

        for (const payerId of payerIds) {
            const payer = payerCatalog.find(p => p.id === payerId);
            if (!payer) continue;

            const payerStates = payer.states || [];
            const payerTargetStates = targetStates.filter(s =>
                payerStates.includes(s) || payerStates.includes('ALL')
            );
            if (payerTargetStates.length === 0) continue;

            emails.push(generateEmail('expansion_outreach', {
                payer,
                organization: org,
                provider,
                existingPayers,
                licensedStates,
                targetStates: payerTargetStates,
            }));
        }
    } else {
        // Generate one generic expansion email
        emails.push(generateEmail('expansion_outreach', {
            organization: org,
            provider,
            existingPayers,
            licensedStates,
            targetStates,
        }));
    }

    return { success: true, emails, count: emails.length };
}

// ── Template Variable Resolution ──

function buildTemplateVars(context) {
    const {
        application = {},
        provider = {},
        organization = {},
        payer = {},
        followups = [],
        ageDays = 0,
        existingPayers = '',
        licensedStates = [],
        targetStates = [],
    } = context;

    return {
        orgName: organization.name || '[ORGANIZATION NAME]',
        orgNpi: organization.npi || '[GROUP NPI]',
        orgAddress: formatAddress(organization.address || organization),
        orgPhone: organization.phone || '[PHONE]',
        orgEmail: organization.email || '[EMAIL]',
        orgWebsite: organization.website || '[WEBSITE]',
        providerName: provider.first_name && provider.last_name
            ? `${provider.first_name} ${provider.last_name}`
            : provider.firstName && provider.lastName
                ? `${provider.firstName} ${provider.lastName}`
                : '[PROVIDER NAME]',
        credentials: provider.credentials || '[CREDENTIALS]',
        providerNpi: provider.npi || '[INDIVIDUAL NPI]',
        taxonomy: provider.taxonomy || provider.taxonomy_code || '[TAXONOMY]',
        specialty: provider.specialty || 'Psychiatric Mental Health',
        serviceType: organization.service_type || 'Telehealth',
        servicesList: organization.services_list || '\u2022 [List services here]',
        payerName: payer.name || application.payer_name || application.payerName || '[PAYER NAME]',
        states: application.state
            ? application.state
            : (Array.isArray(targetStates) ? targetStates.join(', ') : targetStates) || '[STATES]',
        applicationType: application.type === 'group' ? 'Group Practice'
            : application.type === 'both' ? 'Individual + Group'
            : 'Individual Provider',
        applicationRef: application.application_ref || application.applicationRef || application.enrollment_id || '[APPLICATION REF]',
        submittedDate: application.submitted_date || application.submittedDate || '[SUBMITTED DATE]',
        ageDays: String(ageDays),
        followupCount: String(followups.length),
        followupNumber: String(followups.length + 1),
        lastContactDate: followups.length > 0
            ? (followups[0].completed_date || followups[0].completedDate)
            : '[LAST CONTACT DATE]',
        documentList: '\u2022 [List documents here]',
        existingPayers: existingPayers || '[LIST EXISTING PAYERS]',
        totalStates: String(licensedStates.length || '[NUMBER]'),
        stateList: licensedStates.length > 0 ? licensedStates.join(', ') : '[LICENSED STATES]',
        targetStates: (Array.isArray(targetStates) ? targetStates : []).join(', ') || '[TARGET STATES]',
    };
}

function replaceVars(text, vars) {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return vars[key] !== undefined ? vars[key] : match;
    });
}

function formatAddress(addr) {
    if (!addr) return '[ADDRESS]';
    if (typeof addr === 'string') return addr;
    return `${addr.street || addr.address_1 || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zip || addr.postal_code || ''}`.trim();
}

// ── Get Available Templates ──

function getTemplateList() {
    return Object.entries(TEMPLATES).map(([id, t]) => ({
        id,
        name: t.name,
        subject: t.subject,
    }));
}

// ── Public API ──

const emailGenerator = {
    TEMPLATES,
    generateEmail,
    generateEmailForApplication,
    generateExpansionEmails,
    getTemplateList,
};

export default emailGenerator;
