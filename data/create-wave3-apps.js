/**
 * Create Wave 3 Applications — 15 new payer enrollments for Nageley Michel
 * Assigned to Doustan Shah, status: planned, wave: 3, group: 3
 *
 * Run in browser console while logged in to Credentik as admin.
 */
(async function createWave3Apps() {
  'use strict';

  const store = window._credentik.store;
  const log = (msg) => console.log(`%c[WAVE3] ${msg}`, 'color: #8b5cf6; font-weight: bold;');
  const err = (msg) => console.error(`[WAVE3] ${msg}`);

  const apps = [
    { state: 'FL', payer: 'Sunshine Health',              notes: 'Wave 3 — Major FL managed care (Centene), high BH volume' },
    { state: 'FL', payer: 'Simply Healthcare',             notes: 'Wave 3 — FL managed care plan (Anthem), growing marketplace' },
    { state: 'FL', payer: 'WellCare of Florida',           notes: 'Wave 3 — Large FL HMO, strong BH network' },
    { state: 'AZ', payer: 'Health Net Arizona',            notes: 'Wave 3 — AZ commercial, BH-friendly' },
    { state: 'AZ', payer: 'Oscar Health Arizona',          notes: 'Wave 3 — AZ marketplace, growing rapidly' },
    { state: 'CO', payer: 'Rocky Mountain Health Plans',   notes: 'Wave 3 — Western CO dominant plan' },
    { state: 'CO', payer: 'Oscar Health Colorado',         notes: 'Wave 3 — CO marketplace, tech-forward' },
    { state: 'NV', payer: 'Prominence Health Plan',        notes: 'Wave 3 — NV regional (check if panel reopened)' },
    { state: 'NV', payer: 'Health Plan of Nevada',         notes: 'Wave 3 — NV HMO under UHC umbrella' },
    { state: 'OR', payer: 'PacificSource Oregon',          notes: 'Wave 3 — Major OR commercial, sister plan to MT PacificSource' },
    { state: 'OR', payer: 'AllCare Health',                notes: 'Wave 3 — Southern OR regional' },
    { state: 'MT', payer: 'Blue Cross Blue Shield FEP',    notes: 'Wave 3 — Federal employees plan, MT-eligible' },
    { state: 'NM', payer: 'Molina Healthcare NM',          notes: 'Wave 3 — Resubmit commercial side (previously denied for Medicaid req)' },
    { state: 'NM', payer: 'Blue Cross Blue Shield FEP NM', notes: 'Wave 3 — Federal employees, good reimbursement' },
    { state: 'FL', payer: 'Devoted Health',                notes: 'Wave 3 — FL Medicare Advantage, growing fast in BH' },
  ];

  try {
    const providers = await store.getAll('providers');
    const nageley = providers.find(p =>
      (p.firstName || '').toLowerCase().includes('nageley') ||
      (p.lastName || '').toLowerCase().includes('michel')
    );
    if (!nageley) { err('Provider Nageley Michel not found!'); return; }
    log(`Provider: ${nageley.firstName} ${nageley.lastName} (id=${nageley.id})`);

    const users = await store.getAgencyUsers();
    const doustan = users.find(u => u.id === 21);
    const assignedToId = doustan ? doustan.id : 21;
    const assignedToName = doustan ? `${doustan.firstName || doustan.first_name || ''} ${doustan.lastName || doustan.last_name || ''}`.trim() : 'Doustan Shah';
    log(`Assigned to: ${assignedToName} (id=${assignedToId})`);

    const allApps = await store.getAll('applications', { force: true });
    const nageleyApps = allApps.filter(a =>
      String(a.providerId) === String(nageley.id) || a.providerId === nageley.id
    );
    log(`Current apps for Nageley: ${nageleyApps.length}`);

    const allPayers = await store.getPayers();
    const payerMap = {};
    allPayers.forEach(p => { payerMap[(p.name || '').toLowerCase()] = p; });

    let created = 0, skipped = 0;

    for (const row of apps) {
      const lookupName = row.payer.toLowerCase();
      const catalogPayer = payerMap[lookupName] ||
        allPayers.find(p => (p.name || '').toLowerCase().includes(lookupName) || lookupName.includes((p.name || '').toLowerCase()));

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
          organizationId: nageley.organizationId || nageley.organization_id || '',
          state: row.state,
          payerId: catalogPayer ? catalogPayer.id : '',
          payerName: row.payer,
          status: 'planned',
          source: 'staff',
          notes: row.notes,
          type: 'individual',
          wave: 3,
          assignedTo: assignedToId,
          assignedToName: assignedToName,
          submittedDate: '',
          estMonthlyRevenue: 0,
        });
        log(`  CREATED: ${row.state} / ${row.payer} -> planned (id=${result.id})`);
        created++;
      } catch (e) {
        err(`  FAILED: ${row.state} / ${row.payer} — ${e.message}`);
      }
    }

    log(`\nDone! Created: ${created}, Skipped (already exist): ${skipped}`);

    // Send notifications
    try {
      await store.sendNotification('status_change', {
        recipient_email: 'emichel@ennhealth.com',
        recipient_name: 'Admin',
        subject: `Wave 3: ${created} New Applications Created — Assigned to ${assignedToName}`,
        body: `${created} new credentialing applications have been created for Nageley Michel (Wave 3, Group 3).\n\nStates: FL (3), AZ (2), CO (2), NV (2), OR (2), MT (1), NM (2), FL (1)\nStatus: Planned\nAssigned to: ${assignedToName}\n\nLog in to Credentik to view and begin submissions.`,
        metadata: { wave: 3, created, assignedTo: assignedToId, provider: 'Nageley Michel' },
      });
      log('Notification sent to admin');
    } catch (e) { err('Admin notification failed: ' + e.message); }

    if (doustan?.email) {
      try {
        await store.sendNotification('status_change', {
          recipient_email: doustan.email,
          recipient_name: assignedToName,
          subject: `You've been assigned ${created} new applications — Wave 3`,
          body: `Hi ${doustan.firstName || doustan.first_name || 'Doustan'},\n\n${created} new credentialing applications for Nageley Michel (Wave 3) have been assigned to you.\n\nStates: FL, AZ, CO, NV, OR, MT, NM\nStatus: Planned — ready for submission\n\nPlease log in to Credentik to review and begin the enrollment process.\n\nThank you!`,
          metadata: { wave: 3, created, provider: 'Nageley Michel' },
        });
        log(`Notification sent to ${assignedToName}`);
      } catch (e) { err('Doustan notification failed: ' + e.message); }
    }

  } catch (e) {
    err('Script failed: ' + e.message);
    console.error(e);
  }
})();
