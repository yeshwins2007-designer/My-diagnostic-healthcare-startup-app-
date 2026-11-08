import { formatINR } from '@/lib/money';
import { cx } from '@/components/ui';

/**
 * Daily earnings as bars, drawn in HTML so the labels stay readable at any
 * width (an SVG viewBox shrinks its text on a phone). One scale: each bar's
 * height is its value over the largest day, and the two gridlines name the
 * values they sit at. A table carries the same numbers for screen readers.
 */
export function EarningsChart({ days }: { days: { key: string; label: string; paise: number; orders: number }[] }) {
  const max = Math.max(...days.map((d) => d.paise), 0);
  const top = max > 0 ? max : 1;

  return (
    <figure className="flex flex-col gap-3">
      <div aria-hidden className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2">
          <span className="reading text-[0.6875rem] text-[var(--color-ink-faint)]">{formatINR(max)}</span>
          <span className="h-px flex-1 bg-[var(--color-line-strong)]" />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex items-center gap-2">
          <span className="reading text-[0.6875rem] text-[var(--color-ink-faint)]">{formatINR(Math.round(max / 2))}</span>
          <span className="h-px flex-1 bg-[var(--color-line)]" />
        </div>
        <div className="flex h-48 items-end gap-1 border-b border-[var(--color-line-strong)] pt-2 sm:gap-1.5">
          {days.map((d, i) => (
            <div key={d.key} className="flex h-full flex-1 flex-col justify-end" title={`${d.label}: ${formatINR(d.paise)} · ${d.orders} reports`}>
              <div
                className={cx(
                  'w-full rounded-t-[3px]',
                  i === days.length - 1 ? 'bg-[var(--color-ink)]' : 'bg-[color-mix(in_oklab,var(--color-ink)_45%,transparent)]',
                )}
                style={{ height: d.paise > 0 ? `max(2px, ${(d.paise / top) * 100}%)` : '0' }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1 sm:gap-1.5">
          {days.map((d, i) => (
            <span
              key={d.key}
              className={cx(
                'reading flex-1 text-center text-[0.625rem] text-[var(--color-ink-faint)]',
                // Every other date on a narrow screen, so none collide.
                i % 2 === 1 && i !== days.length - 1 && 'invisible sm:visible',
              )}
            >
              {d.key.slice(8)}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="text-small text-[var(--color-ink-faint)]">
        Earned per day from reports signed, last {days.length} days. Today is the solid bar.
      </figcaption>
      <table className="sr-only">
        <caption>Earnings per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Earned</th>
            <th scope="col">Reports</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{formatINR(d.paise)}</td>
              <td>{d.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
