import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { AddPatientForm } from '@/components/add-patient-form';
import { H1, Lead, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Add a parent' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const zones = await db.zone.findMany({
    where: { isActive: true },
    select: { name: true, city: true, radiusKm: true },
  });

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Tell us about your parent</H1>
          <Lead>
            The technician reads this before every visit — so the more you tell us about how
            they like things done, the better the visit goes.
          </Lead>
          {zones.length > 0 && (
            <Muted>
              We currently serve {zones.map((z) => `${z.name}, ${z.city}`).join(' and ')} —
              within {zones[0].radiusKm} km of our partner laboratory. If you are outside that,
              we will put you on the waitlist rather than promise something we cannot do well.
            </Muted>
          )}
        </Stack>

        <AddPatientForm />
      </Stack>
    </Page>
  );
}
