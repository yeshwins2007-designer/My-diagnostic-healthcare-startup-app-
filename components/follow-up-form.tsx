'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { completeFollowUp, type ActionResult } from '@/app/actions/ops';
import { Button, Field, Stack, Textarea } from '@/components/ui';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} full>
      {pending ? 'Saving…' : 'Call made — record it'}
    </Button>
  );
}

export function FollowUpForm({
  callId,
  questions,
}: {
  callId: string;
  questions: string[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(completeFollowUp, {
    ok: false,
  });

  return (
    <form action={action}>
      <Stack gap="md">
        <input type="hidden" name="callId" value={callId} />

        <Field
          label={questions[0]}
          required
          hint="Write what they actually said. If they said “nothing”, write “nothing”."
        >
          <Textarea name="whatWorriedYou" required minLength={3} className="min-h-24" />
        </Field>

        <Field label={questions[1]} required>
          <Textarea name="whatWouldImprove" required minLength={3} className="min-h-24" />
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

        <Submit />
      </Stack>
    </form>
  );
}
