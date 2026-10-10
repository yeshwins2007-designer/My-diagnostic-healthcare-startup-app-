import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthFlow } from '@/components/auth-flow';
import { BrandMark } from '@/components/brand-mark';
import { getSessionUser } from '@/lib/auth/session';
import { brand } from '@/lib/brand';
import { Card, H3, Muted, Stack } from '@/components/ui';
import { isSimulated } from '@/lib/env';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Screen 01 of the reference design. Sign-in stays phone-and-code: no
 * password to forget, and the same number the technician calls.
 */
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect(
      user.role === 'OPS'
        ? '/ops'
        : user.role === 'LAB'
          ? '/lab'
          : user.role === 'TECHNICIAN'
            ? '/field'
            : '/caregiver',
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="flex flex-col items-center gap-3 self-center text-center">
        <BrandMark
          size={84}
          className="rounded-[1.4rem] [filter:drop-shadow(0_0_22px_color-mix(in_oklab,var(--brand-glow)_55%,transparent))]"
        />
        <span className="text-h2 font-bold tracking-[0.12em]">{brand.name}</span>
        <span className="text-small text-[var(--color-ink-soft)]">Diagnostic healthcare at home</span>
      </Link>

      <Stack gap="sm" className="text-center">
        <h1 className="text-h1 font-bold tracking-tight">Welcome back!</h1>
        <p className="text-lead text-[var(--color-ink-soft)]">Log in to your health portal</p>
      </Stack>

      <AuthFlow intent="individual" />

      <p className="text-center text-[var(--color-ink-soft)]">
        Don’t have an account?{' '}
        <span className="font-semibold text-[var(--color-primary)]">
          Enter your number above. We set one up as you sign in.
        </span>
      </p>

      {isSimulated('sms') && (
        <Card tone="sunken">
          <Stack gap="sm">
            <H3>Demo accounts</H3>
            <Muted>
              No SMS gateway is configured, so the code appears on screen. Any of these seeded
              numbers work, or any new number to sign up:
            </Muted>
            <ul className="flex flex-col gap-2 font-mono text-small">
              <li>+91 98450 00101 — Anjali Iyer, family (Medwyn One member)</li>
              <li>+91 98450 00103 — Fatima Sheikh, family (pays per test)</li>
              <li>+91 98450 00001 — ops console</li>
              <li>+91 98450 00010 — Priya Nair, field technician</li>
              <li>+91 98451 00200 — Dr. Sudha Rao, partner laboratory</li>
            </ul>
          </Stack>
        </Card>
      )}
    </main>
  );
}
