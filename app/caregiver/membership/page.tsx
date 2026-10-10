import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { loadFamilyContext } from '@/lib/queries/caregiver';
import { loadMedwynOne, loadMembership } from '@/lib/queries/catalog';
import { COLLECTION_FEE_PAISE } from '@/lib/pricing';
import { formatINR } from '@/lib/money';
import { cancelMembership } from '@/app/actions/payments';
import { BrandMark } from '@/components/brand-mark';
import { MembershipJoin } from '@/components/membership-join';
import { Badge, Button, Card, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Medwyn One' };
export const dynamic = 'force-dynamic';

export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string }>;
}) {
  const { joined } = await searchParams;
  const { family } = await loadFamilyContext();
  const [plan, membership] = await Promise.all([
    loadMedwynOne(),
    family ? loadMembership(family.id) : null,
  ]);

  // What membership has actually saved this family, from the bookings it covered.
  const saved = membership
    ? await db.booking.aggregate({
        where: { subscriptionId: membership.id, status: { notIn: ['CANCELLED', 'AWAITING_PAYMENT'] } },
        _sum: { discountPaise: true },
        _count: true,
      })
    : null;
  const savedPaise =
    (saved?._sum.discountPaise ?? 0) + (saved?._count ?? 0) * COLLECTION_FEE_PAISE;

  const perks = [
    {
      title: `${plan?.testDiscountPercent ?? 30}% off every test and package`,
      body: 'Applied automatically at checkout, for every person in your family.',
    },
    {
      title: 'No home-collection charge',
      body: `Saves ${formatINR(COLLECTION_FEE_PAISE)} on every visit.`,
    },
  ];

  return (
    <Page>
      <Stack gap="lg">
        <section className="brand-surface relative overflow-hidden rounded-[var(--radius-card-lg)] border-2 border-[var(--card-border)] p-6 [box-shadow:var(--glow)]">
          <div className="brand-content flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <BrandMark size={48} className="shrink-0 rounded-xl" />
              <div>
                <p className="text-small font-semibold tracking-widest uppercase">Membership</p>
                <h1 className="text-h1 font-bold tracking-tight">Medwyn One</h1>
              </div>
            </div>
            <p className="text-lead">
              {plan ? `${formatINR(plan.pricePaise)} a month, or ${formatINR(plan.annualPricePaise)} a year.` : ''}
            </p>
          </div>
        </section>

        {joined && membership && (
          <Card tone="green">
            <p className="font-semibold">Welcome to Medwyn One. Member prices now apply to every booking.</p>
          </Card>
        )}

        <ul className="flex flex-col gap-3">
          {perks.map((perk) => (
            <li key={perk.title} className="glass flex gap-4 rounded-[var(--radius-card)] border-2 p-4">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-wash)] font-bold text-[var(--color-primary)]"
              >
                ✓
              </span>
              <span>
                <span className="block font-semibold">{perk.title}</span>
                <span className="text-small text-[var(--color-ink-soft)]">{perk.body}</span>
              </span>
            </li>
          ))}
        </ul>

        {membership ? (
          <Card elevated>
            <Stack gap="md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-h3 font-semibold">Your membership</h2>
                <Badge tone="green" variant="tonal">
                  <span aria-hidden>✓</span> Active
                </Badge>
              </div>
              <p>
                {formatINR(membership.effectivePricePaise)}{' '}
                {membership.billingCycle === 'ANNUAL' ? 'a year' : 'a month'}
                {membership.currentPeriodEnd &&
                  ` · renews ${membership.currentPeriodEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
              </p>
              {membership.mandate?.instrumentHint && (
                <Muted>Paid from {membership.mandate.instrumentHint}</Muted>
              )}
              <p className="text-lead">
                Saved so far: <strong className="text-[var(--color-green)]">{formatINR(savedPaise)}</strong>
              </p>
              <form action={cancelMembership}>
                <Button type="submit" tone="secondary" full>
                  Cancel membership
                </Button>
              </form>
            </Stack>
          </Card>
        ) : plan ? (
          <MembershipJoin monthlyPaise={plan.pricePaise} yearlyPaise={plan.annualPricePaise} />
        ) : (
          <Card>
            <p>Medwyn One is not available right now.</p>
          </Card>
        )}
      </Stack>
    </Page>
  );
}
