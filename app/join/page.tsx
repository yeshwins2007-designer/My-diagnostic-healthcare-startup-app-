import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { AuthFlow } from '@/components/auth-flow';
import { Badge, Card, H1, H3, Lead, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Create an account' };

/**
 * The two-door entry the brief asks for: an individual creating care for a
 * parent, or a diagnostic lab registering as a partner. They are genuinely
 * different products, so they are two doors rather than a dropdown.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const intent = as === 'business' ? 'business' : as === 'individual' ? 'individual' : null;

  if (intent) {
    return (
      <>
        <SiteHeader />
        <Page>
          <Stack gap="lg">
            <Stack gap="sm">
              <Badge tone="primary">
                {intent === 'business' ? 'Diagnostic laboratory' : 'Family account'}
              </Badge>
              <H1>
                {intent === 'business'
                  ? 'Register your laboratory'
                  : 'Set up care for a parent'}
              </H1>
              <Lead>
                {intent === 'business'
                  ? 'We will ask for your NABL certificate, your accredited scope and your capacity. Registering is an application — a person reviews every one before a single sample is routed to you.'
                  : 'We will send a six-digit code to your mobile. You will add your parent’s details next; nothing is charged until you choose a plan.'}
              </Lead>
            </Stack>

            <AuthFlow intent={intent} />
          </Stack>
        </Page>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <Page>
        <Stack gap="lg">
          <Stack gap="sm">
            <H1>Who are you signing up as?</H1>
            <Lead>Two different things happen next, so pick the one that fits.</Lead>
          </Stack>

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <Stack gap="sm">
                <Badge tone="primary">Individual</Badge>
                <H3>I am arranging tests for a parent</H3>
                <p className="text-[var(--color-ink-soft)]">
                  You add your parent’s details, choose a plan, and we come to their door. You
                  get the tracking, the reports and the call after every one.
                </p>
                <a
                  href="/join?as=individual"
                  className="mt-2 inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-[var(--radius-control)] border-2 border-[var(--color-primary)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-ink)]"
                >
                  Continue as an individual
                </a>
              </Stack>
            </Card>

            <Card>
              <Stack gap="sm">
                <Badge>Business</Badge>
                <H3>I run a diagnostic laboratory</H3>
                <p className="text-[var(--color-ink-soft)]">
                  Receive a steady stream of home-collected samples from families in your
                  neighbourhood. You keep your own patients; we simply bring you more.
                </p>
                <Muted>
                  Requires a current NABL medical laboratory accreditation (MC-XXXX) and a named
                  supervising pathologist.
                </Muted>
                <a
                  href="/join?as=business"
                  className="mt-2 inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-[var(--radius-control)] border-2 border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 font-semibold"
                >
                  Continue as a business
                </a>
              </Stack>
            </Card>
          </div>

          <Muted>
            Already have an account?{' '}
            <a href="/login" className="font-semibold underline">
              Sign in instead
            </a>
          </Muted>
        </Stack>
      </Page>
    </>
  );
}
