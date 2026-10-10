import type { Metadata } from 'next';
import Link from 'next/link';
import { loadFamilyContext } from '@/lib/queries/caregiver';
import { loadMembership } from '@/lib/queries/catalog';
import { formatINR } from '@/lib/money';
import { signOut } from '@/app/actions/auth';
import { labChoicesForPatient } from '@/app/actions/caregiver';
import { LabChooser } from '@/components/lab-chooser';
import { ThemeToggle } from '@/components/theme-toggle';
import { PasskeyManager } from '@/components/passkeys';
import { ElderLink } from '@/components/elder-link';
import { db } from '@/lib/db';
import { listMyPasskeys } from '@/app/actions/passkeys';
import { Badge, Button, ButtonLink, Card, H2, H3, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

function Row({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="tap-surface glass flex min-h-[var(--size-touch)] items-center justify-between gap-3 rounded-[var(--radius-card)] border-2 px-5 py-4"
    >
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-small text-[var(--color-ink-soft)]">{body}</span>
      </span>
      <span aria-hidden className="text-lead text-[var(--color-primary)]">›</span>
    </Link>
  );
}

export default async function ProfilePage() {
  const { session, family } = await loadFamilyContext();
  const patients = family?.patients ?? [];
  const [membership, labChoices, passkeys, elderAccess] = await Promise.all([
    family ? loadMembership(family.id) : null,
    Promise.all(patients.map(async (p) => [p.id, await labChoicesForPatient(p.id)] as const)),
    listMyPasskeys(),
    db.elderAccess.findMany({
      where: { patientId: { in: patients.map((p) => p.id) }, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const choicesByPatient = new Map(labChoices);
  // Unopened links past their week are dead anyway; do not list them.
  const linkCutoff = Date.now() - 7 * 86_400_000;
  const elderDevices = (patientId: string) =>
    elderAccess
      .filter((a) => a.patientId === patientId && (a.openedAt || a.createdAt.getTime() > linkCutoff))
      .map((a) => ({
        id: a.id,
        opened: !!a.openedAt,
        createdAt: (a.openedAt ?? a.createdAt).toISOString(),
        lastUsedAt: a.lastUsedAt?.toISOString() ?? null,
      }));
  const initial = session.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Page>
      <Stack gap="lg">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-primary-wash)] text-h3 font-bold text-[var(--color-primary)] [box-shadow:var(--glow)]"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <h1 className="text-h2 font-bold">{session.name}</h1>
            <p className="text-[var(--color-ink-soft)]">{session.phone}</p>
          </div>
        </div>

        <Row
          href="/caregiver/membership"
          title="Medwyn One"
          body={
            membership
              ? `Member · ${formatINR(membership.effectivePricePaise)} ${membership.billingCycle === 'ANNUAL' ? 'a year' : 'a month'}`
              : '30% off every test and free home collection'
          }
        />
        <Row href="/caregiver/calls" title="Our calls to you" body="Every call we owe you and have made" />

        <Stack gap="md">
          <H2>Your parents</H2>
          {patients.length === 0 && <Muted>No one added yet.</Muted>}
          {patients.map((patient) => {
            const address = patient.addresses.find((a) => a.isPrimary) ?? patient.addresses[0];
            const c = choicesByPatient.get(patient.id);
            return (
              <Stack key={patient.id} gap="sm">
                <Card>
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <H3>
                        {patient.name}, {patient.ageYears}
                      </H3>
                      {patient.abhaAccount && <Badge tone="primary" variant="tonal">ABHA linked</Badge>}
                    </div>
                    {patient.conditions && <Muted>{patient.conditions}</Muted>}
                    {address && (
                      <p className="text-small text-[var(--color-ink-soft)]">
                        {[address.line1, address.landmark, address.pincode].filter(Boolean).join(', ')}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 pt-1">
                      <ButtonLink href={`/caregiver/book?patient=${patient.id}`}>Book tests</ButtonLink>
                      {!patient.abhaAccount && (
                        <ButtonLink href={`/caregiver/abha/${patient.id}`} tone="secondary">
                          Link ABHA (optional)
                        </ButtonLink>
                      )}
                    </div>
                  </Stack>
                </Card>
                <Card>
                  <Stack gap="sm">
                    <H3>Elder Mode for {patient.name.split(' ')[0]}</H3>
                    <Muted>
                      A big-button screen on their own phone: the next visit, their reports, and one
                      tap to call us or 108. No password; it works only on the phone you set up.
                    </Muted>
                    <ElderLink
                      patientId={patient.id}
                      firstName={patient.name.split(' ')[0]}
                      devices={elderDevices(patient.id)}
                    />
                  </Stack>
                </Card>
                {c?.ok && c.choices.length > 0 && (
                  <LabChooser
                    patientId={patient.id}
                    patientName={patient.name}
                    panelName={c.panelName}
                    options={c.choices}
                    selectedLabId={c.selectedLabId}
                  />
                )}
              </Stack>
            );
          })}
          <ButtonLink href="/caregiver/onboarding" tone="secondary" full>
            Add another parent
          </ButtonLink>
        </Stack>

        <Stack gap="sm">
          <H2>Sign-in</H2>
          <Muted>
            Sign in with Face ID, Touch ID or your fingerprint instead of waiting for a code.
          </Muted>
          <PasskeyManager
            passkeys={passkeys.map((p) => ({
              id: p.id,
              label: p.label,
              backedUp: p.backedUp,
              createdAt: p.createdAt.toISOString(),
              lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
            }))}
          />
        </Stack>

        <Stack gap="sm">
          <H2>Display</H2>
          <ThemeToggle />
        </Stack>

        <form action={signOut}>
          <Button type="submit" tone="secondary" full>
            Sign out
          </Button>
        </form>
      </Stack>
    </Page>
  );
}
