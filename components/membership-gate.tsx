import Link from 'next/link';
import { formatINR } from '@/lib/money';
import { COLLECTION_FEE_PAISE } from '@/lib/pricing';
import { ButtonLink, Card, Eyebrow, H1, H2, Lead, Stack } from '@/components/ui';

/**
 * Booking, for a family without Medwyn One who has not chosen a lab: the
 * membership first, as the way the service is meant to be used, and the
 * other door (a particular lab, at its own prices) plainly beside it.
 */
export function MembershipGate({
  parentName,
  patientId,
  plan,
}: {
  parentName: string;
  patientId?: string;
  plan: { pricePaise: number; annualPricePaise: number; testDiscountPercent: number } | null;
}) {
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <H1>Book with Medwyn One</H1>
        <Lead>Home visits for {parentName} are part of the membership.</Lead>
      </Stack>

      <section className="brand-surface relative overflow-hidden rounded-[var(--radius-card-lg)] border border-[var(--card-border)] p-6 [box-shadow:var(--glow)]">
        <div className="brand-content flex flex-col gap-4">
          <Eyebrow>Membership</Eyebrow>
          <H2 className="text-h2">Medwyn One</H2>
          {plan && (
            <p className="text-lead">
              {formatINR(plan.pricePaise)} a month, or {formatINR(plan.annualPricePaise)} a year.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            <li>{plan?.testDiscountPercent ?? 30}% off every test and package</li>
            <li>No home-collection charge (saves {formatINR(COLLECTION_FEE_PAISE)} a visit)</li>
            <li>For everyone in the family. Cancel any time in the app.</li>
          </ul>
          <ButtonLink href="/caregiver/membership" className="self-start">
            Join Medwyn One
          </ButtonLink>
        </div>
      </section>

      <Card>
        <Stack gap="sm">
          <p className="font-semibold">Looking for a particular lab?</p>
          <p className="text-[var(--color-ink-soft)]">
            Search for it, and book it at that lab’s own prices, without a membership.
          </p>
          <Link
            href={patientId ? `/caregiver/labs?patient=${encodeURIComponent(patientId)}` : '/caregiver/labs'}
            className="inline-flex min-h-11 items-center self-start font-semibold underline"
          >
            Find a lab near {parentName}
          </Link>
        </Stack>
      </Card>
    </Stack>
  );
}
