/**
 * Letting a family choose their lab.
 *
 * The whole risk of this feature is that choice quietly becomes a way around
 * the routing gate. These tests exist to pin the opposite: a lab is only
 * offered when evaluateRouting would accept it for this exact panel, and a lab
 * that cannot do the work is returned marked ineligible with the reason rather
 * than silently dropped.
 */

import { describe, it, expect } from 'vitest';
import { rankLabChoices } from '@/lib/sop/labRouting';
import { haversineKm } from '@/lib/geo';

const NEXT_YEAR = new Date(Date.now() + 300 * 86_400_000);
const HOME = { lat: 12.9271, lng: 77.5892 };

const lab = (over: Partial<Parameters<typeof rankLabChoices>[0][number]> = {}) => ({
  id: 'l1',
  name: 'Ananya Diagnostics',
  status: 'ACTIVE',
  capacityCeiling: 40,
  todayVolume: 0,
  latitude: 12.925,
  longitude: 77.5838,
  accreditation: {
    certificateNumber: 'MC-2024',
    scope: 'CLINICAL_BIOCHEMISTRY,HAEMATOLOGY',
    validUntil: NEXT_YEAR,
  },
  ...over,
});

const PANEL = [
  { code: 'HBA1C', name: 'HbA1c', discipline: 'CLINICAL_BIOCHEMISTRY' },
  { code: 'CBC', name: 'Complete blood count', discipline: 'HAEMATOLOGY' },
];

describe('rankLabChoices', () => {
  it('offers a lab whose scope covers the whole panel', () => {
    const [c] = rankLabChoices([lab()], PANEL, { from: HOME, distanceKm: haversineKm });
    expect(c.eligible).toBe(true);
    expect(c.certificateNumber).toBe('MC-2024');
    expect(c.distanceKm).toBeGreaterThan(0);
  });

  it('marks a lab ineligible when its scope misses even one discipline, and says why', () => {
    const micro = lab({
      id: 'l2',
      name: 'Sanjeevini Microbiology Centre',
      accreditation: { certificateNumber: 'MC-9', scope: 'MICROBIOLOGY', validUntil: NEXT_YEAR },
    });
    const [c] = rankLabChoices([micro], PANEL, {});
    expect(c.eligible).toBe(false);
    expect(c.reason).toMatch(/not accredited/i);
  });

  it('never offers a lab that is not ACTIVE, however close it is', () => {
    const pending = lab({ id: 'l3', name: 'Nele Path Labs', status: 'SUBMITTED', latitude: 12.9271, longitude: 77.5892 });
    const [c] = rankLabChoices([pending], PANEL, { from: HOME, distanceKm: haversineKm });
    expect(c.eligible).toBe(false);
    expect(c.distanceKm).toBe(0); // literally at the door, still refused
    expect(c.reason).toMatch(/not active/i);
  });

  it('never offers a lab at its daily ceiling', () => {
    const full = lab({ todayVolume: 40 });
    expect(rankLabChoices([full], PANEL, {})[0].eligible).toBe(false);
  });

  it('never offers a lab whose accreditation has expired', () => {
    const stale = lab({
      accreditation: { certificateNumber: 'MC-2024', scope: 'CLINICAL_BIOCHEMISTRY,HAEMATOLOGY', validUntil: new Date(Date.now() - 86_400_000) },
    });
    expect(rankLabChoices([stale], PANEL, {})[0].eligible).toBe(false);
  });

  it('sorts eligible first, then nearest', () => {
    const near_but_wrong = lab({
      id: 'near', name: 'Wrong scope, next door',
      latitude: HOME.lat, longitude: HOME.lng,
      accreditation: { certificateNumber: 'MC-1', scope: 'MICROBIOLOGY', validUntil: NEXT_YEAR },
    });
    const far_ok = lab({ id: 'far', name: 'Right scope, further', latitude: 12.90, longitude: 77.55 });
    const mid_ok = lab({ id: 'mid', name: 'Right scope, closer', latitude: 12.926, longitude: 77.587 });

    const out = rankLabChoices([near_but_wrong, far_ok, mid_ok], PANEL, {
      from: HOME, distanceKm: haversineKm,
    });
    expect(out.map((c) => c.id)).toEqual(['mid', 'far', 'near']);
  });

  it('puts the zone default ahead of an equal alternative', () => {
    const a = lab({ id: 'a', name: 'Alpha Labs' });
    const b = lab({ id: 'b', name: 'Beta Labs' });
    const out = rankLabChoices([a, b], PANEL, { zoneAnchorLabId: 'b' });
    expect(out[0].id).toBe('b');
    expect(out[0].isZoneAnchor).toBe(true);
  });
});
