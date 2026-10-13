'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptLabOrder, rejectLabOrder, type LabActionState } from '@/app/actions/lab';
import { Badge, Button, cx, Field, Select, StatusDot, Textarea } from '@/components/ui';

export interface IncomingOrder {
  id: string;
  reference: string;
  /** Initials, age and sex only: enough to plan, not more until accepted. */
  patient: string;
  area: string;
  visitDay: string;
  visitWindow: string;
  tests: { code: string; name: string; tube: string }[];
  fasting: string | null;
  payout: string;
  decideBy: string;
  minutesLeft: number;
}

const SOUND_KEY = 'medwyn.partner.orderSound';
const RING_EVERY_MS = 20_000;

/**
 * The incoming-order feed: the restaurant tablet, for a lab.
 *
 * It refreshes itself every `pollSeconds` while the tab is visible (and at
 * once when it becomes visible again), so a new order appears without anyone
 * touching the screen. A new order flashes, and, once someone has turned
 * alerts on, chimes every 20 seconds until someone acknowledges it: a busy
 * bench hears it across the room. The tab title carries the count, so it
 * shows from another tab too.
 *
 * Browsers only allow sound after a person has interacted with the page, so
 * alerts start from a button, and the choice is remembered on this device.
 */
export function IncomingOrders({
  orders,
  canReject,
  reasons,
  windowMinutes,
  pollSeconds = 15,
}: {
  orders: IncomingOrder[];
  canReject: boolean;
  reasons: readonly string[];
  windowMinutes: number;
  pollSeconds?: number;
}) {
  const router = useRouter();
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [ringing, setRinging] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);

  // New arrivals: flash them and start ringing. Orders already on screen
  // when the page opened count as unacknowledged too.
  useEffect(() => {
    const ids = orders.map((o) => o.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      if (ids.length > 0) setRinging(true);
      return;
    }
    const arrived = ids.filter((id) => !seen.current!.has(id));
    arrived.forEach((id) => seen.current!.add(id));
    if (arrived.length > 0) {
      setFresh((prev) => new Set([...prev, ...arrived]));
      setRinging(true);
    }
    if (ids.length === 0) setRinging(false);
  }, [orders]);

  // Keep the feed live while someone can see it.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(refresh, pollSeconds * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router, pollSeconds]);

  // The count in the tab title.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s+/, '');
    document.title = orders.length > 0 ? `(${orders.length}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [orders.length]);

  // Restore the sound choice; the audio itself unlocks on the first touch.
  useEffect(() => {
    let wanted = false;
    try {
      wanted = window.localStorage.getItem(SOUND_KEY) === 'on';
    } catch {
      // Storage blocked: alerts simply start off.
    }
    if (!wanted) return;
    setSoundOn(true);
    const unlock = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  // Ring now, then every RING_EVERY_MS until acknowledged.
  useEffect(() => {
    if (!ringing || !soundOn) return;
    const ring = () => {
      if (audio.current?.state === 'running') chime(audio.current);
    };
    ring();
    const timer = window.setInterval(ring, RING_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [ringing, soundOn]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      // Not remembered on this device; it still works for this visit.
    }
    if (next) {
      audio.current ??= new AudioContext();
      void audio.current.resume().then(() => audio.current && chime(audio.current));
    }
  }

  function acknowledge() {
    setRinging(false);
    setFresh(new Set());
  }

  function decided(result: LabActionState) {
    setNotice({ ok: result.ok, text: result.message ?? result.reason ?? '' });
    if (result.ok) acknowledge();
  }

  return (
    <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 id="pending-heading" className="text-[0.9375rem] font-semibold tracking-tight">
            Pending action
          </h2>
          <span className={cx('reading rounded-full px-2 py-0.5 text-[0.75rem]', orders.length > 0 ? 'bg-[var(--color-yellow-wash)] text-[var(--color-yellow)]' : 'text-[var(--color-ink-faint)]')}>
            {orders.length}
          </span>
        </div>
        <span className="eyebrow flex items-center gap-2">
          <StatusDot tone="green" live />
          Live · every {pollSeconds}s
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundOn}
          className={cx(
            'inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-small font-medium',
            soundOn
              ? 'border-[var(--color-line-strong)] text-[var(--color-ink)]'
              : 'border-[var(--color-yellow)] bg-[var(--color-yellow-wash)] text-[var(--color-yellow)]',
          )}
        >
          <StatusDot tone={soundOn ? 'green' : 'yellow'} />
          {soundOn ? 'Order alerts on' : 'Turn on order alerts'}
        </button>
        {ringing && soundOn && orders.length > 0 && (
          <button
            type="button"
            onClick={acknowledge}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-line-strong)] px-3 text-small font-medium"
          >
            Silence
          </button>
        )}
      </div>

      <p role="status" aria-live="polite" className={cx('min-h-0 text-small font-medium', notice?.ok ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]')}>
        {notice?.text}
      </p>

      {orders.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] p-5 text-small text-[var(--color-ink-faint)]">
          No orders waiting. New orders appear here the moment a family pays, with a chime if
          alerts are on. You have up to {windowMinutes} minutes to accept or reject each one.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isFresh={fresh.has(order.id)}
              canReject={canReject}
              reasons={reasons}
              onDecided={decided}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function OrderCard({
  order,
  isFresh,
  canReject,
  reasons,
  onDecided,
}: {
  order: IncomingOrder;
  isFresh: boolean;
  canReject: boolean;
  reasons: readonly string[];
  onDecided: (r: LabActionState) => void;
}) {
  const [accepting, startAccept] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [rejectState, rejectAction, rejecting] = useActionState<LabActionState, FormData>(async (prev, formData) => {
    const result = await rejectLabOrder(prev, formData);
    if (result.ok) onDecided(result);
    return result;
  }, { ok: false });
  const urgent = order.minutesLeft <= 10;

  return (
    <li
      data-order={order.reference}
      className={cx(
        'panel flex flex-col gap-4 rounded-[var(--radius-card)] border p-4',
        isFresh && 'order-fresh',
        urgent && 'border-[var(--color-yellow)]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="reading text-[1.0625rem] font-medium">{order.reference}</span>
          <span className="text-small text-[var(--color-ink-soft)]">
            {order.patient} · {order.area}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isFresh && <Badge tone="yellow">New</Badge>}
          <span className="reading text-[1.0625rem] font-medium" aria-label={`Pays ${order.payout}`}>
            {order.payout}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-small">
        <div className="flex flex-col gap-1">
          <dt className="eyebrow">Collection</dt>
          <dd className="reading">
            {order.visitDay} {order.visitWindow}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="eyebrow">Decide by</dt>
          <dd className={cx('reading', urgent && 'text-[var(--color-yellow)]')}>
            {order.decideBy} · {order.minutesLeft} min
          </dd>
        </div>
      </dl>

      <ul className="flex flex-col gap-1.5" aria-label="Tests">
        {order.tests.map((t) => (
          <li key={t.code} className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)] pb-1.5 text-small last:border-b-0">
            <span>
              <span className="reading mr-2 text-[var(--color-ink-faint)]">{t.code}</span>
              {t.name}
            </span>
            <span className="shrink-0 text-[var(--color-ink-faint)]">{t.tube}</span>
          </li>
        ))}
      </ul>
      {order.fasting && <p className="text-small text-[var(--color-ink-soft)]">{order.fasting}</p>}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          disabled={accepting || rejecting}
          onClick={() =>
            startAccept(async () => {
              onDecided(await acceptLabOrder(order.id));
            })
          }
          className="min-h-14 text-base"
        >
          {accepting ? 'Accepting…' : 'Accept order'}
        </Button>
        <Button
          type="button"
          tone="secondary"
          disabled={accepting || rejecting || !canReject}
          aria-expanded={rejectOpen}
          onClick={() => setRejectOpen((o) => !o)}
          className="min-h-14 border-[var(--color-red)] text-base text-[var(--color-red)]"
          title={canReject ? undefined : 'Only an owner or a manager can reject an order.'}
        >
          Reject order
        </Button>
      </div>
      {!canReject && (
        <p className="text-small text-[var(--color-ink-faint)]">Only an owner or a manager can reject an order.</p>
      )}

      <div className="disclosure" data-open={rejectOpen}>
        <div>
          <form action={rejectAction} className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-4">
            <input type="hidden" name="bookingId" value={order.id} />
            <Field label="Why can you not take it?" required>
              <Select name="reason" required value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="" disabled>
                  Choose a reason
                </option>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {reason === 'Other' && (
              <Field label="In a sentence" required>
                <Textarea name="note" required minLength={5} className="min-h-20" />
              </Field>
            )}
            <p className="text-small text-[var(--color-ink-faint)]">
              The order goes to the next nearest accredited lab at no cost to the family. Our team
              sees every rejection.
            </p>
            {!rejectState.ok && rejectState.message && (
              <p className="text-small font-medium text-[var(--color-red)]">{rejectState.message}</p>
            )}
            <Button type="submit" tone="danger" disabled={rejecting || !reason}>
              {rejecting ? 'Rejecting…' : `Confirm: reject ${order.reference}`}
            </Button>
          </form>
        </div>
      </div>
    </li>
  );
}

/** Two rising notes, twice: distinct from a phone's own sounds, and not shrill. */
function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  const notes: [number, number][] = [
    [880, 0],
    [1318.5, 0.16],
    [880, 0.52],
    [1318.5, 0.68],
  ];
  for (const [frequency, at] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, t + at);
    gain.gain.exponentialRampToValueAtTime(0.45, t + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + at);
    osc.stop(t + at + 0.34);
  }
}
