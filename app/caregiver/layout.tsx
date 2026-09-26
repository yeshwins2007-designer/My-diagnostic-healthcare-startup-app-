import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { signOut } from '@/app/actions/auth';
import { brand } from '@/lib/brand';
import { VoiceLauncher } from '@/components/voice-launcher';
import { BrandMark } from '@/components/brand-mark';
import { BottomNav, type BottomNavItem } from '@/components/bottom-nav';

// One list drives both navs. The short label is what fits a fifth of a phone
// width under an icon; the full label is used wherever there is room.
const NAV: (BottomNavItem & { fullLabel: string })[] = [
  { href: '/caregiver', label: 'Home', fullLabel: 'Home', icon: 'home' },
  { href: '/caregiver/visits', label: 'Visits', fullLabel: 'Visits', icon: 'visits' },
  { href: '/caregiver/reports', label: 'Reports', fullLabel: 'Reports', icon: 'reports' },
  { href: '/caregiver/calls', label: 'Calls', fullLabel: 'Our calls to you', icon: 'calls' },
  { href: '/caregiver/plan', label: 'Plan', fullLabel: 'Plan & billing', icon: 'plan' },
];

export default async function CaregiverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'CAREGIVER') redirect('/');

  return (
    <div className="has-bottom-nav min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-5xl px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* One row at the default size; wraps instead of overflowing when
                the reader-size control is at A++ and the brand alone is ~200px. */}
            <Link
              href="/caregiver"
              className="inline-flex min-h-12 items-center gap-3 text-lead font-bold"
            >
              <BrandMark size={40} className="shrink-0 rounded-lg" />
              {brand.name}
            </Link>
            <div className="flex items-center gap-2">
              {/* A 48px handset on phones, the full number from 640px up. An
                  exception to the no-icon-only rule used for BottomNav: that
                  rule is about abstract destinations, whereas a handset on a
                  call action is close to universal. The accessible name always
                  carries the number. Brand, call and sign-out must share one
                  row inside 350px, which a worded button does not allow. */}
              <a
                href={`tel:${brand.supportPhone.replace(/\s/g, '')}`}
                aria-label={`Call us on ${brand.supportPhone}`}
                className="inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-full border-2 border-[var(--color-line)] font-semibold whitespace-nowrap text-[var(--color-primary)] hover:bg-[var(--color-surface-sunken)] sm:px-4"
              >
                <svg aria-hidden viewBox="0 0 24 24" width="20" height="20">
                  <path
                    d="M6.6 4h3l1.5 4-2 1.3a11 11 0 0 0 5.6 5.6l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="hidden sm:inline">{brand.supportPhone}</span>
              </a>
              <form action={signOut}>
                <button
                  type="submit"
                  className="min-h-12 px-2 text-small font-semibold whitespace-nowrap underline sm:text-base"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>

          {/* Hidden on phones, where BottomNav takes over within thumb reach. */}
          <nav aria-label="Main" className="scroll-x mt-3 hidden gap-2 pb-1 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-[var(--radius-control)] border-2 border-[var(--color-line)] px-4 py-2 font-semibold hover:bg-[var(--color-surface-sunken)]"
              >
                {item.fullLabel}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Bottom padding so page content can always scroll clear of the
          floating assistant button, which otherwise sits on top of whatever
          is at the end of the page. */}
      <div className="clear-bottom-chrome">{children}</div>

      {/* The voice assistant is available on every caregiver screen, because
          the moment someone wants to talk to a person is rarely the moment
          they are on the "contact us" page. */}
      <VoiceLauncher />
      <BottomNav items={NAV.map(({ href, label, icon }) => ({ href, label, icon }))} />
    </div>
  );
}
