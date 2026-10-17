import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/home';
import { isSimulated } from '@/lib/env';
import { AuthFlow } from '@/components/auth-flow';
import { PasskeySignIn } from '@/components/passkeys';
import { Card, H3, Muted, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Partner sign in' };

/**
 * Partner sign-in. The same verified phone code as everywhere, and the same
 * traffic controller after it (lib/auth/home.ts): a lab account lands on the
 * order terminal; anyone else who signs in here lands on their own home, not
 * a lab screen.
 */
export default async function PartnerLoginPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));

  return (
    <>
      <Stack gap="sm">
        <span className="eyebrow">Partner laboratories</span>
        <h1 className="text-h1 font-semibold tracking-tight">Sign in to your terminal</h1>
        <p className="text-[var(--color-ink-soft)]">
          Orders, the intake desk, results and earnings for your laboratory.
        </p>
      </Stack>

      <AuthFlow intent="business" />

      <PasskeySignIn />

      <Stack gap="sm">
        <p className="text-small text-[var(--color-ink-soft)]">
          New laboratory?{' '}
          <Link href="/lab/register" className="inline-flex min-h-11 items-center font-semibold text-[var(--color-ink)] underline">
            Register as a partner
          </Link>
        </p>
        <p className="text-small text-[var(--color-ink-faint)]">
          Booking tests for your family?{' '}
          <Link href="/login" className="inline-flex min-h-11 items-center font-medium underline">
            Family sign-in
          </Link>
        </p>
      </Stack>

      {isSimulated('sms') && (
        <Card tone="sunken">
          <Stack gap="sm">
            <H3>Demo partner accounts</H3>
            <Muted>No SMS gateway is configured, so the code appears on screen.</Muted>
            <ul className="flex flex-col gap-2 font-mono text-small">
              <li>+91 98451 00200: Dr. Sudha Rao, owner, Ananya Diagnostics</li>
              <li>+91 98451 00201: Ravi Shetty, intake desk (cannot reject or sign)</li>
            </ul>
          </Stack>
        </Card>
      )}
    </>
  );
}
