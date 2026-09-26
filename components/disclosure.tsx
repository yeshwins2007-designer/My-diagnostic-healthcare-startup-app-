'use client';

import { useId, useState, type ReactNode } from 'react';

/**
 * A section that expands and collapses.
 *
 * The height transition lives in globals.css (.disclosure) and animates
 * grid-template-rows, so there is no measured height and no guessed
 * max-height that clips a long panel or a reader who has chosen A++.
 *
 * The trigger is a real <button> carrying aria-expanded and aria-controls, so
 * a screen reader announces the state change and a keyboard or switch user
 * reaches it like any other control. Collapsed content is inert: it cannot be
 * tabbed into while hidden.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  /** The always-visible row. Rendered inside the button, so no nested controls. */
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="tap-surface flex min-h-[var(--size-touch)] w-full items-center gap-4 text-left"
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          width="28"
          height="28"
          className="shrink-0 text-[var(--color-ink-soft)]"
          style={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--dur-settle) var(--ease-out-soft)',
          }}
        >
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="disclosure" data-open={open}>
        <div id={panelId} inert={!open} role="region">
          <div className="pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
