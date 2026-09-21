import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { loadFamilyContext } from '@/lib/queries/caregiver';
import { formatINR, formatINRWithWords } from '@/lib/money';
import { providerMode } from '@/lib/env';
import { PlanChooser } from '@/components/plan-chooser';
import { LabChooser } from '@/components/lab-chooser';
import { labChoicesForPatient } from '@/app/actions/caregiver';
import {
  Badge,
  Card,
  DataRow,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  SimulatedChip,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Plan & billing' };
export const dynamic = 'force-dynamic';

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient: patientParam } = await searchParams;
  const { family } = await loadFamilyContext();
  if (!family) redirect('/caregiver/onboarding');

  const [plans, activeSubscriberCount] = await Promise.all([
    db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { panels: { include: { panel: true } } },
    }),
    db.subscription.count({ where: { status: { in: ['ACTIVE', 'PENDING'] } } }),
  ]);

  const unsubscribed = family.patients.filter((p) => p.subscriptions.length === 0);
  const subscribed = family.patients.filter((p) => p.subscriptions.length > 0);
  const target =
    family.patients.find((p) => p.id === patientParam) ?? unsubscribed[0] ?? null;

  const foundingSpotsLeft = Math.max(0, 25 - activeSubscriberCount);

  // Fetched for every patient, not just the one being subscribed: the chooser
  // tells families they can change laboratory at any time, and that is only
  // true if an already-subscribed parent has the control too.
  const labChoicesByPatient = new Map(
    await Promise.all(
      family.patients.map(
        async (p) => [p.id, await labChoicesForPatient(p.id)] as const,
      ),
    ),
  );
  const labChoices = target ? labChoicesByPatient.get(target.id) : null;

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Plan &amp; billing</H1>
          <Lead>
            A one-off test tells you about one morning. Monitoring an elderly parent is not a
            one-off problem, so this is priced as a subscription.
          </Lead>
          {providerMode.payments === 'simulated' && <SimulatedChip what="payments" />}
        </Stack>

        {subscribed.length > 0 && (
          <Stack gap="md">
            <H2>Current plans</H2>
            {subscribed.map((patient) => {
              const sub = patient.subscriptions[0];
              return (
                <Card key={patient.id}>
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <H3>{patient.name}</H3>
                      <Badge tone="green">{sub.plan.name}</Badge>
                    </div>
                    <DataRow
                      label={`Charged every ${sub.billingCycle === 'ANNUAL' ? 'year' : 'month'}`}
                      value={formatINR(sub.effectivePricePaise)}
                    />
                    {sub.isFoundingMember && (
                      <DataRow
                        label="Founding price"
                        value={`${sub.discountPercent}% off, locked for life`}
                        tone="green"
                      />
                    )}
                    <DataRow
                      label="Payment method"
                      value={
                        sub.mandate?.status === 'ACTIVE'
                          ? `${sub.mandate.method.replace(/_/g, ' ').toLowerCase()} · ${sub.mandate.instrumentHint}`
                          : 'not set up yet'
                      }
                      tone={sub.mandate?.status === 'ACTIVE' ? 'green' : 'yellow'}
                    />
                    {sub.assignedTechnician && (
                      <DataRow
                        label="Your technician"
                        value={sub.assignedTechnician.user.name}
                      />
                    )}
                    {sub.currentPeriodEnd && (
                      <DataRow
                        label="Next payment"
                        value={sub.currentPeriodEnd.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      />
                    )}
                  </Stack>
                </Card>
              );
            })}

            {/* Changing laboratory must stay available after subscribing —
                the chooser promises exactly that. */}
            {subscribed.map((patient) => {
              const c = labChoicesByPatient.get(patient.id);
              if (!c?.ok || c.choices.length === 0) return null;
              return (
                <LabChooser
                  key={`lab-${patient.id}`}
                  patientId={patient.id}
                  patientName={patient.name}
                  panelName={c.panelName}
                  options={c.choices}
                  selectedLabId={c.selectedLabId}
                />
              );
            })}
          </Stack>
        )}

        {target && (
          <Stack gap="md">
            <H2>Choose a plan for {target.name}</H2>

            {foundingSpotsLeft > 0 && (
              <Card tone="primary">
                <Stack gap="sm">
                  <H3>Founding price — {foundingSpotsLeft} left</H3>
                  <p>
                    The first 25 families get 40% off, locked for life, in exchange for a written
                    testimonial once we have looked after your parent for three months.
                  </p>
                  <Muted>
                    We are buying proof, not revenue. If we are not good enough to earn that
                    testimonial, you should not be paying us either way.
                  </Muted>
                </Stack>
              </Card>
            )}

            {labChoices?.ok && labChoices.choices.length > 0 && (
              <LabChooser
                patientId={target.id}
                patientName={target.name}
                panelName={labChoices.panelName}
                options={labChoices.choices}
                selectedLabId={labChoices.selectedLabId}
              />
            )}

            <PlanChooser
              patientId={target.id}
              patientName={target.name}
              foundingDiscount={foundingSpotsLeft > 0 ? 40 : 0}
              plans={plans.map((p) => ({
                id: p.id,
                code: p.code,
                name: p.name,
                tagline: p.tagline,
                pricePaise: p.pricePaise,
                annualPricePaise: p.annualPricePaise,
                isRecommended: p.isRecommended,
                includes: [
                  p.visitsPerMonth >= 2
                    ? 'Twice-monthly home visits'
                    : p.visitsPerMonth >= 1
                      ? 'Monthly home visit, same assigned technician'
                      : 'One home visit per quarter',
                  ...p.panels.map(
                    (pp) => `${pp.panel.name} — ${pp.perYear}× a year`,
                  ),
                  p.patientsCovered > 1 ? `Covers ${p.patientsCovered} parents` : null,
                  'Plain-language summary and a printed large-font card',
                  p.visitsPerMonth >= 1 ? 'A family call within 24 hours of every report' : null,
                  p.includesPriority ? 'Priority slots' : null,
                  p.includesPhysicianReview ? 'Quarterly video review with a partner physician' : null,
                  'An immediate phone call if the laboratory flags anything urgent',
                ].filter(Boolean) as string[],
                priceInWords: formatINRWithWords(p.pricePaise),
              }))}
            />
          </Stack>
        )}

        {!target && subscribed.length > 0 && (
          <Muted>Every parent on your account already has a plan.</Muted>
        )}
      </Stack>
    </Page>
  );
}
