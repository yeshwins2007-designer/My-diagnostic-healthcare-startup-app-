'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Icon = 'home' | 'visits' | 'reports' | 'calls' | 'plan' | 'profile';

const PATHS: Record<Icon, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  visits: 'M4 7h16v13H4zM4 11h16M8.5 4v5M15.5 4v5',
  reports: 'M7 3.5h7.5L19 8v12.5H7zM14.5 3.5V8H19M10 12.5h6M10 16.5h6',
  calls:
    'M6.6 4h3l1.5 4-2 1.3a11 11 0 0 0 5.6 5.6l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4z',
  plan: 'M3.5 6.5h17v11h-17zM3.5 10h17M7 14.5h4',
  profile: 'M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5zM4.5 20.5c.9-3.6 3.9-5.8 7.5-5.8s6.6 2.2 7.5 5.8',
};

export interface BottomNavItem {
  href: string;
  label: string;
  icon: Icon;
}

/** Home is exact-match; everything else owns its sub-routes. */
function useIsActive(items: { href: string }[]) {
  const pathname = usePathname();
  return (href: string) => (href === items[0]?.href ? pathname === href : pathname.startsWith(href));
}

/**
 * Primary navigation on a phone, within thumb reach: glass over the content,
 * a labelled 48px+ target per item, and a single light under the active one.
 * Hidden from 640px, where TopNav takes over in the header.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const isActive = useIsActive(items);
  return (
    <nav
      aria-label="Main"
      className="glass fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 px-1">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1.5 px-1 text-[0.6875rem] font-medium tracking-[0.04em] ${
                  active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-faint)]'
                }`}
              >
                <svg aria-hidden viewBox="0 0 24 24" width="22" height="22">
                  <path
                    d={PATHS[item.icon]}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={active ? 2 : 1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="leading-none">{item.label}</span>
                <span
                  aria-hidden
                  className={`absolute top-0 h-px w-8 bg-[var(--color-ink)] transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The same items as a segmented control in the header, from 640px. With
 * `scroll`, it stays visible at every width and scrolls sideways on a phone
 * (the ops console, which has no bottom bar).
 */
export function TopNav({ items, scroll }: { items: { href: string; label: string }[]; scroll?: boolean }) {
  const isActive = useIsActive(items);
  return (
    <nav
      aria-label="Main"
      className={`items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-line)] p-1 ${
        scroll ? 'scroll-x flex w-full whitespace-nowrap' : 'hidden sm:flex'
      }`}
    >
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-[calc(var(--radius-control)-3px)] px-3.5 text-small font-medium ${
              active
                ? 'bg-[var(--color-primary-wash)] text-[var(--color-ink)] [box-shadow:inset_0_0_0_1px_var(--color-line-strong)]'
                : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
