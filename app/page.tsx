import Link from 'next/link';
import { brand } from '@/lib/brand';
import { db } from '@/lib/db';
import { formatINR } from '@/lib/money';
import { PricingSection } from '@/components/pricing-section';
import { labForFamily, loadCatalog, loadMedwynOne } from '@/lib/queries/catalog';
import { SiteHeader } from '@/components/site-header';
import {
  Badge,
  ButtonLink,
  Card,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export default async function LandingPage() {
  const [catalog, plan, anchorLab] = await Promise.all([
    labForFamily(null).then(loadCatalog),
    loadMedwynOne(),
    db.lab.findFirst({
      where: { status: 'ACTIVE', brandingConsent: true },
      include: { accreditation: true },
    }),
  ]);

  return (
    <>
      <SiteHeader />

      <Page wide>
        <Stack gap="lg">
          {/* The positioning, stated plainly. Note what is absent: no "instant",
              no "15 minutes", no countdown. We do not race on speed. */}
          <section className="brand-surface rise-in -mx-5 grid gap-8 px-5 py-10 sm:-mx-8 sm:px-8 sm:py-12 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:rounded-[var(--radius-card)] lg:px-12">
            <Stack gap="md" className="brand-content">
              <span className="eyebrow">
                For families with parents at home
              </span>
              <H1>
                Not the fastest lab in the city.
                <br />
                The one your parents’ family trusts.
              </H1>

              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/join?as=individual">Set up care for an individual</ButtonLink>
                <a
                  href="/join?as=business"
                  className="inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-line-strong)] px-5 text-[0.9375rem] font-medium text-[var(--brand-ink)] hover:bg-[var(--color-primary-wash)]"
                >
                  Register a diagnostic lab
                </a>
              </div>

            </Stack>

            <Card tone="primary" className="text-[var(--color-ink)]">
              <Stack gap="sm">
                <H3>What you get</H3>
                <ul className="flex flex-col gap-3">
                  {[
                    'The same trained person visits every month.',
                    'A one-hour visit window, sent to you in writing. If we’re running late, we call first.',
                    'Results explained in plain words, in your language.',
                    'A call from us within 24 hours of every report.',
                    'A call straight away if the lab flags anything urgent.',
                  ].map((line) => (
                    <li key={line} className="flex gap-3">
                      <span aria-hidden className="text-[var(--color-primary)]">
                        ✓
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </Stack>
            </Card>
          </section>

          {/* Reading copy lives on the canvas, at 16:1, never over ornament. */}
          <Stack gap="md">
            <Lead>{brand.oneLiner}</Lead>
            <Muted>
              Already with us?{' '}
              <Link href="/login" className="font-semibold underline">
                Sign in
              </Link>{' '}
              · Prefer to talk?{' '}
              <a
                href={`tel:${brand.supportPhone.replace(/\s/g, '')}`}
                className="inline-flex min-h-12 items-center font-semibold underline"
              >
                {brand.supportPhone}
              </a>
            </Muted>
          </Stack>

          {/* Two humans in every sale. Saying it out loud is more honest than
              pretending the app is for the patient. */}
          <section>
            <Stack gap="md">
              <H2>Who this is for</H2>
              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <Stack gap="sm">
                    <Badge>Who pays</Badge>
                    <H3>You, the son or daughter</H3>
                    <p className="text-[var(--color-ink-soft)]">
                      Often living in another city, or another country. You book, you pay,
                      and you can follow the visit on your phone. We call you after every
                      report, so you don’t have to wonder how they’re doing.
                    </p>
                  </Stack>
                </Card>
                <Card>
                  <Stack gap="sm">
                    <Badge>Who is served</Badge>
                    <H3>Your parent, at home</H3>
                    <p className="text-[var(--color-ink-soft)]">
                      They never need to log in to anything. Someone they know comes to the
                      door, and leaves a large-print card they can read without glasses.{' '}
                      <Link href="/elder" className="font-semibold underline">
                        See what they see
                      </Link>
                      .
                    </p>
                  </Stack>
                </Card>
              </div>
            </Stack>
          </section>

          <section>
            <PricingSection items={catalog} plan={plan} />
          </section>

          {/* Credibility comes from the accredited partner, and we say whose it
              is rather than implying it is ours. */}
          {anchorLab?.accreditation && (
            <Card tone="sunken">
              <Stack gap="sm">
                <H3>Who runs your tests</H3>
                <p>
                  Processed at <strong>{anchorLab.name}</strong>, NABL-accredited{' '}
                  <strong>{anchorLab.accreditation.certificateNumber}</strong>, valid until{' '}
                  {anchorLab.accreditation.validUntil.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                  . Their pathologist signs every report on site.
                </p>
                <Muted>
                  {brand.name} arranges the visit, handles the sample and explains what happens
                  next. We are not a laboratory, and we never issue reports ourselves.{' '}
                  <Link href="/trust" className="font-semibold underline">
                    How we verify our partner labs
                  </Link>
                </Muted>
              </Stack>
            </Card>
          )}

          <Card>
            <Stack gap="sm">
              <H3>Where we visit</H3>
              <p>
                We only cover a small area around each partner lab. A blood sample has to reach
                the lab within two hours, and it lets the same technician keep coming to your
                parent.
              </p>
              <Muted>
                Add your parent’s address and we’ll tell you right away if we can visit. If not
                yet, we’ll put you on the waitlist and call you when we reach your area.
              </Muted>
            </Stack>
          </Card>

          <footer className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-6">
            <p className="flex flex-wrap gap-x-4 text-small">
              <Link href="/privacy" className="inline-flex min-h-11 items-center underline">Privacy policy</Link>
              <Link href="/support" className="inline-flex min-h-11 items-center underline">Help and support</Link>
              <Link href="/trust" className="inline-flex min-h-11 items-center underline">Trust and safety</Link>
            </p>
            <Muted>
              {brand.legalEntity} · {brand.supportPhone} · {brand.disclaimer}
            </Muted>
          </footer>
        </Stack>
      </Page>
    </>
  );
}
