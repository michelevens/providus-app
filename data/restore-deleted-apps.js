/**
 * Restore Script: Recreate applications deleted by sync script
 *
 * Source: 837 claims data + Florida Blue CSVs + BCBSNM folder
 * These payers had active claims filed, meaning applications existed.
 *
 * Run in browser console while logged in to Credentik.
 */
(async function restoreDeletedApps() {
  'use strict';

  const store = window._credentik.store;
  const log = (msg) => console.log(`%c[RESTORE] ${msg}`, 'color: #16a34a; font-weight: bold;');
  const err = (msg) => console.error(`[RESTORE] ${msg}`);

  // ── Apps to restore ──
  // Derived from 837 claims data (payers with actual claims filed)
  // and data folder (Florida Blue CSVs, BCBSNM denials)
  // These were NOT in the vendor Network Status Report but had real claims,
  // meaning they were legitimate applications (likely assigned to Dustan Shah)
  const toRestore = [
    { state: 'FL', payer: 'Florida Blue',        status: 'new', notes: 'Active claims on file (837 data). Restored — was deleted by sync script.' },
    { state: 'FL', payer: 'Cigna',               status: 'new', notes: 'Active claims on file (837 data). Restored — was deleted by sync script.' },
    { state: 'FL', payer: 'Humana',              status: 'new', notes: 'Active claims on file (837 data). Restored — was deleted by sync script.' },
    { state: 'FL', payer: 'UnitedHealthcare',    status: 'new', notes: 'Active claims on file (837 data). Restored — was deleted by sync script.' },
    { state: 'FL', payer: 'CarePlus',            status: 'new', notes: 'Active claims on file (837 data — CarePlus Health Plan UB). Restored.' },
    { state: 'NM', payer: 'BCBS of New Mexico',  status: 'new', notes: 'Active claims on file (837 data — BCBS of New). BCBSNM denials in data folder. Restored.' },
  ];

  try {
    // ── Find provider ──
    const providers = await store.getAll('providers');
    const nageley = providers.find(p =>
      (p.firstName || '').toLowerCase().includes('nageley') ||
      (p.lastName || '').toLowerCase().includes('nageley') ||
      (p.lastName || '').toLowerCase().includes('michel')
    );

    if (!nageley) { err('Provider not found!'); return; }
    log(`Provider: ${nageley.firstName} ${nageley.lastName} (id=${nageley.id})`);

    // ── Load current state ──
    const [allPayers, allApps] = await Promise.all([
      store.getPayers(),
      store.getAll('applications', { force: true }),
    ]);

    const nageleyApps = allApps.filter(a =>
      a.providerId === nageley.id || String(a.providerId) === String(nageley.id)
    );

    log(`Current apps: ${nageleyApps.length}`);
    console.table(nageleyApps.map(a => ({ id: a.id, state: a.state, payer: a.payerName, status: a.status })));

    // Build payer lookup
    const payerMap = {};
    allPayers.forEach(p => { payerMap[p.name.toLowerCase()] = p; });

    // ── Restore ──
    let restored = 0, skipped = 0;

    for (const row of toRestore) {
      const lookupName = row.payer.toLowerCase();
      const catalogPayer = payerMap[lookupName] ||
        allPayers.find(p => p.name.toLowerCase().includes(lookupName) || lookupName.includes(p.name.toLowerCase()));

      // Skip if already exists
      const exists = nageleyApps.find(a => {
        if (a.state !== row.state) return false;
        if (catalogPayer && String(a.payerId) === String(catalogPayer.id)) return true;
        const name = (a.payerName || '').toLowerCase();
        return name === lookupName || name.includes(lookupName) || lookupName.includes(name);
      });

      if (exists) {
        log(`  SKIP: ${row.state} / ${row.payer} — already exists (id=${exists.id}, status=${exists.status})`);
        skipped++;
        continue;
      }

      try {
        const result = await store.create('applications', {
          providerId: nageley.id,
          organizationId: nageley.organizationId || '',
          state: row.state,
          payerId: catalogPayer ? catalogPayer.id : '',
          payerName: row.payer,
          status: row.status,
          notes: row.notes,
          type: 'individual',
          wave: 1,
          submittedDate: '',
          estMonthlyRevenue: 0,
        });
        log(`  RESTORED: ${row.state} / ${row.payer} -> ${row.status} (id=${result.id})`);
        restored++;
      } catch (e) {
        err(`  FAILED: ${row.state} / ${row.payer} — ${e.message}`);
      }
    }

    // ── Summary ──
    console.log('');
    log('===================================');
    log(`RESTORE COMPLETE — Restored: ${restored}, Skipped (already exist): ${skipped}`);
    log('===================================');

    if (restored > 0) {
      store.clearCache();
      await window.app.navigateTo('credentialing');
    }

  } catch (e) {
    err(`Restore failed: ${e.message}`);
    console.error(e);
  }
})();
