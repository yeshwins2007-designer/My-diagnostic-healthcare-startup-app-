'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { bookVisit, type CaregiverActionState } from '@/app/actions/caregiver';
import { Button, Card, Field, Muted, Select, Stack } from '@/components/ui';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Checking…' : 'Book this visit'}
    </Button>
  );
}

/** Only morning slots: fasting samples dominate, and routes run at dawn. */
const SLOTS = [
  { hour: 6, label: '6:30 – 7:30 in the morning' },
  { hour: 7, label: '7:30 – 8:30 in the morning' },
  { hour: 8, label: '8:30 – 9:30 in the morning' },
  { hour: 9, label: '9:30 – 10:30 in the morning' },
];

export function BookVisitForm({
  patients,
  panels,
}: {
  patients: { id: string; name: string }[];
  panels: { id: string; name: string; description: string; fastingHours: number }[];
}) {
  const [state, action] = useActionState<CaregiverActionState, FormData>(bookVisit, {
    ok: false,
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);

  return (
    <Card>
      <form action={action}>
        <Stack gap="md">
          <Field label="Who is it for?" required>
            <Select name="patientId" required>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Which panel?" required>
            <Select name="panelId" required>
              {panels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.fastingHours > 0 ? ` — ${p.fastingHours}h fasting` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Which morning?" required>
            <input
              type="date"
              name="date"
              min={minDate}
              defaultValue={minDate}
              required
              className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-control)] border-2 border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 text-[var(--text-base)]"
            />
          </Field>

          <Field label="Which time?" required>
            <Select name="windowStartHour" required defaultValue="7">
              {SLOTS.map((slot) => (
                <option key={slot.hour} value={slot.hour}>
                  {slot.label}
                </option>
              ))}
            </Select>
          </Field>

          {state.reason && (
            <div className="rounded-[var(--radius-control)] border-2 border-[var(--color-red)] bg-[var(--color-red-wash)] p-4">
              <p className="font-semibold">{state.reason}</p>
              <p className="text-[var(--text-small)]">{state.remedy}</p>
            </div>
          )}
          {state.ok && state.message && (
            <p className="font-semibold text-[var(--color-green)]">{state.message}</p>
          )}
          {!state.ok && state.message && !state.reason && (
            <p className="font-semibold text-[var(--color-red)]">{state.message}</p>
          )}

          <Muted>
            We will confirm in writing, with the name of the technician who will come, and send
            fasting instructions the evening before.
          </Muted>

          <Submit />
        </Stack>
      </form>
    </Card>
  );
}
