'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { logCriticalCall, type ActionResult } from '@/app/actions/ops';
import { Button, Card, Field, Stack, Textarea } from '@/components/ui';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} full>
      {pending ? 'Saving…' : 'I have made the call'}
    </Button>
  );
}

export function CriticalCallForm({ alertId }: { alertId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(logCriticalCall, {
    ok: false,
  });

  return (
    <Card tone="surface">
      <form action={action}>
        <Stack gap="md">
          <input type="hidden" name="alertId" value={alertId} />

          <Field
            label="What was said, and by whom"
            required
            hint="Who you spoke to and what they said they would do. A timestamp alone is not a record of the conversation."
          >
            <Textarea name="callNote" required minLength={10} />
          </Field>

          <label className="flex items-start gap-4">
            <input
              type="checkbox"
              name="writtenFollowUpSent"
              className="mt-1 h-8 w-8 shrink-0 accent-[var(--color-primary)]"
            />
            <span>
              I have also sent the written follow-up.
              <span className="block text-[var(--text-small)] text-[var(--color-ink-faint)]">
                A phone call alone leaves the family with nothing to show their doctor. The
                alert stays open until this is done.
              </span>
            </span>
          </label>

          {state.reason && (
            <div className="rounded-[var(--radius-control)] border-2 border-[var(--color-yellow)] bg-[var(--color-yellow-wash)] p-4">
              <p className="font-semibold">{state.reason}</p>
              <p className="text-[var(--text-small)]">{state.remedy}</p>
            </div>
          )}
          {state.message && !state.reason && (
            <p className="font-semibold text-[var(--color-green)]">{state.message}</p>
          )}

          <Submit />
        </Stack>
      </form>
    </Card>
  );
}
