'use client';

import { useState } from 'react';
import { CALL_KINDS } from '@/lib/voice/kinds';
import { LOCALES } from '@/lib/i18n/locales';
import type { VoiceCallKind } from '@/lib/enums';
import { CallTile } from '@/components/call-icons';

export interface CallParent {
  id: string;
  firstName: string;
  /** Empty: the family's language. */
  language: string;
}

/**
 * The calls, as a grouped list of switches: the parent's calls, then the
 * family's, then the language each parent hears. Nothing is on until someone
 * turns it on. Used inside a form by the first-run sheet and by Profile; a
 * switch left off is submitted as off.
 */
export function CallChoices({
  parents,
  familyLocale,
  initial,
  onCountChange,
}: {
  parents: CallParent[];
  familyLocale: string;
  initial: Record<VoiceCallKind, boolean>;
  onCountChange?: (on: number) => void;
}) {
  const [on, setOn] = useState(initial);
  const parent = parents.length === 1 ? parents[0].firstName : parents.length > 1 ? 'your parents' : 'your parent';
  const allOn = CALL_KINDS.every((k) => on[k.kind]);

  function update(next: Record<VoiceCallKind, boolean>) {
    setOn(next);
    onCountChange?.(Object.values(next).filter(Boolean).length);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button
          type="button"
          className="call-link"
          onClick={() => update(Object.fromEntries(CALL_KINDS.map((k) => [k.kind, !allOn])) as Record<VoiceCallKind, boolean>)}
        >
          {allOn ? 'Turn Off All' : 'Turn On All'}
        </button>
      </div>

      {(['PARENT', 'YOU'] as const).map((section) => (
        <fieldset key={section} className="flex flex-col gap-1.5">
          <legend className="call-group-label">{section === 'PARENT' ? `Calls to ${parent}` : 'Calls to you'}</legend>
          <div className="call-group">
            {CALL_KINDS.filter((k) => k.section === section).map((k) => (
              <label key={k.kind} className="call-row">
                <CallTile name={k.icon} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{k.title}</span>
                  <span className="block text-small leading-snug text-[var(--color-ink-soft)]">{k.line(parent)}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  name={`call_${k.kind}`}
                  checked={on[k.kind]}
                  aria-checked={on[k.kind]}
                  onChange={(e) => update({ ...on, [k.kind]: e.target.checked })}
                  className="call-switch"
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {parents.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="call-group-label">Language on the phone</legend>
          <div className="call-group">
            {parents.map((p) => (
              <label key={p.id} className="call-row">
                <span className="min-w-0 flex-1 font-semibold">{p.firstName} speaks</span>
                <select
                  name={`language_${p.id}`}
                  defaultValue={p.language || familyLocale}
                  className="call-select"
                  aria-label={`Language ${p.firstName} speaks on our calls`}
                >
                  {LOCALES.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.native === l.english ? l.english : `${l.native} (${l.english})`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
