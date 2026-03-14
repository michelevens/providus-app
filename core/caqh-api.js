/**
 * Providus — CAQH ProView API Integration
 *
 * All CAQH API calls are proxied through the Providus backend
 * via store.caqhAction() to keep credentials server-side.
 *
 * CAQH ProView API capabilities:
 *   - Roster API: check/add/remove providers on organization roster
 *   - Provider Status: get credentialing status for a provider
 *   - Provider Data: retrieve full provider profile data
 *   - Attestation: check attestation status and next due date
 */

import store from './store.js';
import CONFIG from './config.js';

// ── Configuration (local settings for CAQH org identity) ──

const CAQH_CONFIG_KEY = CONFIG.CACHE_PREFIX + 'caqh_config';

function getCaqhConfig() {
    try {
        const raw = localStorage.getItem(CAQH_CONFIG_KEY);
        return raw ? JSON.parse(raw) : { orgId: '', environment: 'production' };
    } catch {
        return { orgId: '', environment: 'production' };
    }
}

function saveCaqhConfig(config) {
    localStorage.setItem(CAQH_CONFIG_KEY, JSON.stringify(config));
}

function isCaqhConfigured() {
    const c = getCaqhConfig();
    return !!c.orgId;
}

// ── API Proxy Calls (via Providus backend) ──

async function caqhProxy(action, params = {}) {
    const config = getCaqhConfig();
    const payload = {
        ...params,
        caqhOrgId: config.orgId || undefined,
        environment: config.environment || 'production',
    };

    return store.caqhAction(action, payload);
}

// ── Roster Operations ──

/**
 * Get roster status for a provider by CAQH ID
 */
async function getRosterStatus(caqhProviderId) {
    return caqhProxy('roster_status', { caqhProviderId });
}

/**
 * Add a provider to the organization's CAQH roster
 */
async function addToRoster(providerData) {
    return caqhProxy('roster_add', { provider: providerData });
}

/**
 * Remove a provider from the organization's roster
 */
async function removeFromRoster(caqhProviderId) {
    return caqhProxy('roster_remove', { caqhProviderId });
}

// ── Provider Status ──

/**
 * Get the credentialing/profile status of a provider
 * Returns: provider_status, provider_status_date, provider_practice_state, etc.
 */
async function getProviderStatus(caqhProviderId) {
    return caqhProxy('provider_status', { caqhProviderId });
}

/**
 * Get provider status by NPI (convenience wrapper)
 */
async function getProviderStatusByNPI(npi) {
    return caqhProxy('provider_status_npi', { npi });
}

// ── Attestation ──

/**
 * Get attestation status for a provider
 * Returns: attestation_date, attestation_expiration_date, next_attestation_date
 */
async function getAttestationStatus(caqhProviderId) {
    return caqhProxy('attestation_status', { caqhProviderId });
}

// ── Provider Data (full profile) ──

/**
 * Get full provider profile data from CAQH
 */
async function getProviderProfile(caqhProviderId) {
    return caqhProxy('provider_profile', { caqhProviderId });
}

// ── Batch Status Check ──

/**
 * Check status for all providers in the store that have CAQH IDs
 */
async function batchStatusCheck() {
    let providers;
    try {
        providers = await store.getAll('providers');
    } catch {
        return [];
    }

    const results = [];

    for (const prov of providers) {
        const caqhId = prov.caqh_id || prov.caqhId;
        if (!caqhId) continue;

        try {
            const status = await getProviderStatus(caqhId);
            const attestation = await getAttestationStatus(caqhId);
            results.push({
                providerId: prov.id,
                providerName: `${prov.first_name || prov.firstName} ${prov.last_name || prov.lastName}`,
                caqhId,
                status,
                attestation,
                error: null,
            });
        } catch (err) {
            results.push({
                providerId: prov.id,
                providerName: `${prov.first_name || prov.firstName} ${prov.last_name || prov.lastName}`,
                caqhId,
                status: null,
                attestation: null,
                error: err.message,
            });
        }
    }

    return results;
}

// ── Local CAQH Tracking (localStorage cache) ──

const CAQH_TRACKING_KEY = CONFIG.CACHE_PREFIX + 'caqh_tracking';

function getCaqhTracking() {
    try {
        const raw = localStorage.getItem(CAQH_TRACKING_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveCaqhTracking(data) {
    localStorage.setItem(CAQH_TRACKING_KEY, JSON.stringify(data));
}

/**
 * Update local tracking data from an API status check result
 */
function updateTrackingFromResult(result) {
    const tracking = getCaqhTracking();
    const key = result.caqhId || result.providerId;
    tracking[key] = {
        ...tracking[key],
        providerId: result.providerId,
        providerName: result.providerName,
        caqhId: result.caqhId,
        lastChecked: new Date().toISOString(),
        profileStatus: result.status?.provider_status || tracking[key]?.profileStatus || 'Unknown',
        profileStatusDate: result.status?.provider_status_date || tracking[key]?.profileStatusDate || '',
        rosterStatus: result.status?.roster_status || tracking[key]?.rosterStatus || 'Unknown',
        attestationDate: result.attestation?.attestation_date || tracking[key]?.attestationDate || '',
        attestationExpires: result.attestation?.attestation_expiration_date || tracking[key]?.attestationExpires || '',
        nextAttestation: result.attestation?.next_attestation_date || tracking[key]?.nextAttestation || '',
        error: result.error,
    };
    saveCaqhTracking(tracking);
    return tracking[key];
}

// ── Public API ──

const caqhApi = {
    getCaqhConfig,
    saveCaqhConfig,
    isCaqhConfigured,
    getRosterStatus,
    addToRoster,
    removeFromRoster,
    getProviderStatus,
    getProviderStatusByNPI,
    getAttestationStatus,
    getProviderProfile,
    batchStatusCheck,
    getCaqhTracking,
    saveCaqhTracking,
    updateTrackingFromResult,
};

export default caqhApi;
