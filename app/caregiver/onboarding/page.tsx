import type { Metadata } from 'next';
import { AddPatientForm } from '@/components/add-patient-form';
import { H1, Lead, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Add a parent' };
export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Tell us about your parent</H1>
          <Lead>
            Your technician reads this before every visit. The more you tell us about what your
            parent needs, the easier the visit is for them.
          </Lead>
        </Stack>

        <AddPatientForm />
      </Stack>
    </Page>
  );
}
