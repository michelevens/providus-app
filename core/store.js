import CONFIG from './config.js';
import auth from './auth.js';

class Store {
    constructor() {
        this.cache = {};
        this.listeners = {};
        this.loading = {};
        this.inflight = {}; // In-flight request deduplication
        this.activeAgencyId = null; // SuperAdmin agency override
        // Scope selector: filter all data by org or provider
        this._scope = { type: 'all', orgId: null, providerId: null, orgName: '', providerName: '' };
        // Auto-purge expired cache and check version on startup
        this._checkCacheVersion();
        this._purgeExpiredCache();
    }

    // ── Scope selector ──

    getScope() {
        return { ...this._scope };
    }

    setScope(type, orgId = null, providerId = null, orgName = '', providerName = '') {
        this._scope = { type, orgId, providerId, orgName, providerName };
        this.clearCache(); // Force fresh data on scope change
        this._emit('scope-changed', this._scope);
    }

    clearScope() {
        this.setScope('all');
    }

    /**
     * Client-side scope filter. Call on arrays returned by getAll().
     * Works for any item with providerId, organizationId, or provider.organizationId.
     */
    filterByScope(items) {
        if (!Array.isArray(items) || this._scope.type === 'all') return items;

        if (this._scope.type === 'provider' && this._scope.providerId) {
            const pid = this._scope.providerId;
            return items.filter(item =>
                item.id === pid ||                          // item IS the provider
                item.providerId == pid ||                   // has providerId field
                item.provider?.id == pid                    // nested provider object
            );
        }

        if (this._scope.type === 'organization' && this._scope.orgId) {
            const oid = this._scope.orgId;
            return items.filter(item =>
                item.id === oid ||                          // item IS the org
                item.organizationId == oid ||               // has organizationId field
                item.organization?.id == oid ||             // nested org object
                item.provider?.organizationId == oid        // nested through provider
            );
        }

        return items;
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

        // SuperAdmin agency override
        if (this.activeAgencyId) {
            headers['X-Agency-Id'] = String(this.activeAgencyId);
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
            // Show login screen instead of reload loop
            document.getElementById('app-sidebar')?.classList.add('hidden');
            document.getElementById('login-screen')?.classList.remove('hidden');
            throw new Error('Session expired — please log in again');
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
        const prefix = this._cacheKey(collection);
        const onePrefix = this._cacheKey(`${collection}_one_`);
        // Clear all cache entries for this collection (with or without params)
        Object.keys(this.cache).forEach(k => {
            if (k.startsWith(prefix) || k.startsWith(onePrefix)) delete this.cache[k];
        });
        // Clear from localStorage too
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith(prefix) || k.startsWith(onePrefix)) localStorage.removeItem(k);
        });
        // Invalidate derived caches
        if (collection === 'applications') {
            delete this.cache[this._cacheKey('application_stats')];
            try { localStorage.removeItem(this._cacheKey('application_stats')); } catch {}
        }
        if (collection === 'followups') {
            delete this.cache[this._cacheKey('followups_overdue')];
            delete this.cache[this._cacheKey('followups_upcoming')];
            try {
                localStorage.removeItem(this._cacheKey('followups_overdue'));
                localStorage.removeItem(this._cacheKey('followups_upcoming'));
            } catch {}
        }
    }

    _clearOldCache() {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(CONFIG.CACHE_PREFIX));
        keys.sort();
        // Remove oldest half
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
    }

    clearCache() {
        this.cache = {};
        Object.keys(localStorage)
            .filter(k => k.startsWith(CONFIG.CACHE_PREFIX))
            .forEach(k => localStorage.removeItem(k));
    }

    // Auto-purge expired entries from localStorage on startup
    _purgeExpiredCache() {
        try {
            const now = Date.now();
            Object.keys(localStorage)
                .filter(k => k.startsWith(CONFIG.CACHE_PREFIX))
                .forEach(k => {
                    try {
                        const item = JSON.parse(localStorage.getItem(k));
                        if (!item || !item.ts || now - item.ts > CONFIG.CACHE_TTL) {
                            localStorage.removeItem(k);
                        }
                    } catch { localStorage.removeItem(k); }
                });
        } catch {}
    }

    // Version-based cache bust — clears all cache when app version changes
    _checkCacheVersion() {
        const vKey = CONFIG.CACHE_PREFIX + '_version';
        const currentVersion = CONFIG.APP_VERSION || '0';
        try {
            const storedVersion = localStorage.getItem(vKey);
            if (storedVersion !== currentVersion) {
                this.clearCache();
                localStorage.setItem(vKey, currentVersion);
            }
        } catch {}
    }

    // Request deduplication — share in-flight GET promises
    _dedupFetch(url, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        if (method !== 'GET') return this._fetch(url, options);

        if (this.inflight[url]) return this.inflight[url];

        const promise = this._fetch(url, options).finally(() => {
            delete this.inflight[url];
        });
        this.inflight[url] = promise;
        return promise;
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
            const result = await this._dedupFetch(url);
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
        const cacheKey = `${collection}_one_${id}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const result = await this._dedupFetch(`${this._url(collection)}/${id}`);
        const data = result.data || result;
        this._setCache(cacheKey, data);
        return data;
    }

    async create(collection, data) {
        // Use alternate route for applications (CDN caches 503 on POST /applications)
        const url = collection === 'applications' ? `${CONFIG.API_URL}/app-create` : this._url(collection);
        const result = await this._fetch(url, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        this._invalidateCache(collection);
        const item = result.data || result;
        this._emit('created', { collection, item });
        this._logAudit('create', collection, item.id, null, data);
        return item;
    }

    async update(collection, id, data) {
        // Capture previous state for audit diff
        let previous = null;
        try { previous = await this.getOne(collection, id); } catch {}
        const result = await this._fetch(`${this._url(collection)}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        this._invalidateCache(collection);
        const item = result.data || result;
        this._emit('updated', { collection, item });
        this._logAudit('update', collection, id, previous, data);
        return item;
    }

    async remove(collection, id) {
        // Capture previous state for audit
        let previous = null;
        try { previous = await this.getOne(collection, id); } catch {}
        await this._fetch(`${this._url(collection)}/${id}`, {
            method: 'DELETE',
        });
        this._invalidateCache(collection);
        this._emit('deleted', { collection, id });
        this._logAudit('delete', collection, id, previous, null);
    }

    // ── Audit Trail ──

    _logAudit(action, collection, recordId, previous, current) {
        try {
            const user = auth.getUser();
            const entry = {
                action,
                collection,
                record_id: recordId,
                user_id: user?.id || null,
                user_name: user ? `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim() : 'System',
                user_role: user?.role || null,
                timestamp: new Date().toISOString(),
                changes: action === 'update' ? this._diffFields(previous, current) : null,
                snapshot: action === 'delete' ? previous : (action === 'create' ? current : null),
            };
            // Fire-and-forget — never block the main operation
            this._fetch(`${CONFIG.API_URL}/audit-logs`, {
                method: 'POST',
                body: JSON.stringify(entry),
            }).catch(() => {}); // silently fail if API doesn't support it yet
            // Also store locally for immediate UI access
            this._appendLocalAudit(entry);
        } catch {}
    }

    _diffFields(previous, current) {
        if (!previous || !current) return null;
        const changes = {};
        const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);
        for (const key of allKeys) {
            if (['id', 'createdAt', 'updatedAt', 'created_at', 'updated_at'].includes(key)) continue;
            const prev = previous[key];
            const curr = current[key];
            if (JSON.stringify(prev) !== JSON.stringify(curr)) {
                changes[key] = { from: prev ?? null, to: curr ?? null };
            }
        }
        return Object.keys(changes).length > 0 ? changes : null;
    }

    _appendLocalAudit(entry) {
        try {
            const key = `${CONFIG.CACHE_PREFIX}audit_log`;
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.unshift(entry);
            // Keep last 500 entries locally
            if (existing.length > 500) existing.length = 500;
            localStorage.setItem(key, JSON.stringify(existing));
        } catch {}
    }

    getLocalAuditLog() {
        try {
            const key = `${CONFIG.CACHE_PREFIX}audit_log`;
            return JSON.parse(localStorage.getItem(key) || '[]');
        } catch { return []; }
    }

    async getAuditLog(params = {}) {
        const query = new URLSearchParams(params).toString();
        try {
            const result = await this._fetch(`${CONFIG.API_URL}/audit-logs${query ? '?' + query : ''}`);
            return result.data || result;
        } catch {
            // Fallback to local audit log if API doesn't support it yet
            return this.getLocalAuditLog();
        }
    }

    // ── Reference data (cached longer, public endpoints) ──

    async getReference(key) {
        const cacheKey = `ref_${key}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const result = await this._dedupFetch(this._refUrl(key));
        const data = result.data || result;
        this._setCache(cacheKey, data);
        return data;
    }

    // ── Application-specific endpoints ──

    async transitionApplication(id, status, notes = null) {
        const result = await this._fetch(`${CONFIG.API_URL}/applications/${id}/transition`, {
            method: 'POST',
            body: JSON.stringify({ new_status: status, notes }),
        });
        this._invalidateCache('applications');
        this._emit('updated', { collection: 'applications', item: result.data || result });
        return result.data || result;
    }

    async getApplicationStats() {
        const cacheKey = 'application_stats';
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const result = await this._dedupFetch(`${CONFIG.API_URL}/applications-stats`);
        const raw = result.data || result;
        // Transform to format expected by dashboard
        const byStatus = raw.byStatus || {};
        const inProgressStatuses = ['gathering_docs', 'gatheringDocs', 'submitted', 'in_review', 'inReview', 'pending_info', 'pendingInfo'];
        const inProgress = inProgressStatuses.reduce((sum, s) => sum + (byStatus[s] || 0), 0);
        const transformed = {
            ...raw,
            total: raw.total || 0,
            approved: (byStatus.approved || 0) + (byStatus.credentialed || 0),
            inProgress,
            denied: byStatus.denied || 0,
            estMonthlyRevenue: raw.totalApprovedRevenue || 0,
        };
        this._setCache(cacheKey, transformed);
        return transformed;
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
        const cacheKey = 'followups_overdue';
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const result = await this._dedupFetch(`${CONFIG.API_URL}/followups-overdue`);
        const data = result.data || result;
        this._setCache(cacheKey, data);
        return data;
    }

    async getUpcomingFollowups() {
        const cacheKey = 'followups_upcoming';
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const result = await this._dedupFetch(`${CONFIG.API_URL}/followups-upcoming`);
        const data = result.data || result;
        this._setCache(cacheKey, data);
        return data;
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

    async resetUserPassword(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/agency/users/${id}/reset-password`, {
            method: 'POST',
        });
        return result.data || result;
    }

    async changeUserEmail(id, email) {
        const result = await this._fetch(`${CONFIG.API_URL}/agency/users/${id}/change-email`, {
            method: 'PUT',
            body: JSON.stringify({ email }),
        });
        return result.data || result;
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

    async createPayer(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/payers`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
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

    // ── SuperAdmin: Agency Management ──

    setActiveAgency(agencyId) {
        this.activeAgencyId = agencyId;
        this.clearCache(); // Clear cached data so next fetch uses new agency scope
    }

    clearActiveAgency() {
        this.activeAgencyId = null;
        this.clearCache();
    }

    async getAdminAgencies() {
        const result = await this._fetch(`${CONFIG.API_URL}/admin/agencies`);
        return result.data || result;
    }

    async getAdminAgency(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/admin/agencies/${id}`);
        return result.data || result;
    }

    async updateAdminAgency(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/admin/agencies/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return result.data || result;
    }

    // ── Exclusion Screening ──
    async getExclusions(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/exclusions${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async getExclusionSummary() {
        const result = await this._fetch(`${CONFIG.API_URL}/exclusions/summary`);
        return result.data || result;
    }
    async screenProvider(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/exclusions/screen/${providerId}`, { method: 'POST' });
        return result.data || result;
    }
    async screenAllProviders() {
        const result = await this._fetch(`${CONFIG.API_URL}/exclusions/screen-all`, { method: 'POST' });
        return result.data || result;
    }

    // ── Facilities ──
    async getFacilities(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/facilities${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async createFacility(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/facilities`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async updateFacility(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/facilities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        return result.data || result;
    }
    async deleteFacility(id) {
        return this._fetch(`${CONFIG.API_URL}/facilities/${id}`, { method: 'DELETE' });
    }
    async createFacilityFromNpi(npi) {
        const result = await this._fetch(`${CONFIG.API_URL}/facilities/from-npi`, { method: 'POST', body: JSON.stringify({ npi }) });
        return result.data || result;
    }

    // ── Billing & Invoicing ──
    async getBillingStats() {
        const result = await this._fetch(`${CONFIG.API_URL}/billing/stats`);
        return result.data || result;
    }
    async getServices() {
        const result = await this._fetch(`${CONFIG.API_URL}/billing/services`);
        return result.data || result;
    }
    async createService(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing/services`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async getInvoices(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/invoices${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async createInvoice(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/invoices`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async updateInvoice(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        return result.data || result;
    }
    async deleteInvoice(id) {
        return this._fetch(`${CONFIG.API_URL}/invoices/${id}`, { method: 'DELETE' });
    }
    async addPayment(invoiceId, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async getInvoicePayments(invoiceId) {
        const result = await this._fetch(`${CONFIG.API_URL}/invoices/${invoiceId}/payments`);
        return result.data || result;
    }
    async getInvoice(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/invoices/${id}`);
        return result.data || result;
    }
    async sendInvoice(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/invoices/${id}/send`, { method: 'POST' });
        return result.data || result;
    }
    async updateService(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing/services/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        return result.data || result;
    }
    async deleteService(id) {
        return this._fetch(`${CONFIG.API_URL}/billing/services/${id}`, { method: 'DELETE' });
    }

    // ── Estimates ──
    async getEstimates(params = {}) {
        const p = { ...params, type: 'estimate' };
        const query = new URLSearchParams(p).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/invoices?${query}`);
        return result.data || result;
    }
    async createEstimate(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/invoices`, { method: 'POST', body: JSON.stringify({ ...data, type: 'estimate' }) });
        return result.data || result;
    }
    async updateEstimate(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        return result.data || result;
    }
    async deleteEstimate(id) {
        return this._fetch(`${CONFIG.API_URL}/invoices/${id}`, { method: 'DELETE' });
    }
    async convertEstimateToInvoice(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/invoices/${id}`, { method: 'PUT', body: JSON.stringify({ type: 'invoice' }) });
        return result.data || result;
    }

    // ── Provider Profile (extended) ──
    async getProviderProfile(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/profile`);
        return result.data || result;
    }
    async getProviderMalpractice(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/malpractice`);
        return result.data || result;
    }
    async createProviderMalpractice(providerId, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/malpractice`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async getProviderEducation(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/education`);
        return result.data || result;
    }
    async createProviderEducation(providerId, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/education`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async getProviderBoards(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/boards`);
        return result.data || result;
    }
    async createProviderBoard(providerId, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/boards`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }

    // ── Work History ──
    async getProviderWorkHistory(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/work-history`);
        return result.data || result;
    }
    async createProviderWorkHistory(providerId, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/work-history`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }

    // ── CME ──
    async getProviderCme(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/cme`);
        return result.data || result;
    }
    async createProviderCme(providerId, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/cme`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }

    // ── References ──
    async getProviderReferences(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/references`);
        return result.data || result;
    }
    async createProviderReference(providerId, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/references`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }

    // ── Bulk Import ──
    async previewImport(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/imports/preview`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async executeImport(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/imports/execute`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async getImports() {
        const result = await this._fetch(`${CONFIG.API_URL}/imports`);
        return result.data || result;
    }

    // ── Reports ──
    async getProviderPacket(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/reports/provider/${providerId}`);
        return result.data || result;
    }
    async getComplianceReport() {
        const result = await this._fetch(`${CONFIG.API_URL}/reports/compliance`);
        return result.data || result;
    }
    async exportData(type) {
        const result = await this._fetch(`${CONFIG.API_URL}/reports/export?type=${type}`);
        return result.data || result;
    }

    // ── FAQ ──
    async getFaqs(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/faqs${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async createFaq(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/faqs`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async updateFaq(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/faqs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        return result.data || result;
    }
    async deleteFaq(id) {
        return this._fetch(`${CONFIG.API_URL}/faqs/${id}`, { method: 'DELETE' });
    }

    // ── Document Upload/Download ──
    async uploadProviderDocument(providerId, file, documentType, documentName, expirationDate = null, notes = null) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('document_type', documentType);
        formData.append('document_name', documentName);
        if (expirationDate) formData.append('expiration_date', expirationDate);
        if (notes) formData.append('notes', notes);

        const headers = { 'Accept': 'application/json' };
        const token = auth.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (this.activeAgencyId) headers['X-Agency-Id'] = String(this.activeAgencyId);

        const response = await fetch(`${CONFIG.API_URL}/providers/${providerId}/documents/upload`, {
            method: 'POST', headers, body: formData,
        });
        if (response.status === 401) { auth._clearSession(); document.getElementById('app-sidebar')?.classList.add('hidden'); document.getElementById('login-screen')?.classList.remove('hidden'); throw new Error('Session expired'); }
        if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.message || err.error || `HTTP ${response.status}`); }
        const json = await response.json();
        return this._snakeToCamel(json);
    }

    async getProviderDocuments(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/documents`);
        return result;
    }

    async downloadProviderDocument(providerId, documentId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/documents/${documentId}/download`);
        return result.data || result;
    }

    async deleteProviderDocument(providerId, documentId) {
        return this._fetch(`${CONFIG.API_URL}/providers/${providerId}/documents/${documentId}`, { method: 'DELETE' });
    }

    async downloadProviderPacketPdf(providerId) {
        const headers = { 'Accept': 'application/pdf' };
        const token = auth.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (this.activeAgencyId) headers['X-Agency-Id'] = String(this.activeAgencyId);

        const response = await fetch(`${CONFIG.API_URL}/reports/provider/${providerId}/pdf`, { headers });
        if (response.status === 401) { auth._clearSession(); document.getElementById('app-sidebar')?.classList.add('hidden'); document.getElementById('login-screen')?.classList.remove('hidden'); throw new Error('Session expired'); }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Credentialing_Packet_${providerId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── Licensing Boards ──
    async getLicensingBoards(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/licensing-boards${query ? '?' + query : ''}`);
        return result.data || result;
    }

    // ── License Monitoring ──
    async getLicenseMonitoringSummary() {
        const result = await this._fetch(`${CONFIG.API_URL}/licenses-monitoring/summary`);
        return result.data || result;
    }
    async getExpiringLicenses() {
        const result = await this._fetch(`${CONFIG.API_URL}/licenses-monitoring/expiring`);
        return result.data || result;
    }
    async verifyLicense(licenseId) {
        const result = await this._fetch(`${CONFIG.API_URL}/licenses/${licenseId}/verify`, { method: 'POST' });
        return result.data || result;
    }
    async verifyAllLicenses() {
        const result = await this._fetch(`${CONFIG.API_URL}/licenses-monitoring/verify-all`, { method: 'POST' });
        return result.data || result;
    }
    async getLicenseVerifications(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/licenses-monitoring/verifications${query ? '?' + query : ''}`);
        return result.data || result;
    }

    // ── DEA Registrations ──
    async getDeaRegistrations(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/dea-registrations${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async createDeaRegistration(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/dea-registrations`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async updateDeaRegistration(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/dea-registrations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        return result.data || result;
    }
    async deleteDeaRegistration(id) {
        return this._fetch(`${CONFIG.API_URL}/dea-registrations/${id}`, { method: 'DELETE' });
    }

    // ── AI Features ──
    async aiExtractDocument(documentId) {
        const result = await this._fetch(`${CONFIG.API_URL}/ai/extract-document/${documentId}`, { method: 'POST' });
        return result.data || result;
    }
    async aiDraftEmail(applicationId, type, context = null) {
        const body = { type };
        if (context) body.context = context;
        const result = await this._fetch(`${CONFIG.API_URL}/ai/draft-email/${applicationId}`, { method: 'POST', body: JSON.stringify(body) });
        return result.data || result;
    }
    async aiDetectAnomalies(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/ai/anomalies/${providerId}`);
        return result.data || result;
    }
    async aiPredictTimeline(applicationId) {
        const result = await this._fetch(`${CONFIG.API_URL}/ai/predict-timeline/${applicationId}`);
        return result.data || result;
    }

    // ── Communication Logs ──
    async getCommunicationLogs(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/communication-logs${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async createCommunicationLog(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/communication-logs`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async updateCommunicationLog(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/communication-logs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        return result.data || result;
    }
    async deleteCommunicationLog(id) {
        await this._fetch(`${CONFIG.API_URL}/communication-logs/${id}`, { method: 'DELETE' });
    }

    // ── RCM: Claims, Denials, Payments, Charges, AR ──
    async getRcmClaimStats(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/claims/stats${q ? '?' + q : ''}`)).data || {}; }
    async getRcmClaims(params = {}) { if (!params.per_page) params.per_page = 1000; const q = new URLSearchParams(params).toString(); const r = await this._fetch(`${CONFIG.API_URL}/rcm/claims${q ? '?' + q : ''}`); return r.data?.data || r.data || []; }
    async getRcmClaim(id) { return (await this._fetch(`${CONFIG.API_URL}/rcm/claims/${id}`)).data || {}; }
    async createRcmClaim(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/claims`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updateRcmClaim(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/claims/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async deleteRcmClaim(id) { const r = await this._fetch(`${CONFIG.API_URL}/rcm/claims/${id}`, { method: 'DELETE' }); this.clearCache(); return r; }
    async bulkImportClaims(claims) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/claims/bulk-import`, { method: 'POST', body: JSON.stringify({ claims }) })); return r.data || r; }
    async bulkMatchPayments(payments) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/payments/bulk-match`, { method: 'POST', body: JSON.stringify({ payments }) })); return r.data || r; }

    async getRcmDenialStats() { return (await this._fetch(`${CONFIG.API_URL}/rcm/denials/stats`)).data || {}; }
    async getRcmDenials(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/denials${q ? '?' + q : ''}`)).data || []; }
    async createRcmDenial(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/denials`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updateRcmDenial(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/denials/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async deleteRcmDenial(id) { const r = await this._fetch(`${CONFIG.API_URL}/rcm/denials/${id}`, { method: 'DELETE' }); this.clearCache(); return r; }

    async getRcmPayments(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/payments${q ? '?' + q : ''}`)).data || []; }
    async createRcmPayment(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/payments`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updateRcmPayment(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async deleteRcmPayment(id) { const r = await this._fetch(`${CONFIG.API_URL}/rcm/payments/${id}`, { method: 'DELETE' }); this.clearCache(); return r; }

    async getRcmCharges(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/charges${q ? '?' + q : ''}`)).data || []; }
    async createRcmCharge(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/charges`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updateRcmCharge(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/charges/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async deleteRcmCharge(id) { const r = await this._fetch(`${CONFIG.API_URL}/rcm/charges/${id}`, { method: 'DELETE' }); this.clearCache(); return r; }
    async bulkImportCharges(charges) { const r = await this._fetch(`${CONFIG.API_URL}/rcm/charges/bulk-import`, { method: 'POST', body: JSON.stringify({ charges }) }); this.clearCache(); return r.data || r; }

    async getRcmArAging() { return (await this._fetch(`${CONFIG.API_URL}/rcm/ar-aging`)).data || {}; }

    // ── RCM Phase 2: Advanced Features ──
    // Fee Schedules
    async getFeeSchedules(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/fee-schedules${q ? '?' + q : ''}`)).data || []; }
    async createFeeSchedule(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/fee-schedules`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updateFeeSchedule(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/fee-schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async deleteFeeSchedule(id) { await this._fetch(`${CONFIG.API_URL}/rcm/fee-schedules/${id}`, { method: 'DELETE' }); this.clearCache(); }
    async bulkImportFeeSchedules(schedules) { return (await this._fetch(`${CONFIG.API_URL}/rcm/fee-schedules/bulk-import`, { method: 'POST', body: JSON.stringify({ schedules }) })); }

    // Work Queues
    async getWorkQueues() { return (await this._fetch(`${CONFIG.API_URL}/rcm/work-queues`)).data || {}; }

    // Appeal Templates & Denial Workflow
    async getAppealTemplates() { return (await this._fetch(`${CONFIG.API_URL}/rcm/appeal-templates`)).data || []; }
    async createAppealTemplate(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/appeal-templates`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updateAppealTemplate(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/appeal-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async deleteAppealTemplate(id) { await this._fetch(`${CONFIG.API_URL}/rcm/appeal-templates/${id}`, { method: 'DELETE' }); this.clearCache(); }
    async generateAppealLetter(data) { return (await this._fetch(`${CONFIG.API_URL}/rcm/denials/generate-appeal`, { method: 'POST', body: JSON.stringify(data) })).data || {}; }
    async escalateDenials() { return (await this._fetch(`${CONFIG.API_URL}/rcm/denials/escalate`, { method: 'POST' })).data || {}; }

    // Multi-Claim Payment Allocation
    async batchAllocatePayment(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/payments/batch-allocate`, { method: 'POST', body: JSON.stringify(data) })); this.clearCache(); return r.data || r; }

    // Payer Follow-Up Tracking
    async getFollowups(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/followups${q ? '?' + q : ''}`)).data || []; }
    async createFollowup(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/followups`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updateFollowup(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/followups/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async deleteFollowup(id) { await this._fetch(`${CONFIG.API_URL}/rcm/followups/${id}`, { method: 'DELETE' }); this.clearCache(); }

    // Underpayment Detection
    async detectUnderpayments() { return (await this._fetch(`${CONFIG.API_URL}/rcm/underpayments/detect`, { method: 'POST' })).data || {}; }
    async getUnderpayments(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/underpayments${q ? '?' + q : ''}`)).data || []; }
    async updateUnderpayment(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/underpayments/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }

    // Export
    async exportClaims(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/export/claims${q ? '?' + q : ''}`)).data || []; }
    async exportDenials() { return (await this._fetch(`${CONFIG.API_URL}/rcm/export/denials`)).data || []; }

    // Client Reports
    async generateClientReport(data) { return (await this._fetch(`${CONFIG.API_URL}/rcm/client-reports/generate`, { method: 'POST', body: JSON.stringify(data) })).data || {}; }
    async getClientReports(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/client-reports${q ? '?' + q : ''}`)).data || []; }

    // Patient Statements
    async getPatientStatements(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/patient-statements${q ? '?' + q : ''}`)).data || []; }
    async createPatientStatement(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/patient-statements`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updatePatientStatement(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/patient-statements/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async generatePatientStatements() { return (await this._fetch(`${CONFIG.API_URL}/rcm/patient-statements/generate`, { method: 'POST' })).data || {}; }

    // Eligibility Verification
    async getEligibilityChecks() { return (await this._fetch(`${CONFIG.API_URL}/rcm/eligibility`)).data || []; }
    async checkEligibility(data) { return (await this._fetch(`${CONFIG.API_URL}/rcm/eligibility/check`, { method: 'POST', body: JSON.stringify(data) })).data || {}; }
    async updateEligibilityCheck(id, data) { return (await this._fetch(`${CONFIG.API_URL}/rcm/eligibility/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; }

    // Authorization Tracking
    async getAuthorizations(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/authorizations${q ? '?' + q : ''}`)).data || []; }
    async createAuthorization(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/authorizations`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updateAuthorization(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/authorizations/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async deleteAuthorization(id) { const r = await this._fetch(`${CONFIG.API_URL}/rcm/authorizations/${id}`, { method: 'DELETE' }); this.clearCache(); return r; }

    // ERA/EOB Parsing
    async parseEra(eraData) { return (await this._fetch(`${CONFIG.API_URL}/rcm/era/parse`, { method: 'POST', body: JSON.stringify({ era_data: eraData }) })).data || {}; }
    async parse837(data) { return (await this._fetch(`${CONFIG.API_URL}/rcm/837/parse`, { method: 'POST', body: JSON.stringify({ data }) })).data || {}; }
    async import837(claims, clientId) { const r = await this._fetch(`${CONFIG.API_URL}/rcm/837/import`, { method: 'POST', body: JSON.stringify({ claims, billing_client_id: clientId }) }); return r.data || r; }

    // AI Denial Prevention
    async getDenialRiskAnalysis() { return (await this._fetch(`${CONFIG.API_URL}/rcm/denial-risk`)).data || {}; }
    async preSubmissionCheck(data) { return (await this._fetch(`${CONFIG.API_URL}/rcm/pre-submission-check`, { method: 'POST', body: JSON.stringify(data) })).data || {}; }

    // Payer Intelligence Hub
    async getPayerRules() { return (await this._fetch(`${CONFIG.API_URL}/rcm/payer-rules`)).data || []; }
    async getPayerRule(payerName) { return (await this._fetch(`${CONFIG.API_URL}/rcm/payer-rules/${encodeURIComponent(payerName)}`)).data || {}; }
    async createPayerRule(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/payer-rules`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updatePayerRule(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/payer-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async deletePayerRule(id) { await this._fetch(`${CONFIG.API_URL}/rcm/payer-rules/${id}`, { method: 'DELETE' }); this.clearCache(); }
    async checkPayerRules(data) { return (await this._fetch(`${CONFIG.API_URL}/rcm/payer-rules/check`, { method: 'POST', body: JSON.stringify(data) })).data || {}; }
    async extractPayerPolicy(data) { return (await this._fetch(`${CONFIG.API_URL}/rcm/payer-rules/extract-policy`, { method: 'POST', body: JSON.stringify(data) })).data || {}; }

    // Duplicate Detection
    async detectDuplicates() { return (await this._fetch(`${CONFIG.API_URL}/rcm/duplicates`)).data || {}; }

    // Provider Feedback
    async getProviderFeedback(params = {}) { const q = new URLSearchParams(params).toString(); return (await this._fetch(`${CONFIG.API_URL}/rcm/provider-feedback${q ? '?' + q : ''}`)).data || []; }
    async createProviderFeedback(data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/provider-feedback`, { method: 'POST', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async updateProviderFeedback(id, data) { const r = (await this._fetch(`${CONFIG.API_URL}/rcm/provider-feedback/${id}`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; this.clearCache(); return r; }
    async autoGenerateProviderFeedback() { return (await this._fetch(`${CONFIG.API_URL}/rcm/provider-feedback/auto-generate`, { method: 'POST' })).data || {}; }

    // Real-time Eligibility
    async realTimeEligibility(data) { return (await this._fetch(`${CONFIG.API_URL}/rcm/eligibility/realtime`, { method: 'POST', body: JSON.stringify(data) })).data || {}; }

    // Reconciliation
    async autoReconcile() { return (await this._fetch(`${CONFIG.API_URL}/rcm/reconcile`, { method: 'POST' })).data || {}; }
    async syncChargeStatuses() { return (await this._fetch(`${CONFIG.API_URL}/rcm/sync-charge-statuses`, { method: 'POST' })).data || {}; }
    async getReconciliationReport() { return (await this._fetch(`${CONFIG.API_URL}/rcm/reconciliation-report`)).data || {}; }

    // ── Billing Services Management ──
    // Client billing assignments (agency manages billing for org/provider)
    async getBillingClients(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/billing-clients${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async getBillingClient(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-clients/${id}`);
        return result.data || result;
    }
    async generateClientLedger(clientId) { return (await this._fetch(`${CONFIG.API_URL}/billing-clients/${clientId}/generate-ledger`, { method: 'POST' })).data || {}; }
    async getClientLedger(clientId) { return await this._fetch(`${CONFIG.API_URL}/billing-clients/${clientId}/ledger`); }
    async recordRemittance(ledgerId, data) { return (await this._fetch(`${CONFIG.API_URL}/billing-ledger/${ledgerId}/remittance`, { method: 'PUT', body: JSON.stringify(data) })).data || {}; }
    async createBillingClient(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-clients`, { method: 'POST', body: JSON.stringify(data) });
        this.clearCache();
        return result.data || result;
    }
    async updateBillingClient(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        this.clearCache();
        return result.data || result;
    }
    async deleteBillingClient(id) {
        const r = await this._fetch(`${CONFIG.API_URL}/billing-clients/${id}`, { method: 'DELETE' });
        this.clearCache();
        return r;
    }
    async getBillingClientStats() {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-clients/stats`);
        return result.data || result;
    }

    // Billing tasks (charge entry, claim follow-up, denial mgmt, payment posting)
    async getBillingTasks(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/billing-tasks${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async generateTasks() { return (await this._fetch(`${CONFIG.API_URL}/billing-tasks/generate`, { method: 'POST' })).data || {}; }
    async dismissTask(id) { return (await this._fetch(`${CONFIG.API_URL}/billing-tasks/${id}/dismiss`, { method: 'POST' })).data || {}; }
    async createBillingTask(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-tasks`, { method: 'POST', body: JSON.stringify(data) });
        this.clearCache();
        return result.data || result;
    }
    async updateBillingTask(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        this.clearCache();
        return result.data || result;
    }
    async deleteBillingTask(id) {
        const r = await this._fetch(`${CONFIG.API_URL}/billing-tasks/${id}`, { method: 'DELETE' });
        this.clearCache();
        return r;
    }

    // Billing activity log (what work was done, when, by whom)
    async getBillingActivities(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/billing-activities${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async createBillingActivity(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-activities`, { method: 'POST', body: JSON.stringify(data) });
        this.clearCache();
        return result.data || result;
    }
    async updateBillingActivity(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-activities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        this.clearCache();
        return result.data || result;
    }
    async deleteBillingActivity(id) {
        const r = await this._fetch(`${CONFIG.API_URL}/billing-activities/${id}`, { method: 'DELETE' });
        this.clearCache();
        return r;
    }

    // Billing financial summaries (claims, collections, denials per org/provider)
    async getBillingFinancials(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/billing-financials${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async createBillingFinancial(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-financials`, { method: 'POST', body: JSON.stringify(data) });
        this.clearCache();
        return result.data || result;
    }
    async updateBillingFinancial(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/billing-financials/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        this.clearCache();
        return result.data || result;
    }

    // ── Contracts & Agreements ──
    async getContracts(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/contracts${query ? '?' + query : ''}`);
        return result.data || result;
    }
    async getContract(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/contracts/${id}`);
        return result.data || result;
    }
    async createContract(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/contracts`, { method: 'POST', body: JSON.stringify(data) });
        return result.data || result;
    }
    async updateContract(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/contracts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        return result.data || result;
    }
    async deleteContract(id) {
        return this._fetch(`${CONFIG.API_URL}/contracts/${id}`, { method: 'DELETE' });
    }
    async sendContract(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/contracts/${id}/send`, { method: 'POST' });
        return result.data || result;
    }
    async terminateContract(id, reason = '') {
        const result = await this._fetch(`${CONFIG.API_URL}/contracts/${id}/terminate`, { method: 'POST', body: JSON.stringify({ reason }) });
        return result.data || result;
    }
    async generateInvoiceFromContract(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/contracts/${id}/generate-invoice`, { method: 'POST' });
        return result.data || result;
    }
    async getContractStats() {
        const result = await this._fetch(`${CONFIG.API_URL}/contracts/stats`);
        return result.data || result;
    }
    async getPublicContract(token) {
        const response = await fetch(`${CONFIG.API_URL}/contracts/view/${token}`, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        return json.data || json;
    }
    async acceptPublicContract(token, data) {
        const response = await fetch(`${CONFIG.API_URL}/contracts/view/${token}/accept`, {
            method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.message || `HTTP ${response.status}`); }
        return (await response.json());
    }

    // ── Notifications (Resend) ──

    async sendNotification(type, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/notifications/send`, {
            method: 'POST',
            body: JSON.stringify({ type, ...data }),
        });
        this._invalidateCache('notifications');
        return result.data || result;
    }

    async getNotificationLog(params = {}) {
        const query = new URLSearchParams(params).toString();
        const result = await this._fetch(`${CONFIG.API_URL}/notifications${query ? '?' + query : ''}`);
        return result.data || result;
    }

    async getNotificationPreferences() {
        const cacheKey = 'notification_preferences';
        const cached = this._getCache(cacheKey);
        if (cached) return cached;
        try {
            const result = await this._fetch(`${CONFIG.API_URL}/notifications/preferences`);
            const data = result.data || result;
            this._setCache(cacheKey, data);
            return data;
        } catch {
            // Return defaults if API doesn't support it yet
            return this._getDefaultNotificationPreferences();
        }
    }

    async updateNotificationPreferences(prefs) {
        const result = await this._fetch(`${CONFIG.API_URL}/notifications/preferences`, {
            method: 'PUT',
            body: JSON.stringify(prefs),
        });
        this._invalidateCache('notification_preferences');
        return result.data || result;
    }

    async testNotification(recipientEmail) {
        const result = await this._fetch(`${CONFIG.API_URL}/notifications/test`, {
            method: 'POST',
            body: JSON.stringify({ recipientEmail }),
        });
        return result.data || result;
    }

    _getDefaultNotificationPreferences() {
        return {
            statusChanges: true,
            licenseExpirationDays: 30,
            documentRequests: true,
            weeklySummary: false,
            recipientEmail: '',
        };
    }

    // ── Subscription & Billing (Stripe) ──
    async getSubscriptionStatus() {
        const result = await this._fetch(`${CONFIG.API_URL}/subscription/status`);
        return result.data || result;
    }
    async getSubscriptionPlans() {
        const result = await this._fetch(`${CONFIG.API_URL}/subscription/plans`);
        return result.data || result;
    }
    async createCheckout(planTier) {
        const result = await this._fetch(`${CONFIG.API_URL}/subscription/checkout`, { method: 'POST', body: JSON.stringify({ plan_tier: planTier }) });
        return result.data || result;
    }
    async createPortalSession() {
        const result = await this._fetch(`${CONFIG.API_URL}/subscription/portal`, { method: 'POST' });
        return result.data || result;
    }
    async cancelSubscription() {
        const result = await this._fetch(`${CONFIG.API_URL}/subscription/cancel`, { method: 'POST' });
        return result.data || result;
    }
    async resumeSubscription() {
        const result = await this._fetch(`${CONFIG.API_URL}/subscription/resume`, { method: 'POST' });
        return result.data || result;
    }

    // ── Organization Branding (White-Label) ──

    async getOrgBranding() {
        const cacheKey = 'org_branding';
        const cached = this._getCache(cacheKey);
        if (cached) return cached;
        const result = await this._fetch(`${CONFIG.API_URL}/agency/branding`);
        const data = result.data || result;
        this._setCache(cacheKey, data);
        return data;
    }

    async updateOrgBranding(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/agency/branding`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        this._invalidateCache('org_branding');
        return result.data || result;
    }

    // ── API Keys ──

    async getApiKeys() {
        const result = await this._fetch(`${CONFIG.API_URL}/api-keys`);
        return this._snakeToCamel(result.data || result);
    }

    async createApiKey(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/api-keys`, {
            method: 'POST',
            body: JSON.stringify(this._camelToSnake(data)),
        });
        return this._snakeToCamel(result.data || result);
    }

    async revokeApiKey(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/api-keys/${id}`, {
            method: 'DELETE',
        });
        return result.data || result;
    }

    // ── Webhooks (API-backed) ──

    async getWebhooks() {
        const result = await this._fetch(`${CONFIG.API_URL}/webhooks`);
        return this._snakeToCamel(result.data || result);
    }

    async createWebhook(data) {
        const result = await this._fetch(`${CONFIG.API_URL}/webhooks`, {
            method: 'POST',
            body: JSON.stringify(this._camelToSnake(data)),
        });
        return this._snakeToCamel(result.data || result);
    }

    async updateWebhook(id, data) {
        const result = await this._fetch(`${CONFIG.API_URL}/webhooks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(this._camelToSnake(data)),
        });
        return this._snakeToCamel(result.data || result);
    }

    async deleteWebhook(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/webhooks/${id}`, {
            method: 'DELETE',
        });
        return result.data || result;
    }

    async testWebhook(id) {
        const result = await this._fetch(`${CONFIG.API_URL}/webhooks/${id}/test`, {
            method: 'POST',
        });
        return this._snakeToCamel(result.data || result);
    }

    // ── Public Share Links ──
    async generateShareLink(providerId) {
        const result = await this._fetch(`${CONFIG.API_URL}/providers/${providerId}/share`, { method: 'POST' });
        return result.data || result;
    }
    async getPublicShare(token) {
        // Public endpoint — no auth header needed
        const response = await fetch(`${CONFIG.API_URL}/share/${token}`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${response.status}`);
        }
        const json = await response.json();
        return this._snakeToCamel(json.data || json);
    }
}

const store = new Store();
export default store;
