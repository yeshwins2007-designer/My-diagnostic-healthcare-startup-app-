import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { isLocale, type Locale } from '@/lib/i18n/locales';
import { t } from '@/lib/i18n/dictionary';
import { brand } from '@/lib/brand';
import { fastingInstruction } from '@/lib/sop/visitWindow';
import { ElderShell } from '@/components/elder-shell';
import { allowDemoData, elderPatientId } from '@/lib/auth/elder';
import { demoElderPatientId } from '@/lib/queries/elder';

export const metadata: Metadata = { title: 'Elder mode' };
export const dynamic = 'force-dynamic';

/**
 * Elder Mode.
 *
 * Deliberately thin. The elderly patient is not the buyer and will not manage
 * a subscription, so this surface cannot take payments or change a plan. What
 * it can do is answer the four questions that actually matter to someone
 * waiting at home: when is somebody coming, who is it, what must I not eat,
 * and how do I reach a human.
 *
 * No password - asking a 78-year-old to remember one is how you guarantee
 * they never open it twice - but not open either. The family sets it up from
 * Profile with a one-time link opened on the parent's phone, which leaves a
 * device key in a secure cookie (lib/auth/elder.ts). Without that key this
 * page shows nobody: only the support line and 108, which must always work.
 *
 * It used to show the first patient in the database to anyone, and any
 * patient by `?patient=<id>` - a stranger could read who lives where, and
 * when a technician is due at their door.
 */
export default async function ElderModePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; link?: string }>;
}) {
  const { lang, link } = await searchParams;

  const patientId = (await elderPatientId()) ?? (allowDemoData ? await demoElderPatientId() : null);
  const patient = patientId ? await db.patient.findUnique({ where: { id: patientId } }) : null;

  if (!patient) {
    return (
      <ElderShell
        locale="en"
        patientName=""
        greeting="Namaste"
        nextVisit={null}
        supportPhone={brand.supportPhone}
        emergencyNumber={brand.emergencyNumber}
        reports={[]}
        notice={
          link === 'expired'
            ? 'That link has already been used or has expired. Please ask your family to send a new one from MEDWYN.'
            : 'This phone is not set up yet. Ask your family to open the Elder Mode link from MEDWYN on this phone. You can still call us or 108 below.'
        }
      />
    );
  }

  const locale: Locale = lang && isLocale(lang) ? lang : 'en';

  const [booking, reports] = await Promise.all([
    db.booking.findFirst({
      where: {
        patientId: patient.id,
        status: { in: ['SCHEDULED', 'EN_ROUTE', 'ARRIVED'] },
      },
      orderBy: { windowStart: 'asc' },
      include: { technician: { include: { user: true } } },
    }),
    db.report.findMany({
      where: { patientId: patient.id, status: 'RELEASED' },
      orderBy: { releasedAt: 'desc' },
      take: 5,
      select: { id: true, overallBand: true, releasedAt: true },
    }),
  ]);

  return (
    <ElderShell
      locale={locale}
      patientName={patient.name}
      greeting={t(locale, 'elder.greeting')}
      supportPhone={brand.supportPhone}
      emergencyNumber={brand.emergencyNumber}
      nextVisit={
        booking
          ? {
              id: booking.id,
              dateLabel: booking.windowStart.toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }),
              windowLabel: `${booking.windowStart.toLocaleTimeString('en-IN', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })} – ${booking.windowEnd.toLocaleTimeString('en-IN', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}`,
              technicianName: booking.technician?.user.name ?? null,
              fastingText: booking.fastingRequired
                ? fastingInstruction(booking.fastingHours, booking.windowStart)
                : null,
            }
          : null
      }
      reports={reports.map((r) => ({
        id: r.id,
        band: r.overallBand as 'GREEN' | 'YELLOW' | 'RED',
        dateLabel:
          r.releasedAt?.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }) ?? '',
      }))}
    />
  );
}
