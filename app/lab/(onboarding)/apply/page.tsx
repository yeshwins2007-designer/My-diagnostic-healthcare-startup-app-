import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { LabApplicationForm } from '@/components/lab-application-form';
import { Card, H1, H3, Lead, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Register your laboratory' };
export const dynamic = 'force-dynamic';

export default async function LabApplyPage() {
  const user = await requirePageRole('LAB');

  const existing = await db.labMember.findFirst({ where: { userId: user.id } });
  if (existing) redirect('/lab');

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Register your laboratory</H1>
          <Lead>
            Home-collected samples from families in your neighbourhood, processed by you. You keep your own patients and referring doctors. We just send you more work for the capacity you already have.
          </Lead>
        </Stack>

        <Card tone="info">
          <Stack gap="sm">
            <H3>What happens after you submit</H3>
            <p>
              This is an <strong>application</strong>, not an activation. Before a single human
              sample is routed to you, one of our team works through seven checks: your
              certificate number against the NABL public directory, the QR on the certificate,
              the validity date, whether your accredited scope covers the panels we route,
              whether the registered address matches the site samples will actually reach, a
              signed service agreement, and your supervising pathologist’s council registration.
            </p>
            <Muted>
              We won’t send blood samples to anyone who simply fills in a form. It usually takes two working days.
            </Muted>
          </Stack>
        </Card>

        <LabApplicationForm />
      </Stack>
    </Page>
  );
}
