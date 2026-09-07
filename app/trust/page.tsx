import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { brand } from '@/lib/brand';
import { env } from '@/lib/env';
import { DISCIPLINE_LABELS, type Discipline } from '@/lib/enums';
import { parseScope } from '@/lib/sop/labRouting';
import { SiteHeader } from '@/components/site-header';
import {
  Badge,
  Card,
  DataRow,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Trust & safety' };
export const dynamic = 'force-dynamic';

/**
 * The page that says what we are and, more importantly, what we are not.
 *
 * This is not marketing. The distinction defines what we may legally claim,
 * what we insure against, and what the voice agent is allowed to say — so it
 * is rendered from the same `lib/brand.ts` constants the rest of the system
 * behaves by, rather than restated here where it could drift.
 */
export default async function TrustPage() {
  const labs = await db.lab.findMany({
    where: { status: 'ACTIVE', brandingConsent: true },
    include: { accreditation: true },
  });

  return (
    <>
      <SiteHeader />
      <Page>
        <Stack gap="lg">
          <Stack gap="sm">
            <H1>Trust &amp; safety</H1>
            <Lead>
              The honest version: what we are accountable for, what we are not, and how you can
              check.
            </Lead>
          </Stack>

          <div className="grid gap-5 md:grid-cols-2">
            <Card tone="primary">
              <Stack gap="sm">
                <H3>What we are</H3>
                <ul className="flex flex-col gap-2">
                  {brand.weAre.map((line) => (
                    <li key={line} className="flex gap-3">
                      <span aria-hidden className="text-[var(--color-primary)]">✓</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </Stack>
            </Card>

            <Card tone="sunken">
              <Stack gap="sm">
                <H3>What we are not</H3>
                <ul className="flex flex-col gap-2">
                  {brand.weAreNot.map((line) => (
                    <li key={line} className="flex gap-3">
                      <span aria-hidden className="text-[var(--color-ink-faint)]">✕</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </Stack>
            </Card>
          </div>

          <Stack gap="md">
            <H2>Who actually runs your tests</H2>
            {labs.length === 0 ? (
              <Muted>No partner laboratory has yet given permission to be named here.</Muted>
            ) : (
              labs.map((lab) => {
                const scope = lab.accreditation ? parseScope(lab.accreditation.scope) : [];
                return (
                  <Card key={lab.id}>
                    <Stack gap="sm">
                      <H3>{lab.name}</H3>
                      {lab.accreditation && (
                        <>
                          <DataRow
                            label="NABL accreditation"
                            value={
                              <span className="font-mono">
                                {lab.accreditation.certificateNumber}
                              </span>
                            }
                          />
                          <DataRow
                            label="Valid until"
                            value={lab.accreditation.validUntil.toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          />
                          <DataRow
                            label="Supervising pathologist"
                            value={`${lab.accreditation.supervisingPathologistName} (${lab.accreditation.supervisingPathologistReg})`}
                          />
                          <div className="flex flex-wrap gap-2 pt-2">
                            {scope.map((d) => (
                              <Badge key={d} tone="primary">
                                {DISCIPLINE_LABELS[d as Discipline] ?? d}
                              </Badge>
                            ))}
                          </div>
                        </>
                      )}
                      <Muted>
                        {lab.addressLine}, {lab.city} {lab.pincode}. Their pathologist signs every
                        report, on site. You can verify this accreditation number yourself on the
                        NABL website.
                      </Muted>
                    </Stack>
                  </Card>
                );
              })
            )}
          </Stack>

          <Stack gap="md">
            <H2>How we verify a laboratory</H2>
            <Card>
              <Stack gap="sm">
                <p>
                  Registering is an application, not an activation. Before a single sample is
                  routed anywhere, a person clears seven checks: the certificate number against
                  the NABL public directory, the QR on the certificate, the validity date,
                  whether the accredited scope covers the panels we route, whether the registered
                  address matches the site samples actually reach, a signed service agreement,
                  and the supervising pathologist’s council registration.
                </p>
                <p>
                  The software then enforces it continuously. A booking checks the discipline of
                  every test against that laboratory’s accredited scope — so a blood sugar test
                  cannot be routed to a laboratory accredited only for microbiology — and a
                  laboratory is suspended automatically the day its accreditation lapses.
                </p>
                <Muted>
                  NABL does not publish a verification API, so we do not pretend a machine
                  checked this. A person did, the evidence is stored, and the expiry is
                  automated.
                </Muted>
              </Stack>
            </Card>
          </Stack>

          <Stack gap="md">
            <H2>Your data</H2>
            <Card>
              <Stack gap="sm">
                <DataRow label="Stored" value="On servers located in India" />
                <DataRow label="In transit" value="TLS 1.3" />
                <DataRow label="At rest" value="Test values encrypted with AES-256-GCM" />
                <DataRow
                  label="Technician location"
                  value={`Recorded only while a route is running; detail erased after ${env.PING_RETENTION_DAYS} days`}
                />
                <DataRow
                  label="Tracking links"
                  value="Valid for one visit, and expire shortly after it"
                />
                <DataRow
                  label="Support call recordings"
                  value={`Kept ${env.TRANSCRIPT_RETENTION_DAYS} days, then erased`}
                />
                <DataRow
                  label="Every record access"
                  value="Logged in a tamper-evident, hash-chained audit trail"
                />
                <Muted>
                  Consent is asked for each purpose separately — collection, storage, and sharing
                  the report with a named family member — and you can withdraw any of them
                  without affecting the others. If you link an ABHA health account, that consent
                  is separate again, held by the national consent manager, and revoking it there
                  stops us fetching records immediately.
                </Muted>
              </Stack>
            </Card>
          </Stack>

          <Stack gap="md">
            <H2>Things we will never do</H2>
            <Card tone="red">
              <ul className="flex flex-col gap-3">
                {[
                  'Nobody on our team will ever interpret a result or suggest a medicine. Not the technician at the door, not the coordinator on the phone, and not the assistant in the app.',
                  'We will never guarantee a diagnosis or an outcome.',
                  'We will never share a report with anyone the patient has not authorised.',
                  'We will never claim our partner laboratory’s accreditation as our own.',
                  'We will never use a countdown, a false shortage, or a retention call to keep you.',
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span aria-hidden className="font-bold text-[var(--color-red)]">✕</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Stack>

          <Card tone="sunken">
            <Stack gap="sm">
              <H3>If something goes wrong</H3>
              <p>
                A rejected sample means a free repeat collection within 24 hours and a call from
                the founder. There is no argument about whose fault it was.
              </p>
              <p>
                If the laboratory flags a result as urgent, we phone you immediately — whatever
                the hour — tell you plainly that it needs medical attention, and follow up in
                writing. We will not tell you what it means, because that is your doctor’s to
                say.
              </p>
              <Muted>
                {brand.supportPhone} · {brand.legalEntity}
              </Muted>
            </Stack>
          </Card>

          <Card>
            <Muted>{brand.disclaimer}</Muted>
          </Card>
        </Stack>
      </Page>
    </>
  );
}
