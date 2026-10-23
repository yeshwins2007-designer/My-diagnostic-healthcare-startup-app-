# MEDWYN

**The same trusted person, at your parents' door, every month.**

A hyperlocal, elderly-first doorstep diagnostics platform for India. Five surfaces in
one Next.js PWA: the caregiver who pays, the elderly parent who is served, the field
technician, the partner laboratory, and operations.

```bash
npm install
npm run db:push && npm run seed
npm run dev          # http://localhost:3000
```

It runs with **zero API keys**. Every external integration has a working simulator.

To put it in front of a pilot group instead — Docker plus a Cloudflare tunnel, so
GPS and the microphone work on real phones and partner labs can reach it — see
[`docs/pilot-setup.md`](docs/pilot-setup.md):

```bash
./scripts/pilot-setup.sh
docker compose --profile quick up --build
```

---

## The decision this codebase encodes

Two specifications informed this build, and they disagree.

The **technical spec** describes a three-sided marketplace with a 15-minute
Blinkit-style SLA. The **operating blueprint** says, in bold: *"You have no speed
advantage… do not enter that race,"* and *"THE MISTAKE THAT WOULD COST YOU A YEAR:
building the three-sided marketplace app before you have 50 paying families."*

This resolves the conflict rather than splitting the difference. The product is an
**SOP enforcement engine**, not a booking marketplace:

- There is **no speed SLA anywhere**. What is measured is arrival inside a promised
  sixty-minute window — a promise a small operator can actually keep. A copy lint
  fails the build if the word "instant" or "fastest" reaches user-facing text.
- **Subscription continuity is the home screen.** The same technician, every month.
- **Marketplace features are built but locked**, behind gates that read live metrics
  and refuse until the numbers actually justify expansion.

That last point is the unusual one: the software enforces the founder's own
discipline against them.

---

## `lib/sop/` — the part that matters

Each rule turns one line of the operating blueprint into something the software will
not let you skip. All are pure functions over plain data, so they are unit-tested
without a fixture database.

| Rule | What it enforces | What happens when violated |
|---|---|---|
| `radiusGuard` | Address inside the zone radius | **Refuses into a waitlist.** An override needs a typed reason and is audited |
| `labRouting` | NABL scope covers each test's discipline | **Refuses to route.** An HbA1c cannot reach a microbiology-only lab |
| `sampleClock` | Two hours, collection to lab intake | Live countdown; breach creates an incident and a free recollection |
| `coldChain` | Box sealed, temperature logged | **Blocks the custody handoff** |
| `continuityRule` | Same technician each month | Substitution needs a reason; family is told *before* the visit |
| `criticalValue` | Call the caregiver now, never interpret | Alert cannot close without a call note **and** a written follow-up |
| `followUp` | Family call within 24 hours | Completable only with both answers recorded |
| `visitWindow` | Arrive inside the promised window | Family is notified **before** the window closes |
| `growthGates` | Zone-2 and marketplace criteria | Stays locked, and names each shortfall |
| `metrics` | The six weekly numbers | Computed live from rows, not a stored summary |

---

## Safety, as architecture rather than policy

**The voice assistant cannot discuss results — by construction.**

Three independent layers, in order of strength:

1. **No capability.** The agent is given no tool that can return a result value, a
   trend or a reference range. It cannot leak what it has no way to fetch.
   `auditToolSurface()` fails the test suite if that ever drifts.
2. **Output guard.** Every utterance is screened server-side before it is spoken —
   in live mode as well as simulated.
3. **Red-team suite.** ~40 adversarial prompts across eleven Indian languages plus
   English, all of which must refuse *and* open a human callback. CI-blocking.

A prompt is layer zero. It is necessary and it is not a control.

> When first written, this suite caught three real defects: `"Read out the report to
> me"` was not blocked, `"Please continue taking your usual tablet"` slipped past the
> medication guard, and one deflection left the caller with no route to a human. All
> three are fixed and regression-tested.

**Location privacy is enforced server-side.** Technician GPS is accepted *only*
between route start and end; off-shift pings are rejected and the rejection is
itself audited. Tracking links are signed, single-visit and expiring. Raw pings are
purged on a retention schedule into coarse route summaries.

**Everything else:** AES-256-GCM field encryption for result values, a hash-chained
audit log with live verification at `/ops/audit`, per-purpose DPDP consent kept
distinct from ABDM consent artefacts.

---

## Partner laboratories: application, not activation

Registering does not make a lab routable. A person clears seven checks — certificate
number against the NABL public directory, the certificate QR, validity, **scope
coverage**, address match, signed agreement, pathologist registration — each stored
with who checked it and when.

The certificate format is validated: `MC-XXXX` is a medical laboratory; a `TC-XXXX`
testing-and-calibration number is **refused with an explanation**.

NABL publishes no verification API, so this is deliberately *structured evidence plus
human sign-off plus automated expiry*. The code does not pretend a machine checked
something a machine cannot check.

### The partner app

Partners have their own door and their own app, the way a restaurant partner app is
separate from the ordering app. After any sign-in, one table decides where each
account lands (`lib/auth/home.ts`): a family goes to `/caregiver`, a lab to `/lab`.

| Path | What | Files |
|---|---|---|
| `/lab/login`, `/lab/register` | Partner sign-in and registration | `app/lab/(auth)/` |
| `/lab/apply` | The application, before a lab exists | `app/lab/(onboarding)/` |
| `/lab` | Order terminal: live feed, board, scanner | `app/lab/(console)/` |
| `/lab/earnings`, `/lab/catalog`, `/lab/profile` | Earnings, rate card, lab details | `app/lab/(console)/` |

The parenthesised folders are route groups: they never appear in a URL, and each has
its own layout and guard, so nothing in the family app (`app/caregiver`) renders in
the partner app or the other way round. Set `PARTNER_HOST` (e.g.
`partners.medwyn.in`) to serve the same pages at the root of their own host.

**Orders.** A paid order rings on the lab's terminal. The lab accepts, or rejects
with a reason, within 30 minutes, and never within 3 hours of the visit; after that
it counts as accepted, because the agreement already commits the lab's capacity. A
rejection re-routes the order through the same gate as a booking (accredited scope,
capacity, nothing paused, nearest first) at the family's original price, and never
back to a lab that turned it down. If no lab can take it, it becomes an incident for
ops. (`lib/orders/lab-orders.ts`)

**Results.** One field per test in the order; nothing is saved unless every test has
a valid value (`lib/orders/results.ts`). The signed PDF is uploaded beside it, checked
to really be a PDF, stored encrypted, and served sandboxed.

**Roles.** Owner: everything. Manager: orders, results, catalog. Intake desk: accept
orders and receive or reject samples, but not reject orders or sign results.

### Finding a lab

The family home screen's search bar opens **Find a lab** (`/caregiver/labs`). Labs
are sorted by distance from the **parent's home**, because that is where the sample
is taken and the person searching is often in another city. "Use my current
location" (or the pin in the search bar) re-sorts the list by the phone's position
**on the phone**: the position is never sent to the server.

A lab can be chosen only if it is active, its NABL accreditation is current, it
offers tests right now, and it is within **15 km of the home**
(`MAX_LAB_DISTANCE_KM`): further than that, a sample cannot reach it within two
hours. The same cap applies at booking and when a rejected order is re-routed.
Labs that fail are listed with the reason, never ranked by price. "Book with this
lab" re-checks all of it on the server, saves it as that parent's lab, and opens
booking with that lab's tests.

**Logos.** With `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` set, each lab's own logo is shown
from its website domain via Brandfetch's Logo Link CDN; otherwise a monogram.

---

## ABHA / ABDM

The platform acts as **HIU** (pulls history with consent) and as **HIP integrator on
behalf of the partner lab** (publishes the signed FHIR R4 DiagnosticReport).

Two decisions worth stating plainly:

- **ABHA never blocks a booking.** Most patients in this age band do not have one.
  "Skip for now" carries equal visual weight to the primary action.
- **ABDM consent artefacts and DPDP consent records are separate tables.** Neither
  stands in for the other. Collapsing them is the compliance mistake most Indian
  healthtech makes.

Publishing is per-lab (`Lab.abdmMode`), because an established laboratory usually
pushes to ABDM itself and double-publishing creates duplicate records in the
patient's own account. See [`docs/abdm-go-live.md`](docs/abdm-go-live.md).

---

## The elderly UX system

Rules, encoded as tokens in `app/globals.css` rather than described in a style guide:

- Body text **22px**, headings 34px+ (a typical app ships 14–16px)
- Touch targets **64×64px** minimum, 16px apart
- One primary action per screen, bottom-anchored in thumb reach
- Max four choices per screen; no hamburger menus, no nested navigation
- Every icon carries a text label; contrast targets **WCAG AAA**
- Prices in digits *and* words: `₹1,799 (one thousand seven hundred ninety nine rupees)`
- Confirmation screens repeat back what will happen, before it happens
- **Zero urgency patterns.** No timers, no "2 slots left", no countdown. Enforced by
  the copy lint.
- **12 languages**, switchable on every screen, in native script

**Copy reads like a person wrote it.** Short sentences, plain words, contractions
where people would use them, and no em dashes between words: the copy lint fails
the build on one (a lone "—" for an empty value is fine).

### On Apple devices

On an iPhone, iPad or Mac the app switches to Apple's look (`app/apple.css`): San
Francisco, iOS system colours, Liquid Glass on everything that floats, a floating
glass tab bar with the iOS scroll-edge fade, capsule buttons, round bar buttons,
segmented controls, and the text size chosen in iOS Settings (Dynamic Type, clamped
so layouts hold). Reduce Transparency and Increase Contrast turn the glass solid.
iOS gets a PNG Home Screen icon.

A script in `app/layout.tsx` sets `data-platform="apple"` before first paint, and
every rule in `app/apple.css` is scoped to it, so **Android and other platforms are
unchanged**. `tests/e2e/platform.spec.ts` checks both halves.

**Elder Mode** (`/elder`) is deliberately thin: four tiles, no login, read-aloud on
every screen, and it cannot take a payment or change a plan. The elderly patient's
real deliverable is the printed A5 stoplight card — which carries **no numbers**,
because a value without a doctor to interpret it produces either false reassurance
or unnecessary fear.

### The assistant's calls

`lib/voice/` makes six kinds of short call, each only if the family turned it
on (a sheet after sign-up explains them; Profile keeps the switches): the
night-before fasting call that asks the parent to say it back, the door call
when nobody answers (parent, then family, while the technician waits), the
after-visit "on time? gentle?" check-in that feeds each technician's quality
numbers in `/ops/calls`, the report-ready call (never what is in it, and never
when a value is critical), a one-minute monthly update, and the due-date
reminder that can hold the usual slot. Every call rings in the listener's own
time zone and calling hours, opens by saying it is an automated assistant, and
carries a brief with no result in it. What a call established becomes a ticket,
a quality record or a booking request in `lib/voice/outcomes.ts`; a visit asked
for by phone, by a parent who just called and talked, is confirmed and paid by
the family in the app. Run `npm run calls:run` every five minutes. Without a
phone line (`ELEVENLABS_PHONE_NUMBER_ID`), calls are written down as what they
would have said, never dialled.

### The App Store and Google Play apps

`mobile/` holds the native shells (Capacitor) that open this web app, and
`.github/workflows/mobile.yml` builds them in the cloud. Started by hand with
"submit" ticked, it also takes the store screenshots from the live app
(`scripts/store-screenshots.ts`) and sends the listing in
`mobile/fastlane/metadata/` and both builds to the stores. Store reviewers sign
in with a dedicated number and fixed code (`APP_REVIEW_PHONE`,
`APP_REVIEW_CODE`; `npm run seed:review`). The accounts, keys and declarations
only the company can provide are in
[`docs/store-launch.md`](docs/store-launch.md).

---

## Provider adapters

```
maps/      GoogleMapsProvider      | SimulatedMapsProvider
payments/  RazorpayProvider        | SimulatedPaymentsProvider
voice/     ElevenLabsVoiceProvider | SimulatedVoiceProvider
abdm/      LiveAbdmProvider        | SimulatedAbdmProvider
sms/       Msg91Provider           | ConsoleSmsProvider
```

Selected at boot by whether the credential exists (`lib/env.ts`). The simulators are
not stubs: the maps one replays a real Jayanagar polyline so the marker moves along
streets; the payments one signs its callbacks with the same HMAC the webhook
verifies, so a demo exercises the real verification path rather than bypassing it.

**Going live is setting environment variables. No code changes.**

---

## Commands

```bash
npm run dev              # development server
npm run build            # production build
npm run seed             # demo data — 1 zone, 3 labs, 12 families, live bookings
npm run demo:track       # replays a GPS route; the caregiver map moves
npm test                 # 180 unit tests: SOP rules, voice red-team, rate limits
npm run lint:copy        # fails on speed claims and urgency patterns
npm run test:e2e         # 12 Playwright specs against the running app
npm run typecheck        # tsc --noEmit
npm run retention:purge  # GPS/transcript retention job (run on a schedule)
npm run provision:voice  # (re)create the ElevenLabs agent from source
```

### Seeded logins

OTP codes print to the server console.

| Phone | Who | Surface |
|---|---|---|
| `+91 98450 00001` | Yeshwin, founder | `/ops` |
| `+91 98450 00101` | Anjali Iyer, caregiver | `/caregiver` |
| `+91 98450 00010` | Priya Nair, technician | `/field` |
| `+91 98451 00200` | Dr. Sudha Rao, lab owner | `/lab/login` → `/lab` |
| `+91 98451 00201` | Ravi Shetty, lab intake desk | `/lab/login` → `/lab` |

### The walkthrough that proves the loop

1. Sign in as Anjali → link or **skip** ABHA → subscribe to Suraksha via the
   simulated UPI Autopay sheet
2. Add a parent at a Whitefield address → **`radiusGuard` refuses into the waitlist**
3. As Dr. Rao at `/lab/login` → accept or reject the new orders → scan `SPC-240002` →
   enter results and attach the PDF → report is `SUMMARY_PENDING_REVIEW`, **not** released
4. As ops → verify and release → the 24-hour call task and critical-value alert
   appear automatically
5. `/ops/critical` → the fixed non-interpretive script; the alert refuses to close
   without both the call note and the written follow-up
6. `/ops/gates` → zone 2 **locked**, each unmet criterion named
7. Voice assistant → *"reschedule my mother's visit"* works;
   *"what does her HbA1c mean?"* **refuses and opens a human ticket**
8. `/ops/audit` → hash chain recomputed live and shown intact

Every step above is covered by `tests/e2e/journey.spec.ts`, so these are
assertions rather than instructions that rot.

### Screenshots

```bash
npx playwright test screenshots   # writes 24 PNGs to screenshots/ (gitignored)
```

---

## Deliberately not built

- **Point-of-care analyser integration.** The blueprint says Phase 2 — device cost,
  cartridges, calibration and regulatory scope are not earned yet. The schema leaves
  a clean seam.
- **Price comparison between labs.** Explicitly not this business.
- **Automatic AI report narratives.** The summariser is gated behind mandatory human
  verification, permanently — not as an early-stage precaution.
- **Corporate wellness and full-body-checkup funnels.** They look like easy revenue
  and destroy the elderly-care positioning.

---

## Honest limitations

- **SQLite by default.** Production needs Postgres in an India region: change the
  `datasource` provider in `prisma/schema.prisma` and `DATABASE_URL`. The schema
  deliberately avoids `enum`, `Json` and scalar lists so that switch is two lines.
- **The audit hash chain serialises writes in-process.** A multi-instance deployment
  needs a database advisory lock or a single writer.
- **Rate limiting is in-process too.** It protects one instance against casual
  abuse of the two endpoints reachable without a session — the assistant and the
  OTP request. Behind a load balancer it needs Redis or the platform's own edge
  limiter.
- **Translations need a native reviewer** before launch. They are carefully written,
  not professionally reviewed.
- **ABDM production access is a certification process**, not a code change.
- **The guardrail patterns are heuristics.** They are deliberately over-broad — a
  false positive costs one unnecessary transfer to a human; a false negative is a
  robot giving medical advice. Expect to add patterns as real calls arrive.
- **Referral attribution is not yet modelled**, so referral share reads zero rather
  than an invented number the growth gates would then trust.
- **None of this is a substitute for a healthcare lawyer** reviewing the compliance
  posture in your state before the first collection.

---

*This is information infrastructure, not a medical device. Reports are produced and
signed by NABL-accredited partner laboratories and their pathologists. MEDWYN
coordinates logistics and communication, and never issues a diagnosis.*
