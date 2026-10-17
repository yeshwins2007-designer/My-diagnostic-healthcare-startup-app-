'use client';

import { useActionState, useState, useTransition } from 'react';
import { requestRateChange, setTestPaused, type LabActionState } from '@/app/actions/lab';
import { Button, cx, Field, Input, Select, Textarea } from '@/components/ui';

/**
 * Pausing a test the bench cannot run today. Pausing asks why in place (an
 * analyser under service, a reagent out), so ops can see it at a glance.
 */
export function PauseToggle({
  testId,
  testName,
  paused,
  canEdit,
}: {
  testId: string;
  testName: string;
  paused: boolean;
  canEdit: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<LabActionState | null>(null);
  const [pending, start] = useTransition();

  const run = (nextPaused: boolean) =>
    start(async () => {
      const r = await setTestPaused(testId, nextPaused, reason);
      setResult(r);
      if (r.ok) {
        setAsking(false);
        setReason('');
      }
    });

  if (!canEdit) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {paused ? (
        <Button type="button" tone="secondary" disabled={pending} onClick={() => run(false)} className="min-h-11 px-4">
          {pending ? 'Resuming…' : 'Resume'}
        </Button>
      ) : asking ? (
        <div className="flex w-full flex-col gap-2 sm:w-72">
          <label className="sr-only" htmlFor={`pause-${testId}`}>
            Why is {testName} paused?
          </label>
          <Input
            id={`pause-${testId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Analyser under service"
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" tone="secondary" onClick={() => setAsking(false)} className="min-h-11 flex-1 px-3">
              Cancel
            </Button>
            <Button type="button" disabled={pending || reason.trim().length < 3} onClick={() => run(true)} className="min-h-11 flex-1 px-3">
              {pending ? 'Pausing…' : 'Pause'}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" tone="quiet" onClick={() => setAsking(true)} className="min-h-11 px-4 underline">
          Pause test
        </Button>
      )}
      {result && !result.ok && <p className="text-[0.8125rem] font-medium text-[var(--color-red)]">{result.message}</p>}
    </div>
  );
}

/** Rates are in the signed agreement, so a change is a request, not an edit. */
export function RateChangeForm({ tests, canEdit }: { tests: { id: string; label: string }[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState<LabActionState, FormData>(requestRateChange, { ok: false });

  if (!canEdit) {
    return <p className="text-small text-[var(--color-ink-faint)]">An owner or a manager can request a rate change.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Test" required>
          <Select name="testId" required defaultValue="">
            <option value="" disabled>
              Choose a test
            </option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Proposed rate (₹)" required>
          <Input name="rupees" type="number" inputMode="numeric" min={1} max={100000} step={1} required className="font-mono" />
        </Field>
      </div>
      <Field label="Why" required hint="For example, a new reagent supplier, or a change in method.">
        <Textarea name="why" required minLength={10} className="min-h-20" />
      </Field>
      {state.message && (
        <p role="status" className={cx('text-small font-medium', state.ok ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]')}>
          {state.message}
        </p>
      )}
      <Button type="submit" tone="secondary" disabled={pending} className="self-start">
        {pending ? 'Sending…' : 'Send the request'}
      </Button>
    </form>
  );
}
