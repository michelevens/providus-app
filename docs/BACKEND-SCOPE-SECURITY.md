# Backend Scope Security — Multi-Tenant Data Isolation

## Problem

Credentik is a multi-tenant platform where one agency manages multiple organizations/clients. The frontend now applies `filterByScope()` to prevent cross-org data display, but **the API returns ALL data regardless of the user's scope**. A technically savvy user could bypass frontend filtering via browser console or API calls.

**This document specifies the backend changes needed to enforce data isolation at the database level.**

---

## Architecture

```
User → has role (agency, staff, organization, provider)
     → belongs to Agency (tenant)
     → may be scoped to Organization or Provider

Agency → owns multiple Organizations
Organization → has Providers, Facilities, Patients
Provider → has Licenses, Applications
```

### Scope Types

| Scope | Who | What they see |
|-------|-----|---------------|
| `all` | Agency owner, admin | Everything in the agency |
| `organization` | Org user, scoped staff | Only data linked to their organization_id |
| `provider` | Provider user | Only their own data (provider_id) |

---

## 1. Middleware: `ScopeFilter`

Create a Laravel middleware that injects scope into every query.

### `app/Http/Middleware/ScopeFilter.php`

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class ScopeFilter
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        if (!$user) return $next($request);

        // Agency-level users see everything in their agency
        // The agency_id filter is already applied by the auth system
        
        // Organization-scoped users
        if ($user->ui_role === 'organization' && $user->organization_id) {
            $request->merge(['_scope_type' => 'organization', '_scope_org_id' => $user->organization_id]);
        }
        
        // Provider-scoped users
        elseif ($user->ui_role === 'provider' && $user->provider_id) {
            $request->merge(['_scope_type' => 'provider', '_scope_provider_id' => $user->provider_id]);
        }
        
        // Staff with explicit scope (set via frontend scope dropdown)
        elseif ($request->header('X-Scope-Type')) {
            $request->merge([
                '_scope_type' => $request->header('X-Scope-Type'),
                '_scope_org_id' => $request->header('X-Scope-Org-Id'),
                '_scope_provider_id' => $request->header('X-Scope-Provider-Id'),
            ]);
        }
        
        else {
            $request->merge(['_scope_type' => 'all']);
        }

        return $next($request);
    }
}
```

### Register in `app/Http/Kernel.php`:

```php
protected $middlewareGroups = [
    'api' => [
        // ... existing middleware
        \App\Http\Middleware\ScopeFilter::class,
    ],
];
```

---

## 2. Model Trait: `ScopedByTenant`

Create a reusable trait that all scoped models use.

### `app/Traits/ScopedByTenant.php`

```php
<?php

namespace App\Traits;

use Illuminate\Database\Eloquent\Builder;

trait ScopedByTenant
{
    /**
     * Apply scope filtering based on the current request context.
     * Call this in every controller index/show method.
     */
    public function scopeApplyScope(Builder $query): Builder
    {
        $request = request();
        $scopeType = $request->get('_scope_type', 'all');

        if ($scopeType === 'organization') {
            $orgId = $request->get('_scope_org_id');
            if ($orgId) {
                $query->where(function ($q) use ($orgId) {
                    // Direct organization_id match
                    if (in_array('organization_id', $this->getFillable())) {
                        $q->where('organization_id', $orgId);
                    }
                    // billing_client_id match (RCM tables)
                    if (in_array('billing_client_id', $this->getFillable())) {
                        $q->orWhere('billing_client_id', $orgId);
                    }
                    // provider.organization_id match (through relationship)
                    if (method_exists($this, 'provider')) {
                        $q->orWhereHas('provider', function ($pq) use ($orgId) {
                            $pq->where('organization_id', $orgId);
                        });
                    }
                });
            }
        }

        if ($scopeType === 'provider') {
            $providerId = $request->get('_scope_provider_id');
            if ($providerId) {
                $query->where(function ($q) use ($providerId) {
                    if (in_array('provider_id', $this->getFillable())) {
                        $q->where('provider_id', $providerId);
                    }
                    if (in_array('rendering_provider_id', $this->getFillable())) {
                        $q->orWhere('rendering_provider_id', $providerId);
                    }
                    // If the model IS a provider
                    if ($this->getTable() === 'providers') {
                        $q->orWhere('id', $providerId);
                    }
                });
            }
        }

        return $query;
    }
}
```

---

## 3. Apply to Every Controller

### Pattern — Before (INSECURE):

```php
public function index()
{
    $claims = RcmClaim::where('agency_id', auth()->user()->agency_id)->get();
    return response()->json(['data' => $claims]);
}
```

### Pattern — After (SECURE):

```php
public function index()
{
    $claims = RcmClaim::where('agency_id', auth()->user()->agency_id)
        ->applyScope()
        ->get();
    return response()->json(['data' => $claims]);
}
```

---

## 4. Endpoints That Need Scope Filtering

### Critical (PHI / Financial Data)

| Endpoint | Model | Scope Field(s) |
|----------|-------|----------------|
| `GET /api/rcm/claims` | RcmClaim | `billing_client_id`, `provider_id` |
| `GET /api/rcm/claims/stats` | RcmClaim | Same |
| `GET /api/rcm/claims/{id}` | RcmClaim | Same |
| `GET /api/rcm/denials` | RcmDenial | `billing_client_id`, `provider_id` (via claim) |
| `GET /api/rcm/payments` | RcmPayment | `billing_client_id` |
| `GET /api/rcm/charges` | RcmCharge | `billing_client_id`, `provider_id` |
| `GET /api/rcm/ar-aging` | RcmClaim | `billing_client_id` |
| `GET /api/rcm/patient-statements` | PatientStatement | `billing_client_id` |
| `GET /api/patients` | Patient | `organization_id` |

### High (Credentialing Data)

| Endpoint | Model | Scope Field(s) |
|----------|-------|----------------|
| `GET /api/applications` | Application | `organization_id`, `provider_id` |
| `GET /api/licenses` | License | `provider_id` (→ provider.organization_id) |
| `GET /api/providers` | Provider | `organization_id`, or `id` = provider_id |
| `GET /api/facilities` | Facility | `organization_id` |
| `GET /api/followups` | Followup | Via application → organization_id |
| `GET /api/tasks` | Task | `organization_id`, `provider_id` |

### Medium (Communication / Operational)

| Endpoint | Model | Scope Field(s) |
|----------|-------|----------------|
| `GET /api/communication-logs` | CommunicationLog | `provider_id`, `application_id` (→ org) |
| `GET /api/rcm/billing-clients` | BillingClient | `organization_id` |
| `GET /api/rcm/client-reports` | ClientReport | `billing_client_id` |
| `GET /api/rcm/payer-rules` | PayerRule | Agency-wide (no scope needed) |
| `GET /api/rcm/fee-schedules` | FeeSchedule | Agency-wide (no scope needed) |

### No Scope Needed (Reference Data)

| Endpoint | Reason |
|----------|--------|
| `GET /api/payers` | Global payer catalog |
| `GET /api/reference/*` | States, telehealth policies |
| `GET /api/agency/users` | Agency staff list |
| `GET /api/notifications/*` | User's own notifications |

---

## 5. Frontend Scope Header

The frontend should send scope context with every API request so the backend can use it.

### In `core/store.js` — update `_fetch()`:

```javascript
async _fetch(url, opts = {}) {
    const headers = opts.headers || {};
    headers['Authorization'] = `Bearer ${this._token}`;
    headers['Accept'] = 'application/json';
    headers['Content-Type'] = 'application/json';
    
    // Send scope context
    if (this._scope.type !== 'all') {
        headers['X-Scope-Type'] = this._scope.type;
        if (this._scope.orgId) headers['X-Scope-Org-Id'] = this._scope.orgId;
        if (this._scope.providerId) headers['X-Scope-Provider-Id'] = this._scope.providerId;
    }
    
    // ... rest of fetch
}
```

---

## 6. Database Schema Requirements

Ensure these foreign keys exist on all relevant tables:

```sql
-- RCM tables need billing_client_id or organization_id
ALTER TABLE rcm_claims ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
ALTER TABLE rcm_denials ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
ALTER TABLE rcm_payments ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
ALTER TABLE rcm_charges ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
ALTER TABLE patient_statements ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);

-- Facilities need organization_id
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);

-- Communication logs need scoping
ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
```

---

## 7. Write Operations (Create/Update/Delete)

Write operations must also enforce scope:

```php
// Before creating a claim
public function store(Request $request)
{
    $data = $request->validated();
    
    // Auto-set organization_id from scope
    $scopeType = $request->get('_scope_type');
    if ($scopeType === 'organization') {
        $data['organization_id'] = $request->get('_scope_org_id');
    }
    
    // Prevent creating resources in another org
    if ($scopeType === 'organization' && isset($data['organization_id'])) {
        if ($data['organization_id'] != $request->get('_scope_org_id')) {
            abort(403, 'Cannot create resources in another organization');
        }
    }
    
    $claim = RcmClaim::create($data);
    return response()->json(['data' => $claim]);
}
```

---

## 8. Testing Checklist

After implementing, verify these scenarios:

- [ ] Org user scoped to "EnnHealth" cannot see Clearstone Group facilities
- [ ] Org user scoped to "Clearstone" cannot see EnnHealth claims
- [ ] Provider user only sees their own applications and licenses
- [ ] Agency admin with scope="all" sees everything
- [ ] Staff with scope dropdown set to specific provider only sees that provider's data
- [ ] API calls from browser console with scope headers respect the filter
- [ ] Creating a claim as org user auto-sets the organization_id
- [ ] Cannot update/delete resources belonging to another org

---

## 9. Implementation Priority

1. **Immediate**: Add scope headers to `_fetch()` in store.js (frontend)
2. **Day 1**: Create ScopeFilter middleware and ScopedByTenant trait (backend)
3. **Day 1**: Apply to RCM controllers (claims, denials, payments, charges, statements)
4. **Day 2**: Apply to credentialing controllers (applications, licenses, providers, facilities)
5. **Day 2**: Apply to communication logs and tasks
6. **Day 3**: Add DB migrations for missing organization_id columns
7. **Day 3**: Testing across all user roles
