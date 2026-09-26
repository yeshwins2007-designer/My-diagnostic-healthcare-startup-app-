/**
 * The radius rule.
 *
 * "Never let a technician's route span more than your core radius, and never
 * add a customer outside it 'just this once'." A technician doing 3 visits a
 * morning instead of 8 triples labour cost per visit and turns contribution
 * margin negative — so an out-of-zone booking is not a small kindness, it is
 * the thing that kills the business.
 *
 * This rule therefore *refuses into a waitlist* rather than warning. An
 * override exists, but it requires a typed reason and is counted against
 * route density in the Monday numbers.
 */

import { haversineKm, pointInPolygon, type LatLng } from '../geo';
import { allow, refuse, warn, type Decision } from './types';

export interface ZoneBoundary {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  /** GeoJSON-ish polygon as [{lat,lng}, ...]; when present it wins over the circle. */
  polygon?: LatLng[] | null;
  isActive: boolean;
}

export interface RadiusCheck {
  decision: Decision;
  distanceKm: number;
  /** The best-matching active zone, or null when the address is outside them all. */
  zone: ZoneBoundary | null;
}

/** Warn before refusing, so a booking at 4.6 km in a 5 km zone is visible. */
const EDGE_WARNING_FRACTION = 0.9;

export function evaluateRadius(
  address: LatLng,
  zones: ZoneBoundary[],
): RadiusCheck {
  const active = zones.filter((z) => z.isActive);

  if (active.length === 0) {
    return {
      decision: refuse(
        'No active service zone is configured.',
        'Open a zone in the ops console before taking bookings.',
      ),
      distanceKm: Infinity,
      zone: null,
    };
  }

  const scored = active
    .map((zone) => ({
      zone,
      distanceKm: haversineKm(address, { lat: zone.centerLat, lng: zone.centerLng }),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearest = scored[0];

  // A hand-drawn boundary beats the circle: rivers, highways and colony walls
  // do not respect radii.
  const containing = scored.find(({ zone, distanceKm }) =>
    zone.polygon && zone.polygon.length >= 3
      ? pointInPolygon(address, zone.polygon)
      : distanceKm <= zone.radiusKm,
  );

  if (!containing) {
    return {
      decision: refuse(
        `This address is ${nearest.distanceKm.toFixed(1)} km from ${nearest.zone.name}, outside the ${nearest.zone.radiusKm} km service radius.`,
        'Add the family to the waitlist. Out-of-zone demand is the evidence that justifies opening the next zone — serving them today destroys route density for everyone already inside it.',
        { nearestZoneId: nearest.zone.id, distanceKm: nearest.distanceKm },
      ),
      distanceKm: nearest.distanceKm,
      zone: null,
    };
  }

  const { zone, distanceKm } = containing;

  if (!zone.polygon && distanceKm > zone.radiusKm * EDGE_WARNING_FRACTION) {
    return {
      decision: warn(
        `This address is at the edge of ${zone.name} (${distanceKm.toFixed(1)} of ${zone.radiusKm} km). Watch the effect on morning route density.`,
        { zoneId: zone.id, distanceKm },
      ),
      distanceKm,
      zone,
    };
  }

  return { decision: allow(), distanceKm, zone };
}

/**
 * An override is legitimate occasionally — a family one street outside the
 * line, an existing subscriber who moved. It is never silent: the reason is
 * mandatory, stored on the booking and written to the audit log.
 */
export function validateOverrideReason(reason: string): Decision {
  const trimmed = reason.trim();
  if (trimmed.length < 15) {
    return refuse(
      'An out-of-zone override needs a real reason.',
      'Write at least a sentence explaining why this booking is worth the route density it costs.',
    );
  }
  return allow();
}
