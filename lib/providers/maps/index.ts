/**
 * Maps: geocoding, route optimisation and ETA.
 *
 * The simulator is not a stub. It replays a real path through Jayanagar so a
 * caregiver watching the tracking screen sees a marker that actually moves
 * along streets, and it optimises routes with a nearest-neighbour pass so the
 * morning ordering is plausible rather than random.
 */

import {
  decodePolyline,
  encodePolyline,
  estimateMinutes,
  haversineKm,
  pathLengthKm,
  type LatLng,
} from '../../geo';
import { env, providerMode } from '../../env';

export interface GeocodeResult {
  formattedAddress: string;
  position: LatLng;
  pincode?: string;
  /** True when we could not geocode and the caller must ask for a manual pin. */
  approximate: boolean;
}

export interface RoutePlan {
  /** Stop ids in the order they should be visited. */
  orderedStopIds: string[];
  encodedPolyline: string;
  distanceKm: number;
  durationMinutes: number;
  /** Per-leg arrival estimates, aligned with orderedStopIds. */
  legMinutes: number[];
}

export interface RouteStop {
  id: string;
  position: LatLng;
  /** Longer for frailer patients; the route must account for it. */
  serviceMinutes: number;
}

export interface MapsProvider {
  readonly mode: 'live' | 'simulated';
  geocode(address: string, cityHint?: string): Promise<GeocodeResult | null>;
  planRoute(origin: LatLng, stops: RouteStop[]): Promise<RoutePlan>;
  etaMinutes(from: LatLng, to: LatLng): Promise<number>;
}

// --- the demo geography ------------------------------------------------------

/** Anchor: the partner lab's front door, Jayanagar 4th Block, Bengaluru. */
export const DEMO_ANCHOR: LatLng = { lat: 12.925, lng: 77.5838 };

/**
 * A hand-traced path along Jayanagar's grid — used by the simulator so the
 * marker follows roads instead of cutting across buildings.
 */
const DEMO_STREET_PATH: LatLng[] = [
  { lat: 12.925, lng: 77.5838 },
  { lat: 12.9262, lng: 77.5841 },
  { lat: 12.9274, lng: 77.5852 },
  { lat: 12.9281, lng: 77.5871 },
  { lat: 12.9285, lng: 77.5894 },
  { lat: 12.9279, lng: 77.5918 },
  { lat: 12.9271, lng: 77.5937 },
  { lat: 12.9252, lng: 77.5949 },
  { lat: 12.9231, lng: 77.5952 },
  { lat: 12.9209, lng: 77.5943 },
  { lat: 12.9194, lng: 77.5921 },
  { lat: 12.9186, lng: 77.5896 },
  { lat: 12.9179, lng: 77.5868 },
  { lat: 12.9172, lng: 77.5845 },
  { lat: 12.9178, lng: 77.5822 },
  { lat: 12.9196, lng: 77.5809 },
  { lat: 12.9218, lng: 77.5813 },
  { lat: 12.9238, lng: 77.5826 },
  { lat: 12.925, lng: 77.5838 },
];

export const DEMO_ROUTE_POLYLINE = encodePolyline(DEMO_STREET_PATH);

export function demoRoutePoints(): LatLng[] {
  return decodePolyline(DEMO_ROUTE_POLYLINE);
}

// --- simulated ---------------------------------------------------------------

class SimulatedMapsProvider implements MapsProvider {
  readonly mode = 'simulated' as const;

  async geocode(address: string, cityHint = 'Bengaluru'): Promise<GeocodeResult | null> {
    // Deterministic jitter from the address string, so the same address always
    // lands on the same point across restarts and reseeds.
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = (hash * 31 + address.charCodeAt(i)) | 0;
    }
    const offsetLat = ((hash % 400) - 200) / 20000; // roughly +/- 1.1 km
    const offsetLng = (((hash >> 8) % 400) - 200) / 20000;

    return {
      formattedAddress: `${address}, ${cityHint}, Karnataka`,
      position: {
        lat: DEMO_ANCHOR.lat + offsetLat,
        lng: DEMO_ANCHOR.lng + offsetLng,
      },
      pincode: '560041',
      // The simulator is honest that it did not really resolve anything.
      approximate: true,
    };
  }

  async planRoute(origin: LatLng, stops: RouteStop[]): Promise<RoutePlan> {
    return nearestNeighbourRoute(origin, stops);
  }

  async etaMinutes(from: LatLng, to: LatLng): Promise<number> {
    return estimateMinutes(haversineKm(from, to));
  }
}

/**
 * Nearest-neighbour ordering with the service time folded in. Not optimal, but
 * it is the same shape of answer Directions API returns with
 * `optimizeWaypoints`, so switching providers does not change the UI.
 */
function nearestNeighbourRoute(origin: LatLng, stops: RouteStop[]): RoutePlan {
  const remaining = [...stops];
  const ordered: RouteStop[] = [];
  const legMinutes: number[] = [];
  const path: LatLng[] = [origin];

  let cursor = origin;
  let totalMinutes = 0;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((stop, i) => {
      const d = haversineKm(cursor, stop.position);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    });

    const [next] = remaining.splice(bestIndex, 1);
    const travel = estimateMinutes(bestDistance);
    totalMinutes += travel + next.serviceMinutes;
    legMinutes.push(totalMinutes);
    ordered.push(next);
    path.push(next.position);
    cursor = next.position;
  }

  // Back to the lab: the samples have to be delivered, and that leg is part of
  // the morning whether or not anybody plans for it.
  path.push(origin);
  const returnMinutes = estimateMinutes(haversineKm(cursor, origin));
  totalMinutes += returnMinutes;

  return {
    orderedStopIds: ordered.map((s) => s.id),
    encodedPolyline: encodePolyline(path),
    distanceKm: Math.round(pathLengthKm(path) * 10) / 10,
    durationMinutes: totalMinutes,
    legMinutes,
  };
}

// --- live --------------------------------------------------------------------

class GoogleMapsProvider implements MapsProvider {
  readonly mode = 'live' as const;

  private get key(): string {
    return env.GOOGLE_MAPS_SERVER_KEY || env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  }

  async geocode(address: string, cityHint = 'Bengaluru'): Promise<GeocodeResult | null> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', `${address}, ${cityHint}`);
    url.searchParams.set('region', 'in');
    url.searchParams.set('key', this.key);

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: string;
      results: {
        formatted_address: string;
        geometry: { location: { lat: number; lng: number }; location_type: string };
        address_components: { long_name: string; types: string[] }[];
      }[];
    };

    const top = data.results?.[0];
    if (data.status !== 'OK' || !top) return null;

    const pincode = top.address_components.find((c) =>
      c.types.includes('postal_code'),
    )?.long_name;

    return {
      formattedAddress: top.formatted_address,
      position: top.geometry.location,
      pincode,
      // ROOFTOP is a real door. Anything else in an old Bengaluru colony means
      // the technician should call ahead or the family should drop a pin.
      approximate: top.geometry.location_type !== 'ROOFTOP',
    };
  }

  async planRoute(origin: LatLng, stops: RouteStop[]): Promise<RoutePlan> {
    if (stops.length === 0) {
      return {
        orderedStopIds: [],
        encodedPolyline: '',
        distanceKm: 0,
        durationMinutes: 0,
        legMinutes: [],
      };
    }

    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destination', `${origin.lat},${origin.lng}`);
    url.searchParams.set(
      'waypoints',
      `optimize:true|${stops.map((s) => `${s.position.lat},${s.position.lng}`).join('|')}`,
    );
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('key', this.key);

    const res = await fetch(url);
    if (!res.ok) return nearestNeighbourRoute(origin, stops);

    const data = (await res.json()) as {
      status: string;
      routes: {
        overview_polyline: { points: string };
        waypoint_order: number[];
        legs: { distance: { value: number }; duration: { value: number } }[];
      }[];
    };

    const route = data.routes?.[0];
    if (data.status !== 'OK' || !route) return nearestNeighbourRoute(origin, stops);

    const ordered = route.waypoint_order.map((i) => stops[i]);
    let cumulative = 0;
    const legMinutes = route.legs.slice(0, ordered.length).map((leg, i) => {
      cumulative += Math.round(leg.duration.value / 60) + (ordered[i]?.serviceMinutes ?? 0);
      return cumulative;
    });

    return {
      orderedStopIds: ordered.map((s) => s.id),
      encodedPolyline: route.overview_polyline.points,
      distanceKm:
        Math.round(
          (route.legs.reduce((sum, l) => sum + l.distance.value, 0) / 1000) * 10,
        ) / 10,
      durationMinutes: cumulative,
      legMinutes,
    };
  }

  async etaMinutes(from: LatLng, to: LatLng): Promise<number> {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${from.lat},${from.lng}`);
    url.searchParams.set('destinations', `${to.lat},${to.lng}`);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('departure_time', 'now');
    url.searchParams.set('key', this.key);

    try {
      const res = await fetch(url);
      const data = (await res.json()) as {
        rows: { elements: { duration_in_traffic?: { value: number }; duration?: { value: number } }[] }[];
      };
      const element = data.rows?.[0]?.elements?.[0];
      const seconds = element?.duration_in_traffic?.value ?? element?.duration?.value;
      if (seconds) return Math.ceil(seconds / 60);
    } catch {
      // fall through to the offline estimate
    }
    return estimateMinutes(haversineKm(from, to));
  }
}

let cached: MapsProvider | null = null;

export function getMapsProvider(): MapsProvider {
  if (!cached) {
    cached =
      providerMode.maps === 'live' ? new GoogleMapsProvider() : new SimulatedMapsProvider();
  }
  return cached;
}
