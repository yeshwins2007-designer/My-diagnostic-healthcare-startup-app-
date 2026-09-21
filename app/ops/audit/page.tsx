import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { verifyChain } from '@/lib/compliance/audit';
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

export const metadata: Metadata = { title: 'Audit trail' };
export const dynamic = 'force-dynamic';

/**
 * The integrity claim, demonstrable rather than asserted.
 *
 * Every row commits to the previous row's hash. Deleting or editing an entry
 * breaks the chain at a provable point, and this page recomputes the whole
 * chain on each load so an auditor can watch it happen.
 */
export default async function AuditPage() {
  const [verification, entries, total] = await Promise.all([
    verifyChain(),
    db.auditLog.findMany({
      orderBy: { sequence: 'desc' },
      take: 100,
      include: { actor: true },
    }),
    db.auditLog.count(),
  ]);

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Audit trail</H1>
          <Lead>
            Append-only and hash-chained. GPS positions, cold-box temperatures, custody
            handoffs, consent, every report access and every accreditation check land here.
          </Lead>
        </Stack>

        <Card tone={verification.valid ? 'green' : 'red'}>
          <Stack gap="sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <H3>Chain integrity</H3>
              <Badge tone={verification.valid ? 'green' : 'red'}>
                {verification.valid ? 'Intact' : 'Broken'}
              </Badge>
            </div>
            <p>
              {verification.valid
                ? `All ${verification.checked} entries recompute to their stored hashes, and every link matches the row before it.`
                : `The chain breaks at entry ${verification.brokenAtSequence}. ${verification.reason}`}
            </p>
            <Muted>
              Recomputed live on every page load — this is not a stored flag that could itself
              be edited.
            </Muted>
          </Stack>
        </Card>

        {entries.length === 0 ? (
          <EmptyState
            title="Nothing logged yet"
            body="Entries appear as soon as anything happens: a login, a consent, a temperature reading, a report being opened."
          />
        ) : (
          <Stack gap="sm">
            <Muted>
              Showing the most recent {entries.length} of {total} entries.
            </Muted>
            <div className="scroll-x">
              <table className="w-full min-w-[52rem] border-collapse text-[var(--text-small)]">
                <thead>
                  <tr className="border-b-2 border-[var(--color-line-strong)] text-left">
                    <th className="py-3 pr-4">#</th>
                    <th className="py-3 pr-4">When</th>
                    <th className="py-3 pr-4">Action</th>
                    <th className="py-3 pr-4">Entity</th>
                    <th className="py-3 pr-4">Actor</th>
                    <th className="py-3">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.sequence} className="border-b border-[var(--color-line)]">
                      <td className="py-3 pr-4 font-mono">{entry.sequence}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {entry.occurredAt.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        {entry.action.replace(/_/g, ' ').toLowerCase()}
                      </td>
                      <td className="py-3 pr-4 text-[var(--color-ink-faint)]">
                        {entry.entityType}
                      </td>
                      <td className="py-3 pr-4">
                        {entry.actor?.name ?? entry.actorRole.toLowerCase()}
                      </td>
                      <td className="py-3 font-mono text-[var(--color-ink-faint)]">
                        {entry.hash.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
