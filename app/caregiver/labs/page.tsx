import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageRole } from '@/lib/auth/session';
import { labsForParent, parentsOf } from '@/lib/queries/lab-search';
import { LabSearch } from '@/components/lab-search';
import { ButtonLink, H1, Lead, Page, Stack, cx } from '@/components/ui';

export const metadata: Metadata = { title: 'Find a lab' };
export const dynamic = 'force-dynamic';

/**
 * Find a lab, from the home screen's search bar. `?q=` carries what was
 * typed, `?near=1` asks for the phone's location straight away, and
 * `?patient=` picks which parent the search is for.
 */
export default async function FindALabPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; near?: string; patient?: string }>;
}) {
  const params = await searchParams;
  const user = await requirePageRole('CAREGIVER');
  const parents = (await parentsOf(user.id)).filter((p) => p.hasHome);
  const parent = parents.find((p) => p.id === params.patient) ?? parents[0];

  if (!parent) {
    return (
      <Page>
        <Stack gap="md">
          <H1>Find a lab</H1>
          <Lead>Add your parent and their home address first. We look for labs near where the sample is taken.</Lead>
          <ButtonLink href="/caregiver/onboarding">Add a parent</ButtonLink>
        </Stack>
      </Page>
    );
  }

  const labs = (await labsForParent(user.id, parent.id)) ?? [];
  const query = (params.q ?? '').slice(0, 80);

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Find a lab</H1>
          <Lead>
            Accredited labs that can test {parent.short}’s samples, nearest to {parent.short}’s home
            first.
          </Lead>
        </Stack>

        {parents.length > 1 && (
          <nav aria-label="Whose lab" data-segmented className="flex flex-wrap gap-1 self-start rounded-full border border-[var(--color-line)] p-1">
            {parents.map((p) => (
              <Link
                key={p.id}
                href={`/caregiver/labs?patient=${encodeURIComponent(p.id)}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                aria-current={p.id === parent.id ? 'page' : undefined}
                className={cx(
                  'inline-flex min-h-11 items-center rounded-full px-4 text-small font-medium',
                  p.id === parent.id ? 'bg-[var(--color-primary)] text-[var(--color-primary-ink)]' : 'text-[var(--color-ink-soft)]',
                )}
              >
                For {p.short}
              </Link>
            ))}
          </nav>
        )}

        <LabSearch
          key={parent.id}
          patientId={parent.id}
          parentShort={parent.short}
          labs={labs}
          initialQuery={query}
          autoLocate={params.near === '1'}
        />
      </Stack>
    </Page>
  );
}
