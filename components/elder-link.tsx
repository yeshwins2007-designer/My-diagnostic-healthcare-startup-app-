'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createElderLink, revokeElderAccess } from '@/app/actions/elder';
import { Button } from '@/components/ui';

export interface ElderDevice {
  id: string;
  opened: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

/**
 * Setting up Elder Mode on a parent's phone. The link works once and is shown
 * once; after it is opened on their phone it is dead, and the phone holds its
 * own key. Each phone can be turned off here.
 */
export function ElderLink({
  patientId,
  firstName,
  devices,
}: {
  patientId: string;
  firstName: string;
  devices: ElderDevice[];
}) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      setError(null);
      setCopied(false);
      const result = await createElderLink(patientId);
      if (result.ok) setLink(`${window.location.origin}${result.path}`);
      else setError(result.message);
      router.refresh();
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const live = devices.filter((d) => d.opened);
  const waiting = devices.filter((d) => !d.opened);

  return (
    <div className="flex flex-col gap-3">
      {live.length > 0 && (
        <ul className="flex flex-col gap-2">
          {live.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border-2 border-[var(--card-border)] bg-[var(--field-bg)] px-4 py-3"
            >
              <span className="text-small">
                <span className="block font-semibold text-[var(--color-ink)]">Set up on {fmt(d.createdAt)}</span>
                <span className="text-[var(--color-ink-soft)]">
                  {d.lastUsedAt ? `Last opened ${fmt(d.lastUsedAt)}` : 'Not opened since'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => startTransition(async () => { await revokeElderAccess(d.id); router.refresh(); })}
                className="min-h-12 rounded-full border-2 border-[var(--card-border)] px-4 text-small font-semibold"
              >
                Turn off
              </button>
            </li>
          ))}
        </ul>
      )}

      {link ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border-2 border-[var(--color-primary)] bg-[var(--color-primary-wash)] p-4">
          <p className="font-semibold">Open this link on {firstName}’s phone. It works once.</p>
          <input
            readOnly
            value={link}
            aria-label="Elder Mode link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-12 w-full rounded-[var(--radius-control)] border-2 border-[var(--card-border)] bg-[var(--field-bg)] px-3 text-small"
          />
          <Button type="button" tone="secondary" onClick={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <p className="text-small text-[var(--color-ink-soft)]">
            Send it only to {firstName}. Anyone who opens it first gets access, so if it goes
            astray, tap “Cancel” below and make a new one.
          </p>
        </div>
      ) : (
        <Button type="button" tone="secondary" onClick={create} disabled={pending}>
          {pending ? 'Making a link…' : `Set up Elder Mode on ${firstName}’s phone`}
        </Button>
      )}

      {waiting.length > 0 && (
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              for (const d of waiting) await revokeElderAccess(d.id);
              setLink(null);
              router.refresh();
            })
          }
          className="min-h-12 self-start text-small font-semibold text-[var(--color-primary)] underline"
        >
          Cancel {waiting.length === 1 ? 'the unopened link' : `${waiting.length} unopened links`}
        </button>
      )}
      {error && (
        <p role="alert" className="font-semibold text-[var(--color-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
