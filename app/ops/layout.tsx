import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { signOut } from '@/app/actions/auth';
import { Badge } from '@/components/ui';
import { BrandMark } from '@/components/brand-mark';
import { CommandMenu } from '@/components/command-menu';
import { TopNav } from '@/components/bottom-nav';
import { brand } from '@/lib/brand';

const NAV = [
  { href: '/ops', label: 'Monday numbers' },
  { href: '/ops/today', label: 'Today' },
  { href: '/ops/critical', label: 'Critical values' },
  { href: '/ops/follow-ups', label: 'Follow-up calls' },
  { href: '/ops/labs', label: 'Lab verification' },
  { href: '/ops/waitlist', label: 'Waitlist' },
  { href: '/ops/gates', label: 'Growth gates' },
  { href: '/ops/audit', label: 'Audit trail' },
];

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'OPS') redirect('/');

  // Two counts drive the whole screen's urgency, so they sit in the chrome.
  const [openCriticals, overdueFollowUps, pendingLabs] = await Promise.all([
    db.criticalValueAlert.count({ where: { status: { not: 'CLOSED' } } }),
    db.followUpCall.count({ where: { status: 'PENDING', dueBy: { lt: new Date() } } }),
    db.lab.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
  ]);

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="glass sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Wraps because three alert badges beside the title overflow a
                phone: the coordinator checks critical values on a handset. */}
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/ops" className="inline-flex min-h-12 items-center gap-3">
                <BrandMark size={28} className="rounded-[7px]" />
                <span className="flex flex-col">
                  <span className="eyebrow font-mono">{brand.name}</span>
                  <span className="text-[0.9375rem] font-medium">Ops console</span>
                </span>
              </Link>
              {openCriticals > 0 && (
                <Badge tone="red">
                  {openCriticals} critical value{openCriticals === 1 ? '' : 's'} open
                </Badge>
              )}
              {overdueFollowUps > 0 && (
                <Badge tone="yellow">{overdueFollowUps} follow-up calls overdue</Badge>
              )}
              {pendingLabs > 0 && <Badge tone="info">{pendingLabs} lab applications</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <CommandMenu
                items={NAV.map((n) => ({ group: 'Go to', label: n.label, href: n.href }))}
                placeholder="Go to…"
              />
              <form action={signOut}>
                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] px-3 text-small font-medium text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                >
                  Sign out ({user.name.split(' ')[0]})
                </button>
              </form>
            </div>
          </div>

          <TopNav items={NAV} scroll />
        </div>
      </header>

      {children}
    </div>
  );
}
