/**
 * Sync Script: Network Status Report → Application Statuses
 * Source: Network Status Report (2).xlsx dated 03/04/2026
 *
 * Run this in the browser console while logged in to Credentik.
 * It will:
 *   1. Find Nageley Michel's provider record
 *   2. Match each report row to an existing application
 *   3. UPDATE status + notes for mismatched applications
 *   4. CREATE any missing applications
 *
 * Status mapping from report:
 *   "Actively participating"                        → credentialed
 *   "Telehealth allowed; claims billed via ..."     → credentialed
 *   "In Contracting Loading Phase"                  → in_review  (not approved — no contract signed yet)
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

    // Build payer name → id map (lowercase)
    const payerMap = {};
    allPayers.forEach(p => { payerMap[p.name.toLowerCase()] = p; });

    // ── Step 3: Match and sync ──
    log('Step 3: Matching report rows to existing applications...');
    let updated = 0, created = 0, skippedOk = 0, failed = 0;

    const changes = []; // collect for summary table

    for (const row of reportRows) {
      // Find matching payer in catalog
      const lookupName = row.payer.toLowerCase();
      let catalogPayer = payerMap[lookupName];

      // Try partial match
      if (!catalogPayer) {
        catalogPayer = allPayers.find(p =>
          p.name.toLowerCase().includes(lookupName) ||
          lookupName.includes(p.name.toLowerCase())
        );
      }

      // Find existing application by state + payer (by ID or name)
      const existing = nageleyApps.find(a => {
        if (a.state !== row.state) return false;
        // Match by payer ID
        if (catalogPayer && String(a.payerId) === String(catalogPayer.id)) return true;
        // Match by payer name (fuzzy)
        const appPayerName = (a.payerName || '').toLowerCase();
        if (appPayerName === lookupName) return true;
        if (appPayerName.includes(lookupName) || lookupName.includes(appPayerName)) return true;
        return false;
      });

      if (existing) {
        // Check if status needs correction
        if (existing.status === row.status) {
          log(`  ✓ OK: ${row.state} / ${row.payer} — already ${row.status}`);
          skippedOk++;
          continue;
        }

        // STATUS MISMATCH — update it
        const oldStatus = existing.status;
        const updateData = {
          status: row.status,
          notes: `[Synced from Network Status Report 03/04/2026] ${row.notes}`,
        };
        if (row.effectiveDate) updateData.effectiveDate = row.effectiveDate;

        try {
          await store.update('applications', existing.id, updateData);
          log(`  ↻ UPDATED: ${row.state} / ${row.payer} — ${oldStatus} → ${row.status} (id=${existing.id})`);
          changes.push({ state: row.state, payer: row.payer, action: 'UPDATED', from: oldStatus, to: row.status, id: existing.id });
          updated++;
        } catch (e) {
          err(`  Failed to update ${row.state} / ${row.payer}: ${e.message}`);
          failed++;
        }
      } else {
        // No existing app — create one
        const appData = {
          providerId: nageley.id,
          organizationId: nageley.organizationId || '',
          state: row.state,
          payerId: catalogPayer ? catalogPayer.id : '',
          payerName: row.payer,
          status: row.status,
          effectiveDate: row.effectiveDate,
          notes: `[Created from Network Status Report 03/04/2026] ${row.notes}`,
          type: 'individual',
          wave: 1,
          submittedDate: '',
          estMonthlyRevenue: 0,
        };

        try {
          const result = await store.create('applications', appData);
          log(`  ✚ CREATED: ${row.state} / ${row.payer} → ${row.status} (id=${result.id})`);
          changes.push({ state: row.state, payer: row.payer, action: 'CREATED', from: '—', to: row.status, id: result.id });
          created++;
        } catch (e) {
          err(`  Failed to create ${row.state} / ${row.payer}: ${e.message}`);
          failed++;
        }
      }
    }

    // ── Summary ──
    console.log('');
    log('═══════════════════════════════════════════════════');
    log(`SYNC COMPLETE — Updated: ${updated}, Created: ${created}, Already correct: ${skippedOk}, Failed: ${failed}`);
    log('═══════════════════════════════════════════════════');

    if (changes.length > 0) {
      console.log('');
      console.table(changes);
    }

    // Refresh the page view
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
