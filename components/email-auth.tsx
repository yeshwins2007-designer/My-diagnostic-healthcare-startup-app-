'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  beginEmailSignUp,
  finishEmailSignUp,
  resendEmailSignUpCodes,
  sendPasswordResetCode,
  setNewPassword,
  signInWithEmail,
  type EmailSignInState,
  type EmailSignUpState,
  type PasswordResetState,
} from '@/app/actions/email-auth';
import { LOCALES } from '@/lib/i18n/locales';
import { Button, Card, Field, Input, Muted, Select, Stack } from '@/components/ui';

const PASSWORD_HINT = 'At least 12 characters. Three or four words together is easy to remember.';

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Please wait…' : children}
    </Button>
  );
}

function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="font-medium text-[var(--color-red)]">
      {message}
    </p>
  );
}

/** A password box with Show / Hide: typing blind on a phone is how people get locked out. */
function PasswordField({
  label,
  autoComplete,
  hint,
  isNew,
}: {
  label: string;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  isNew?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} required hint={hint}>
      <span className="relative block">
        <Input
          name="password"
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={isNew ? 12 : undefined}
          maxLength={128}
          className="pr-24"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className="absolute inset-y-0 right-2 my-auto h-10 rounded-full px-3 text-small font-semibold text-[var(--color-primary)] hover:bg-[var(--color-surface-sunken)]"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </span>
    </Field>
  );
}

function DevCodes({ codes }: { codes: { label: string; code?: string; id: string }[] }) {
  const shown = codes.filter((c) => c.code);
  if (shown.length === 0) return null;
  return (
    <div className="rounded-[var(--radius-control)] border-2 border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)] p-4">
      <Muted>
        Nothing is really sent in this demo, so here {shown.length === 1 ? 'is the code' : 'are the codes'}:
      </Muted>
      <ul className="mt-2 flex flex-col gap-1">
        {shown.map((c) => (
          <li key={c.id} className="text-small text-[var(--color-ink-soft)]">
            {c.label}:{' '}
            <strong data-dev-code={c.id} className="font-mono text-lead text-[var(--color-ink)]">
              {c.code}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CodeInput({ name, autoComplete }: { name: string; autoComplete?: string }) {
  return (
    <Input
      name={name}
      inputMode="numeric"
      autoComplete={autoComplete ?? 'off'}
      pattern="\d{6}"
      maxLength={6}
      required
      className="text-center font-mono tracking-[0.5em]"
    />
  );
}

function TextLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
    >
      {children}
    </button>
  );
}

// --- sign in -------------------------------------------------------------------

function SignIn({ onSignUp, onForgot }: { onSignUp: () => void; onForgot: () => void }) {
  const [state, action] = useActionState<EmailSignInState, FormData>(signInWithEmail, {});
  return (
    <Stack gap="md">
      <Card>
        <form action={action}>
          <Stack gap="md">
            <Field label="Email" required>
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                defaultValue={state.email}
                required
                autoFocus
              />
            </Field>
            <PasswordField label="Password" autoComplete="current-password" />
            <ErrorText message={state.error} />
            <Submit>Sign in</Submit>
          </Stack>
        </form>
        <div className="mt-2 flex justify-center">
          <TextLink onClick={onForgot}>Forgot password?</TextLink>
        </div>
      </Card>
      <p className="text-center text-[var(--color-ink-soft)]">
        New here? <TextLink onClick={onSignUp}>Create an account with email</TextLink>
      </p>
    </Stack>
  );
}

// --- sign up -------------------------------------------------------------------

function SignUpCodes({ start, onRestart }: { start: EmailSignUpState; onRestart: () => void }) {
  const [state, action] = useActionState<EmailSignUpState, FormData>(finishEmailSignUp, { step: 'CODES' });
  return (
    <form action={action}>
      <Stack gap="md">
        <input type="hidden" name="registrationId" value={start.registrationId} />
        <Muted>
          We sent one code to <strong className="text-[var(--color-ink)]">{start.email}</strong> and
          another by text message to <strong className="text-[var(--color-ink)]">{start.phone}</strong>.
          Both prove they are yours.
        </Muted>
        <Field label="Code from your email" required>
          <CodeInput name="emailCode" />
        </Field>
        <Field label="Code from the text message" required hint="This is the number our technician will call.">
          <CodeInput name="smsCode" autoComplete="one-time-code" />
        </Field>
        <DevCodes
          codes={[
            { id: 'email', label: 'Email', code: start.devEmailCode },
            { id: 'sms', label: 'Text message', code: start.devSmsCode },
          ]}
        />
        <ErrorText message={state.error} />
        <Submit>Create my account</Submit>
        <div className="flex justify-center">
          <TextLink onClick={onRestart}>Change my details</TextLink>
        </div>
      </Stack>
    </form>
  );
}

function SignUp({ onSignIn }: { onSignIn: () => void }) {
  // One state for "send the codes" and "send them again": both end with a
  // live registration, and the newest one is the one to verify.
  const [state, action] = useActionState<EmailSignUpState, FormData>(
    (prev, formData) =>
      formData.get('op') === 'resend' ? resendEmailSignUpCodes(prev, formData) : beginEmailSignUp(prev, formData),
    { step: 'DETAILS' },
  );
  // "Change my details" goes back to the form, filled in, without a round trip.
  const [editing, setEditing] = useState(false);

  if (state.step === 'CODES' && state.registrationId && !editing) {
    return (
      <Card>
        {/* Keyed by registration: new codes start a fresh attempt, with no stale error. */}
        <SignUpCodes key={state.registrationId} start={state} onRestart={() => setEditing(true)} />
        <form action={action} className="mt-3">
          <input type="hidden" name="op" value="resend" />
          <input type="hidden" name="registrationId" value={state.registrationId} />
          <Stack gap="sm">
            <ErrorText message={state.error} />
            <Button type="submit" tone="quiet" full>
              Send new codes
            </Button>
          </Stack>
        </form>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Card>
        <form action={action} onSubmit={() => setEditing(false)}>
          <Stack gap="md">
            <Field label="Your name" required hint="The name we will use when we call you.">
              <Input name="name" autoComplete="name" defaultValue={state.name} required autoFocus />
            </Field>
            <Field label="Email" required>
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                defaultValue={state.email}
                required
              />
            </Field>
            <Field
              label="Mobile number"
              required
              hint="Indian mobile. We text a code to check it: it is the number our technician calls."
            >
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="98450 00101"
                defaultValue={state.phone}
                required
              />
            </Field>
            <PasswordField label="Choose a password" autoComplete="new-password" hint={PASSWORD_HINT} isNew />
            <Field label="Language you are most comfortable in">
              <Select name="locale" defaultValue={state.locale ?? 'en'}>
                {LOCALES.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.native} — {l.english}
                  </option>
                ))}
              </Select>
            </Field>
            <ErrorText message={state.error} />
            <Submit>Send my codes</Submit>
          </Stack>
        </form>
      </Card>
      <p className="text-center text-[var(--color-ink-soft)]">
        Already have an account? <TextLink onClick={onSignIn}>Sign in</TextLink>
      </p>
    </Stack>
  );
}

// --- forgot password -----------------------------------------------------------

function NewPassword({ request }: { request: PasswordResetState }) {
  const [state, action] = useActionState<PasswordResetState, FormData>(setNewPassword, { step: 'CODE' });
  return (
    <form action={action}>
      <Stack gap="md">
        <input type="hidden" name="email" value={request.email} />
        <Muted>
          If <strong className="text-[var(--color-ink)]">{request.email}</strong> has an account with
          us, we have sent it a six-digit code. It works for 10 minutes.
        </Muted>
        <Field label="Code from your email" required>
          <CodeInput name="code" autoComplete="one-time-code" />
        </Field>
        <PasswordField label="New password" autoComplete="new-password" hint={PASSWORD_HINT} isNew />
        <DevCodes codes={[{ id: 'reset', label: 'Email', code: request.devCode }]} />
        <ErrorText message={state.error} />
        <Submit>Set new password</Submit>
        <Muted className="text-center">Setting a new password signs you out on every other device.</Muted>
      </Stack>
    </form>
  );
}

function ForgotPassword({ onSignIn }: { onSignIn: () => void }) {
  const [state, action] = useActionState<PasswordResetState, FormData>(sendPasswordResetCode, {
    step: 'EMAIL',
  });

  if (state.step === 'CODE') {
    return (
      <Stack gap="md">
        <Card>
          <NewPassword key={`${state.email}:${state.devCode ?? ''}`} request={state} />
          <form action={action} className="mt-3">
            <input type="hidden" name="email" value={state.email} />
            <Button type="submit" tone="quiet" full>
              Send a new code
            </Button>
          </form>
        </Card>
        <p className="text-center">
          <TextLink onClick={onSignIn}>Back to sign in</TextLink>
        </p>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Card>
        <form action={action}>
          <Stack gap="md">
            <Field label="Your account’s email" required hint="We will send a code to reset your password.">
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                defaultValue={state.email}
                required
                autoFocus
              />
            </Field>
            <ErrorText message={state.error} />
            <Submit>Send reset code</Submit>
          </Stack>
        </form>
      </Card>
      <p className="text-center">
        <TextLink onClick={onSignIn}>Back to sign in</TextLink>
      </p>
    </Stack>
  );
}

// --- the Email tab -------------------------------------------------------------

type Mode = 'SIGN_IN' | 'SIGN_UP' | 'FORGOT';

export function EmailAuth() {
  const [mode, setMode] = useState<Mode>('SIGN_IN');
  // Bumped to start a flow afresh: remounting drops its server state.
  const [attempt, setAttempt] = useState(0);
  const go = (next: Mode) => {
    setMode(next);
    setAttempt((n) => n + 1);
  };

  if (mode === 'SIGN_UP') {
    return <SignUp key={attempt} onSignIn={() => go('SIGN_IN')} />;
  }
  if (mode === 'FORGOT') return <ForgotPassword key={attempt} onSignIn={() => go('SIGN_IN')} />;
  return <SignIn key={attempt} onSignUp={() => go('SIGN_UP')} onForgot={() => go('FORGOT')} />;
}
