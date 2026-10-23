'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveCallSettings, type CallSettingsState } from '@/app/actions/calls';
import type { VoiceCallKind } from '@/lib/enums';
import { CallChoices, type CallParent } from '@/components/call-choices';
import { Button } from '@/components/ui';

/** The call switches in Profile: the same choices as the first-run sheet. */
export function CallSettings({
  parents,
  familyLocale,
  preferences,
}: {
  parents: CallParent[];
  familyLocale: string;
  preferences: Record<VoiceCallKind, boolean>;
}) {
  const [state, action, pending] = useActionState<CallSettingsState, FormData>(saveCallSettings, { ok: false });
  const [timeZone, setTimeZone] = useState('');
  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? '');
    } catch {
      setTimeZone('');
    }
  }, []);

  return (
    <form action={action} className="flex flex-col gap-4" id="calls">
      <input type="hidden" name="timeZone" value={timeZone} />
      <CallChoices parents={parents} familyLocale={familyLocale} initial={preferences} />
      {state.message && (
        <p role="status" className={state.ok ? 'font-semibold text-[var(--color-green)]' : 'font-semibold text-[var(--color-red)]'}>
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Saving…' : 'Save calls'}
      </Button>
    </form>
  );
}
