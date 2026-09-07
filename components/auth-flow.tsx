'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  sendCode,
  checkCode,
  completeProfile,
  type AuthState,
} from '@/app/actions/auth';
import { LOCALES } from '@/lib/i18n/locales';
import { Button, Card, Field, Input, Muted, Select, Stack } from '@/components/ui';

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Please wait…' : children}
    </Button>
  );
}

export function AuthFlow({ intent }: { intent: 'individual' | 'business' }) {
  const [phoneState, phoneAction] = useActionState<AuthState, FormData>(sendCode, {
    step: 'PHONE',
    intent,
  });
  const [codeState, codeAction] = useActionState<AuthState, FormData>(checkCode, {
    step: 'CODE',
    intent,
  });
  const [profileState, profileAction] = useActionState<AuthState, FormData>(
    completeProfile,
    { step: 'PROFILE', intent },
  );

  // The furthest step any action has reached wins, so a failed code entry does
  // not bounce the visitor back to typing their number again.
  const step =
    profileState.step === 'PROFILE' && (profileState.error || codeState.step === 'PROFILE')
      ? 'PROFILE'
      : codeState.step === 'PROFILE'
        ? 'PROFILE'
        : phoneState.step === 'CODE' || codeState.error
          ? 'CODE'
          : 'PHONE';

  const phone = codeState.phone ?? phoneState.phone ?? '';

  if (step === 'PROFILE') {
    return (
      <Card>
        <form action={profileAction}>
          <Stack gap="md">
            <input type="hidden" name="phone" value={phone} />
            <input type="hidden" name="intent" value={intent} />

            <Field label="Your name" required hint="The name we will use when we call you.">
              <Input name="name" autoComplete="name" required autoFocus />
            </Field>

            <Field
              label="Language you are most comfortable in"
              hint="We will write and speak to you in this language."
            >
              <Select name="locale" defaultValue="en">
                {LOCALES.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.native} — {l.english}
                  </option>
                ))}
              </Select>
            </Field>

            {profileState.error && (
              <p className="font-medium text-[var(--color-red)]">{profileState.error}</p>
            )}

            <Submit>
              {intent === 'business' ? 'Continue to the application' : 'Create my account'}
            </Submit>
          </Stack>
        </form>
      </Card>
    );
  }

  if (step === 'CODE') {
    const devCode = phoneState.devCode;
    return (
      <Card>
        <form action={codeAction}>
          <Stack gap="md">
            <input type="hidden" name="phone" value={phone} />
            <input type="hidden" name="intent" value={intent} />

            <Field
              label="Enter the six-digit code"
              required
              hint={`Sent to ${phone}.`}
              error={codeState.error}
            >
              <Input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                className="text-center font-mono tracking-[0.5em]"
              />
            </Field>

            {devCode && (
              <div className="rounded-[var(--radius-control)] border-2 border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)] p-4">
                <Muted>
                  No SMS gateway is configured, so here is the code:{' '}
                  <strong className="font-mono text-[var(--text-lead)] text-[var(--color-ink)]">
                    {devCode}
                  </strong>
                </Muted>
              </div>
            )}

            <Submit>Verify and continue</Submit>
          </Stack>
        </form>

        {/* A sibling form, not a nested one — nesting forms is invalid HTML and
            browsers silently drop the inner one. */}
        <form action={phoneAction} className="mt-3">
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="intent" value={intent} />
          <Button type="submit" tone="quiet" full>
            Send the code again
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <form action={phoneAction}>
        <Stack gap="md">
          <input type="hidden" name="intent" value={intent} />

          <Field
            label="Your mobile number"
            required
            hint="Indian mobile number. We will send a six-digit code."
            error={phoneState.error}
          >
            <Input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98450 00101"
              required
              autoFocus
            />
          </Field>

          <Submit>Send me a code</Submit>
        </Stack>
      </form>
    </Card>
  );
}
