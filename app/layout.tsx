import type { Metadata, Viewport } from 'next';
import { brand } from '@/lib/brand';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${brand.name} — doorstep diagnostics for elderly parents`,
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f6' },
    { media: '(prefers-color-scheme: dark)', color: '#16150f' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Noto Sans covers every script this product speaks, including
            Assamese and Gurmukhi, which many default stacks render as boxes. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans+Bengali:wght@400;600;700&family=Noto+Sans+Tamil:wght@400;600;700&family=Noto+Sans+Telugu:wght@400;600;700&family=Noto+Sans+Kannada:wght@400;600;700&family=Noto+Sans+Malayalam:wght@400;600;700&family=Noto+Sans+Gujarati:wght@400;600;700&family=Noto+Sans+Gurmukhi:wght@400;600;700&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap"
        />
        <script
          // Applies the saved reader text size and theme before first paint, so
          // an elderly user who chose "largest" never sees a flash of small text.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=localStorage.getItem('ss_reader');if(r)document.documentElement.setAttribute('data-reader',r);var t=localStorage.getItem('ss_theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
