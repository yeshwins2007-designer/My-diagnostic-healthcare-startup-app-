import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { signOut } from '@/app/actions/auth';
import { brand } from '@/lib/brand';
import { VoiceLauncher } from '@/components/voice-launcher';

const NAV = [
  { href: '/caregiver', label: 'Home' },
  { href: '/caregiver/visits', label: 'Visits' },
  { href: '/caregiver/reports', label: 'Reports' },
  { href: '/caregiver/calls', label: 'Our calls to you' },
  { href: '/caregiver/plan', label: 'Plan & billing' },
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
    <div className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-5xl px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/caregiver" className="text-[var(--text-lead)] font-bold">
              {brand.name}
            </Link>
            <div className="flex items-center gap-4">
              <a
                href={`tel:${brand.supportPhone.replace(/\s/g, '')}`}
                className="font-semibold underline"
              >
                {brand.supportPhone}
              </a>
              <form action={signOut}>
                <button type="submit" className="px-2 py-3 font-semibold underline">
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <nav className="scroll-x mt-3 flex gap-2 pb-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-[var(--radius-control)] border-2 border-[var(--color-line)] px-4 py-2 font-semibold hover:bg-[var(--color-surface-sunken)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Bottom padding so page content can always scroll clear of the
          floating assistant button, which otherwise sits on top of whatever
          is at the end of the page. */}
      <div className="pb-28">{children}</div>

      {/* The voice assistant is available on every caregiver screen, because
          the moment someone wants to talk to a person is rarely the moment
          they are on the "contact us" page. */}
      <VoiceLauncher />
    </div>
  );
}
