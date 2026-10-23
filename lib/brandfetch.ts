/**
 * A partner lab's logo, from Brandfetch's Logo Link CDN.
 *
 * The browser loads the image straight from cdn.brandfetch.io (allowed in the
 * Content-Security-Policy's img-src); our server never fetches it. The client
 * ID is public by design. Without one, or without a website on file, callers
 * get null and show a monogram, so the portal never depends on a third party
 * to render.
 */

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function labLogoUrl(
  domain: string | null | undefined,
  { size = 96, theme = 'dark' }: { size?: number; theme?: 'dark' | 'light' } = {},
): string | null {
  const clientId = process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID;
  const host = (domain ?? '').trim().toLowerCase();
  if (!clientId || !DOMAIN.test(host)) return null;
  return `https://cdn.brandfetch.io/${host}/w/${size}/h/${size}/theme/${theme}/fallback/lettermark?c=${encodeURIComponent(clientId)}`;
}

/** "Ananya Diagnostics" -> "AD": the monogram shown when there is no logo. */
export function monogram(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}
