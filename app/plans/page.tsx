import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { PricingSection } from '@/components/pricing-section';
import { labForFamily, loadCatalog, loadMedwynOne } from '@/lib/queries/catalog';
import { brand } from '@/lib/brand';
import { Disclaimer, H1, Lead, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Prices' };
export const dynamic = 'force-dynamic';

/** Every test the partner laboratory offers, at its price, and Medwyn One. */
export default async function PricesPage() {
  const [catalog, plan] = await Promise.all([labForFamily(null).then(loadCatalog), loadMedwynOne()]);

  return (
    <>
      <SiteHeader />
      <Page wide>
        <Stack gap="lg">
          <Stack gap="sm">
            <H1>Prices</H1>
            <Lead>
              No subscription needed. Book the tests you need, collected at home by a trained
              technician and tested at an NABL-accredited laboratory.
            </Lead>
          </Stack>
          <PricingSection items={catalog} plan={plan} full />
          <Disclaimer text={brand.disclaimer} />
        </Stack>
      </Page>
    </>
  );
}
