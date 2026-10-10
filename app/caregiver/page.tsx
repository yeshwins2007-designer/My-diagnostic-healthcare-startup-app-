import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  loadFamilyContext,
  loadUpcomingVisits,
  loadReportTimeline,
  loadPreviousTechnicianId,
} from '@/lib/queries/caregiver';
import { labForFamily, loadCatalog, loadMembership } from '@/lib/queries/catalog';
import { db } from '@/lib/db';
import { formatINR } from '@/lib/money';
import { memberPrice } from '@/lib/pricing';
import { fastingInstruction } from '@/lib/sop/visitWindow';
import { urgency } from '@/lib/sop/followUp';
import { OverallBandChip, type Band } from '@/components/band-chip';
import { BrandWaves } from '@/components/brand-mark';
import { Badge, ButtonLink, Card, H2, H3, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

function timeLabel(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function dateLabel(d: Date) {
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

const ICONS = {
  package: 'M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4 8-4M12 12v8',
  tube: 'M9 3h6M10 3v12.5a2 2 0 0 0 4 0V3M10 10h4',
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  report: 'M7 3.5h7.5L19 8v12.5H7zM14.5 3.5V8H19M10 12.5h6M10 16.5h6',
  pin: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z',
  calendar: 'M4 7h16v13H4zM4 11h16M8.5 4v5M15.5 4v5',
} as const;

function Tile({ href, label, icon }: { href: string; label: string; icon: keyof typeof ICONS }) {
  return (
    <Link
      href={href}
      className="tap-surface glass flex aspect-square min-h-[var(--size-touch)] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 p-2 text-center"
    >
      <svg aria-hidden viewBox="0 0 24 24" width="34" height="34" className="text-[var(--color-primary)]">
        <path d={ICONS[icon]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-small leading-tight font-semibold">{label}</span>
    </Link>
  );
}

/**
 * The dashboard, after the reference design: search, six shortcuts, package
 * banners - and above all of it, an urgent result if there is one. Every
 * shortcut leads somewhere the app actually serves.
 */
export default async function CaregiverHome() {
  const { family } = await loadFamilyContext();
  if (!family) redirect('/caregiver/onboarding');
  if (family.patients.length === 0) redirect('/caregiver/onboarding');

  const labId = await labForFamily(family.id);
  const [visits, reports, pendingCall, membership, catalog] = await Promise.all([
    loadUpcomingVisits(family.id),
    loadReportTimeline(family.id),
    db.followUpCall.findFirst({
      where: { status: 'PENDING', booking: { familyId: family.id } },
      orderBy: { dueBy: 'asc' },
    }),
    loadMembership(family.id),
    loadCatalog(labId),
  ]);

  const next = visits[0];
  const live = visits.find((v) => v.status === 'EN_ROUTE' || v.status === 'ARRIVED');
  const sameTechnicianAsLastTime =
    !!next?.technicianId &&
    (await loadPreviousTechnicianId(next.patientId, next.windowStart)) === next.technicianId;
  const latestReport = reports[0];
  const openCritical = reports.find((r) => r.criticals.some((c) => c.status !== 'CLOSED'));
  const packages = catalog.filter((c) => c.kind === 'panel');
  const discount = membership?.plan.testDiscountPercent ?? 0;

  return (
    <Page>
      <Stack gap="lg">
        <form action="/caregiver/book" role="search" className="relative">
          <label htmlFor="home-search" className="sr-only">
            Search tests and packages
          </label>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            width="22"
            height="22"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--color-ink-soft)]"
          >
            <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            id="home-search"
            name="q"
            type="search"
            placeholder="Search tests, packages…"
            className="min-h-[var(--size-touch)] w-full rounded-full border-2 border-[var(--card-border)] bg-[var(--field-bg)] pr-4 pl-12 text-base placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-primary)]"
          />
        </form>

        {/* A flagged result outranks everything else on the screen. */}
        {openCritical && (
          <Card tone="red">
            <Stack gap="sm">
              <Badge tone="red">Needs urgent medical attention</Badge>
              <H2 className="text-h3">{openCritical.patient.name}’s laboratory flagged a result</H2>
              <p>
                Please contact their doctor today. We have already called you, and we will call
                again to check that you reached someone.
              </p>
              <Muted>
                We cannot explain what the result means — only a doctor can. The signed report
                is below.
              </Muted>
              <ButtonLink href={`/caregiver/reports/${openCritical.id}`} tone="danger">
                Open the report
              </ButtonLink>
            </Stack>
          </Card>
        )}

        <nav aria-label="Shortcuts" className="grid grid-cols-3 gap-3">
          <Tile href="/caregiver/book?kind=panel" label="Health packages" icon="package" />
          <Tile href="/caregiver/book?kind=test" label="Blood tests" icon="tube" />
          <Tile href="/caregiver/book" label="Home visit" icon="home" />
          <Tile href="/caregiver/reports" label="Reports" icon="report" />
          {live ? (
            <Tile href={`/caregiver/track/${live.id}`} label="Track visit" icon="pin" />
          ) : (
            <Tile href="/caregiver/visits" label="Bookings" icon="calendar" />
          )}
          <Tile href="/caregiver/membership" label="Medwyn One" icon="star" />
        </nav>

        {(packages.length > 0 || !membership) && (
          <section aria-label="Packages" className="snap-row -mx-5 px-5 pb-1">
            {!membership && (
              <Link
                href="/caregiver/membership"
                className="brand-surface tap-surface relative flex min-h-48 flex-col justify-end gap-2 overflow-hidden rounded-[var(--radius-card-lg)] border-2 border-[var(--card-border)] p-5 [box-shadow:var(--glow)]"
              >
                <BrandWaves />
                <span className="brand-content flex flex-col gap-2">
                  <span className="text-h3 font-bold">Medwyn One</span>
                  <span>30% off every test and free home collection. From ₹499 a month.</span>
                  <span className="btn-glow mt-1 inline-flex min-h-12 items-center self-start rounded-full px-5 font-semibold !text-[var(--color-primary-ink)]">
                    Join now
                  </span>
                </span>
              </Link>
            )}
            {packages.map((p) => (
              <Link
                key={p.key}
                href={`/caregiver/book?item=${encodeURIComponent(p.key)}`}
                className="brand-surface tap-surface relative flex min-h-48 flex-col justify-end gap-2 overflow-hidden rounded-[var(--radius-card-lg)] border-2 border-[var(--card-border)] p-5 [box-shadow:var(--glow)]"
              >
                <BrandWaves />
                <span className="brand-content flex flex-col gap-2">
                  <span className="text-h3 font-bold">{p.name}</span>
                  <span>
                    {p.includes.length} tests ·{' '}
                    {discount > 0 ? (
                      <>
                        <strong>{formatINR(memberPrice(p.pricePaise, discount))}</strong>{' '}
                        <s className="opacity-80">{formatINR(p.pricePaise)}</s>
                      </>
                    ) : (
                      <strong>{formatINR(p.pricePaise)}</strong>
                    )}
                  </span>
                  <span className="btn-glow mt-1 inline-flex min-h-12 items-center self-start rounded-full px-5 font-semibold !text-[var(--color-primary-ink)]">
                    Book now
                  </span>
                </span>
              </Link>
            ))}
          </section>
        )}

        {next && (
          <Card tone="primary">
            <Stack gap="md">
              <Badge tone="primary">Next visit</Badge>
              <H2 className="text-h3">
                {next.patient.name} · {dateLabel(next.windowStart)}
              </H2>
              <p className="text-lead">
                Between <strong>{timeLabel(next.windowStart)}</strong> and{' '}
                <strong>{timeLabel(next.windowEnd)}</strong>
              </p>
              {next.technician && (
                <p>
                  <strong>{next.technician.user.name}</strong> is coming
                  {sameTechnicianAsLastTime ? ' — the same technician as last time.' : '.'}
                </p>
              )}
              {next.fastingRequired && (
                <Card tone="yellow" className="p-4">
                  <p>{fastingInstruction(next.fastingHours, next.windowStart)}</p>
                </Card>
              )}
              <div className="flex flex-wrap gap-3">
                {live && live.id === next.id && (
                  <ButtonLink href={`/caregiver/track/${next.id}`}>See where they are</ButtonLink>
                )}
                <ButtonLink href="/caregiver/visits" tone="secondary">
                  All bookings
                </ButtonLink>
              </div>
            </Stack>
          </Card>
        )}

        {pendingCall && (
          <Card tone="info">
            <Stack gap="sm">
              <H3>We owe you a call</H3>
              <p>
                We call every family within 24 hours of a report. Yours is{' '}
                {urgency(pendingCall.dueBy).label.toLowerCase()}.
              </p>
            </Stack>
          </Card>
        )}

        {latestReport && (
          <Card>
            <Stack gap="sm">
              <H3>Latest report</H3>
              <p>
                {latestReport.patient.name} ·{' '}
                {latestReport.releasedAt?.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}{' '}
                · processed at {latestReport.lab.name}
              </p>
              <OverallBandChip band={latestReport.overallBand as Band} />
              <Link
                href={`/caregiver/reports/${latestReport.id}`}
                className="inline-flex min-h-12 items-center self-start font-semibold text-[var(--color-primary)] underline"
              >
                Open it
              </Link>
            </Stack>
          </Card>
        )}
      </Stack>
    </Page>
  );
}
