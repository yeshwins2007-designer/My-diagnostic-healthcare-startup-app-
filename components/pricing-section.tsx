import Link from 'next/link';
import type { CatalogItem } from '@/lib/queries/catalog';
import { COLLECTION_FEE_PAISE, memberPrice } from '@/lib/pricing';
import { formatINR } from '@/lib/money';
import { Badge, ButtonLink, H2, H3, Muted, Stack } from '@/components/ui';

/**
 * Prices, for the public pages: what the laboratory offers at its own price,
 * the collection fee, and Medwyn One beside it with the member price worked
 * out - so a family can see the saving before signing up.
 */
export function PricingSection({
  items,
  plan,
  full = false,
}: {
  items: CatalogItem[];
  plan: { pricePaise: number; annualPricePaise: number; testDiscountPercent: number } | null;
  full?: boolean;
}) {
  const packages = items.filter((i) => i.kind === 'panel');
  const tests = items.filter((i) => i.kind === 'test');
  const pct = plan?.testDiscountPercent ?? 0;

  return (
    <Stack gap="md">
      <H2>Pay only for what you book</H2>
      <Muted>
        Prices are set by our partner laboratory. Home collection is {formatINR(COLLECTION_FEE_PAISE)} a
        visit, or free with Medwyn One.
      </Muted>

      <div className="grid gap-4 md:grid-cols-3">
        {packages.map((p) => (
          <div key={p.key} className="glass flex flex-col gap-3 rounded-[var(--radius-card-lg)] border p-5">
            <H3>{p.name}</H3>
            <p className="text-small text-[var(--color-ink-soft)]">{p.includes.join(', ')}</p>
            <p className="text-h2 font-bold">{formatINR(p.pricePaise)}</p>
            {pct > 0 && (
              <Muted>{formatINR(memberPrice(p.pricePaise, pct))} with Medwyn One</Muted>
            )}
          </div>
        ))}

        {plan && (
          <div className="brand-surface relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-card-lg)] border border-[var(--color-line-strong)] p-5 [box-shadow:var(--shadow-card)]">
            <div className="brand-content flex flex-col gap-3">
              <Badge tone="primary">Membership</Badge>
              <H3>Medwyn One</H3>
              <p>
                {pct}% off every test and package, and no home-collection charge, for the whole
                family.
              </p>
              <p className="text-h2 font-bold">
                {formatINR(plan.pricePaise)}
                <span className="text-small font-normal"> a month</span>
              </p>
              <p>or {formatINR(plan.annualPricePaise)} a year</p>
            </div>
          </div>
        )}
      </div>

      {full ? (
        <div className="glass overflow-hidden rounded-[var(--radius-card-lg)] border">
          <table className="w-full text-left">
            <caption className="sr-only">Single test prices</caption>
            <thead>
              <tr className="border-b border-[var(--color-line)] text-small text-[var(--color-ink-soft)]">
                <th scope="col" className="p-4 font-semibold">Single test</th>
                <th scope="col" className="p-4 text-right font-semibold">Price</th>
                {pct > 0 && <th scope="col" className="p-4 text-right font-semibold">Member</th>}
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.key} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="p-4">{t.name}</td>
                  <td className="p-4 text-right tabular-nums">{formatINR(t.pricePaise)}</td>
                  {pct > 0 && (
                    <td className="p-4 text-right font-semibold text-[var(--color-primary)] tabular-nums">
                      {formatINR(memberPrice(t.pricePaise, pct))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Link href="/plans" className="font-semibold text-[var(--color-primary)] underline">
          See every test and its price
        </Link>
      )}

      <ButtonLink href="/join" className="self-start">
        Set up care for an individual
      </ButtonLink>
    </Stack>
  );
}
