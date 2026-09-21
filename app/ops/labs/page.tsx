import type { Metadata } from 'next';
import { db } from '@/lib/db';
import {
  ACCREDITATION_CHECK_LABELS,
  AccreditationCheckKey,
  DISCIPLINE_LABELS,
  type Discipline,
} from '@/lib/enums';
import { parseScope, validateCertificateNumber } from '@/lib/sop/labRouting';
import { isRefusal } from '@/lib/sop/types';
import { LabVerificationPanel } from '@/components/lab-verification-panel';
import {
  Badge,
  Card,
  DataRow,
  EmptyState,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Lab verification' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'green' | 'yellow' | 'red' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  VERIFIED: 'yellow',
  ACTIVE: 'green',
  SUSPENDED: 'red',
  REJECTED: 'red',
};

/**
 * NABL verification.
 *
 * Registration is an application, not an activation. NABL publishes no
 * verification API, so this is deliberately structured evidence plus human
 * sign-off plus automated expiry — and the screen says so rather than
 * implying a machine checked something it did not.
 */
export default async function OpsLabsPage() {
  const labs = await db.lab.findMany({
    orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
    include: {
      accreditation: { include: { checks: { include: { checkedBy: true } } } },
      agreements: { where: { status: 'SIGNED' }, take: 1 },
      _count: { select: { bookings: true } },
    },
  });

  const now = new Date();

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Partner laboratory verification</H1>
          <Lead>
            A sample is never routed to a lab that is not ACTIVE, and a lab only becomes ACTIVE
            when a person has cleared all seven checks below.
          </Lead>
          <Card tone="info">
            <Muted>
              NABL does not publish a verification API. Every check here is a human confirming
              structured evidence against the NABL public directory and the certificate itself.
              The software’s job is to make sure none of them can be skipped, and to suspend a
              lab automatically the day its accreditation expires.
            </Muted>
          </Card>
        </Stack>

        {labs.length === 0 ? (
          <EmptyState title="No laboratories yet" body="Applications appear here as they arrive." />
        ) : (
          <Stack gap="lg">
            {labs.map((lab) => {
              const acc = lab.accreditation;
              const certificate = acc ? validateCertificateNumber(acc.certificateNumber) : null;
              const scope = acc ? parseScope(acc.scope) : [];
              const daysToExpiry = acc
                ? Math.ceil((acc.validUntil.getTime() - now.getTime()) / 86_400_000)
                : 0;
              const passedKeys = new Set(
                acc?.checks.filter((c) => c.passed).map((c) => c.checkKey) ?? [],
              );
              const remaining = AccreditationCheckKey.values.filter((k) => !passedKeys.has(k));

              return (
                <Card key={lab.id} tone={lab.status === 'ACTIVE' ? 'surface' : 'sunken'}>
                  <Stack gap="md">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <Stack gap="sm">
                        <H2 className="text-[var(--text-h3)]">{lab.name}</H2>
                        <Muted>
                          {lab.addressLine}, {lab.city} {lab.pincode} · {lab.contactName} ·{' '}
                          {lab.contactPhone}
                        </Muted>
                      </Stack>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={STATUS_TONE[lab.status] ?? 'neutral'}>
                          {lab.status.replace(/_/g, ' ').toLowerCase()}
                        </Badge>
                        {lab._count.bookings > 0 && (
                          <Badge>{lab._count.bookings} samples routed</Badge>
                        )}
                      </div>
                    </div>

                    {lab.statusReason && (
                      <p className="rounded-[var(--radius-control)] bg-[var(--color-red-wash)] p-3">
                        {lab.statusReason}
                      </p>
                    )}

                    {acc ? (
                      <>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <Stack gap="sm">
                            <H3 className="text-[var(--text-lead)]">Accreditation</H3>
                            <DataRow
                              label="Certificate number"
                              value={
                                <span className="font-mono">{acc.certificateNumber}</span>
                              }
                              tone={certificate && isRefusal(certificate) ? 'red' : 'green'}
                            />
                            <DataRow
                              label="Valid until"
                              value={acc.validUntil.toLocaleDateString('en-IN')}
                              tone={
                                daysToExpiry <= 0
                                  ? 'red'
                                  : daysToExpiry <= 60
                                    ? 'yellow'
                                    : 'green'
                              }
                            />
                            <DataRow
                              label="Supervising pathologist"
                              value={`${acc.supervisingPathologistName} (${acc.supervisingPathologistReg})`}
                            />
                            <DataRow
                              label="HFR facility id"
                              value={acc.hfrFacilityId ?? 'not supplied'}
                            />
                            <DataRow
                              label="Signed agreement on file"
                              value={lab.agreements.length > 0 ? 'yes' : 'no'}
                              tone={lab.agreements.length > 0 ? 'green' : 'red'}
                            />
                          </Stack>

                          <Stack gap="sm">
                            <H3 className="text-[var(--text-lead)]">Accredited scope</H3>
                            <div className="flex flex-wrap gap-2">
                              {scope.map((d) => (
                                <Badge key={d} tone="primary">
                                  {DISCIPLINE_LABELS[d as Discipline] ?? d}
                                </Badge>
                              ))}
                            </div>
                            <Muted>
                              Every booking checks the discipline of each test against this
                              list. It is what stops an HbA1c — Clinical Biochemistry — being
                              routed to a laboratory accredited only for Microbiology.
                            </Muted>
                          </Stack>
                        </div>

                        {certificate && isRefusal(certificate) && (
                          <div className="rounded-[var(--radius-control)] border-2 border-[var(--color-red)] bg-[var(--color-red-wash)] p-4">
                            <p className="font-semibold">{certificate.reason}</p>
                            <p className="text-[var(--text-small)]">{certificate.remedy}</p>
                          </div>
                        )}

                        <LabVerificationPanel
                          labId={lab.id}
                          labName={lab.name}
                          status={lab.status}
                          accreditationId={acc.id}
                          checks={AccreditationCheckKey.values.map((key) => {
                            const existing = acc.checks.find((c) => c.checkKey === key);
                            return {
                              key,
                              label: ACCREDITATION_CHECK_LABELS[key],
                              passed: existing?.passed ?? null,
                              note: existing?.note ?? '',
                              checkedBy: existing?.checkedBy.name ?? null,
                              checkedAt: existing?.checkedAt.toISOString() ?? null,
                            };
                          })}
                          remainingCount={remaining.length}
                        />
                      </>
                    ) : (
                      <Muted>No accreditation record has been submitted for this lab.</Muted>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
