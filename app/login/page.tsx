import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { AuthFlow } from '@/components/auth-flow';
import { getSessionUser } from '@/lib/auth/session';
import { Card, H1, H3, Lead, Muted, Page, Stack } from '@/components/ui';
import { isSimulated } from '@/lib/env';

export const metadata: Metadata = { title: 'Sign in' };

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
    <>
      <SiteHeader />
      <Page>
        <Stack gap="lg">
          <Stack gap="sm">
            <H1>Sign in</H1>
            <Lead>We will send a six-digit code to your mobile. No password to remember.</Lead>
          </Stack>

          <AuthFlow intent="individual" />

          {isSimulated('sms') && (
            <Card tone="sunken">
              <Stack gap="sm">
                <H3>Demo accounts</H3>
                <Muted>
                  No SMS gateway is configured, so the code appears on screen and in the server
                  console. Any of these seeded numbers work:
                </Muted>
                <ul className="flex flex-col gap-2 font-mono text-[var(--text-small)]">
                  <li>+91 98450 00001 — Yeshwin, founder / ops console</li>
                  <li>+91 98450 00101 — Anjali Iyer, caregiver (mother Lakshmi, 74)</li>
                  <li>+91 98450 00010 — Priya Nair, field technician</li>
                  <li>+91 98451 00200 — Dr. Sudha Rao, partner laboratory</li>
                </ul>
              </Stack>
            </Card>
          )}
        </Stack>
      </Page>
    </>
  );
}
