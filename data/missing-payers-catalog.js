/**
 * Supplemental Payers Catalog — Behavioral Health / Psychiatric Provider Credentialing
 * Generated: 2026-03-24
 *
 * These payers supplement the API-served catalog. They are merged into PAYER_CATALOG
 * at init time so the app always shows the full catalog, even before backend seeding.
 * IDs start at 100 to avoid conflicts with API-assigned IDs.
 *
 * Also runnable in browser console to persist to the backend (see bottom of file).
 */

export const SUPPLEMENTAL_PAYERS = [

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. BEHAVIORAL HEALTH CARVE-OUTS / SPECIALTY
  //    These are the most critical for behavioral health credentialing —
  //    many commercial plans delegate MH/SUD to these entities.
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 100, name: 'Optum Behavioral Health',          category: 'behavioral', parentOrg: 'UnitedHealth Group',         states: ['ALL'], notes: 'Manages BH benefits for UHC and many employer plans. Credentialing via Optum provider portal.', tags: ['behavioral_health', 'substance_use', 'must_have', 'high_volume', 'caqh_accepts'] },
  { id: 101, name: 'Carelon Behavioral Health',        category: 'behavioral', parentOrg: 'Elevance Health',            states: ['ALL'], notes: 'Formerly Beacon Health Options. Carve-out for Anthem/Elevance and many state Medicaid plans.', tags: ['behavioral_health', 'substance_use', 'must_have', 'high_volume', 'caqh_accepts'] },
  { id: 102, name: 'Magellan Healthcare',              category: 'behavioral', parentOrg: 'Centene Corporation',        states: ['ALL'], notes: 'Major BH carve-out. Acquired by Centene (2022). Manages MH/SUD for employers, state Medicaid, military.', tags: ['behavioral_health', 'substance_use', 'must_have', 'high_volume', 'caqh_accepts'] },
  { id: 103, name: 'Evernorth Behavioral Health',      category: 'behavioral', parentOrg: 'The Cigna Group',            states: ['ALL'], notes: 'Cigna behavioral health services arm. Credentialing via Cigna provider portal.', tags: ['behavioral_health', 'substance_use'] },
  { id: 104, name: 'Headway',                          category: 'behavioral', parentOrg: 'Headway',                    states: ['ALL'], notes: 'Tech-enabled credentialing/billing platform for therapists. Contracts with major payers on behalf of providers.', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'fast_credentialing', 'growing_market'] },
  { id: 105, name: 'Alma',                             category: 'behavioral', parentOrg: 'Alma',                       states: ['ALL'], notes: 'Membership-based network for mental health providers. Handles credentialing with payers.', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'fast_credentialing', 'growing_market'] },
  { id: 106, name: 'Lyra Health',                      category: 'behavioral', parentOrg: 'Lyra Health',                states: ['ALL'], notes: 'Employer-sponsored BH benefit. Contracts directly with providers for EAP/therapy.', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'no_referral_required'] },
  { id: 107, name: 'Spring Health',                    category: 'behavioral', parentOrg: 'Spring Health',              states: ['ALL'], notes: 'Employer-sponsored mental health platform. Credentials providers for its network.', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'no_referral_required'] },
  { id: 108, name: 'Lucet (New Directions)',            category: 'behavioral', parentOrg: 'Lucet',                      states: ['ALL'], notes: 'Formerly New Directions Behavioral Health. BH management for health plans and employers.', tags: ['behavioral_health', 'substance_use'] },
  { id: 109, name: 'Holman Enterprises (MHN)',          category: 'behavioral', parentOrg: 'Centene Corporation',        states: ['ALL'], notes: 'Managed Health Network — BH carve-out, especially in CA. Now under Centene/Magellan umbrella.', tags: ['behavioral_health', 'substance_use'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. VA / MILITARY / GOVERNMENT
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 120, name: 'VA CCN (Community Care Network)',   category: 'other',      parentOrg: 'U.S. Department of Veterans Affairs', states: ['ALL'], notes: 'VA Community Care Network — veterans referred to community providers. Administered by Optum (Regions 1-3) and TriWest (Regions 4-6).', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'portal_required', 'must_have', 'high_volume'] },
  { id: 121, name: 'TriWest Healthcare Alliance',      category: 'other',      parentOrg: 'TriWest Healthcare Alliance', states: ['ALL'], notes: 'Administers VA CCN Regions 4-6 (western US). Also formerly TRICARE West.', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'portal_required'] },
  { id: 122, name: 'Optum VA CCN',                     category: 'other',      parentOrg: 'UnitedHealth Group',         states: ['ALL'], notes: 'Administers VA CCN Regions 1-3 (eastern US). Separate credentialing from commercial Optum.', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'portal_required'] },
  { id: 123, name: 'CHAMPVA',                          category: 'other',      parentOrg: 'U.S. Department of Veterans Affairs', states: ['ALL'], notes: 'Civilian Health and Medical Program of the VA — for dependents of disabled veterans. Separate from TRICARE.', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'portal_required'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. EMPLOYEE ASSISTANCE PROGRAMS (EAP)
  //    Many BH providers credential with EAPs for short-term therapy referrals.
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 130, name: 'ComPsych',                         category: 'behavioral', parentOrg: 'ComPsych Corporation',       states: ['ALL'], notes: 'Largest EAP provider worldwide. Credentials MH providers for short-term EAP sessions.', tags: ['behavioral_health', 'substance_use', 'high_volume', 'no_referral_required'] },
  { id: 131, name: 'Carebridge (Optum EAP)',           category: 'behavioral', parentOrg: 'UnitedHealth Group',         states: ['ALL'], notes: 'Optum EAP services (formerly Optum EAP). Large employer EAP network.', tags: ['behavioral_health', 'substance_use', 'no_referral_required'] },
  { id: 132, name: 'Uprise Health',                    category: 'behavioral', parentOrg: 'Uprise Health',              states: ['ALL'], notes: 'EAP and behavioral health services. Formed from merger of IBH and MINES & Associates.', tags: ['behavioral_health', 'substance_use', 'no_referral_required'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MISSING BCBS PLANS
  //    Every state has a BCBS licensee. These are the ones not in the catalog.
  // ═══════════════════════════════════════════════════════════════════════════

  // --- BCBS Independent Licensees ---
  { id: 140, name: 'BCBS of Wyoming',                  category: 'bcbs_independent', parentOrg: 'BCBS of Wyoming',      states: ['WY'], notes: 'Only health insurer with BCBS license in WY.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 141, name: 'BCBS of Nebraska',                 category: 'bcbs_independent', parentOrg: 'BCBS of Nebraska',     states: ['NE'], notes: 'Also dba Nebraska Blue. Independent BCBS licensee.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 142, name: 'BCBS of North Dakota',             category: 'bcbs_independent', parentOrg: 'Noridian Mutual Insurance', states: ['ND'], notes: 'Independent BCBS licensee in ND.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 143, name: 'BCBS of Vermont',                  category: 'bcbs_independent', parentOrg: 'BCBS of Vermont',      states: ['VT'], notes: 'Independent BCBS licensee in VT.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 144, name: 'BCBS of Rhode Island',             category: 'bcbs_independent', parentOrg: 'BCBS of Rhode Island', states: ['RI'], notes: 'Independent BCBS licensee in RI.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 145, name: 'BCBS of Hawaii',                   category: 'bcbs_independent', parentOrg: 'HMSA (Hawaii Medical Service Association)', states: ['HI'], notes: 'HMSA operates as BCBS of Hawaii. Dominant insurer in HI.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 146, name: 'CareFirst BCBS',                   category: 'bcbs_independent', parentOrg: 'CareFirst Inc.',       states: ['MD', 'DC', 'VA'], notes: 'BCBS licensee for MD, DC, and Northern VA. Major mid-Atlantic plan.', tags: ['caqh_accepts', 'behavioral_health', 'high_volume'] },
  { id: 148, name: 'Capital BCBS',                     category: 'bcbs_independent', parentOrg: 'Capital BCBS',         states: ['PA'], notes: 'BCBS licensee for central PA and Lehigh Valley region.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 149, name: 'BCBS of Western New York',         category: 'bcbs_independent', parentOrg: 'Highmark Health',      states: ['NY'], notes: 'Highmark-affiliated BCBS for western NY (Buffalo area).', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 150, name: 'Excellus BCBS',                    category: 'bcbs_independent', parentOrg: 'Lifetime Healthcare Companies', states: ['NY'], notes: 'BCBS licensee for upstate/central NY (Rochester, Syracuse, Utica).', tags: ['caqh_accepts', 'behavioral_health', 'high_volume'] },
  { id: 151, name: 'BCBS of Kansas City', category: 'bcbs_independent', parentOrg: 'Blue KC',           states: ['MO', 'KS'], notes: 'BCBS licensee for greater KC metro area (both MO and KS sides).', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 152, name: 'BCBS of Arkansas',                 category: 'bcbs_independent', parentOrg: 'Arkansas BCBS',        states: ['AR'], notes: 'Independent BCBS licensee. Dominant insurer in AR.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 153, name: 'BCBS of Idaho',                    category: 'bcbs_independent', parentOrg: 'BCBS of Idaho',        states: ['ID'], notes: 'Independent BCBS licensee in ID.', tags: ['caqh_accepts', 'behavioral_health'] },

  // --- BCBS Anthem/Elevance (states not yet in catalog) ---
  { id: 160, name: 'Anthem BCBS of Colorado',          category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['CO'], notes: 'Elevance BCBS licensee in CO. Credential via Availity/Anthem portal.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 161, name: 'Anthem BCBS of Connecticut',       category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['CT'], notes: 'Elevance BCBS licensee in CT.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 162, name: 'Anthem BCBS of Indiana',           category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['IN'], notes: 'Elevance BCBS licensee in IN. Largest insurer in IN.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 163, name: 'Anthem BCBS of Kentucky',          category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['KY'], notes: 'Elevance BCBS licensee in KY.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 164, name: 'Anthem BCBS of Maine',             category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['ME'], notes: 'Elevance BCBS licensee in ME.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 165, name: 'Anthem BCBS of Missouri',          category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['MO'], notes: 'Elevance BCBS licensee in MO (excluding KC metro).', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 166, name: 'Anthem BCBS of Nevada',            category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['NV'], notes: 'Elevance BCBS licensee in NV.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 167, name: 'Anthem BCBS of New Hampshire',     category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['NH'], notes: 'Elevance BCBS licensee in NH.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 168, name: 'Anthem BCBS of New York',          category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['NY'], notes: 'Elevance BCBS licensee in NY (downstate/NYC area). Separate from Excellus and Highmark WNY.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 169, name: 'Anthem BCBS of Ohio',              category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['OH'], notes: 'Elevance BCBS licensee in OH.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 170, name: 'Anthem BCBS of Virginia',          category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['VA'], notes: 'Elevance BCBS licensee in VA (most of state excluding Northern VA/CareFirst territory).', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 171, name: 'Anthem BCBS of Wisconsin',         category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['WI'], notes: 'Elevance BCBS licensee in WI.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 172, name: 'Anthem BCBS of California',        category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['CA'], notes: 'Anthem Blue Cross (CA uses "Blue Cross" not "BCBS"). Largest commercial plan in CA.', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },
  { id: 173, name: 'Anthem BCBS of Georgia',           category: 'bcbs_anthem', parentOrg: 'Elevance Health',           states: ['GA'], notes: 'Elevance BCBS licensee in GA (alongside BCBS of GA which is also in catalog).', tags: ['caqh_accepts', 'behavioral_health', 'availity_enrolled', 'high_volume', 'telehealth_friendly'] },

  // --- BCBS HCSC (states not yet broken out) ---
  { id: 180, name: 'BCBS of Montana',                  category: 'bcbs_hcsc', parentOrg: 'HCSC',                       states: ['MT'], notes: 'HCSC division. BCBS licensee in MT.', tags: ['caqh_accepts', 'behavioral_health', 'high_volume'] },
  { id: 181, name: 'BCBS of New Mexico',               category: 'bcbs_hcsc', parentOrg: 'HCSC',                       states: ['NM'], notes: 'HCSC division. BCBS licensee in NM.', tags: ['caqh_accepts', 'behavioral_health', 'high_volume'] },
  { id: 182, name: 'BCBS of Oklahoma',                 category: 'bcbs_hcsc', parentOrg: 'HCSC',                       states: ['OK'], notes: 'HCSC division. BCBS licensee in OK.', tags: ['caqh_accepts', 'behavioral_health', 'high_volume'] },

  // --- BCBS Highmark (states not yet broken out) ---
  { id: 185, name: 'Highmark BCBS of Delaware',        category: 'bcbs_highmark', parentOrg: 'Highmark Health',         states: ['DE'], notes: 'Highmark operates BCBS in DE.', tags: ['caqh_accepts', 'behavioral_health', 'high_volume'] },
  { id: 186, name: 'Highmark BCBS WV', category: 'bcbs_highmark', parentOrg: 'Highmark Health',       states: ['WV'], notes: 'Highmark operates BCBS in WV.', tags: ['caqh_accepts', 'behavioral_health', 'high_volume'] },

  // --- Remaining BCBS ---
  { id: 190, name: 'BCBS of South Dakota (Wellmark)',   category: 'bcbs_independent', parentOrg: 'Wellmark Inc.',        states: ['SD'], notes: 'Wellmark operates as BCBS in both IA and SD. IA already in catalog as Wellmark BCBS.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 191, name: 'BCBS of Mississippi',              category: 'bcbs_independent', parentOrg: 'BCBS of Mississippi',  states: ['MS'], notes: 'Independent BCBS licensee. Dominant insurer in MS.', tags: ['caqh_accepts', 'behavioral_health'] },
  { id: 192, name: 'BCBS of Alaska',                   category: 'bcbs_independent', parentOrg: 'Premera BCBS',        states: ['AK'], notes: 'Operated by Premera. BCBS licensee in AK.', tags: ['caqh_accepts', 'behavioral_health'] },

  // ─── New Mexico ───
  { id: 193, name: 'Presbyterian Health Plan',         category: 'regional', parentOrg: 'Presbyterian Healthcare Services', states: ['NM'], notes: 'Largest health plan in New Mexico. Offers commercial, Medicare Advantage, and Centennial Care (Medicaid). Major payer for behavioral health in NM.', tags: ['must_have', 'high_volume', 'behavioral_health', 'substance_use', 'telehealth_friendly', 'caqh_accepts'] },
  { id: 194, name: 'Presbyterian Centennial Care',     category: 'medicaid_mco', parentOrg: 'Presbyterian Healthcare Services', states: ['NM'], notes: 'Presbyterian\'s Medicaid managed care plan under NM Centennial Care 2.0. Covers behavioral health, SUD, and telehealth.', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'medicaid_prerequisite', 'high_volume'] },
  { id: 195, name: 'Western Sky Community Care',       category: 'medicaid_mco', parentOrg: 'Centene Corporation', states: ['NM'], notes: 'Centene\'s Medicaid MCO in NM under Centennial Care 2.0.', tags: ['behavioral_health', 'substance_use', 'telehealth_friendly', 'medicaid_prerequisite'] },
  { id: 196, name: 'Blue Cross Blue Shield of NM',     category: 'bcbs_independent', parentOrg: 'HCSC', states: ['NM'], notes: 'BCBS licensee for NM. Operated by Health Care Service Corporation (HCSC).', tags: ['must_have', 'high_volume', 'caqh_accepts', 'behavioral_health', 'telehealth_friendly'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. STATE MEDICAID MANAGED CARE ORGANIZATIONS (MCOs)
  //    Behavioral health providers frequently credential with state Medicaid
  //    MCOs — these are the major ones not already in the catalog.
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Arizona ---
  { id: 200, name: 'Arizona Complete Health',           category: 'medicaid', parentOrg: 'Centene Corporation',          states: ['AZ'], notes: 'AZ AHCCCS Medicaid MCO (Centene). Includes behavioral health integration.', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 201, name: 'UnitedHealthcare Community Plan AZ', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['AZ'], notes: 'UHC Medicaid managed care in AZ.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },
  { id: 202, name: 'Care1st Health Plan Arizona',      category: 'medicaid', parentOrg: 'WellCare (Centene)',            states: ['AZ'], notes: 'AZ Medicaid MCO, now under Centene umbrella.', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },

  // --- California ---
  { id: 205, name: 'LA Care Health Plan',              category: 'medicaid', parentOrg: 'LA Care',                       states: ['CA'], notes: 'Largest public Medicaid health plan in US. Medi-Cal managed care in LA County.', tags: ['behavioral_health', 'medicaid_prerequisite', 'high_volume'] },
  { id: 206, name: 'Health Net',                       category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['CA'], notes: 'Major CA Medi-Cal managed care plan. Also commercial. Acquired by Centene.', tags: ['behavioral_health', 'medicaid_prerequisite', 'high_volume', 'substance_use'] },
  { id: 207, name: 'CalOptima',                        category: 'medicaid', parentOrg: 'CalOptima',                     states: ['CA'], notes: 'Orange County Medi-Cal managed care. County-organized health system.', tags: ['behavioral_health', 'medicaid_prerequisite', 'high_volume'] },
  { id: 208, name: 'Inland Empire Health Plan',        category: 'medicaid', parentOrg: 'IEHP',                          states: ['CA'], notes: 'Medi-Cal MCO for Riverside and San Bernardino counties.', tags: ['behavioral_health', 'medicaid_prerequisite', 'high_volume'] },
  { id: 209, name: 'Partnership HealthPlan of CA',     category: 'medicaid', parentOrg: 'Partnership HealthPlan',        states: ['CA'], notes: 'Medi-Cal managed care in Northern CA counties.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 210, name: 'San Francisco Health Plan',        category: 'medicaid', parentOrg: 'SFHP',                          states: ['CA'], notes: 'Medi-Cal managed care in San Francisco County.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Colorado ---
  { id: 215, name: 'Colorado Access',                  category: 'medicaid', parentOrg: 'Colorado Access',               states: ['CO'], notes: 'CO Medicaid managed care (RAE - Regional Accountable Entity).', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 216, name: 'Northeast Health Partners',        category: 'medicaid', parentOrg: 'Beacon Health Options (Carelon)', states: ['CO'], notes: 'CO RAE Region 2. Managed by Carelon.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Florida ---
  { id: 220, name: 'Staywell (WellCare)',              category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['FL'], notes: 'FL Medicaid managed care plan. WellCare/Centene brand in FL.', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 221, name: 'Prestige Health Choice',           category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['FL'], notes: 'FL Medicaid MCO under Centene umbrella.', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 222, name: 'UnitedHealthcare Community Plan FL', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['FL'], notes: 'UHC Medicaid managed care in FL.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },
  { id: 223, name: 'Aetna Better Health of FL',        category: 'medicaid', parentOrg: 'CVS Health / Aetna',            states: ['FL'], notes: 'Aetna Medicaid managed care in FL.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 224, name: 'Humana Medical Plan (FL Medicaid)', category: 'medicaid', parentOrg: 'Humana Inc.',                  states: ['FL'], notes: 'Humana Medicaid MCO in FL.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Georgia ---
  { id: 230, name: 'Peach State Health Plan',          category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['GA'], notes: 'GA Medicaid MCO (Centene/Ambetter). Major GA plan.', tags: ['behavioral_health', 'medicaid_prerequisite', 'high_volume', 'substance_use'] },
  { id: 231, name: 'Amerigroup Georgia',               category: 'medicaid', parentOrg: 'Elevance Health',              states: ['GA'], notes: 'GA Medicaid MCO under Elevance/Anthem.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 232, name: 'CareSource Georgia',               category: 'medicaid', parentOrg: 'CareSource',                   states: ['GA'], notes: 'GA Medicaid MCO.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Illinois ---
  { id: 235, name: 'Meridian Health Plan of IL',       category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['IL'], notes: 'IL Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 236, name: 'CountyCare',                       category: 'medicaid', parentOrg: 'Cook County Health',            states: ['IL'], notes: 'Cook County IL Medicaid managed care.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Indiana ---
  { id: 238, name: 'MDwise',                           category: 'medicaid', parentOrg: 'MDwise Inc.',                   states: ['IN'], notes: 'IN Medicaid managed care plan (Hoosier Healthwise).', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Louisiana ---
  { id: 240, name: 'Louisiana Healthcare Connections',  category: 'medicaid', parentOrg: 'Centene Corporation',          states: ['LA'], notes: 'LA Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 241, name: 'Healthy Blue Louisiana',           category: 'medicaid', parentOrg: 'Elevance Health',              states: ['LA'], notes: 'LA Medicaid MCO under Elevance. (Note: "Healthy Blue" brand also exists in other states.)', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 242, name: 'Aetna Better Health of LA',        category: 'medicaid', parentOrg: 'CVS Health / Aetna',            states: ['LA'], notes: 'Aetna Medicaid managed care in LA.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 243, name: 'UnitedHealthcare Community Plan LA', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['LA'], notes: 'UHC Medicaid managed care in LA.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },

  // --- Michigan ---
  { id: 245, name: 'Meridian Health Plan of MI',       category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['MI'], notes: 'MI Medicaid MCO (Centene). One of the largest in MI.', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 246, name: 'HAP (Health Alliance Plan)',       category: 'medicaid', parentOrg: 'Henry Ford Health',             states: ['MI'], notes: 'MI Medicaid MCO affiliated with Henry Ford Health System.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 247, name: 'McLaren Health Plan',              category: 'medicaid', parentOrg: 'McLaren Health Care',           states: ['MI'], notes: 'MI Medicaid MCO.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Nevada ---
  { id: 250, name: 'SilverSummit Healthplan',          category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['NV'], notes: 'NV Medicaid MCO (Centene). Major BH provider panel in NV.', tags: ['behavioral_health', 'medicaid_prerequisite', 'high_volume', 'substance_use'] },
  { id: 251, name: 'UnitedHealthcare Community Plan NV', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['NV'], notes: 'UHC Medicaid managed care in NV.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },

  // --- New Jersey ---
  { id: 255, name: 'Amerigroup New Jersey',            category: 'medicaid', parentOrg: 'Elevance Health',              states: ['NJ'], notes: 'NJ Medicaid MCO under Elevance.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 256, name: 'UnitedHealthcare Community Plan NJ', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['NJ'], notes: 'UHC Medicaid managed care in NJ.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },
  { id: 257, name: 'WellCare of NJ',                   category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['NJ'], notes: 'NJ Medicaid MCO (WellCare/Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 258, name: 'Aetna Better Health of NJ',        category: 'medicaid', parentOrg: 'CVS Health / Aetna',            states: ['NJ'], notes: 'Aetna Medicaid managed care in NJ.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- New York ---
  { id: 260, name: 'MetroPlus Health Plan',            category: 'medicaid', parentOrg: 'NYC Health + Hospitals',        states: ['NY'], notes: 'NYC public Medicaid managed care plan.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 261, name: 'Affinity Health Plan',             category: 'medicaid', parentOrg: 'Molina Healthcare',             states: ['NY'], notes: 'NY Medicaid MCO. Acquired by Molina Healthcare.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 262, name: 'Amida Care',                       category: 'medicaid', parentOrg: 'Amida Care',                    states: ['NY'], notes: 'NY Medicaid special needs plan (HIV/chronic conditions). Significant BH component.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- North Carolina ---
  { id: 265, name: 'AmeriHealth Caritas NC',           category: 'medicaid', parentOrg: 'AmeriHealth Caritas',           states: ['NC'], notes: 'NC Medicaid managed care (launched 2024).', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 266, name: 'UnitedHealthcare Community Plan NC', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['NC'], notes: 'UHC Medicaid managed care in NC.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },

  // --- Ohio ---
  { id: 270, name: 'Buckeye Health Plan',              category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['OH'], notes: 'OH Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'high_volume', 'substance_use'] },
  { id: 271, name: 'UnitedHealthcare Community Plan OH', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['OH'], notes: 'UHC Medicaid managed care in OH.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },
  { id: 272, name: 'AmeriHealth Caritas Ohio',         category: 'medicaid', parentOrg: 'AmeriHealth Caritas',           states: ['OH'], notes: 'OH Medicaid MCO.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Oregon ---
  { id: 275, name: 'AllCare Health',                   category: 'medicaid', parentOrg: 'AllCare Health',                states: ['OR'], notes: 'OR Coordinated Care Organization (CCO) for Medicaid in Southern OR.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 276, name: 'CareOregon',                       category: 'medicaid', parentOrg: 'CareOregon',                   states: ['OR'], notes: 'Major OR Medicaid managed care organization (CCO partner).', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 277, name: 'PacificSource Community Solutions', category: 'medicaid', parentOrg: 'PacificSource Health Plans',   states: ['OR'], notes: 'OR CCO Medicaid managed care.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 278, name: 'Trillium Community Health Plan',   category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['OR'], notes: 'OR CCO Medicaid managed care (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },

  // --- Pennsylvania ---
  { id: 280, name: 'UPMC for You',                     category: 'medicaid', parentOrg: 'UPMC Health Plan',              states: ['PA'], notes: 'PA Medicaid managed care. UPMC system plan. (Note: UPMC Health Plan commercial is already in catalog.)', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 281, name: 'AmeriHealth Caritas PA',           category: 'medicaid', parentOrg: 'AmeriHealth Caritas',           states: ['PA'], notes: 'PA Medicaid MCO (HealthChoices).', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 282, name: 'Keystone First',                   category: 'medicaid', parentOrg: 'AmeriHealth Caritas',           states: ['PA'], notes: 'PA Medicaid MCO for Philadelphia region.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Tennessee ---
  { id: 285, name: 'TennCare Select (UHC)',            category: 'medicaid', parentOrg: 'UnitedHealth Group',            states: ['TN'], notes: 'TN TennCare Medicaid managed care (UHC).', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },
  { id: 286, name: 'Amerigroup Tennessee',             category: 'medicaid', parentOrg: 'Elevance Health',              states: ['TN'], notes: 'TN TennCare Medicaid MCO.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Texas ---
  { id: 290, name: 'UnitedHealthcare Community Plan TX', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['TX'], notes: 'UHC Medicaid managed care (STAR/STAR+PLUS) in TX.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },
  { id: 291, name: 'Amerigroup Texas',                 category: 'medicaid', parentOrg: 'Elevance Health',              states: ['TX'], notes: 'TX Medicaid MCO (STAR/STAR+PLUS/CHIP).', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 292, name: 'El Paso Health',                   category: 'medicaid', parentOrg: 'El Paso Health',               states: ['TX'], notes: 'TX Medicaid MCO for El Paso service area.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 293, name: 'Community Health Choice',          category: 'medicaid', parentOrg: 'Community Health Choice',       states: ['TX'], notes: 'TX Medicaid/CHIP MCO in Houston area.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 294, name: 'Dell Children\'s Health Plan',     category: 'medicaid', parentOrg: 'Seton/Ascension',              states: ['TX'], notes: 'TX Medicaid MCO (STAR) in Central TX.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 295, name: 'Driscoll Health Plan',             category: 'medicaid', parentOrg: 'Driscoll Health System',       states: ['TX'], notes: 'TX Medicaid/CHIP MCO in South TX (Corpus Christi area).', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 296, name: 'Texas Children\'s Health Plan',    category: 'medicaid', parentOrg: 'Texas Children\'s Hospital',   states: ['TX'], notes: 'TX Medicaid/CHIP MCO in Houston area.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 297, name: 'Cook Children\'s Health Plan',     category: 'medicaid', parentOrg: 'Cook Children\'s Medical Center', states: ['TX'], notes: 'TX Medicaid/CHIP MCO in DFW/North TX area.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 298, name: 'Parkland Community Health Plan',   category: 'medicaid', parentOrg: 'Parkland Health',              states: ['TX'], notes: 'TX Medicaid/CHIP MCO in Dallas County.', tags: ['behavioral_health', 'medicaid_prerequisite'] },

  // --- Virginia ---
  { id: 300, name: 'Aetna Better Health of VA',        category: 'medicaid', parentOrg: 'CVS Health / Aetna',            states: ['VA'], notes: 'VA Medicaid MCO.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 301, name: 'UnitedHealthcare Community Plan VA', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['VA'], notes: 'UHC Medicaid managed care in VA.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },

  // --- Washington ---
  { id: 305, name: 'Amerigroup Washington',            category: 'medicaid', parentOrg: 'Elevance Health',              states: ['WA'], notes: 'WA Apple Health (Medicaid) MCO.', tags: ['behavioral_health', 'medicaid_prerequisite'] },
  { id: 306, name: 'UnitedHealthcare Community Plan WA', category: 'medicaid', parentOrg: 'UnitedHealth Group',          states: ['WA'], notes: 'UHC Medicaid managed care in WA.', tags: ['behavioral_health', 'medicaid_prerequisite', 'telehealth_friendly'] },

  // --- Multi-state Medicaid MCOs (Amerigroup brand) ---
  { id: 310, name: 'Amerigroup',                       category: 'medicaid', parentOrg: 'Elevance Health',              states: ['DC', 'FL', 'GA', 'IA', 'KS', 'LA', 'MD', 'NC', 'NJ', 'NM', 'NV', 'NY', 'OH', 'TN', 'TX', 'VA', 'WA', 'WI'], notes: 'Elevance Medicaid brand in 18+ states. Credential centrally but contracts are state-specific.', tags: ['behavioral_health', 'medicaid_prerequisite', 'high_volume'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. REGIONAL / COMMERCIAL PLANS NOT IN CATALOG
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 400, name: 'Devoted Health',                   category: 'regional', parentOrg: 'Devoted Health',               states: ['FL', 'TX', 'AZ', 'OH', 'IL', 'SC', 'AL', 'GA'], notes: 'Medicare Advantage focused. Growing rapidly. BH credentialing via Availity.', tags: ['medicare_advantage', 'growing_market', 'telehealth_friendly'] },
  { id: 401, name: 'Clover Health',                    category: 'regional', parentOrg: 'Clover Health Investments',    states: ['NJ', 'GA', 'AZ', 'PA', 'SC', 'TN', 'TX', 'MS'], notes: 'Medicare Advantage plan. Tech-driven.', tags: ['medicare_advantage', 'growing_market', 'telehealth_friendly'] },
  { id: 402, name: 'Alignment Health',                 category: 'regional', parentOrg: 'Alignment Healthcare',         states: ['CA', 'NC', 'NV', 'AZ'], notes: 'Medicare Advantage plan focused on seniors. Growing BH network.', tags: ['behavioral_health'] },
  { id: 403, name: 'Bright Health',                    category: 'regional', parentOrg: 'Bright Health Group',          states: ['FL', 'TX', 'CA'], notes: 'ACA marketplace plan. Reduced footprint but still active in select markets.', tags: ['behavioral_health'] },
  { id: 404, name: 'Friday Health Plans',              category: 'regional', parentOrg: 'Friday Health Plans',          states: ['CO', 'NV', 'TX'], notes: 'ACA marketplace plan in select western states.', tags: ['behavioral_health'] },
  { id: 405, name: 'SelectHealth',                     category: 'regional', parentOrg: 'Intermountain Health',         states: ['UT', 'ID', 'NV'], notes: 'Intermountain Health affiliated plan. Strong in UT market.', tags: ['behavioral_health', 'telehealth_friendly'] },
  { id: 406, name: 'Prominence Health Plan',           category: 'regional', parentOrg: 'Prominence Health Plan',       states: ['NV', 'TX'], notes: 'Regional plan in NV and TX.', tags: ['behavioral_health', 'panel_often_closed'] },
  { id: 407, name: 'PacificSource Health Plans',       category: 'regional', parentOrg: 'PacificSource',                states: ['OR', 'ID', 'MT'], notes: 'Regional commercial and Medicare plan in Pacific NW.', tags: ['behavioral_health', 'telehealth_friendly'] },
  { id: 408, name: 'Quartz Health Solutions',          category: 'regional', parentOrg: 'Quartz Health Solutions',      states: ['WI', 'MN', 'IL', 'IA'], notes: 'Regional plan affiliated with UW Health and Gundersen Health.', tags: ['behavioral_health'] },
  { id: 409, name: 'PreferredOne',                     category: 'regional', parentOrg: 'Fairview Health Services',     states: ['MN'], notes: 'MN regional plan. Significant employer group market.', tags: ['behavioral_health'] },
  { id: 410, name: 'Medica',                           category: 'regional', parentOrg: 'Medica',                       states: ['MN', 'WI', 'ND', 'SD', 'IA', 'NE', 'KS', 'OK', 'MO'], notes: 'Upper Midwest regional plan. Commercial, Medicare, Medicaid.', tags: ['behavioral_health'] },
  { id: 411, name: 'Sanford Health Plan',              category: 'regional', parentOrg: 'Sanford Health',               states: ['SD', 'ND', 'MN', 'IA'], notes: 'Health system plan in upper Midwest.', tags: ['behavioral_health'] },
  { id: 412, name: 'GEHA',                             category: 'regional', parentOrg: 'GEHA',                         states: ['ALL'], notes: 'Government Employees Health Association. Federal employee plan (FEHB). Nationwide.', tags: ['behavioral_health', 'telehealth_friendly', 'high_volume'] },
  { id: 413, name: 'Dean Health Plan',                 category: 'regional', parentOrg: 'Quartz Health Solutions',      states: ['WI'], notes: 'WI regional plan, now Quartz brand.', tags: ['behavioral_health'] },
  { id: 414, name: 'Group Health Cooperative of South Central WI', category: 'regional', parentOrg: 'GHC-SCW',          states: ['WI'], notes: 'WI cooperative health plan.', tags: ['behavioral_health'] },
  { id: 415, name: 'Physicians Health Plan',           category: 'regional', parentOrg: 'Sparrow Health System',        states: ['MI'], notes: 'Mid-Michigan regional plan.', tags: ['behavioral_health'] },
  { id: 417, name: 'Blue Care Network',                category: 'regional', parentOrg: 'BCBS of Michigan',             states: ['MI'], notes: 'HMO affiliate of BCBS Michigan. Separate credentialing from BCBS MI PPO.', tags: ['behavioral_health'] },
  { id: 418, name: 'Geisinger Health Plan',            category: 'regional', parentOrg: 'Risant Health (Kaiser)',       states: ['PA', 'NJ'], notes: 'Central/NE PA health system plan. Acquired by Kaiser/Risant.', tags: ['behavioral_health'] },
  { id: 419, name: 'Point32Health (Harvard Pilgrim + Tufts merged)', category: 'regional', parentOrg: 'Point32Health',  states: ['MA', 'CT', 'NH', 'ME'], notes: 'Parent of Harvard Pilgrim and Tufts Health Plan. May credential under parent org for some products.', tags: ['behavioral_health'] },
  { id: 420, name: 'Neighborhood Health Plan of RI',   category: 'regional', parentOrg: 'Neighborhood Health Plan of RI', states: ['RI'], notes: 'RI Medicaid and commercial plan.', tags: ['behavioral_health'] },
  { id: 421, name: 'Community Health Options',         category: 'regional', parentOrg: 'Maine Community Health Options', states: ['ME'], notes: 'ME ACA co-op plan.', tags: ['behavioral_health'] },
  { id: 422, name: 'Sentara Health Plans',             category: 'regional', parentOrg: 'Sentara Healthcare',           states: ['VA', 'NC'], notes: 'VA/NC health system plan. Commercial and Medicare Advantage.', tags: ['behavioral_health'] },
  { id: 423, name: 'Aultcare',                         category: 'regional', parentOrg: 'Aultman Health Foundation',    states: ['OH'], notes: 'NE Ohio regional plan.', tags: ['behavioral_health'] },
  { id: 424, name: 'SummaCare',                        category: 'regional', parentOrg: 'Summa Health',                 states: ['OH'], notes: 'NE Ohio (Akron area) regional plan.', tags: ['behavioral_health'] },
  { id: 426, name: 'Allwell (Centene)',                 category: 'regional', parentOrg: 'Centene Corporation',          states: ['ALL'], notes: 'Centene Medicare Advantage brand in multiple states.', tags: ['medicare_advantage', 'behavioral_health'] },
  { id: 427, name: 'Absolute Total Care',              category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['SC'], notes: 'SC Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 428, name: 'Home State Health',                category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['MO'], notes: 'MO Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 429, name: 'Magnolia Health',                  category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['MS'], notes: 'MS Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 430, name: 'Sunflower Health Plan',            category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['KS'], notes: 'KS Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 431, name: 'Granite State Health Plan',        category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['NH'], notes: 'NH Medicaid MCO (Centene/Ambetter).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 432, name: 'NH Healthy Families',              category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['NH'], notes: 'NH Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 434, name: 'Western Sky Community Care',       category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['NM'], notes: 'NM Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },
  { id: 435, name: 'Managed Health Services (IN)',     category: 'medicaid', parentOrg: 'Centene Corporation',           states: ['IN'], notes: 'IN Medicaid MCO (Centene).', tags: ['behavioral_health', 'medicaid_prerequisite', 'substance_use'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. MEDICARE ADVANTAGE PLANS (not already covered)
  //    BH providers often credential separately with MA plans.
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 450, name: 'Wellcare Medicare (Centene)',       category: 'regional', parentOrg: 'Centene Corporation',           states: ['ALL'], notes: 'WellCare Medicare Advantage products (distinct from Medicaid WellCare).', tags: ['medicare_advantage', 'high_volume', 'behavioral_health'] },
  { id: 451, name: 'Aetna Medicare',                   category: 'regional', parentOrg: 'CVS Health / Aetna',            states: ['ALL'], notes: 'Aetna Medicare Advantage. Separate credentialing from commercial Aetna in some markets.', tags: ['medicare_advantage', 'high_volume', 'behavioral_health'] },
  { id: 452, name: 'Humana Medicare',                  category: 'regional', parentOrg: 'Humana Inc.',                   states: ['ALL'], notes: 'Humana Medicare Advantage. Largest MA plan in many states.', tags: ['medicare_advantage', 'high_volume', 'behavioral_health'] },
  { id: 453, name: 'UnitedHealthcare Medicare (AARP)', category: 'regional', parentOrg: 'UnitedHealth Group',            states: ['ALL'], notes: 'UHC Medicare Advantage (AARP branded). Largest MA plan nationally.', tags: ['medicare_advantage', 'high_volume', 'behavioral_health'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. WORKERS COMPENSATION / OCCUPATIONAL HEALTH
  //    Relevant when BH providers treat work-related PTSD, stress, etc.
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 470, name: 'First Health Network',             category: 'other', parentOrg: 'Aetna / CVS Health',               states: ['ALL'], notes: 'PPO network used by many workers comp and auto insurers. BH providers credential to access WC referrals.', tags: ['behavioral_health', 'substance_use', 'paper_application'] },
  { id: 471, name: 'Coventry Workers Comp',            category: 'other', parentOrg: 'Aetna / CVS Health',               states: ['ALL'], notes: 'Workers comp network (Coventry Health Care / First Health). Managed by Aetna.', tags: ['behavioral_health', 'substance_use', 'paper_application'] },
  { id: 472, name: 'Corvel Corporation',               category: 'other', parentOrg: 'CorVel Corporation',               states: ['ALL'], notes: 'Workers comp managed care. Credentials BH providers for work-related claims.', tags: ['behavioral_health', 'substance_use', 'paper_application'] },
  { id: 473, name: 'The Hartford',                     category: 'other', parentOrg: 'The Hartford Financial Services',  states: ['ALL'], notes: 'Major workers comp insurer. BH claims for workplace PTSD/stress.', tags: ['behavioral_health', 'substance_use', 'paper_application'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. ADDITIONAL NATIONAL / MULTI-STATE PLANS
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 491, name: 'MultiPlan',                        category: 'other',    parentOrg: 'MultiPlan Corporation',         states: ['ALL'], notes: 'Not an insurer — PPO network rental. Many small payers access providers through MultiPlan. Credentialing with MultiPlan covers hundreds of small plans.', tags: ['high_volume', 'fast_credentialing'] },
  { id: 492, name: 'Three Rivers Provider Network (TRPN)', category: 'other', parentOrg: 'TRPN',                        states: ['ALL'], notes: 'PPO network rental. Similar to MultiPlan — credentialing here covers many small employer plans.', tags: ['high_volume', 'fast_credentialing'] },
  { id: 493, name: 'PHCS (Private Healthcare Systems)', category: 'other',   parentOrg: 'MultiPlan Corporation',        states: ['ALL'], notes: 'Part of MultiPlan network. Some payers still reference PHCS for credentialing.', tags: ['high_volume', 'fast_credentialing'] },
  { id: 494, name: 'Zelis (formerly Stratose/HST)',    category: 'other',    parentOrg: 'Zelis Healthcare',              states: ['ALL'], notes: 'Network access / claims management. Some BH providers credential through Zelis network.', tags: ['high_volume', 'fast_credentialing'] },
  { id: 495, name: 'Imagine Health',                   category: 'other',    parentOrg: 'Imagine Health',                states: ['ALL'], notes: 'Narrow-network plan sold to self-insured employers. Credentials BH providers directly.', tags: ['high_volume', 'fast_credentialing'] },
];

// ── Summary Statistics ──
// Behavioral Health Carve-outs / EAP:  13 payers (ids 100-109, 130-132)
// VA / Military / Government:           4 payers (ids 120-123)
// Missing BCBS Plans:                  28 payers (ids 140-192, excluding duplicates)
// State Medicaid MCOs:                 57 payers (ids 200-435)
// Regional / Commercial:              27 payers (ids 400-435)
// Medicare Advantage:                   4 payers (ids 450-453)
// Workers Comp / Networks:              4 payers (ids 470-473)
// PPO Networks / Other:                 4 payers (ids 491-495)
// ──────────────────────────────────────────────
// TOTAL:                             ~141 new payers (after removing duplicates with existing catalog)

// ── Browser Console Seed (optional — persists to backend) ──
// To persist these payers to the API, run in browser console:
//   import('./data/missing-payers-catalog.js').then(m => m.seedToBackend())

export async function seedToBackend() {
  const log = (msg) => console.log(`%c[SEED] ${msg}`, 'color:#059669;font-weight:bold;');

  log(`Starting import of ${SUPPLEMENTAL_PAYERS.length} payers...`);

  const existing = await store.getPayers();
  const existingNames = new Set(existing.map(p => p.name.toLowerCase()));
  log(`Current catalog has ${existing.length} payers.`);

  let created = 0, skipped = 0, failed = 0;

  for (const payer of SUPPLEMENTAL_PAYERS) {
    if (existingNames.has(payer.name.toLowerCase())) {
      log(`  ⊘ SKIP: "${payer.name}" already exists`);
      skipped++;
      continue;
    }
    try {
      const { id, ...data } = payer;
      const result = await store.createPayer(data);
      log(`  ✚ CREATED: "${payer.name}" → id=${result.id} (${payer.category})`);
      created++;
    } catch (e) {
      console.error(`  ✗ FAILED: "${payer.name}" — ${e.message}`);
      failed++;
    }
  }

  log('═══════════════════════════════════════════════════');
  log(`SEED COMPLETE — Created: ${created}, Skipped: ${skipped}, Failed: ${failed}`);
  log(`Catalog now has ${existing.length + created} payers total.`);
  log('═══════════════════════════════════════════════════');
}
