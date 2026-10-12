import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { brand } from '@/lib/brand';
import { VoiceLauncher } from '@/components/voice-launcher';
import { BottomNav, TopNav, type BottomNavItem } from '@/components/bottom-nav';
import { BrandMark } from '@/components/brand-mark';
import { CommandMenu, type CommandItem } from '@/components/command-menu';

// One list drives both navs. The short label is what fits a quarter of a
// phone width under an icon; the full label is used wherever there is room.
const NAV: (BottomNavItem & { fullLabel: string })[] = [
  { href: '/caregiver', label: 'Home', fullLabel: 'Home', icon: 'home' },
  { href: '/caregiver/visits', label: 'Bookings', fullLabel: 'Bookings', icon: 'visits' },
  { href: '/caregiver/reports', label: 'Reports', fullLabel: 'Reports', icon: 'reports' },
  { href: '/caregiver/profile', label: 'Profile', fullLabel: 'Profile', icon: 'profile' },
];

/** Everything the command menu can jump to: every screen a family uses. */
const COMMANDS: CommandItem[] = [
  { group: 'Go to', label: 'Home', href: '/caregiver', keywords: 'dashboard' },
  { group: 'Go to', label: 'Bookings', href: '/caregiver/visits', keywords: 'visits appointments' },
  { group: 'Go to', label: 'Reports', href: '/caregiver/reports', keywords: 'results' },
  { group: 'Go to', label: 'Medwyn One', href: '/caregiver/membership', keywords: 'membership plan subscription discount' },
  { group: 'Go to', label: 'Our calls to you', href: '/caregiver/calls', keywords: 'follow-up phone' },
  { group: 'Go to', label: 'Profile', href: '/caregiver/profile', keywords: 'account parents elder mode passkey theme' },
  { group: 'Book', label: 'Book tests', href: '/caregiver/book', keywords: 'home visit collection' },
  { group: 'Book', label: 'Health packages', href: '/caregiver/book?kind=panel', keywords: 'panel baseline comprehensive' },
  { group: 'Book', label: 'Blood tests', href: '/caregiver/book?kind=test', keywords: 'single test' },
  { group: 'Book', label: 'Add a parent', href: '/caregiver/onboarding', keywords: 'patient address' },
  { group: 'Help', label: `Call us on ${brand.supportPhone}`, href: `tel:${brand.supportPhone.replace(/\s/g, '')}`, keywords: 'phone support' },
];

const iconButton =
  'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-line-strong)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]';

export default async function CaregiverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'CAREGIVER') redirect('/');

  const firstName = user.name.split(' ')[0];

  return (
    <div className="has-bottom-nav min-h-dvh">
      <header className="glass sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3 sm:px-8">
          <Link href="/caregiver/profile" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 sm:flex-none">
            <BrandMark size={32} className="hidden shrink-0 rounded-[8px] sm:block" />
            <span className="flex min-w-0 flex-col">
              <span className="eyebrow font-mono">{brand.name}</span>
              <span className="truncate text-[0.9375rem] font-medium">Hello, {firstName}</span>
            </span>
          </Link>

          <div className="mx-auto hidden md:block">
            <TopNav items={NAV.map(({ href, fullLabel }) => ({ href, label: fullLabel }))} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <CommandMenu items={COMMANDS} searchHref="/caregiver/book?q=" />
            <Link href="/caregiver/calls" aria-label="Our calls to you" className={iconButton}>
              <svg aria-hidden viewBox="0 0 24 24" width="20" height="20">
                <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2zM10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </Link>
            <a href={`tel:${brand.supportPhone.replace(/\s/g, '')}`} aria-label={`Call us on ${brand.supportPhone}`} className={iconButton}>
              <svg aria-hidden viewBox="0 0 24 24" width="20" height="20">
                <path d="M6.6 4h3l1.5 4-2 1.3a11 11 0 0 0 5.6 5.6l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </div>

        {/* Between 640 and 768px the tabs take their own row. */}
        <div className="mx-auto hidden max-w-5xl px-5 pb-3 sm:block sm:px-8 md:hidden">
          <TopNav items={NAV.map(({ href, fullLabel }) => ({ href, label: fullLabel }))} />
        </div>
      </header>

      {/* Bottom padding so content can scroll clear of the assistant button. */}
      <div className="clear-bottom-chrome">{children}</div>

      {/* The voice assistant is on every caregiver screen: the moment someone
          wants to talk to a person is rarely the moment they are on the
          "contact us" page. */}
      <VoiceLauncher />
      <BottomNav items={NAV.map(({ href, label, icon }) => ({ href, label, icon }))} />
    </div>
  );
}
