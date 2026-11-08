'use client';

import { usePathname } from 'next/navigation';
import { CallsIntro } from '@/components/calls-intro';

/** Screens where a family is in the middle of something: the sheet waits until they're done. */
const FLOWS = ['/caregiver/onboarding', '/caregiver/book', '/caregiver/checkout'];

/**
 * The calls sheet, once, on the first ordinary screen after sign-up: never
 * over adding a parent, booking or paying.
 */
export function CallsIntroGate(props: Omit<React.ComponentProps<typeof CallsIntro>, 'defaultOpen' | 'launcherLabel'>) {
  const pathname = usePathname() ?? '';
  if (FLOWS.some((p) => pathname.startsWith(p))) return null;
  return <CallsIntro defaultOpen {...props} />;
}
