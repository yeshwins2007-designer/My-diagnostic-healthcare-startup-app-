/**
 * Where a value sits against its laboratory reference range.
 *
 * A meter, not a chart: one value, one range. It restates two numbers that
 * are already printed beside it — the value and the range — so it is hidden
 * from assistive tech rather than read out a second time, and nothing on it
 * is the only place a number appears.
 *
 * Geometry is arithmetic, deliberately. The range occupies the middle of the
 * track with half a range-width of margin either side, which is also where
 * the laboratory's critical thresholds sit (see REFERENCE_RANGES in
 * app/actions/lab.ts), so a marker reaching the edge means the same thing
 * the "urgent" flag does. Values further out pin to the edge and change
 * shape, rather than stretching the scale until the range is a sliver.
 */

export type RangePosition = 'below' | 'within' | 'above';

export function positionOf(value: number, low: number, high: number): RangePosition {
  if (value < low) return 'below';
  if (value > high) return 'above';
  return 'within';
}

const MARKER: Record<'GREEN' | 'YELLOW' | 'RED', string> = {
  GREEN: 'var(--color-green)',
  YELLOW: 'var(--color-yellow)',
  RED: 'var(--color-red)',
};

export function RangeMeter({
  value,
  low,
  high,
  band,
}: {
  value: number;
  low: number;
  high: number;
  band: 'GREEN' | 'YELLOW' | 'RED';
}) {
  const span = high - low || 1;
  // Lab values cannot be negative; do not draw a track below zero.
  const min = low >= 0 ? Math.max(0, low - span * 0.5) : low - span * 0.5;
  const max = high + span * 0.5;
  const at = (v: number) => ((v - min) / (max - min)) * 100;

  const raw = at(value);
  const clamped = Math.min(100, Math.max(0, raw));
  const offScale = raw < 0 ? 'low' : raw > 100 ? 'high' : null;
  const lo = at(low);
  const hi = at(high);
  const color = MARKER[band];

  return (
    <div aria-hidden className="relative h-6 w-full">
      {/* track: a hairline, like a scale on an instrument */}
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-line-strong)]" />
      {/* reference range: a solid segment, edges marked by ticks */}
      <div
        className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
        style={{
          left: `${lo}%`,
          width: `${hi - lo}%`,
          background: 'color-mix(in oklab, var(--color-ink) 22%, transparent)',
        }}
      />
      {[lo, hi].map((x) => (
        <div
          key={x}
          className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-[var(--color-ink-faint)]"
          style={{ left: `${x}%` }}
        />
      ))}
      {/* value: a needle in the band's status colour */}
      {offScale ? (
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          // Positioned by inline transform only. Tailwind v4 implements
          // -translate-y-1/2 with the separate CSS `translate` property, so
          // combining the two would shift the arrow twice.
          className="absolute top-1/2"
          style={{
            left: offScale === 'high' ? 'calc(100% - 16px)' : '0',
            transform: `translateY(-50%)${offScale === 'low' ? ' scaleX(-1)' : ''}`,
          }}
        >
          <path d="M3 2l10 6-10 6z" fill={color} stroke="var(--color-canvas)" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      ) : (
        <div
          className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${clamped}%`,
            background: color,
            // The canvas ring keeps the needle distinct where it crosses a tick.
            boxShadow: '0 0 0 2px var(--color-canvas)',
          }}
        />
      )}
    </div>
  );
}
