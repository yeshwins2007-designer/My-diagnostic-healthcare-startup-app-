import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { DECISION_WINDOW_MINUTES } from '@/lib/orders/lab-orders';

/**
 * The partner door: its own frame, outside the terminal's guard and apart
 * from the family app's header, the way a restaurant partner app has its own
 * sign-in. Left, what a partner lab gets and owes; right, the form.
 */
export default function PartnerAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--color-canvas)] lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="brand-surface hidden flex-col justify-between gap-10 border-r border-[var(--color-line)] px-10 py-12 lg:flex">
        <Link href="/lab/login" className="flex min-h-11 items-center gap-3">
          <BrandMark size={32} className="shrink-0 rounded-[8px]" />
          <span className="font-mono text-[0.8125rem] font-medium tracking-[0.2em] text-[var(--brand-ink)]">MEDWYN PARTNER</span>
        </Link>

        <div className="flex max-w-md flex-col gap-6">
          <h2 className="text-h1 font-semibold tracking-tight text-[var(--brand-ink)]">
            Home-collected samples from your neighbourhood, to your bench.
          </h2>
          <dl className="flex flex-col gap-4 text-[var(--color-ink-soft)]">
            <div className="flex flex-col gap-1">
              <dt className="eyebrow">Orders</dt>
              <dd>Each paid order rings on your terminal. Accept or reject within {DECISION_WINDOW_MINUTES} minutes; after that it counts as accepted.</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="eyebrow">Samples</dt>
              <dd>Our technicians collect, label at the bedside and hand over within the two-hour clock, with the cold-box temperature logged.</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="eyebrow">Reports</dt>
              <dd>Enter the values and attach your signed PDF. A coordinator checks identifiers before the family sees anything.</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="eyebrow">Payment</dt>
              <dd>At the rate card in your signed agreement, for every report you sign.</dd>
            </div>
          </dl>
        </div>

        <p className="text-small text-[var(--color-ink-faint)]">NABL-accredited medical laboratories only.</p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
          <Link href="/lab/login" className="flex min-h-11 items-center gap-2.5 lg:invisible">
            <BrandMark size={28} className="shrink-0 rounded-[7px]" />
            <span className="font-mono text-[0.75rem] font-medium tracking-[0.2em]">MEDWYN PARTNER</span>
          </Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
    </div>
  );
}
