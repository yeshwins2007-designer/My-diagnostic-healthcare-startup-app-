/**
 * Finding a lab for a parent.
 *
 * Distance is measured from the parent's home, because that is where the
 * sample is taken: the person searching is often in another city. The
 * browser may re-sort by the searcher's own position (see
 * components/lab-search.tsx), but that position never reaches the server,
 * and it never decides whether a lab can be chosen.
 *
 * A lab can be chosen for a parent when it is active, its NABL accreditation
 * is current, it offers at least one test right now, and it is within
 * MAX_LAB_DISTANCE_KM of the home. Labs that fail are still listed with the
 * reason. They are never ranked by price.
 */

import 'server-only';
import { db } from '../db';
import { haversineKm } from '../geo';
import { DISCIPLINE_LABELS, type Discipline } from '../enums';
import { MAX_LAB_DISTANCE_KM, parseScope, tooFarReason } from '../sop/labRouting';

export interface LabResult {
  id: string;
  name: string;
  area: string;
  latitude: number;
  longitude: number;
  certificateNumber: string | null;
  disciplines: string[];
  testsOffered: number;
  /** Straight-line km from the parent's home. */
  distanceFromHomeKm: number;
  eligible: boolean;
  reason?: string;
  isAreaLab: boolean;
  isChosen: boolean;
}

export interface ParentOption {
  id: string;
  name: string;
  /** First name, for "from Lakshmi's home". */
  short: string;
  hasHome: boolean;
}

export async function parentsOf(userId: string): Promise<ParentOption[]> {
  const patients = await db.patient.findMany({
    where: { isActive: true, family: { members: { some: { userId } } } },
    include: { addresses: { where: { isPrimary: true }, take: 1 } },
    orderBy: { createdAt: 'asc' },
  });
  return patients.map((p) => ({
    id: p.id,
    name: p.name,
    short: p.name.split(' ')[0],
    hasHome: p.addresses.length > 0,
  }));
}

/** Labs for one parent, nearest to their home first. Scoped to the caregiver's family. */
export async function labsForParent(userId: string, patientId: string, now = new Date()): Promise<LabResult[] | null> {
  const patient = await db.patient.findFirst({
    where: { id: patientId, family: { members: { some: { userId } } } },
    include: { addresses: { where: { isPrimary: true }, take: 1 } },
  });
  const home = patient?.addresses[0];
  if (!patient || !home) return null;

  const [labs, zone] = await Promise.all([
    db.lab.findMany({
      where: { status: 'ACTIVE' },
      include: { accreditation: true, rateCard: { where: { isPaused: false }, select: { id: true } } },
    }),
    home.zoneId ? db.zone.findUnique({ where: { id: home.zoneId }, select: { anchorLabId: true } }) : null,
  ]);

  const chosenId = patient.preferredLabId ?? zone?.anchorLabId ?? null;
  const results = labs.map((lab): LabResult => {
    const distance = Math.round(haversineKm({ lat: home.latitude, lng: home.longitude }, { lat: lab.latitude, lng: lab.longitude }) * 10) / 10;
    const acc = lab.accreditation;
    const reason = !acc
      ? 'No NABL accreditation on file.'
      : acc.validUntil <= now
        ? 'Its NABL accreditation has lapsed.'
        : lab.rateCard.length === 0
          ? 'Not taking home-collection tests right now.'
          : distance > MAX_LAB_DISTANCE_KM
            ? tooFarReason(distance)
            : undefined;
    return {
      id: lab.id,
      name: lab.name,
      area: [lab.addressLine, lab.city, lab.pincode].filter(Boolean).join(', '),
      latitude: lab.latitude,
      longitude: lab.longitude,
      certificateNumber: acc?.certificateNumber ?? null,
      disciplines: acc ? parseScope(acc.scope).map((d) => DISCIPLINE_LABELS[d as Discipline] ?? d) : [],
      testsOffered: lab.rateCard.length,
      distanceFromHomeKm: distance,
      eligible: !reason,
      reason,
      isAreaLab: lab.id === zone?.anchorLabId,
      isChosen: lab.id === chosenId,
    };
  });

  return results.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.distanceFromHomeKm - b.distanceFromHomeKm);
}
