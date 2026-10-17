'use client';

import { Button } from '@/components/ui';

/** Printing is the point of the card, so the control is not hidden in a menu. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      🖨 {label}
    </Button>
  );
}
