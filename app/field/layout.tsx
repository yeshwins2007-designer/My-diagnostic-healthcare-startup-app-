import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { signOut } from '@/app/actions/auth';

/**
 * The field agent app.
 *
 * Optimised for one hand, at a doorstep, at 6:40 in the morning, possibly in
 * the rain. High contrast, big targets, and never more than one decision on
 * screen at a time.
 */
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'TECHNICIAN') redirect('/');

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="glass sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-4">
          <Link
            href="/field"
            className="inline-flex min-h-12 items-center text-base font-medium"
          >
            Today’s route
          </Link>
          <form action={signOut}>
            <button type="submit" className="px-2 py-3 font-semibold underline">
              {user.name.split(' ')[0]}
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
