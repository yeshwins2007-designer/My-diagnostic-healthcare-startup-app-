/**
 * Verifies a real Google Maps key end to end.
 *
 * The unit tests prove we build the right requests and survive every answer;
 * they deliberately never call Google. This calls Google, because the failures
 * that actually happen are key failures — an API not enabled, a referrer
 * restriction applied to a key used server-side, billing not linked — and none
 * of those are visible until a real request is made.
 *
 * Run:  npm run verify:maps
 */

import { env, providerMode } from '../lib/env';

const CENTRE = { lat: 12.925, lng: 77.5838 }; // Jayanagar
const NEARBY = { lat: 12.9271, lng: 77.5892 };
const ADDRESS = '11th Main Road, Jayanagar 4th Block, Bengaluru';

type Check = { api: string; ok: boolean; detail: string };
const results: Check[] = [];

function explain(status: string, msg?: string): string {
  switch (status) {
    case 'REQUEST_DENIED':
      return `REQUEST_DENIED${msg ? ` — ${msg}` : ''}. Usually the API is not enabled on the project, or the key is restricted by HTTP referrer and cannot be used from a server. Use an IP-restricted key in GOOGLE_MAPS_SERVER_KEY.`;
    case 'OVER_QUERY_LIMIT':
      return 'OVER_QUERY_LIMIT — billing is not linked to the project, or the daily cap is hit.';
    case 'INVALID_REQUEST':
      return 'INVALID_REQUEST — the request was malformed (a bug here, not a key problem).';
    case 'ZERO_RESULTS':
      return 'ZERO_RESULTS — the key works; Google just had no match for this input.';
    default:
      return `${status}${msg ? ` — ${msg}` : ''}`;
  }
}

async function call(api: string, url: URL): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      results.push({ api, ok: false, detail: `HTTP ${res.status}` });
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    results.push({ api, ok: false, detail: `network error: ${(e as Error).message}` });
    return null;
  }
}

async function main() {
  const serverKey = env.GOOGLE_MAPS_SERVER_KEY;
  const publicKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const key = serverKey || publicKey;

  console.log(`providerMode.maps = ${providerMode.maps}`);
  console.log(`GOOGLE_MAPS_SERVER_KEY        ${serverKey ? 'set' : 'NOT SET'}`);
  console.log(`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ${publicKey ? 'set' : 'NOT SET'}\n`);

  if (!key) {
    console.error('No key set. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (browser, referrer-restricted)');
    console.error('and GOOGLE_MAPS_SERVER_KEY (server, IP-restricted) to .env.local or .env.pilot.');
    process.exit(1);
  }
  if (!serverKey) {
    console.warn('⚠  Only the public key is set. If it is referrer-restricted, the three');
    console.warn('   server-side calls below will fail with REQUEST_DENIED. That is expected,');
    console.warn('   and the fix is a second, IP-restricted key in GOOGLE_MAPS_SERVER_KEY.\n');
  }

  // 1 — Geocoding: turns a typed address into the pin the technician drives to.
  {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', ADDRESS);
    url.searchParams.set('region', 'in');
    url.searchParams.set('key', key);
    const d = await call('Geocoding', url);
    if (d) {
      const status = String(d.status);
      const top = (d.results as { geometry?: { location?: unknown; location_type?: string } }[])?.[0];
      results.push({
        api: 'Geocoding',
        ok: status === 'OK',
        detail:
          status === 'OK'
            ? `${JSON.stringify(top?.geometry?.location)} (${top?.geometry?.location_type})`
            : explain(status, d.error_message as string | undefined),
      });
    }
  }

  // 2 — Directions: the optimised morning route.
  {
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('origin', `${CENTRE.lat},${CENTRE.lng}`);
    url.searchParams.set('destination', `${CENTRE.lat},${CENTRE.lng}`);
    url.searchParams.set('waypoints', `optimize:true|${NEARBY.lat},${NEARBY.lng}`);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('key', key);
    const d = await call('Directions', url);
    if (d) {
      const status = String(d.status);
      const legs = (d.routes as { legs?: unknown[] }[])?.[0]?.legs?.length ?? 0;
      results.push({
        api: 'Directions',
        ok: status === 'OK',
        detail: status === 'OK' ? `${legs} legs returned` : explain(status, d.error_message as string | undefined),
      });
    }
  }

  // 3 — Distance Matrix: the live ETA the family watches.
  {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${CENTRE.lat},${CENTRE.lng}`);
    url.searchParams.set('destinations', `${NEARBY.lat},${NEARBY.lng}`);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('departure_time', 'now');
    url.searchParams.set('key', key);
    const d = await call('Distance Matrix', url);
    if (d) {
      const status = String(d.status);
      const el = (d.rows as { elements?: { duration?: { text?: string } }[] }[])?.[0]?.elements?.[0];
      results.push({
        api: 'Distance Matrix',
        ok: status === 'OK',
        detail: status === 'OK' ? `ETA ${el?.duration?.text ?? 'unknown'}` : explain(status, d.error_message as string | undefined),
      });
    }
  }

  console.log('Results');
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.api.padEnd(16)} ${r.detail}`);

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`\n${failed.length} of ${results.length} failed.`);
    console.log('Enable these on the project: Maps JavaScript API, Geocoding API,');
    console.log('Directions API, Distance Matrix API, Places API.');
    process.exit(1);
  }
  console.log('\nAll server-side Maps APIs answered. The browser map is separate:');
  console.log('open /caregiver/track/<bookingId> over HTTPS and confirm the');
  console.log('"simulated" chip is gone and the basemap renders.');
}

main();
