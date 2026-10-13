import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { brand } from '@/lib/brand';
import './globals.css';
import './apple.css';

/** iPhone, iPad and Mac. iPadOS reports itself as a Mac, so both count. */
const APPLE_UA = /iPhone|iPad|iPod|Macintosh/;

/**
 * Runs before first paint, so nothing flashes:
 * - the reader text size and theme the person chose earlier;
 * - on Apple devices, data-platform="apple", which switches on app/apple.css
 *   (and nothing else: Android and other platforms never get the attribute);
 * - on iPhone and iPad, the text size set in iOS Settings (Dynamic Type),
 *   measured from -apple-system-body and clamped so layouts still hold.
 */
const BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var r=localStorage.getItem('ss_reader');if(r)d.setAttribute('data-reader',r);var t=localStorage.getItem('ss_theme');if(t)d.setAttribute('data-theme',t);}catch(e){}try{var u=navigator.userAgent,ios=/iPhone|iPad|iPod/.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1);if(ios||/Macintosh/.test(u)){d.setAttribute('data-platform','apple');d.setAttribute('data-apple',ios?'ios':'mac');if(ios){var p=document.createElement('span');p.style.cssText='font:-apple-system-body;position:absolute;visibility:hidden';d.appendChild(p);var px=parseFloat(getComputedStyle(p).fontSize)||17;d.removeChild(p);d.style.setProperty('--dynamic-type',String(Math.min(1.35,Math.max(0.9,px/17))));}}}catch(e){}})();`;

export const metadata: Metadata = {
  title: {
    default: `${brand.name} · Blood tests at home for elderly parents`,
    template: `%s · ${brand.name}`,
  },
  description: brand.oneLiner,
  applicationName: brand.name,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: 'default' },
  // Health records: keep this out of search indexes entirely.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never lock zoom. Pinch-to-zoom is an accessibility tool for this audience.
  maximumScale: 5,
  userScalable: true,
  // Let the page own the area behind the notch and the home indicator. Without
  // this every env(safe-area-inset-*) resolves to zero and the .safe-* helpers
  // in globals.css do nothing.
  viewportFit: 'cover',
  // The obsidian canvas is the default in every mode; light is a choice made
  // in Profile, after the browser chrome has already been coloured.
  themeColor: '#09090b',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by proxy.ts per request; the inline script below runs only with it.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  const isApple = APPLE_UA.test(requestHeaders.get('user-agent') ?? '');
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Geist for Latin, Geist Mono for readings, and Noto Sans behind both
            for every Indian script this product speaks, including Assamese
            and Gurmukhi, which many default stacks render as boxes. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans+Bengali:wght@400;600;700&family=Noto+Sans+Tamil:wght@400;600;700&family=Noto+Sans+Telugu:wght@400;600;700&family=Noto+Sans+Kannada:wght@400;600;700&family=Noto+Sans+Malayalam:wght@400;600;700&family=Noto+Sans+Gujarati:wght@400;600;700&family=Noto+Sans+Gurmukhi:wght@400;600;700&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap"
        />
        {/* The Home Screen icon (iOS takes a PNG, not the SVG). Apple devices
            only, so Android's install icon stays exactly as it was. */}
        {isApple && <link rel="apple-touch-icon" href="/apple-touch-icon.png" />}
        <script
          nonce={nonce}
          // An elderly user who chose "largest" never sees a flash of small text.
          dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
