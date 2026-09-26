import { Card, Page, Skeleton, Stack } from '@/components/ui';

/**
 * The default loading state for every caregiver screen.
 *
 * Rendered inside the caregiver layout, so the header, the bottom navigation
 * and the assistant stay put and only the page body waits. A screen with its
 * own shape — the report — supplies a more specific loading.tsx.
 */
export default function LoadingCaregiver() {
  return (
    <Page>
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading</span>
        <Stack gap="lg">
          <Stack gap="sm">
            <Skeleton className="h-11 w-2/3" />
            <Skeleton className="h-7 w-1/2" />
          </Stack>
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Stack gap="sm">
                <Skeleton className="h-7 w-1/2" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-4/5" />
              </Stack>
            </Card>
          ))}
        </Stack>
      </div>
    </Page>
  );
}
