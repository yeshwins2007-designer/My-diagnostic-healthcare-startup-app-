import { Card, Page, Skeleton, Stack } from '@/components/ui';

/**
 * Shown the instant a report is opened, while the server decrypts the values
 * and checks family membership.
 *
 * The skeleton is the shape of the real page — a summary, then result cards
 * with a value and a range track — so the page resolves into place rather than
 * replacing a spinner. This is the fix for "fast" on authenticated medical
 * pages: the route stays uncached, so the data is never stale, but the wait
 * no longer looks like a blank screen.
 */
export default function LoadingReport() {
  return (
    <Page>
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading the report</span>
        <Stack gap="lg">
          <Skeleton className="h-6 w-32" />

          <Card elevated>
            <Stack gap="md">
              <Stack gap="sm">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-11 w-3/4" />
                <Skeleton className="h-7 w-1/2" />
              </Stack>
              <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-line)] pt-4">
                <Skeleton className="h-9 w-44 rounded-full" />
                <Skeleton className="h-6 w-52" />
              </div>
            </Stack>
          </Card>

          <Skeleton className="h-9 w-36" />

          <Stack gap="md">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} elevated>
                <Stack gap="sm">
                  <div className="flex items-start justify-between gap-3">
                    <Skeleton className="h-7 w-2/5" />
                    <Skeleton className="h-8 w-32 rounded-full" />
                  </div>
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-2 w-full rounded-full" />
                  <Skeleton className="h-5 w-48" />
                </Stack>
              </Card>
            ))}
          </Stack>
        </Stack>
      </div>
    </Page>
  );
}
