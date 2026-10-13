import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content-Security-Policy, with a fresh nonce on every request.
 *
 * The browser runs a script only if it carries this request's nonce, or was
 * loaded by a script that did ('strict-dynamic'). An attacker who manages to
 * inject markup into a page - a patient name, a lab note, a support message -
 * still cannot run code in it, and so cannot read the records on screen or
 * act as the signed-in family or staff member. Next.js attaches the nonce to
 * its own scripts; app/layout.tsx attaches it to the one inline script.
 *
 * Third parties are named, each for what it actually loads: Razorpay's
 * checkout (payment iframe), Google Maps (tiles, workers), ElevenLabs (voice),
 * Google Fonts and Brandfetch (partner labs' logos, images only). Styles allow 'unsafe-inline' because React style
 * attributes need it; a nonce on style-src would silently disable that.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  const policy = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' blob:${isDev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com https://cdn.razorpay.com https://cdn.brandfetch.io`,
    `connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://api.razorpay.com https://lumberjack.razorpay.com https://*.elevenlabs.io wss://*.elevenlabs.io${isDev ? ' ws: wss:' : ''}`,
    `frame-src https://api.razorpay.com https://checkout.razorpay.com https://*.google.com`,
    `worker-src 'self' blob:`,
    `media-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://api.razorpay.com`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const partnerPath = partnerRewrite(request);
  const response = partnerPath
    ? NextResponse.rewrite(new URL(partnerPath + request.nextUrl.search, request.url), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

/**
 * The partner app on its own host (PARTNER_HOST, e.g. partners.medwyn.in),
 * the way a restaurant partner app is separate from the ordering app. On
 * that host the portal is served at the root: / is the order terminal,
 * /login the partner sign-in, /earnings the earnings, and so on. It is a
 * rewrite, not a copy: the same pages under app/lab answer, with the same
 * guards, and /lab/... keeps working on both hosts. Everything else (the
 * API, other areas a signed-in person is sent to) passes through untouched.
 */
const PARTNER_PATHS = new Set(['/', '/login', '/register', '/apply', '/agreement', '/earnings', '/catalog', '/profile']);

function partnerRewrite(request: NextRequest): string | null {
  const partnerHost = process.env.PARTNER_HOST?.trim().toLowerCase();
  if (!partnerHost) return null;
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (host !== partnerHost) return null;
  const path = request.nextUrl.pathname.replace(/\/+$/, '') || '/';
  if (!PARTNER_PATHS.has(path)) return null;
  return path === '/' ? '/lab' : `/lab${path}`;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes return data, and static assets carry no script.
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
