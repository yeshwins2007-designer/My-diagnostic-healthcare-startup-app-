import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { homeFor, signInFor } from '@/lib/auth/home';
import { signOut } from '@/app/actions/auth';

/**
 * The frame for a partner who has signed up but not yet applied: just the
 * application, without the terminal's sections, which mean nothing until a
 * laboratory exists.
 */
export default async function LabOnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect(signInFor('lab'));
  if (user.role !== 'LAB') redirect(homeFor(user.role));

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="glass sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/lab"
            className="inline-flex min-h-12 items-center text-base font-medium"
          >
            Partner laboratory
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <form action={signOut}>
              <button type="submit" className="px-2 py-3 font-semibold underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
