import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { signOut } from '@/app/actions/auth';

export default async function LabLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'LAB') redirect('/');

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/lab" className="text-[var(--text-lead)] font-bold">
            Partner laboratory
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/lab/agreement" className="font-semibold underline">
              Agreement
            </Link>
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
