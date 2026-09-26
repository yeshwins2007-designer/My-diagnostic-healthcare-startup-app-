import { Badge } from '@/components/ui';

export type Band = 'GREEN' | 'YELLOW' | 'RED';

const TONE = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' } as const;

/**
 * A whole report's status, in words.
 *
 * Shared so that the home screen and the report itself say the same thing:
 * the home card used to print the raw band ("red"), which names a colour
 * rather than telling a family what to do.
 */
export function OverallBandChip({ band }: { band: Band }) {
  return (
    <Badge tone={TONE[band]} variant="tonal">
      <span aria-hidden>{band === 'GREEN' ? '✓' : band === 'RED' ? '!' : '↕'}</span>
      {band === 'GREEN'
        ? 'All within range'
        : band === 'RED'
          ? 'Needs a doctor today'
          : 'Some values outside range'}
    </Badge>
  );
}
