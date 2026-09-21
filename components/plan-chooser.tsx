'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { startSubscription, type PaymentActionState } from '@/app/actions/payments';
import { Badge, Button, Card, H3, Muted, Stack } from '@/components/ui';

export interface PlanOption {
  id: string;
  code: string;
  name: string;
  tagline: string;
  pricePaise: number;
  annualPricePaise: number;
  isRecommended: boolean;
  includes: string[];
  priceInWords: string;
}

const rupees = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Setting it up…' : label}
    </Button>
  );
}

export function PlanChooser({
  patientId,
  patientName,
  plans,
  foundingDiscount,
}: {
  patientId: string;
  patientName: string;
  plans: PlanOption[];
  foundingDiscount: number;
}) {
  const recommended = plans.find((p) => p.isRecommended) ?? plans[1] ?? plans[0];
  const [selected, setSelected] = useState(recommended?.id ?? '');
  const [cycle, setCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [method, setMethod] = useState<'UPI_AUTOPAY' | 'CARD' | 'CASH'>('UPI_AUTOPAY');
  const [state, action] = useActionState<PaymentActionState, FormData>(startSubscription, {
    ok: false,
  });

  const plan = plans.find((p) => p.id === selected);
  const base = plan
    ? cycle === 'ANNUAL'
      ? plan.annualPricePaise
      : plan.pricePaise
    : 0;
  const effective = Math.round(base * (1 - foundingDiscount / 100));

  return (
    <Stack gap="md">
      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((p) => {
          const isSelected = p.id === selected;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              aria-pressed={isSelected}
              className={`rounded-[var(--radius-card)] border-2 p-5 text-left ${
                isSelected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)] ring-2 ring-[var(--color-primary)]'
                  : 'border-[var(--color-line)] bg-[var(--color-surface)]'
              }`}
            >
              <Stack gap="sm">
                {p.isRecommended && <Badge tone="primary">Most families choose this</Badge>}
                <H3>{p.name}</H3>
                <p className="text-[var(--color-ink-soft)]">{p.tagline}</p>
                <p className="text-[var(--text-h2)] font-bold">
                  {rupees(p.pricePaise)}
                  <span className="text-[var(--text-small)] font-normal"> / month</span>
                </p>
                {/* Digits and words. A comma is not obvious to everyone. */}
                <Muted>{p.priceInWords}</Muted>
                <ul className="mt-2 flex flex-col gap-2 text-[var(--text-small)]">
                  {p.includes.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden className="text-[var(--color-primary)]">✓</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </Stack>
            </button>
          );
        })}
      </div>

      <form action={action}>
        <Card>
          <Stack gap="md">
            <input type="hidden" name="patientId" value={patientId} />
            <input type="hidden" name="planId" value={selected} />
            <input type="hidden" name="billingCycle" value={cycle} />
            <input type="hidden" name="method" value={method} />

            <Stack gap="sm">
              <H3>How often would you like to pay?</H3>
              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceTile
                  selected={cycle === 'MONTHLY'}
                  onClick={() => setCycle('MONTHLY')}
                  title="Every month"
                  detail={plan ? `${rupees(plan.pricePaise)} a month` : ''}
                />
                <ChoiceTile
                  selected={cycle === 'ANNUAL'}
                  onClick={() => setCycle('ANNUAL')}
                  title="Once a year"
                  detail={
                    plan
                      ? `${rupees(plan.annualPricePaise)} a year — two months free`
                      : ''
                  }
                />
              </div>
            </Stack>

            <Stack gap="sm">
              <H3>How would you like to pay?</H3>
              <div className="grid gap-3 sm:grid-cols-3">
                <ChoiceTile
                  selected={method === 'UPI_AUTOPAY'}
                  onClick={() => setMethod('UPI_AUTOPAY')}
                  title="UPI Autopay"
                  detail="Approve once, then it happens automatically"
                />
                <ChoiceTile
                  selected={method === 'CARD'}
                  onClick={() => setMethod('CARD')}
                  title="Card"
                  detail="Debit or credit card"
                />
                <ChoiceTile
                  selected={method === 'CASH'}
                  onClick={() => setMethod('CASH')}
                  title="Cash at the door"
                  detail="Pay the technician; they give a receipt"
                />
              </div>
            </Stack>

            {/* Repeat back what will happen, before it happens. */}
            {plan && (
              <Card tone="sunken">
                <Stack gap="sm">
                  <H3 className="text-[var(--text-lead)]">Just to be clear</H3>
                  <p>
                    {patientName} will be on <strong>{plan.name}</strong>. You will pay{' '}
                    <strong>{rupees(effective)}</strong>{' '}
                    {cycle === 'ANNUAL' ? 'once a year' : 'every month'}
                    {foundingDiscount > 0 && `, at the founding price, locked for life`}
                    {method === 'CASH'
                      ? ', in cash to the technician at each visit.'
                      : method === 'UPI_AUTOPAY'
                        ? ', automatically by UPI once you approve it.'
                        : ', automatically from your card.'}
                  </p>
                  <Muted>
                    You can pause or cancel at any time from this page. We do not lock anyone
                    in, and nobody has to ring a call centre to leave.
                  </Muted>
                </Stack>
              </Card>
            )}

            {state.reason && (
              <div className="rounded-[var(--radius-control)] border-2 border-[var(--color-red)] bg-[var(--color-red-wash)] p-4">
                <p className="font-semibold">{state.reason}</p>
                <p className="text-[var(--text-small)]">{state.remedy}</p>
              </div>
            )}

            {state.ok && state.authUrl && (
              <a
                href={state.authUrl}
                className="inline-flex min-h-[var(--size-touch)] w-full items-center justify-center rounded-[var(--radius-control)] border-2 border-[var(--color-primary)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-ink)]"
              >
                Approve the {method === 'UPI_AUTOPAY' ? 'UPI mandate' : 'card mandate'}
              </a>
            )}

            {state.ok && !state.authUrl && state.message && (
              <p className="font-semibold text-[var(--color-green)]">{state.message}</p>
            )}
            {!state.ok && state.message && (
              <p className="font-semibold text-[var(--color-red)]">{state.message}</p>
            )}

            {!state.authUrl && (
              <Submit
                label={
                  method === 'CASH'
                    ? `Start ${plan?.name ?? 'this plan'} — pay at the door`
                    : `Continue to approve ${rupees(effective)}`
                }
              />
            )}
          </Stack>
        </Card>
      </form>
    </Stack>
  );
}

function ChoiceTile({
  selected,
  onClick,
  title,
  detail,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-[var(--size-touch-lg)] rounded-[var(--radius-control)] border-2 p-4 text-left ${
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
          : 'border-[var(--color-line-strong)] bg-[var(--color-surface)]'
      }`}
    >
      <span className="block font-semibold">{title}</span>
      <span className="block text-[var(--text-small)] text-[var(--color-ink-soft)]">
        {detail}
      </span>
    </button>
  );
}
