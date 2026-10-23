import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { loadFamilyContext } from '@/lib/queries/caregiver';
import { labForFamily, loadCatalog, loadMembership, membershipTerms } from '@/lib/queries/catalog';
import { BookFlow } from '@/components/book-flow';
import { Page } from '@/components/ui';

export const metadata: Metadata = { title: 'Book tests' };
export const dynamic = 'force-dynamic';

function tomorrow(): string {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Booking from what the laboratory offers. `?item=` preselects a package or
 * test (the dashboard's banners), `?q=` carries the dashboard search, `?kind=`
 * opens on packages or single tests, and `?patient=` arrives from onboarding.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; q?: string; kind?: string; patient?: string; date?: string; hour?: string; request?: string }>;
}) {
  const params = await searchParams;
  const { family } = await loadFamilyContext();
  // The parent being booked for decides the lab, and so the catalogue: after
  // "Book with this lab" it must be that lab's tests on offer.
  const forParent = family?.patients.find((p) => p.id === params.patient);
  const forParentZone = forParent?.addresses.find((a) => a.isPrimary)?.zoneId ?? forParent?.addresses[0]?.zoneId;
  const labId =
    forParent?.preferredLabId ??
    (forParentZone ? (await db.zone.findUnique({ where: { id: forParentZone } }))?.anchorLabId : null) ??
    (await labForFamily(family?.id ?? null));

  const [catalog, membership, labs] = await Promise.all([
    loadCatalog(labId),
    family ? loadMembership(family.id) : null,
    db.lab.findMany({ select: { id: true, name: true } }),
  ]);
  const labName = new Map(labs.map((l) => [l.id, l.name]));

  const zoneLabs = new Map(
    (await db.zone.findMany({ select: { id: true, anchorLabId: true } })).map((z) => [z.id, z.anchorLabId]),
  );

  const patients = (family?.patients ?? [])
    .map((p) => {
      const address = p.addresses.find((a) => a.isPrimary) ?? p.addresses[0];
      if (!address?.zoneId) return null;
      const lab = p.preferredLabId ?? zoneLabs.get(address.zoneId) ?? labId;
      return {
        id: p.id,
        name: p.name,
        address: [address.line1, address.landmark].filter(Boolean).join(', '),
        labName: (lab && labName.get(lab)) || 'Our partner laboratory',
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const initialSelected = params.item && catalog.some((c) => c.key === params.item) ? [params.item] : [];
  const kind = params.kind === 'panel' || params.kind === 'test' ? params.kind : 'all';

  return (
    <Page>
      <BookFlow
        catalog={catalog.map(({ key, kind, name, description, pricePaise, fastingHours, includes }) => ({
          key,
          kind,
          name,
          description,
          pricePaise,
          fastingHours,
          includes,
        }))}
        patients={patients}
        membership={membershipTerms(membership)}
        initialSelected={initialSelected}
        initialQuery={params.q ?? ''}
        initialKind={kind}
        initialPatientId={params.patient ?? null}
        minDate={tomorrow()}
        initialDate={/^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date : undefined}
        initialHour={params.hour && /^(6|7|8|9|10)$/.test(params.hour) ? Number(params.hour) : undefined}
        requestId={params.request?.slice(0, 40)}
      />
    </Page>
  );
}
