// ui/pages/billing.js — Lazy-loaded billing render functions
// Auto-extracted from app.js for code splitting

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay, toHexId,
        showToast, getPayerById, getStateName, navigateTo, appConfirm, appPrompt,
        editButton, deleteButton, helpTip, sortArrow,
        PAYER_CATALOG, STATES } = window._credentik;

// _billingTab lives on window for cross-module access (set by app.js)
if (typeof window._billingTab === 'undefined') window._billingTab = 'invoices';
// Billing state lives on window for cross-module access
if (typeof window._invoiceLineItems === 'undefined') window._invoiceLineItems = [];
if (typeof window._billingServices === 'undefined') window._billingServices = [];

function _fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _renderSubscriptionTab(sub, plans) {
  if (!Array.isArray(plans)) plans = [];
  const currentTier = sub?.planTier || sub?.plan_tier || 'starter';
  const status = sub?.subscriptionStatus || sub?.subscription_status || 'trialing';
  const isSubscribed = sub?.isSubscribed || sub?.is_subscribed || false;
  const isOnTrial = sub?.isOnTrial || sub?.is_on_trial || false;
  const trialEnds = sub?.trialEndsAt || sub?.trial_ends_at || null;
  const subEnds = sub?.subscriptionEndsAt || sub?.subscription_ends_at || null;
  const usage = sub?.usage || {};
  const limits = sub?.limits || {};

  const statusColors = { active: 'var(--green)', trialing: 'var(--brand-600)', past_due: 'var(--orange,#f97316)', canceling: 'var(--gold)', canceled: 'var(--red)', unpaid: 'var(--red)' };
  const statusLabels = { active: 'Active', trialing: 'Trial', past_due: 'Past Due', canceling: 'Canceling', canceled: 'Canceled', unpaid: 'Unpaid' };

  const usageBar = (label, used, limit) => {
    const pct = limit === -1 ? 5 : Math.min((used / limit) * 100, 100);
    const limitLabel = limit === -1 ? 'Unlimited' : limit;
    const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--gold)' : 'var(--green)';
    return `<div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <span>${label}</span><span><strong>${used}</strong> / ${limitLabel}</span>
      </div>
      <div style="background:var(--gray-200);border-radius:4px;height:8px;overflow:hidden;">
        <div style="background:${color};height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s;"></div>
      </div>
    </div>`;
  };

  return `
    <!-- Current Plan Status -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="card">
        <div class="card-header"><h3>Current Plan</h3></div>
        <div class="card-body" style="padding:20px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <span style="font-size:24px;font-weight:700;text-transform:capitalize;">${currentTier}</span>
            <span class="badge" style="background:${statusColors[status] || 'var(--gray-500)'};color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;">${statusLabels[status] || status}</span>
          </div>
          ${isOnTrial && trialEnds ? `<p style="font-size:13px;color:var(--gray-600);margin-bottom:8px;">Trial ends: <strong>${new Date(trialEnds).toLocaleDateString()}</strong></p>` : ''}
          ${status === 'canceling' && subEnds ? `<p style="font-size:13px;color:var(--gold);margin-bottom:8px;">Access until: <strong>${new Date(subEnds).toLocaleDateString()}</strong></p>` : ''}
          <div style="display:flex;gap:8px;margin-top:16px;">
            ${isSubscribed && status !== 'canceling' ? `<button class="btn btn-sm" style="color:var(--red);" onclick="window.app.cancelSub()">Cancel Subscription</button>` : ''}
            ${status === 'canceling' ? `<button class="btn btn-primary btn-sm" onclick="window.app.resumeSub()">Resume Subscription</button>` : ''}
            ${isSubscribed ? `<button class="btn btn-sm" onclick="window.app.openPortal()">Manage Billing</button>` : ''}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Usage</h3></div>
        <div class="card-body" style="padding:20px;">
          ${usageBar('Providers', usage.providers || 0, limits.providers || 5)}
          ${usageBar('Team Members', usage.users || 0, limits.users || 3)}
          ${usageBar('Applications', usage.applications || 0, limits.applications || 50)}
        </div>
      </div>
    </div>

    <!-- Plan Cards -->
    <div class="card">
      <div class="card-header"><h3>Available Plans</h3></div>
      <div class="card-body" style="padding:20px;">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
          ${plans.map(plan => {
            const isCurrent = plan.tier === currentTier;
            const isPopular = plan.popular;
            return `<div style="border:2px solid ${isCurrent ? 'var(--brand-600)' : isPopular ? 'var(--brand-400)' : 'var(--gray-200)'};border-radius:12px;padding:24px;position:relative;${isPopular ? 'box-shadow:0 4px 12px rgba(0,0,0,0.1);' : ''}">
              ${isPopular ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--brand-600);color:#fff;padding:2px 12px;border-radius:10px;font-size:11px;font-weight:600;">Most Popular</div>' : ''}
              <h4 style="margin:0 0 4px 0;font-size:18px;">${escHtml(plan.name)}</h4>
              <div style="margin-bottom:16px;">
                <span style="font-size:32px;font-weight:800;">$${plan.price}</span>
                <span style="font-size:13px;color:var(--gray-500);">/${plan.interval}</span>
              </div>
              <ul style="list-style:none;padding:0;margin:0 0 20px 0;">
                ${(plan.features || []).map(f => `<li style="padding:4px 0;font-size:13px;color:var(--gray-700);display:flex;align-items:center;gap:6px;"><span style="color:var(--green);font-weight:bold;">&#10003;</span> ${escHtml(f)}</li>`).join('')}
              </ul>
              ${isCurrent
                ? `<button class="btn btn-sm" disabled style="width:100%;opacity:0.6;">Current Plan</button>`
                : `<button class="btn btn-primary btn-sm" style="width:100%;" onclick="window.app.selectPlan('${plan.tier}')">
                    ${isSubscribed ? 'Switch Plan' : 'Get Started'}
                  </button>`
              }
            </div>`;
          }).join('')}
          ${plans.length === 0 ? '<p style="grid-column:1/-1;text-align:center;color:var(--gray-500);">Plan information unavailable. Please check your connection.</p>' : ''}
        </div>
      </div>
    </div>`;
}

function _invoiceStatusBadge(status) {
  const map = { draft: 'inactive', sent: 'pending', partial: 'pending', paid: 'approved', overdue: 'denied', cancelled: 'inactive', void: 'inactive' };
  return `<span class="badge badge-${map[status] || 'inactive'}">${escHtml(status || 'draft')}</span>`;
}

function _nextInvoiceNumber(invoices) {
  const nums = invoices.map(i => {
    const n = (i.invoiceNumber || i.invoice_number || '').replace(/[^0-9]/g, '');
    return n ? parseInt(n, 10) : 0;
  });
  const max = nums.length ? Math.max(...nums) : 0;
  return 'INV-' + String(max + 1).padStart(4, '0');
}

function _renderLineItemsEditor() {
  return `
    <div id="line-items-container">
      <div style="display:flex;gap:8px;align-items:center;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;padding:0 0 6px;">
        <div style="flex:3;">Description</div>
        <div style="flex:1;text-align:center;">Qty</div>
        <div style="flex:1;text-align:center;">Rate</div>
        <div style="flex:1;text-align:right;">Subtotal</div>
        <div style="width:32px;"></div>
      </div>
      ${window._invoiceLineItems.map((item, idx) => `
        <div class="line-item-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
          <div style="flex:3;position:relative;">
            <input type="text" class="form-control" style="height:34px;font-size:13px;width:100%;" value="${escAttr(item.description)}" onchange="window.app.updateLineItem(${idx},'description',this.value)" oninput="window.app.filterSvcDropdown(${idx},this.value)" onfocus="window.app.filterSvcDropdown(${idx},this.value)" placeholder="Type to search services...">
            <div id="svc-dd-${idx}" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid var(--gray-200);border-radius:0 0 8px 8px;max-height:150px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
          <input type="number" class="form-control" style="flex:1;height:34px;font-size:13px;text-align:center;" value="${item.qty}" min="1" step="1" onchange="window.app.updateLineItem(${idx},'qty',this.value)">
          <input type="number" class="form-control" style="flex:1;height:34px;font-size:13px;text-align:center;" value="${item.rate}" min="0" step="0.01" onchange="window.app.updateLineItem(${idx},'rate',this.value)">
          <div style="flex:1;text-align:right;font-weight:600;font-size:13px;">${_fmtMoney(item.qty * item.rate)}</div>
          <button class="btn btn-sm" style="width:32px;height:32px;padding:0;color:var(--red);flex-shrink:0;" onclick="window.app.removeLineItem(${idx})" title="Remove">&times;</button>
        </div>
      `).join('')}
      <button class="btn btn-sm" style="margin-top:4px;font-size:12px;" onclick="window.app.addLineItem()">+ Add Line Item</button>
    </div>
    <div style="margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px;display:flex;justify-content:flex-end;">
      <div style="text-align:right;">
        <div style="font-size:13px;color:var(--gray-600);margin-bottom:4px;">Subtotal: <strong>${_fmtMoney(window._invoiceLineItems.reduce((s, i) => s + i.qty * i.rate, 0))}</strong></div>
        <div style="font-size:18px;font-weight:800;color:var(--gray-900);">Total: ${_fmtMoney(window._invoiceLineItems.reduce((s, i) => s + i.qty * i.rate, 0))}</div>
      </div>
    </div>
  `;
}

async function renderBillingPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let stats = { totalRevenue: 0, outstanding: 0, overdue: 0, drafts: 0, collected: 0, estimatesPending: 0 };
  let invoices = [];
  let services = [];
  let estimates = [];
  let subStatus = null;
  let subPlans = [];

  try { stats = await store.getBillingStats(); } catch (e) { console.error('Billing stats error:', e); }
  try { invoices = store.filterByScope(await store.getInvoices()); } catch (e) { console.error('Invoices error:', e); }
  try { services = await store.getServices(); } catch (e) { console.error('Services error:', e); }
  try { estimates = store.filterByScope(await store.getEstimates()); } catch (e) { /* estimates endpoint may not exist yet */ }
  try { subStatus = await store.getSubscriptionStatus(); } catch (e) { console.error('Subscription status error:', e); }
  try { subPlans = await store.getSubscriptionPlans(); } catch (e) { console.error('Subscription plans error:', e); }
  if (!Array.isArray(invoices)) invoices = [];
  if (!Array.isArray(services)) services = [];
  if (!Array.isArray(estimates)) estimates = [];
  window._billingServices = services;

  // Compute aging buckets from invoices
  const today = new Date();
  const aging = { current: 0, days30: 0, days60: 0, days90plus: 0 };
  invoices.filter(i => i.status !== 'paid' && i.status !== 'void' && i.status !== 'cancelled' && i.status !== 'draft').forEach(inv => {
    const due = new Date(inv.dueDate || inv.due_date || inv.createdAt || inv.created_at);
    const daysPast = Math.floor((today - due) / 86400000);
    const amt = (inv.totalAmount || inv.total_amount || inv.amount || 0) - (inv.paidAmount || inv.paid_amount || 0);
    if (daysPast <= 0) aging.current += amt;
    else if (daysPast <= 30) aging.days30 += amt;
    else if (daysPast <= 60) aging.days60 += amt;
    else aging.days90plus += amt;
  });

  // Monthly revenue breakdown (last 6 months)
  const monthlyRev = {};
  for (let m = 5; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthlyRev[key] = 0;
  }
  invoices.forEach(inv => {
    if (inv.status === 'paid' || (inv.paidAmount || inv.paid_amount || 0) > 0) {
      const d = new Date(inv.paidDate || inv.paid_date || inv.updatedAt || inv.updated_at || inv.createdAt || inv.created_at || '');
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (monthlyRev[key] !== undefined) monthlyRev[key] += (inv.paidAmount || inv.paid_amount || inv.totalAmount || inv.total_amount || 0);
    }
  });
  const maxMonthly = Math.max(...Object.values(monthlyRev), 1);

  body.innerHTML = `
    <style>
      .bl2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .bl2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .bl2-stat .bl2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .bl2-stat .bl2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .bl2-stat .bl2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .bl2-stat .bl2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .bl2-card{border-radius:16px;overflow:hidden;}
      .bl2-dot{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;}
      .bl2-table table tr:hover{background:var(--gray-50);}
    </style>
    <!-- Stats Row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:20px;">
      <div class="bl2-stat">
        <div class="bl2-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="bl2-label">Total Revenue</div><div class="bl2-val" style="color:#16a34a;">${_fmtMoney(stats.totalRevenue || stats.total_revenue)}</div>
      </div>
      <div class="bl2-stat">
        <div class="bl2-accent" style="background:linear-gradient(90deg,var(--brand-500),var(--brand-700));"></div>
        <div class="bl2-label">Outstanding</div><div class="bl2-val" style="color:var(--brand-600);">${_fmtMoney(stats.outstanding)}</div>
      </div>
      <div class="bl2-stat">
        <div class="bl2-accent" style="background:linear-gradient(90deg,#ef4444,#f87171);"></div>
        <div class="bl2-label">Overdue</div><div class="bl2-val" style="color:#dc2626;">${_fmtMoney(stats.overdue)}</div>
      </div>
      <div class="bl2-stat">
        <div class="bl2-accent" style="background:linear-gradient(90deg,#22c55e,#86efac);"></div>
        <div class="bl2-label">Collected</div><div class="bl2-val" style="color:#16a34a;">${_fmtMoney(stats.collected || stats.totalPaid || stats.total_paid)}</div>
      </div>
      <div class="bl2-stat">
        <div class="bl2-accent" style="background:linear-gradient(90deg,#6b7280,#9ca3af);"></div>
        <div class="bl2-label">Drafts</div><div class="bl2-val" style="color:var(--gray-500);">${stats.drafts || 0}</div>
      </div>
      <div class="bl2-stat">
        <div class="bl2-accent" style="background:linear-gradient(90deg,var(--brand-400),var(--brand-600));"></div>
        <div class="bl2-label">Estimates</div><div class="bl2-val" style="color:var(--brand-600);">${estimates.length}</div>
      </div>
    </div>

    <!-- Revenue Chart & Aging -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="card bl2-card">
        <div class="card-header"><h3>Monthly Revenue (Last 6 Months)</h3></div>
        <div class="card-body" style="padding:16px;">
          <div style="display:flex;align-items:flex-end;gap:8px;height:140px;">
            ${Object.entries(monthlyRev).map(([label, val]) => `
              <div style="flex:1;text-align:center;">
                <div style="background:var(--brand-600);border-radius:4px 4px 0 0;height:${Math.max(val / maxMonthly * 120, 4)}px;margin-bottom:6px;transition:height 0.3s;" title="${_fmtMoney(val)}"></div>
                <div style="font-size:10px;font-weight:600;color:var(--gray-500);">${label}</div>
                <div style="font-size:10px;color:var(--gray-600);">${_fmtMoney(val)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="card bl2-card">
        <div class="card-header"><h3>Aging Analysis</h3></div>
        <div class="card-body" style="padding:16px;">
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:var(--gray-600);">Current</span><strong style="color:var(--green);">${_fmtMoney(aging.current)}</strong></div>
            <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:var(--gray-600);">1-30 days</span><strong style="color:var(--gold);">${_fmtMoney(aging.days30)}</strong></div>
            <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:var(--gray-600);">31-60 days</span><strong style="color:var(--orange,#f97316);">${_fmtMoney(aging.days60)}</strong></div>
            <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:var(--gray-600);">60+ days</span><strong style="color:var(--red);">${_fmtMoney(aging.days90plus)}</strong></div>
            <div style="border-top:1px solid var(--gray-200);padding-top:8px;display:flex;justify-content:space-between;"><span style="font-size:12px;font-weight:700;">Total AR</span><strong>${_fmtMoney(aging.current + aging.days30 + aging.days60 + aging.days90plus)}</strong></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Billing Tabs -->
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab ${window._billingTab === 'invoices' ? 'active' : ''}" onclick="window.app.billingTab(this,'invoices')">Invoices (${invoices.length})</button>
      <button class="tab ${window._billingTab === 'estimates' ? 'active' : ''}" onclick="window.app.billingTab(this,'estimates')">Estimates (${estimates.length})</button>
      <button class="tab ${window._billingTab === 'services' ? 'active' : ''}" onclick="window.app.billingTab(this,'services')">Services (${services.length})</button>
      <button class="tab ${window._billingTab === 'subscription' ? 'active' : ''}" onclick="window.app.billingTab(this,'subscription')">Subscription</button>
    </div>

    <!-- Invoices Tab -->
    <div id="billing-invoices" class="${window._billingTab !== 'invoices' ? 'hidden' : ''}">
      <div class="card bl2-card bl2-table">
        <div class="card-header">
          <h3>Invoices</h3>
          <div style="display:flex;gap:8px;">
            <select id="invoice-status-filter" class="form-control" style="width:140px;height:34px;font-size:13px;" onchange="window.app.filterInvoices()">
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
            <input type="text" id="invoice-search" placeholder="Search invoices..." class="form-control" style="width:200px;height:34px;font-size:13px;" oninput="window.app.filterInvoices()">
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Invoice #</th><th>Client</th><th>Items</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due Date</th><th>Actions</th></tr>
              </thead>
              <tbody id="invoice-table-body">
                ${invoices.map(inv => {
                  const invStatus = inv.status || 'draft';
                  const client = inv.clientName || inv.client_name || inv.organizationName || '—';
                  const items = inv.items || inv.lineItems || inv.line_items || [];
                  const itemCount = Array.isArray(items) ? items.length : 0;
                  return `
                  <tr class="invoice-row" style="cursor:pointer;" data-status="${invStatus}" data-search="${(inv.invoiceNumber || '').toLowerCase()} ${client.toLowerCase()}" onclick="window.app.viewInvoiceDetail(${inv.id})">
                    <td><strong>${escHtml(inv.invoiceNumber || inv.invoice_number || '#' + inv.id)}</strong></td>
                    <td>${escHtml(client)}</td>
                    <td class="text-sm text-muted">${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
                    <td>${_fmtMoney(inv.totalAmount || inv.total_amount || inv.amount)}</td>
                    <td>${_fmtMoney(inv.paidAmount || inv.paid_amount || 0)}</td>
                    <td>${_invoiceStatusBadge(invStatus)}</td>
                    <td>${inv.dueDate || inv.due_date ? formatDateDisplay(inv.dueDate || inv.due_date) : '—'}</td>
                    <td onclick="event.stopPropagation();">
                      ${invStatus === 'draft' ? `<button class="btn btn-sm" onclick="window.app.sendInvoice(${inv.id})" title="Send">Send</button>` : ''}
                      ${invStatus !== 'paid' && invStatus !== 'void' ? `<button class="btn btn-sm btn-primary" onclick="window.app.openPaymentModal(${inv.id})" title="Payment">Pay</button>` : ''}
                      ${invStatus === 'draft' ? `<button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteInvoice(${inv.id})">Del</button>` : ''}
                    </td>
                  </tr>`;
                }).join('')}
                ${invoices.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No invoices yet. Click "+ Create Invoice" to get started.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Estimates Tab -->
    <div id="billing-estimates" class="${window._billingTab !== 'estimates' ? 'hidden' : ''}">
      <div class="card">
        <div class="card-header">
          <h3>Estimates</h3>
          ${editButton('+ Create Estimate', 'window.app.openEstimateModal()')}
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Estimate #</th><th>Client</th><th>Items</th><th>Amount</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead>
              <tbody>
                ${estimates.map(est => {
                  const estStatus = est.status || 'draft';
                  const items = est.items || est.lineItems || est.line_items || [];
                  return `
                  <tr>
                    <td><strong>${escHtml(est.estimateNumber || est.estimate_number || 'EST-' + est.id)}</strong></td>
                    <td>${escHtml(est.clientName || est.client_name || '—')}</td>
                    <td class="text-sm text-muted">${Array.isArray(items) ? items.length : 0} items</td>
                    <td>${_fmtMoney(est.totalAmount || est.total_amount || est.amount)}</td>
                    <td>${_invoiceStatusBadge(estStatus)}</td>
                    <td>${est.expirationDate || est.expiration_date ? formatDateDisplay(est.expirationDate || est.expiration_date) : '—'}</td>
                    <td>
                      <button class="btn btn-sm" onclick="window.app.editEstimate(${est.id})">Edit</button>
                      ${estStatus !== 'converted' ? `<button class="btn btn-sm btn-primary" onclick="window.app.convertEstimate(${est.id})" title="Convert to Invoice">To Invoice</button>` : ''}
                      <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteEstimate(${est.id})">Del</button>
                    </td>
                  </tr>`;
                }).join('')}
                ${estimates.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-500);">No estimates yet.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Services Tab -->
    <div id="billing-services" class="${window._billingTab !== 'services' ? 'hidden' : ''}">
      <div class="card">
        <div class="card-header">
          <h3>Service Catalog</h3>
          ${editButton('+ Add Service', 'window.app.toggleInlineServiceForm()')}
        </div>

        <!-- Inline Add/Edit Service Form -->
        <div id="inline-service-form" style="display:none;padding:16px 24px;border-bottom:1px solid var(--gray-200);background:var(--gray-50);">
          <input type="hidden" id="svc-edit-id" value="">
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr 2fr auto;gap:10px;align-items:end;">
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Service Name *</label><input type="text" id="svc-name" class="form-control" style="height:34px;font-size:13px;" placeholder="e.g. Initial Evaluation"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Service Code</label><input type="text" id="svc-code" class="form-control" style="height:34px;font-size:13px;" placeholder="e.g. CRED-INIT"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Default Rate</label><input type="number" id="svc-rate" class="form-control" style="height:34px;font-size:13px;" step="0.01" min="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;"><label style="font-size:11px;">Description</label><input type="text" id="svc-desc" class="form-control" style="height:34px;font-size:13px;" placeholder="Optional description"></div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-primary btn-sm" onclick="window.app.saveService()" style="height:34px;white-space:nowrap;">Save</button>
              <button class="btn btn-sm" onclick="window.app.toggleInlineServiceForm(false)" style="height:34px;">Cancel</button>
            </div>
          </div>
        </div>

        <div class="card-body" style="padding:0;">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Service</th><th>Code</th><th>Rate</th><th>Description</th><th>Actions</th></tr></thead>
              <tbody>
                ${services.map(s => `
                  <tr>
                    <td><strong>${escHtml(s.name || s.serviceName || '—')}</strong></td>
                    <td><code>${escHtml(s.code || s.serviceCode || '—')}</code></td>
                    <td>${_fmtMoney(s.rate || s.defaultRate || s.defaultPrice || s.default_price)}</td>
                    <td class="text-sm text-muted">${escHtml(s.description || '—')}</td>
                    <td>
                      <button class="btn btn-sm" onclick="window.app.editService(${s.id})">Edit</button>
                      <button class="btn btn-sm" style="color:var(--red);" onclick="window.app.deleteService(${s.id})">Del</button>
                    </td>
                  </tr>`).join('')}
                ${services.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--gray-500);">No services defined yet. Click "+ Add Service" to get started.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Subscription Tab -->
    <div id="billing-subscription" class="${window._billingTab !== 'subscription' ? 'hidden' : ''}">
      ${_renderSubscriptionTab(subStatus, subPlans)}
    </div>

    <!-- Invoice/Estimate Modal (shared) -->
    <div class="modal-overlay" id="invoice-modal">
      <div class="modal" style="max-width:720px;">
        <div class="modal-header">
          <h3 id="invoice-modal-title">Create Invoice</h3>
          <button class="modal-close" onclick="document.getElementById('invoice-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="inv-edit-id" value="">
          <input type="hidden" id="inv-mode" value="invoice">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;position:relative;">
              <label>Client / Organization Name *</label>
              <input type="text" id="inv-client" class="form-control" autocomplete="off" oninput="window.app.filterOrgDropdown(this.value)" onfocus="window.app.filterOrgDropdown(this.value)">
              <div id="inv-client-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid var(--gray-200);border-radius:0 0 8px 8px;max-height:180px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
            </div>
            <div class="auth-field" style="margin:0;"><label>Client Email</label><input type="email" id="inv-client-email" class="form-control" placeholder="client@example.com"></div>
            <div class="auth-field" style="margin:0;"><label id="inv-date-label">Due Date *</label><input type="date" id="inv-due" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Invoice #</label><input type="text" id="inv-number" class="form-control" placeholder="Auto-generated"></div>
            <div class="auth-field" style="margin:0;"><label>Status</label>
              <select id="inv-status" class="form-control">
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
              </select>
            </div>
          </div>

          <!-- Service Catalog Picker -->
          ${services.length > 0 ? `
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Service Catalog</label>
            <div style="border:1px solid var(--gray-200);border-radius:8px;overflow:hidden;max-height:180px;overflow-y:auto;">
              <table style="width:100%;font-size:13px;margin:0;">
                <thead><tr style="background:var(--gray-50);">
                  <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--gray-500);">Service</th>
                  <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--gray-500);">Code</th>
                  <th style="padding:6px 10px;text-align:right;font-size:11px;font-weight:600;color:var(--gray-500);">Rate</th>
                  <th style="padding:6px 10px;width:60px;"></th>
                </tr></thead>
                <tbody>
                  ${services.map(s => `<tr style="border-top:1px solid var(--gray-100);">
                    <td style="padding:6px 10px;">${escHtml(s.name || s.serviceName || '—')}</td>
                    <td style="padding:6px 10px;"><code style="font-size:12px;">${escHtml(s.code || s.serviceCode || '—')}</code></td>
                    <td style="padding:6px 10px;text-align:right;">${_fmtMoney(s.rate || s.defaultRate || s.defaultPrice || s.default_price)}</td>
                    <td style="padding:4px 10px;text-align:center;"><button class="btn btn-sm btn-primary" style="font-size:11px;padding:2px 10px;" onclick="window.app.addServiceLineItem(${s.id})">+ Add</button></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          ` : ''}

          <!-- Line Items -->
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Line Items</label>
            <div id="line-items-editor">${_renderLineItemsEditor()}</div>
          </div>

          <div class="auth-field" style="margin:0 0 12px;"><label>Notes / Payment Terms</label><textarea id="inv-notes" class="form-control" rows="2" style="resize:vertical;" placeholder="e.g. Payment due within 30 days. Late fees may apply."></textarea></div>
          <div class="auth-field" style="margin:0;"><label>Description</label><textarea id="inv-desc" class="form-control" rows="2" style="resize:vertical;"></textarea></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('invoice-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveInvoice()">Save</button>
        </div>
      </div>
    </div>

    <!-- Payment Modal -->
    <div class="modal-overlay" id="payment-modal">
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <h3>Record Payment</h3>
          <button class="modal-close" onclick="document.getElementById('payment-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-field" style="margin:0 0 12px;"><label>Payment Amount *</label><input type="number" id="pay-amount" class="form-control" step="0.01" min="0"></div>
          <div class="auth-field" style="margin:0 0 12px;"><label>Payment Date *</label><input type="date" id="pay-date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="auth-field" style="margin:0 0 12px;"><label>Payment Method</label>
            <select id="pay-method" class="form-control">
              <option value="check">Check</option>
              <option value="ach">ACH</option>
              <option value="wire">Wire Transfer</option>
              <option value="credit_card">Credit Card</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="auth-field" style="margin:0;"><label>Reference / Notes</label><input type="text" id="pay-ref" class="form-control" placeholder="Check #, transaction ID, etc."></div>
          <input type="hidden" id="pay-invoice-id" value="">
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--gray-200);">
          <button class="btn" onclick="document.getElementById('payment-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.savePayment()">Record Payment</button>
        </div>
      </div>
    </div>

  `;
}

async function renderInvoiceDetail(invoiceId) {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let inv = {};
  let payments = [];
  try { inv = await store.getInvoice(invoiceId); } catch (e) {
    try {
      const all = await store.getInvoices();
      inv = (Array.isArray(all) ? all : []).find(x => x.id == invoiceId) || {};
    } catch {}
  }
  try { payments = await store.getInvoicePayments(invoiceId); } catch {}
  if (!Array.isArray(payments)) payments = [];

  if (!inv || !inv.id) { body.innerHTML = '<div class="empty-state"><h3>Invoice not found</h3></div>'; return; }

  const invNum = inv.invoiceNumber || inv.invoice_number || '#' + inv.id;
  const client = inv.clientName || inv.client_name || '—';
  const status = inv.status || 'draft';
  const items = inv.items || inv.lineItems || inv.line_items || [];
  const total = inv.totalAmount || inv.total_amount || inv.amount || 0;
  const paid = inv.paidAmount || inv.paid_amount || 0;
  const balance = total - paid;
  const notes = inv.notes || inv.paymentTerms || inv.payment_terms || '';
  const desc = inv.description || '';

  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const pageActions = document.getElementById('page-actions');
  if (pageTitle) pageTitle.textContent = 'Invoice ' + invNum;
  if (pageSubtitle) pageSubtitle.textContent = client;
  if (pageActions) pageActions.innerHTML = `
    <button class="btn btn-sm" onclick="window.app.navigateTo('billing')">&larr; Back</button>
    ${status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="window.app.sendInvoice(${inv.id})">Send Invoice</button>` : ''}
    ${status !== 'paid' && status !== 'void' ? `<button class="btn btn-sm btn-gold" onclick="window.app.openPaymentModal(${inv.id})">Record Payment</button>` : ''}
    <button class="btn btn-sm" onclick="window.app.editInvoice(${inv.id})">Edit</button>
    <button class="btn btn-sm no-print" onclick="window.app.printPage()">Print</button>
  `;

  body.innerHTML = `
    <style>
      .inv2-stat{background:var(--surface-card,#fff);border-radius:16px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.18s,box-shadow 0.18s;}
      .inv2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1);}
      .inv2-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand-500),var(--brand-700));}
      .inv2-stat .value{font-size:28px;font-weight:800;line-height:1.1;}
      .inv2-stat .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-top:4px;}
      .inv2-card{border-radius:16px!important;overflow:hidden;}
      .inv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <!-- Invoice Header -->
    <div class="card inv2-card" style="border-top:3px solid var(--brand-600);margin-bottom:20px;">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <div style="font-size:24px;font-weight:800;color:var(--gray-900);">Invoice ${escHtml(invNum)}</div>
            <div style="font-size:15px;color:var(--gray-600);margin-top:4px;">${escHtml(client)}</div>
            ${inv.clientEmail || inv.client_email ? `<div style="font-size:13px;color:var(--gray-500);margin-top:2px;">${escHtml(inv.clientEmail || inv.client_email)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div style="margin-bottom:8px;">${_invoiceStatusBadge(status)}</div>
            <div style="font-size:13px;color:var(--gray-600);">Invoice Date: <strong>${formatDateDisplay(inv.invoiceDate || inv.invoice_date || inv.createdAt || inv.created_at)}</strong></div>
            <div style="font-size:13px;color:var(--gray-600);">Due Date: <strong>${formatDateDisplay(inv.dueDate || inv.due_date)}</strong></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Amount Summary -->
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;">
      <div class="stat-card inv2-stat"><div class="label">Total Amount</div><div class="value">${_fmtMoney(total)}</div></div>
      <div class="stat-card inv2-stat"><div class="label">Paid</div><div class="value" style="color:var(--green);">${_fmtMoney(paid)}</div></div>
      <div class="stat-card inv2-stat"><div class="label">Balance Due</div><div class="value" style="color:${balance > 0 ? 'var(--red)' : 'var(--green)'};">${_fmtMoney(balance)}</div></div>
    </div>

    <!-- Line Items -->
    <div class="card inv2-card" style="margin-bottom:20px;">
      <div class="card-header"><h3>Line Items</h3></div>
      <div class="card-body" style="padding:0;">
        ${Array.isArray(items) && items.length > 0 ? `
          <table>
            <thead><tr><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Subtotal</th></tr></thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${escHtml(item.description || item.name || '—')}</td>
                  <td style="text-align:center;">${item.qty || item.quantity || 1}</td>
                  <td style="text-align:right;">${_fmtMoney(item.rate || item.unitPrice || item.unit_price)}</td>
                  <td style="text-align:right;font-weight:600;">${_fmtMoney((item.qty || item.quantity || 1) * (item.rate || item.unitPrice || item.unit_price || 0))}</td>
                </tr>
              `).join('')}
              <tr style="border-top:2px solid var(--gray-300);font-weight:700;">
                <td colspan="3" style="text-align:right;">Total</td>
                <td style="text-align:right;">${_fmtMoney(total)}</td>
              </tr>
            </tbody>
          </table>
        ` : `<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No line items. Amount: <strong>${_fmtMoney(total)}</strong></div>`}
      </div>
    </div>

    ${desc ? `<div class="card" style="margin-bottom:20px;"><div class="card-header"><h3>Description</h3></div><div class="card-body"><p style="white-space:pre-wrap;font-size:14px;color:var(--gray-700);margin:0;">${escHtml(desc)}</p></div></div>` : ''}
    ${notes ? `<div class="card" style="margin-bottom:20px;"><div class="card-header"><h3>Notes / Payment Terms</h3></div><div class="card-body"><p style="white-space:pre-wrap;font-size:14px;color:var(--gray-700);margin:0;">${escHtml(notes)}</p></div></div>` : ''}

    <!-- Payment History -->
    <div class="card inv2-card">
      <div class="card-header">
        <h3>Payment History (${payments.length})</h3>
        ${status !== 'paid' && status !== 'void' ? `<button class="btn btn-sm btn-gold" onclick="window.app.openPaymentModal(${inv.id})">+ Record Payment</button>` : ''}
      </div>
      <div class="card-body" style="padding:0;">
        ${payments.length > 0 ? `
          <table>
            <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
            <tbody>
              ${payments.map(p => `
                <tr>
                  <td>${formatDateDisplay(p.paymentDate || p.payment_date || p.createdAt || p.created_at)}</td>
                  <td style="font-weight:600;color:var(--green);">${_fmtMoney(p.amount)}</td>
                  <td>${escHtml((p.paymentMethod || p.payment_method || 'check').replace(/_/g, ' '))}</td>
                  <td class="text-sm text-muted">${escHtml(p.reference || p.notes || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div style="padding:1.5rem;text-align:center;color:var(--gray-500);">No payments recorded yet.</div>'}
      </div>
    </div>
  `;
}

// ─── Contracts & Agreements Page ───

if (typeof window._contractLineItems === 'undefined') window._contractLineItems = [{ description: '', qty: 1, rate: 0 }];

function _defaultContractTerms() {
  const a = window._currentUser?.agency?.name || 'Agency';
  return `<h2>SERVICE AGREEMENT TERMS</h2>
<h3>1. Agreement Term</h3>
<p>This Service Agreement Term is twelve (12) months and shall commence on the Effective Date. Upon expiration, if Client has opted into <strong>Automatic Renewal</strong>, the subscription services will automatically renew for a subsequent twelve (12) month period. If Client has opted out of automatic renewal, the services end upon expiration and a new Agreement would be required to continue services.</p>
<h3>2. Add-On Orders</h3>
<p>Client may place orders for additional services at any time during the term. Payment for add-on orders is processed using the payment method on file at the time of order.</p>
<h3>3. Reimbursable Expenses</h3>
<p>The cost of services purchased does not include any expenses incurred by ${a} that are directly related to providing these services. Reimbursable Expenses include, but are not limited to, costs incurred for postage, primary source verification, hospital or health plan credentialing fees, or licensing agency fees. Reimbursable expenses include the actual cost plus <strong>10%</strong>.</p>
<h3>4. Payment Terms</h3>
<p>Payment for services is due <strong>in advance</strong>. Client is required to keep a payment method on file with ${a} to settle all charges. ${a} will submit an invoice for all outstanding account charges. Payment is due upon receipt unless otherwise specified.</p>
<h3>5. Refund Policy</h3>
<p>There are no refunds or returns for services for any reason. Fees are based on professional service time and once staff applies time and effort to a service order, payment is expected for services rendered. If there is a dispute or issue about service, Client may contact ${a} to discuss the issue.</p>
<h3>6. Client Duties</h3>
<p>Client is responsible for supplying ${a} with complete and accurate practitioner and entity information, responding to requests for signature pages or additional documentation throughout the credentialing process. Client is solely responsible for:</p>
<ul>
<li>Ensuring the formation of legal business entities are within all local, state, and federal requirements</li>
<li>Accuracy of all data supplied to ${a}</li>
<li>Attesting that all information supplied for completion of the purchased services are in accordance with all local, state, and federal law and/or government healthcare program guidelines</li>
<li>Negotiating any special rates or contract terms with health plans</li>
</ul>
<h3>7. ${a} Responsibilities</h3>
<p>${a} is responsible for preparing and submitting credentialing applications and requests to participate with payer networks that Client identifies, and to follow up on applications/requests until each is Complete.</p>
<p>Responsibility for enrollment is considered <strong>"Complete"</strong> when the insurance network approves the application and provides an effective date of participation, or closes the application with a denial of participation; or after <strong>four (4) attempts</strong> to obtain required documents from Client with no response.</p>
<h3>8. Outcomes &amp; Disclaimers</h3>
<p>${a} makes <strong>no guarantee or warranty</strong> with respect to: network approval of practitioners, granting of privileges by a healthcare facility, approval of any type of enrollment or credentialing application, effective date set by payors, issuance of a participation contract, approval of any license application, turnaround time of health plan credentialing and/or contracting, reimbursement by a third party payer network for practitioner services, or profitability of Client.</p>
<h3>9. Confidentiality</h3>
<p>Both parties agree to maintain the confidentiality of all information exchanged in connection with this Agreement. Client authorizes ${a} to utilize confidential information about healthcare practitioners associated with Client for any reason necessary related to the services ordered.</p>
<h3>10. Termination</h3>
<p>Either party may terminate this Agreement with <strong>thirty (30) days</strong> written notice. Upon termination, Client remains responsible for payment of all services rendered and expenses incurred through the termination date.</p>
<p><br></p>
<p><em>By accepting this Agreement, Client acknowledges that they have read, understand, and agree to the terms and conditions stated herein.</em></p>`;
}

function _renderContractLineItems() {
  return `<div>
    <div style="display:flex;gap:8px;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;padding:0 0 6px;">
      <div style="flex:3;">Service</div><div style="flex:1;text-align:center;">Qty</div><div style="flex:1;text-align:center;">Rate</div><div style="flex:1;text-align:right;">Total</div><div style="width:32px;"></div>
    </div>
    ${window._contractLineItems.map((item, idx) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
        <div style="flex:3;position:relative;">
          <input type="text" class="form-control" style="height:34px;font-size:13px;width:100%;" value="${escAttr(item.description)}" onchange="window.app.updateContractLine(${idx},'description',this.value)" oninput="window.app.filterContractSvc(${idx},this.value)" onfocus="window.app.filterContractSvc(${idx},this.value)" placeholder="Type to search services...">
          <div id="ctr-svc-dd-${idx}" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid var(--gray-200);border-radius:0 0 8px 8px;max-height:150px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
        </div>
        <input type="number" class="form-control" style="flex:1;height:34px;font-size:13px;text-align:center;" value="${item.qty}" min="1" step="1" onchange="window.app.updateContractLine(${idx},'qty',this.value)">
        <input type="number" class="form-control" style="flex:1;height:34px;font-size:13px;text-align:center;" value="${item.rate}" min="0" step="0.01" onchange="window.app.updateContractLine(${idx},'rate',this.value)">
        <div style="flex:1;text-align:right;font-weight:600;font-size:13px;">${_fmtMoney(item.qty * item.rate)}</div>
        <button class="btn btn-sm" style="width:32px;height:32px;padding:0;color:var(--red);" onclick="window.app.removeContractLine(${idx})">&times;</button>
      </div>
    `).join('')}
    <button class="btn btn-sm" style="margin-top:4px;font-size:12px;" onclick="window.app.addContractLine()">+ Add Service</button>
    <div style="margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px;text-align:right;">
      <div style="font-size:18px;font-weight:800;">Total: ${_fmtMoney(window._contractLineItems.reduce((s, i) => s + i.qty * i.rate, 0))}</div>
    </div>
  </div>`;
}

async function renderContractsPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let stats = { active: 0, draft: 0, sent: 0, expiring_soon: 0, total_value: 0 };
  let contracts = [];
  try { stats = await store.getContractStats(); } catch(e) {}
  try {
    const res = await store.getContracts();
    contracts = Array.isArray(res) ? res : (res.data || []);
  } catch(e) {}

  const statusBadge = s => {
    const map = { draft:'inactive', sent:'pending', viewed:'pending', accepted:'approved', active:'approved', expired:'denied', terminated:'denied' };
    return `<span class="badge badge-${map[s]||'inactive'}">${s}</span>`;
  };

  body.innerHTML = `
    <style>
      .ct2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .ct2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .ct2-stat .ct2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .ct2-stat .ct2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .ct2-stat .ct2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .ct2-card{border-radius:16px;overflow:hidden;}
      .ct2-table table tr:hover{background:var(--gray-50);}
    </style>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-bottom:20px;">
      <div class="ct2-stat">
        <div class="ct2-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="ct2-label">Active</div><div class="ct2-val" style="color:#16a34a;">${stats.active||0}</div>
      </div>
      <div class="ct2-stat">
        <div class="ct2-accent" style="background:linear-gradient(90deg,#6b7280,#9ca3af);"></div>
        <div class="ct2-label">Drafts</div><div class="ct2-val" style="color:var(--gray-500);">${stats.draft||0}</div>
      </div>
      <div class="ct2-stat">
        <div class="ct2-accent" style="background:linear-gradient(90deg,var(--brand-500),var(--brand-700));"></div>
        <div class="ct2-label">Sent</div><div class="ct2-val" style="color:var(--brand-600);">${stats.sent||0}</div>
      </div>
      <div class="ct2-stat">
        <div class="ct2-accent" style="background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div>
        <div class="ct2-label">Expiring Soon</div><div class="ct2-val" style="color:#d97706;">${stats.expiring_soon||stats.expiringSoon||0}</div>
      </div>
      <div class="ct2-stat">
        <div class="ct2-accent" style="background:linear-gradient(90deg,#22c55e,#86efac);"></div>
        <div class="ct2-label">Total Value</div><div class="ct2-val" style="color:#16a34a;">${_fmtMoney(stats.total_value||stats.totalValue)}</div>
      </div>
    </div>

    <div class="card ct2-card ct2-table">
      <div class="card-header"><h3>All Contracts</h3></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Contract #</th><th>Title</th><th>Client</th><th>Status</th><th>Effective</th><th>Expires</th><th>Total</th><th>Actions</th></tr></thead>
            <tbody>
              ${contracts.map(c => {
                const orgName = c.organization?.name || c.clientName || c.client_name || '—';
                const orgId = c.organizationId || c.organization_id;
                const prvId = c.providerId || c.provider_id;
                const hexTag = orgId ? ' <span style="font-family:monospace;font-size:11px;color:var(--brand-600);">#'+toHexId(orgId)+'</span>' : (prvId ? ' <span style="font-family:monospace;font-size:11px;color:var(--brand-600);">#'+toHexId(prvId)+'</span>' : '');
                return `<tr style="cursor:pointer;" onclick="window.app.openContractDetail(${c.id})">
                  <td><strong>${escHtml(c.contractNumber || c.contract_number || '')}</strong></td>
                  <td>${escHtml(c.title || '')}</td>
                  <td>${escHtml(orgName)}${hexTag}</td>
                  <td>${statusBadge(c.status)}</td>
                  <td>${formatDateDisplay(c.effectiveDate || c.effective_date)}</td>
                  <td>${c.expirationDate || c.expiration_date ? formatDateDisplay(c.expirationDate || c.expiration_date) : '—'}</td>
                  <td><strong>${_fmtMoney(c.total)}</strong></td>
                  <td><button class="btn btn-sm" onclick="event.stopPropagation();window.app.openContractDetail(${c.id})">View</button></td>
                </tr>`;
              }).join('')}
              ${contracts.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--gray-500);">No contracts yet. Click "+ New Contract" to create one.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Contract Modal -->
    <div class="modal-overlay" id="contract-modal">
      <div class="modal" style="max-width:760px;">
        <div class="modal-header">
          <h3 id="contract-modal-title">New Contract</h3>
          <button class="modal-close" onclick="document.getElementById('contract-modal').classList.remove('active')">&times;</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="ctr-edit-id" value="">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Contract Title *</label><input type="text" id="ctr-title" class="form-control" placeholder="e.g. Credentialing Services Agreement"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;"><label>Description</label><textarea id="ctr-description" class="form-control" rows="2" placeholder="Brief summary of services being provided..."></textarea></div>
            <div class="auth-field" style="margin:0;position:relative;">
              <label>Organization</label>
              <input type="text" id="ctr-org" class="form-control" autocomplete="off" oninput="window.app.filterContractOrg(this.value)" onfocus="window.app.filterContractOrg(this.value)" placeholder="Search organizations...">
              <input type="hidden" id="ctr-org-id" value="">
              <div id="ctr-org-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid var(--gray-200);border-radius:0 0 8px 8px;max-height:150px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
            </div>
            <div class="auth-field" style="margin:0;"><label>Client Name</label><input type="text" id="ctr-client-name" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Client Email</label><input type="email" id="ctr-client-email" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Client Address</label><input type="text" id="ctr-client-address" class="form-control" placeholder="Street, City, State ZIP"></div>
            <div class="auth-field" style="margin:0;"><label>Effective Date *</label><input type="date" id="ctr-effective" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Expiration Date</label><input type="date" id="ctr-expiration" class="form-control"></div>
            <div class="auth-field" style="margin:0;"><label>Billing Frequency</label>
              <select id="ctr-frequency" class="form-control">
                <option value="one_time">One-Time</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>
            <div class="auth-field" style="margin:0;"><label>Payment Terms</label><input type="text" id="ctr-payment-terms" class="form-control" placeholder="e.g. Due in advance, Net 30"></div>
            <div class="auth-field" style="margin:0;"><label>Tax Rate (%)</label><input type="number" id="ctr-tax-rate" class="form-control" min="0" max="100" step="0.01" value="0" placeholder="0"></div>
            <div class="auth-field" style="margin:0;"><label>Discount ($)</label><input type="number" id="ctr-discount" class="form-control" min="0" step="0.01" value="0" placeholder="0.00"></div>
            <div class="auth-field" style="margin:0;grid-column:1/-1;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" id="ctr-auto-renew"> Auto-renew upon expiration
              </label>
              <div id="ctr-renewal-terms-wrap" style="display:none;margin-top:8px;">
                <input type="text" id="ctr-renewal-terms" class="form-control" placeholder="e.g. Automatically renews for subsequent 12-month periods">
              </div>
            </div>
          </div>
          <div class="auth-field" style="margin:0 0 16px;">
            <label>Terms & Conditions <span style="font-weight:400;color:var(--gray-400);font-size:11px;">(pre-filled with template — customize as needed)</span></label>
            <div id="ctr-terms-editor" style="height:280px;background:#fff;border-radius:0 0 8px 8px;"></div>
            <input type="hidden" id="ctr-terms" value="">
          </div>
          <div class="auth-field" style="margin:0 0 16px;"><label>Notes (internal, not shown to client)</label><textarea id="ctr-notes" class="form-control" rows="2" placeholder="Internal notes about this contract..."></textarea></div>
          <label style="display:block;font-size:12px;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Services & Line Items</label>
          <div id="contract-line-items-editor">${_renderContractLineItems()}</div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('contract-modal').classList.remove('active')">Cancel</button>
          <button class="btn btn-primary" onclick="window.app.saveContract()">Save Contract</button>
        </div>
      </div>
    </div>
  `;
}

async function renderContractDetail(id) {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  let c;
  try { c = await store.getContract(id); } catch(e) { body.innerHTML = '<p>Contract not found.</p>'; return; }

  const items = c.items || [];
  const orgName = c.organization?.name || c.clientName || c.client_name || '—';
  const orgId = c.organizationId || c.organization_id;
  const prvId = c.providerId || c.provider_id;
  const hexTag = orgId ? '#'+toHexId(orgId) : (prvId ? '#'+toHexId(prvId) : '');
  const viewUrl = location.origin + location.pathname + '#contract/' + c.token;
  const statusBadge = s => {
    const map = { draft:'inactive', sent:'pending', viewed:'pending', accepted:'approved', active:'approved', expired:'denied', terminated:'denied' };
    return `<span class="badge badge-${map[s]||'inactive'}">${s}</span>`;
  };

  const freq = (c.billingFrequency || c.billing_frequency || 'one_time').replace(/_/g, ' ');
  const autoRenew = c.autoRenew || c.auto_renew;
  const renewalTerms = c.renewalTerms || c.renewal_terms || '';
  const description = c.description || '';
  const clientAddr = c.clientAddress || c.client_address || '';
  const notes = c.notes || '';
  const taxRate = parseFloat(c.taxRate || c.tax_rate || 0);
  const discountAmt = parseFloat(c.discountAmount || c.discount_amount || 0);
  const subtotalVal = items.reduce((s, i) => s + parseFloat(i.total || 0), 0);
  const taxAmt = parseFloat(c.taxAmount || c.tax_amount || (subtotalVal * taxRate / 100));

  body.innerHTML = `
    <style>
      .ctv2-card{border-radius:16px!important;overflow:hidden;}
      .ctv2-card table tr:hover{background:var(--gray-50,#f9fafb);}
    </style>
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
      <button class="btn btn-sm" onclick="window.app.navigateTo('contracts')">&larr; Back to Contracts</button>
      <div style="display:flex;gap:8px;">
        ${c.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="window.app.sendContract(${c.id})">Send Contract</button>` : ''}
        ${['draft','sent','viewed'].includes(c.status) ? `<button class="btn btn-sm" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;" onclick="window.app.openContractSignModal(${c.id})">Sign Contract</button>` : ''}
        ${['draft','sent','viewed'].includes(c.status) ? `<button class="btn btn-sm" style="background:var(--brand-50);color:var(--brand-700);border:1px solid var(--brand-200);" onclick="window.app.markContractSigned(${c.id})">Mark as Signed</button>` : ''}
        ${['sent','viewed','accepted'].includes(c.status) ? `<button class="btn btn-sm" onclick="window.app.activateContract(${c.id})">Mark Active</button>` : ''}
        ${['active','accepted'].includes(c.status) ? `<button class="btn btn-sm" onclick="window.app.genInvoice(${c.id})">Generate Invoice</button>` : ''}
        ${!['terminated','expired'].includes(c.status) ? `<button class="btn btn-sm" style="color:var(--red);" onclick="window.app.terminateContract(${c.id})">Terminate</button>` : ''}
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${viewUrl}');showToast('Link copied!')">Copy Link</button>
      </div>
    </div>

    <div class="card ctv2-card" style="margin-bottom:20px;">
      <div class="card-body" style="padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
          <div>
            <h2 style="margin:0 0 4px;">${escHtml(c.title)} ${statusBadge(c.status)}</h2>
            <div style="font-size:14px;color:var(--gray-500);">${escHtml(c.contractNumber || c.contract_number)}${autoRenew ? ' <span style="font-size:11px;background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-weight:600;">Auto-Renew</span>' : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:24px;font-weight:800;">${_fmtMoney(c.total)}</div>
            ${freq !== 'one time' ? '<div style="font-size:12px;color:var(--gray-500);text-transform:capitalize;">Recurring '+freq+'</div>' : '<div style="font-size:12px;color:var(--gray-500);">One-time</div>'}
          </div>
        </div>

        ${description ? '<p style="color:var(--gray-600);margin:0 0 16px;font-size:14px;">'+escHtml(description)+'</p>' : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:13px;">
          <div><span class="text-muted">Client:</span> <strong>${escHtml(orgName)}</strong> ${hexTag ? '<span style="font-family:monospace;font-size:11px;color:var(--brand-600);">'+hexTag+'</span>' : ''}</div>
          <div><span class="text-muted">Email:</span> ${escHtml(c.clientEmail || c.client_email || '—')}</div>
          <div><span class="text-muted">Address:</span> ${clientAddr ? escHtml(clientAddr) : '—'}</div>
          <div><span class="text-muted">Effective:</span> <strong>${formatDateDisplay(c.effectiveDate || c.effective_date)}</strong></div>
          <div><span class="text-muted">Expires:</span> ${c.expirationDate || c.expiration_date ? formatDateDisplay(c.expirationDate || c.expiration_date) : 'No expiration'}</div>
          <div><span class="text-muted">Payment:</span> ${escHtml(c.paymentTerms || c.payment_terms || 'Due on receipt')}</div>
          ${autoRenew && renewalTerms ? '<div style="grid-column:1/-1;"><span class="text-muted">Renewal:</span> '+escHtml(renewalTerms)+'</div>' : ''}
        </div>
      </div>
    </div>

    <div class="card ctv2-card" style="margin-bottom:20px;">
      <div class="card-header"><h3>Services & Pricing</h3></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Total</th></tr></thead>
            <tbody>
              ${items.map(i => `<tr><td>${escHtml(i.description)}${i.frequency ? ' <span style="font-size:11px;color:var(--gray-500);">('+i.frequency+')</span>' : ''}</td><td style="text-align:center;">${parseFloat(i.quantity)}</td><td style="text-align:right;">${_fmtMoney(i.unitPrice || i.unit_price)}</td><td style="text-align:right;font-weight:600;">${_fmtMoney(i.total)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end;padding:16px 20px;">
          <div style="width:240px;">
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Subtotal</span><span>${_fmtMoney(c.subtotal || subtotalVal)}</span></div>
            ${taxRate > 0 ? '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Tax ('+taxRate+'%)</span><span>'+_fmtMoney(taxAmt)+'</span></div>' : ''}
            ${discountAmt > 0 ? '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:var(--green);"><span>Discount</span><span>-'+_fmtMoney(discountAmt)+'</span></div>' : ''}
            <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:2px solid var(--gray-800);font-size:16px;font-weight:800;"><span>Total</span><span>${_fmtMoney(c.total)}</span></div>
            ${freq !== 'one time' ? '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:var(--brand-600);"><span>Recurring '+freq+'</span><span>'+_fmtMoney(c.total)+'</span></div>' : ''}
          </div>
        </div>
      </div>
    </div>

    ${c.termsAndConditions || c.terms_and_conditions ? `<div class="card" style="margin-bottom:20px;"><div class="card-header"><h3>Terms & Conditions</h3></div><div class="card-body"><div class="contract-terms-content" style="font-size:13px;line-height:1.6;">${c.termsAndConditions || c.terms_and_conditions}</div></div></div>` : ''}

    ${notes ? `<div class="card" style="margin-bottom:20px;"><div class="card-header"><h3>Internal Notes</h3></div><div class="card-body"><div style="white-space:pre-wrap;font-size:13px;color:var(--gray-600);">${escHtml(notes)}</div></div></div>` : ''}

    <div class="card ctv2-card">
      <div class="card-header"><h3>Activity Timeline</h3></div>
      <div class="card-body" style="padding:20px;">
        <div style="font-size:13px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--gray-400);flex-shrink:0;"></span> Created: <strong>${formatDateDisplay(c.createdAt || c.created_at)}</strong>${c.creator ? ' by '+escHtml((c.creator.first_name||'')+' '+(c.creator.last_name||'')) : ''}</div>
          ${c.sentAt || c.sent_at ? `<div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#2563eb;flex-shrink:0;"></span> Sent to client: <strong>${formatDateDisplay(c.sentAt || c.sent_at)}</strong></div>` : ''}
          ${c.viewedAt || c.viewed_at ? `<div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0;"></span> Viewed by client: <strong>${formatDateDisplay(c.viewedAt || c.viewed_at)}</strong></div>` : ''}
          ${c.acceptedAt || c.accepted_at ? `<div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:#16a34a;flex-shrink:0;"></span> Accepted by <strong>${escHtml(c.acceptedByName || c.accepted_by_name || '')}</strong> (${escHtml(c.acceptedByEmail || c.accepted_by_email || '')}) on <strong>${formatDateDisplay(c.acceptedAt || c.accepted_at)}</strong>${c.acceptedIp || c.accepted_ip ? ' <span style="font-size:11px;color:var(--gray-400);">IP: '+(c.acceptedIp || c.accepted_ip)+'</span>' : ''}</div>` : ''}
          ${c.terminatedAt || c.terminated_at ? `<div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--red);flex-shrink:0;"></span> <span style="color:var(--red);">Terminated: <strong>${formatDateDisplay(c.terminatedAt || c.terminated_at)}</strong> ${c.terminatedReason || c.terminated_reason ? '— '+escHtml(c.terminatedReason || c.terminated_reason) : ''}</span></div>` : ''}
        </div>
      </div>
    </div>
  `;
}

export {
  renderBillingPage,
  renderInvoiceDetail,
  renderContractsPage,
  renderContractDetail,
  _fmtMoney,
  _renderLineItemsEditor,
  _renderSubscriptionTab,
  _invoiceStatusBadge,
  _nextInvoiceNumber,
  _renderContractLineItems,
  _defaultContractTerms,
};
