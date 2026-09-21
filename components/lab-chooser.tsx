'use client';

import { useState, useTransition } from 'react';
import { setPreferredLab } from '@/app/actions/caregiver';
import { Badge, Card, H3, Muted, Stack } from '@/components/ui';

export interface LabOption {
  id: string;
  name: string;
  eligible: boolean;
  distanceKm: number | null;
  certificateNumber: string | null;
  reason?: string;
  isZoneAnchor: boolean;
}

/**
 * Choosing the laboratory.
 *
 * Every option shown has already been through the routing gate on the server;
 * this only renders the verdict. Labs that cannot do the panel are still
 * listed, disabled, with the reason — "not accredited for haematology" is a
 * better answer for a family than a short list with no explanation, and it is
 * the honest one.
 */
export function LabChooser({
  patientId,
  patientName,
  panelName,
  options,
  selectedLabId,
}: {
  patientId: string;
  patientName: string;
  panelName: string;
  options: LabOption[];
  selectedLabId: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(selectedLabId);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (labId: string) => {
    const previous = selected;
    setSelected(labId);
    startTransition(async () => {
      const r = await setPreferredLab(patientId, labId);
      if (!r.ok) setSelected(previous); // server refused; do not show a lie
      setNotice({
        ok: r.ok,
        text: r.ok
          ? (r.message ?? 'Saved.')
          : [r.reason, r.remedy].filter(Boolean).join(' ') || (r.message ?? 'Could not save that.'),
      });
    });
  };

  const eligible = options.filter((o) => o.eligible);
  const unavailable = options.filter((o) => !o.eligible);

  return (
    <Card>
      <Stack gap="md">
        <Stack gap="sm">
          <H3>Which laboratory should test {patientName}’s samples?</H3>
          <Muted>
            Every laboratory below is NABL-accredited for each test in the {panelName}. We
            check that before offering it — a result produced outside a laboratory’s
            accredited scope is not a valid result.
          </Muted>
        </Stack>

        <div role="radiogroup" aria-label="Choose a laboratory" className="grid gap-3">
          {eligible.map((o) => {
            const isOn = selected === o.id || (selected === null && o.isZoneAnchor);
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={isOn}
                disabled={pending}
                onClick={() => choose(o.id)}
                className={`min-h-[var(--size-touch)] rounded-[var(--radius-control)] border-2 px-5 py-4 text-left ${
                  isOn
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                    : 'border-[var(--color-line)] bg-[var(--color-surface)]'
                }`}
              >
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-[var(--text-lead)] font-semibold">{o.name}</span>
                  {o.isZoneAnchor && <Badge tone="primary">Your area’s laboratory</Badge>}
                  {isOn && <Badge tone="green">Chosen</Badge>}
                </span>
                <span className="mt-1 block text-[var(--text-small)] text-[var(--color-ink-soft)]">
                  {o.certificateNumber ? `NABL ${o.certificateNumber}` : 'NABL accredited'}
                  {o.distanceKm !== null && ` · about ${o.distanceKm} km away`}
                </span>
              </button>
            );
          })}
        </div>

        {unavailable.length > 0 && (
          <Stack gap="sm">
            <Muted>Not available for this panel:</Muted>
            {unavailable.map((o) => (
              <div
                key={o.id}
                className="rounded-[var(--radius-control)] border-2 border-[var(--color-line)] bg-[var(--color-surface-sunken)] px-5 py-4"
              >
                <p className="font-semibold text-[var(--color-ink-soft)]">
                  {o.name}
                  {o.distanceKm !== null && ` · about ${o.distanceKm} km away`}
                </p>
                <p className="text-[var(--text-small)] text-[var(--color-ink-soft)]">
                  {o.reason}
                </p>
              </div>
            ))}
          </Stack>
        )}

        {notice && (
          <p
            className={`font-semibold ${
              notice.ok ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'
            }`}
          >
            {notice.text}
          </p>
        )}

        <Muted>
          You can change this at any time. It applies to {patientName}’s future visits, not
          to samples already collected.
        </Muted>
      </Stack>
    </Card>
  );
}
