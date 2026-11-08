import Link from 'next/link';
import type { CatalogItem } from '@/lib/queries/catalog';
import { COLLECTION_FEE_PAISE, memberPrice } from '@/lib/pricing';
import { formatINR } from '@/lib/money';
import { Badge, ButtonLink, H2, H3, Muted, Stack } from '@/components/ui';

/**
 * Prices, for the public pages: Medwyn One first, because booking is a
 * membership service, with each package at its member price; then what the
 * same visit costs at a lab a family chooses themselves, at the lab's own
 * price plus the collection fee (lib/booking-access.ts).
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
      <H2>Medwyn One, and what a visit costs</H2>
      <Muted>
        Home visits are part of Medwyn One. Prefer a particular lab? Choose it yourself and book it at
        that lab’s own prices, plus {formatINR(COLLECTION_FEE_PAISE)} for home collection.
      </Muted>

      <div className="grid gap-4 md:grid-cols-3">
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
        {packages.map((p) => (
          <div key={p.key} className="glass flex flex-col gap-3 rounded-[var(--radius-card-lg)] border p-5">
            <H3>{p.name}</H3>
            <p className="text-small text-[var(--color-ink-soft)]">{p.includes.join(', ')}</p>
            {pct > 0 ? (
              <>
                <p className="text-h2 font-bold">{formatINR(memberPrice(p.pricePaise, pct))}</p>
                <Muted>With Medwyn One. {formatINR(p.pricePaise)} at a lab you choose yourself.</Muted>
              </>
            ) : (
              <p className="text-h2 font-bold">{formatINR(p.pricePaise)}</p>
            )}
          </div>
        ))}

      </div>

      {full ? (
        <div className="glass overflow-hidden rounded-[var(--radius-card-lg)] border">
          <table className="w-full text-left">
            <caption className="sr-only">Single test prices</caption>
            <thead>
              <tr className="border-b border-[var(--color-line)] text-small text-[var(--color-ink-soft)]">
                <th scope="col" className="p-4 font-semibold">Single test</th>
                {pct > 0 && <th scope="col" className="p-4 text-right font-semibold">With Medwyn One</th>}
                <th scope="col" className="p-4 text-right font-semibold">At a lab you choose</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.key} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="p-4">{t.name}</td>
                  {pct > 0 && (
                    <td className="p-4 text-right font-semibold text-[var(--color-primary)] tabular-nums">
                      {formatINR(memberPrice(t.pricePaise, pct))}
                    </td>
                  )}
                  <td className="p-4 text-right tabular-nums">{formatINR(t.pricePaise)}</td>
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
