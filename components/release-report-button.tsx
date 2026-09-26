'use client';

import { useState, useTransition } from 'react';
import { verifyAndReleaseReport } from '@/app/actions/lab';
import { Button, Stack } from '@/components/ui';

/**
 * The permanent human-verification gate.
 *
 * Deliberately two-step: a coordinator must confirm they actually checked the
 * identifiers, rather than clicking through. This is the last point at which a
 * mislabelled sample can be caught before a result reaches a family under the
 * wrong person's name.
 */
export function ReleaseReportButton({ reportId }: { reportId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (result) {
    return (
      <p
        className={
          result.ok
            ? 'font-semibold text-[var(--color-green)]'
            : 'font-semibold text-[var(--color-red)]'
        }
      >
        {result.text}
      </p>
    );
  }

  if (!confirming) {
    return (
      <Button onClick={() => setConfirming(true)} full>
        Verify and release to the family
      </Button>
    );
  }

  return (
    <Stack gap="sm">
      <p className="font-semibold">
        Have you checked that the name and both identifiers on the report match the physical
        sample?
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const outcome = await verifyAndReleaseReport(reportId);
              setResult({
                ok: outcome.ok,
                text:
                  outcome.message ??
                  outcome.reason ??
                  'Something went wrong releasing this report.',
              });
            })
          }
        >
          {pending ? 'Releasing…' : 'Yes — release it'}
        </Button>
        <Button tone="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Not yet
        </Button>
      </div>
    </Stack>
  );
}
