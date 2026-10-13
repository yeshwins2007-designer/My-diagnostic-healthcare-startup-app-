'use client';

import { useActionState, useState } from 'react';
import { uploadResults, type LabActionState } from '@/app/actions/lab';
import { Button, Field, Input } from '@/components/ui';

export interface ResultTest {
  code: string;
  name: string;
  unit: string;
  /** "4.0–5.7", or null for a descriptive test (urine routine). */
  range: string | null;
}

/**
 * Results for one order: one field per test in it, so nothing can be left
 * out by accident. The fields are joined into the CODE=value form the server
 * parses, and the server checks it all again: every test present, numbers
 * where a range exists, nothing saved unless all of it is right.
 */
export function ResultsForm({
  bookingId,
  reference,
  tests,
  pathologistName,
  pathologistReg,
  canSign,
}: {
  bookingId: string;
  reference: string;
  tests: ResultTest[];
  pathologistName: string;
  pathologistReg: string;
  canSign: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionState<LabActionState, FormData>(uploadResults, { ok: false });
  const joined = tests.map((t) => `${t.code}=${(values[t.code] ?? '').trim()}`).join(' | ');

  if (!canSign) {
    return (
      <p className="text-small text-[var(--color-ink-faint)]">
        Results are entered and signed by an owner or a manager of the laboratory.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3" aria-label={`Results for ${reference}`}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="values" value={joined} />
      <div className="grid gap-3 sm:grid-cols-2">
        {tests.map((t) => (
          <Field key={t.code} label={`${t.code} · ${t.name}`} hint={t.range ? `Reference ${t.range} ${t.unit}`.trim() : 'Descriptive'}>
            <Input
              inputMode={t.range ? 'decimal' : 'text'}
              autoComplete="off"
              required
              value={values[t.code] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [t.code]: e.target.value }))}
              className="font-mono"
            />
          </Field>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Signing pathologist" required>
          <Input name="pathologistName" defaultValue={pathologistName} required />
        </Field>
        <Field label="Registration number" required>
          <Input name="pathologistReg" defaultValue={pathologistReg} required className="font-mono" />
        </Field>
      </div>
      {state.message && (
        <p role="status" className={state.ok ? 'text-small font-medium text-[var(--color-green)]' : 'text-small font-medium text-[var(--color-red)]'}>
          {state.message}
        </p>
      )}
      {state.reason && (
        <p role="alert" className="text-small text-[var(--color-red)]">
          <strong>{state.reason}</strong> {state.remedy}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Signing…' : 'Sign and submit results'}
      </Button>
    </form>
  );
}
