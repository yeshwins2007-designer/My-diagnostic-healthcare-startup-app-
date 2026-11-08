'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { chooseLabForBooking, type CaregiverActionState } from '@/app/actions/caregiver';
import { haversineKm } from '@/lib/geo';
import { Badge, Button, cx } from '@/components/ui';

export interface LabRow {
  id: string;
  name: string;
  area: string;
  latitude: number;
  longitude: number;
  certificateNumber: string | null;
  disciplines: string[];
  testsOffered: number;
  distanceFromHomeKm: number;
  eligible: boolean;
  reason?: string;
  isAreaLab: boolean;
  isChosen: boolean;
}

type Here = { lat: number; lng: number };
type LocState = 'idle' | 'asking' | 'on' | 'denied' | 'unavailable';

const km = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));
/** "2.3 km from you", or "Less than 100 m from you" when standing outside it. */
const fromYou = (n: number) => (n < 0.1 ? 'Less than 100 m from you' : `${km(n)} km from you`);

/**
 * Find a lab: a filter box, an optional "near me", and one card per lab.
 *
 * "Use my current location" asks the browser for a position and re-sorts the
 * list on this phone. The position is never sent anywhere: it only changes
 * the order and adds "x km from you". Whether a lab can be chosen depends on
 * the parent's home, which is where the sample is taken.
 */
export function LabSearch({
  patientId,
  parentShort,
  labs,
  initialQuery,
  autoLocate,
}: {
  patientId: string;
  parentShort: string;
  labs: LabRow[];
  initialQuery: string;
  autoLocate: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [here, setHere] = useState<Here | null>(null);
  const [loc, setLoc] = useState<LocState>('idle');
  const [sortByHere, setSortByHere] = useState(false);
  const [supported, setSupported] = useState(true);

  function locate() {
    if (!('geolocation' in navigator)) {
      setLoc('unavailable');
      return;
    }
    setLoc('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoc('on');
        setSortByHere(true);
      },
      (err) => setLoc(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  useEffect(() => {
    setSupported('geolocation' in navigator);
    if (autoLocate) locate();
    // Only on first load: "near me" from the home screen's search bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withHere = labs.map((l) => ({
      ...l,
      fromHereKm: here ? haversineKm(here, { lat: l.latitude, lng: l.longitude }) : null,
    }));
    const matches = withHere.filter(
      (l) =>
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.area.toLowerCase().includes(q) ||
        l.disciplines.some((d) => d.toLowerCase().includes(q)),
    );
    const by = (l: (typeof matches)[number]) => (sortByHere && l.fromHereKm !== null ? l.fromHereKm : l.distanceFromHomeKm);
    return matches.sort((a, b) => Number(b.eligible) - Number(a.eligible) || by(a) - by(b));
  }, [labs, query, here, sortByHere]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <label htmlFor="lab-search" className="sr-only">
          Search labs by name, area or pincode
        </label>
        <div className="relative">
          <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--color-ink-faint)]">
            <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            id="lab-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lab name, area or pincode"
            autoComplete="off"
            className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--field-bg)] pr-4 pl-11 text-base placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-ink-faint)] focus:outline-none"
          />
        </div>

        {supported && loc !== 'on' && (
          <Button type="button" tone="secondary" onClick={locate} disabled={loc === 'asking'} className="self-start">
            <svg aria-hidden viewBox="0 0 24 24" width="18" height="18">
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21z M12 12.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
            {loc === 'asking' ? 'Finding you…' : 'Use my current location'}
          </Button>
        )}

        {loc === 'on' && (
          <div role="group" aria-label="Sort labs" data-segmented className="grid grid-cols-2 gap-1 rounded-full border border-[var(--color-line)] p-1">
            {[
              { on: true, label: 'Nearest to me' },
              { on: false, label: `Nearest to ${parentShort}’s home` },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={sortByHere === o.on}
                onClick={() => setSortByHere(o.on)}
                className={cx(
                  'min-h-11 rounded-full px-3 text-small font-medium',
                  sortByHere === o.on ? 'bg-[var(--color-primary)] text-[var(--color-primary-ink)]' : 'text-[var(--color-ink-soft)]',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <p role="status" className="text-small text-[var(--color-ink-faint)]">
          {loc === 'on'
            ? 'Your location stays on this phone. We only use it to sort this list.'
            : loc === 'denied'
              ? `Location is turned off for this site. Here are the labs nearest to ${parentShort}’s home.`
              : loc === 'unavailable'
                ? `We couldn’t get your location. Here are the labs nearest to ${parentShort}’s home.`
                : `Sorted by distance from ${parentShort}’s home, because that’s where the sample is taken.`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] p-5 text-[var(--color-ink-soft)]">
          No labs match “{query}”.
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Labs">
          {rows.map((lab) => (
            <LabCard key={lab.id} lab={lab} patientId={patientId} parentShort={parentShort} />
          ))}
        </ul>
      )}

      {query.trim() && (
        <p className="text-small text-[var(--color-ink-soft)]">
          Looking for a test instead?{' '}
          <Link href={`/caregiver/book?q=${encodeURIComponent(query.trim())}&patient=${encodeURIComponent(patientId)}`} className="inline-flex min-h-11 items-center font-semibold underline">
            See tests matching “{query.trim()}”
          </Link>
        </p>
      )}
    </div>
  );
}

function LabCard({
  lab,
  patientId,
  parentShort,
}: {
  lab: LabRow & { fromHereKm: number | null };
  patientId: string;
  parentShort: string;
}) {
  const [state, action, pending] = useActionState<CaregiverActionState, FormData>(chooseLabForBooking, { ok: false });

  return (
    <li
      data-lab={lab.name}
      className={cx(
        'flex flex-col gap-3 rounded-[var(--radius-card)] border p-5',
        lab.eligible ? 'panel' : 'border-[var(--color-line)] bg-[var(--color-surface-sunken)]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lead font-semibold">{lab.name}</h2>
          <p className="text-small text-[var(--color-ink-soft)]">{lab.area}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lab.isChosen && <Badge tone="green">{parentShort}’s lab</Badge>}
          {lab.isAreaLab && !lab.isChosen && <Badge tone="primary">Your area’s lab</Badge>}
        </div>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-small">
        <span className="reading">{km(lab.distanceFromHomeKm)} km from {parentShort}’s home</span>
        {lab.fromHereKm !== null && <span className="reading text-[var(--color-ink-soft)]">{fromYou(lab.fromHereKm)}</span>}
      </p>

      <p className="text-small text-[var(--color-ink-soft)]">
        {lab.certificateNumber ? `NABL ${lab.certificateNumber}` : 'Not NABL accredited'}
        {lab.disciplines.length > 0 && ` · ${lab.disciplines.join(', ')}`}
        {lab.testsOffered > 0 && ` · ${lab.testsOffered} tests at home`}
      </p>

      {lab.eligible ? (
        lab.isChosen ? (
          <Link
            href={`/caregiver/book?patient=${encodeURIComponent(patientId)}`}
            className="btn inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-line-strong)] px-5 font-medium"
          >
            Book with {lab.name}
          </Link>
        ) : (
          <form action={action}>
            <input type="hidden" name="patientId" value={patientId} />
            <input type="hidden" name="labId" value={lab.id} />
            <Button type="submit" full disabled={pending}>
              {pending ? 'One moment…' : `Book with ${lab.name}`}
            </Button>
          </form>
        )
      ) : (
        <p className="text-small font-medium text-[var(--color-ink-soft)]">{lab.reason}</p>
      )}
      {state.message && !state.ok && (
        <p role="alert" className="text-small font-medium text-[var(--color-red)]">
          {state.message}
        </p>
      )}
    </li>
  );
}
