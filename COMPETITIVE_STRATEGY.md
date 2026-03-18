# Credentik — Comprehensive Competitive Strategy
## Match Them. Then Beat Them.

**Version:** 1.0 | **Date:** March 18, 2026
**Platform:** Credentik v2.2.0 — Multi-tenant Healthcare Credentialing SaaS

---

## Executive Summary

Credentik already has **75+ features** across 43 modules — more breadth than any single competitor. The gap isn't features, it's **automation depth** and **market presence**. This strategy covers exactly how to close every gap with the top 3 competitors (Medallion, Verifiable, Modio Health), then surpass them with capabilities none of them offer.

**The formula:** Match their automation → undercut their pricing → outperform on intelligence.

---

## PART 1: THE COMPETITORS

### Medallion — The Enterprise Giant
- **Funding:** $130M+ | **Pricing:** ~$100-300+/provider/month (custom enterprise)
- **Strengths:** Full automation, managed enrollment, CredAlliance clearinghouse, AI auto-fill
- **Weaknesses:** Expensive, rigid workflows, weak reporting, "black box" process, long onboarding
- **Their pitch:** "We handle everything for you"

### Verifiable — The API Platform
- **Funding:** $27M | **Pricing:** Custom enterprise (API-based)
- **Strengths:** API-first architecture, Salesforce-native, real-time verification, developer tools
- **Weaknesses:** Not a workflow tool, no application tracking, no billing, false alarm rates, requires dev resources
- **Their pitch:** "Embed verification into your existing systems"

### Modio Health — The Practitioner's Choice
- **Funding:** Bootstrapped | **Pricing:** ~$75-125/provider/month
- **Strengths:** Highest rated (4.9/5), intuitive UX, great for small practices, strong provider portal
- **Weaknesses:** Not enterprise-grade, limited multi-tenant, basic analytics, no API platform
- **Their pitch:** "Simple credentialing for practices"

---

## PART 2: MATCH THEM — Close Every Gap

### Gap 1: Automated Primary Source Verification
**Who has it:** Medallion (full), Verifiable (core product), Modio (basic)
**Credentik today:** Manual verification + NPPES NPI lookup + OIG/SAM exclusion screening

#### Implementation Plan

**Phase 1 — Public Source Auto-Verification** (Backend)
```
Priority: HIGH | Effort: 2 weeks | Dependencies: None
```
- Build a `VerificationService` that checks free public databases:
  - **State license boards** — Most states have public lookup pages with structured data
    - Start with top 10 states by provider volume (CA, TX, FL, NY, PA, OH, IL, GA, NC, NJ)
    - Scrape or API where available (some states offer APIs: CA BreEZe, TX TMB)
    - Match on: license number + provider name + license type
    - Return: status (active/inactive/expired), expiration date, disciplinary actions
  - **NPPES/NPI** — Already integrated, enhance to auto-verify
  - **OIG/SAM** — Already integrated, enhance to auto-verify on schedule
  - **DEA** — Add NTIS DEA verification lookup ($0.50/query) or DEA Diversion API
- Add `verification_status`, `verified_at`, `verification_source`, `verification_data` columns to licenses table
- Create a "Verify" button on each license record that triggers verification
- Create a "Verify All" bulk action for batch verification
- Store verification receipts (JSON blob with source, timestamp, raw response) for audit trail
- Display verification badge (green checkmark + source + date) on verified credentials

**Phase 2 — NPDB Integration** (Backend)
```
Priority: HIGH | Effort: 1 week | Dependencies: NPDB enrollment ($$$)
```
- National Practitioner Data Bank — the gold standard for adverse actions
- **Cost:** ~$2-4 per query (one-time or continuous)
- **What it covers:** Malpractice payments, adverse licensure actions, Medicare/Medicaid exclusions, adverse clinical privilege actions
- **Implementation:**
  - Register as a querying entity with NPDB (requires eligible entity status)
  - Build `NpdbService` — submit queries via NPDB's Integrated Querying and Reporting Service (IQRS)
  - Store results linked to provider records
  - Flag any hits for manual review
  - Add NPDB query history to provider profile
- **ROI:** This single feature justifies $50+/provider/month — it's what payers and hospitals require

**Phase 3 — Premium Verification Sources** (Backend)
```
Priority: MEDIUM | Effort: 2-3 weeks | Dependencies: Revenue/contracts
```
- **AMA Physician Masterfile** — Verify medical education, residency, board eligibility
  - Requires AMA data license agreement (~$5K-15K/year depending on volume)
  - API-based lookup by NPI or name+DOB
- **ABMS Board Certification** — Verify board certification status
  - ABMS Certification Verification Service API
  - Real-time status: certified, expired, revoked, not found
- **ECFMG** — For international medical graduates
- **State Board APIs** (where available) — Direct API integrations vs. scraping
- Build a unified `VerificationEngine` that chains sources:
  ```
  License → State Board API/Scrape
  Education → AMA Masterfile
  Board Cert → ABMS API
  Adverse Actions → NPDB
  Exclusions → OIG + SAM (already done)
  DEA → NTIS/DEA API
  NPI → NPPES (already done)
  ```

**Phase 4 — Continuous Monitoring** (Backend + Frontend)
```
Priority: MEDIUM | Effort: 1 week | Dependencies: Phase 1
```
- Scheduled verification runs (configurable: daily/weekly/monthly)
- Laravel scheduler job: `VerifyExpiringCredentials` — auto-reverify anything expiring in 30/60/90 days
- Alert on status changes (license went from active → inactive, new adverse action found)
- Monitoring dashboard showing:
  - Last verification date per provider
  - Verification coverage % (how many credentials are auto-verified vs. manual)
  - Failed verifications requiring manual review
  - Verification history timeline

---

### Gap 2: Payer Enrollment Automation
**Who has it:** Medallion (managed service), Modio (assisted)
**Credentik today:** Application tracking + status workflows + batch generator + follow-up scheduling

#### Implementation Plan

**Phase 1 — CAQH Profile Auto-Population** (Backend + Frontend)
```
Priority: HIGH | Effort: 1 week | Dependencies: Existing CAQH integration
```
- Already have CAQH ProView Manager — extend it:
  - Pull provider data from Credentik → generate CAQH-compatible profile data
  - Auto-fill CAQH attestation fields from provider profile (education, licenses, malpractice, work history)
  - One-click CAQH profile refresh/update
  - Track attestation status and re-attestation deadlines
  - Alert when CAQH profile is out of sync with Credentik data

**Phase 2 — Payer Application Packet Generator** (Backend + Frontend)
```
Priority: HIGH | Effort: 2 weeks | Dependencies: Document management (done)
```
- Build payer-specific enrollment packet templates:
  - Map each major payer's required documents and forms
  - Pre-fill application forms with provider data from Credentik
  - Generate complete enrollment packets (PDF bundle):
    - Cover letter (already have letter generator)
    - CAQH attestation
    - State license copies
    - DEA certificate
    - Malpractice COI
    - Board certification
    - CV/resume
    - W-9
    - All required disclosure forms
  - Track which documents are ready vs. missing per payer
  - One-click "Generate Packet for [Payer]" button on application detail page
- Start with top 20 payers by volume (UHC, Aetna, Cigna, BCBS variants, Humana, etc.)

**Phase 3 — Availity Integration** (Backend)
```
Priority: MEDIUM | Effort: 3 weeks | Dependencies: Availity developer account
```
- Availity covers ~60% of commercial payer enrollment
- **Implementation:**
  - Register as Availity developer partner
  - Build `AvailityService` for:
    - Provider enrollment submission
    - Enrollment status checking
    - Remittance/ERA retrieval
  - Map Credentik application statuses to Availity enrollment statuses
  - Auto-update application status when Availity status changes
  - **Huge differentiator:** "Submit enrollment to 60% of payers with one click"

**Phase 4 — Direct Payer Portal Automation** (Backend)
```
Priority: LOW | Effort: 4+ weeks | Dependencies: Revenue to justify
```
- For payers not on Availity, build direct portal integrations:
  - Medicare PECOS (Provider Enrollment, Chain, and Ownership System)
  - Medicaid state portals (vary by state)
  - Individual payer credentialing portals
- This is what Medallion charges premium for — start with top 5 non-Availity payers
- Use headless browser automation (Playwright/Puppeteer) for portals without APIs

---

### Gap 3: Provider Self-Service Portal
**Who has it:** Medallion (full), Modio (excellent), Verifiable (basic)
**Credentik today:** Provider role with limited dashboard + onboarding tokens

#### Implementation Plan

**Phase 1 — Enhanced Provider Dashboard** (Frontend)
```
Priority: HIGH | Effort: 1 week | Dependencies: None
```
- Already have provider role with basic dashboard — enhance it:
  - **My Credentials** — All licenses, certs, DEA with status badges and expiration countdown
  - **My Documents** — Upload/view documents, see what's missing
  - **My Applications** — View enrollment status across all payers (read-only)
  - **My Tasks** — Action items assigned to the provider
  - **My Profile** — Edit demographics, contact info, education, work history
  - **Expiration Alerts** — Personal notification center for upcoming renewals
- Mobile-first design (providers use phones)
- Simplified nav (no credentialing workflow tools)

**Phase 2 — Provider Portal Subdomain** (Frontend + Backend)
```
Priority: MEDIUM | Effort: 2 weeks | Dependencies: Phase 1
```
- Separate lightweight portal at `portal.credentik.com`
- Provider logs in with email + magic link (no password management)
- Scoped API access — providers can only see/edit their own data
- Document upload triggers automatic task creation for credentialing team
- Profile change requests go through approval workflow
- Branded per agency (logo, colors from agency config)

**Phase 3 — Provider Onboarding Wizard** (Frontend)
```
Priority: MEDIUM | Effort: 1 week | Dependencies: Phase 2
```
- Step-by-step guided onboarding:
  1. Personal information
  2. Education & training
  3. Licenses & certifications
  4. Work history
  5. Malpractice history
  6. Document uploads
  7. Review & submit
- Progress bar showing completion %
- Save & resume later
- Pre-populate from NPI lookup
- Reduces onboarding from hours to minutes

---

### Gap 4: Integration Marketplace
**Who has it:** Verifiable (Salesforce-native), Medallion (EHR/HR integrations)
**Credentik today:** API exists, webhook support, embed widgets — but no pre-built connectors

#### Implementation Plan

**Phase 1 — Public REST API Documentation** (Backend + Docs)
```
Priority: MEDIUM | Effort: 1 week | Dependencies: None
```
- Document all existing API endpoints with OpenAPI/Swagger spec
- Publish at `docs.credentik.com` or `api.credentik.com/docs`
- Include authentication guide, rate limits, pagination, filtering
- Provide code examples in Python, JavaScript, PHP, cURL
- Add API key management (separate from user auth) for machine-to-machine access

**Phase 2 — Webhook System** (Backend)
```
Priority: MEDIUM | Effort: 1 week | Dependencies: Phase 1
```
- Event-driven webhooks for key actions:
  - `provider.created`, `provider.updated`
  - `application.status_changed`
  - `license.expiring`, `license.expired`
  - `document.uploaded`
  - `task.completed`
  - `verification.completed`
- Configurable per agency in settings
- Retry logic with exponential backoff
- Webhook logs for debugging

**Phase 3 — Pre-built Connectors** (Backend)
```
Priority: LOW | Effort: 2 weeks per connector | Dependencies: Phase 1 + 2
```
- Priority connectors (based on market demand):
  1. **Salesforce** — Sync providers, applications, verification results
  2. **Slack** — Notifications for status changes, expirations, task assignments
  3. **Google Workspace** — Calendar sync for deadlines, Gmail for communications
  4. **Zapier/Make** — Opens up 5,000+ app connections without custom dev
  5. **Common EHRs** — Epic (FHIR API), athenahealth, eClinicalWorks
- Start with Zapier — maximum reach, minimum effort

---

## PART 3: BEAT THEM — Build What Nobody Has

These are features that **no competitor offers** — they become Credentik's moat.

---

### Advantage 1: Revenue Intelligence Engine
**Competitors:** Zero revenue/financial tools. They track credentials, not money.

#### What We Build

**Revenue Dashboard** (already started — enhance it)
```
Priority: HIGH | Effort: 2 weeks | Dependencies: Billing module (done)
```

- **Provider Revenue Attribution**
  - Link each credentialed provider to revenue generated
  - Calculate credentialing cost per provider (time spent, fees paid, service costs)
  - Show ROI: revenue generated vs. credentialing investment
  - "Provider X generates $45K/month — credentialing cost was $2,100 — ROI: 21.4x"

- **Payer Profitability Analysis**
  - Revenue per payer per provider
  - Average days to credential per payer
  - Approval rate per payer
  - Reimbursement rates vs. credentialing difficulty score
  - "Aetna takes 90 days but pays 2x more than Cigna — worth the wait"

- **Credentialing Velocity Metrics**
  - Average time from application to credentialed (by payer, state, provider type)
  - Revenue lost during credentialing delays (calculated from fee schedules)
  - Bottleneck identification ("Document gathering takes 40% of total time")
  - "Reducing credentialing time by 14 days = $X in recovered revenue"

- **Pipeline Revenue Forecast**
  - Already have revenue forecast — enhance with:
  - Probability-weighted pipeline (based on historical approval rates)
  - Expected revenue date (based on historical credentialing timelines)
  - Risk-adjusted projections by wave

- **Financial Reports for Leadership**
  - Monthly/quarterly credentialing ROI summary
  - Cost per credential by payer/state
  - Revenue impact of credentialing delays
  - Exportable to PDF/CSV for board presentations

**Why this wins:** CFOs and practice managers make buying decisions. Showing them money — not just compliance — makes Credentik the only platform that speaks their language.

---

### Advantage 2: Compliance Command Center
**Competitors:** Basic expiration alerts. Nothing proactive.

#### What We Build
```
Priority: HIGH | Effort: 3 weeks | Dependencies: Verification (Gap 1)
```

- **Regulatory Calendar**
  - Auto-populated with state-specific renewal deadlines per provider
  - CMS/Medicare enrollment deadlines
  - Accreditation cycles (NCQA, Joint Commission, URAC)
  - State-specific requirements that change (telehealth policies already tracked — extend to all)
  - "March: 4 FL licenses renew, 2 TX DEAs expire, NCQA survey due"

- **Compliance Score**
  - Per-provider compliance percentage
  - Per-facility compliance percentage
  - Per-organization compliance percentage
  - Weighted scoring: critical items (license, DEA) weighted higher than nice-to-haves
  - Trend over time (improving/declining)
  - "Organization A: 94% compliant — 2 items need attention"

- **Risk Matrix**
  - Visual heatmap: providers × credential types
  - Red/yellow/green based on expiration proximity and verification status
  - Drill-down to specific gaps
  - Priority ranking ("Fix these 3 items to go from 87% to 98%")

- **Audit-Ready Export**
  - One-click export for NCQA accreditation surveys
  - Joint Commission readiness reports
  - Payer audit response packets (pre-assembled with all verification evidence)
  - CMS validation/revalidation bundles
  - "Your NCQA surveyor asks for proof? Click once, done."
  - Exportable as PDF with table of contents, cover letter, and evidence pages

- **Incident Management**
  - Track compliance incidents (lapsed license discovered, adverse action found)
  - Root cause documentation
  - Corrective action plans with due dates
  - Resolution tracking and closure
  - Incident history for audit trail

**Why this wins:** Compliance officers are the second buyer persona (after operations). An audit takes weeks to prepare for today. Credentik makes it one click.

---

### Advantage 3: Smart Automation Engine
**Competitors:** Rigid, hardcoded workflows. No customization.

#### What We Build
```
Priority: MEDIUM | Effort: 3-4 weeks | Dependencies: Webhook system
```

- **Rule Builder (No-Code Automation)**
  - Trigger → Condition → Action pattern
  - **Triggers:**
    - Time-based: "60 days before license expires", "Every Monday at 9am"
    - Event-based: "When application status changes to submitted"
    - Data-based: "When provider is created", "When document is uploaded"
  - **Conditions:**
    - "If provider type is MD"
    - "If state is California"
    - "If payer is Aetna"
    - "If days until expiration < 30"
    - Combinable with AND/OR logic
  - **Actions:**
    - Create task (with assignee, due date, priority)
    - Send email (from template library)
    - Send notification (in-app)
    - Update record field
    - Create follow-up
    - Generate document packet
    - Trigger verification check
    - Send webhook to external system
  - Visual rule builder in the UI (drag-and-drop or form-based)
  - Pre-built rule templates for common workflows:
    - "New provider → create onboarding checklist"
    - "License expiring in 90 days → email provider + create renewal task"
    - "All documents uploaded → move application to Ready for Review"
    - "Application denied → create re-submission task + email team"
    - "Exclusion found → lock provider + notify compliance officer"

- **Workflow Templates**
  - Pre-configured workflow packages:
    - Initial credentialing workflow (12 steps)
    - Re-credentialing workflow (8 steps)
    - Payer enrollment workflow (10 steps)
    - License renewal workflow (5 steps)
    - New provider onboarding workflow (7 steps)
  - One-click apply to agency
  - Customizable per agency

**Why this wins:** Every practice has unique workflows. Competitors force you into their process. Credentik lets you build your own — without code.

---

### Advantage 4: Multi-Entity Practice Management
**Competitors:** Modio = single practice. Medallion = single enterprise. Nobody serves the middle.

#### What We Build
```
Priority: MEDIUM | Effort: 2 weeks | Dependencies: Existing multi-tenant (done)
```

- **Cross-Facility Credentialing**
  - Credential a provider at multiple facilities simultaneously
  - Track which facilities each provider is credentialed at
  - Facility-specific requirements (some require additional documents)
  - "Dr. Smith needs credentialing at 4 locations — create all 4 applications at once"

- **Facility Compliance Dashboard**
  - Per-facility compliance scores
  - "Site A: 98% compliant | Site B: 82% — 3 providers have gaps"
  - Drill-down to facility-specific issues
  - Compare facilities side-by-side

- **Organization Hierarchy**
  - Parent organization → child facilities → providers
  - Roll-up reporting (org-level compliance from all facilities)
  - Per-facility user access (facility managers see only their site)
  - Consolidated billing (one invoice, broken down by facility)

- **Group Practice Tools**
  - Shared credential library (upload once, use across applications)
  - Provider availability matrix (which provider is at which facility on which days)
  - Cross-credentialing report ("Dr. Smith is credentialed with Aetna at Site A but not Site B")
  - Bulk operations across facilities

**Why this wins:** Group practices with 3-15 locations are underserved. They're too small for Medallion's enterprise pricing, too complex for Modio's single-practice tools. Credentik fits perfectly.

---

### Advantage 5: Transparent Pricing & Self-Service
**Competitors:** All hide pricing behind "Contact Sales" walls.

#### What We Build
```
Priority: HIGH | Effort: 1 week | Dependencies: Stripe integration
```

- **Public Pricing Page** on credentik.com
  - Clear tier structure:
    - **Starter** — Free tier (1 provider, basic features) — lead generation
    - **Professional** — $49/provider/month (full features, 5 providers included)
    - **Business** — $39/provider/month (10+ providers, priority support, automation rules)
    - **Enterprise** — $29/provider/month (50+ providers, API access, custom integrations, dedicated support)
  - Annual discount (20% off)
  - No setup fees, no contracts, cancel anytime
  - Feature comparison table
  - ROI calculator: "Your 15 providers × $39 = $585/month vs. hiring a credentialing specialist at $4,500/month"

- **Self-Service Signup**
  - Sign up → free trial (14 days, full access) → convert to paid
  - Credit card on file, auto-billing via Stripe
  - In-app upgrade prompts when hitting tier limits
  - Usage dashboard showing provider count vs. tier limit

- **Competitive Pricing Comparison** (on pricing page)
  - "Medallion: $200+/provider | Credentik: $39/provider"
  - "Modio: $100+/provider | Credentik: $39/provider"
  - "Verifiable: Custom enterprise pricing | Credentik: transparent pricing, start free"

**Why this wins:** SMB buyers hate sales calls. Being the only credentialing platform with transparent pricing and a free trial removes the biggest barrier to adoption.

---

### Advantage 6: AI-Powered Intelligence (Extend Existing)
**Competitors:** Medallion has basic AI auto-fill. Nobody else has AI.

#### What We Extend
```
Priority: MEDIUM | Effort: 2-3 weeks | Dependencies: Existing AI features (done)
```

- **Intelligent Document Processing** (enhance existing OCR)
  - Auto-classify uploaded documents (is this a license? COI? W-9?)
  - Auto-extract fields and populate provider profile
  - Flag discrepancies ("License says Dr. Smith but profile says Dr. Smyth")
  - Confidence scoring on extractions
  - "Upload 20 documents → system auto-files and extracts data from all of them"

- **Predictive Analytics**
  - Enhance existing timeline prediction:
    - Factor in payer-specific historical data
    - Factor in state-specific processing times
    - Factor in time of year (Q4 = slower, Q1 = faster)
    - Accuracy tracking ("Our predictions were within 7 days 85% of the time")
  - Denial prediction: "Based on pattern analysis, this application has a 23% denial risk — here's why"
  - Churn prediction: "3 providers have credentials expiring with no renewal activity"

- **Smart Recommendations**
  - "Based on Dr. Smith's specialty and location, these 5 payers have the highest reimbursement rates"
  - "Your organization has a gap in Aetna coverage in Texas — 3 providers are eligible"
  - "This provider's malpractice COI expires in 45 days — 4 applications depend on it"
  - "You typically follow up on Day 14 but Cigna responds fastest to Day 7 follow-ups"

- **Natural Language Search**
  - "Show me all providers with expiring licenses in Florida"
  - "What applications have been pending for more than 60 days?"
  - "Which payer has the fastest credentialing time?"
  - Claude-powered query → API filter translation → results

**Why this wins:** AI is table stakes in 2026, but nobody in credentialing does it well. Credentik's AI actually helps you make decisions, not just fill forms.

---

## PART 4: EXECUTION ROADMAP

### Sprint 1: Revenue Foundation (Weeks 1-2)
| Task | Type | Priority |
|------|------|----------|
| Stripe subscription integration | Gap Close | CRITICAL |
| Public pricing page on credentik.com | Beat Them | CRITICAL |
| Self-service signup flow | Beat Them | CRITICAL |
| Free trial (14-day) with conversion prompts | Beat Them | HIGH |

### Sprint 2: Verification Engine (Weeks 3-5)
| Task | Type | Priority |
|------|------|----------|
| State license board verification (top 10 states) | Gap Close | HIGH |
| Verification UI (badge, history, receipts) | Gap Close | HIGH |
| Auto-verify on schedule (daily/weekly) | Gap Close | HIGH |
| NPDB integration (when enrolled) | Gap Close | HIGH |
| Continuous monitoring alerts | Gap Close | MEDIUM |

### Sprint 3: Intelligence Layer (Weeks 6-8)
| Task | Type | Priority |
|------|------|----------|
| Revenue attribution dashboard | Beat Them | HIGH |
| Compliance scoring system | Beat Them | HIGH |
| Provider profitability analysis | Beat Them | HIGH |
| Audit-ready export (NCQA, Joint Commission) | Beat Them | HIGH |
| Risk matrix heatmap | Beat Them | MEDIUM |

### Sprint 4: Enrollment Automation (Weeks 9-11)
| Task | Type | Priority |
|------|------|----------|
| CAQH auto-population from provider data | Gap Close | HIGH |
| Payer enrollment packet generator (top 20 payers) | Gap Close | HIGH |
| Enhanced provider portal | Gap Close | MEDIUM |
| Provider onboarding wizard | Gap Close | MEDIUM |
| Availity integration (research + prototype) | Gap Close | MEDIUM |

### Sprint 5: Automation & Integrations (Weeks 12-14)
| Task | Type | Priority |
|------|------|----------|
| Smart automation rule engine | Beat Them | HIGH |
| Pre-built workflow templates (5 common flows) | Beat Them | HIGH |
| API documentation (OpenAPI/Swagger) | Gap Close | MEDIUM |
| Webhook event system | Gap Close | MEDIUM |
| Zapier connector | Gap Close | MEDIUM |

### Sprint 6: Advanced Features (Weeks 15-18)
| Task | Type | Priority |
|------|------|----------|
| Multi-facility credentialing | Beat Them | MEDIUM |
| Facility compliance dashboard | Beat Them | MEDIUM |
| AI document auto-classification | Beat Them | MEDIUM |
| Predictive denial scoring | Beat Them | MEDIUM |
| Smart recommendations engine | Beat Them | LOW |
| Natural language search | Beat Them | LOW |

---

## PART 5: COMPETITIVE POSITIONING

### Credentik vs. Medallion
| Dimension | Medallion | Credentik |
|-----------|-----------|-----------|
| Price | $200+/provider/month | $39/provider/month |
| Setup time | Weeks (enterprise onboarding) | Minutes (self-service) |
| Transparency | "Contact sales" | Public pricing, free trial |
| Reporting | Basic | Revenue intelligence + compliance scoring |
| Customization | Rigid workflows | No-code automation rules |
| Billing tools | None | Full invoicing + revenue forecasting |
| Target | Enterprise only | SMB → Enterprise |

**Win message:** "Everything Medallion does for automation. 5x cheaper. Better reporting. Start in 5 minutes, not 5 weeks."

### Credentik vs. Verifiable
| Dimension | Verifiable | Credentik |
|-----------|------------|-----------|
| Price | Custom enterprise | $39/provider/month |
| Type | Verification API (point solution) | Full platform (end-to-end) |
| Workflow | None — API only | Complete credentialing lifecycle |
| Billing | None | Full billing + revenue tools |
| Ease of use | Requires developers | No-code, self-service |
| Compliance | Basic verification | Full compliance command center |

**Win message:** "Verifiable verifies. Credentik does everything — verification, enrollment, billing, compliance, analytics. One platform, no developers needed."

### Credentik vs. Modio
| Dimension | Modio | Credentik |
|-----------|-------|-----------|
| Price | $100+/provider/month | $39/provider/month |
| Multi-tenant | Single practice | Full multi-tenant + multi-facility |
| Automation | Basic | No-code rule engine |
| AI | None | OCR, smart emails, predictions, anomaly detection |
| Analytics | Basic | Revenue intelligence + compliance scoring |
| Scale | Small practices | Small → enterprise |
| Billing | Basic | Full invoicing + estimates + payments |

**Win message:** "Modio is great for one practice. Credentik scales with you — from 1 location to 50, with AI and automation Modio doesn't have."

---

## PART 6: GO-TO-MARKET

### Target Segments (in order)

1. **Behavioral health groups** (5-50 providers) — our niche, deep domain knowledge
2. **Multi-site medical groups** (3-15 locations) — underserved by all competitors
3. **Credentialing services organizations (CSOs)** — they manage credentialing for multiple clients, need multi-tenant
4. **FQHCs (Federally Qualified Health Centers)** — budget-conscious, compliance-heavy
5. **Telehealth companies** — multi-state licensing complexity, we already have telehealth policy data

### Distribution Channels

1. **Product-Led Growth** — Free trial → paid conversion (primary)
2. **Content Marketing** — Blog posts on credentialing best practices, compliance guides, state requirement updates
3. **LinkedIn** — Target credentialing coordinators, practice managers, compliance officers
4. **Industry Events** — NAMSS (National Association Medical Staff Services), state MSS chapters
5. **Referral Program** — Existing customers refer new agencies, both get credits
6. **Partner Channel** — EHR vendors, billing companies, consulting firms as referral partners

### Key Metrics to Track

| Metric | Target |
|--------|--------|
| Free trial signups | 50/month by Month 3 |
| Trial → Paid conversion | 15%+ |
| Monthly recurring revenue (MRR) | $10K by Month 6 |
| Providers on platform | 500 by Month 6 |
| Customer acquisition cost (CAC) | <$500 |
| Monthly churn | <5% |
| Net Promoter Score (NPS) | 50+ |

---

## PART 7: WHAT WE ALREADY HAVE THAT THEY DON'T

Don't forget — Credentik already leads in several areas:

| Feature | Medallion | Verifiable | Modio | Credentik |
|---------|:---------:|:----------:|:-----:|:---------:|
| Fee Schedule Calculator | ❌ | ❌ | ❌ | ✅ |
| Revenue Forecasting | ❌ | ❌ | ❌ | ✅ |
| Reimbursement Comparison | ❌ | ❌ | ❌ | ✅ |
| Coverage Matrix | ❌ | ❌ | ❌ | ✅ |
| Billing & Invoicing | ❌ | ❌ | 🟡 | ✅ |
| Batch Application Generator | ❌ | ❌ | ❌ | ✅ |
| Wave-based Strategy Profiles | ❌ | ❌ | ❌ | ✅ |
| Telehealth Policy Database | ❌ | ❌ | ❌ | ✅ |
| Embeddable Widgets | ❌ | ❌ | ❌ | ✅ |
| Service Line Expansion Tool | ❌ | ❌ | ❌ | ✅ |
| Communication Log | 🟡 | ❌ | 🟡 | ✅ |
| CAQH ProView Manager | 🟡 | ❌ | 🟡 | ✅ |
| Letter & Form Generator | ❌ | ❌ | 🟡 | ✅ |
| Document Checklist Generator | ❌ | ❌ | 🟡 | ✅ |
| Payer Portal Directory | ❌ | ❌ | 🟡 | ✅ |
| AI Anomaly Detection | ❌ | ❌ | ❌ | ✅ |
| AI Timeline Prediction | ❌ | ❌ | ❌ | ✅ |
| Multi-tenant Architecture | ✅ | ✅ | ❌ | ✅ |
| 6-Role RBAC | 🟡 | 🟡 | ❌ | ✅ |

**19 features that no competitor fully offers.** This is the foundation. Build on it.

---

## Summary

**To match them:**
1. Automated primary source verification (state boards, NPDB, AMA, ABMS)
2. Payer enrollment automation (CAQH auto-fill, packet generation, Availity)
3. Enhanced provider self-service portal
4. API documentation + integration connectors

**To beat them:**
1. Revenue Intelligence Engine — the only platform that connects credentialing to money
2. Compliance Command Center — one-click audit readiness
3. Smart Automation Engine — no-code workflow customization
4. Multi-Entity Practice Management — serve the underserved middle market
5. Transparent Pricing — be the anti-enterprise credentialing platform
6. AI Intelligence Layer — predictions, recommendations, natural language

**The pitch:**
> "Credentik gives you everything Medallion offers for 80% less, with revenue intelligence and compliance tools none of them have. Start free. See pricing upfront. No sales calls required."
