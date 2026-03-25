/**
 * Import Script: EnnHealth Practice Locations (Nageley Michel — Telehealth Virtual Offices)
 * Source: CAQH ProView practice locations
 * Run in browser console while logged in as EnnHealth agency.
 */
(async function importLocations() {
  'use strict';
  const log = (msg) => console.log(`%c[LOCATIONS] ${msg}`, 'color:#0891b2;font-weight:bold;');

  const locations = [
    { name: 'EnnHealth Phoenix (Virtual)',      street: '101 North First Avenue 1078, Suite 2325', city: 'Phoenix',      state: 'AZ', zip: '85003' },
    { name: 'EnnHealth Denver (Virtual)',        street: '1905 Sherman Street 1169, Ste 200',      city: 'Denver',       state: 'CO', zip: '80203' },
    { name: 'EnnHealth Topeka (Virtual)',        street: '800 SW Jackson St #1036, Suite 618',     city: 'Topeka',       state: 'KS', zip: '66612' },
    { name: 'EnnHealth Towson (Virtual)',        street: '200 Washington Avenue PMB 1074, Floor 5', city: 'Towson',      state: 'MD', zip: '21204' },
    { name: 'EnnHealth Las Vegas (Virtual)',     street: '1050 E Flamingo Road PMB 2042, s107',    city: 'Las Vegas',    state: 'NV', zip: '89119' },
    { name: 'EnnHealth Albuquerque (Virtual)',   street: '500 4th St NW #2306, Suite 102',         city: 'Albuquerque',  state: 'NM', zip: '87102' },
    { name: 'EnnHealth New York (Virtual)',      street: '800 Third Avenue FRNT A #1366',          city: 'New York',     state: 'NY', zip: '10022' },
    { name: 'EnnHealth Hillsboro (Virtual)',     street: '9620 NE Tanasbourne Dr Suite 300 #1007', city: 'Hillsboro',    state: 'OR', zip: '97124' },
    { name: 'EnnHealth Dallas (Virtual)',        street: '',                                        city: 'Dallas',       state: 'TX', zip: '' },
    { name: 'EnnHealth Richmond (Virtual)',      street: '701 E Franklin Street 1641, Suite 105',  city: 'Richmond',     state: 'VA', zip: '23219' },
    { name: 'EnnHealth Seattle (Virtual)',       street: '300 Lenora St. #954',                    city: 'Seattle',      state: 'WA', zip: '98121' },
  ];

  // Check existing facilities
  const existing = await store.getFacilities();
  const existingList = Array.isArray(existing) ? existing : [];
  const existingNames = new Set(existingList.map(f => f.name?.toLowerCase()));
  log(`Existing locations: ${existingList.length}`);

  let created = 0, skipped = 0;

  for (const loc of locations) {
    if (existingNames.has(loc.name.toLowerCase())) {
      log(`  SKIP: "${loc.name}" already exists`);
      skipped++;
      continue;
    }
    try {
      const result = await store.createFacility({
        name: loc.name,
        street: loc.street,
        city: loc.city,
        state: loc.state,
        zip: loc.zip,
        facilityType: 'telehealth',
        status: 'active',
      });
      log(`  CREATED: "${loc.name}" → ${loc.city}, ${loc.state} ${loc.zip} (id=${result.id})`);
      created++;
    } catch (e) {
      console.error(`  FAILED: "${loc.name}" — ${e.message}`);
    }
  }

  log('═══════════════════════════════════════');
  log(`DONE — Created: ${created}, Skipped: ${skipped}`);
  log(`Total locations: ${existingList.length + created}`);
  log('═══════════════════════════════════════');
})();
