/**
 * The live Google Maps provider.
 *
 * These exist because the live path is the one nobody exercises until a real
 * customer is waiting at a door. The simulated provider runs in every dev
 * session; the Google one runs only once a key is set, and by then a wrong
 * request URL or an unhandled REQUEST_DENIED is a production incident.
 *
 * fetch is stubbed throughout: the point is to prove we build the right
 * request and survive every answer Google can give, not to call Google.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const KEY = 'test-server-key';

vi.mock('@/lib/env', () => ({
  env: {
    GOOGLE_MAPS_SERVER_KEY: 'test-server-key',
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'test-public-key',
  },
  providerMode: { maps: 'live' },
}));

const { getMapsProvider } = await import('@/lib/providers/maps');

let calls: string[] = [];
function stubFetch(handler: (url: string) => unknown) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = input.toString();
      calls.push(url);
      const body = handler(url);
      if (body instanceof Error) throw body;
      return { ok: true, json: async () => body } as Response;
    }),
  );
}

beforeEach(() => {
  calls = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('live geocoding', () => {
  it('asks Google for the right address and reads the pin back', async () => {
    stubFetch(() => ({
      status: 'OK',
      results: [
        {
          formatted_address: '42, 11th Main Rd, Jayanagar, Bengaluru 560011',
          geometry: { location: { lat: 12.9271, lng: 77.5892 }, location_type: 'ROOFTOP' },
          address_components: [{ long_name: '560011', types: ['postal_code'] }],
        },
      ],
    }));

    const r = await getMapsProvider().geocode('42, 11th Main Road');

    const url = new URL(calls[0]);
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/geocode/json');
    expect(url.searchParams.get('address')).toContain('11th Main Road');
    // region=in keeps Google from resolving Indian addresses to a US namesake.
    expect(url.searchParams.get('region')).toBe('in');
    expect(url.searchParams.get('key')).toBe(KEY);

    expect(r?.position).toEqual({ lat: 12.9271, lng: 77.5892 });
    expect(r?.pincode).toBe('560011');
    // ROOFTOP is a real door, so the family is not asked to drop a pin.
    expect(r?.approximate).toBe(false);
  });

  it('flags a non-rooftop match as approximate', async () => {
    stubFetch(() => ({
      status: 'OK',
      results: [
        {
          formatted_address: 'Jayanagar, Bengaluru',
          geometry: { location: { lat: 12.92, lng: 77.58 }, location_type: 'APPROXIMATE' },
          address_components: [],
        },
      ],
    }));
    expect((await getMapsProvider().geocode('somewhere vague'))?.approximate).toBe(true);
  });

  it('returns null rather than throwing when Google is unreachable', async () => {
    stubFetch(() => new Error('ENOTFOUND'));
    await expect(getMapsProvider().geocode('anywhere')).resolves.toBeNull();
  });

  it('reports a rejected key instead of silently finding nothing', async () => {
    stubFetch(() => ({ status: 'REQUEST_DENIED', error_message: 'referer blocked', results: [] }));
    expect(await getMapsProvider().geocode('anywhere')).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('REQUEST_DENIED'));
  });
});

describe('live route planning', () => {
  const origin = { lat: 12.925, lng: 77.5838 };
  const stops = [
    { id: 'a', position: { lat: 12.9271, lng: 77.5892 }, serviceMinutes: 10 },
    { id: 'b', position: { lat: 12.9218, lng: 77.5828 }, serviceMinutes: 10 },
  ];

  it('asks Google to optimise the waypoint order and honours the answer', async () => {
    stubFetch(() => ({
      status: 'OK',
      routes: [
        {
          overview_polyline: { points: 'abc' },
          // Google reversed the stops: b is the efficient first call.
          waypoint_order: [1, 0],
          legs: [
            { distance: { value: 1200 }, duration: { value: 360 } },
            { distance: { value: 900 }, duration: { value: 300 } },
            { distance: { value: 1500 }, duration: { value: 420 } },
          ],
        },
      ],
    }));

    const plan = await getMapsProvider().planRoute(origin, stops);

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/maps/api/directions/json');
    expect(url.searchParams.get('waypoints')).toMatch(/^optimize:true\|/);
    expect(url.searchParams.get('mode')).toBe('driving');

    expect(plan.orderedStopIds).toEqual(['b', 'a']);
    expect(plan.encodedPolyline).toBe('abc');
    expect(plan.distanceKm).toBe(3.6);
    // Cumulative arrival: 6 min drive + 10 service, then 5 + 10.
    expect(plan.legMinutes).toEqual([16, 31]);
  });

  it('falls back to the offline planner when Google errors', async () => {
    stubFetch(() => new Error('socket hang up'));
    const plan = await getMapsProvider().planRoute(origin, stops);
    // Still a usable route: the technician's morning does not stop.
    expect(plan.orderedStopIds).toHaveLength(2);
    expect(plan.durationMinutes).toBeGreaterThan(0);
  });

  it('never calls Google for an empty route', async () => {
    stubFetch(() => ({}));
    const plan = await getMapsProvider().planRoute(origin, []);
    expect(calls).toHaveLength(0);
    expect(plan.distanceKm).toBe(0);
  });
});

describe('live ETA', () => {
  const from = { lat: 12.925, lng: 77.5838 };
  const to = { lat: 12.9271, lng: 77.5892 };

  it('prefers duration_in_traffic over free-flow duration', async () => {
    stubFetch(() => ({
      status: 'OK',
      rows: [{ elements: [{ duration: { value: 300 }, duration_in_traffic: { value: 540 } }] }],
    }));
    const eta = await getMapsProvider().etaMinutes(from, to);
    expect(new URL(calls[0]).searchParams.get('departure_time')).toBe('now');
    expect(eta).toBe(9); // 540s in traffic, not the 5 min free-flow figure
  });

  it('estimates offline when the call fails', async () => {
    stubFetch(() => new Error('timeout'));
    await expect(getMapsProvider().etaMinutes(from, to)).resolves.toBeGreaterThan(0);
  });
});

describe('which provider the server picks', () => {
  /**
   * Regression: this factory used to gate on providerMode.maps, which only
   * looks at the public browser key. Setting just GOOGLE_MAPS_SERVER_KEY —
   * the correct IP-restricted way to do server-side Maps — therefore left
   * geocoding simulated, resolving real addresses to invented coordinates.
   */
  it('goes live on the server key alone, with no public key set', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      env: { GOOGLE_MAPS_SERVER_KEY: 'server-only', NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: undefined },
      providerMode: { maps: 'simulated' }, // browser basemap genuinely is not live
    }));
    const m = await import('@/lib/providers/maps');
    m.__resetMapsProvider();
    expect(m.getMapsProvider().mode).toBe('live');
  });

  it('stays simulated when neither key is set', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      env: { GOOGLE_MAPS_SERVER_KEY: undefined, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: undefined },
      providerMode: { maps: 'simulated' },
    }));
    const m = await import('@/lib/providers/maps');
    m.__resetMapsProvider();
    expect(m.getMapsProvider().mode).toBe('simulated');
  });
});
