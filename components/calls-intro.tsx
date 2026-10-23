'use client';

import { useActionState, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dismissCallsIntro, saveCallSettings, type CallSettingsState } from '@/app/actions/calls';
import type { VoiceCallKind } from '@/lib/enums';
import { placeName } from '@/lib/voice/time';
import { CallChoices, type CallParent } from '@/components/call-choices';
import { CallTile } from '@/components/call-icons';

/** The four moments, in the order a month goes. */
const MOMENTS = [
  { icon: 'moon', title: 'The night before', line: (p: string) => `We call ${p} about fasting, in plain words, and ask them to say it back.` },
  { icon: 'door', title: 'On the day', line: (p: string) => `If no one opens the door, we call ${p}, then you. Ask “where is the technician?” any time.` },
  { icon: 'heart', title: 'After the visit', line: () => 'Two quick questions: on time? gentle? Then a call when the report is in the app.' },
  { icon: 'calendar', title: 'Every month', line: () => 'A one-minute update for you, and a reminder before the next test is due.' },
];

/**
 * How the assistant's calls work, shown once after a family signs up and
 * again whenever they ask from Profile. Built the way Apple's own welcome
 * sheets are: it rises from the bottom, can be swiped away, explains in four
 * rows with coloured tiles, then asks, switch by switch, with nothing on
 * until it is turned on. Three pages, one decision.
 */
export function CallsIntro({
  defaultOpen = false,
  launcherLabel,
  parents,
  familyLocale,
  preferences,
  assistantPhone,
}: {
  defaultOpen?: boolean;
  /** When set, a button with this label opens the sheet (Profile). */
  launcherLabel?: string;
  parents: CallParent[];
  familyLocale: string;
  preferences: Record<VoiceCallKind, boolean>;
  assistantPhone?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(Object.values(preferences).filter(Boolean).length);
  const [timeZone, setTimeZone] = useState('');
  const [drag, setDrag] = useState(0);
  const [, startDismiss] = useTransition();
  const [state, action, saving] = useActionState<CallSettingsState, FormData>(saveCallSettings, { ok: false });
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
  const [height, setHeight] = useState<number>();

  // The sheet is as tall as the page showing, and eases between them, as iOS sheets do.
  useLayoutEffect(() => {
    const el = pageRefs.current[page];
    if (!open || !el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, page]);
  const lastFocus = useRef<HTMLElement | null>(null);

  const parent = parents.length === 1 ? parents[0].firstName : parents.length > 1 ? 'your parents' : 'your parent';

  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? '');
    } catch {
      setTimeZone('');
    }
  }, []);

  // Each page announces itself: focus goes to its title.
  useEffect(() => {
    if (open) document.getElementById(`calls-title-${page}`)?.focus({ preventScroll: true });
  }, [open, page]);

  // Saved: on to the last page.
  useEffect(() => {
    if (state.ok) setPage(2);
  }, [state]);

  // While open: the page behind stays still, focus moves in, and comes back out after.
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      lastFocus.current?.focus?.();
    };
  }, [open]);

  function close(seen: boolean) {
    // Closing before saving is "not now": nothing turned on, never shown again unasked.
    if (seen && !state.ok && defaultOpen) startDismiss(() => dismissCallsIntro(timeZone || undefined));
    setOpen(false);
    // Profile's switches and the call list catch up with what was chosen.
    if (state.ok) router.refresh();
    setDrag(0);
    setPage(0);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'Tab' || !sheetRef.current) return;
    // Keep Tab inside the sheet, on the page that is showing.
    const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>('a, button, input, select, [tabindex="0"]')].filter(
      (el) => !el.closest('[inert]') && !el.hasAttribute('disabled'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Swipe down on the grabber to put it away, as on iPhone.
  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current !== null) setDrag(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag > 110) close(true);
    else setDrag(0);
  };

  const launcher = launcherLabel ? (
    <button type="button" className="inline-flex min-h-11 items-center font-semibold underline" onClick={() => setOpen(true)}>
      {launcherLabel}
    </button>
  ) : null;

  if (!open) return launcher;

  return (
    <>
      {launcher}
      <div className="calls-backdrop">
        {/* The dimming is a sibling, not the sheet's parent, so the glass blurs the page itself. */}
        <div className="calls-scrim" onClick={() => close(true)} aria-hidden="true" />
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`calls-title-${page}`}
          className="calls-sheet glass"
          style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
          onKeyDown={onKeyDown}
          data-calls-sheet
        >
          <div
            className="calls-grab"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden="true"
          >
            <span className="calls-grabber" />
          </div>
          <div className="flex items-center justify-between px-5 pt-1">
            {page === 1 ? (
              <button type="button" className="call-link" onClick={() => setPage(0)}>
                ‹ Back
              </button>
            ) : (
              <span />
            )}
            <span className="calls-dots" aria-label={`Page ${page + 1} of 3`}>
              {[0, 1, 2].map((i) => (
                <span key={i} data-on={i === page} />
              ))}
            </span>
            {page < 2 ? (
              <button type="button" className="call-link" onClick={() => close(true)}>
                Not now
              </button>
            ) : (
              <span />
            )}
          </div>

          <div className="calls-viewport" style={height ? { height } : undefined}>
            <div className="calls-track" style={{ transform: `translateX(-${page * 100}%)` }}>
              {/* 1. What the calls are */}
              <section ref={(el) => { pageRefs.current[0] = el; }} className="calls-page" inert={page !== 0} aria-hidden={page !== 0}>
                <div className="flex flex-col items-center gap-3 pt-4 text-center">
                  <CallTile name="phone" size={64} />
                  <h2 id="calls-title-0" tabIndex={-1} className="calls-title">
                    Calls that take care of the small things
                  </h2>
                  <p className="text-[var(--color-ink-soft)]">
                    Our assistant makes the everyday calls for you, in {parent === 'your parent' ? 'your parent’s' : `${parent}’s`} language. It always says it’s an
                    assistant, never talks about results, and a person is one step behind it.
                  </p>
                </div>
                <ul className="mt-6 flex flex-col gap-5">
                  {MOMENTS.map((m) => (
                    <li key={m.title} className="flex items-start gap-4">
                      <CallTile name={m.icon} size={40} />
                      <span>
                        <span className="block font-semibold">{m.title}</span>
                        <span className="block text-small text-[var(--color-ink-soft)]">{m.line(parent)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-small text-[var(--color-ink-faint)]">
                  {parent === 'your parent' ? 'Your parent' : parent.charAt(0).toUpperCase() + parent.slice(1)} can also book a visit just by calling
                  {assistantPhone ? ` ${assistantPhone}` : ' us'} and talking. You confirm it here.
                </p>
                <div className="calls-actions">
                  <button type="button" className="btn calls-primary" onClick={() => setPage(1)}>
                    Continue
                  </button>
                </div>
              </section>

              {/* 2. Choose */}
              <section ref={(el) => { pageRefs.current[1] = el; }} className="calls-page" inert={page !== 1} aria-hidden={page !== 1}>
                <form action={action} className="flex min-h-full flex-col">
                  <input type="hidden" name="timeZone" value={timeZone} />
                  <div className="flex flex-col gap-1 pt-2">
                    <h2 id="calls-title-1" tabIndex={-1} className="calls-title">
                      Choose your calls
                    </h2>
                    <p className="text-small text-[var(--color-ink-soft)]">
                      Nothing is on until you turn it on. You can change this any time in Profile.
                    </p>
                  </div>
                  <div className="mt-4">
                    <CallChoices parents={parents} familyLocale={familyLocale} initial={preferences} onCountChange={setCount} />
                  </div>
                  {timeZone && (
                    <p className="mt-4 text-small text-[var(--color-ink-faint)]">
                      We ring you in your own day: {placeName(timeZone)} time. Calls to {parent} are in India time.
                    </p>
                  )}
                  {state.message && !state.ok && (
                    <p role="status" className="mt-3 text-small font-semibold text-[var(--color-red)]">
                      {state.message}
                    </p>
                  )}
                  <div className="calls-actions">
                    <button type="submit" className="btn calls-primary" disabled={saving}>
                      {saving ? 'Saving…' : count === 0 ? 'Save with no calls' : `Turn on ${count === 1 ? '1 call' : `${count} calls`}`}
                    </button>
                  </div>
                </form>
              </section>

              {/* 3. Done */}
              <section ref={(el) => { pageRefs.current[2] = el; }} className="calls-page" inert={page !== 2} aria-hidden={page !== 2}>
                <div className="flex flex-col items-center gap-3 pt-10 text-center">
                  <CallTile name="check" size={64} />
                  <h2 id="calls-title-2" tabIndex={-1} className="calls-title">
                    {count === 0 ? 'No calls for now' : 'You’re all set'}
                  </h2>
                  <p className="text-[var(--color-ink-soft)]">
                    {count === 0
                      ? 'We won’t ring anyone. Turn calls on whenever you like, in Profile.'
                      : `${count === 1 ? 'One call is' : `${count} calls are`} on. Every call opens by saying it’s our assistant, and you can change them any time in Profile.`}
                  </p>
                </div>
                <div className="calls-actions">
                  <button type="button" className="btn calls-primary" onClick={() => close(false)}>
                    Done
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
