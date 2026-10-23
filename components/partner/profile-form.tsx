'use client';

import { useActionState, useState } from 'react';
import { updateLabProfile, type LabActionState } from '@/app/actions/lab';
import { labLogoUrl, monogram } from '@/lib/brandfetch';
import { LabLogo } from '@/components/partner/lab-logo';
import { Button, cx, Field, Input } from '@/components/ui';

function domainOf(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
}

/**
 * The lab's contacts and website. The website is only used to find the
 * lab's logo; the preview updates as it is typed, so a wrong domain is
 * visible before it is saved.
 */
export function ProfileForm({
  labName,
  initial,
  canEdit,
}: {
  labName: string;
  initial: { contactName: string; contactPhone: string; contactEmail: string; website: string };
  canEdit: boolean;
}) {
  const [website, setWebsite] = useState(initial.website);
  const [state, action, pending] = useActionState<LabActionState, FormData>(updateLabProfile, { ok: false });
  const logo = labLogoUrl(domainOf(website), { size: 128 });

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person" required>
            <Input name="contactName" defaultValue={initial.contactName} required autoComplete="name" />
          </Field>
          <Field label="Contact phone" required>
            <Input name="contactPhone" type="tel" defaultValue={initial.contactPhone} required autoComplete="tel" className="font-mono" />
          </Field>
        </div>
        <Field label="Contact email" required>
          <Input name="contactEmail" type="email" defaultValue={initial.contactEmail} required autoComplete="email" />
        </Field>
        <Field label="Website" hint="Your domain, such as ananyadiagnostics.in. Used only to show your logo.">
          <div className="flex items-center gap-3">
            <Input
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="ananyadiagnostics.in"
              inputMode="url"
              autoComplete="url"
              className="flex-1 font-mono"
            />
            {/* Keyed by URL so a new domain retries the image after a failure. */}
            <LabLogo key={logo ?? 'none'} src={logo} initials={monogram(labName)} name={labName} size={48} />
          </div>
        </Field>
      </fieldset>
      {!canEdit && <p className="text-small text-[var(--color-ink-faint)]">Only the owner of the laboratory can change these.</p>}
      {state.message && (
        <p role="status" className={cx('text-small font-medium', state.ok ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]')}>
          {state.message}
        </p>
      )}
      {canEdit && (
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? 'Saving…' : 'Save'}
        </Button>
      )}
    </form>
  );
}
