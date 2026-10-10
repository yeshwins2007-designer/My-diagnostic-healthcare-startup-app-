import 'server-only';
import { db } from '../db';
import type { Membership } from '../pricing';

/**
 * What a family can buy, and whether they are a Medwyn One member.
 *
 * The catalogue is the laboratory's own offering: a package or a test is
 * listed only when the lab that would process it has a rate for every test
 * in it. Listing something the lab cannot run would sell a booking the
 * routing gate then refuses.
 */

export interface CatalogItem {
  /** "panel:<id>" or "test:<id>", the form value the booking action reads. */
  key: string;
  kind: 'panel' | 'test';
  id: string;
  name: string;
  description: string;
  pricePaise: number;
  fastingHours: number;
  /** For a package, the names of the tests inside it. */
  includes: string[];
}

export async function loadCatalog(labId: string | null): Promise<CatalogItem[]> {
  const rated = labId
    ? new Set(
        (await db.labRateCardEntry.findMany({ where: { labId }, select: { testId: true } })).map(
          (r) => r.testId,
        ),
      )
    : null;
  const offered = (testId: string) => !rated || rated.has(testId);

  const [panels, tests] = await Promise.all([
    db.panel.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { items: { include: { test: true } } },
    }),
    db.testDefinition.findMany({
      where: { isActive: true, pricePaise: { gt: 0 } },
      orderBy: { name: 'asc' },
    }),
  ]);

  return [
    ...panels
      .filter((p) => p.items.length > 0 && p.items.every((i) => offered(i.testId)))
      .map((p) => ({
        key: `panel:${p.id}`,
        kind: 'panel' as const,
        id: p.id,
        name: p.name,
        description: p.description,
        pricePaise: p.pricePaise,
        fastingHours: p.fastingHours,
        includes: p.items.map((i) => i.test.name),
      })),
    ...tests
      .filter((t) => offered(t.id))
      .map((t) => ({
        key: `test:${t.id}`,
        kind: 'test' as const,
        id: t.id,
        name: t.name,
        description: '',
        pricePaise: t.pricePaise,
        fastingHours: t.fastingHours,
        includes: [],
      })),
  ];
}

/** The laboratory that serves a family: the first patient's zone anchor, or the first zone's. */
export async function labForFamily(familyId: string | null): Promise<string | null> {
  if (familyId) {
    const address = await db.patientAddress.findFirst({
      where: { patient: { familyId, isActive: true }, zoneId: { not: null } },
      include: { zone: true, patient: true },
    });
    if (address?.patient.preferredLabId) return address.patient.preferredLabId;
    if (address?.zone?.anchorLabId) return address.zone.anchorLabId;
  }
  const zone = await db.zone.findFirst({ where: { isActive: true }, orderBy: { sequence: 'asc' } });
  return zone?.anchorLabId ?? null;
}

/** The family's active Medwyn One membership, with the plan's terms. */
export async function loadMembership(familyId: string) {
  return db.subscription.findFirst({
    where: { familyId, status: 'ACTIVE', plan: { code: 'MEDWYN_ONE' } },
    include: { plan: true, mandate: true },
    orderBy: { createdAt: 'desc' },
  });
}

export function membershipTerms(
  sub: { plan: { testDiscountPercent: number; freeCollection: boolean } } | null,
): Membership | null {
  return sub
    ? { testDiscountPercent: sub.plan.testDiscountPercent, freeCollection: sub.plan.freeCollection }
    : null;
}

export async function loadMedwynOne() {
  return db.plan.findUnique({ where: { code: 'MEDWYN_ONE' } });
}
