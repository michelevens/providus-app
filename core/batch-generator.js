/**
 * Credentik — Batch Generator
 *
 * Generates application batches from strategy profiles.
 * Creates sets of applications for expansion into new states/payers.
 * Uses the Credentik API via the store for all data operations.
 */

import store from './store.js';
import CONFIG from './config.js';

// ── Revenue estimation defaults ──

const REVENUE_DEFAULTS = {
    ratesByCategory: {
        national:   { eval: 250, followup: 120 },
        regional:   { eval: 220, followup: 110 },
        bcbs:       { eval: 240, followup: 115 },
        medicaid:   { eval: 180, followup: 85 },
        medicare:   { eval: 200, followup: 100 },
        tricare:    { eval: 210, followup: 105 },
        commercial: { eval: 230, followup: 112 },
    },
    volumeByWave: {
        1: { newPatientsPerMonth: 15, followupsPerMonth: 40 },
        2: { newPatientsPerMonth: 10, followupsPerMonth: 25 },
        3: { newPatientsPerMonth: 5,  followupsPerMonth: 10 },
    },
};

// ── Generate Application Batch from Strategy ──

async function generateBatch(options = {}) {
    const {
        strategyId = null,
        strategy = null,
        targetStates = [],
        excludeExisting = true,
        providerId = null,
        orgId = null,
    } = options;

    // Resolve strategy
    let strat = strategy;
    if (strategyId && !strat) {
        try {
            const strategies = await store.getAll('strategies');
            strat = strategies.find(s => s.id === strategyId || s.slug === strategyId);
        } catch {
            // Ignore — will fail below
        }
    }
    if (!strat) {
        return { success: false, error: 'Strategy not found' };
    }

    // Determine target states
    let states = targetStates.length > 0 ? targetStates : (strat.target_states || strat.targetStates || []);

    // If no states specified, use all licensed states
    if (states.length === 0) {
        try {
            const licenses = await store.getAll('licenses', { status: 'active' });
            states = [...new Set(licenses.map(l => l.state))];
        } catch {
            states = [];
        }
    }

    // Get existing applications to avoid duplicates
    let existingKeys = new Set();
    if (excludeExisting) {
        try {
            const existingApps = await store.getAll('applications');
            existingKeys = new Set(
                existingApps.map(a => `${a.payer_id || a.payerId || a.payer}|${a.state}`)
            );
        } catch {
            // Continue without dedup
        }
    }

    // Get payer catalog from API
    let payerCatalog = [];
    try {
        payerCatalog = await store.getPayers();
    } catch {
        return { success: false, error: 'Failed to load payer catalog' };
    }

    // Generate applications
    const waveRules = strat.wave_rules || strat.waveRules || [];
    const batch = [];

    for (const rule of waveRules) {
        let payers = [];

        // Get payers matching this rule
        if (rule.payerIds || rule.payer_ids) {
            const ids = rule.payerIds || rule.payer_ids;
            payers = payerCatalog.filter(p => ids.includes(p.id));
        } else if (rule.payerCategory || rule.payer_category) {
            const cat = rule.payerCategory || rule.payer_category;
            payers = payerCatalog.filter(p => p.category === cat);
        }

        // Apply market share filter
        if (rule.minMarketShare || rule.min_market_share) {
            const min = rule.minMarketShare || rule.min_market_share;
            payers = payers.filter(p => (p.market_share || p.marketShare || 0) >= min);
        }

        for (const payer of payers) {
            // Determine which states this payer covers within our target states
            const payerStates = payer.states || [];
            let applicableStates;

            if (payerStates.includes('ALL')) {
                applicableStates = ['ALL'];
            } else {
                applicableStates = states.filter(s => payerStates.includes(s));
            }

            for (const state of applicableStates) {
                const key = `${payer.id}|${state}`;
                const nameKey = `${payer.name}|${state}`;

                if (existingKeys.has(key) || existingKeys.has(nameKey)) continue;

                const estRevenue = estimateMonthlyRevenue(payer, rule.wave);

                // Apply revenue threshold
                const threshold = strat.revenue_threshold || strat.revenueThreshold;
                if (threshold && estRevenue < threshold) continue;

                batch.push({
                    payer_id: payer.id,
                    payer_name: payer.name,
                    state,
                    wave: rule.wave,
                    type: 'individual',
                    status: 'new',
                    est_monthly_revenue: estRevenue,
                    provider_id: providerId || null,
                    organization_id: orgId || null,
                    notes: payer.notes || '',
                    tags: [strat.id || strat.slug, `wave_${rule.wave}`, payer.category].filter(Boolean),
                });

                existingKeys.add(key);
            }
        }
    }

    // Sort by wave then estimated revenue descending
    batch.sort((a, b) => a.wave - b.wave || b.est_monthly_revenue - a.est_monthly_revenue);

    return { success: true, batch, count: batch.length, strategy: strat.name };
}

// ── Generate BCBS Target Set ──

async function generateBCBSBatch(targetStates = [], excludeExisting = true) {
    return generateBatch({
        strategyId: 'strat_bcbs_blitz',
        targetStates,
        excludeExisting,
    });
}

// ── Generate Expansion for Specific States ──

async function generateStateExpansion(states, options = {}) {
    return generateBatch({
        strategyId: options.strategyId || 'strat_national_first',
        targetStates: states,
        excludeExisting: options.excludeExisting !== false,
        providerId: options.providerId,
        orgId: options.orgId,
    });
}

// ── Commit Batch to Store ──

async function commitBatch(batch) {
    const results = [];
    const errors = [];

    for (const app of batch) {
        try {
            const record = await store.create('applications', app);
            results.push(record);
        } catch (err) {
            errors.push({ app, error: err.message });
        }
    }

    return {
        success: errors.length === 0,
        created: results.length,
        errors,
        total: batch.length,
    };
}

// ── Revenue Estimation ──

function estimateMonthlyRevenue(payer, wave) {
    const category = payer.category || 'regional';
    const rates = REVENUE_DEFAULTS.ratesByCategory[category] || REVENUE_DEFAULTS.ratesByCategory.regional;
    const volume = REVENUE_DEFAULTS.volumeByWave[wave] || REVENUE_DEFAULTS.volumeByWave[3];

    return Math.round(
        (volume.newPatientsPerMonth * rates.eval) +
        (volume.followupsPerMonth * rates.followup)
    );
}

// ── Batch Preview (human-readable summary) ──

function summarizeBatch(batch) {
    const byWave = {};
    const byState = {};
    let totalRevenue = 0;

    for (const app of batch) {
        const w = app.wave || 0;
        byWave[w] = (byWave[w] || 0) + 1;
        byState[app.state] = (byState[app.state] || 0) + 1;
        totalRevenue += app.est_monthly_revenue || app.estMonthlyRevenue || 0;
    }

    return {
        totalApplications: batch.length,
        byWave,
        byState,
        estimatedMonthlyRevenue: totalRevenue,
        estimatedAnnualRevenue: totalRevenue * 12,
        uniqueStates: Object.keys(byState).length,
        uniquePayers: new Set(batch.map(a => a.payer_id || a.payerId || a.payer_name || a.payerName)).size,
    };
}

// ── Public API ──

const batchGenerator = {
    REVENUE_DEFAULTS,
    generateBatch,
    generateBCBSBatch,
    generateStateExpansion,
    commitBatch,
    estimateMonthlyRevenue,
    summarizeBatch,
};

export default batchGenerator;
