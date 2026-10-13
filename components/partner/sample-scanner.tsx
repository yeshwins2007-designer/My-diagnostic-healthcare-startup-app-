'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { receiveSpecimen, rejectSpecimen, type LabActionState } from '@/app/actions/lab';
import { Button, cx, Field, Input, Textarea } from '@/components/ui';

/**
 * The intake desk's scanner. A USB or Bluetooth barcode scanner types the
 * code and presses Enter, so Enter submits: scan, scan, scan, without
 * touching the mouse. The field clears and keeps focus after each good scan.
 */
export function SampleScanner() {
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState<LabActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [rejectState, rejectAction, rejecting] = useActionState<LabActionState, FormData>(rejectSpecimen, { ok: false });

  function receive(event: React.FormEvent) {
    event.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    startTransition(async () => {
      const r = await receiveSpecimen(code);
      setResult(r);
      if (r.ok) setBarcode('');
      input.current?.focus();
    });
  }

  return (
    <section aria-labelledby="scan-heading" className="panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="scan-heading" className="text-[0.9375rem] font-semibold tracking-tight">
          Receive a sample
        </h2>
        <span className="text-small text-[var(--color-ink-faint)]">Scan the vial, or type its code and press Enter</span>
      </div>
      <form onSubmit={receive} className="flex flex-wrap gap-2">
        <label htmlFor="scan-input" className="sr-only">
          Sample barcode
        </label>
        <Input
          id="scan-input"
          ref={input}
          value={barcode}
          onChange={(e) => setBarcode(e.target.value.toUpperCase())}
          placeholder="SPC-240002"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          className="min-w-0 flex-1 basis-56 font-mono text-[1.125rem] tracking-[0.06em]"
        />
        <Button type="submit" disabled={pending || !barcode.trim()} className="basis-32">
          {pending ? 'Checking…' : 'Receive'}
        </Button>
      </form>
      <p
        role="status"
        aria-live="polite"
        className={cx('text-small font-medium', result?.ok ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]')}
      >
        {result?.message}
      </p>

      <button
        type="button"
        onClick={() => setRejectOpen((o) => !o)}
        aria-expanded={rejectOpen}
        className="min-h-11 self-start text-small font-medium text-[var(--color-ink-soft)] underline"
      >
        {rejectOpen ? 'Close' : 'Reject a sample (haemolysed, mislabelled, leaked)'}
      </button>
      <div className="disclosure" data-open={rejectOpen}>
        <div>
          <form action={rejectAction} className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-3">
            <Field label="Sample barcode" required>
              <Input name="barcode" required placeholder="SPC-240002" className="font-mono uppercase" autoComplete="off" />
            </Field>
            <Field label="What is wrong with it" required hint="The family gets a free recollection within 24 hours, and our team calls them.">
              <Textarea name="reason" required minLength={5} className="min-h-20" />
            </Field>
            {rejectState.message && (
              <p className={cx('text-small font-medium', rejectState.ok ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]')}>
                {rejectState.message}
              </p>
            )}
            <Button type="submit" tone="danger" disabled={rejecting}>
              {rejecting ? 'Recording…' : 'Reject the sample'}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
