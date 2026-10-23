# Launching on the App Store and Google Play

Everything that can be automated is: the apps build in the cloud, screenshots
are taken from the live app, and one run of a workflow sends the listing,
screenshots and build to both stores. What is left here is what only the
company can do (accounts, identity checks, legal declarations) and the keys
those accounts produce. All of it works from an iPad in Safari and the
GitHub app.

Do the steps in order. The first one takes the longest, so start it today.

---

## 1. Accounts (only you can do these)

| | What | Cost | Wait |
|---|---|---|---|
| 1a | **D-U-N-S number** for the company. Apple and Google both use it to confirm an organisation exists. Request it free through Apple's D-U-N-S lookup on developer.apple.com. | Free | 5 to 14 days |
| 1b | **Apple Developer Program, as an Organization** (not an individual). Apple only accepts health apps from the legal entity that provides the service (guideline 5.1.1(ix)). | $99 a year | 1 to 3 days after D-U-N-S |
| 1c | **Google Play Console, as an Organization.** A personal account would also have to run a 14-day closed test with 12 testers before it could publish. | $25 once | 1 to 3 days |
| 1d | **The domain** the app lives on (the bundle ID `in.medwyn.app` assumes `medwyn.in`). | | |

Use the company's real legal name, registered address and a monitored email in
all three. The same details go in `lib/brand.ts` (`legalEntity`,
`registeredAddress`, `grievanceOfficer`, `supportEmail`, `privacyEmail`,
`supportPhone`): the privacy policy and support pages show them, and both
stores check those pages.

## 2. The production server

The store apps open the web app at `MEDWYN_APP_URL`. The stores reject an app
that shows an offline screen, and the server refuses to start in production
without real keys, so this comes before any submission.

- Hosting with a lasting database. SQLite in `prisma/schema.prisma` is a file:
  fine on one server with a disk (`Dockerfile`, `docker-compose.yml`), lost on
  serverless hosts. For Vercel, switch the `datasource` to Postgres (the schema
  is written for it: two lines).
- Server environment, all required (`lib/env.ts` explains each):
  `DATABASE_URL`, `AUTH_SECRET`, `FIELD_ENCRYPTION_KEY`, `PUBLIC_APP_URL`,
  `MSG91_AUTH_KEY` (+ `MSG91_SENDER_ID`), `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Not `DEMO_MODE`.
- At least one real partner lab, approved through `/lab/register` and the ops
  console, with an open zone around it. Without one, every booking ends on the
  waitlist, reviewers included.
- **The review account.** Pick a mobile number nobody uses for anything else
  and a six-digit code. Set both on the server as `APP_REVIEW_PHONE`
  (`+91` and ten digits) and `APP_REVIEW_CODE`, then run once against the
  production database:

  ```
  APP_REVIEW_PHONE=+91XXXXXXXXXX npm run seed:review
  ```

  It makes a family account with a sample parent inside the first open zone.
  Run it again before every submission: reviewers often test "Delete my
  account" on it, and it restores the account. Unset both variables once the
  apps are approved; set them again for the next review.

Check these answer in Safari before going on: `/`, `/privacy`, `/support`,
`/delete-account`.

## 3. Keys for the cloud builds

Add each in GitHub: repository > Settings > Secrets and variables > Actions.

**Variables** (not secret):

| Name | Value |
|---|---|
| `MEDWYN_APP_URL` | `https://` address of the production web app |
| `LEGAL_ENTITY` | The company's legal name, for the App Store copyright line |
| `REVIEW_CONTACT_NAME` | Who Apple calls with review questions, first and last name |
| `REVIEW_CONTACT_PHONE` | Their phone, with country code |
| `REVIEW_CONTACT_EMAIL` | Their email |

**Secrets:**

| Name | Where it comes from |
|---|---|
| `APP_REVIEW_PHONE`, `APP_REVIEW_CODE` | The same pair as on the server (step 2) |
| `APPLE_TEAM_ID` | developer.apple.com > Account > Membership details > Team ID |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` | App Store Connect > Users and Access > Integrations > App Store Connect API > Team Keys > "+". Role: **Admin** (the build signs itself, which needs it). Download the `.p8` (only possible once), open it in Files, and paste its whole text, BEGIN and END lines included, as `ASC_KEY_P8`. |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | The Android upload key. See below. |
| `PLAY_SERVICE_ACCOUNT_JSON` | See below. |

**The Android upload key, from an iPad.** Open the repository on github.com in
Safari > Code > Codespaces > Create codespace (a Linux terminal in the
browser, free for this). In its terminal:

```
keytool -genkeypair -v -storetype PKCS12 -keystore upload.keystore \
  -alias medwyn -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload.keystore > upload.b64
```

Choose a long password when asked. Then add the secrets: the contents of
`upload.b64` as `ANDROID_KEYSTORE_BASE64`, the password as both
`ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD`, and `medwyn` as
`ANDROID_KEY_ALIAS`. Download `upload.keystore` (right-click > Download) and
keep it with the password somewhere safe, then delete the codespace. Google
holds the real app signing key (Play App Signing), so a lost upload key can be
replaced through Play Console support, but it takes days.

**The Google Play service account.** Google Cloud console > IAM & Admin >
Service accounts > Create (any name) > Keys > Add key > JSON. Paste the whole
file as `PLAY_SERVICE_ACCOUNT_JSON`. Then in Play Console > Users and
permissions > Invite new users, invite the service account's email with
"Release to production, exclude devices, and use Play App Signing" and "Manage
testing tracks" for this app.

## 4. One-time store setup (by hand; neither store allows it by API)

### App Store Connect

1. developer.apple.com > Certificates, Identifiers & Profiles > Identifiers >
   "+" > App IDs > App: description MEDWYN, bundle ID **explicit**
   `in.medwyn.app`.
2. App Store Connect > Apps > "+" > New App: iOS, name **MEDWYN: Blood Tests at
   Home**, primary language **English (U.S.)**, bundle ID `in.medwyn.app`, SKU
   `medwyn-ios`, full access.
3. **App Privacy** > Get started. Privacy policy URL: `MEDWYN_APP_URL/privacy`.
   Data is collected; none of it is used for tracking. For each type below:
   collected, linked to the person's identity, purpose **App Functionality**
   only.

   | Category | Types |
   |---|---|
   | Contact Info | Name, Email Address, Phone Number, Physical Address |
   | Health & Fitness | Health |
   | Location | Precise Location (technicians' phones during a route; a family's own location never leaves the phone) |
   | Purchases | Purchase History |
   | Identifiers | User ID |
   | User Content | Audio Data (voice assistant), Other User Content (notes for the technician) |

   Payment card and UPI details are entered into Razorpay's checkout and never
   reach us: not collected. These answers match the privacy manifest in
   `mobile/ios/App/App/PrivacyInfo.xcprivacy`.
4. **Age Rating:** Medical or treatment information: **Frequent** (the app
   shows laboratory results). Everything else: None or No. Unrestricted web
   access: No.
5. **Pricing and Availability:** Free. Availability: India (add more only where
   you visit).
6. **App Information > Content Rights:** does not contain third-party content.

The workflow fills in the rest: description, keywords, screenshots, URLs,
categories (Medical, then Health & Fitness), copyright, review contact, the
review sign-in, the review notes and the export compliance answer (the app
uses no non-exempt encryption; `Info.plist` already says so).

### Google Play Console

1. Create app: name **MEDWYN: Blood Tests at Home**, default language
   **English (United States)**, App, Free.
2. **App content**, every item:
   - Privacy policy: `MEDWYN_APP_URL/privacy`
   - App access: some functionality is restricted. Add instructions: "Tap
     Phone, enter `<APP_REVIEW_PHONE without +91>`, tap Send me a code, enter
     `<APP_REVIEW_CODE>`. No SMS is sent to this number. Please don't complete
     a payment: it books a real home visit."
   - Ads: no ads.
   - Content rating: category **Utility, Productivity, Communication or Other**.
     Shares the user's location with other users: **Yes** (a family sees the
     technician arriving). Digital purchases: No. Everything else: No.
   - Target audience: **18 and over**.
   - News app: No. Government app: No. Financial features: none.
   - Health apps: the app books healthcare services (home sample collection)
     and shows laboratory results. It is not a medical device.
   - **Data safety:** collects data, shares none (the partner lab receives a
     booking because the family asked for it, which Google does not count as
     sharing). Encrypted in transit: Yes. People can request deletion: Yes,
     with the link `MEDWYN_APP_URL/delete-account`. Collected, all for App
     functionality (and Account management for the personal info):

     | Category | Types | Required? |
     |---|---|---|
     | Personal info | Name, Phone number, Address, User IDs | Required |
     | Personal info | Email address | Optional |
     | Health and fitness | Health info | Required |
     | Financial info | Purchase history | Required |
     | Location | Precise location (technicians only) | Optional |
     | Audio | Voice or sound recordings | Optional |
     | App activity | Other user-generated content | Optional |
3. **Store settings:** category **Medical**, contact email and phone, website
   `MEDWYN_APP_URL`.
4. **The first build goes in by hand** (Google requires it once). In the
   GitHub app: Actions > Mobile apps > the latest run with the signing secrets
   set > Artifacts > `medwyn-android-play-bundle`. It downloads as a zip; tap
   it in Files to unzip. Play Console > Testing > Internal testing > Create new
   release > accept Play App Signing > upload `app-release.aab` > Save.

## 5. Submit

GitHub app (or github.com) > Actions > **Mobile apps** > Run workflow >
tick **submit** > Run.

It checks every key above is set and the live app answers (and names
anything missing), takes fresh screenshots from the live app with the review
account, builds both apps, then:

- **iOS:** uploads the build to TestFlight, fills in the listing, screenshots
  and review details, waits for Apple to process the build, and submits it to
  App Review. Release is manual: once approved, press Release in App Store
  Connect.
- **Android:** uploads the bundle, listing, screenshots and release notes to
  the track you pick (internal by default) as a **draft**. Until Google has
  reviewed the app once, open Play Console > Publishing overview > Send
  changes for review. After that, pick `production` and `completed` to send
  releases straight out.

Apple usually answers within one to three days, Google within a few days for a
new app.

## If a store says no

- **"Can't sign in" (Apple 2.1):** the server is missing `APP_REVIEW_PHONE` /
  `APP_REVIEW_CODE`, or the review account was deleted. Run
  `npm run seed:review` and reply in Resolution Center.
- **"Website in an app" (Apple 4.2):** the strongest answer is push
  notifications (report ready, technician on the way). Not built yet: the next
  thing to add if Apple asks.
- **Data safety or App Privacy mismatch:** the tables above follow
  `prisma/schema.prisma` and `app/privacy/page.tsx`. If the app starts
  collecting something new, all three change together.
