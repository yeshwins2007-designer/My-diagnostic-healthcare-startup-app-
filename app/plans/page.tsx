import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { formatINR, formatINRWithWords } from '@/lib/money';
import { brand } from '@/lib/brand';
import { SiteHeader } from '@/components/site-header';
import {
  Badge,
  ButtonLink,
  Card,
  DataRow,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Plans' };
export const dynamic = 'force-dynamic';

/**
 * Three options with a clear middle recommendation converts better than an
 * open menu. Sathi exists to make Suraksha look reasonable; Parivaar exists to
 * make it look affordable. That is stated plainly rather than hidden, because
 * a family that feels handled does not stay.
 */
export default async function PlansPage() {
  const [plans, panels] = await Promise.all([
    db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { panels: { include: { panel: { include: { items: { include: { test: true } } } } } } },
    }),
    db.panel.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { items: { include: { test: true } } },
    }),
  ]);

  return (
    <>
      <SiteHeader />
      <Page wide>
        <Stack gap="lg">
          <Stack gap="sm">
            <H1>Plans</H1>
            <Lead>
              A one-off test tells you about one morning. Monitoring an elderly parent is not a
              one-off problem — so this is priced as a subscription, and the same person visits
              each month.
            </Lead>
          </Stack>

          <div className="grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                tone={plan.isRecommended ? 'primary' : 'surface'}
                className={plan.isRecommended ? 'ring-2 ring-[var(--color-primary)]' : ''}
              >
                <Stack gap="sm">
                  {plan.isRecommended && <Badge tone="primary">Most families choose this</Badge>}
                  <H2 className="text-[var(--text-h3)]">{plan.name}</H2>
                  <p className="text-[var(--color-ink-soft)]">{plan.tagline}</p>

                  <p className="text-[var(--text-h1)] font-bold leading-none">
                    {formatINR(plan.pricePaise)}
                  </p>
                  <Muted>per month · {formatINRWithWords(plan.pricePaise)}</Muted>
                  <Muted>
                    Or {formatINR(plan.annualPricePaise)} for a year — two months free.
                  </Muted>

                  <ul className="mt-3 flex flex-col gap-2">
                    {[
                      plan.visitsPerMonth >= 2
                        ? 'Twice-monthly home visits'
                        : plan.visitsPerMonth >= 1
                          ? 'A home visit every month, from the same assigned technician'
                          : 'A home visit every quarter',
                      ...plan.panels.map(
                        (pp) => `${pp.panel.name}, ${pp.perYear} times a year`,
                      ),
                      plan.patientsCovered > 1 ? `Covers ${plan.patientsCovered} parents` : null,
                      'A plain-language summary, and a printed large-font card left with them',
                      plan.visitsPerMonth >= 1
                        ? 'A call to you within 24 hours of every report'
                        : 'WhatsApp support with a next-day reply',
                      plan.includesPriority ? 'Priority slots' : null,
                      plan.includesPhysicianReview
                        ? 'A quarterly video review with a partner physician'
                        : null,
                      plan.includesPhysicianReview ? 'A named coordinator on a direct line' : null,
                      'An immediate phone call if the laboratory flags anything urgent',
                    ]
                      .filter(Boolean)
                      .map((line) => (
                        <li key={line as string} className="flex gap-3">
                          <span aria-hidden className="text-[var(--color-primary)]">✓</span>
                          <span>{line}</span>
                        </li>
                      ))}
                  </ul>

                  <ButtonLink
                    href="/join?as=individual"
                    tone={plan.isRecommended ? 'primary' : 'secondary'}
                    full
                  >
                    Start {plan.name}
                  </ButtonLink>
                </Stack>
              </Card>
            ))}
          </div>

          <Card tone="sunken">
            <Stack gap="sm">
              <H3>How we price, and what we will not do</H3>
              <ul className="flex flex-col gap-2">
                <li>
                  <strong>We are never the cheapest.</strong> We price within about 10% of the
                  local market and try to win on service. Discount-led diagnostics is a race we
                  cannot fund and you would not want us to.
                </li>
                <li>
                  <strong>Bundles, not itemised lists.</strong> A named panel with one price is
                  easier to say yes to than fourteen line items — and easier to check we did.
                </li>
                <li>
                  <strong>The first 25 families pay about 40% less, for life,</strong> in
                  exchange for a written testimonial once we have looked after your parent for
                  three months. We are buying proof, not revenue.
                </li>
                <li>
                  <strong>No lock-in and no retention calls.</strong> Pause or cancel from your
                  own account page. Nobody has to ring anyone to leave.
                </li>
              </ul>
            </Stack>
          </Card>

          <Stack gap="md">
            <H2>What is in each panel</H2>
            <div className="grid gap-5 md:grid-cols-2">
              {panels.map((panel) => (
                <Card key={panel.id}>
                  <Stack gap="sm">
                    <H3>{panel.name}</H3>
                    <p className="text-[var(--color-ink-soft)]">{panel.description}</p>
                    <DataRow label="If bought on its own" value={formatINR(panel.pricePaise)} />
                    {panel.fastingHours > 0 && (
                      <DataRow label="Fasting" value={`${panel.fastingHours} hours`} />
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                      {panel.items.map((item) => (
                        <Badge key={item.id}>{item.test.name}</Badge>
                      ))}
                    </div>
                  </Stack>
                </Card>
              ))}
            </div>
          </Stack>

          <Card>
            <Stack gap="sm">
              <H3>Paying</H3>
              <p>
                UPI Autopay, card, netbanking — or cash handed to the technician at the door,
                with a receipt. Plenty of families prefer cash and we would rather take it than
                pretend that is unusual.
              </p>
              <Muted>{brand.disclaimer}</Muted>
            </Stack>
          </Card>
        </Stack>
      </Page>
    </>
  );
}
