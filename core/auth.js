import CONFIG from './config.js';

class Auth {
    constructor() {
        this.token = localStorage.getItem(CONFIG.TOKEN_KEY);
        this.user = JSON.parse(localStorage.getItem(CONFIG.USER_KEY) || 'null');
        this.listeners = [];
    }

    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    getToken() {
        return this.token;
    }

    getUser() {
        return this.user;
    }

    getAgency() {
        return this.user?.agency || null;
    }

    getAgencyConfig() {
        return this.user?.agency?.config || null;
    }

    // ── New 4-tier role system ──────────────────────────────
    isSuperAdmin() {
        return this.user?.role === 'superadmin';
    }

    isAgency() {
        return ['superadmin', 'agency'].includes(this.user?.role);
    }

    isOrganization() {
        return ['superadmin', 'agency', 'organization'].includes(this.user?.role);
    }

    isProviderRole() {
        return this.user?.role === 'provider';
    }

    getRole() {
        return this.user?.role || null;
    }

    // ── Backward-compatible aliases ──────────────────────────
    isOwner() {
        return this.isSuperAdmin() || this.user?.role === 'agency';
    }

    isAdmin() {
        return this.isAgency();
    }

    isReadonly() {
        return this.user?.role === 'provider';
    }

    onChange(callback) {
        this.listeners.push(callback);
    }

    _notify() {
        this.listeners.forEach(cb => cb(this.isAuthenticated()));
    }

    async register({ agencyName, email, password, passwordConfirmation, firstName, lastName }) {
        const response = await fetch(`${CONFIG.API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                agency_name: agencyName,
                email,
                password,
                password_confirmation: passwordConfirmation,
                first_name: firstName,
                last_name: lastName,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Registration failed');
        }

        this._setSession(data.token, data.user);
        return data;
    }

    async login(email, password) {
        const response = await fetch(`${CONFIG.API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }

        this._setSession(data.token, data.user);
        return data;
    }

    async logout() {
        try {
            await fetch(`${CONFIG.API_URL}/auth/logout`, {
                method: 'POST',
                headers: this._headers(),
            });
        } catch (e) {
            // Ignore - clear session anyway
        }
        this._clearSession();
    }

    async refreshUser() {
        try {
            const response = await fetch(`${CONFIG.API_URL}/auth/me`, {
                headers: this._headers(),
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this._clearSession();
                    return null;
                }
                throw new Error('Failed to refresh user');
            }

            const data = await response.json();
            this.user = data.user;
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(this.user));
            return this.user;
        } catch (e) {
            console.error('Auth refresh error:', e);
            return null;
        }
    }

    _setSession(token, user) {
        this.token = token;
        this.user = user;
        localStorage.setItem(CONFIG.TOKEN_KEY, token);
        localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
        this._notify();
    }

    _clearSession() {
        this.token = null;
        this.user = null;
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.USER_KEY);
        // Clear cached data
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(CONFIG.CACHE_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
        this._notify();
    }

    _headers() {
        const h = { 'Accept': 'application/json' };
        if (this.token) h['Authorization'] = `Bearer ${this.token}`;
        return h;
    }
}

const auth = new Auth();
export default auth;
