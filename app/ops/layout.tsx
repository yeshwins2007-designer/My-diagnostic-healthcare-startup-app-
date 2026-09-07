import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { signOut } from '@/app/actions/auth';
import { Badge } from '@/components/ui';

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
      <header className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-7xl px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/ops" className="text-[var(--text-lead)] font-bold">
                Ops console
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
            <form action={signOut}>
              <button type="submit" className="px-4 py-3 font-semibold underline">
                Sign out ({user.name.split(' ')[0]})
              </button>
            </form>
          </div>

          <nav className="scroll-x mt-3 flex gap-2 pb-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-[var(--radius-control)] border-2 border-[var(--color-line)] px-4 py-2 text-[var(--text-small)] font-semibold hover:bg-[var(--color-surface-sunken)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
