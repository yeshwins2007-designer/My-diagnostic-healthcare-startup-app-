import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { DISCIPLINE_LABELS, type Discipline } from '@/lib/enums';
import { labLogoUrl, monogram } from '@/lib/brandfetch';
import { istShortDay } from '@/lib/orders/ist';
import { parseScope } from '@/lib/sop/labRouting';
import { partnerMembership } from '@/lib/queries/partner';
import { LabLogo } from '@/components/partner/lab-logo';
import { ProfileForm } from '@/components/partner/profile-form';
import { DeleteAccount } from '@/components/delete-account';
import { ERASE_AFTER_DAYS } from '@/lib/account/deletion';
import { Badge, DataRow } from '@/components/ui';

export const metadata: Metadata = { title: 'Lab profile' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  INTAKE_DESK: 'Intake desk',
};

const ROLE_CAN: Record<string, string> = {
  OWNER: 'Everything, including the lab’s details',
  MANAGER: 'Orders, results, reports, catalog',
  INTAKE_DESK: 'Accept orders, receive and reject samples',
};

export default async function LabProfilePage() {
  const user = await requirePageRole('LAB');
  const membership = await partnerMembership(user.id);
  if (!membership) redirect('/lab/apply');
  const lab = membership.lab;
  const acc = lab.accreditation;

  const team = await db.labMember.findMany({
    where: { labId: lab.id },
    include: { user: { select: { name: true, phone: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const daysToExpiry = acc ? Math.ceil((acc.validUntil.getTime() - Date.now()) / 86_400_000) : 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-8">
      <div className="flex flex-wrap items-center gap-4">
        <LabLogo src={labLogoUrl(lab.website, { size: 128 })} initials={monogram(lab.name)} name={lab.name} size={64} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="eyebrow">Lab profile settings</span>
          <h1 className="text-h2 font-semibold tracking-tight">{lab.name}</h1>
          <span className="text-small text-[var(--color-ink-faint)]">{lab.legalName}</span>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="contacts" className="panel flex flex-col gap-4 rounded-[var(--radius-card)] border p-4 sm:p-5">
          <h2 id="contacts" className="text-[0.9375rem] font-semibold tracking-tight">
            Contacts and logo
          </h2>
          <ProfileForm
            labName={lab.name}
            initial={{ contactName: lab.contactName, contactPhone: lab.contactPhone, contactEmail: lab.contactEmail, website: lab.website }}
            canEdit={membership.role === 'OWNER'}
          />
        </section>

        <section aria-labelledby="accreditation" className="panel flex flex-col gap-1 rounded-[var(--radius-card)] border p-4 sm:p-5">
          <h2 id="accreditation" className="mb-2 text-[0.9375rem] font-semibold tracking-tight">
            Accreditation
          </h2>
          {acc ? (
            <>
              <DataRow label="NABL certificate" value={acc.certificateNumber} />
              <DataRow
                label="Valid until"
                value={`${istShortDay(acc.validUntil)} ${acc.validUntil.getUTCFullYear()} · ${daysToExpiry} days`}
                tone={daysToExpiry <= 60 ? 'yellow' : undefined}
              />
              <DataRow label="Pathologist" value={<span className="font-sans">{acc.supervisingPathologistName} · {acc.supervisingPathologistReg}</span>} />
              <div className="flex flex-wrap gap-2 py-3">
                {parseScope(acc.scope).map((d) => (
                  <Badge key={d} tone="primary">
                    {DISCIPLINE_LABELS[d as Discipline] ?? d}
                  </Badge>
                ))}
              </div>
            </>
          ) : (
            <p className="text-small text-[var(--color-ink-faint)]">No accreditation on file.</p>
          )}
          <DataRow label="Address" value={<span className="font-sans">{lab.addressLine}, {lab.city} {lab.pincode}</span>} />
          <DataRow label="Daily capacity" value={`${lab.capacityCeiling} samples`} />
          <p className="pt-3 text-small text-[var(--color-ink-faint)]">
            Changing accreditation, scope, address or capacity goes through our verification team,
            because routing depends on them.{' '}
            <Link href="/lab/agreement" className="inline-flex min-h-11 items-center underline">
              Service agreement
            </Link>
          </p>
        </section>
      </div>

      <section aria-labelledby="team" className="panel flex flex-col rounded-[var(--radius-card)] border">
        <h2 id="team" className="px-4 pt-4 text-[0.9375rem] font-semibold tracking-tight sm:px-5">
          Team
        </h2>
        <ul className="mt-3 flex flex-col">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] px-4 py-3 sm:px-5">
              <span className="flex flex-col">
                <span className="font-medium">
                  {m.user.name}
                  {m.userId === user.id && <span className="text-[var(--color-ink-faint)]"> (you)</span>}
                </span>
                <span className="text-small text-[var(--color-ink-faint)]">{ROLE_CAN[m.role] ?? ''}</span>
              </span>
              <Badge tone={m.role === 'OWNER' ? 'primary' : 'neutral'}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
            </li>
          ))}
        </ul>
      </section>
      <DeleteAccount kind="partner" eraseAfterDays={ERASE_AFTER_DAYS} />
    </main>
  );
}
