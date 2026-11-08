'use client';

import { useParams } from 'next/navigation';
import { Morph } from '@/components/morph';
import { Eyebrow, Page, Skeleton, Stack } from '@/components/ui';

/**
 * Shown the instant a report is opened, while the server decrypts the values
 * and checks family membership. The shape of the real page (a header with
 * its readout strip, then result rows with a scale), so the report resolves
 * into place. The route stays uncached, so the data is never stale.
 *
 * The header carries the report's morph name, read from the URL: the summary
 * card that was tapped morphs into this header at once, and this header
 * morphs into the real one when the data arrives. Without it there would be
 * no element to pair with while the data loads, and no morph.
 */
export default function LoadingReport() {
  const { reportId } = useParams<{ reportId: string }>();
  return (
    <Page>
      <div role="status" aria-live="polite">
        <Stack gap="lg">
          <Skeleton className="h-4 w-24" />

          <Morph name={`report-${reportId}`}>
            <section className="panel flex flex-col gap-5 rounded-[var(--radius-card-lg)] border p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <Eyebrow className="flex items-center gap-3">
                  <span className="ticker" aria-hidden>
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  Decrypting report
                </Eyebrow>
                <Skeleton className="h-3 w-20" index={1} />
              </div>
              <Stack gap="sm">
                <Skeleton className="h-9 w-3/4" index={2} />
                <Skeleton className="h-4 w-1/2" index={3} />
              </Stack>
              <div className="grid grid-cols-3 gap-2">
                {[4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-14" index={i} />
                ))}
              </div>
            </section>
          </Morph>

          <section className="panel flex flex-col overflow-hidden rounded-[var(--radius-card-lg)] border">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-3 border-b border-[var(--color-line)] px-5 py-4 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-2/5" index={i * 3 + 7} />
                  <Skeleton className="h-5 w-24 rounded-full" index={i * 3 + 8} />
                </div>
                <Skeleton className="h-7 w-28" index={i * 3 + 9} />
                <Skeleton className="h-1 w-full rounded-full" index={i * 3 + 9} />
              </div>
            ))}
          </section>
        </Stack>
      </div>
    </Page>
  );
}
