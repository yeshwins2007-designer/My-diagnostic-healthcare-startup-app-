import type { Metadata } from 'next';
import Link from 'next/link';
import { brand } from '@/lib/brand';
import { ERASE_AFTER_DAYS } from '@/lib/account/deletion';
import { H1, Lead, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Account deleted' };

export default function AccountDeletedPage() {
  return (
    <Page>
      <Stack gap="md">
        <H1>Your account is deleted</H1>
        <Lead>
          You’ve been signed out everywhere, and your membership is cancelled. We erase your details
          and your parents’ details within {ERASE_AFTER_DAYS} days.
        </Lead>
        <Muted>
          The lab keeps the reports it signed, and we keep payment records, because the law requires
          both. They no longer carry your name.{' '}
          <Link href="/privacy" className="font-semibold underline">
            Privacy policy
          </Link>
        </Muted>
        <Muted>
          Questions? Call us on {brand.supportPhone}.
        </Muted>
      </Stack>
    </Page>
  );
}
