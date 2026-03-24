/**
 * Import Script: Nageley Michel — Payer Enrollment Data
 * Source: Network Status Report (2).xlsx dated 03/04/2026
 *
 * Run this in the browser console while logged in as EnnHealth.
 * It will:
 *   1. Add 6 missing payers to the catalog
 *   2. Find Nageley Michel's provider record
 *   3. Check for existing applications (skip duplicates)
 *   4. Create applications for each payer-state combo
 */
(async function importNageleyPayers() {
  'use strict';

  // ── 1. Missing payers to add to catalog ──
  const missingPayers = [
    { name: 'VACCN',                  category: 'other',    parentOrg: 'VA Community Care Network', states: ['ALL'], notes: 'Veterans Affairs Community Care Network (TRICARE)' },
    { name: 'Optum',                  category: 'national', parentOrg: 'UnitedHealth Group',        states: ['ALL'], notes: 'Optum Behavioral Health / OptumHealth' },
    { name: 'Carelon',                category: 'national', parentOrg: 'Elevance Health',           states: ['ALL'], notes: 'Carelon Behavioral Health (formerly Beacon Health Options)' },
    { name: 'Select Health',          category: 'regional', parentOrg: 'Intermountain Health',      states: ['UT', 'ID', 'NV'], notes: 'Intermountain-affiliated plan' },
    { name: 'Prominence Health Plan', category: 'regional', parentOrg: 'Universal Health Services', states: ['NV', 'TX'], notes: 'Nevada/Texas regional plan' },
    { name: 'SilverSummit Healthplan',category: 'medicaid', parentOrg: 'Centene Corporation',       states: ['NV'], notes: 'Nevada Medicaid managed care plan' },
  ];

  // ── 2. Spreadsheet rows mapped to application data ──
  // Status mapping: spreadsheet → app status
  //   "Actively participating"                        → credentialed
  //   "Telehealth allowed; claims billed via ..."     → credentialed
  //   "In Contracting Loading Phase"                  → approved (future effective date)
  //   "Application is still in process at payer end"  → in_review
  //   "Not available"                                 → withdrawn
  //   "not a coverage area"                           → withdrawn
  //   "Application rejected"                          → denied
  //   "Panel is closed for now"                       → on_hold

  const enrollments = [
    { state: 'FL', payerName: 'Medicare',                status: 'credentialed', effectiveDate: '2025-07-09', notes: 'Actively participating' },
    { state: 'FL', payerName: 'VACCN',                   status: 'credentialed', effectiveDate: '2025-09-18', notes: 'Actively participating' },
    { state: 'AZ', payerName: 'Optum',                   status: 'credentialed', effectiveDate: '2025-07-07', notes: 'Actively participating' },
    { state: 'OR', payerName: 'Aetna',                   status: 'credentialed', effectiveDate: '2025-08-29', notes: 'Actively participating — Aetna (Pacific Source)' },
    { state: 'NV', payerName: 'Optum',                   status: 'credentialed', effectiveDate: '2025-07-07', notes: 'Actively participating' },
    { state: 'AZ', payerName: 'BCBS of Arizona',         status: 'credentialed', effectiveDate: '',           notes: 'Telehealth allowed; claims billed via local BCBS (BCBS Florida). License must be active.' },
    { state: 'OR', payerName: 'Regence BCBS of Oregon',  status: 'credentialed', effectiveDate: '',           notes: 'Telehealth allowed; claims billed via local BCBS (BCBS Florida). License must be active.' },
    { state: 'OR', payerName: 'Moda Health',             status: 'approved',     effectiveDate: '2026-09-15', notes: 'In Contracting Loading Phase — future effective date received' },
    { state: 'NM', payerName: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Latest: Per review of Tax 92-1746886 Tricare Contract still in review.' },
    { state: 'AZ', payerName: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Latest: Per review of Tax 92-1746886 Tricare Contract still in review.' },
    { state: 'OR', payerName: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Latest: Per review of Tax 92-1746886 Tricare Contract still in review.' },
    { state: 'NV', payerName: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Latest: Per review of Tax 92-1746886 Tricare Contract still in review.' },
    { state: 'CO', payerName: 'VACCN',                   status: 'in_review',    effectiveDate: '',           notes: 'Application still in process. Latest: Per review of Tax 92-1746886 Tricare Contract still in review.' },
    { state: 'OR', payerName: 'Carelon',                 status: 'in_review',    effectiveDate: '',           notes: 'Application still under contracting review. No turnaround time — contract not yet sent for signature. Ref#: 02172026-0584944-01.' },
    { state: 'CO', payerName: 'Carelon',                 status: 'in_review',    effectiveDate: '',           notes: 'Application still under contracting review. No turnaround time — contract not yet sent for signature. Ref#: 02172026-0584944-01.' },
    { state: 'NV', payerName: 'Carelon',                 status: 'in_review',    effectiveDate: '',           notes: 'Application still under contracting review. No turnaround time — contract not yet sent for signature. Ref#: 02172026-0584944-01.' },
    { state: 'NV', payerName: 'Anthem BCBS',             status: 'in_review',    effectiveDate: '',           notes: 'Application still under contracting review. No turnaround time — contract not yet sent for signature.' },
    { state: 'CO', payerName: 'Anthem BCBS',             status: 'in_review',    effectiveDate: '',           notes: 'Application still under contracting review. No turnaround time — contract not yet sent for signature.' },
    { state: 'OR', payerName: 'Providence Health Plan',  status: 'in_review',    effectiveDate: '',           notes: 'Application still under contracting review. No turnaround time — contract not yet sent for signature.' },
    { state: 'AZ', payerName: 'Anthem BCBS',             status: 'withdrawn',    effectiveDate: '',           notes: 'Not available — Anthem does not cover AZ.' },
    { state: 'NM', payerName: 'Ambetter',                status: 'withdrawn',    effectiveDate: '',           notes: 'NM is not a coverage area of Ambetter.' },
    { state: 'NM', payerName: 'Molina Healthcare',       status: 'denied',       effectiveDate: '',           notes: 'Application rejected — must first be enrolled with NM Medicaid.' },
    { state: 'NV', payerName: 'Select Health',           status: 'on_hold',      effectiveDate: '',           notes: 'Panel closed — not accepting new applications for our specialty in this area.' },
    { state: 'NV', payerName: 'Prominence Health Plan',  status: 'on_hold',      effectiveDate: '',           notes: 'Panel closed — not accepting new applications for our specialty in this area.' },
    { state: 'NV', payerName: 'SilverSummit Healthplan', status: 'on_hold',      effectiveDate: '',           notes: 'Panel closed — not accepting new applications for our specialty in this area.' },
  ];

  // Payer name → catalog name mapping (spreadsheet names may differ from catalog)
  const payerAliases = {
    'Aetna':                    'Aetna',
    'BCBS of Arizona':          'BCBS of Arizona',       // catalog id 19
    'Regence BCBS of Oregon':   'Regence BCBS of Oregon', // catalog id 15
    'Anthem BCBS':              'Anthem BCBS',           // catalog id 11
  };

  // ── Helpers ──
  const log = (msg) => console.log(`%c[IMPORT] ${msg}`, 'color: #2563EB; font-weight: bold;');
  const warn = (msg) => console.warn(`[IMPORT] ${msg}`);
  const err = (msg) => console.error(`[IMPORT] ${msg}`);

  try {
    // ── Step 1: Add missing payers ──
    log('Step 1: Adding missing payers to catalog...');
    const payerMap = {}; // name → id

    // Load current catalog
    const currentPayers = await store.getPayers();
    currentPayers.forEach(p => { payerMap[p.name.toLowerCase()] = p.id; });

    for (const payer of missingPayers) {
      const key = payer.name.toLowerCase();
      if (payerMap[key]) {
        log(`  ✓ "${payer.name}" already exists (id=${payerMap[key]}), skipping.`);
      } else {
        try {
          const created = await store.createPayer(payer);
          payerMap[key] = created.id;
          log(`  ✚ Created payer "${payer.name}" → id=${created.id}`);
        } catch (e) {
          err(`  ✗ Failed to create "${payer.name}": ${e.message}`);
        }
      }
    }

    // Refresh catalog to get all IDs
    const allPayers = await store.getPayers();
    allPayers.forEach(p => { payerMap[p.name.toLowerCase()] = p.id; });
    log(`Payer catalog now has ${allPayers.length} entries.`);

    // ── Step 2: Find Nageley Michel ──
    log('Step 2: Looking up provider Nageley Michel...');
    const providers = await store.getAll('providers');
    const nageley = providers.find(p =>
      (p.firstName || '').toLowerCase().includes('nageley') ||
      (p.lastName || '').toLowerCase().includes('nageley') ||
      (p.lastName || '').toLowerCase().includes('michel')
    );

    if (!nageley) {
      err('Provider Nageley Michel not found! Listing all providers:');
      providers.forEach(p => console.log(`  - ${p.firstName} ${p.lastName} (id=${p.id})`));
      return;
    }
    log(`  Found: ${nageley.firstName} ${nageley.lastName} (id=${nageley.id})`);

    // ── Step 3: Check existing applications ──
    log('Step 3: Checking existing applications...');
    const allApps = await store.getAll('applications');
    const nageleyApps = allApps.filter(a => a.providerId === nageley.id);
    log(`  Nageley has ${nageleyApps.length} existing application(s).`);

    // Build lookup: "state|payerId" → existing app
    const existingLookup = {};
    nageleyApps.forEach(a => {
      const key = `${a.state}|${a.payerId}`;
      existingLookup[key] = a;
      // Also index by payerName for fallback matching
      if (a.payerName) existingLookup[`${a.state}|${a.payerName.toLowerCase()}`] = a;
    });

    // ── Step 4: Create applications ──
    log('Step 4: Creating applications...');
    let created = 0, skipped = 0, failed = 0;

    for (const row of enrollments) {
      // Resolve payer ID from catalog
      const lookupName = row.payerName.toLowerCase();
      let payerId = payerMap[lookupName];

      // Try partial match if exact fails
      if (!payerId) {
        const match = allPayers.find(p => p.name.toLowerCase().includes(lookupName) || lookupName.includes(p.name.toLowerCase()));
        if (match) payerId = match.id;
      }

      // Check if already exists
      const dupeKey1 = `${row.state}|${payerId}`;
      const dupeKey2 = `${row.state}|${lookupName}`;
      if (existingLookup[dupeKey1] || existingLookup[dupeKey2]) {
        const existing = existingLookup[dupeKey1] || existingLookup[dupeKey2];
        log(`  ⊘ SKIP: ${row.state} / ${row.payerName} — already exists (id=${existing.id}, status=${existing.status})`);
        skipped++;
        continue;
      }

      const appData = {
        providerId: nageley.id,
        organizationId: nageley.organizationId || '',
        state: row.state,
        payerId: payerId || '',
        payerName: row.payerName,
        status: row.status,
        effectiveDate: row.effectiveDate,
        notes: row.notes,
        type: 'individual',
        wave: 1,
        submittedDate: '',
        estMonthlyRevenue: 0,
      };

      try {
        const result = await store.create('applications', appData);
        log(`  ✚ CREATED: ${row.state} / ${row.payerName} → status=${row.status}, id=${result.id}`);
        created++;
      } catch (e) {
        err(`  ✗ FAILED: ${row.state} / ${row.payerName} — ${e.message}`);
        failed++;
      }
    }

    // ── Summary ──
    console.log('');
    log('═══════════════════════════════════════');
    log(`IMPORT COMPLETE — Created: ${created}, Skipped: ${skipped}, Failed: ${failed}`);
    log('═══════════════════════════════════════');

  } catch (e) {
    err(`Import failed: ${e.message}`);
    console.error(e);
  }
})();
