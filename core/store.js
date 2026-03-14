import CONFIG from './config.js';
import auth from './auth.js';

class Store {
    constructor() {
        this.cache = {};
        this.listeners = {};
        this.loading = {};
    }

    // ── Key converters (snake_case <-> camelCase) ──

    _snakeToCamel(obj) {
        if (Array.isArray(obj)) return obj.map(item => this._snakeToCamel(item));
        if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
            return Object.keys(obj).reduce((result, key) => {
                const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
                result[camelKey] = this._snakeToCamel(obj[key]);
                return result;
            }, {});
        }
        return obj;
    }

    _camelToSnake(obj) {
        if (Array.isArray(obj)) return obj.map(item => this._camelToSnake(item));
        if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
            return Object.keys(obj).reduce((result, key) => {
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                result[snakeKey] = this._camelToSnake(obj[key]);
                return result;
            }, {});
        }
        return obj;
    }

    // ── HTTP helpers ──

    async _fetch(url, options = {}) {
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...options.headers,
        };

        const token = auth.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Convert request body from camelCase to snake_case
        if (options.body && typeof options.body === 'string') {
            try {
                const parsed = JSON.parse(options.body);
                options = { ...options, body: JSON.stringify(this._camelToSnake(parsed)) };
            } catch (e) { /* not JSON, leave as-is */ }
        }

        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            auth._clearSession();
            window.location.reload();
            throw new Error('Session expired');
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || error.error || `HTTP ${response.status}`);
        }

        // Convert response from snake_case to camelCase
        const json = await response.json();
        return this._snakeToCamel(json);
    }

    _url(collection) {
        const path = CONFIG.COLLECTIONS[collection];
        if (!path) throw new Error(`Unknown collection: ${collection}`);
        return `${CONFIG.API_URL}${path}`;
    }

    _refUrl(key) {
        const path = CONFIG.REFERENCE[key];
        if (!path) throw new Error(`Unknown reference: ${key}`);
        return `${CONFIG.API_URL}${path}`;
    }

    // ── Cache ──

    _cacheKey(collection) {
        return `${CONFIG.CACHE_PREFIX}${collection}`;
    }

    _getCache(collection) {
        const key = this._cacheKey(collection);
        const cached = this.cache[key];
        if (cached && Date.now() - cached.ts < CONFIG.CACHE_TTL) {
            return cached.data;
        }
        // Try localStorage
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Date.now() - parsed.ts < CONFIG.CACHE_TTL) {
                    this.cache[key] = parsed;
                    return parsed.data;
                }
            }
        } catch (e) {}
        return null;
    }

    _setCache(collection, data) {
        const key = this._cacheKey(collection);
        const entry = { data, ts: Date.now() };
        this.cache[key] = entry;
        try {
            localStorage.setItem(key, JSON.stringify(entry));
        } catch (e) {
            // localStorage full — clear old entries
            this._clearOldCache();
        }
    }

    _invalidateCache(collection) {
        const key = this._cacheKey(collection);
        delete this.cache[key];
        localStorage.removeItem(key);
    }

    _clearOldCache() {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(CONFIG.CACHE_PREFIX));
        keys.sort();
        // Remove oldest half
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
    }

    // ── Event system ──

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    _emit(event, data) {
        (this.listeners[event] || []).forEach(cb => cb(data));
    }

    // ── CRUD Operations ──

    async getAll(collection, params = {}) {
        // Check cache first
        const cacheKey = collection + JSON.stringify(params);
        if (!params.force) {
            const cached = this._getCache(cacheKey);
            if (cached) return cached;
        }

        this.loading[collection] = true;
        this._emit('loading', { collection, loading: true });

        try {
            const query = new URLSearchParams(params).toString();
            const url = this._url(collection) + (query ? `?${query}` : '');
            const result = await this._fetch(url);
            const data = result.data || result;

            // Handle paginated responses
            const items = Array.isArray(data) ? data : (data.data || data);

            this._setCache(cacheKey, items);
            this.loading[collection] = false;
            this._emit('loading', { collection, loading: false });
            return items;
        } catch (e) {
            this.loading[collection] = false;
            this._emit('loading', { collection, loading: false });
            this._emit('error', { collection, error: e.message });
            throw e;
        }
    }

    async getOne(collection, id) {
        const result = await this._fetch(`${this._url(collection)}/${id}`);
        return result.data || result;
    }

    async create(collection, data) {
        const result = await this._fetch(this._url(collection), {
            method: 'POST',
            body: JSON.stringify(data),
        });
        this._invalidateCache(collection);
        this._emit('created', { collection, item: result.data || result });
        return result.data || result;
    }

    async update(collection, id, data) {
        const result = await this._fetch(`${this._url(collection)}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        this._invalidateCache(collection);
        this._emit('updated', { collection, item: result.data || result });
        return result.data || result;
    }

    async remove(collection, id) {
        await this._fetch(`${this._url(collection)}/${id}`, {
            method: 'DELETE',
        });
        this._invalidateCache(collection);
        this._emit('deleted', { collection, id });
    }

    // ── Reference data (cached longer, public endpoints) ──

    async getReference(key) {
        const cacheKey = `ref_${key}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const result = await this._fetch(this._refUrl(key));
        const data = result.data || result;
        this._setCache(cacheKey, data);
        return data;
    }

    // ── Application-specific endpoints ──

    async transitionApplication(id, status, notes = null) {
        const result = await this._fetch(`${CONFIG.API_URL}/applications/${id}/transition`, {
            method: 'POST',
            body: JSON.stringify({ status, notes }),
        });
        this._invalidateCache('applications');
        this._emit('updated', { collection: 'applications', item: result.data || result });
        return result.data || result;
    }

    async getApplicationStats() {
        const result = await this._fetch(`${CONFIG.API_URL}/applications-stats`);
        const raw = result.data || result;
        // Transform to format expected by dashboard
        const byStatus = raw.byStatus || {};
        const inProgressStatuses = ['gathering_docs', 'gatheringDocs', 'submitted', 'in_review', 'inReview', 'pending_info', 'pendingInfo'];
        const inProgress = inProgressStatuses.reduce((sum, s) => sum + (byStatus[s] || 0), 0);
        return {
            ...raw,
            total: raw.total || 0,
            approved: (byStatus.approved || 0) + (byStatus.credentialed || 0),
            inProgress,
            denied: byStatus.denied || 0,
            estMonthlyRevenue: raw.totalApprovedRevenue || 0,
        };
    }

    async completeFollowup(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/followups/${id}/complete`, {
            method: 'POST',
        });
        this._invalidateCache('followups');
        this._emit('updated', { collection: 'followups', item: result.data || result });
        return result.data || result;
    }

    async getOverdueFollowups() {
        const result = await this._fetch(`${CONFIG.API_URL}/followups-overdue`);
        return result.data || result;
    }

    async getUpcomingFollowups() {
        const result = await this._fetch(`${CONFIG.API_URL}/followups-upcoming`);
        return result.data || result;
    }

    async completeTask(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/tasks/${id}/complete`, {
            method: 'POST',
        });
        this._invalidateCache('tasks');
        this._emit('updated', { collection: 'tasks', item: result.data || result });
        return result.data || result;
    }

    // ── Agency management ──

    async getAgency() {
        const result = await this._fetch(`${CONFIG.API_URL}/agency`);
        return result.data || result;
    }

    async updateAgency(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/agency`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    async getAgencyConfig() {
        const result = await this._fetch(`${CONFIG.API_URL}/agency/config`);
        return result.data || result;
    }

    async updateAgencyConfig(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/agency/config`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    async getAgencyUsers() {
        const result = await this._fetch(`${CONFIG.API_URL}/agency/users`);
        return result.data || result;
    }

    async inviteUser(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/agency/users`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    async updateUser(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/agency/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    async deleteUser(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/agency/users/${id}`, {
            method: 'DELETE',
        });
        return result;
    }

    // ── Onboarding tokens ──

    async getOnboardTokens() {
        const result = await this._fetch(`${CONFIG.API_URL}/onboard/tokens`);
        return result.data || result;
    }

    async createOnboardToken(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/onboard/tokens`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    // ── Payers (global + agency plans) ──

    async getPayers(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/payers${query ? '?' + query : ''}`);
        return result.data || result;
    }

    async getPayerPlans(payerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/payers/${payerId}/plans`);
        return result.data || result;
    }

    async createPayerPlan(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/payer-plans`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    // ── Proxy services ──

    async nppesLookup(npi) {
        const result = await this._fetch(`${CONFIG.API_URL}/proxy/nppes/lookup/${npi}`);
        return result.data || result;
    }

    async nppesSearch(params) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/proxy/nppes/search?${query}`);
        return result.data || result;
    }

    async checkEligibility(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/proxy/stedi/eligibility`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    async caqhAction(action, params = {}) {
        const result = await this._fetch(`${CONFIG.API_URL}/proxy/caqh/${action}`, {
            method: 'POST',
            body: JSON.stringify(params),
        });
        return result.data || result;
    }

    // ── Bookings ──

    async getBookings() {
        const result = await this._fetch(`${CONFIG.API_URL}/bookings`);
        return result.data || result;
    }

    async updateBooking(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/bookings/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    // ── Testimonials ──

    async getTestimonials() {
        const result = await this._fetch(`${CONFIG.API_URL}/testimonials`);
        return result.data || result;
    }

    async generateTestimonialLink(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/testimonials/generate-link`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    // ── Office Hours ──

    async getOfficeHours() {
        const result = await this._fetch(`${CONFIG.API_URL}/office-hours`);
        return result.data || result;
    }

    async updateOfficeHours(hours) {
        const result = await this._fetch(`${CONFIG.API_URL}/office-hours`, {
            method: 'PUT',
            body: JSON.stringify({ hours }),
        });
        return result.data || result;
    }

    // ── Eligibility check history ──

    async getEligibilityChecks() {
        const result = await this._fetch(`${CONFIG.API_URL}/eligibility-checks`);
        return result.data || result;
    }

    // ── Activity logs ──

    async getActivityLogs(applicationId = null) {
        const params = applicationId ? `?application_id=${applicationId}` : '';
        const result = await this._fetch(`${CONFIG.API_URL}/activity-logs${params}`);
        return result.data || result;
    }

    async createActivityLog(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/activity-logs`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }
}

const store = new Store();
export default store;
