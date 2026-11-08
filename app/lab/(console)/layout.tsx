import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { homeFor, signInFor } from '@/lib/auth/home';
import { signOut } from '@/app/actions/auth';
import { labLogoUrl, monogram } from '@/lib/brandfetch';
import { formatINR } from '@/lib/money';
import { partnerMembership, sidebarReadings } from '@/lib/queries/partner';
import { BrandMark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { LabLogo } from '@/components/partner/lab-logo';
import { PartnerNav, type NavItem } from '@/components/partner/partner-nav';
import { StatusDot } from '@/components/ui';
import './terminal.css';

/**
 * The partner terminal's frame: a sticky sidebar with the lab's live
 * readings and its four sections, beside the page. It is a separate tree
 * from the family app (app/caregiver) with its own layout and guard, so
 * nothing here renders there, and nothing there renders here.
 *
 * This guard is for the frame. Each page checks the role again for itself,
 * because a layout does not re-run on client navigation.
 */
export default async function PartnerConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect(signInFor('lab'));
  if (user.role !== 'LAB') redirect(homeFor(user.role));

  const membership = await partnerMembership(user.id);
  if (!membership) redirect('/lab/apply');
  const lab = membership.lab;
  const active = lab.status === 'ACTIVE';
  const readings = active ? await sidebarReadings(lab.id) : null;

  const nav: NavItem[] = [
    {
      href: '/lab',
      label: 'Active orders',
      reading: readings ? String(readings.pending + readings.inProgress) : undefined,
      alert: (readings?.pending ?? 0) > 0,
    },
    { href: '/lab/earnings', label: 'Earnings', reading: readings ? formatINR(readings.earnedToday) : undefined },
    { href: '/lab/catalog', label: 'Test catalog' },
    { href: '/lab/profile', label: 'Lab profile' },
  ];
  const logo = labLogoUrl(lab.website);
  const statusTone = active ? 'green' : lab.status === 'SUSPENDED' || lab.status === 'REJECTED' ? 'red' : 'yellow';

  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <LabLogo src={logo} initials={monogram(lab.name)} name={lab.name} size={40} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[0.9375rem] font-semibold leading-tight">{lab.name}</span>
        <span className="eyebrow flex items-center gap-1.5">
          <StatusDot tone={statusTone} live={active} />
          {lab.status.toLowerCase()}
        </span>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)] lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-[var(--color-line)] bg-[var(--color-surface-sunken)] px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 lg:flex">
        <Link href="/lab" className="flex min-h-11 items-center gap-2.5">
          <BrandMark size={24} className="shrink-0 rounded-[6px]" />
          <span className="font-mono text-[0.75rem] font-medium tracking-[0.2em]">MEDWYN PARTNER</span>
        </Link>

        {identity}

        {readings && (
          <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
            <div className="flex flex-col gap-1">
              <dt className="eyebrow">Awaiting you</dt>
              <dd className={readings.pending > 0 ? 'reading text-[1.25rem] text-[var(--color-yellow)]' : 'reading text-[1.25rem]'}>
                {readings.pending}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="eyebrow">In progress</dt>
              <dd className="reading text-[1.25rem]">{readings.inProgress}</dd>
            </div>
            <div className="col-span-2 flex flex-col gap-1 border-t border-[var(--color-line)] pt-2">
              <dt className="eyebrow">Earned today</dt>
              <dd className="reading text-[1.25rem]">{formatINR(readings.earnedToday)}</dd>
            </div>
          </dl>
        )}

        <PartnerNav items={nav} orientation="vertical" />

        <div className="mt-auto flex flex-col gap-3 border-t border-[var(--color-line)] pt-4">
          <Link href="/lab/agreement" className="inline-flex min-h-11 items-center text-small font-medium text-[var(--color-ink-soft)] underline">
            Service agreement
          </Link>
          <ThemeToggle />
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-small text-[var(--color-ink-faint)]">
              {user.name} · {membership.role.replace('_', ' ').toLowerCase()}
            </span>
            <form action={signOut}>
              <button type="submit" className="min-h-11 px-1 text-small font-semibold underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="glass sticky top-0 z-30 flex flex-col gap-3 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            {identity}
            <form action={signOut}>
              <button type="submit" className="min-h-11 px-1 text-small font-semibold underline">
                Sign out
              </button>
            </form>
          </div>
          <PartnerNav items={nav} orientation="horizontal" />
        </header>
        {children}
      </div>
    </div>
  );
}
