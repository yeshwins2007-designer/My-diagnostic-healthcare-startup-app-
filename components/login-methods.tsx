'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { AuthFlow } from '@/components/auth-flow';
import { EmailAuth } from '@/components/email-auth';

const TABS = [
  { id: 'phone', label: 'Phone' },
  { id: 'email', label: 'Email' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/**
 * Sign in or create an account with a phone code (the default: no password
 * to forget) or with an email and password. Without a real email provider in
 * production, only the phone option exists.
 */
export function LoginMethods({ emailEnabled }: { emailEnabled: boolean }) {
  const [tab, setTab] = useState<Tab>('phone');
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ phone: null, email: null });

  if (!emailEnabled) {
    return (
      <>
        <AuthFlow intent="individual" />
        <PhoneFootnote />
      </>
    );
  }

  // Arrow keys move between tabs, as in any native tab bar.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: Tab = tab === 'phone' ? 'email' : 'phone';
    setTab(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Sign in with"
        onKeyDown={onKeyDown}
        className="glass grid grid-cols-2 gap-1 rounded-full border p-1"
      >
        {TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              id={`login-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`login-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`min-h-12 rounded-full font-semibold transition-colors ${
                selected
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-ink)] [box-shadow:var(--glow)]'
                  : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`login-panel-${tab}`} aria-labelledby={`login-tab-${tab}`}>
        {tab === 'phone' ? (
          <div className="flex flex-col gap-5">
            <AuthFlow intent="individual" />
            <PhoneFootnote />
          </div>
        ) : (
          <EmailAuth />
        )}
      </div>
    </div>
  );
}

function PhoneFootnote() {
  return (
    <p className="text-center text-[var(--color-ink-soft)]">
      Don’t have an account?{' '}
      <span className="font-semibold text-[var(--color-primary)]">
        Enter your number above. We set one up as you sign in.
      </span>
    </p>
  );
}
