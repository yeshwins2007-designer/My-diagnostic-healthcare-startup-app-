import type { Metadata } from 'next';
import Link from 'next/link';
import { brand } from '@/lib/brand';
import { ERASE_AFTER_DAYS } from '@/lib/account/deletion';
import { SiteHeader } from '@/components/site-header';
import { Card, H1, H2, Lead, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Delete your account' };

/**
 * How to delete a MEDWYN account, for someone who no longer has the app.
 * Google Play asks for this page by link, next to the in-app option.
 */
export default function DeleteAccountPage() {
  return (
    <>
      <SiteHeader />
      <Page>
        <Stack gap="lg">
          <Stack gap="sm">
            <H1>Delete your {brand.name} account</H1>
            <Lead>You can do it yourself in a minute, in the app or on this website.</Lead>
          </Stack>

          <Card>
            <ol className="flex list-decimal flex-col gap-2 pl-5">
              <li>
                Open the {brand.name} app, or{' '}
                <Link href="/login" className="font-semibold underline">sign in on this website</Link>{' '}
                with your mobile number.
              </li>
              <li>Go to Profile.</li>
              <li>Choose “Delete my account”, tick the box, and confirm.</li>
            </ol>
          </Card>

          <p>
            Can’t sign in any more? Write to{' '}
            <span className="font-semibold">{brand.privacyEmail}</span> from your email address, or call{' '}
            {brand.supportPhone}, and tell us the mobile number on the account. We check it is you,
            then delete it for you.
          </p>

          <Stack gap="sm">
            <H2 className="text-h3">What happens</H2>
            <ul className="flex list-disc flex-col gap-2 pl-5">
              <li>Straight away: you are signed out everywhere, and your membership and unpaid bookings are cancelled.</li>
              <li>
                Within {ERASE_AFTER_DAYS} days: we erase your name, number, email, password, and your
                parents’ names, addresses, health notes and medicines.
              </li>
              <li>
                Kept, without your names, for as long as the law requires: the reports the lab signed,
                payment and tax records, and our audit record.
              </li>
            </ul>
            <p>
              The <Link href="/privacy" className="font-semibold underline">privacy policy</Link> has the details.
            </p>
          </Stack>
        </Stack>
      </Page>
    </>
  );
}
