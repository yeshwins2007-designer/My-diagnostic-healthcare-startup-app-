import type { Metadata } from 'next';
import Link from 'next/link';
import { brand } from '@/lib/brand';
import { env } from '@/lib/env';
import { ERASE_AFTER_DAYS } from '@/lib/account/deletion';
import { SiteHeader } from '@/components/site-header';
import { H1, H2, Lead, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Privacy policy' };

const UPDATED = '14 October 2026';

/**
 * The privacy policy, written from what the code actually does: every
 * category below maps to a table in prisma/schema.prisma, every recipient to
 * a provider in lib/providers, every period to a setting or a job. If one of
 * those changes, this page changes with it. The App Store and Google Play
 * both link to it.
 */
export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <Page>
        <Stack gap="lg">
          <Stack gap="sm">
            <H1>Privacy policy</H1>
            <Lead>
              What we collect, why, who sees it, how long we keep it, and how to have it deleted.
            </Lead>
            <Muted>Last updated {UPDATED}.</Muted>
          </Stack>

          <Section title="Who we are">
            <p>
              {brand.name} is run by {brand.legalEntity} ({brand.registeredAddress}). We arrange
              home blood tests for elderly parents and the calls that follow. Accredited partner
              laboratories run the tests and sign the reports.
            </p>
          </Section>

          <Section title="What we collect">
            <ul>
              <li>
                <strong>About you:</strong> your name and mobile number. Your email address and a
                password, if you choose email sign-in (we store only a scrambled form of the
                password, never the password itself). Passkeys, if you add one, stay on your device;
                we keep only the public half.
              </li>
              <li>
                <strong>About your parent:</strong> name, age, sex, health conditions, medicines,
                how mobile they are, notes for the technician, home address and its map location,
                and the consents given for each visit.
              </li>
              <li>
                <strong>Test results:</strong> the values and the signed report from the
                laboratory. Results are encrypted in our database.
              </li>
              <li>
                <strong>ABHA (optional):</strong> your parent’s health account number, only if you
                link it.
              </li>
              <li>
                <strong>Payments:</strong> amounts and payment references. Card and UPI details go
                to Razorpay and never reach us.
              </li>
              <li>
                <strong>Location:</strong> when you use “Use my current location” to find a lab,
                your location stays on your phone and is never sent to us. Our technicians’ phones
                share their location during a morning route so you can see them arriving.
              </li>
              <li>
                <strong>Voice assistant:</strong> if you talk to it, what was said, so a coordinator
                can follow up.
              </li>
            </ul>
            <p>No advertising, no tracking across other apps or websites, and we never sell data.</p>
          </Section>

          <Section title="Why we use it">
            <ul>
              <li>To book, carry out and follow up each visit, and to send you the report.</li>
              <li>To call you within 24 hours of every report, and straight away if the lab flags something urgent.</li>
              <li>To take payment and keep the accounts the law requires.</li>
              <li>To keep the service safe: sign-in codes, fraud checks and a tamper-evident record of who saw what.</li>
            </ul>
            <p>
              We rely on your consent for each purpose, given separately, and on the law where it
              requires us to keep records. You can withdraw consent at any time.
            </p>
          </Section>

          <Section title="Who sees it">
            <ul>
              <li><strong>The partner laboratory</strong> that tests the sample: your parent’s name, age, sex and the tests.</li>
              <li><strong>Your technician:</strong> the address, the notes you wrote and the visit details.</li>
              <li><strong>Razorpay</strong>, for payments.</li>
              <li><strong>Our SMS and email providers</strong>, to send sign-in codes and notices.</li>
              <li><strong>Google Maps</strong>, to find the address on the map.</li>
              <li><strong>ElevenLabs</strong>, which runs the voice assistant, only if you use it.</li>
              <li><strong>ABDM</strong>, only if you link an ABHA and agree to share a report.</li>
              <li>Authorities, only when the law requires it.</li>
            </ul>
          </Section>

          <Section title="How long we keep it">
            <ul>
              <li>Your account: until you delete it.</li>
              <li>Technician route locations: {env.PING_RETENTION_DAYS} days, then only a summary.</li>
              <li>Voice assistant transcripts: {env.TRANSCRIPT_RETENTION_DAYS} days.</li>
              <li>
                After you delete your account: we erase your details and your parents’ details
                within {ERASE_AFTER_DAYS} days. Laboratories must keep the reports they sign, and
                we must keep payment and tax records and our audit record, for as long as the law
                requires. These no longer carry your name.
              </li>
            </ul>
          </Section>

          <Section title="Your rights">
            <p>
              Under India’s Digital Personal Data Protection Act, 2023, you can ask to see the data
              we hold, have it corrected, have it erased, withdraw consent, and name someone to act
              for you. You can delete your account yourself in the app: Profile, then “Delete my
              account”. For anything else, write to{' '}
              <span className="font-semibold">{brand.privacyEmail}</span>.
            </p>
            <p>
              Our Grievance Officer is {brand.grievanceOfficer}, at{' '}
              <span className="font-semibold">{brand.privacyEmail}</span>. We reply within 7 days.
              If you are not satisfied, you can complain to the Data Protection Board of India.
            </p>
          </Section>

          <Section title="Children">
            <p>
              Accounts are for adults. Parents’ details are added by a family member who has their
              permission, or who is authorised to give consent for them.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              If we change this policy, we’ll update the date above, and tell you in the app before
              any change that affects how your data is used.
            </p>
          </Section>

          <Muted>
            <Link href="/support" className="inline-flex min-h-11 items-center font-semibold underline">
              Help and support
            </Link>
          </Muted>
        </Stack>
      </Page>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 [&_li]:leading-relaxed [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
      <H2 className="text-h3">{title}</H2>
      {children}
    </section>
  );
}
