import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { DISCIPLINE_LABELS, type Discipline } from '@/lib/enums';
import { formatINR } from '@/lib/money';
import { partnerMembership } from '@/lib/queries/partner';
import { PauseToggle, RateChangeForm } from '@/components/partner/catalog-controls';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Test catalog' };
export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const user = await requirePageRole('LAB');
  const membership = await partnerMembership(user.id);
  if (!membership) redirect('/lab/apply');
  const canEdit = ['OWNER', 'MANAGER'].includes(membership.role);

  const entries = await db.labRateCardEntry.findMany({
    where: { labId: membership.labId },
    include: { test: true },
    orderBy: { test: { name: 'asc' } },
  });
  const paused = entries.filter((e) => e.isPaused).length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-8">
      <div className="flex flex-col gap-1">
        <span className="eyebrow">Test catalog management</span>
        <h1 className="text-h2 font-semibold tracking-tight">Test catalog</h1>
        <p className="text-small text-[var(--color-ink-faint)]">
          What we route to you and what each test pays. Pause a test when the bench cannot run it:
          it stops being routed to you, and families served by your lab stop seeing it, until you
          resume.
        </p>
      </div>

      {paused > 0 && (
        <p role="status" className="rounded-[var(--radius-control)] border border-[var(--color-yellow)] bg-[var(--color-yellow-wash)] px-4 py-3 text-small font-medium text-[var(--color-yellow)]">
          {paused} test{paused === 1 ? ' is' : 's are'} paused and not being routed to you.
        </p>
      )}

      <section aria-labelledby="rate-card" className="panel flex flex-col rounded-[var(--radius-card)] border">
        <h2 id="rate-card" className="px-4 pt-4 text-[0.9375rem] font-semibold tracking-tight sm:px-5">
          Rate card <span className="reading text-[var(--color-ink-faint)]">· {entries.length}</span>
        </h2>
        {entries.length === 0 ? (
          <p className="p-4 text-small text-[var(--color-ink-faint)] sm:px-5">
            Your rate card is set when the service agreement is signed.
          </p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((e) => (
              <li
                key={e.id}
                data-test={e.test.code}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--color-line)] px-4 py-4 first:mt-3 sm:px-5"
              >
                <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="reading text-[var(--color-ink-faint)]">{e.test.code}</span>
                    <span className="font-medium">{e.test.name}</span>
                    {e.isPaused && <Badge tone="yellow">Paused</Badge>}
                  </span>
                  <span className="text-small text-[var(--color-ink-faint)]">
                    {DISCIPLINE_LABELS[e.test.discipline as Discipline] ?? e.test.discipline} · {e.test.tubeType}
                    {e.test.fastingHours > 0 ? ` · ${e.test.fastingHours} h fasting` : ''}
                  </span>
                  {e.isPaused && e.pausedReason && (
                    <span className="text-small text-[var(--color-yellow)]">{e.pausedReason}</span>
                  )}
                </div>
                <dl className="flex gap-6 text-right">
                  <div className="flex flex-col gap-0.5">
                    <dt className="eyebrow">You earn</dt>
                    <dd className="reading text-[1.0625rem] font-medium">{formatINR(e.costPaise)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="eyebrow">Family pays</dt>
                    <dd className="reading text-[1.0625rem] text-[var(--color-ink-soft)]">
                      {e.test.pricePaise > 0 ? formatINR(e.test.pricePaise) : 'in packages'}
                    </dd>
                  </div>
                </dl>
                <PauseToggle testId={e.testId} testName={e.test.name} paused={e.isPaused} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {entries.length > 0 && (
        <section aria-labelledby="rate-change" className="panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-4 sm:p-5">
          <h2 id="rate-change" className="text-[0.9375rem] font-semibold tracking-tight">
            Request a rate change
          </h2>
          <p className="text-small text-[var(--color-ink-faint)]">
            Rates are part of your signed agreement, so a change goes to our partnerships team and
            takes effect when the agreement is updated.
          </p>
          <RateChangeForm
            tests={entries.map((e) => ({ id: e.testId, label: `${e.test.code} · ${e.test.name} (now ${formatINR(e.costPaise)})` }))}
            canEdit={canEdit}
          />
        </section>
      )}
    </main>
  );
}
