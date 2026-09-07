# Running the pilot

Two containers: the app, and a Cloudflare tunnel that puts it on an HTTPS
address. You need Docker. You do not need Node, Prisma, or any toolchain.

```bash
./scripts/pilot-setup.sh
docker compose --profile quick up --build
```

The first build takes a few minutes. When it settles:

```bash
docker compose logs tunnel-quick | grep trycloudflare
```

That line is your pilot URL. Open it.

---

## Why a tunnel and not just a port

This is the part worth understanding, because it decides whether the pilot
tests anything real.

Browsers refuse geolocation and microphone access on insecure origins. `https://`
and `localhost` are permitted; a plain `http://192.168.1.x` address is not.

So if you skip the tunnel and hand a technician a LAN address:

- **GPS tracking silently fails.** `components/route-controls.tsx` uses
  `navigator.geolocation.watchPosition`. No error dialog — the map simply never
  moves, and the GPS audit trail stays empty.
- **The voice assistant cannot hear anything.** No microphone permission.
- **Partner labs cannot connect at all.** They are on other networks.
- **Razorpay never calls back.** Webhooks post to a public URL; localhost has none.

That is two of the five surfaces plus payments, untestable. The tunnel fixes all
of it at once, with a real certificate and nothing to install on anyone's phone.

---

## Quick tunnel vs named tunnel

| | `--profile quick` | `--profile named` |
|---|---|---|
| Cloudflare account | not needed | needed |
| Hostname | random, **changes every restart** | stable, your domain |
| Good for | first look, today | the actual pilot |

**Use `named` for anything beyond a first look.** The quick tunnel's hostname
changes on every restart, which means:

- the Razorpay webhook URL you registered in their dashboard breaks — silently,
  which is precisely the failure you are running a pilot to catch
- any link you sent a partner lab is dead
- ElevenLabs and ABDM sandbox callbacks lose their origin

### Setting up the named tunnel

1. Cloudflare Zero Trust dashboard → **Networks → Tunnels → Create a tunnel**
2. Choose **Cloudflared**, name it, and copy the token it shows
3. Route it to a hostname on your domain, pointing at `http://app:3000`
4. Put the token in `.env.pilot`:

   ```
   TUNNEL_TOKEN=eyJhIjoi...
   ```

5. Start it:

   ```bash
   docker compose --profile named up -d
   ```

**Before any real patient data goes in**, restrict who can reach it: Zero Trust
→ **Access → Applications**, add your hostname, and allow only your team's and
the labs' email addresses. A tunnel is a public address until you do this.

---

## Turning on the real integrations

Everything runs against a working simulator until you supply credentials. Each
key switches exactly one integration. The app reads all of them at runtime, so
this is a restart — never a rebuild:

```bash
# edit .env.pilot, then
docker compose --profile named up -d --force-recreate app
```

The UI shows a small **"simulated"** chip wherever an integration is not live.
Its absence is how you confirm a key took effect.

### Razorpay

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

In the Razorpay dashboard, point the webhook at:

```
https://<your-hostname>/api/payments/webhook
```

Subscribe to `payment.captured`, `payment.failed`, `subscription.activated`,
`subscription.charged`, `subscription.halted`, `subscription.cancelled`.

Start on test keys. The simulator already signs its callbacks with the same
HMAC the webhook verifies, so the verification path is identical either way.

### ElevenLabs voice assistant

```
ELEVENLABS_API_KEY=...
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=agent_2901m1x6rwtxf4bs8yyz1836r85a
```

The guardrails are server-side and run in live mode exactly as in simulated
mode. Confirm this yourself early — ask it *"what does my mother's HbA1c mean?"*
It must refuse and open a ticket in `/ops`. If it ever explains a result,
stop the pilot.

### Real OTPs by SMS

```
MSG91_AUTH_KEY=...
MSG91_SENDER_ID=...
```

Without these, OTP codes print to the log instead — which is fine for internal
testing:

```bash
docker compose logs -f app
```

### Google Maps

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
GOOGLE_MAPS_SERVER_KEY=...
```

Restrict the public key by HTTP referrer to your tunnel hostname.

---

## Day-to-day

```bash
docker compose logs -f app                    # live logs, including OTP codes
docker compose --profile named up -d          # start
docker compose stop                           # stop, keeping data
docker compose restart app                    # restart, keeping data
docker compose --profile named up -d --build  # after pulling new code
```

### Starting empty instead of with demo data

First boot seeds a zone, three partner labs and twelve fictional families so
the app is immediately explorable. For a pilot with real labs, that is noise.
Before the first run, set in `.env.pilot`:

```
PILOT_SEED_DEMO_DATA=false
```

Then create your first ops account through `/join`.

### Backing up

The pilot database is a single SQLite file on a Docker volume. Copy it out:

```bash
docker compose cp app:/data/pilot.db ./pilot-backup-$(date +%F).db
```

Do this before any upgrade. It is the whole pilot.

### Starting completely over

```bash
docker compose down -v        # -v deletes the volume and all pilot data
rm .env.pilot
./scripts/pilot-setup.sh
```

`scripts/pilot-setup.sh` refuses to overwrite an existing `.env.pilot` on
purpose: regenerating `FIELD_ENCRYPTION_KEY` would make every result already
stored unreadable, and a new `AUTH_SECRET` invalidates live sessions and every
tracking link already sent to a family.

---

## Checking the pilot actually works

Against the HTTPS URL, not localhost:

1. `/trust` names the partner lab and its NABL number
2. **On a real phone**, `/field` → start a route → the map moves. This is the
   check that fails over plain HTTP, and the reason the tunnel exists.
3. **On a real phone**, open the assistant → the microphone prompt appears
4. Ask it to explain a result → it refuses and opens a ticket in `/ops`
5. Add a parent at a Whitefield address → refused into the waitlist
6. `/ops/gates` → zone 2 locked, every unmet criterion named
7. `/ops/audit` → the hash chain verifies live
8. `docker compose restart app` → sign in again, **your data is still there**

Step 8 matters more than it looks. It proves the volume and the first-run seed
guard work, which is what makes this a pilot rather than a demo that resets.

---

## Limits you should know before you rely on this

- **The image build has not been tested.** It was written against this
  repository's actual layout and dependencies, but no Docker daemon was
  available where it was authored. Run `docker compose --profile quick up --build`
  once before you schedule anything around it.
- **Run exactly one `app` container.** SQLite, the rate limiter in
  `lib/rate-limit.ts`, and the audit hash chain are all in-process and
  single-writer. `--scale app=2` would corrupt the audit chain, which is the
  one record you cannot reconstruct.
- **SQLite is a pilot decision, not a production one.** Moving to Postgres is
  two lines in `prisma/schema.prisma` — the schema was written to keep it that
  way — but it is a migration, so decide before the data matters.
- **A tunnel is a public address.** Put Cloudflare Access in front of it before
  real patient data goes in.
- **`.env.pilot` holds the keys to the encrypted result values.** It is
  gitignored and written mode 600. Back it up somewhere safe and separate from
  the database file; losing it makes the results unreadable.
