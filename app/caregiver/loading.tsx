import { DataStream, Page } from '@/components/ui';

/**
 * The default loading state for every caregiver screen: a status line with
 * a ticker over bars in the shape of what is coming, each bar pulsing a beat
 * after the one above it. Rendered inside the caregiver layout, so the
 * header, the tab bar and the assistant stay put; only the body waits.
 */
export default function LoadingCaregiver() {
  return (
    <Page>
      <DataStream label="Loading" rows={4} />
    </Page>
  );
}
