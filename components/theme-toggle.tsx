'use client';

import { useEffect, useState } from 'react';

/**
 * Light / dark / follow-the-phone.
 *
 * The palettes and the restore script in app/layout.tsx already existed; what
 * was missing was any way for a person to choose. Without this the setting is
 * reachable only through the operating system, which is exactly the kind of
 * detour this product exists to remove — a 78-year-old should not have to go
 * hunting through iOS settings to make a screen readable at 6:30 AM.
 *
 * How the three states map onto app/globals.css:
 *
 *   auto   no data-theme attribute  -> the prefers-color-scheme media query wins
 *   light  data-theme="light"       -> excluded from that query, bare :root applies
 *   dark   data-theme="dark"        -> the explicit dark block applies
 */

type Theme = 'auto' | 'light' | 'dark';

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '☾' },
  { value: 'auto', label: 'Auto', icon: '◐' },
];

export function ThemeToggle() {
  // Always 'auto' on the first render so the server and client agree; the
  // stored preference is adopted on mount. The inline script in the layout has
  // already painted the right colours by then, so nothing flashes except which
  // button reads as pressed.
  const [theme, setTheme] = useState<Theme>('auto');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'light' || current === 'dark') setTheme(current);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', next);
    }
    try {
      // Empty rather than absent, matching the reader-size control: the
      // restore script treats a falsy value as "no override".
      localStorage.setItem('ss_theme', next === 'auto' ? '' : next);
    } catch {
      // Private mode can throw. The choice still applies to this visit.
    }
  }

  return (
    <div
      role="group"
      aria-label="Screen brightness"
      className="flex items-center gap-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          aria-pressed={theme === option.value}
          className={`flex min-h-12 min-w-12 flex-col items-center justify-center rounded-[var(--radius-control)] border-2 px-2 leading-none ${
            theme === option.value
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
              : 'border-[var(--color-line-strong)]'
          }`}
        >
          <span aria-hidden className="text-[var(--text-small)]">
            {option.icon}
          </span>
          {/* Every icon carries a text label — nobody should have to guess. */}
          <span className="mt-0.5 text-[var(--text-tiny)] font-semibold">
            {option.label}
          </span>
        </button>
      ))}
    </div>
  );
}
