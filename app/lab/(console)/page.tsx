import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { DISCIPLINE_LABELS, type Discipline } from '@/lib/enums';
import { formatINR } from '@/lib/money';
import { parseScope } from '@/lib/sop/labRouting';
import { readClock } from '@/lib/sop/sampleClock';
import { autoAcceptExpired, DECISION_WINDOW_MINUTES, labPayout, REJECT_REASONS } from '@/lib/orders/lab-orders';
import { REFERENCE_RANGES, testsOfOrder } from '@/lib/orders/results';
import { istDay, istRelativeDay, istTime } from '@/lib/orders/ist';
import { loadTerminal, partnerMembership } from '@/lib/queries/partner';
import { IncomingOrders, type IncomingOrder } from '@/components/partner/incoming-orders';
import { SampleScanner } from '@/components/partner/sample-scanner';
import { ResultsForm } from '@/components/partner/results-form';
import { PdfUpload } from '@/components/partner/pdf-upload';
import { Badge, Card, cx, DataRow, H3, Lead, Metric, Muted, Stack, StatusDot } from '@/components/ui';

export const metadata: Metadata = { title: 'Order terminal' };
export const dynamic = 'force-dynamic';

const STATUS_COPY: Record<string, { tone: 'green' | 'yellow' | 'red' | 'info'; text: string }> = {
  SUBMITTED: {
    tone: 'info',
    text: 'Your application is with our team. A person checks every certificate against the NABL public directory before any sample is routed to you — usually within two working days.',
  },
  UNDER_REVIEW: {
    tone: 'info',
    text: 'We are working through the verification checklist now.',
  },
  VERIFIED: {
    tone: 'yellow',
    text: 'Verified. We will activate you once the service agreement is signed.',
  },
  ACTIVE: { tone: 'green', text: 'Active. Samples are being routed to you.' },
  SUSPENDED: {
    tone: 'red',
    text: 'Suspended. No samples are being routed until this is resolved.',
  },
  REJECTED: { tone: 'red', text: 'This application was not accepted.' },
};

const SIGNERS = ['OWNER', 'MANAGER'];

/** What the lab should know about each stage, in its words. */
const STAGE: Record<string, { label: string; tone: 'info' | 'yellow' | 'green' | 'neutral' }> = {
  SCHEDULED: { label: 'Collection booked', tone: 'neutral' },
  EN_ROUTE: { label: 'Technician on the way', tone: 'info' },
  ARRIVED: { label: 'Collecting now', tone: 'info' },
  COLLECTED: { label: 'Sample collected', tone: 'info' },
  IN_TRANSIT: { label: 'Sample on its way', tone: 'info' },
  AT_LAB: { label: 'Handed over: scan to receive', tone: 'yellow' },
  PROCESSING: { label: 'Processing: enter results', tone: 'yellow' },
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join('');
}

function slot(start: Date, end: Date): string {
  return `${istTime(start)}–${istTime(end)}`;
}

export default async function LabTerminal({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const { submitted } = await searchParams;
  const user = await requirePageRole('LAB');
  const membership = await partnerMembership(user.id);
  if (!membership) redirect('/lab/apply');
  const lab = membership.lab;

  if (lab.status !== 'ACTIVE') return <NotActive lab={lab} submitted={!!submitted} />;

  const now = new Date();
  // Orders whose decision window has closed count as accepted.
  await autoAcceptExpired(lab.id, now);
  const { pending, inProgress, completed, rateCard, volume, earnedToday } = await loadTerminal(lab.id, now);
  const canSign = SIGNERS.includes(membership.role);

  const incoming: IncomingOrder[] = pending.map((b) => ({
    id: b.id,
    reference: b.reference,
    patient: `${initials(b.patient.name)} · ${b.patient.ageYears} · ${b.patient.sex.charAt(0)}`,
    area: `${b.address.city} ${b.address.pincode}`,
    visitDay: istRelativeDay(b.windowStart, now),
    visitWindow: slot(b.windowStart, b.windowEnd),
    tests: testsOfOrder(b.items).map((t) => ({ code: t.code, name: t.name, tube: t.tubeType })),
    fasting: b.fastingRequired ? `Fasting sample · ${b.fastingHours} h` : null,
    payout: formatINR(labPayout(b.items, rateCard).paise),
    decideBy: b.labDecisionDeadline ? istTime(b.labDecisionDeadline) : '—',
    minutesLeft: b.labDecisionDeadline ? Math.max(0, Math.ceil((b.labDecisionDeadline.getTime() - now.getTime()) / 60_000)) : 0,
  }));
  const processing = inProgress.filter((b) => b.status === 'PROCESSING').length;
  const pathologist = {
    name: lab.accreditation?.supervisingPathologistName ?? '',
    reg: lab.accreditation?.supervisingPathologistReg ?? '',
  };

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Order terminal</span>
          <h1 className="text-h2 font-semibold tracking-tight">Orders</h1>
        </div>
        <span className="reading text-small text-[var(--color-ink-faint)]">
          {istDay(now)} · updated {istTime(now)} IST
        </span>
      </div>

      <section aria-label="Today" className="panel grid grid-cols-2 gap-5 rounded-[var(--radius-card)] border p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Awaiting decision" value={String(incoming.length)} tone={incoming.length > 0 ? 'yellow' : 'neutral'} live={incoming.length > 0} />
        <Metric label="In progress" value={String(inProgress.length)} tone="info" />
        <Metric label="Ready for results" value={String(processing)} tone={processing > 0 ? 'yellow' : 'neutral'} />
        <Metric
          label="Capacity today"
          value={`${volume}/${lab.capacityCeiling}`}
          tone={volume >= lab.capacityCeiling ? 'red' : volume >= lab.capacityCeiling * 0.8 ? 'yellow' : 'green'}
          sub="booked against your agreed ceiling"
        />
        <Metric label="Earned today" value={formatINR(earnedToday)} sub={<Link href="/lab/earnings" className="inline-flex min-h-11 items-center underline">Earnings</Link>} />
      </section>

      <SampleScanner />

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <IncomingOrders
          orders={incoming}
          canReject={canSign}
          reasons={REJECT_REASONS}
          windowMinutes={DECISION_WINDOW_MINUTES}
        />

        <section aria-labelledby="progress-heading" className="flex flex-col gap-3">
          <header className="flex items-center gap-2.5">
            <h2 id="progress-heading" className="text-[0.9375rem] font-semibold tracking-tight">
              In progress
            </h2>
            <span className="reading rounded-full px-2 py-0.5 text-[0.75rem] text-[var(--color-ink-faint)]">{inProgress.length}</span>
          </header>
          {inProgress.length === 0 ? (
            <Empty text="Accepted orders move here and follow the sample: collection, transit with its two-hour clock, your intake desk, then results." />
          ) : (
            <ol className="flex flex-col gap-3">
              {inProgress.map((b) => {
                const stage = STAGE[b.status] ?? { label: b.status.toLowerCase(), tone: 'neutral' as const };
                const tests = testsOfOrder(b.items);
                const doc = b.documents[0];
                return (
                  <li key={b.id} data-order={b.reference} className="panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="reading text-[1.0625rem] font-medium">{b.reference}</span>
                        <span className="text-small text-[var(--color-ink-soft)]">
                          {b.patient.name} · {b.patient.ageYears} · {b.patient.sex.charAt(0)}
                        </span>
                      </div>
                      <Badge tone={stage.tone}>{stage.label}</Badge>
                    </div>
                    <p className="text-small text-[var(--color-ink-soft)]">
                      <span className="reading">{istRelativeDay(b.windowStart, now)} {slot(b.windowStart, b.windowEnd)}</span>
                      {' · '}
                      {b.technician?.user.name ?? 'technician being assigned'}
                    </p>
                    <p className="flex flex-wrap gap-1.5">
                      {tests.map((t) => (
                        <span key={t.id} className="reading rounded-[6px] border border-[var(--color-line-strong)] px-1.5 py-0.5 text-[0.75rem] text-[var(--color-ink-soft)]">
                          {t.code}
                        </span>
                      ))}
                    </p>

                    {b.specimens.length > 0 && (
                      <ul className="flex flex-col gap-2" aria-label="Samples">
                        {b.specimens.map((s) => {
                          const clock = readClock({ clockStartsAt: s.clockStartsAt, intakeAt: s.intakeAt, now });
                          const tone = clock.state === 'BREACHED' ? 'red' : clock.state === 'AMBER' ? 'yellow' : 'green';
                          const cold = s.coldChainLogs[0];
                          return (
                            <li key={s.id} className="flex flex-col gap-1 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] px-3 py-2 text-small">
                              <span className="flex flex-wrap items-center justify-between gap-2">
                                <span className="reading font-medium">{s.barcode}</span>
                                <span className={cx('flex items-center gap-1.5', tone === 'red' ? 'text-[var(--color-red)]' : tone === 'yellow' ? 'text-[var(--color-yellow)]' : 'text-[var(--color-ink-soft)]')}>
                                  <StatusDot tone={tone} live={!s.intakeAt && !!s.clockStartsAt} />
                                  {clock.label}
                                </span>
                              </span>
                              <span className="text-[var(--color-ink-faint)]">
                                {s.tubeType} · {s.identifier1} / {s.identifier2}
                                {cold ? ` · ${cold.temperatureC.toFixed(1)} °C${cold.isBreach ? ' (out of range)' : ''}` : ''}
                                {' · '}
                                {s.status.toLowerCase()}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {b.status === 'PROCESSING' && (
                      <details className="group rounded-[var(--radius-control)] border border-[var(--color-line-strong)]" open={inProgress.length <= 3}>
                        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 font-medium">
                          Enter results
                          <span aria-hidden className="text-[var(--color-ink-faint)] group-open:rotate-180">⌄</span>
                        </summary>
                        <div className="border-t border-[var(--color-line)] p-3">
                          <ResultsForm
                            bookingId={b.id}
                            reference={b.reference}
                            tests={tests.map((t) => {
                              const r = REFERENCE_RANGES[t.code];
                              return {
                                code: t.code,
                                name: t.name,
                                unit: r?.unit ?? '',
                                range: r && r.refLow !== null && r.refHigh !== null ? `${r.refLow}–${r.refHigh}` : null,
                              };
                            })}
                            pathologistName={pathologist.name}
                            pathologistReg={pathologist.reg}
                            canSign={canSign}
                          />
                        </div>
                      </details>
                    )}

                    <PdfUpload
                      bookingId={b.id}
                      reference={b.reference}
                      existing={doc ? { fileName: doc.fileName, sizeBytes: doc.sizeBytes, uploadedAt: doc.updatedAt.toISOString() } : null}
                      enabled={b.status === 'PROCESSING' && canSign}
                      disabledReason={
                        !canSign
                          ? 'An owner or a manager uploads the signed report.'
                          : 'Opens once the sample is received and processing starts.'
                      }
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section aria-labelledby="done-heading" className="flex flex-col gap-3">
          <header className="flex items-center gap-2.5">
            <h2 id="done-heading" className="text-[0.9375rem] font-semibold tracking-tight">
              Completed
            </h2>
            <span className="reading rounded-full px-2 py-0.5 text-[0.75rem] text-[var(--color-ink-faint)]">{completed.length}</span>
            <span className="text-small text-[var(--color-ink-faint)]">last 7 days</span>
          </header>
          {completed.length === 0 ? (
            <Empty text="Signed reports land here with what each one pays you. A MEDWYN coordinator checks the identifiers before anything reaches the family." />
          ) : (
            <ol className="flex flex-col gap-3">
              {completed.map((b) => {
                const report = b.reports[0];
                const released = report?.status === 'RELEASED';
                const doc = b.documents[0];
                const band = report?.overallBand;
                return (
                  <li key={b.id} data-order={b.reference} className="panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="reading text-[1.0625rem] font-medium">{b.reference}</span>
                        <span className="text-small text-[var(--color-ink-soft)]">{b.patient.name}</span>
                      </div>
                      <span className="reading text-[1.0625rem] font-medium">{formatINR(labPayout(b.items, rateCard).paise)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={released ? 'green' : 'info'}>{released ? 'Released to family' : 'Awaiting MEDWYN review'}</Badge>
                      {band && (
                        <Badge tone={band === 'RED' ? 'red' : band === 'YELLOW' ? 'yellow' : 'green'}>
                          {band === 'RED' ? 'Critical value' : band === 'YELLOW' ? 'Outside range' : 'Within range'}
                        </Badge>
                      )}
                    </div>
                    {report?.signedAt && (
                      <p className="reading text-small text-[var(--color-ink-faint)]">
                        Signed {istRelativeDay(report.signedAt, now)} {istTime(report.signedAt)}
                      </p>
                    )}
                    {released ? (
                      doc && (
                        <a href={`/api/lab/orders/${b.id}/report-pdf`} target="_blank" rel="noopener" className="text-small font-medium underline">
                          {doc.fileName}
                        </a>
                      )
                    ) : (
                      <PdfUpload
                        bookingId={b.id}
                        reference={b.reference}
                        existing={doc ? { fileName: doc.fileName, sizeBytes: doc.sizeBytes, uploadedAt: doc.updatedAt.toISOString() } : null}
                        enabled={b.status === 'REPORTED' && canSign}
                        disabledReason="An owner or a manager uploads the signed report."
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] p-5 text-small text-[var(--color-ink-faint)]">
      {text}
    </div>
  );
}

type PartnerLab = NonNullable<Awaited<ReturnType<typeof partnerMembership>>>['lab'];

/** Before activation: where the application stands, and the accredited scope. */
function NotActive({ lab, submitted }: { lab: PartnerLab; submitted: boolean }) {
  const status = STATUS_COPY[lab.status] ?? STATUS_COPY.SUBMITTED;
  const scope = lab.accreditation ? parseScope(lab.accreditation.scope) : [];
  const daysToExpiry = lab.accreditation
    ? Math.ceil((lab.accreditation.validUntil.getTime() - Date.now()) / 86_400_000)
    : 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 lg:pt-10">
      <Stack gap="lg">
        <Stack gap="sm">
          <h1 className="text-h1 font-semibold tracking-tight">{lab.name}</h1>
          <Lead>{status.text}</Lead>
          <div className="flex flex-wrap gap-2">
            <Badge tone={status.tone}>{lab.status.replace(/_/g, ' ').toLowerCase()}</Badge>
            {lab.accreditation && (
              <Badge tone={daysToExpiry <= 60 ? 'yellow' : 'neutral'}>
                {lab.accreditation.certificateNumber} · {daysToExpiry} days to renewal
              </Badge>
            )}
          </div>
        </Stack>

        {submitted && (
          <Card tone="info">
            <Stack gap="sm">
              <H3>Application received</H3>
              <p>
                Thank you. Registering is an application, not an activation — that is deliberate.
                A person verifies your certificate, your scope and your address against the NABL
                directory before we send you a single human sample.
              </p>
            </Stack>
          </Card>
        )}

        {lab.statusReason && (
          <Card tone="red">
            <p>{lab.statusReason}</p>
          </Card>
        )}

        {lab.accreditation && (
          <Card>
            <Stack gap="sm">
              <H3>Your accredited scope</H3>
              <div className="flex flex-wrap gap-2">
                {scope.map((d) => (
                  <Badge key={d} tone="primary">
                    {DISCIPLINE_LABELS[d as Discipline] ?? d}
                  </Badge>
                ))}
              </div>
              <Muted>
                We only route tests whose discipline appears here. If your certificate covers more
                than this list, tell us — an incomplete scope means less work routed to you, not
                more.
              </Muted>
              <DataRow
                label="Supervising pathologist"
                value={`${lab.accreditation.supervisingPathologistName} · ${lab.accreditation.supervisingPathologistReg}`}
              />
              {lab.agreements[0] && (
                <DataRow
                  label="Service agreement"
                  value={
                    <Link href="/lab/agreement" className="inline-flex min-h-12 items-center underline">
                      version {lab.agreements[0].version} · {lab.agreements[0].status.toLowerCase()}
                    </Link>
                  }
                />
              )}
            </Stack>
          </Card>
        )}

        <Card tone="sunken">
          <Stack gap="sm">
            <H3>What opens when you are active</H3>
            <Muted>
              The order terminal (new orders with a chime, accept or reject within {DECISION_WINDOW_MINUTES} minutes), the
              intake scanner, results entry with your signed PDF, earnings at your rate card, and
              your test catalog.
            </Muted>
          </Stack>
        </Card>
      </Stack>
    </main>
  );
}
