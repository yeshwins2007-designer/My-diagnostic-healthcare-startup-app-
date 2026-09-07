import Link from 'next/link';
import { brand } from '@/lib/brand';
import { getSessionUser } from '@/lib/auth/session';
import { ThemeToggle } from '@/components/theme-toggle';

const HOME_FOR_ROLE: Record<string, string> = {
  CAREGIVER: '/caregiver',
  TECHNICIAN: '/field',
  LAB: '/lab',
  OPS: '/ops',
};

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--text-lead)] font-bold text-[var(--color-primary-ink)]"
          >
            स
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[var(--text-lead)] font-bold">{brand.name}</span>
            <span className="text-[var(--text-tiny)] text-[var(--color-ink-faint)]">
              {brand.city}
            </span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          <Link
            href="/plans"
            className="rounded-[var(--radius-control)] px-4 py-3 font-semibold hover:bg-[var(--color-surface-sunken)]"
          >
            Plans
          </Link>
          <Link
            href="/trust"
            className="rounded-[var(--radius-control)] px-4 py-3 font-semibold hover:bg-[var(--color-surface-sunken)]"
          >
            Trust &amp; safety
          </Link>
          <Link
            href="/elder"
            className="rounded-[var(--radius-control)] px-4 py-3 font-semibold hover:bg-[var(--color-surface-sunken)]"
          >
            Elder mode
          </Link>
          {user ? (
            <Link
              href={HOME_FOR_ROLE[user.role] ?? '/'}
              className="rounded-[var(--radius-control)] border-2 border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-3 font-semibold text-[var(--color-primary-ink)]"
            >
              {user.name.split(' ')[0]}’s dashboard
            </Link>
          ) : (
            <Link
              href="/join"
              className="rounded-[var(--radius-control)] border-2 border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-3 font-semibold text-[var(--color-primary-ink)]"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
