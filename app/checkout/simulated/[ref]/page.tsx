import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { completeSimulatedMandate } from '@/app/actions/payments';
import { formatINR, formatINRWithWords } from '@/lib/money';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  DataRow,
  H1,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Approve mandate' };
export const dynamic = 'force-dynamic';

/**
 * Stands in for the UPI Autopay approval sheet when no Razorpay key is
 * configured. It is a faithful mock of the *decision* the payer makes — the
 * amount, the frequency, the cap and the ability to revoke — because that is
 * the part that matters for testing the product.
 */
export default async function SimulatedCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ amount?: string; method?: string }>;
}) {
  const { ref } = await params;
  const { method } = await searchParams;

  const mandate = await db.paymentMandate.findFirst({
    where: { providerRef: ref },
    include: {
      subscription: { include: { plan: true, patient: true } },
    },
  });

  if (!mandate) {
    return (
      <Page>
        <Card tone="red">
          <p>That mandate could not be found. It may already have been approved.</p>
        </Card>
      </Page>
    );
  }

  async function approve() {
    'use server';
    await completeSimulatedMandate(ref);
    redirect('/caregiver?mandate=approved');
  }

  const sub = mandate.subscription;

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <Badge tone="yellow">Simulated payment sheet</Badge>
          <H1>Approve this mandate</H1>
          <Muted>
            No Razorpay key is configured, so this stands in for the UPI Autopay approval screen
            your bank app would show. Approving here signs the same callback the real webhook
            verifies — the verification path is not bypassed.
          </Muted>
        </Stack>

        <Card>
          <Stack gap="sm">
            <DataRow label="Paying for" value={`${sub.patient.name} · ${sub.plan.name}`} />
            <DataRow
              label="Amount"
              value={formatINR(sub.effectivePricePaise)}
            />
            <DataRow
              label="In words"
              value={formatINRWithWords(sub.effectivePricePaise)}
            />
            <DataRow
              label="How often"
              value={sub.billingCycle === 'ANNUAL' ? 'Once a year' : 'Every month'}
            />
            <DataRow
              label="Maximum we may ever debit"
              value={formatINR(mandate.maxAmountPaise)}
            />
            <DataRow
              label="Method"
              value={(method ?? mandate.method).replace(/_/g, ' ').toLowerCase()}
            />
          </Stack>
        </Card>

        <Card tone="sunken">
          <Muted>
            You can cancel this mandate at any time from the billing page, or from your own bank
            or UPI app. We never take more than the maximum shown above.
          </Muted>
        </Card>

        <form action={approve}>
          <Button type="submit" full>
            Approve {formatINR(sub.effectivePricePaise)}
          </Button>
        </form>

        <ButtonLink href="/caregiver/plan" tone="quiet" full>
          Cancel and go back
        </ButtonLink>
      </Stack>
    </Page>
  );
}
