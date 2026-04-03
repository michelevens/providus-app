/**
 * Create Wave 2 Applications — 15 new payer enrollments for Nageley Michel
 * Assigned to Doustan Shah, status: planned, wave: 2
 *
 * Run in browser console while logged in to Credentik as admin.
 */
(async function createWave2Apps() {
  'use strict';

  const store = window._credentik.store;
  const log = (msg) => console.log(`%c[WAVE2] ${msg}`, 'color: #2563eb; font-weight: bold;');
  const err = (msg) => console.error(`[WAVE2] ${msg}`);

  // ── 15 new applications ──
  const apps = [
    { state: 'MT', payer: 'BCBS of Montana',           notes: 'Wave 2 — Zero apps in MT, BCBS is dominant commercial payer' },
    { state: 'MT', payer: 'Allegiance Benefit Plan',    notes: 'Wave 2 — Regional MT payer, Missoula-based' },
    { state: 'MT', payer: 'PacificSource Montana',      notes: 'Wave 2 — Growing presence in MT market' },
    { state: 'CO', payer: 'Bright Health Colorado',     notes: 'Wave 2 — CO marketplace/commercial plan' },
    { state: 'CO', payer: 'Friday Health Plans',        notes: 'Wave 2 — Growing CO commercial plan' },
    { state: 'CO', payer: 'Kaiser Permanente Colorado', notes: 'Wave 2 — Major CO commercial payer' },
    { state: 'NM', payer: 'Lovelace Health Plan',       notes: 'Wave 2 — Major NM commercial plan, Albuquerque-based' },
    { state: 'NM', payer: 'True Health New Mexico',     notes: 'Wave 2 — NM commercial HMO' },
    { state: 'NM', payer: 'Ambetter of New Mexico',     notes: 'Wave 2 — NM marketplace commercial (Centene)' },
    { state: 'NV', payer: 'UnitedHealthcare Nevada',    notes: 'Wave 2 — Has Optum NV, add UHC commercial plans' },
    { state: 'NV', payer: 'Sierra Health & Life',       notes: 'Wave 2 — Major NV commercial HMO' },
    { state: 'AZ', payer: 'Banner University Health Plan', notes: 'Wave 2 — AZ regional commercial' },
    { state: 'AZ', payer: 'Ambetter of Arizona',        notes: 'Wave 2 — AZ marketplace plan (Centene)' },
    { state: 'OR', payer: 'Moda Health',                notes: 'Wave 2 — Follow up on existing in-review application' },
    { state: 'FL', payer: 'AvMed',                      notes: 'Wave 2 — FL commercial, BH-friendly' },
  ];

  try {
    // ── Find provider (Nageley Michel) ──
    const providers = await store.getAll('providers');
    const nageley = providers.find(p =>
      (p.firstName || '').toLowerCase().includes('nageley') ||
      (p.lastName || '').toLowerCase().includes('michel')
    );
    if (!nageley) { err('Provider Nageley Michel not found!'); return; }
    log(`Provider: ${nageley.firstName} ${nageley.lastName} (id=${nageley.id})`);

    // ── Find Doustan Shah (assigned staff) ──
    const users = await store.getAgencyUsers();
    const doustan = users.find(u => {
      const name = ((u.firstName || u.first_name || '') + ' ' + (u.lastName || u.last_name || '')).toLowerCase();
      return name.includes('doustan') || name.includes('dustan') || name.includes('shah');
    });
    const assignedToId = doustan ? doustan.id : null;
    const assignedToName = doustan ? `${doustan.firstName || doustan.first_name || ''} ${doustan.lastName || doustan.last_name || ''}`.trim() : 'Doustan Shah';
    log(`Assigned to: ${assignedToName} (id=${assignedToId || 'NOT FOUND — will assign by name'})`);

    // ── Load current apps to avoid duplicates ──
    const allApps = await store.getAll('applications', { force: true });
    const nageleyApps = allApps.filter(a =>
      String(a.providerId) === String(nageley.id) || a.providerId === nageley.id
    );
    log(`Current apps for Nageley: ${nageleyApps.length}`);

    // ── Load payer catalog for ID matching ──
    const allPayers = await store.getPayers();
    const payerMap = {};
    allPayers.forEach(p => { payerMap[(p.name || '').toLowerCase()] = p; });

    // ── Create applications ──
    let created = 0, skipped = 0;

    for (const row of apps) {
      const lookupName = row.payer.toLowerCase();
      const catalogPayer = payerMap[lookupName] ||
        allPayers.find(p => (p.name || '').toLowerCase().includes(lookupName) || lookupName.includes((p.name || '').toLowerCase()));

      // Skip if already exists for this state+payer
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
          wave: 2,
          assignedTo: assignedToId || '',
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

    // ── Send notification to admin + Doustan ──
    try {
      await store.sendNotification('status_change', {
        recipientEmail: '',
        recipientName: 'Admin',
        subject: `Wave 2: ${created} New Applications Created — Assigned to ${assignedToName}`,
        body: `${created} new credentialing applications have been created for Nageley Michel (Wave 2).\n\nStates: MT (3), CO (3), NM (3), NV (2), AZ (2), OR (1), FL (1)\nStatus: Planned\nAssigned to: ${assignedToName}\n\nLog in to Credentik to view and begin submissions.`,
        metadata: { wave: 2, created, assignedTo: assignedToId, provider: 'Nageley Michel' },
      });
      log('Notification sent to admin');
    } catch (e) { err('Admin notification failed: ' + e.message); }

    // Notify Doustan specifically if we found their email
    if (doustan && (doustan.email || doustan.emailAddress)) {
      try {
        await store.sendNotification('status_change', {
          recipientEmail: doustan.email || doustan.emailAddress || '',
          recipientName: assignedToName,
          subject: `You've been assigned ${created} new applications — Wave 2`,
          body: `Hi ${doustan.firstName || doustan.first_name || 'Doustan'},\n\n${created} new credentialing applications for Nageley Michel have been assigned to you.\n\nStates: MT, CO, NM, NV, AZ, OR, FL\nStatus: Planned — ready for submission\n\nPlease log in to Credentik to review and begin the enrollment process.\n\nThank you!`,
          metadata: { wave: 2, created, provider: 'Nageley Michel' },
        });
        log(`Notification sent to ${assignedToName}`);
      } catch (e) { err('Doustan notification failed: ' + e.message); }
    }

  } catch (e) {
    err('Script failed: ' + e.message);
    console.error(e);
  }
})();
