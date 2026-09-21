import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { brand } from '@/lib/brand';
import { t } from '@/lib/i18n/dictionary';
import { isLocale, localeDir, type Locale } from '@/lib/i18n/locales';
import { PrintButton } from '@/components/print-button';

export const metadata: Metadata = { title: 'Health summary card' };
export const dynamic = 'force-dynamic';

/**
 * The physical health summary card.
 *
 * This is the elderly patient's actual deliverable — printed on site and
 * handed over, in large type, in their own language, with a colour-coded band
 * and a clear, non-diagnostic prompt to see a physician. The screen version
 * exists so a family can reprint it; the print stylesheet is A5 because that
 * is what fits in the file people keep by the phone.
 *
 * It carries no numbers. A value without a doctor to interpret it produces
 * either false reassurance or unnecessary fear, and this card is designed for
 * someone reading it alone.
 */
export default async function StoplightCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { reportId } = await params;
  const { lang } = await searchParams;

  const report = await db.report.findUnique({
    where: { id: reportId },
    include: {
      patient: { include: { family: { include: { members: { include: { user: true } } } } } },
      lab: { include: { accreditation: true } },
      booking: true,
    },
  });

  if (!report || report.status !== 'RELEASED') notFound();

  const caregiver = report.patient.family.members[0]?.user;
  const locale: Locale = lang && isLocale(lang)
    ? lang
    : caregiver?.locale && isLocale(caregiver.locale)
      ? (caregiver.locale as Locale)
      : 'en';

  // Every read of a health record is logged, including this one.
  const viewer = await getSessionUser();
  await audit({
    action: 'REPORT_ACCESSED',
    entityType: 'Report',
    entityId: report.id,
    actorUserId: viewer?.id ?? null,
    actorRole: viewer?.role ?? 'ANONYMOUS',
    detail: { surface: 'stoplight_card', locale },
  });

  const band = report.overallBand as 'GREEN' | 'YELLOW' | 'RED';
  const bandColour = {
    GREEN: 'var(--color-green)',
    YELLOW: 'var(--color-yellow)',
    RED: 'var(--color-red)',
  }[band];
  const bandWash = {
    GREEN: 'var(--color-green-wash)',
    YELLOW: 'var(--color-yellow-wash)',
    RED: 'var(--color-red-wash)',
  }[band];

  // An explicit map rather than a template literal, so adding a fourth band
  // later is a compile error here instead of a missing string on a printed card.
  const BAND_KEYS = {
    GREEN: { title: 'stoplight.green.title', body: 'stoplight.green.body' },
    YELLOW: { title: 'stoplight.yellow.title', body: 'stoplight.yellow.body' },
    RED: { title: 'stoplight.red.title', body: 'stoplight.red.body' },
  } as const;
  const { title: titleKey, body: bodyKey } = BAND_KEYS[band];

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)] p-5 sm:p-8">
      <div className="mx-auto max-w-xl">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <a href="/elder" className="font-semibold underline">
            ← Back
          </a>
          <PrintButton label="Print this card" />
        </div>

        <article
          dir={localeDir(locale)}
          lang={locale}
          className="print-card rounded-[var(--radius-card)] border-4 bg-[var(--color-surface)] p-8"
          style={{ borderColor: bandColour }}
        >
          <header className="mb-6 flex items-baseline justify-between gap-4 border-b-2 border-[var(--color-line)] pb-4">
            <span className="text-[var(--text-lead)] font-bold">{brand.name}</span>
            <span className="text-[var(--text-small)] text-[var(--color-ink-faint)]">
              {report.releasedAt?.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </header>

          <p className="text-[var(--text-h2)] font-bold">{report.patient.name}</p>
          <p className="mb-6 text-[var(--text-lead)] text-[var(--color-ink-soft)]">
            {report.patient.ageYears} years
          </p>

          {/* The band, unmissable. Colour is never the only signal — the word
              is there too, for anyone who cannot distinguish them. */}
          <div
            className="mb-6 rounded-[var(--radius-card)] border-4 p-6 text-center"
            style={{ borderColor: bandColour, background: bandWash }}
          >
            <p
              className="text-[var(--text-h1)] font-bold leading-tight"
              style={{ color: bandColour }}
            >
              {t(locale, titleKey)}
            </p>
          </div>

          <p className="mb-6 text-[var(--text-lead)] leading-relaxed">
            {t(locale, bodyKey)}
          </p>

          <div className="mb-6 border-t-2 border-[var(--color-line)] pt-4">
            <p className="text-[var(--text-small)] text-[var(--color-ink-soft)]">
              Processed at <strong>{report.lab.name}</strong>
              {report.lab.brandingConsent && report.lab.accreditation
                ? `, NABL-accredited ${report.lab.accreditation.certificateNumber}`
                : ''}
              {report.pathologistName && `. Signed by ${report.pathologistName}`}
              {report.pathologistReg && ` (${report.pathologistReg})`}.
            </p>
          </div>

          <p className="mb-6 rounded-[var(--radius-control)] border-2 border-[var(--color-line)] bg-[var(--color-surface-sunken)] p-4 text-[var(--text-small)] leading-relaxed">
            {t(locale, 'stoplight.disclaimer')}
          </p>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[var(--color-line)] pt-4">
            <span className="text-[var(--text-lead)] font-bold">
              📞 {brand.supportPhone}
            </span>
            <span className="text-[var(--text-small)] text-[var(--color-ink-faint)]">
              {report.booking.reference}
            </span>
          </footer>
        </article>

        <p className="no-print mt-5 text-[var(--text-small)] text-[var(--color-ink-faint)]">
          This card deliberately carries no numbers. The full signed report, with every value and
          its reference range, is in the family’s account — and the person to go through it with
          is the treating doctor.
        </p>
      </div>
    </div>
  );
}
