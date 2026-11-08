'use client';

import { useEffect } from 'react';

type Listener = { remove: () => void };
type Plugins = {
  App?: {
    addListener: (event: 'backButton', cb: (e: { canGoBack: boolean }) => void) => Promise<Listener> | Listener;
    exitApp: () => void;
  };
  StatusBar?: { setStyle: (o: { style: 'DARK' | 'LIGHT' }) => Promise<void> };
  SplashScreen?: { hide: () => Promise<void> };
};

/**
 * Inside the store apps (mobile/), the native shell exposes its plugins on
 * window.Capacitor. This wires the few that make it feel like an app:
 * Android's back button goes back a page (and leaves the app from the first
 * one), the status bar text follows the light or dark theme, and the splash
 * screen lifts as soon as the page is ready. In a browser it does nothing.
 */
export function NativeBridge() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Plugins } }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const { App, StatusBar, SplashScreen } = cap.Plugins ?? {};

    void SplashScreen?.hide();

    let back: Listener | undefined;
    const added = App?.addListener('backButton', ({ canGoBack }) => (canGoBack ? window.history.back() : App.exitApp()));
    Promise.resolve(added).then((l) => (back = l ?? undefined));

    const root = document.documentElement;
    const isLight = () =>
      root.dataset.theme === 'light' || (root.dataset.theme === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
    // 'DARK' means light text, for the dark theme.
    const paint = () => void StatusBar?.setStyle({ style: isLight() ? 'LIGHT' : 'DARK' }).catch(() => {});
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      back?.remove();
      observer.disconnect();
    };
  }, []);
  return null;
}
