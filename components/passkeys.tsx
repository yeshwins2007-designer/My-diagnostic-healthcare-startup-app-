'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import {
  passkeyLoginOptions,
  passkeyRegistrationOptions,
  removePasskey,
  verifyPasskeyLogin,
  verifyPasskeyRegistration,
} from '@/app/actions/passkeys';
import { Button } from '@/components/ui';

function KeyIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="24" height="24">
      <path
        d="M12 3a5 5 0 0 0-3.3 8.8V20l2 1.5 2-1.5v-1.5l-1.2-1 1.2-1v-1.5l-1.2-1 1.2-1v-.7A5 5 0 0 0 12 3zm0 3.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A cancelled or timed-out browser prompt is a choice, not an error to shout about. */
function wasCancelled(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? '';
  return name === 'NotAllowedError' || name === 'AbortError';
}

/** "Sign in with a passkey", on the login screen. Hidden where the browser cannot do it. */
export function PasskeySignIn() {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  if (!supported) return null;

  const signIn = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const optionsJSON = await passkeyLoginOptions();
        const response = await startAuthentication({ optionsJSON });
        const result = await verifyPasskeyLogin(response);
        if (result.ok) router.push(result.redirectTo ?? '/caregiver');
        else setMessage(result.message);
      } catch (e) {
        setMessage(
          wasCancelled(e)
            ? 'No passkey was used. You can sign in with your phone code instead.'
            : 'Passkey sign-in did not work on this device. Please use your phone code.',
        );
      }
    });

  return (
    <div data-native-hide className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-small text-[var(--color-ink-soft)]" aria-hidden>
        <span className="h-px flex-1 bg-[var(--color-line-strong)]" />
        or
        <span className="h-px flex-1 bg-[var(--color-line-strong)]" />
      </div>
      <Button type="button" tone="secondary" full onClick={signIn} disabled={pending}>
        <KeyIcon />
        {pending ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
      </Button>
      <p className="text-center text-small text-[var(--color-ink-soft)]">
        Face ID, Touch ID, fingerprint or your phone’s screen lock. Add one from Profile after you
        sign in.
      </p>
      {message && (
        <p role="alert" className="text-center font-semibold text-[var(--color-yellow)]">
          {message}
        </p>
      )}
    </div>
  );
}

export interface PasskeyRow {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
}

/** Profile: add, list and remove passkeys. */
export function PasskeyManager({ passkeys }: { passkeys: PasskeyRow[] }) {
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  const add = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const optionsJSON = await passkeyRegistrationOptions();
        const response = await startRegistration({ optionsJSON });
        const result = await verifyPasskeyRegistration(response);
        setMessage(
          result.ok
            ? { ok: true, text: 'Passkey added. Next time, sign in with it from the login screen.' }
            : { ok: false, text: result.message },
        );
        router.refresh();
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setMessage({
          ok: false,
          text:
            name === 'InvalidStateError'
              ? 'This device already has a passkey for your account.'
              : wasCancelled(e)
                ? 'No passkey was added.'
                : 'This device could not create a passkey.',
        });
      }
    });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col gap-3">
      {passkeys.length > 0 && (
        <ul className="flex flex-col gap-3">
          {passkeys.map((p) => (
            <li
              key={p.id}
              className="glass flex items-center justify-between gap-3 rounded-[var(--radius-card)] border p-4"
            >
              <span className="flex items-center gap-3">
                <span className="text-[var(--color-primary)]">
                  <KeyIcon />
                </span>
                <span>
                  <span className="block font-semibold">{p.label}</span>
                  <span className="text-small text-[var(--color-ink-soft)]">
                    Added {fmt(p.createdAt)}
                    {p.lastUsedAt ? ` · last used ${fmt(p.lastUsedAt)}` : ''}
                    {p.backedUp ? ' · synced' : ''}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await removePasskey(p.id);
                    router.refresh();
                  })
                }
                className="min-h-12 shrink-0 rounded-full border border-[var(--card-border)] px-4 text-small font-semibold"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {supported ? (
        <Button type="button" tone="secondary" full onClick={add} disabled={pending}>
          <KeyIcon />
          {pending ? 'Follow the prompt on your device…' : 'Add a passkey'}
        </Button>
      ) : (
        <p className="text-small text-[var(--color-ink-soft)]">
          This browser cannot create passkeys. Try Safari on an iPhone or Chrome on Android.
        </p>
      )}
      {message && (
        <p
          role="status"
          className={`font-semibold ${message.ok ? 'text-[var(--color-green)]' : 'text-[var(--color-yellow)]'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
