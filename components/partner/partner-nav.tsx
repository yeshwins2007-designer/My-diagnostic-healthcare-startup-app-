'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';

export interface NavItem {
  href: string;
  label: string;
  /** A short live reading beside the label, e.g. "3" pending or "₹4,180". */
  reading?: string;
  /** Draws the eye: pending orders waiting on a decision. */
  alert?: boolean;
}

/**
 * The terminal's sections. Vertical in the sticky sidebar on a desk screen;
 * a horizontal strip on a phone, so a manager checking from the corridor
 * gets the same four doors.
 */
export function PartnerNav({ items, orientation }: { items: NavItem[]; orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/lab' ? pathname === '/lab' : pathname.startsWith(href));

  return (
    <nav aria-label="Partner terminal">
      <ul className={cx(orientation === 'vertical' ? 'flex flex-col gap-1' : 'scroll-x flex gap-2 pb-1')}>
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3.5 text-[0.9375rem] font-medium',
                  active
                    ? 'border-[var(--color-line-strong)] bg-[var(--color-primary-wash)] text-[var(--color-ink)]'
                    : 'border-transparent text-[var(--color-ink-soft)] hover:bg-[var(--color-primary-wash)] hover:text-[var(--color-ink)]',
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={cx('h-4 w-0.5 rounded-full', active ? 'bg-[var(--color-ink)]' : 'bg-transparent')}
                  />
                  {item.label}
                </span>
                {item.reading && (
                  <span
                    className={cx(
                      'reading rounded-full px-2 py-0.5 text-[0.75rem]',
                      item.alert
                        ? 'bg-[var(--color-yellow-wash)] text-[var(--color-yellow)]'
                        : 'text-[var(--color-ink-faint)]',
                    )}
                  >
                    {item.reading}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
