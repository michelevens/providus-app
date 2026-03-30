/**
 * Fix Script: Demote batch-generated "Approved" apps to "Planned"
 *
 * Finds any application that:
 *   - Has estMonthlyRevenue > 0 (batch generator sets this)
 *   - OR has batch-like notes (wave_, strat_, high-volume, expansion, etc.)
 *   - OR has source: 'batch'
 *   - AND status is 'approved' or 'credentialed' or 'new'
 *   - AND source is NOT 'vendor' and NOT 'staff'
 *
 * Changes them to status: 'planned', source: 'batch'
 *
 * Run in browser console while logged in to Credentik.
 */
(async function fixBatchApproved() {
  'use strict';

  const store = window._credentik.store;
  const log = (msg) => console.log(`%c[FIX] ${msg}`, 'color: #6366f1; font-weight: bold;');

  try {
    const apps = await store.getAll('applications', { force: true });
    const batchPatterns = /high.volume|market|credentialed\.|wave_|batch|expansion|strat_|auto.generated/i;

    // Find batch-generated apps that shouldn't be approved/credentialed/new
    const toFix = apps.filter(a => {
      // Skip vendor and staff apps
      if (a.source === 'vendor' || a.source === 'staff') return false;
      // Only fix approved/credentialed/new (not already planned/denied/etc)
      if (!['approved', 'credentialed', 'new'].includes(a.status)) return false;
      // Already planned — skip
      if (a.status === 'planned') return false;

      // Detect batch-generated fingerprints
      const hasRevenue = (a.estMonthlyRevenue || a.est_monthly_revenue || 0) > 0;
      const hasBatchNotes = batchPatterns.test(a.notes || '');
      const isBatchSource = a.source === 'batch';

      return hasRevenue || hasBatchNotes || isBatchSource;
    });

    if (toFix.length === 0) {
      log('No batch-generated approved/new apps found. All clean.');
      return;
    }

    log(`Found ${toFix.length} batch-generated app(s) to demote to "planned":`);
    console.table(toFix.map(a => ({
      id: a.id,
      state: a.state,
      payer: a.payerName || '',
      status: a.status,
      source: a.source || '—',
      revenue: a.estMonthlyRevenue || 0,
      notes: (a.notes || '').substring(0, 50),
    })));

    let fixed = 0;
    for (const a of toFix) {
      try {
        await store.update('applications', a.id, {
          status: 'planned',
          source: 'batch',
          notes: `[Demoted from ${a.status} — batch-generated, not a real enrollment] ${a.notes || ''}`.trim(),
        });
        log(`  FIXED: ${a.state} / ${a.payerName || '?'} — ${a.status} -> planned (id=${a.id})`);
        fixed++;
      } catch (e) {
        console.error(`  FAILED: id=${a.id} — ${e.message}`);
      }
    }

    log(`Done. Fixed ${fixed} of ${toFix.length} app(s).`);
    store.clearCache();
    if (window.app) await window.app.navigateTo('credentialing');

  } catch (e) {
    console.error('[FIX] Failed:', e.message);
  }
})();
