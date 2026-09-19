import Link from 'next/link';
import { brand } from '@/lib/brand';
import { db } from '@/lib/db';
import { formatINR } from '@/lib/money';
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
  const [plans, anchorLab, zone] = await Promise.all([
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    db.lab.findFirst({
      where: { status: 'ACTIVE', brandingConsent: true },
      include: { accreditation: true },
    }),
    db.zone.findFirst({ where: { isActive: true }, orderBy: { sequence: 'asc' } }),
  ]);

  return (
    <>
      <SiteHeader />

      <Page wide>
        <Stack gap="lg">
          {/* The positioning, stated plainly. Note what is absent: no "instant",
              no "15 minutes", no countdown. We do not race on speed.

              The hero is the one full-strength brand surface on this page: the
              logo's turquoise only clears contrast on dark, so this is where it
              is allowed to carry the identity. */}
          <section className="brand-surface rise-in -mx-5 grid gap-8 px-5 py-10 sm:-mx-8 sm:px-8 sm:py-12 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:rounded-[var(--radius-card)] lg:px-12">
            <Stack gap="md">
              <span className="brand-accent text-[var(--text-small)] font-semibold tracking-wide uppercase">
                For families with parents at home
              </span>
              <H1>
                Not the fastest lab in the city.
                <br />
                The one your parents’ family trusts.
              </H1>
              <Lead>{brand.oneLiner}</Lead>

              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/join?as=individual">Set up care for a parent</ButtonLink>
                <a
                  href="/join?as=business"
                  className="inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-[var(--radius-control)] border-2 border-[color-mix(in_oklab,var(--brand-glow)_55%,transparent)] px-6 text-[var(--text-lead)] font-semibold text-[var(--brand-ink)]"
                >
                  Register a diagnostic lab
                </a>
              </div>

              {/* Not <Muted>: its ink token is tuned for the light canvas and
                  would sink into the brand surface. */}
              <p className="text-[var(--text-small)] text-[color-mix(in_oklab,var(--brand-ink)_82%,transparent)]">
                Already with us?{' '}
                <Link href="/login" className="font-semibold text-[var(--brand-glow)] underline">
                  Sign in
                </Link>{' '}
                · Prefer to talk?{' '}
                <a
                  href={`tel:${brand.supportPhone.replace(/\s/g, '')}`}
                  className="inline-flex min-h-12 items-center font-semibold text-[var(--brand-glow)] underline"
                >
                  {brand.supportPhone}
                </a>
              </p>
            </Stack>

            <Card tone="primary">
              <Stack gap="sm">
                <H3>What you actually get</H3>
                <ul className="flex flex-col gap-3">
                  {[
                    'The same trained person visits, every month.',
                    'A sixty-minute window we tell you in writing — and a call before it, if we are going to be late.',
                    'Results explained in plain language, in your language.',
                    'A phone call from us within 24 hours of every report. Every time.',
                    'An immediate call if the laboratory flags anything urgent.',
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

          {/* Two humans in every sale. Saying it out loud is more honest than
              pretending the app is for the patient. */}
          <section>
            <Stack gap="md">
              <H2>There are two people in this decision</H2>
              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <Stack gap="sm">
                    <Badge>Who pays</Badge>
                    <H3>You — the son or daughter</H3>
                    <p className="text-[var(--color-ink-soft)]">
                      Usually 32 to 55, often in another city or another country. You handle
                      the booking, the payment and the tracking. You get the call after every
                      report, so you stop wondering whether they are okay.
                    </p>
                  </Stack>
                </Card>
                <Card>
                  <Stack gap="sm">
                    <Badge>Who is served</Badge>
                    <H3>Your parent — at home</H3>
                    <p className="text-[var(--color-ink-soft)]">
                      They never have to log in to anything. A person they recognise arrives
                      at the door, and leaves a large-print summary card they can read without
                      their glasses.{' '}
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

          {/* Plans. Suraksha is the recommended middle option on purpose. */}
          <section>
            <Stack gap="md">
              <H2>Plans</H2>
              <Muted>
                A one-off test is available too, but monitoring an elderly parent is not a
                one-off problem — so the plans are what we lead with.
              </Muted>
              <div className="grid gap-5 md:grid-cols-3">
                {plans.map((plan) => (
                  <Card
                    key={plan.id}
                    tone={plan.isRecommended ? 'primary' : 'surface'}
                    className={plan.isRecommended ? 'ring-2 ring-[var(--color-primary)]' : ''}
                  >
                    <Stack gap="sm">
                      {plan.isRecommended && <Badge tone="primary">Most families choose this</Badge>}
                      <H3>{plan.name}</H3>
                      <p className="text-[var(--color-ink-soft)]">{plan.tagline}</p>
                      <p className="text-[var(--text-h2)] font-bold">
                        {formatINR(plan.pricePaise)}
                        <span className="text-[var(--text-small)] font-normal text-[var(--color-ink-faint)]">
                          {' '}
                          / month
                        </span>
                      </p>
                      <Muted>
                        Or {formatINR(plan.annualPricePaise)} a year — two months free.
                      </Muted>
                    </Stack>
                  </Card>
                ))}
              </div>
              <ButtonLink href="/plans" tone="secondary">
                Compare what each plan includes
              </ButtonLink>
            </Stack>
          </section>

          {/* Credibility comes from the accredited partner, and we say whose it
              is rather than implying it is ours. */}
          {anchorLab?.accreditation && (
            <Card tone="sunken">
              <Stack gap="sm">
                <H3>Who actually runs your tests</H3>
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

          {zone && (
            <Card>
              <Stack gap="sm">
                <H3>Where we work</H3>
                <p>
                  {zone.name}, {zone.city} — a {zone.radiusKm} km radius around our partner
                  laboratory.
                </p>
                <Muted>
                  The radius is not caution, it is biology: every sample has to reach the lab
                  within two hours, and the same technician has to be able to keep visiting the
                  same families. If you are outside it we will put you on the waitlist rather
                  than promise something we cannot do well.
                </Muted>
              </Stack>
            </Card>
          )}

          <footer className="border-t-2 border-[var(--color-line)] pt-6">
            <Muted>
              {brand.legalEntity} · {brand.supportPhone} · {brand.disclaimer}
            </Muted>
          </footer>
        </Stack>
      </Page>
    </>
  );
}
