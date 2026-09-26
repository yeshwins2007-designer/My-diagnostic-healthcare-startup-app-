import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { isLocale, type Locale } from '@/lib/i18n/locales';
import { t } from '@/lib/i18n/dictionary';
import { brand } from '@/lib/brand';
import { fastingInstruction } from '@/lib/sop/visitWindow';
import { ElderShell } from '@/components/elder-shell';

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
 * No login. A device-bound view opened by the family, or a link the caregiver
 * sends. Asking a 78-year-old to remember a password is how you guarantee they
 * never open it twice.
 */
export default async function ElderModePage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; lang?: string }>;
}) {
  const { patient: patientParam, lang } = await searchParams;

  // Demo fallback: without a patient parameter, show the first seeded patient
  // so the mode is explorable from the landing page.
  const patient = patientParam
    ? await db.patient.findUnique({ where: { id: patientParam } })
    : await db.patient.findFirst({ orderBy: { createdAt: 'asc' } });

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
