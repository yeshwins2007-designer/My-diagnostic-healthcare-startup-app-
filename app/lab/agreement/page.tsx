import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  Badge,
  Card,
  EmptyState,
  H1,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Service agreement' };
export const dynamic = 'force-dynamic';

/**
 * The eight clauses that must be agreed in writing before the first sample
 * moves. The most valuable relationship in this business is also the one most
 * likely to be handled casually — so it is a versioned document, not a
 * conversation someone half-remembers.
 */
const CLAUSE_GUIDANCE: { key: string; title: string; why: string }[] = [
  {
    key: 'rateCardNote',
    title: 'Rate card',
    why: 'A fixed per-test processing rate for this volume, reviewed every six months. A discount to retail is normal in exchange for guaranteed volume — agree the number, do not leave it implied.',
  },
  {
    key: 'paymentTerms',
    title: 'Payment terms',
    why: 'Weekly or fortnightly settlement, on a stated day. Informal credit is what kills family businesses.',
  },
  {
    key: 'turnaroundCommitment',
    title: 'Turnaround commitment',
    why: 'Report delivery time by test category, and what happens when it is missed.',
  },
  {
    key: 'referralProtection',
    title: 'Referral protection',
    why: 'Explicit: existing doctor-referred and walk-in patients are never deprioritised for our volume. This protects the relationships that already sustain the lab.',
  },
  {
    key: 'capacityCeilingNote',
    title: 'Capacity ceiling',
    why: 'The daily sample volume above which we must give advance notice, so we never overwhelm the operation.',
  },
  {
    key: 'exclusivityNote',
    title: 'Exclusivity',
    why: 'We commit to routing all zone volume here. The lab remains free to serve anyone. We do not ask a new partner for exclusivity we have not earned.',
  },
  {
    key: 'brandingNote',
    title: 'Branding',
    why: 'How the lab is named in our materials. "Processed at [Lab], NABL-accredited" is our credibility line — it needs written permission.',
  },
  {
    key: 'exitNote',
    title: 'Exit',
    why: 'Notice period, and what happens to patient records if either side walks away.',
  },
];

export default async function AgreementPage() {
  const user = await requireRole('LAB');

  const membership = await db.labMember.findFirst({
    where: { userId: user.id },
    include: {
      lab: { include: { agreements: { orderBy: { version: 'desc' } } } },
    },
  });

  const agreement = membership?.lab.agreements[0];

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Service agreement</H1>
          <Lead>
            Eight clauses, agreed in writing before the first sample moves — and versioned, so
            neither side is relying on what someone remembers from a conversation.
          </Lead>
          {agreement && (
            <div className="flex flex-wrap gap-2">
              <Badge tone={agreement.status === 'SIGNED' ? 'green' : 'yellow'}>
                version {agreement.version} · {agreement.status.toLowerCase()}
              </Badge>
              {agreement.signedAt && (
                <Badge>signed {agreement.signedAt.toLocaleDateString('en-IN')}</Badge>
              )}
            </div>
          )}
        </Stack>

        {!agreement ? (
          <EmptyState
            title="No agreement drafted yet"
            body="Our team drafts this once your accreditation checks are complete. You will be able to read and sign it here before anything is routed to you."
          />
        ) : (
          <Stack gap="md">
            {CLAUSE_GUIDANCE.map((clause) => (
              <Card key={clause.key}>
                <Stack gap="sm">
                  <H3>{clause.title}</H3>
                  <p>{String(agreement[clause.key as keyof typeof agreement] ?? '—')}</p>
                  <Muted>{clause.why}</Muted>
                </Stack>
              </Card>
            ))}

            {agreement.status === 'SIGNED' && (
              <Card tone="green">
                <Stack gap="sm">
                  <H3>Signed</H3>
                  <p>
                    {agreement.signedByLabName} for the laboratory,{' '}
                    {agreement.signedByPlatformName} for SwasthaSetu, on{' '}
                    {agreement.signedAt?.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    .
                  </p>
                </Stack>
              </Card>
            )}
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
