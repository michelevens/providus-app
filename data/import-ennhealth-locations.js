/**
 * Import Script: EnnHealth Practice Locations (Nageley Michel — Telehealth Virtual Offices)
 * Source: CAQH ProView practice locations
 * Run in browser console while logged in as EnnHealth agency.
 */
(async function importLocations() {
  'use strict';
  const log = (msg) => console.log(`%c[LOCATIONS] ${msg}`, 'color:#0891b2;font-weight:bold;');

  const locations = [
    {
      name: 'EnnHealth Phoenix (Virtual)',
      address: '101 North First Avenue 1078, Suite 2325',
      city: 'Phoenix', state: 'AZ', zip: '85003',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth Denver (Virtual)',
      address: '1905 Sherman Street 1169, Ste 200',
      city: 'Denver', state: 'CO', zip: '80203',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth Topeka (Virtual)',
      address: '800 SW Jackson St #1036, Suite 618',
      city: 'Topeka', state: 'KS', zip: '66612',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth Towson (Virtual)',
      address: '200 Washington Avenue PMB 1074, Floor 5',
      city: 'Towson', state: 'MD', zip: '21204',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth Las Vegas (Virtual)',
      address: '1050 E Flamingo Road PMB 2042, s107',
      city: 'Las Vegas', state: 'NV', zip: '89119',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth Albuquerque (Virtual)',
      address: '500 4th St NW #2306, Suite 102',
      city: 'Albuquerque', state: 'NM', zip: '87102',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth New York (Virtual)',
      address: '800 Third Avenue FRNT A #1366',
      city: 'New York', state: 'NY', zip: '10022',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth Hillsboro (Virtual)',
      address: '9620 NE Tanasbourne Dr Suite 300 #1007',
      city: 'Hillsboro', state: 'OR', zip: '97124',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth Dallas (Virtual)',
      address: '', // Address not provided in screenshots
      city: 'Dallas', state: 'TX', zip: '',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth Richmond (Virtual)',
      address: '701 E Franklin Street 1641, Suite 105',
      city: 'Richmond', state: 'VA', zip: '23219',
      type: 'telehealth',
    },
    {
      name: 'EnnHealth Seattle (Virtual)',
      address: '300 Lenora St. #954',
      city: 'Seattle', state: 'WA', zip: '98121',
      type: 'telehealth',
    },
  ];

  // Get org ID
  const orgs = await store.getAll('organizations');
  const org = orgs.find(o => o.name?.toLowerCase().includes('ennhealth')) || orgs[0];
  if (!org) { log('ERROR: No organization found'); return; }
  log(`Organization: ${org.name} (id=${org.id})`);

  // Check existing facilities
  const existing = await store.getFacilities();
  const existingNames = new Set(existing.map(f => f.name?.toLowerCase()));
  log(`Existing locations: ${existing.length}`);

  let created = 0, skipped = 0;

  for (const loc of locations) {
    if (existingNames.has(loc.name.toLowerCase())) {
      log(`  ⊘ SKIP: "${loc.name}" already exists`);
      skipped++;
      continue;
    }
    try {
      const result = await store.createFacility({
        name: loc.name,
        address: loc.address,
        city: loc.city,
        state: loc.state,
        zip: loc.zip,
        facility_type: loc.type,
        organization_id: org.id,
        status: 'active',
      });
      log(`  ✚ CREATED: "${loc.name}" → ${loc.city}, ${loc.state} ${loc.zip} (id=${result.id})`);
      created++;
    } catch (e) {
      console.error(`  ✗ FAILED: "${loc.name}" — ${e.message}`);
    }
  }

  log('═══════════════════════════════════════');
  log(`DONE — Created: ${created}, Skipped: ${skipped}`);
  log(`Total locations: ${existing.length + created}`);
  log('═══════════════════════════════════════');
})();
