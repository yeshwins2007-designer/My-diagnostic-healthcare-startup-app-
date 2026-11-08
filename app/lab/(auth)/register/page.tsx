import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/home';
import { AuthFlow } from '@/components/auth-flow';
import { Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Register your laboratory' };

const NEEDS = [
  ['NABL certificate', 'A current medical-laboratory accreditation (MC-XXXX), with its validity dates.'],
  ['Accredited scope', 'Every discipline on the certificate. We route only tests inside it.'],
  ['Supervising pathologist', 'Name and medical council registration: they sign the reports.'],
  ['Daily capacity', 'The most home-collected samples you can take in a day, without notice.'],
  ['Website (optional)', 'Your domain, so your own logo shows on your terminal.'],
] as const;

const STEPS = [
  'Verify your mobile number (below).',
  'Fill in the application: about ten minutes.',
  'We check your certificate against the NABL directory: usually two working days.',
  'Sign the service agreement and rate card.',
  'Orders start arriving on your terminal.',
];

/**
 * Partner registration: what we will ask for, before the phone step, so no
 * one starts an application they cannot finish. Verifying the number creates
 * a partner (LAB) account and goes straight on to the application.
 */
export default async function PartnerRegisterPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === 'LAB' ? '/lab/apply' : homeFor(user.role));

  return (
    <>
      <Stack gap="sm">
        <span className="eyebrow">Partner laboratories</span>
        <h1 className="text-h1 font-semibold tracking-tight">Register your laboratory</h1>
        <p className="text-[var(--color-ink-soft)]">
          Registering is an application, not an activation. A person verifies every laboratory
          before a single sample is routed to it.
        </p>
      </Stack>

      <section aria-labelledby="needs" className="flex flex-col gap-3">
        <h2 id="needs" className="eyebrow">
          Have these ready
        </h2>
        <dl className="flex flex-col divide-y divide-[var(--color-line)] rounded-[var(--radius-card)] border border-[var(--color-line)]">
          {NEEDS.map(([term, detail]) => (
            <div key={term} className="flex flex-col gap-0.5 px-4 py-3">
              <dt className="font-medium">{term}</dt>
              <dd className="text-small text-[var(--color-ink-faint)]">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="steps" className="flex flex-col gap-3">
        <h2 id="steps" className="eyebrow">
          What happens
        </h2>
        <ol className="flex flex-col gap-2">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3 text-small text-[var(--color-ink-soft)]">
              <span className="reading w-5 shrink-0 text-[var(--color-ink-faint)]">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <AuthFlow intent="business" />

      <p className="text-small text-[var(--color-ink-soft)]">
        Already a partner?{' '}
        <Link href="/lab/login" className="inline-flex min-h-11 items-center font-semibold text-[var(--color-ink)] underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
