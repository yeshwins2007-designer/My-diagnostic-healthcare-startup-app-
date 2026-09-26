'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Icon = 'home' | 'visits' | 'reports' | 'calls' | 'plan';

const PATHS: Record<Icon, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  visits: 'M4 7h16v13H4zM4 11h16M8.5 4v5M15.5 4v5',
  reports: 'M7 3.5h7.5L19 8v12.5H7zM14.5 3.5V8H19M10 12.5h6M10 16.5h6',
  calls:
    'M6.6 4h3l1.5 4-2 1.3a11 11 0 0 0 5.6 5.6l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4z',
  plan: 'M3.5 6.5h17v11h-17zM3.5 10h17M7 14.5h4',
};

export interface BottomNavItem {
  href: string;
  label: string;
  icon: Icon;
}

/**
 * Primary navigation, within thumb reach.
 *
 * On a phone held one-handed the top of the screen is the hardest place to
 * reach, and the family checking a parent's results is often doing it while
 * holding something else. Below 640px this replaces the scrolling pill row in
 * the header; above it the nav is hidden and the header row returns.
 *
 * Each item is a 64px-tall target with a visible label: an icon alone is a
 * guessing game for someone who does not live in apps. The shell sets
 * .has-bottom-nav so fixed and sticky elements clear it; see globals.css.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname();

  // Home is exact-match; everything else owns its sub-routes, so a single
  // report still lights up "Reports".
  const isActive = (href: string) =>
    href === items[0]?.href ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[var(--color-line)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[var(--size-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 text-tiny font-semibold ${
                  active ? 'text-[var(--color-primary)]' : 'text-[var(--color-ink-soft)]'
                }`}
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full ${
                    active ? 'bg-[var(--color-primary-wash)]' : ''
                  }`}
                  style={{ transition: 'background-color var(--dur-settle) var(--ease-out-soft)' }}
                >
                  <svg aria-hidden viewBox="0 0 24 24" width="26" height="26">
                    <path
                      d={PATHS[item.icon]}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={active ? 2.25 : 1.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
