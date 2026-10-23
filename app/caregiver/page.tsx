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
import { Morph } from '@/components/morph';
import { Badge, ButtonLink, Card, Eyebrow, H2, H3, Metric, Page, Stack, type StatusTone } from '@/components/ui';
import { PhoneRequests } from '@/components/phone-requests';
import { firstName } from '@/lib/voice/scripts';

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
      className="tap-surface panel group flex min-h-24 flex-col justify-between gap-3 rounded-[var(--radius-card)] border p-3.5"
    >
      <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" className="text-[var(--color-ink-faint)] group-hover:text-[var(--color-ink)]">
        <path d={ICONS[icon]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-small leading-tight font-medium">{label}</span>
    </Link>
  );
}

/** Time until a visit, as an instrument reads it: 2d 06h, 14h 05m, 35m. */
function countdown(to: Date, now = new Date()) {
  const mins = Math.max(0, Math.round((to.getTime() - now.getTime()) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m`;
}

const BAND_READING: Record<Band, { value: string; tone: StatusTone }> = {
  GREEN: { value: 'In range', tone: 'green' },
  YELLOW: { value: 'Review', tone: 'yellow' },
  RED: { value: 'Doctor today', tone: 'red' },
};

/**
 * The dashboard: a status grid first (the next visit, the latest result,
 * the membership, the call we owe), then shortcuts, packages and detail. An
 * urgent result outranks all of it. Every shortcut leads somewhere the app
 * actually serves.
 */
export default async function CaregiverHome() {
  const { family } = await loadFamilyContext();
  if (!family) redirect('/caregiver/onboarding');
  if (family.patients.length === 0) redirect('/caregiver/onboarding');

  // Visits a parent (or the family) asked for on the phone, to confirm here.
  const phoneRequests = await db.voiceBookingRequest.findMany({
    where: { familyId: family.id, status: 'NEW', expiresAt: { gt: new Date() } },
    include: { patient: true },
    orderBy: { createdAt: 'asc' },
  });

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

  const band = latestReport ? BAND_READING[latestReport.overallBand as Band] : null;
  const call = pendingCall ? urgency(pendingCall.dueBy) : null;

  return (
    <Page>
      <div className="stagger flex flex-col gap-5">
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
              <p className="text-small text-[var(--color-ink-soft)]">
                We can’t tell you what the result means. Only a doctor can do that. The signed report is below.
              </p>
              <ButtonLink href={`/caregiver/reports/${openCritical.id}`} tone="danger">
                Open the report
              </ButtonLink>
            </Stack>
          </Card>
        )}

        {phoneRequests.length > 0 && (
          <PhoneRequests
            requests={phoneRequests.map((r) => ({
              id: r.id,
              who: r.patient ? firstName(r.patient.name) : 'Your parent',
              patientId: r.patientId,
              source: r.source,
              date: r.preferredDate,
              hour: r.windowStartHour,
              tests: r.testsRequested,
              addressNote: r.addressNote,
            }))}
          />
        )}

        {/* At a glance: four readings, each one the thing to know first. */}
        <section
          aria-label="At a glance"
          className="panel grid grid-cols-2 overflow-hidden rounded-[var(--radius-card-lg)] border [box-shadow:var(--shadow-card)] sm:grid-cols-4"
        >
          <Metric
            className="border-r border-b border-[var(--color-line)] p-4 sm:border-b-0"
            label="Upcoming"
            value={live ? (live.status === 'ARRIVED' ? 'At door' : 'En route') : next ? countdown(next.windowStart) : 'None'}
            tone={live ? 'green' : next ? 'info' : 'neutral'}
            live={!!live}
            sub={next ? `${next.patient.name.split(' ')[0]} · ${next.windowStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Nothing booked'}
          />
          <Metric
            className="border-b border-[var(--color-line)] p-4 sm:border-r sm:border-b-0"
            label="Latest result"
            value={band ? band.value : 'None yet'}
            tone={band ? band.tone : 'neutral'}
            sub={latestReport ? latestReport.patient.name.split(' ')[0] : 'After the first visit'}
          />
          <Metric
            className="border-r border-[var(--color-line)] p-4"
            label="Medwyn One"
            value={membership ? `${discount}%` : 'Not joined'}
            unit={membership ? 'off' : undefined}
            tone={membership ? 'green' : 'neutral'}
            sub={membership ? 'Free collection' : 'Paying per test'}
          />
          <Metric
            className="p-4"
            label="Our call to you"
            value={call ? (call.level === 'OVERDUE' ? 'Overdue' : `${Math.max(0, Math.round(call.hoursRemaining))}h`) : 'None'}
            tone={call ? (call.level === 'SCHEDULED' ? 'info' : 'yellow') : 'neutral'}
            sub={call ? 'Within 24h of a report' : 'Nothing owed'}
          />
        </section>

        {/* Finds labs for the parent's home; a test name gets a link to tests too.
            The pin asks for the phone's location, which stays on the phone. */}
        <form action="/caregiver/labs" role="search" className="relative">
          <label htmlFor="home-search" className="sr-only">
            Search labs near you
          </label>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            width="18"
            height="18"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--color-ink-faint)]"
          >
            <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            id="home-search"
            name="q"
            type="search"
            placeholder="Search labs near you…"
            enterKeyHint="search"
            className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--field-bg)] pr-16 pl-11 text-base placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-ink-faint)] focus:outline-none"
          />
          <Link
            href="/caregiver/labs?near=1"
            aria-label="Labs near my current location"
            className="absolute top-1/2 right-1 inline-flex h-11 w-12 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
          >
            <svg aria-hidden viewBox="0 0 24 24" width="20" height="20">
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21z M12 12.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </Link>
        </form>

        <nav aria-label="Shortcuts" className="grid grid-cols-3 gap-2.5">
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
          <section aria-label="Packages" className="snap-row -mx-5 px-5 pb-1 sm:-mx-8 sm:px-8">
            {!membership && (
              <Link
                href="/caregiver/membership"
                className="brand-surface tap-surface flex min-h-44 flex-col justify-between gap-6 rounded-[var(--radius-card-lg)] border border-[var(--color-line-strong)] p-5"
              >
                <span className="flex items-center justify-between gap-3">
                  <Eyebrow>Membership</Eyebrow>
                  <span className="reading text-small text-[var(--color-ink-faint)]">₹499 / mo</span>
                </span>
                <span className="brand-content flex flex-col gap-1.5">
                  <span className="text-h3 font-semibold">Medwyn One</span>
                  <span className="text-small text-[var(--color-ink-soft)]">30% off every test and free home collection. From ₹499 a month.</span>
                </span>
                <span className="btn-glow inline-flex min-h-11 items-center self-start rounded-[var(--radius-control)] px-4 text-small font-medium !text-[var(--color-primary-ink)]">
                  Join now
                </span>
              </Link>
            )}
            {packages.map((p) => (
              <Link
                key={p.key}
                href={`/caregiver/book?item=${encodeURIComponent(p.key)}`}
                className="brand-surface tap-surface flex min-h-44 flex-col justify-between gap-6 rounded-[var(--radius-card-lg)] border border-[var(--color-line-strong)] p-5"
              >
                <span className="flex items-center justify-between gap-3">
                  <Eyebrow>Package · {p.includes.length} tests</Eyebrow>
                  {discount > 0 && <span className="eyebrow !text-[var(--color-green)]">−{discount}%</span>}
                </span>
                <span className="brand-content flex flex-col gap-1.5">
                  <span className="text-h3 font-semibold">{p.name}</span>
                  <span className="reading flex items-baseline gap-2 text-lead">
                    {discount > 0 ? (
                      <>
                        <strong className="font-medium">{formatINR(memberPrice(p.pricePaise, discount))}</strong>{' '}
                        <s className="text-small text-[var(--color-ink-faint)]">{formatINR(p.pricePaise)}</s>
                      </>
                    ) : (
                      <strong className="font-medium">{formatINR(p.pricePaise)}</strong>
                    )}
                  </span>
                </span>
                <span className="btn-glow inline-flex min-h-11 items-center self-start rounded-[var(--radius-control)] px-4 text-small font-medium !text-[var(--color-primary-ink)]">
                  Book now
                </span>
              </Link>
            ))}
          </section>
        )}

        {next && (
          <Card elevated>
            <Stack gap="md">
              <div className="flex items-center justify-between gap-3">
                <Badge tone={live && live.id === next.id ? 'green' : 'primary'}>Next visit</Badge>
                <span className="reading text-small text-[var(--color-ink-faint)]">{countdown(next.windowStart)}</span>
              </div>
              <H2 className="text-h3">
                {next.patient.name} · {dateLabel(next.windowStart)}
              </H2>
              <p className="reading text-lead">
                {timeLabel(next.windowStart)} <span className="text-[var(--color-ink-faint)]">→</span>{' '}
                {timeLabel(next.windowEnd)}
              </p>
              <p className="sr-only">
                Between {timeLabel(next.windowStart)} and {timeLabel(next.windowEnd)}
              </p>
              {next.technician && (
                <p className="text-[var(--color-ink-soft)]">
                  <strong className="font-medium text-[var(--color-ink)]">{next.technician.user.name}</strong> is coming
                  {sameTechnicianAsLastTime ? ' again.' : '.'}
                </p>
              )}
              {next.fastingRequired && (
                <Card tone="yellow" className="p-4">
                  <p className="text-small">{fastingInstruction(next.fastingHours, next.windowStart)}</p>
                </Card>
              )}
              <div className="flex flex-wrap gap-2.5">
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
              <p className="text-[var(--color-ink-soft)]">
                We call every family within 24 hours of a report. Yours is{' '}
                {urgency(pendingCall.dueBy).label.toLowerCase()}.
              </p>
            </Stack>
          </Card>
        )}

        {latestReport && (
          <Link
            href={`/caregiver/reports/${latestReport.id}`}
            className="tap-surface block rounded-[var(--radius-card-lg)]"
            aria-label={`Latest report: ${latestReport.patient.name}. Open it`}
          >
            <Morph name={`report-${latestReport.id}`}>
              <div className="panel flex flex-col gap-3 rounded-[var(--radius-card-lg)] border p-5">
                <div className="flex items-center justify-between gap-3">
                  <Eyebrow>Latest report</Eyebrow>
                  <span className="reading text-small text-[var(--color-ink-faint)]">
                    {latestReport.releasedAt?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <H3>{latestReport.patient.name}</H3>
                <p className="text-small text-[var(--color-ink-faint)]">Processed at {latestReport.lab.name}</p>
                <div className="flex items-center justify-between gap-3">
                  <OverallBandChip band={latestReport.overallBand as Band} />
                  <span className="text-small font-medium">Open it →</span>
                </div>
              </div>
            </Morph>
          </Link>
        )}
      </div>
    </Page>
  );
}
