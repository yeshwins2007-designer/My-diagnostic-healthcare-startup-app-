import { NextResponse } from 'next/server';
import { redeemElderLink } from '@/lib/auth/elder';
import { clientKey, rateLimit } from '@/lib/rate-limit';

/**
 * Opening the family's Elder Mode link on the parent's phone. The token is in
 * the path only for this one request: it is redeemed for a device key and the
 * browser is sent on to /elder, so the link never lingers in the address bar.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const base = new URL(request.url);

  // Guessing a 256-bit token is hopeless; this only stops hammering the database.
  if (!rateLimit(clientKey(request, 'elder-open'), { limit: 20, windowSeconds: 600 }).allowed) {
    return NextResponse.redirect(new URL('/elder?link=wait', base), 303);
  }

  const ok = token.length >= 40 && (await redeemElderLink(token));
  const response = NextResponse.redirect(new URL(ok ? '/elder' : '/elder?link=expired', base), 303);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
