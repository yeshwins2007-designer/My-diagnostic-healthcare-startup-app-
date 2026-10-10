import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { brand } from '@/lib/brand';
import { VoiceLauncher } from '@/components/voice-launcher';
import { BottomNav, type BottomNavItem } from '@/components/bottom-nav';

// One list drives both navs. The short label is what fits a fifth of a phone
// width under an icon; the full label is used wherever there is room.
const NAV: (BottomNavItem & { fullLabel: string })[] = [
  { href: '/caregiver', label: 'Home', fullLabel: 'Home', icon: 'home' },
  { href: '/caregiver/visits', label: 'Bookings', fullLabel: 'Bookings', icon: 'visits' },
  { href: '/caregiver/reports', label: 'Reports', fullLabel: 'Reports', icon: 'reports' },
  { href: '/caregiver/profile', label: 'Profile', fullLabel: 'Profile', icon: 'profile' },
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
    <div className="has-bottom-nav min-h-dvh">
      {/* The reference design's greeting header: who you are, and the two
          things that may need you - a call to us, and our calls to you. */}
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-5xl px-5 py-4 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <Link href="/caregiver/profile" className="inline-flex min-h-12 min-w-0 flex-1 items-center gap-3">
              <span
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-primary-wash)] text-lead font-bold text-[var(--color-primary)]"
              >
                {user.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="truncate text-base font-bold">
                Hello, {user.name.split(' ')[0]} <span aria-hidden>👋</span>
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={`tel:${brand.supportPhone.replace(/\s/g, '')}`}
                aria-label={`Call us on ${brand.supportPhone}`}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--card-border)] text-[var(--color-primary)]"
              >
                <svg aria-hidden viewBox="0 0 24 24" width="22" height="22">
                  <path
                    d="M6.6 4h3l1.5 4-2 1.3a11 11 0 0 0 5.6 5.6l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <Link
                href="/caregiver/calls"
                aria-label="Our calls to you"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--card-border)] text-[var(--color-primary)]"
              >
                <svg aria-hidden viewBox="0 0 24 24" width="22" height="22">
                  <path
                    d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2zM10 20.5a2 2 0 0 0 4 0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </div>
          </div>

          {/* Hidden on phones, where BottomNav takes over within thumb reach. */}
          <nav aria-label="Main" className="scroll-x mt-3 hidden gap-2 pb-1 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-full border-2 border-[var(--card-border)] px-5 py-2 font-semibold hover:bg-[var(--color-surface-sunken)]"
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
