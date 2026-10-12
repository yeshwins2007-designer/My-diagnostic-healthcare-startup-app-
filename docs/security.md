# MEDWYN security model

Who can see a health record, and what stands in the way of everyone else.
Written for the team, partner laboratories and auditors. Every control below
is covered by a test named alongside it.

## Who can see what

| Data | Who | Enforced in |
|---|---|---|
| A family's patients, bookings, reports | That family's members only | Every caregiver query is scoped through family membership (`lib/queries/caregiver.ts`, `app/actions/caregiver.ts`) |
| The printable report card | The patient's family, ops, or the patient's own Elder Mode phone | `app/report/[reportId]/card/page.tsx`. Everyone else gets "not found" — e2e `security.spec.ts` |
| Elder Mode | Only a phone the family set up with a one-time link | `lib/auth/elder.ts`. The link dies on first use; the phone keeps a device key the family can turn off — e2e `security.spec.ts` |
| A lab's specimens and results | That lab's members only | `app/actions/lab.ts` scopes every specimen to the member's lab |
| A technician's visits, samples, cold-chain logs | That technician only | `app/actions/field.ts`; GPS accepted only on their own route, only on shift |
| Live tracking | The family, or a signed single-visit link that expires with the visit | `app/api/track/[bookingId]/stream/route.ts` |
| Ops consoles, critical values, audit log | Ops staff | Each ops page checks the role itself (`requirePageRole`), not only the layout — e2e `security.spec.ts` |
| Publishing to a patient's ABHA record | Ops only | `app/actions/abha.ts` |

Every read of a report is written to the tamper-evident (hash-chained) audit log.

## Signing in

- **Phone + one-time code.** Codes are HMAC-hashed, single-use, expire in 10 minutes and allow 5 guesses. Per number: at most 5 codes and 10 wrong guesses an hour, counted in the database so the limit survives restarts and multiple servers. Guesses are claimed atomically, so parallel requests cannot exceed the limit — `tests/otp-security.test.ts`.
- **Email + password** (families only; staff use a phone code or passkey, never a reusable password) — `tests/email-auth.test.ts`, e2e `email-auth.spec.ts`:
  - Sign-up proves both the email (a code sent there) and the mobile number (an SMS code). The number is what the technician and the critical-result call use, so it is never one someone merely typed. Whether either is already registered is only revealed after both are proved. Signing up with a number that already has a family account adds email sign-in to that account instead of creating a second one.
  - Passwords: at least 12 characters, checked against common choices and personal details, and against known data breaches via Have I Been Pwned's k-anonymity API (only 5 characters of a SHA-1 leave the server). Stored as scrypt hashes (N=2^15, r=8, p=3; an OWASP minimum setting); during sign-up only the hash is held while the codes are pending.
  - Sign-in gives one message for a wrong password and an unknown address, and takes the same time for both. Ten wrong passwords in 15 minutes lock password sign-in for that address, counted in the database, claimed before checking so parallel guesses cannot exceed it, and applied to addresses with no account too so the lockout reveals nothing. Phone sign-in keeps working during a lockout.
  - Forgot password: a code to the verified email, the same answer whether or not the address has an account (the email is sent after the response, so timing does not tell either), and a reset signs out every device and emails a notice.
  - Email codes follow the SMS rules: hashed, single-use, 10 minutes, 5 guesses, 5 codes and 10 wrong guesses per address an hour.
  - Offered in production only with a real email provider (`RESEND_API_KEY`); otherwise the Email tab is not shown at all.
- **Passkeys** (Face ID, fingerprint): only the public key is stored; challenges are single-use and expire in 5 minutes; bound to `PUBLIC_APP_URL`; rate limited.
- **Sessions:** signed (HS256, algorithm pinned) httpOnly cookie, `__Host-` prefixed in production, revocable server-side. Families: 30 days. Ops, lab and technicians: 12 hours.
- **Rate limits** key on the client address set by the edge (Cloudflare `cf-connecting-ip`, `x-real-ip`, or the proxy's own forwarded hop), never on the client-supplied first `X-Forwarded-For` entry — `tests/rate-limit.test.ts`.

## Data protection

- Result values are encrypted at rest (AES-256-GCM, random IV, authenticated) with `FIELD_ENCRYPTION_KEY`, separate from the session-signing secret.
- Tracking tokens, OTPs, email codes and Elder Mode keys are stored only as HMAC hashes; passwords only as scrypt hashes. Wrong-password counts store an HMAC of the address, not the address.
- Spent sign-in codes and old wrong-password counts are deleted after a day (`scripts/retention-purge.ts`).
- Raw GPS pings and voice transcripts are deleted after a retention period (`scripts/retention-purge.ts`).

## In the browser

- Strict Content-Security-Policy with a fresh nonce per request (`proxy.ts`): injected markup cannot run script. Third parties are named for what they load (Razorpay, Google Maps, ElevenLabs, Google Fonts).
- `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, HSTS with preload, strict referrer policy, permissions policy.

## A production deployment refuses to start unless it is real

`lib/env.ts`, checked at startup by `instrumentation.ts`. In production the
server will not serve anything unless:

- a real SMS gateway is configured (otherwise codes appear on screen — anyone could sign in as anyone),
- real payments and the webhook secret are configured,
- `FIELD_ENCRYPTION_KEY` and `PUBLIC_APP_URL` are set,
- `AUTH_SECRET` is not the development default.

`DEMO_MODE=true` relaxes the first three for a demo or preview with seeded
data, and must never be set with real patients.

## Go-live checklist (outside the code)

1. Move from SQLite to managed Postgres with encryption at rest, automated encrypted backups and point-in-time recovery; restrict database access to the app's network.
2. Keep secrets in a secrets manager, not files; rotate `AUTH_SECRET` (signs everyone out) and plan `FIELD_ENCRYPTION_KEY` rotation (re-encrypt; the ciphertext is versioned for this).
3. Put the app behind a WAF/edge rate limiter; the in-process limiter protects a single instance only.
4. Ship logs (including the audit log) to write-once storage, and alert on bursts of refused access, OTP lockouts and CSP violations.
5. Commission an independent penetration test before onboarding real families, then yearly.
6. Write a breach-response runbook that meets India's DPDP Act notification duties, and review data retention with counsel.
7. Run `npm audit` in CI and patch Next.js promptly: version 16.3.4 carried a critical advisory, fixed by 16.3.8.
