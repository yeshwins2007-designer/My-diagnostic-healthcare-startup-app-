import { ViewTransition, type ReactNode } from 'react';

/**
 * A shared element between routes. Give a summary card and the screen it
 * opens the same `name`, and the browser morphs one into the other during
 * the navigation, on the compositor, with the system's spring (see
 * ::view-transition-group(.morph) in globals.css). Where the browser has no
 * View Transitions support, navigation simply happens without the morph.
 */
export function Morph({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
