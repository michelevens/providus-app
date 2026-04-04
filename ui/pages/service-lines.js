// ui/pages/service-lines.js — Lazy-loaded service lines data + renderer
// Auto-extracted from app.js for performance (1,750+ lines of service line data)

const { escHtml, escAttr, formatDateDisplay } = window._credentik;

const SERVICE_LINES = [
  {
    id: 'psych',
    name: 'Psychiatric Telehealth',
    status: 'active',
    icon: '&#129504;',
    color: 'var(--teal)',
    summary: 'Core service line — psychiatric medication management and therapy via telehealth.',
    targetPatient: 'Adults with depression, anxiety, PTSD, bipolar disorder, ADHD, and other psychiatric conditions.',
    revenueModel: 'Insurance-based with some cash-pay. High-frequency follow-ups (monthly).',
    annualRevenuePerPatient: '$1,800 - $3,600',
    visitFrequency: 'Monthly (med management), biweekly (acute)',
    billingCodes: [
      { code: '99213', desc: 'Established patient, low-moderate complexity', rate: '$90 - $130' },
      { code: '99214', desc: 'Established patient, moderate-high complexity', rate: '$130 - $190' },
      { code: '99215', desc: 'Established patient, high complexity', rate: '$180 - $250' },
      { code: '99205', desc: 'New patient, high complexity', rate: '$250 - $350' },
      { code: '90833', desc: 'Psychotherapy add-on, 30 min (with E/M)', rate: '$60 - $80' },
      { code: '90836', desc: 'Psychotherapy add-on, 45 min (with E/M)', rate: '$85 - $110' },
      { code: '99490', desc: 'Chronic care management, 20+ min/month', rate: '$42 - $65' },
    ],
    clinicalConsiderations: [
      'Controlled substance prescribing varies by state — some require initial in-person visit',
      'DEA registration needed per state for Schedule II-V',
      'Collaborative practice agreements required in restricted-practice states',
      'Document medical necessity for psychotherapy add-on codes',
      'Telehealth modifiers: 95 (synchronous), GT, or place of service 10',
    ],
    credentialingNotes: 'Standard credentialing with all major payers. PMHNP or FNP with psych experience accepted. Avg 60-120 days.',
    marketDemand: 'Very High — 1 in 5 US adults experience mental illness. Severe provider shortage nationally.',
  },
  {
    id: 'weight',
    name: 'Weight Management / GLP-1s',
    status: 'planned',
    icon: '&#9878;',
    color: '#22c55e',
    summary: 'Prescribe and manage GLP-1 receptor agonists (semaglutide, tirzepatide) for weight loss alongside lifestyle counseling. Natural overlap with psych patients experiencing medication-related weight gain.',
    targetPatient: 'Adults with BMI ≥30 (or ≥27 with comorbidity). High overlap: psych patients on atypical antipsychotics, mood stabilizers, SSRIs causing weight gain.',
    revenueModel: 'Mixed insurance + cash-pay. Many patients pay out-of-pocket for GLP-1 programs ($300-500/mo). High retention — patients stay 12-18+ months.',
    annualRevenuePerPatient: '$3,600 - $6,000 (cash-pay programs) / $1,800 - $2,400 (insurance)',
    visitFrequency: 'Monthly follow-ups (titration), then every 2-3 months (maintenance)',
    billingCodes: [
      { code: '99213', desc: 'Follow-up weight management visit', rate: '$90 - $130' },
      { code: '99214', desc: 'Weight management, moderate complexity (comorbidities)', rate: '$130 - $190' },
      { code: '99205', desc: 'New patient comprehensive weight assessment', rate: '$250 - $350' },
      { code: '99401', desc: 'Preventive counseling, 15 min', rate: '$35 - $50' },
      { code: '99402', desc: 'Preventive counseling, 30 min', rate: '$60 - $80' },
      { code: 'G0473', desc: 'Intensive behavioral therapy for obesity (Medicare)', rate: '$25 - $30' },
      { code: 'Z68.3x', desc: 'BMI 30-39.9 (ICD-10 supporting dx)', rate: 'Diagnosis code' },
      { code: 'E66.01', desc: 'Morbid obesity due to excess calories', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'GLP-1s are NOT controlled substances — no DEA issues',
      'Prior authorization often required for insurance-covered GLP-1s',
      'Monitor for pancreatitis, gallbladder disease, thyroid C-cell tumors (MTC)',
      'Contraindicated in patients with personal/family history of medullary thyroid carcinoma',
      'Drug interactions: may affect absorption of oral medications (psych meds)',
      'Patients on insulin/sulfonylureas need dose adjustment to prevent hypoglycemia',
      'Cash-pay model avoids PA hassle — compounded semaglutide is popular but check state rules',
      'Psych angle: address emotional eating, body image, relationship between weight and mood',
    ],
    credentialingNotes: 'FNP scope covers weight management. No additional certification required. Some payers credential under "obesity medicine" specialty. Can bill same payers as psych — no separate credentialing needed for existing payers.',
    marketDemand: 'Extremely High — 42% of US adults are obese. GLP-1 market projected at $100B+ by 2030. Patient demand far exceeds provider supply.',
  },
  {
    id: 'mat',
    name: 'Medication-Assisted Treatment (MAT)',
    status: 'planned',
    icon: '&#9883;',
    color: '#8b5cf6',
    summary: 'Buprenorphine (Suboxone) prescribing for opioid use disorder. Natural extension for dual-diagnosis psych patients. X-waiver requirement eliminated in 2023.',
    targetPatient: 'Adults with opioid use disorder, often comorbid with depression, anxiety, PTSD. Dual-diagnosis patients already in psych panel.',
    revenueModel: 'Insurance-based. Premium reimbursement rates — payers incentivize MAT access. Chronic model with long retention (years).',
    annualRevenuePerPatient: '$4,000 - $7,200',
    visitFrequency: 'Weekly (induction), biweekly (stabilization), monthly (maintenance)',
    billingCodes: [
      { code: '99213', desc: 'MAT follow-up, established patient', rate: '$90 - $130' },
      { code: '99214', desc: 'MAT follow-up, moderate complexity', rate: '$130 - $190' },
      { code: '99205', desc: 'New patient MAT evaluation', rate: '$250 - $350' },
      { code: 'H0020', desc: 'Alcohol/drug services; methadone administration', rate: '$8 - $15/day' },
      { code: 'H0033', desc: 'Oral medication administration, per dose', rate: '$5 - $12' },
      { code: 'G2086', desc: 'Office-based opioid treatment, new patient (monthly bundle)', rate: '$155 - $175' },
      { code: 'G2087', desc: 'Office-based opioid treatment, established (monthly bundle)', rate: '$115 - $135' },
      { code: '99408', desc: 'SBIRT screening, 15-30 min', rate: '$34 - $45' },
    ],
    clinicalConsiderations: [
      'X-waiver requirement eliminated Jan 2023 — all DEA-registered providers can prescribe buprenorphine',
      'Still need DEA Schedule III registration (buprenorphine is Schedule III)',
      'Urine drug screening at each visit recommended (bill separately)',
      'PDMP check required before each prescription in most states',
      'Strong integration with psych — treat both the substance use and underlying mental health',
      'Consider naloxone co-prescribing (often required)',
      'Telehealth flexibilities for MAT extended — check state-specific rules on initial visit',
      'Some states require treatment plans and documentation beyond standard E/M',
    ],
    credentialingNotes: 'FNP/PMHNP scope covers MAT in most states. No separate certification required since X-waiver elimination. Some payers have specific MAT provider enrollment. Medicaid is a major payer for this population.',
    marketDemand: 'High — 2.7M Americans have opioid use disorder. Only 22% receive any treatment. Massive access gap, especially in rural and underserved areas via telehealth.',
  },
  {
    id: 'hormonal',
    name: 'Hormonal Health / HRT',
    status: 'planned',
    icon: '&#9792;',
    color: '#ec4899',
    summary: 'Hormone replacement therapy for perimenopause/menopause. Many women 40-55 present to psychiatry with anxiety, depression, insomnia, and brain fog that is actually hormonal.',
    targetPatient: 'Women 40-65 experiencing perimenopause/menopause symptoms. Often misdiagnosed as psychiatric conditions.',
    revenueModel: 'Mixed insurance + cash-pay. High-value patients with quarterly follow-ups + labs. Cash-pay consults $150-250.',
    annualRevenuePerPatient: '$1,200 - $3,000',
    visitFrequency: 'Quarterly follow-ups + initial comprehensive visit + annual labs',
    billingCodes: [
      { code: '99205', desc: 'New patient comprehensive hormonal evaluation', rate: '$250 - $350' },
      { code: '99214', desc: 'HRT follow-up, moderate complexity', rate: '$130 - $190' },
      { code: '99213', desc: 'HRT follow-up, straightforward', rate: '$90 - $130' },
      { code: '99395', desc: 'Preventive visit, 18-39', rate: '$150 - $200' },
      { code: '99396', desc: 'Preventive visit, 40-64', rate: '$160 - $220' },
      { code: 'N95.1', desc: 'Menopausal and female climacteric states (ICD-10)', rate: 'Diagnosis code' },
      { code: 'E28.39', desc: 'Other primary ovarian failure (ICD-10)', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'FNP scope fully covers HRT prescribing and management',
      'Lab monitoring: estradiol, FSH, progesterone, thyroid panel, lipids, CBC',
      'Contraindications: history of breast cancer, DVT/PE, active liver disease',
      'Risk-benefit discussion and informed consent documentation required',
      'Consider both systemic and local (vaginal) estrogen options',
      'Progesterone required for patients with intact uterus',
      'Natural overlap with psych: mood symptoms, insomnia, anxiety often improve with HRT',
      'Testosterone therapy for low libido gaining evidence — emerging market',
    ],
    credentialingNotes: 'Bills under primary care/FNP credentials. No additional specialty credentialing needed. Same payers as current panel.',
    marketDemand: 'Growing — 1.3M women enter menopause annually. Telehealth HRT booming (Alloy, Evernow, Midi Health). Underserved by traditional providers.',
  },
  {
    id: 'sleep',
    name: 'Sleep Medicine',
    status: 'planned',
    icon: '&#127769;',
    color: '#6366f1',
    summary: 'Insomnia and sleep disorder management. Nearly every psychiatric condition has sleep disruption. Formalizing this as a service line captures visits that currently happen informally.',
    targetPatient: 'Adults with insomnia, circadian rhythm disorders, sleep apnea screening. High overlap with psych panel — 50-80% of psych patients have sleep complaints.',
    revenueModel: 'Insurance-based. Same CPT codes as psych visits but formalizes the service and captures patients who might not seek psych care but will seek sleep help.',
    annualRevenuePerPatient: '$600 - $1,500',
    visitFrequency: 'Monthly during CBT-I (6-8 weeks), then PRN',
    billingCodes: [
      { code: '99213', desc: 'Sleep follow-up visit', rate: '$90 - $130' },
      { code: '99214', desc: 'Sleep management, moderate complexity', rate: '$130 - $190' },
      { code: '99205', desc: 'New patient sleep evaluation', rate: '$250 - $350' },
      { code: '96152', desc: 'Health behavior intervention (CBT-I)', rate: '$45 - $65' },
      { code: 'G0473', desc: 'Behavioral counseling for insomnia', rate: '$25 - $35' },
      { code: 'G47.00', desc: 'Insomnia, unspecified (ICD-10)', rate: 'Diagnosis code' },
      { code: 'G47.09', desc: 'Other insomnia (ICD-10)', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'CBT-I (Cognitive Behavioral Therapy for Insomnia) is first-line — more effective than meds long-term',
      'Avoid benzodiazepines for chronic insomnia — trazodone, hydroxyzine, gabapentin preferred',
      'Screen for sleep apnea (STOP-BANG questionnaire) — refer for sleep study if indicated',
      'Melatonin receptor agonists (ramelteon) and orexin antagonists (suvorexant) are non-habit-forming options',
      'Sleep hygiene education can be done via handouts — low provider time investment',
      'Natural psych integration: treat insomnia directly rather than just as a symptom of depression/anxiety',
      'Consider sleep tracking apps as patient engagement tools (Oura, Apple Watch)',
    ],
    credentialingNotes: 'No separate credentialing needed. Bills under same E/M codes. Can market as a distinct service without additional payer enrollment.',
    marketDemand: 'Moderate-High — 50-70M Americans have sleep disorders. Insomnia is the most common complaint in primary care. Telehealth-friendly.',
  },
  // ─── PMHNP: Addiction Psychiatry ───
  {
    id: 'addiction',
    name: 'Addiction Psychiatry',
    status: 'planned',
    icon: '&#9883;',
    color: '#dc2626',
    summary: 'Comprehensive substance use disorder treatment beyond opioids — alcohol use disorder (naltrexone, acamprosate, disulfiram), stimulant use disorder, cannabis use disorder, benzodiazepine tapering, and dual-diagnosis management. Natural extension of existing psychiatric and MAT services.',
    targetPatient: 'Adults with alcohol, stimulant, cannabis, or polysubstance use disorders. High comorbidity with depression, anxiety, PTSD, bipolar. Many already in psych panel but substance use is undertreated.',
    revenueModel: 'Insurance-based with strong Medicaid/Medicare coverage. Premium rates for dual-diagnosis complexity. Chronic care model with long retention (years). Group therapy adds scale.',
    annualRevenuePerPatient: '$3,000 - $6,000',
    visitFrequency: 'Weekly (acute/detox phase), biweekly (stabilization), monthly (maintenance)',
    billingCodes: [
      { code: '99214', desc: 'Addiction follow-up, moderate complexity', rate: '$130 - $190' },
      { code: '99215', desc: 'Addiction follow-up, high complexity (dual-diagnosis)', rate: '$180 - $250' },
      { code: '99205', desc: 'New patient comprehensive addiction evaluation', rate: '$250 - $350' },
      { code: '99408', desc: 'SBIRT screening & brief intervention, 15-30 min', rate: '$34 - $45' },
      { code: '99409', desc: 'SBIRT screening & brief intervention, 30+ min', rate: '$66 - $85' },
      { code: 'H0001', desc: 'Alcohol/drug assessment', rate: '$80 - $150' },
      { code: 'H0005', desc: 'Alcohol/drug group counseling', rate: '$25 - $45/patient' },
      { code: 'H0015', desc: 'Intensive outpatient (IOP), per hour', rate: '$60 - $120' },
      { code: '90853', desc: 'Group psychotherapy', rate: '$30 - $50/patient' },
      { code: '80305', desc: 'Drug test, presumptive (urine screen)', rate: '$15 - $25' },
      { code: '80306', desc: 'Drug test, definitive (confirmation)', rate: '$50 - $100' },
    ],
    clinicalConsiderations: [
      'Naltrexone (oral/injectable Vivitrol) for alcohol & opioid use — no DEA schedule, easy to prescribe',
      'Acamprosate for alcohol craving reduction — well-tolerated, underutilized',
      'No FDA-approved medications for stimulant use disorder yet — off-label: bupropion, mirtazapine, topiramate',
      'Benzodiazepine tapering protocols require careful scheduling — 10-25% reduction every 1-2 weeks',
      'PDMP check required before prescribing any controlled substances',
      'Urine drug screening recommended at each visit — bill separately (80305/80306)',
      'Group therapy (90853, H0005) is scalable — 6-10 patients per group, bill each patient individually',
      'Dual-diagnosis is the norm, not the exception — treat both conditions simultaneously',
      'AUDIT-C, DAST-10, CAGE screening tools for documentation and medical necessity',
      'Motivational interviewing as core approach — stage-matched intervention',
      'Coordinate with 12-step, SMART Recovery, and community resources',
      'Telehealth ideal for maintenance phase — reduces stigma barriers to treatment',
    ],
    credentialingNotes: 'PMHNP scope covers addiction treatment in most states. No X-waiver needed since 2023 for buprenorphine. Some payers have specific SUD provider enrollment. Medicaid is a major payer — check state Medicaid SUD benefits. Consider ASAM certification for credibility.',
    marketDemand: 'Very High — 46.3M Americans meet criteria for substance use disorder, only 10% receive treatment. Alcohol is #1 (29.5M). Massive treatment gap especially via telehealth. Payers actively seeking network-adequate SUD providers.',
  },
  // ─── FNP: Chronic Care & Remote Monitoring ───
  {
    id: 'chronic-care',
    name: 'Chronic Care & Remote Monitoring',
    status: 'planned',
    icon: '&#128153;',
    color: '#0891b2',
    summary: 'Bundled chronic disease management — diabetes (CGM programs), hypertension, thyroid disorders, and hyperlipidemia — plus Medicare CCM (99490) and RPM (99453-99458) billing for passive recurring revenue between visits.',
    targetPatient: 'Adults 40+ with one or more chronic conditions: Type 2 diabetes, hypertension, hypothyroidism, hyperlipidemia. Medicare patients especially valuable for CCM/RPM codes.',
    revenueModel: 'Insurance-based with premium CCM/RPM add-on revenue. CCM: $42-$83/patient/month for non-face-to-face care coordination. RPM: $50-$120/patient/month for device monitoring. Recurring monthly revenue on top of visit-based billing.',
    annualRevenuePerPatient: '$2,400 - $5,000',
    visitFrequency: 'Quarterly in-person/telehealth + monthly CCM/RPM (non-face-to-face)',
    billingCodes: [
      { code: '99214', desc: 'Chronic care follow-up, moderate complexity', rate: '$130 - $190' },
      { code: '99215', desc: 'Complex chronic care (multiple conditions)', rate: '$180 - $250' },
      { code: '99490', desc: 'Chronic care management, 20+ min/month (non-face-to-face)', rate: '$42 - $65' },
      { code: '99491', desc: 'Chronic care management, 30+ min/month (complex)', rate: '$83 - $105' },
      { code: '99453', desc: 'RPM setup & patient education', rate: '$19 - $22' },
      { code: '99454', desc: 'RPM device supply/data transmission, per 30 days', rate: '$55 - $65' },
      { code: '99457', desc: 'RPM treatment management, first 20 min/month', rate: '$50 - $60' },
      { code: '99458', desc: 'RPM treatment management, additional 20 min', rate: '$42 - $50' },
      { code: '99091', desc: 'Collection/interpretation of physiologic data, 30+ min', rate: '$56 - $62' },
      { code: '95251', desc: 'CGM data interpretation, 72+ hours', rate: '$45 - $55' },
      { code: '99396', desc: 'Preventive visit, 40-64', rate: '$160 - $220' },
    ],
    clinicalConsiderations: [
      'CCM requires patient consent, documented care plan, and 20+ min/month of care coordination',
      'RPM requires 16+ days of data transmission per 30-day period to bill 99454',
      'CGM (Dexcom, Libre) for diabetes management — interpret data remotely, adjust meds proactively',
      'BP cuffs with Bluetooth (Omron, Withings) for hypertension RPM — auto-transmit readings',
      'Thyroid: TSH + free T4 monitoring, levothyroxine dose adjustment. Simple but high volume',
      'A1C targets, statin management, and preventive screenings drive quality metrics (MIPS/HEDIS)',
      'Delegatable: MA or RN can perform CCM calls, provider reviews and bills',
      'RPM vendor partnerships (BioTel, Health Recovery Solutions) handle device logistics',
      'Cross-sell: psych patients on antipsychotics need metabolic monitoring — natural bridge',
    ],
    credentialingNotes: 'FNP scope fully covers chronic disease management. Same payer credentialing as primary care. CCM/RPM are add-on codes — no separate enrollment. Medicare is the primary payer for these codes, but commercial payers increasingly cover RPM.',
    marketDemand: 'Very High — 60% of US adults have at least one chronic disease. 40% have two or more. CCM/RPM are among the fastest-growing Medicare billing codes. CMS actively expanding coverage.',
  },
  // ─── FNP: Men's Health & Sexual Wellness ───
  {
    id: 'mens-health',
    name: "Men's Health & Sexual Wellness",
    status: 'planned',
    icon: '&#9794;',
    color: '#2563eb',
    summary: "Testosterone replacement therapy (TRT), erectile dysfunction management, low libido, hair loss treatment, and preventive health for men. High cash-pay demand, telehealth-native, strong retention.",
    targetPatient: "Men 30-65 with low testosterone symptoms (fatigue, low libido, mood changes, muscle loss), erectile dysfunction, or hair loss. Significant overlap with psych patients — depression/anxiety often coexist with low T.",
    revenueModel: "Primarily cash-pay ($150-300/month programs). Insurance covers TRT when labs confirm hypogonadism. ED meds mostly cash-pay. Subscription/membership models work well. Very high patient lifetime value.",
    annualRevenuePerPatient: '$2,000 - $4,500',
    visitFrequency: 'Quarterly follow-ups + labs every 6 months. Monthly check-ins for new patients.',
    billingCodes: [
      { code: '99205', desc: "New patient comprehensive men's health evaluation", rate: '$250 - $350' },
      { code: '99214', desc: 'TRT/ED follow-up, moderate complexity', rate: '$130 - $190' },
      { code: '99213', desc: 'Straightforward follow-up (stable TRT)', rate: '$90 - $130' },
      { code: 'J1071', desc: 'Testosterone cypionate injection, per 100mg', rate: '$15 - $30' },
      { code: '96372', desc: 'Therapeutic injection administration', rate: '$25 - $35' },
      { code: '99401', desc: 'Preventive counseling, 15 min (lifestyle, sexual health)', rate: '$35 - $50' },
      { code: 'E29.1', desc: 'Testicular hypofunction / hypogonadism (ICD-10)', rate: 'Diagnosis code' },
      { code: 'N52.9', desc: 'Male erectile dysfunction, unspecified (ICD-10)', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'Lab confirmation required: total testosterone, free testosterone, SHBG, LH, FSH, estradiol, CBC, PSA',
      'Monitor hematocrit — TRT can cause polycythemia (>54% requires dose adjustment or therapeutic phlebotomy)',
      'PSA monitoring every 6-12 months — TRT is contraindicated with active prostate cancer',
      'ED treatment ladder: PDE5 inhibitors (sildenafil, tadalafil) → PT-141 → penile injection therapy referral',
      'Hair loss: finasteride 1mg daily + minoxidil. Monitor for sexual side effects (rare)',
      'Fertility consideration: TRT suppresses spermatogenesis — use hCG or clomiphene if fertility desired',
      'Cross-sell with psych: low testosterone mimics depression symptoms — screen psych patients',
      'Telehealth-friendly for follow-ups — labs can be done at Quest/LabCorp',
      'Cash-pay programs avoid insurance hassle — charge monthly membership fee',
    ],
    credentialingNotes: "FNP scope covers TRT and ED management. Testosterone cypionate is Schedule III — DEA registration required. No additional specialty credentialing needed. Most commercial payers cover TRT with documented hypogonadism.",
    marketDemand: "Extremely High — telehealth men's health is a $5B+ market (Hims, Roman, Vault). 1 in 4 men over 30 have low testosterone. ED affects 30M+ American men. Massive demand with patients preferring telehealth for privacy.",
  },
  // ─── FNP: Virtual Urgent Care ───
  {
    id: 'urgent-care',
    name: 'Virtual Urgent Care',
    status: 'planned',
    icon: '&#9889;',
    color: '#f97316',
    summary: 'On-demand telehealth visits for acute, low-complexity complaints — UTIs, upper respiratory infections, sinusitis, allergies, rashes, conjunctivitis, minor injuries. High volume, fast visits, insurance or cash-pay.',
    targetPatient: 'Adults and adolescents with acute, non-emergency complaints who want same-day/next-day access without visiting an ER or urgent care center.',
    revenueModel: 'High volume, short visits (10-15 min). Insurance-based or flat-rate cash-pay ($50-75/visit). Can see 4-6 patients/hour. After-hours premium pricing. Employer contracts for on-demand access.',
    annualRevenuePerPatient: '$150 - $500',
    visitFrequency: 'As-needed (episodic). Avg patient uses 2-4x/year.',
    billingCodes: [
      { code: '99212', desc: 'Established patient, straightforward (5-10 min)', rate: '$45 - $65' },
      { code: '99213', desc: 'Established patient, low complexity (15 min)', rate: '$90 - $130' },
      { code: '99201', desc: 'New patient, straightforward', rate: '$50 - $75' },
      { code: '99441', desc: 'Telephone E/M, 5-10 min', rate: '$25 - $40' },
      { code: '99442', desc: 'Telephone E/M, 11-20 min', rate: '$50 - $70' },
      { code: '99443', desc: 'Telephone E/M, 21-30 min', rate: '$75 - $100' },
    ],
    clinicalConsiderations: [
      'Establish clear scope: what you DO and DO NOT treat virtually (no chest pain, SOB, suicidal ideation)',
      'Antibiotic stewardship protocols — avoid unnecessary prescriptions',
      'UTI: can treat uncomplicated UTI in women empirically via telehealth in most states',
      'Rashes/skin: high-quality photo submission required for accurate assessment',
      'Controlled substances generally NOT prescribed in urgent care encounters',
      'After-hours availability is a major differentiator — charge premium rates',
      'Funnel: urgent care patients become primary care / psych patients for ongoing services',
      'Malpractice: ensure coverage includes telehealth urgent care scope',
    ],
    credentialingNotes: 'FNP scope fully covers urgent care. Same state licenses apply. Some payers have separate telehealth/urgent care credentialing tracks. Consider credentialing with large employer groups and telehealth platforms.',
    marketDemand: 'Very High — telehealth urgent care grew 38x during COVID and remained elevated. 76% of patients prefer virtual for minor complaints. ER avoidance saves payers money — strong payer support.',
  },
  // ─── FNP: Preventive Health & Wellness ───
  {
    id: 'preventive',
    name: 'Preventive Health & Wellness',
    status: 'planned',
    icon: '&#127807;',
    color: '#16a34a',
    summary: 'Annual wellness visits (AWV), smoking/vaping cessation programs, travel medicine consults, executive health panels, nutritional counseling, and longevity-focused care. Mix of Medicare AWV codes, insurance preventive benefits, and premium cash-pay programs.',
    targetPatient: 'Health-conscious adults seeking proactive care. Medicare patients for AWVs. Smokers/vapers for cessation. Business travelers. Executives wanting comprehensive panels.',
    revenueModel: 'Mixed: Medicare AWVs ($175-$250/visit, high volume), smoking cessation (insurance-covered), travel medicine (cash-pay $100-200/consult), executive health (cash-pay $500-1,500/panel). Subscription wellness programs for recurring revenue.',
    annualRevenuePerPatient: '$500 - $2,500',
    visitFrequency: 'Annual AWV + quarterly wellness check-ins. Cessation programs: weekly x 8-12 weeks.',
    billingCodes: [
      { code: 'G0438', desc: 'Initial Medicare AWV (Welcome to Medicare)', rate: '$175 - $210' },
      { code: 'G0439', desc: 'Subsequent Medicare AWV', rate: '$130 - $170' },
      { code: '99395', desc: 'Preventive visit, 18-39', rate: '$150 - $200' },
      { code: '99396', desc: 'Preventive visit, 40-64', rate: '$160 - $220' },
      { code: '99397', desc: 'Preventive visit, 65+', rate: '$170 - $230' },
      { code: '99406', desc: 'Smoking cessation counseling, 3-10 min', rate: '$14 - $20' },
      { code: '99407', desc: 'Smoking cessation counseling, 10+ min', rate: '$26 - $35' },
      { code: '99401', desc: 'Preventive counseling, 15 min', rate: '$35 - $50' },
      { code: '99402', desc: 'Preventive counseling, 30 min', rate: '$60 - $80' },
      { code: '97802', desc: 'Medical nutrition therapy, initial (15 min)', rate: '$30 - $40' },
      { code: '97803', desc: 'Medical nutrition therapy, subsequent (15 min)', rate: '$25 - $35' },
    ],
    clinicalConsiderations: [
      'AWV is NOT a physical exam — it is a health risk assessment, care plan, and screening schedule review',
      'AWV can be billed same day as a problem-based visit (99213-99215) with modifier 25',
      'Smoking cessation: varenicline (Chantix) + NRT combo is most effective. ACA requires insurance coverage.',
      'Travel medicine: Yellow Fever vaccine requires certified center. Malaria prophylaxis, altitude meds are easy adds.',
      'Executive health: comprehensive labs (advanced lipids, hs-CRP, HbA1c, vitamin D, B12, hormone panel) as cash-pay bundle',
      'Nutritional counseling (MNT) covered by Medicare for diabetes and renal disease — FNP can bill directly',
      'Longevity panels: NAD+, telomere testing, advanced biomarkers — premium cash-pay positioning',
      'Wellness programs pair naturally with chronic care and psych — holistic patient capture',
    ],
    credentialingNotes: 'FNP scope covers all preventive services. Medicare enrollment required for AWV codes. No additional specialty credentialing needed. Travel medicine certification (ISTM) adds credibility but is not required to prescribe.',
    marketDemand: 'High — preventive care is ACA-mandated with zero copay. Medicare AWV utilization is only ~50% of eligible patients, meaning huge untapped volume. Wellness market growing 5-10% annually.',
  },
  // ─── FNP: Dermatology ───
  {
    id: 'dermatology',
    name: 'Teledermatology',
    status: 'planned',
    icon: '&#129528;',
    color: '#e879f9',
    summary: 'Virtual dermatology — acne, eczema, psoriasis, rosacea, fungal infections, suspicious moles (triage/referral), and cosmetic skin concerns. Store-and-forward (async) and live video models. High volume, straightforward management.',
    targetPatient: 'Adults and adolescents with common skin conditions. Avg wait for in-person dermatologist is 35 days — telehealth fills the gap. Psych patients on lithium, lamotrigine, antipsychotics often have dermatologic side effects.',
    revenueModel: 'Insurance-based for medical dermatology. Cash-pay for cosmetic consults ($75-150). Async (store-and-forward) model enables high throughput — review photos, prescribe, bill. 8-12 patients/hour async vs 4/hour live.',
    annualRevenuePerPatient: '$300 - $1,200',
    visitFrequency: 'Initial + 1-2 follow-ups per episode. Chronic conditions (eczema, psoriasis): quarterly.',
    billingCodes: [
      { code: '99213', desc: 'Established patient, dermatology follow-up', rate: '$90 - $130' },
      { code: '99214', desc: 'Moderate complexity skin evaluation', rate: '$130 - $190' },
      { code: '99205', desc: 'New patient comprehensive skin evaluation', rate: '$250 - $350' },
      { code: 'G2010', desc: 'Store-and-forward remote evaluation (async)', rate: '$12 - $18' },
      { code: 'G2012', desc: 'Virtual check-in, 5-10 min', rate: '$14 - $20' },
      { code: '96372', desc: 'Injection administration (if applicable)', rate: '$25 - $35' },
    ],
    clinicalConsiderations: [
      'Store-and-forward requires clear photo standards: well-lit, close-up, with ruler for scale',
      'FNP scope covers common dermatology — refer complex cases (biopsies, Mohs, biologics) to dermatologist',
      'Acne: tretinoin, adapalene, benzoyl peroxide, doxycycline, spironolactone. Isotretinoin requires specialist.',
      'Eczema: topical steroids, calcineurin inhibitors, dupilumab referral for moderate-severe',
      'Psoriasis: topical steroids, vitamin D analogs, phototherapy referral. Biologics require specialist.',
      'Medication-related rashes in psych patients: lamotrigine (Stevens-Johnson risk), lithium (acne/psoriasis)',
      'Suspicious lesions: use ABCDE criteria, always refer for biopsy — do not manage melanoma risk virtually',
      'Cosmetic: chemical peels, retinoid programs, hyperpigmentation — cash-pay add-on revenue',
    ],
    credentialingNotes: 'FNP scope covers medical dermatology. No additional certification required but dermatology CE adds confidence. Some states allow store-and-forward billing; check payer-specific telehealth policies. Consider DermTech or other AI-assisted platforms.',
    marketDemand: 'High — dermatology has the longest specialist wait times in medicine (35+ days avg). 84M Americans have skin diseases. Teledermatology adoption accelerating post-COVID with strong patient satisfaction scores.',
  },
  // ─── FNP: Pain Management (Non-Opioid) ───
  {
    id: 'pain-mgmt',
    name: 'Pain Management (Non-Opioid)',
    status: 'planned',
    icon: '&#129657;',
    color: '#ea580c',
    summary: 'Non-opioid chronic pain management — gabapentinoids, SNRIs (duloxetine), muscle relaxants, topical analgesics, trigger point injection referrals, and integrative approaches. Fills the gap left by the opioid crisis with evidence-based alternatives.',
    targetPatient: 'Adults with chronic pain conditions: fibromyalgia, neuropathy, chronic back pain, migraines, arthritis. High overlap with psych patients — chronic pain and depression are deeply comorbid (50-80% overlap).',
    revenueModel: 'Insurance-based. Moderate complexity visits. High retention — chronic pain patients need ongoing management. Migraine-specific drugs (CGRP inhibitors) have strong payer coverage. Prior auth assistance as value-add.',
    annualRevenuePerPatient: '$1,500 - $3,600',
    visitFrequency: 'Monthly (stabilization), then every 2-3 months (maintenance)',
    billingCodes: [
      { code: '99214', desc: 'Pain management follow-up, moderate complexity', rate: '$130 - $190' },
      { code: '99215', desc: 'Complex pain management (multiple conditions)', rate: '$180 - $250' },
      { code: '99205', desc: 'New patient comprehensive pain evaluation', rate: '$250 - $350' },
      { code: '96127', desc: 'Pain screening tool administration (eg PHQ-9, PEG)', rate: '$5 - $8' },
      { code: '97140', desc: 'Manual therapy (if trained)', rate: '$35 - $50' },
      { code: '20552', desc: 'Trigger point injection, 1-2 muscles', rate: '$60 - $90' },
      { code: '20553', desc: 'Trigger point injection, 3+ muscles', rate: '$90 - $130' },
      { code: 'G89.29', desc: 'Other chronic pain (ICD-10)', rate: 'Diagnosis code' },
      { code: 'M79.7', desc: 'Fibromyalgia (ICD-10)', rate: 'Diagnosis code' },
      { code: 'G43.909', desc: 'Migraine, unspecified (ICD-10)', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'First-line non-opioid: gabapentin/pregabalin (neuropathic), duloxetine (fibromyalgia/neuropathy), NSAIDs (musculoskeletal)',
      'Migraine-specific: CGRP inhibitors (Aimovig, Ajovy, Emgality) are game-changers — monthly SC injections',
      'Acute migraine: triptans, gepants (ubrogepant, rimegepant), lasmiditan',
      'Topical agents: diclofenac gel, lidocaine patches, capsaicin — avoid systemic side effects',
      'Gabapentin is Schedule V in some states — check PDMP requirements',
      'Pain-psych connection: duloxetine treats both pain AND depression — dual benefit billing',
      'Trigger point injections are within FNP scope in most states — check your state',
      'Interdisciplinary referrals: PT, acupuncture, CBT for pain, interventional pain (nerve blocks)',
      'Avoid opioid prescribing — document non-opioid treatment plan and alternatives tried',
      'Functional outcome tracking: PEG scale (Pain, Enjoyment, General activity) at each visit',
    ],
    credentialingNotes: 'FNP scope covers non-opioid pain management. No additional certification required. Trigger point injections require procedure training. CGRP inhibitors may require prior authorization — build PA workflow. Same payer credentialing as primary care.',
    marketDemand: 'Very High — 50M+ Americans have chronic pain. Post-opioid crisis, demand for non-opioid pain management is massive. Payers incentivize non-opioid approaches. Migraine alone affects 39M Americans.',
  },
  // ─── Wellness Coaching & Health Optimization ───
  {
    id: 'wellness-coaching',
    name: 'Wellness Coaching & Health Optimization',
    status: 'planned',
    icon: '&#127775;',
    color: '#facc15',
    summary: 'Non-clinical subscription-based wellness programs — health coaching, lifestyle optimization, stress management, nutritional guidance, biohacking consults, and accountability programs. No insurance billing — pure cash-pay/membership model with high margins and no payer overhead.',
    targetPatient: 'Health-conscious adults 25-55 seeking proactive optimization rather than disease treatment. Executives, entrepreneurs, fitness-minded professionals. Also: stable psych/primary care patients ready for lifestyle-focused maintenance.',
    revenueModel: 'Subscription/membership: $99-$299/month per member. No insurance, no prior auth, no claims. Group programs scale revenue (10-20 members per cohort at $149/month = $1,490-$2,980/month per cohort). Digital products (courses, guides) add passive income. Corporate wellness contracts ($50-$100/employee/month PEPM).',
    annualRevenuePerPatient: '$1,200 - $3,600',
    visitFrequency: 'Biweekly 1:1 coaching sessions (30 min) or weekly group sessions. Monthly check-ins for maintenance members.',
    billingCodes: [
      { code: 'N/A', desc: 'Cash-pay membership — $99-$149/month (basic tier)', rate: '$99 - $149/mo' },
      { code: 'N/A', desc: 'Cash-pay membership — $199-$299/month (premium tier)', rate: '$199 - $299/mo' },
      { code: 'N/A', desc: 'Group coaching cohort — 8-12 week program', rate: '$497 - $997 per participant' },
      { code: 'N/A', desc: 'Corporate wellness contract (PEPM)', rate: '$50 - $100/employee/mo' },
      { code: 'N/A', desc: 'Digital course / self-paced program', rate: '$97 - $297 one-time' },
      { code: '99401', desc: 'Preventive counseling, 15 min (if hybrid model)', rate: '$35 - $50' },
      { code: '99402', desc: 'Preventive counseling, 30 min (if hybrid model)', rate: '$60 - $80' },
      { code: 'S9470', desc: 'Nutritional counseling, dietitian visit (some payers)', rate: '$40 - $80' },
    ],
    clinicalConsiderations: [
      'Coaching is NOT therapy or medical treatment — clear scope boundaries are essential',
      'Use health coaching certifications (NBHWC, ICF, ACE) for credibility and liability protection',
      'DNP/FNP credential adds trust and authority that pure coaches lack — major competitive advantage',
      'Program tiers: Basic (group + app access), Premium (1:1 + labs + personalized plan)',
      'Pillars to cover: sleep optimization, stress/HRV, nutrition, movement, cognitive performance, hormonal health',
      'Wearable data integration: Oura Ring, Whoop, Apple Watch, CGM (Levels) for data-driven coaching',
      'Lab panels as upsell: comprehensive metabolic + hormones + micronutrients ($200-500 cash-pay labs)',
      'Corporate angle: pitch to HR/benefits teams as employee wellness benefit — reduces healthcare costs',
      'Digital products: pre-recorded courses, meal plans, supplement guides generate passive revenue',
      'Liability: use coaching agreements, not provider-patient relationships, for non-clinical services',
      'Hybrid model: coaching membership + periodic clinical visits (billable to insurance) for labs/prescriptions',
      'Referral funnel: coaching clients who need clinical care convert to your medical practice — and vice versa',
    ],
    credentialingNotes: 'No payer credentialing needed — this is a cash-pay, non-insurance service line. NBHWC (National Board for Health & Wellness Coaching) certification recommended but not required. DNP/NP credential is the differentiator vs. non-clinical coaches. Consider LLC or separate business entity for non-clinical revenue. Malpractice policy should cover coaching activities or obtain separate coaching liability insurance.',
    marketDemand: 'Explosive — global wellness market is $5.6 trillion. Health coaching market growing 6.7% annually. Corporate wellness is a $61B market. Consumers increasingly willing to pay out-of-pocket for optimization and prevention. NP-led coaching commands premium pricing over non-clinical coaches.',
  },
  // ─── Nutritional Counseling / MNT ───
  {
    id: 'nutrition',
    name: 'Nutritional Counseling / MNT',
    status: 'planned',
    icon: '&#129382;',
    color: '#65a30d',
    summary: 'Medical Nutrition Therapy (MNT) — evidence-based nutritional assessments, individualized meal planning, and ongoing dietary counseling. Directly billable under CPT 97802-97804. Pairs naturally with weight management/GLP-1s, diabetes/chronic care, and GI conditions.',
    targetPatient: 'Adults with diabetes (Type 1 & 2), obesity/overweight, renal disease, cardiovascular disease, GI disorders (IBS, GERD, celiac), eating disorders, and patients on psych medications causing metabolic side effects (weight gain, insulin resistance).',
    revenueModel: 'Insurance-based for qualifying diagnoses (diabetes, renal disease covered by Medicare/most commercial). Cash-pay for general wellness nutrition ($75-$150/session). Group MNT scales well (8-12 patients, bill each). Cross-sells with weight management, chronic care, and wellness coaching lines.',
    annualRevenuePerPatient: '$600 - $2,000',
    visitFrequency: 'Initial assessment (45-60 min) + 3-5 follow-ups (15-30 min) over first year. Quarterly maintenance thereafter.',
    billingCodes: [
      { code: '97802', desc: 'MNT initial assessment, individual, 15 min', rate: '$30 - $42' },
      { code: '97803', desc: 'MNT reassessment/intervention, individual, 15 min', rate: '$25 - $38' },
      { code: '97804', desc: 'MNT group session (2+ patients), 30 min', rate: '$15 - $25/patient' },
      { code: 'G0270', desc: 'MNT reassessment, subsequent year (Medicare)', rate: '$25 - $35' },
      { code: 'G0271', desc: 'MNT group reassessment, subsequent year (Medicare)', rate: '$12 - $18/patient' },
      { code: '99213', desc: 'E/M visit with nutritional counseling component', rate: '$90 - $130' },
      { code: '99214', desc: 'E/M visit, moderate complexity (nutrition + medical)', rate: '$130 - $190' },
      { code: '99401', desc: 'Preventive counseling, dietary guidance, 15 min', rate: '$35 - $50' },
      { code: 'S9470', desc: 'Nutritional counseling, dietitian visit (some commercial payers)', rate: '$40 - $80' },
      { code: 'E11.65', desc: 'Type 2 diabetes with hyperglycemia (ICD-10 — MNT qualifying dx)', rate: 'Diagnosis code' },
      { code: 'E66.01', desc: 'Morbid obesity (ICD-10)', rate: 'Diagnosis code' },
      { code: 'N18.3', desc: 'Chronic kidney disease, stage 3 (ICD-10 — MNT qualifying dx)', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'Medicare covers MNT for diabetes and renal disease — 3 hours first year, 2 hours subsequent years',
      'MNT can be billed same day as E/M visit with separate documentation and different diagnosis focus',
      'NPs can bill MNT directly in most states — no dietitian referral required for the NP to counsel',
      'Consider partnering with an RD/RDN for comprehensive programs — NP handles medical, RD handles MNT',
      'GLP-1 patients need nutritional support: protein intake, hydration, micronutrient monitoring during rapid weight loss',
      'Psych-nutrition connection: gut-brain axis, anti-inflammatory diets for depression, Mediterranean diet evidence',
      'Metabolic monitoring for psych meds: atypical antipsychotics, valproate, lithium all affect metabolic health',
      'Group MNT is highly scalable — diabetes self-management education (DSME) groups bill per patient',
      'Elimination diets for IBS (Low-FODMAP) require structured guidance — 6-8 week protocols',
      'Supplement guidance: vitamin D, B12, omega-3, magnesium — evidence-based recommendations only',
      'Food sensitivity testing is controversial — stick to evidence-based approaches (celiac panel, lactose breath test)',
      'Meal planning tools: use apps (Cronometer, MyFitnessPal) for patient tracking and accountability',
      'Document medical necessity: link nutritional intervention to specific diagnosis and measurable outcomes (A1C, BMI, lipids)',
    ],
    credentialingNotes: 'FNP/DNP scope covers nutritional counseling and MNT billing in most states. Medicare requires provider to be an RD, or a qualified provider under incident-to rules — check your state and MAC (Medicare Administrative Contractor) policies. Commercial payers generally cover MNT with qualifying diagnosis. No additional specialty credentialing needed. Consider CDCES (Certified Diabetes Care and Education Specialist) for enhanced credibility and DSME program recognition.',
    marketDemand: 'High — 37.3M Americans have diabetes, 96M have prediabetes. Obesity affects 42% of adults. MNT is underutilized despite strong evidence — only 10% of eligible Medicare patients receive MNT. Growing consumer awareness of food-as-medicine. ACA mandates coverage of preventive nutritional counseling for CVD risk.',
  },
  // ─── Corporate Wellness & EAP ───
  {
    id: 'corporate-eap',
    name: 'Corporate Wellness & EAP',
    status: 'planned',
    icon: '&#127970;',
    color: '#0d9488',
    summary: 'Employer-contracted services combining corporate wellness programs with Employee Assistance Program (EAP) offerings. Mental health + primary care bundled for workforces. Per-employee-per-month (PEPM) recurring revenue with no insurance billing. Includes short-term counseling, crisis support, manager consultations, wellness workshops, and on-demand telehealth access for employees.',
    targetPatient: 'Employers with 50-5,000+ employees. Target: HR directors, benefits managers, and C-suite. Industries with high burnout: tech, healthcare, finance, legal, education, first responders. Small-to-mid businesses underserved by large EAP providers (ComPsych, Lyra, Spring Health).',
    revenueModel: 'PEPM (Per-Employee-Per-Month) contracts: $3-$12/employee/month depending on service tier. A 500-employee company at $8 PEPM = $4,000/month ($48,000/year) per contract. EAP sessions typically 3-6 per employee per issue. Upsells: on-site wellness days, leadership training, critical incident debriefing. Scalable — add employers without adding proportional provider time.',
    annualRevenuePerPatient: '$36 - $144 per employee (PEPM)',
    visitFrequency: 'EAP: 3-6 sessions per employee per presenting issue. Wellness: quarterly workshops, monthly newsletters, on-demand access. Utilization typically 5-8% of covered employees per year.',
    billingCodes: [
      { code: 'N/A', desc: 'PEPM contract — Basic tier (EAP only, 3 sessions)', rate: '$3 - $5/employee/mo' },
      { code: 'N/A', desc: 'PEPM contract — Standard tier (EAP + wellness)', rate: '$5 - $8/employee/mo' },
      { code: 'N/A', desc: 'PEPM contract — Premium tier (EAP + wellness + telehealth)', rate: '$8 - $12/employee/mo' },
      { code: 'N/A', desc: 'On-site wellness day / health fair', rate: '$1,500 - $3,000/event' },
      { code: 'N/A', desc: 'Critical incident stress debriefing (CISD)', rate: '$1,000 - $2,500/event' },
      { code: 'N/A', desc: 'Manager consultation / training session', rate: '$200 - $500/session' },
      { code: 'N/A', desc: 'Lunch & learn / wellness workshop', rate: '$500 - $1,500/session' },
      { code: 'N/A', desc: 'Executive coaching (1:1)', rate: '$250 - $500/session' },
      { code: '90837', desc: 'Individual therapy, 60 min (if insurance-billed model)', rate: '$130 - $180' },
      { code: '90853', desc: 'Group therapy / support group', rate: '$30 - $50/participant' },
    ],
    clinicalConsiderations: [
      'EAP is short-term, solution-focused — 3-6 sessions per issue, then refer out for ongoing care',
      'Common EAP presenting issues: stress/burnout, anxiety, depression, relationship problems, grief, substance use, workplace conflict',
      'Confidentiality is paramount — employers receive utilization reports (aggregate only), never individual data',
      'Manager referrals (mandatory EAP): document carefully, maintain employee confidentiality from employer',
      'Critical incident response: workplace violence, employee death, natural disasters — have a protocol ready',
      'Wellness programming: stress management, resilience training, sleep hygiene, mindfulness, financial wellness',
      'Substance use screening: SBIRT model integrates well into EAP intake',
      'Warm handoff protocol: when EAP sessions exhaust, transition to your clinical practice (psych, primary care)',
      'EAP is a funnel: employees who use EAP often become ongoing clinical patients — natural referral pipeline',
      'ROI data for employers: EAP reduces absenteeism 28%, presenteeism 24%, and healthcare costs 3:1',
      'Technology platform: offer a portal for employees to self-schedule, access resources, and message providers',
      'Legal: EAP records are separate from medical records — maintain distinct documentation',
      'PMHNP advantage: can prescribe medications when EAP reveals clinical need — most EAP providers cannot',
    ],
    credentialingNotes: 'No payer credentialing needed — employer contracts are direct B2B arrangements. PMHNP/FNP/DNP credentials command higher PEPM rates than LCSW/LPC-only EAP providers because of prescribing capability. Consider CEAP (Certified Employee Assistance Professional) for EAP credibility. Business liability insurance (E&O) recommended in addition to malpractice. May need separate business entity (LLC) for corporate contracts. State requirements for EAP providers vary — check licensing board.',
    marketDemand: 'Very High — 97% of large employers and 80% of mid-size employers offer EAP. However, most are dissatisfied with large, impersonal EAP vendors. Small/boutique EAP providers are winning market share with better access and outcomes. Post-COVID, employer mental health spending increased 38%. Corporate wellness is a $61B market growing 7% annually. The convergence of EAP + telehealth + NP prescribing is a unique competitive position.',
  },
  // ─── Collaborative Practice / Physician Group Partnerships ───
  {
    id: 'collab-practice',
    name: 'Collaborative Practice & Group Partnerships',
    status: 'planned',
    icon: '&#129309;',
    color: '#7c3aed',
    summary: 'Contract as a psychiatric or primary care provider within physician groups, FQHCs, multi-specialty practices, and health systems. Provide embedded NP services under collaborative or independent practice arrangements. Recurring contract revenue with built-in patient volume — no marketing required.',
    targetPatient: 'Physician groups needing psychiatric or primary care capacity. FQHCs with provider shortages. Multi-specialty practices wanting to add behavioral health. Rural health clinics needing telehealth NP coverage. Hospitalist groups needing after-hours or weekend coverage.',
    revenueModel: 'Contract-based: hourly ($75-$200/hr), daily ($600-$1,600/day), or monthly retainer ($8,000-$20,000/month). Some models use production-based compensation (% of collections, typically 45-55% of billed revenue). Hybrid: base retainer + production bonus. No overhead for office, staff, or billing — the group handles it.',
    annualRevenuePerPatient: '$96,000 - $240,000 per contract (provider income)',
    visitFrequency: 'Full-time (40 hrs/week) or part-time (8-20 hrs/week) embedded schedule. Patient volume set by the group — typically 12-20 patients/day for primary care, 8-14/day for psych.',
    billingCodes: [
      { code: 'N/A', desc: 'Hourly contract rate', rate: '$75 - $200/hr' },
      { code: 'N/A', desc: 'Daily contract rate (8-hr day)', rate: '$600 - $1,600/day' },
      { code: 'N/A', desc: 'Monthly retainer (part-time, 2 days/week)', rate: '$4,000 - $8,000/mo' },
      { code: 'N/A', desc: 'Monthly retainer (full-time)', rate: '$12,000 - $20,000/mo' },
      { code: 'N/A', desc: 'Production-based (% of collections)', rate: '45% - 55% of billed' },
      { code: '99214', desc: 'Typical visit (billed by the group, not you)', rate: '$130 - $190' },
      { code: '99215', desc: 'Complex visit (billed by the group)', rate: '$180 - $250' },
      { code: '90837', desc: 'Psychotherapy 60 min (psych embedded)', rate: '$130 - $180' },
    ],
    clinicalConsiderations: [
      'Collaborative practice agreement (CPA) required in restricted/reduced practice states — physician oversight',
      'Full practice authority states (28+): NP practices independently, no CPA needed — stronger contract leverage',
      'Incident-to billing: in physician groups, NP services may bill under supervising physician NPI at higher rates',
      'Scope of practice varies by state — verify NP can practice the contracted specialty independently',
      'Malpractice: clarify who carries coverage — your own policy vs. the group adding you to theirs',
      'Non-compete clauses: negotiate carefully — avoid overly broad geographic/time restrictions',
      'Credentialing: the group credentials you with their payers — may take 60-120 days to start',
      'EHR: you use the group EHR (Epic, Athena, eClinicalWorks) — less tech overhead for you',
      'Referral pipeline: embedded psych in a primary care group = automatic internal referrals',
      'Integrated care model: co-located behavioral health improves outcomes — CoCM (99492-99494) codes available',
      'FQHC advantage: enhanced reimbursement rates, loan repayment programs (NHSC), underserved area bonuses',
      'Telehealth embedded: contract to provide virtual coverage for groups in rural areas — no relocation required',
      'Weekend/after-hours coverage contracts command premium rates (1.5-2x standard)',
    ],
    credentialingNotes: 'Credentialing is handled by the contracting group — they add you to their payer panels. You need: active state license(s), DEA registration, NPI number, malpractice insurance, board certification (ANCC or AANP). FQHC positions may qualify for NHSC loan repayment ($50,000-$75,000 over 2-3 years). Hospital privileges may be required for inpatient-facing roles. Contract as 1099 independent contractor (preferred for tax advantages) or W-2 employee — negotiate based on your business structure.',
    marketDemand: 'Extremely High — physician shortage is projected at 124,000 by 2034. NP demand growing 40%+ through 2031. Psychiatry has the worst shortage of any medical specialty — avg wait for new psych patient is 25 days in urban areas, 6+ months in rural. FQHCs, rural clinics, and multi-specialty groups are aggressively recruiting NPs. Telehealth contracts allow serving multiple groups from one location.',
  },
  // ─── Alcohol Use Disorder (AUD) ───
  {
    id: 'aud',
    name: 'Alcohol Use Disorder (AUD)',
    status: 'planned',
    icon: '&#128683;',
    color: '#b91c1c',
    summary: 'Dedicated alcohol use disorder treatment program — FDA-approved pharmacotherapy (naltrexone, acamprosate, disulfiram), evidence-based screening (AUDIT-C), motivational interviewing, relapse prevention, and lab monitoring. The most common and most undertreated substance use disorder in the US. Telehealth-native model removes stigma barriers.',
    targetPatient: 'Adults with mild, moderate, or severe AUD (DSM-5 criteria). Spectrum ranges from high-functioning professionals wanting to reduce drinking to severe dependence requiring medical management. Massive overlap with psych panel — 37% of those with AUD also have a mental health disorder (depression, anxiety, PTSD, bipolar).',
    revenueModel: 'Insurance-based with strong commercial and Medicaid coverage. AUD pharmacotherapy is well-reimbursed. Vivitrol (injectable naltrexone) generates J-code revenue ($1,200-$1,800/injection). High retention for motivated patients (12-24+ months). Group therapy (90853) scales revenue. Cash-pay options for privacy-conscious patients ($200-$400/month programs).',
    annualRevenuePerPatient: '$3,000 - $8,000',
    visitFrequency: 'Weekly (first month), biweekly (months 2-3), monthly (maintenance). Vivitrol patients: monthly injection visits.',
    billingCodes: [
      { code: '99205', desc: 'New patient comprehensive AUD evaluation', rate: '$250 - $350' },
      { code: '99214', desc: 'AUD follow-up, moderate complexity', rate: '$130 - $190' },
      { code: '99215', desc: 'AUD follow-up, high complexity (dual-diagnosis)', rate: '$180 - $250' },
      { code: '99408', desc: 'SBIRT screening & brief intervention, 15-30 min', rate: '$34 - $45' },
      { code: '99409', desc: 'SBIRT screening & brief intervention, 30+ min', rate: '$66 - $85' },
      { code: 'J2315', desc: 'Naltrexone injection (Vivitrol), per 1mg', rate: '$1,200 - $1,800/injection' },
      { code: '96372', desc: 'Therapeutic injection administration', rate: '$25 - $35' },
      { code: '90853', desc: 'Group psychotherapy / support group', rate: '$30 - $50/patient' },
      { code: 'H0001', desc: 'Alcohol/drug assessment', rate: '$80 - $150' },
      { code: 'H0005', desc: 'Alcohol/drug group counseling', rate: '$25 - $45/patient' },
      { code: '80305', desc: 'Drug/alcohol test, presumptive (urine/breath)', rate: '$15 - $25' },
      { code: '80320', desc: 'Alcohol biomarkers (PEth, CDT)', rate: '$25 - $50' },
      { code: '80076', desc: 'Hepatic function panel (liver monitoring)', rate: '$12 - $20' },
      { code: 'F10.20', desc: 'Alcohol dependence, uncomplicated (ICD-10)', rate: 'Diagnosis code' },
      { code: 'F10.21', desc: 'Alcohol dependence, in remission (ICD-10)', rate: 'Diagnosis code' },
      { code: 'F10.10', desc: 'Alcohol abuse, uncomplicated (ICD-10)', rate: 'Diagnosis code' },
    ],
    clinicalConsiderations: [
      'FDA-approved medications: naltrexone (oral 50mg daily or Vivitrol 380mg IM monthly), acamprosate (666mg TID), disulfiram (250mg daily)',
      'Naltrexone: most prescribed, reduces cravings and heavy drinking days. Contraindicated with opioid use — check PDMP',
      'Vivitrol (injectable naltrexone): superior adherence vs oral. High-revenue procedure — administer in office monthly',
      'Acamprosate: best for maintaining abstinence post-detox. Renally cleared — adjust for CKD. No liver concerns.',
      'Disulfiram: aversion therapy (causes illness if patient drinks). Requires high motivation. Monitor LFTs.',
      'Off-label options: topiramate (reduces heavy drinking days), gabapentin (reduces cravings, helps sleep/anxiety)',
      'AUDIT-C screening at intake and every visit — documents severity and treatment response for payers',
      'Lab monitoring: CBC, CMP, hepatic panel, GGT, MCV at baseline and every 3-6 months. PEth for objective biomarker.',
      'Alcohol withdrawal assessment: CIWA-Ar protocol. Severe withdrawal (seizure risk) requires referral to detox — do NOT manage outpatient',
      'Dual-diagnosis is the norm: treat depression/anxiety/PTSD simultaneously — AUD often drives or worsens psych symptoms',
      'Motivational interviewing is evidence-based first-line psychosocial approach — stage-matched to readiness',
      'The Sinclair Method (TSM): naltrexone taken 1 hour before drinking to reduce pharmacological reward. Growing evidence base.',
      'Group therapy (90853) is scalable and effective — 6-10 patients, bill each individually. Topics: relapse prevention, coping skills, triggers',
      'Coordinate with AA/SMART Recovery — community support improves long-term outcomes',
      'Telehealth removes stigma barrier — many patients will seek AUD treatment virtually who would never walk into a clinic',
      'Privacy-conscious patients (professionals, executives): offer cash-pay programs to avoid insurance records',
    ],
    credentialingNotes: 'PMHNP/FNP scope fully covers AUD pharmacotherapy — no special certification required. Naltrexone and acamprosate are NOT controlled substances — no DEA schedule issues. Disulfiram is also unscheduled. Vivitrol requires buy-and-bill setup (purchase drug, administer, bill J-code + admin fee). Most commercial payers and Medicaid cover AUD treatment. Consider ASAM (American Society of Addiction Medicine) membership for credibility. Some payers have specific SUD provider enrollment — check each payer.',
    marketDemand: 'Massive and severely underserved — 29.5M Americans have AUD (most common SUD), but only 7.6% receive ANY treatment, and only 2.1% receive medication. Alcohol kills 178,000 Americans/year (more than opioids). WHO ranks AUD treatment among the most cost-effective healthcare interventions. Payers are actively seeking providers who prescribe AUD medications. Telehealth AUD programs (Ria Health, Monument, Oar Health) have proven the virtual model works — but most lack prescribing providers.',
  },
  // ─── Facility-Based Mental Health Services ───
  {
    id: 'facility-mh',
    name: 'Facility-Based Mental Health Services',
    status: 'planned',
    icon: '&#127963;',
    color: '#1e40af',
    summary: 'Psychiatric NP staffing and clinical coverage across 10+ facility types — psychiatric hospitals (freestanding and hospital-based units), crisis stabilization units (CSUs), partial hospitalization programs (PHPs), intensive outpatient programs (IOPs), residential treatment centers (RTCs), skilled nursing facilities (SNFs), assisted living/group homes, medical detox centers, correctional/forensic facilities, consult-liaison (C-L) psychiatry on medical floors, ER psychiatric evaluations, and telepsychiatry hubs serving rural facilities. The FACILITY is the client — contract-based revenue with guaranteed volume.',
    targetPatient: 'The client is the FACILITY, not individual patients. Facility types: 1) Psychiatric hospitals (state and private — inpatient units, 24/7 coverage), 2) Crisis stabilization units (23-72 hr crisis beds, 988-funded), 3) PHPs (structured day programs, step-down from inpatient), 4) IOPs (3+ hr/day evening/day programs), 5) Residential treatment centers (30-90 day programs, dual-diagnosis, adolescent, eating disorders), 6) SNFs and long-term care (dementia behavioral management, psychotropic review), 7) Assisted living and group homes (behavioral health oversight), 8) Medical detox centers (withdrawal management, stabilization), 9) Correctional facilities (jails, prisons, juvenile detention — intake screening, ongoing care, competency evals), 10) Hospital medical floors (consult-liaison psychiatry — delirium, capacity evals, medically complex psych), 11) ER departments (psych crisis evaluations, Baker Act/involuntary holds), 12) Telepsychiatry command centers (hub covering multiple rural facilities remotely).',
    revenueModel: 'Contract-based with multiple models per facility type. Psychiatric hospitals: monthly retainer $20,000-$35,000 for medical director + clinical coverage. CSUs: $15,000-$25,000/month. PHPs: per-diem billing $250-$600/day per patient (program revenue $3,750-$9,000/day with 15 patients). IOPs: hourly or per-diem $200-$400/day. RTCs: $12,000-$20,000/month medical director + coverage. SNFs: per-patient consultation fees ($150-$300/visit) or monthly retainer ($3,000-$8,000). Correctional: annual contracts $150,000-$250,000. C-L Psychiatry: hourly ($150-$250/hr) or per-consult ($250-$500). ER Psych: per-shift ($1,200-$3,000/12hr) or hourly ($100-$250, nights/weekends 1.5-2x). Telepsychiatry hub: $5,000-$10,000/month per facility covered remotely.',
    annualRevenuePerPatient: '$120,000 - $350,000 per contract',
    visitFrequency: 'Varies by facility type. Psychiatric hospital/inpatient: daily rounding on 15-25 patient census. CSU: every shift (8-12 hr). PHP: daily, 5 days/week. IOP: 3-5 days/week. RTC: 2-3x/week plus on-call. SNF: weekly-biweekly rounds + PRN. Correctional: scheduled clinic days + emergency call. C-L: PRN consults, avg 3-8/day. ER: shift-based (8-12 hr). Telepsychiatry: scheduled shifts covering multiple sites.',
    billingCodes: [
      // ─── Psychiatric Evaluation (all facility types) ───
      { code: '90791', desc: 'Psychiatric diagnostic evaluation — intake at any facility', rate: '$200 - $350' },
      { code: '90792', desc: 'Psychiatric eval with medical services (labs, meds ordered)', rate: '$250 - $400' },
      // ─── Inpatient / Psychiatric Hospital ───
      { code: '99221', desc: 'Initial hospital care, low complexity (psych admission)', rate: '$150 - $200' },
      { code: '99222', desc: 'Initial hospital care, moderate complexity', rate: '$200 - $280' },
      { code: '99223', desc: 'Initial hospital care, high complexity (SI/psychosis)', rate: '$280 - $380' },
      { code: '99231', desc: 'Subsequent hospital care, stable patient daily round', rate: '$75 - $100' },
      { code: '99232', desc: 'Subsequent hospital care, med change or complication', rate: '$110 - $150' },
      { code: '99233', desc: 'Subsequent hospital care, high complexity (restraint, capacity)', rate: '$150 - $200' },
      { code: '99238', desc: 'Hospital discharge, ≤30 min', rate: '$100 - $150' },
      { code: '99239', desc: 'Hospital discharge, >30 min (safety plan, transition)', rate: '$150 - $200' },
      // ─── ER ───
      { code: '99284', desc: 'ER visit, high severity psychiatric crisis', rate: '$200 - $350' },
      { code: '99285', desc: 'ER visit, immediate threat to life (active SI/HI)', rate: '$350 - $500' },
      // ─── Observation / Crisis Stabilization ───
      { code: '99218', desc: 'Initial observation care (crisis stabilization intake)', rate: '$130 - $180' },
      { code: '99220', desc: 'Initial observation care, high complexity', rate: '$220 - $300' },
      { code: '99217', desc: 'Observation care discharge', rate: '$100 - $150' },
      // ─── PHP / IOP ───
      { code: 'H0035', desc: 'Partial hospitalization (PHP), per diem', rate: '$250 - $600/day' },
      { code: 'H0015', desc: 'Intensive outpatient (IOP), per hour', rate: '$60 - $120' },
      { code: 'S9480', desc: 'IOP psychiatric services, per diem', rate: '$200 - $400/day' },
      { code: '90837', desc: 'Individual psychotherapy 60 min (PHP/IOP/RTC)', rate: '$130 - $180' },
      { code: '90853', desc: 'Group psychotherapy (PHP/IOP/RTC/inpatient)', rate: '$30 - $50/patient' },
      // ─── SNF / Nursing Facility ───
      { code: '99307', desc: 'Nursing facility subsequent care, straightforward', rate: '$60 - $80' },
      { code: '99308', desc: 'Nursing facility subsequent care, low complexity', rate: '$85 - $110' },
      { code: '99309', desc: 'Nursing facility subsequent care, moderate complexity', rate: '$110 - $150' },
      { code: '99310', desc: 'Nursing facility subsequent care, high complexity', rate: '$150 - $200' },
      { code: '99304', desc: 'Nursing facility initial care, low complexity', rate: '$120 - $170' },
      { code: '99306', desc: 'Nursing facility initial care, high complexity', rate: '$200 - $280' },
      // ─── Residential Treatment / Group Home ───
      { code: '99213', desc: 'Outpatient follow-up at RTC/group home', rate: '$90 - $130' },
      { code: '99214', desc: 'RTC/group home visit, moderate complexity', rate: '$130 - $190' },
      // ─── Consult-Liaison ───
      { code: '99252', desc: 'Inpatient consultation, straightforward (delirium screen)', rate: '$110 - $150' },
      { code: '99253', desc: 'Inpatient consultation, low complexity', rate: '$150 - $200' },
      { code: '99254', desc: 'Inpatient consultation, moderate complexity (capacity eval)', rate: '$200 - $270' },
      { code: '99255', desc: 'Inpatient consultation, high complexity (complex psych-medical)', rate: '$270 - $360' },
      // ─── Detox / Withdrawal Management ───
      { code: 'H0010', desc: 'Sub-acute detoxification, per diem (residential)', rate: '$200 - $500/day' },
      { code: 'H0012', desc: 'Sub-acute detoxification, per hour (outpatient)', rate: '$40 - $80' },
      { code: 'H0014', desc: 'Ambulatory detoxification', rate: '$150 - $350/day' },
    ],
    clinicalConsiderations: [
      // ─── Psychiatric Hospitals / Inpatient Units ───
      'PSYCHIATRIC HOSPITAL — ADMISSION: complete psychiatric evaluation (90791/90792), risk assessment (C-SSRS), treatment plan within 24 hours, medication reconciliation, notify outpatient provider. Document medical necessity: why this patient requires 24-hour monitoring and cannot be safely managed at a lower level of care.',
      'PSYCHIATRIC HOSPITAL — DAILY ROUNDING: assess mood, psychosis, SI/HI, sleep, appetite, medication response/side effects. Nursing/milieu observations. Treatment team meetings (psychiatry, nursing, social work, therapy). Update treatment plan. Document continued stay criteria at EVERY visit — payers deny retrospectively if not documented.',
      'PSYCHIATRIC HOSPITAL — DISCHARGE PLANNING: start on admission. Criteria: acute crisis resolved, medication stabilized ≥48 hrs, safety plan completed, outpatient follow-up within 7 days (HEDIS FUH measure), medications prescribed/filled before discharge, support system confirmed, crisis numbers provided.',
      // ─── Crisis Stabilization Units (CSUs) ───
      'CRISIS STABILIZATION UNIT: 23-72 hour crisis intervention facility. Rapid assessment, medication stabilization (PRN and scheduled), safety monitoring, brief counseling, disposition planning. Lower cost than inpatient ($600-$1,200/day vs $1,500-$3,000/day inpatient). Expanding rapidly due to 988 Suicide & Crisis Lifeline funding.',
      'CSU PROGRAMMING: brief individual sessions (motivational interviewing, safety planning, coping skills), group support, medication management, family contact, care coordination with outpatient providers. Goal: stabilize and discharge to PHP/IOP/outpatient within 72 hours.',
      // ─── Partial Hospitalization Programs (PHPs) ───
      'PHP STRUCTURE: 5 days/week, 6+ hours/day. Therapeutic programming: CBT groups, DBT skills groups, psychoeducation, medication management, individual therapy, art/music therapy, recreational therapy. Patients go home nightly. Medical director oversees programming, sees patients individually 1-2x/week.',
      'PHP ADMISSION CRITERIA: step-down from inpatient (needs structure but not 24-hour monitoring) OR direct admission (significant functional impairment, not safe for outpatient alone, but can maintain safety overnight at home). Typical length of stay: 2-4 weeks.',
      // ─── Intensive Outpatient Programs (IOPs) ───
      'IOP STRUCTURE: 3-5 days/week, 3+ hours/day. Primarily group-based: process groups, skills groups (DBT, CBT), relapse prevention, trauma-focused. Individual psychiatric sessions weekly or biweekly. Evening IOP captures working adults — major differentiator.',
      'IOP POPULATIONS: depression/anxiety (general adult), SUD/dual-diagnosis, trauma/PTSD, adolescent, eating disorders, perinatal mood disorders. Specialized tracks increase referrals and allow targeted marketing.',
      // ─── Residential Treatment Centers (RTCs) ───
      'RESIDENTIAL TREATMENT: 30-90 day programs. Populations: dual-diagnosis (SUD + psych), eating disorders, trauma/PTSD, adolescent behavioral health, personality disorders (DBT-intensive). NP role: psychiatric evaluations, medication management, medical oversight, treatment team participation. Visit 2-3x/week + on-call.',
      'RTC MEDICATION MANAGEMENT: high-acuity, complex medication regimens. Polypharmacy common. Focus on simplification, evidence-based prescribing, monitoring for drug interactions. Coordinate with therapists on behavioral interventions to minimize medication dependence.',
      // ─── Skilled Nursing Facilities (SNFs) / Long-Term Care ───
      'SNF BEHAVIORAL HEALTH: growing demand as 10,000 baby boomers turn 65 daily. Primary presentations: dementia-related behavioral disturbances (agitation, aggression, psychosis), late-life depression, anxiety, adjustment disorders, delirium workup. OBRA regulations require psychotropic medication review — NP role is critical for compliance.',
      'SNF PSYCHOTROPIC REVIEW: CMS Unnecessary Medication regulations mandate gradual dose reductions (GDRs) for antipsychotics unless clinically contraindicated. Document medical necessity for EVERY psychotropic. F-tag F758 citations are common — facilities NEED psychiatric NPs for compliance.',
      'SNF REVENUE MODEL: per-patient consultation ($150-$300/visit), monthly retainer ($3,000-$8,000 depending on census), or per-facility contract. Round on 20-40 patients per visit day. Typical: 1-2 facility days/week = $3,000-$6,000/week from SNF work alone.',
      // ─── Assisted Living / Group Homes ───
      'ASSISTED LIVING / GROUP HOMES: behavioral health oversight for residents with SMI, intellectual/developmental disabilities (IDD), or dementia. Medication management, behavioral intervention plans, staff training on de-escalation, crisis consultation. Lower acuity than SNF but high volume — many facilities cluster in same geographic area.',
      // ─── Medical Detox Centers ───
      'MEDICAL DETOX: withdrawal management for alcohol (CIWA-Ar protocol), opioids (COWS protocol, buprenorphine micro-dosing), benzodiazepines (slow taper), and stimulants (supportive care). 3-7 day programs. NP provides medical oversight, symptom management, medication orders, transition planning to residential/outpatient. Billing: H0010-H0014 per diem + E/M codes.',
      'DETOX MEDICATION PROTOCOLS: Alcohol → symptom-triggered benzodiazepines (chlordiazepoxide or lorazepam) based on CIWA-Ar score. Thiamine 100mg IV/IM then PO. Folate, magnesium, multivitamin. Seizure prophylaxis if CIWA >15. Opioid → buprenorphine induction (standard or micro-dosing) or methadone (if licensed OTP). Benzodiazepine → convert to long-acting equivalent (diazepam), reduce 10-25% every 1-2 weeks.',
      // ─── Correctional / Forensic Facilities ───
      'CORRECTIONAL PSYCHIATRY: jail intake screening (suicide risk, psychotropic medication continuity, substance withdrawal risk), ongoing psychiatric care for inmates with SMI, competency to stand trial evaluations, not guilty by reason of insanity evaluations, segregation mental health checks, release planning with medication bridge and community referrals.',
      'CORRECTIONAL REVENUE: state/county contracts $150,000-$250,000/year. Multi-year contracts with built-in cost-of-living increases. Recession-proof — corrections budgets are non-discretionary. High demand, low competition — most providers avoid correctional work.',
      // ─── Consult-Liaison (C-L) Psychiatry ───
      'CONSULT-LIAISON PSYCHIATRY: psychiatric consultation on medical/surgical floors. Common requests: delirium assessment, capacity evaluations (consent for surgery, AMA discharge, medication refusal), depression/anxiety in medically ill, somatoform disorders, post-transplant psych clearance, pain and psychiatric comorbidity, agitation management in ICU.',
      'C-L BILLING: initial consultation codes (99252-99255) on first encounter, then subsequent hospital care codes (99231-99233) for follow-up days. Can see 3-8 consults/day depending on complexity. Bill under your NPI — consult codes are separately billable from the admitting team.',
      // ─── ER Psychiatric Services ───
      'ER PSYCH EVALUATIONS: Baker Act (FL), 5150 (CA), involuntary hold criteria vary by state. Know YOUR state statute. Workflow: triage → medical clearance (labs, vitals, BAL, tox screen) → psychiatric evaluation → risk assessment (C-SSRS) → disposition (admit, discharge with safety plan, transfer, observation, involuntary hold).',
      // ─── Telepsychiatry Hub Model ───
      'TELEPSYCHIATRY HUB: operate a telepsychiatry command center covering multiple rural/underserved facilities. One NP covers 3-5 facilities from home via video. Facilities pay $5,000-$10,000/month each for scheduled + on-call coverage. Total: $15,000-$50,000/month. No commute, no relocation. Scale by adding NP contractors to cover more facilities.',
      'TELEPSYCHIATRY IN FACILITIES: same billing codes with telehealth modifiers (95, GT). Place of service 02 (telehealth — facility). Works for ER, inpatient, SNF, correctional, CSU — any facility that has video capability and a presenting nurse/tech.',
    ],
    credentialingNotes: 'PMHNP scope covers all facility-based psychiatric services in most states. Hospital privileges required for inpatient and ER work — apply through each facility medical staff office (60-120 days). SNF, RTC, group home, and correctional work generally do NOT require hospital privileges — credentialing is through the facility directly. Some states require collaborative practice agreements for hospital-based NPs. DEA registration required for prescribing in facility settings. Malpractice: occurrence-based policy preferred for facility work ($1M/$3M minimum, higher for ER and forensic). Verify state-specific scope: can NPs initiate involuntary holds, write restraint/seclusion orders, perform capacity evaluations, admit patients independently? Varies significantly by state and facility bylaws. Locum tenens agencies (CompHealth, Weatherby, AMN, Jackson & Coker) can expedite facility placements while you build direct relationships.',
    marketDemand: 'Extreme across ALL facility types. Psychiatric hospitals: 65% report staffing shortages. SNFs: CMS psychotropic review mandates create demand for psychiatric NPs at every nursing facility in the country. Correctional: 44% of jail inmates have mental health problems, only 29% receive treatment. PHP/IOP: demand surging as payers prefer lower-cost step-down settings over inpatient. Crisis stabilization: 988 funding creating hundreds of new CSUs nationwide — all need psychiatric staffing. Consult-liaison: only 3% of hospitals have adequate C-L psychiatry coverage. Telepsychiatry for rural facilities: 60% of US counties have zero psychiatrists. Overall: NPs now provide 40%+ of facility psychiatric coverage nationwide, up from 15% a decade ago.',
  },
  // ─── Payer Referral Network ───
  {
    id: 'payer-referral',
    name: 'Payer Referral Network',
    status: 'planned',
    icon: '&#128279;',
    color: '#0d9488',
    summary: 'Submit provider availability directly to payer care navigators who schedule their members into your open slots. Zero patient acquisition cost — the payer finds and sends you the patients. Model proven by Lucet (Florida Blue), where providers share availability and Lucet care navigators schedule members directly. Replicable across every BCBS plan, Medicaid MCO, EAP, VA CCN, and telehealth platform nationwide.',
    targetPatient: 'The payer is the client, not the patient. Payers with network adequacy gaps need providers in specific states/specialties. Target: BCBS plans (36 independent plans), Medicaid MCOs (Molina, Centene, UHC Community, Humana, Aetna Better Health), EAP vendors (ComPsych, Lyra, Spring Health), VA Community Care (Optum/TriWest), telehealth platforms (Teladoc, Amwell, MDLive), and specialty BH network managers (Lucet, Carelon, Optum BH).',
    revenueModel: 'Standard fee-for-service — you bill the payer for each visit at contracted rates, same as any other patient. The difference is patient acquisition cost = $0. Payer care navigators schedule 5-20 patients/month per payer. At avg $150-$250/visit = $750-$5,000/payer/month. Across 8-10 payer networks = $6,000-$50,000/month in referral-driven revenue. No marketing spend, no directory listings, no Psychology Today profile — payer does the work.',
    annualRevenuePerPatient: '$1,800 - $3,600 per referred patient/year',
    visitFrequency: 'Depends on payer referral volume. Typical: 5-20 new patient referrals per payer per month. Each patient becomes ongoing (monthly follow-ups). Panel builds over time — recurring revenue compounds.',
    billingCodes: [
      { code: '99205', desc: 'New patient evaluation (payer-referred intake)', rate: '$205 - $350' },
      { code: '99214', desc: 'Follow-up visit (ongoing management)', rate: '$130 - $190' },
      { code: '99213', desc: 'Follow-up visit (stable patient)', rate: '$90 - $130' },
      { code: '90837', desc: 'Psychotherapy 60 min', rate: '$130 - $180' },
      { code: '90838', desc: 'Psychotherapy 45-60 min with E/M', rate: '$110 - $150' },
      { code: '90833', desc: 'Psychotherapy add-on 30 min (with E/M)', rate: '$60 - $85' },
      { code: '90836', desc: 'Psychotherapy add-on 45 min (with E/M)', rate: '$85 - $115' },
      { code: '90791', desc: 'Psychiatric diagnostic evaluation', rate: '$200 - $350' },
      { code: '96127', desc: 'Screening tool (PHQ-9, GAD-7) — per administration', rate: '$5 - $8' },
      { code: 'N/A', desc: 'Same billing codes as standard visits — referral source does not change coding', rate: 'Contracted rates' },
    ],
    clinicalConsiderations: [
      'LUCET MODEL (PROVEN): Provider submits weekly availability (open slots) to Lucet portal. Lucet care navigators match Florida Blue members to providers based on specialty, location, availability, and member preference. Navigator schedules the appointment. Provider sees the patient. Provider bills Florida Blue. No patient acquisition cost.',
      'BCBS NETWORK MODEL: Each of the 36 independent BCBS plans has a BH network manager (Lucet, Carelon, Optum BH, or internal). Contact each plan and ask: "How do I submit my provider availability so your care navigators can schedule members with me?" BCBSNM explicitly recruits BH telehealth providers on their website.',
      'MEDICAID MCO MODEL: Medicaid MCOs (Molina, Centene, UHC Community) have care coordinators who need to place members with BH providers. Contact provider relations and ask about their referral/scheduling program. Network adequacy requirements mean they MUST fill gaps.',
      'VA COMMUNITY CARE MODEL: Register with Optum (East) or TriWest (West) as a VA CCN community provider. When a veteran cannot get a VA appointment within access standards, VA authorizes community care. Optum/TriWest routes the veteran to available community providers. You see the veteran, bill VA rates.',
      'EAP MODEL: EAP vendors (ComPsych, Lyra, Spring Health, Headway) maintain provider panels. Join their network. When an employee calls the EAP line, the intake coordinator schedules them with an available provider from the panel. You see the patient for 3-6 EAP sessions.',
      'TELEHEALTH PLATFORM MODEL: Teladoc, Amwell, MDLive contract with individual providers to fill their BH panels. Join as a contracted provider. Platform schedules patients into your slots. You get paid per visit at platform rates.',
      'AVAILABILITY MANAGEMENT: Block dedicated hours for payer-referred patients (e.g., Mon/Wed mornings = Lucet referrals, Tue/Thu = Optum referrals). This prevents overbooking and ensures you deliver on committed availability.',
      'INTAKE OPTIMIZATION: Payer-referred patients already have insurance verified. No eligibility issues. Focus intake on clinical assessment, not administrative. Faster time-to-treatment = better outcomes = payer renews your referral status.',
      'CROSS-PAYER STRATEGY: Start with 2-3 payers. Build volume. As panel fills, become selective — prioritize payers with best reimbursement rates and lowest admin burden. Use referral data to negotiate higher rates at contract renewal.',
      'NETWORK ADEQUACY LEVERAGE: Federal and state laws require payers to maintain adequate BH provider networks. Many are out of compliance. Your availability SOLVES their compliance problem. This gives you negotiating power on rates and terms.',
      'QUALITY METRICS: Payers track provider quality — appointment no-show rates, patient satisfaction, treatment outcomes, documentation completeness. High-quality providers get more referrals. Low-quality providers get removed from navigator routing.',
      'PANEL CAPACITY PLANNING: Each payer-referred new patient becomes an ongoing patient (monthly follow-ups). 10 new referrals/month = 10 additional follow-up patients/month. After 12 months: 10 new + 100 follow-ups = 110 patients. Plan capacity accordingly.',
    ],
    credentialingNotes: 'Must be credentialed with each payer BEFORE receiving referrals — this is where standard credentialing (which you already do on Credentik) is the prerequisite. The referral network is the monetization layer ON TOP of credentialing. No additional credentialing needed — you are already in-network. The step is operational: contact the payer BH network manager, request to be added to their care navigator routing, submit your availability schedule. For VA CCN: register at vacaa.med.va.gov/provider or contact Optum/TriWest directly. For EAPs: apply through each EAP vendor provider portal.',
    marketDemand: 'Massive structural demand. 160M+ Americans have behavioral health needs. Provider shortage: only 28,000 psychiatrists vs 45,000+ needed. 60% of US counties have zero psychiatrists. Every major payer is actively recruiting telehealth BH providers to fill network gaps. Federal network adequacy rules (Mental Health Parity Act, CMS network adequacy standards) require payers to maintain access — they face penalties for non-compliance. The providers who make themselves AVAILABLE to payer navigators get the patients. This is not competitive — it is filling a void. Companies like Alma, Headway, Grow Therapy, and Rula built billion-dollar valuations by inserting themselves between providers and payers in this exact model.',
    outreachContacts: [
      { tier: 'BH Carve-Outs', payer: 'Lucet (Florida Blue)', contact: 'ACTIVE — already partnered', status: 'active' },
      { tier: 'BH Carve-Outs', payer: 'Carelon Behavioral Health', contact: '800-397-1630 | providerrelations@carelon.com', status: 'planned' },
      { tier: 'BH Carve-Outs', payer: 'Magellan Health', contact: '800-788-4005 | providerrelations@magellanhealth.com', status: 'planned' },
      { tier: 'BH Carve-Outs', payer: 'Optum Behavioral Health', contact: '877-614-0484 | providerexpress.com', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'BCBS NM', contact: '800-232-2345 | jessica_urioste@bcbsnm.com', status: 'outreach' },
      { tier: 'BCBS Plans', payer: 'BCBS TX', contact: '800-451-0287', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'Anthem (CA,CO,CT,NV,NY,VA)', contact: '800-677-6669', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'CareFirst BCBS (DC,MD,VA)', contact: '800-842-5975', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'Regence BCBS (OR,WA,UT,ID)', contact: '800-452-7278', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'BCBS MA', contact: '800-882-2060', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'BCBS MN', contact: '800-262-0820', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'Highmark BCBS (WV)', contact: '800-876-7639', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'BCBS OK', contact: '800-942-5837', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'BCBS KS', contact: '800-432-3990', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'BCBS VT', contact: '800-247-2583', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'BCBS WY', contact: '800-851-2227', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'BCBS ND', contact: '800-342-4718', status: 'planned' },
      { tier: 'BCBS Plans', payer: 'BCBS MT', contact: '800-447-7828', status: 'planned' },
      { tier: 'National Payers', payer: 'UnitedHealthcare', contact: '877-842-3210 | uhcprovider.com', status: 'planned' },
      { tier: 'National Payers', payer: 'Cigna / Evernorth', contact: '800-882-4462 | cignaforhcp.cigna.com', status: 'planned' },
      { tier: 'National Payers', payer: 'Aetna', contact: '800-624-0756 | providerrelations@aetna.com', status: 'planned' },
      { tier: 'National Payers', payer: 'Humana', contact: '800-448-6262 | humana.com/provider', status: 'planned' },
      { tier: 'Medicaid MCOs', payer: 'Molina Healthcare', contact: '888-562-5442 | molinahealthcare.com/providers', status: 'planned' },
      { tier: 'Medicaid MCOs', payer: 'Sunshine Health (FL)', contact: '866-796-0530 | sunshinehealth.com/providers', status: 'planned' },
      { tier: 'Medicaid MCOs', payer: 'Centene / Ambetter', contact: 'Through state-level plans', status: 'planned' },
      { tier: 'EAP / Telehealth', payer: 'Lyra Health', contact: 'providers@lyrahealth.com', status: 'planned' },
      { tier: 'EAP / Telehealth', payer: 'Spring Health', contact: 'providers@springhealth.com', status: 'planned' },
      { tier: 'EAP / Telehealth', payer: 'Headway', contact: 'join@headway.co', status: 'planned' },
      { tier: 'EAP / Telehealth', payer: 'Grow Therapy', contact: 'providers@growtherapy.com', status: 'planned' },
      { tier: 'EAP / Telehealth', payer: 'Alma', contact: 'hello@helloalma.com', status: 'planned' },
      { tier: 'VA Community Care', payer: 'VA CCN (Optum East)', contact: 'Already registered via Optum', status: 'outreach' },
      { tier: 'VA Community Care', payer: 'VA CCN (TriWest West)', contact: '888-874-9378 | providerservices@triwest.com', status: 'planned' },
    ],
  },
];

// ─── Service Line Intelligence: Business Cases, Coding, Protocols, Launch Plans ───
const SERVICE_LINE_INTEL = {
  psych: {
    businessCase: [
      'Break-even: 25-30 patients/week at avg $150/visit = $15,000-$18,000/month gross. Overhead (EHR, malpractice, licensing): ~$2,000-$3,000/month. Net margin: 80%+',
      'Patient lifetime value (LTV): avg patient stays 18-24 months × $150-$250/month = $2,700-$6,000 LTV',
      'New patient acquisition cost via telehealth marketing: $50-$150. ROI: 18x-120x per patient acquired',
      'Scalability: one PMHNP seeing 15-20 patients/day × 5 days = 75-100 patients/week × $130 avg = $40,000-$52,000/month',
      'Add-on revenue: psychotherapy add-ons (90833/90836) increase visit revenue 40-60% with minimal extra time',
      'CCM (99490): bill $42-$65/month for chronic psych patients between visits — passive income, delegatable to MA',
    ],
    codingGuide: [
      'E/M level selection: time-based coding (post-2021 guidelines) — document total time including chart review, coordination',
      '99213 (20 min) vs 99214 (30-39 min) vs 99215 (40+ min): upcoding to 99214/99215 is justified when documenting complexity',
      'Psychotherapy add-ons (90833/90836/90838): bill WITH E/M code — must document separate psychotherapy note within the encounter',
      'Modifier 25: use when billing E/M + procedure same day (e.g., PHQ-9 screening 96127 + 99214)',
      '96127 (screening tool): $5-$8 per administration — bill for PHQ-9, GAD-7, AUDIT-C, PCL-5 at EVERY visit',
      'Place of Service 10 (telehealth in patient home) vs 02 (telehealth in facility): POS 10 is standard for DTC telehealth',
      'Modifier 95 (synchronous telehealth): required by most payers. Some accept GT modifier instead. Check payer-specific rules.',
      'Split/shared visits: if collaborating with physician, document who saw the patient and for how long',
      'New patient vs established: first visit with your NPI = new patient codes (99201-99205) even if seen by another provider',
      'Common denial: "medical necessity" — always link diagnosis to treatment rationale in note. Use ICD-10 specificity (F32.1 not F32.9)',
    ],
    clinicalProtocol: [
      'INTAKE ALGORITHM: PHQ-9 + GAD-7 + AUDIT-C + Columbia Suicide Severity (C-SSRS) + drug screen → comprehensive psych eval (90791 or 99205) → diagnosis → treatment plan',
      'MEDICATION SELECTION: Step 1 → SSRI/SNRI (escitalopram, sertraline, duloxetine) for depression/anxiety. Step 2 → augment (aripiprazole, bupropion) or switch class. Step 3 → TCA, MAOI, or ketamine/esketamine referral',
      'ADHD PATHWAY: structured eval (Vanderbilt/ASRS) + collateral + rule out substance use → stimulant (methylphenidate/amphetamine) vs non-stimulant (atomoxetine, guanfacine) → PDMP check before every Rx',
      'BIPOLAR SCREENING: MDQ (Mood Disorder Questionnaire) at intake for ALL depression patients — misdiagnosis rate is 40%. If positive → mood stabilizer (lithium, valproate, lamotrigine), NOT antidepressant monotherapy',
      'SUICIDALITY PROTOCOL: C-SSRS score ≥ 4 → safety plan → crisis resources → consider higher level of care. Score ≥ 6 → warm handoff to crisis team/ER. Document EVERY encounter.',
      'TREATMENT RESPONSE: reassess at 4-6 weeks. PHQ-9 drop <50% → dose optimize or augment. Full response → maintain 6-12 months (first episode), 2+ years (recurrent)',
      'TAPERING: never abrupt discontinuation of SSRI/SNRI — taper 25% every 2-4 weeks. Venlafaxine/paroxetine require slower tapers.',
      'METABOLIC MONITORING for antipsychotics: weight, BMI, waist circumference, fasting glucose, A1C, lipid panel at baseline → 3 months → annually. Required by APA guidelines.',
    ],
    launchChecklist: [
      'State NP license (full practice authority states preferred — currently 28 states + DC)',
      'DEA registration (Schedule II-V) for each state you practice in',
      'NPI number (Type 1 individual)',
      'Malpractice insurance with telehealth rider ($1M/$3M typical)',
      'CAQH ProView profile — completed and attested (required by all payers)',
      'Payer credentialing: submit to top 5 commercial + Medicaid in each target state (60-120 day lead time)',
      'EHR with e-prescribing (EPCS for controlled substances) — DrChrono, SimplePractice, Athena',
      'PDMP access registered in each practice state',
      'Telehealth platform: HIPAA-compliant video (Doxy.me, Zoom for Healthcare)',
      'Patient intake forms: demographics, consent for telehealth, consent for treatment, PHQ-9, GAD-7, AUDIT-C',
      'Clinical protocols documented: intake workflow, medication algorithm, crisis protocol, follow-up schedule',
      'Marketing: Psychology Today profile, Google Business, referral relationships with PCPs and therapists',
    ],
  },
  weight: {
    businessCase: [
      'Cash-pay GLP-1 program: $350-$500/month × 12 months avg retention = $4,200-$6,000/patient. No insurance overhead (no claims, no denials, no PA)',
      'Insurance model: avg 12 visits/year × $140/visit = $1,680 + medication management. Prior auth burden is real for semaglutide.',
      'Patient acquisition: organic demand is massive — GLP-1 Google searches up 5,000% since 2022. Low marketing cost.',
      'Conversion from psych panel: 30-40% of psych patients on atypicals/mood stabilizers experience significant weight gain — built-in referral pipeline',
      'Compounded semaglutide (if state allows): drug cost $100-200/month, charge patient $350-500 → $150-$300 margin per patient/month',
      'Scale: 50 weight management patients × $400/month cash-pay = $20,000/month recurring with minimal visit time (monthly 15-min check-ins)',
    ],
    codingGuide: [
      'Primary dx: E66.01 (morbid obesity) or E66.09 (other obesity) + Z68.3x-Z68.4x (BMI codes) — BMI code is REQUIRED as secondary',
      'Co-dx for medical necessity: E11 (diabetes), I10 (hypertension), E78 (hyperlipidemia), G47.33 (sleep apnea) — strengthens PA approval',
      'Prior auth for GLP-1s: document BMI ≥30 (or ≥27 + comorbidity), prior diet/exercise failure, and medical necessity. PA denial rate ~30%',
      'Appeal template: cite AMA/Endocrine Society guidelines, document comorbidity resolution with weight loss, cost-avoidance argument',
      'Modifier 25 on E/M if same-day labs or screening tools billed',
      'Preventive counseling (99401/99402) can be billed alongside E/M for lifestyle/diet counseling with separate documentation',
      'Cash-pay programs: NO coding needed — charge flat monthly fee, provide superbill to patient if they want to submit to insurance',
      'G0473 (behavioral counseling for obesity, Medicare): limited to $25-$30/visit but zero copay — good for Medicare patients',
    ],
    clinicalProtocol: [
      'INTAKE: BMI + waist circumference + metabolic panel (A1C, lipids, TSH, CMP) + body composition (optional DEXA). Contraindication screen: personal/family MTC, pancreatitis hx, pregnancy',
      'GLP-1 TITRATION: Semaglutide: 0.25mg weekly × 4 weeks → 0.5mg × 4 weeks → 1.0mg × 4 weeks → 1.7mg → 2.4mg (target). Tirzepatide: 2.5mg → 5mg → 7.5mg → 10mg → 12.5mg → 15mg. Increase only if tolerated.',
      'SIDE EFFECT MANAGEMENT: nausea (most common) → eat smaller meals, avoid fatty foods, ginger, antiemetic PRN. Constipation → fiber + hydration. If intolerable → slow titration or reduce dose.',
      'NUTRITIONAL MONITORING: protein intake ≥60-80g/day to preserve lean mass during rapid loss. Supplement: multivitamin, B12, vitamin D. Monitor for hair loss (telogen effluvium) at months 3-6.',
      'RESPONSE CHECK: <5% body weight loss at 12 weeks on max tolerated dose → reassess adherence, consider switch (semaglutide ↔ tirzepatide), add adjunct (metformin, topiramate)',
      'MAINTENANCE: after reaching goal weight, continue GLP-1 indefinitely (relapse rate 60-70% if discontinued). Can attempt dose reduction but monitor for regain.',
      'PSYCH MEDICATION INTERACTION: GLP-1s slow gastric emptying → may affect absorption of oral psych meds. Monitor levels/efficacy of lithium, lamotrigine, extended-release formulations.',
      'DECISION TREE: BMI 27-29.9 + comorbidity → lifestyle + GLP-1. BMI 30-34.9 → GLP-1 + structured program. BMI 35-39.9 → GLP-1 + consider bariatric referral if fails. BMI ≥40 → dual approach: GLP-1 + bariatric surgery referral.',
    ],
    launchChecklist: [
      'Same licensure as psych — no additional license needed',
      'Clinical scale: purchase or digital scale for baseline weights (if in-person)',
      'GLP-1 supply chain: establish relationships with pharmacy (retail or compounding)',
      'Prior authorization workflow: template letters, appeal process, PA tracking system',
      'Patient agreement: informed consent for GLP-1 therapy including risks, off-label use (if applicable)',
      'Lab ordering: establish standing lab orders (metabolic panel, A1C, lipids) with Quest/LabCorp',
      'Marketing: "Medical Weight Loss" landing page, before/after testimonials (with consent), social media',
      'Cash-pay infrastructure: payment processing for monthly subscriptions (Stripe, Square)',
      'Nutrition handouts: protein requirements, meal planning guides, supplement recommendations',
    ],
  },
  mat: {
    businessCase: [
      'Buprenorphine (Suboxone): $130-$190/visit × monthly × 12+ months = $1,560-$2,280/year per patient. High retention — avg patient stays 2-3 years.',
      'Patient panel: 50-100 MAT patients at monthly visits = steady recurring revenue. Each patient = $130-$190/month guaranteed.',
      'Medicaid pays well for MAT — many states have enhanced MAT reimbursement. Some states pay $300+/month bundled rate.',
      'Urine drug screens: billable at every visit ($15-$100 per screen). 100 patients × monthly screen = $1,500-$10,000/month add-on.',
      'No X-waiver since Jan 2023 — barrier to entry is eliminated. Most providers STILL don\'t prescribe → massive supply gap.',
      'Mission-driven revenue: MAT literally saves lives. Buprenorphine reduces overdose death by 50%. Payers, government, and society all incentivize access.',
    ],
    codingGuide: [
      'Primary dx: F11.20 (opioid dependence, uncomplicated), F11.21 (in remission). Use specific F11.2x codes, not F11.9 (unspecified)',
      'G2086 (office-based OUD treatment, new patient, monthly bundle): $155-$175. Use for first month only.',
      'G2087 (office-based OUD treatment, established, monthly bundle): $115-$135. Use for subsequent months. ALTERNATIVE to E/M — cannot bill both.',
      'E/M codes (99213-99215): use INSTEAD of G-codes if the visit complexity justifies higher reimbursement',
      'UDS billing: 80305 (presumptive, immunoassay) vs 80306/80307 (definitive, mass spectrometry). Presumptive = point-of-care cup. Definitive = send-out lab.',
      'SBIRT (99408/99409): billable at intake. One-time per episode of care for most payers.',
      'Modifier 25 if billing E/M + UDS or E/M + SBIRT on same day',
      'Telehealth: buprenorphine CAN be prescribed via telehealth — DEA extended flexibilities. Audio-only (99441-99443) also accepted for MAT.',
    ],
    clinicalProtocol: [
      'ASSESSMENT: OUD diagnosis (DSM-5 criteria, ≥2 symptoms), COWS score (Clinical Opiate Withdrawal Scale), UDS, pregnancy test, hepatitis B/C screening, HIV screening, PDMP check',
      'INDUCTION: patient must be in mild-moderate withdrawal (COWS ≥8-12). Day 1: 2-4mg buprenorphine, observe 1-2 hours, can give additional 2-4mg. Day 2: total dose from Day 1 + additional 2-4mg. Target: 12-16mg/day by end of week 1.',
      'MICRO-DOSING (Bernese method): for patients who cannot tolerate withdrawal — start 0.5mg buprenorphine while still using opioids, increase by 0.5-1mg/day over 7-10 days while tapering the opioid. Increasingly preferred approach.',
      'STABILIZATION (weeks 2-8): weekly visits, UDS at each visit, dose adjustment (typical maintenance: 12-24mg/day). Address psychosocial needs.',
      'MAINTENANCE (month 3+): monthly visits, UDS, PDMP check. Stable patients may qualify for extended prescriptions (28-day supply).',
      'DIVERSION PREVENTION: observed dosing initially, pill counts, PDMP checks, random call-backs, UDS patterns (buprenorphine should be PRESENT, full agonists ABSENT)',
      'TAPERING (if desired): only after 12+ months stability. Reduce 2mg every 2-4 weeks. Many patients need indefinite maintenance — this is evidence-based, not failure.',
      'RELAPSE PROTOCOL: no discharge for relapse — increase visit frequency, adjust dose, address triggers, consider higher level of care. Relapse is expected, not punished.',
      'NALOXONE CO-PRESCRIBING: prescribe naloxone (Narcan) to EVERY MAT patient and educate on use. Some states require it by law.',
    ],
    launchChecklist: [
      'DEA registration with Schedule III authority (buprenorphine is Schedule III)',
      'PDMP registration in each practice state — check before EVERY prescription',
      'Naloxone prescribing protocol and standing order',
      'COWS scoring tool (Clinical Opiate Withdrawal Scale) in intake workflow',
      'UDS supplies: point-of-care cups (12-panel) or lab send-out standing order',
      'Emergency protocol: precipitated withdrawal management, overdose response',
      'Community resource list: counseling/therapy referrals, housing, vocational, peer support',
      'SAMHSA treatment locator registration (optional but builds referrals)',
      'State Medicaid enrollment — Medicaid is the primary payer for OUD population',
      'Patient agreement: MAT treatment contract, informed consent, confidentiality (42 CFR Part 2)',
    ],
  },
  hormonal: {
    businessCase: [
      'Cash-pay HRT consults: $200-$350 initial, $100-$150 follow-ups. 4 visits/year + labs = $600-$950/year per patient. No insurance overhead.',
      'Insurance model: 99214 ($130-$190) quarterly + labs (covered by insurance) = $520-$760/year billed to insurance.',
      'Patient volume potential: 6,000 women reach menopause DAILY in the US. 85% experience symptoms. Only 15% currently receive HRT.',
      'High patient satisfaction and retention — HRT is life-changing for symptomatic women. Avg retention 5-10+ years.',
      'Cross-sell with psych: 30-40% of women presenting with perimenopause symptoms are MISDIAGNOSED as depression/anxiety. Identifying hormonal root cause → loyal patient.',
      'Telehealth advantage: women 40-55 are the #1 telehealth user demographic. Perfect match.',
      'Lab revenue: if ordering in-house or using markup-friendly lab partners, hormone panels ($150-$400 cash) add margin.',
    ],
    codingGuide: [
      'Primary dx: N95.1 (menopausal/climacteric states), E28.39 (ovarian failure), N95.0 (postmenopausal bleeding — triggers workup)',
      'Symptom codes as secondary: G47.00 (insomnia), R53.83 (fatigue), F32.9 (depression), N94.1 (dyspareunia), R61 (night sweats)',
      'E/M coding: 99205 new patient comprehensive eval → 99214 quarterly follow-ups. Time-based documentation preferred.',
      'Lab orders bill under insurance: E2 (estradiol), FSH, progesterone, total/free testosterone, DHEA-S, thyroid panel, CBC, CMP, lipid panel',
      'Preventive visit codes (99395/99396): use for annual well-woman + HRT monitoring combined',
      'Vaginal estrogen: separate from systemic HRT — can prescribe both. Low risk, high impact for GSM (genitourinary syndrome of menopause)',
      'Testosterone for women (off-label): document medical necessity carefully. Some payers cover, most require appeal.',
      'Compound hormones: patients may request bioidentical compounded. Ensure documentation of why FDA-approved was inadequate if going this route.',
    ],
    clinicalProtocol: [
      'SCREENING: Menopause Rating Scale (MRS) or Green Climacteric Scale at intake. FSH >25-40 IU/L + amenorrhea ≥12 months = menopause. Perimenopause: symptoms + irregular cycles, FSH may fluctuate.',
      'CONTRAINDICATION CHECK: history of breast cancer, DVT/PE, active liver disease, unexplained vaginal bleeding, known clotting disorder → HRT generally contraindicated. Shared decision-making for relative contraindications.',
      'HRT INITIATION: Systemic estrogen (oral estradiol 0.5-1mg or patch 0.025-0.05mg) + progesterone (if uterus intact: micronized progesterone 100-200mg nightly). Start LOW, titrate up at 8-12 weeks.',
      'SYMPTOM RESPONSE: reassess at 8-12 weeks. Hot flashes should reduce 75-90%. Sleep, mood, cognition improvements by week 4-8. If inadequate → increase estradiol dose, add testosterone.',
      'MONITORING: baseline mammogram + lipids + BMD (if indicated). Repeat labs at 3 months (estradiol trough, progesterone), then annually. Annual mammogram per USPSTF guidelines.',
      'TESTOSTERONE (off-label for women): total T <25 ng/dL + low libido + fatigue → trial topical testosterone (compounded cream 0.5-1mg/day or 1% gel). Monitor total T, free T, DHEA-S, SHBG at 6 weeks.',
      'DURATION: NAMS recommends individualized approach. No arbitrary cutoff. Reassess annually. Many women continue 10+ years safely.',
      'NON-HORMONAL ALTERNATIVES: SSRIs (paroxetine 7.5mg — FDA-approved for hot flashes), gabapentin, clonidine, CBT, fezolinetant (Veozah — new NK3 antagonist).',
    ],
    launchChecklist: [
      'FNP license covers HRT prescribing — no additional certification needed',
      'NAMS (North American Menopause Society) certification: optional but adds major credibility',
      'Lab ordering: establish hormone panel standing orders with Quest/LabCorp',
      'Prescribing: estradiol patches/oral, progesterone, and compounding pharmacy relationship for testosterone',
      'Patient intake: MRS or Green Climacteric Scale, menstrual history, contraindication screening',
      'Informed consent: HRT risk/benefit discussion template (WHI data contextualized)',
      'Marketing: "Menopause Specialist" positioning. Partner with OB/GYN practices for referrals.',
      'Patient education materials: HRT myths vs facts, lifestyle modifications, supplement guidance',
    ],
  },
  sleep: {
    businessCase: [
      'Low startup cost — no new equipment, meds, or certifications. Pure clinical visits + existing EHR.',
      'Psych patient overlap: 50-80% of psych patients have sleep complaints. Formalizing = capturing visits that currently happen informally.',
      'CBT-I programs: 6-8 sessions × $130-$190/session = $780-$1,520 per patient. Can be done via telehealth.',
      'Group CBT-I: 6-8 patients × 6 sessions × $50/patient/session = $1,800-$2,400 per group cycle. Highly efficient.',
      'Sleep study referral revenue: partner with sleep lab for referral agreements. Home sleep tests (HST) can be ordered directly.',
      'Recurring maintenance: patients with chronic insomnia return quarterly → $400-$760/year ongoing.',
    ],
    codingGuide: [
      'Primary dx: G47.00/G47.09 (insomnia), G47.30/G47.33 (sleep apnea — for screening/referral), F51.01 (primary insomnia, DSM-5)',
      'E/M codes: 99205 (new sleep eval) → 99214 (follow-ups). Same coding as psych visits — no new codes to learn.',
      'Behavioral intervention: 96152 (health behavior intervention) for CBT-I sessions — bill in addition to or instead of E/M',
      'Screening tool: document ISI (Insomnia Severity Index) or PSQI at each visit → supports medical necessity',
      'Home sleep test ordering: 95806 (unattended sleep study). FNP/PMHNP can order — refer for interpretation if needed.',
      'Melatonin receptor agonists (ramelteon): non-controlled, no PDMP issue. Bill E/M + document sleep diary review.',
      'Avoid coding pitfalls: insomnia due to mental disorder (F51.05) vs primary insomnia (F51.01) — choose based on clinical picture. Primary insomnia justifies sleep-focused visit.',
    ],
    clinicalProtocol: [
      'INTAKE: ISI (Insomnia Severity Index) + STOP-BANG (sleep apnea screening) + sleep diary (2 weeks) + Epworth Sleepiness Scale. Rule out: medical (pain, thyroid, GERD), substance (caffeine, alcohol), medication-induced.',
      'CBT-I FIRST-LINE: 6-8 sessions covering sleep restriction, stimulus control, cognitive restructuring, relaxation training, sleep hygiene. More effective than medication long-term. Can be delivered via telehealth.',
      'SLEEP RESTRICTION: calculate sleep efficiency (time asleep / time in bed × 100%). If <85% → restrict time in bed to actual sleep time (minimum 5.5 hours). Increase by 15 min/week when efficiency >90%.',
      'PHARMACOTHERAPY (if CBT-I insufficient): Step 1 → melatonin (0.5-3mg), ramelteon (8mg), or trazodone (25-100mg). Step 2 → suvorexant (Belsomra 10-20mg) or lemborexant (Dayvigo 5-10mg). Step 3 → gabapentin (100-300mg) for comorbid pain/anxiety.',
      'AVOID: benzodiazepines for chronic insomnia (tolerance, dependence, falls in elderly). Z-drugs (zolpidem) only short-term (<2 weeks) if at all.',
      'SLEEP APNEA PATHWAY: STOP-BANG ≥3 → order home sleep test (HST) → if AHI ≥5 → CPAP referral to sleep medicine. Moderate/severe (AHI ≥15) → CPAP is first-line.',
      'CIRCADIAN RHYTHM: delayed sleep phase → morning bright light therapy (10,000 lux × 30 min) + evening melatonin (0.5mg, 5 hours before desired bedtime). Advanced sleep phase → evening light + morning melatonin.',
    ],
    launchChecklist: [
      'Clinical protocols: CBT-I manual/structured program (free resources: VA CBT-I coach app)',
      'Sleep diary templates: 2-week paper or digital (CBT-I Coach app, Sleepwatch)',
      'Screening tools: ISI, STOP-BANG, Epworth Sleepiness Scale, PSQI — add to intake forms',
      'Referral relationships: sleep medicine specialist for sleep studies and complex cases',
      'Home sleep test vendor: establish account for HST ordering (e.g., Nox, WatchPAT)',
      'Patient education: sleep hygiene handout, CBT-I overview, medication risks',
      'Marketing: position as "Insomnia Specialist" — unique niche among NPs',
    ],
  },
  addiction: {
    businessCase: [
      'Group therapy is the multiplier: 90853 billed per patient, 8-10 patients/group × $40/patient = $320-$400/hour. Run 2 groups/week = $2,560-$3,200/month from groups alone.',
      'Individual visits: 50 addiction patients × monthly $150 avg = $7,500/month baseline. Dual-diagnosis complexity justifies 99215 ($180-$250).',
      'UDS at every visit: 50 patients × monthly × $20 avg = $1,000/month add-on revenue.',
      'IOP (Intensive Outpatient) programs: H0015 × 3 hours/day × 3 days/week × 6-10 patients = significant revenue if you build structured programming.',
      'Payer incentive: commercial payers and Medicaid are actively expanding SUD networks. Many offer enhanced rates for SUD providers.',
      'Low competition: most NPs do NOT treat addiction despite scope allowing it. Supply-demand imbalance is massive.',
    ],
    codingGuide: [
      'ICD-10 specificity matters: F10.20 (alcohol dependence) not F10.9. F14.20 (cocaine dependence) not F14.9. F12.20 (cannabis dependence). Use .21 suffix for "in remission".',
      'Dual-diagnosis: code BOTH the SUD and the psych disorder (e.g., F10.20 + F33.1). List the primary focus of the visit first.',
      'SBIRT (99408/99409): billable once per episode. Some payers allow annually. Check payer policy.',
      'H-codes (H0001, H0005, H0015): primarily Medicaid. Not all commercial payers recognize H-codes — use E/M + 90853 instead.',
      'Group therapy (90853): 45-60 min group, 6-12 patients. Bill per patient. Document each patient\'s participation individually.',
      'UDS frequency: most payers cover monthly. More frequent requires medical necessity documentation (e.g., early recovery, suspected relapse).',
      'Prior auth: rarely needed for SUD E/M visits. May be needed for IOP (H0015) or residential referrals.',
      'Modifier HF (substance abuse program) or modifier SA: some state Medicaid programs require these for SUD claims.',
    ],
    clinicalProtocol: [
      'SCREENING: AUDIT (alcohol), DAST-10 (drugs), NIDA Quick Screen, TAPS Tool (Tobacco, Alcohol, Prescription, Substances). Validate with DSM-5 criteria.',
      'SEVERITY ASSESSMENT: DSM-5 SUD severity — Mild (2-3 criteria), Moderate (4-5), Severe (6+). Severity determines level of care (ASAM criteria).',
      'ASAM LEVEL OF CARE: 0.5 (early intervention) → 1 (outpatient) → 2.1 (IOP) → 2.5 (partial hospitalization) → 3 (residential) → 4 (inpatient). Most telehealth = Level 1-2.1.',
      'ALCOHOL: naltrexone 50mg daily OR acamprosate 666mg TID for abstinence maintenance. Disulfiram 250mg daily for highly motivated patients with accountability partner.',
      'STIMULANTS (cocaine/methamphetamine): no FDA-approved meds. Off-label: bupropion 300mg, mirtazapine 30mg, topiramate 200mg, N-acetylcysteine 1200mg BID.',
      'CANNABIS: no FDA-approved meds. Off-label: gabapentin 300mg TID, N-acetylcysteine 1200mg BID. Focus on CBT, motivational enhancement, contingency management.',
      'BENZODIAZEPINE TAPERING: convert to long-acting equivalent (diazepam). Reduce 10-25% every 1-2 weeks. Adjuncts: gabapentin, hydroxyzine, propranolol for anxiety. Seizure risk if tapered too fast.',
      'RELAPSE PREVENTION: identify triggers (HALT: Hungry, Angry, Lonely, Tired), develop coping strategies, community support (AA/NA/SMART Recovery), ongoing medication management.',
      'MONITORING: UDS pattern analysis — consistency is key. Missing appointments, inconsistent UDS, declining function → intensify treatment, don\'t discharge.',
    ],
    launchChecklist: [
      'ASAM criteria familiarity — take ASAM online course for level-of-care placement',
      'UDS supplies: 12-panel cups with EtG (alcohol metabolite) for point-of-care testing',
      'Group therapy space or telehealth group platform (Zoom with waiting room feature)',
      'Community resource directory: AA/NA meetings, SMART Recovery, sober living, vocational rehab',
      'Crisis protocol: overdose response, withdrawal management, warm handoff to detox/residential',
      'State SUD licensing: some states require separate SUD program licensure for IOP/group',
      'SAMHSA registration for visibility in treatment locator',
      'Medicaid SUD enrollment — enhanced rates in many states',
    ],
  },
  'chronic-care': {
    businessCase: [
      'CCM (99490) is the passive revenue play: 100 Medicare patients × $50/month CCM = $5,000/month with DELEGATABLE work (MA/RN does calls, NP reviews/bills).',
      'RPM (99453-99458): 50 patients × $120/month = $6,000/month. RPM vendor handles devices, data collection. You review and bill.',
      'Combined CCM + RPM per patient: $170/month × 100 patients = $17,000/month RECURRING between-visit revenue.',
      'Visit-based revenue on top: 100 patients × quarterly × $160 avg = $16,000/quarter ($5,333/month). Total: $22,333/month from 100 chronic care patients.',
      'MIPS/quality bonus: chronic care management improves quality scores → higher Medicare reimbursement rates (up to 9% bonus).',
      'Patient retention is exceptional — chronic care patients don\'t leave. Avg 5-10+ year relationship.',
    ],
    codingGuide: [
      'CCM (99490): requires ≥20 min/month of non-face-to-face care coordination. Must have 2+ chronic conditions expected to last 12+ months. Requires documented care plan and patient consent.',
      'Complex CCM (99491): ≥30 min/month of clinical staff time including physician/NP. Higher reimbursement ($83-$105). Use for patients requiring NP-level review (not delegatable).',
      'RPM setup (99453): one-time setup fee for device provisioning and patient education. Bill once per episode.',
      'RPM data (99454): requires ≥16 days of transmitted data per 30-day period. If patient misses days → cannot bill. Track compliance.',
      'RPM management (99457): first 20 min of interactive communication with patient about RPM data. 99458 for each additional 20 min.',
      'Cannot bill CCM + RPM for same time — but CAN bill both codes in same month for different time blocks.',
      'CGM interpretation (95251): bill when reviewing 72+ hours of continuous glucose monitor data. Separate from E/M.',
      'AWV (G0438/G0439) can be combined with chronic care visit using modifier 25. Capture preventive + chronic in one encounter.',
      'Common denial: CCM billed without documented patient consent → get written consent at enrollment. Also denied if care plan not in chart.',
    ],
    clinicalProtocol: [
      'ENROLLMENT: identify patients with 2+ chronic conditions (HTN + DM, HTN + CKD, DM + hyperlipidemia, etc.). Obtain WRITTEN consent for CCM/RPM services and any cost-sharing. Document care plan.',
      'DIABETES ALGORITHM: A1C at baseline → if ≥6.5%: lifestyle + metformin → reassess at 3 months → if A1C still ≥7%: add GLP-1 or SGLT2 → if ≥8%: add insulin. CGM for all insulin patients + poorly controlled on oral meds.',
      'HYPERTENSION ALGORITHM: confirm with 2+ readings (or ABPM/home monitoring). Stage 1 (130-139/80-89): lifestyle × 3-6 months, then ACE/ARB or CCB. Stage 2 (≥140/90): start medication immediately. Target <130/80.',
      'THYROID: TSH screening → if elevated (>4.5): check free T4 + TPO antibodies. Subclinical (TSH 4.5-10, normal fT4): monitor or treat if symptomatic. Overt hypothyroid: levothyroxine, start 25-50mcg, recheck TSH at 6-8 weeks.',
      'HYPERLIPIDEMIA: 10-year ASCVD risk calculator. Risk ≥7.5%: moderate-intensity statin. Risk ≥20%: high-intensity statin (atorvastatin 40-80mg, rosuvastatin 20-40mg). Statin intolerance → try alternate statin, lower dose, or ezetimibe.',
      'RPM WORKFLOW: device ships to patient → patient takes daily readings (BP, glucose, weight) → data auto-transmits → MA reviews alerts → NP reviews weekly → intervene if out-of-range → document 20+ min management time → bill 99457.',
      'CCM WORKFLOW: MA calls patient monthly for check-in (medication adherence, symptoms, social needs) → documents 20+ min → NP reviews and co-signs → bill 99490. Complex patients: NP does the call → bill 99491.',
    ],
    launchChecklist: [
      'CCM/RPM platform: vendor that handles enrollment, time tracking, care plan templates (ChronicCareIQ, TimeDoc, HealthSnap)',
      'RPM device vendor: BP cuffs, glucometers, scales with Bluetooth/cellular (BioTel, Health Recovery Solutions, Tenovi)',
      'Patient consent forms: CCM consent, RPM consent, cost-sharing disclosure (Medicare patients may have 20% copay)',
      'Care plan templates: diagnosis-specific, with goals, medications, self-management instructions',
      'Staff training: MA/RN trained on CCM calls, RPM alert triage, time documentation',
      'EHR integration: CCM/RPM time tracking must integrate with billing workflow',
      'Medicare enrollment: must be enrolled Medicare provider to bill CCM/RPM (PECOS)',
      'Quality metrics: set up A1C, BP, lipid tracking dashboards for MIPS reporting',
    ],
  },
  'mens-health': {
    businessCase: [
      'Cash-pay TRT program: $200-$300/month × 12+ months avg retention = $2,400-$3,600/year/patient. No insurance hassle.',
      'Insurance TRT: 99214 quarterly ($520-$760/year) + labs (insurance covers) + testosterone Rx. Lower margin but higher volume.',
      'ED meds: sildenafil/tadalafil are cheap generics. Cash-pay monthly programs ($50-$100/month) are pure margin. Prescription takes 2 minutes.',
      'Patient LTV: men on TRT are long-term patients (years to decades). LTV $5,000-$15,000+.',
      'Psych cross-sell: 30% of men with depression have low testosterone. Screen psych patients → convert to TRT → treat both conditions.',
      'Market proof: Hims ($1B+ revenue), Roman, Vault Health have proven massive demand. They charge premium prices with generic NP consults. A specialized PMHNP/FNP commands more trust.',
      'Vivitrol injection overlap: if offering AUD treatment, many male patients also need TRT (alcohol suppresses testosterone).',
    ],
    codingGuide: [
      'Primary dx: E29.1 (testicular hypofunction). Confirm with TWO morning total testosterone levels <300 ng/dL (most lab reference ranges).',
      'Symptom-based secondary dx: F32.9 (depression), R53.83 (fatigue), N52.9 (ED), R63.0 (anorexia/weight loss), G47.00 (insomnia)',
      'Lab ordering: total testosterone (AM draw), free testosterone, SHBG, LH, FSH, estradiol, CBC, CMP, lipid panel, PSA. Insurance covers with E29.1 dx.',
      'J1071 (testosterone cypionate, per 1mg): J-code billing for in-office injections. Buy vial ($30-$50), inject, bill $200-$300. High margin.',
      'Self-injection model: prescribe testosterone cypionate + supplies. Patient injects at home weekly. Bill E/M only at follow-ups.',
      'ED medications: no specific procedure code — bill E/M (99213/99214) for the visit, prescribe sildenafil/tadalafil.',
      'Finasteride (hair loss): bill under E/M with dx L64.9 (androgenic alopecia). Prescription takes 1 minute — easy add-on revenue.',
      'Fertility concern: if patient wants TRT but also fertility → prescribe clomiphene (off-label) or hCG instead. Document rationale.',
    ],
    clinicalProtocol: [
      'SCREENING: symptom questionnaire (ADAM score or qADAM) + TWO early morning total testosterone levels (before 10 AM). Confirm <300 ng/dL on both.',
      'WORKUP: total T, free T, SHBG, LH, FSH (distinguish primary vs secondary hypogonadism), estradiol, prolactin (if T very low), CBC, CMP, lipid panel, PSA, DRE (>40 years).',
      'TRT INITIATION: testosterone cypionate 100-200mg IM every 1-2 weeks OR topical gel 1% (50-100mg daily) OR patch. Cypionate IM is cheapest and most effective.',
      'MONITORING SCHEDULE: labs at 6 weeks (testosterone trough, CBC), 3 months (full panel), then every 6-12 months. PSA annually over age 40.',
      'HEMATOCRIT MANAGEMENT: if >54% → reduce dose, increase injection frequency (smaller more frequent doses), or therapeutic phlebotomy. Risk: polycythemia → stroke/DVT.',
      'ESTRADIOL MANAGEMENT: if estradiol >50 pg/mL + gynecomastia/water retention → anastrozole 0.25-0.5mg twice weekly. Do NOT use aromatase inhibitors prophylactically.',
      'ED ALGORITHM: PDE5 inhibitors first-line (sildenafil 50-100mg PRN or tadalafil 5mg daily). If PDE5i fails → check testosterone → optimize T → consider PT-141 (bremelanotide) or alprostadil.',
      'FERTILITY PROTOCOL: TRT suppresses spermatogenesis. If fertility desired: clomiphene 25-50mg daily (off-label) or hCG 1000-1500 IU 3x/week. NEVER start TRT without fertility discussion.',
      'CONTRAINDICATIONS: prostate cancer (active), breast cancer, hematocrit >54%, untreated sleep apnea (relative), desire for fertility (relative).',
    ],
    launchChecklist: [
      'DEA registration: testosterone cypionate is Schedule III — requires DEA',
      'Lab ordering: morning testosterone panel standing orders at Quest/LabCorp',
      'Injection supplies: testosterone cypionate vials, syringes, alcohol swabs (for in-office or teach self-injection)',
      'Cash-pay pricing: establish monthly program pricing, payment processing',
      'Patient consent: TRT informed consent including fertility impact, polycythemia risk, PSA monitoring',
      'Marketing: "Men\'s Health Clinic" landing page, male-focused social media (Instagram, Reddit, forums)',
      'Referral network: urologist for complex cases (infertility, prostate concerns), endocrinologist backup',
    ],
  },
  'urgent-care': {
    businessCase: [
      'Volume play: 20-30 patients/day × $90 avg (99213) = $1,800-$2,700/day. 5 days/week = $9,000-$13,500/week.',
      'Visit efficiency: avg 10-15 min/patient for straightforward cases. 4-6 patients/hour is sustainable.',
      'After-hours premium: charge 1.5-2x for evenings/weekends. $75 flat-rate after-hours visit × 10/night = $750 extra.',
      'Funnel to ongoing services: 15-20% of urgent care patients convert to ongoing care (psych, chronic care, weight management). CAC = $0.',
      'Employer contracts: pitch direct access for employee urgent care. $3-$5 PEPM × 500 employees = $1,500-$2,500/month guaranteed.',
      'Low overhead: no equipment beyond video platform. No labs at point-of-care. Prescribe and refer as needed.',
    ],
    codingGuide: [
      'Most visits are 99213 (established) or 99212 (straightforward). New patient codes if first encounter with your practice.',
      'UTI in women: can diagnose and treat empirically via telehealth (nitrofurantoin, trimethoprim-sulfamethoxazole). Dx N39.0.',
      'URI/sinusitis: symptomatic treatment. If >10 days or worsening → amoxicillin. Dx J06.9 (URI), J01.90 (sinusitis).',
      'Strep pharyngitis: cannot do rapid strep via telehealth. Prescribe empirically if Centor score ≥3, or order lab confirmation.',
      'Rashes: photo-based assessment. Document photo review in note. Dx L30.9 (dermatitis), B35.x (fungal), L70.0 (acne).',
      'Telephone E/M (99441-99443): for audio-only encounters. Lower reimbursement but some patients prefer phone.',
      'After-hours codes: 99051 (services provided during posted after-hours). Add-on to E/M — check payer acceptance.',
      'Common denial prevention: document symptom onset, duration, severity, and why telehealth evaluation is appropriate. Include negative red-flag review.',
    ],
    clinicalProtocol: [
      'TRIAGE PROTOCOL: define what you DO treat (UTI, URI, sinusitis, allergies, conjunctivitis, rashes, minor injuries, medication refills) vs DO NOT treat (chest pain, SOB, severe abdominal pain, suicidal ideation, high fever in infants).',
      'RED FLAGS requiring ER referral: chest pain, difficulty breathing, signs of stroke, severe allergic reaction, high fever + altered mental status, suspected appendicitis, suicidal/homicidal ideation with plan.',
      'UTI PATHWAY: symptoms (dysuria, frequency, urgency) + no red flags (fever, flank pain, vomiting) → empiric treatment. Complicated (male, pregnant, recurrent, febrile) → order culture, broader antibiotics.',
      'UPPER RESPIRATORY PATHWAY: viral symptoms <10 days → symptomatic treatment only (decongestants, analgesics, rest). >10 days or worsening → consider bacterial sinusitis → amoxicillin or amoxicillin-clavulanate.',
      'ALLERGIC RHINITIS: second-gen antihistamine (cetirizine, loratadine) + intranasal steroid (fluticasone). Add montelukast if persistent. Refer for allergy testing if severe/year-round.',
      'SKIN: photo-based assessment. Bacterial → mupirocin or cephalexin. Fungal → topical antifungal. Eczema → topical steroid. Acne → refer to derm service line. Suspicious lesion → refer to dermatology.',
      'ANTIBIOTIC STEWARDSHIP: document why antibiotics are or are NOT prescribed. Use watchful waiting with safety net (auto-call Rx if worsening). Track antibiotic prescribing rate.',
    ],
    launchChecklist: [
      'Scope definition: clear list of conditions treated and not treated via telehealth',
      'On-demand scheduling: same-day/next-day availability. Consider Calendly or built-in scheduling.',
      'After-hours protocol: define hours of availability, on-call workflow',
      'Prescription workflow: e-prescribe to patient\'s preferred pharmacy. Common Rx templates for speed.',
      'Photo submission: secure upload for skin/throat/eye photos. HIPAA-compliant.',
      'Follow-up protocol: auto-check at 48-72 hours for antibiotic patients',
      'Referral list: ER, specialist referrals for each common escalation',
      'Marketing: "See a provider today" — emphasize speed, convenience, no ER wait',
    ],
  },
  preventive: {
    businessCase: [
      'Medicare AWV: $175-$210/visit × high volume. Zero copay for patients → easy conversion. Only ~50% of eligible Medicare patients receive AWV → massive opportunity.',
      'AWV + chronic care upsell: every AWV is a chance to identify undiagnosed conditions (DM, HTN, depression) and enroll in CCM/RPM.',
      'Smoking cessation: ACA mandates $0 copay for cessation counseling. 14% of adults smoke → large addressable population. Combine with pharma (varenicline, NRT).',
      'Travel medicine: $150-$250 per consult (cash-pay). Prescriptions for antimalarials, altitude meds, travelers\' diarrhea prophylaxis. Quick visits.',
      'Executive health panels: $500-$1,500 for comprehensive labs + consult. Cash-pay, premium positioning. Target employers and high-income individuals.',
      'Corporate wellness contracts: pitch preventive health to employers as cost-reduction strategy. $50-$100 PEPM.',
    ],
    codingGuide: [
      'AWV (G0438/G0439): NOT a physical exam — it is a health risk assessment, personalized prevention plan, cognitive screening, and advance directive discussion. Document all required elements.',
      'AWV + problem visit: bill G0438/G0439 + 99213/99214 with modifier 25 if separate medical issue addressed same day. This is common and appropriate.',
      'Preventive visits (99381-99397) for commercial insurance: age-banded. Include comprehensive ROS, age-appropriate screenings, counseling.',
      'Smoking cessation (99406/99407): bill per session. 8 sessions/year covered by most plans at $0 copay. Document counseling time.',
      'Preventive counseling (99401-99404): time-based, separate from E/M. Use for diet, exercise, stress management, risk reduction.',
      'MNT codes (97802-97804): billable for nutritional counseling in preventive context when qualifying diagnosis present.',
      'Travel medicine: no specific billing code — use 99213/99214 with Z23 (encounter for immunization) or Z71.84 (encounter for health counseling related to travel).',
      'Lab codes for executive panels: 80053 (CMP), 80061 (lipid panel), 85025 (CBC), 84443 (TSH), 83036 (A1C), 25-OH vitamin D. Cash-pay labs: bundle pricing.',
    ],
    clinicalProtocol: [
      'MEDICARE AWV ELEMENTS: health risk assessment (questionnaire), review of medical/family history, depression screening (PHQ-2/9), cognitive assessment (Mini-Cog), functional assessment, fall risk screening, advance directive discussion, personalized prevention plan (PPPS), written screening schedule.',
      'AGE-APPROPRIATE SCREENINGS: follow USPSTF A/B recommendations. 45+ → colorectal screening, 50+ → lung cancer (if smoking hx), 40+ → mammogram referral, all adults → BP, depression, HIV, hepatitis C (once).',
      'SMOKING CESSATION ALGORITHM: assess readiness (5 A\'s: Ask, Advise, Assess, Assist, Arrange). Ready → pharmacotherapy (varenicline first-line, NRT, bupropion) + counseling. Not ready → motivational interviewing, revisit next visit.',
      'TRAVEL MEDICINE: assess destination, duration, activities, medical history. Prescribe: antimalarials (atovaquone-proguanil, doxycycline, mefloquine), ciprofloxacin (travelers\' diarrhea PRN), altitude (acetazolamide 125mg BID, start 1 day before). Refer for vaccines (Yellow Fever requires certified center).',
      'EXECUTIVE HEALTH PANEL: comprehensive history + advanced labs (CMP, CBC, lipids, A1C, TSH, vitamin D, B12, hs-CRP, homocysteine, ApoB, Lp(a), insulin, hormone panel) + ASCVD risk calculation + personalized report.',
    ],
    launchChecklist: [
      'Medicare enrollment (PECOS) for AWV billing',
      'AWV workflow: health risk assessment questionnaire, Mini-Cog printout, PPPS template',
      'Screening tool library: PHQ-2/9, AUDIT-C, fall risk, ASCVD calculator',
      'Travel medicine reference: CDC Yellow Book (free online), Travax subscription',
      'Executive health lab panel: pre-negotiated pricing with Quest/LabCorp for comprehensive panels',
      'Patient education handouts: screening schedules by age, immunization schedules',
      'Corporate wellness pitch deck: ROI data, service descriptions, PEPM pricing',
    ],
  },
  dermatology: {
    businessCase: [
      'Async (store-and-forward) model: review photo + prescribe in 3-5 min = $90-$130 per encounter. 8-12/hour async = $720-$1,560/hour potential.',
      'Live video: standard 99213/99214 coding. 4 patients/hour × $130 avg = $520/hour. Still efficient.',
      'Prescription-heavy: most derm visits result in a prescription. Visit → Rx → follow-up in 6-8 weeks → repeat. Built-in return visits.',
      'Cosmetic upsells (cash-pay): retinoid programs ($50-$100/month), chemical peel consults, hyperpigmentation treatment plans.',
      'Psych med side effects: lamotrigine rash monitoring, lithium acne, antipsychotic skin effects → built-in referral from psych panel.',
      'Access gap: 35+ day avg wait for dermatologist. Patients are desperate for faster access. Telehealth fills this immediately.',
    ],
    codingGuide: [
      'Standard E/M codes: 99213 (straightforward rash), 99214 (multiple conditions or complex), 99205 (new comprehensive skin eval).',
      'Store-and-forward: G2010 ($12-$18) — low reimbursement but VERY fast. Good for simple refills, stable acne, follow-ups.',
      'Photo documentation: always store clinical photos in chart. Use standardized format: well-lit, close-up, with ruler for scale.',
      'Common dx codes: L70.0 (acne), L20.9 (atopic dermatitis), L40.0 (psoriasis vulgaris), L71.9 (rosacea), B35.x (dermatophytosis/fungal), D22.x (melanocytic nevi).',
      'Modifier 25: if performing lesion evaluation + prescribing for a separate condition in same visit.',
      'Refer for procedures: biopsies (11102-11107), cryotherapy (17000-17004), excisions — these require in-person. Build referral relationship.',
      'Cosmetic: cash-pay only. Do NOT bill insurance for purely cosmetic concerns. Document clearly when medical vs cosmetic.',
    ],
    clinicalProtocol: [
      'ACNE ALGORITHM: mild (comedonal) → topical retinoid + benzoyl peroxide. Moderate (inflammatory) → add topical antibiotic (clindamycin) or oral doxycycline 100mg. Severe/nodular → refer for isotretinoin (specialist required in most states). Hormonal acne (women) → spironolactone 50-100mg.',
      'ECZEMA/ATOPIC DERMATITIS: mild → emollients + low-potency topical steroid (hydrocortisone 2.5%). Moderate → mid-potency steroid (triamcinolone 0.1%) + calcineurin inhibitor (tacrolimus) for face/folds. Severe → refer for dupilumab (Dupixent) or systemic therapy.',
      'PSORIASIS: mild (<3% BSA) → topical steroid + vitamin D analog (calcipotriene). Moderate (3-10% BSA) → combination topicals + phototherapy referral. Severe (>10% BSA) → refer for biologics (adalimumab, secukinumab, etc.).',
      'FUNGAL: tinea corporis/pedis/cruris → topical antifungal (ketoconazole, clotrimazole) × 2-4 weeks. Tinea capitis or onychomycosis → oral terbinafine (requires LFT monitoring). Tinea versicolor → selenium sulfide or ketoconazole shampoo.',
      'SUSPICIOUS LESION TRIAGE: apply ABCDE criteria (Asymmetry, Border, Color, Diameter >6mm, Evolving). Any positive → urgent dermatology referral for biopsy. NEVER manage suspected melanoma via telehealth.',
      'ROSACEA: topical metronidazole or azelaic acid for papulopustular. Brimonidine or oxymetazoline for erythema/flushing. Oral doxycycline 40mg (anti-inflammatory dose) for moderate. Triggers: alcohol, sun, heat, spicy food.',
    ],
    launchChecklist: [
      'Photo submission platform: secure, HIPAA-compliant image upload integrated with EHR',
      'Dermatology formulary: top 20 prescriptions for acne, eczema, psoriasis, fungal, rosacea',
      'ABCDE reference card and dermoscopy basics (even for telehealth triage)',
      'Referral network: board-certified dermatologist for biopsies, complex cases, biologics',
      'Patient education: skin care routines, sun protection, medication application guides',
      'CE/training: AAD online derm courses for FNP confidence in skin conditions',
    ],
  },
  'pain-mgmt': {
    businessCase: [
      'Chronic pain = chronic revenue: patients require ongoing management for years. Monthly/bimonthly visits × $150-$250 = $1,800-$3,000/year per patient.',
      'CGRP inhibitors for migraine: Aimovig/Ajovy/Emgality are buy-and-bill or specialty pharmacy. Massive patient demand — 39M Americans have migraines.',
      'Non-opioid positioning: you are the SOLUTION to the opioid crisis. Payers and referral sources actively seek non-opioid pain providers.',
      'Psych overlap: 50-80% comorbidity between chronic pain and depression. Duloxetine treats BOTH — bill for pain management AND psych simultaneously.',
      'Trigger point injections (if trained): 20553 ($90-$130) per session × biweekly/monthly = significant procedural revenue.',
      'Group pain management: CBT for chronic pain in group format (90853). 8 patients × $40/session = $320/session.',
    ],
    codingGuide: [
      'Primary dx: G89.29 (chronic pain), G89.4 (chronic pain syndrome), M79.3 (panniculitis), M54.5 (low back pain), G43.909 (migraine). Use specific codes over unspecified.',
      'Dual-coding: pain + depression = higher complexity. G89.29 + F33.1 justifies 99215. Document both conditions addressed.',
      'Migraine-specific codes: G43.001-G43.919 — specify with/without aura, with/without status migrainosus, intractable vs not. Specificity matters for PA.',
      'CGRP inhibitor J-codes: J3590 (unclassified biologic — use for buy-and-bill). Check payer for specific J-codes (J3032 for erenumab, etc.).',
      'Pain screening: 96127 billed for PEG (Pain, Enjoyment, General Activity) scale or NRS (Numeric Rating Scale). Bill per administration.',
      'Trigger point injection: 20552 (1-2 muscles) or 20553 (3+ muscles). Bill injection + E/M with modifier 25. Document needle placement sites.',
      'Non-opioid documentation: always document why non-opioid approach is being used. Include "alternatives considered" in every note to demonstrate thoughtful prescribing.',
      'PA for CGRP: document failure of 2+ acute treatments AND 2+ preventive treatments (topiramate, propranolol, amitriptyline). This is the standard step-therapy requirement.',
    ],
    clinicalProtocol: [
      'INTAKE: comprehensive pain assessment — location, quality, duration, radiation, severity (NRS 0-10), aggravating/alleviating factors, functional impact (PEG scale), prior treatments tried, psychosocial factors.',
      'CHRONIC PAIN ALGORITHM: Step 1 → lifestyle (exercise, sleep, stress management) + acetaminophen/NSAIDs. Step 2 → gabapentin/pregabalin (neuropathic) or duloxetine (widespread/fibromyalgia). Step 3 → muscle relaxant (cyclobenzaprine, tizanidine) or topical (lidocaine patches, diclofenac gel). Step 4 → referral for interventional procedures (nerve blocks, epidural, spinal cord stimulator).',
      'MIGRAINE ALGORITHM: Acute → OTC analgesic → triptan (sumatriptan 50-100mg) → gepant (ubrogepant, rimegepant) → consider ER referral for status migrainosus. Preventive (≥4 headache days/month) → propranolol/topiramate/amitriptyline → CGRP mAb (Aimovig 70-140mg monthly) → Botox referral (31+ units, specific protocol).',
      'FIBROMYALGIA: diagnosis by widespread pain index + symptom severity scale. First-line: duloxetine 60mg or pregabalin 150-450mg. Add: exercise program, CBT, sleep optimization. Avoid opioids — they worsen fibromyalgia long-term.',
      'NEUROPATHIC PAIN: gabapentin 300-3600mg/day (titrate slowly) OR pregabalin 150-600mg/day. Second-line: duloxetine 60-120mg, amitriptyline 25-75mg (watch for anticholinergic effects in elderly). Topical lidocaine for localized neuropathy.',
      'FUNCTIONAL OUTCOME TRACKING: PEG scale at every visit. Document pain intensity, interference with enjoyment, interference with general activity. This justifies ongoing treatment to payers.',
      'OPIOID AVOIDANCE: document non-opioid treatment plan. If patient requests opioids, discuss risks, alternatives tried, and refer to pain management specialist if non-opioid approaches exhausted.',
    ],
    launchChecklist: [
      'Clinical pain scales: PEG, NRS, PHQ-9 (comorbid depression), GAD-7 (comorbid anxiety) in intake',
      'Trigger point injection training: hands-on workshop or proctored sessions if adding procedural',
      'CGRP buy-and-bill setup: specialty pharmacy relationship, drug purchasing, cold storage for injectables',
      'Prior auth templates: CGRP PA with step-therapy documentation, migraine diary template',
      'Referral network: interventional pain, physical therapy, acupuncture, CBT-pain therapists',
      'Patient education: pain neuroscience education handouts, exercise guidance, medication guides',
      'Marketing: "Non-Opioid Pain Specialist" — position against the opioid crisis. Referrals from PCPs.',
    ],
  },
  'wellness-coaching': {
    businessCase: [
      'Membership model: 50 members × $149/month = $7,450/month RECURRING. 100 members = $14,900/month. No insurance, no claims, no denials.',
      'Group programs: 12-week cohort × 15 participants × $497 = $7,455 per cohort. Run 4 cohorts/year = $29,820. Mostly group sessions — time efficient.',
      'Digital products: online course ($97-$297) × 100+ sales = $9,700-$29,700. Build once, sell forever. Passive income.',
      'Corporate contracts: 100-employee company at $75 PEPM = $7,500/month ($90,000/year). Land 3-5 corporate clients = transformative revenue.',
      'NP credential premium: health coaches charge $50-$100/session. NP-led coaching commands $150-$250/session. Your clinical credential IS the moat.',
      'Funnel to clinical: 20-30% of coaching clients will need prescriptions, labs, or clinical intervention → convert to your medical practice (insured revenue).',
    ],
    codingGuide: [
      'Primary model is cash-pay — NO insurance billing required for coaching services.',
      'Hybrid option: coaching membership + periodic clinical visits billed to insurance (99213/99214 for lab review, medication management).',
      'Preventive counseling codes (99401-99404) can be billed to insurance for the clinical component of hybrid programs.',
      'Lab orders: bill to insurance under preventive dx codes (Z00.00, Z13.x screening codes). Patient pays $0 copay for ACA-covered preventive labs.',
      'Superbills: provide to members who want to submit to insurance themselves. Include coaching session details, provider NPI, ICD-10 dx codes.',
      'Tax deductions: coaching fees may be tax-deductible for clients under medical expense deduction. Provide appropriate documentation.',
      'Separate entity: consider billing coaching through LLC/DBA separate from clinical practice to maintain clean insurance billing.',
    ],
    clinicalProtocol: [
      'INTAKE ASSESSMENT: comprehensive health questionnaire (medical history, lifestyle, goals, motivations, barriers). Wearable data review (Oura, Whoop, Apple Watch). Optional baseline labs (hormones, metabolic, micronutrients).',
      'COACHING FRAMEWORK (6 pillars): 1) Sleep optimization (7-9 hrs, consistent schedule, HRV tracking), 2) Stress management (HRV biofeedback, breathwork, mindfulness), 3) Nutrition (whole food focus, protein targets, elimination protocols if indicated), 4) Movement (150 min/week moderate, 2x strength training), 5) Cognitive performance (focus, memory, decision fatigue), 6) Hormonal health (cortisol rhythm, thyroid, sex hormones).',
      'SESSION STRUCTURE: 30-min biweekly 1:1 sessions. Week 1-2: assessment + goal setting. Weeks 3-8: implementation + accountability. Weeks 9-12: habit solidification + maintenance plan. Monthly check-ins thereafter.',
      'GROUP COACHING MODEL: weekly 60-min group calls (8-15 participants). Structured curriculum: weekly theme, homework, peer accountability. Use breakout rooms for smaller group work.',
      'SCOPE BOUNDARIES: coaching is NOT therapy. Refer to appropriate clinical service if you identify: clinical depression, anxiety disorder, substance use, eating disorder, suicidal ideation. Document referral.',
      'WEARABLE DATA INTERPRETATION: HRV trends (higher = better recovery), resting HR (lower = better fitness), sleep stages (deep sleep, REM), activity calories, stress scores. Use data to guide coaching recommendations.',
      'OUTCOME METRICS: track biometrics (weight, body composition, BP, resting HR, HRV), labs (if applicable), subjective well-being (WHO-5 questionnaire), energy levels (1-10 self-report), sleep quality (ISI score).',
    ],
    launchChecklist: [
      'Coaching certification: NBHWC (National Board for Health & Wellness Coaching) or ICF recommended',
      'Platform: membership site (Kajabi, Circle, Mighty Networks) or simple Zoom + email',
      'Payment processing: Stripe for recurring subscriptions',
      'Coaching agreement/waiver: distinct from provider-patient relationship. Clarify scope, limitations.',
      'Content library: build initial curriculum, handouts, meal plans, workout templates',
      'Wearable partnerships: recommend specific devices, offer setup guidance',
      'Liability insurance: health coaching liability coverage (separate from malpractice or add rider)',
      'Marketing: personal brand content (Instagram, YouTube, podcast), corporate pitch materials',
    ],
  },
  nutrition: {
    businessCase: [
      'Medicare MNT: 3 hours first year, 2 hours subsequent years per patient. At $30-$42/15-min unit = $360-$504/year per Medicare patient.',
      'Group MNT (97804): 10 patients × $20/patient/session × 12 sessions/year = $2,400/year from one weekly group. Minimal additional time.',
      'Cross-sell with GLP-1: every weight management patient needs nutritional counseling. Bundle nutrition into weight loss program.',
      'Diabetes population: 37.3M Americans + 96M prediabetics. Only 10% of eligible Medicare patients receive MNT. Blue ocean.',
      'Cash-pay wellness nutrition: $100-$150/session for non-qualifying patients. Meal planning, supplement guidance, gut health protocols.',
      'DSME certification: if you get CDCES and create a DSME program, Medicare pays enhanced rates and patients get 10 hours of education covered.',
    ],
    codingGuide: [
      'MNT (97802/97803/97804) requires qualifying diagnosis: diabetes (E11.x), renal disease (N18.x), or post-organ transplant. Other dx may be covered by commercial — check payer.',
      '97802 (initial, individual, per 15 min): bill in 15-min increments. 60-min initial assessment = 4 units. Some payers cap at 1 hour initial.',
      '97803 (subsequent, individual, per 15 min): follow-up visits. Typically 30 min (2 units).',
      '97804 (group, per 30 min): 2+ patients. Bill per patient. Must document each patient individually.',
      'Medicare coverage: first year = 3 hours (initial + 2 hours follow-up). Subsequent years = 2 hours. Referral from physician/NP required.',
      'E/M + MNT same day: can bill BOTH with separate documentation. E/M for medical management, MNT for nutrition counseling.',
      'Non-qualifying dx: bill E/M (99213/99214) with nutritional counseling documented as part of visit. Or cash-pay for pure nutrition consults.',
      'Preventive counseling (99401-99404): alternative code for dietary counseling when MNT dx criteria not met.',
    ],
    clinicalProtocol: [
      'NUTRITIONAL ASSESSMENT: 24-hour dietary recall, food frequency questionnaire, body composition, labs (A1C, lipids, CMP, vitamin D, B12, iron studies, prealbumin if malnutrition concern). Identify deficiencies and excess.',
      'DIABETES MNT PROTOCOL: carb counting education, plate method, glycemic index guidance, protein at every meal (25-30g), fiber goal (25-35g/day). A1C reduction of 1-2% achievable with MNT alone.',
      'GLP-1 NUTRITION SUPPORT: protein priority (≥60-80g/day to preserve lean mass), small frequent meals (GLP-1 slows gastric emptying), hydration (64+ oz/day), multivitamin + B12 + vitamin D, monitor for hair loss (biotin, zinc, iron).',
      'ANTI-INFLAMMATORY PROTOCOL: Mediterranean diet base. Increase: omega-3 fatty acids, colorful vegetables, olive oil, nuts, fermented foods. Decrease: processed foods, added sugars, seed oils, alcohol. Evidence base for depression, pain, autoimmune.',
      'GUT HEALTH / IBS: Low-FODMAP elimination diet × 2-6 weeks → systematic reintroduction (one FODMAP group per week). Probiotics: strain-specific (Lactobacillus, Bifidobacterium). Rule out celiac (tTG-IgA) before starting gluten-free.',
      'WEIGHT MANAGEMENT: caloric assessment (Mifflin-St Jeor equation), 500-750 kcal deficit for 1-1.5 lb/week loss. Protein 1.0-1.2 g/kg for satiety and muscle preservation. Track with Cronometer or MyFitnessPal.',
      'SUPPLEMENT EVIDENCE HIERARCHY: Strong evidence → vitamin D (if <30 ng/mL), B12 (if <400 pg/mL or on metformin), omega-3 (1-2g EPA+DHA for depression/cardiovascular), magnesium (glycinate 200-400mg for sleep/anxiety). Moderate → NAC (1200mg BID for addiction, OCD), zinc (for immune), probiotics (strain-specific). Weak/avoid → most multivitamins, "detox" supplements, mega-dose vitamins.',
    ],
    launchChecklist: [
      'MNT documentation templates: initial assessment, follow-up, group session notes',
      'Dietary assessment tools: 24-hour recall form, food frequency questionnaire, meal planning templates',
      'Lab ordering: nutritional panel standing order (CMP, A1C, lipids, vitamin D, B12, iron studies)',
      'Patient education materials: plate method handout, carb counting guide, Mediterranean diet guide, Low-FODMAP food list',
      'CDCES certification pathway (optional): Certified Diabetes Care and Education Specialist for DSME programs',
      'Supplement formulary: evidence-based recommendations with specific products/brands/doses',
      'Group MNT setup: curriculum for 6-8 week diabetes, weight management, or gut health group programs',
      'Referral: registered dietitian (RD) partnership for complex cases or states where MNT requires RD',
    ],
  },
  'corporate-eap': {
    businessCase: [
      'ONE 500-employee contract at $8 PEPM = $4,000/month ($48,000/year). Land 5 contracts = $240,000/year RECURRING.',
      'Low utilization is your friend: only 5-8% of employees use EAP in a given year. You collect PEPM on 100% but serve ~5-8%.',
      'EAP → clinical conversion: 30-40% of EAP users need ongoing care beyond 3-6 sessions → warm handoff to your psych or primary care services.',
      'Workshop/training revenue: $500-$1,500 per session ON TOP of PEPM contract. Run 1-2/month per client = $6,000-$36,000/year add-on.',
      'Critical incident debriefing: $1,000-$2,500 per event. Unpredictable but high-margin when needed.',
      'Competitive advantage: NP-led EAP can PRESCRIBE — most EAPs are therapy-only. This is a massive differentiator for employers.',
      'Scalability: as you add contracts, hire additional NPs/therapists. PEPM revenue covers contractor costs with margin.',
    ],
    codingGuide: [
      'EAP is NOT billed to insurance — it is a B2B employer contract. No CPT codes needed for core EAP services.',
      'Invoice employer monthly: employee count × PEPM rate. Reconcile headcount quarterly.',
      'If hybrid model (EAP sessions exhaust → insurance-billed ongoing care): clearly document transition from EAP to clinical care.',
      'EAP records are SEPARATE from medical records under 42 CFR Part 2 and state confidentiality laws.',
      'Workshops/trainings: invoice as professional services. Include materials, prep time, delivery time.',
      'Clinical referrals from EAP: new patient codes (99205, 90791) for the clinical practice. Separate encounter, separate record.',
      'Tax treatment: PEPM revenue is business income (1099 if contractor, W-2 if employee of your own entity). Workshops are professional services income.',
    ],
    clinicalProtocol: [
      'EAP INTAKE: brief screening (PHQ-2, GAD-2, AUDIT-C, drug use screening), presenting issue assessment, risk assessment (safety plan if needed), determine number of sessions needed (typically 3-6).',
      'SESSION MODEL: solution-focused brief therapy (SFBT) framework. Session 1: assess + goals. Sessions 2-4: interventions. Session 5-6: review progress + plan. Warm handoff if more sessions needed.',
      'COMMON PRESENTING ISSUES: work stress/burnout (35%), anxiety (20%), depression (15%), relationship problems (10%), grief (8%), substance use (5%), workplace conflict (5%), other (2%).',
      'CRISIS PROTOCOL: suicidal ideation → C-SSRS → safety plan → warm handoff to crisis services if needed. Notify employer only if imminent safety concern (duty to warn). Document everything.',
      'CRITICAL INCIDENT RESPONSE: within 24-72 hours of event. Group debriefing (CISD model or Psychological First Aid). Individual follow-up for most affected employees. 1-3 sessions per affected employee.',
      'MANDATORY REFERRAL: when manager refers employee (performance/conduct). Maintain confidentiality — only report attendance and completion to employer, NEVER content. Document manager\'s concerns separately from clinical assessment.',
      'WARM HANDOFF PROTOCOL: when EAP sessions exhaust → discuss ongoing care options → schedule first clinical appointment → send summary (with consent) to receiving provider → confirm transition.',
      'WELLNESS PROGRAMMING: quarterly topics aligned with employer needs. Q1: stress management/resilience. Q2: work-life balance. Q3: financial wellness. Q4: holiday stress/substance use awareness.',
    ],
    launchChecklist: [
      'Business entity: LLC or S-corp for B2B contracts (separate from clinical practice recommended)',
      'EAP contract template: PEPM pricing, scope of services, confidentiality terms, utilization reporting format',
      'Employer pitch deck: ROI data (3:1 cost savings), service descriptions, provider credentials, case studies',
      'Referral protocol: warm handoff process from EAP to clinical services',
      'Utilization tracking: system for tracking sessions per employee (aggregate reporting only)',
      'CISD/crisis protocol: trained and documented. Consider ICISF (International Critical Incident Stress Foundation) certification.',
      'CEAP certification: Certified Employee Assistance Professional — adds credibility but not required',
      'Marketing: target HR directors, benefits brokers, chambers of commerce, SHRM chapters',
      'Technology: scheduling portal for employees, secure messaging, resource library',
      'Subcontractor network: LCSWs, LPCs for additional EAP session capacity as you scale',
    ],
  },
  'collab-practice': {
    businessCase: [
      'Guaranteed income: monthly retainer ($8,000-$20,000/month) regardless of patient volume. Eliminates revenue uncertainty.',
      'Zero overhead: no rent, no EHR cost, no staff, no billing — the group handles everything. You show up and practice.',
      'Production-based upside: 45-55% of collections. If generating $30,000/month in billings → $13,500-$16,500/month to you.',
      'Multiple contracts: work part-time for 2-3 groups simultaneously. 2 days/week × 3 groups = full-time income with diversification.',
      'FQHC bonus: NHSC loan repayment ($50,000-$75,000 over 2-3 years) + enhanced Medicaid rates + malpractice coverage (FTCA).',
      'Telehealth embedded: serve rural groups from your home. No relocation, no commute. One NP can cover 2-3 remote clinic sites.',
      'Built-in patient volume: no marketing needed. The group has the patients — they need YOU to see them.',
    ],
    codingGuide: [
      'Billing is done BY THE GROUP — you may not bill separately (unless 1099 contractor billing under own NPI, which is rare in this model).',
      'Incident-to billing: in some arrangements, your visits bill under the supervising physician NPI at the physician rate. Higher reimbursement for the group → they can pay you more.',
      'CoCM codes (99492-99494): if embedded as behavioral health in a primary care group, Collaborative Care Model codes generate additional revenue for the group.',
      'Know your value: track your wRVUs (work relative value units). Average NP: 3,500-4,500 wRVUs/year. Top performers: 5,000+. Use this in contract negotiations.',
      'Production reports: request monthly production reports from the group. Verify collections match your expected compensation if on production-based model.',
      'Contract types: W-2 employee (benefits, less tax flexibility) vs 1099 independent contractor (no benefits, major tax advantages — deduct malpractice, CE, licensing, home office).',
      'Non-compete review: have an attorney review. Standard is 1 year, 10-25 mile radius. Negotiate narrower scope. Too broad = limits your future options.',
    ],
    clinicalProtocol: [
      'EMBEDDED PSYCH IN PRIMARY CARE: Collaborative Care Model (CoCM). PCP identifies patient (PHQ-9 ≥10) → warm handoff to embedded PMHNP → brief assessment → medication recommendation back to PCP or direct prescribing → weekly caseload review with psychiatrist consultant.',
      'CASELOAD MANAGEMENT: embedded model typically manages 50-80 patients in active treatment. Track with registry (PHQ-9, GAD-7 scores over time). Systematic follow-up at 2, 4, 8, 12 weeks.',
      'CONSULTATION MODEL: provide psychiatric consultation to PCPs without seeing the patient directly. Review chart, recommend medication changes, document consultation note. Billable under CoCM codes (by the PCP).',
      'FQHC WORKFLOW: follow FQHC-specific documentation requirements (HRSA compliance). Use their EHR templates. Participate in quality reporting (UDS). Higher volume expectations (18-22 patients/day primary care, 12-16 psych).',
      'SCOPE NEGOTIATION: before starting, clarify in writing: what you can prescribe (controlled substances?), what procedures you can perform, supervision requirements, after-hours call expectations.',
      'QUALITY METRICS: track patient outcomes (symptom improvement, response rates, remission rates). Present quarterly to group leadership. Your data justifies contract renewal and rate increases.',
    ],
    launchChecklist: [
      'CV and credentials packet: license, DEA, NPI, board certification, malpractice, references',
      'Contract attorney: review all contracts before signing. Focus on: compensation, non-compete, termination clause, malpractice coverage, schedule flexibility.',
      'Credentialing: the group handles payer credentialing — provide all required documents promptly (CAQH, licenses, etc.)',
      'Malpractice: clarify if group covers you or if you carry your own. If own: occurrence-based preferred over claims-made.',
      'FQHC applications: NHSC loan repayment application, FTCA deeming application (free malpractice)',
      'Contract negotiation: know market rates — MGMA NP compensation data ($115,000-$160,000/year median, higher for psych). Negotiate based on your specialty and production potential.',
      'Professional network: join state NP associations, AANP, specialty societies for contract opportunity listings',
      'Locum tenens agencies: Weatherby, CompHealth, Staff Care — for short-term contract opportunities while building direct relationships',
    ],
  },
  aud: {
    businessCase: [
      'Vivitrol (injectable naltrexone) is the revenue anchor: buy at $1,200-$1,400/injection, bill $1,500-$1,800 = $300-$400 margin PER INJECTION PER MONTH.',
      '50 Vivitrol patients × monthly × $350 margin = $17,500/month from injections alone. Add E/M visits ($150/visit × 50 = $7,500/month). Total: $25,000/month.',
      'Oral naltrexone patients: lower drug revenue but E/M visits ($130-$190/month × ongoing) + UDS ($20/visit) = $1,800-$2,520/year per patient.',
      'Group therapy scale: 90853 × 10 patients × $40/patient × 4 groups/month = $1,600/month. Topics: relapse prevention, coping skills, lifestyle changes.',
      'Privacy-premium market: professionals, executives, healthcare workers who need AUD treatment but want privacy. Cash-pay programs $300-$500/month = no insurance trail.',
      'Treatment gap = zero competition in most markets: 29.5M Americans with AUD, 93% untreated. You are not competing for patients — you are filling a void.',
      'Payer incentive: alcohol-related healthcare costs exceed $249 billion/year in the US. Payers WANT providers who treat AUD because it reduces downstream costs (ER, hospitalizations, liver disease).',
    ],
    codingGuide: [
      'Primary dx: F10.20 (alcohol dependence, uncomplicated) for active AUD. F10.21 (in remission) for maintenance. F10.10 (alcohol abuse) for mild AUD.',
      'Dual-diagnosis coding: F10.20 + F33.1 (major depressive disorder, recurrent, moderate). List the condition primarily addressed first.',
      'Vivitrol billing: J2315 (naltrexone injection per 1mg) × 380mg = 380 units. Add 96372 (injection administration). Must buy drug in advance (buy-and-bill model).',
      'Buy-and-bill workflow: purchase Vivitrol from specialty distributor → store (refrigerated) → administer → bill J2315 + 96372 → collect from payer. Margin: $300-$600/injection after cost.',
      'Oral naltrexone: Rx to pharmacy (no J-code, no buy-and-bill). Revenue comes from E/M visits only.',
      'UDS: 80305 (presumptive) at every visit. Bill with E/M using modifier 25. Confirm payer allows monthly frequency.',
      'PEth (phosphatidylethanol) testing: 80320 — objective alcohol biomarker. Positive for 3-4 weeks after heavy drinking. Superior to self-report. Great for monitoring treatment response.',
      'Hepatic panel (80076): order at baseline, 3 months, 6 months, then annually. Documents liver health improvement (GGT, AST, ALT trending down = treatment working).',
      'SBIRT codes (99408/99409): bill at initial evaluation. One-time per episode per most payers.',
      'Group therapy (90853): document each patient individually in the group. Note attendance, participation, individual treatment plan relevance.',
    ],
    clinicalProtocol: [
      'SCREENING: AUDIT-C (3 questions, takes 30 seconds) at EVERY intake across ALL service lines. Score ≥4 men / ≥3 women = positive screen → full AUDIT (10 questions) → DSM-5 AUD criteria assessment.',
      'SEVERITY STAGING: DSM-5 AUD — Mild (2-3 criteria) → brief intervention + optional medication. Moderate (4-5 criteria) → medication + counseling. Severe (6+ criteria) → medication + intensive treatment + consider higher level of care.',
      'WITHDRAWAL RISK ASSESSMENT: CIWA-Ar score. <10 = mild (outpatient safe). 10-18 = moderate (outpatient with close monitoring). >18 = severe (REFER TO INPATIENT DETOX — do NOT manage severe withdrawal outpatient, seizure/DT risk).',
      'MEDICATION SELECTION ALGORITHM: Goal is ABSTINENCE → naltrexone 50mg daily (first-line) OR acamprosate 666mg TID (if liver disease or opioid use). Goal is REDUCTION → naltrexone 50mg PRN (Sinclair Method: take 1 hour before drinking). Highly motivated with accountability → consider disulfiram 250mg daily. Liver disease (AST/ALT >3x normal) → acamprosate (renally cleared, liver-safe). On opioids or opioid-dependent → acamprosate ONLY (naltrexone is contraindicated).',
      'VIVITROL PROTOCOL: patient must be opioid-free ≥7-14 days (naloxone challenge if uncertain). First injection: 380mg IM gluteal. Schedule monthly. Rotate injection sites. Monitor injection site reactions. If patient misses >6 weeks → may need re-induction with oral naltrexone × 3-7 days first.',
      'LAB MONITORING SCHEDULE: Baseline → CBC, CMP, hepatic panel (AST, ALT, GGT), lipid panel, PEth, thiamine/folate, magnesium, phosphorus. Month 3 → repeat hepatic panel, PEth, CBC. Month 6 → full panel repeat. Annually thereafter.',
      'NUTRITIONAL SUPPORT: thiamine 100mg daily (MANDATORY — prevents Wernicke encephalopathy). Folate 1mg daily. Magnesium if low. B-complex vitamin. Address malnutrition common in heavy drinkers.',
      'THE SINCLAIR METHOD (TSM): naltrexone 50mg taken 1-2 hours BEFORE drinking (not daily). Mechanism: blocks endorphin reward from alcohol → pharmacological extinction of drinking behavior over 3-12 months. 78% success rate in Finnish trials. Patient continues to drink initially but gradually drinks less. Requires compliant patient who takes pill before every drinking session.',
      'RELAPSE MANAGEMENT: relapse is NOT failure — it is expected and manageable. Increase visit frequency → assess triggers → adjust medication → reinforce coping strategies → consider IOP or group therapy. NEVER discharge a patient for relapse.',
      'DUAL-DIAGNOSIS TREATMENT: treat AUD and psychiatric disorder SIMULTANEOUSLY. Depression often improves significantly with alcohol cessation (observe 2-4 weeks sober before starting antidepressant if possible). Anxiety: avoid benzodiazepines — use hydroxyzine, buspirone, gabapentin. PTSD: prazosin for nightmares, EMDR/CPT therapy referral.',
      'PREGNANCY: alcohol is the #1 preventable cause of birth defects. Screen ALL women of reproductive age. If pregnant + AUD → no FDA-approved medications, but naltrexone may be considered if benefits outweigh risks (discuss with OB). Primarily psychosocial intervention.',
    ],
    launchChecklist: [
      'Vivitrol buy-and-bill setup: specialty pharmacy account (McKesson, AmerisourceBergen), refrigerated storage, injection supplies',
      'Naltrexone oral: ensure pharmacy partnerships, prior auth workflow for payers that require it (uncommon but some do)',
      'CIWA-Ar scoring tool: in EHR or as printable form for withdrawal assessment',
      'AUDIT/AUDIT-C: integrate into intake forms for ALL patients across all service lines (universal screening)',
      'Lab standing orders: AUD baseline panel and monitoring panel at Quest/LabCorp',
      'Injection room/space: if in-person, need private space for IM gluteal injection. If telehealth-only, partner with local clinic for injection administration.',
      'PEth testing: establish lab account for PEth orders (not all labs offer — Quest does)',
      'Community resources: AA meeting finder, SMART Recovery, Moderation Management, Al-Anon for families',
      'Consent forms: AUD treatment consent, Vivitrol-specific consent (injection site reactions, hepatotoxicity risk), naltrexone medication guide',
      'Marketing: "Alcohol Treatment Without Judgment" positioning. Emphasize privacy, telehealth, medication-based approach. Target online searches for "stop drinking help" and "alcohol treatment near me".',
      'ASAM membership: $200/year. Adds credibility, access to treatment guidelines, provider directory listing',
    ],
  },
  'facility-mh': {
    businessCase: [
      'PSYCHIATRIC HOSPITAL CONTRACT: monthly retainer $20,000-$35,000 for medical director + clinical coverage. Daily rounding on 15-25 patient census × $100-$200/patient/day. Stable, predictable revenue.',
      'SNF/NURSING FACILITY: round on 20-40 patients per facility day. $150-$300/patient visit. 2 facility days/week = $6,000-$24,000/week. Low competition — most psych NPs don\'t do SNF work. CMS psychotropic review mandates = every SNF in the country needs this service.',
      'PHP PROGRAM: 15 patients × $250-$600/day per diem = $3,750-$9,000/day program revenue. If you BUILD a PHP (rent space, hire staff), profit margins are 30-40%. If you STAFF an existing PHP, contract at $15,000-$25,000/month.',
      'CRISIS STABILIZATION (988-FUNDED): CSUs expanding in every state. Contract at $15,000-$25,000/month. Lower patient volume, higher per-patient revenue. New facilities = new contracts with less competition.',
      'TELEPSYCHIATRY HUB: cover 3-5 rural facilities remotely × $5,000-$10,000/month each = $15,000-$50,000/month from home. Add NP contractors to scale without proportional effort. The ultimate leverage model.',
      'CORRECTIONAL CONTRACTS: $150,000-$250,000/year. Multi-year contracts with built-in escalators. Recession-proof — corrections budgets are non-discretionary. Most providers avoid this work = minimal competition.',
      'CONSULT-LIAISON: 3-8 consults/day × $200-$400/consult = $600-$3,200/day. Hospitals desperately need C-L coverage — only 3% have adequate psych consultation services.',
      'ER PSYCH: $200-$300/hr × 12-hr shift = $2,400-$3,600/shift. Nights/weekends 1.5-2x premium. 10 shifts/month = $24,000-$36,000/month.',
      'LOCUM TENENS BYPASS: agencies charge facilities $200-$350/hr and pay NPs $100-$175/hr. Contract directly to capture the 40-50% markup. Start with agencies for placement, then convert to direct contracts.',
      'RTC MEDICAL DIRECTOR: $12,000-$20,000/month for 2-3 days/week. Lower intensity than inpatient. Many RTCs cluster geographically — cover 2-3 in one area.',
      'GROUP HOME OVERSIGHT: $500-$1,000/month per facility for monthly medication reviews + PRN consultation. 10 group homes = $5,000-$10,000/month with minimal time investment.',
    ],
    codingGuide: [
      'PSYCHIATRIC HOSPITAL / INPATIENT: initial (99221-99223) on admission day, subsequent (99231-99233) daily, discharge (99238/99239) on discharge day. Document medical necessity for continued stay EVERY day.',
      'ER: 90791/90792 (psych eval) OR 99281-99285 (ER E/M) — choose whichever reimburses higher. SI crisis = 99284-99285. Modifier 57 if E/M leads to admission decision.',
      'CSU / OBSERVATION: observation codes (99218-99220) for admission, 99217 for discharge. Some states have specific crisis H-codes — check Medicaid fee schedule.',
      'PHP: H0035 (per diem, $250-$600/day) is most common. Some payers use S9480. Must meet 6+ hours/day, 5 days/week. Add 90837 for individual therapy and 90853 for group — bill per patient.',
      'IOP: H0015 (per hour, $60-$120) or S9480 (per diem). Must meet 3+ hours/day, 3+ days/week. Evening IOP uses same codes — no evening modifier needed.',
      'RTC / RESIDENTIAL: bill outpatient E/M codes (99213-99215) for NP visits. Some Medicaid programs have residential per-diem codes (H2036, H0019). Room & board is NOT billable to insurance.',
      'SNF / NURSING FACILITY: initial (99304-99306), subsequent (99307-99310). Bill per patient per visit. Annual comprehensive assessment (99318) billable once/year. OBRA-mandated psychotropic reviews are separately billable.',
      'ASSISTED LIVING / GROUP HOME: bill standard outpatient E/M (99213-99214) with place of service 13 (assisted living) or 14 (group home). Some Medicaid programs allow behavioral health consultation codes.',
      'DETOX: H0010 (sub-acute residential detox, per diem), H0012 (per hour), H0014 (ambulatory detox). Add E/M codes for daily medical management. CIWA/COWS scoring is part of E/M — not separately billable.',
      'CONSULT-LIAISON: initial inpatient consultation (99252-99255), then subsequent hospital care (99231-99233) for follow-up days. Consult codes reimburse 20-30% higher than standard subsequent care. Must be requested by another provider.',
      'CORRECTIONAL: billing depends on contract structure. Fee-for-service uses standard E/M (99213-99215). Many contracts are flat-rate (per-inmate-per-month or annual retainer). Forensic evaluations may be billable separately.',
      'TELEPSYCHIATRY: same codes + modifier 95 (synchronous telehealth). Place of service 02 (telehealth — facility). Facility provides presenting site (nurse, tech). No reimbursement reduction for telehealth in most states.',
      'GROUP THERAPY (ALL SETTINGS): 90853 — bill per patient. Document each patient individually. 6-12 patients per group. Works in PHP, IOP, RTC, inpatient, correctional. Highly scalable.',
    ],
    clinicalProtocol: [
      // ─── Across All Facilities ───
      'RISK ASSESSMENT (ALL SETTINGS): C-SSRS (suicidality) at every encounter. HCR-20 (violence risk) for forensic/correctional. PHQ-9/GAD-7 for symptom tracking. Document risk level and clinical rationale.',
      'AGITATION MANAGEMENT (ALL SETTINGS): Step 1 → verbal de-escalation (calm voice, offer choice, reduce stimulation, 1:1 staffing). Step 2 → PRN oral (olanzapine ODT 5-10mg, or lorazepam 1-2mg, or diphenhydramine 50mg). Step 3 → IM (olanzapine 10mg IM, or "B52": haloperidol 5mg + lorazepam 2mg + diphenhydramine 50mg IM). Step 4 → restraint/seclusion (LAST resort, document alternatives tried, face-to-face within 1 hour, continuous monitoring, time-limited orders).',
      // ─── Psychiatric Hospital / Inpatient ───
      'INPATIENT ADMISSION: psychiatric evaluation → risk assessment → medication reconciliation → treatment plan within 24 hours. Document: why outpatient/PHP/CSU is insufficient. Notify outpatient providers.',
      'INPATIENT ROUNDING: daily assessment of mood, psychosis, SI/HI, sleep, appetite, medication response/side effects, nursing observations, treatment plan progress, discharge readiness. Document continued stay medical necessity at EVERY encounter.',
      'INPATIENT DISCHARGE: safety plan completed, medications stable ≥48 hrs, outpatient follow-up within 7 days (HEDIS FUH-30), meds prescribed/filled, support system confirmed, crisis numbers provided.',
      // ─── Crisis Stabilization ───
      'CSU PROTOCOL: rapid triage → psychiatric assessment → medication stabilization → safety monitoring (q15min checks). Brief interventions: safety planning, coping skills, motivational interviewing. Goal: stabilize and transition to PHP/IOP/outpatient within 23-72 hours.',
      // ─── PHP / IOP ───
      'PHP/IOP LEVEL-OF-CARE CRITERIA: PHP → needs structured programming but not 24-hr monitoring, can maintain safety overnight at home. IOP → moderate severity, functional in community with support, can attend 3+ hrs/day. Use LOCUS (Level of Care Utilization System) or ASAM criteria for placement.',
      'PHP/IOP PROGRAMMING: CBT groups, DBT skills, psychoeducation, medication management, individual therapy, process groups. Track: PHQ-9, GAD-7, functional assessments weekly. Typical PHP stay: 2-4 weeks. IOP: 4-8 weeks.',
      // ─── Residential Treatment ───
      'RTC OVERSIGHT: medication management visits 2-3x/week, treatment team participation, behavioral intervention plan development, family sessions, discharge planning from day 1. Monitor for medication diversion in SUD populations. Coordinate with therapy team on behavioral goals.',
      // ─── SNF / Nursing Facility ───
      'SNF BEHAVIORAL HEALTH: primary presentations — dementia behavioral symptoms (BPSD: agitation, aggression, wandering, psychosis, sundowning), late-life depression, adjustment to placement, delirium workup. Psychotropic review: document medical necessity for EVERY antipsychotic, anxiolytic, hypnotic. Attempt GDR (gradual dose reduction) at least quarterly unless clinically contraindicated. Document WHY if GDR not appropriate.',
      'SNF DEMENTIA PROTOCOL: non-pharmacological interventions FIRST (music, light therapy, redirection, structured activities, pain assessment). If pharmacological needed: risperidone 0.25-1mg (most evidence for BPSD), quetiapine 12.5-100mg (sedation benefit), avoid benzodiazepines (fall risk, paradoxical agitation). Document risk/benefit discussion with family/POA.',
      // ─── Detox / Withdrawal ───
      'ALCOHOL DETOX: CIWA-Ar q4-8hr. Score <10: supportive care. Score 10-18: symptom-triggered benzos (chlordiazepoxide 25-50mg or lorazepam 1-2mg). Score >18: consider ICU level monitoring, IV benzodiazepines, seizure precautions. Thiamine 100mg IV/IM before glucose. Typical detox: 3-5 days.',
      'OPIOID DETOX: COWS q4-8hr. Score ≥8: buprenorphine induction (standard or micro-dosing). Alternative: clonidine 0.1mg q6hr + supportive meds (loperamide, ondansetron, dicyclomine). Typical detox: 5-7 days. Plan for maintenance (buprenorphine, naltrexone) before discharge.',
      // ─── Correctional / Forensic ───
      'CORRECTIONAL PROTOCOL: intake screening within 14 days (suicide risk, psychotropic continuity, withdrawal risk, intellectual disability screen). Ongoing care: medication management clinic, individual crisis intervention, group therapy if available. Discharge planning 30 days before release: medication bridge Rx, community MH referral, Medicaid reinstatement.',
      'FORENSIC EVALUATIONS: competency to stand trial (understand charges, assist attorney, courtroom behavior), criminal responsibility (mental state at time of offense), violence risk assessment (HCR-20), guardianship capacity. Higher-level skill — consider forensic NP training or ABPN forensic certification.',
      // ─── Consult-Liaison ───
      'C-L PSYCHIATRY: most common consults — delirium (rule out medical causes, treat underlying etiology, haloperidol 0.5-1mg for agitation if needed), capacity evaluations (4-element assessment for surgical consent, AMA discharge, treatment refusal), catatonia (lorazepam challenge 1-2mg IV), somatoform/functional symptoms, post-transplant psych clearance.',
      'CAPACITY EVALUATION: four elements — understand (comprehend relevant information), appreciate (apply to own situation), reason (weigh risks/benefits logically), express a choice (communicate consistent decision). Document EACH element. Capacity is decision-specific, not global. High medicolegal risk — document thoroughly.',
      // ─── Telepsychiatry Hub ───
      'TELEPSYCHIATRY HUB MODEL: designate a command center (home office or small office). Equip: dual monitors, HIPAA-compliant video platform, reliable internet + backup (cellular hotspot), professional background. Schedule: cover 3-5 facilities with rotating time blocks. Presenting site provides nurse/tech for hands-on assessment, vitals, specimen collection. Scale by adding NP contractors.',
    ],
    launchChecklist: [
      'Hospital privileges (ER/inpatient): apply through medical staff office (60-120 days). Need: license, DEA, NPI, board cert, malpractice, CME records, peer references.',
      'Non-hospital facility credentialing (SNF, RTC, group home, correctional): apply directly through facility — usually faster (30-60 days), no formal privileges required.',
      'State-specific scope verification: can NPs in your state initiate involuntary holds, write restraint orders, perform capacity evaluations, admit independently? Check NPA and facility bylaws.',
      'Malpractice coverage: occurrence-based, $1M/$3M minimum. Verify coverage includes ALL facility types: ER, inpatient, crisis, SNF, correctional, forensic evals, restraint/seclusion decisions.',
      'DEA registration: may need separate DEA for each facility address where you prescribe controlled substances. Check DEA rules for practice site registration.',
      'Multi-facility EHR access: learn Epic, Cerner, MEDITECH, PointClickCare (SNFs), TIER (correctional). Each facility has different workflows — build template library.',
      'Clinical pocket references: Baker Act/5150 criteria, C-SSRS, CIWA-Ar (alcohol withdrawal), COWS (opioid withdrawal), B52 agitation protocol, capacity evaluation template, LOCUS level-of-care tool.',
      'Contract attorney: review ALL facility contracts. Key terms: compensation, schedule, call/on-call expectations, non-compete, malpractice coverage, tail coverage, termination clause, billing arrangement (own NPI vs incident-to).',
      'Telepsychiatry setup: HIPAA-compliant video platform, dual monitors, reliable internet + cellular backup, professional background, state licenses for each facility location.',
      'Locum tenens agencies: CompHealth, Weatherby, Staff Care, AMN Healthcare, Jackson & Coker — register with multiple to get initial placements, then convert to direct contracts.',
      'Facility pipeline: identify target facilities by type in your area. Start with 1-2 facility types (e.g., SNF + ER), build track record, then expand to PHP/IOP/correctional.',
      'Correctional-specific: background check clearance, security training, PREA (Prison Rape Elimination Act) training, facility-specific orientation. Allow 60-90 days for clearance.',
      'SNF-specific: familiarize with OBRA regulations, F-tag F758 (unnecessary medications), CMS psychotropic reporting requirements, GDR documentation templates.',
      'PHP/IOP program development: if BUILDING a program vs staffing one — need state licensure/certification, physical space, clinical programming curriculum, staffing plan, payer contracts, accreditation (Joint Commission or CARF).',
    ],
  },
  'payer-referral': {
    businessCase: [
      'ZERO PATIENT ACQUISITION COST: payer care navigators find the patient, verify eligibility, schedule the appointment, and send them to you. Your only cost is the time to see the patient. Compare: Psychology Today profile ($30/month, 1-3 patients/month), Google Ads ($50-$150/patient acquired), Zocdoc ($35-$100/booking fee). Payer referral = $0.',
      'COMPOUND GROWTH: each new referral becomes a recurring patient. Month 1: 10 new patients. Month 6: 10 new + 50 follow-ups = 60 visits/month. Month 12: 10 new + 100 follow-ups = 110 visits/month. At $150 avg = $16,500/month from ONE payer.',
      'MULTI-PAYER MULTIPLICATION: replicate across 5-10 payers. 5 payers × 10 referrals/month × $150 = $7,500/month in new patient revenue, compounding monthly.',
      'LUCET PROOF OF CONCEPT: already live with Florida Blue/Lucet. Model works. Now scale to BCBSNM, Optum, VA CCN, Aetna, Anthem, Medicaid MCOs.',
      'NEGOTIATING LEVERAGE: payers NEED you more than you need them. 60% of US counties have zero psychiatrists. Your availability solves their network adequacy compliance problem. Use this to negotiate higher rates.',
      'ENTERPRISE VALUE: a practice with diversified, payer-referred patient flow is worth 3-5x revenue on sale vs a practice dependent on self-pay or single-source marketing. Referral network = recurring, contracted, defensible revenue.',
    ],
    codingGuide: [
      'NO SPECIAL CODING: payer-referred patients are billed exactly like any other patient. Same CPT codes, same modifiers, same POS codes. The referral source does not change billing.',
      'VERIFY INSURANCE ON REFERRAL: care navigator should provide member ID, plan, and eligibility confirmation. Verify in your system before the visit. Payer-referred patients should have zero eligibility surprises.',
      'TELEHEALTH MODIFIERS: same rules apply — modifier 95 (or GT) for video, modifier 93/FQ for audio-only. POS 10 (patient at home) or 02 (patient at facility). Per each payer billing standards.',
      'MODIFIER 25 ON E/M + THERAPY: when billing E/M (99213-99215) with psychotherapy add-on (90833/90836/90838), always append modifier 25 to the E/M code. This is the #1 cause of BH claim denials (as seen in the 12 BCBSNM denials).',
      'TRACK REFERRAL SOURCE: in your EHR/billing notes, document "Referred by [Payer] care navigator" — not required for billing but useful for tracking referral volume and revenue per payer network.',
      'NEW PATIENT VS ESTABLISHED: first visit from a payer referral = new patient codes (99205, 90791). Subsequent visits = established patient codes (99213-99214). Even if the patient was seen by another provider previously.',
    ],
    clinicalProtocol: [
      'REFERRAL INTAKE WORKFLOW: Payer navigator schedules patient → you receive notification (email, portal, or fax) → verify insurance/eligibility → send intake forms to patient → patient completes forms before visit → see patient at scheduled time → complete note → bill payer.',
      'AVAILABILITY MANAGEMENT: dedicate specific time blocks for payer referrals. Example: Mon/Wed 9am-12pm = Lucet/FL Blue referrals. Tue/Thu 1pm-4pm = Optum referrals. Fri = VA CCN referrals. This prevents overbooking and ensures you honor committed availability.',
      'FIRST-VISIT PROTOCOL: comprehensive psychiatric evaluation (90791 or 99205 + 90838). PHQ-9, GAD-7, AUDIT-C screening. Diagnosis, treatment plan, medication if indicated. Schedule follow-up. Document everything — payer-referred patients are more likely to be audited for quality.',
      'QUALITY METRICS THAT MATTER: 1) Appointment availability (keep committed slots open), 2) No-show rate (<10%), 3) Time to first appointment (<7 days from referral), 4) Patient satisfaction (payers survey members), 5) Documentation completeness (payers audit notes), 6) Treatment outcomes (PHQ-9/GAD-7 score improvement).',
      'CARE COORDINATION: payer navigators may request updates on patient progress. Respond promptly. This builds trust and increases referral volume. Some payers have care coordination portals — update status after each visit.',
      'DISCHARGE/TRANSFER: when treatment is complete or patient needs higher level of care, notify the payer navigator. They will reassign the member. Clean transitions = more referrals.',
      'CAPACITY ALERTS: when your panel is full, notify payer navigators immediately so they stop routing patients to you. Overcommitting and then canceling = losing referral status.',
    ],
    launchChecklist: [
      'STEP 1 — INVENTORY: list every payer you are currently credentialed with, by state. These are your eligible referral networks.',
      'STEP 2 — CONTACT PAYER BH NETWORK MANAGERS: for each payer, call provider relations and ask: "I am an in-network BH telehealth provider. How do I submit my availability so your care navigators can schedule members with me?"',
      'STEP 3 — SUBMIT AVAILABILITY: provide your open appointment slots to each payer navigator team. Format varies: some use portal uploads, some accept email/fax, some have API integrations.',
      'STEP 4 — SET UP INTAKE WORKFLOW: ensure you can receive referral notifications (email, portal, fax), verify eligibility quickly, send intake forms electronically, and see new patients within 7 days.',
      'STEP 5 — TRACK REFERRAL VOLUME: log every payer-referred patient — which payer, which navigator, date referred, date seen, CPT billed, amount collected. This data drives your expansion decisions.',
      'STEP 6 — EXPAND: once 2-3 payer networks are flowing, add more. Prioritize payers by: reimbursement rate, referral volume potential, admin burden, and geographic coverage.',
      'KEY CONTACTS TO OBTAIN: Lucet (Florida Blue BH network), Carelon (Anthem/Elevance BH network), Optum BH (UHC BH network), each Medicaid MCO provider relations, VA CCN enrollment (vacaa.med.va.gov/provider), EAP vendor provider panels.',
      'TEMPLATE EMAIL: "I am [Name], [Credential], with [Practice] (NPI: [NPI]). We are an in-network [Payer] behavioral health provider providing [services] via telehealth. We have open availability and would like to be included in your care navigator referral routing for [State] members. How do I submit our provider availability? [Contact info]"',
    ],
  },
};

async function renderServiceLines() {
  const body = document.getElementById('page-body');

  const active = SERVICE_LINES.filter(s => s.status === 'active');
  const planned = SERVICE_LINES.filter(s => s.status === 'planned');

  // Revenue summary
  const totalLines = SERVICE_LINES.length;
  const activeLines = active.length;

  // Compute combined revenue dynamically from all service lines
  let revMin = 0, revMax = 0;
  SERVICE_LINES.forEach(s => {
    const m = (s.annualRevenuePerPatient || '').match(/\$([\d,]+)\s*-\s*\$([\d,]+)/);
    if (m) { revMin += parseInt(m[1].replace(/,/g, '')); revMax += parseInt(m[2].replace(/,/g, '')); }
  });
  const fmtK = (n) => n >= 1000 ? '$' + Math.round(n / 1000) + 'k' : '$' + n;

  body.innerHTML = `
    <style>
      .sl2-stat{position:relative;overflow:hidden;border-radius:16px;padding:20px 24px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:transform 0.2s,box-shadow 0.2s;}
      .sl2-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
      .sl2-stat .sl2-accent{position:absolute;top:0;left:0;right:0;height:3px;}
      .sl2-stat .sl2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:6px;}
      .sl2-stat .sl2-val{font-size:28px;font-weight:800;line-height:1.1;}
      .sl2-stat .sl2-sub{font-size:12px;color:var(--text-muted);margin-top:4px;}
      .sl2-card{border-radius:16px;overflow:hidden;}
    </style>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;">
      <div class="sl2-stat">
        <div class="sl2-accent" style="background:linear-gradient(90deg,var(--brand-500),var(--brand-700));"></div>
        <div class="sl2-label">Total Service Lines</div><div class="sl2-val">${totalLines}</div>
      </div>
      <div class="sl2-stat">
        <div class="sl2-accent" style="background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
        <div class="sl2-label">Active</div><div class="sl2-val" style="color:#16a34a;">${activeLines}</div>
      </div>
      <div class="sl2-stat">
        <div class="sl2-accent" style="background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
        <div class="sl2-label">Planned</div><div class="sl2-val" style="color:#2563eb;">${planned.length}</div>
      </div>
      <div class="sl2-stat">
        <div class="sl2-accent" style="background:linear-gradient(90deg,#a855f7,#c084fc);"></div>
        <div class="sl2-label">Combined Revenue</div><div class="sl2-val" style="font-size:20px;color:var(--brand-600);">${fmtK(revMin)} – ${fmtK(revMax)}/yr</div><div class="sl2-sub">per patient, all lines</div>
      </div>
    </div>

    <!-- Service Line Grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:20px;" id="sl-grid">
      ${SERVICE_LINES.map(s => `
        <div class="sl2-card" onclick="window.app.viewServiceLine('${s.id}')" style="cursor:pointer;border-left:4px solid ${s.color};border-radius:14px;background:white;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:all 0.2s;" onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.1)';" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,0.06)';">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:20px;">${s.icon}</span>
            <span style="font-size:12px;padding:2px 8px;border-radius:4px;background:${s.status === 'active' ? '#dcfce7' : '#f1f5f9'};color:${s.status === 'active' ? '#16a34a' : '#64748b'};font-weight:700;text-transform:uppercase;font-size:10px;">${s.status}</span>
          </div>
          <div style="font-size:14px;font-weight:700;color:var(--gray-800);margin-bottom:4px;">${s.name}</div>
          <div style="font-size:13px;font-weight:700;color:${s.status === 'active' ? '#16a34a' : 'var(--brand-600)'};">${s.annualRevenuePerPatient}</div>
          <div style="font-size:11px;color:var(--gray-500);margin-top:6px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escHtml(s.summary).substring(0, 120)}...</div>
        </div>
      `).join('')}
    </div>

    <!-- Detail Panel (hidden by default) -->
    <div id="sl-detail" style="display:none;"></div>
  `;

  // Register the detail view handler
  window.app.viewServiceLine = function(id) {
    const s = SERVICE_LINES.find(x => x.id === id);
    if (!s) return;
    const intel = SERVICE_LINE_INTEL[s.id];
    const detail = document.getElementById('sl-detail');
    const grid = document.getElementById('sl-grid');

    const _section = (title, icon, color, bgColor, items) => {
      if (!items || !items.length) return '';
      return '<div style="margin-bottom:20px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer;" onclick="const ul=this.nextElementSibling;const arrow=this.querySelector(\'.sl-arrow\');ul.style.display=ul.style.display===\'none\'?\'block\':\'none\';arrow.style.transform=ul.style.display===\'none\'?\'rotate(-90deg)\':\'rotate(0deg)\';">' +
        '<span class="sl-arrow" style="transition:transform 0.2s;font-size:10px;color:' + color + ';">▼</span>' +
        '<span style="font-size:14px;">' + icon + '</span>' +
        '<h4 style="margin:0;font-size:13px;font-weight:700;color:' + color + ';text-transform:uppercase;letter-spacing:0.5px;">' + title + '</h4>' +
      '</div>' +
      '<ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.9;color:var(--text);background:' + bgColor + ';border-radius:10px;padding:14px 14px 14px 32px;border-left:3px solid ' + color + ';">' +
        items.map(i => '<li style="margin-bottom:4px;">' + escHtml(i) + '</li>').join('') +
      '</ul></div>';
    };

    detail.innerHTML = `
    <div class="card sl2-card" style="border-left:4px solid ${s.color};margin-bottom:20px;">
      <div class="card-header" style="display:flex;align-items:center;gap:12px;">
        <button onclick="document.getElementById('sl-detail').style.display='none';document.getElementById('sl-grid').style.display=''" style="background:none;border:1px solid var(--gray-300);border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;color:var(--gray-600);display:flex;align-items:center;gap:4px;">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 12L6 8l4-4"/></svg> All Lines
        </button>
        <span style="font-size:24px;">${s.icon}</span>
        <div style="flex:1;">
          <h3 style="margin:0;">${s.name}</h3>
          <span style="font-size:12px;padding:2px 8px;border-radius:4px;background:${s.status === 'active' ? '#dcfce7' : '#f1f5f9'};color:${s.status === 'active' ? '#16a34a' : '#64748b'};font-weight:600;text-transform:uppercase;">${s.status}</span>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:var(--text-muted);">Est. Revenue/Patient/Year</div>
          <div style="font-size:18px;font-weight:700;color:var(--green);">${s.annualRevenuePerPatient}</div>
        </div>
      </div>
      <div class="card-body">
        <p style="margin-bottom:16px;color:var(--text);line-height:1.6;">${s.summary}</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <div style="background:var(--bg-alt);padding:12px;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Target Patient</div>
            <div style="font-size:13px;line-height:1.5;">${s.targetPatient}</div>
          </div>
          <div style="background:var(--bg-alt);padding:12px;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Revenue Model</div>
            <div style="font-size:13px;line-height:1.5;">${s.revenueModel}</div>
          </div>
          <div style="background:var(--bg-alt);padding:12px;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Visit Frequency</div>
            <div style="font-size:13px;line-height:1.5;">${s.visitFrequency}</div>
          </div>
          <div style="background:var(--bg-alt);padding:12px;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Market Demand</div>
            <div style="font-size:13px;line-height:1.5;">${s.marketDemand}</div>
          </div>
        </div>

        <!-- Billing Codes -->
        <div style="margin-bottom:20px;">
          <h4 style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Billing Codes & Reimbursement</h4>
          <table style="font-size:12px;">
            <thead><tr><th style="width:80px;">Code</th><th>Description</th><th style="width:120px;text-align:right;">Est. Rate</th></tr></thead>
            <tbody>
              ${s.billingCodes.map(b => `
                <tr>
                  <td><code style="background:${s.color}15;color:${s.color};padding:2px 6px;border-radius:3px;font-weight:600;">${b.code}</code></td>
                  <td>${escHtml(b.desc)}</td>
                  <td style="text-align:right;font-weight:600;white-space:nowrap;">${b.rate}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Clinical Considerations -->
        <div style="margin-bottom:20px;">
          <h4 style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Clinical Considerations</h4>
          <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;color:var(--text);">
            ${s.clinicalConsiderations.map(c => `<li>${escHtml(c)}</li>`).join('')}
          </ul>
        </div>

        <!-- Credentialing Notes -->
        <div style="background:var(--success-50);border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:20px;">
          <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;margin-bottom:4px;">Credentialing & Licensing Notes</div>
          <div style="font-size:13px;color:#166534;line-height:1.5;">${escHtml(s.credentialingNotes)}</div>
        </div>

        ${s.outreachContacts ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:15px;font-weight:700;color:var(--gray-800);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;">📡</span> Outreach Contacts & Status
          </div>
          ${(() => {
            const tiers = [...new Set(s.outreachContacts.map(c => c.tier))];
            return tiers.map(tier => {
              const contacts = s.outreachContacts.filter(c => c.tier === tier);
              return `
              <div style="margin-bottom:16px;">
                <div style="font-size:12px;font-weight:700;color:#0891b2;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${escHtml(tier)}</div>
                <div style="background:var(--surface-card,#fff);border:1px solid var(--border-color);border-radius:10px;overflow:hidden;">
                  <table style="width:100%;font-size:13px;margin:0;">
                    <tbody>
                      ${contacts.map(c => {
                        const statusColors = { active: '#16a34a', outreach: '#2563eb', planned: '#9ca3af' };
                        const statusBg = { active: 'rgba(22,163,74,0.1)', outreach: 'rgba(37,99,235,0.1)', planned: 'rgba(156,163,175,0.1)' };
                        const sc = statusColors[c.status] || '#9ca3af';
                        const sb = statusBg[c.status] || 'rgba(156,163,175,0.1)';
                        return `<tr style="border-bottom:1px solid var(--border-color);">
                          <td style="padding:8px 12px;font-weight:600;white-space:nowrap;">${escHtml(c.payer)}</td>
                          <td style="padding:8px 12px;color:var(--gray-500);font-size:12px;">${escHtml(c.contact)}</td>
                          <td style="padding:8px 12px;text-align:right;"><span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${sb};color:${sc};text-transform:uppercase;">${escHtml(c.status)}</span></td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>`;
            }).join('');
          })()}
        </div>
        ` : ''}

        ${intel ? _section('Business Case & ROI', '💰', '#b45309', '#fffbeb', intel.businessCase) +
                  _section('Coding & Billing Guide', '📋', '#1d4ed8', '#eff6ff', intel.codingGuide) +
                  _section('Clinical Protocol & Decision Algorithm', '🧠', '#7c3aed', '#f5f3ff', intel.clinicalProtocol) +
                  _section('Launch Checklist', '🚀', '#0f766e', '#f0fdfa', intel.launchChecklist) : ''}
      </div>
    </div>
    `;

    grid.style.display = 'none';
    detail.style.display = 'block';
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

export { renderServiceLines };
