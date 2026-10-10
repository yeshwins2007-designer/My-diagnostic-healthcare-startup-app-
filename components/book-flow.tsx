'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createBooking, type CaregiverActionState } from '@/app/actions/caregiver';
import { formatINR } from '@/lib/money';
import { memberPrice, quote, type Membership } from '@/lib/pricing';
import { ClearableInput } from '@/components/clearable-input';
import { Badge, Button, RefusalNotice, Select } from '@/components/ui';

export interface BookItem {
  key: string;
  kind: 'panel' | 'test';
  name: string;
  description: string;
  pricePaise: number;
  fastingHours: number;
  includes: string[];
}

export interface BookPatient {
  id: string;
  name: string;
  address: string;
  labName: string;
}

const SLOTS = [
  { hour: 6, label: '6:30 – 7:30 am' },
  { hour: 7, label: '7:30 – 8:30 am' },
  { hour: 8, label: '8:30 – 9:30 am' },
  { hour: 9, label: '9:30 – 10:30 am' },
];

function Price({ pricePaise, membership }: { pricePaise: number; membership: Membership | null }) {
  if (!membership || membership.testDiscountPercent <= 0) {
    return <span className="text-lead font-bold">{formatINR(pricePaise)}</span>;
  }
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="text-lead font-bold text-[var(--color-primary)]">
        {formatINR(memberPrice(pricePaise, membership.testDiscountPercent))}
      </span>
      <span className="text-small text-[var(--color-ink-soft)] line-through">
        {formatINR(pricePaise)}
      </span>
    </span>
  );
}

function ProceedButton({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Checking the slot…' : `Proceed to pay ${formatINR(total)}`}
    </Button>
  );
}

/**
 * Booking, in two steps: choose what the laboratory offers, then confirm the
 * details. Prices on both steps come from lib/pricing, the same function the
 * server uses to write the charge, so the total here is the total charged.
 */
export function BookFlow({
  catalog,
  patients,
  membership,
  initialSelected,
  initialQuery,
  initialKind,
  initialPatientId,
  minDate,
}: {
  catalog: BookItem[];
  patients: BookPatient[];
  membership: Membership | null;
  initialSelected: string[];
  initialQuery: string;
  initialKind: 'all' | 'panel' | 'test';
  initialPatientId: string | null;
  minDate: string;
}) {
  const [step, setStep] = useState<'choose' | 'details'>(
    initialSelected.length > 0 ? 'details' : 'choose',
  );
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState(initialKind);
  const [patientId, setPatientId] = useState(initialPatientId ?? patients[0]?.id ?? '');
  const [date, setDate] = useState(minDate);
  const [hour, setHour] = useState(7);
  const [state, action] = useActionState<CaregiverActionState, FormData>(createBooking, {
    ok: false,
  });

  const byKey = useMemo(() => new Map(catalog.map((i) => [i.key, i])), [catalog]);
  const chosen = selected.map((k) => byKey.get(k)).filter((i): i is BookItem => !!i);
  const price = quote(chosen, membership);
  const withoutMembership = quote(chosen, null);
  const patient = patients.find((p) => p.id === patientId) ?? patients[0];
  const fasting = Math.max(0, ...chosen.map((i) => i.fastingHours));

  const q = query.trim().toLowerCase();
  const visible = catalog.filter(
    (i) =>
      (kind === 'all' || i.kind === kind) &&
      (!q ||
        i.name.toLowerCase().includes(q) ||
        i.includes.some((t) => t.toLowerCase().includes(q))),
  );

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  if (patients.length === 0) {
    return (
      <div className="glass rounded-[var(--radius-card-lg)] border-2 p-6">
        <p className="mb-4">Add the person the tests are for, and their address, first.</p>
        <Link href="/caregiver/onboarding" className="font-semibold text-[var(--color-primary)] underline">
          Add a parent
        </Link>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <form action={action} className="flex flex-col gap-6">
        <input type="hidden" name="items" value={selected.join(',')} />
        <input type="hidden" name="patientId" value={patient?.id ?? ''} />

        <button
          type="button"
          onClick={() => setStep('choose')}
          className="inline-flex min-h-12 items-center gap-2 self-start font-semibold text-[var(--color-primary)]"
        >
          <span aria-hidden>←</span> Change tests
        </button>

        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-h2 font-bold">Booking details</h1>
          <p className="text-lead text-[var(--color-ink-soft)]">
            {chosen.length === 1 ? chosen[0].name : `${chosen.length} items`}
          </p>
        </div>

        <section
          aria-label="Summary"
          className="glass flex flex-col gap-4 rounded-[var(--radius-card-lg)] border-2 p-5"
        >
          <h2 className="text-center text-h3 font-semibold">Summary</h2>

          <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-control)] border-2 border-[var(--card-border)] bg-[var(--field-bg)] p-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-small text-[var(--color-ink-soft)]">Date</span>
              <input
                type="date"
                name="date"
                min={minDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="min-h-12 rounded-[var(--radius-control)] border-2 border-[var(--card-border)] bg-transparent px-3 font-semibold"
              />
              {/* Native date fields format by device locale; spell it out so
                  10/11 can never be read as the wrong month. */}
              <span className="text-small font-semibold text-[var(--color-primary)]">
                {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-small text-[var(--color-ink-soft)]">Time</span>
              <Select
                name="windowStartHour"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="min-h-12 font-semibold"
              >
                {SLOTS.map((s) => (
                  <option key={s.hour} value={s.hour}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="rounded-[var(--radius-control)] border-2 border-[var(--card-border)] bg-[var(--field-bg)] p-4">
            <span className="text-small text-[var(--color-ink-soft)]">Patient</span>
            {patients.length > 1 ? (
              <Select
                aria-label="Patient"
                value={patient?.id}
                onChange={(e) => setPatientId(e.target.value)}
                className="mt-1 font-semibold"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="font-semibold">{patient?.name}</p>
            )}
            <p className="mt-1 text-small text-[var(--color-ink-soft)]">At home: {patient?.address}</p>
          </div>

          <div className="flex items-center gap-4 rounded-[var(--radius-control)] border-2 border-[var(--card-border)] bg-[var(--field-bg)] p-4">
            <div className="min-w-0 flex-1">
              <span className="text-small text-[var(--color-ink-soft)]">Laboratory</span>
              <p className="font-semibold">{patient?.labName}</p>
              <p className="text-small text-[var(--color-ink-soft)]">NABL-accredited partner</p>
            </div>
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-primary-wash)] text-[var(--color-primary)]"
            >
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path
                  d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx="12" cy="10" r="2.4" fill="currentColor" />
              </svg>
            </span>
          </div>

          {fasting > 0 && (
            <p className="rounded-[var(--radius-control)] border-2 border-[var(--color-yellow)] bg-[var(--color-yellow-wash)] p-4 text-small">
              These tests need {fasting} hours of fasting. The exact time to stop eating
              appears on the booking once it is confirmed.
            </p>
          )}

          <ul className="flex flex-col divide-y divide-[var(--color-line)]">
            {chosen.map((i) => (
              <li key={i.key} className="flex items-start justify-between gap-3 py-3">
                <span className="font-medium">{i.name}</span>
                <Price pricePaise={i.pricePaise} membership={membership} />
              </li>
            ))}
          </ul>

          <dl className="flex flex-col gap-2 border-t-2 border-[var(--color-line)] pt-4">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-ink-soft)]">Tests</dt>
              <dd>{formatINR(price.subtotalPaise)}</dd>
            </div>
            {price.discountPaise > 0 && (
              <div className="flex justify-between gap-3 text-[var(--color-green)]">
                <dt>Medwyn One discount</dt>
                <dd>− {formatINR(price.discountPaise)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-ink-soft)]">Home collection</dt>
              <dd>
                {price.collectionWaivedPaise > 0 ? (
                  <span className="text-[var(--color-green)]">
                    Free <span className="text-[var(--color-ink-soft)] line-through">{formatINR(price.collectionWaivedPaise)}</span>
                  </span>
                ) : (
                  formatINR(price.collectionFeePaise)
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3 text-lead font-bold">
              <dt>Total</dt>
              <dd className="text-[var(--color-primary)]">{formatINR(price.totalPaise)}</dd>
            </div>
          </dl>
        </section>

        {!membership && withoutMembership.totalPaise > 0 && (
          <Link
            href="/caregiver/membership"
            className="glass flex items-center justify-between gap-3 rounded-[var(--radius-card)] border-2 p-4"
          >
            <span>
              <span className="block font-semibold">Save with Medwyn One</span>
              <span className="text-small text-[var(--color-ink-soft)]">
                30% off every test and free home collection, from ₹499 a month.
              </span>
            </span>
            <span aria-hidden className="text-lead text-[var(--color-primary)]">→</span>
          </Link>
        )}

        {state.reason && <RefusalNotice title="We could not book that" reason={state.reason} remedy={state.remedy ?? ''} />}
        {state.message && !state.ok && (
          <p role="alert" className="font-semibold text-[var(--color-red)]">
            {state.message}
          </p>
        )}

        <div className="stick-above-nav sticky -mx-5 border-t-2 border-[var(--color-line)] bg-[var(--color-canvas)] px-5 py-4">
          <ProceedButton total={price.totalPaise} />
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 font-bold">Book tests</h1>
        <p className="text-[var(--color-ink-soft)]">
          Collected at home by a trained technician, tested at an NABL-accredited laboratory.
        </p>
      </div>

      <ClearableInput
        type="search"
        aria-label="Search tests and packages"
        placeholder="Search tests…"
        defaultValue={initialQuery}
        onValueChange={setQuery}
        clearLabel="Clear search"
      />

      <div role="tablist" aria-label="Show" className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['panel', 'Packages'],
            ['test', 'Single tests'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setKind(value)}
            className={`min-h-12 rounded-full border-2 px-4 text-small font-semibold ${
              kind === value
                ? 'border-transparent bg-[var(--color-primary)] text-[var(--color-primary-ink)]'
                : 'border-[var(--card-border)] text-[var(--color-ink-soft)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {membership && (
        <Badge tone="green" variant="tonal">
          <span aria-hidden>✓</span> Medwyn One prices shown
        </Badge>
      )}

      {visible.length === 0 ? (
        <p className="text-[var(--color-ink-soft)]">
          Nothing matches “{query}”. Try a shorter word, such as “sugar” or “thyroid”.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((item) => {
            const on = selected.includes(item.key);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(item.key)}
                  className={`tap-surface glass flex w-full items-start gap-4 rounded-[var(--radius-card)] border-2 p-4 text-left ${
                    on ? '!border-[var(--color-primary)]' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                      on
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-ink)]'
                        : 'border-[var(--color-line-strong)]'
                    }`}
                  >
                    {on && '✓'}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-semibold">{item.name}</span>
                    {item.kind === 'panel' && (
                      <span className="text-small text-[var(--color-ink-soft)]">
                        Package · {item.includes.length} tests
                      </span>
                    )}
                    {item.fastingHours > 0 && (
                      <span className="text-small text-[var(--color-ink-soft)]">
                        Needs {item.fastingHours} hours of fasting
                      </span>
                    )}
                  </span>
                  <Price pricePaise={item.pricePaise} membership={membership} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="stick-above-nav sticky -mx-5 border-t-2 border-[var(--color-line)] bg-[var(--color-canvas)] px-5 py-4">
        <Button
          type="button"
          full
          disabled={chosen.length === 0}
          onClick={() => {
            setStep('details');
            window.scrollTo({ top: 0 });
          }}
        >
          {chosen.length === 0
            ? 'Choose a test to continue'
            : `Continue · ${chosen.length} selected · ${formatINR(price.totalPaise)}`}
        </Button>
      </div>
    </div>
  );
}
