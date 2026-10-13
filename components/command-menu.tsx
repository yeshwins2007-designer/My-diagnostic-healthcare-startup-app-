'use client';

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export interface CommandItem {
  group: string;
  label: string;
  href: string;
  hint?: string;
  keywords?: string;
}

/**
 * The command menu: ⌘K (Ctrl+K, or "/") from anywhere, or the search button
 * in the header. Jump to any screen, or search the tests.
 *
 * Built on the native <dialog>: the browser supplies the modal focus trap,
 * Escape to close, the inert background and the backdrop, so this adds no
 * dialog library. Navigation runs in a transition, which is what lets the
 * shared-element morphs play.
 */
export function CommandMenu({
  items,
  searchHref,
  searchLabel = 'Search tests for',
  placeholder = 'Go to, or search tests…',
}: {
  items: CommandItem[];
  /** Where free text goes, e.g. "/caregiver/book?q=". Omit to disable. */
  searchHref?: string;
  searchLabel?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const listId = useId();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? items.filter((i) => `${i.label} ${i.keywords ?? ''} ${i.group}`.toLowerCase().includes(q))
      : items;
    const out: (CommandItem & { key: string })[] = matched.map((i) => ({ ...i, key: i.href + i.label }));
    if (q && searchHref) {
      out.push({
        key: 'search',
        group: 'Search',
        label: `${searchLabel} “${query.trim()}”`,
        href: searchHref + encodeURIComponent(query.trim()),
      });
    }
    return out;
  }, [items, query, searchHref, searchLabel]);

  const open = () => {
    setQuery('');
    setActive(0);
    dialog.current?.showModal();
    requestAnimationFrame(() => input.current?.focus());
  };
  const close = () => dialog.current?.close();
  const go = (href: string) => {
    close();
    if (href.startsWith('tel:')) {
      window.location.href = href;
      return;
    }
    startTransition(() => router.push(href));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        if (dialog.current?.open) close();
        else open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      go(results[active].href);
    }
  };

  let lastGroup = '';

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Search and go to (Command K)"
        className="icon-btn inline-flex h-12 min-w-12 items-center justify-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-line-strong)] px-3 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] sm:min-w-56 sm:justify-between"
      >
        <span className="inline-flex items-center gap-2.5">
          <svg aria-hidden viewBox="0 0 24 24" width="18" height="18">
            <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="hidden text-small sm:inline">Search</span>
        </span>
        <kbd className="hidden rounded border border-[var(--color-line-strong)] px-1.5 py-0.5 font-mono text-[0.6875rem] sm:inline">⌘K</kbd>
      </button>

      <dialog
        ref={dialog}
        className="sheet"
        aria-label="Search and go to"
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <div className="flex h-full items-start justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-[12vh]">
          <div className="sheet-panel glass w-full max-w-xl overflow-hidden rounded-[var(--radius-card-lg)] border [box-shadow:var(--shadow-card)]">
            <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4">
              <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" className="shrink-0 text-[var(--color-ink-faint)]">
                <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={input}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onListKey}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
                aria-label="Search"
                placeholder={placeholder}
                className="h-14 w-full bg-transparent text-base text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)] focus-visible:outline-none"
              />
              <kbd className="hidden rounded border border-[var(--color-line-strong)] px-1.5 py-0.5 font-mono text-[0.6875rem] text-[var(--color-ink-faint)] sm:inline">esc</kbd>
            </div>
            <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
              {results.length === 0 && (
                <li className="px-3 py-6 text-center text-small text-[var(--color-ink-faint)]">Nothing matches.</li>
              )}
              {results.map((r, i) => {
                const header = r.group !== lastGroup ? r.group : null;
                lastGroup = r.group;
                return (
                  <li key={r.key} role="presentation">
                    {header && <p className="eyebrow px-3 pt-3 pb-1.5">{header}</p>}
                    <button
                      type="button"
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(r.href)}
                      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 text-left ${
                        i === active ? 'bg-[var(--color-primary-wash)] text-[var(--color-ink)]' : 'text-[var(--color-ink-soft)]'
                      }`}
                    >
                      <span className="truncate">{r.label}</span>
                      {r.hint && <span className="shrink-0 font-mono text-[0.6875rem] text-[var(--color-ink-faint)]">{r.hint}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </dialog>
    </>
  );
}
