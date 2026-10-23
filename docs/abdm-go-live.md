# Taking ABDM live

The code in `lib/providers/abdm/` and `lib/abdm/fhir.ts` is complete and runs against
a simulator today. What follows is the part **code cannot complete**: ABDM production
access is a certification and registration process, not an environment variable.

This document exists so nobody mistakes a working simulator for a live integration.

---

## What the platform does, and on whose behalf

| Role | Who holds it | What it means here |
|---|---|---|
| **HIP** — Health Information Provider | **The partner laboratory** | The lab generates the record; its pathologist signs it. We act as its technical integrator, linking the care context to the patient's ABHA. |
| **HIU** — Health Information User | **MEDWYN** | With the patient's consent, we pull existing records so the caregiver sees history and the technician knows conditions and medications before a visit. |
| **Consent Manager** | ABDM | Holds the consent artefact that governs record exchange. |

The HIP role belongs to the laboratory, not to us. This matters legally and it is
why `Lab.abdmMode` exists:

- `LAB_SELF` — the lab already publishes to ABDM. **We do not publish on its behalf**,
  because double-publishing creates duplicate records in the patient's own account.
- `PLATFORM_FACILITATED` — we publish the signed report as its technical integrator.
- `NONE` — no ABDM publishing for this lab.

---

## Sequence

### 1. Sandbox registration

Register at [sandbox.abdm.gov.in](https://sandbox.abdm.gov.in) and obtain a client ID
and secret. Then:

```bash
# .env.local
ABDM_ENV=sandbox
ABDM_CLIENT_ID=...
ABDM_CLIENT_SECRET=...
```

The provider switches from `SimulatedAbdmProvider` to `LiveAbdmProvider`
automatically — `lib/env.ts` selects on credential presence. No code change.

### 2. Health Facility Registry (HFR)

Every laboratory that will act as a HIP must be registered in the HFR and hold a
facility ID. The lab application form already captures it
(`LabAccreditation.hfrFacilityId`) and the ops verification checklist treats it as an
independent cross-check on the facility's identity.

**A lab without an HFR ID cannot be a HIP.** It can still be a perfectly good partner
laboratory — it simply gets `abdmMode = NONE`.

### 3. Healthcare Professional Registry (HPR)

The supervising pathologist should hold an HPR ID. Technicians may too —
`Technician.hprId` is captured and optional.

### 4. Milestone certification (M1 → M3)

ABDM gates production access behind milestones demonstrated in the sandbox:

| Milestone | What must be demonstrated | Where it lives in this codebase |
|---|---|---|
| **M1** | ABHA creation and verification | `initiateAbhaCreation`, `completeAbhaCreation`, `verifyExistingAbha` |
| **M2** | Care-context linking; records discoverable against an ABHA | `linkCareContext`, the `CareContext` model |
| **M3** | Full consent flow and FHIR R4 health-information transfer | `requestConsent`, `fetchConsentArtefact`, `fetchHealthRecords`, `publishDiagnosticReport`, `buildDiagnosticReportBundle` |

Expect the end-to-end consent flow and consent-artefact storage to take the longest.
Budget weeks, not days.

### 5. Production

Only after M3 is signed off:

```bash
ABDM_ENV=production
ABDM_CLIENT_ID=<production>
ABDM_CLIENT_SECRET=<production>
```

Note that the simulator issues ABHA addresses ending `@sbx`, never `@abdm` — a
simulated account can never be mistaken for a real one, in the database or in a
screenshot.

---

## Design decisions worth defending in a review

### ABHA is optional and never blocks a booking

Most patients aged 70–85 do not have an ABHA. Gating home collection on a digital
health ID would exclude precisely the people this service exists for, and would be
commercially fatal besides.

In the UI, **"Skip for now" carries the same visual weight as the primary action.**
That is deliberate and should survive any redesign.

### ABDM consent and DPDP consent are separate tables

`AbdmConsentArtefact` governs health-record *exchange* through the national consent
manager. `ConsentRecord` governs our own collection, storage and family sharing under
the DPDP Act.

Neither is reused as the other. Collapsing them is the most common compliance mistake
in Indian healthtech: a patient who consents to a blood draw has not thereby consented
to their hospital records being pulled, and vice versa. Revoking one must not silently
revoke or imply the other.

### Nothing provisional is ever published

`publishReportToAbha` refuses unless:

1. the report status is `RELEASED`,
2. `signedAt` is set — a pathologist has signed on site,
3. the patient has a linked ABHA,
4. the lab's `abdmMode` is `PLATFORM_FACILITATED`.

A draft, an unverified summary or an AI-generated narrative never reaches a national
health record. The FHIR bundle is built from the signed report only, and attributes
authorship to the **laboratory and its pathologist**, never to MEDWYN.

### Publishing failure never blocks the family

`verifyAndReleaseReport` releases to the family first and publishes to ABHA after,
catching failures. An ABDM outage must not stop a worried son from seeing his
mother's report.

---

## Verifying the flow before certification

```bash
npm run seed
npm run dev
```

Sign in as `+91 98450 00101` (Anjali Iyer — her mother Lakshmi has a seeded ABHA) and
open **Caregiver → Lakshmi → health account**. In simulated mode you can exercise:

- creating an ABHA by mobile OTP (any 4–6 digits are accepted)
- linking an existing ABHA number or `@sbx` address
- requesting consent, and seeing prior records appear
- withdrawing consent, and seeing fetching stop

Then sign in as ops, release a report for a patient with a linked ABHA, and confirm a
`FhirBundle` row is written with status `PUBLISHED` and a `CareContext` marked
`LINKED`.

To inspect the generated bundle:

```bash
npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  const db = new PrismaClient();
  db.fhirBundle.findFirst({ orderBy: { createdAt: 'desc' } })
    .then(b => console.log(JSON.stringify(JSON.parse(b.bundleJson), null, 2)))
    .finally(() => db.\$disconnect());
"
```

---

## Before the first real patient

- [ ] Healthcare lawyer has reviewed the compliance posture for your state
- [ ] Partner laboratory registered in HFR, facility ID captured
- [ ] Supervising pathologist's HPR ID recorded
- [ ] M1, M2 and M3 signed off in the sandbox
- [ ] Data localisation confirmed — records stored in an India region
- [ ] Documented breach-response process, with the 72-hour notification path
- [ ] Retention periods stated to patients and enforced by `npm run retention:purge`
- [ ] `FIELD_ENCRYPTION_KEY` set in production (the app refuses to start without it)
- [ ] Professional indemnity and general liability insurance **in force**
