import type { Metadata } from 'next';
import Link from 'next/link';
import { brand } from '@/lib/brand';
import { SiteHeader } from '@/components/site-header';
import { Card, H1, H2, Lead, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Help and support' };

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'How do I book a home visit?',
    a: 'Sign in, add your parent and their address, choose the tests and a time, and pay. We confirm the visit in writing.',
  },
  {
    q: 'How do I change or cancel a visit?',
    a: 'Open Bookings in the app, or call us. If the visit is tomorrow morning, please call so we can tell the technician.',
  },
  {
    q: 'When do I get the report?',
    a: 'Once the lab has signed it and our coordinator has checked it. You get it in the app, and we call you within 24 hours.',
  },
  {
    q: 'How do I delete my account?',
    a: (
      <>
        In the app, open Profile and choose “Delete my account”. Our{' '}
        <Link href="/privacy" className="underline">privacy policy</Link> explains what happens next.
      </>
    ),
  },
  {
    q: 'I run a lab. How do I become a partner?',
    a: (
      <>
        Register at <Link href="/lab/register" className="underline">partner registration</Link>. A
        person checks every lab’s NABL accreditation before any sample is sent.
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <>
      <SiteHeader />
      <Page>
        <Stack gap="lg">
          <Stack gap="sm">
            <H1>Help and support</H1>
            <Lead>A real person answers. Call, message or write to us.</Lead>
          </Stack>

          <Card>
            <dl className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <dt className="eyebrow">Phone</dt>
                <dd className="reading text-lead">{brand.supportPhone}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="eyebrow">WhatsApp</dt>
                <dd className="reading text-lead">{brand.supportWhatsApp}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="eyebrow">Email</dt>
                <dd className="text-lead font-medium">{brand.supportEmail}</dd>
              </div>
            </dl>
          </Card>

          <Card tone="red">
            <p className="font-semibold">
              In a medical emergency, call {brand.emergencyNumber}. We are not an emergency service.
            </p>
          </Card>

          <Stack gap="md">
            <H2 className="text-h3">Common questions</H2>
            {QUESTIONS.map(({ q, a }) => (
              <div key={q} className="flex flex-col gap-1 border-b border-[var(--color-line)] pb-4 last:border-b-0">
                <h3 className="font-semibold">{q}</h3>
                <p className="text-[var(--color-ink-soft)]">{a}</p>
              </div>
            ))}
          </Stack>
        </Stack>
      </Page>
    </>
  );
}
