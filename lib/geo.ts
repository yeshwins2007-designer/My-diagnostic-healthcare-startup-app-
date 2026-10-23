/**
 * Geography helpers. The service radius is a biological constraint, not an
 * ambition: blood degrades, so the map is drawn by the two-hour sample rule.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Ray-casting point-in-polygon. Used when ops has hand-drawn a zone boundary
 * that is a better fit than a plain circle (a river, a highway, a colony wall).
 */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Google's encoded polyline algorithm — decode. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Google's encoded polyline algorithm — encode. */
export function encodePolyline(points: LatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';

  const encodeValue = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let out = '';
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
    return out;
  };

  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    result += encodeValue(lat - lastLat) + encodeValue(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return result;
}

/** Total path length in kilometres. */
export function pathLengthKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return total;
}

/**
 * Position along a path at fraction `t` (0..1), plus the bearing at that
 * point. Used by the GPS simulator to move a marker smoothly, and by the
 * caregiver map to orient the technician's icon.
 */
export function interpolateAlongPath(
  points: LatLng[],
  t: number,
): { position: LatLng; bearingDeg: number } {
  if (points.length === 0) return { position: { lat: 0, lng: 0 }, bearingDeg: 0 };
  if (points.length === 1) return { position: points[0], bearingDeg: 0 };

  const clamped = Math.max(0, Math.min(1, t));
  const target = pathLengthKm(points) * clamped;

  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = haversineKm(points[i - 1], points[i]);
    if (travelled + segment >= target || i === points.length - 1) {
      const within = segment === 0 ? 0 : (target - travelled) / segment;
      const position = {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * within,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * within,
      };
      return { position, bearingDeg: bearing(points[i - 1], points[i]) };
    }
    travelled += segment;
  }
  return { position: points[points.length - 1], bearingDeg: 0 };
}

export function bearing(from: LatLng, to: LatLng): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Two-wheeler ETA. Deliberately conservative: this number is used to decide
 * whether to warn a family *before* their promised window is missed, so it
 * should err towards warning too early rather than too late.
 */
export function estimateMinutes(distanceKm: number, averageKmh = 18): number {
  return Math.ceil((distanceKm / averageKmh) * 60);
}

/** Rounds a coordinate down to ~1 km — used when a precise pin is not needed. */
export function coarsen(point: LatLng): LatLng {
  return {
    lat: Math.round(point.lat * 100) / 100,
    lng: Math.round(point.lng * 100) / 100,
  };
}
