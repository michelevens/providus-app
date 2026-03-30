// Credentik App Configuration
const CONFIG = {
    APP_NAME: 'Credentik',
    APP_VERSION: '3.1.0',

    // API Configuration
    API_URL: 'https://api.credentik.com/api',

    // Auth
    TOKEN_KEY: 'credentik_token',
    USER_KEY: 'credentik_user',

    // Cache
    CACHE_PREFIX: 'credentik_',
    CACHE_TTL: 60 * 60 * 1000, // 60 minutes
    CACHE_TTL_STATS: 10 * 60 * 1000, // 10 minutes for stats/aggregates

    // Collections that map to API endpoints
    COLLECTIONS: {
        organizations: '/organizations',
        providers: '/providers',
        licenses: '/licenses',
        applications: '/applications',
        followups: '/followups',
        activity_logs: '/activity-logs',
        tasks: '/tasks',
        strategies: '/strategies',
        payer_plans: '/payer-plans',
        facilities: '/facilities',
    },

    // Reference data endpoints (public, no auth needed)
    REFERENCE: {
        payers: '/reference/payers',
        states: '/reference/states',
        telehealth_policies: '/reference/telehealth-policies',
        taxonomy_codes: '/reference/taxonomy-codes',
    },

    // Proxy endpoints
    PROXY: {
        nppes_lookup: '/proxy/nppes/lookup',
        nppes_search: '/proxy/nppes/search',
        stedi_eligibility: '/proxy/stedi/eligibility',
        caqh: '/proxy/caqh',
    },

    // Application status colors
    STATUS_COLORS: {
        new: '#6B7280',
        gathering_docs: '#3B82F6',
        submitted: '#8B5CF6',
        in_review: '#F59E0B',
        pending_info: '#EF4444',
        approved: '#10B981',
        credentialed: '#059669',
        denied: '#DC2626',
        on_hold: '#9CA3AF',
        withdrawn: '#6B7280',
    },

    // Branding
    BRAND: {
        primary: '#2563EB',    // Blue
        secondary: '#7C3AED',  // Purple
        accent: '#F59E0B',     // Amber
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6',
    },
};

export default CONFIG;
