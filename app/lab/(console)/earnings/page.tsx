import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { formatINR } from '@/lib/money';
import { istShortDay } from '@/lib/orders/ist';
import { loadEarnings, partnerMembership } from '@/lib/queries/partner';
import { EarningsChart } from '@/components/partner/earnings-chart';
import { DataRow, Metric } from '@/components/ui';

export const metadata: Metadata = { title: 'Earnings' };
export const dynamic = 'force-dynamic';

export default async function EarningsPage() {
  const user = await requirePageRole('LAB');
  const membership = await partnerMembership(user.id);
  if (!membership) redirect('/lab/apply');
  const lab = membership.lab;
  const agreement = lab.agreements[0];

  const e = await loadEarnings(lab.id);
  const last14 = e.series.slice(-14).map((d) => ({ ...d, label: istShortDay(new Date(`${d.key}T12:00:00+05:30`)) }));
  const turnaround =
    e.avgTurnaroundHours === null
      ? '—'
      : e.avgTurnaroundHours < 24
        ? `${e.avgTurnaroundHours.toFixed(1)} h`
        : `${(e.avgTurnaroundHours / 24).toFixed(1)} d`;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-8">
      <div className="flex flex-col gap-1">
        <span className="eyebrow">Earnings analytics</span>
        <h1 className="text-h2 font-semibold tracking-tight">Earnings</h1>
        <p className="text-small text-[var(--color-ink-faint)]">
          Every report you sign, at your rate card. The statement under your agreement is what is
          paid; this is your running view of it.
        </p>
      </div>

      <section aria-label="Totals" className="panel grid grid-cols-2 gap-5 rounded-[var(--radius-card)] border p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Today" value={formatINR(e.today)} />
        <Metric label="Last 7 days" value={formatINR(e.week)} />
        <Metric label="Last 30 days" value={formatINR(e.month)} />
        <Metric label="Reports, 30 days" value={String(e.orders)} />
        <Metric label="Intake to signature" value={turnaround} sub="average, 30 days" />
      </section>

      <section aria-labelledby="daily" className="panel flex flex-col gap-4 rounded-[var(--radius-card)] border p-4 sm:p-5">
        <h2 id="daily" className="text-[0.9375rem] font-semibold tracking-tight">
          Per day
        </h2>
        <EarningsChart days={last14} />
      </section>

      <section aria-labelledby="by-test" className="panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-4 sm:p-5">
        <h2 id="by-test" className="text-[0.9375rem] font-semibold tracking-tight">
          By test, 30 days
        </h2>
        {e.byTest.length === 0 ? (
          <p className="text-small text-[var(--color-ink-faint)]">No signed reports in the last 30 days yet.</p>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[28rem] text-small">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="eyebrow py-2 font-medium">Test</th>
                  <th scope="col" className="eyebrow py-2 text-right font-medium">Reports</th>
                  <th scope="col" className="eyebrow py-2 text-right font-medium">Earned</th>
                </tr>
              </thead>
              <tbody>
                {e.byTest.map((t) => (
                  <tr key={t.code} className="border-t border-[var(--color-line)]">
                    <td className="py-2.5">
                      <span className="reading mr-2 text-[var(--color-ink-faint)]">{t.code}</span>
                      {t.name}
                    </td>
                    <td className="reading py-2.5 text-right">{t.count}</td>
                    <td className="reading py-2.5 text-right">{formatINR(t.paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {e.unpricedCount > 0 && (
          <p className="text-small text-[var(--color-yellow)]">
            {e.unpricedCount} test{e.unpricedCount === 1 ? ' is' : 's are'} not on your rate card and
            count as ₹0 here. Tell us, and we will add {e.unpricedCount === 1 ? 'it' : 'them'} to the agreement.
          </p>
        )}
      </section>

      {agreement && (
        <section aria-labelledby="terms" className="panel flex flex-col gap-1 rounded-[var(--radius-card)] border p-4 sm:p-5">
          <h2 id="terms" className="mb-2 text-[0.9375rem] font-semibold tracking-tight">
            How you are paid
          </h2>
          <DataRow label="Payment terms" value={<span className="font-sans">{agreement.paymentTerms}</span>} />
          <DataRow label="Rate card" value={<span className="font-sans">{agreement.rateCardNote}</span>} />
          <DataRow label="Agreement" value={`version ${agreement.version} · ${agreement.status.toLowerCase()}`} />
        </section>
      )}
    </main>
  );
}
