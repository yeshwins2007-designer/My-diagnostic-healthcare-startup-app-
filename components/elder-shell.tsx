'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LOCALES, localeDir, type Locale } from '@/lib/i18n/locales';
import { t } from '@/lib/i18n/dictionary';
import { ThemeToggle } from '@/components/theme-toggle';

export interface ElderVisit {
  id: string;
  dateLabel: string;
  windowLabel: string;
  technicianName: string | null;
  fastingText: string | null;
}

export interface ElderReport {
  id: string;
  band: 'GREEN' | 'YELLOW' | 'RED';
  dateLabel: string;
}

type Screen = 'HOME' | 'VISIT' | 'REPORTS' | 'HELP' | 'LANGUAGE';

/**
 * Elder Mode.
 *
 * Every rule the design system states is visible here rather than described:
 * four tiles and no more, one action per screen, nothing smaller than 64px,
 * icons that always carry a word, a read-aloud button on every screen, and a
 * text size control that does not require finding an OS setting.
 *
 * There is nothing here that can charge money, cancel a plan, or delete
 * anything. That is deliberate — this screen is used by someone who may be
 * tired, worried, or unsure, and it should be impossible to do harm with it.
 */
export function ElderShell({
  locale: initialLocale,
  patientName,
  greeting,
  nextVisit,
  reports,
  supportPhone,
  emergencyNumber,
}: {
  locale: Locale;
  patientName: string;
  greeting: string;
  nextVisit: ElderVisit | null;
  reports: ElderReport[];
  supportPhone: string;
  emergencyNumber: string;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [screen, setScreen] = useState<Screen>('HOME');
  const [reader, setReader] = useState<'normal' | 'large' | 'largest'>('normal');

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-reader',
      reader === 'normal' ? '' : reader,
    );
    try {
      localStorage.setItem('ss_reader', reader === 'normal' ? '' : reader);
    } catch {
      // Storage can throw in private mode; the setting simply will not persist.
    }
  }, [reader]);

  const tr = (key: Parameters<typeof t>[1]) => t(locale, key);
  const dir = localeDir(locale);

  /** Reads the visible screen aloud, in the chosen language. */
  function readAloud() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const main = document.getElementById('elder-main');
    if (!main) return;
    const utter = new SpeechSynthesisUtterance(main.innerText);
    utter.lang = bcp47(locale);
    utter.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  return (
    <div dir={dir} lang={locale} className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <p className="text-[var(--text-lead)] font-bold">{patientName || 'SwasthaSetu'}</p>
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-small)]">A</span>
            {(['normal', 'large', 'largest'] as const).map((size, i) => (
              <button
                key={size}
                type="button"
                onClick={() => setReader(size)}
                aria-pressed={reader === size}
                aria-label={`Text size ${i + 1} of 3`}
                className={`min-h-12 min-w-12 rounded-[var(--radius-control)] border-2 font-bold ${
                  reader === size
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                    : 'border-[var(--color-line-strong)]'
                }`}
                style={{ fontSize: `${1 + i * 0.25}rem` }}
              >
                A
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* The read-aloud bar is sticky, so the last tile needs room to clear it
          when scrolled to the bottom — otherwise it sits under the bar, which
          is exactly the tile an elderly user is most likely to be reaching for. */}
      <main id="elder-main" className="mx-auto max-w-2xl px-5 pt-8 pb-28">
        {screen === 'HOME' && (
          <div className="flex flex-col gap-6">
            <h1 className="text-[var(--text-h1)] font-bold">
              {greeting}
              {patientName ? `, ${patientName.split(' ')[0]}` : ''}
            </h1>
            <p className="text-[var(--text-lead)] text-[var(--color-ink-soft)]">
              {tr('elder.nothingToWorry')}
            </p>

            {/* Exactly four tiles. Not five. */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Tile
                emoji="📅"
                label={tr('elder.nextVisit')}
                onClick={() => setScreen('VISIT')}
              />
              <Tile
                emoji="📄"
                label={tr('elder.myReports')}
                onClick={() => setScreen('REPORTS')}
              />
              <Tile
                emoji="📞"
                label={tr('elder.callForHelp')}
                onClick={() => setScreen('HELP')}
              />
              <Tile
                emoji="🗣"
                label={tr('elder.changeLanguage')}
                onClick={() => setScreen('LANGUAGE')}
              />
            </div>
          </div>
        )}

        {screen === 'VISIT' && (
          <Screen title={tr('elder.nextVisit')} onBack={() => setScreen('HOME')} backLabel={tr('common.back')}>
            {nextVisit ? (
              <div className="flex flex-col gap-5">
                <p className="text-[var(--text-h2)] font-bold">{nextVisit.dateLabel}</p>
                <p className="text-[var(--text-h3)]">{nextVisit.windowLabel}</p>
                {nextVisit.technicianName && (
                  <p className="text-[var(--text-lead)]">
                    <strong>{nextVisit.technicianName}</strong>{' '}
                    {tr('elder.technicianComing')}
                  </p>
                )}
                {nextVisit.fastingText && (
                  <div className="rounded-[var(--radius-card)] border-2 border-[var(--color-yellow)] bg-[var(--color-yellow-wash)] p-5">
                    <p className="text-[var(--text-lead)]">{tr('elder.fastingReminder')}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[var(--text-lead)]">{tr('elder.noVisitScheduled')}</p>
            )}
          </Screen>
        )}

        {screen === 'REPORTS' && (
          <Screen title={tr('elder.myReports')} onBack={() => setScreen('HOME')} backLabel={tr('common.back')}>
            {reports.length === 0 ? (
              <p className="text-[var(--text-lead)]">—</p>
            ) : (
              <div className="flex flex-col gap-4">
                {reports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/report/${report.id}/card?lang=${locale}`}
                    className={`flex min-h-[var(--size-touch-lg)] items-center justify-between gap-4 rounded-[var(--radius-card)] border-4 p-5 ${
                      report.band === 'GREEN'
                        ? 'border-[var(--color-green)] bg-[var(--color-green-wash)]'
                        : report.band === 'YELLOW'
                          ? 'border-[var(--color-yellow)] bg-[var(--color-yellow-wash)]'
                          : 'border-[var(--color-red)] bg-[var(--color-red-wash)]'
                    }`}
                  >
                    <span className="text-[var(--text-lead)] font-semibold">
                      {report.dateLabel}
                    </span>
                    <span className="text-[var(--text-lead)] font-bold">
                      {tr(
                        report.band === 'GREEN'
                          ? 'stoplight.green.title'
                          : report.band === 'YELLOW'
                            ? 'stoplight.yellow.title'
                            : 'stoplight.red.title',
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Screen>
        )}

        {screen === 'HELP' && (
          <Screen title={tr('elder.callForHelp')} onBack={() => setScreen('HOME')} backLabel={tr('common.back')}>
            <div className="flex flex-col gap-5">
              <a
                href={`tel:${supportPhone.replace(/\s/g, '')}`}
                className="flex min-h-[var(--size-touch-lg)] items-center justify-center gap-4 rounded-[var(--radius-card)] border-4 border-[var(--color-primary)] bg-[var(--color-primary)] p-6 text-[var(--text-h3)] font-bold text-[var(--color-primary-ink)]"
              >
                📞 {supportPhone}
              </a>
              <p className="text-[var(--text-lead)]">{tr('common.callUs')}</p>

              <div className="rounded-[var(--radius-card)] border-4 border-[var(--color-red)] bg-[var(--color-red-wash)] p-5">
                <p className="text-[var(--text-lead)] font-bold">
                  {tr('emergency.callNow')}
                </p>
                <a
                  href={`tel:${emergencyNumber}`}
                  className="mt-4 flex min-h-[var(--size-touch-lg)] items-center justify-center rounded-[var(--radius-card)] border-4 border-[var(--color-red)] bg-[var(--color-red)] text-[var(--text-h2)] font-bold text-white"
                >
                  {emergencyNumber}
                </a>
              </div>
            </div>
          </Screen>
        )}

        {screen === 'LANGUAGE' && (
          <Screen title={tr('elder.changeLanguage')} onBack={() => setScreen('HOME')} backLabel={tr('common.back')}>
            <div className="grid gap-4 sm:grid-cols-2">
              {LOCALES.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => {
                    setLocale(l.key);
                    setScreen('HOME');
                  }}
                  aria-pressed={locale === l.key}
                  lang={l.key}
                  className={`min-h-[var(--size-touch-lg)] rounded-[var(--radius-card)] border-4 p-4 text-[var(--text-lead)] font-semibold ${
                    locale === l.key
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                      : 'border-[var(--color-line-strong)] bg-[var(--color-surface)]'
                  }`}
                >
                  {l.native}
                </button>
              ))}
            </div>
          </Screen>
        )}
      </main>

      {/* Read-aloud lives on every screen, anchored where a thumb reaches. */}
      <div className="sticky bottom-0 border-t-2 border-[var(--color-line)] bg-[var(--color-canvas)] px-5 py-4">
        <button
          type="button"
          onClick={readAloud}
          className="mx-auto flex min-h-[var(--size-touch)] w-full max-w-2xl items-center justify-center gap-3 rounded-[var(--radius-control)] border-2 border-[var(--color-primary)] bg-[var(--color-surface)] px-6 text-[var(--text-lead)] font-semibold"
        >
          🔊 {tr('elder.readAloud')}
        </button>
      </div>
    </div>
  );
}

function Tile({
  emoji,
  label,
  onClick,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-40 flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] border-4 border-[var(--color-line-strong)] bg-[var(--color-surface)] p-6"
    >
      <span aria-hidden className="text-5xl">
        {emoji}
      </span>
      {/* The icon never stands alone. */}
      <span className="text-center text-[var(--text-lead)] font-bold">{label}</span>
    </button>
  );
}

function Screen({
  title,
  children,
  onBack,
  backLabel,
}: {
  title: string;
  children: React.ReactNode;
  onBack: () => void;
  backLabel: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-[var(--size-touch)] w-fit items-center gap-3 rounded-[var(--radius-control)] border-2 border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 text-[var(--text-lead)] font-semibold"
      >
        ← {backLabel}
      </button>
      <h1 className="text-[var(--text-h1)] font-bold">{title}</h1>
      {children}
    </div>
  );
}

function bcp47(locale: Locale): string {
  const map: Record<Locale, string> = {
    en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', mr: 'mr-IN', te: 'te-IN', ta: 'ta-IN',
    kn: 'kn-IN', gu: 'gu-IN', ml: 'ml-IN', pa: 'pa-IN', ur: 'ur-IN', as: 'as-IN',
  };
  return map[locale] ?? 'en-IN';
}
