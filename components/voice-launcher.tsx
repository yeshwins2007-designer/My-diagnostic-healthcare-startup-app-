'use client';

import { useEffect, useRef, useState } from 'react';
import { LOCALES, type Locale } from '@/lib/i18n/locales';

interface Turn {
  role: 'caller' | 'agent';
  text: string;
  blocked?: boolean;
  emergency?: boolean;
  handedOff?: boolean;
}

/**
 * The support assistant, available on every caregiver screen.
 *
 * Every turn goes through /api/voice/turn, which runs the guardrails
 * server-side. The client never decides what is safe to say — it only renders
 * what came back, and shows plainly when a question has been handed to a human.
 */
export function VoiceLauncher() {
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>('en');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  async function send(text: string) {
    const utterance = text.trim();
    if (!utterance || busy) return;

    setTurns((t) => [...t, { role: 'caller', text: utterance }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/voice/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, utterance, locale }),
      });
      const data = await res.json();
      setConversationId(data.conversationId);
      setTurns((t) => [
        ...t,
        {
          role: 'agent',
          text: data.reply,
          blocked: data.blocked,
          emergency: data.isEmergency,
          handedOff: data.handedOff,
        },
      ]);
      speak(data.reply);
    } catch {
      setTurns((t) => [
        ...t,
        {
          role: 'agent',
          text: 'Sorry — I could not reach our system just now. Please call us on the number at the top of the screen.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  /** Falls back to the browser's own voice when no ElevenLabs key is set. */
  function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = localeToBcp47(locale);
      utter.rate = 0.92; // slower: this audience is often listening, not reading
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {
      // Speech is an enhancement; never let it break the conversation.
    }
  }

  function startListening() {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;

    if (!SR) {
      alert('This browser cannot listen. Please type instead, or call us.');
      return;
    }

    const recognition = new SR();
    recognition.lang = localeToBcp47(locale);
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const said = event.results[0][0].transcript;
      setListening(false);
      void send(said);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex min-h-[var(--size-touch)] items-center gap-3 rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-ink)] shadow-lg"
      >
        <span aria-hidden>🎙</span>
        Talk to us
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg border-t-2 border-[var(--color-line-strong)] bg-[var(--color-surface)] sm:bottom-5 sm:right-5 sm:left-auto sm:mx-0 sm:rounded-[var(--radius-card)] sm:border-2 sm:shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--color-line)] p-4">
        <div>
          <p className="font-bold">MEDWYN Sahayak</p>
          <p className="text-[var(--text-tiny)] text-[var(--color-ink-faint)]">
            Visits, reports and billing. This chat may be kept so a coordinator can follow up.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-12 min-w-12 rounded-full text-[var(--text-lead)]"
          aria-label="Close the assistant"
        >
          ✕
        </button>
      </div>

      <div className="border-b-2 border-[var(--color-line)] p-3">
        <label className="flex items-center gap-3 text-[var(--text-small)]">
          <span className="shrink-0">Language</span>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="min-h-12 w-full rounded-[var(--radius-control)] border-2 border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3"
          >
            {LOCALES.map((l) => (
              <option key={l.key} value={l.key}>
                {l.native} — {l.english}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div ref={scrollRef} className="max-h-80 overflow-y-auto p-4">
        {turns.length === 0 ? (
          <div className="text-[var(--text-small)] text-[var(--color-ink-soft)]">
            <p className="mb-3">
              Ask about the next visit, where the technician is, fasting instructions, moving a
              visit, or your plan.
            </p>
            <p>
              I cannot explain what results mean, or advise on medicines — those go straight to
              a coordinator who calls you back.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {turns.map((turn, i) => (
              <div
                key={i}
                className={
                  turn.role === 'caller'
                    ? 'self-end rounded-[var(--radius-control)] bg-[var(--color-primary-wash)] p-3 text-[var(--text-small)]'
                    : turn.emergency
                      ? 'rounded-[var(--radius-control)] border-2 border-[var(--color-red)] bg-[var(--color-red-wash)] p-3 text-[var(--text-small)] font-semibold'
                      : turn.blocked
                        ? 'rounded-[var(--radius-control)] border-2 border-[var(--color-yellow)] bg-[var(--color-yellow-wash)] p-3 text-[var(--text-small)]'
                        : 'rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] p-3 text-[var(--text-small)]'
                }
              >
                {turn.text}
                {turn.handedOff && (
                  <span className="mt-2 block font-semibold">
                    A coordinator has been asked to call you back.
                  </span>
                )}
              </div>
            ))}
            {busy && (
              <p className="text-[var(--text-small)] text-[var(--color-ink-faint)]">Thinking…</p>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2 border-t-2 border-[var(--color-line)] p-3"
      >
        <button
          type="button"
          onClick={startListening}
          aria-label="Speak instead of typing"
          className={`min-h-[var(--size-touch)] min-w-[var(--size-touch)] shrink-0 rounded-[var(--radius-control)] border-2 text-[var(--text-lead)] ${
            listening
              ? 'border-[var(--color-red)] bg-[var(--color-red-wash)]'
              : 'border-[var(--color-line-strong)]'
          }`}
        >
          {listening ? '●' : '🎙'}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type or tap the microphone"
          className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-control)] border-2 border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-[var(--size-touch)] shrink-0 rounded-[var(--radius-control)] border-2 border-[var(--color-primary)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-ink)] disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function localeToBcp47(locale: Locale): string {
  const map: Record<Locale, string> = {
    en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', mr: 'mr-IN', te: 'te-IN', ta: 'ta-IN',
    kn: 'kn-IN', gu: 'gu-IN', ml: 'ml-IN', pa: 'pa-IN', ur: 'ur-IN', as: 'as-IN',
  };
  return map[locale] ?? 'en-IN';
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  start(): void;
  onresult: (event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
  onerror: () => void;
  onend: () => void;
}
