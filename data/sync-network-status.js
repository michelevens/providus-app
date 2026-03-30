/**
 * Sync Script: Network Status Report → Application Statuses
 * Source: Network Status Report (2).xlsx dated 03/04/2026
 *
 * Run this in the browser console while logged in to Credentik.
 * It will:
 *   1. Find Nageley Michel's provider record
 *   2. DELETE auto-generated apps NOT in the Network Status Report
 *   3. UPDATE status + notes for mismatched applications
 *   4. CREATE any missing applications
 *
 * Status mapping from report:
 *   "Actively participating"                        → credentialed
 *   "Telehealth allowed; claims billed via ..."     → credentialed
 *   "In Contracting Loading Phase"                  → in_review  (contract not signed)
 *   "Application is still in process at payer end"  → in_review
 *   "Not available / not a coverage area"           → withdrawn
 *   "Application rejected"                          → denied
 *   "Panel is closed for now"                       → on_hold
 */
(async function syncNetworkStatus() {
  'use strict';

  const log = (msg) => console.log(`%c[SYNC] ${msg}`, 'color: #2563EB; font-weight: bold;');
  const warn = (msg) => console.warn(`[SYNC] ⚠ ${msg}`);
  const err = (msg) => console.error(`[SYNC] ✗ ${msg}`);

  // ── Ground truth from Network Status Report (03/04/2026) ──
  const reportRows = [
    { state: 'FL', payer: 'Medicare',                status: 'credentialed', effectiveDate: '2025-07-09', notes: 'Actively participating' },
    { state: 'FL', payer: 'VACCN',                   status: 'credentialed', effectiveDate: '2025-09-18', notes: 'Actively participating' },
    { state: 'AZ', payer: 'Optum',                   status: 'credentialed', effectiveDate: '2025-07-07', notes: 'Actively participating' },
    { state: 'OR', payer: 'Aetna',                   status: 'credentialed', effectiveDate: '2025-08-29', notes: 'Actively participating — Aetna (Pacific Source)' },
    { state: 'NV', payer: 'Optum',                   status: 'credentialed', effectiveDate: '2025-07-07', notes: 'Actively participating' },
    { state: 'AZ', payer: 'BCBS of Arizona',         status: 'credentialed', effectiveDate: '',           notes: 'Telehealth allowed; claims billed via local BCBS (BCBS Florida). License must be active.' },
    { state: 'OR', payer: 'Regence BCBS of Oregon',  status: 'credentialed', effectiveDate: '',           notes: 'Telehealth allowed; claims billed via local BCBS (BCBS Florida). License must be active.' },
    { state: 'OR', payer: 'Moda Health',             status: 'in_review',    effectiveDate: '2026-09-15', notes: 'In Contracting Loading Phase — future effective date received 09/15/2026. Contract not yet signed.' },
    { state: 'NM', payer: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Per review of Tax 92-1746886, Tricare Contract still in review.' },
    { state: 'AZ', payer: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Per review of Tax 92-1746886, Tricare Contract still in review.' },
    { state: 'OR', payer: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Per review of Tax 92-1746886, Tricare Contract still in review.' },
    { state: 'NV', payer: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Per review of Tax 92-1746886, Tricare Contract still in review.' },
    { state: 'CO', payer: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Per review of Tax 92-1746886, Tricare Contract still in review.' },
    { state: 'OR', payer: 'Carelon',                 status: 'in_review',    effectiveDate: '',           notes: 'Still under contracting review — no turnaround time, contract not sent for signature. Ref#: 02172026-0584944-01.' },
    { state: 'CO', payer: 'Carelon',                 status: 'in_review',    effectiveDate: '',           notes: 'Still under contracting review — no turnaround time, contract not sent for signature. Ref#: 02172026-0584944-01.' },
    { state: 'NV', payer: 'Carelon',                 status: 'in_review',    effectiveDate: '',           notes: 'Still under contracting review — no turnaround time, contract not sent for signature. Ref#: 02172026-0584944-01.' },
    { state: 'NV', payer: 'Anthem BCBS',             status: 'in_review',    effectiveDate: '',           notes: 'Still under contracting review — no turnaround time, contract not sent for signature.' },
    { state: 'CO', payer: 'Anthem BCBS',             status: 'in_review',    effectiveDate: '',           notes: 'Still under contracting review — no turnaround time, contract not sent for signature.' },
    { state: 'OR', payer: 'Providence Health Plan',  status: 'in_review',    effectiveDate: '',           notes: 'Still under contracting review — no turnaround time, contract not sent for signature.' },
    { state: 'AZ', payer: 'Anthem BCBS',             status: 'withdrawn',    effectiveDate: '',           notes: 'Not available — Anthem does not cover AZ.' },
    { state: 'NM', payer: 'Ambetter',                status: 'withdrawn',    effectiveDate: '',           notes: 'NM is not a coverage area of Ambetter.' },
    { state: 'NM', payer: 'Molina Healthcare',       status: 'denied',       effectiveDate: '',           notes: 'Application rejected — must first be enrolled with NM Medicaid before reapplying.' },
    { state: 'NV', payer: 'Select Health',           status: 'on_hold',      effectiveDate: '',           notes: 'Panel closed — not accepting new applications for our specialty in this area.' },
    { state: 'NV', payer: 'Prominence Health Plan',  status: 'on_hold',      effectiveDate: '',           notes: 'Panel closed — not accepting new applications for our specialty in this area.' },
    { state: 'NV', payer: 'SilverSummit Healthplan', status: 'on_hold',      effectiveDate: '',           notes: 'Panel closed — not accepting new applications for our specialty in this area.' },
  ];

  try {
    // ── Step 1: Find provider ──
    log('Step 1: Looking up provider Nageley Michel...');
    const providers = await store.getAll('providers');
    const nageley = providers.find(p =>
      (p.firstName || '').toLowerCase().includes('nageley') ||
      (p.lastName || '').toLowerCase().includes('nageley') ||
      (p.lastName || '').toLowerCase().includes('michel')
    );

    if (!nageley) {
      err('Provider Nageley Michel not found!');
      providers.forEach(p => console.log(`  - ${p.firstName} ${p.lastName} (id=${p.id})`));
      return;
    }
    log(`  Found: ${nageley.firstName} ${nageley.lastName} (id=${nageley.id})`);

    // ── Step 2: Load payer catalog + existing apps ──
    log('Step 2: Loading payer catalog and existing applications...');
    const [allPayers, allApps] = await Promise.all([
      store.getPayers(),
      store.getAll('applications'),
    ]);

    const nageleyApps = allApps.filter(a =>
      a.providerId === nageley.id || String(a.providerId) === String(nageley.id)
    );
    log(`  ${allPayers.length} payers in catalog, ${nageleyApps.length} existing applications for Nageley.`);

    // Build payer name → payer map (lowercase)
    const payerMap = {};
    allPayers.forEach(p => { payerMap[p.name.toLowerCase()] = p; });

    // ── Helper: fuzzy-match a report row to an existing app ──
    function matchApp(row, apps) {
      const lookupName = row.payer.toLowerCase();
      const catalogPayer = payerMap[lookupName] ||
        allPayers.find(p => p.name.toLowerCase().includes(lookupName) || lookupName.includes(p.name.toLowerCase()));

      return apps.find(a => {
        if (a.state !== row.state) return false;
        if (catalogPayer && String(a.payerId) === String(catalogPayer.id)) return true;
        const appName = (a.payerName || '').toLowerCase();
        return appName === lookupName || appName.includes(lookupName) || lookupName.includes(appName);
      });
    }

    // ── Step 3: Identify auto-generated apps to DELETE ──
    log('Step 3: Identifying auto-generated apps NOT in the Network Status Report...');
    const matchedAppIds = new Set();

    // First pass: mark which apps correspond to a report row
    for (const row of reportRows) {
      const match = matchApp(row, nageleyApps);
      if (match) matchedAppIds.add(match.id);
    }

    // Only delete apps that look auto-generated by the batch generator:
    // - Have estMonthlyRevenue > 0 (batch generator sets revenue estimates)
    // - OR have generic batch-like notes (e.g. "high-volume market", "credentialed")
    // - AND are NOT status "new", "planned", "submitted", "in_review" (user-created)
    const batchPatterns = /high.volume|market|credentialed|wave_|batch|expansion|strat_/i;
    const toDelete = nageleyApps.filter(a => {
      if (matchedAppIds.has(a.id)) return false; // matched to report — keep
      const hasRevenue = (a.estMonthlyRevenue || a.est_monthly_revenue || 0) > 0;
      const hasBatchNotes = batchPatterns.test(a.notes || '');
      const isAutoGenerated = hasRevenue || hasBatchNotes;
      return isAutoGenerated;
    });
    let deleted = 0;

    if (toDelete.length > 0) {
      log(`  Found ${toDelete.length} app(s) NOT in the Network Status Report:`);
      const deleteTable = [];
      for (const a of toDelete) {
        const payerName = a.payerName || (a.payerId ? (allPayers.find(p => String(p.id) === String(a.payerId)) || {}).name : '') || '?';
        deleteTable.push({ id: a.id, state: a.state, payer: payerName, status: a.status, notes: (a.notes || '').substring(0, 60) });
        log(`    DELETE: ${a.state} / ${payerName} — status=${a.status}, id=${a.id}, notes="${(a.notes || '').substring(0, 50)}"`);
      }
      console.table(deleteTable);

      // Actually delete them
      for (const a of toDelete) {
        try {
          await store.remove('applications', a.id);
          deleted++;
        } catch (e) {
          err(`  Failed to delete id=${a.id}: ${e.message}`);
        }
      }
      log(`  Deleted ${deleted} auto-generated application(s).`);
    } else {
      log('  No auto-generated apps found — all apps match the report.');
    }

    // ── Step 4: Sync report rows (update mismatches, create missing) ──
    log('Step 4: Syncing report rows...');
    let updated = 0, created = 0, skippedOk = 0, failed = 0;
    const changes = [];

    // Re-fetch apps since we deleted some
    const freshApps = (await store.getAll('applications', { force: true })).filter(a =>
      a.providerId === nageley.id || String(a.providerId) === String(nageley.id)
    );

    for (const row of reportRows) {
      const lookupName = row.payer.toLowerCase();
      const catalogPayer = payerMap[lookupName] ||
        allPayers.find(p => p.name.toLowerCase().includes(lookupName) || lookupName.includes(p.name.toLowerCase()));

      const existing = matchApp(row, freshApps);

      if (existing) {
        // Always tag as vendor-managed
        const needsSourceTag = existing.source !== 'vendor';
        if (existing.status === row.status && !needsSourceTag) {
          log(`  OK: ${row.state} / ${row.payer} — already ${row.status} (vendor)`);
          skippedOk++;
          continue;
        }

        // Update status + tag as vendor
        const oldStatus = existing.status;
        const updateData = {
          status: row.status,
          source: 'vendor',
          notes: `[Synced from Network Status Report 03/04/2026] ${row.notes}`,
        };
        if (row.effectiveDate) updateData.effectiveDate = row.effectiveDate;

        try {
          await store.update('applications', existing.id, updateData);
          log(`  UPDATED: ${row.state} / ${row.payer} — ${oldStatus} -> ${row.status} (id=${existing.id})`);
          changes.push({ action: 'UPDATED', state: row.state, payer: row.payer, from: oldStatus, to: row.status, id: existing.id });
          updated++;
        } catch (e) {
          err(`  Failed to update ${row.state} / ${row.payer}: ${e.message}`);
          failed++;
        }
      } else {
        // Create missing app
        const appData = {
          providerId: nageley.id,
          organizationId: nageley.organizationId || '',
          state: row.state,
          payerId: catalogPayer ? catalogPayer.id : '',
          payerName: row.payer,
          status: row.status,
          source: 'vendor',
          effectiveDate: row.effectiveDate,
          notes: `[Created from Network Status Report 03/04/2026] ${row.notes}`,
          type: 'individual',
          wave: 1,
          submittedDate: '',
          estMonthlyRevenue: 0,
        };

        try {
          const result = await store.create('applications', appData);
          log(`  CREATED: ${row.state} / ${row.payer} -> ${row.status} (id=${result.id})`);
          changes.push({ action: 'CREATED', state: row.state, payer: row.payer, from: '—', to: row.status, id: result.id });
          created++;
        } catch (e) {
          err(`  Failed to create ${row.state} / ${row.payer}: ${e.message}`);
          failed++;
        }
      }
    }

    // ── Summary ──
    console.log('');
    log('===========================================================');
    log(`SYNC COMPLETE`);
    log(`  Deleted:  ${deleted} auto-generated app(s)`);
    log(`  Updated:  ${updated} status correction(s)`);
    log(`  Created:  ${created} new app(s)`);
    log(`  Correct:  ${skippedOk} already matched`);
    log(`  Failed:   ${failed}`);
    log('===========================================================');

    if (changes.length > 0) {
      console.log('');
      console.log('%cChanges:', 'font-weight:bold;font-size:14px;');
      console.table(changes);
    }

    if (deleted > 0) {
      console.log('');
      console.log('%cDeleted apps (were auto-generated, not in vendor report):', 'font-weight:bold;font-size:14px;color:#dc2626;');
      console.table(toDelete.map(a => ({
        id: a.id,
        state: a.state,
        payer: a.payerName || '?',
        oldStatus: a.status,
        notes: (a.notes || '').substring(0, 80),
      })));
    }

    // Refresh the page
    if (window.app && window.app.navigateTo) {
      log('Refreshing credentialing page...');
      store.clearCache();
      await window.app.navigateTo('credentialing');
    }

  } catch (e) {
    err(`Sync failed: ${e.message}`);
    console.error(e);
  }
})();
