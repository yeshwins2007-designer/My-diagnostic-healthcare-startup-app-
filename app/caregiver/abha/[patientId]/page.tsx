import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { providerMode, env } from '@/lib/env';
import { getAbdmProvider } from '@/lib/providers/abdm';
import { AbhaFlow } from '@/components/abha-flow';
import {
  Badge,
  ButtonLink,
  Card,
  DataRow,
  H1,
  H3,
  Lead,
  Muted,
  Page,
  SimulatedChip,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Health account (ABHA)' };
export const dynamic = 'force-dynamic';

/**
 * ABHA is optional and never blocks anything.
 *
 * Most 70–80 year olds do not have one, and gating home collection on a
 * digital health ID would exclude precisely the people this service exists
 * for. "Skip" therefore carries the same visual weight as the primary action.
 */
export default async function AbhaPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireRole('CAREGIVER');

  const patient = await db.patient.findFirst({
    where: { id: patientId, family: { members: { some: { userId: user.id } } } },
    include: {
      abhaAccount: {
        include: { consents: { orderBy: { createdAt: 'desc' } } },
      },
    },
  });

  if (!patient) notFound();

  // Prior records, where consent has been granted.
  const grantedConsent = patient.abhaAccount?.consents.find((c) => c.status === 'GRANTED');
  const history = grantedConsent
    ? await getAbdmProvider().fetchHealthRecords(grantedConsent.consentId)
    : [];

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>{patient.name}’s health account</H1>
          <Lead>
            An ABHA is India’s digital health account. It lets past reports from other hospitals
            and labs sit alongside ours, so a doctor sees the whole picture.
          </Lead>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">Completely optional</Badge>
            {providerMode.abdm === 'simulated' && <SimulatedChip what="ABDM" />}
            {providerMode.abdm === 'live' && env.ABDM_ENV === 'sandbox' && (
              <Badge tone="yellow">ABDM sandbox</Badge>
            )}
          </div>
        </Stack>

        {patient.abhaAccount ? (
          <Stack gap="md">
            <Card tone="green">
              <Stack gap="sm">
                <H3>Linked</H3>
                <DataRow
                  label="Health account address"
                  value={patient.abhaAccount.abhaAddress ?? '—'}
                />
                {/* The 14-digit number is deliberately secondary: it is not
                    something an 80-year-old should be asked to recognise. */}
                <DataRow
                  label="ABHA number"
                  value={
                    <span className="font-mono text-[var(--text-small)]">
                      {patient.abhaAccount.abhaNumber}
                    </span>
                  }
                />
                <DataRow
                  label="Linked on"
                  value={patient.abhaAccount.linkedAt?.toLocaleDateString('en-IN') ?? '—'}
                />
              </Stack>
            </Card>

            <AbhaFlow
              patientId={patient.id}
              patientName={patient.name}
              mode="LINKED"
              consents={patient.abhaAccount.consents.map((c) => ({
                consentId: c.consentId,
                status: c.status,
                hiTypes: c.hiTypes,
                expiresAt: c.expiresAt.toISOString(),
              }))}
            />

            {history.length > 0 && (
              <Card>
                <Stack gap="sm">
                  <H3>Past records from other providers</H3>
                  <Muted>
                    Pulled with {patient.name}’s consent through the ABDM consent manager. The
                    technician sees the conditions and medicines before each visit; the values
                    themselves are only ever read by you and your doctor.
                  </Muted>
                  {history.map((record) => (
                    <DataRow
                      key={record.careContextReference}
                      label={`${record.display} — ${record.source}`}
                      value={new Date(record.date).toLocaleDateString('en-IN')}
                    />
                  ))}
                </Stack>
              </Card>
            )}
          </Stack>
        ) : (
          <Stack gap="md">
            <Card tone="sunken">
              <Stack gap="sm">
                <H3>You do not need this to use MEDWYN</H3>
                <p>
                  Everything works exactly the same without it. Most people {patient.name}’s age
                  do not have an ABHA, and that has never stopped us collecting a sample or
                  delivering a report.
                </p>
                <Muted>
                  Adding one is useful if {patient.name} sees several doctors or has been in
                  hospital — it puts those records in one place.
                </Muted>
              </Stack>
            </Card>

            <AbhaFlow patientId={patient.id} patientName={patient.name} mode="NONE" consents={[]} />

            <ButtonLink href="/caregiver" tone="secondary" full>
              Skip for now — I can add this later
            </ButtonLink>
          </Stack>
        )}

        <Card tone="info">
          <Stack gap="sm">
            <H3>Two separate permissions</H3>
            <Muted>
              Your ABDM consent controls which health records move between providers, through the
              national consent manager. It is entirely separate from the permission you give us
              to collect a sample, store it and share the report with you — we never treat one as
              covering the other, and you can withdraw either without affecting the other.
            </Muted>
          </Stack>
        </Card>
      </Stack>
    </Page>
  );
}
